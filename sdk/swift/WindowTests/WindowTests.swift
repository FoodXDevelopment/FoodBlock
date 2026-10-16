import XCTest
import FoodBlock
@testable import FoodBlockWindow

final class WindowTests: XCTestCase {
    func hex(_ b64: String) -> String { Data(base64url: b64)!.hex }

    // ---- unit: the test authenticator, the core and the store ----
    func testAPasskeySignatureOpensForItsKeyAndBlockOnly() async throws {
        let device = TestAuthenticator(), other = TestAuthenticator()
        let g = try FoodBlock.create("actor", ["kind": "person", "at": "2026-10-16T12:00:00.000Z", "audience": "public", "public_key_sign": device.spki, "suite": "p256"], [:])
        let a = try await device.assert(rpId: "foodx.network", challenge: FoodBlock.passkeyChallenge(g), credentialId: nil)
        let sig = try FoodBlock.passkeySignature(authenticatorData: hex(a.authenticatorData), clientDataJSON: hex(a.clientDataJSON), signature: hex(a.signature))
        XCTAssertTrue(FoodBlock.verify(g, sig, device.spki))
        XCTAssertFalse(FoodBlock.verify(g, sig, other.spki), "another key")
        let n = try FoodBlock.create("thing", ["kind": "eggs"], [:], suite: "p256")
        XCTAssertFalse(FoodBlock.verify(n, sig, device.spki), "a signature for another block")
    }
    func testTheQueueKeepsOrderSurvivesReopeningAndKeepsRefusals() throws {
        let path = NSTemporaryDirectory() + "queue-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: path) }
        var s: WindowStore? = try WindowStore(path: path)
        for h in ["b", "a", "c"] { try s!.enqueue(["hash": h, "type": "observe"]) }
        try s!.enqueue(["hash": "a"])   // a block is queued once
        try s!.fail("a", "refused 400: chain")
        s = nil
        let again = try WindowStore(path: path)
        XCTAssertEqual(try again.items().map { $0.hash }, ["b", "a", "c"])
        XCTAssertEqual(try again.pending().map { $0.hash }, ["b", "c"])
        XCTAssertEqual(try again.items()[1].failed, "refused 400: chain")
        try again.taken("b"); XCTAssertEqual(try again.items().map { $0.hash }, ["a", "c"])
    }

    // ---- end to end against a local host (Node) ----
    func window(_ host: LocalHost, _ device: TestAuthenticator, store: WindowStore? = nil) throws -> (FoodBlockWindow, SwitchableTransport, WindowStore) {
        let t = SwitchableTransport(URLSessionTransport(base: host.url)), s = try store ?? WindowStore()
        return (FoodBlockWindow(transport: t, authenticator: device, store: s), t, s)
    }
    func testRegisterSignInWriteReadAndTheOfflineQueue() async throws {
        let host = try LocalHost(), device = TestAuthenticator()
        let (w, net, _) = try window(host, device)
        let person = try await w.register()
        XCTAssertEqual(person.count, 64)
        var blocks = try await w.blocks()
        let genesis = blocks.first { $0["hash"] as? String == person }!
        XCTAssertEqual(walk(genesis, "state.public_key_sign") as? String, device.spki, "the person's key is the passkey")
        XCTAssertTrue(Identity.genesisOpens(genesis))

        // online: propose, passkey signs the id, host keeps
        guard case .submitted(let first) = try await w.write("observe", ["kind": "note", "text": "bought oats", "audience": "public"]) else { return XCTFail("online write should submit") }
        XCTAssertTrue(FoodBlock.valid(first, held: blocks).isEmpty)
        blocks = try await w.blocks()
        XCTAssertTrue(blocks.contains { $0["hash"] as? String == first["hash"] as? String })

        // a new phone session: no memory, one passkey tap signs in to the same person
        let (w2, _, _) = try window(host, device)
        let again = try await w2.signIn()
        XCTAssertEqual(again, person)

        // offline: composed here, signed by the passkey, checked by the core, queued; reads come from the cache
        net.offline = true
        let taps = device.signed
        guard case .queued(let q1) = try await w.write("observe", ["kind": "note", "text": "second", "audience": "public"]) else { return XCTFail("offline write should queue") }
        guard case .queued(let q2) = try await w.write("observe", ["kind": "note", "text": "third", "audience": "public"]) else { return XCTFail("offline write should queue") }
        XCTAssertEqual(device.signed, taps + 2, "one tap per block")
        XCTAssertEqual(walk(q2, "refs.prev") as? String, q1["hash"] as? String, "queued blocks chain")
        let waiting = try await w.queued(); XCTAssertEqual(waiting.count, 2)
        let cachedBlocks = try await w.blocks(); XCTAssertFalse(cachedBlocks.isEmpty, "reads still work offline")
        var report = try await w.sync()
        XCTAssertEqual(report.taken.count, 0); XCTAssertEqual(report.stillWaiting, 2, "still offline: nothing lost")

        // reconnect: the queue goes in order and the host judges each block
        net.offline = false
        report = try await w.sync()
        XCTAssertEqual(report.taken, [q1["hash"] as! String, q2["hash"] as! String]); XCTAssertEqual(report.stillWaiting, 0)
        let after = try await w.blocks()
        XCTAssertTrue(after.contains { $0["hash"] as? String == q2["hash"] as? String })
        XCTAssertEqual(FoodBlock.checkChain(after.filter { $0["hash"] as? String != person && ($0["refs"] as? JSON)?["author"] as? String == person }, person).ok, true)
        // the next online write follows the queued ones
        guard case .submitted(let last) = try await w.write("observe", ["kind": "note", "text": "fourth", "audience": "public"]) else { return XCTFail() }
        XCTAssertEqual(walk(last, "refs.prev") as? String, q2["hash"] as? String)
    }
    func testAQueuedBlockTheHostRefusesStaysWithItsReason() async throws {
        let host = try LocalHost(), device = TestAuthenticator()
        let (w, net, store) = try window(host, device)
        _ = try await w.register()
        net.offline = true
        guard case .queued(let q) = try await w.write("observe", ["kind": "note", "text": "mine", "audience": "public"]) else { return XCTFail() }
        // a copy with a changed word cannot pass: tamper with the stored block, as a corrupted disk might
        var bad = q; var st = bad["state"] as! JSON; st["text"] = "free gold"; bad["state"] = st
        try store.taken(q["hash"] as! String); try store.enqueue(bad)
        net.offline = false
        let report = try await w.sync()
        let left = try await w.queued()
        XCTAssertEqual(report.refused.count, 1); XCTAssertNotNil(left.first?.failed)
        XCTAssertEqual(report.stillWaiting, 0)
    }
    func testTheWindowNeverSignsAChangedBlock() async throws {
        let host = try LocalHost(), device = TestAuthenticator()
        let (w, net, _) = try window(host, device)
        _ = try await w.register()
        net.tamper = { path, body in
            guard path.hasSuffix("window/propose"), var d = body["draft"] as? JSON, var s = d["state"] as? JSON else { return body }
            s["text"] = "send all my money"; d["state"] = s; return ["draft": d]
        }
        let taps = device.signed
        do { _ = try await w.write("observe", ["kind": "note", "text": "hello", "audience": "public"]); XCTFail("should refuse") } catch {}
        XCTAssertEqual(device.signed, taps, "the passkey was not asked to sign it")
    }
    func testGoogleLinkComesFromTheHost() async throws {
        let host = try LocalHost(args: ["--google"]), device = TestAuthenticator()
        let (w, _, _) = try window(host, device)
        let person = try await w.register()
        let link = try await w.googleLink()
        XCTAssertEqual(link.host, "mcp.foodx.network"); XCTAssertTrue(link.absoluteString.contains(String(person.prefix(8))))
    }
}
