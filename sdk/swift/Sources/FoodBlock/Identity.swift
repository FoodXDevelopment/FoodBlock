import Foundation

/// Who someone is (spec/protocol.md §5): thin calls into the Rust core.
public enum Identity {
    public typealias Arrival = (String) -> String?

    /// One key an id has held: who brought it in (`by`), which key signed that (`signer`: a key, "recovery", or nil
    /// for the genesis), whether it is frozen, and its `suite` (std, p256, sm). A void key is never listed.
    public final class KeyEntry {
        public let key: String, by: String, signer: String?, suite: String
        public internal(set) var frozen = false
        init(_ j: JSON) {
            key = j["key"] as? String ?? ""; by = j["by"] as? String ?? ""; signer = j["signer"] as? String; suite = j["suite"] as? String ?? "std"
            frozen = j["frozen"] as? Bool ?? false
        }
    }

    /// The arrival log as data { hash: at }; a reader that keeps none passes nil.
    static func log(_ arrivedAt: Arrival?, _ blocks: [JSON]) -> [String: String]? {
        guard let f = arrivedAt else { return nil }
        var out = [String: String]()
        for b in blocks { if let h = b["hash"] as? String, let at = f(h) { out[h] = at } }
        return out
    }

    /// The recovery key's hash, as a genesis names it, in the identity's suite.
    public static func recoveryKeyHash(_ publicKeyHex: String, suite: String = "std") throws -> String { try Door.recoveryKeyHash(publicKeyHex, suite) }

    /// A new person, autonomous system, machine or signing circle: their genesis, signed (in the suite of `keys`). It needs only kind,
    /// at, audience and the key, each stated: nothing fills them in. The recovery key and its reach come as a pair or not at all
    /// (`recoverySuite` optional). A list audience brings `salts` and `nonce` as options.
    public static func genesis(_ keys: Keypair, kind: String, at: String, audience: FoodBlock.Audience, encryptionKey: String? = nil, recoveryKey: String? = nil,
                               reach: String? = nil, recoverySuite: String? = nil, custodian: String? = nil, salts: [String: String]? = nil, nonce: String? = nil) throws -> JSON {
        var o: JSON = ["kind": kind, "at": at, "audience": audience.json]
        if let s = salts { o["salts"] = s }
        if let n = nonce { o["nonce"] = n }
        if let e = encryptionKey { o["encryption_key"] = e }
        if let r = recoveryKey { o["recovery_key"] = r }
        if let r = reach { o["reach"] = r }
        if let r = recoverySuite { o["recovery_suite"] = r }
        if let c = custodian { o["custodian"] = c }
        return try Door.genesis(keys.json, o)
    }
    public static func isGenesis(_ block: JSON?) throws -> Bool { try Door.isGenesis(block) }
    public static func genesisOpens(_ block: JSON?) throws -> Bool { try Door.genesisOpens(block) }

    /// Who signs a key grant: a key the id holds and its place in that key's chain, or the recovery key.
    public struct Signer {
        public var privateKey: String, suite: String?, last: JSON?, broughtIn: String?, recoveryKey: String?
        public init(privateKey: String, suite: String? = nil, last: JSON? = nil, broughtIn: String? = nil, recoveryKey: String? = nil) {
            self.privateKey = privateKey; self.suite = suite; self.last = last; self.broughtIn = broughtIn; self.recoveryKey = recoveryKey
        }
    }

    /// A key grant, signed: brings `newPublicKey` into the id. A rotation also names the key it `replaces` and that key's `countedTo` block (`suite` is the new key's).
    public static func keyGrant(_ id: String, _ newPublicKey: String?, _ signer: Signer, replaces: String? = nil, countedTo: String? = nil, at: String,
                                after: [String] = [], encrypt: String? = nil, custodian: String? = nil,
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
        o["at"] = at
        if let e = encrypt { o["encrypt"] = e }
        if let c = custodian { o["custodian"] = c }
        return try Door.keyGrant(id, newPublicKey, s, o)
    }

    /// Whether a block is one of a pair of one key naming one prev, or a later block of that key.
    public static func forked(_ block: JSON, _ blocks: [JSON]) throws -> Bool { try Door.forked(block, blocks) }
    /// The pairs of blocks one key signed naming one prev.
    public static func forkPairs(_ blocks: [JSON]) throws -> [[String]] { try Door.forkPairs(blocks) as? [[String]] ?? [] }
    /// The view: the voided blocks a recovery rotation's reach protects, read at the reader's arrivals.
    public static func recoveryReach(_ rotation: JSON, _ blocks: [JSON], arrivedAt: Arrival? = nil, unknownArrival: String? = nil) throws -> Any? {
        try Door.recoveryReach(rotation, blocks, log(arrivedAt, blocks + [rotation]), unknownArrival)
    }
    /// Whether a block counts: signed by a key that speaks, in the chain it was written under.
    public static func counts(_ block: JSON, _ held: Index) throws -> Bool { try Door.counts(block, held.values) }
    public static func keyTimeline(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil, unknownArrival: String? = nil) throws -> [KeyEntry] {
        (try Door.keyTimeline(id, blocks, log(arrivedAt, blocks), unknownArrival) as? [JSON] ?? []).map(KeyEntry.init)
    }
    public static func keysOf(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil, unknownArrival: String? = nil) throws -> [String] { (try Door.keysOf(id, blocks, log(arrivedAt, blocks), unknownArrival) as? [String]) ?? [] }
    public static func signedByAuthor(_ block: JSON, _ blocks: [JSON], arrivedAt: Arrival? = nil, unknownArrival: String? = nil) throws -> Bool { try Door.signedByAuthor(block, blocks, log(arrivedAt, blocks), unknownArrival) }
    /// signed_by_author (hash → bool), keys, frozen, operators (sorted).
    public static func identityState(_ id: String, _ blocks: [JSON], arrivedAt: Arrival? = nil, unknownArrival: String? = nil) throws -> JSON {
        try Door.identityState(id, blocks, log(arrivedAt, blocks), unknownArrival)
    }
    public static func nextLinkFor(_ id: String, _ publicKey: String, _ blocks: [JSON]) throws -> Link { Link(try Door.nextLinkFor(id, publicKey, blocks)) }
}
