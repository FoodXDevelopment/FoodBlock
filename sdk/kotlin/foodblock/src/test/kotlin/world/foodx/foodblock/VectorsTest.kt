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
 * Conformance: every section of spec/vectors.json, spec/canonical-vectors.json and test/vectors.json, run through
 * this library's Kotlin API (and so through the JNI door into the Rust core), the way spec/run-vectors.cjs runs the
 * reference SDK. A section this build's profile leaves out says so by name instead of passing silently.
 */
class VectorsTest {
    private companion object {
        val repo = File(System.getProperty("foodblock.repo") ?: "../../..")
        fun load(path: String): JsonElement = Json.parseToJsonElement(repo.resolve(path).readText())
        val v: JsonObject by lazy { load("spec/vectors.json").jsonObject }
        val has: Set<String> by lazy { FoodBlock.PROFILES.toSet() }
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

    /** `{ hash, ...block, signature }` for each vector block. */
    private fun blocksOf(list: JsonElement): List<JsonObject> = list.arr().map { b ->
        JsonObject(mapOf("hash" to b.f("hash")) + b.f("block").o() + mapOf("signature" to b.f("signature")))
    }
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
    /** Every key of `want` deep-equals the same key of `got`. */
    private fun subset(got: JsonElement, want: JsonElement) =
        want.o().all { (k, w) -> got.o()[k]?.let { deepEq(it, w) } ?: (w is JsonNull) }
    private fun strict(block: JsonElement) = FoodBlock.check(block.f("type").s(), block.f("state"), block.f("refs"))
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
        println("$what: excluded by this build's profile ($profile; this build: ${FoodBlock.PROFILES})")

    @Test fun versionMatchesProtocolJson() {
        val p = load("spec/protocol.json").o()
        assertEquals(p.f("version").s(), FoodBlock.VERSION)
        for (profile in FoodBlock.PROFILES) assertTrue(p.f("profiles").o().containsKey(profile), "$profile is a protocol.json profile")
        println("profiles in this build: ${FoodBlock.PROFILES}")
    }

    @Test fun canonical() {
        val r = Report("canonical")
        for (c in load("spec/canonical-vectors.json").f("vectors").arr()) {
            val b = c.f("block").o()
            val text = FoodBlock.canonical(b)
            val ok = (c.f("same_as") is JsonNull || FoodBlock.hash(b) == FoodBlock.hash(c.f("same_as").o())) &&
                (c.f("not_same_as") is JsonNull || FoodBlock.hash(b) != FoodBlock.hash(c.f("not_same_as").o())) &&
                (c.f("canonical_contains") is JsonNull || text.contains(c.f("canonical_contains").s()))
            r.ok(ok, c.f("name").s())
        }
        for (c in v.f("canonical").arr()) {
            val b = c.f("block").o()
            r.ok(FoodBlock.canonical(b) == c.f("canonical").s() && FoodBlock.hash(b) == c.f("hash").s(), c.f("name").s())
        }
        r.done()
    }

    @Test fun legacyCrossLanguageHashes() {
        val r = Report("test/vectors.json")
        for (c in load("test/vectors.json").arr()) {
            val text = FoodBlock.canonical(c.f("type").s(), c.f("state"), c.f("refs"))
            val hash = FoodBlock.hash(c.f("type").s(), c.f("state"), c.f("refs"))
            r.ok(text == c.f("expected_canonical").s() && hash == c.f("expected_hash").s(), c.f("name").s()) { "got $text" }
        }
        r.done()
    }

    @Test fun hashesWriteCheckAndReads() {
        val r = Report("hashes")
        for (c in v.f("hashes").arr()) {
            val b = c.f("block").o()
            val name = c.f("name").s()
            r.ok(FoodBlock.canonical(b) == c.f("canonical").s() && FoodBlock.hash(b) == c.f("hash").s(), "hash: $name")
            if (c.f("refused") is JsonNull) {
                val wrong = strict(b)
                r.ok(wrong.isEmpty(), "write check: $name") { wrong.joinToString("; ") }
                continue
            }
            r.ok(strict(b).isNotEmpty(), "strict check refuses it: $name")
        }
        r.done()
    }

    @Test fun chains() {
        val r = Report("chains")
        val hashes = v.f("hashes").arr()
        val authors = hashes.mapNotNull { (it.f("block").f("refs").f("author") as? JsonPrimitive)?.content }.distinct()
        for (id in authors) {
            val mine = hashes.filter { it.f("block").f("refs").f("author").s() == id }.map { withHash(it.f("block"), it.f("hash")) }
            r.ok(FoodBlock.checkChain(mine, id).ok, "${id.take(8)}'s ${mine.size} blocks, no gaps, no equivocation")
        }
        r.done()
    }

    @Test fun audience() {
        val r = Report("audience")
        for (c in v.f("audience").arr()) r.ok(FoodBlock.saltedHash(c.f("salt").s(), c.f("recipient").s()) == c.f("commitment").s(), c.f("name").s())
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
    private fun byHash(): Map<String, JsonObject> {
        val index = LinkedHashMap<String, JsonObject>()
        for (c in v.f("hashes").arr()) index[c.f("hash").s()] = c.f("block").o()
        for ((_, _, list) in stories()) for (b in list.arr()) index[b.f("hash").s()] = b.f("block").o()
        return index
    }

    @Test fun storiesHashVerifyAndCheck() {
        val r = Report("stories")
        for ((group, name, list) in stories()) {
            val wrong = mutableListOf<String>()
            for (b in list.arr()) {
                val block = b.f("block").o()
                if (FoodBlock.hash(block) != b.f("hash").s()) wrong += "${b.f("name").s()}: hash"
                if (!FoodBlock.verify(block, b.f("signature").s(), public(b.f("signer").s()))) wrong += "${b.f("name").s()}: signature"
                if (block.f("state").o().containsKey("seq")) {
                    val w = strict(block)
                    if (w.isNotEmpty()) wrong += "${b.f("name").s()}: ${w.joinToString("; ")}"
                }
            }
            r.ok(wrong.isEmpty(), "$group: $name: ${list.arr().size} blocks hash, verify and pass the write check") { wrong.joinToString(" | ") }
        }
        r.done()
    }

    @Test fun signaturesByteExactFromSeeds() {
        val r = Report("signatures")
        val index = byHash()
        for ((name, k) in v.f("keys").o()) {
            val seed = k.f("ed25519_seed").s().ifEmpty { null } ?: continue
            val pair = FoodBlock.keypairFromSeed(seed)
            val privateOk = k.f("private_key") is JsonNull || pair.privateKey == k.f("private_key").s()
            r.ok(pair.publicKeySign == k.f("public_key_sign").s() && privateOk, "key from seed: $name")
        }
        for (c in v.f("signatures").arr()) {
            val block = index.getValue(c.f("hash").s())
            val signer = c.f("signer").s()
            val ours = FoodBlock.sign(block, key(signer, "private_key"))
            r.ok(ours == c.f("signature").s() && FoodBlock.verify(block, ours, public(signer)), "signed byte for byte: ${c.f("name").s()}")
        }
        var count = 0
        val wrong = mutableListOf<String>()
        for ((_, _, list) in stories()) for (b in list.arr()) {
            val signer = b.f("signer").s()
            if (v.f("keys").f(signer).f("private_key") is JsonNull) continue
            count++
            if (FoodBlock.sign(b.f("block").o(), key(signer, "private_key")) != b.f("signature").s()) wrong += b.f("name").s()
        }
        r.ok(wrong.isEmpty(), "every story block's signature reproduced from its seed ($count)") { wrong.joinToString(", ") }
        for (c in v.f("bad_signatures").arr()) {
            val ok = index[c.f("hash").s()]?.let { FoodBlock.verify(it, c.f("signature").s(), public(c.f("signer").s())) } ?: false
            r.ok(!ok, "bad signature refused: ${c.f("name").s()}")
        }
        r.done()
    }

    @Test fun headers() {
        val r = Report("headers")
        val index = byHash()
        for (c in v.f("headers").arr()) {
            val block = withHash(index.getValue(c.f("hash").s()), c.f("hash"))
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
        // A copy sealed here opens with the reference rules, and its header is signed by the block's key.
        val c = v.f("signatures").arr()[0]
        val block = JsonObject(withHash(byHash().getValue(c.f("hash").s()), c.f("hash")) + ("signature" to c.f("signature")))
        val copy = FoodBlock.sealCopy(block, listOf(key("bob", "public_key_encrypt")), JsonArray(emptyList()), key(c.f("signer").s(), "private_key"))
        val opened = FoodBlock.openCopy(copy, key("bob", "x25519_private"))
        r.ok(opened.f("hash") == c.f("hash") && FoodBlock.headerSignedBy(copy, public(c.f("signer").s())), "a copy sealed here opens and its header verifies")
        // And a value sealed here opens.
        val pair = FoodBlock.generateEncryptionKeypair()
        val value = buildJsonObject { put("kind", "eggs") }
        r.ok(FoodBlock.open(FoodBlock.seal(value, listOf(pair.f("public_key_encrypt").s())), pair.f("x25519_private").s()) == value,
            "a value sealed here opens with its key")
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
            (c.f("under") as? JsonObject)?.forEach { (h, ok) ->
                r.ok(Grant.whyNotUnder(find(held, JsonPrimitive(h)), held).isEmpty() == ok.bool(), "$name: a block under the grant speaks for its grantor")
            }
        }
        r.done()
    }

    private fun stageOf(c: JsonElement): JsonObject {
        val held = blocksOf(c.f("blocks"))
        return Fold.promiseStage(find(held, c.f("first")), held, now = c.f("now").s().ifEmpty { null })
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
            val got = Fold.successorState(find(held, c.f("grant")), held, c.f("now").s().ifEmpty { null }, arrivalsOf(c.f("arrivals")) ?: emptyMap())
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
            when (c.f("by").s()) {
                "check" -> {
                    // The codes exactly, as protocol.json orders them: the code carries the meaning.
                    val got = codesOf(FoodBlock.refusals(c.f("block").o(), held = c.f("held").arr().map(get)).map { it.code })
                    r.ok(got == c.f("codes"), name) { got.toString() }
                }
                "accept" -> if (!edge) excluded(name, "edge") else {
                    val incoming = c.f("incoming").arr().map(get)
                    val got = Sync.accept(incoming, c.f("held").arr().map(get))
                    val refused = got.f("refused").arr()
                    val ok = if (c.f("equivocations") !is JsonNull) {
                        // The second of a pair is neither taken nor refused: it is listed in its pair.
                        got.f("taken") == c.f("taken") && refused.isEmpty() && got.f("equivocations") == c.f("equivocations")
                    } else {
                        incoming.all { b -> refused.any { it.f("hash") == b.f("hash") } } &&
                            codesOf(refused.map { it.f("code").s() }) == c.f("codes")
                    }
                    r.ok(ok, name) { got.toString() }
                }
                "fold" -> if (!edge) excluded(name, "edge") else {
                    val got = stageOf(c)
                    r.ok(subset(got, c.f("expected")), name) { got.toString() }
                }
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

    @Test fun aliasReads() {
        val r = Report("reads")
        for (c in v.f("reads").f("cases").arr()) {
            val b = c.f("block")
            val read = FoodBlock.readAs(FoodBlock.create(b.f("type").s(), b.f("state"), b.f("refs")))
            val got = LinkedHashMap<String, JsonElement>(mapOf("type" to read.f("type"), "state" to read.f("state"), "refs" to read.f("refs")))
            for (mark in listOf("settles", "outside")) if (truthy(read.f(mark))) got.put(mark, read.f(mark))
            if (truthy(read.f("retired"))) got.put("retired", JsonPrimitive(true))
            r.ok(deepEq(JsonObject(got), c.f("reads_as")), c.f("name").s()) { got.toString() }
        }
        r.done()
    }
    private fun codesOf(codes: List<String>) = texts(codes.distinct())
    private fun truthy(x: JsonElement): Boolean = when (x) {
        is JsonNull -> false
        is JsonPrimitive -> if (x.isString) x.content.isNotEmpty() else x.content !in setOf("false", "0", "0.0")
        else -> true
    }

    @Test fun messages() {
        if (!edge) return excluded("messages (pull, push, discovery)", "edge")
        val r = Report("messages")
        val m = v.f("messages")
        val nodeId = m.f("node").s()
        val nodeKey = public(m.f("node_signer").s())
        val pull = m.f("signed_pull")
        val keys = listOf(public(pull.f("signer").s()))
        fun fresh(seen: Set<String>, node: String, message: JsonObject) = Sync.pullErrors(message, Freshness(node, pull.f("now").s(), keys, seen))
        val nonce = pull.f("message").f("nonce").s()
        r.ok(fresh(emptySet(), nodeId, pull.f("message").o()).isEmpty(), "a signed pull names the node, a fresh nonce and at, and is signed by its signer")
        r.ok(fresh(setOf(nonce), nodeId, pull.f("message").o()).isNotEmpty(), "a signed pull replayed is refused")
        val other = JsonObject(pull.f("message").o() + ("node" to JsonPrimitive("0".repeat(64))))
        r.ok(fresh(emptySet(), nodeId, other).isNotEmpty(), "a signed pull for another node is refused")
        r.ok(nodeKey in Identity.keysOf(nodeId, blocksOf(v.f("sealed").f("blocks"))), "the node key is a key of its holder, brought in by a key grant")
        val answer = m.f("pull_answer").f("message").o()
        r.ok(Sync.answerSignedBy(answer, listOf(nodeKey)) && answer.f("blocks").arr().size == m.f("pull_answer").f("matches").jsonPrimitive.content.toInt(),
            "a pull answer is signed by the node")
        r.ok(answer.f("request").s() == FoodBlock.hashHex(FoodBlock.canonicalJson(pull.f("message"))), "a pull answer names its request by the hash of its canonical form")
        r.ok(Sync.answerSignedBy(m.f("push_answer").f("message").o(), listOf(nodeKey)), "a push answer is signed by the node")
        val changed = JsonObject(m.f("push_answer").f("message").o() + ("taken" to JsonArray(emptyList())))
        r.ok(!Sync.answerSignedBy(changed, listOf(nodeKey)), "a changed answer no longer verifies")
        r.ok(Sync.wellKnownErrors(m.f("discovery").o()).isEmpty() && deepEq(m.f("announcement"), Sync.announcement(m.f("discovery").o())),
            "discovery and its local announcement")
        r.done()
    }

    @Test fun compactForm() {
        val r = Report("cbor")
        val c = v.f("cbor")
        fun signed(case: JsonElement) = JsonObject(case.f("block").o() + mapOf("hash" to case.f("hash"), "signature" to case.f("signature")))
        for (case in c.f("cases").arr()) {
            val b = signed(case)
            r.ok(Cbor.hex(Cbor.encode(b)) == case.f("cbor").s() && Cbor.hex(Cbor.encode(b, true)) == case.f("cbor_short").s(), "writes deterministic bytes: ${case.f("name").s()}")
            r.ok(deepEq(Cbor.decode(Cbor.bytes(case.f("cbor").s())), b) && deepEq(Cbor.decode(Cbor.bytes(case.f("cbor_short").s())), b), "reads back to the block: ${case.f("name").s()}")
        }
        r.ok(Cbor.decode(Cbor.bytes(c.f("loose").f("cbor").s())).f("hash") == c.f("loose").f("hash"), "any well-formed encoding of the same content is accepted")
        for (x in c.f("refused").arr()) r.ok(runCatching { Cbor.decode(Cbor.bytes(x.f("cbor").s())) }.isFailure, "refused: ${x.f("name").s()}")
        r.done()
    }
}
