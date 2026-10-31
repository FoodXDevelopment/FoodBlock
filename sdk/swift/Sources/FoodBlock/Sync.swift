import Foundation

/// The messages between nodes (spec/protocol.md §9, §10): thin calls into the Rust core.
public enum Sync {
    public static func pullRequest(since: Int = 0, limit: Int? = nil, filter: JSON? = nil, heads: Bool? = nil) throws -> JSON {
        var r: JSON = ["since": since]
        if let l = limit { r["limit"] = l }
        if let f = filter { r["filter"] = f }
        if let h = heads { r["heads"] = h }
        return try Door.pullRequest(r)
    }
    /// A signed pull: the request, plus signer, node and exactly one proof against replay (`counter` or `challenge`); no time.
    public static func signPull(_ request: JSON, signer: String, node: String, privateKey: String, suite: String? = nil, counter: Int? = nil, challenge: String? = nil) throws -> JSON {
        try Door.signPull(request, signOptions(signer, node, privateKey, suite, counter, challenge))
    }
    /// A signed push: the push, plus signer, node and one proof against replay.
    public static func signPush(_ push: JSON, signer: String, node: String, privateKey: String, suite: String? = nil, counter: Int? = nil, challenge: String? = nil) throws -> JSON {
        try Door.signPush(push, signOptions(signer, node, privateKey, suite, counter, challenge))
    }
    static func signOptions(_ signer: String, _ node: String, _ privateKey: String, _ suite: String?, _ counter: Int?, _ challenge: String?) -> JSON {
        var o: JSON = ["who": signer, "node": node, "private_key": privateKey]
        if let s = suite { o["suite"] = s }
        if let c = counter { o["counter"] = c }
        if let c = challenge { o["challenge"] = c }
        return o
    }
    /// A new challenge value a node hands out at its `challenge` endpoint.
    public static func newChallenge() throws -> String { try Door.newChallenge() }

    /// What the core wants to know of a node's memory: the signer's live keys, the highest counter seen from the signer, and the challenges issued and not yet used. No clock.
    static func fresh(_ node: String, _ keys: [String], _ highest: Int?, _ issued: [String]) -> JSON {
        ["node": node, "keys": keys, "highest": highest as Any? ?? NSNull(), "issued": issued]
    }
    public static func pullRefusals(_ message: JSON?, node: String, keys: [String] = [], highest: Int? = nil, issued: [String] = []) throws -> [FoodBlock.Finding] {
        FoodBlock.findings(try Door.pullRefusals(message ?? [:], fresh(node, keys, highest, issued)))
    }
    public static func pushRefusals(_ message: JSON?, node: String, keys: [String] = [], highest: Int? = nil, issued: [String] = []) throws -> [FoodBlock.Finding] {
        FoodBlock.findings(try Door.pushRefusals(message ?? [:], fresh(node, keys, highest, issued)))
    }
    public static func matches(_ block: JSON, _ filter: JSON?, _ held: [JSON] = []) throws -> Bool { try Door.matches(block, filter, held) }
    public static func headsOf(_ blocks: [JSON]) throws -> [JSON] { try Door.headsOf(blocks) }

    /// One block a node holds: its arrival number `n`, the block, and (for a sealed one) its signed header and the
    /// copies sealed to each recipient id.
    public struct Arrival {
        public let n: Int, block: JSON
        public var header: JSON?, headerSignature: String?, copies: [String: JSON]
        public init(n: Int, block: JSON, header: JSON? = nil, headerSignature: String? = nil, copies: [String: JSON] = [:]) {
            self.n = n; self.block = block; self.header = header; self.headerSignature = headerSignature; self.copies = copies
        }
        var json: JSON { ["n": n, "block": block, "header": header as Any? ?? NSNull(), "header_signature": headerSignature as Any? ?? NSNull(), "copies": copies] }
    }
    /// The node's answer to a pull. The node states both choices: `cap` (at least 1; a pull's own `limit` is cut to it) and
    /// `servesPairs` (true: a fork's other half travels with its proof; false: only what matches). The core fills neither.
    public static func answerPull(_ log: [Arrival], _ request: JSON = [:], node: String, privateKey: String? = nil, cap: Int, servesPairs: Bool, signer: String? = nil, held: [JSON]? = nil, suite: String? = nil, through: Int? = nil) throws -> JSON {
        try Door.answerPull(log.map { $0.json }, request, node, privateKey, ["cap": cap, "serves_pairs": servesPairs], signer, held, suite, through)
    }
    public static func answerSignedBy(_ answer: JSON, _ nodeKeys: [String]) throws -> Bool { try Door.answerSignedBy(answer, nodeKeys) }
    public static func pushRequest(_ messages: [JSON], for forWhom: JSON? = nil) throws -> JSON { try Door.pushRequest(messages, forWhom) }

    public struct Waiting { public let hash: String, needs: [String] }
    /// One refusal: { hash, code, detail }, its code from protocol.json's refusals.codes.
    public struct Refusal: Equatable {
        public let hash: String, code: String?, detail: String?
        public init(hash: String, code: String?, detail: String?) { self.hash = hash; self.code = code; self.detail = detail }
    }
    /// What a node takes of a push.
    public struct Accepted {
        public internal(set) var taken: [JSON] = []
        public internal(set) var waiting: [Waiting] = []
        public internal(set) var refused: [Refusal] = []
        public internal(set) var equivocations: [[String]] = []
    }
    /// What a node takes of a push: { taken, waiting, refused: [{ hash, code, detail }], equivocations }.
    /// Validity reads no arrival (core.md, section 8). `taken` are found by the id the core computed, in the suite of the key that signed each (core.md, section 2).
    /// `takesPairs` is the node's choice: false keeps both blocks of a pair arriving together out of `taken` (both are listed in `equivocations` and kept); true takes them too.
    public static func accept(_ incoming: [JSON], _ held: [JSON] = [], takesPairs: Bool, schemas: [String: JSON]? = nil) throws -> Accepted {
        let r = try Door.accept(incoming, held, ["takes_pairs": takesPairs], schemas.map { Array($0.values) })
        let byHash = Dictionary(incoming.compactMap { b in (b["hash"] as? String).map { ($0, b) } }, uniquingKeysWith: { _, last in last })
        var out = Accepted()
        for id in r["taken"] as? [String] ?? [] {
            if let b = byHash[id] { out.taken.append(b); continue }
            // a key's first block after a move to a suite of another hash has an id its bytes alone do not show
            for b in incoming { if try Door.idOf(b, held + incoming) == id { var named = b; named["hash"] = id; out.taken.append(named); break } }
        }
        out.waiting = (r["waiting"] as? [JSON] ?? []).map { Waiting(hash: $0["hash"] as? String ?? "", needs: $0["needs"] as? [String] ?? []) }
        out.refused = (r["refused"] as? [JSON] ?? []).map { Refusal(hash: $0["hash"] as? String ?? "", code: $0["code"] as? String, detail: $0["detail"] as? String) }
        out.equivocations = r["equivocations"] as? [[String]] ?? []
        return out
    }
    /// What a node takes of the sealed blocks of a push: the core checks each public header (a key of its author that speaks for it opens its signature; the same key's next seq; no rival) once the block it names in prev is held. `taken` are hashes.
    public static func acceptSealed(_ incoming: [JSON], _ held: [JSON] = [], takesPairs: Bool) throws -> JSON {
        try Door.acceptSealed(incoming, held, ["takes_pairs": takesPairs])
    }
    public static func waitedTooLong(_ since: String, _ now: String, _ ttl: Double) throws -> Bool {
        // a time to wait that is not a whole number of milliseconds a 64-bit integer holds is an error, never a trap
        guard ttl.isFinite, ttl.rounded() == ttl, abs(ttl) <= 9_007_199_254_740_991 else { throw FoodBlockError.invalid("foodblock: the time to wait is a whole number of milliseconds") }
        return try Door.waitedTooLong(since, now, Int(ttl))
    }

    public static func pushAnswer(_ result: Accepted, node: String, privateKey: String, suite: String? = nil) throws -> JSON {
        try pushAnswer(taken: result.taken.compactMap { $0["hash"] as? String }, waiting: result.waiting.map { $0.hash }, refused: result.refused,
                       equivocations: result.equivocations, node: node, privateKey: privateKey, suite: suite)
    }
    /// A push answer from its parts (hashes).
    public static func pushAnswer(taken: [String] = [], waiting: [String] = [], refused: [Refusal] = [], equivocations: [[String]] = [], node: String, privateKey: String, suite: String? = nil) throws -> JSON {
        let parts: JSON = ["taken": taken, "waiting": waiting, "equivocations": equivocations,
                           "refused": refused.map { ["hash": $0.hash, "code": $0.code ?? NSNull(), "detail": $0.detail ?? NSNull()] as JSON }]
        return try Door.pushAnswer(parts, node, privateKey, suite)
    }

    public static func wellKnown(node: String, holds: [String] = [], speaksFor: [String] = [], admission: String?, endpoints: [String: String] = [:]) throws -> JSON {
        try Door.wellKnown(node, holds, speaksFor, admission, endpoints)
    }
    public static func announcement(_ doc: JSON) throws -> JSON { try Door.announcement(doc) }
    public static func wellKnownErrors(_ doc: JSON?) throws -> [String] { try Door.wellKnownErrors(doc ?? [:]) }
}
