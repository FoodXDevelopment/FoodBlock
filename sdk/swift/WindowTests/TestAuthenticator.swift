import Foundation
import CryptoKit
import FoodBlock
@testable import FoodBlockWindow

/// A software passkey: a P-256 key that answers registration and assertion the way a phone does (attestation "none", ES256).
final class TestAuthenticator: PasskeyAuthenticator {
    let key = P256.Signing.PrivateKey()
    let credentialId = Data((0..<16).map { _ in UInt8.random(in: 0...255) })
    var counter: UInt32 = 0
    var origin = "https://foodx.network"
    var signed = 0   // how many assertions it made (each is a tap)

    var spki: String { "3059301306072a8648ce3d020106082a8648ce3d030107034200" + key.publicKey.x963Representation.hex }

    private func head(_ major: UInt8, _ n: Int) -> Data { n < 24 ? Data([major << 5 | UInt8(n)]) : n < 256 ? Data([major << 5 | 24, UInt8(n)]) : Data([major << 5 | 25, UInt8(n >> 8), UInt8(n & 255)]) }
    private func bytes(_ d: Data) -> Data { head(2, d.count) + d }
    private func text(_ s: String) -> Data { head(3, s.utf8.count) + Data(s.utf8) }
    private func int(_ n: Int) -> Data { n >= 0 ? head(0, n) : head(1, -1 - n) }
    private func cat(_ parts: [Data]) -> Data { parts.reduce(Data()) { $0 + $1 } }
    private func sha(_ d: Data) -> Data { Data(SHA256.hash(data: d)) }

    func register(rpId: String, challenge: String, userId: String, name: String) async throws -> PasskeyRegistration {
        let x = key.publicKey.x963Representation
        let cose = cat([head(5, 5), int(1), int(2), int(3), int(-7), int(-1), int(1), int(-2), bytes(x.subdata(in: 1..<33)), int(-3), bytes(x.subdata(in: 33..<65))])
        let len = Data([UInt8(credentialId.count >> 8), UInt8(credentialId.count & 255)])
        let authData = cat([sha(Data(rpId.utf8)), Data([0x45]), Data(count: 4), Data(count: 16), len, credentialId, cose])
        let attestation = cat([head(5, 3), text("fmt"), text("none"), text("attStmt"), head(5, 0), text("authData"), bytes(authData)])
        let cdj = try JSONSerialization.data(withJSONObject: ["type": "webauthn.create", "challenge": challenge, "origin": origin])
        return PasskeyRegistration(credentialId: credentialId.base64url, attestationObject: attestation.base64url, clientDataJSON: cdj.base64url)
    }
    func assert(rpId: String, challenge: String, credentialId wanted: String?) async throws -> PasskeyAssertion {
        counter += 1; signed += 1
        var c = counter.bigEndian
        let authData = cat([sha(Data(rpId.utf8)), Data([0x05]), Data(bytes: &c, count: 4)])
        let cdj = try JSONSerialization.data(withJSONObject: ["type": "webauthn.get", "challenge": challenge, "origin": origin, "crossOrigin": false])
        let signature = try key.signature(for: cat([authData, sha(cdj)]))
        return PasskeyAssertion(credentialId: credentialId.base64url, authenticatorData: authData.base64url, clientDataJSON: cdj.base64url, signature: signature.derRepresentation.base64url)
    }
}
