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
    private fun find(held: List<JsonObject>, hash: JsonElement) = held.firstOrNull { it.f("hash") == hash } ?: fail("no block $hash")
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
    private fun strict(block: JsonElement) = FoodBlock.check(block.f("type").s(), block.f("state"), block.f("refs"))
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
        assertEquals(p.f("version").s(), FoodBlock.VERSION)
        for (peer in FoodBlock.PEERS) assertTrue(p.f("peers").o().containsKey(peer), "$peer is a protocol.json peer")
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
                    FoodBlock.refusals(b.f("type").s(), b.f("state"), b.f("refs")).any { it.code == code.s() } })
            r.ok(ok, c.f("name").s())
        }
        for (c in v.f("canonical").arr()) {
            val b = c.f("block").o()
            r.ok(FoodBlock.canonical(b) == c.f("canonical").s() && FoodBlock.hash(b) == c.f("hash").s(), c.f("name").s())
        }
        // test/vectors.json: the older cross-language cases that still hash identically under 1.6.
        for (c in load("test/vectors.json").arr()) {
            val text = FoodBlock.canonical(c.f("type").s(), c.f("state"), c.f("refs"))
            val hash = FoodBlock.hash(c.f("type").s(), c.f("state"), c.f("refs"))
            r.ok(text == c.f("expected_canonical").s() && hash == c.f("expected_hash").s(), "older: ${c.f("name").s()}") { "got $text" }
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
            val suite = k.f("suite").s().ifEmpty { "std" }
            val pair = FoodBlock.keypairFromSeed(k.f("seed").s(), suite)
            r.ok(pair.publicKeySign == k.f("public_key_sign").s() && pair.privateKey == k.f("private_key").s(), "key from seed: $name")
            r.ok(FoodBlock.encryptionKeyOf(k.f("x25519_private").s(), suite) == k.f("public_key_encrypt").s(), "encryption key: $name")
            r.ok(FoodBlock.suiteOfKey(k.f("public_key_sign").s()) == suite, "suite of key: $name")
            if (k.f("hash") !is JsonNull) r.ok(Identity.recoveryKeyHash(k.f("public_key_sign").s(), suite) == k.f("hash").s(), "recovery hash: $name")
        }
        r.done()
    }

    /** Every story's blocks, as the runner lists them: (group, name, blocks). */
    private fun stories(): List<Triple<String, String, JsonElement>> {
        val out = mutableListOf<Triple<String, String, JsonElement>>()
        fun add(group: String, list: JsonElement) = list.arr().forEach { out += Triple(group, it.f("name").s(), it.f("blocks")) }
        add("identity", v.f("identities")); add("deal", v.f("deals")); add("circle", v.f("circles"))
        for ((k, g) in listOf("promises" to "promise fold", "circles" to "circle fold", "audience" to "audience fold",
            "things" to "thing fold", "successors" to "successor fold", "rekeys" to "rekey fold", "ballots" to "ballot fold")) add(g, v.f("folds").f(k))
        out += Triple("refusal", "stories", v.f("refusals").f("blocks"))
        for (c in v.f("refusals").f("cases").arr()) if (c.f("blocks") !is JsonNull) out += Triple("refusal", c.f("name").s(), c.f("blocks"))
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
                val found = FoodBlock.refusals(block)
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
            val part = JsonObject(c.f("header").o() + ("signature" to c.f("header_signature")))
            r.ok(deepEq(FoodBlock.header(block), c.f("header")) && FoodBlock.verifyMessage(part, public(c.f("signer").s())), c.f("name").s())
        }
        r.done()
    }

    @Test fun envelopesAndSealedCopies() {
        if (!node) return excluded("envelopes, sealed copies", "node")
        val r = Report("envelopes")
        for (c in v.f("envelopes").arr()) {
            val want = c.f("opens_to")
            val got = runCatching { FoodBlock.unwrap(FoodBlock.open(c.f("envelope").o(), key(c.f("recipient").s(), "x25519_private")).o()) }
            r.ok(got.getOrNull()?.let { m -> m.f("hash") == want.f("hash") && m.f("signature") == want.f("signature") && m.f("version") == want.f("version") } ?: false,
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
        // A copy sealed here opens, and its header is signed by the block's key.
        val c = v.f("signatures").arr()[0]
        val signer = c.f("signer").s()
        val block = full(byHash().getValue(c.f("hash").s()))
        val copy = FoodBlock.sealCopy(block, listOf(key("bob", "public_key_encrypt")), JsonArray(emptyList()), key(signer, "private_key"), keySuite(signer))
        val opened = FoodBlock.openCopy(copy, key("bob", "x25519_private"))
        r.ok(opened.f("hash") == c.f("hash") && FoodBlock.headerSignedBy(copy, public(signer)), "a copy sealed here opens and its header verifies")
        // And a value sealed here opens, in every suite.
        for (suite in listOf("std", "p256", "sm")) {
            val pair = FoodBlock.generateEncryptionKeypair(suite)
            val value = buildJsonObject { put("kind", "eggs") }
            r.ok(FoodBlock.open(FoodBlock.seal(value, listOf(pair.f("public_key_encrypt").s()), suite), pair.f("x25519_private").s()) == value,
                "a value sealed here opens with its key ($suite)")
        }
        r.done()
    }

    @Test fun identities() {
        val r = Report("identities")
        for (c in v.f("identities").arr()) {
            val held = blocksOf(c.f("blocks"))
            val arrivals = arrivalsOf(c.f("arrivals"))
            val name = c.f("name").s()
            val id = c.f("id").s()
            for (b in held) {
                val want = c.f("signed_by_author").f(b.f("hash").s())
                if (want is JsonNull) continue
                val label = c.f("blocks").arr().firstOrNull { it.f("hash") == b.f("hash") }.f("name").s()
                r.ok(Identity.signedByAuthor(b, held, arrivals) == want.bool(), "$name: $label ${if (want.bool()) "stands" else "is void"}")
            }
            if (c.f("keys") !is JsonNull) {
                val got = Identity.keysOf(id, held, arrivals).sorted()
                r.ok(texts(got) == c.f("keys"), "$name: the keys that speak") { got.toString() }
            }
            if (c.f("frozen") !is JsonNull) {
                val got = Identity.keyTimeline(id, held).filter { it.frozen }.map { it.key }.sorted()
                r.ok(texts(got) == c.f("frozen"), "$name: the frozen keys")
            }
            if (c.f("operators") !is JsonNull) r.ok(texts(Grant.operatorsOf(id, held)) == c.f("operators"), "$name: its operators")
            run {
                val state = Identity.identityState(id, held, arrivals)
                val signed = state.f("signed_by_author").o()
                val ok = deepEq(state.f("keys"), c.f("keys")) && (c.f("frozen") is JsonNull || deepEq(state.f("frozen"), c.f("frozen"))) &&
                    (c.f("signed_by_author") as? JsonObject)?.all { (h, want) -> signed[h]?.let { it == want } ?: true } ?: true
                r.ok(ok, "$name: the identity fold (signed_by_author, keys, frozen)") { state.toString() }
            }
            (c.f("fence") as? JsonObject)?.let { f ->
                val limit = find(held, f.f("block"))
                val grant = find(held, f.f("grant"))
                val lstate = limit.f("state").o()
                r.ok(limit.f("refs").f("for") == f.f("grant") && lstate.f("kind").s() == "limit" && deepEq(lstate.f("limit"), f.f("limit")) &&
                    FoodBlock.findsSelf(limit, f.f("agent").s(), f.f("salt").s()) && !FoodBlock.findsSelf(limit, f.f("principal").s(), f.f("salt").s()) &&
                    lstate.f("audience").arr().size == 1, "$name: sealed to the agent alone")
                val without = held.filter { it != limit }
                r.ok(grant.f("state").f("scope").o()["limit"] == null && (c.f("under") as? JsonObject)!!.keys.all { h ->
                    Grant.whyNotUnder(find(held, JsonPrimitive(h)), held) == Grant.whyNotUnder(find(held, JsonPrimitive(h)), without)
                }, "$name: the grant check never reads the limit")
                r.ok(f.f("within").arr().all { w -> Grant.withinLimit(limit, w.f("money").o(), w.f("spent").jsonPrimitive.content.toLong()) == w.f("within").bool() },
                    "$name: the principal's node checks the limit (withinLimit)")
            }
            (c.f("under") as? JsonObject)?.forEach { (h, ok) ->
                r.ok(Grant.whyNotUnder(find(held, JsonPrimitive(h)), held).isEmpty() == ok.bool(), "$name: a block under the grant speaks for its grantor")
            }
        }
        r.done()
    }

    private fun stageOf(c: JsonElement): JsonObject {
        val held = blocksOf(c.f("blocks"))
        return Fold.promiseStage(find(held, c.f("first")), held)
    }

    @Test fun promiseFolds() {
        if (!edge) return excluded("promise fold", "edge")
        val r = Report("promise fold")
        for (c in v.f("deals").arr() + v.f("folds").f("promises").arr()) {
            val got = stageOf(c)
            r.ok(subset(got, c.f("expected")), "${c.f("name").s()}: ${c.f("expected").f("stage").s()}") { got.toString() }
        }
        r.done()
    }

    @Test fun circleFolds() {
        if (!edge) return excluded("circle fold", "edge")
        val r = Report("circle fold")
        for (c in v.f("circles").arr() + v.f("folds").f("circles").arr()) {
            val held = blocksOf(c.f("blocks"))
            val circle = c.f("circle").s()
            val state = Fold.circleState(circle, held, null) ?: fail("no circle $circle")
            val membersOf = state.f("members").o()
            val members: JsonElement = if (c.f("expected").f("members") is JsonArray) texts(membersOf.keys.sorted())
                else JsonObject(membersOf.mapValues { (_, m) -> texts(m.f("roles").arr().map { it.s() }.sorted()) })
            val removed = texts(state.f("removed").o().keys.sorted())
            val mayAct = (c.f("may_act") as? JsonObject)?.all { (h, ok) -> Fold.mayActAs(find(held, JsonPrimitive(h)), circle, held) == ok.bool() } ?: true
            r.ok(deepEq(members, c.f("expected").f("members")) && removed == c.f("expected").f("removed") && mayAct &&
                (c.f("expected").f("counted_to") as? JsonObject)?.all { (who, h) -> state.f("removed").o()[who] == h } ?: true, c.f("name").s()) { state.toString() }
        }
        r.done()
    }

    @Test fun audienceFolds() {
        if (!edge) return excluded("audience fold", "edge")
        val r = Report("audience fold")
        for (c in v.f("folds").f("audience").arr()) {
            val held = blocksOf(c.f("blocks"))
            for (case in c.f("cases").arr()) {
                val got = Fold.membersThen(find(held, case.f("block")), case.f("recipient").s(), held)
                r.ok(texts(got) == case.f("members"), case.f("name").s()) { got.toString() }
            }
        }
        r.done()
    }

    @Test fun thingsWhereAndOwner() {
        if (!edge) return excluded("thing fold", "edge")
        val r = Report("thing fold")
        for (c in v.f("folds").f("things").arr()) {
            val held = blocksOf(c.f("blocks"))
            for (case in c.f("where").arr()) {
                val got = Fold.whereNow(find(held, case.f("thing")), held)
                r.ok(texts(got) == case.f("places"), "where now: ${case.f("name").s()}") { got.toString() }
            }
            for (case in c.f("owners").arr()) {
                val got = Fold.ownership(find(held, case.f("thing")), held)
                val owner: JsonElement = got.owner?.let(::JsonPrimitive) ?: JsonNull
                val conflict: JsonElement = got.conflict?.let(::texts) ?: JsonNull
                r.ok(owner == case.f("owner") && conflict == case.f("conflict"), "owner: ${case.f("name").s()}") { got.toString() }
            }
        }
        r.done()
    }

    @Test fun successors() {
        if (!edge) return excluded("successor fold", "edge")
        val r = Report("successor fold")
        for (c in v.f("folds").f("successors").arr()) {
            val held = blocksOf(c.f("blocks"))
            val got = Fold.successorView(find(held, c.f("grant")), held, c.f("now").s().ifEmpty { null }, arrivalsOf(c.f("arrivals")) ?: emptyMap())
            r.ok(subset(got, c.f("expected")), c.f("name").s()) { got.toString() }
        }
        r.done()
    }

    @Test fun ballotsAndRekeys() {
        if (!edge) return excluded("ballot and rekey folds", "edge")
        val r = Report("ballot and rekey folds")
        for (c in v.f("folds").f("ballots").arr()) {
            val held = blocksOf(c.f("blocks"))
            for (case in c.f("cases").arr()) {
                r.ok(Fold.countedIn(find(held, case.f("result")), case.f("commitment").s(), case.f("counter").s()) == case.f("counted").bool(), "ballot: ${case.f("name").s()}")
            }
        }
        for (c in v.f("folds").f("rekeys").arr()) {
            val got = Fold.circleKey(c.f("circle").s(), blocksOf(c.f("blocks")))
            r.ok(subset(got, c.f("expected")), "circle key: ${c.f("name").s()}") { got.toString() }
        }
        r.done()
    }

    @Test fun refusals() {
        val r = Report("refusals")
        val known = LinkedHashMap<String, JsonObject>()
        (blocksOf(v.f("refusals").f("blocks")) + stories().flatMap { blocksOf(it.third) }).forEach { known.putIfAbsent(it.f("hash").s(), it) }
        val get = { h: JsonElement -> known[h.s()] ?: fail("no block $h") }
        for (c in v.f("refusals").f("cases").arr()) {
            val name = "refused (${c.f("by").s()}): ${c.f("name").s()}"
            val held = c.f("held").arr().map(get)
            when (c.f("by").s()) {
                "check" -> {
                    // The codes exactly, as protocol.json orders them. The block goes to the door as written: a state that is a list stays a list.
                    val b = c.f("block").o()
                    val got = codesOf(FoodBlock.call("refusals", b.f("type"), b.f("state"), b.f("refs"), JsonArray(held), JsonNull).arr().map { it.f("code").s() })
                    r.ok(got == c.f("codes"), name) { got.toString() }
                }
                "valid" -> {
                    val got = codesOf(FoodBlock.valid(c.f("block").o(), held).map { it.code })
                    r.ok(got == c.f("codes"), name) { got.toString() }
                }
                "accept" -> if (!edge) excluded(name, "edge") else {
                    val incoming = if (c.f("inline") is JsonArray) c.f("inline").arr().map { it.o() } else c.f("incoming").arr().map(get)
                    val got = Sync.accept(incoming, held)
                    val refused = got.f("refused").arr()
                    val ok = when {
                        // The second of a pair is neither taken nor refused: it is listed in its pair.
                        c.f("equivocations") !is JsonNull -> got.f("taken") == c.f("taken") && refused.isEmpty() && got.f("equivocations") == c.f("equivocations")
                        c.f("waiting") !is JsonNull -> got.f("waiting").arr().map { it.f("hash") } == c.f("waiting").arr() && refused.isEmpty()
                        c.f("taken") !is JsonNull -> got.f("taken") == c.f("taken")
                        else -> incoming.all { b -> refused.any { it.f("hash") == b.f("hash") } } && codesOf(refused.map { it.f("code").s() }) == c.f("codes")
                    }
                    r.ok(ok, name) { got.toString() }
                }
                "fold" -> if (!edge) excluded(name, "edge") else {
                    val got = stageOf(c)
                    r.ok(subset(got, c.f("expected")), name) { got.toString() }
                }
                "may_act_as" -> {
                    val blocks = blocksOf(c.f("blocks"))
                    r.ok(Fold.mayActAs(find(blocks, c.f("block")), c.f("circle").s(), blocks) == c.f("ok").bool(), name)
                }
                "under" -> r.ok(Grant.whyNotUnder(get(c.f("block")), known.values.toList()).isEmpty() == c.f("live").bool(), name)
                "open" -> if (!node) excluded(name, "node") else {
                    val got = runCatching { FoodBlock.openCopy(c.f("message").o(), key(c.f("recipient").s(), "x25519_private")) }
                    val code = (got.exceptionOrNull() as? FoodBlockException)?.code
                    r.ok(got.isFailure && texts(listOfNotNull(code)) == c.f("codes"), name) { "${got.exceptionOrNull()?.message} code=$code" }
                }
                else -> r.ok(false, "$name: unknown refusal kind ${c.f("by").s()}")
            }
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
        r.ok(nodeKey in Identity.keysOf(nodeId, blocksOf(v.f("sealed").f("blocks"))), "the node key is a key of its holder, brought in by a key grant")
        val answer = m.f("pull_answer").f("message").o()
        r.ok(Sync.answerSignedBy(answer, listOf(nodeKey)) && answer.f("blocks").arr().size == m.f("pull_answer").f("matches").jsonPrimitive.content.toInt(),
            "a pull answer is signed by the node")
        val push = m.f("push_answer").f("message").o()
        r.ok(Sync.answerSignedBy(push, listOf(nodeKey)), "a push answer is signed by the node")
        val spec = load("spec/protocol.json").f("messages")
        val known = load("spec/protocol.json").f("refusals").f("codes").o().values.flatMap { it.o().keys }.toSet()
        r.ok(push.keys.toList() == spec.f("push_answer").arr().map { it.s() } &&
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
        val cases = v.f("door").arr()
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

    // Every section of spec/vectors.json is one this runner reads: a new section cannot pass unseen.
    @Test fun everySectionIsRun() {
        val read = setOf("\$comment", "comment", "keys", "hashes", "ledger", "canonical", "audience", "signatures", "bad_signatures", "envelopes", "identities",
            "deals", "circles", "folds", "refusals", "sealed", "headers", "messages", "cbor", "door")
        assertEquals(emptySet(), v.keys - read, "sections in spec/vectors.json this runner does not run")
        assertEquals(emptySet(), v.f("folds").o().keys - setOf("promises", "circles", "audience", "things", "successors", "rekeys", "ballots"))
    }
}
