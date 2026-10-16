import Foundation
import FoodBlock

/// The phone as a window onto the person's node, which FoodX hosts. The person's passkey IS their FoodBlock key: it never leaves the device,
/// and the host never holds it. A write is: the host proposes the next block, the passkey signs its id, the host's core judges it and keeps it.
/// Offline, the block is composed here against the last chain the phone saw, signed by the passkey, checked by the bundled core, and queued (SQLite);
/// `sync()` hands the queue over, in order, when the host is back. Nothing here decides a protocol rule: every check is the Rust core's.
public actor FoodBlockWindow {
    public enum Outcome { case submitted(JSON), queued(JSON) }
    public struct SyncReport { public var taken: [String] = [], refused: [(hash: String, reason: String)] = [], stillWaiting = 0 }

    public let rpId: String
    private let transport: Transport, authenticator: PasskeyAuthenticator, store: WindowStore
    private let clock: () -> Date
    private var token: String?
    public private(set) var person: String?
    private var credentialId: String?

    public init(transport: Transport, authenticator: PasskeyAuthenticator, store: WindowStore, rpId: String = "foodx.network", clock: @escaping () -> Date = Date.init) {
        self.transport = transport; self.authenticator = authenticator; self.store = store; self.rpId = rpId; self.clock = clock
        person = try? store.get("person"); credentialId = try? store.get("credentialId")
    }
    private func hex(_ b64: String) throws -> String { guard let d = Data(base64url: b64) else { throw WindowError.bad("not base64url") }; return d.hex }
    private func call(_ method: String, _ path: String, _ body: JSON? = nil, auth: Bool = true) async throws -> JSON {
        var attempt = 0
        while true {
            let (status, answer) = try await transport.send(method, path, body: body, token: auth ? token : nil)
            if status == 401 && auth && attempt == 0 && person != nil { attempt += 1; try await signIn(); continue }   // the host forgot the credential (a restart): one tap signs in again
            if status >= 300 { throw WindowError.refused(status, answer["error"] as? String ?? "\(answer["refused"] ?? "")") }
            return answer
        }
    }

    // ---- who ----
    /// Make a passkey and, with it, a new person: the host proposes the genesis, the passkey signs its id, the host's core judges it and makes the node.
    @discardableResult public func register() async throws -> String {
        let begin = try await call("POST", "_app/passkey/register/begin", auth: false)
        guard let challenge = begin["challenge"] as? String, let user = begin["user"] as? JSON, let userId = user["id"] as? String else { throw WindowError.bad("the host's registration was not understood") }
        let made = try await authenticator.register(rpId: rpId, challenge: challenge, userId: userId, name: user["name"] as? String ?? "FoodX")
        let finished = try await call("POST", "_app/passkey/register/finish", ["challenge": challenge, "credentialId": made.credentialId, "attestationObject": made.attestationObject, "clientDataJSON": made.clientDataJSON], auth: false)
        guard let draft = finished["draft"] as? JSON else { throw WindowError.bad("no genesis proposed") }
        // Never sign what the core does not read as a plain person genesis whose id is its content.
        guard (try? FoodBlock.hash(of: draft)) == draft["hash"] as? String, draft["type"] as? String == "actor", walk(draft, "state.kind") as? String == "person",
              (draft["refs"] as? JSON ?? [:]).isEmpty, walk(draft, "state.suite") as? String == "p256", let key = walk(draft, "state.public_key_sign") as? String else { throw WindowError.bad("the proposed genesis is not a person's") }
        let signed = try await sign(draft, credentialId: made.credentialId)
        guard FoodBlock.verify(draft, signed["signature"], key), Identity.genesisOpens(signed) else { throw WindowError.bad("the genesis key is not this passkey's") }
        let done = try await call("POST", "_app/passkey/register/complete", ["genesis": signed], auth: false)
        guard let id = done["person"] as? String, let credential = done["credential"] as? String, id == draft["hash"] as? String else { throw WindowError.bad("the host did not make the node") }
        person = id; token = credential; credentialId = made.credentialId
        try store.put("person", id); try store.put("credentialId", made.credentialId)
        _ = try? await blocks()   // seed what the phone can read (and compose against) offline
        return id
    }
    /// A passkey tap signs the host's challenge; the host answers with a window credential for this session.
    @discardableResult public func signIn() async throws -> String {
        let begin = try await call("POST", "_app/passkey/signin/begin", auth: false)
        guard let challenge = begin["challenge"] as? String else { throw WindowError.bad("no challenge") }
        let a = try await authenticator.assert(rpId: rpId, challenge: challenge, credentialId: credentialId)
        let done = try await call("POST", "_app/passkey/signin/finish", ["challenge": challenge, "credentialId": a.credentialId, "authenticatorData": a.authenticatorData, "clientDataJSON": a.clientDataJSON, "signature": a.signature], auth: false)
        guard let id = done["person"] as? String, let credential = done["credential"] as? String else { throw WindowError.bad("sign-in was not accepted") }
        person = id; token = credential; credentialId = a.credentialId
        try store.put("person", id); try store.put("credentialId", a.credentialId)
        _ = try? await blocks()
        return id
    }
    /// A link that ties a Google account to this same person (opens in the browser).
    public func googleLink() async throws -> URL {
        guard let s = try await call("POST", "_app/passkey/link/google")["url"] as? String, let u = URL(string: s) else { throw WindowError.bad("no link") }
        return u
    }

    // ---- read ----
    /// The person's blocks as the host shows them; offline, the last ones seen.
    public func blocks() async throws -> [JSON] {
        let id = try me()
        do {
            let answer = try await call("GET", "\(id)/window/blocks")
            let blocks = answer["blocks"] as? [JSON] ?? []
            try store.put("blocks", String(decoding: try JSONSerialization.data(withJSONObject: blocks, options: [.withoutEscapingSlashes]), as: UTF8.self))
            return blocks
        } catch WindowError.offline { return try cached() }
    }
    /// A fold computed on the host (`{ "$blocks": true }` stands for the person's blocks).
    public func fold(_ name: String, _ args: [Any] = []) async throws -> Any? {
        try await call("POST", "\(try me())/window/fold", ["name": name, "args": args])["result"]
    }
    private func cached() throws -> [JSON] {
        guard let t = try store.get("blocks"), let v = try? JSONSerialization.jsonObject(with: Data(t.utf8)) as? [JSON] else { return [] }
        return v
    }
    private func me() throws -> String { guard let p = person else { throw WindowError.notSignedIn }; return p }

    // ---- write ----
    private func sign(_ draft: JSON, credentialId: String?) async throws -> JSON {
        let challenge = try FoodBlock.passkeyChallenge(draft)    // from the block itself, never from what the host said
        let a = try await authenticator.assert(rpId: rpId, challenge: challenge, credentialId: credentialId)
        var signed = draft
        signed["signature"] = try FoodBlock.passkeySignature(authenticatorData: hex(a.authenticatorData), clientDataJSON: hex(a.clientDataJSON), signature: hex(a.signature))
        return signed
    }
    /// Write one block as the person. Online: the host proposes, the passkey signs, the host keeps it. Offline: composed here, signed, checked by the core, queued.
    /// The block never differs from what was asked: the draft the host proposes must carry exactly the asked type, fields and refs.
    @discardableResult public func write(_ type: String, _ state: JSON, _ refs: JSON = [:]) async throws -> Outcome {
        let id = try me()
        if try store.pending().isEmpty {   // a queue first: order matters in a chain
            do {
                let answer = try await call("POST", "\(id)/window/propose", ["type": type, "state": state, "refs": refs])
                guard let draft = answer["draft"] as? JSON, (try? FoodBlock.hash(of: draft)) == draft["hash"] as? String, draft["type"] as? String == type,
                      walk(draft, "refs.author") as? String == id else { throw WindowError.bad("the host proposed a different block") }
                for (k, v) in state where !sameJSON(walk(draft, "state.\(k)"), v) { throw WindowError.bad("the host changed \(k)") }
                for (k, v) in refs where !sameJSON(walk(draft, "refs.\(k)"), v) { throw WindowError.bad("the host changed ref \(k)") }
                let signed = try await sign(draft, credentialId: credentialId)
                _ = try await call("POST", "\(id)/window/submit", ["block": signed])
                return .submitted(signed)
            } catch WindowError.offline { /* fall through to the queue */ }
        }
        return .queued(try await compose(type, state, refs, id))
    }
    private func compose(_ type: String, _ state: JSON, _ refs: JSON, _ id: String) async throws -> JSON {
        let held = try cached() + store.items().map { $0.block }
        guard let genesis = held.first(where: { $0["hash"] as? String == id }), let key = walk(genesis, "state.public_key_sign") as? String else { throw WindowError.bad("this phone has not seen the person's genesis yet; connect once first") }
        let link = try Identity.nextLinkFor(id, key, held)
        let at = ISO8601DateFormatter.fractional.string(from: clock())
        let draft = try FoodBlock.compose(type, state, refs, author: id, audience: nil, at: at, link: link, suite: "p256")
        let faults = FoodBlock.refusals(draft["type"] as! String, draft["state"] as! JSON, draft["refs"] as! JSON)
        if !faults.isEmpty { throw FoodBlockError.refused(faults) }
        let signed = try await sign(draft, credentialId: credentialId)
        let problems = FoodBlock.valid(signed, held: held)
        if !problems.isEmpty { throw FoodBlockError.refused(problems) }
        try store.enqueue(signed)
        return signed
    }
    private func sameJSON(_ a: Any?, _ b: Any) -> Bool {
        guard let a = a else { return false }
        let x = try? JSONSerialization.data(withJSONObject: [a], options: [.sortedKeys]), y = try? JSONSerialization.data(withJSONObject: [b], options: [.sortedKeys])
        return x != nil && x == y
    }

    /// Hand the queue to the host, oldest first. Stops (nothing lost) when the host cannot be reached; a block the host refuses stays, marked with its reason.
    @discardableResult public func sync() async throws -> SyncReport {
        let id = try me()
        var report = SyncReport()
        for item in try store.pending() {
            do {
                _ = try await call("POST", "\(id)/window/submit", ["block": item.block])
                try store.taken(item.hash); report.taken.append(item.hash)
            } catch WindowError.offline { break
            } catch WindowError.refused(let code, let why) where code == 400 || code == 403 {
                try store.fail(item.hash, why); report.refused.append((item.hash, why))
            }
        }
        report.stillWaiting = try store.pending().count
        _ = try? await blocks()   // refresh what the phone can read offline
        return report
    }
    public func queued() throws -> [WindowStore.Item] { try store.items() }
}

extension ISO8601DateFormatter {
    static let fractional: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
}

/// A value inside nested JSON by a dotted path ("state.kind"), or nil.
func walk(_ value: Any?, _ path: String) -> Any? {
    var v = value
    for part in path.split(separator: ".") { v = (v as? JSON)?[String(part)] }
    return v
}
