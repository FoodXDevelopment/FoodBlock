package world.foodx.foodblock

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

// Who someone is, what they may do, and where things stand: each one a fold, worked out from blocks alone.
// `arrivals` is this node's own log of when each block arrived ({ hash: at }), where a fold needs it; null if none.
// Given arrivals, `unknownArrival` ("inside" or "outside": how a block with no arrival is read) is required; the core refuses without it.

/** One key an id has held. `by` is the block that brought it in; `signer` the key that signed that block; `suite` its suite. */
data class KeyEntry(val key: String, val by: String, val signer: String?, val frozen: Boolean, val suite: String = "std")

object Identity {
    /**
     * A new person, autonomous system, machine or circle: their genesis, signed (in the suite of `keys`). It needs only `kind`,
     * `at`, `audience` (all required: [PUBLIC] or recipients; nothing is filled in) and the key; `recoveryKey` (the offline key's public signing key, only its hash is written) and `reach`
     * come as a pair or not at all. `encryptionKey` is the public encryption key, or null for a device that only signs.
     */
    fun genesis(
        keys: Keypair, kind: String, at: String, audience: List<String>,
        recoveryKey: String? = null, encryptionKey: String? = null,
        reach: String? = null, recoverySuite: String? = null, custodian: String? = null,
        salts: JsonObject? = null, nonce: String? = null,
    ): JsonObject = Door.genesis(keys.toJson(), buildJsonObject {
        put("kind", kind)
        put("at", at)
        audienceJson(audience)?.let { put("audience", it) }
        salts?.let { put("salts", it) }
        nonce?.let { put("nonce", it) }
        recoveryKey?.let { put("recovery_key", it) }
        encryptionKey?.let { put("encryption_key", it) }
        reach?.let { put("reach", it) }
        recoverySuite?.let { put("recovery_suite", it) }
        custodian?.let { put("custodian", it) }
    }).obj()

    /** The recovery key's hash, as a genesis names it, in the identity's suite. */
    fun recoveryKeyHash(publicKey: String, suite: String = "std"): String =
        Door.recoveryKeyHash(JsonPrimitive(publicKey), JsonPrimitive(suite)).string()

    /** The identity fold: `{ signed_by_author, keys, frozen, operators }`. */
    fun identityState(id: String, blocks: List<JsonObject>, arrivals: Map<String, String>? = null, unknownArrival: String? = null): JsonObject =
        Door.identityState(JsonPrimitive(id), JsonArray(blocks), arrivals(arrivals), text(unknownArrival)).obj()

    /** The voided blocks a recovery rotation's reach protects, read at the reader's arrivals. */
    fun recoveryReach(rotation: JsonObject, blocks: List<JsonObject>, arrivals: Map<String, String>? = null, unknownArrival: String? = null): JsonElement =
        Door.recoveryReach(rotation, JsonArray(blocks), arrivals(arrivals), text(unknownArrival))

    /** The keys that speak for an id now. */
    fun keysOf(id: String, blocks: List<JsonObject>, arrivals: Map<String, String>? = null, unknownArrival: String? = null): List<String> =
        Door.keysOf(JsonPrimitive(id), JsonArray(blocks), arrivals(arrivals), text(unknownArrival)).strings()

    fun keyTimeline(id: String, blocks: List<JsonObject>, arrivals: Map<String, String>? = null, unknownArrival: String? = null): List<KeyEntry> =
        Door.keyTimeline(JsonPrimitive(id), JsonArray(blocks), arrivals(arrivals), text(unknownArrival)).jsonArray.map {
            val k = it.jsonObject
            KeyEntry(
                k["key"]!!.string(), k["by"]!!.string(), (k["signer"] as? JsonPrimitive)?.takeIf { p -> p.isString }?.content,
                k["frozen"]!!.bool(), (k["suite"] as? JsonPrimitive)?.content ?: "std",
            )
        }

    /** Whether a block is signed by a key that spoke for its author when it was signed. */
    fun signedByAuthor(block: JsonObject, blocks: List<JsonObject>, arrivals: Map<String, String>? = null, unknownArrival: String? = null): Boolean =
        Door.signedByAuthor(block, JsonArray(blocks), arrivals(arrivals), text(unknownArrival)).bool()
}

object Grant {
    /** Why an act that cannot be undone is not live: empty when it has a specific accepted ask or a grant that names it with a limit. */
    fun whyNotLiveUndo(block: JsonObject, blocks: List<JsonObject>): List<String> =
        Door.whyNotLiveUndo(block, JsonArray(blocks)).strings()

    /** The act a block is, named `type.kind`. */
    fun actName(block: JsonObject): String = Door.actName(block).string()

    /** The observe of kind limit for a grant, to hand to `write`: its audience is the autonomous system alone. */
    fun limitFence(grantHash: String, agent: String, limit: JsonObject?, every: String? = null, salt: String? = null, each: JsonObject? = null): JsonObject =
        Door.limitFence(JsonPrimitive(grantHash), JsonPrimitive(agent), limit ?: JsonNull, text(every), text(salt), each ?: JsonNull).obj()

    /** The commitment to a limit, for the grant's `scope.limit_commitment` (authority.md). */
    fun limitCommitment(limit: JsonObject?, every: String?, salt: String, suite: String? = null, each: JsonObject? = null): String =
        Door.limitCommitment(limit ?: JsonNull, text(every), JsonPrimitive(salt), text(suite), each ?: JsonNull).string()

    /** Whether the limit observe opens the grant's `scope.limit_commitment`. */
    fun limitOpens(grant: JsonObject, fence: JsonObject, suite: String? = null): Boolean =
        Door.limitOpens(grant, fence, text(suite)).bool()

    /** Whether one act of `value` (money or an amount) stays inside a limit; `spent` is what the principal's node has counted in the period:
     *  minor units of money, or an amount's value, compared exactly. */
    fun withinLimit(limit: JsonObject, value: JsonObject, spent: Long): Boolean =
        Door.withinLimit(limit, value, JsonPrimitive(spent)).bool()

    /** The same, with `spent` as a decimal string (an amount: kilos, hours). */
    fun withinLimit(limit: JsonObject, value: JsonObject, spent: String): Boolean =
        Door.withinLimit(limit, value, JsonPrimitive(spent)).bool()

    /** The people an autonomous system acts for, by the live grants among `blocks`. */
    fun operatorsOf(agent: String, blocks: List<JsonObject>, now: String? = null): List<String> =
        Door.operatorsOf(JsonPrimitive(agent), JsonArray(blocks), text(now)).strings()

    /** Why a block does not stand under the grant it names: empty when it does. */
    fun whyNotUnder(block: JsonObject, blocks: List<JsonObject>, now: String? = null): List<String> =
        Door.whyNotUnder(block, JsonArray(blocks), text(now)).strings()

    /** Why a grant is not live (stopped, expired, its parent gone): empty when it is. Check before an act that cannot be undone. */
    fun whyNotLive(grant: JsonObject, blocks: List<JsonObject>, now: String? = null): List<String> =
        Door.whyNotLive(grant, JsonArray(blocks), text(now)).strings()
}

/** Who owns an instance, the transfers that moved it, and a conflict (two transfers that do not see each other). */
data class Ownership(val owner: String?, val transfers: List<String>, val conflict: List<String>?)

/** The folds (edge and node profiles). */
/** Large content (modules/encoding.md): the Merkle root of chunks (hex), a chunk's proof, and the reader's check of a block. */
object Merkle {
    /** The root (64 hex) over the chunks (each hex). */
    fun root(chunks: List<String>): String = Door.merkleRoot(texts(chunks)).string()

    /** The sibling hashes (hex) that prove chunk `index`, from the leaf up. */
    fun proof(chunks: List<String>, index: Int): List<String> = Door.merkleProof(texts(chunks), JsonPrimitive(index)).strings()

    /** True when `siblings` show `chunk` (hex) is chunk `index` of the count the block signs (`state.chunks`), under its one merkle mark. */
    fun verify(block: JsonObject, chunk: String, index: Int, siblings: List<String>): Boolean =
        Door.merkleVerify(block, JsonPrimitive(chunk), JsonPrimitive(index), texts(siblings)).bool()
}

object Fold {
    /** A promise's stage from its first promise and the blocks of its deal: `{ stage, offer, accept, sides, ... }`. No clock. */
    fun promiseStage(
        first: JsonObject, blocks: List<JsonObject>,
    ): JsonObject = Door.promiseStage(first, JsonArray(blocks), buildJsonObject {}).obj()

    /** The view: the same answer, with stage `expired` once the reader's `now` passes `expires` and nothing binds. */
    fun promiseView(
        first: JsonObject, blocks: List<JsonObject>, now: String? = null,
    ): JsonObject = Door.promiseView(first, JsonArray(blocks), buildJsonObject {
        now?.let { put("now", it) }
    }).obj()

    /** The consent fold: a person's live word about a sender (or none): `{ word, block }`. `block` is the sender's block (it names the grant it acts under), or null. */
    fun consent(person: String, sender: String?, blocks: List<JsonObject>, block: JsonObject? = null): JsonObject =
        Door.consent(JsonPrimitive(person), text(sender), JsonArray(blocks), block ?: JsonNull).obj()

    /** Whether an act stands under a live grant at the reader's `now`. */
    fun liveGrant(act: JsonObject, grants: List<JsonObject>, now: String): Boolean =
        Door.liveGrant(act, JsonArray(grants), JsonPrimitive(now)).bool()

    fun withdrawalSeen(
        withdrawal: JsonObject, block: JsonObject, blocks: List<JsonObject>, arrivals: Map<String, String>? = null,
    ): Boolean = Door.withdrawalSeen(withdrawal, block, JsonArray(blocks), arrivals(arrivals)).bool()

    fun due(promise: JsonObject, arrivals: Map<String, String>? = null): JsonElement = Door.due(promise, arrivals(arrivals))


    /** A circle's founder, members and roles, and who was removed: null when the circle is not among the blocks. */
    fun circleState(circle: String, blocks: List<JsonObject>, within: JsonObject? = null): JsonObject? =
        Door.circleState(JsonPrimitive(circle), JsonArray(blocks), within ?: JsonNull) as? JsonObject

    fun mayActAs(block: JsonObject, circle: String, blocks: List<JsonObject>, role: String? = null): Boolean =
        Door.mayActAs(block, JsonPrimitive(circle), JsonArray(blocks), text(role)).bool()

    /** Who a recipient (a circle or `circle#role`) meant when the block was written. */
    fun membersThen(block: JsonObject, recipient: String, blocks: List<JsonObject>): List<String> =
        Door.membersThen(block, JsonPrimitive(recipient), JsonArray(blocks)).strings()

    fun whereNow(thing: JsonObject, blocks: List<JsonObject>): List<String> =
        Door.whereNow(thing, JsonArray(blocks)).strings()

    fun ownership(instance: JsonObject, blocks: List<JsonObject>): Ownership {
        val o = Door.ownership(instance, JsonArray(blocks)).jsonObject
        return Ownership(
            (o["owner"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            o["transfers"]!!.strings(),
            (o["conflict"] as? JsonArray)?.strings(),
        )
    }

    fun ownerOf(instance: JsonObject, blocks: List<JsonObject>): String? =
        (Door.ownerOf(instance, JsonArray(blocks)) as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** A successor grant's view (optional profile): `{ events, cancelled, since, fires, fired }`. */
    fun successorView(
        grant: JsonObject, blocks: List<JsonObject>, now: String? = null, arrivals: Map<String, String>? = null,
    ): JsonObject = Door.successorView(grant, JsonArray(blocks), text(now), arrivals(arrivals)).obj()

    fun countedIn(result: JsonObject, commitment: String, counter: String): Boolean =
        Door.countedIn(result, JsonPrimitive(commitment), JsonPrimitive(counter)).bool()

    /** A circle's current key, from its rekeys. */
    fun circleKey(circle: String, blocks: List<JsonObject>): JsonObject =
        Door.circleKey(JsonPrimitive(circle), JsonArray(blocks)).obj()
}

/**
 * What a node remembers when it judges a signed pull or push: this node, the signer's live keys, the highest counter
 * seen from the signer, and the challenges it issued and has not seen used. No clock.
 */
data class Freshness(
    val node: String,
    val keys: List<String>,
    val highest: Long? = null,
    val issued: List<String> = emptyList(),
) {
    internal fun toJson(): JsonElement = buildJsonObject {
        put("node", node)
        put("keys", texts(keys))
        put("highest", highest?.let { JsonPrimitive(it) } ?: JsonNull)
        put("issued", texts(issued))
    }
}

/** Between nodes (edge and node profiles): pull, push, signed answers and discovery. */
object Sync {
    /** What a node takes of a push (`takesPairs` is the node's own choice: whether both blocks of a pair arriving together are taken): `{ taken, waiting, refused, equivocations }`. `taken` are the ids the core computed, in the suite of the key that signed each (core.md, section 2). Validity reads no arrival (core.md, section 8). */
    fun accept(
        incoming: List<JsonObject>, held: List<JsonObject>, takesPairs: Boolean,
        schemas: List<JsonObject>? = null,
    ): JsonObject = Door.accept(JsonArray(incoming), JsonArray(held), buildJsonObject { put("takes_pairs", takesPairs) },
        schemas?.let(::JsonArray) ?: JsonNull,
    ).obj()

    /** What a node takes of the sealed blocks of a push: the core checks each public header (a key of its author that speaks for it opens its signature; the same key's next seq; no rival) once the block it names in prev is held. `taken` are hashes. */
    fun acceptSealed(incoming: List<JsonObject>, held: List<JsonObject>, takesPairs: Boolean): JsonObject =
        Door.acceptSealed(JsonArray(incoming), JsonArray(held), buildJsonObject { put("takes_pairs", takesPairs) }).obj()

    /**
     * A node's answer to a pull, from its arrival log. The node states its own choices: `cap` (1 or more; there is no
     * default) and `servesPairs` (true sends a fork's other half with its proof, false only what matches). Signed by the node.
     */
    fun answerPull(
        log: List<JsonObject>, request: JsonObject, node: String, privateKey: String, cap: Long, servesPairs: Boolean,
        asker: String? = null, held: List<JsonObject>? = null, suite: String? = null,
    ): JsonObject = Door.answerPull(JsonArray(log), request, JsonPrimitive(node), JsonPrimitive(privateKey),
        buildJsonObject { put("cap", cap); put("serves_pairs", servesPairs) }, text(asker), held?.let(::JsonArray) ?: JsonNull, text(suite),
    ).obj()

    /** A signed pull: the request plus signer, node and exactly one proof against replay (`counter` or `challenge`); no time. */
    fun signPull(
        request: JsonObject, signer: String, node: String, privateKey: String,
        suite: String? = null, counter: Long? = null, challenge: String? = null,
    ): JsonObject = Door.signPull(request, signOptions(signer, node, privateKey, suite, counter, challenge)).obj()

    fun signPush(
        push: JsonObject, signer: String, node: String, privateKey: String,
        suite: String? = null, counter: Long? = null, challenge: String? = null,
    ): JsonObject = Door.signPush(push, signOptions(signer, node, privateKey, suite, counter, challenge)).obj()

    private fun signOptions(signer: String, node: String, privateKey: String, suite: String?, counter: Long?, challenge: String?) =
        buildJsonObject {
            put("who", signer); put("node", node); put("private_key", privateKey)
            suite?.let { put("suite", it) }
            counter?.let { put("counter", it) }
            challenge?.let { put("challenge", it) }
        }

    /** A new challenge value a node hands out at its `challenge` endpoint. */
    fun newChallenge(): String = Door.newChallenge().string()

    /** The refusals of a signed pull (each a code from protocol.json). */
    fun pullRefusals(message: JsonObject, freshness: Freshness): List<Refusal> =
        Door.pullRefusals(message, freshness.toJson()).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    fun pushRefusals(message: JsonObject, freshness: Freshness): List<Refusal> =
        Door.pushRefusals(message, freshness.toJson()).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** What a node's admission and consent rules refuse of a block for a person: not_admitted, not_human. `admission` is the rule's state or an explicit null (no rule); `strangersToday` is the node's own count; neither is filled in. */
    fun admissionRefusals(
        block: JsonObject, receiver: String, blocks: List<JsonObject>, admission: JsonObject?, strangersToday: Long,
    ): List<Refusal> = Door.admissionRefusals(block, JsonPrimitive(receiver), JsonArray(blocks), admission ?: JsonNull, JsonPrimitive(strangersToday))
        .jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** Residency (profiles/residency.md): a block that stays in regions its node does not hold in. */
    fun residencyRefusals(block: JsonObject, holdsIn: List<String>): List<Refusal> =
        Door.residencyRefusals(block, texts(holdsIn)).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** A node's signed answer to a push, from its parts. */
    fun pushAnswer(parts: JsonObject, node: String, privateKey: String, suite: String = "std"): JsonObject =
        Door.pushAnswer(parts, JsonPrimitive(node), JsonPrimitive(privateKey), JsonPrimitive(suite)).obj()

    fun pushRequest(messages: List<JsonObject>, forWhom: JsonObject? = null): JsonObject =
        Door.pushRequest(JsonArray(messages), forWhom ?: JsonNull).obj()

    fun answerSignedBy(answer: JsonObject, nodeKeys: List<String>): Boolean =
        Door.answerSignedBy(answer, texts(nodeKeys)).bool()

    /** What is wrong with a `.well-known/foodblock` document: empty when it is right. */
    fun wellKnownErrors(doc: JsonObject): List<String> = Door.wellKnownErrors(doc).strings()

    /** The local announcement a node makes nearby, from its discovery document. */
    fun announcement(doc: JsonObject): JsonObject = Door.announcement(doc).obj()
}

/** Strangers (modules/consent.md) and the small profiles. */
object Strangers {
    /** A model's reading is the person's claim only once the person's own block confirms it. */
    fun readingIsPersonsClaim(reading: JsonObject, person: String, blocks: List<JsonObject>): Boolean =
        Door.readingIsPersonsClaim(reading, JsonPrimitive(person), JsonArray(blocks)).bool()

    /** Tasks profile: whether a `reading_condition` holds on the readings held, at the reader's clock. */
    fun readingConditionHolds(condition: JsonObject, blocks: List<JsonObject>, now: String): Boolean =
        Door.readingConditionHolds(condition, JsonArray(blocks), JsonPrimitive(now)).bool()

    /** Whether a condition holds on the blocks held, at the reader's clock (promises.md, Conditions): settled, a deed, a reading or a signal.
     *  It reads three ways: true, false, or null for a condition of a shape the protocol does not read. */
    fun conditionHolds(condition: JsonObject, blocks: List<JsonObject>, now: String): Boolean? =
        Door.conditionHolds(condition, JsonArray(blocks), JsonPrimitive(now)).let { if (it is JsonNull) null else it.bool() }

    /** Earnest profile: the shape of an admission's earnest, and whether an ask's earnest is paid. */
    fun earnestShapeOk(earnest: JsonElement): Boolean = Door.earnestShapeOk(earnest).bool()
    fun earnestPaid(ask: JsonObject, earnest: JsonObject, blocks: List<JsonObject>): Boolean =
        Door.earnestPaid(ask, earnest, JsonArray(blocks)).bool()
}

/** The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). Not part of the protocol: no node reads an older shape. */
object Legacy {
    /**
     * Convert old blocks into fresh blocks, each deriving from the old hash, signed by the key given for each old
     * identity. `keys` maps each old identity to `{ public_key_sign, private_key, suite? }`; `at` is the conversion time. `schemas` are published
     * schemas a block may name instead of a new one; `custodianKey` signs for the old ids in `custodianFor` (it needs a `channel`).
     * Returns `{ blocks, map, skipped, deliveries }`.
     */
    fun convert(
        oldBlocks: List<JsonObject>, keys: JsonObject, at: String? = null, map: JsonObject = JsonObject(emptyMap()),
        existing: List<JsonObject> = emptyList(), channel: String? = null, requestHash: String? = null,
        schemas: List<JsonObject> = emptyList(), custodianKey: JsonObject? = null, custodianFor: List<String>? = null,
    ): JsonObject = Door.convert(JsonArray(oldBlocks), buildJsonObject {
        put("keys", keys); at?.let { put("at", it) }; put("map", map); put("existing", JsonArray(existing)); put("schemas", JsonArray(schemas))
        custodianKey?.let { put("custodian_key", it) }
        custodianFor?.let { put("custodian_for", texts(it)) }
        channel?.let { put("channel", it) }
        requestHash?.let { put("request_hash", it) }
    }).obj()

    /** The id an old block had under the old canonical form. */
    fun oldHash(block: JsonObject): String = Door.oldHash(block).string()
}
