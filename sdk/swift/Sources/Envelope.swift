import Foundation
import CryptoKit

/// An encryption key: X25519, raw 32 bytes each, hex.
public struct EncryptionKeypair {
    public let publicKeyEncrypt: String
    public let x25519Private: String
}

/// Fixed randomness, only to reproduce a vector: { ephemeral, contentKey, nonce, keyNonces } (hex).
public struct EnvelopeFixed {
    public var ephemeral: String?, contentKey: String?, nonce: String?, keyNonces: [String] = []
    public init(ephemeral: String? = nil, contentKey: String? = nil, nonce: String? = nil, keyNonces: [String] = []) {
        self.ephemeral = ephemeral; self.contentKey = contentKey; self.nonce = nonce; self.keyNonces = keyNonces
    }
}

// The envelope (spec/protocol.md, Encoding): the plaintext is encrypted with AES-256-GCM under a random 32-byte content
// key and a 12-byte nonce, no additional data. A fresh X25519 key per envelope agrees a secret with each recipient's
// key; HKDF-SHA256 (salted with the ephemeral public key's bytes then the recipient's, info from protocol.json) turns it
// into the key that seals the content key, with its own 12-byte nonce. The envelope names no recipient: each recipient
// tries every entry. `alg` written now is protocol.json `envelope.write`; `algRaw`, read forever, used the secret
// itself. An older envelope's `key_hash` is ignored.
extension FoodBlock {
    static let envelopeSpec = spec["envelope"] as! JSON
    public static let alg = envelopeSpec["write"] as! String
    public static let algRaw = (envelopeSpec["read"] as! [String]).first { $0 != alg }!
    static let hkdfInfo = Data((envelopeSpec["hkdf_info"] as! String).utf8)

    public static func generateEncryptionKeypair() -> EncryptionKeypair {
        let key = Curve25519.KeyAgreement.PrivateKey()
        return EncryptionKeypair(publicKeyEncrypt: key.publicKey.rawRepresentation.hex, x25519Private: key.rawRepresentation.hex)
    }

    static func agreementKey(_ hex: String) throws -> Curve25519.KeyAgreement.PrivateKey {
        guard let raw = Data(hex: hex), raw.count == 32 else { throw FoodBlockError.invalid("envelope: an X25519 private key is 32 bytes") }
        return try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: raw)
    }

    /// The public encryption key of an X25519 private key (hex).
    public static func encryptionKeyOf(_ x25519Private: String) throws -> String {
        try agreementKey(x25519Private).publicKey.rawRepresentation.hex
    }

    static func sealingKey(_ alg: String, _ s: SharedSecret, ephemeral: Data, recipient: Data) throws -> SymmetricKey {
        if alg == algRaw { return SymmetricKey(data: s.withUnsafeBytes { Data($0) }) }
        guard alg == FoodBlock.alg else { throw FoodBlockError.invalid("envelope: unknown alg \(alg)") }
        return s.hkdfDerivedSymmetricKey(using: SHA256.self, salt: ephemeral + recipient, sharedInfo: hkdfInfo, outputByteCount: 32)
    }

    static func nonceData(_ hex: String?) throws -> AES.GCM.Nonce {
        if let h = hex, let d = Data(hex: h) { return try AES.GCM.Nonce(data: d) }
        return AES.GCM.Nonce()
    }

    /// Encrypt a value (JSON) to recipients' encryption keys: `{ alg, ephemeral_key, nonce, ciphertext, recipients:
    /// [{ encrypted_key }] }`.
    public static func seal(_ value: Any, _ recipientKeys: [String], alg: String = FoodBlock.alg, fixed: EnvelopeFixed = EnvelopeFixed()) throws -> JSON {
        guard !recipientKeys.isEmpty else { throw FoodBlockError.invalid("envelope: at least one recipient key") }
        let plaintext = try JSONSerialization.data(withJSONObject: value, options: [.withoutEscapingSlashes, .fragmentsAllowed])
        let contentKey = fixed.contentKey.flatMap { Data(hex: $0) }.map { SymmetricKey(data: $0) } ?? SymmetricKey(size: .bits256)
        let box = try AES.GCM.seal(plaintext, using: contentKey, nonce: try nonceData(fixed.nonce))
        let ephemeral = try fixed.ephemeral.map(agreementKey) ?? Curve25519.KeyAgreement.PrivateKey()
        let ephemeralRaw = ephemeral.publicKey.rawRepresentation
        var recipients: [Any] = []
        for (i, pub) in recipientKeys.enumerated() {
            guard let raw = Data(hex: pub), raw.count == 32 else { throw FoodBlockError.invalid("envelope: an X25519 public key is 32 bytes") }
            let secret = try ephemeral.sharedSecretFromKeyAgreement(with: Curve25519.KeyAgreement.PublicKey(rawRepresentation: raw))
            let sealed = try AES.GCM.seal(contentKey.withUnsafeBytes { Data($0) }, using: try sealingKey(alg, secret, ephemeral: ephemeralRaw, recipient: raw),
                                          nonce: try nonceData(i < fixed.keyNonces.count ? fixed.keyNonces[i] : nil))
            recipients.append(["encrypted_key": (sealed.ciphertext + sealed.tag + Data(sealed.nonce)).base64EncodedString()])
        }
        return ["alg": alg, "ephemeral_key": ephemeralRaw.hex, "nonce": Data(box.nonce).base64EncodedString(),
                "ciphertext": (box.ciphertext + box.tag).base64EncodedString(), "recipients": recipients]
    }

    /// Open an envelope with a recipient's X25519 private key: the value inside. Every entry is tried; none names its recipient.
    public static func open(_ envelope: JSON, _ x25519Private: String) throws -> Any {
        let key = try agreementKey(x25519Private), mine = key.publicKey.rawRepresentation
        guard let ephHex = envelope["ephemeral_key"] as? String, let eph = Data(hex: ephHex), eph.count == 32,
              let nonce = Data(base64Encoded: envelope["nonce"] as? String ?? ""),
              let body = Data(base64Encoded: envelope["ciphertext"] as? String ?? ""), body.count >= 16 else {
            throw FoodBlockError.invalid("envelope: a malformed envelope")
        }
        let secret = try key.sharedSecretFromKeyAgreement(with: Curve25519.KeyAgreement.PublicKey(rawRepresentation: eph))
        let sealing = try sealingKey(envelope["alg"] as? String ?? algRaw, secret, ephemeral: eph, recipient: mine)
        for entry in envelope["recipients"] as? [Any] ?? [] {
            guard let sealed = Data(base64Encoded: (entry as? JSON)?["encrypted_key"] as? String ?? ""), sealed.count >= 28 else { continue }
            let n = sealed.count
            guard let keyBox = try? AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: sealed.suffix(12)), ciphertext: sealed.prefix(n - 28),
                                                      tag: sealed.subdata(in: (n - 28)..<(n - 12))),
                  let contentKey = try? AES.GCM.open(keyBox, using: sealing) else { continue }
            let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce), ciphertext: body.prefix(body.count - 16), tag: body.suffix(16))
            let plaintext = try AES.GCM.open(box, using: SymmetricKey(data: contentKey))
            return try JSONSerialization.jsonObject(with: plaintext, options: [.fragmentsAllowed])
        }
        throw FoodBlockError.invalid("envelope: no entry opens with this key")
    }
}

// The commitment (spec/protocol.md §9): the one privacy primitive. A salted hash, SHA-256 of the salt's hex followed by
// the value, as UTF-8. The salt (or the salt and the value) travels beside the block only to whoever it is for.
extension FoodBlock {
    /// 16 random bytes, hex: a salt, or a block's nonce.
    public static func newSalt() -> String { randomHex(16) }

    /// The commitment to a value under a salt.
    public static func saltedHash(_ salt: String, _ value: String) -> String { sha256Hex(salt + value) }

    /// An audience for these recipients (people, circles, `circle#role`): sorted commitments, and each recipient's salt.
    public static func commit(_ recipients: [String], salts given: [String: String] = [:]) throws -> (audience: [String], salts: [String: String]) {
        let who = unique(recipients)
        guard !who.isEmpty, !who.contains("") else { throw FoodBlockError.invalid("audience: an audience names at least one recipient") }
        var salts: [String: String] = [:]
        for one in who { salts[one] = given[one] ?? newSalt() }
        return (sortedJS(unique(who.map { saltedHash(salts[$0]!, $0) })), salts)
    }

    /// Whether a recipient holding this salt finds itself in a block's audience.
    public static func findsSelf(_ block: JSON, _ recipient: String, _ salt: String?) -> Bool {
        guard let audience = dig(block, "state.audience") as? [Any], let salt = salt, !salt.isEmpty else { return false }
        return audience.contains { ($0 as? String) == saltedHash(salt, recipient) }
    }

    /// The reveal a recipient's copy carries for its audience entry: `{ salt, value }` (its own id).
    public static func revealFor(_ salts: [String: String], _ recipient: String) -> JSON {
        ["salt": salts[recipient] ?? NSNull(), "value": recipient]
    }
}
