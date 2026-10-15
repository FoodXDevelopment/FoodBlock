//! Signing (core.md, Suites): a signature over the canonical UTF-8 bytes of `{ type, state, refs }`, by the algorithm
//! of the signing key's suite. `std` is Ed25519 (a key is SPKI DER hex, a private key PKCS#8 DER hex or the 32-byte
//! seed); `p256` is ECDSA P-256 with SHA-256 and `sm` is SM2 with SM3 (a key is SPKI DER hex, a private key the
//! 32-byte scalar in hex; a signature is `r` then `s`, 32 bytes each, hex). A signed message part is signed over its
//! canonical JSON without its `signature` key.
use crate::block::{hex, parts, unhex};
use crate::canonical::{canonical, canonical_json};
use crate::error::{Error, Result};
use crate::prelude::*;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};

/// SPKI DER prefix of an Ed25519 public key.
pub const SPKI_ED25519: &str = "302a300506032b6570032100";
/// PKCS#8 DER prefix of an Ed25519 private key.
pub const PKCS8_ED25519: &str = "302e020100300506032b657004220420";
/// The SM2 user id the suite fixes (protocol.json `suites.sm.sm2_user_id`).
#[cfg(feature = "suites")]
const SM2_ID: &str = "1234567812345678";

/// A signing key: `{ public_key_sign, private_key }`, both hex, and the suite it signs in (empty: `std`).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Keypair {
    pub suite: String,
    pub public_key_sign: String,
    pub private_key: String,
}

impl Keypair {
    pub fn to_json(&self) -> Value {
        let mut out = json!({ "public_key_sign": self.public_key_sign, "private_key": self.private_key });
        if !self.suite.is_empty() && self.suite != "std" {
            out["suite"] = json!(self.suite);
        }
        out
    }
}

fn is_std(suite: &str) -> bool {
    suite.is_empty() || suite == "std"
}

fn seed_of(private_key: &str) -> Result<[u8; 32]> {
    let text = private_key.to_ascii_lowercase();
    let seed = if text.len() == 96 && text.starts_with(PKCS8_ED25519) {
        &text[32..]
    } else {
        &text[..]
    };
    let bytes = unhex(seed)
        .filter(|b| b.len() == 32)
        .ok_or_else(|| Error::new("sign: a private key is PKCS#8 DER hex (or a 32-byte seed)"))?;
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

fn signing_key(private_key: &str) -> Result<SigningKey> {
    Ok(SigningKey::from_bytes(&seed_of(private_key)?))
}

fn verifying_key(public_key: &str) -> Option<VerifyingKey> {
    let text = public_key.to_ascii_lowercase();
    if text.len() != 88 || !text.starts_with(SPKI_ED25519) {
        return None;
    }
    let bytes: [u8; 32] = unhex(&text[24..])?.try_into().ok()?;
    VerifyingKey::from_bytes(&bytes).ok()
}

fn unknown_suite(suite: &str) -> Error {
    Error::coded(
        "unknown_suite",
        format!("sign: this build does not know the suite {suite}"),
    )
}

/// The suite's SPKI prefix (hex) and the raw key length, from protocol.json `suites`.
fn spki_prefix(suite: &str) -> Result<String> {
    crate::spec()
        .suite(suite)
        .map(|s| s.spki_prefix.clone())
        .ok_or_else(|| unknown_suite(suite))
}

/// The signing key a 32-byte seed (hex) gives, in a suite: how the vectors' keys are rebuilt.
pub fn keypair_from_seed_in(suite: &str, seed_hex: &str) -> Result<Keypair> {
    if is_std(suite) {
        let key = signing_key(seed_hex)?;
        return Ok(Keypair {
            suite: String::new(),
            public_key_sign: format!("{SPKI_ED25519}{}", hex(key.verifying_key().as_bytes())),
            private_key: format!("{PKCS8_ED25519}{}", hex(&key.to_bytes())),
        });
    }
    let public = public_key_in(suite, seed_hex)?;
    Ok(Keypair {
        suite: suite.to_string(),
        public_key_sign: public,
        private_key: seed_hex.to_ascii_lowercase(),
    })
}

/// The `std` signing key a 32-byte seed (hex) gives.
pub fn keypair_from_seed(seed_hex: &str) -> Result<Keypair> {
    keypair_from_seed_in("std", seed_hex)
}

/// A new signing key from the operating system's randomness.
#[cfg(feature = "std")]
pub fn generate_keypair_in(suite: &str) -> Result<Keypair> {
    if !is_std(suite) && crate::spec().suite(suite).is_none() {
        return Err(unknown_suite(suite));
    }
    // A seed that is not a valid curve scalar is vanishingly rare; ask again.
    for _ in 0..8 {
        if let Ok(k) = keypair_from_seed_in(suite, &hex(&crate::random::bytes::<32>()?)) {
            return Ok(k);
        }
    }
    Err(Error::new("sign: could not make a key"))
}
#[cfg(feature = "std")]
pub fn generate_keypair() -> Result<Keypair> {
    generate_keypair_in("std")
}

/// The public signing key (SPKI hex) of a private key, in a suite.
pub fn public_key_in(suite: &str, private_key: &str) -> Result<String> {
    if is_std(suite) {
        return Ok(format!(
            "{SPKI_ED25519}{}",
            hex(signing_key(private_key)?.verifying_key().as_bytes())
        ));
    }
    let prefix = spki_prefix(suite)?;
    #[cfg(feature = "suites")]
    {
        let scalar = unhex(private_key)
            .filter(|b| b.len() == 32)
            .ok_or_else(|| Error::new("sign: a p256 or sm private key is the 32-byte scalar in hex"))?;
        let point = match suite {
            "p256" => {
                let key = p256::ecdsa::SigningKey::from_slice(&scalar)
                    .map_err(|_| Error::new("sign: not a P-256 scalar"))?;
                key.verifying_key().to_encoded_point(false).as_bytes().to_vec()
            }
            "sm" => {
                let key = sm2::dsa::SigningKey::from_slice(SM2_ID, &scalar)
                    .map_err(|_| Error::new("sign: not an SM2 scalar"))?;
                elliptic_curve::sec1::ToEncodedPoint::to_encoded_point(key.verifying_key(), false)
                    .as_bytes()
                    .to_vec()
            }
            _ => return Err(unknown_suite(suite)),
        };
        Ok(format!("{prefix}{}", hex(&point)))
    }
    #[cfg(not(feature = "suites"))]
    {
        let _ = prefix;
        Err(Error::coded(
            "unknown_suite",
            format!("sign: the suite {suite} is declared but not built into this build (feature `suites`)"),
        ))
    }
}

/// The public signing key (SPKI hex) of a `std` private key.
pub fn public_key_of(private_key: &str) -> Result<String> {
    public_key_in("std", private_key)
}

/// Sign bytes in a suite: the 64-byte signature, hex.
pub fn sign_bytes_in(suite: &str, bytes: &[u8], private_key: &str) -> Result<String> {
    if is_std(suite) {
        return Ok(hex(&signing_key(private_key)?.sign(bytes).to_bytes()));
    }
    if crate::spec().suite(suite).is_none() {
        return Err(unknown_suite(suite));
    }
    #[cfg(feature = "suites")]
    {
        let scalar = unhex(private_key)
            .filter(|b| b.len() == 32)
            .ok_or_else(|| Error::new("sign: a p256 or sm private key is the 32-byte scalar in hex"))?;
        return match suite {
            "p256" => {
                use p256::ecdsa::signature::Signer as _;
                let key = p256::ecdsa::SigningKey::from_slice(&scalar)
                    .map_err(|_| Error::new("sign: not a P-256 scalar"))?;
                let sig: p256::ecdsa::Signature = key.sign(bytes);
                Ok(hex(&sig.to_bytes()))
            }
            "sm" => {
                use sm2::dsa::signature::Signer as _;
                let key = sm2::dsa::SigningKey::from_slice(SM2_ID, &scalar)
                    .map_err(|_| Error::new("sign: not an SM2 scalar"))?;
                let sig: sm2::dsa::Signature = key.sign(bytes);
                Ok(hex(&sig.to_bytes()))
            }
            _ => Err(unknown_suite(suite)),
        };
    }
    #[cfg(not(feature = "suites"))]
    Err(Error::coded(
        "unknown_suite",
        format!("sign: the suite {suite} is declared but not built into this build (feature `suites`)"),
    ))
}

/// Sign bytes with a `std` key.
pub fn sign_bytes(bytes: &[u8], private_key: &str) -> Result<String> {
    sign_bytes_in("std", bytes, private_key)
}

/// Whether a signature (hex) is this key's over these bytes, in a suite. Never fails: anything malformed is false.
pub fn verify_bytes_in(suite: &str, bytes: &[u8], signature: &str, public_key: &str) -> bool {
    let Some(sig_bytes) = unhex(signature) else {
        return false;
    };
    if is_std(suite) {
        let Some(key) = verifying_key(public_key) else {
            return false;
        };
        let Ok(sig) = <[u8; 64]>::try_from(sig_bytes) else {
            return false;
        };
        return key.verify(bytes, &Signature::from_bytes(&sig)).is_ok();
    }
    #[cfg(feature = "suites")]
    {
        let Some(info) = crate::spec().suite(suite) else {
            return false;
        };
        let public = public_key.to_ascii_lowercase();
        let Some(point) = public
            .strip_prefix(info.spki_prefix.as_str())
            .and_then(unhex)
        else {
            return false;
        };
        return match suite {
            "p256" => {
                use p256::ecdsa::signature::Verifier as _;
                let (Ok(key), Ok(sig)) = (
                    p256::ecdsa::VerifyingKey::from_sec1_bytes(&point),
                    p256::ecdsa::Signature::from_slice(&sig_bytes),
                ) else {
                    return false;
                };
                key.verify(bytes, &sig).is_ok()
            }
            "sm" => {
                use sm2::dsa::signature::Verifier as _;
                let (Ok(key), Ok(sig)) = (
                    sm2::dsa::VerifyingKey::from_sec1_bytes(SM2_ID, &point),
                    sm2::dsa::Signature::from_slice(&sig_bytes),
                ) else {
                    return false;
                };
                key.verify(bytes, &sig).is_ok()
            }
            _ => false,
        };
    }
    #[cfg(not(feature = "suites"))]
    false
}

/// Whether a `std` signature is this key's over these bytes.
pub fn verify_bytes(bytes: &[u8], signature: &str, public_key: &str) -> bool {
    verify_bytes_in("std", bytes, signature, public_key)
}

/// The author's signature over a block's canonical form, hex, in the key's suite.
pub fn sign_in(suite: &str, block: &Value, private_key: &str) -> Result<String> {
    let (t, s, r) = parts(block);
    sign_bytes_in(suite, canonical(t, s, r).as_bytes(), private_key)
}
/// The author's `std` signature over a block's canonical form, hex.
pub fn sign(block: &Value, private_key: &str) -> Result<String> {
    sign_in("std", block, private_key)
}

/// Whether a signature is this key's over exactly this block, in a suite. Never fails.
pub fn verify_in(suite: &str, block: &Value, signature: &str, public_key: &str) -> bool {
    let (t, s, r) = parts(block);
    verify_bytes_in(suite, canonical(t, s, r).as_bytes(), signature, public_key)
}
/// Whether a `std` signature is this key's over exactly this block.
pub fn verify(block: &Value, signature: &str, public_key: &str) -> bool {
    verify_in("std", block, signature, public_key)
}

fn without_signature(part: &Value) -> Value {
    match part {
        Value::Object(map) => {
            let mut rest = map.clone();
            rest.shift_remove("signature");
            Value::Object(rest)
        }
        other => other.clone(),
    }
}

/// A message part, signed: the part with `signature` added (over its canonical JSON without `signature`).
pub fn sign_message_in(suite: &str, part: &Value, private_key: &str) -> Result<Value> {
    let mut rest = without_signature(part);
    let signature = sign_bytes_in(suite, canonical_json(&rest).as_bytes(), private_key)?;
    if let Value::Object(map) = &mut rest {
        map.insert("signature".to_string(), Value::String(signature));
    }
    Ok(rest)
}
pub fn sign_message(part: &Value, private_key: &str) -> Result<Value> {
    sign_message_in("std", part, private_key)
}

/// Whether a signed message part's `signature` is this key's. Never fails.
pub fn verify_message_in(suite: &str, part: &Value, public_key: &str) -> bool {
    let signature = crate::js::text(part.get("signature"));
    verify_bytes_in(
        suite,
        canonical_json(&without_signature(part)).as_bytes(),
        &signature,
        public_key,
    )
}
pub fn verify_message(part: &Value, public_key: &str) -> bool {
    verify_message_in("std", part, public_key)
}

/// The suite a signing key (SPKI hex) belongs to, found by its SPKI prefix; None when no suite this build knows has it.
pub fn suite_of_key(public_key: &str) -> Option<String> {
    let lower = public_key.to_ascii_lowercase();
    crate::spec()
        .suites
        .iter()
        .find(|s| !s.spki_prefix.is_empty() && lower.starts_with(&s.spki_prefix))
        .map(|s| s.name.clone())
}

/// Whether this build can sign and verify in a suite (declared and built in).
pub fn knows_suite(suite: &str) -> bool {
    let declared = crate::spec().suite(suite).is_some();
    declared && (is_std(suite) || cfg!(feature = "suites"))
}
