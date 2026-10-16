package world.foodx.foodblock.window

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The JSON Android's Credential Manager speaks (the WebAuthn JSON forms), kept free of Android types so it is tested on the JVM:
 * `CredentialManagerPasskeys` (the android module) only hands these strings to the system and reads the answers back.
 */
object CredentialJson {
    /** ES256 (P-256) only, a discoverable credential, user verification required, no attestation: what the host's registration asks for. */
    fun registrationRequest(rpId: String, challenge: String, userId: String, name: String, rpName: String = "FoodX"): String = buildJsonObject {
        put("challenge", challenge)
        putJsonObject("rp") { put("id", rpId); put("name", rpName) }
        putJsonObject("user") { put("id", userId); put("name", name); put("displayName", name) }
        putJsonArray("pubKeyCredParams") { add(buildJsonObject { put("type", "public-key"); put("alg", -7) }) }
        putJsonObject("authenticatorSelection") { put("residentKey", "required"); put("userVerification", "required") }
        put("attestation", "none")
    }.toString()

    fun assertionRequest(rpId: String, challenge: String, credentialId: String?): String = buildJsonObject {
        put("challenge", challenge); put("rpId", rpId); put("userVerification", "required")
        putJsonArray("allowCredentials") { if (credentialId != null) add(buildJsonObject { put("type", "public-key"); put("id", credentialId) }) }
    }.toString()

    fun registration(responseJson: String): PasskeyRegistration {
        val r = Json.parseToJsonElement(responseJson).jsonObject; val response = r["response"]!!.jsonObject
        return PasskeyRegistration(r["id"]!!.jsonPrimitive.content, response["attestationObject"]!!.jsonPrimitive.content, response["clientDataJSON"]!!.jsonPrimitive.content)
    }
    fun assertion(responseJson: String): PasskeyAssertion {
        val r = Json.parseToJsonElement(responseJson).jsonObject; val response = r["response"]!!.jsonObject
        return PasskeyAssertion(r["id"]!!.jsonPrimitive.content, response["authenticatorData"]!!.jsonPrimitive.content, response["clientDataJSON"]!!.jsonPrimitive.content, response["signature"]!!.jsonPrimitive.content)
    }
}
