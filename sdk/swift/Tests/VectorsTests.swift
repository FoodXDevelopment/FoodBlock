import XCTest
@testable import FoodBlock

/// Conformance: every section of spec/vectors.json, spec/canonical-vectors.json and test/vectors.json, run exactly as
/// spec/run-vectors.cjs runs them against the reference SDK. No section is skipped; a section the file lacks fails.

let repoRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../..").standardized
func repoFile(_ parts: String...) -> URL { parts.reduce(repoRoot) { $0.appendingPathComponent($1) } }
func loadJSON(_ parts: String...) -> Any { try! JSONSerialization.jsonObject(with: Data(contentsOf: parts.reduce(repoRoot) { $0.appendingPathComponent($1) }), options: [.fragmentsAllowed]) }

let V = loadJSON("spec", "vectors.json") as! JSON
let vkeys = V["keys"] as! [String: JSON]
func pub(_ signer: Any?) -> String { vkeys[signer as! String]!["public_key_sign"] as! String }
func x25519(_ who: Any?) -> String { vkeys[who as! String]!["x25519_private"] as! String }
func arr(_ v: Any?) -> [JSON] { (v as? [Any] ?? []).compactMap { $0 as? JSON } }
func section(_ path: String) -> [JSON] {
    let found = dig(V, path)
    XCTAssertNotNil(found, "spec/vectors.json has no section \(path)")
    return arr(found)
}
/// A story's blocks as a reader holds them: { hash, type, state, refs, signature }.
func blocksOf(_ list: [JSON]) -> [JSON] {
    list.map { v in var b = v["block"] as! JSON; b["hash"] = v["hash"]; b["signature"] = v["signature"]; return b }
}
func find(_ held: [JSON], _ hash: Any?) -> JSON { held.first { $0["hash"] as? String == hash as? String }! }
/// Every key of `want` equals the same key of `got`.
func subset(_ got: JSON, _ want: JSON) -> Bool { want.allSatisfy { sameJSON(got[$0.key], $0.value) } }
func strict(_ b: JSON) -> [String] { FoodBlock.check(b["type"] as! String, b["state"] as? JSON ?? [:], b["refs"] as? JSON ?? [:]) }
/// The codes a refusal list carries, once each, in protocol.json's order.
func codesOf(_ list: [String?]) -> [String] { unique(list.map { $0 ?? "null" }) }
func codes(_ b: JSON, held: [String: JSON]? = nil) -> [String] {
    codesOf(FoodBlock.refusals(b["type"] as! String, b["state"] as? JSON ?? [:], b["refs"] as? JSON ?? [:], held: held).map { $0.code })
}
func arrivals(_ v: JSON) -> Identity.Arrival? {
    guard let a = v["arrivals"] as? [String: Any] else { return nil }
    return { a[$0] as? String }
}

final class VectorsTests: XCTestCase {
    var ran = 0
    func expect(_ ok: @autoclosure () throws -> Bool, _ name: String, file: StaticString = #filePath, line: UInt = #line) {
        ran += 1
        do { XCTAssertTrue(try ok(), name, file: file, line: line) } catch { XCTFail("\(name): \(error)", file: file, line: line) }
    }

    // ---- The canonical form ----
    func testCanonical() throws {
        let adversarial = arr((loadJSON("spec", "canonical-vectors.json") as! JSON)["vectors"])
        XCTAssertFalse(adversarial.isEmpty)
        for v in adversarial {
            let b = v["block"] as! JSON
            let h = try FoodBlock.hash(of: b), c = try FoodBlock.canonical(b["type"] as! String, b["state"] as! JSON, b["refs"] as! JSON)
            if let same = v["same_as"] as? JSON { expect(h == (try FoodBlock.hash(of: same)), "canonical: \(v["name"]!)") }
            if let other = v["not_same_as"] as? JSON { expect(h != (try FoodBlock.hash(of: other)), "canonical: \(v["name"]!)") }
            if let part = v["canonical_contains"] as? String { expect(c.contains(part), "canonical: \(v["name"]!)") }
        }
        for v in section("canonical") {
            let b = v["block"] as! JSON
            expect(try FoodBlock.canonical(b["type"] as! String, b["state"] as! JSON, b["refs"] as! JSON) == v["canonical"] as! String && FoodBlock.hash(of: b) == v["hash"] as! String, "canonical: \(v["name"]!)")
        }
    }

    /// canonical.md Rule 1: keys and refs string arrays sort by UTF-16 code units, as the JS reference does.
    func testUTF16Order() throws {
        let state: JSON = ["\u{1F35E}": 1, "\u{FF61}": 2, "a": 3]
        let refs: JSON = ["\u{1F35E}": "x", "\u{FF61}": "y", "sees": ["\u{1F35E} bread", "\u{FF61} dot", "a"]]
        XCTAssertEqual(try FoodBlock.canonical("t.a", state, refs),
                       "{\"refs\":{\"sees\":[\"a\",\"\u{1F35E} bread\",\"\u{FF61} dot\"],\"\u{1F35E}\":\"x\",\"\u{FF61}\":\"y\"},\"state\":{\"a\":3,\"\u{1F35E}\":1,\"\u{FF61}\":2},\"type\":\"t.a\"}")
        XCTAssertEqual(try FoodBlock.hash("t.a", state, refs), "7ae546cb1398d598d07c4e7873a9547775b5fb7eb53ea7b3e739215a32bb630f")
    }

    // ---- Hashes and the write check; a block in the draft-1.6 words is refused and reads as its 1.6 form ----
    func testHashes() throws {
        for v in section("hashes") {
            let b = v["block"] as! JSON, name = v["name"] as! String
            expect(try FoodBlock.canonical(b["type"] as! String, b["state"] as! JSON, b["refs"] as! JSON) == v["canonical"] as! String && FoodBlock.hash(of: b) == v["hash"] as! String, "hash: \(name)")
            if !truthy(v["draft_words"]) { let wrong = strict(b); expect(wrong.isEmpty, "write check: \(name): \(wrong)"); continue }
            expect(sameJSON(codes(b), v["draft_words"]), "strict check refuses the draft words, with its codes: \(name) (got \(codes(b)))")
            var held = b; held["hash"] = v["hash"]
            let read = FoodBlock.readAs(held)
            expect(sameJSON(["type": read["type"]!, "state": read["state"]!, "refs": read["refs"]!] as JSON, v["reads_as"]), "reads as 1.6: \(name)")
        }
    }

    // Each author's blocks form one key chain: seq 1, 2, 3, each prev the block before, the first after the genesis.
    func testChains() {
        let hashes = section("hashes")
        let authors = unique(hashes.compactMap { dig($0, "block.refs.author") as? String })
        XCTAssertFalse(authors.isEmpty)
        for id in authors {
            let mine = hashes.filter { dig($0, "block.refs.author") as? String == id }.map { v -> JSON in var b = v["block"] as! JSON; b["hash"] = v["hash"]; return b }
            expect(FoodBlock.checkChain(mine, id).ok, "chain: \(id.prefix(8))'s \(mine.count) blocks, no gaps, no equivocation")
        }
    }

    func testAudience() {
        for v in section("audience") { expect(FoodBlock.saltedHash(v["salt"] as! String, v["recipient"] as! String) == v["commitment"] as! String, "audience: \(v["name"]!)") }
    }

    func testKeys() throws {
        for (name, k) in vkeys {
            if let seed = k["ed25519_seed"] as? String {
                let kp = try FoodBlock.keypairFromSeed(seed)
                expect(kp.publicKeySign == k["public_key_sign"] as? String, "key: \(name) from its seed")
                if let p = k["private_key"] as? String { expect(kp.privateKey == p, "key: \(name)'s private key") }
            }
            if let x = k["x25519_private"] as? String { expect(try FoodBlock.encryptionKeyOf(x) == k["public_key_encrypt"] as? String, "key: \(name)'s encryption key") }
            if let h = k["hash"] as? String { expect(Identity.recoveryKeyHash(k["public_key_sign"] as! String) == h, "key: \(name)'s recovery hash") }
        }
    }

    // Every signed block in every story: its hash, its signature, and (for a 1.6 block) the strict write check.
    static func stories() -> [(group: String, name: String, blocks: [JSON])] {
        func named(_ group: String, _ path: String) -> [(String, String, [JSON])] { arr(dig(V, path)).map { (group, $0["name"] as? String ?? "", arr($0["blocks"])) } }
        let refusals = V["refusals"] as! JSON
        var out: [(group: String, name: String, blocks: [JSON])] = []
        for (group, path) in [("identity", "identities"), ("deal", "deals"), ("circle", "circles"), ("promise fold", "folds.promises"), ("circle fold", "folds.circles"),
                              ("audience fold", "folds.audience"), ("thing fold", "folds.things"), ("successor fold", "folds.successors"), ("rekey fold", "folds.rekeys"),
                              ("ballot fold", "folds.ballots")] { out += named(group, path) }
        out.append(("refusal", "stories", arr(refusals["blocks"])))
        for c in arr(refusals["cases"]) where c["blocks"] != nil { out.append(("refusal", c["name"] as? String ?? "", arr(c["blocks"]))) }
        out.append(("sealed", "stories", arr(dig(V, "sealed.blocks"))))
        out += named("draft words", "reads.groups")
        return out
    }
    static func byHash() -> [String: JSON] {
        var out: [String: JSON] = [:]
        for v in arr(V["hashes"]) { out[v["hash"] as! String] = v["block"] as? JSON }
        for s in stories() { for b in s.blocks { out[b["hash"] as! String] = b["block"] as? JSON } }
        return out
    }

    func testStories() throws {
        let all = Self.stories()
        XCTAssertGreaterThan(all.count, 10)
        for s in all {
            var wrong: [String] = []
            for b in s.blocks {
                let block = b["block"] as! JSON, name = b["name"] as? String ?? ""
                if try FoodBlock.hash(of: block) != b["hash"] as? String { wrong.append("\(name): hash") }
                if !FoodBlock.verify(block, b["signature"], pub(b["signer"])) { wrong.append("\(name): signature") }
                if s.group != "draft words" && dig(block, "state.seq") != nil && !strict(block).isEmpty { wrong.append("\(name): \(strict(block).joined(separator: "; "))") }
            }
            expect(wrong.isEmpty, "\(s.group): \(s.name): \(s.blocks.count) blocks hash, verify and pass the write check \(wrong)")
        }
    }

    // CryptoKit's Ed25519 signatures are randomized, so the vectors' signatures are verified, not reproduced byte for
    // byte; a fresh signature by the same key verifies too.
    func testSignatures() throws {
        let byHash = Self.byHash()
        func opens(_ v: JSON) -> Bool { byHash[v["hash"] as! String].map { FoodBlock.verify($0, v["signature"], pub(v["signer"])) } ?? false }
        for v in section("signatures") {
            expect(opens(v), "signature: \(v["name"]!)")
            if let p = vkeys[v["signer"] as! String]?["private_key"] as? String, let block = byHash[v["hash"] as! String] {
                expect(FoodBlock.verify(block, try FoodBlock.sign(block, privateKey: p), pub(v["signer"])), "signature: \(v["name"]!): signed again, it verifies")
            }
        }
        for v in section("bad_signatures") { expect(!opens(v), "bad signature refused: \(v["name"]!)") }
    }

    // Envelopes: the older ones (key_hash ignored), and sealed copies with their signed public header.
    func testEnvelopes() throws {
        for v in section("envelopes") {
            let m = try FoodBlock.unwrap(FoodBlock.open(v["envelope"] as! JSON, x25519(v["recipient"])) as! JSON)
            let want = v["opens_to"] as! JSON
            expect(m["hash"] as? String == want["hash"] as? String && m["signature"] as? String == want["signature"] as? String && m["version"] as? String == want["version"] as? String, "envelope: \(v["name"]!)")
        }
        for v in section("sealed.cases") {
            let m = try FoodBlock.openCopy(v["message"] as! JSON, x25519(v["recipient"]))
            let want = v["opens_to"] as! JSON
            expect(m["hash"] as? String == want["hash"] as? String && m["signature"] as? String == want["signature"] as? String && sameJSON(m["reveals"], want["reveals"])
                   && FoodBlock.headerSignedBy(v["message"] as! JSON, pub(v["signer"])), "sealed: \(v["name"]!)")
        }
        let byHash = Self.byHash()
        for v in section("headers") {
            var b = byHash[v["hash"] as! String]!; b["hash"] = v["hash"]
            var top = v["header"] as! JSON; top["signature"] = v["header_signature"]
            expect(sameJSON(try FoodBlock.header(b), v["header"]) && FoodBlock.verifyMessage(top, pub(v["signer"])), "header: \(v["name"]!)")
        }
    }

    // Identities: which blocks are their author's, which keys speak, who operates an agent.
    func testIdentities() {
        for v in section("identities") {
            let held = blocksOf(arr(v["blocks"])), name = v["name"] as! String, arrived = arrivals(v)
            for (h, ok) in v["signed_by_author"] as? JSON ?? [:] {
                expect(Identity.signedByAuthor(find(held, h), held, arrivedAt: arrived) == truthy(ok), "identity: \(name): \(h.prefix(8)) \(truthy(ok) ? "stands" : "is void")")
            }
            if let keys = v["keys"] { expect(sameJSON(sortedJS(Identity.keysOf(v["id"] as! String, held, arrivedAt: arrived)), keys), "identity: \(name): the keys that speak") }
            if let frozen = v["frozen"] { expect(sameJSON(sortedJS(Identity.keyTimeline(v["id"] as! String, held).filter { $0.frozen }.map { $0.key }), frozen), "identity: \(name): the frozen keys") }
            if let ops = v["operators"] { expect(sameJSON(Grant.operatorsOf(v["id"] as! String, held), ops), "identity: \(name): its operators") }
            if let history = v["history"] as? String {
                let state = Identity.identityState(v["id"] as! String, held, arrivedAt: arrived)
                let signed = state["signed_by_author"] as! JSON
                expect(state["history"] as? String == history && sameJSON(state["keys"], v["keys"]) && (v["frozen"] == nil || sameJSON(state["frozen"], v["frozen"]))
                       && (v["signed_by_author"] as? JSON ?? [:]).allSatisfy { h, ok in signed[h].map { truthy($0) == truthy(ok) && isBool($0) } ?? false },
                       "identity: \(name): the identity fold (signed_by_author, keys, frozen, history) (got \(stableJSON(state)))")
            }
            for (h, ok) in v["under"] as? JSON ?? [:] { expect(Grant.whyNotUnder(find(held, h), held).isEmpty == truthy(ok), "identity: \(name): a block under the grant speaks for its grantor") }
        }
    }

    static func stageOf(_ v: JSON) -> JSON {
        let held = blocksOf(arr(v["blocks"]))
        return Fold.promiseStage(find(held, v["first"]), held, now: v["now"] as? String)
    }

    func testPromiseFolds() {
        let all = section("deals") + section("folds.promises")
        XCTAssertFalse(all.isEmpty)
        for v in all {
            let got = Self.stageOf(v)
            expect(subset(got, v["expected"] as! JSON), "promise fold: \(v["name"]!): \(dig(v, "expected.stage")!) (got \(stableJSON(got)))")
        }
    }

    func testCircleFolds() {
        for v in section("circles") + section("folds.circles") {
            let held = blocksOf(arr(v["blocks"])), circle = v["circle"] as! String, want = v["expected"] as! JSON
            let state = Fold.circleState(circle, held)!
            let members: Any = want["members"] is [Any] ? sortedJS(Array(state.members.keys)) as Any
                : state.members.mapValues { sortedJS($0.roles) } as Any
            let mayAct = (v["may_act"] as? JSON ?? [:]).allSatisfy { h, ok in Fold.mayActAs(find(held, h), circle, held) == truthy(ok) }
            expect(sameJSON(members, want["members"]) && sameJSON(sortedJS(Array(state.removed.keys)), want["removed"]) && mayAct, "circle fold: \(v["name"]!)")
        }
    }

    func testAudienceFolds() {
        for v in section("folds.audience") {
            let held = blocksOf(arr(v["blocks"]))
            for c in arr(v["cases"]) { expect(sameJSON(Fold.membersThen(find(held, c["block"]), c["recipient"] as! String, held), c["members"]), "audience fold: \(c["name"]!)") }
        }
    }

    func testThingFolds() {
        for v in section("folds.things") {
            let held = blocksOf(arr(v["blocks"]))
            for c in arr(v["where"]) { expect(sameJSON(Fold.whereNow(find(held, c["thing"]), held), c["places"]), "where now: \(c["name"]!)") }
            for c in arr(v["owners"]) {
                let got = Fold.ownership(find(held, c["thing"]), held)
                expect(sameJSON(got.owner ?? NSNull(), c["owner"] ?? NSNull()) && sameJSON(got.conflict ?? NSNull(), c["conflict"] ?? NSNull()), "owner: \(c["name"]!)")
            }
        }
    }

    func testSuccessorsBallotsRekeys() {
        for v in section("folds.successors") {
            let held = blocksOf(arr(v["blocks"]))
            let got = Fold.successorState(find(held, v["grant"]), held, now: v["now"] as? String, arrivedAt: arrivals(v))
            expect(subset(got, v["expected"] as! JSON), "successor: \(v["name"]!) (got \(stableJSON(got)))")
        }
        for v in section("folds.ballots") {
            let held = blocksOf(arr(v["blocks"]))
            for c in arr(v["cases"]) { expect(Fold.countedIn(find(held, c["result"]), c["commitment"] as! String, c["counter"] as! String) == truthy(c["counted"]), "ballot: \(c["name"]!)") }
        }
        for v in section("folds.rekeys") {
            let got = Fold.circleKey(v["circle"] as! String, blocksOf(arr(v["blocks"])))
            expect(subset(got, v["expected"] as! JSON), "circle key: \(v["name"]!) (got \(stableJSON(got)))")
        }
    }

    // Refusals: what every node must refuse.
    func testRefusals() {
        var known: [String: JSON] = [:]
        for b in blocksOf(arr(dig(V, "refusals.blocks")) + Self.stories().flatMap { $0.blocks }) { known[b["hash"] as! String] = b }
        let cases = section("refusals.cases")
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let name = "refused (\(c["by"]!)): \(c["name"]!)"
            switch c["by"] as? String {
            case "check":
                let b = c["block"] as! JSON
                var held: [String: JSON] = [:]
                for h in c["held"] as? [String] ?? [] { held[h] = known[h] }
                expect(sameJSON(codes(b, held: held), c["codes"]), "\(name) (got \(codes(b, held: held)))")
            case "accept":
                let incoming = (c["incoming"] as! [String]).map { known[$0]! }, held = (c["held"] as! [String]).map { known[$0]! }
                let got = Sync.accept(incoming, held)
                // The second of a pair is neither taken nor refused: it is listed in its pair.
                if let pairs = c["equivocations"] {
                    expect(sameJSON(got.taken.map { $0["hash"]! }, c["taken"]) && got.refused.isEmpty && sameJSON(got.equivocations, pairs), name)
                } else {
                    expect((c["incoming"] as! [String]).allSatisfy { h in got.refused.contains { $0.hash == h } } && sameJSON(codesOf(got.refused.map { $0.code }), c["codes"]),
                           "\(name) (got \(codesOf(got.refused.map { $0.code })))")
                }
            case "fold": expect(subset(Self.stageOf(c), c["expected"] as! JSON), name)
            case "open":
                do { _ = try FoodBlock.openCopy(c["message"] as! JSON, x25519(c["recipient"])); expect(false, name) }
                catch let error as FoodBlockError { expect(sameJSON([error.code ?? "null"], c["codes"]), "\(name) (got \(error.code ?? "no code"))") }
                catch { expect(false, "\(name): \(error)") }
            default: XCTFail("\(name): a refusal this runner does not know")
            }
        }
    }

    // Alias reads: one per row, and the earlier deal and circle written in the draft words.
    func testReads() throws {
        func marks(_ read: JSON) -> JSON {
            var out: JSON = ["type": read["type"]!, "state": read["state"]!, "refs": read["refs"]!]
            if truthy(read["settles"]) { out["settles"] = read["settles"] }
            if truthy(read["outside"]) { out["outside"] = read["outside"] }
            if truthy(read["retired"]) { out["retired"] = true }
            return out
        }
        let cases = section("reads.cases")
        XCTAssertFalse(cases.isEmpty)
        for v in cases {
            let b = v["block"] as! JSON
            let read = FoodBlock.readAs(try FoodBlock.create(b["type"] as! String, b["state"] as? JSON ?? [:], b["refs"] as? JSON ?? [:]))
            expect(sameJSON(marks(read), v["reads_as"]), "reads: \(v["name"]!) (got \(stableJSON(marks(read))))")
        }
        for g in section("reads.groups") {
            for b in arr(g["blocks"]) {
                var held = b["block"] as! JSON; held["hash"] = b["hash"]
                let read = FoodBlock.readAs(held)
                expect(sameJSON(["type": read["type"]!, "state": read["state"]!, "refs": read["refs"]!] as JSON, b["reads_as"]) && read["hash"] as? String == b["hash"] as? String, "reads: \(g["name"]!): \(b["name"]!)")
            }
            if let end = g["older_end"] as? JSON {
                let read = FoodBlock.readAs(end["block"] as! JSON), want = end["reads_as"] as! JSON
                expect(read["type"] as? String == want["type"] as? String && sameJSON(dig(read, "state.status"), want["status"]) && sameJSON(dig(read, "state.stop"), want["stop"])
                       && sameJSON(dig(read, "refs.updates"), want["updates"]), "reads: an older end (defeats) reads as an updates with status stopped")
            }
        }
    }

    // Messages between nodes: every answer signed by the node.
    func testMessages() {
        let M = V["messages"] as! JSON, node = M["node"] as! String, nodeKey = pub(M["node_signer"])
        let sp = M["signed_pull"] as! JSON, msg = sp["message"] as! JSON, now = sp["now"] as! String, keys = [pub(sp["signer"])]
        expect(Sync.pullErrors(msg, node: node, now: now, keys: keys).isEmpty, "message: a signed pull names the node, a fresh nonce and at, and is signed by its asker")
        expect(!Sync.pullErrors(msg, node: node, now: now, keys: keys, seen: { _ in true }).isEmpty, "message: a signed pull replayed is refused")
        var other = msg; other["node"] = String(repeating: "0", count: 64)
        expect(!Sync.pullErrors(other, node: node, now: now, keys: keys).isEmpty, "message: a signed pull for another node is refused")
        expect(Identity.keysOf(node, blocksOf(arr(dig(V, "sealed.blocks")))).contains(nodeKey), "message: the node key is a key of its holder, brought in by a key grant")
        let pa = M["pull_answer"] as! JSON, answer = pa["message"] as! JSON
        expect(Sync.answerSignedBy(answer, [nodeKey]) && (answer["blocks"] as! [Any]).count == intOf(pa["matches"]), "message: a pull answer is signed by the node")
        let push = dig(M, "push_answer.message") as! JSON
        expect(Sync.answerSignedBy(push, [nodeKey]), "message: a push answer is signed by the node")
        // Every key is always there; each refusal is { hash, code, detail } with a code from protocol.json; each pair sorted.
        let known = Set(FoodBlock.refusalCodes.values.flatMap { $0 })
        let refused = push["refused"] as! [JSON], pairs = push["equivocations"] as! [[String]]
        expect(Set(push.keys) == Set(FoodBlock.message("push_answer")) && refused.allSatisfy { Set($0.keys) == Set(FoodBlock.message("refusal")) && known.contains($0["code"] as? String ?? "") }
               && pairs.allSatisfy { $0 == sortedJS($0) }, "message: a push answer carries every key, refusals as { hash, code, detail }, equivocations as sorted pairs")
        // Rebuilt from its parts by the node's key, it is the same message (byte for byte but the signature, which
        // CryptoKit randomizes: the new signature verifies).
        let rebuilt = try! Sync.pushAnswer(taken: push["taken"] as! [String], waiting: push["waiting"] as! [String],
                                           refused: refused.map { Sync.Refusal(hash: $0["hash"] as! String, code: $0["code"] as? String, detail: $0["detail"] as? String) },
                                           equivocations: pairs, node: push["node"] as! String, privateKey: vkeys[M["node_signer"] as! String]!["private_key"] as! String)
        var bare = push, again = rebuilt
        bare.removeValue(forKey: "signature"); again.removeValue(forKey: "signature")
        expect(try FoodBlock.canonicalJSON(again) == FoodBlock.canonicalJSON(bare) && Sync.answerSignedBy(rebuilt, [nodeKey]), "message: the push answer rebuilds byte for byte")
        var changed = push; changed["taken"] = [Any]()
        expect(!Sync.answerSignedBy(changed, [nodeKey]), "message: a changed answer no longer verifies")
        let doc = M["discovery"] as! JSON
        expect(Sync.wellKnownErrors(doc).isEmpty && sameJSON(Sync.announcement(doc), M["announcement"]), "message: discovery and its local announcement")
    }

    // Every section of spec/vectors.json is one this runner reads: a new section cannot pass unseen.
    func testEverySectionIsRun() {
        let read: Set<String> = ["$comment", "comment", "keys", "hashes", "canonical", "audience", "signatures", "bad_signatures", "envelopes", "identities", "deals", "circles",
                                 "folds", "refusals", "reads", "sealed", "headers", "messages"]
        XCTAssertEqual(Set(V.keys).subtracting(read), [], "sections in spec/vectors.json this runner does not run")
        XCTAssertEqual(Set((V["folds"] as! JSON).keys).subtracting(["promises", "circles", "audience", "things", "successors", "rekeys", "ballots"]), [])
    }

    // ---- test/vectors.json: the older cross-language vectors ----
    func testOlderVectors() throws {
        let older = loadJSON("test", "vectors.json") as! [Any]
        XCTAssertFalse(older.isEmpty)
        for case let v as JSON in older {
            let type = v["type"] as! String, state = v["state"] as! JSON, refs = v["refs"] as! JSON, name = v["name"] as! String
            expect(try FoodBlock.canonical(type, state, refs) == v["expected_canonical"] as! String, "older canonical: \(name)")
            expect(try FoodBlock.hash(type, state, refs) == v["expected_hash"] as! String, "older hash: \(name)")
            if v["section"] as? String == "legacy-read" { expect(!FoodBlock.check(type, state, refs).isEmpty, "older shape refused on write: \(name)") }
        }
    }

    // ---- The core carries spec/ exactly ----
    func testCoreCarriesTheSpec() throws {
        for (name, mine) in [("protocol", FoodBlock.spec), ("aliases", FoodBlock.aliases)] {
            XCTAssertTrue(sameJSON(mine, loadJSON("spec", "\(name).json")), "the core's built-in \(name).json differs from spec/")
        }
    }
}
