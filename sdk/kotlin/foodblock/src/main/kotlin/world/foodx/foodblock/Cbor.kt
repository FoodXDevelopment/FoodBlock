package world.foodx.foodblock

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The compact form (spec/modules/encoding.md): a signed public block as CBOR for small links. The rules run in the Rust
 * core; these calls turn bytes into the hex the door takes. The id of a decoded block is the hash of its canonical
 * JSON, never of these bytes. `short` uses the key table (protocol.json `cbor.keys`).
 */
object Cbor {
    const val MEDIA_TYPE = "application/foodblock+cbor"

    fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
    fun bytes(hex: String): ByteArray = ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    /** A signed public block as the CBOR message [t, block, signature]. */
    fun encode(block: JsonObject, short: Boolean = false): ByteArray =
        bytes(Native.invoke("cbor_encode", block, JsonPrimitive(short)).string())

    /** The block a CBOR message carries, its hash taken from its canonical JSON. Throws on floats, tags, null, indefinite lengths and duplicate keys. */
    fun decode(data: ByteArray): JsonObject = Native.invoke("cbor_decode", JsonPrimitive(hex(data))).obj()

    fun encodePush(blocks: List<JsonObject>, short: Boolean = false): ByteArray =
        bytes(Native.invoke("cbor_encode_push", blocks(blocks), JsonPrimitive(short)).string())

    fun decodePush(data: ByteArray): List<JsonElement> = (Native.invoke("cbor_decode_push", JsonPrimitive(hex(data))) as kotlinx.serialization.json.JsonArray).toList()

    fun encodeHeader(header: JsonObject, short: Boolean = false): ByteArray =
        bytes(Native.invoke("cbor_encode_header", header, JsonPrimitive(short)).string())

    fun decodeHeader(data: ByteArray): JsonObject = Native.invoke("cbor_decode_header", JsonPrimitive(hex(data))).obj()
}
