import Foundation

/// A block's place in its signing key's chain: its `seq`, and `prev`, the key's block before.
public struct Link: Equatable {
    public let seq: Int
    public let prev: String
    public init(seq: Int, prev: String) { self.seq = seq; self.prev = prev }
}

// Writing a block and carrying it (spec/protocol.md §1, §9, Encoding: Messages). `compose` stamps an author's words with
// what every block carries; `write` is the one path every writer shares: compose, check, sign, chain. On the wire a
// public block is { version, block, signature }; a sealed one is { version, header, header_signature, envelope }.
extension FoodBlock {
    public static let publicAudience = "public"

    /// A block as its author says it. `audience` is "public" or recipients (people, circles, `circle#role`), written
    /// as commitments with a nonce; a private block comes back with its salts beside it (`salts`), never signed.
    public static func compose(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], author: String, audience: [String]? = nil,
                               after: [String] = [], at: String = nowISO(), link: Link? = nil, salts given: [String: String] = [:]) throws -> JSON {
        guard !author.isEmpty else { throw FoodBlockError.invalid("write: a block names its author") }
        guard parseTime(at) != nil else { throw FoodBlockError.invalid("write: at is a time") }
        var s = state, r = refs
        s["at"] = at
        var salts: [String: String]? = nil
        if let recipients = audience {
            let c = try commit(recipients, salts: given)
            s["audience"] = c.audience
            salts = c.salts
            if !has(state["nonce"]) { s["nonce"] = newSalt() }
        } else { s["audience"] = publicAudience }
        if let link = link { s["seq"] = link.seq; r["prev"] = link.prev }
        r["author"] = author
        let seen = sortedJS(unique(after))
        if !seen.isEmpty { r["after"] = seen }
        var block = try create(type, s, r)
        if let salts = salts { block["salts"] = salts }
        return block
    }

    /// The one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next place
    /// in that key's chain among `held` (the author's genesis, key grants and blocks). Throws `.refused` with every
    /// finding: { code, detail }, one per code.
    public static func write(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], author: String, key: Keypair, held: [JSON] = [],
                             schemas: [String: JSON]? = nil, link: Link? = nil, audience: [String]? = nil, after: [String] = [],
                             at: String = nowISO()) throws -> JSON {
        let place = try link ?? Identity.nextLinkFor(author, key.publicKeySign, held)
        var block = try compose(type, state, refs, author: author, audience: audience, after: after, at: at, link: place)
        let refused = refusals(type, block["state"] as! JSON, block["refs"] as! JSON, schemas: schemas, held: Index(held).map)
        if !refused.isEmpty { throw FoodBlockError.refused(refused) }
        block["signature"] = try sign(block, privateKey: key.privateKey)
        return block
    }

    // ---- Messages ----
    /// A signed public block as it travels: { version, block, signature }. Never the hash: readers recompute it.
    public static func wrap(_ signed: JSON, version: String = FoodBlock.version) -> JSON {
        ["version": version, "block": ["type": signed["type"] ?? "", "state": signed["state"] ?? JSON(), "refs": signed["refs"] ?? JSON()],
         "signature": signed["signature"] ?? NSNull()]
    }

    /// A block off the wire: its hash recomputed from its content, its signature and version kept beside.
    public static func unwrap(_ message: JSON) throws -> JSON {
        guard let b = obj(message["block"]), let type = b["type"] as? String, let signature = message["signature"] as? String else {
            throw FoodBlockError.invalid("write: a message is { version, block, signature }")
        }
        let state = obj(b["state"]) ?? [:], refs = obj(b["refs"]) ?? [:]
        guard try canonical(type, state, refs).utf8.count <= blockBytes else { throw FoodBlockError.coded("size_limit", "write: a block is at most \(blockBytes) bytes") }
        var out: JSON = ["hash": try hash(type, state, refs), "type": type, "state": state, "refs": refs, "signature": signature, "version": message["version"] ?? NSNull()]
        if let reveals = message["reveals"] { out["reveals"] = reveals }
        return out
    }

    /// A block's public header: { author, seq, prev, hash }.
    public static func header(_ block: JSON) throws -> JSON {
        var out = JSON()
        if let v = dig(block, "refs.author") { out["author"] = v }
        if let v = dig(block, "state.seq") { out["seq"] = v }
        if let v = dig(block, "refs.prev") { out["prev"] = v }
        out["hash"] = try (block["hash"] as? String) ?? hash(of: block)
        return out
    }

    /// A sealed copy: { version, header, header_signature, envelope }. The plaintext { version, block, signature,
    /// reveals } is sealed to `keys` (encryption keys); `privateKey` is the key that signed the block.
    public static func sealCopy(_ signed: JSON, keys: [String], reveals: [JSON] = [], privateKey: String, alg: String = FoodBlock.alg,
                                fixed: EnvelopeFixed = EnvelopeFixed()) throws -> JSON {
        let top = try header(signed)
        var plaintext = wrap(signed)
        plaintext["reveals"] = reveals
        return ["version": version, "header": top, "header_signature": try signMessage(top, privateKey: privateKey)["signature"]!,
                "envelope": try seal(plaintext, keys, alg: alg, fixed: fixed)]
    }

    /// Whether a sealed copy's header is signed by this key (the key that signed the block).
    public static func headerSignedBy(_ message: JSON, _ publicKey: String) -> Bool {
        guard var top = obj(message["header"]) else { return false }
        top["signature"] = message["header_signature"]
        return verifyMessage(top, publicKey)
    }

    /// Open a sealed copy with a recipient's X25519 private key: the block, its signature and its reveals. The header must name it.
    public static func openCopy(_ message: JSON, _ x25519Private: String) throws -> JSON {
        guard let envelope = obj(message["envelope"]) else { throw FoodBlockError.invalid("write: a sealed copy carries an envelope") }
        guard let plaintext = try open(envelope, x25519Private) as? JSON,
              FoodBlock.message("plaintext").allSatisfy({ $0 == "reveals" || plaintext[$0] != nil }) else {
            throw FoodBlockError.invalid("write: a plaintext is { version, block, signature, reveals }")
        }
        var inside = try unwrap(plaintext)
        if let top = obj(message["header"]), top["hash"] as? String != inside["hash"] as? String { throw FoodBlockError.invalid("write: the header names another block") }
        inside["reveals"] = plaintext["reveals"] ?? [Any]()
        return inside
    }
}
