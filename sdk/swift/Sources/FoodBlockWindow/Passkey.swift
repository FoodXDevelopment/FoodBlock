import Foundation

/// What a device's passkey gives back when it is made (WebAuthn registration, attestation "none"). Every field is base64url.
public struct PasskeyRegistration {
    public let credentialId: String, attestationObject: String, clientDataJSON: String
    public init(credentialId: String, attestationObject: String, clientDataJSON: String) { self.credentialId = credentialId; self.attestationObject = attestationObject; self.clientDataJSON = clientDataJSON }
}
/// What a device's passkey gives back for a challenge (WebAuthn assertion). Every field is base64url; the signature is ASN.1 DER, as devices make it.
public struct PasskeyAssertion {
    public let credentialId: String, authenticatorData: String, clientDataJSON: String, signature: String
    public init(credentialId: String, authenticatorData: String, clientDataJSON: String, signature: String) { self.credentialId = credentialId; self.authenticatorData = authenticatorData; self.clientDataJSON = clientDataJSON; self.signature = signature }
}

/// The device's passkey. `ApplePasskeys` is the real one (ASAuthorizationPlatformPublicKeyCredentialProvider); tests hand in a software authenticator.
public protocol PasskeyAuthenticator {
    /// Make a passkey for `rpId`. `challenge` is base64url, `userId` base64url.
    func register(rpId: String, challenge: String, userId: String, name: String) async throws -> PasskeyRegistration
    /// Ask a passkey to sign `challenge` (base64url). `credentialId` is the one to use, or nil to let the person choose.
    func assert(rpId: String, challenge: String, credentialId: String?) async throws -> PasskeyAssertion
}

extension Data {
    init?(base64url s: String) {
        var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while t.count % 4 != 0 { t += "=" }
        self.init(base64Encoded: t)
    }
    var base64url: String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
    var hex: String { map { String(format: "%02x", $0) }.joined() }
}

#if canImport(AuthenticationServices) && (os(iOS) || os(macOS))
import AuthenticationServices

/// The platform passkey (iOS 16+, macOS 13+): the system sheet asks for Face ID, Touch ID or the device passcode. Needs the app's Associated Domains
/// entitlement `webcredentials:<rpId>` and the host serving apple-app-site-association (kernel/share, foodx.network).
@available(iOS 16.0, macOS 13.0, *)
public final class ApplePasskeys: NSObject, PasskeyAuthenticator, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let anchor: () -> ASPresentationAnchor
    private var continuation: CheckedContinuation<ASAuthorization, Error>?
    public init(anchor: @escaping () -> ASPresentationAnchor) { self.anchor = anchor }

    @MainActor private func run(_ requests: [ASAuthorizationRequest]) async throws -> ASAuthorization {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<ASAuthorization, Error>) in
            continuation = c
            let controller = ASAuthorizationController(authorizationRequests: requests)
            controller.delegate = self; controller.presentationContextProvider = self
            controller.performRequests()
        }
    }
    public func register(rpId: String, challenge: String, userId: String, name: String) async throws -> PasskeyRegistration {
        guard let c = Data(base64url: challenge), let u = Data(base64url: userId) else { throw WindowError.bad("challenge") }
        let request = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId).createCredentialRegistrationRequest(challenge: c, name: name, userID: u)
        request.userVerificationPreference = .required
        request.attestationPreference = .none
        guard let r = try await run([request]).credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration, let attestation = r.rawAttestationObject else { throw WindowError.bad("no passkey was made") }
        return PasskeyRegistration(credentialId: r.credentialID.base64url, attestationObject: attestation.base64url, clientDataJSON: r.rawClientDataJSON.base64url)
    }
    public func assert(rpId: String, challenge: String, credentialId: String?) async throws -> PasskeyAssertion {
        guard let c = Data(base64url: challenge) else { throw WindowError.bad("challenge") }
        let request = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId).createCredentialAssertionRequest(challenge: c)
        request.userVerificationPreference = .required
        if let id = credentialId, let d = Data(base64url: id) { request.allowedCredentials = [ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: d)] }
        guard let a = try await run([request]).credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else { throw WindowError.bad("no assertion") }
        return PasskeyAssertion(credentialId: a.credentialID.base64url, authenticatorData: a.rawAuthenticatorData.base64url, clientDataJSON: a.rawClientDataJSON.base64url, signature: a.signature.base64url)
    }
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) { continuation?.resume(returning: authorization); continuation = nil }
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) { continuation?.resume(throwing: error); continuation = nil }
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor() }
}
#endif
