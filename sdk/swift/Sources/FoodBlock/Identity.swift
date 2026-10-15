import Foundation

/// Who someone is (spec/protocol.md §5): thin calls into the Rust core.
public enum Identity {
    public typealias Arrival = (String) -> String?

    /// One key an id has held: who brought it in (`by`), which key signed that (`signer`: a key, "recovery", or nil
    /// for the genesis), and whether it is void or frozen.
    public final class KeyEntry {
        public let key: String, by: String, signer: String?
        public internal(set) var void = false, frozen = false
        init(_ j: JSON) {
            key = j["key"] as? String ?? ""; by = j["by"] as? String ?? ""; signer = j["signer"] as? String
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

    public static func recoveryKeyHash(_ publicKeyHex: String) -> String { (try? Core.string("recovery_key_hash", publicKeyHex)) ?? "" }

    /// A new person, agent, machine or signing circle: their genesis, signed. A 1.6 genesis names the recovery key (only
    /// its hash is written) and its reach, and the encryption key (X25519 public) if the identity will receive sealed blocks.
    public static func genesis(_ keys: Keypair, kind: String = "person", at: String? = nil, encryptionKey: String? = nil, recoveryKey: String?, reach: String = "P30D", custodian: String? = nil) throws -> JSON {
        var o: JSON = ["kind": kind, "reach": reach]
        if let at = at { o["at"] = at }
        if let e = encryptionKey { o["encryption_key"] = e }
        if let r = recoveryKey { o["recovery_key"] = r }
        if let c = custodian { o["custodian"] = c }
        return try Core.json("genesis", keys.json, o)
    }
    public static func isGenesis(_ block: JSON?) -> Bool { Core.bool("is_genesis", block ?? [:]) }
    public static func is16Genesis(_ block: JSON?) -> Bool { Core.bool("is_16_genesis", block ?? [:]) }
    public static func genesisOpens(_ block: JSON?) -> Bool { Core.bool("genesis_opens", block) }

    /// Who signs a key grant: a key the id holds and its place in that key's chain, or the recovery key.
    public struct Signer {
        public var privateKey: String, last: JSON?, broughtIn: String?, recoveryKey: String?
        public init(privateKey: String, last: JSON? = nil, broughtIn: String? = nil, recoveryKey: String? = nil) {
            self.privateKey = privateKey; self.last = last; self.broughtIn = broughtIn; self.recoveryKey = recoveryKey
        }
    }

    /// A key grant, signed: brings `newPublicKey` into the id. A rotation also names the key it `replaces` and that key's `lastGood` block.
    public static func keyGrant(_ id: String, _ newPublicKey: String?, _ signer: Signer, replaces: String? = nil, lastGood: String? = nil, at: String? = nil,
                                after: [String] = [], encrypt: String? = nil, recovery: (key: String, reach: String)? = nil, custodian: String? = nil) throws -> JSON {
        var s: JSON = ["private_key": signer.privateKey]
        if let l = signer.last { s["last"] = l }
        if let b = signer.broughtIn { s["brought_in"] = b }
        if let r = signer.recoveryKey { s["recovery_key"] = r }
        var o: JSON = ["after": after]
        if let r = replaces { o["replaces"] = r }
        if let g = lastGood { o["last_good"] = g }
        if let a = at { o["at"] = a }
        if let e = encrypt { o["encrypt"] = e }
        if let c = custodian { o["custodian"] = c }
        if let r = recovery { o["recovery"] = ["key": r.key, "reach": r.reach] }
        return try Core.json("key_grant", id, newPublicKey, s, o)
    }

    public static func historyCounts(_ block: JSON, _ id: String, _ blocks: [JSON]) -> Bool { Core.bool("history_counts", block, id, blocks) }
    public static func forked(_ block: JSON, _ blocks: [JSON]) -> Bool { Core.bool("forked", block, blocks) }
    /// Whether a block counts: signed by a key that speaks, in the chain it was written under.
    public static func counts(_ block: JSON, _ held: Index) -> Bool { Core.bool("counts", block, held.values) }
    public static func keyTimeline(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> [KeyEntry] {
        (Core.maybe("key_timeline", id, blocks, log(arrivedAt, blocks)) as? [JSON] ?? []).map(KeyEntry.init)
    }
    public static func keysOf(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> [String] { Core.strings("keys_of", id, blocks, log(arrivedAt, blocks)) }
    public static func signedByAuthor(_ block: JSON, _ blocks: [JSON], arrivedAt: Arrival? = nil) -> Bool { Core.bool("signed_by_author", block, blocks, log(arrivedAt, blocks)) }
    /// signed_by_author (hash → bool), keys, frozen, operators (sorted) and history (none, open or closed).
    public static func identityState(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil, now: String? = nil) -> JSON {
        (try? Core.json("identity_state", id, blocks, log(arrivedAt, blocks))) ?? [:]
    }
    public static func nextLinkFor(_ id: String, _ publicKey: String, _ blocks: [JSON]) throws -> Link { Link(try Core.json("next_link_for", id, publicKey, blocks)) }
}
