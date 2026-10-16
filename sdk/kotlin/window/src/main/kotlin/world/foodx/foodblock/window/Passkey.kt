package world.foodx.foodblock.window

/** What a device's passkey gives back when it is made (WebAuthn registration, attestation "none"). Every field is base64url. */
data class PasskeyRegistration(val credentialId: String, val attestationObject: String, val clientDataJson: String)

/** What a device's passkey gives back for a challenge (WebAuthn assertion). Every field is base64url; the signature is ASN.1 DER, as devices make it. */
data class PasskeyAssertion(val credentialId: String, val authenticatorData: String, val clientDataJson: String, val signature: String)

/**
 * The device's passkey. On Android it is Credential Manager (`CredentialManagerPasskeys`, in the android module); tests hand in a software authenticator.
 * The Android Credential Manager needs the app's `assetlinks.json` entry on the relying party (foodx.network: get_login_creds).
 */
interface PasskeyAuthenticator {
    /** Make a passkey for [rpId]. [challenge] and [userId] are base64url. */
    suspend fun register(rpId: String, challenge: String, userId: String, name: String): PasskeyRegistration
    /** Ask a passkey to sign [challenge] (base64url). [credentialId] is the one to use, or null to let the person choose. */
    suspend fun assert(rpId: String, challenge: String, credentialId: String?): PasskeyAssertion
}

/** base64url without padding, by hand: java.util.Base64 is missing below Android 8. */
internal object B64 {
    private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    fun encode(bytes: ByteArray): String {
        val out = StringBuilder()
        var i = 0
        while (i < bytes.size) {
            val b0 = bytes[i].toInt() and 255
            val b1 = if (i + 1 < bytes.size) bytes[i + 1].toInt() and 255 else -1
            val b2 = if (i + 2 < bytes.size) bytes[i + 2].toInt() and 255 else -1
            out.append(ALPHABET[b0 shr 2])
            out.append(ALPHABET[((b0 and 3) shl 4) or (if (b1 < 0) 0 else b1 shr 4)])
            if (b1 >= 0) out.append(ALPHABET[((b1 and 15) shl 2) or (if (b2 < 0) 0 else b2 shr 6)])
            if (b2 >= 0) out.append(ALPHABET[b2 and 63])
            i += 3
        }
        return out.toString()
    }
    fun decode(text: String): ByteArray {
        val bits = text.trimEnd('=').map { c -> ALPHABET.indexOf(c).also { require(it >= 0) { "not base64url" } } }
        val out = java.io.ByteArrayOutputStream()
        var buffer = 0; var held = 0
        for (v in bits) { buffer = (buffer shl 6) or v; held += 6; if (held >= 8) { held -= 8; out.write((buffer shr held) and 255) } }
        return out.toByteArray()
    }
    fun hex(text: String): String = decode(text).joinToString("") { "%02x".format(it) }
}
