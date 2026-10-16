package world.foodx.foodblock

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** The API an Android app or device uses, end to end: an identity, signed readings in one chain, a refusal, a seal. */
class ApiTest {
    private val keys = FoodBlock.keypairFromSeed("1".repeat(64))
    private val recovery = FoodBlock.keypairFromSeed("2".repeat(64))
    private val me = Identity.genesis(
        keys, kind = "sensor", recoveryKey = recovery.publicKeySign, reach = "P30D",
        encryptionKey = "0f101bc98e786e795207789cf2e203f0cad2c7cc97a96fb7c3a9b458e8fe4729",
        at = "2026-10-15T09:00:00.000Z",
    )
    private val id = me["hash"]!!.jsonPrimitive.content

    private fun reading(held: List<JsonObject>, at: String, celsius: String) = FoodBlock.write(
        "observe",
        buildJsonObject { put("kind", "reading"); put("amount", FoodBlock.amount(celsius, "Cel")) },
        buildJsonObject { put("subject", id) },
        WriteOptions(author = id, key = keys, held = held, at = at),
    )
    private fun JsonObject.at(part: String, key: String) = this[part]!!.jsonObject[key]!!.jsonPrimitive.content

    @Test fun aSensorSignsItsReadingsInOneChain() {
        assertTrue(FoodBlock.check(me).isEmpty(), "the genesis passes the write check")
        val first = reading(listOf(me), "2026-10-15T09:01:00.000Z", "3.9")
        assertEquals("1", first.at("state", "seq"))
        assertEquals(id, first.at("refs", "prev"))
        assertTrue(FoodBlock.verify(first, first["signature"]!!.jsonPrimitive.content, keys.publicKeySign))
        val second = reading(listOf(me, first), "2026-10-15T09:02:00.000Z", "4.1")
        assertEquals("2", second.at("state", "seq"))
        assertEquals(first["hash"]!!.jsonPrimitive.content, second.at("refs", "prev"))
        assertEquals(3L, FoodBlock.nextLink(second).seq)
        assertTrue(FoodBlock.checkChain(listOf(first, second), id).ok, "one line, no gaps")
        assertEquals(FoodBlock.hash(first), first["hash"]!!.jsonPrimitive.content)
        val wire = FoodBlock.wrap(first)
        assertEquals(first["hash"], FoodBlock.unwrap(wire)["hash"])
    }

    @Test fun aPasskeyChallengeIsTheBlocksId() {
        val block = FoodBlock.create("thing", buildJsonObject { put("kind", "eggs") }, buildJsonObject {}, "p256")
        val challenge = FoodBlock.passkeyChallenge(block)
        assertEquals(43, challenge.length)
        assertTrue(challenge.none { it == '=' || it == '+' || it == '/' })
        assertFailsWith<FoodBlockException> { FoodBlock.passkeySignature("zz", "00", "00") }
    }

    @Test fun aBrokenBlockIsRefusedWithEveryReason() {
        val e = assertFailsWith<RefusedException> {
            FoodBlock.write("observe", buildJsonObject { put("amount", 3.9) }, buildJsonObject {},
                WriteOptions(author = id, key = keys, held = listOf(me), at = "2026-10-15T09:01:00.000Z"))
        }
        assertTrue(e.reasons.isNotEmpty(), "the reasons come back")
        println("refused: ${e.refusals.ifEmpty { e.reasons }}")
    }

    @Test fun aSealedValueOpensOnlyForItsRecipient() {
        if ("node" !in FoodBlock.PEERS) return println("envelopes: excluded by this build's peer (node)")
        val bob = FoodBlock.generateEncryptionKeypair()
        val eve = FoodBlock.generateEncryptionKeypair()
        val value = buildJsonObject { put("kind", "eggs") }
        val sealed = FoodBlock.seal(value, listOf(bob["public_key_encrypt"]!!.jsonPrimitive.content))
        assertEquals(value, FoodBlock.open(sealed, bob["x25519_private"]!!.jsonPrimitive.content))
        assertFailsWith<FoodBlockException> { FoodBlock.open(sealed, eve["x25519_private"]!!.jsonPrimitive.content) }
    }

    @Test fun everySuiteSignsAndWrites() {
        for (suite in listOf("std", "p256", "sm")) {
            val k = FoodBlock.generateKeypair(suite)
            assertEquals(suite, FoodBlock.suiteOfKey(k.publicKeySign) ?: "std")
            val genesis = Identity.genesis(k, kind = "sensor", at = "2026-10-15T09:00:00.000Z")
            val gid = genesis["hash"]!!.jsonPrimitive.content
            val block = FoodBlock.write(
                "observe", buildJsonObject { put("kind", "note"); put("text", "hi") }, buildJsonObject {},
                WriteOptions(author = gid, key = k, held = listOf(genesis), at = "2026-10-15T09:01:00.000Z"),
            )
            assertTrue(FoodBlock.valid(block, listOf(genesis)).isEmpty(), "$suite: valid")
            assertEquals(block["hash"]!!.jsonPrimitive.content, FoodBlock.hash(block))
            assertEquals(block["hash"], FoodBlock.unwrap(FoodBlock.wrap(block))["hash"])
        }
    }

    @Test fun thereIsNoOlderShape() {
        assertFailsWith<FoodBlockException> { FoodBlock.call("read_as", buildJsonObject {}) }
        assertEquals(9, FoodBlock.receiptCode("0".repeat(64)).length)
        assertEquals(11, FoodBlock.receiptCodeLong("0".repeat(64)).length)
        assertEquals(true, FoodBlock.codeMatches("oooo oooo", "0".repeat(64)))
        assertEquals(false, FoodBlock.codeMatches("0000-000", "0".repeat(64)))
    }

    @Test fun badInputIsAnErrorNotACrash() {
        val e = assertFailsWith<FoodBlockException> { FoodBlock.sign(buildJsonObject { put("type", "thing") }, "not hex") }
        assertTrue(e.kind == "crypto" || e.kind == "argument", e.kind)
        assertEquals("1.6", FoodBlock.VERSION)
        assertEquals(64, FoodBlock.hash("thing", buildJsonObject { put("kind", JsonPrimitive("eggs")) }, buildJsonObject {}).length)
    }
}
