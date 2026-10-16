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
 * The library loads `libfoodblock` once, from the first of these that applies:
 *  1. the path in the system property `foodblock.library` (tests, a build of your own);
 *  2. Android: `System.loadLibrary("foodblock")` (the AAR carries arm64-v8a, armeabi-v7a and x86_64);
 *  3. the JVM jar: the copy bundled for this computer at `/native/<id>/`, extracted to a temporary file (ids:
 *     macos-arm64, macos-x64, linux-x64, linux-arm64, windows-x64);
 *  4. `System.loadLibrary("foodblock")` on `java.library.path` (a platform the jar does not bundle).
 */
internal object Native {
    /** Where the library came from: `property`, `android`, `bundled:<id>` or `system`. */
    val loadedFrom: String = load()

    private fun load(): String {
        System.getProperty("foodblock.library")?.let { System.load(it); return "property" }
        if (isAndroid()) { System.loadLibrary("foodblock"); return "android" }
        val id = platformId()
        val file = libraryFile()
        val bundled = Native::class.java.getResourceAsStream("/native/$id/$file")
        if (bundled != null) {
            val dir = java.nio.file.Files.createTempDirectory("foodblock-").toFile().apply { deleteOnExit() }
            val out = java.io.File(dir, file).apply { deleteOnExit() }
            bundled.use { input -> out.outputStream().use { input.copyTo(it) } }
            System.load(out.absolutePath)
            return "bundled:$id"
        }
        try { System.loadLibrary("foodblock") } catch (e: UnsatisfiedLinkError) {
            throw UnsatisfiedLinkError("foodblock: no native library for $id (os.name=${System.getProperty("os.name")}, " +
                "os.arch=${System.getProperty("os.arch")}); the jar bundles macos-arm64, macos-x64, linux-x64, linux-arm64 and windows-x64. " +
                "Build sdk/rust with --features jni and set -Dfoodblock.library=<path>.")
        }
        return "system"
    }

    private fun isAndroid(): Boolean =
        System.getProperty("java.vendor")?.contains("Android", ignoreCase = true) == true ||
            System.getProperty("java.vm.name")?.contains("Dalvik", ignoreCase = true) == true

    /** `<os>-<arch>` as the jar names its bundled copies. */
    internal fun platformId(osName: String = System.getProperty("os.name"), osArch: String = System.getProperty("os.arch")): String {
        val os = osName.lowercase()
        val arch = osArch.lowercase()
        val o = when { os.contains("mac") || os.contains("darwin") -> "macos"; os.contains("win") -> "windows"; else -> "linux" }
        val a = when (arch) { "aarch64", "arm64" -> "arm64"; "amd64", "x86_64", "x64" -> "x64"; else -> arch }
        return "$o-$a"
    }

    private fun libraryFile(): String = when (platformId().substringBefore('-')) {
        "macos" -> "libfoodblock.dylib"
        "windows" -> "foodblock.dll"
        else -> "libfoodblock.so"
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
