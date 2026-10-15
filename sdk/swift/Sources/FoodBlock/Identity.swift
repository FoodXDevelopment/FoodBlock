import Foundation

/// Who someone is (spec/protocol.md §5): thin calls into the Rust core.
public enum Identity {
    public typealias Arrival = (String) -> String?

    /// One key an id has held: who brought it in (`by`), which key signed that (`signer`: a key, "recovery", or nil
    /// for the genesis), whether it is void or frozen, and its `suite` (std, p256, sm).
    public final class KeyEntry {
        public let key: String, by: String, signer: String?, suite: String
        public internal(set) var void = false, frozen = false
        init(_ j: JSON) {
            key = j["key"] as? String ?? ""; by = j["by"] as? String ?? ""; signer = j["signer"] as? String; suite = j["suite"] as? String ?? "std"
            void = j["void"] as? Bool ?? false; frozen = j["frozen"] as? Bool ?? false
        }
    }

    /// The arrival log as data { hash: at }; a reader that keeps none passes nil.
    static func log(_ arrivedAt: Arrival?, _ blocks: [JSON]) -> JSON? {
        guard let f = arrivedAt else { return nil }
        var out = JSON()
        for b in blocks { if let h = b["hash"] as? String, let at = f(h) { out[h] = at } }
        return out
    }

    /// The recovery key's hash, as a genesis names it, in the identity's suite.
    public static func recoveryKeyHash(_ publicKeyHex: String, suite: String = "std") -> String { (try? Core.string("recovery_key_hash", publicKeyHex, suite)) ?? "" }

    /// A new person, agent, machine or signing circle: their genesis, signed (in the suite of `keys`). It needs only kind,
    /// at, audience and the key; the recovery key and its reach come as a pair or not at all (`recoverySuite` optional).
    public static func genesis(_ keys: Keypair, kind: String = "person", at: String? = nil, encryptionKey: String? = nil, recoveryKey: String? = nil,
                               reach: String? = nil, recoverySuite: String? = nil, custodian: String? = nil) throws -> JSON {
        var o: JSON = ["kind": kind]
        if let at = at { o["at"] = at }
        if let e = encryptionKey { o["encryption_key"] = e }
        if let r = recoveryKey { o["recovery_key"] = r }
        if let r = reach { o["reach"] = r }
        if let r = recoverySuite { o["recovery_suite"] = r }
        if let c = custodian { o["custodian"] = c }
        return try Core.json("genesis", keys.json, o)
    }
    public static func isGenesis(_ block: JSON?) -> Bool { Core.bool("is_genesis", block ?? [:]) }
    public static func genesisOpens(_ block: JSON?) -> Bool { Core.bool("genesis_opens", block) }

    /// Who signs a key grant: a key the id holds and its place in that key's chain, or the recovery key.
    public struct Signer {
        public var privateKey: String, suite: String?, last: JSON?, broughtIn: String?, recoveryKey: String?
        public init(privateKey: String, suite: String? = nil, last: JSON? = nil, broughtIn: String? = nil, recoveryKey: String? = nil) {
            self.privateKey = privateKey; self.suite = suite; self.last = last; self.broughtIn = broughtIn; self.recoveryKey = recoveryKey
        }
    }

    /// A key grant, signed: brings `newPublicKey` into the id. A rotation also names the key it `replaces` and that key's `countedTo` block (`suite` is the new key's).
    public static func keyGrant(_ id: String, _ newPublicKey: String?, _ signer: Signer, replaces: String? = nil, countedTo: String? = nil, at: String? = nil,
                                after: [String] = [], encrypt: String? = nil, recovery: (key: String, reach: String)? = nil, custodian: String? = nil,
                                suite: String? = nil, skip: Bool = false) throws -> JSON {
        var s: JSON = ["private_key": signer.privateKey]
        if let u = signer.suite { s["suite"] = u }
        if let l = signer.last { s["last"] = l }
        if let b = signer.broughtIn { s["brought_in"] = b }
        if let r = signer.recoveryKey { s["recovery_key"] = r }
        var o: JSON = ["after": after]
        if let r = replaces { o["replaces"] = r }
        if let g = countedTo { o["counted_to"] = g }
        if let u = suite { o["suite"] = u }
        if skip { o["skip"] = true }
        if let a = at { o["at"] = a }
        if let e = encrypt { o["encrypt"] = e }
        if let c = custodian { o["custodian"] = c }
        if let r = recovery { o["recovery"] = ["key": r.key, "reach": r.reach] }
        return try Core.json("key_grant", id, newPublicKey, s, o)
    }

    /// Whether a block is one of a pair of one key naming one prev, or a later block of that key.
    public static func forked(_ block: JSON, _ blocks: [JSON]) -> Bool { Core.bool("forked", block, blocks) }
    /// The pairs of blocks one key signed naming one prev.
    public static func forkPairs(_ blocks: [JSON]) -> [[String]] { Core.maybe("fork_pairs", blocks) as? [[String]] ?? [] }
    /// The view: the voided blocks a recovery rotation's reach protects, read at the reader's arrivals.
    public static func recoveryReach(_ rotation: JSON, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> Any? {
        Core.maybe("recovery_reach", rotation, blocks, log(arrivedAt, blocks + [rotation]))
    }
    /// Whether a block counts: signed by a key that speaks, in the chain it was written under.
    public static func counts(_ block: JSON, _ held: Index) -> Bool { Core.bool("counts", block, held.values) }
    public static func keyTimeline(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> [KeyEntry] {
        (Core.maybe("key_timeline", id, blocks, log(arrivedAt, blocks)) as? [JSON] ?? []).map(KeyEntry.init)
    }
    public static func keysOf(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> [String] { Core.strings("keys_of", id, blocks, log(arrivedAt, blocks)) }
    public static func signedByAuthor(_ block: JSON, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> Bool { Core.bool("signed_by_author", block, blocks, log(arrivedAt, blocks)) }
    /// signed_by_author (hash → bool), keys, frozen, operators (sorted) and history (always "none").
    public static func identityState(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> JSON {
        (try? Core.json("identity_state", id, blocks, log(arrivedAt, blocks))) ?? [:]
    }
    public static func nextLinkFor(_ id: String, _ publicKey: String, _ blocks: [JSON]) throws -> Link { Link(try Core.json("next_link_for", id, publicKey, blocks)) }
}
