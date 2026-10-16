package world.foodx.foodblock.window

import android.content.Context
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential

/**
 * The platform passkey on Android: Credential Manager shows the system sheet (fingerprint, face or screen lock). [activityContext] must be an Activity.
 * Needs `https://foodx.network/.well-known/assetlinks.json` to list this app with `delegate_permission/common.get_login_creds` (the host serves it).
 */
class CredentialManagerPasskeys(private val activityContext: Context) : PasskeyAuthenticator {
    private val manager = CredentialManager.create(activityContext)

    override suspend fun register(rpId: String, challenge: String, userId: String, name: String): PasskeyRegistration {
        val result = manager.createCredential(activityContext, CreatePublicKeyCredentialRequest(CredentialJson.registrationRequest(rpId, challenge, userId, name)))
        return CredentialJson.registration((result as CreatePublicKeyCredentialResponse).registrationResponseJson)
    }

    override suspend fun assert(rpId: String, challenge: String, credentialId: String?): PasskeyAssertion {
        val result = manager.getCredential(activityContext, GetCredentialRequest(listOf(GetPublicKeyCredentialOption(CredentialJson.assertionRequest(rpId, challenge, credentialId)))))
        return CredentialJson.assertion((result.credential as PublicKeyCredential).authenticationResponseJson)
    }
}
