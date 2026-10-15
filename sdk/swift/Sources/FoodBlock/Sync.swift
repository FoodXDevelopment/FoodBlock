import Foundation

/// The messages between nodes (spec/protocol.md §9, §10): thin calls into the Rust core.
public enum Sync {
    public static func pullRequest(since: Int = 0, limit: Int? = nil, filter: JSON? = nil, heads: Bool? = nil) -> JSON {
        var r: JSON = ["since": since]
        if let l = limit { r["limit"] = l }
        if let f = filter { r["filter"] = f }
        if let h = heads { r["heads"] = h }
        return (try? Core.json("pull_request", r)) ?? r
    }
    public static func signPull(_ request: JSON, asker: String, node: String, privateKey: String, nonce: String? = nil, at: String? = nil) throws -> JSON {
        var o: JSON = ["who": asker, "node": node, "private_key": privateKey]
        if let n = nonce { o["nonce"] = n }
        if let a = at { o["at"] = a }
        return try Core.json("sign_pull", request, o)
    }

    /// The node's clock and memory as data: `seen(nonce)` is asked of the message's own nonce.
    static func fresh(_ message: JSON?, _ node: String, _ now: String?, _ keys: [String], _ seen: (String) -> Bool, _ window: Double?) -> JSON {
        var o: JSON = ["node": node, "keys": keys]
        if let n = now { o["now"] = n }
        if let w = window { o["window_ms"] = Int(w) }
        if let nonce = message?["nonce"] as? String, seen(nonce) { o["seen"] = [nonce] }
        return o
    }
    public static func pullRefusals(_ message: JSON?, node: String, now: String? = nil, keys: [String] = [], seen: (String) -> Bool = { _ in false }, window: Double? = nil) -> [FoodBlock.Finding] {
        FoodBlock.findings(Core.maybe("pull_refusals", message ?? [:], fresh(message, node, now, keys, seen, window)))
    }
    public static func pushRefusals(_ message: JSON?, node: String, now: String? = nil, keys: [String] = [], seen: (String) -> Bool = { _ in false }, window: Double? = nil) -> [FoodBlock.Finding] {
        FoodBlock.findings(Core.maybe("push_refusals", message ?? [:], fresh(message, node, now, keys, seen, window)))
    }
    public static func pullErrors(_ message: JSON?, node: String, now: String? = nil, keys: [String] = [], seen: (String) -> Bool = { _ in false }, window: Double? = nil) -> [String] {
        Core.strings("pull_errors", message ?? [:], fresh(message, node, now, keys, seen, window))
    }
    public static func matches(_ block: JSON, _ filter: JSON?, _ held: [JSON] = []) -> Bool { Core.bool("matches", block, filter, held) }
    public static func headsOf(_ blocks: [JSON]) -> [JSON] { (Core.maybe("heads_of", blocks) as? [JSON]) ?? [] }

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
    public static func answerPull(_ log: [Arrival], _ request: JSON = [:], node: String, privateKey: String? = nil, cap: Int = 500, held: [JSON]? = nil) throws -> JSON {
        try Core.json("answer_pull", log.map { $0.json }, request, node, privateKey, cap)
    }
    public static func answerSignedBy(_ answer: JSON, _ nodeKeys: [String]) -> Bool { Core.bool("answer_signed_by", answer, nodeKeys) }
    public static func pushRequest(_ messages: [JSON], for forWhom: JSON? = nil) -> JSON { (try? Core.json("push_request", messages, forWhom)) ?? [:] }

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
    public static func accept(_ incoming: [JSON], _ held: [JSON] = [], arrivedAt: Identity.Arrival? = nil, schemas: [String: JSON]? = nil) -> Accepted {
        let r = (try? Core.json("accept", incoming, held, Identity.log(arrivedAt, held), schemas.map { Array($0.values) })) ?? [:]
        let byHash = Dictionary(incoming.compactMap { b in (b["hash"] as? String).map { ($0, b) } }, uniquingKeysWith: { _, last in last })
        var out = Accepted()
        out.taken = (r["taken"] as? [String] ?? []).compactMap { byHash[$0] }
        out.waiting = (r["waiting"] as? [JSON] ?? []).map { Waiting(hash: $0["hash"] as? String ?? "", needs: $0["needs"] as? [String] ?? []) }
        out.refused = (r["refused"] as? [JSON] ?? []).map { Refusal(hash: $0["hash"] as? String ?? "", code: $0["code"] as? String, detail: $0["detail"] as? String) }
        out.equivocations = r["equivocations"] as? [[String]] ?? []
        return out
    }
    public static func waitedTooLong(_ since: String, _ now: String, _ ttl: Double) -> Bool { Core.bool("waited_too_long", since, now, Int(ttl)) }

    public static func pushAnswer(_ result: Accepted, node: String, privateKey: String) throws -> JSON {
        try pushAnswer(taken: result.taken.compactMap { $0["hash"] as? String }, waiting: result.waiting.map { $0.hash }, refused: result.refused,
                       equivocations: result.equivocations, node: node, privateKey: privateKey)
    }
    /// A push answer from its parts (hashes).
    public static func pushAnswer(taken: [String] = [], waiting: [String] = [], refused: [Refusal] = [], equivocations: [[String]] = [], node: String, privateKey: String) throws -> JSON {
        let parts: JSON = ["taken": taken, "waiting": waiting, "equivocations": equivocations,
                           "refused": refused.map { ["hash": $0.hash, "code": $0.code ?? NSNull(), "detail": $0.detail ?? NSNull()] as JSON }]
        return try Core.json("push_answer", parts, node, privateKey)
    }

    public static func wellKnown(node: String, holds: [String] = [], speaksFor: [String] = [], admission: String? = nil, endpoints: [String: String] = [:]) -> JSON {
        (try? Core.json("well_known", node, holds, speaksFor, admission, endpoints)) ?? [:]
    }
    public static func announcement(_ doc: JSON) -> JSON { (try? Core.json("announcement", doc)) ?? [:] }
    public static func wellKnownErrors(_ doc: JSON?) -> [String] { Core.strings("well_known_errors", doc ?? [:]) }
}
