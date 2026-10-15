import XCTest
@testable import FoodBlock

/// Conformance: every section of spec/vectors.json (and spec/canonical-vectors.json), run exactly as spec/run-vectors.cjs
/// runs them against the reference SDK. No section is skipped; a section the file lacks fails.

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
/// A story's block as a reader holds it: { hash, type, state, refs, signature } and `suite` when it is not std.
func full(_ v: JSON) -> JSON {
    var b = v["block"] as! JSON; b["hash"] = v["hash"]; b["signature"] = v["signature"]
    if let s = v["suite"] { b["suite"] = s }
    return b
}
func blocksOf(_ list: [JSON]) -> [JSON] { list.map(full) }
func find(_ held: [JSON], _ hash: Any?) -> JSON { held.first { $0["hash"] as? String == hash as? String }! }
/// The door's subset match: every key given must match, arrays of the same length elementwise, anything else equal.
func subset(_ got: Any?, _ want: Any?) -> Bool {
    if let w = want as? [Any] { guard let g = got as? [Any], g.count == w.count else { return false }; return zip(g, w).allSatisfy { subset($0, $1) } }
    if let w = want as? JSON { guard let g = got as? JSON else { return false }; return w.allSatisfy { subset(g[$0.key], $0.value) } }
    return sameJSON(got, want)
}
func strict(_ b: JSON) -> [String] { FoodBlock.check(b["type"] as! String, b["state"] as? JSON ?? [:], b["refs"] as? JSON ?? [:]) }
/// The codes a refusal list carries, once each, in protocol.json's order.
func codesOf(_ list: [String?]) -> [String] { unique(list.map { $0 ?? "null" }) }
func codes(_ b: JSON, held: [String: JSON]? = nil) -> [String] {
    // The door takes state and refs as they are (a state that is a list must reach the check as a list).
    codesOf(FoodBlock.findings(Core.maybe("refusals", b["type"], b["state"], b["refs"], held.map { Array($0.values) } ?? [], nil)).map { $0.code })
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
    func suiteOf(_ v: JSON) -> String { v["suite"] as? String ?? "std" }

    // ---- The canonical form ----
    func testCanonical() throws {
        let adversarial = arr((loadJSON("spec", "canonical-vectors.json") as! JSON)["vectors"])
        XCTAssertFalse(adversarial.isEmpty)
        for v in adversarial {
            let b = v["block"] as! JSON
            func h(_ b: JSON) throws -> String { try FoodBlock.hash(b["type"] as! String, b["state"] as! JSON, b["refs"] as! JSON) }
            func c(_ b: JSON) throws -> String { try FoodBlock.canonical(b["type"] as! String, b["state"] as! JSON, b["refs"] as! JSON) }
            var ok = true
            if let same = v["same_as"] as? JSON, try h(b) != h(same) { ok = false }
            if let other = v["not_same_as"] as? JSON, try h(b) == h(other) { ok = false }
            if let part = v["canonical_contains"] as? String, !(try c(b)).contains(part) { ok = false }
            if let want = v["canonical"] as? String, try c(b) != want { ok = false }
            if let want = v["refused"] as? [String], !want.allSatisfy({ codes(b).contains($0) }) { ok = false }
            expect(ok, "canonical: \(v["name"]!)")
        }
        for v in section("canonical") {
            let b = v["block"] as! JSON
            expect(try FoodBlock.canonical(b["type"] as! String, b["state"] as! JSON, b["refs"] as! JSON) == v["canonical"] as! String && FoodBlock.hash(of: b) == v["hash"] as! String, "canonical: \(v["name"]!)")
        }
    }

    // test/vectors.json: the older cross-language cases that still hash identically under 1.6.
    func testOlderCanonicalVectors() throws {
        let older = loadJSON("test", "vectors.json") as! [Any]
        XCTAssertFalse(older.isEmpty)
        for case let v as JSON in older {
            let type = v["type"] as! String, state = v["state"] as! JSON, refs = v["refs"] as! JSON, name = v["name"] as! String
            expect(try FoodBlock.canonical(type, state, refs) == v["expected_canonical"] as! String && FoodBlock.hash(type, state, refs) == v["expected_hash"] as! String, "older canonical: \(name)")
        }
    }

    /// canonical.md Rule 1: keys sort by UTF-16 code units (a set is written sorted by its author, never re-sorted), as the JS reference does.
    func testUTF16Order() throws {
        let state: JSON = ["\u{1F35E}": 1, "\u{FF61}": 2, "a": 3]
        let refs: JSON = ["\u{1F35E}": "x", "\u{FF61}": "y", "after": ["a", "\u{1F35E} bread", "\u{FF61} dot"]]
        XCTAssertEqual(try FoodBlock.canonical("t.a", state, refs),
                       "{\"refs\":{\"after\":[\"a\",\"\u{1F35E} bread\",\"\u{FF61} dot\"],\"\u{1F35E}\":\"x\",\"\u{FF61}\":\"y\"},\"state\":{\"a\":3,\"\u{1F35E}\":1,\"\u{FF61}\":2},\"type\":\"t.a\"}")
    }

    // ---- Hashes (one block of every type), each valid against the blocks before it, one chain per author ----
    var ledger: [JSON] { arr(dig(V, "ledger.genesis")) + section("hashes") }
    func testHashesAndLedger() throws {
        var before: [JSON] = []
        for v in ledger {
            let b = v["block"] as! JSON, name = v["name"] as! String, block = full(v)
            if let c = v["canonical"] as? String {
                expect(try FoodBlock.canonical(b["type"] as! String, b["state"] as! JSON, b["refs"] as! JSON) == c && FoodBlock.hash(of: block) == v["hash"] as! String, "hash: \(name)")
            }
            expect(try FoodBlock.hash(of: block) == v["hash"] as! String && FoodBlock.verify(block, v["signature"], pub(v["signer"])), "ledger: \(name): hash and signature")
            let wrong = FoodBlock.valid(block, held: before)
            expect(wrong.isEmpty, "valid: \(name) \(wrong)")
            before.append(block)
        }
        let hashes = section("hashes")
        let authors = unique(hashes.compactMap { dig($0, "block.refs.author") as? String })
        XCTAssertFalse(authors.isEmpty)
        for id in authors {
            let mine = hashes.filter { dig($0, "block.refs.author") as? String == id }.map(full)
            expect(FoodBlock.checkChain(mine, id).ok, "chain: \(id.prefix(8))'s \(mine.count) blocks, no gaps, no equivocation")
        }
    }

    func testAudience() {
        for v in section("audience") { expect(FoodBlock.saltedHash(v["salt"] as! String, v["recipient"] as! String) == v["commitment"] as! String, "audience: \(v["name"]!)") }
    }

    // Keys rebuild from their seeds in their suites; the encryption key and the recovery hash follow.
    func testKeys() throws {
        for (name, k) in vkeys {
            let suite = k["suite"] as? String ?? "std"
            let kp = try FoodBlock.keypairFromSeed(k["seed"] as! String, suite: suite)
            expect(kp.publicKeySign == k["public_key_sign"] as? String && kp.privateKey == k["private_key"] as? String, "key: \(name) from its seed")
            expect(try FoodBlock.encryptionKeyOf(k["x25519_private"] as! String, suite: suite) == k["public_key_encrypt"] as? String, "key: \(name)'s encryption key")
            expect(FoodBlock.suiteOfKey(k["public_key_sign"] as! String) == suite, "key: \(name)'s suite")
            if let h = k["hash"] as? String { expect(Identity.recoveryKeyHash(k["public_key_sign"] as! String, suite: suite) == h, "key: \(name)'s recovery hash") }
        }
    }

    // Every signed block in every story: its hash and signature, its suite, and the strict check on its own bytes.
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
        return out
    }
    /// Every block the file shows, by hash, as the runner's `byHash`.
    static func byHash() -> [String: JSON] {
        var out: [String: JSON] = [:]
        for v in arr(dig(V, "ledger.genesis")) + arr(V["hashes"]) { out[v["hash"] as! String] = v }
        for s in stories() { for b in s.blocks { out[b["hash"] as! String] = b } }
        return out
    }

    func testStories() throws {
        let all = Self.stories()
        XCTAssertGreaterThan(all.count, 10)
        for s in all {
            var wrong: [String] = []
            for b in s.blocks {
                let block = b["block"] as! JSON, name = b["name"] as? String ?? ""
                if try FoodBlock.hash(block["type"] as! String, block["state"] as! JSON, block["refs"] as! JSON, suite: suiteOf(b)) != b["hash"] as? String { wrong.append("\(name): hash") }
                if !FoodBlock.verify(full(b), b["signature"], pub(b["signer"])) { wrong.append("\(name): signature") }
                if (vkeys[b["signer"] as! String]!["suite"] as? String ?? "std") != suiteOf(b) { wrong.append("\(name): suite") }
                let found = FoodBlock.refusals(block["type"] as! String, block["state"] as? JSON ?? [:], block["refs"] as? JSON ?? [:])
                if !found.isEmpty { wrong.append("\(name): \(found.map { $0.code }.joined(separator: ", "))") }
            }
            expect(wrong.isEmpty, "\(s.group): \(s.name): \(s.blocks.count) blocks hash, verify and pass the check \(wrong)")
        }
    }

    func testSignatures() throws {
        let byHash = Self.byHash()
        func opens(_ v: JSON) -> Bool { byHash[v["hash"] as! String].map { FoodBlock.verify(full($0), v["signature"], pub(v["signer"])) } ?? false }
        for v in section("signatures") {
            expect(opens(v), "signature: \(v["name"]!)")
            // Signing is deterministic in every suite: the same key gives the same signature.
            if let p = vkeys[v["signer"] as! String]?["private_key"] as? String, let b = byHash[v["hash"] as! String] {
                let signed = try FoodBlock.sign(full(b), privateKey: p, suite: vkeys[v["signer"] as! String]?["suite"] as? String ?? "std")
                expect(FoodBlock.verify(full(b), signed, pub(v["signer"])), "signature: \(v["name"]!): signed again, it verifies")
            }
        }
        for v in section("bad_signatures") { expect(!opens(v), "bad signature refused: \(v["name"]!)") }
    }

    // Envelopes, and sealed copies with their signed public header.
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
            var b = byHash[v["hash"] as! String]!["block"] as! JSON; b["hash"] = v["hash"]
            var top = v["header"] as! JSON; top["signature"] = v["header_signature"]
            expect(sameJSON(try FoodBlock.header(b), v["header"]) && FoodBlock.verifyMessage(top, pub(v["signer"])), "header: \(v["name"]!)")
        }
    }

    // Identities: which blocks are their author's, which keys speak, who operates an agent, the limit's fence.
    func testIdentities() {
        for v in section("identities") {
            let held = blocksOf(arr(v["blocks"])), name = v["name"] as! String, arrived = arrivals(v)
            for (h, ok) in v["signed_by_author"] as? JSON ?? [:] {
                expect(Identity.signedByAuthor(find(held, h), held, arrivedAt: arrived) == truthy(ok), "identity: \(name): \(h.prefix(8)) \(truthy(ok) ? "stands" : "is void")")
            }
            if let keys = v["keys"] { expect(sameJSON(sortedJS(Identity.keysOf(v["id"] as! String, held, arrivedAt: arrived)), keys), "identity: \(name): the keys that speak") }
            if let frozen = v["frozen"] { expect(sameJSON(sortedJS(Identity.keyTimeline(v["id"] as! String, held).filter { $0.frozen }.map { $0.key }), frozen), "identity: \(name): the frozen keys") }
            if let ops = v["operators"] { expect(sameJSON(Grant.operatorsOf(v["id"] as! String, held), ops), "identity: \(name): its operators") }
            do {
                let state = Identity.identityState(v["id"] as! String, held, arrivedAt: arrived)
                let signed = state["signed_by_author"] as? JSON ?? [:]
                expect(sameJSON(state["keys"], v["keys"]) && (v["frozen"] == nil || sameJSON(state["frozen"], v["frozen"]))
                       && (v["signed_by_author"] as? JSON ?? [:]).allSatisfy { h, ok in signed[h].map { truthy($0) == truthy(ok) && isBool($0) } ?? true },
                       "identity: \(name): the identity fold (signed_by_author, keys, frozen) (got \(stableJSON(state)))")
            }
            if let f = v["fence"] as? JSON {
                let limit = find(held, f["block"]), grant = find(held, f["grant"])
                let lstate = limit["state"] as! JSON
                expect(dig(limit, "refs.for") as? String == f["grant"] as? String && lstate["kind"] as? String == "limit" && sameJSON(lstate["limit"], f["limit"])
                       && FoodBlock.findsSelf(limit, f["agent"] as! String, f["salt"] as? String) && !FoodBlock.findsSelf(limit, f["principal"] as! String, f["salt"] as? String)
                       && (lstate["audience"] as! [Any]).count == 1, "identity: \(name): sealed to the agent alone")
                let under = v["under"] as? JSON ?? [:]
                expect(dig(grant, "state.scope.limit") == nil && under.keys.allSatisfy { h in
                    Grant.whyNotUnder(find(held, h), held) == Grant.whyNotUnder(find(held, h), held.filter { $0["hash"] as? String != limit["hash"] as? String })
                }, "identity: \(name): the grant check never reads the limit")
                expect(arr(f["within"]).allSatisfy { c in Grant.withinLimit(limit, c["money"] as! JSON, spent: intOf(c["spent"]) ?? 0) == truthy(c["within"]) }, "identity: \(name): the principal's node checks the limit (withinLimit)")
            }
            for (h, ok) in v["under"] as? JSON ?? [:] { expect(Grant.whyNotUnder(find(held, h), held).isEmpty == truthy(ok), "identity: \(name): a block under the grant speaks for its grantor") }
        }
    }

    static func stageOf(_ v: JSON) -> JSON {
        let held = blocksOf(arr(v["blocks"]))
        return Fold.promiseStage(find(held, v["first"]), held)
    }

    func testPromiseFolds() {
        let all = section("deals") + section("folds.promises")
        XCTAssertFalse(all.isEmpty)
        for v in all {
            let got = Self.stageOf(v)
            expect(subset(got, v["expected"]), "promise fold: \(v["name"]!): \(dig(v, "expected.stage")!) (got \(stableJSON(got)))")
        }
    }

    func testCircleFolds() {
        for v in section("circles") + section("folds.circles") {
            let held = blocksOf(arr(v["blocks"])), circle = v["circle"] as! String, want = v["expected"] as! JSON
            let state = Fold.circleState(circle, held)!
            let members: Any = want["members"] is [Any] ? sortedJS(Array(state.members.keys)) as Any
                : state.members.mapValues { sortedJS($0.roles) } as Any
            let mayAct = (v["may_act"] as? JSON ?? [:]).allSatisfy { h, ok in Fold.mayActAs(find(held, h), circle, held) == truthy(ok) }
            expect(sameJSON(members, want["members"]) && sameJSON(sortedJS(Array(state.removed.keys)), want["removed"]) && mayAct
                   && (want["counted_to"] as? JSON ?? [:]).allSatisfy { who, h in state.removed[who] as? String == h as? String }, "circle fold: \(v["name"]!)")
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
            let got = Fold.successorView(find(held, v["grant"]), held, now: v["now"] as? String, arrivedAt: arrivals(v))
            expect(subset(got, v["expected"]), "successor: \(v["name"]!) (got \(stableJSON(got)))")
        }
        for v in section("folds.ballots") {
            let held = blocksOf(arr(v["blocks"]))
            for c in arr(v["cases"]) { expect(Fold.countedIn(find(held, c["result"]), c["commitment"] as! String, c["counter"] as! String) == truthy(c["counted"]), "ballot: \(c["name"]!)") }
        }
        for v in section("folds.rekeys") {
            let got = Fold.circleKey(v["circle"] as! String, blocksOf(arr(v["blocks"])))
            expect(subset(got, v["expected"]), "circle key: \(v["name"]!) (got \(stableJSON(got)))")
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
            let held = (c["held"] as? [String] ?? []).compactMap { known[$0] }
            switch c["by"] as? String {
            case "check":
                let b = c["block"] as! JSON
                var map: [String: JSON] = [:]
                for h in held { map[h["hash"] as! String] = h }
                expect(sameJSON(codes(b, held: map), c["codes"]), "\(name) (got \(codes(b, held: map)))")
            case "valid":
                let got = codesOf(FoodBlock.valid(c["block"] as! JSON, held: held).map { $0.code })
                expect(sameJSON(got, c["codes"]), "\(name) (got \(got))")
            case "accept":
                let incoming = (c["inline"] as? [JSON]) ?? (c["incoming"] as! [String]).map { known[$0]! }
                let got = Sync.accept(incoming, held)
                // The second of a pair is neither taken nor refused: it is listed in its pair.
                if let pairs = c["equivocations"] {
                    expect(sameJSON(got.taken.map { $0["hash"]! }, c["taken"]) && got.refused.isEmpty && sameJSON(got.equivocations, pairs), name)
                } else if let waiting = c["waiting"] {
                    expect(sameJSON(got.waiting.map { $0.hash }, waiting) && got.refused.isEmpty, name)
                } else if let taken = c["taken"] {
                    expect(sameJSON(got.taken.map { $0["hash"]! }, taken), name)
                } else {
                    expect((c["incoming"] as! [String]).allSatisfy { h in got.refused.contains { $0.hash == h } } && sameJSON(codesOf(got.refused.map { $0.code }), c["codes"]),
                           "\(name) (got \(codesOf(got.refused.map { $0.code })))")
                }
            case "fold": expect(subset(Self.stageOf(c), c["expected"]), name)
            case "may_act_as":
                let blocks = blocksOf(arr(c["blocks"]))
                expect(Fold.mayActAs(find(blocks, c["block"]), c["circle"] as! String, blocks) == truthy(c["ok"]), name)
            case "under":
                expect(Grant.whyNotUnder(known[c["block"] as! String], Array(known.values)).isEmpty == truthy(c["live"]), name)
            case "open":
                do { _ = try FoodBlock.openCopy(c["message"] as! JSON, x25519(c["recipient"])); expect(false, name) }
                catch let error as FoodBlockError { expect(sameJSON([error.code ?? "null"], c["codes"]), "\(name) (got \(error.code ?? "no code"))") }
                catch { expect(false, "\(name): \(error)") }
            default: XCTFail("\(name): a refusal this runner does not know")
            }
        }
    }

    // Messages between nodes: every answer signed by the node; a signed request carries a counter or a challenge, no time.
    func testMessages() throws {
        let M = V["messages"] as! JSON, node = M["node"] as! String, nodeKey = pub(M["node_signer"])
        let p = M["signed_pull"] as! JSON, c = M["signed_pull_challenge"] as! JSON, pm = p["message"] as! JSON, jem = pub(p["signer"])
        let highest = intOf(p["highest"])
        func codes(_ f: [FoodBlock.Finding]) -> [String] { unique(f.map { $0.code }) }
        expect(Sync.pullRefusals(pm, node: node, keys: [jem], highest: highest).isEmpty && pm["at"] == nil, "message: a signed pull names the node and a counter above the highest seen, and carries no time")
        expect(codes(Sync.pullRefusals(pm, node: node, keys: [jem], highest: intOf(pm["counter"]))) == ["replay"], "message: a counter that is not above the highest seen is a replay")
        expect(Sync.pullRefusals(c["message"] as? JSON, node: node, keys: [jem], issued: [c["challenge"] as! String]).isEmpty, "message: a challenge the node issued is taken")
        expect(codes(Sync.pullRefusals(c["message"] as? JSON, node: node, keys: [jem], issued: [])) == ["replay"], "message: a challenge the node did not issue, or has seen used, is a replay")
        expect(codes(Sync.pullRefusals(pm, node: String(repeating: "0", count: 64), keys: [jem], highest: highest)) == ["wrong_node"], "message: a signed pull for another node is refused")
        var changedPull = pm; changedPull["since"] = 1
        expect(codes(Sync.pullRefusals(changedPull, node: node, keys: [jem], highest: highest)) == ["bad_signature"], "message: a changed request no longer verifies")
        let sp = M["signed_push"] as! JSON
        expect(Sync.pushRefusals(sp["message"] as? JSON, node: node, keys: [pub(sp["signer"])], highest: intOf(sp["highest"])).isEmpty, "message: a signed push")
        // A request we sign ourselves carries one proof and verifies.
        let ours = try Sync.signPull(Sync.pullRequest(), signer: pm["signer"] as! String, node: node, privateKey: vkeys[p["signer"] as! String]!["private_key"] as! String, counter: 9)
        expect(Sync.pullRefusals(ours, node: node, keys: [jem], highest: 8).isEmpty && ours["at"] == nil && ours["nonce"] == nil, "message: a pull signed here is taken")
        let fresh = Sync.newChallenge()
        expect(fresh.count == 32, "message: a new challenge")

        expect(Identity.keysOf(node, blocksOf(arr(dig(V, "sealed.blocks")))).contains(nodeKey), "message: the node key is a key of its holder, brought in by a key grant")
        let pa = M["pull_answer"] as! JSON, answer = pa["message"] as! JSON
        expect(Sync.answerSignedBy(answer, [nodeKey]) && (answer["blocks"] as! [Any]).count == intOf(pa["matches"]), "message: a pull answer is signed by the node")
        let push = dig(M, "push_answer.message") as! JSON
        expect(Sync.answerSignedBy(push, [nodeKey]), "message: a push answer is signed by the node")
        let known = Set(FoodBlock.refusalCodes.values.flatMap { $0 })
        let refused = push["refused"] as! [JSON], pairs = push["equivocations"] as! [[String]]
        expect(Set(push.keys) == Set(FoodBlock.message("push_answer")) && refused.allSatisfy { Set($0.keys) == Set(FoodBlock.message("refusal")) && known.contains($0["code"] as? String ?? "") }
               && pairs.allSatisfy { $0 == sortedJS($0) }, "message: a push answer carries every key, refusals as { hash, code, detail }, equivocations as sorted pairs")
        let rebuilt = try Sync.pushAnswer(taken: push["taken"] as! [String], waiting: push["waiting"] as! [String],
                                          refused: refused.map { Sync.Refusal(hash: $0["hash"] as! String, code: $0["code"] as? String, detail: $0["detail"] as? String) },
                                          equivocations: pairs, node: push["node"] as! String, privateKey: vkeys[M["node_signer"] as! String]!["private_key"] as! String)
        expect(sameJSON(rebuilt, push), "message: the push answer rebuilds byte for byte")
        var changed = push; changed["taken"] = [Any]()
        expect(!Sync.answerSignedBy(changed, [nodeKey]), "message: a changed answer no longer verifies")
        let Q = M["push"] as! JSON, req = Q["request"] as! JSON
        expect(sameJSON(Sync.pushRequest(req["messages"] as! [JSON], for: req["for"] as? JSON), req) && sameJSON((req["for"] as! JSON)[Q["hash"] as! String], Q["recipients"]) && (Q["recipients"] as! [Any]).count == 2,
               "message: a push names the list of ids each sealed copy is for")
        let doc = M["discovery"] as! JSON
        expect(Sync.wellKnownErrors(doc).isEmpty && sameJSON(Sync.announcement(doc), M["announcement"]) && (doc["endpoints"] as! JSON)["challenge"] != nil, "message: discovery names the challenge endpoint, and its local announcement")
    }

    // The compact form: block <-> CBOR bytes in both key forms, loose encodings accepted, malformed ones refused.
    func testCbor() throws {
        let C = V["cbor"] as! JSON
        for c in arr(C["cases"]) {
            let b = full(c), name = c["name"] as! String, bare = c["block"] as! JSON
            expect(try Cbor.hex(Cbor.encode(b)) == c["cbor"] as! String && Cbor.hex(Cbor.encode(b, short: true)) == c["cbor_short"] as! String, "cbor writes deterministic bytes: \(name)")
            expect(try sameJSON(Cbor.decode(Cbor.bytes(c["cbor"] as! String)), b) && sameJSON(Cbor.decode(Cbor.bytes(c["cbor_short"] as! String)), b), "cbor reads back to the block: \(name)")
            expect(try FoodBlock.hash(bare["type"] as! String, bare["state"] as! JSON, bare["refs"] as! JSON) == c["hash"] as! String
                   && FoodBlock.canonical(bare["type"] as! String, bare["state"] as! JSON, bare["refs"] as! JSON).utf8.count == intOf(c["canonical_bytes"]), "cbor: id and size: \(name)")
        }
        let loose = C["loose"] as! JSON
        expect(try Cbor.decode(Cbor.bytes(loose["cbor"] as! String))["hash"] as? String == loose["hash"] as? String, "cbor: any well-formed encoding of the same content is accepted")
        let push = C["push"] as! JSON
        let pushed = (push["hashes"] as! [String]).map { h in full(arr(C["cases"]).first { $0["hash"] as? String == h }!) }
        expect(try Cbor.hex(Cbor.encodePush(pushed)) == push["cbor"] as! String && sameJSON(Cbor.decodePush(Cbor.bytes(push["cbor_short"] as! String)), pushed), "cbor: \(push["name"]!)")
        for h in arr(C["headers"]) {
            let header = h["header"] as! JSON
            expect(try Cbor.hex(Cbor.encodeHeader(header)) == h["cbor"] as! String && sameJSON(Cbor.decodeHeader(Cbor.bytes(h["cbor_short"] as! String)), header), "cbor: \(h["name"]!)")
        }
        for r in arr(C["refused"]) { expect((try? Cbor.decode(Cbor.bytes(r["cbor"] as! String))) == nil, "cbor refused: \(r["name"]!)") }
    }

    // The door: one case per rule. `expect` is a subset match, `exact` deep equality, `codes` the refusal codes of the list, `error` a failure.
    func testDoor() throws {
        let cases = section("door")
        XCTAssertGreaterThan(cases.count, 50)
        for d in cases {
            let name = "door: \(d["name"]!)"
            let answer = try Core.raw(d["op"] as! String, d["args"] as? [Any] ?? [])
            if let ok = answer["ok"] {
                if d["error"] != nil { expect(false, "\(name): it should have failed"); continue }
                if d["codes"] != nil {
                    let got = unique(((ok as? [JSON]) ?? []).map { $0["code"] as? String ?? "null" })
                    expect(sameJSON(got, d["codes"]), "\(name) (got \(got))")
                } else if truthy(d["exact"]) {
                    expect(sameJSON(ok, d["expect"]), "\(name) (got \(stableJSON(ok)))")
                } else {
                    expect(subset(ok, d["expect"]), "\(name) (got \(stableJSON(ok)))")
                }
            } else {
                guard let want = d["error"] as? JSON else { expect(false, "\(name): failed: \(answer["message"] ?? "")"); continue }
                expect((want["code"] == nil || want["code"] as? String == answer["code"] as? String) && (want["kind"] == nil || want["kind"] as? String == answer["error"] as? String),
                       "\(name) (got \(answer["error"] ?? "") \(answer["code"] ?? ""))")
            }
        }
    }

    // Every section of spec/vectors.json is one this runner reads: a new section cannot pass unseen.
    func testEverySectionIsRun() {
        let read: Set<String> = ["$comment", "comment", "keys", "hashes", "ledger", "canonical", "audience", "signatures", "bad_signatures", "envelopes", "identities", "deals", "circles",
                                 "folds", "refusals", "sealed", "headers", "messages", "cbor", "door"]
        XCTAssertEqual(Set(V.keys).subtracting(read), [], "sections in spec/vectors.json this runner does not run")
        XCTAssertEqual(Set((V["folds"] as! JSON).keys).subtracting(["promises", "circles", "audience", "things", "successors", "rekeys", "ballots"]), [])
    }

    // ---- The core carries spec/protocol.json exactly (no aliases.json: year zero) ----
    func testCoreCarriesTheSpec() throws {
        XCTAssertTrue(sameJSON(FoodBlock.spec, loadJSON("spec", "protocol.json")), "the core's built-in protocol.json differs from spec/")
    }
}
