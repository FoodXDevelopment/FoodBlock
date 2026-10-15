import Foundation

/// Between nodes (spec/protocol.md §10, Encoding: Messages): two messages, Pull and Push. Pull asks for the blocks the
/// asker may see since the responder's arrival number (never a time); `heads: true` returns only the heads among the
/// matches. A signed pull names the asker, the node it is for, a fresh nonce and `at`. Push sends signed blocks; a node
/// takes those signed by a live key of their author that pass the write check, holds back (waiting) those whose prev
/// it lacks, lists the second of two blocks at one seq beside the first (`equivocations`), and refuses the rest, each
/// { hash, code, detail } with a code from protocol.json's refusals.codes. Every node answer is signed by the node.
public enum Sync {
    static func pick(_ o: JSON, _ keys: [String]) -> JSON { o.filter { keys.contains($0.key) && has($0.value) } }

    // ---- Pull ----
    /// A pull: { since (exclusive arrival number, 0 from the start), limit (the asker's wish), filter, heads }.
    public static func pullRequest(since: Int = 0, limit: Int? = nil, filter: JSON? = nil, heads: Bool? = nil) -> JSON {
        pick(["since": since, "limit": limit as Any? ?? NSNull(), "filter": filter as Any? ?? NSNull(), "heads": heads as Any? ?? NSNull()], FoodBlock.message("pull"))
    }

    /// A signed pull: the request, plus asker, node, a fresh nonce and at, signed by one of the asker's keys.
    public static func signPull(_ request: JSON, asker: String, node: String, privateKey: String, nonce: String = FoodBlock.newSalt(), at: String = nowISO()) throws -> JSON {
        var m = pick(request, FoodBlock.message("pull"))
        m["asker"] = asker; m["node"] = node; m["nonce"] = nonce; m["at"] = at
        return try FoodBlock.signMessage(m, privateKey: privateKey)
    }

    /// Why a node refuses a signed message (a pull, or a push: `fields` its keys), for the node `node` whose clock reads
    /// `now`: [{ code, detail }] with codes from protocol.json's refusals.codes.message, [] when it may be answered.
    /// `keys` are the signer's live signing keys; `seen(nonce)` says whether the node has seen this nonce; `window` (ms,
    /// default limits.signed_window) is how far `at` may be from its own clock.
    public static func messageRefusals(_ message: JSON?, node: String, now: String = nowISO(), keys: [String] = [], seen: (String) -> Bool = { _ in false },
                                       window: Double = FoodBlock.signedWindow, fields given: [String]? = nil) -> [FoodBlock.Finding] {
        let m = message ?? [:], fields = given ?? FoodBlock.message("signed_pull")
        func w(_ code: String, _ detail: String) -> FoodBlock.Finding { FoodBlock.Finding(code: code, detail: detail) }
        var out: [FoodBlock.Finding] = []
        if !m.keys.allSatisfy(fields.contains) { out.append(w("bad_signature", "a signed message is { \(fields.joined(separator: ", ")) }")) }
        if m["node"] as? String != node { out.append(w("wrong_node", "the message names another node")) }
        if FoodBlock.test("nonce", m["nonce"] ?? "") { if seen(m["nonce"] as! String) { out.append(w("replay", "this nonce was seen: a replay")) } } else { out.append(w("replay", "a signed message carries a fresh nonce")) }
        if !(FoodBlock.test("time", m["at"] ?? "") && (parseTime(m["at"]).flatMap { a in parseTime(now).map { abs(a - $0) <= window } } ?? false)) { out.append(w("window", "its at is outside this node's window")) }
        if !keys.contains(where: { FoodBlock.verifyMessage(m, $0) }) { out.append(w("bad_signature", "it is not signed by its signer")) }
        return FoodBlock.ordered(out, FoodBlock.refusalCodes["message"]!)
    }
    /// Why a node refuses a signed pull: [{ code, detail }].
    public static func pullRefusals(_ message: JSON?, node: String, now: String = nowISO(), keys: [String] = [], seen: (String) -> Bool = { _ in false }, window: Double = FoodBlock.signedWindow) -> [FoodBlock.Finding] {
        messageRefusals(message, node: node, now: now, keys: keys, seen: seen, window: window, fields: FoodBlock.message("signed_pull"))
    }
    /// Why a node refuses a signed push: [{ code, detail }].
    public static func pushRefusals(_ message: JSON?, node: String, now: String = nowISO(), keys: [String] = [], seen: (String) -> Bool = { _ in false }, window: Double = FoodBlock.signedWindow) -> [FoodBlock.Finding] {
        messageRefusals(message, node: node, now: now, keys: keys, seen: seen, window: window, fields: FoodBlock.message("signed_push"))
    }
    /// What is wrong with a signed pull, in plain words: [] when it may be answered.
    public static func pullErrors(_ message: JSON?, node: String, now: String = nowISO(), keys: [String] = [], seen: (String) -> Bool = { _ in false }, window: Double = FoodBlock.signedWindow) -> [String] {
        pullRefusals(message, node: node, now: now, keys: keys, seen: seen, window: window).map { $0.detail }
    }

    /// Whether a block matches a pull filter (every key, ANDed; `type` read through aliases). `held` resolves records.
    public static func matches(_ block: JSON, _ filter: JSON?, _ held: [JSON] = []) -> Bool {
        guard let f = filter, !f.isEmpty else { return true }
        let read = FoodBlock.readAs(block)
        if let t = f["type"], !(read["type"] as? String == t as? String) { return false }
        if let k = f["kind"], stableJSON(dig(read, "state.kind")) != stableJSON(k) { return false }
        if let a = f["author"], !(dig(block, "refs.author") as? String == a as? String) { return false }
        if let h = f["hash"], !(block["hash"] as? String == h as? String) { return false }
        if let r = f["record"] as? String, !recordOf(block, held).contains(r) { return false }
        return (obj(f["refs"]) ?? [:]).allSatisfy { key, h in list(dig(read, "refs.\(key)")).contains(h as? String ?? "\u{0}") }
    }
    // Every first version a block is a version of (itself, and back through `updates`).
    static func recordOf(_ block: JSON, _ held: [JSON]) -> [String] {
        let byHash = Index(held)
        var out: [String] = [], seen = Set<String>()
        func walk(_ one: JSON) {
            let h = one["hash"] as? String ?? ""
            if seen.contains(h) { return }
            seen.insert(h); out.append(h)
            for u in list(dig(one, "refs.updates")) { walk(byHash[u] ?? ["hash": u, "refs": JSON()]) }
        }
        walk(block)
        return out
    }
    /// The heads among blocks: those no other among them names by prev or updates.
    public static func headsOf(_ blocks: [JSON]) -> [JSON] {
        let named = Set(blocks.flatMap { list(dig($0, "refs.prev")) + list(dig($0, "refs.updates")) })
        return blocks.filter { !named.contains($0["hash"] as? String ?? "") }
    }

    /// One block a node holds: its arrival number `n`, the block, and (for a sealed one) its signed header and the
    /// copies sealed to each recipient id.
    public struct Arrival {
        public let n: Int, block: JSON
        public var header: JSON?, headerSignature: String?, copies: [String: JSON]
        public init(n: Int, block: JSON, header: JSON? = nil, headerSignature: String? = nil, copies: [String: JSON] = [:]) {
            self.n = n; self.block = block; self.header = header; self.headerSignature = headerSignature; self.copies = copies
        }
    }

    /// Answer a pull from a node's arrival log. A public block travels whole; a sealed one as its header, or, to a
    /// signed pull's asker, the copy sealed to them. Signed by the node: { node, request, blocks: [{ n, message }], next,
    /// signature }. `cap` is the responder's own limit.
    public static func answerPull(_ log: [Arrival], _ request: JSON = [:], node: String, privateKey: String? = nil, cap: Int = 500, held: [JSON]? = nil) throws -> JSON {
        let asker = request["asker"] as? String
        let since = intOf(request["since"]) ?? 0, limit = min(intOf(request["limit"]) ?? cap, cap)
        let all = held ?? log.map { $0.block }
        var found = log.filter { $0.n > since && matches($0.block, obj(request["filter"]), all) }.sorted { $0.n < $1.n }
        if truthy(request["heads"]) {
            let heads = Set(headsOf(found.map { $0.block }).map { $0["hash"] as? String ?? "" })
            found = found.filter { heads.contains($0.block["hash"] as? String ?? "") }
        }
        found = Array(found.prefix(max(limit, 0)))
        func messageOf(_ e: Arrival) throws -> JSON {
            if dig(e.block, "state.audience") as? String == "public" || !(dig(e.block, "state.audience") is [Any]) { return FoodBlock.wrap(e.block) }
            if let a = asker, let copy = e.copies[a] { return copy }
            return ["version": FoodBlock.version, "header": try e.header ?? FoodBlock.header(e.block), "header_signature": e.headerSignature ?? NSNull()]
        }
        var answer: JSON = ["node": node, "request": FoodBlock.sha256Hex(try FoodBlock.canonicalJSON(request)),
                            "blocks": try found.map { ["n": $0.n, "message": try messageOf($0)] as JSON }, "next": found.last?.n ?? since]
        if let k = privateKey { answer = try FoodBlock.signMessage(answer, privateKey: k) }
        return answer
    }

    /// Whether a node's answer (pull or push) is signed by one of the node's keys.
    public static func answerSignedBy(_ answer: JSON, _ nodeKeys: [String]) -> Bool { nodeKeys.contains { FoodBlock.verifyMessage(answer, $0) } }

    // ---- Push ----
    public static func pushRequest(_ messages: [JSON], for forWhom: JSON? = nil) -> JSON {
        pick(["messages": messages, "for": forWhom as Any? ?? NSNull()], FoodBlock.message("push"))
    }

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

    /// What a node takes of a push: { taken, waiting, refused: [{ hash, code, detail }], equivocations }. Genesis blocks
    /// are read first. A block without seq is taken only as history: an older identity's, while its history is open or
    /// inside its closed history. A 1.6 block passes the write check and is signed by a key of its author that speaks for
    /// it (`bad_signature` when no key of the author opens it, `void_key` when one does but does not speak); one whose
    /// key's previous block is not held waits. The second of two blocks from one key at one seq is neither taken nor
    /// refused: the pair is listed in `equivocations` (sorted), and the node keeps both as proof.
    public static func accept(_ incoming: [JSON], _ held: [JSON] = [], arrivedAt: Identity.Arrival? = nil, schemas: [String: JSON]? = nil) -> Accepted {
        let known = Index(held + incoming)
        var out = Accepted()
        var slots: [String: String] = [:]
        func slot(_ b: JSON) -> String? {
            guard let author = dig(b, "refs.author") as? String,
                  let key = Identity.signerOf(b, Identity.keyTimeline(author, known)) else { return nil }
            return "\(author) \(key) \(stableJSON(dig(b, "state.seq")))"
        }
        for b in held where isInteger(dig(b, "state.seq")) && truthy(dig(b, "refs.author")) { if let at = slot(b) { slots[at] = b["hash"] as? String } }
        func refuse(_ b: JSON, _ code: String, _ detail: String) { out.refused.append(Refusal(hash: b["hash"] as? String ?? "", code: code, detail: detail)) }
        // Not the author's: no key of the author opens it (bad_signature), or one does but does not speak for it (void_key).
        func unsigned(_ b: JSON) {
            if Identity.isGenesis(b) { return refuse(b, "bad_genesis", "a genesis is signed by its own key") }
            let opened = Identity.signerOf(b, Identity.keyTimeline(dig(b, "refs.author") as? String ?? "", known)) != nil
                || (dig(b, "state.recovery_key") as? String).map { Identity.opens(b, $0) } == true
            if opened { refuse(b, "void_key", "signed by a key of its author that does not speak for it: void, frozen, or rotated past last_good") }
            else { refuse(b, "bad_signature", "its signature opens with no key of its author") }
        }
        for block in FoodBlock.causalOrder(incoming) {
            let h = block["hash"] as? String ?? ""
            if !Identity.isGenesis(block) && dig(block, "state.seq") == nil {
                let root = known[dig(block, "refs.author") as? String]
                if let r = root, Identity.is16Genesis(r) { refuse(block, "no_history", "a 1.6 identity has no history: a block without seq is refused"); continue }
                let rh = root?["hash"] as? String
                if let rh = rh, !Identity.historyCounts(block, rh, known) { refuse(block, "history_closed", "history is closed: it is in neither the first 1.6 block's causal past nor its manifest"); continue }
                if !Identity.signedByAuthor(block, known, arrivedAt: arrivedAt) { unsigned(block); continue }
                out.taken.append(block); continue
            }
            let wrong = FoodBlock.refusals(block["type"] as? String ?? "", obj(block["state"]) ?? [:], obj(block["refs"]) ?? [:], schemas: schemas)
            if !wrong.isEmpty { for f in wrong { refuse(block, f.code, f.detail) }; continue }
            if !Identity.isGenesis(block), let prev = dig(block, "refs.prev") as? String, !known.contains(prev) { out.waiting.append(Waiting(hash: h, needs: [prev])); continue }
            if !Identity.signedByAuthor(block, known, arrivedAt: arrivedAt) { unsigned(block); continue }
            if block["type"] as? String == "grant", dig(block, "state.kind") as? String == "key", let replaces = dig(block, "state.replaces") as? String, dig(block, "state.recovery_key") == nil,
               Identity.signerOf(block, Identity.keyTimeline(dig(block, "refs.author") as? String ?? "", known)) != replaces {
                refuse(block, "not_own_rotation", "a key is rotated only by itself or by the recovery key"); continue
            }
            let at = isInteger(dig(block, "state.seq")) ? slot(block) : nil
            // The second of a pair: neither taken nor refused, listed with the first. The node keeps both and serves them together.
            if let at = at, let other = slots[at], other != h { out.equivocations.append(sortedJS([other, h])); continue }
            if let at = at { slots[at] = h }
            out.taken.append(block)
        }
        return out
    }

    /// Whether a waiting block has waited past the node's own time to live (`ttl` ms since it arrived).
    public static func waitedTooLong(_ since: String, _ now: String, _ ttl: Double) -> Bool {
        guard let a = parseTime(since), let b = parseTime(now) else { return false }
        return b - a > ttl
    }

    /// A node's signed answer to a push (signed by a key of its holder, a person or a machine, brought in by a key grant):
    /// { node, taken, waiting, refused: [{ hash, code, detail }], equivocations: [[hash, hash]], signature }. Every key is
    /// always there; an empty list is []. Each pair is sorted as text.
    public static func pushAnswer(_ result: Accepted, node: String, privateKey: String) throws -> JSON {
        try pushAnswer(taken: result.taken.compactMap { $0["hash"] as? String }, waiting: result.waiting.map { $0.hash }, refused: result.refused,
                       equivocations: result.equivocations, node: node, privateKey: privateKey)
    }
    /// A push answer from its parts (hashes).
    public static func pushAnswer(taken: [String] = [], waiting: [String] = [], refused: [Refusal] = [], equivocations: [[String]] = [], node: String, privateKey: String) throws -> JSON {
        try FoodBlock.signMessage(["node": node, "taken": taken, "waiting": waiting,
                                   "refused": refused.map { ["hash": $0.hash, "code": $0.code ?? NSNull(), "detail": $0.detail ?? NSNull()] as JSON },
                                   "equivocations": equivocations.map(sortedJS)], privateKey: privateKey)
    }

    // ---- Discovery ----
    /// What a node publishes at `.well-known/foodblock`.
    public static func wellKnown(node: String, holds: [String] = [], speaksFor: [String] = [], admission: String? = nil, endpoints: [String: String] = [:]) -> JSON {
        var ends = JSON()
        for key in FoodBlock.message("endpoints") { ends[key] = endpoints[key] ?? NSNull() }
        return ["protocol": "foodblock", "version": FoodBlock.version, "node": node, "holds": holds, "speaks_for": speaksFor, "admission": admission ?? NSNull(), "endpoints": ends]
    }
    /// A local announcement (mDNS / DNS-SD or a short-range link): { protocol, version, node, endpoints }.
    public static func announcement(_ doc: JSON) -> JSON { pick(doc, FoodBlock.message("announcement")) }

    /// What is wrong with a `.well-known/foodblock` document, in plain words.
    public static func wellKnownErrors(_ doc: JSON?) -> [String] {
        guard let d = doc, d["protocol"] as? String == "foodblock" else { return ["protocol is \"foodblock\""] }
        let discovery = FoodBlock.message("discovery"), endpoints = FoodBlock.message("endpoints")
        var out = d.keys.sorted(by: jsLess).filter { !discovery.contains($0) }.map { "\($0) is not part of discovery (\(discovery.joined(separator: ", ")))" }
        if !(d["version"] is String) { out.append("version names the rules the node speaks") }
        if !FoodBlock.test("hash", d["node"] ?? "") { out.append("node is the id of the node (an actor)") }
        for key in ["holds", "speaks_for"] where !((d[key] as? [Any])?.allSatisfy { FoodBlock.test("hash", $0) } ?? false) { out.append("\(key) lists ids (hashes)") }
        if !(d["admission"] is NSNull || FoodBlock.test("hash", d["admission"] ?? "")) { out.append("admission is the hash of the admission block") }
        let e = obj(d["endpoints"])
        if !(e.map { e in e.keys.allSatisfy(endpoints.contains) && endpoints.allSatisfy { e[$0] is NSNull || FoodBlock.matches("^https?://", e[$0]) } } ?? false) {
            out.append("endpoints: { \(endpoints.joined(separator: ", ")) } are URLs")
        }
        return out
    }
}
