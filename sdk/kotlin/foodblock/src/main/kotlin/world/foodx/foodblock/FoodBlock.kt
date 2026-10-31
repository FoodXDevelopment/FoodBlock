package world.foodx.foodblock

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put

/**
 * A signing key, as hex. `suite` names its suite (core.md, Suites: std, p256, sm) and is null for std (Ed25519:
 * `publicKeySign` is SPKI DER, `privateKey` PKCS#8 DER).
 */
data class Keypair(val publicKeySign: String, val privateKey: String, val suite: String? = null) {
    // a key is never printed or logged by accident: the private half is hidden
    override fun toString(): String = "Keypair(publicKeySign=$publicKeySign, privateKey=<hidden>, suite=$suite)"

    fun toJson(): JsonObject = buildJsonObject {
        put("public_key_sign", publicKeySign)
        put("private_key", privateKey)
        suite?.let { put("suite", it) }
    }

    internal companion object {
        fun of(j: JsonElement) = Keypair(
            j.jsonObject["public_key_sign"]!!.string(), j.jsonObject["private_key"]!!.string(),
            (j.jsonObject["suite"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
        )
    }
}

/** Where a key's next block goes in its chain: `state.seq` and `refs.prev`. */
data class Link(val seq: Long, val prev: String) {
    fun toJson(): JsonObject = buildJsonObject {
        put("seq", seq)
        put("prev", prev)
    }
}

/**
 * One key's chain, checked: ok when it has no gaps, no equivocation and no broken prev. `skips` are seq numbers a block
 * jumped over on purpose; `equivocations` are pairs of hashes that name one prev.
 */
data class Chain(
    val ok: Boolean,
    val length: Long,
    val head: String?,
    val gaps: List<Long>,
    val skips: List<Long>,
    val equivocations: List<List<String>>,
    val broken: List<String>,
)

/** The audience of a block anyone may read. Write it as the whole audience: `listOf(PUBLIC)`. */
const val PUBLIC = "public"

/** The audience a signer stated: "public", or the recipients. Nothing stated: null, and the core refuses. */
internal fun audienceJson(audience: List<String>): JsonElement? = when {
    audience.size == 1 && audience[0] == PUBLIC -> JsonPrimitive(PUBLIC)
    audience.isEmpty() -> null
    else -> texts(audience)
}

/**
 * What `write` needs beside the words. `held` is the author's genesis, key grants and blocks (so the chain stays one
 * line) and anything the block names. `audience` is required: [PUBLIC], or the recipients (a private block is written as
 * commitments, not names); `at` is required, a time the caller states. Left out, the core refuses; nothing is filled in.
 * `salts` and `nonce` only reproduce a vector.
 */
data class WriteOptions(
    val author: String,
    val key: Keypair,
    val held: List<JsonObject> = emptyList(),
    val at: String? = null,
    val audience: List<String> = emptyList(),
    val after: List<String> = emptyList(),
    val link: Link? = null,
    val schemas: List<JsonObject>? = null,
    val salts: JsonObject? = null,
    val nonce: String? = null,
    val suite: String? = null,
    val skip: Boolean = false,
) {
    internal fun toJson(): JsonObject = buildJsonObject {
        put("author", author)
        put("key", key.toJson())
        put("held", JsonArray(held))
        at?.let { put("at", it) }
        audienceJson(audience)?.let { put("audience", it) }
        put("after", texts(after))
        link?.let { put("link", it.toJson()) }
        schemas?.let { put("schemas", JsonArray(it)) }
        salts?.let { put("salts", it) }
        nonce?.let { put("nonce", it) }
        (suite ?: key.suite)?.let { put("suite", it) }
        if (skip) put("skip", true)
    }
}

private val EMPTY = JsonObject(emptyMap())
private fun JsonObject.part(name: String): JsonElement = this[name] ?: EMPTY
private fun JsonObject.typeName(): String = (this["type"] as? JsonPrimitive)?.content ?: ""

/**
 * FoodBlock 1.7. A block is `{ type, state, refs }` signed by its author's key; its id is the SHA-256 of its
 * canonical form. Blocks are JSON objects (`{ hash, type, state, refs, signature }`), the same shape on every SDK
 * and on the wire. Names follow the JavaScript reference: `sign` signs, `seal` encrypts, `open` opens. There is no
 * alias table and no reading of an older shape (year zero); old data enters once, through [Legacy].
 */
object FoodBlock {
    /** The protocol version this library writes (protocol.json `version`). */
    val VERSION: String by lazy { Door.version().string() }

    /** The peers of protocol.json this build supports, smallest first: micro, edge, node. */
    val PEERS: List<String> by lazy { Door.peers().strings() }

    /** Run one op of the core's JSON door directly (what every function here is). Throws [FoodBlockException] on an error. */
    fun call(op: String, vararg args: JsonElement): JsonElement = Native.invoke(op, *args)

    // ---- A block: its canonical form and its id ----

    fun canonical(type: String, state: JsonElement, refs: JsonElement): String =
        Door.canonical(JsonPrimitive(type), state, refs).string()

    fun canonical(block: JsonObject): String = canonical(block.typeName(), block.part("state"), block.part("refs"))

    /** Canonical JSON of any value (sorted keys, NFC, numbers as JavaScript writes them). */
    fun canonicalJson(value: JsonElement): String = Door.canonicalJson(value).string()

    /** The id of a block: the hash of its canonical form in the hash of the suite of the key that signed it. */
    fun hash(type: String, state: JsonElement, refs: JsonElement, suite: String = "std"): String =
        Door.hash(JsonPrimitive(type), state, refs, JsonPrimitive(suite)).string()

    /** The id of a block, in the suite of the key that signed it (core.md, section 2), that key found among `held`; with none, in the
     *  suite the block shows (a genesis's own, else as its prev is hashed). No label names it. */
    fun hash(block: JsonObject, held: List<JsonObject>? = null): String =
        if (held == null) Door.idOf(block).string() else Door.idOf(block, JsonArray(held)).string()

    /** SHA-256 of UTF-8 text, hex. */
    fun hashHex(text: String): String = Door.hashHex(JsonPrimitive(text)).string()

    /** `{ hash, type, state, refs }`, unsigned (the suite comes from the key that signs it). Strict: a null or a float is refused. */
    fun create(type: String, state: JsonElement, refs: JsonElement, suite: String = "std"): JsonObject =
        Door.create(JsonPrimitive(type), state, refs, JsonPrimitive(suite)).obj()

    // ---- Signing (by suite: std Ed25519, p256, sm) ----

    fun generateKeypair(suite: String = "std"): Keypair = Keypair.of(Door.keypair(JsonNull, JsonPrimitive(suite)))

    /** The key a 32-byte seed (64 hex) gives in a suite: the same key on every SDK. */
    fun keypairFromSeed(seedHex: String, suite: String = "std"): Keypair =
        Keypair.of(Door.keypair(JsonPrimitive(seedHex), JsonPrimitive(suite)))

    /** The author's signature over a block's canonical form, hex; `suite` is the suite of the signing key. */
    fun sign(block: JsonObject, privateKey: String, suite: String = "std"): String =
        Door.sign(block, JsonPrimitive(privateKey), JsonPrimitive(suite)).string()

    /** The suite a signing key (SPKI hex) belongs to, or null. */
    fun suiteOfKey(publicKey: String): String? =
        (Door.suiteOfKey(JsonPrimitive(publicKey)) as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** The challenge to ask a passkey to sign: base64url of the SHA-256 of the signed bytes (for a block, its id). */
    fun passkeyChallenge(blockOrPart: JsonObject): String =
        Door.passkeyChallenge(blockOrPart).string()

    /** A passkey's WebAuthn answer (each part as hex; the signature may be DER) as a FoodBlock signature, hex. */
    fun passkeySignature(authenticatorDataHex: String, clientDataJsonHex: String, signatureHex: String): String =
        Door.passkeySignature(JsonPrimitive(authenticatorDataHex), JsonPrimitive(clientDataJsonHex), JsonPrimitive(signatureHex)).string()

    fun verify(block: JsonObject, signature: String, publicKey: String): Boolean =
        Door.verify(block, JsonPrimitive(signature), JsonPrimitive(publicKey)).bool()

    /** A message part signed: the part with its `signature`. */
    fun signMessage(part: JsonObject, privateKey: String, suite: String = "std"): JsonObject =
        Door.signMessage(part, JsonPrimitive(privateKey), JsonPrimitive(suite)).obj()

    fun verifyMessage(part: JsonObject, publicKey: String): Boolean =
        Door.verifyMessage(part, JsonPrimitive(publicKey)).bool()

    // ---- The commitment ----

    fun newSalt(): String = Door.newSalt().string()
    fun saltedHash(salt: String, value: String, suite: String = "std"): String =
        Door.saltedHash(JsonPrimitive(salt), JsonPrimitive(value), JsonPrimitive(suite)).string()

    /** An audience for these recipients: `{ audience: sorted commitments, salts: { recipient: salt } }`. */
    fun commit(recipients: List<String>, salts: JsonObject = JsonObject(emptyMap()), suite: String = "std"): JsonObject =
        Door.commit(texts(recipients), salts, JsonPrimitive(suite)).obj()

    /** Whether a recipient holding this salt finds itself in a block's audience. */
    fun findsSelf(block: JsonObject, recipient: String, salt: String? = null): Boolean =
        Door.findsSelf(block, JsonPrimitive(recipient), JsonPrimitive(salt ?: "")).bool()

    // ---- The write check and its words ----

    /**
     * What is wrong with a block, as every node checks it before writing: every reason, empty when it is
     * well-formed. `held` are blocks it may name; `schemas` the schema blocks it is checked against.
     */
    fun check(
        type: String, state: JsonElement, refs: JsonElement,
        held: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null,
    ): List<String> = Door.check(JsonPrimitive(type), state, refs, JsonArray(held), schemas?.let(::JsonArray) ?: JsonNull,
    ).strings()

    fun check(block: JsonObject, held: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null) =
        check(block.typeName(), block.part("state"), block.part("refs"), held, schemas)

    /**
     * The same check, as refusals: each a code from protocol.json `refusals.codes` (the code carries the meaning)
     * and free text for people. Empty when the block is well-formed.
     */
    fun refusals(
        type: String, state: JsonElement, refs: JsonElement,
        held: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null,
    ): List<Refusal> = Door.refusals(JsonPrimitive(type), state, refs, JsonArray(held), schemas?.let(::JsonArray) ?: JsonNull,
    ).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    fun refusals(block: JsonObject, held: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null) =
        refusals(block.typeName(), block.part("state"), block.part("refs"), held, schemas)

    /** A quantity: a decimal string and a UCUM unit, never a float. `amount("3.9", "Cel")`. */
    fun amount(value: String, unit: String): JsonObject =
        Door.amount(JsonPrimitive(value), JsonPrimitive(unit)).obj()

    /** Money in minor units of an ISO 4217 currency. `money(450, "GBP")`. */
    fun money(minor: Long, currency: String): JsonObject =
        Door.money(JsonPrimitive(minor), JsonPrimitive(currency)).obj()

    /** Money in an issuer's own unit: `currency` is `{ issuer, unit, decimals }`. */
    fun money(minor: Long, currency: JsonObject): JsonObject =
        Door.money(JsonPrimitive(minor), currency).obj()

    fun terms(given: JsonObject): JsonObject = Door.terms(given).obj()

    /**
     * valid(block, context): every refusal of a signed block against the blocks held (empty when valid). `arrivals`
     * is the reader's log of when each block arrived, where the rules need it.
     */
    fun valid(
        block: JsonObject, held: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null,
        arrivals: Map<String, String>? = null,
    ): List<Refusal> = Native.invoke("valid", block, JsonArray(held), schemas?.let(::JsonArray) ?: JsonNull, arrivals(arrivals))
        .jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** Strict writing from JSON text: a repeated key, then every refusal of the block it holds. */
    fun strictText(text: String): List<Refusal> = Door.strictText(JsonPrimitive(text))
        .jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** The short receipt code of a block id: `XXXX-XXXX` (Crockford Base32 of its first 5 bytes). */
    fun receiptCode(id: String): String = Door.receiptCode(JsonPrimitive(id)).string()
    /** The ten-character form (first 50 bits, `XXXXX-XXXXX`), for a custodian whose index holds two blocks with one short code. */
    fun receiptCodeLong(id: String): String = Door.receiptCode(JsonPrimitive(id), JsonPrimitive(true)).string()
    /** Whether a typed code names this block: case, spaces and hyphens ignored, O read as 0, I and L as 1; 8 characters match the short code, 10 the long one. */
    fun codeMatches(text: String, id: String): Boolean = Door.codeMatches(JsonPrimitive(text), JsonPrimitive(id)).bool()

    // ---- Chains and causal order ----

    /** Where a key's next block goes. `last` is its latest block; with none, `broughtIn` is the genesis or key grant. */
    fun nextLink(last: JsonObject?, broughtIn: String? = null): Link {
        val l = Door.nextLink(last ?: JsonNull, text(broughtIn)).jsonObject
        return Link(l["seq"]!!.jsonPrimitive.long, l["prev"]!!.string())
    }

    fun checkChain(blocks: List<JsonObject>, broughtIn: String): Chain {
        val c = Door.checkChain(JsonArray(blocks), JsonPrimitive(broughtIn)).jsonObject
        return Chain(
            ok = c["ok"]!!.bool(),
            length = c["length"]!!.jsonPrimitive.long,
            head = (c["head"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            gaps = c["gaps"]!!.jsonArray.map { it.jsonPrimitive.long },
            skips = c["skips"]!!.jsonArray.map { it.jsonPrimitive.long },
            equivocations = c["equivocations"]!!.jsonArray.map { it.strings() },
            broken = c["broken"]!!.strings(),
        )
    }

    /** Blocks in causal order: causes before what they cause. */
    fun causalOrder(blocks: List<JsonObject>): List<JsonObject> =
        Door.causalOrder(JsonArray(blocks)).jsonArray.map { it.obj() }

    /** The pairs of blocks one key signed naming one prev. */
    fun forkPairs(blocks: List<JsonObject>): List<List<String>> =
        Door.forkPairs(JsonArray(blocks)).jsonArray.map { it.strings() }

    fun sees(later: JsonObject, earlier: JsonObject, blocks: List<JsonObject>): Boolean =
        Door.sees(later, earlier, JsonArray(blocks)).bool()

    // ---- The one way to write, and the wire ----

    /**
     * Compose, check, sign, chain. Returns the signed block (with `salts` beside it for a private one). Throws
     * [RefusedException] with every reason when the check refuses; it never repairs.
     */
    fun write(type: String, state: JsonElement, refs: JsonElement, options: WriteOptions): JsonObject =
        Door.write(JsonPrimitive(type), state, refs, options.toJson()).obj()

    /** `{ block, signature }`: what goes on the wire. */
    fun wrap(signed: JsonObject): JsonObject = Door.wrap(signed).obj()
    /** A block off the wire: its hash recomputed from its content, in the suite of the key that signed it (found among `held`, the
     *  author's blocks; core.md, section 2); with none, in the suite the block shows. */
    fun unwrap(message: JsonObject, held: List<JsonObject>? = null): JsonObject =
        (if (held == null) Door.unwrap(message) else Door.unwrap(message, JsonArray(held))).obj()
    fun header(block: JsonObject): JsonObject = Door.header(block).obj()
    fun headerSignedBy(message: JsonObject, publicKey: String): Boolean =
        Door.headerSignedBy(message, JsonPrimitive(publicKey)).bool()

    // ---- Envelopes (node peer): by suite (std: X25519, HKDF-SHA256, AES-256-GCM; p256; sm) ----

    /** Encrypt a value to recipients' encryption keys (hex) in a suite: the envelope. `fixed` only reproduces a vector. */
    fun seal(value: JsonElement, recipientKeys: List<String>, suite: String = "std", fixed: JsonObject? = null): JsonObject =
        Door.seal(value, texts(recipientKeys), JsonPrimitive(suite), fixed ?: JsonNull).obj()

    /** Open an envelope with a recipient's private encryption key (hex): the value inside. */
    fun open(envelope: JsonObject, x25519Private: String): JsonElement =
        Door.open(envelope, JsonPrimitive(x25519Private))

    /** A signed block sealed to recipients, with a header signed by the block's key, and what it `reveals`. */
    fun sealCopy(
        signed: JsonObject, recipientKeys: List<String>, reveals: JsonArray, privateKey: String,
        suite: String = "std", fixed: JsonObject? = null,
    ): JsonObject = Door.sealCopy(signed, texts(recipientKeys), reveals, JsonPrimitive(privateKey), fixed ?: JsonNull, JsonPrimitive(suite),
    ).obj()

    fun openCopy(message: JsonObject, x25519Private: String): JsonObject =
        Door.openCopy(message, JsonPrimitive(x25519Private)).obj()

    /** `{ public_key_encrypt, x25519_private }` (the raw private scalar, hex) in a suite. */
    fun generateEncryptionKeypair(suite: String = "std"): JsonObject = Door.encryptionKeypair(JsonPrimitive(suite)).obj()
    fun encryptionKeyOf(x25519Private: String, suite: String = "std"): String =
        Door.encryptionKeyOf(JsonPrimitive(x25519Private), JsonPrimitive(suite)).string()
}
