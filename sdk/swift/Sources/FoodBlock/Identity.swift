import Foundation

/// Who someone is (spec/protocol.md §5): thin calls into the Rust core.
public enum Identity {
    public typealias Arrival = (String) -> String?

    /// One key a list or a key grant of an id brought in: `by` the block that brought it, `voice` the voice it speaks under,
    /// `under` the key above it (if any), its `suite` (std, p256, sm), and whether it has `ended`.
    public final class KeyEntry {
        public let key: String, by: String, voice: String?, under: String?, suite: String
        public internal(set) var ended: Bool
        init(_ j: JSON) {
            key = j["key"] as? String ?? ""; by = j["by"] as? String ?? ""; voice = j["voice"] as? String; under = j["under"] as? String
            suite = j["suite"] as? String ?? "std"; ended = truthy(j["ended"])
        }
    }

    /// The arrival log as data { hash: at }; a reader that keeps none passes nil (only `Fold.due` reads one).
    static func log(_ arrivedAt: Arrival?, _ blocks: [JSON]) -> [String: String]? {
        guard let f = arrivedAt else { return nil }
        var out = [String: String]()
        for b in blocks { if let h = b["hash"] as? String, let at = f(h) { out[h] = at } }
        return out
    }

    /// The key named by its hash (identity.md, Her voices): its suite's hash of its SPKI hex as UTF-8 text.
    public static func keyHash(_ publicKeyHex: String, suite: String? = nil) throws -> String { try Door.keyHash(publicKeyHex, suite) }

    /// A new person, autonomous system, machine or signing circle: their genesis, signed (in the suite of `keys`), a list of one voice.
    /// It needs only kind, at, audience and the key, each stated: nothing fills them in. `reach` (a duration) comes with `clocks`
    /// (her clock, { names, needed }). A list audience brings `salts` and `nonce` as options.
    public static func genesis(_ keys: Keypair, kind: String, at: String, audience: FoodBlock.Audience, encryptionKey: String? = nil,
                               reach: String? = nil, clocks: JSON? = nil, salts: [String: String]? = nil, nonce: String? = nil) throws -> JSON {
        var o: JSON = ["kind": kind, "at": at, "audience": audience.json]
        if let s = salts { o["salts"] = s }
        if let n = nonce { o["nonce"] = n }
        if let e = encryptionKey { o["encryption_key"] = e }
        if let r = reach { o["reach"] = r }
        if let c = clocks { o["clocks"] = c }
        return try Door.genesis(keys.json, o)
    }
    public static func isGenesis(_ block: JSON?) throws -> Bool { try Door.isGenesis(block) }
    public static func genesisOpens(_ block: JSON?) throws -> Bool { try Door.genesisOpens(block) }

    /// Who writes a key grant or a second signature: one of her voices, or a voice of named people, signing in their own name.
    /// `author` is the id signing (the grant's own subject when nil), `blocks` the blocks the signer has, `at` the time stated.
    public struct Signer {
        public var author: String?, key: Keypair, blocks: [JSON], at: String, after: [String]
        public init(author: String? = nil, key: Keypair, blocks: [JSON] = [], at: String, after: [String] = []) {
            self.author = author; self.key = key; self.blocks = blocks; self.at = at; self.after = after
        }
    }

    /// A key grant about `id` (identity.md), signed by `signer`. Give `voices` (her whole list again, with `updates` the list it replaces
    /// and `clocks` her clock), or `key` (one key under the signer's voice, in `suite`), or `encrypt` alone; `shownKey` when a key named by
    /// hash shows itself (`keyRef` the list that holds its hash); `countedTo` the last block of a key a voice above ends.
    public static func keyGrant(_ id: String, _ signer: Signer, voices: Any? = nil, updates: String? = nil, clocks: JSON? = nil, key: String? = nil,
                                suite: String? = nil, encrypt: String? = nil, shownKey: String? = nil, keyRef: String? = nil,
                                countedTo: String? = nil) throws -> JSON {
        var state: JSON = ["kind": "key"]
        if let v = voices { state["voices"] = v }
        if let c = clocks { state["clocks"] = c }
        if let k = key { state["public_key_sign"] = k }
        if let u = suite { state["suite"] = u }
        if let e = encrypt { state["public_key_encrypt"] = e }
        if let k = shownKey { state["shown_key"] = k }
        if let c = countedTo { state["counted_to"] = c }
        var refs: JSON = ["subject": id]
        if let u = updates { refs["updates"] = u }
        if let k = keyRef { refs["key"] = k }
        return try FoodBlock.write("grant", state, refs, author: signer.author ?? id, key: signer.key, blocks: signer.blocks,
                                   audience: .public, after: signer.after, when: .at(signer.at))
    }
    /// The second signature (blocks.md, Finality, Signed twice): a block of the same key, or of a voice above, naming the word in refs.confirms.
    public static func confirm(_ word: Any, _ signer: Signer) throws -> JSON {
        let hash = (word as? JSON)?["hash"] as? String ?? (word as? String) ?? ""
        return try FoodBlock.write("observe", [:], ["confirms": [hash]], author: signer.author ?? "", key: signer.key, blocks: signer.blocks,
                                   audience: .public, after: signer.after, when: .at(signer.at))
    }

    /// Whether a block is one of a pair of one key naming one prev, or a later block of that key.
    public static func forked(_ block: JSON, _ blocks: [JSON]) throws -> Bool { try Door.forked(block, blocks) }
    /// The pairs of blocks one key signed naming one prev.
    public static func forkPairs(_ blocks: [JSON]) throws -> [[String]] { try Door.forkPairs(blocks) as? [[String]] ?? [] }
    /// Whether a block counts: signed by a key that speaks, in the chain it was written under.
    public static func counts(_ block: JSON, _ blocks: Index) throws -> Bool { try Door.counts(block, blocks.values) }
    /// Every key a list or a key grant of hers brought in.
    public static func keyTimeline(_ id: String, _ blocks: [JSON]) throws -> [KeyEntry] {
        (try Door.keyTimeline(id, blocks) as? [JSON] ?? []).map(KeyEntry.init)
    }
    /// The keys that speak for her now: of her standing voices and under them, not ended. Sorted.
    public static func liveKeys(_ id: String, _ blocks: [JSON]) throws -> [String] { try Door.liveKeys(id, blocks) }
    /// Whether a key of the block's author spoke for her there (identity.md, invariant 8). A waiting block is true here; `stands` says it waits.
    public static func signedByAuthor(_ block: JSON, _ blocks: [JSON]) throws -> Bool { try Door.signedByAuthor(block, blocks) }
    /// Whether a word stands (blocks.md, Finality): { stands, waiting: [{ block, on }] }, read with no clock and no arrival.
    public static func stands(_ block: JSON, _ blocks: [JSON]) throws -> JSON { try Door.stands(block, blocks) }
    /// The identity fold: { signed_by_author, voices, clocks, keys, waiting }.
    public static func identityState(_ id: String, _ blocks: [JSON]) throws -> JSON { try Door.identityState(id, blocks) }
    /// Each key's chain for an id: [{ key, by, head, length, gaps, skips, equivocations, broken, ok }].
    public static func chainsOf(_ id: String, _ blocks: [JSON]) throws -> [JSON] { (try Door.chainsOf(id, blocks) as? [JSON]) ?? [] }
    public static func nextLinkFor(_ id: String, _ publicKey: String, _ blocks: [JSON]) throws -> Link { Link(try Door.nextLinkFor(id, publicKey, blocks)) }
}
