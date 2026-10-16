package world.foodx.foodblock.window

import java.io.ByteArrayOutputStream
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec

/** A software passkey: a P-256 key that answers registration and assertion the way a phone does (attestation "none", ES256). */
class TestAuthenticator(var origin: String = "https://foodx.network") : PasskeyAuthenticator {
    private val pair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    val credentialId = ByteArray(16).also { java.security.SecureRandom().nextBytes(it) }
    var counter = 0
    var taps = 0
    private val x: ByteArray; private val y: ByteArray
    init {
        val p = (pair.public as ECPublicKey).w
        fun fix(n: java.math.BigInteger) = n.toByteArray().let { b -> ByteArray(32).also { out -> val src = if (b.size > 32) b.copyOfRange(b.size - 32, b.size) else b; src.copyInto(out, 32 - src.size) } }
        x = fix(p.affineX); y = fix(p.affineY)
    }
    val spki: String get() = "3059301306072a8648ce3d020106082a8648ce3d030107034200" + "04" + (x + y).joinToString("") { "%02x".format(it) }

    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b)
    private fun head(major: Int, n: Int): ByteArray = when { n < 24 -> byteArrayOf(((major shl 5) or n).toByte()); n < 256 -> byteArrayOf(((major shl 5) or 24).toByte(), n.toByte()); else -> byteArrayOf(((major shl 5) or 25).toByte(), (n shr 8).toByte(), (n and 255).toByte()) }
    private fun bytes(b: ByteArray) = head(2, b.size) + b
    private fun text(s: String) = head(3, s.toByteArray().size) + s.toByteArray()
    private fun int(n: Int) = if (n >= 0) head(0, n) else head(1, -1 - n)
    private fun cat(vararg parts: ByteArray): ByteArray = ByteArrayOutputStream().also { o -> parts.forEach { o.write(it) } }.toByteArray()
    private fun json(vararg kv: Pair<String, Any>) = kv.joinToString(",", "{", "}") { (k, v) -> "\"$k\":" + (if (v is String) "\"$v\"" else v.toString()) }.toByteArray()

    override suspend fun register(rpId: String, challenge: String, userId: String, name: String): PasskeyRegistration {
        val cose = cat(head(5, 5), int(1), int(2), int(3), int(-7), int(-1), int(1), int(-2), bytes(x), int(-3), bytes(y))
        val len = byteArrayOf((credentialId.size shr 8).toByte(), (credentialId.size and 255).toByte())
        val authData = cat(sha(rpId.toByteArray()), byteArrayOf(0x45), ByteArray(4), ByteArray(16), len, credentialId, cose)
        val attestation = cat(head(5, 3), text("fmt"), text("none"), text("attStmt"), head(5, 0), text("authData"), bytes(authData))
        return PasskeyRegistration(B64.encode(credentialId), B64.encode(attestation), B64.encode(json("type" to "webauthn.create", "challenge" to challenge, "origin" to origin)))
    }
    override suspend fun assert(rpId: String, challenge: String, credentialId: String?): PasskeyAssertion {
        counter++; taps++
        val c = byteArrayOf((counter shr 24).toByte(), (counter shr 16).toByte(), (counter shr 8).toByte(), counter.toByte())
        val authData = cat(sha(rpId.toByteArray()), byteArrayOf(0x05), c)
        val cdj = json("type" to "webauthn.get", "challenge" to challenge, "origin" to origin, "crossOrigin" to false)
        val signature = Signature.getInstance("SHA256withECDSA").apply { initSign(pair.private); update(cat(authData, sha(cdj))) }.sign()
        return PasskeyAssertion(B64.encode(this.credentialId), B64.encode(authData), B64.encode(cdj), B64.encode(signature))
    }
}
