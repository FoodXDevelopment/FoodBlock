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
 * What `write` needs beside the words. `blocks` is the author's genesis, key grants and blocks (so the chain stays one
 * line) and anything the block names. `audience` is required: [PUBLIC], or the recipients (a private block is written as
 * commitments, not names); `at` is required, a time the caller states (or `clockless`). Left out, the core refuses; nothing is filled in.
 * `salts` and `nonce` only reproduce a vector.
 */
data class WriteOptions(
    val author: String,
    val key: Keypair,
    val blocks: List<JsonObject> = emptyList(),
    val at: String? = null,
    val audience: List<String> = emptyList(),
    val after: List<String> = emptyList(),
    val link: Link? = null,
    val schemas: List<JsonObject>? = null,
    val salts: JsonObject? = null,
    val nonce: String? = null,
    val suite: String? = null,
    val skip: Boolean = false,
    val clockless: Boolean = false,
) {
    internal fun toJson(): JsonObject = buildJsonObject {
        put("author", author)
        put("key", key.toJson())
        put("blocks", JsonArray(blocks))
        at?.let { put("at", it) }
        audienceJson(audience)?.let { put("audience", it) }
        put("after", texts(after))
        link?.let { put("link", it.toJson()) }
        schemas?.let { put("schemas", JsonArray(it)) }
        salts?.let { put("salts", it) }
        nonce?.let { put("nonce", it) }
        (suite ?: key.suite)?.let { put("suite", it) }
        if (skip) put("skip", true)
        if (clockless) put("clockless", true)
    }
}

private val EMPTY = JsonObject(emptyMap())
private fun JsonObject.part(name: String): JsonElement = this[name] ?: EMPTY
private fun JsonObject.typeName(): String = (this["type"] as? JsonPrimitive)?.content ?: ""

/**
 * FoodBlock 1.9. A block is `{ type, state, refs }` signed by its author's key; its id is the SHA-256 of its
 * canonical form. Blocks are JSON objects (`{ hash, type, state, refs, signature }`), the same shape on every SDK
 * and on the wire. Names follow the JavaScript reference: `sign` signs, `seal` encrypts, `open` opens.
 */
object FoodBlock {
    /** The core's version number (a label: protocol.json names no version). */
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

    /** The id of a block, in the suite of the key that signed it (core.md, section 2), that key found among `blocks`; with none, in the
     *  suite the block shows (a genesis's own, else as its prev is hashed). No label names it. */
    fun hash(block: JsonObject, blocks: List<JsonObject>? = null): String =
        if (blocks == null) Door.idOf(block).string() else Door.idOf(block, JsonArray(blocks)).string()

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

    // ---- The checks and their words (core.md, section 8) ----

    private fun refusalsOf(e: JsonElement): List<Refusal> =
        e.jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /**
     * What a writer refuses to sign (core.md, section 8), asked of an unsigned draft before anyone signs it: every code `write`
     * would refuse it with, read against the blocks given. Empty when it may be signed.
     */
    fun writeRefusals(draft: JsonObject, blocks: List<JsonObject> = emptyList()): List<Refusal> =
        refusalsOf(Door.writeRefusals(draft, JsonArray(blocks)))

    fun writeRefusals(type: String, state: JsonElement, refs: JsonElement, blocks: List<JsonObject> = emptyList()): List<Refusal> =
        writeRefusals(buildJsonObject { put("type", type); put("state", state); put("refs", refs) }, blocks)

    /** Whether an unsigned draft, once signed, binds anyone: an accept, or a word under which something of its author would move. */
    fun binds(draft: JsonObject, blocks: List<JsonObject> = emptyList()): Boolean =
        Door.binds(draft, JsonArray(blocks)).bool()

    /** A block's amount: a decimal string and a unit, never a float. `amount("3.9", "Cel")`; money is an amount: `amount("4.20", "GBP")`. `of` names a kind. */
    fun amount(value: String, unit: String, of: String? = null): JsonObject =
        Door.amount(JsonPrimitive(value), JsonPrimitive(unit), text(of)).obj()

    fun terms(given: JsonObject): JsonObject = Door.terms(given).obj()

    /**
     * valid(block, blocks): who said these bytes (core.md, section 8): every refusal of a signed block (or a given header)
     * against the blocks given, empty when valid. It reads no arrival and no clock.
     */
    fun valid(block: JsonObject, blocks: List<JsonObject> = emptyList()): List<Refusal> =
        refusalsOf(Door.valid(block, JsonArray(blocks)))

    /**
     * read(block, blocks, schemas): whether this reader can read a valid block; every code found, empty when it is read.
     * `schemas` is the schema store ([schemasFrom]).
     */
    fun read(block: JsonObject, blocks: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null): List<Refusal> =
        refusalsOf(Door.read(block, JsonArray(blocks), schemas?.let(::JsonArray) ?: JsonNull))

    /** The schema store of the blocks given: every thing of kind schema among them, ids ascending. */
    fun schemasFrom(blocks: List<JsonObject>): List<JsonObject> = Door.schemasFrom(JsonArray(blocks)).jsonArray.map { it.obj() }

    /** A block's bytes as they came (JSON text): size_limit, not_canonical, else the strict checks. */
    fun strictText(text: String): List<Refusal> = refusalsOf(Door.strictText(JsonPrimitive(text)))

    /** Whether a value is a real UTC time (`YYYY-MM-DDTHH:MM:SS.sssZ`), or a real date. */
    fun isTime(value: JsonElement): Boolean = Door.isTime(value).bool()
    fun isDate(value: JsonElement): Boolean = Door.isDate(value).bool()

    /** The short code of a block id: `XXXX-XXXX` (Crockford Base32 of its first 5 bytes; profiles/short-form.md). */
    fun shortCode(id: String): String = Door.shortCode(JsonPrimitive(id)).string()
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

    /** Whether the line is read whole from a block back to a start (folds.md, A line): `{ whole, lacks }`. */
    fun readWhole(block: String, start: String, blocks: List<JsonObject> = emptyList()): JsonObject =
        Door.readWhole(JsonPrimitive(block), JsonPrimitive(start), JsonArray(blocks)).obj()

    /** The hashes a block names, through every ref. */
    fun causesOf(block: JsonObject): List<String> = Door.causesOf(block).strings()

    /** Every given block in a block's causal past (hashes; the block itself is not in it). */
    fun pastOf(block: JsonObject, blocks: List<JsonObject>): List<String> = Door.pastOf(block, JsonArray(blocks)).strings()

    /** The blocks no other block among them has in its causal past. */
    fun headsAmong(blocks: List<JsonObject>): List<JsonElement> = Door.headsAmong(JsonArray(blocks)).jsonArray.toList()

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
    /** A block off the wire: its hash recomputed from its content, in the suite of the key that signed it (found among `blocks`, the
     *  author's blocks; core.md, section 2); with none, in the suite the block shows. */
    fun unwrap(message: JsonObject, blocks: List<JsonObject>? = null): JsonObject =
        (if (blocks == null) Door.unwrap(message) else Door.unwrap(message, JsonArray(blocks))).obj()
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

    /** A signed block sealed to recipients, and what it `reveals`. A private block is signed once, over its header, so its own signature is the header's. */
    fun sealCopy(
        signed: JsonObject, recipientKeys: List<String>, reveals: JsonArray,
        suite: String = "std", fixed: JsonObject? = null,
    ): JsonObject = Door.sealCopy(signed, texts(recipientKeys), reveals, fixed ?: JsonNull, JsonPrimitive(suite),
    ).obj()

    fun openCopy(message: JsonObject, x25519Private: String): JsonObject =
        Door.openCopy(message, JsonPrimitive(x25519Private)).obj()

    /** `{ public_key_encrypt, x25519_private }` (the raw private scalar, hex) in a suite. */
    fun generateEncryptionKeypair(suite: String = "std"): JsonObject = Door.encryptionKeypair(JsonPrimitive(suite)).obj()
    fun encryptionKeyOf(x25519Private: String, suite: String = "std"): String =
        Door.encryptionKeyOf(JsonPrimitive(x25519Private), JsonPrimitive(suite)).string()
}
