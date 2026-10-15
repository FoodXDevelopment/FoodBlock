import XCTest
@testable import FoodBlock

/// What a node does beyond the vectors: write in a key's chain, refuse what is wrong, seal copies, pull and push.
final class NodeTests: XCTestCase {
    struct Person { let keys: Keypair; let enc: EncryptionKeypair; let me: JSON; var held: [JSON]; var id: String { me["hash"] as! String } }
    func person(_ at: String = "2026-10-15T09:00:00.000Z") throws -> Person {
        let keys = FoodBlock.generateKeypair(), enc = FoodBlock.generateEncryptionKeypair()
        let me = try Identity.genesis(keys, at: at, encryptionKey: enc.publicKeyEncrypt, recoveryKey: FoodBlock.generateKeypair().publicKeySign)
        return Person(keys: keys, enc: enc, me: me, held: [me])
    }
    func say(_ p: inout Person, _ type: String, _ state: JSON, _ refs: JSON = [:], audience: [String]? = nil, link: Link? = nil) throws -> JSON {
        let b = try FoodBlock.write(type, state, refs, author: p.id, key: p.keys, held: p.held, link: link, audience: audience, at: "2026-10-15T09:00:0\(p.held.count % 10).000Z")
        p.held.append(b)
        return b
    }

    func testAGenesisNamesItsKeysAndRecovery() throws {
        let ann = try person()
        XCTAssertEqual(FoodBlock.check("actor", ann.me["state"] as! JSON, [:]), [])
        XCTAssertTrue(Identity.genesisOpens(ann.me) && Identity.is16Genesis(ann.me))
        XCTAssertThrowsError(try Identity.genesis(ann.keys, encryptionKey: nil, recoveryKey: nil))
    }

    func testWriteChainsChecksAndSigns() throws {
        var ann = try person()
        let eggs = try say(&ann, "thing", ["kind": "eggs", "name": "Free-range eggs"])
        let offer = try say(&ann, "promise", ["terms": ["price": FoodBlock.money(450, "GBP"), "quantity": FoodBlock.amount("2", "{tray}"), "expires": "2026-10-20T00:00:00.000Z"]],
                            ["from": ann.id, "what": eggs["hash"]!])
        XCTAssertEqual([dig(eggs, "state.seq") as? Int, dig(offer, "state.seq") as? Int], [1, 2])
        XCTAssertEqual(dig(offer, "refs.prev") as? String, eggs["hash"] as? String)
        XCTAssertTrue(Identity.signedByAuthor(offer, ann.held))
        XCTAssertTrue(FoodBlock.checkChain(Array(ann.held.dropFirst()), ann.id).ok)
        XCTAssertEqual(Fold.promiseStage(offer, ann.held)["stage"] as? String, "offered")
        XCTAssertEqual(Fold.promiseStage(offer, ann.held, now: "2026-10-21T00:00:00.000Z")["stage"] as? String, "expired")
    }

    func testWriteRefusesWhatIsWrongNeverRepairs() throws {
        var ann = try person()
        let other = String(repeating: "b", count: 64)
        func refused(_ type: String, _ state: JSON, _ refs: JSON = [:]) -> [String] {
            do { _ = try say(&ann, type, state, refs); return [] } catch FoodBlockError.refused(let wrong) { return wrong.map { $0.code } } catch { return ["\(error)"] }
        }
        XCTAssertEqual(refused("thing", ["kind": "flour", "amount": ["value": 1.5, "unit": "kg"]]), ["float", "shape"])
        XCTAssertEqual(refused("place", ["kind": "kitchen"]), ["unknown_type"])
        XCTAssertEqual(refused("promise", ["terms": ["price": FoodBlock.money(1, "GBP"), "colour": "red"]], ["from": ann.id]), ["undeclared_field"])
        XCTAssertEqual(refused("promise", ["terms": ["quantity": FoodBlock.amount("1", "kg")]], ["to": ann.id, "from": other]), ["ask_without_expires"])
        XCTAssertEqual(refused("promise", ["terms": ["lines": [["id": "a", "what": other, "quantity": FoodBlock.amount("1", "kg")]]]], ["from": ann.id, "what": ann.id]), ["lines"])
        XCTAssertEqual(refused("observe", ["kind": "note", "colour": "red"]), ["undeclared_field"])
        XCTAssertEqual(refused("thing", ["kind": "eggs", "use_by": "2026-02-30"]), ["calendar"])
        XCTAssertEqual(refused("promise", ["terms": ["price": ["money": FoodBlock.money(450, "GBP"), "per": FoodBlock.amount("01", "kg")]]], ["from": ann.id]), ["decimal"])
        XCTAssertEqual(ann.held.count, 1, "nothing refused was kept")
    }

    func testASealedCopyOpensOnlyForItsRecipient() throws {
        var ann = try person()
        let bob = try person()
        let note = try say(&ann, "observe", ["kind": "note", "text": "for Bob"], audience: [bob.id])
        let salts = note["salts"] as! [String: String]
        XCTAssertTrue(FoodBlock.findsSelf(note, bob.id, salts[bob.id]))
        var signed = note; signed.removeValue(forKey: "salts")
        let copy = try FoodBlock.sealCopy(signed, keys: [bob.enc.publicKeyEncrypt], reveals: [FoodBlock.revealFor(salts, bob.id)], privateKey: ann.keys.privateKey)
        XCTAssertNil(dig(copy, "envelope.recipients") .flatMap { ($0 as? [Any])?.first as? JSON }?["key_hash"], "an envelope names no recipient")
        let opened = try FoodBlock.openCopy(copy, bob.enc.x25519Private)
        XCTAssertEqual(opened["hash"] as? String, note["hash"] as? String)
        XCTAssertTrue(FoodBlock.headerSignedBy(copy, ann.keys.publicKeySign))
        XCTAssertTrue(sameJSON(opened["reveals"], [["salt": salts[bob.id]!, "value": bob.id]]))
        XCTAssertThrowsError(try FoodBlock.openCopy(copy, ann.enc.x25519Private))
        // The older alg still opens.
        let raw = try FoodBlock.seal(["x": 1], [bob.enc.publicKeyEncrypt], alg: FoodBlock.algRaw)
        XCTAssertTrue(sameJSON(try FoodBlock.open(raw, bob.enc.x25519Private), ["x": 1]))
    }

    func testPushTakesWaitsAndCatchesALie() throws {
        var ann = try person()
        let one = try say(&ann, "observe", ["kind": "note", "text": "two trays"])
        let two = try say(&ann, "observe", ["kind": "note", "text": "one tray left"])
        let early = Sync.accept([ann.me, two], [])
        XCTAssertEqual(early.taken.map { $0["hash"] as! String }, [ann.id])
        XCTAssertEqual(early.waiting.map { $0.needs }, [[one["hash"] as! String]])
        let lie = try say(&ann, "observe", ["kind": "note", "text": "five trays"], link: Link(seq: 1, prev: ann.id))
        let later = Sync.accept([lie], [ann.me, one, two])
        XCTAssertEqual(later.equivocations, [sortedJS([one["hash"] as! String, lie["hash"] as! String])])
        XCTAssertTrue(later.taken.isEmpty && later.refused.isEmpty, "the second of a pair is neither taken nor refused")
        XCTAssertFalse(Identity.counts(two, Index([ann.me, one, two, lie])), "a later block of a key that signed two at one seq counts for nothing")
        var forged = try FoodBlock.compose("observe", ["kind": "note"], [:], author: ann.id, link: Link(seq: 3, prev: two["hash"] as! String))
        forged["signature"] = try FoodBlock.sign(forged, privateKey: FoodBlock.generateKeypair().privateKey)
        XCTAssertEqual(Sync.accept([forged], [ann.me, one, two]).refused.map { $0.code }, ["bad_signature"])
        XCTAssertTrue(Sync.waitedTooLong("2026-10-15T09:00:00.000Z", "2026-10-16T09:00:00.000Z", 3_600_000))
    }

    func testASignedPullAndASignedAnswer() throws {
        var ann = try person()
        let node = try person()
        let note = try say(&ann, "observe", ["kind": "note", "text": "hello"])
        let pull = try Sync.signPull(Sync.pullRequest(filter: ["author": ann.id], heads: true), asker: ann.id, node: node.id, privateKey: ann.keys.privateKey, at: nowISO())
        XCTAssertEqual(Sync.pullErrors(pull, node: node.id, keys: [ann.keys.publicKeySign]), [])
        let log = [Sync.Arrival(n: 1, block: ann.me), Sync.Arrival(n: 2, block: note)]
        let answer = try Sync.answerPull(log, pull, node: node.id, privateKey: node.keys.privateKey)
        XCTAssertTrue(Sync.answerSignedBy(answer, [node.keys.publicKeySign]))
        XCTAssertEqual((answer["blocks"] as! [JSON]).map { $0["n"] as! Int }, [2])
        let doc = Sync.wellKnown(node: node.id, holds: [ann.id], endpoints: ["pull": "https://n.example/pull", "push": "https://n.example/push"])
        XCTAssertEqual(Sync.wellKnownErrors(doc), [])
        XCTAssertEqual(Set(Sync.announcement(doc).keys), Set(FoodBlock.message("announcement")))
    }

    func testAKeyGrantBringsInADevice() throws {
        var ann = try person()
        let phone = FoodBlock.generateKeypair()
        let grant = try Identity.keyGrant(ann.id, phone.publicKeySign, Identity.Signer(privateKey: ann.keys.privateKey), at: "2026-10-15T09:00:01.000Z")
        ann.held.append(grant)
        XCTAssertEqual(FoodBlock.check("grant", grant["state"] as! JSON, grant["refs"] as! JSON), [])
        XCTAssertEqual(Set(Identity.keysOf(ann.id, ann.held)), Set([ann.keys.publicKeySign, phone.publicKeySign]))
        let link = try Identity.nextLinkFor(ann.id, phone.publicKeySign, ann.held)
        XCTAssertEqual(link, Link(seq: 1, prev: grant["hash"] as! String), "a device's chain starts at the grant that brought it in")
    }

    func testReadingNeverChangesABlock() throws {
        let old = try FoodBlock.create("place", ["name": "Back kitchen"], [:])
        let read = FoodBlock.readAs(old)
        XCTAssertEqual(read["type"] as? String, "thing")
        XCTAssertEqual(read["hash"] as? String, old["hash"] as? String)
        XCTAssertEqual(read["readFrom"] as? String, "place")
        XCTAssertTrue(FoodBlock.isA(old, "thing"))
        XCTAssertEqual(FoodBlock.version, FoodBlock.spec["version"] as? String)
        XCTAssertEqual(FoodBlock.types.count, 7)
    }
}
