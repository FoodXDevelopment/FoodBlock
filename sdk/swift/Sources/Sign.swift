import Foundation
import CryptoKit

/// A signing key: its SPKI DER bytes in hex (`public_key_sign`), and its PKCS#8 DER private key in hex.
public struct Keypair {
    public let publicKeySign: String
    public let privateKey: String
}

// Signing (spec/protocol.md, Encoding): Ed25519 over the canonical UTF-8 string of { type, state, refs }. `sign`
// signs; `seal` (Envelope.swift) encrypts. A signed message part is signed over its canonical JSON without `signature`.
extension FoodBlock {
    static let pkcs8Ed25519 = "302e020100300506032b657004220420"
    // The SPKI prefix of an Ed25519 key, as protocol.json's `sign_key` grammar writes it.
    static let spkiEd25519 = String(((spec["grammar"] as! JSON)["sign_key"] as! String).dropFirst().prefix(24))

    /// The signing key a 32-byte seed (hex) gives: how the vectors' keys are rebuilt.
    public static func keypairFromSeed(_ seedHex: String) throws -> Keypair {
        guard let seed = Data(hex: seedHex), seed.count == 32 else { throw FoodBlockError.invalid("sign: a seed is 32 bytes of hex") }
        let key = try Curve25519.Signing.PrivateKey(rawRepresentation: seed)
        return Keypair(publicKeySign: spkiEd25519 + key.publicKey.rawRepresentation.hex, privateKey: pkcs8Ed25519 + seed.hex)
    }

    /// A new signing key.
    public static func generateKeypair() -> Keypair {
        try! keypairFromSeed(Curve25519.Signing.PrivateKey().rawRepresentation.hex)
    }

    static func privateKey(_ hex: String) throws -> Curve25519.Signing.PrivateKey {
        var h = hex.lowercased()
        if h.hasPrefix(pkcs8Ed25519) && h.count == 96 { h.removeFirst(pkcs8Ed25519.count) }
        guard let seed = Data(hex: h), seed.count == 32 else { throw FoodBlockError.invalid("sign: a private key is PKCS#8 DER hex") }
        return try Curve25519.Signing.PrivateKey(rawRepresentation: seed)
    }

    static func publicKey(_ hex: String) -> Curve25519.Signing.PublicKey? {
        guard test("sign_key", hex), let raw = Data(hex: String(hex.dropFirst(spkiEd25519.count))) else { return nil }
        return try? Curve25519.Signing.PublicKey(rawRepresentation: raw)
    }

    static func bytes(_ block: JSON) throws -> Data {
        Data(try canonical(block["type"] as? String ?? "", obj(block["state"]) ?? [:], obj(block["refs"]) ?? [:]).utf8)
    }

    /// The author's signature over a block's canonical form, hex. (CryptoKit's Ed25519 signatures are randomized;
    /// every one verifies, but two signatures of one block differ.)
    public static func sign(_ block: JSON, privateKey hex: String) throws -> String {
        try privateKey(hex).signature(for: bytes(block)).hex
    }

    /// Whether a signature is this key's over exactly this block. Never throws.
    public static func verify(_ block: JSON, _ signature: Any?, _ publicKeySign: String?) -> Bool {
        guard let pub = publicKeySign, let key = publicKey(pub), let sigHex = signature as? String, let sig = Data(hex: sigHex),
              let data = try? bytes(block) else { return false }
        return key.isValidSignature(sig, for: data)
    }

    /// A message part, signed: the part with `signature` added (over its canonical JSON without `signature`).
    public static func signMessage(_ part: JSON, privateKey hex: String) throws -> JSON {
        var rest = part
        rest.removeValue(forKey: "signature")
        var out = rest
        out["signature"] = try privateKey(hex).signature(for: Data(try canonicalJSON(rest).utf8)).hex
        return out
    }

    /// Whether a signed message part's `signature` is this key's. Never throws.
    public static func verifyMessage(_ part: JSON?, _ publicKeySign: String?) -> Bool {
        guard var rest = part, let pub = publicKeySign, let key = publicKey(pub),
              let sigHex = rest.removeValue(forKey: "signature") as? String, let sig = Data(hex: sigHex),
              let text = try? canonicalJSON(rest) else { return false }
        return key.isValidSignature(sig, for: Data(text.utf8))
    }
}
