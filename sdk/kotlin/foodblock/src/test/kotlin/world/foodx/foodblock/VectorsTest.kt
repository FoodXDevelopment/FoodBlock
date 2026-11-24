package world.foodx.foodblock

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Conformance: every section of spec/vectors.json (and spec/canonical-vectors.json), run through this library's
 * Kotlin API (and so through the JNI door into the Rust core), the way spec/run-vectors.cjs runs the reference SDK.
 * A section this build's peer leaves out says so by name instead of passing silently.
 */
class VectorsTest {
    private companion object {
        val repo = File(System.getProperty("foodblock.repo") ?: "../../..")
        fun load(path: String): JsonElement = Json.parseToJsonElement(repo.resolve(path).readText())
        val v: JsonObject by lazy { load("spec/vectors.json").jsonObject }
        val has: Set<String> by lazy { FoodBlock.PEERS.toSet() }
        val edge get() = "edge" in has
        val node get() = "node" in has
    }

    // ---- Small readers over the vector JSON ----
    private fun JsonElement?.s(): String = (this as? JsonPrimitive)?.takeIf { it.isString }?.content ?: ""
    private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray) ?: emptyList()
    private fun JsonElement.o(): JsonObject = jsonObject
    private fun JsonElement?.f(k: String): JsonElement = (this as? JsonObject)?.get(k) ?: JsonNull
    private fun key(signer: String, field: String) = v.f("keys").f(signer).f(field).s().ifEmpty { fail("no key $signer.$field") }
    private fun public(signer: String) = key(signer, "public_key_sign")

    /** `{ hash, ...block, suite?, signature }` for a vector block, as a reader holds it. */
    private fun full(b: JsonElement): JsonObject =
        JsonObject(mapOf("hash" to b.f("hash")) + b.f("block").o() + (if (b.f("suite") is JsonNull) emptyMap() else mapOf("suite" to b.f("suite"))) + mapOf("signature" to b.f("signature")))
    private fun blocksOf(list: JsonElement): List<JsonObject> = list.arr().map(::full)
    private fun find(blocks: List<JsonObject>, hash: JsonElement) = blocks.firstOrNull { it.f("hash") == hash } ?: fail("no block $hash")
    private fun withHash(block: JsonElement, hash: JsonElement) = JsonObject(block.o() + ("hash" to hash))

    /** Deep equality as the conformance runner uses it (assert.deepEqual): numbers compare by value. */
    private fun deepEq(a: JsonElement, b: JsonElement): Boolean = when {
        a is JsonObject && b is JsonObject -> a.size == b.size && a.all { (k, x) -> b[k]?.let { deepEq(x, it) } ?: false }
        a is JsonArray && b is JsonArray -> a.size == b.size && a.indices.all { deepEq(a[it], b[it]) }
        a is JsonPrimitive && b is JsonPrimitive && !a.isString && !b.isString && a.doubleOrNull != null && b.doubleOrNull != null ->
            a.doubleOrNull == b.doubleOrNull
        else -> a == b
    }
    /** The door's subset match: every key given must match, arrays of the same length elementwise, anything else equal. */
    private fun subset(got: JsonElement?, want: JsonElement): Boolean = when {
        want is JsonArray -> got is JsonArray && got.size == want.size && want.indices.all { subset(got[it], want[it]) }
        want is JsonObject -> got is JsonObject && want.all { (k, w) -> subset(got[k], w) }
        else -> got != null && deepEq(got, want)
    }
    /** What a block's own bytes say (checks 1 to 4, core.md, section 8): its halves are `valid` and `read`. */
    private fun bytesRefusals(type: String, state: JsonElement, refs: JsonElement): List<Refusal> =
        try { FoodBlock.strictText(FoodBlock.canonical(type, state, refs)) } catch (e: FoodBlockException) { listOf(Refusal(e.code ?: "not_canonical", e.message ?: "")) }
    private fun suiteOf(b: JsonElement) = b.f("suite").s().ifEmpty { "std" }
    private fun keySuite(signer: String) = v.f("keys").f(signer).f("suite").s().ifEmpty { "std" }
    private fun texts(list: List<String>) = JsonArray(list.map(::JsonPrimitive))
    private fun JsonElement.bool() = jsonPrimitive.booleanOrNull ?: false
    private fun arrivalsOf(x: JsonElement): Map<String, String>? =
        (x as? JsonObject)?.mapValues { it.value.s() }

    /** A section's tally: every case named, every failure listed. */
    private class Report(val section: String) {
        var pass = 0
        val failed = mutableListOf<String>()
        fun ok(ok: Boolean, name: String, why: () -> String = { "" }) {
            if (ok) { pass++; println("✓ $section: $name") } else {
                val w = why(); println("✗ $section: $name $w"); failed += "$name $w"
            }
        }
        fun done() {
            println("$section: $pass passed, ${failed.size} failed")
            assertTrue(pass > 0, "$section: no vectors ran")
            assertTrue(failed.isEmpty(), "$section: ${failed.size} failed:\n" + failed.joinToString("\n"))
        }
    }
    private fun excluded(what: String, profile: String) =
        println("$what: excluded by this build's peer ($profile; this build: ${FoodBlock.PEERS})")

    @Test fun versionMatchesProtocolJson() {
        val p = load("spec/protocol.json").o()
        // protocol.json names no version in this tree (the JS suite compares with its package.json): compare only where it does
        if (p.f("version") !is JsonNull) assertEquals(p.f("version").s(), FoodBlock.VERSION)
        assertTrue(FoodBlock.VERSION.isNotEmpty())
        for (peer in FoodBlock.PEERS) assertTrue(load("spec/conventions.json").f("peers").o().containsKey(peer), "$peer is a conventions.json peer")
        println("peers in this build: ${FoodBlock.PEERS}")
        // The core's built-in spec is spec/protocol.json exactly (the door's `spec` op).
        assertTrue(deepEq(FoodBlock.call("spec").f("protocol"), p), "the core's built-in protocol.json differs from spec/")
    }

    @Test fun canonical() {
        val r = Report("canonical")
        for (c in load("spec/canonical-vectors.json").f("vectors").arr()) {
            val b = c.f("block").o()
            val text = FoodBlock.canonical(b)
            val ok = (c.f("same_as") is JsonNull || FoodBlock.hash(b) == FoodBlock.hash(c.f("same_as").o())) &&
                (c.f("not_same_as") is JsonNull || FoodBlock.hash(b) != FoodBlock.hash(c.f("not_same_as").o())) &&
                (c.f("canonical_contains") is JsonNull || text.contains(c.f("canonical_contains").s())) &&
                (c.f("canonical") is JsonNull || text == c.f("canonical").s()) &&
                (c.f("refused") !is JsonArray || c.f("refused").arr().all { code ->
                    // what a writer refuses of the value (write_refusals: a float is `float`, not the wire's `not_canonical`)
                    FoodBlock.writeRefusals(b.f("type").s(), b.f("state"), b.f("refs")).any { it.code == code.s() } })
            r.ok(ok, c.f("name").s())
        }
        for (c in v.f("canonical").arr()) {
            val b = c.f("block").o()
            r.ok(FoodBlock.canonical(b) == c.f("canonical").s() && FoodBlock.hash(b) == c.f("hash").s(), c.f("name").s())
        }
        // test/vectors.json: the cross-language canonical edge cases (numbers, strings, nesting, order).
        for (c in load("test/vectors.json").arr()) {
            val text = FoodBlock.canonical(c.f("type").s(), c.f("state"), c.f("refs"))
            val hash = FoodBlock.hash(c.f("type").s(), c.f("state"), c.f("refs"))
            r.ok(text == c.f("expected_canonical").s() && hash == c.f("expected_hash").s(), "edge: ${c.f("name").s()}") { "got $text" }
        }
        r.done()
    }

    @Test fun hashesLedgerAndChains() {
        val r = Report("hashes")
        val ledger = v.f("ledger").f("genesis").arr() + v.f("hashes").arr()
        val before = mutableListOf<JsonObject>()
        for (c in ledger) {
            val b = c.f("block").o()
            val name = c.f("name").s()
            val block = full(c)
            if (c.f("canonical") !is JsonNull) r.ok(FoodBlock.canonical(b) == c.f("canonical").s() && FoodBlock.hash(b) == c.f("hash").s(), "hash: $name")
            r.ok(FoodBlock.hash(b) == c.f("hash").s() && FoodBlock.verify(block, c.f("signature").s(), public(c.f("signer").s())), "ledger: $name: hash and signature")
            val wrong = FoodBlock.valid(block, before)
            r.ok(wrong.isEmpty(), "valid: $name") { wrong.joinToString { it.code } }
            before += block
        }
        val hashes = v.f("hashes").arr()
        val authors = hashes.mapNotNull { (it.f("block").f("refs").f("author") as? JsonPrimitive)?.content }.distinct()
        for (id in authors) {
            val mine = hashes.filter { it.f("block").f("refs").f("author").s() == id }.map(::full)
            r.ok(FoodBlock.checkChain(mine, id).ok, "chain: ${id.take(8)}'s ${mine.size} blocks, no gaps, no equivocation")
        }
        r.done()
    }

    @Test fun audience() {
        val r = Report("audience")
        for (c in v.f("audience").arr()) r.ok(FoodBlock.saltedHash(c.f("salt").s(), c.f("recipient").s()) == c.f("commitment").s(), c.f("name").s())
        r.done()
    }

    @Test fun keysFromSeeds() {
        val r = Report("keys")
        for ((name, k) in v.f("keys").o()) {
            if (k.f("xwing_private") !is JsonNull && k.f("seed") is JsonNull) {
                r.ok(FoodBlock.encryptionKeyOf(k.f("xwing_private").s(), "xwing") == k.f("public_key_encrypt").s(), "X-Wing key: $name")
                continue
            }
            val suite = k.f("suite").s().ifEmpty { "std" }
            val pair = FoodBlock.keypairFromSeed(k.f("seed").s(), suite)
            r.ok(pair.publicKeySign == k.f("public_key_sign").s() && pair.privateKey == k.f("private_key").s(), "key from seed: $name")
            r.ok(FoodBlock.encryptionKeyOf(k.f("x25519_private").s(), suite) == k.f("public_key_encrypt").s(), "encryption key: $name")
            r.ok(FoodBlock.suiteOfKey(k.f("public_key_sign").s()) == suite, "suite of key: $name")
            if (k.f("hash") !is JsonNull) r.ok(Identity.keyHash(k.f("public_key_sign").s(), suite) == k.f("hash").s(), "key hash: $name")
        }
        r.done()
    }

    /** Every story's blocks, as the runner lists them: (group, name, blocks). */
    private fun stories(): List<Triple<String, String, JsonElement>> {
        val out = mutableListOf<Triple<String, String, JsonElement>>()
        out += Triple("sealed", "stories", v.f("sealed").f("blocks"))
        return out
    }
    /** Every block the file shows, by hash: the entry as written ({ name, hash, signer, block, signature, suite? }). */
    private fun byHash(): Map<String, JsonElement> {
        val index = LinkedHashMap<String, JsonElement>()
        for (c in v.f("ledger").f("genesis").arr() + v.f("hashes").arr()) index[c.f("hash").s()] = c
        for ((_, _, list) in stories()) for (b in list.arr()) index[b.f("hash").s()] = b
        return index
    }

    @Test fun storiesHashVerifyAndCheck() {
        val r = Report("stories")
        for ((group, name, list) in stories()) {
            val wrong = mutableListOf<String>()
            for (b in list.arr()) {
                val block = b.f("block").o()
                val label = b.f("name").s()
                if (FoodBlock.hash(block.f("type").s(), block.f("state"), block.f("refs"), suiteOf(b)) != b.f("hash").s()) wrong += "$label: hash"
                if (!FoodBlock.verify(full(b), b.f("signature").s(), public(b.f("signer").s()))) wrong += "$label: signature"
                if (keySuite(b.f("signer").s()) != suiteOf(b)) wrong += "$label: suite"
                val found = bytesRefusals(block.f("type").s(), block.f("state"), block.f("refs"))
                if (found.isNotEmpty()) wrong += "$label: ${found.joinToString { it.code }}"
            }
            r.ok(wrong.isEmpty(), "$group: $name: ${list.arr().size} blocks hash, verify and pass the check") { wrong.joinToString(" | ") }
        }
        r.done()
    }

    @Test fun signatures() {
        val r = Report("signatures")
        val index = byHash()
        fun opens(c: JsonElement) = index[c.f("hash").s()]?.let { FoodBlock.verify(full(it), c.f("signature").s(), public(c.f("signer").s())) } ?: false
        for (c in v.f("signatures").arr()) {
            val signer = c.f("signer").s()
            val entry = index.getValue(c.f("hash").s())
            val ours = FoodBlock.sign(full(entry), key(signer, "private_key"), keySuite(signer))
            r.ok(opens(c) && FoodBlock.verify(full(entry), ours, public(signer)), "signature: ${c.f("name").s()}")
        }
        for (c in v.f("bad_signatures").arr()) r.ok(!opens(c), "bad signature refused: ${c.f("name").s()}")
        r.done()
    }

    @Test fun headers() {
        val r = Report("headers")
        val index = byHash()
        for (c in v.f("headers").arr()) {
            val block = withHash(index.getValue(c.f("hash").s()).f("block"), c.f("hash"))
            // a header is no message (core.md, section 2): its signature is the block's, over the header
            val message = JsonObject(mapOf("header" to c.f("header"), "header_signature" to c.f("header_signature")))
            r.ok(deepEq(FoodBlock.header(block), c.f("header")) && FoodBlock.headerSignedBy(message, public(c.f("signer").s())), c.f("name").s())
        }
        r.done()
    }

    @Test fun envelopesAndSealedCopies() {
        if (!node) return excluded("envelopes, sealed copies", "node")
        val r = Report("envelopes")
        for (c in v.f("envelopes").arr()) {
            val want = c.f("opens_to")
            val got = runCatching { FoodBlock.unwrap(FoodBlock.open(c.f("envelope").o(), key(c.f("recipient").s(), if (v.f("keys").f(c.f("recipient").s()).f("xwing_private") !is JsonNull) "xwing_private" else "x25519_private")).o()) }
            r.ok(got.getOrNull()?.let { m -> m.f("hash") == want.f("hash") && m.f("signature") == want.f("signature") } ?: false,
                "envelope: ${c.f("name").s()}") { got.exceptionOrNull()?.message ?: "" }
        }
        for (c in v.f("sealed").f("cases").arr()) {
            val want = c.f("opens_to")
            val got = runCatching { FoodBlock.openCopy(c.f("message").o(), key(c.f("recipient").s(), "x25519_private")) }
            val ok = got.getOrNull()?.let { m ->
                m.f("hash") == want.f("hash") && m.f("signature") == want.f("signature") && deepEq(m.f("reveals"), want.f("reveals")) &&
                    FoodBlock.headerSignedBy(c.f("message").o(), public(c.f("signer").s()))
            } ?: false
            r.ok(ok, "sealed: ${c.f("name").s()}") { got.exceptionOrNull()?.message ?: "" }
        }
        // A private block sealed here opens, and its header carries the block's one signature.
        val c = v.f("sealed").f("cases").arr()[1]
        val signer = c.f("signer").s()
        val block = full(byHash().getValue(c.f("opens_to").f("hash").s()))
        val copy = FoodBlock.sealCopy(block, listOf(key("bob", "public_key_encrypt")), JsonArray(emptyList()), keySuite("bob"))
        val opened = FoodBlock.openCopy(copy, key("bob", "x25519_private"))
        r.ok(opened.f("hash") == c.f("opens_to").f("hash") && FoodBlock.headerSignedBy(copy, public(signer)), "a copy sealed here opens and its header verifies")
        // And a value sealed here opens, in every suite.
        for (suite in listOf("std", "p256", "sm")) {
            val pair = FoodBlock.generateEncryptionKeypair(suite)
            val value = buildJsonObject { put("kind", "eggs") }
            r.ok(FoodBlock.open(FoodBlock.seal(value, listOf(pair.f("public_key_encrypt").s()), suite), pair.f("x25519_private").s()) == value,
                "a value sealed here opens with its key ($suite)")
        }
        r.done()
    }

    private fun codesOf(codes: List<String>) = texts(codes.distinct())

    @Test fun messages() {
        if (!edge) return excluded("messages (pull, push, discovery)", "edge")
        val r = Report("messages")
        val m = v.f("messages")
        val nodeId = m.f("node").s()
        val nodeKey = public(m.f("node_signer").s())
        val pull = m.f("signed_pull")
        val challenge = m.f("signed_pull_challenge")
        val jem = public(pull.f("signer").s())
        val highest = pull.f("highest").jsonPrimitive.content.toLong()
        val pm = pull.f("message").o()
        fun codes(msg: JsonObject, f: Freshness) = codesOf(Sync.pullRefusals(msg, f).map { it.code })
        r.ok(Sync.pullRefusals(pm, Freshness(nodeId, listOf(jem), highest)).isEmpty() && pm["at"] == null,
            "a signed pull names the node and a counter above the highest seen, and carries no time")
        r.ok(codes(pm, Freshness(nodeId, listOf(jem), pm.f("counter").jsonPrimitive.content.toLong())) == texts(listOf("replay")), "a counter that is not above the highest seen is a replay")
        r.ok(Sync.pullRefusals(challenge.f("message").o(), Freshness(nodeId, listOf(jem), null, listOf(challenge.f("challenge").s()))).isEmpty(), "a challenge the node issued is taken")
        r.ok(codes(challenge.f("message").o(), Freshness(nodeId, listOf(jem))) == texts(listOf("replay")), "a challenge the node did not issue, or has seen used, is a replay")
        r.ok(codes(pm, Freshness("0".repeat(64), listOf(jem), highest)) == texts(listOf("wrong_node")), "a signed pull for another node is refused")
        r.ok(codes(JsonObject(pm + ("since" to JsonPrimitive(1))), Freshness(nodeId, listOf(jem), highest)) == texts(listOf("bad_signature")), "a changed request no longer verifies")
        val sp = m.f("signed_push")
        r.ok(Sync.pushRefusals(sp.f("message").o(), Freshness(nodeId, listOf(public(sp.f("signer").s())), sp.f("highest").jsonPrimitive.content.toLong())).isEmpty(), "a signed push")
        // A pull signed here carries one proof and no time.
        val ours = Sync.signPull(buildJsonObject { put("since", 0) }, pm.f("signer").s(), nodeId, key(pull.f("signer").s(), "private_key"), counter = 9)
        r.ok(Sync.pullRefusals(ours, Freshness(nodeId, listOf(jem), 8)).isEmpty() && ours["at"] == null && ours["nonce"] == null, "a pull signed here is taken")
        r.ok(Sync.newChallenge().length == 32, "a new challenge")
        r.ok(nodeKey in Identity.liveKeys(nodeId, blocksOf(v.f("sealed").f("blocks"))), "the node key is a key of its holder, brought in by a key grant")
        val answer = m.f("pull_answer").f("message").o()
        r.ok(Sync.answerSignedBy(answer, listOf(nodeKey)) && answer.f("blocks").arr().size == m.f("pull_answer").f("matches").jsonPrimitive.content.toInt(),
            "a pull answer is signed by the node")
        val push = m.f("push_answer").f("message").o()
        r.ok(Sync.answerSignedBy(push, listOf(nodeKey)), "a push answer is signed by the node")
        val spec = load("spec/conventions.json").f("messages")
        val known = load("spec/protocol.json").f("refusals").f("codes").o().values.flatMap { it.o().keys }.toSet()
        r.ok(push.keys.toList() == spec.f("push_answer").arr().map { it.s() }.filter { it in push.keys || it !in spec.f("push_answer_optional").arr().map { k -> k.s() } } &&
            push.f("refused").arr().all { it.o().keys.toList() == spec.f("refusal").arr().map { k -> k.s() } && it.f("code").s() in known } &&
            push.f("equivocations").arr().all { pair -> pair.arr().map { it.s() } == pair.arr().map { it.s() }.sorted() },
            "a push answer carries every key, refusals as { hash, code, detail }, equivocations as sorted pairs")
        r.ok(deepEq(Sync.pushAnswer(push, push.f("node").s(), key(m.f("node_signer").s(), "private_key")), push), "the push answer rebuilds byte for byte")
        val changed = JsonObject(push + ("taken" to JsonArray(emptyList())))
        r.ok(!Sync.answerSignedBy(changed, listOf(nodeKey)), "a changed answer no longer verifies")
        val q = m.f("push")
        val req = q.f("request").o()
        r.ok(deepEq(Sync.pushRequest(req.f("messages").arr().map { it.o() }, req.f("for").o()), req) && deepEq(req.f("for").f(q.f("hash").s()), q.f("recipients")) && q.f("recipients").arr().size == 2,
            "a push names the list of ids each sealed copy is for")
        val doc = m.f("discovery").o()
        r.ok(Sync.wellKnownErrors(doc).isEmpty() && deepEq(m.f("announcement"), Sync.announcement(doc)) && doc.f("endpoints").o().containsKey("challenge"),
            "discovery names the challenge endpoint, and its local announcement")
        r.done()
    }

    @Test fun compactForm() {
        val r = Report("cbor")
        val c = v.f("cbor")
        fun signed(case: JsonElement) = JsonObject(case.f("block").o() + mapOf("hash" to case.f("hash"), "signature" to case.f("signature")))
        for (case in c.f("cases").arr()) {
            val b = signed(case)
            val name = case.f("name").s()
            r.ok(Cbor.hex(Cbor.encode(b)) == case.f("cbor").s() && Cbor.hex(Cbor.encode(b, true)) == case.f("cbor_short").s(), "writes deterministic bytes: $name")
            r.ok(deepEq(Cbor.decode(Cbor.bytes(case.f("cbor").s())), b) && deepEq(Cbor.decode(Cbor.bytes(case.f("cbor_short").s())), b), "reads back to the block: $name")
            r.ok(FoodBlock.hash(case.f("block").o()) == case.f("hash").s() &&
                FoodBlock.canonical(case.f("block").o()).encodeToByteArray().size.toString() == case.f("canonical_bytes").jsonPrimitive.content, "id and size: $name")
        }
        r.ok(Cbor.decode(Cbor.bytes(c.f("loose").f("cbor").s())).f("hash") == c.f("loose").f("hash"), "any well-formed encoding of the same content is accepted")
        val push = c.f("push")
        val pushed = push.f("hashes").arr().map { h -> signed(c.f("cases").arr().first { it.f("hash") == h }) }
        r.ok(Cbor.hex(Cbor.encodePush(pushed)) == push.f("cbor").s() && deepEq(JsonArray(Cbor.decodePush(Cbor.bytes(push.f("cbor_short").s()))), JsonArray(pushed)), push.f("name").s())
        for (h in c.f("headers").arr()) {
            r.ok(Cbor.hex(Cbor.encodeHeader(h.f("header").o())) == h.f("cbor").s() && deepEq(Cbor.decodeHeader(Cbor.bytes(h.f("cbor_short").s())), h.f("header")), h.f("name").s())
        }
        for (x in c.f("refused").arr()) r.ok(runCatching { Cbor.decode(Cbor.bytes(x.f("cbor").s())) }.isFailure, "refused: ${x.f("name").s()}")
        r.done()
    }

    // The door: one case per rule. `expect` is a subset match, `exact` deep equality, `codes` the refusal codes of the
    // list (each once, in order), `error` a failure (matching `kind` and `code` when given). Core-only cases run too.
    @Test fun door() {
        val r = Report("door")
        // the protocol's cases, then every other op's (spec/conventions-vectors.json)
        val cases = v.f("door").arr() + load("spec/conventions-vectors.json").f("door").arr()
        assertTrue(cases.size > 50, "the door section has its cases")
        for (d in cases) {
            val name = d.f("name").s()
            val args = d.f("args").arr().toTypedArray()
            val got = runCatching { FoodBlock.call(d.f("op").s(), *args) }
            val error = d.f("error")
            if (got.isFailure) {
                val e = got.exceptionOrNull() as? FoodBlockException
                val ok = error is JsonObject && e != null && (error.f("code") is JsonNull || e.code == error.f("code").s()) && (error.f("kind") is JsonNull || e.kind == error.f("kind").s())
                r.ok(ok, name) { "failed: ${got.exceptionOrNull()?.message}" }
                continue
            }
            val value = got.getOrThrow()
            when {
                error !is JsonNull -> r.ok(false, name) { "it should have failed" }
                d.f("codes") !is JsonNull -> r.ok(codesOf(value.arr().map { it.f("code").s() }) == d.f("codes"), name) { value.toString() }
                d.f("exact").bool() -> r.ok(deepEq(value, d.f("expect")), name) { value.toString() }
                else -> r.ok(subset(value, d.f("expect")), name) { value.toString() }
            }
        }
        r.done()
    }

    @Test fun xwingDraft11() {
        val r = Report("xwing_draft11")
        val d = v.f("xwing_draft11")
        r.ok(FoodBlock.encryptionKeyOf(d.f("sk").s(), "xwing") == "xwing:" + d.f("pk").s(), "the key of the draft's private seed")
        r.done()
    }

    // Every section of spec/vectors.json is one this runner reads: a new section cannot pass unseen.
    @Test fun everySectionIsRun() {
        val read = setOf("\$comment", "comment", "keys", "hashes", "ledger", "canonical", "audience", "signatures", "bad_signatures", "envelopes",
            "sealed", "headers", "messages", "cbor", "door", "xwing_draft11")
        assertEquals(emptySet(), v.keys - read, "sections in spec/vectors.json this runner does not run")
    }
}
