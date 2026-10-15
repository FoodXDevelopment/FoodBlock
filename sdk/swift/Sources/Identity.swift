import Foundation

/// Who someone is (spec/protocol.md §2). Their genesis is the one block with no author: a public `actor` naming its
/// own signing key, its encryption key, the hash of an offline recovery key and how far back that key may reach, signed
/// by its own key. Its hash is their id. A key comes in by a `grant` of kind key. A rotation (`replaces` and
/// `last_good`) voids the old key's blocks after its last good block, and is signed only by that key or by the recovery
/// key. A key brought in by a void block is void, and so is every key it brought in. Two rotations of one key that do
/// not see each other freeze the keys they bring in, until the recovery key settles it; two recovery rotations that do
/// not see each other end the identity. Recovery reach is read from arrival on the reader's node (`arrivedAt`), never
/// from `at`. History is closed: a block without seq counts only in the causal past of an older identity's first 1.6
/// block, or in its manifest.
public enum Identity {
    /// When a block arrived on this node (an ISO time), for recovery reach.
    public typealias Arrival = (String) -> String?

    /// One key an id has held: who brought it in (`by`), which key signed that (`signer`: a key, "recovery", or nil
    /// for the genesis), and whether it is void or frozen.
    public final class KeyEntry {
        public let key: String, by: String, signer: String?
        public internal(set) var void = false, frozen = false
        init(key: String, by: String, signer: String?) { self.key = key; self.by = by; self.signer = signer }
    }
    struct Rotation: Equatable {
        let by: String, all: [String], lastGood: String?, recovery: Bool, floor: String?
    }
    /// What an id's keys are, read from its chain alone.
    public struct State {
        public let keys: [KeyEntry]
        let rotations: [String: Rotation]
        /// The recovery keys proven by a signature.
        public let recovery: [String]
        /// When two recovery rotations crossed: their hashes (the identity has ended).
        public let ended: [String]?
    }

    static func opens(_ block: JSON?, _ publicKey: String?) -> Bool {
        guard let block = block, let sig = block["signature"] as? String, !sig.isEmpty, let pub = publicKey else { return false }
        return FoodBlock.verify(block, sig, pub)
    }

    /// The recovery key's hash, as a genesis names it: SHA-256 of its SPKI hex, as UTF-8 text.
    public static func recoveryKeyHash(_ publicKeyHex: String) -> String { FoodBlock.sha256Hex(publicKeyHex) }

    /// A new person, agent, machine or signing circle: their genesis, signed. A 1.6 genesis names the recovery key (only
    /// its hash is written) and its reach, and the encryption key (X25519 public) if the identity will receive sealed
    /// blocks: a micro that only signs leaves it out and adds one later by a key grant.
    public static func genesis(_ keys: Keypair, kind: String = "person", at: String = nowISO(), encryptionKey: String? = nil, recoveryKey: String?, reach: String = "P30D") throws -> JSON {
        guard let rec = recoveryKey else { throw FoodBlockError.invalid("identity: a 1.6 genesis names its recovery key") }
        var state: JSON = ["kind": kind, "at": at, "audience": "public", "public_key_sign": keys.publicKeySign, "recovery_key_hash": recoveryKeyHash(rec), "recovery_reach": reach]
        if let enc = encryptionKey { state["public_key_encrypt"] = enc }
        var block = try FoodBlock.create("actor", state, [:])
        block["signature"] = try FoodBlock.sign(block, privateKey: keys.privateKey)
        return block
    }

    public static func isGenesis(_ block: JSON?) -> Bool {
        guard let b = block else { return false }
        return b["type"] as? String == "actor" && dig(b, "state.public_key_sign") is String && !truthy(dig(b, "refs.author")) && dig(b, "state.seq") == nil
    }
    /// A genesis with the recovery fields: a 1.6 genesis, which has no history.
    public static func is16Genesis(_ block: JSON?) -> Bool { isGenesis(block) && dig(block, "state.recovery_key_hash") != nil && dig(block, "state.recovery_reach") != nil }
    /// A genesis is valid when its own key opens it.
    public static func genesisOpens(_ block: JSON?) -> Bool { isGenesis(block) && opens(block, dig(block, "state.public_key_sign") as? String) }

    /// Who signs a key grant: a key the id holds and its place in that key's chain, or the recovery key.
    public struct Signer {
        public var privateKey: String, last: JSON?, broughtIn: String?, recoveryKey: String?
        public init(privateKey: String, last: JSON? = nil, broughtIn: String? = nil, recoveryKey: String? = nil) {
            self.privateKey = privateKey; self.last = last; self.broughtIn = broughtIn; self.recoveryKey = recoveryKey
        }
    }

    /// A key grant, signed: brings `newPublicKey` into the id. A rotation also names the key it `replaces` and that key's `lastGood` block.
    public static func keyGrant(_ id: String, _ newPublicKey: String?, _ signer: Signer, replaces: String? = nil, lastGood: String? = nil, at: String = nowISO(),
                                after: [String] = [], encrypt: String? = nil, recovery: (key: String, reach: String)? = nil) throws -> JSON {
        let place = try FoodBlock.nextLink(signer.last, signer.broughtIn ?? id)
        var state: JSON = ["seq": place.seq, "at": at, "audience": "public", "kind": "key"]
        if let k = newPublicKey { state["public_key_sign"] = k }
        if let e = encrypt { state["public_key_encrypt"] = e }
        if let r = replaces { state["replaces"] = r; state["last_good"] = lastGood ?? NSNull() }
        if let r = signer.recoveryKey { state["recovery_key"] = r }
        if let r = recovery { state["recovery_key_hash"] = recoveryKeyHash(r.key); state["recovery_reach"] = r.reach }
        var refs: JSON = ["author": id, "subject": id, "prev": place.prev]
        let seen = sortedJS(unique(after))
        if !seen.isEmpty { refs["after"] = seen }
        var block = try FoodBlock.create("grant", state, refs)
        block["signature"] = try FoodBlock.sign(block, privateKey: signer.privateKey)
        return block
    }

    // ---- History (§2) ----
    /// Whether a block without seq counts as its author's history: never for a 1.6 genesis (it has none); while an older
    /// identity has written no 1.6 block, its history is open and counts; once it has, only what is in its first 1.6
    /// block's causal past or manifest counts. What counts, counts in every fold under the rules it was written in, read
    /// through aliases (an old membership or grant stands). A reader that holds neither the genesis nor a 1.6 block of
    /// the author has nothing that closes the history, so it reads it as open.
    public static func historyCounts(_ block: JSON, _ id: String, _ blocks: [JSON]) -> Bool { historyCounts(block, id, Index(blocks)) }
    /// Whether a block counts in a fold other than the identity fold: one with seq unless its key signed two blocks at
    /// one seq at or before it (its signature is the reader's own check); one without, as history.
    static func counts(_ block: JSON, _ byHash: Index) -> Bool {
        if isGenesis(block) { return true }
        return dig(block, "state.seq") != nil ? !forked(block, byHash) : historyCounts(block, dig(block, "refs.author") as? String ?? "", byHash)
    }

    // ---- Two blocks at one seq (§2) ----
    // A key's place in its chain, read from the chain alone (no signature): the block that brought the key in, found by
    // walking `prev` back to seq 1 (the recovery key's chain, which also starts at the genesis, begins with a block naming
    // `recovery_key`). A chain with a gap is named by the first missing link and the seq above it.
    static func chainRoot(_ block: JSON, _ byHash: Index) -> String? {
        var at = block
        let top = intOf(dig(block, "state.seq")) ?? 0
        for _ in 0...max(top, 0) {
            let seq = intOf(dig(at, "state.seq")) ?? 0, prevHash = dig(at, "refs.prev") as? String
            if seq == 1 { return "\(dig(at, "state.recovery_key") != nil ? "recovery " : "")\(prevHash ?? "undefined")" }
            guard let prev = byHash[prevHash], let p = intOf(dig(prev, "state.seq")), p == seq - 1 else { return "\(prevHash ?? "undefined")@\(seq)" }
            at = prev
        }
        return nil
    }
    /// Where each key of each author first signed two blocks at one seq: "author root" → that seq.
    static func forksOf(_ byHash: Index) -> [String: Int] {
        var bySlot: [String: [JSON]] = [:], out: [String: Int] = [:]
        for block in byHash.values {
            guard let author = dig(block, "refs.author") as? String, !author.isEmpty, let seq = intOf(dig(block, "state.seq")) else { continue }
            bySlot["\(author) \(seq)", default: []].append(block)
        }
        for group in bySlot.values where group.count > 1 {
            var roots: [String: Int] = [:]
            for block in group { roots["\(dig(block, "refs.author") as! String) \(chainRoot(block, byHash) ?? "null")", default: 0] += 1 }
            let seq = intOf(dig(group[0], "state.seq"))!
            for (key, n) in roots where n > 1 { if out[key].map({ $0 > seq }) ?? true { out[key] = seq } }
        }
        return out
    }
    /// Whether a block is one of two at one seq of its key, or a later block of that key: proof of a lie, counted for
    /// nothing in every fold but the identity fold (§2, Two blocks at one seq; §11, Equivocations in folds).
    public static func forked(_ block: JSON, _ blocks: [JSON]) -> Bool { forked(block, Index(blocks)) }
    static func forked(_ block: JSON, _ byHash: Index) -> Bool {
        guard let author = dig(block, "refs.author") as? String, !author.isEmpty, let seq = intOf(dig(block, "state.seq")) else { return false }
        let forks = forksOf(byHash)
        if forks.isEmpty { return false }
        guard let first = forks["\(author) \(chainRoot(block, byHash) ?? "null")"] else { return false }
        return seq >= first
    }
    static func historyCounts(_ block: JSON, _ id: String, _ byHash: Index) -> Bool {
        if dig(block, "state.seq") != nil { return false }
        if let root = byHash[id], is16Genesis(root) { return false }
        let firsts = byHash.values.filter { dig($0, "refs.author") as? String == id && intOf(dig($0, "state.seq")) == 1 && dig($0, "refs.prev") as? String == id }
        // An older identity that has written no 1.6 block yet has not closed its history.
        if firsts.isEmpty { return true }
        let h = block["hash"] as? String ?? ""
        return firsts.contains { FoodBlock.pastOf($0, byHash).contains(h) || list(dig($0, "state.manifest")).contains(h) }
    }

    // ---- Keys ----
    static func keyGrantsOf(_ id: String, _ byHash: Index) -> [JSON] {
        FoodBlock.causalOrder(byHash.values.filter { b in
            b["type"] as? String == "grant" && dig(b, "state.kind") as? String == "key" && dig(b, "refs.author") as? String == id
                && dig(b, "refs.subject") as? String == id && isInteger(dig(b, "state.seq")) && dig(b, "state.status") == nil
        })
    }
    /// The earliest of a set of blocks: those whose causal past holds no other of them.
    static func earliest(_ set: [JSON], _ byHash: Index) -> [JSON] {
        set.filter { one in !set.contains { other in other["hash"] as? String != one["hash"] as? String && FoodBlock.sees(one, other, byHash) } }
    }

    struct Context { let byHash: Index; let rotations: [String: Rotation]; let arrivedAt: Arrival?; let id: String }

    /// What an id's keys are, read from its chain alone.
    public static func identityOf(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> State { identityOf(id, Index(blocks), arrivedAt: arrivedAt) }
    static func identityOf(_ id: String, _ byHash: Index, arrivedAt: Arrival?) -> State {
        guard let root = byHash[id], genesisOpens(root) else { return State(keys: [], rotations: [:], recovery: [], ended: nil) }
        let grants = keyGrantsOf(id, byHash)
        var rotations: [String: Rotation] = [:]
        var result = State(keys: [], rotations: [:], recovery: [], ended: nil)
        // Rotations can void grants that came before them in causal order, so read until nothing changes.
        for pass in 0...(grants.count + 1) {
            result = readKeys(id, root, grants, byHash, rotations, arrivedAt)
            let unchanged = result.rotations == rotations
            rotations = result.rotations
            if unchanged && pass > 0 { break }
        }
        return result
    }

    static func readKeys(_ id: String, _ root: JSON, _ grants: [JSON], _ byHash: Index, _ rotations: [String: Rotation], _ arrivedAt: Arrival?) -> State {
        var recoveryHashes = [dig(root, "state.recovery_key_hash") as? String].compactMap { $0 }
        var all = [KeyEntry(key: dig(root, "state.public_key_sign") as! String, by: root["hash"] as! String, signer: nil)]
        var recovery: [String] = []
        var selfRotations: [(String, [JSON])] = [], recoveryRotations: [(String, [JSON])] = [], slots: [(String, [JSON])] = []
        func append(_ list: inout [(String, [JSON])], _ key: String, _ grant: JSON) {
            if let i = list.firstIndex(where: { $0.0 == key }) { list[i].1.append(grant) } else { list.append((key, [grant])) }
        }
        let context = Context(byHash: byHash, rotations: rotations, arrivedAt: arrivedAt, id: id)
        for grant in grants {
            let state = grant["state"] as! JSON
            let rk = state["recovery_key"] as? String
            let byRecovery = rk != nil && recoveryHashes.contains(recoveryKeyHash(rk!)) && opens(grant, rk)
            let signer = byRecovery ? nil : all.first { !$0.void && !$0.frozen && opens(grant, $0.key) && speaks($0, grant, context) }
            if !byRecovery && signer == nil { continue }
            if byRecovery && !recovery.contains(rk!) { recovery.append(rk!) }
            // An older genesis adds recovery once, by a key grant naming it.
            if let h = state["recovery_key_hash"] as? String, recoveryHashes.isEmpty { recoveryHashes.append(h) }
            if let replaces = state["replaces"] as? String {
                // A key is rotated only by itself or by the recovery key.
                if !byRecovery && signer!.key != replaces { continue }
                if byRecovery { append(&recoveryRotations, replaces, grant) } else { append(&selfRotations, replaces, grant) }
            }
            if let k = state["public_key_sign"] as? String { all.append(KeyEntry(key: k, by: grant["hash"] as! String, signer: byRecovery ? "recovery" : signer!.key)) }
            if !byRecovery { append(&slots, "\(signer!.key) \(stableJSON(state["seq"]))", grant) }
        }
        func entries(_ list: [(String, [JSON])], _ key: String) -> [JSON] { list.first { $0.0 == key }?.1 ?? [] }
        // Each rotated key: the recovery's rotation rules; two that do not see each other freeze (self) or end (recovery).
        var next: [String: Rotation] = [:]
        let crossing = earliest(recoveryRotations.flatMap { $0.1 }, byHash)
        let ended: [String]? = crossing.count > 1 ? sortedJS(crossing.map { $0["hash"] as! String }) : nil
        for old in unique(selfRotations.map { $0.0 } + recoveryRotations.map { $0.0 }) {
            let mineR = entries(recoveryRotations, old), mineS = entries(selfRotations, old)
            let byRecovery = earliest(mineR, byHash), bySelf = earliest(mineS, byHash)
            if !byRecovery.isEmpty {
                let rule = FoodBlock.causalOrder(mineR).last!
                for grant in mineS where !FoodBlock.sees(rule, grant, byHash) { for entry in all where entry.by == grant["hash"] as? String { entry.frozen = true } }
                let arrived = arrivedAt?(rule["hash"] as! String)
                let reach = dig(root, "state.recovery_reach") as? String ?? recoveryReachOf(id, byHash)
                next[old] = Rotation(by: rule["hash"] as! String, all: sortedJS((mineS + mineR).map { $0["hash"] as! String }), lastGood: dig(rule, "state.last_good") as? String,
                                     recovery: true, floor: arrived.flatMap { Grant.addDuration($0, reach, -1) })
                continue
            }
            if bySelf.count > 1 { for grant in bySelf { for entry in all where entry.by == grant["hash"] as? String { entry.frozen = true } } }
            let goods = bySelf.compactMap { byHash[dig($0, "state.last_good") as? String] }
            let lowest = stableSorted(goods) { (numberOf(dig($0, "state.seq")) ?? .nan) < (numberOf(dig($1, "state.seq")) ?? .nan) }.first
            next[old] = Rotation(by: sortedJS(bySelf.map { $0["hash"] as! String }).joined(separator: ","), all: sortedJS(bySelf.map { $0["hash"] as! String }),
                                 lastGood: (lowest?["hash"] as? String) ?? (dig(bySelf.first, "state.last_good") as? String), recovery: false, floor: nil)
        }
        // Two key grants at one seq of one key (a fork, rotating or not): Conflict applies. The keys they bring in freeze
        // until a recovery rotation of that key settles it; then those in its causal past speak.
        for (slot, pair) in slots where pair.count > 1 {
            let signer = String(slot[..<slot.lastIndex(of: " ")!])
            let settle = entries(recoveryRotations, signer)
            let rule = settle.isEmpty ? nil : FoodBlock.causalOrder(settle).last
            for grant in pair where rule == nil || !FoodBlock.sees(rule, grant, byHash) { for entry in all where entry.by == grant["hash"] as? String { entry.frozen = true } }
        }
        // A key brought in by a void block is void, and so is every key it brought in.
        let nextContext = Context(byHash: byHash, rotations: next, arrivedAt: arrivedAt, id: id)
        for entry in all.dropFirst() {
            let grant = byHash[entry.by]
            let signer = entry.signer == "recovery" ? nil : all.first { $0.key == entry.signer }
            if let s = signer, s.void || !speaks(s, grant ?? [:], nextContext) { entry.void = true }
            if signer?.frozen == true { entry.frozen = true }
        }
        return State(keys: all, rotations: next, recovery: recovery, ended: ended)
    }
    static func recoveryReachOf(_ id: String, _ byHash: Index) -> String? {
        byHash.values.first { $0["type"] as? String == "grant" && dig($0, "refs.author") as? String == id && dig($0, "state.recovery_reach") != nil }
            .flatMap { dig($0, "state.recovery_reach") as? String }
    }

    // Whether a key speaks for a block: never rotated, or the block is at or before its last good block (or is the
    // rotation itself), or a recovery rotation cannot reach it.
    static func speaks(_ entry: KeyEntry, _ block: JSON, _ c: Context) -> Bool {
        if entry.void || entry.frozen { return false }
        guard let seq = numberOf(dig(block, "state.seq")) else { return historyCounts(block, c.id, c.byHash) }
        guard let rotation = c.rotations[entry.key] else { return true }
        let h = block["hash"] as? String ?? ""
        if rotation.all.contains(h) && (!rotation.recovery || rotation.by == h) { return earliestRotation(block, rotation, c.byHash) }
        if h == rotation.lastGood { return true }
        if let good = c.byHash[rotation.lastGood], isInteger(dig(good, "state.seq")), seq <= numberOf(dig(good, "state.seq"))! { return true }
        return rotation.recovery && beyondReach(block, rotation, c.byHash, c.arrivedAt)
    }
    // The rotation itself stands; a later rotation of the same key that has seen it does not.
    static func earliestRotation(_ block: JSON, _ rotation: Rotation, _ byHash: Index) -> Bool {
        !rotation.all.contains { $0 != block["hash"] as? String && FoodBlock.sees(block, byHash[$0], byHash) }
    }
    // A recovery rotation cannot void a block that arrived, or that another identity built on and that arrived, before
    // its reach began (the rotation's arrival, less recovery_reach). Without arrival times, everything is within reach.
    static func beyondReach(_ block: JSON, _ rotation: Rotation, _ byHash: Index, _ arrivedAt: Arrival?) -> Bool {
        guard let floor = rotation.floor, let arrivedAt = arrivedAt else { return false }
        let h = block["hash"] as? String ?? ""
        let users = byHash.values.filter { dig($0, "refs.author") as? String != dig(block, "refs.author") as? String && FoodBlock.pastOf($0, byHash).contains(h) }
        return ([block] + users).contains { one in arrivedAt(one["hash"] as? String ?? "").map { jsLess($0, floor) } ?? false }
    }

    /// The keys an id has held.
    public static func keyTimeline(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> [KeyEntry] { identityOf(id, Index(blocks), arrivedAt: arrivedAt).keys }
    static func keyTimeline(_ id: String, _ byHash: Index, arrivedAt: Arrival? = nil) -> [KeyEntry] { identityOf(id, byHash, arrivedAt: arrivedAt).keys }
    /// The keys that speak for an id now (not void).
    public static func keysOf(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> [String] { keyTimeline(id, blocks, arrivedAt: arrivedAt).filter { !$0.void }.map { $0.key } }

    /// Whether a signed block is its author's: its signature opens with one of the id's keys that speaks for it, or it is
    /// a key grant the recovery key signed. Two recovery rotations that cross end the identity: then only what either of
    /// them saw still stands.
    public static func signedByAuthor(_ block: JSON, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> Bool { signedByAuthor(block, Index(blocks), arrivedAt: arrivedAt) }
    static func signedByAuthor(_ block: JSON, _ byHash: Index, arrivedAt: Arrival?) -> Bool {
        if isGenesis(block) { return genesisOpens(block) }
        var all = byHash
        let h = block["hash"] as? String ?? ""
        if !all.contains(h) { all.add(block) }
        guard let id = dig(block, "refs.author") as? String else { return false }
        let state = identityOf(id, all, arrivedAt: arrivedAt)
        if let ended = state.ended, !ended.contains(where: { $0 == h || FoodBlock.pastOf(all[$0], all).contains(h) }) { return false }
        if block["type"] as? String == "grant", let rk = dig(block, "state.recovery_key") as? String, state.recovery.contains(rk), opens(block, rk) { return true }
        // The recovery key also signs defeats of a successor's trigger.
        if block["type"] as? String == "observe" && truthy(dig(block, "refs.defeats")) && state.recovery.contains(where: { opens(block, $0) }) { return true }
        let context = Context(byHash: all, rotations: state.rotations, arrivedAt: arrivedAt, id: id)
        return state.keys.contains { opens(block, $0.key) && speaks($0, block, context) }
    }

    /// The identity fold (§11, What each fold returns): signed_by_author (hash → true when the block is the id's, for the
    /// genesis and every block naming it as author), keys (sorted, not void), frozen (sorted), operators (sorted),
    /// history (none for a 1.6 genesis, open or closed).
    public static func identityState(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil, now: String? = nil) -> JSON {
        let byHash = Index(blocks), timeline = keyTimeline(id, byHash, arrivedAt: arrivedAt)
        let firsts = byHash.values.contains { dig($0, "refs.author") as? String == id && intOf(dig($0, "state.seq")) == 1 && dig($0, "refs.prev") as? String == id }
        var signed = JSON()
        for block in byHash.values where block["hash"] as? String == id || dig(block, "refs.author") as? String == id {
            signed[block["hash"] as! String] = signedByAuthor(block, byHash, arrivedAt: arrivedAt)
        }
        return ["signed_by_author": signed,
                "keys": sortedJS(timeline.filter { !$0.void }.map { $0.key }),
                "frozen": sortedJS(timeline.filter { !$0.void && $0.frozen }.map { $0.key }),
                "operators": Grant.operatorsOf(id, byHash.values, now: now),
                "history": byHash[id].map(is16Genesis) == true ? "none" : firsts ? "closed" : "open"]
    }

    /// Which of an id's keys signed a block (its public key), or nil.
    public static func signerOf(_ block: JSON, _ keys: [KeyEntry]) -> String? { keys.first { opens(block, $0.key) }?.key }

    /// Each key's chain for an id. Blocks without seq sit in no chain.
    public static func chainsOf(_ id: String, _ blocks: [JSON]) -> [(key: String, by: String, chain: ChainCheck)] {
        let byHash = Index(blocks)
        let mine = byHash.values.filter { dig($0, "refs.author") as? String == id && isInteger(dig($0, "state.seq")) }
        return keyTimeline(id, byHash).map { entry in (entry.key, entry.by, FoodBlock.checkChain(mine.filter { opens($0, entry.key) }, entry.by)) }
    }

    /// Where an id's next block goes for one of its keys.
    public static func nextLinkFor(_ id: String, _ publicKey: String, _ blocks: [JSON]) throws -> Link {
        guard let chain = chainsOf(id, blocks).first(where: { $0.key == publicKey }) else { throw FoodBlockError.invalid("identity: that key is not one of theirs") }
        if !chain.chain.equivocations.isEmpty { throw FoodBlockError.invalid("identity: this key has signed two blocks with one seq") }
        return try FoodBlock.nextLink(chain.chain.head, chain.by)
    }
}
