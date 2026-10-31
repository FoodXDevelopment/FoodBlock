import Foundation

/// A signing key, hex. `suite` names its suite (core.md, Suites) and is nil for std (Ed25519).
public struct Keypair: CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable {
    public let publicKeySign: String
    public let privateKey: String
    public let suite: String?
    public init(publicKeySign: String, privateKey: String, suite: String? = nil) { self.publicKeySign = publicKeySign; self.privateKey = privateKey; self.suite = suite }
    init(_ j: JSON) { publicKeySign = j["public_key_sign"] as! String; privateKey = j["private_key"] as! String; suite = j["suite"] as? String }
    // a key is never printed, logged or dumped by accident: the private half is hidden
    public var description: String { "Keypair(publicKeySign: \(publicKeySign), privateKey: <hidden>, suite: \(suite ?? "std"))" }
    public var debugDescription: String { description }
    public var customMirror: Mirror { Mirror(self, children: ["publicKeySign": publicKeySign, "suite": suite as Any]) }
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
    public let head: String? // the hash of the chain's last block
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
    public static func canonical(_ type: String, _ state: JSON, _ refs: JSON) throws -> String { try Door.canonical(type, state, refs) }
    public static func canonicalJSON(_ value: Any) throws -> String { try Door.canonicalJson(value) }
    /// A new block `{ hash, type, state, refs }`, its id in the hash of `suite` (the signing key's). Strict: a null, a float or text outside NFC is refused.
    public static func create(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], suite: String = "std") throws -> JSON { try Door.create(type, state, refs, suite) }
    /// The id of a block: the hash of its canonical form, in the hash of the suite of the key that signed it.
    public static func hash(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], suite: String = "std") throws -> String { try Door.hash(type, state, refs, suite) }
    /// The id of a block, in the suite of the key that signed it (core.md, section 2), that key found among `held`; with none, in the suite
    /// the block shows (a genesis's own, else as its prev is hashed). No label names it.
    public static func hash(of block: JSON, held: [JSON]? = nil) throws -> String {
        try Door.idOf(block, held)
    }

    // ---- Signing ----
    public static func keypairFromSeed(_ seedHex: String, suite: String = "std") throws -> Keypair { Keypair(try Door.keypair(seedHex, suite)) }
    public static func generateKeypair(suite: String = "std") -> Keypair { Keypair(try! Door.keypair(nil, suite)) }
    /// The author's signature over a block's canonical form; `suite` is the suite of the signing key.
    public static func sign(_ block: JSON, privateKey hex: String, suite: String = "std") throws -> String { try Door.sign(block, hex, suite) }
    /// The suite a signing key (SPKI hex) belongs to, or nil.
    public static func suiteOfKey(_ publicKey: String) throws -> String? { try Door.suiteOfKey(publicKey) }
    /// The challenge to ask a passkey to sign: base64url of the SHA-256 of the signed bytes (for a block, its id).
    public static func passkeyChallenge(_ blockOrPart: JSON) throws -> String { try Door.passkeyChallenge(blockOrPart) }
    /// A passkey's WebAuthn answer (each part as hex; the signature may be DER) as a FoodBlock signature, hex.
    public static func passkeySignature(authenticatorData: String, clientDataJSON: String, signature: String) throws -> String { try Door.passkeySignature(authenticatorData, clientDataJSON, signature) }
    public static func verify(_ block: JSON, _ signature: Any?, _ publicKeySign: String?) throws -> Bool { try Door.verify(block, (signature as? String) ?? "", publicKeySign ?? "") }
    public static func signMessage(_ part: JSON, privateKey hex: String, suite: String = "std") throws -> JSON { try Door.signMessage(part, hex, suite) }
    public static func verifyMessage(_ part: JSON?, _ publicKeySign: String?) throws -> Bool { try Door.verifyMessage(part ?? [:], publicKeySign ?? "") }

    // ---- Envelopes ----
    /// A new encryption key in a suite.
    public static func generateEncryptionKeypair(suite: String = "std") -> EncryptionKeypair {
        let k = try! Door.encryptionKeypair(suite)
        return EncryptionKeypair(publicKeyEncrypt: k["public_key_encrypt"] as! String, x25519Private: k["x25519_private"] as! String)
    }
    public static func encryptionKeyOf(_ x25519Private: String, suite: String = "std") throws -> String { try Door.encryptionKeyOf(x25519Private, suite) }
    /// Encrypt a value to recipients' encryption keys in a suite. `fixed` exists only to reproduce a vector.
    public static func seal(_ value: Any, _ recipientKeys: [String], suite: String = "std", fixed: JSON? = nil) throws -> JSON { try Door.seal(value, recipientKeys, suite, fixed) }
    public static func open(_ envelope: JSON, _ x25519Private: String) throws -> Any { try Door.open(envelope, x25519Private) ?? NSNull() }

    // ---- The commitment ----
    public static func newSalt() -> String { try! Door.newSalt() }
    public static func saltedHash(_ salt: String, _ value: String, suite: String = "std") throws -> String { try Door.saltedHash(salt, value, suite) }
    public static func commit(_ recipients: [String], salts given: [String: String] = [:], suite: String = "std") throws -> (audience: [String], salts: [String: String]) {
        let c = try Door.commit(recipients, given, suite)
        return (c["audience"] as? [String] ?? [], c["salts"] as? [String: String] ?? [:])
    }
    public static func findsSelf(_ block: JSON, _ recipient: String, _ salt: String?) throws -> Bool { try Door.findsSelf(block, recipient, salt ?? "") }
    public static func revealFor(_ salts: [String: String], _ recipient: String) throws -> JSON { (try Door.revealFor(salts, recipient) as? JSON) ?? [:] }

    // ---- The write check and the words it asks for ----
    public static func refusals(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], schemas: [String: JSON]? = nil, held: [String: JSON]? = nil) throws -> [Finding] {
        findings(try Door.refusals(type, state, refs, blocksOf(held) ?? [], blocksOf(schemas)))
    }
    public static func check(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], schemas: [String: JSON]? = nil, held: [String: JSON]? = nil) throws -> [String] {
        try Door.check(type, state, refs, blocksOf(held) ?? [], blocksOf(schemas))
    }
    /// valid(block, context): every refusal of a signed block against the blocks held (empty when valid).
    public static func valid(_ block: JSON, held: [JSON] = [], schemas: [JSON]? = nil, arrivedAt: Identity.Arrival? = nil) throws -> [Finding] {
        findings(try Door.valid(block, held, schemas))
    }
    /// Strict writing from JSON text: a repeated key, then every refusal of the block it holds.
    public static func strictText(_ text: String) throws -> [Finding] { findings(try Door.strictText(text)) }
    /// The short receipt code of a block id: `XXXX-XXXX` (Crockford Base32 of its first 5 bytes).
    public static func receiptCode(_ id: String) throws -> String { try Door.receiptCode(id) }
    /// The ten-character form (first 50 bits, `XXXXX-XXXXX`), for a custodian whose index holds two blocks with one short code.
    public static func receiptCodeLong(_ id: String) throws -> String { try Door.receiptCode(id, true) }
    /// Whether a typed code names this block: case, spaces and hyphens ignored, O read as 0, I and L as 1; 8 characters match the short code, 10 the long one.
    public static func codeMatches(_ text: String, _ id: String) throws -> Bool { try Door.codeMatches(text, id) }
    public static func isTime(_ value: Any?) throws -> Bool { try Door.isTime(value) }
    public static func isDate(_ value: Any?) throws -> Bool { try Door.isDate(value) }
    public static func amount(_ value: String, _ unit: String) throws -> JSON { try Door.amount(value, unit) }
    public static func money(_ minor: Int, _ currency: String) throws -> JSON { try Door.money(minor, currency) }
    public static func terms(_ given: JSON) throws -> JSON { try Door.terms(given) }

    // ---- Chains and causal order ----
    public static func nextLink(_ last: JSON?, _ broughtIn: String?) throws -> Link { Link(try Door.nextLink(last, broughtIn)) }
    public static func checkChain(_ blocks: [JSON], _ broughtIn: String?) throws -> ChainCheck {
        let c = try Door.checkChain(blocks, broughtIn ?? "")
        return ChainCheck(head: c["head"] as? String, length: intOf(c["length"]) ?? 0, gaps: (c["gaps"] as? [Any] ?? []).compactMap { intOf($0) },
                          skips: (c["skips"] as? [Any] ?? []).compactMap { intOf($0) }, equivocations: c["equivocations"] as? [[String]] ?? [],
                          broken: c["broken"] as? [String] ?? [], ok: c["ok"] as? Bool ?? false)
    }
    public static func causalOrder(_ blocks: [JSON]) throws -> [JSON] { try Door.causalOrder(blocks) }
    /// The hashes a block names, through every ref.
    public static func causesOf(_ block: JSON?) throws -> [String] { try Door.causesOf(block ?? [:]) }
    public static func sees(_ later: JSON?, _ earlier: JSON?, _ blocks: [JSON]) throws -> Bool { try Door.sees(later ?? [:], earlier ?? [:], blocks) }

    // ---- Writing and the wire ----
    public static let publicAudience = "public"

    /// The words of a block's audience: "public" or the recipients, never a default.
    public enum Audience {
        case `public`
        case to([String])
        var json: Any { switch self { case .public: return FoodBlock.publicAudience; case .to(let r): return r } }
    }
    /// Where a block's time comes from: the author states `at` (an ISO time) or says plainly it has no clock.
    public enum When {
        case at(String)
        case clockless
    }

    static func options(author: String, audience: Audience, after: [String], when: When, link: Link?, salts: [String: String]? = nil, suite: String? = nil, skip: Bool = false) -> JSON {
        var o: JSON = ["author": author, "after": after, "audience": audience.json]
        if let s = suite { o["suite"] = s }
        if skip { o["skip"] = true }
        switch when { case .at(let t): o["at"] = t; case .clockless: o["clockless"] = true }
        if let l = link { o["link"] = l.json }
        if let s = salts, !s.isEmpty { o["salts"] = s }
        return o
    }
    /// A block as its author says it. `audience` is "public" or recipients (people, circles, `circle#role`), written
    /// as commitments with a nonce; a private block comes back with its salts beside it (`salts`), never signed.
    public static func compose(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], author: String, audience: Audience,
                               after: [String] = [], when: When, link: Link? = nil, salts given: [String: String] = [:], suite: String? = nil, skip: Bool = false) throws -> JSON {
        try Door.compose(type, state, refs, options(author: author, audience: audience, after: after, when: when, link: link, salts: given, suite: suite, skip: skip))
    }
    /// The one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next place
    /// in that key's chain among `held`. Throws `.refused` with every finding: { code, detail }, one per code.
    public static func write(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], author: String, key: Keypair, held: [JSON] = [],
                             schemas: [String: JSON]? = nil, link: Link? = nil, audience: Audience, after: [String] = [],
                             when: When, suite: String? = nil, skip: Bool = false) throws -> JSON {
        var o = options(author: author, audience: audience, after: after, when: when, link: link, suite: suite ?? key.suite, skip: skip)
        o["key"] = key.json; o["held"] = held
        if let s = schemas { o["schemas"] = Array(s.values) }
        return try Door.write(type, state, refs, o)
    }
    /// A signed public block as it travels: `{ block, signature }`: a message carries no version.
    public static func wrap(_ signed: JSON) throws -> JSON { try Door.wrap(signed) }
    /// A block off the wire: its hash recomputed from its content, its signature kept beside.
    /// The id is in the suite of the key that signed it, found among `held` (the author's blocks; core.md, section 2); with none, in the suite the block shows.
    public static func unwrap(_ message: JSON, held: [JSON]? = nil) throws -> JSON {
        try Door.unwrap(message, held)
    }
    public static func header(_ block: JSON) throws -> JSON { try Door.header(block) }
    /// A signed block sealed to recipients' encryption keys in `suite`, its header signed by the block's key. `fixed` only reproduces a vector.
    public static func sealCopy(_ signed: JSON, keys: [String], reveals: [JSON] = [], privateKey: String, suite: String = "std", fixed: JSON? = nil) throws -> JSON {
        try Door.sealCopy(signed, keys, reveals, privateKey, fixed, suite)
    }
    public static func headerSignedBy(_ message: JSON, _ publicKey: String) throws -> Bool { try Door.headerSignedBy(message, publicKey) }
    public static func openCopy(_ message: JSON, _ x25519Private: String) throws -> JSON { try Door.openCopy(message, x25519Private) }
}
