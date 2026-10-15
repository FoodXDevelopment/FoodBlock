//! Signing (protocol.md, Encoding): Ed25519 over the canonical UTF-8 string of `{ type, state, refs }`. A signing key
//! is its SPKI DER bytes in lowercase hex; a private key its PKCS#8 DER bytes in hex (the 32-byte seed alone is also
//! taken); a signature the 64-byte signature in hex. `sign` signs; `seal` (envelope) encrypts. A signed message part is
//! signed over its canonical JSON without its `signature` key.
use crate::block::{hex, parts, unhex};
use crate::canonical::{canonical, canonical_json};
use crate::error::{Error, Result};
use crate::prelude::*;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};

/// SPKI DER prefix of an Ed25519 public key.
pub const SPKI_ED25519: &str = "302a300506032b6570032100";
/// PKCS#8 DER prefix of an Ed25519 private key.
pub const PKCS8_ED25519: &str = "302e020100300506032b657004220420";

/// A signing key: `{ public_key_sign, private_key }`, both hex.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Keypair {
    pub public_key_sign: String,
    pub private_key: String,
}

impl Keypair {
    pub fn to_json(&self) -> Value {
        json!({ "public_key_sign": self.public_key_sign, "private_key": self.private_key })
    }
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

/// The signing key a 32-byte seed (hex) gives: how the vectors' keys are rebuilt.
pub fn keypair_from_seed(seed_hex: &str) -> Result<Keypair> {
    let key = signing_key(seed_hex)?;
    Ok(Keypair {
        public_key_sign: format!("{SPKI_ED25519}{}", hex(key.verifying_key().as_bytes())),
        private_key: format!("{PKCS8_ED25519}{}", hex(&key.to_bytes())),
    })
}

/// A new signing key from the operating system's randomness.
#[cfg(feature = "std")]
pub fn generate_keypair() -> Result<Keypair> {
    keypair_from_seed(&hex(&crate::random::bytes::<32>()?))
}

/// The public signing key (SPKI hex) of a private key.
pub fn public_key_of(private_key: &str) -> Result<String> {
    Ok(format!(
        "{SPKI_ED25519}{}",
        hex(signing_key(private_key)?.verifying_key().as_bytes())
    ))
}

/// Sign bytes: the 64-byte signature, hex.
pub fn sign_bytes(bytes: &[u8], private_key: &str) -> Result<String> {
    Ok(hex(&signing_key(private_key)?.sign(bytes).to_bytes()))
}

/// Whether a signature (hex) is this key's over these bytes. Never fails: anything malformed is false.
pub fn verify_bytes(bytes: &[u8], signature: &str, public_key: &str) -> bool {
    let Some(key) = verifying_key(public_key) else {
        return false;
    };
    let Some(sig) = unhex(signature).and_then(|b| <[u8; 64]>::try_from(b).ok()) else {
        return false;
    };
    key.verify(bytes, &Signature::from_bytes(&sig)).is_ok()
}

/// The author's signature over a block's canonical form, hex.
pub fn sign(block: &Value, private_key: &str) -> Result<String> {
    let (t, s, r) = parts(block);
    sign_bytes(canonical(t, s, r).as_bytes(), private_key)
}

/// Whether a signature is this key's over exactly this block. Never fails.
pub fn verify(block: &Value, signature: &str, public_key: &str) -> bool {
    let (t, s, r) = parts(block);
    verify_bytes(canonical(t, s, r).as_bytes(), signature, public_key)
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
pub fn sign_message(part: &Value, private_key: &str) -> Result<Value> {
    let mut rest = without_signature(part);
    let signature = sign_bytes(canonical_json(&rest).as_bytes(), private_key)?;
    if let Value::Object(map) = &mut rest {
        map.insert("signature".to_string(), Value::String(signature));
    }
    Ok(rest)
}

/// Whether a signed message part's `signature` is this key's. Never fails.
pub fn verify_message(part: &Value, public_key: &str) -> bool {
    let signature = crate::js::text(part.get("signature"));
    verify_bytes(
        canonical_json(&without_signature(part)).as_bytes(),
        &signature,
        public_key,
    )
}
