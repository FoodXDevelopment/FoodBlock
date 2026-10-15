//! The envelope (protocol.md, Encoding): a sealed copy's plaintext is encrypted with AES-256-GCM under a random
//! 32-byte content key and a 12-byte nonce, no additional data. A fresh X25519 key per envelope agrees a secret with
//! each recipient's key; HKDF-SHA256 (salted with the ephemeral public key's bytes then the recipient's, info
//! `foodblock envelope key`) turns it into the key that seals the content key, with its own 12-byte nonce. The
//! envelope names no recipient: each recipient tries every entry. `seal` encrypts; `sign` signs.
//!   ALG      x25519-hkdf-sha256-aes-256-gcm  written now
//!   ALG_RAW  x25519-aes-256-gcm              read forever: the agreed secret itself sealed the content key
//! An older envelope's `key_hash` is ignored.
use crate::block::{hex, unhex};
use crate::error::{Error, Result};
use crate::prelude::*;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use x25519_dalek::{PublicKey, StaticSecret};

pub const ALG: &str = "x25519-hkdf-sha256-aes-256-gcm";
pub const ALG_RAW: &str = "x25519-aes-256-gcm";

/// Fixed randomness, only to reproduce a vector (hex): the ephemeral private key, the content key, the nonce, and one
/// nonce per recipient.
#[derive(Debug, Clone, Default)]
pub struct Fixed {
    pub ephemeral: Option<String>,
    pub content_key: Option<String>,
    pub nonce: Option<String>,
    pub key_nonces: Vec<String>,
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

/// The public encryption key (hex) of an X25519 private key (hex).
pub fn encryption_key_of(private_hex: &str) -> Result<String> {
    let secret = StaticSecret::from(raw::<32>(private_hex, "an X25519 private key")?);
    Ok(hex(PublicKey::from(&secret).as_bytes()))
}

/// A new encryption key: `{ public_key_encrypt, x25519_private }` (raw 32 bytes, hex).
#[cfg(feature = "std")]
pub fn generate_encryption_keypair() -> Result<Value> {
    let private = hex(&crate::random::bytes::<32>()?);
    Ok(json!({ "public_key_encrypt": encryption_key_of(&private)?, "x25519_private": private }))
}

fn sealing_key(
    alg: &str,
    secret: &[u8; 32],
    ephemeral: &[u8; 32],
    recipient: &[u8; 32],
) -> Result<[u8; 32]> {
    if alg == ALG_RAW {
        return Ok(*secret);
    }
    if alg != ALG {
        return Err(Error::new(format!("envelope: unknown alg {alg}")));
    }
    let mut salt = [0u8; 64];
    salt[..32].copy_from_slice(ephemeral);
    salt[32..].copy_from_slice(recipient);
    let info = crate::spec()
        .protocol
        .get("envelope")
        .and_then(|e| e.get("hkdf_info"))
        .and_then(Value::as_str)
        .unwrap_or("foodblock envelope key");
    let mut out = [0u8; 32];
    hkdf::Hkdf::<sha2::Sha256>::new(Some(&salt), secret)
        .expand(info.as_bytes(), &mut out)
        .map_err(|_| Error::new("envelope: hkdf"))?;
    Ok(out)
}

fn gcm(key: &[u8; 32], nonce: &[u8; 12], data: &[u8]) -> Result<Vec<u8>> {
    Aes256Gcm::new(key.into())
        .encrypt(Nonce::from_slice(nonce), data)
        .map_err(|_| Error::new("envelope: encrypt"))
}
fn ungcm(key: &[u8; 32], nonce: &[u8], sealed: &[u8]) -> Option<Vec<u8>> {
    if nonce.len() != 12 {
        return None;
    }
    Aes256Gcm::new(key.into())
        .decrypt(Nonce::from_slice(nonce), sealed)
        .ok()
}

/// Encrypt a value (JSON) to recipients' encryption keys (hex): `{ alg, ephemeral_key, nonce, ciphertext,
/// recipients: [{ encrypted_key }] }`.
pub fn seal(value: &Value, recipient_keys: &[&str]) -> Result<Value> {
    seal_with(value, recipient_keys, ALG, None)
}

/// `seal` with a chosen alg and, to reproduce a vector, fixed randomness.
pub fn seal_with(
    value: &Value,
    recipient_keys: &[&str],
    alg: &str,
    fixed: Option<&Fixed>,
) -> Result<Value> {
    if recipient_keys.is_empty() {
        return Err(Error::new("envelope: at least one recipient key"));
    }
    let none = Fixed::default();
    let fixed = fixed.unwrap_or(&none);
    let content_key = fixed_or_random::<32>(fixed.content_key.as_ref())?;
    let nonce = fixed_or_random::<12>(fixed.nonce.as_ref())?;
    let ephemeral = StaticSecret::from(fixed_or_random::<32>(fixed.ephemeral.as_ref())?);
    let ephemeral_public = *PublicKey::from(&ephemeral).as_bytes();
    let mut recipients = Vec::new();
    for (i, key) in recipient_keys.iter().enumerate() {
        let their = raw::<32>(key, "an X25519 public key")?;
        let key_nonce = fixed_or_random::<12>(fixed.key_nonces.get(i))?;
        let secret = *ephemeral.diffie_hellman(&PublicKey::from(their)).as_bytes();
        let mut sealed = gcm(
            &sealing_key(alg, &secret, &ephemeral_public, &their)?,
            &key_nonce,
            &content_key,
        )?;
        sealed.extend_from_slice(&key_nonce);
        recipients.push(json!({ "encrypted_key": base64_encode(&sealed) }));
    }
    let plaintext = serde_json::to_string(value)?;
    Ok(json!({
        "alg": alg, "ephemeral_key": hex(&ephemeral_public), "nonce": base64_encode(&nonce),
        "ciphertext": base64_encode(&gcm(&content_key, &nonce, plaintext.as_bytes())?), "recipients": recipients,
    }))
}

/// Open an envelope with a recipient's X25519 private key (hex): the value inside. Every entry is tried; none names
/// its recipient.
pub fn open(envelope: &Value, private_hex: &str) -> Result<Value> {
    let secret_key = StaticSecret::from(raw::<32>(private_hex, "an X25519 private key")?);
    let mine = *PublicKey::from(&secret_key).as_bytes();
    let ephemeral = raw::<32>(
        crate::js::str_of(envelope.get("ephemeral_key")),
        "an X25519 public key",
    )?;
    let secret = *secret_key
        .diffie_hellman(&PublicKey::from(ephemeral))
        .as_bytes();
    let alg = envelope
        .get("alg")
        .and_then(Value::as_str)
        .filter(|a| !a.is_empty())
        .unwrap_or(ALG_RAW);
    let key = sealing_key(alg, &secret, &ephemeral, &mine)?;
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
        let Some(content_key) = ungcm(&key, nonce, body).and_then(|k| <[u8; 32]>::try_from(k).ok())
        else {
            continue;
        };
        let nonce = base64_decode(crate::js::str_of(envelope.get("nonce")))
            .ok_or_else(|| Error::new("envelope: the nonce is base64"))?;
        let ciphertext = base64_decode(crate::js::str_of(envelope.get("ciphertext")))
            .ok_or_else(|| Error::new("envelope: the ciphertext is base64"))?;
        let plain = ungcm(&content_key, &nonce, &ciphertext)
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
