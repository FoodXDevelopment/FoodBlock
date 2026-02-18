import Foundation
import CryptoKit

/// Envelope encryption for FoodBlocks using X25519 key agreement + AES-256-GCM.
/// Matches the JavaScript SDK's encrypt.js implementation (Section 7.2).
public enum FoodBlockEncrypt {

    // MARK: - Errors

    public enum EncryptError: Error, CustomStringConvertible {
        case noRecipients
        case invalidKeyLength(String)
        case noMatchingRecipient
        case invalidEnvelope(String)
        case decryptionFailed(String)
        case serializationFailed(String)

        public var description: String {
            switch self {
            case .noRecipients:
                return "FoodBlock: at least one recipient public key is required"
            case .invalidKeyLength(let msg):
                return "FoodBlock: \(msg)"
            case .noMatchingRecipient:
                return "FoodBlock: no matching recipient entry found for this key"
            case .invalidEnvelope(let msg):
                return "FoodBlock: invalid envelope: \(msg)"
            case .decryptionFailed(let msg):
                return "FoodBlock: decryption failed: \(msg)"
            case .serializationFailed(let msg):
                return "FoodBlock: serialization failed: \(msg)"
            }
        }
    }

    // MARK: - Keypair Generation

    /// Generate an X25519 keypair for encryption.
    /// Returns (publicKey, privateKey) as raw 32-byte hex strings.
    /// Cross-language compatible with JavaScript and Python SDKs.
    public static func generateEncryptionKeypair() -> (publicKey: String, privateKey: String) {
        let privateKey = Curve25519.KeyAgreement.PrivateKey()
        let publicKey = privateKey.publicKey
        return (
            publicKey: publicKey.rawRepresentation.map { String(format: "%02x", $0) }.joined(),
            privateKey: privateKey.rawRepresentation.map { String(format: "%02x", $0) }.joined()
        )
    }

    // MARK: - Encrypt

    /// Encrypt a value for multiple recipients using envelope encryption.
    ///
    /// Uses X25519 key agreement + AES-256-GCM symmetric encryption.
    /// The value is JSON-serialized, encrypted with a random content key,
    /// and the content key is wrapped for each recipient using ECDH-derived shared secrets.
    ///
    /// - Parameters:
    ///   - value: The value to encrypt (must be JSON-serializable)
    ///   - recipientPublicKeys: Array of recipient X25519 public keys (hex, raw 32-byte)
    /// - Returns: Encryption envelope dictionary matching the JS format
    /// - Throws: EncryptError if keys are invalid or serialization fails
    public static func encrypt(value: Any, recipientPublicKeys: [String]) throws -> [String: Any] {
        guard !recipientPublicKeys.isEmpty else {
            throw EncryptError.noRecipients
        }

        // JSON-serialize the value
        let plaintext: Data
        do {
            plaintext = try jsonSerialize(value)
        } catch {
            throw EncryptError.serializationFailed("could not JSON-serialize value: \(error)")
        }

        // Generate a random 256-bit content key
        let contentKey = SymmetricKey(size: .bits256)
        let nonce = AES.GCM.Nonce()

        // Encrypt the value with the content key using AES-256-GCM
        let sealedBox = try AES.GCM.seal(plaintext, using: contentKey, nonce: nonce)

        // sealedBox.ciphertext + sealedBox.tag concatenated, then base64
        var ciphertextWithTag = Data(sealedBox.ciphertext)
        ciphertextWithTag.append(sealedBox.tag)
        let ciphertextBase64 = ciphertextWithTag.base64EncodedString()

        // Nonce as base64
        let nonceBase64 = Data(nonce).base64EncodedString()

        // Generate ephemeral X25519 keypair for ECDH
        let ephemeralPrivateKey = Curve25519.KeyAgreement.PrivateKey()
        let ephemeralPublicKey = ephemeralPrivateKey.publicKey
        let ephemeralPublicHex = ephemeralPublicKey.rawRepresentation.map { String(format: "%02x", $0) }.joined()

        // Extract raw content key bytes for wrapping
        let contentKeyData = contentKey.withUnsafeBytes { Data($0) }

        // Wrap the content key for each recipient
        var recipients: [[String: String]] = []
        for pubKeyHex in recipientPublicKeys {
            guard let pubKeyData = Data(hexString: pubKeyHex), pubKeyData.count == 32 else {
                throw EncryptError.invalidKeyLength("X25519 public key must be 32 bytes, got \(pubKeyHex.count / 2)")
            }

            let recipientPublicKey = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: pubKeyData)

            // Derive shared secret via ECDH
            let sharedSecret = try ephemeralPrivateKey.sharedSecretFromKeyAgreement(with: recipientPublicKey)
            // Use the raw shared secret bytes as the AES key (matching JS behavior)
            let sharedKeyData = sharedSecret.withUnsafeBytes { Data($0) }
            let sharedKey = SymmetricKey(data: sharedKeyData)

            // Encrypt the content key with the shared secret
            let keyNonce = AES.GCM.Nonce()
            let keySealedBox = try AES.GCM.seal(contentKeyData, using: sharedKey, nonce: keyNonce)

            // Format: encrypted_key_data + auth_tag + nonce (matching JS layout)
            var encryptedKeyBuf = Data(keySealedBox.ciphertext)
            encryptedKeyBuf.append(keySealedBox.tag)           // 16 bytes
            encryptedKeyBuf.append(Data(keyNonce))             // 12 bytes

            // key_hash = SHA-256 of the raw public key bytes
            let keyHash = SHA256.hash(data: pubKeyData)
            let keyHashHex = keyHash.map { String(format: "%02x", $0) }.joined()

            recipients.append([
                "key_hash": keyHashHex,
                "encrypted_key": encryptedKeyBuf.base64EncodedString()
            ])
        }

        return [
            "alg": "x25519-aes-256-gcm",
            "ephemeral_key": ephemeralPublicHex,
            "recipients": recipients,
            "nonce": nonceBase64,
            "ciphertext": ciphertextBase64
        ]
    }

    // MARK: - Decrypt

    /// Decrypt an encryption envelope.
    ///
    /// - Parameters:
    ///   - envelope: The encryption envelope dictionary
    ///   - privateKeyHex: Recipient's X25519 private key (hex, raw 32-byte)
    ///   - publicKeyHex: Recipient's X25519 public key (hex, raw 32-byte, for key_hash matching)
    /// - Returns: The decrypted value (JSON-parsed)
    /// - Throws: EncryptError if decryption fails or no matching recipient is found
    public static func decrypt(envelope: [String: Any], privateKeyHex: String, publicKeyHex: String) throws -> Any {
        // Validate envelope fields
        guard let ephemeralKeyHex = envelope["ephemeral_key"] as? String else {
            throw EncryptError.invalidEnvelope("missing ephemeral_key")
        }
        guard let recipients = envelope["recipients"] as? [[String: String]] else {
            throw EncryptError.invalidEnvelope("missing or malformed recipients")
        }
        guard let nonceBase64 = envelope["nonce"] as? String else {
            throw EncryptError.invalidEnvelope("missing nonce")
        }
        guard let ciphertextBase64 = envelope["ciphertext"] as? String else {
            throw EncryptError.invalidEnvelope("missing ciphertext")
        }

        // Compute key_hash from recipient's public key
        guard let pubKeyData = Data(hexString: publicKeyHex), pubKeyData.count == 32 else {
            throw EncryptError.invalidKeyLength("X25519 public key must be 32 bytes")
        }
        let keyHash = SHA256.hash(data: pubKeyData)
        let keyHashHex = keyHash.map { String(format: "%02x", $0) }.joined()

        // Find the matching recipient entry
        guard let recipient = recipients.first(where: { $0["key_hash"] == keyHashHex }) else {
            throw EncryptError.noMatchingRecipient
        }
        guard let encryptedKeyBase64 = recipient["encrypted_key"] else {
            throw EncryptError.invalidEnvelope("missing encrypted_key in recipient entry")
        }

        // Reconstruct the ephemeral public key
        guard let ephKeyData = Data(hexString: ephemeralKeyHex), ephKeyData.count == 32 else {
            throw EncryptError.invalidKeyLength("ephemeral key must be 32 bytes")
        }
        let ephemeralPublicKey = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: ephKeyData)

        // Reconstruct the recipient's private key
        guard let privKeyData = Data(hexString: privateKeyHex), privKeyData.count == 32 else {
            throw EncryptError.invalidKeyLength("X25519 private key must be 32 bytes")
        }
        let privateKey = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: privKeyData)

        // Derive shared secret
        let sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: ephemeralPublicKey)
        let sharedKeyData = sharedSecret.withUnsafeBytes { Data($0) }
        let sharedKey = SymmetricKey(data: sharedKeyData)

        // Decrypt the content key
        // Format: encrypted_key_data + auth_tag(16) + nonce(12)
        guard let encryptedKeyBuf = Data(base64Encoded: encryptedKeyBase64) else {
            throw EncryptError.decryptionFailed("invalid base64 in encrypted_key")
        }
        guard encryptedKeyBuf.count >= 28 else {
            throw EncryptError.decryptionFailed("encrypted_key too short")
        }

        let keyNonceData = encryptedKeyBuf.suffix(12)
        let keyAuthTagData = encryptedKeyBuf.dropLast(12).suffix(16)
        let keyEncryptedData = encryptedKeyBuf.dropLast(28)

        let keyNonce = try AES.GCM.Nonce(data: keyNonceData)
        let keySealedBox = try AES.GCM.SealedBox(
            nonce: keyNonce,
            ciphertext: keyEncryptedData,
            tag: keyAuthTagData
        )
        let contentKeyData = try AES.GCM.open(keySealedBox, using: sharedKey)
        let contentKey = SymmetricKey(data: contentKeyData)

        // Decrypt the ciphertext
        guard let ciphertextBuf = Data(base64Encoded: ciphertextBase64) else {
            throw EncryptError.decryptionFailed("invalid base64 in ciphertext")
        }
        guard ciphertextBuf.count >= 16 else {
            throw EncryptError.decryptionFailed("ciphertext too short")
        }
        guard let contentNonceData = Data(base64Encoded: nonceBase64) else {
            throw EncryptError.decryptionFailed("invalid base64 in nonce")
        }

        let authTagData = ciphertextBuf.suffix(16)
        let encryptedData = ciphertextBuf.dropLast(16)

        let contentNonce = try AES.GCM.Nonce(data: contentNonceData)
        let contentSealedBox = try AES.GCM.SealedBox(
            nonce: contentNonce,
            ciphertext: encryptedData,
            tag: authTagData
        )
        let plaintextData = try AES.GCM.open(contentSealedBox, using: contentKey)

        // JSON-parse the plaintext
        guard let result = try JSONSerialization.jsonObject(with: plaintextData, options: .fragmentsAllowed) as Any? else {
            throw EncryptError.decryptionFailed("could not parse decrypted JSON")
        }

        return result
    }

    // MARK: - Helpers

    /// Serialize a value to JSON Data, handling primitives and containers.
    private static func jsonSerialize(_ value: Any) throws -> Data {
        // JSONSerialization requires top-level arrays or objects on older platforms,
        // but .fragmentsAllowed lets us handle primitives too.
        if JSONSerialization.isValidJSONObject(value) {
            return try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        }
        // For primitives (string, number, bool), wrap and unwrap
        if let str = value as? String {
            // JSON-encode the string directly
            let wrapped = try JSONSerialization.data(withJSONObject: [str], options: [])
            // Strip the [ and ] brackets
            let json = String(data: wrapped, encoding: .utf8)!
            let trimmed = String(json.dropFirst().dropLast())
            return Data(trimmed.utf8)
        }
        if let num = value as? NSNumber {
            return Data("\(num)".utf8)
        }
        if let bool = value as? Bool {
            return Data(bool ? "true".utf8 : "false".utf8)
        }
        // Fallback: try as-is
        return try JSONSerialization.data(withJSONObject: [value], options: [.sortedKeys])
    }
}
