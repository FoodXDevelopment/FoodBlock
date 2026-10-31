import XCTest
@testable import FoodBlock

/// What a node does beyond the vectors: write in a key's chain, refuse what is wrong, seal copies, pull and push.
final class NodeTests: XCTestCase {
    struct Person { let keys: Keypair; let enc: EncryptionKeypair; let me: JSON; var held: [JSON]; var id: String { me["hash"] as! String } }
    func person(_ at: String = "2026-10-15T09:00:00.000Z") throws -> Person {
        let keys = FoodBlock.generateKeypair(), enc = FoodBlock.generateEncryptionKeypair()
        let me = try Identity.genesis(keys, kind: "person", at: at, audience: .public, encryptionKey: enc.publicKeyEncrypt, recoveryKey: FoodBlock.generateKeypair().publicKeySign, reach: "P30D")
        return Person(keys: keys, enc: enc, me: me, held: [me])
    }
    func say(_ p: inout Person, _ type: String, _ state: JSON, _ refs: JSON = [:], audience: FoodBlock.Audience = .public, link: Link? = nil) throws -> JSON {
        let b = try FoodBlock.write(type, state, refs, author: p.id, key: p.keys, held: p.held, link: link, audience: audience, when: .at("2026-10-15T09:00:0\(p.held.count % 10).000Z"))
        p.held.append(b)
        return b
    }

    func testAPasskeyChallengeIsTheBlocksID() throws {
        let block = try FoodBlock.create("thing", ["kind": "eggs"], [:], suite: "p256")
        let challenge = try FoodBlock.passkeyChallenge(block)
        XCTAssertEqual(challenge.count, 43)
        XCTAssertFalse(challenge.contains("=") || challenge.contains("+") || challenge.contains("/"))
        XCTAssertThrowsError(try FoodBlock.passkeySignature(authenticatorData: "zz", clientDataJSON: "00", signature: "00"))
    }

    func testAGenesisNamesItsKeysAndRecovery() throws {
        let ann = try person()
        XCTAssertEqual(try FoodBlock.check("actor", ann.me["state"] as! JSON, [:]), [])
        XCTAssertTrue(try Identity.genesisOpens(ann.me) && Identity.isGenesis(ann.me))
        // The recovery key and its reach come as a pair or not at all.
        XCTAssertThrowsError(try Identity.genesis(ann.keys, kind: "person", at: "2026-10-15T09:00:00.000Z", audience: .public, recoveryKey: FoodBlock.generateKeypair().publicKeySign))
        let bare = try Identity.genesis(ann.keys, kind: "person", at: "2026-10-15T09:00:00.000Z", audience: .public)
        XCTAssertTrue(try Identity.genesisOpens(bare))
    }

    func testWriteChainsChecksAndSigns() throws {
        var ann = try person()
        let eggs = try say(&ann, "thing", ["kind": "eggs", "name": "Free-range eggs"])
        let offer = try say(&ann, "promise", ["terms": ["price": FoodBlock.money(450, "GBP"), "quantity": FoodBlock.amount("2", "{tray}"), "expires": "2026-10-20T00:00:00.000Z"]],
                            ["from": ann.id, "what": eggs["hash"]!])
        XCTAssertEqual([dig(eggs, "state.seq") as? Int, dig(offer, "state.seq") as? Int], [1, 2])
        XCTAssertEqual(dig(offer, "refs.prev") as? String, eggs["hash"] as? String)
        XCTAssertTrue(try Identity.signedByAuthor(offer, ann.held))
        XCTAssertTrue(try FoodBlock.checkChain(Array(ann.held.dropFirst()), ann.id).ok)
        XCTAssertEqual(try Fold.promiseStage(offer, ann.held)["stage"] as? String, "offered")
        XCTAssertEqual(try Fold.promiseView(offer, ann.held, now: "2026-10-21T00:00:00.000Z")["stage"] as? String, "expired")
    }

    func testWriteRefusesWhatIsWrongNeverRepairs() throws {
        var ann = try person()
        let other = String(repeating: "b", count: 64)
        func refused(_ type: String, _ state: JSON, _ refs: JSON = [:]) -> [String] {
            do { _ = try say(&ann, type, state, refs); return [] } catch FoodBlockError.refused(let wrong) { return wrong.map { $0.code } } catch { return ["\(error)"] }
        }
        XCTAssertTrue(refused("thing", ["kind": "flour", "amount": ["value": 1.5, "unit": "kg"]]).contains("float"))
        XCTAssertTrue(refused("promise", ["terms": ["price": try FoodBlock.money(1, "GBP"), "colour": "red"]], ["from": ann.id]).contains("undeclared_field"))
        XCTAssertFalse(refused("promise", ["terms": ["quantity": try FoodBlock.amount("1", "kg")]], ["to": ann.id, "from": other]).contains("ask_without_expires"), "an ask may carry no expires (decision H11)")
        XCTAssertEqual(refused("promise", ["terms": ["lines": [["id": "a", "what": other, "quantity": try FoodBlock.amount("1", "kg")]]]], ["from": ann.id, "what": ann.id]), ["lines"])
        XCTAssertEqual(refused("thing", ["kind": "eggs", "use_by": "2026-02-30"]), ["calendar"])
        XCTAssertTrue(refused("promise", ["terms": ["price": ["money": try FoodBlock.money(450, "GBP"), "per": try FoodBlock.amount("01", "kg")]]], ["from": ann.id]).contains("decimal"))
        XCTAssertEqual(ann.held.count, 1, "nothing refused was kept")
    }

    func testASealedCopyOpensOnlyForItsRecipient() throws {
        var ann = try person()
        let bob = try person()
        let note = try say(&ann, "observe", ["kind": "note", "text": "for Bob"], audience: .to([bob.id]))
        let salts = note["salts"] as! [String: String]
        XCTAssertTrue(try FoodBlock.findsSelf(note, bob.id, salts[bob.id]))
        var signed = note; signed.removeValue(forKey: "salts")
        let copy = try FoodBlock.sealCopy(signed, keys: [bob.enc.publicKeyEncrypt], reveals: [FoodBlock.revealFor(salts, bob.id)], privateKey: ann.keys.privateKey)
        XCTAssertNil(dig(copy, "envelope.recipients") .flatMap { ($0 as? [Any])?.first as? JSON }?["key_hash"], "an envelope names no recipient")
        let opened = try FoodBlock.openCopy(copy, bob.enc.x25519Private)
        XCTAssertEqual(opened["hash"] as? String, note["hash"] as? String)
        XCTAssertTrue(try FoodBlock.headerSignedBy(copy, ann.keys.publicKeySign))
        XCTAssertTrue(sameJSON(opened["reveals"], [["salt": salts[bob.id]!, "value": bob.id]]))
        XCTAssertThrowsError(try FoodBlock.openCopy(copy, ann.enc.x25519Private))
        let value = try FoodBlock.seal(["x": 1], [bob.enc.publicKeyEncrypt])
        XCTAssertTrue(sameJSON(try FoodBlock.open(value, bob.enc.x25519Private), ["x": 1]))
    }

    func testPushTakesWaitsAndCatchesALie() throws {
        var ann = try person()
        let one = try say(&ann, "observe", ["kind": "note", "text": "two trays"])
        let two = try say(&ann, "observe", ["kind": "note", "text": "one tray left"])
        let early = try Sync.accept([ann.me, two], [], takesPairs: false)
        XCTAssertEqual(early.taken.map { $0["hash"] as! String }, [ann.id])
        XCTAssertEqual(early.waiting.map { $0.needs }, [[one["hash"] as! String]])
        let lie = try say(&ann, "observe", ["kind": "note", "text": "five trays"], link: Link(seq: 1, prev: ann.id))
        let later = try Sync.accept([lie], [ann.me, one, two], takesPairs: false)
        XCTAssertEqual(later.equivocations.map { sortedJS($0) }, [sortedJS([one["hash"] as! String, lie["hash"] as! String])])
        XCTAssertTrue(later.taken.isEmpty && later.refused.isEmpty, "the second of a pair is neither taken nor refused")
        XCTAssertFalse(try Identity.counts(two, Index([ann.me, one, two, lie])), "a later block of a key that signed two at one seq counts for nothing")
        var forged = try FoodBlock.compose("observe", ["kind": "note"], [:], author: ann.id, audience: .public, when: .at("2026-10-15T09:00:09.000Z"), link: Link(seq: 3, prev: two["hash"] as! String))
        forged["signature"] = try FoodBlock.sign(forged, privateKey: FoodBlock.generateKeypair().privateKey)
        XCTAssertEqual(try Sync.accept([forged], [ann.me, one, two], takesPairs: false).refused.map { $0.code }, ["bad_signature"])
        XCTAssertTrue(try Sync.waitedTooLong("2026-10-15T09:00:00.000Z", "2026-10-16T09:00:00.000Z", 3_600_000))
    }

    func testASignedPullAndASignedAnswer() throws {
        var ann = try person()
        let node = try person()
        let note = try say(&ann, "observe", ["kind": "note", "text": "hello"])
        let pull = try Sync.signPull(Sync.pullRequest(filter: ["author": ann.id], heads: true), signer: ann.id, node: node.id, privateKey: ann.keys.privateKey, counter: 1)
        XCTAssertNil(pull["at"], "a signed request carries no time")
        XCTAssertTrue(try Sync.pullRefusals(pull, node: node.id, keys: [ann.keys.publicKeySign]).isEmpty)
        XCTAssertEqual(try Sync.pullRefusals(pull, node: node.id, keys: [ann.keys.publicKeySign], highest: 1).map { $0.code }, ["replay"], "a counter not above the highest seen is a replay")
        let challenge = try Sync.newChallenge()
        let proof = try Sync.signPull(Sync.pullRequest(), signer: ann.id, node: node.id, privateKey: ann.keys.privateKey, challenge: challenge)
        XCTAssertTrue(try Sync.pullRefusals(proof, node: node.id, keys: [ann.keys.publicKeySign], issued: [challenge]).isEmpty)
        let log = [Sync.Arrival(n: 1, block: ann.me), Sync.Arrival(n: 2, block: note)]
        let answer = try Sync.answerPull(log, pull, node: node.id, privateKey: node.keys.privateKey, cap: 500, servesPairs: true)
        XCTAssertTrue(try Sync.answerSignedBy(answer, [node.keys.publicKeySign]))
        XCTAssertEqual((answer["blocks"] as! [JSON]).map { $0["n"] as! Int }, [2])
        let doc = try Sync.wellKnown(node: node.id, holds: [ann.id], admission: nil, endpoints: ["pull": "https://n.example/pull", "push": "https://n.example/push"])
        XCTAssertEqual(try Sync.wellKnownErrors(doc), [])
        XCTAssertEqual(Set(try Sync.announcement(doc).keys), Set(FoodBlock.message("announcement")))
    }

    func testAKeyGrantBringsInADevice() throws {
        var ann = try person()
        let phone = FoodBlock.generateKeypair()
        let grant = try Identity.keyGrant(ann.id, phone.publicKeySign, Identity.Signer(privateKey: ann.keys.privateKey), at: "2026-10-15T09:00:01.000Z")
        ann.held.append(grant)
        XCTAssertEqual(try FoodBlock.check("grant", grant["state"] as! JSON, grant["refs"] as! JSON), [])
        XCTAssertEqual(Set(try Identity.keysOf(ann.id, ann.held)), Set([ann.keys.publicKeySign, phone.publicKeySign]))
        let link = try Identity.nextLinkFor(ann.id, phone.publicKeySign, ann.held)
        XCTAssertEqual(link, Link(seq: 1, prev: grant["hash"] as! String), "a device's chain starts at the grant that brought it in")
    }

    // Nothing is filled in for a signer: what the types cannot leave out, the core refuses when it is left out.
    func testASilentChoiceIsRefusedNeverFilled() throws {
        let ann = try person(), now = "2026-10-15T09:00:00.000Z"
        func fails(_ f: () throws -> Any?) -> Bool { (try? f()) == nil }
        // a missing audience, a missing time (and no clockless), a genesis with no kind
        XCTAssertTrue(fails { try Door.compose("observe", ["kind": "note"], [:], ["author": ann.id, "after": [], "at": now]) })
        XCTAssertTrue(fails { try Door.compose("observe", ["kind": "note"], [:], ["author": ann.id, "after": [], "audience": "public"]) })
        XCTAssertNoThrow(try FoodBlock.compose("observe", ["kind": "note"], [:], author: ann.id, audience: .public, when: .clockless))
        XCTAssertTrue(fails { try Door.genesis(ann.keys.json, ["at": now, "audience": "public"]) })
        XCTAssertTrue(fails { try Door.genesis(ann.keys.json, ["kind": "person", "audience": "public"]) })
        XCTAssertTrue(fails { try Door.genesis(ann.keys.json, ["kind": "person", "at": now]) })
        XCTAssertTrue(fails { try Door.keyGrant(ann.id, FoodBlock.generateKeypair().publicKeySign, ["private_key": ann.keys.privateKey], ["after": []]) })
        // a pull cap below 1, a missing pair choice; a push with no pair choice
        let log = [Sync.Arrival(n: 1, block: ann.me)]
        XCTAssertThrowsError(try Sync.answerPull(log, [:], node: ann.id, cap: 0, servesPairs: true))
        XCTAssertTrue(fails { try Door.answerPull(log.map { $0.json }, [:], ann.id, nil, ["cap": 5]) })
        XCTAssertTrue(fails { try Door.accept([ann.me], [], [:]) })
        XCTAssertTrue(fails { try Door.acceptSealed([], [], [:]) })
        // a pair arriving together: kept out of `taken` or in it, as the node chose
        var a = ann
        let one = try say(&a, "observe", ["kind": "note", "text": "a"])
        let rival = try say(&a, "observe", ["kind": "note", "text": "b"], link: Link(seq: 1, prev: a.id))
        XCTAssertTrue(try Sync.accept([one, rival], [a.me], takesPairs: false).taken.isEmpty)
        XCTAssertEqual(try Sync.accept([one, rival], [a.me], takesPairs: true).taken.count, 2)
        // admission and the day's strangers are stated; arrivals come with how to read an unknown one
        XCTAssertTrue(fails { try Core.maybe("admission_refusals", one, ann.id, a.held, nil, nil) })
        XCTAssertTrue(fails { try Core.maybe("admission_refusals", one, ann.id, a.held) })
        XCTAssertNoThrow(try Strangers.admissionRefusals(one, receiver: ann.id, a.held, admission: nil, strangersToday: 0))
        XCTAssertThrowsError(try Identity.keysOf(ann.id, a.held, arrivedAt: { _ in nil }))
        XCTAssertNoThrow(try Identity.keysOf(ann.id, a.held, arrivedAt: { _ in nil }, unknownArrival: "inside"))
        var c = try person()
        let eggs = try say(&c, "thing", ["kind": "eggs"])
        let offer = try say(&c, "promise", ["terms": ["price": FoodBlock.money(450, "GBP")]], ["from": c.id, "what": eggs["hash"]!])
        XCTAssertThrowsError(try Fold.promiseView(offer, c.held, arrivals: [:]))
        XCTAssertNoThrow(try Fold.promiseView(offer, c.held, arrivals: [:], unknownArrival: "outside"))
        // a message with a version is refused
        var m = try FoodBlock.wrap(one); m["version"] = "1.7"
        XCTAssertThrowsError(try FoodBlock.unwrap(m))
    }

    func testEverySuiteSignsAndSeals() throws {
        for suite in FoodBlock.suites {
            let keys = FoodBlock.generateKeypair(suite: suite), enc = FoodBlock.generateEncryptionKeypair(suite: suite)
            XCTAssertEqual(try FoodBlock.suiteOfKey(keys.publicKeySign), suite)
            let me = try Identity.genesis(keys, kind: "person", at: "2026-10-15T09:00:00.000Z", audience: .public, encryptionKey: enc.publicKeyEncrypt)
            XCTAssertEqual((me["state"] as! JSON)["suite"] as? String ?? "std", suite, "the genesis names its suite in its state: nothing beside the block does")
            XCTAssertTrue(try Identity.genesisOpens(me))
            let note = try FoodBlock.write("observe", ["kind": "note", "text": "hi"], [:], author: me["hash"] as! String, key: keys, held: [me], audience: .public, when: .at("2026-10-15T09:00:01.000Z"))
            XCTAssertTrue(try FoodBlock.valid(note, held: [me]).isEmpty)
            XCTAssertEqual(try FoodBlock.hash(of: note), note["hash"] as? String)
            let wire = try FoodBlock.unwrap(FoodBlock.wrap(note))
            XCTAssertEqual(wire["hash"] as? String, note["hash"] as? String)
            XCTAssertNil(wire["suite"], "the id is in the suite of the key that signed it; no label names it")
            XCTAssertNil(try FoodBlock.wrap(note)["suite"], "a message names no suite")
            XCTAssertNil(try FoodBlock.wrap(note)["version"], "a message carries no version")
            let value = try FoodBlock.seal(["x": 1], [enc.publicKeyEncrypt], suite: suite)
            XCTAssertTrue(sameJSON(try FoodBlock.open(value, enc.x25519Private), ["x": 1]))
        }
    }

    func testThereIsNoOlderShape() throws {
        XCTAssertEqual(FoodBlock.version, FoodBlock.spec["version"] as? String)
        XCTAssertEqual(FoodBlock.types.count, 7)
        XCTAssertThrowsError(try Core.ask("read_as", [:]))
        XCTAssertEqual(try FoodBlock.receiptCode(String(repeating: "0", count: 64)).count, 9)
        XCTAssertEqual(try FoodBlock.receiptCodeLong(String(repeating: "0", count: 64)).count, 11)
        XCTAssertTrue(try FoodBlock.codeMatches("oooo oooo", String(repeating: "0", count: 64)))
        XCTAssertFalse(try FoodBlock.codeMatches("0000-000", String(repeating: "0", count: 64)))
    }
}
