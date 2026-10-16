package world.foodx.foodblock.window

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assumptions.assumeTrue
import world.foodx.foodblock.FoodBlock
import java.io.File
import kotlin.test.*

/** A real FoodOS host (the Node kernel in the Backend checkout) on a local port. The tests are skipped when there is no checkout or no node. */
class LocalHost(vararg args: String) : AutoCloseable {
    private val process: Process
    val url: String
    init {
        val backend = System.getenv("FOODOS_BACKEND") ?: (System.getProperty("user.home") + "/Backend-foodx-computer")
        val script = File("$backend/kernel/testing/helpers/serve-passkey-host.mjs")
        assumeTrue(script.exists(), "no Backend checkout (set FOODOS_BACKEND)")
        val node = listOf("/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node").firstOrNull { File(it).canExecute() }
        assumeTrue(node != null, "no node")
        process = ProcessBuilder(listOf(node!!, script.path) + args).redirectError(ProcessBuilder.Redirect.DISCARD).start()
        val line = process.inputStream.bufferedReader().readLine()
        assumeTrue(line != null, "the host did not start")
        url = Regex("\"url\":\"([^\"]+)\"").find(line)!!.groupValues[1]
    }
    override fun close() { runCatching { process.outputStream.close() }; process.destroy() }
}

/** A transport that can lose the network, and can lie about what the host proposed. */
class SwitchableTransport(private val inner: Transport) : Transport {
    @Volatile var offline = false
    var tamper: ((String, JsonObject) -> JsonObject)? = null
    override suspend fun send(method: String, path: String, body: JsonObject?, token: String?): Response {
        if (offline) throw OfflineException()
        val r = inner.send(method, path, body, token)
        return Response(r.status, tamper?.invoke(path, r.body) ?: r.body)
    }
}

class WindowTest {
    private fun hex(b64: String) = B64.hex(b64)
    private fun text(o: JsonObject?, path: String): String? = path.split(".").fold(o as kotlinx.serialization.json.JsonElement?) { v, p -> (v as? JsonObject)?.get(p) }?.jsonPrimitive?.content
    private fun note(t: String) = buildJsonObject { put("kind", "note"); put("text", t); put("audience", "public") }
    private fun window(host: LocalHost, device: TestAuthenticator, store: WindowStore = JdbcWindowStore()): Triple<FoodBlockWindow, SwitchableTransport, WindowStore> {
        val t = SwitchableTransport(HttpTransport(host.url))
        return Triple(FoodBlockWindow(t, device, store), t, store)
    }

    @Test fun aPasskeySignatureOpensForItsKeyAndBlockOnly() = runBlocking {
        val device = TestAuthenticator(); val other = TestAuthenticator()
        val g = FoodBlock.create("actor", buildJsonObject { put("kind", "person"); put("at", "2026-10-16T12:00:00.000Z"); put("audience", "public"); put("public_key_sign", device.spki); put("suite", "p256") }, JsonObject(emptyMap()))
        val a = device.assert("foodx.network", FoodBlock.passkeyChallenge(g), null)
        val sig = FoodBlock.passkeySignature(hex(a.authenticatorData), hex(a.clientDataJson), hex(a.signature))
        assertTrue(FoodBlock.verify(g, sig, device.spki))
        assertFalse(FoodBlock.verify(g, sig, other.spki), "another key")
        val n = FoodBlock.create("thing", buildJsonObject { put("kind", "eggs") }, JsonObject(emptyMap()), "p256")
        assertFalse(FoodBlock.verify(n, sig, device.spki), "a signature for another block")
    }

    @Test fun theQueueKeepsOrderSurvivesReopeningAndKeepsRefusals() {
        val file = File.createTempFile("queue", ".db").also { it.deleteOnExit() }
        fun b(h: String) = buildJsonObject { put("hash", h); put("type", "observe") }
        JdbcWindowStore(file.path).use { s ->
            listOf("b", "a", "c").forEach { s.enqueue(b(it)) }
            s.enqueue(b("a")); s.fail("a", "refused 400: chain")
        }
        JdbcWindowStore(file.path).use { s ->
            assertEquals(listOf("b", "a", "c"), s.items().map { it.hash })
            assertEquals(listOf("b", "c"), s.pending().map { it.hash })
            assertEquals("refused 400: chain", s.items()[1].failed)
            s.taken("b"); assertEquals(listOf("a", "c"), s.items().map { it.hash })
        }
    }

    @Test fun registerSignInWriteReadAndTheOfflineQueue() = runBlocking {
        LocalHost().use { host ->
            val device = TestAuthenticator()
            val (w, net, _) = window(host, device)
            val person = w.register()
            assertEquals(64, person.length)
            var blocks = w.blocks()
            val genesis = blocks.first { text(it, "hash") == person }
            assertEquals(device.spki, text(genesis, "state.public_key_sign"), "the person's key is the passkey")

            val first = w.write("observe", note("bought oats"))
            assertIs<FoodBlockWindow.Outcome.Submitted>(first)
            assertTrue(FoodBlock.valid(first.block, blocks).isEmpty())
            blocks = w.blocks()
            assertTrue(blocks.any { text(it, "hash") == text(first.block, "hash") })

            // a new phone session: no memory, one passkey tap signs in to the same person
            val (w2, _, _) = window(host, device)
            assertEquals(person, w2.signIn())

            // offline: composed here, signed by the passkey, checked by the core, queued; reads come from the cache
            net.offline = true
            val taps = device.taps
            val q1 = w.write("observe", note("second")); val q2 = w.write("observe", note("third"))
            assertIs<FoodBlockWindow.Outcome.Queued>(q1); assertIs<FoodBlockWindow.Outcome.Queued>(q2)
            assertEquals(taps + 2, device.taps, "one tap per block")
            assertEquals(text(q1.block, "hash"), text(q2.block, "refs.prev"), "queued blocks chain")
            assertEquals(2, w.queued().size)
            assertTrue(w.blocks().isNotEmpty(), "reads still work offline")
            var report = w.sync()
            assertEquals(0, report.taken.size); assertEquals(2, report.stillWaiting, "still offline: nothing lost")

            // reconnect: the queue goes in order and the host judges each block
            net.offline = false
            report = w.sync()
            assertEquals(listOf(text(q1.block, "hash"), text(q2.block, "hash")), report.taken); assertEquals(0, report.stillWaiting)
            val after = w.blocks()
            assertTrue(after.any { text(it, "hash") == text(q2.block, "hash") })
            val mine = after.filter { text(it, "hash") != person && text(it, "refs.author") == person }
            assertTrue(FoodBlock.checkChain(mine, person).ok)
            // the next online write follows the queued ones
            val last = w.write("observe", note("fourth"))
            assertIs<FoodBlockWindow.Outcome.Submitted>(last)
            assertEquals(text(q2.block, "hash"), text(last.block, "refs.prev"))
        }
    }

    @Test fun aQueuedBlockTheHostRefusesStaysWithItsReason() = runBlocking {
        LocalHost().use { host ->
            val device = TestAuthenticator()
            val (w, net, store) = window(host, device)
            w.register()
            net.offline = true
            val q = w.write("observe", note("mine")) as FoodBlockWindow.Outcome.Queued
            // tamper with the stored block, as a corrupted disk might
            val bad = JsonObject(q.block + ("state" to JsonObject(q.block["state"]!!.jsonObject + ("text" to JsonPrimitive("free gold")))))
            store.taken(text(q.block, "hash")!!); store.enqueue(bad)
            net.offline = false
            val report = w.sync()
            assertEquals(1, report.refused.size); assertEquals(0, report.stillWaiting)
            assertNotNull(w.queued().first().failed)
            Unit
        }
    }

    @Test fun theWindowNeverSignsAChangedBlock() = runBlocking {
        LocalHost().use { host ->
            val device = TestAuthenticator()
            val (w, net, _) = window(host, device)
            w.register()
            net.tamper = { path, body ->
                if (!path.endsWith("window/propose")) body else {
                    val d = body["draft"]!!.jsonObject
                    buildJsonObject { put("draft", JsonObject(d + ("state" to JsonObject(d["state"]!!.jsonObject + ("text" to JsonPrimitive("send all my money")))))) }
                }
            }
            val taps = device.taps
            assertFails { w.write("observe", note("hello")) }
            assertEquals(taps, device.taps, "the passkey was not asked to sign it")
        }
    }

    @Test fun googleLinkComesFromTheHost() = runBlocking {
        LocalHost("--google").use { host ->
            val (w, _, _) = window(host, TestAuthenticator())
            val person = w.register()
            val link = w.googleLink()
            assertTrue(link.startsWith("https://mcp.foodx.network/link/google")); assertTrue(link.contains(person.take(8)))
        }
    }
}
