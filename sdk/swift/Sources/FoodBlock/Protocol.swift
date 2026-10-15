import Foundation

public struct Keypair {
    public let publicKeySign: String
    public let privateKey: String
    init(_ j: JSON) { publicKeySign = j["public_key_sign"] as! String; privateKey = j["private_key"] as! String }
    var json: JSON { ["public_key_sign": publicKeySign, "private_key": privateKey] }
}

/// An encryption key: X25519, raw 32 bytes each, hex.
public struct EncryptionKeypair {
    public let publicKeyEncrypt: String
    public let x25519Private: String
}

public struct Link: Equatable {
    public let seq: Int
    public let prev: String
    public init(seq: Int, prev: String) { self.seq = seq; self.prev = prev }
    init(_ j: JSON) { seq = intOf(j["seq"]) ?? 0; prev = j["prev"] as? String ?? "" }
    var json: JSON { ["seq": seq, "prev": prev] }
}

/// One key's chain checked: `gaps` the missing seq numbers, `equivocations` the sets of hashes sharing a seq,
/// `broken` the blocks whose prev is not the block before them.
public struct ChainCheck {
    public let head: JSON?
    public let length: Int
    public let gaps: [Int]
    public let equivocations: [[String]]
    public let broken: [String]
    public var ok: Bool { gaps.isEmpty && equivocations.isEmpty && broken.isEmpty }
}

extension FoodBlock {
    /// One finding of a check: a code from protocol.json (`refusals.codes`) and free text for people.
    public struct Finding: Equatable, CustomStringConvertible {
        public let code: String, detail: String
        public init(code: String, detail: String) { self.code = code; self.detail = detail }
        public var description: String { "\(code): \(detail)" }
    }
    static func findings(_ v: Any?) -> [Finding] {
        (v as? [JSON] ?? []).map { Finding(code: $0["code"] as? String ?? "", detail: $0["detail"] as? String ?? "") }
    }
    static func blocksOf(_ held: [String: JSON]?) -> [JSON]? { held.map { Array($0.values) } }

    // ---- A block ----
    public static func canonical(_ type: String, _ state: JSON, _ refs: JSON) throws -> String { try Core.string("canonical", type, state, refs) }
    public static func canonicalJSON(_ value: Any) throws -> String { try Core.string("canonical_json", value) }
    public static func create(_ type: String, _ state: JSON = [:], _ refs: JSON = [:]) throws -> JSON { try Core.json("create", type, state, refs) }
    public static func hash(_ type: String, _ state: JSON = [:], _ refs: JSON = [:]) throws -> String { try Core.string("hash", type, state, refs) }
    public static func hash(of block: JSON) throws -> String { try hash(block["type"] as? String ?? "", block["state"] as? JSON ?? [:], block["refs"] as? JSON ?? [:]) }

    // ---- Signing ----
    public static func keypairFromSeed(_ seedHex: String) throws -> Keypair { Keypair(try Core.json("keypair", seedHex)) }
    public static func generateKeypair() -> Keypair { Keypair(try! Core.json("keypair", nil)) }
    public static func sign(_ block: JSON, privateKey hex: String) throws -> String { try Core.string("sign", block, hex) }
    public static func verify(_ block: JSON, _ signature: Any?, _ publicKeySign: String?) -> Bool { Core.bool("verify", block, signature, publicKeySign) }
    public static func signMessage(_ part: JSON, privateKey hex: String) throws -> JSON { try Core.json("sign_message", part, hex) }
    public static func verifyMessage(_ part: JSON?, _ publicKeySign: String?) -> Bool { Core.bool("verify_message", part, publicKeySign) }

    // ---- Envelopes ----
    public static let alg = (spec["envelope"] as! JSON)["write"] as! String
    public static let algRaw = ((spec["envelope"] as! JSON)["read"] as! [String]).first { $0 != alg }!
    public static func generateEncryptionKeypair() -> EncryptionKeypair {
        let k = try! Core.json("encryption_keypair")
        return EncryptionKeypair(publicKeyEncrypt: k["public_key_encrypt"] as! String, x25519Private: k["x25519_private"] as! String)
    }
    public static func encryptionKeyOf(_ x25519Private: String) throws -> String { try Core.string("encryption_key_of", x25519Private) }
    public static func seal(_ value: Any, _ recipientKeys: [String], alg: String = FoodBlock.alg) throws -> JSON { try Core.json("seal", value, recipientKeys, alg) }
    public static func open(_ envelope: JSON, _ x25519Private: String) throws -> Any { try Core.ask("open", envelope, x25519Private) ?? NSNull() }

    // ---- The commitment ----
    public static func newSalt() -> String { try! Core.string("new_salt") }
    public static func saltedHash(_ salt: String, _ value: String) -> String { (try? Core.string("salted_hash", salt, value)) ?? "" }
    public static func commit(_ recipients: [String], salts given: [String: String] = [:]) throws -> (audience: [String], salts: [String: String]) {
        let c = try Core.json("commit", recipients, given)
        return (c["audience"] as? [String] ?? [], c["salts"] as? [String: String] ?? [:])
    }
    public static func findsSelf(_ block: JSON, _ recipient: String, _ salt: String?) -> Bool { Core.bool("finds_self", block, recipient, salt ?? "") }
    public static func revealFor(_ salts: [String: String], _ recipient: String) -> JSON { (try? Core.json("reveal_for", salts, recipient)) ?? [:] }

    // ---- The write check and the words it asks for ----
    public static func refusals(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], schemas: [String: JSON]? = nil, held: [String: JSON]? = nil) -> [Finding] {
        findings(Core.maybe("refusals", type, state, refs, blocksOf(held) ?? [], blocksOf(schemas)))
    }
    public static func check(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], schemas: [String: JSON]? = nil, held: [String: JSON]? = nil) -> [String] {
        (Core.maybe("check", type, state, refs, blocksOf(held) ?? [], blocksOf(schemas)) as? [String]) ?? []
    }
    public static func amount(_ value: String, _ unit: String) -> JSON { (try? Core.json("amount", value, unit)) ?? [:] }
    public static func money(_ minor: Int, _ currency: String) -> JSON { (try? Core.json("money", minor, currency)) ?? [:] }
    public static func confidence(_ value: String) throws -> String { try Core.string("confidence", value) }
    public static func terms(_ given: JSON) -> JSON { (try? Core.json("terms", given)) ?? [:] }

    // ---- Reading older shapes ----
    public static func readAs(_ block: JSON) -> JSON { (try? Core.json("read_as", block)) ?? block }
    public static func isA(_ block: JSON, _ type: String, _ kind: String? = nil) -> Bool { Core.bool("is_a", block, type, kind) }

    // ---- Chains and causal order ----
    public static func nextLink(_ last: JSON?, _ broughtIn: String?) throws -> Link { Link(try Core.json("next_link", last, broughtIn)) }
    public static func checkChain(_ blocks: [JSON], _ broughtIn: String?) -> ChainCheck {
        let c = (try? Core.json("check_chain", blocks, broughtIn ?? "")) ?? [:]
        return ChainCheck(head: c["head"] as? JSON, length: intOf(c["length"]) ?? 0, gaps: (c["gaps"] as? [Any] ?? []).compactMap { intOf($0) },
                          equivocations: c["equivocations"] as? [[String]] ?? [], broken: c["broken"] as? [String] ?? [])
    }
    public static func causalOrder(_ blocks: [JSON]) -> [JSON] { (Core.maybe("causal_order", blocks) as? [JSON]) ?? [] }
    public static func sees(_ later: JSON?, _ earlier: JSON?, _ blocks: [JSON]) -> Bool { Core.bool("sees", later, earlier, blocks) }

    // ---- Writing and the wire ----
    public static let publicAudience = "public"

    static func options(author: String, audience: [String]?, after: [String], at: String?, link: Link?, salts: [String: String]? = nil) -> JSON {
        var o: JSON = ["author": author, "after": after]
        if let a = audience { o["audience"] = a }
        if let at = at { o["at"] = at }
        if let l = link { o["link"] = l.json }
        if let s = salts, !s.isEmpty { o["salts"] = s }
        return o
    }
    /// A block as its author says it. `audience` is "public" or recipients (people, circles, `circle#role`), written
    /// as commitments with a nonce; a private block comes back with its salts beside it (`salts`), never signed.
    public static func compose(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], author: String, audience: [String]? = nil,
                               after: [String] = [], at: String? = nil, link: Link? = nil, salts given: [String: String] = [:]) throws -> JSON {
        try Core.json("compose", type, state, refs, options(author: author, audience: audience, after: after, at: at, link: link, salts: given))
    }
    /// The one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next place
    /// in that key's chain among `held`. Throws `.refused` with every finding: { code, detail }, one per code.
    public static func write(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], author: String, key: Keypair, held: [JSON] = [],
                             schemas: [String: JSON]? = nil, link: Link? = nil, audience: [String]? = nil, after: [String] = [],
                             at: String? = nil) throws -> JSON {
        var o = options(author: author, audience: audience, after: after, at: at, link: link)
        o["key"] = key.json; o["held"] = held
        if let s = schemas { o["schemas"] = Array(s.values) }
        return try Core.json("write", type, state, refs, o)
    }
    public static func wrap(_ signed: JSON, version: String = FoodBlock.version) -> JSON { (try? Core.json("wrap", signed)) ?? [:] }
    public static func unwrap(_ message: JSON) throws -> JSON { try Core.json("unwrap", message) }
    public static func header(_ block: JSON) throws -> JSON { try Core.json("header", block) }
    public static func sealCopy(_ signed: JSON, keys: [String], reveals: [JSON] = [], privateKey: String) throws -> JSON {
        try Core.json("seal_copy", signed, keys, reveals, privateKey)
    }
    public static func headerSignedBy(_ message: JSON, _ publicKey: String) -> Bool { Core.bool("header_signed_by", message, publicKey) }
    public static func openCopy(_ message: JSON, _ x25519Private: String) throws -> JSON { try Core.json("open_copy", message, x25519Private) }
}
