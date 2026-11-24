//! The envelope (modules/privacy.md): a sealed copy's plaintext is encrypted with the suite's cipher (AES-256-GCM for
//! `std` and `p256`, SM4-GCM for `sm`) under a random 32-byte content key and a 12-byte nonce, no additional data. A
//! fresh encryption key per envelope agrees a secret with each recipient's key, by the suite's key agreement (X25519,
//! ECDH on P-256, ECDH on the SM2 curve); HKDF with the suite's hash (SHA-256, or SM3), salted with the ephemeral
//! public key's bytes then the recipient's, info `foodblock envelope key`, turns it into the 32-byte key that seals the
//! content key, with its own 12-byte nonce. SM4 takes a 128-bit key: the first 16 bytes of each 32-byte key.
//! The envelope names no recipient: each recipient tries every entry. `seal` encrypts; `sign` signs. `alg` is the
//! suite's envelope name (protocol.json `suites`).
//! A KEM key (`xwing:` and 2,432 hex characters, core.md section 2) is sealed to by encapsulation instead: see `xwing`.
use crate::block::{hex, unhex};
use crate::error::{Error, Result};
use crate::prelude::*;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use x25519_dalek::{PublicKey, StaticSecret};

/// The envelope name of the default suite (protocol.json `suites.std.envelope`).
pub const ALG: &str = "x25519-hkdf-sha256-aes-256-gcm";

/// Fixed randomness, only to reproduce a vector (hex): the ephemeral private key, the content key, the nonce, and one
/// nonce per recipient.
#[derive(Debug, Clone, Default)]
pub struct Fixed {
    pub ephemeral: Option<String>,
    pub content_key: Option<String>,
    pub nonce: Option<String>,
    pub key_nonces: Vec<String>,
    /// One 64-byte encapsulation seed per recipient of an `xwing:` envelope (hex).
    pub encaps: Vec<String>,
}

fn raw<const N: usize>(hex_text: &str, what: &str) -> Result<[u8; N]> {
    unhex(hex_text)
        .and_then(|b| <[u8; N]>::try_from(b).ok())
        .ok_or_else(|| Error::new(format!("envelope: {what} is {N} bytes")))
}
fn fixed_or_random<const N: usize>(given: Option<&String>) -> Result<[u8; N]> {
    match given {
        Some(h) => raw::<N>(h, "a fixed value"),
        None => crate::random::bytes::<N>(),
    }
}

// Whether a suite name (the empty name being the default's) names the `std` suite.
fn is_std(suite: &str) -> bool {
    crate::spec::suite_or_default(suite) == "std"
}

/// The suite whose envelope name this is (`alg` of an envelope), if the protocol knows one.
pub fn suite_of_alg(alg: &str) -> Option<String> {
    crate::spec().suites.iter().find(|s| s.envelope == alg).map(|s| s.name.clone())
}

fn unknown(suite: &str) -> Error {
    Error::coded("unknown_suite", format!("envelope: this build does not know the suite {suite}"))
}

/// X-Wing (draft-connolly-cfrg-xwing-kem-11), by hand from its primitives: ML-KEM-768 (FIPS 203), X25519, SHAKE256 and
/// SHA3-256. A key is the 1,184-byte ML-KEM-768 key then the 32-byte X25519 key; its private form is a 32-byte seed.
pub mod xwing {
    use super::*;
    use ml_kem::{Decapsulate, DecapsulationKey, EncapsulationKey, KeyExport, MlKem768};
    use sha3::Digest;

    /// The envelope name of an X-Wing envelope (protocol.json `encrypt_keys.xwing.envelope`).
    pub const ALG: &str = "xwing-hkdf-sha256-aes-256-gcm";
    pub const PREFIX: &str = "xwing:";
    pub const KEY_BYTES: usize = 1216;
    pub const CT_BYTES: usize = 1120;
    const ML_KEY: usize = 1184;
    const ML_CT: usize = 1088;
    // "\./" "/^\"
    const LABEL: [u8; 6] = [0x5c, 0x2e, 0x2f, 0x2f, 0x5e, 0x5c];

    // The keys of a 32-byte seed: the ML-KEM-768 decapsulation key, the X25519 secret, and the public key.
    fn expand(sk: &[u8; 32]) -> (DecapsulationKey<MlKem768>, StaticSecret, Vec<u8>) {
        use shake::{ExtendableOutput, Update, XofReader};
        let mut h = shake::Shake256::default();
        h.update(sk);
        let mut expanded = [0u8; 96];
        h.finalize_xof().read(&mut expanded);
        let mut seed = ml_kem::Seed::default();
        seed.copy_from_slice(&expanded[..64]);
        let dk = DecapsulationKey::<MlKem768>::from_seed(seed);
        let mut x = [0u8; 32];
        x.copy_from_slice(&expanded[64..]);
        let sx = StaticSecret::from(x);
        let mut pk = dk.encapsulation_key().to_bytes().to_vec();
        pk.extend_from_slice(PublicKey::from(&sx).as_bytes());
        (dk, sx, pk)
    }

    fn combine(ss_m: &[u8], ss_x: &[u8], ct_x: &[u8], pk_x: &[u8]) -> [u8; 32] {
        let mut h = sha3::Sha3_256::new();
        h.update(ss_m);
        h.update(ss_x);
        h.update(ct_x);
        h.update(pk_x);
        h.update(LABEL);
        h.finalize().into()
    }

    /// The public key (1,216 bytes) of a 32-byte private seed.
    pub fn public_key(sk: &[u8; 32]) -> Vec<u8> {
        expand(sk).2
    }

    /// Encapsulate to a public key with 64 random bytes: the 32-byte secret and the 1,120-byte ciphertext.
    pub fn encaps(pk: &[u8], eseed: &[u8; 64]) -> Result<([u8; 32], Vec<u8>)> {
        if pk.len() != KEY_BYTES {
            return Err(Error::new("envelope: an X-Wing key is 1216 bytes"));
        }
        let (pk_m, pk_x) = pk.split_at(ML_KEY);
        let ek_m = EncapsulationKey::<MlKem768>::new(&ml_kem::Key::<EncapsulationKey<MlKem768>>::try_from(pk_m).map_err(|_| Error::new("envelope: an X-Wing key is 1216 bytes"))?)
            .map_err(|_| Error::new("envelope: the ML-KEM-768 part of that X-Wing key is not a key"))?;
        let their = <[u8; 32]>::try_from(pk_x).unwrap();
        let mut ek_x = [0u8; 32];
        ek_x.copy_from_slice(&eseed[32..]);
        let ek_x = StaticSecret::from(ek_x);
        let ct_x = PublicKey::from(&ek_x);
        let ss_x = ek_x.diffie_hellman(&PublicKey::from(their));
        let mut m = ml_kem::B32::default();
        m.copy_from_slice(&eseed[..32]);
        let (ct_m, ss_m) = ek_m.encapsulate_deterministic(&m);
        let mut ct = ct_m.to_vec();
        ct.extend_from_slice(ct_x.as_bytes());
        Ok((combine(&ss_m, ss_x.as_bytes(), ct_x.as_bytes(), pk_x), ct))
    }

    /// The 32-byte secret of a ciphertext, under a private seed.
    pub fn decaps(sk: &[u8; 32], ct: &[u8]) -> Result<[u8; 32]> {
        if ct.len() != CT_BYTES {
            return Err(Error::new("envelope: an X-Wing ciphertext is 1120 bytes"));
        }
        let (dk, sx, pk) = expand(sk);
        let (ct_m, ct_x) = ct.split_at(ML_CT);
        let ct_m = ml_kem::Ciphertext::<MlKem768>::try_from(ct_m).map_err(|_| Error::new("envelope: an X-Wing ciphertext is 1120 bytes"))?;
        let ss_m = dk.decapsulate(&ct_m);
        let ct_x = <[u8; 32]>::try_from(ct_x).unwrap();
        let ss_x = sx.diffie_hellman(&PublicKey::from(ct_x));
        Ok(combine(&ss_m, ss_x.as_bytes(), &ct_x, &pk[ML_KEY..]))
    }

    /// Whether a key is an `xwing:` key by its name (grammar aside).
    pub fn is_named(key: &str) -> bool {
        key.starts_with(PREFIX)
    }
    /// The 1,216 key bytes of an `xwing:` key written in its grammar.
    pub fn key_bytes(key: &str) -> Option<Vec<u8>> {
        let h = key.strip_prefix(PREFIX)?;
        if h.len() != KEY_BYTES * 2 || h.bytes().any(|c| !matches!(c, b'0'..=b'9' | b'a'..=b'f')) {
            return None;
        }
        unhex(h)
    }

    pub fn keypair_of(seed_hex: &str) -> Result<Value> {
        let sk = raw::<32>(seed_hex, "an X-Wing private seed")?;
        Ok(json!({ "public_key_encrypt": format!("{PREFIX}{}", hex(&public_key(&sk))), "xwing_private": seed_hex }))
    }

    // HKDF-SHA256, salted with the encapsulation's bytes then the recipient's key bytes (privacy.md, Envelope).
    pub(super) fn sealing_key(ss: &[u8; 32], ct: &[u8], pk: &[u8]) -> Result<[u8; 32]> {
        super::sealing_key("std", ss, ct, pk)
    }

    pub(super) fn seal(value: &Value, keys: &[&str], fixed: &Fixed) -> Result<Value> {
        let content_key = fixed_or_random::<32>(fixed.content_key.as_ref())?;
        let nonce = fixed_or_random::<12>(fixed.nonce.as_ref())?;
        let mut recipients = Vec::new();
        for (i, key) in keys.iter().enumerate() {
            let pk = key_bytes(key).ok_or_else(|| Error::coded("grammar", "envelope: an xwing: key is 2432 lowercase hex characters"))?;
            let eseed = fixed_or_random::<64>(fixed.encaps.get(i))?;
            let (ss, ct) = encaps(&pk, &eseed)?;
            let key_nonce = fixed_or_random::<12>(fixed.key_nonces.get(i))?;
            let mut sealed = gcm("std", &sealing_key(&ss, &ct, &pk)?, &key_nonce, &content_key)?;
            sealed.extend_from_slice(&key_nonce);
            recipients.push(json!({ "kem_ciphertext": base64_encode(&ct), "encrypted_key": base64_encode(&sealed) }));
        }
        let plaintext = crate::canonical::canonical_json(value);
        Ok(json!({
            "alg": ALG, "nonce": base64_encode(&nonce),
            "ciphertext": base64_encode(&gcm("std", &content_key, &nonce, plaintext.as_bytes())?), "recipients": recipients,
        }))
    }

    pub(super) fn open(envelope: &Value, seed_hex: &str) -> Result<Value> {
        let sk = raw::<32>(seed_hex, "an X-Wing private seed")?;
        let mine = public_key(&sk);
        for entry in envelope.get("recipients").and_then(Value::as_array).into_iter().flatten() {
            let Some(ct) = base64_decode(crate::js::str_of(entry.get("kem_ciphertext"))) else { continue };
            let Some(sealed) = base64_decode(crate::js::str_of(entry.get("encrypted_key"))) else { continue };
            if sealed.len() < 12 || ct.len() != CT_BYTES {
                continue;
            }
            let ss = decaps(&sk, &ct)?;
            let key = sealing_key(&ss, &ct, &mine)?;
            let (body, nonce) = sealed.split_at(sealed.len() - 12);
            let Some(content_key) = ungcm("std", &key, nonce, body).and_then(|k| <[u8; 32]>::try_from(k).ok()) else { continue };
            let nonce = base64_decode(crate::js::str_of(envelope.get("nonce"))).ok_or_else(|| Error::new("envelope: the nonce is base64"))?;
            let ciphertext = base64_decode(crate::js::str_of(envelope.get("ciphertext"))).ok_or_else(|| Error::new("envelope: the ciphertext is base64"))?;
            let plain = ungcm("std", &content_key, &nonce, &ciphertext).ok_or_else(|| Error::new("envelope: the ciphertext does not open"))?;
            return Ok(serde_json::from_slice(&plain)?);
        }
        Err(Error::new("envelope: no entry opens with this key"))
    }
}

/// The public encryption key (hex) of a private key (hex), in a suite.
pub fn encryption_key_in(suite: &str, private_hex: &str) -> Result<String> {
    if is_std(suite) {
        let secret = StaticSecret::from(raw::<32>(private_hex, "an X25519 private key")?);
        return Ok(hex(PublicKey::from(&secret).as_bytes()));
    }
    #[cfg(feature = "suites")]
    {
        let scalar = raw::<32>(private_hex, "a private key")?;
        use elliptic_curve::sec1::ToEncodedPoint;
        return match suite {
            "p256" => {
                let k = p256::SecretKey::from_slice(&scalar).map_err(|_| Error::new("envelope: not a P-256 scalar"))?;
                Ok(hex(k.public_key().to_encoded_point(false).as_bytes()))
            }
            "sm" => {
                let k = sm2::SecretKey::from_slice(&scalar).map_err(|_| Error::new("envelope: not an SM2 scalar"))?;
                Ok(hex(k.public_key().to_encoded_point(false).as_bytes()))
            }
            _ => Err(unknown(suite)),
        };
    }
    #[cfg(not(feature = "suites"))]
    Err(unknown(suite))
}

/// The public encryption key (hex) of an X25519 private key (hex).
pub fn encryption_key_of(private_hex: &str) -> Result<String> {
    encryption_key_in(crate::spec::default_suite(), private_hex)
}

/// A new encryption key in a suite: `{ public_key_encrypt, x25519_private }` (the private key's field keeps its name
/// for every suite: the raw scalar, hex).
#[cfg(feature = "std")]
pub fn generate_encryption_keypair_in(suite: &str) -> Result<Value> {
    for _ in 0..8 {
        let private = hex(&crate::random::bytes::<32>()?);
        if let Ok(public) = encryption_key_in(suite, &private) {
            return Ok(json!({ "public_key_encrypt": public, "x25519_private": private }));
        }
    }
    Err(Error::new("envelope: could not make a key"))
}
/// A new X-Wing key: `{ public_key_encrypt: "xwing:...", xwing_private }` (the private seed, 32 bytes, hex).
#[cfg(feature = "std")]
pub fn generate_xwing_keypair() -> Result<Value> {
    xwing::keypair_of(&hex(&crate::random::bytes::<32>()?))
}
#[cfg(feature = "std")]
pub fn generate_encryption_keypair() -> Result<Value> {
    generate_encryption_keypair_in(crate::spec::default_suite())
}

// The agreed secret (the shared x coordinate / X25519 output) of a private scalar and a peer's public key.
fn agree(suite: &str, private: &[u8; 32], peer: &[u8]) -> Result<Vec<u8>> {
    if is_std(suite) {
        let their = <[u8; 32]>::try_from(peer).map_err(|_| Error::new("envelope: an X25519 public key is 32 bytes"))?;
        let secret = StaticSecret::from(*private);
        let shared = secret.diffie_hellman(&PublicKey::from(their));
        // a key of small order (32 zero bytes is one) gives every sealer the same secret, so anyone could open what is sealed to it:
        // no envelope is made with one (privacy.md; security20 privacy/r1)
        if !shared.was_contributory() {
            return Err(Error::new("envelope: that X25519 key is of small order: anything sealed to it could be opened by anyone"));
        }
        return Ok(shared.as_bytes().to_vec());
    }
    #[cfg(feature = "suites")]
    {
        use elliptic_curve::sec1::FromEncodedPoint;
        return match suite {
            "p256" => {
                let sk = p256::SecretKey::from_slice(private).map_err(|_| Error::new("envelope: not a P-256 scalar"))?;
                let pk = p256::PublicKey::from_sec1_bytes(peer).map_err(|_| Error::new("envelope: not a P-256 point"))?;
                let _ = p256::EncodedPoint::from_bytes(peer);
                let shared = p256::ecdh::diffie_hellman(sk.to_nonzero_scalar(), pk.as_affine());
                Ok(shared.raw_secret_bytes().to_vec())
            }
            "sm" => {
                let sk = sm2::SecretKey::from_slice(private).map_err(|_| Error::new("envelope: not an SM2 scalar"))?;
                let pk = sm2::PublicKey::from_sec1_bytes(peer).map_err(|_| Error::new("envelope: not an SM2 point"))?;
                let _ = sm2::EncodedPoint::from_bytes(peer).map(|p| sm2::AffinePoint::from_encoded_point(&p));
                let shared = elliptic_curve::ecdh::diffie_hellman(sk.to_nonzero_scalar(), pk.as_affine());
                Ok(shared.raw_secret_bytes().to_vec())
            }
            _ => Err(unknown(suite)),
        };
    }
    #[cfg(not(feature = "suites"))]
    Err(unknown(suite))
}

fn sealing_key(suite: &str, secret: &[u8], ephemeral: &[u8], recipient: &[u8]) -> Result<[u8; 32]> {
    let mut salt = Vec::with_capacity(ephemeral.len() + recipient.len());
    salt.extend_from_slice(ephemeral);
    salt.extend_from_slice(recipient);
    let info = crate::spec()
        .conventions
        .get("envelope")
        .and_then(|e| e.get("hkdf_info"))
        .and_then(Value::as_str)
        .unwrap_or("foodblock envelope key");
    let mut out = [0u8; 32];
    if is_std(suite) || suite == "p256" {
        hkdf::Hkdf::<sha2::Sha256>::new(Some(&salt), secret)
            .expand(info.as_bytes(), &mut out)
            .map_err(|_| Error::new("envelope: hkdf"))?;
        return Ok(out);
    }
    #[cfg(feature = "suites")]
    if suite == "sm" {
        hkdf::Hkdf::<sm3::Sm3>::new(Some(&salt), secret)
            .expand(info.as_bytes(), &mut out)
            .map_err(|_| Error::new("envelope: hkdf"))?;
        return Ok(out);
    }
    Err(unknown(suite))
}

#[cfg(feature = "suites")]
type Sm4Gcm = aes_gcm::AesGcm<sm4::Sm4, aes_gcm::aead::consts::U12>;

fn gcm(suite: &str, key: &[u8; 32], nonce: &[u8; 12], data: &[u8]) -> Result<Vec<u8>> {
    #[cfg(feature = "suites")]
    if suite == "sm" {
        return Sm4Gcm::new((&key[..16]).into())
            .encrypt(Nonce::from_slice(nonce), data)
            .map_err(|_| Error::new("envelope: encrypt"));
    }
    let _ = suite;
    Aes256Gcm::new(key.into())
        .encrypt(Nonce::from_slice(nonce), data)
        .map_err(|_| Error::new("envelope: encrypt"))
}
fn ungcm(suite: &str, key: &[u8; 32], nonce: &[u8], sealed: &[u8]) -> Option<Vec<u8>> {
    if nonce.len() != 12 {
        return None;
    }
    #[cfg(feature = "suites")]
    if suite == "sm" {
        return Sm4Gcm::new((&key[..16]).into()).decrypt(Nonce::from_slice(nonce), sealed).ok();
    }
    let _ = suite;
    Aes256Gcm::new(key.into())
        .decrypt(Nonce::from_slice(nonce), sealed)
        .ok()
}

/// Encrypt a value (JSON) to recipients' encryption keys (hex): `{ alg, ephemeral_key, nonce, ciphertext,
/// recipients: [{ encrypted_key }] }`.
pub fn seal(value: &Value, recipient_keys: &[&str]) -> Result<Value> {
    seal_with(value, recipient_keys, crate::spec::default_suite(), None)
}

/// `seal` in a suite and, to reproduce a vector, with fixed randomness.
pub fn seal_with(
    value: &Value,
    recipient_keys: &[&str],
    suite: &str,
    fixed: Option<&Fixed>,
) -> Result<Value> {
    if recipient_keys.is_empty() {
        return Err(Error::new("envelope: at least one recipient key"));
    }
    let none = Fixed::default();
    let fixed = fixed.unwrap_or(&none);
    // one alg per envelope: keys of two kinds are two envelopes
    let kems = recipient_keys.iter().filter(|k| xwing::is_named(k)).count();
    if kems == recipient_keys.len() {
        return xwing::seal(value, recipient_keys, fixed);
    }
    if kems > 0 {
        return Err(Error::new("envelope: keys of two kinds (xwing: and the suite's own) are sealed in two envelopes"));
    }
    let info = crate::spec().suite(suite).ok_or_else(|| unknown(suite))?.clone();
    let content_key = fixed_or_random::<32>(fixed.content_key.as_ref())?;
    let nonce = fixed_or_random::<12>(fixed.nonce.as_ref())?;
    let ephemeral_private = fixed_or_random::<32>(fixed.ephemeral.as_ref())?;
    let ephemeral_public = unhex(&encryption_key_in(suite, &hex(&ephemeral_private))?).unwrap();
    let mut recipients = Vec::new();
    for (i, key) in recipient_keys.iter().enumerate() {
        let their = unhex(key).ok_or_else(|| Error::new("envelope: a public key is hex"))?;
        // a key is sealed to only as it is written canonically (lowercase hex): one spelling, one key
        if hex(&their) != *key {
            return Err(Error::new("envelope: a public key is written as lowercase hex, and only so"));
        }
        let key_nonce = fixed_or_random::<12>(fixed.key_nonces.get(i))?;
        let secret = agree(suite, &ephemeral_private, &their)?;
        let mut sealed = gcm(
            suite,
            &sealing_key(suite, &secret, &ephemeral_public, &their)?,
            &key_nonce,
            &content_key,
        )?;
        sealed.extend_from_slice(&key_nonce);
        recipients.push(json!({ "encrypted_key": base64_encode(&sealed) }));
    }
    let plaintext = crate::canonical::canonical_json(value);
    Ok(json!({
        "alg": info.envelope, "ephemeral_key": hex(&ephemeral_public), "nonce": base64_encode(&nonce),
        "ciphertext": base64_encode(&gcm(suite, &content_key, &nonce, plaintext.as_bytes())?), "recipients": recipients,
    }))
}

/// Open an envelope with a recipient's private key (hex): the value inside. The suite is the one whose envelope the
/// `alg` names. Every entry is tried; none names its recipient.
pub fn open(envelope: &Value, private_hex: &str) -> Result<Value> {
    let alg = envelope.get("alg").and_then(Value::as_str).unwrap_or("");
    if alg == xwing::ALG {
        return xwing::open(envelope, private_hex);
    }
    let suite = suite_of_alg(alg).ok_or_else(|| unknown(alg))?;
    let private = raw::<32>(private_hex, "a private key")?;
    let mine = unhex(&encryption_key_in(&suite, private_hex)?).unwrap();
    let ephemeral = unhex(crate::js::str_of(envelope.get("ephemeral_key")))
        .ok_or_else(|| Error::new("envelope: the ephemeral key is hex"))?;
    let secret = agree(&suite, &private, &ephemeral)?;
    let key = sealing_key(&suite, &secret, &ephemeral, &mine)?;
    for entry in envelope
        .get("recipients")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(sealed) = base64_decode(crate::js::str_of(entry.get("encrypted_key"))) else {
            continue;
        };
        if sealed.len() < 12 {
            continue;
        }
        let (body, nonce) = sealed.split_at(sealed.len() - 12);
        let Some(content_key) = ungcm(&suite, &key, nonce, body).and_then(|k| <[u8; 32]>::try_from(k).ok())
        else {
            continue;
        };
        let nonce = base64_decode(crate::js::str_of(envelope.get("nonce")))
            .ok_or_else(|| Error::new("envelope: the nonce is base64"))?;
        let ciphertext = base64_decode(crate::js::str_of(envelope.get("ciphertext")))
            .ok_or_else(|| Error::new("envelope: the ciphertext is base64"))?;
        let plain = ungcm(&suite, &content_key, &nonce, &ciphertext)
            .ok_or_else(|| Error::new("envelope: the ciphertext does not open"))?;
        return Ok(serde_json::from_slice(&plain)?);
    }
    Err(Error::new("envelope: no entry opens with this key"))
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard base64 with padding.
pub fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(B64[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// Base64 (standard or URL-safe, padding optional, whitespace ignored), as Node's Buffer reads it.
pub fn base64_decode(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in text.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            b' ' | b'\n' | b'\r' | b'\t' => continue,
            _ => return None,
        } as u32;
        acc = acc << 6 | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}
