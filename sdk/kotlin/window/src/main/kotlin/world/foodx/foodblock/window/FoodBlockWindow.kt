package world.foodx.foodblock.window

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import world.foodx.foodblock.FoodBlock
import world.foodx.foodblock.FoodBlockException
import world.foodx.foodblock.RefusedException
import world.foodx.foodblock.Refusal

/**
 * The phone as a window onto the person's node, which FoodX hosts. The person's passkey IS their FoodBlock key: it never leaves the device, and the host
 * never holds it. A write is: the host proposes the next block, the passkey signs its id, the host's core judges it and keeps it. Offline, the block is
 * composed here against the last chain the phone saw, signed by the passkey, checked by the bundled core, and queued (SQLite); [sync] hands the queue
 * over, in order, when the host is back. Nothing here decides a protocol rule: every check is the Rust core's.
 */
class FoodBlockWindow(
    private val transport: Transport,
    private val authenticator: PasskeyAuthenticator,
    private val store: WindowStore,
    val rpId: String = "foodx.network",
    private val clock: () -> java.time.Instant = { java.time.Instant.now() },
) {
    sealed class Outcome { abstract val block: JsonObject
        data class Submitted(override val block: JsonObject) : Outcome()
        data class Queued(override val block: JsonObject) : Outcome() }
    data class SyncReport(val taken: List<String>, val refused: List<Pair<String, String>>, val stillWaiting: Int)

    private val lock = Mutex()
    private var token: String? = null
    var person: String? = store.get("person"); private set
    private var credentialId: String? = store.get("credentialId")

    private fun JsonElement?.text(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
    private fun walk(value: JsonElement?, path: String): JsonElement? = path.split(".").fold(value) { v, part -> (v as? JsonObject)?.get(part) }
    private fun me(): String = person ?: throw WindowException("not signed in")

    private suspend fun call(method: String, path: String, body: JsonObject? = null, auth: Boolean = true): JsonObject {
        var attempt = 0
        while (true) {
            val r = transport.send(method, path, body, if (auth) token else null)
            if (r.status == 401 && auth && attempt == 0 && person != null) { attempt++; signInLocked(); continue }   // the host forgot the credential (a restart): one tap signs in again
            if (r.status >= 300) throw RefusedByHost(r.status, r.body["error"].text() ?: r.body["refused"]?.toString() ?: "")
            return r.body
        }
    }

    // ---- who ----
    /** Make a passkey and, with it, a new person: the host proposes the genesis, the passkey signs its id, the host's core judges it and makes the node. */
    suspend fun register(): String = lock.withLock {
        val begin = call("POST", "_app/passkey/register/begin", auth = false)
        val challenge = begin["challenge"].text() ?: throw WindowException("the host's registration was not understood")
        val user = begin["user"]?.jsonObject ?: throw WindowException("the host's registration was not understood")
        val made = authenticator.register(rpId, challenge, user["id"].text()!!, user["name"].text() ?: "FoodX")
        val finished = call("POST", "_app/passkey/register/finish", buildJsonObject {
            put("challenge", challenge); put("credentialId", made.credentialId); put("attestationObject", made.attestationObject); put("clientDataJSON", made.clientDataJson)
        }, auth = false)
        val draft = finished["draft"]?.jsonObject ?: throw WindowException("no genesis proposed")
        // Never sign what the core does not read as a plain person genesis whose id is its content.
        val key = walk(draft, "state.public_key_sign").text()
        if (FoodBlock.hash(draft) != draft["hash"].text() || draft["type"].text() != "actor" || walk(draft, "state.kind").text() != "person" ||
            draft["refs"]?.jsonObject?.isNotEmpty() == true || walk(draft, "state.suite").text() != "p256" || key == null) throw WindowException("the proposed genesis is not a person's")
        val signed = sign(draft, made.credentialId)
        if (!FoodBlock.verify(draft, signed["signature"].text()!!, key) || !FoodBlock.call("genesis_opens", signed).jsonPrimitive.content.toBoolean()) throw WindowException("the genesis key is not this passkey's")
        val done = call("POST", "_app/passkey/register/complete", buildJsonObject { put("genesis", signed) }, auth = false)
        val id = done["person"].text(); val credential = done["credential"].text()
        if (id == null || credential == null || id != draft["hash"].text()) throw WindowException("the host did not make the node")
        person = id; token = credential; credentialId = made.credentialId
        store.put("person", id); store.put("credentialId", made.credentialId)
        runCatching { blocksLocked() }   // seed what the phone can read (and compose against) offline
        id
    }
    /** A passkey tap signs the host's challenge; the host answers with a window credential for this session. */
    suspend fun signIn(): String = lock.withLock { signInLocked() }
    private suspend fun signInLocked(): String {
        val begin = call("POST", "_app/passkey/signin/begin", auth = false)
        val challenge = begin["challenge"].text() ?: throw WindowException("no challenge")
        val a = authenticator.assert(rpId, challenge, credentialId)
        val done = call("POST", "_app/passkey/signin/finish", buildJsonObject {
            put("challenge", challenge); put("credentialId", a.credentialId); put("authenticatorData", a.authenticatorData); put("clientDataJSON", a.clientDataJson); put("signature", a.signature)
        }, auth = false)
        val id = done["person"].text(); val credential = done["credential"].text()
        if (id == null || credential == null) throw WindowException("sign-in was not accepted")
        person = id; token = credential; credentialId = a.credentialId
        store.put("person", id); store.put("credentialId", a.credentialId)
        runCatching { blocksLocked() }
        return id
    }
    /** A link that ties a Google account to this same person (open it in the browser). */
    suspend fun googleLink(): String = lock.withLock { call("POST", "_app/passkey/link/google")["url"].text() ?: throw WindowException("no link") }

    // ---- read ----
    /** The person's blocks as the host shows them; offline, the last ones seen. */
    suspend fun blocks(): List<JsonObject> = lock.withLock { blocksLocked() }
    private suspend fun blocksLocked(): List<JsonObject> {
        val id = me()
        return try {
            val blocks = call("GET", "$id/window/blocks")["blocks"]?.jsonArray ?: JsonArray(emptyList())
            store.put("blocks", blocks.toString())
            blocks.map { it.jsonObject }
        } catch (e: OfflineException) { cached() }
    }
    /** A fold computed on the host (`{"$blocks": true}` stands for the person's blocks). */
    suspend fun fold(name: String, args: List<JsonElement> = emptyList()): JsonElement? = lock.withLock {
        call("POST", "${me()}/window/fold", buildJsonObject { put("name", name); put("args", JsonArray(args)) })["result"]
    }
    private fun cached(): List<JsonObject> = store.get("blocks")?.let { t -> (kotlinx.serialization.json.Json.parseToJsonElement(t) as JsonArray).map { it.jsonObject } } ?: emptyList()

    // ---- write ----
    private suspend fun sign(draft: JsonObject, credentialId: String?): JsonObject {
        val challenge = FoodBlock.passkeyChallenge(draft)    // from the block itself, never from what the host said
        val a = authenticator.assert(rpId, challenge, credentialId)
        val signature = FoodBlock.passkeySignature(B64.hex(a.authenticatorData), B64.hex(a.clientDataJson), B64.hex(a.signature))
        return JsonObject(draft + ("signature" to JsonPrimitive(signature)))
    }
    /**
     * Write one block as the person. Online: the host proposes, the passkey signs, the host keeps it. Offline: composed here, signed, checked by the core,
     * queued. The block never differs from what was asked: the draft the host proposes must carry exactly the asked type, fields and refs.
     */
    suspend fun write(type: String, state: JsonObject, refs: JsonObject = JsonObject(emptyMap())): Outcome = lock.withLock {
        val id = me()
        if (store.pending().isEmpty()) {   // a queue first: order matters in a chain
            try {
                val draft = call("POST", "$id/window/propose", buildJsonObject { put("type", type); put("state", state); put("refs", refs) })["draft"]?.jsonObject
                if (draft == null || FoodBlock.hash(draft) != draft["hash"].text() || draft["type"].text() != type || walk(draft, "refs.author").text() != id) throw WindowException("the host proposed a different block")
                for ((k, v) in state) if (walk(draft, "state.$k") != v) throw WindowException("the host changed $k")
                for ((k, v) in refs) if (walk(draft, "refs.$k") != v) throw WindowException("the host changed ref $k")
                val signed = sign(draft, credentialId)
                call("POST", "$id/window/submit", buildJsonObject { put("block", signed) })
                return@withLock Outcome.Submitted(signed)
            } catch (_: OfflineException) { /* fall through to the queue */ }
        }
        Outcome.Queued(compose(type, state, refs, id))
    }
    private suspend fun compose(type: String, state: JsonObject, refs: JsonObject, id: String): JsonObject {
        val held = cached() + store.items().map { it.block }
        val genesis = held.firstOrNull { it["hash"].text() == id }
        val key = walk(genesis, "state.public_key_sign").text() ?: throw WindowException("this phone has not seen the person's genesis yet; connect once first")
        val link = FoodBlock.call("next_link_for", JsonPrimitive(id), JsonPrimitive(key), JsonArray(held)).jsonObject
        val options = buildJsonObject {
            put("author", id); putJsonArray("after") {}; put("at", java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(java.time.ZoneOffset.UTC).format(clock())); put("suite", "p256")
            putJsonObject("link") { put("seq", link["seq"]!!); put("prev", link["prev"]!!) }
        }
        val draft = FoodBlock.call("compose", JsonPrimitive(type), state, refs, options).jsonObject
        val faults = FoodBlock.refusals(draft["type"].text()!!, draft["state"]!!, draft["refs"]!!)
        if (faults.isNotEmpty()) throw RefusedException("the protocol would refuse this block", faults.map { it.code }, faults)
        val signed = sign(draft, credentialId)
        val problems: List<Refusal> = FoodBlock.valid(signed, held)
        if (problems.isNotEmpty()) throw RefusedException("the protocol refuses this block", problems.map { it.code }, problems)
        store.enqueue(signed)
        return signed
    }

    /** Hand the queue to the host, oldest first. Stops (nothing lost) when the host cannot be reached; a block the host refuses stays, marked with its reason. */
    suspend fun sync(): SyncReport = lock.withLock {
        val id = me()
        val taken = mutableListOf<String>(); val refused = mutableListOf<Pair<String, String>>()
        for (item in store.pending()) {
            try {
                call("POST", "$id/window/submit", buildJsonObject { put("block", item.block) })
                store.taken(item.hash); taken += item.hash
            } catch (_: OfflineException) { break
            } catch (e: RefusedByHost) {
                if (e.status == 400 || e.status == 403) { store.fail(item.hash, e.reason); refused += item.hash to e.reason } else throw e
            }
        }
        val waiting = store.pending().size
        runCatching { blocksLocked() }   // refresh what the phone can read offline
        SyncReport(taken, refused, waiting)
    }
    fun queued(): List<QueueItem> = store.items()
}
