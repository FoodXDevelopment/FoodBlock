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
    /// A signed pull: the request, plus signer, node and exactly one proof against replay (`counter` or `challenge`); no time.
    public static func signPull(_ request: JSON, signer: String, node: String, privateKey: String, suite: String? = nil, counter: Int? = nil, challenge: String? = nil) throws -> JSON {
        try Core.json("sign_pull", request, signOptions(signer, node, privateKey, suite, counter, challenge))
    }
    /// A signed push: the push, plus signer, node and one proof against replay.
    public static func signPush(_ push: JSON, signer: String, node: String, privateKey: String, suite: String? = nil, counter: Int? = nil, challenge: String? = nil) throws -> JSON {
        try Core.json("sign_push", push, signOptions(signer, node, privateKey, suite, counter, challenge))
    }
    static func signOptions(_ signer: String, _ node: String, _ privateKey: String, _ suite: String?, _ counter: Int?, _ challenge: String?) -> JSON {
        var o: JSON = ["who": signer, "node": node, "private_key": privateKey]
        if let s = suite { o["suite"] = s }
        if let c = counter { o["counter"] = c }
        if let c = challenge { o["challenge"] = c }
        return o
    }
    /// A new challenge value a node hands out at its `challenge` endpoint.
    public static func newChallenge() -> String { (try? Core.string("new_challenge")) ?? "" }

    /// What the core wants to know of a node's memory: the signer's live keys, the highest counter seen from the signer, and the challenges issued and not yet used. No clock.
    static func fresh(_ node: String, _ keys: [String], _ highest: Int?, _ issued: [String]) -> JSON {
        ["node": node, "keys": keys, "highest": highest as Any? ?? NSNull(), "issued": issued]
    }
    public static func pullRefusals(_ message: JSON?, node: String, keys: [String] = [], highest: Int? = nil, issued: [String] = []) -> [FoodBlock.Finding] {
        FoodBlock.findings(Core.maybe("pull_refusals", message ?? [:], fresh(node, keys, highest, issued)))
    }
    public static func pushRefusals(_ message: JSON?, node: String, keys: [String] = [], highest: Int? = nil, issued: [String] = []) -> [FoodBlock.Finding] {
        FoodBlock.findings(Core.maybe("push_refusals", message ?? [:], fresh(node, keys, highest, issued)))
    }
    public static func pullErrors(_ message: JSON?, node: String, keys: [String] = [], highest: Int? = nil, issued: [String] = []) -> [String] {
        Core.strings("pull_errors", message ?? [:], fresh(node, keys, highest, issued))
    }
    public static func pushErrors(_ message: JSON?, node: String, keys: [String] = [], highest: Int? = nil, issued: [String] = []) -> [String] {
        Core.strings("push_errors", message ?? [:], fresh(node, keys, highest, issued))
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
    public static func answerPull(_ log: [Arrival], _ request: JSON = [:], node: String, privateKey: String? = nil, cap: Int = 500, signer: String? = nil, held: [JSON]? = nil, suite: String = "std") throws -> JSON {
        try Core.json("answer_pull", log.map { $0.json }, request, node, privateKey, cap, signer, held, suite)
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

    public static func pushAnswer(_ result: Accepted, node: String, privateKey: String, suite: String = "std") throws -> JSON {
        try pushAnswer(taken: result.taken.compactMap { $0["hash"] as? String }, waiting: result.waiting.map { $0.hash }, refused: result.refused,
                       equivocations: result.equivocations, node: node, privateKey: privateKey, suite: suite)
    }
    /// A push answer from its parts (hashes).
    public static func pushAnswer(taken: [String] = [], waiting: [String] = [], refused: [Refusal] = [], equivocations: [[String]] = [], node: String, privateKey: String, suite: String = "std") throws -> JSON {
        let parts: JSON = ["taken": taken, "waiting": waiting, "equivocations": equivocations,
                           "refused": refused.map { ["hash": $0.hash, "code": $0.code ?? NSNull(), "detail": $0.detail ?? NSNull()] as JSON }]
        return try Core.json("push_answer", parts, node, privateKey, suite)
    }

    public static func wellKnown(node: String, holds: [String] = [], speaksFor: [String] = [], admission: String? = nil, endpoints: [String: String] = [:]) -> JSON {
        (try? Core.json("well_known", node, holds, speaksFor, admission, endpoints)) ?? [:]
    }
    public static func announcement(_ doc: JSON) -> JSON { (try? Core.json("announcement", doc)) ?? [:] }
    public static func wellKnownErrors(_ doc: JSON?) -> [String] { Core.strings("well_known_errors", doc ?? [:]) }
}
