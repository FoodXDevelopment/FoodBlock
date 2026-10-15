package world.foodx.foodblock

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/**
 * The one door into the Rust core (sdk/rust, src/jni.rs): an op's name and its arguments as a JSON array go in,
 * `{ ok }` or `{ error, message, reasons }` comes out, all as UTF-8 bytes. Every function of this library is a call
 * through it, so there is one implementation of the protocol, not a copy.
 *
 * The library loads `libfoodblock` once: from the path in the system property `foodblock.library` if set (tests,
 * desktop JVMs), else by name (Android finds it in the AAR's jniLibs).
 */
internal object Native {
    init {
        val path = System.getProperty("foodblock.library")
        if (path != null) System.load(path) else System.loadLibrary("foodblock")
    }

    @JvmStatic
    private external fun call(op: ByteArray, args: ByteArray): ByteArray

    fun invoke(op: String, vararg args: JsonElement): JsonElement {
        val out = call(op.encodeToByteArray(), JsonArray(args.toList()).toString().encodeToByteArray())
        val answer = Json.parseToJsonElement(out.decodeToString()) as JsonObject
        answer["ok"]?.let { return it }
        val kind = answer["error"]?.jsonPrimitive?.content ?: "internal"
        val message = answer["message"]?.jsonPrimitive?.content ?: kind
        val code = (answer["code"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        val reasons = (answer["reasons"] as? JsonArray)?.map { it.jsonPrimitive.content } ?: emptyList()
        val refusals = (answer["refusals"] as? JsonArray)?.map {
            val r = it as JsonObject
            Refusal(r["code"]?.jsonPrimitive?.content ?: "", r["detail"]?.jsonPrimitive?.content ?: "")
        } ?: emptyList()
        throw if (kind == "refused") RefusedException(message, reasons, refusals) else FoodBlockException(kind, message, code)
    }
}

/**
 * A call the core could not answer. `kind`: argument, json, crypto, profile (not in this build) or internal.
 * `code` is the protocol.json `refusals.codes` code when the error is one of them.
 */
open class FoodBlockException(val kind: String, message: String, val code: String? = null) : RuntimeException(message)

/** One refusal: a code from protocol.json `refusals.codes` (it carries the meaning) and free text for people. */
data class Refusal(val code: String, val detail: String)

/** The write check refused the block: every refusal, and their details (`reasons`) in the same order. */
class RefusedException(message: String, val reasons: List<String>, val refusals: List<Refusal>) :
    FoodBlockException("refused", message)

internal fun text(s: String?): JsonElement = if (s == null) JsonNull else JsonPrimitive(s)
internal fun texts(list: List<String>): JsonElement = JsonArray(list.map(::JsonPrimitive))
internal fun blocks(list: List<JsonElement>): JsonElement = JsonArray(list)
internal fun arrivals(map: Map<String, String>?): JsonElement =
    if (map == null) JsonNull else JsonObject(map.mapValues { JsonPrimitive(it.value) })
internal fun JsonElement.bool(): Boolean = jsonPrimitive.content == "true"
internal fun JsonElement.string(): String = jsonPrimitive.content
internal fun JsonElement.strings(): List<String> = jsonArray.map { it.jsonPrimitive.content }
internal fun JsonElement.obj(): JsonObject = this as JsonObject
