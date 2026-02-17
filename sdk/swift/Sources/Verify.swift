import Foundation
import CryptoKit

public enum FoodBlockVerify {

    /// Generate a new Ed25519 keypair. Returns (publicKey, privateKey) as raw 32-byte hex strings.
    public static func generateKeypair() -> (publicKey: String, privateKey: String) {
        let privateKey = Curve25519.Signing.PrivateKey()
        let publicKey = privateKey.publicKey
        return (
            publicKey: publicKey.rawRepresentation.map { String(format: "%02x", $0) }.joined(),
            privateKey: privateKey.rawRepresentation.map { String(format: "%02x", $0) }.joined()
        )
    }

    /// Sign a FoodBlock. Returns a SignedBlock wrapper.
    public static func sign(block: FoodBlock, authorHash: String, privateKeyHex: String) throws -> SignedBlock {
        guard let keyData = Data(hexString: privateKeyHex) else {
            throw FoodBlockError.invalidKey("Invalid private key hex")
        }
        let privateKey = try Curve25519.Signing.PrivateKey(rawRepresentation: keyData)
        let content = Canonical.canonical(type: block.type, state: block.state.mapValues { $0.value }, refs: block.refs.mapValues { $0.value })
        let signature = try privateKey.signature(for: Data(content.utf8))
        return SignedBlock(
            foodblock: block,
            author_hash: authorHash,
            signature: signature.map { String(format: "%02x", $0) }.joined(),
            protocol_version: PROTOCOL_VERSION
        )
    }

    /// Verify a signed FoodBlock wrapper. Returns true if valid.
    public static func verify(signed: SignedBlock, publicKeyHex: String) -> Bool {
        guard let keyData = Data(hexString: publicKeyHex),
              let sigData = Data(hexString: signed.signature) else {
            return false
        }
        do {
            let publicKey = try Curve25519.Signing.PublicKey(rawRepresentation: keyData)
            let content = Canonical.canonical(
                type: signed.foodblock.type,
                state: signed.foodblock.state.mapValues { $0.value },
                refs: signed.foodblock.refs.mapValues { $0.value }
            )
            return publicKey.isValidSignature(sigData, for: Data(content.utf8))
        } catch {
            return false
        }
    }
}

public enum FoodBlockError: Error {
    case invalidKey(String)
    case signingFailed(String)
}

extension Data {
    init?(hexString: String) {
        let hex = hexString
        guard hex.count % 2 == 0 else { return nil }
        var data = Data(capacity: hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let nextIndex = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        self = data
    }
}
