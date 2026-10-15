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

/** A signing key: Ed25519, as hex. `publicKeySign` is SPKI DER (88 hex), `privateKey` PKCS#8 DER (96 hex). */
data class Keypair(val publicKeySign: String, val privateKey: String) {
    fun toJson(): JsonObject = buildJsonObject {
        put("public_key_sign", publicKeySign)
        put("private_key", privateKey)
    }

    internal companion object {
        fun of(j: JsonElement) = Keypair(
            j.jsonObject["public_key_sign"]!!.string(), j.jsonObject["private_key"]!!.string(),
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

/** One key's chain, checked: ok when it has no gaps, no equivocation (two blocks at one seq) and no broken prev. */
data class Chain(
    val ok: Boolean,
    val length: Long,
    val head: JsonObject?,
    val gaps: List<Long>,
    val equivocations: List<List<String>>,
    val broken: List<String>,
)

/**
 * What `write` needs beside the words. `held` is the author's genesis, key grants and blocks (so the chain stays one
 * line) and anything the block names. `audience` makes the block private (commitments, not names); `salts` and
 * `nonce` only reproduce a vector.
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
) {
    internal fun toJson(): JsonObject = buildJsonObject {
        put("author", author)
        put("key", key.toJson())
        put("held", JsonArray(held))
        at?.let { put("at", it) }
        put("audience", texts(audience))
        put("after", texts(after))
        link?.let { put("link", it.toJson()) }
        schemas?.let { put("schemas", JsonArray(it)) }
        salts?.let { put("salts", it) }
        nonce?.let { put("nonce", it) }
    }
}

private val EMPTY = JsonObject(emptyMap())
private fun JsonObject.part(name: String): JsonElement = this[name] ?: EMPTY
private fun JsonObject.typeName(): String = (this["type"] as? JsonPrimitive)?.content ?: ""

/**
 * FoodBlock 1.6. A block is `{ type, state, refs }` signed by its author's key; its id is the SHA-256 of its
 * canonical form. Blocks are JSON objects (`{ hash, type, state, refs, signature }`), the same shape on every SDK
 * and on the wire. Names follow the JavaScript reference: `sign` signs, `seal` encrypts, `open` opens, `readAs`
 * reads any earlier shape as 1.6.
 */
object FoodBlock {
    /** The protocol version this library writes ("1.6"). */
    val VERSION: String by lazy { Native.invoke("version").string() }

    /** The profiles of protocol.json this build supports, smallest first: micro, micro_acting, edge, node. */
    val PROFILES: List<String> by lazy { Native.invoke("profiles").strings() }

    // ---- A block: its canonical form and its id ----

    fun canonical(type: String, state: JsonElement, refs: JsonElement): String =
        Native.invoke("canonical", JsonPrimitive(type), state, refs).string()

    fun canonical(block: JsonObject): String = canonical(block.typeName(), block.part("state"), block.part("refs"))

    /** Canonical JSON of any value (sorted keys, NFC, numbers as JavaScript writes them). */
    fun canonicalJson(value: JsonElement): String = Native.invoke("canonical_json", value).string()

    fun hash(type: String, state: JsonElement, refs: JsonElement): String =
        Native.invoke("hash", JsonPrimitive(type), state, refs).string()

    fun hash(block: JsonObject): String = hash(block.typeName(), block.part("state"), block.part("refs"))

    /** SHA-256 of UTF-8 text, hex. */
    fun hashHex(text: String): String = Native.invoke("hash_hex", JsonPrimitive(text)).string()

    /** `{ hash, type, state, refs }`, unsigned. */
    fun create(type: String, state: JsonElement, refs: JsonElement): JsonObject =
        Native.invoke("create", JsonPrimitive(type), state, refs).obj()

    // ---- Signing (Ed25519) ----

    fun generateKeypair(): Keypair = Keypair.of(Native.invoke("keypair", JsonNull))

    /** The key a 32-byte seed (64 hex) gives: the same key on every SDK. */
    fun keypairFromSeed(seedHex: String): Keypair = Keypair.of(Native.invoke("keypair", JsonPrimitive(seedHex)))

    /** The author's signature over a block's canonical form, 128 hex. */
    fun sign(block: JsonObject, privateKey: String): String =
        Native.invoke("sign", block, JsonPrimitive(privateKey)).string()

    fun verify(block: JsonObject, signature: String, publicKey: String): Boolean =
        Native.invoke("verify", block, JsonPrimitive(signature), JsonPrimitive(publicKey)).bool()

    /** A message part signed: the part with its `signature`. */
    fun signMessage(part: JsonObject, privateKey: String): JsonObject =
        Native.invoke("sign_message", part, JsonPrimitive(privateKey)).obj()

    fun verifyMessage(part: JsonObject, publicKey: String): Boolean =
        Native.invoke("verify_message", part, JsonPrimitive(publicKey)).bool()

    // ---- The commitment ----

    fun newSalt(): String = Native.invoke("new_salt").string()
    fun saltedHash(salt: String, value: String): String =
        Native.invoke("salted_hash", JsonPrimitive(salt), JsonPrimitive(value)).string()

    // ---- The write check and its words ----

    /**
     * What is wrong with a block, as every node checks it before writing: every reason, empty when it is
     * well-formed 1.6. `held` are blocks it may name; `schemas` the schema blocks it is checked against.
     */
    fun check(
        type: String, state: JsonElement, refs: JsonElement,
        held: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null,
    ): List<String> = Native.invoke(
        "check", JsonPrimitive(type), state, refs, JsonArray(held), schemas?.let(::JsonArray) ?: JsonNull,
    ).strings()

    fun check(block: JsonObject, held: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null) =
        check(block.typeName(), block.part("state"), block.part("refs"), held, schemas)

    /**
     * The same check, as refusals: each a code from protocol.json `refusals.codes` (the code carries the meaning)
     * and free text for people. Empty when the block is well-formed 1.6.
     */
    fun refusals(
        type: String, state: JsonElement, refs: JsonElement,
        held: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null,
    ): List<Refusal> = Native.invoke(
        "refusals", JsonPrimitive(type), state, refs, JsonArray(held), schemas?.let(::JsonArray) ?: JsonNull,
    ).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    fun refusals(block: JsonObject, held: List<JsonObject> = emptyList(), schemas: List<JsonObject>? = null) =
        refusals(block.typeName(), block.part("state"), block.part("refs"), held, schemas)

    /** A quantity: a decimal string and a UCUM unit, never a float. `amount("3.9", "Cel")`. */
    fun amount(value: String, unit: String): JsonObject =
        Native.invoke("amount", JsonPrimitive(value), JsonPrimitive(unit)).obj()

    /** Money in minor units of an ISO 4217 currency. `money(450, "GBP")`. */
    fun money(minor: Long, currency: String): JsonObject =
        Native.invoke("money", JsonPrimitive(minor), JsonPrimitive(currency)).obj()

    fun confidence(value: String): String = Native.invoke("confidence", JsonPrimitive(value)).string()
    fun terms(given: JsonObject): JsonObject = Native.invoke("terms", given).obj()

    // ---- Reading every earlier shape as 1.6 ----

    /** A block of any earlier shape, read as 1.6 (aliases.json). Never changes what was signed. */
    fun readAs(block: JsonObject): JsonObject = Native.invoke("read_as", block).obj()

    fun isA(block: JsonObject, type: String, kind: String? = null): Boolean =
        Native.invoke("is_a", block, JsonPrimitive(type), text(kind)).bool()

    // ---- Chains and causal order ----

    /** Where a key's next block goes. `last` is its latest block; with none, `broughtIn` is the genesis or key grant. */
    fun nextLink(last: JsonObject?, broughtIn: String? = null): Link {
        val l = Native.invoke("next_link", last ?: JsonNull, text(broughtIn)).jsonObject
        return Link(l["seq"]!!.jsonPrimitive.long, l["prev"]!!.string())
    }

    fun checkChain(blocks: List<JsonObject>, broughtIn: String): Chain {
        val c = Native.invoke("check_chain", JsonArray(blocks), JsonPrimitive(broughtIn)).jsonObject
        return Chain(
            ok = c["ok"]!!.bool(),
            length = c["length"]!!.jsonPrimitive.long,
            head = c["head"] as? JsonObject,
            gaps = c["gaps"]!!.jsonArray.map { it.jsonPrimitive.long },
            equivocations = c["equivocations"]!!.jsonArray.map { it.strings() },
            broken = c["broken"]!!.strings(),
        )
    }

    /** Blocks in causal order: causes before what they cause. */
    fun causalOrder(blocks: List<JsonObject>): List<JsonObject> =
        Native.invoke("causal_order", JsonArray(blocks)).jsonArray.map { it.obj() }

    fun sees(later: JsonObject, earlier: JsonObject, blocks: List<JsonObject>): Boolean =
        Native.invoke("sees", later, earlier, JsonArray(blocks)).bool()

    // ---- The one way to write, and the wire ----

    /**
     * Compose, check, sign, chain. Returns the signed block (with `salts` beside it for a private one). Throws
     * [RefusedException] with every reason when the check refuses; it never repairs.
     */
    fun write(type: String, state: JsonElement, refs: JsonElement, options: WriteOptions): JsonObject =
        Native.invoke("write", JsonPrimitive(type), state, refs, options.toJson()).obj()

    /** `{ version, block, signature }`: what goes on the wire. */
    fun wrap(signed: JsonObject): JsonObject = Native.invoke("wrap", signed).obj()
    fun unwrap(message: JsonObject): JsonObject = Native.invoke("unwrap", message).obj()
    fun header(block: JsonObject): JsonObject = Native.invoke("header", block).obj()
    fun headerSignedBy(message: JsonObject, publicKey: String): Boolean =
        Native.invoke("header_signed_by", message, JsonPrimitive(publicKey)).bool()

    // ---- Envelopes (node profile): X25519, HKDF-SHA256, AES-256-GCM ----

    /** Encrypt a value to recipients' X25519 public keys (hex): the envelope. */
    fun seal(value: JsonElement, recipientKeys: List<String>): JsonObject =
        Native.invoke("seal", value, texts(recipientKeys)).obj()

    /** Open an envelope with a recipient's X25519 private key (hex): the value inside. */
    fun open(envelope: JsonObject, x25519Private: String): JsonElement =
        Native.invoke("open", envelope, JsonPrimitive(x25519Private))

    /** A signed block sealed to recipients, with a header signed by the block's key, and what it `reveals`. */
    fun sealCopy(signed: JsonObject, recipientKeys: List<String>, reveals: JsonArray, privateKey: String): JsonObject =
        Native.invoke("seal_copy", signed, texts(recipientKeys), reveals, JsonPrimitive(privateKey)).obj()

    fun openCopy(message: JsonObject, x25519Private: String): JsonObject =
        Native.invoke("open_copy", message, JsonPrimitive(x25519Private)).obj()

    /** `{ public_key_encrypt, x25519_private }`, raw X25519 hex. */
    fun generateEncryptionKeypair(): JsonObject = Native.invoke("encryption_keypair").obj()
    fun encryptionKeyOf(x25519Private: String): String =
        Native.invoke("encryption_key_of", JsonPrimitive(x25519Private)).string()
}
