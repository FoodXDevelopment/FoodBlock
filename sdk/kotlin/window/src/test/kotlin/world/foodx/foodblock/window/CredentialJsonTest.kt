package world.foodx.foodblock.window

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class CredentialJsonTest {
    @Test fun registrationAsksForEs256DiscoverableVerifiedNoAttestation() {
        val j = Json.parseToJsonElement(CredentialJson.registrationRequest("foodx.network", "ch", "uid", "FoodX")).jsonObject
        assertEquals("foodx.network", j["rp"]!!.jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals("-7", j["pubKeyCredParams"]!!.jsonArray.single().jsonObject["alg"]!!.jsonPrimitive.content)
        assertEquals("required", j["authenticatorSelection"]!!.jsonObject["residentKey"]!!.jsonPrimitive.content)
        assertEquals("required", j["authenticatorSelection"]!!.jsonObject["userVerification"]!!.jsonPrimitive.content)
        assertEquals("none", j["attestation"]!!.jsonPrimitive.content)
    }
    @Test fun assertionNamesTheCredentialWhenKnown() {
        assertEquals(0, Json.parseToJsonElement(CredentialJson.assertionRequest("foodx.network", "ch", null)).jsonObject["allowCredentials"]!!.jsonArray.size)
        assertEquals("abc", Json.parseToJsonElement(CredentialJson.assertionRequest("foodx.network", "ch", "abc")).jsonObject["allowCredentials"]!!.jsonArray.single().jsonObject["id"]!!.jsonPrimitive.content)
    }
    @Test fun readsWhatCredentialManagerReturns() {
        val a = CredentialJson.assertion("""{"id":"i","rawId":"i","type":"public-key","response":{"authenticatorData":"ad","clientDataJSON":"cd","signature":"sg","userHandle":"u"}}""")
        assertEquals(PasskeyAssertion("i", "ad", "cd", "sg"), a)
        val r = CredentialJson.registration("""{"id":"i","rawId":"i","type":"public-key","response":{"attestationObject":"ao","clientDataJSON":"cd"}}""")
        assertEquals(PasskeyRegistration("i", "ao", "cd"), r)
    }
}
