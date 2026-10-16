import Foundation

/// A signing key, hex. `suite` names its suite (core.md, Suites) and is nil for std (Ed25519).
public struct Keypair {
    public let publicKeySign: String
    public let privateKey: String
    public let suite: String?
    public init(publicKeySign: String, privateKey: String, suite: String? = nil) { self.publicKeySign = publicKeySign; self.privateKey = privateKey; self.suite = suite }
    init(_ j: JSON) { publicKeySign = j["public_key_sign"] as! String; privateKey = j["private_key"] as! String; suite = j["suite"] as? String }
    var json: JSON {
        var o: JSON = ["public_key_sign": publicKeySign, "private_key": privateKey]
        if let s = suite { o["suite"] = s }
        return o
    }
}

/// An encryption key in a suite (std: X25519, raw 32 bytes each, hex).
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

/// One key's chain checked: `gaps` the missing seq numbers, `skips` the seq numbers a block jumped over on purpose,
/// `equivocations` the pairs of hashes naming one prev, `broken` the blocks whose prev is not the block before them.
public struct ChainCheck {
    public let head: JSON?
    public let length: Int
    public let gaps: [Int]
    public let skips: [Int]
    public let equivocations: [[String]]
    public let broken: [String]
    public let ok: Bool
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
    /// A new block `{ hash, type, state, refs }` (and `suite` when it is not std). Strict: a null, a float or text outside NFC is refused.
    public static func create(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], suite: String = "std") throws -> JSON { try Core.json("create", type, state, refs, suite) }
    /// The id of a block: the hash of its canonical form, in the hash of the suite of the key that signed it.
    public static func hash(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], suite: String = "std") throws -> String { try Core.string("hash", type, state, refs, suite) }
    /// The id of a block as it is held (its own `suite`, std when it names none).
    public static func hash(of block: JSON) throws -> String {
        try hash(block["type"] as? String ?? "", block["state"] as? JSON ?? [:], block["refs"] as? JSON ?? [:], suite: block["suite"] as? String ?? "std")
    }

    // ---- Signing ----
    public static func keypairFromSeed(_ seedHex: String, suite: String = "std") throws -> Keypair { Keypair(try Core.json("keypair", seedHex, suite)) }
    public static func generateKeypair(suite: String = "std") -> Keypair { Keypair(try! Core.json("keypair", nil, suite)) }
    /// The author's signature over a block's canonical form; `suite` is the suite of the signing key.
    public static func sign(_ block: JSON, privateKey hex: String, suite: String = "std") throws -> String { try Core.string("sign", block, hex, suite) }
    /// The suite a signing key (SPKI hex) belongs to, or nil.
    public static func suiteOfKey(_ publicKey: String) -> String? { Core.maybe("suite_of_key", publicKey) as? String }
    /// The challenge to ask a passkey to sign: base64url of the SHA-256 of the signed bytes (for a block, its id).
    public static func passkeyChallenge(_ blockOrPart: JSON) throws -> String { try Core.string("passkey_challenge", blockOrPart) }
    /// A passkey's WebAuthn answer (each part as hex; the signature may be DER) as a FoodBlock signature, hex.
    public static func passkeySignature(authenticatorData: String, clientDataJSON: String, signature: String) throws -> String { try Core.string("passkey_signature", authenticatorData, clientDataJSON, signature) }
    public static func verify(_ block: JSON, _ signature: Any?, _ publicKeySign: String?) -> Bool { Core.bool("verify", block, signature, publicKeySign) }
    public static func signMessage(_ part: JSON, privateKey hex: String, suite: String = "std") throws -> JSON { try Core.json("sign_message", part, hex, suite) }
    public static func verifyMessage(_ part: JSON?, _ publicKeySign: String?) -> Bool { Core.bool("verify_message", part, publicKeySign) }

    // ---- Envelopes ----
    /// A new encryption key in a suite.
    public static func generateEncryptionKeypair(suite: String = "std") -> EncryptionKeypair {
        let k = try! Core.json("encryption_keypair", suite)
        return EncryptionKeypair(publicKeyEncrypt: k["public_key_encrypt"] as! String, x25519Private: k["x25519_private"] as! String)
    }
    public static func encryptionKeyOf(_ x25519Private: String, suite: String = "std") throws -> String { try Core.string("encryption_key_of", x25519Private, suite) }
    /// Encrypt a value to recipients' encryption keys in a suite. `fixed` exists only to reproduce a vector.
    public static func seal(_ value: Any, _ recipientKeys: [String], suite: String = "std", fixed: JSON? = nil) throws -> JSON { try Core.json("seal", value, recipientKeys, suite, fixed) }
    public static func open(_ envelope: JSON, _ x25519Private: String) throws -> Any { try Core.ask("open", envelope, x25519Private) ?? NSNull() }

    // ---- The commitment ----
    public static func newSalt() -> String { try! Core.string("new_salt") }
    public static func saltedHash(_ salt: String, _ value: String, suite: String = "std") -> String { (try? Core.string("salted_hash", salt, value, suite)) ?? "" }
    public static func commit(_ recipients: [String], salts given: [String: String] = [:], suite: String = "std") throws -> (audience: [String], salts: [String: String]) {
        let c = try Core.json("commit", recipients, given, suite)
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
    /// valid(block, context): every refusal of a signed block against the blocks held (empty when valid).
    public static func valid(_ block: JSON, held: [JSON] = [], schemas: [JSON]? = nil, arrivedAt: Identity.Arrival? = nil) -> [Finding] {
        findings(Core.maybe("valid", block, held, schemas, Identity.log(arrivedAt, held + [block])))
    }
    /// Strict writing from JSON text: a repeated key, then every refusal of the block it holds.
    public static func strictText(_ text: String) -> [Finding] { findings(Core.maybe("strict_text", text)) }
    /// The short receipt code of a block id: `XXXX-XXXX` (Crockford Base32 of its first 5 bytes).
    public static func receiptCode(_ id: String) -> String { (try? Core.string("receipt_code", id)) ?? "" }
    /// The ten-character form (first 50 bits, `XXXXX-XXXXX`), for a custodian whose index holds two blocks with one short code.
    public static func receiptCodeLong(_ id: String) -> String { (try? Core.string("receipt_code", id, true)) ?? "" }
    /// Whether a typed code names this block: case, spaces and hyphens ignored, O read as 0, I and L as 1; 8 characters match the short code, 10 the long one.
    public static func codeMatches(_ text: String, _ id: String) -> Bool { Core.bool("code_matches", text, id) }
    public static func isTime(_ value: Any?) -> Bool { Core.bool("is_time", value) }
    public static func isDate(_ value: Any?) -> Bool { Core.bool("is_date", value) }
    public static func amount(_ value: String, _ unit: String) -> JSON { (try? Core.json("amount", value, unit)) ?? [:] }
    public static func money(_ minor: Int, _ currency: String) -> JSON { (try? Core.json("money", minor, currency)) ?? [:] }
    public static func confidence(_ value: String) throws -> String { try Core.string("confidence", value) }
    public static func terms(_ given: JSON) -> JSON { (try? Core.json("terms", given)) ?? [:] }

    // ---- Chains and causal order ----
    public static func nextLink(_ last: JSON?, _ broughtIn: String?) throws -> Link { Link(try Core.json("next_link", last, broughtIn)) }
    public static func checkChain(_ blocks: [JSON], _ broughtIn: String?) -> ChainCheck {
        let c = (try? Core.json("check_chain", blocks, broughtIn ?? "")) ?? [:]
        return ChainCheck(head: c["head"] as? JSON, length: intOf(c["length"]) ?? 0, gaps: (c["gaps"] as? [Any] ?? []).compactMap { intOf($0) },
                          skips: (c["skips"] as? [Any] ?? []).compactMap { intOf($0) }, equivocations: c["equivocations"] as? [[String]] ?? [],
                          broken: c["broken"] as? [String] ?? [], ok: c["ok"] as? Bool ?? false)
    }
    public static func causalOrder(_ blocks: [JSON]) -> [JSON] { (Core.maybe("causal_order", blocks) as? [JSON]) ?? [] }
    /// The hashes a block names, through every ref.
    public static func causesOf(_ block: JSON?) -> [String] { Core.strings("causes_of", block) }
    public static func sees(_ later: JSON?, _ earlier: JSON?, _ blocks: [JSON]) -> Bool { Core.bool("sees", later, earlier, blocks) }

    // ---- Writing and the wire ----
    public static let publicAudience = "public"

    static func options(author: String, audience: [String]?, after: [String], at: String?, link: Link?, salts: [String: String]? = nil, suite: String? = nil, skip: Bool = false) -> JSON {
        var o: JSON = ["author": author, "after": after]
        if let s = suite { o["suite"] = s }
        if skip { o["skip"] = true }
        if let a = audience { o["audience"] = a }
        if let at = at { o["at"] = at }
        if let l = link { o["link"] = l.json }
        if let s = salts, !s.isEmpty { o["salts"] = s }
        return o
    }
    /// A block as its author says it. `audience` is "public" or recipients (people, circles, `circle#role`), written
    /// as commitments with a nonce; a private block comes back with its salts beside it (`salts`), never signed.
    public static func compose(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], author: String, audience: [String]? = nil,
                               after: [String] = [], at: String? = nil, link: Link? = nil, salts given: [String: String] = [:], suite: String? = nil, skip: Bool = false) throws -> JSON {
        try Core.json("compose", type, state, refs, options(author: author, audience: audience, after: after, at: at, link: link, salts: given, suite: suite, skip: skip))
    }
    /// The one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next place
    /// in that key's chain among `held`. Throws `.refused` with every finding: { code, detail }, one per code.
    public static func write(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], author: String, key: Keypair, held: [JSON] = [],
                             schemas: [String: JSON]? = nil, link: Link? = nil, audience: [String]? = nil, after: [String] = [],
                             at: String? = nil, suite: String? = nil, skip: Bool = false) throws -> JSON {
        var o = options(author: author, audience: audience, after: after, at: at, link: link, suite: suite ?? key.suite, skip: skip)
        o["key"] = key.json; o["held"] = held
        if let s = schemas { o["schemas"] = Array(s.values) }
        return try Core.json("write", type, state, refs, o)
    }
    /// A signed public block as it travels: `{ version, block, signature }`, and `suite` when it is not std.
    public static func wrap(_ signed: JSON, version: String = FoodBlock.version) -> JSON { var m = (try? Core.json("wrap", signed)) ?? [:]; m["version"] = version; return m }
    /// A block off the wire: its hash recomputed from its content, its signature, suite and version kept beside.
    public static func unwrap(_ message: JSON) throws -> JSON { try Core.json("unwrap", message) }
    public static func header(_ block: JSON) throws -> JSON { try Core.json("header", block) }
    /// A signed block sealed to recipients' encryption keys in `suite`, its header signed by the block's key. `fixed` only reproduces a vector.
    public static func sealCopy(_ signed: JSON, keys: [String], reveals: [JSON] = [], privateKey: String, suite: String = "std", fixed: JSON? = nil) throws -> JSON {
        try Core.json("seal_copy", signed, keys, reveals, privateKey, fixed, suite)
    }
    public static func headerSignedBy(_ message: JSON, _ publicKey: String) -> Bool { Core.bool("header_signed_by", message, publicKey) }
    public static func openCopy(_ message: JSON, _ x25519Private: String) throws -> JSON { try Core.json("open_copy", message, x25519Private) }
}
