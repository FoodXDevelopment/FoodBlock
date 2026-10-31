//! Signing (core.md, Suites): a signature over the canonical UTF-8 bytes of `{ type, state, refs }`, by the algorithm
//! of the signing key's suite. `std` is Ed25519 (a key is SPKI DER hex, a private key PKCS#8 DER hex or the 32-byte
//! seed); `p256` is ECDSA P-256 with SHA-256 and `sm` is SM2 with SM3 (a key is SPKI DER hex, a private key the
//! 32-byte scalar in hex; a signature is `r` then `s`, 32 bytes each, hex). A signed message part is signed over its
//! canonical JSON without its `signature` key.
use crate::block::{hex, parts, unhex};
use crate::canonical::{canonical, canonical_json};
use crate::error::{Error, Result};
use crate::prelude::*;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};

/// SPKI DER prefix of an Ed25519 public key.
pub const SPKI_ED25519: &str = "302a300506032b6570032100";
/// PKCS#8 DER prefix of an Ed25519 private key.
pub const PKCS8_ED25519: &str = "302e020100300506032b657004220420";
/// The SM2 user id the suite fixes (protocol.json `suites.sm.sm2_user_id`).
#[cfg(feature = "suites")]
const SM2_ID: &str = "1234567812345678";

/// A signing key: `{ public_key_sign, private_key }`, both hex, and the suite it signs in (empty: `std`).
#[derive(Clone, PartialEq, Eq, Default)]
pub struct Keypair {
    pub suite: String,
    pub public_key_sign: String,
    pub private_key: String,
}

// A key is never printed, logged or put in a panic message by accident: Debug shows the public half and hides the private one (release 38).
impl core::fmt::Debug for Keypair {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Keypair").field("suite", &self.suite).field("public_key_sign", &self.public_key_sign).field("private_key", &"<hidden>").finish()
    }
}

impl Keypair {
    pub fn to_json(&self) -> Value {
        let mut out = json!({ "public_key_sign": self.public_key_sign, "private_key": self.private_key });
        if crate::spec::suite_or_default(&self.suite) != crate::spec::default_suite() {
            out["suite"] = json!(self.suite);
        }
        out
    }
}

// Whether a suite name (the empty name being the default's) names the `std` suite, Ed25519 and SHA-256.
fn is_std(suite: &str) -> bool {
    crate::spec::suite_or_default(suite) == "std"
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

// An Ed25519 key as the suite accepts it (core.md, Suites): SPKI hex in the suite's grammar (lowercase, exact length), whose point is
// encoded canonically (it encodes back to the same 32 bytes) and is not of small order. A small-order key verifies a fixed signature
// over every message: anyone could have signed for it.
fn verifying_key(public_key: &str) -> Option<VerifyingKey> {
    if public_key.len() != 88 || !public_key.starts_with(SPKI_ED25519) {
        return None;
    }
    let bytes: [u8; 32] = unhex_lower(&public_key[24..])?.try_into().ok()?;
    let key = VerifyingKey::from_bytes(&bytes).ok()?;
    (!key.is_weak() && key.to_edwards().compress().to_bytes() == bytes).then_some(key)
}

// Lowercase hex only (core.md section 3: hex is lowercase): one signature or key has one written form.
fn unhex_lower(text: &str) -> Option<Vec<u8>> {
    text.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')).then(|| unhex(text)).flatten()
}

/// Whether a signing key (SPKI hex) is one its suite accepts beyond its grammar: an Ed25519 key canonically encoded and not of small
/// order (core.md, Suites). A key of another suite is judged by its grammar alone here (its point is checked when it verifies).
pub fn key_is_sound(public_key: &str) -> bool {
    !public_key.starts_with(SPKI_ED25519) || verifying_key(public_key).is_some()
}

// A signature and a key in their suite's grammar (protocol.json `suites.*.signature.grammar`, `sign_key.grammar`; a p256 signature
// may be a passkey's longer form): checked before anything is decoded or remembered.
fn in_grammar(suite: &str, signature: &str, public_key: &str) -> bool {
    let name = crate::spec::suite_or_default(suite);
    let Some(info) = crate::spec().suite(name) else { return false };
    let hex = |t: &str| t.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
    // the grammars are a prefix and so many lowercase hex characters (protocol.json): read as such, cheaply, before anything is decoded
    let key = public_key.strip_prefix(info.spki_prefix.as_str()).is_some_and(|rest| rest.len() == 2 * info.raw_key_bytes && hex(rest));
    let plain = signature.len() == 2 * info.signature_bytes && hex(signature);
    let passkey = info.passkey_re.is_some() && signature.len() > 2 * info.signature_bytes + 4 && signature.len() % 2 == 0 && hex(signature);
    key && (plain || passkey)
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

/// The signing key a 32-byte seed (hex) gives, in the default suite.
pub fn keypair_from_seed(seed_hex: &str) -> Result<Keypair> {
    keypair_from_seed_in(crate::spec::default_suite(), seed_hex)
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
    generate_keypair_in(crate::spec::default_suite())
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

/// The public signing key (SPKI hex) of a private key in the default suite.
pub fn public_key_of(private_key: &str) -> Result<String> {
    public_key_in(crate::spec::default_suite(), private_key)
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
                // low s (core.md, Suites): the one form a reader accepts
                Ok(hex(&sig.normalize_s().unwrap_or(sig).to_bytes()))
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

/// Sign bytes with a key of the default suite.
pub fn sign_bytes(bytes: &[u8], private_key: &str) -> Result<String> {
    sign_bytes_in(crate::spec::default_suite(), bytes, private_key)
}

/// Whether a signature (hex) is this key's over these bytes, in a suite. Never fails: anything malformed is false.
///
/// The folds ask the same question again and again (an identity fold reads every key grant of an author each time any
/// block of hers is asked about), and a signature check is the dearest step, so a verdict is remembered for the thread
/// (the answer is a pure function of the four arguments). Without it a fold over a few hundred blocks took seconds
/// (found by the simulator, tools/sim). `no_std` builds do not remember and are as before.
pub fn verify_bytes_in(suite: &str, bytes: &[u8], signature: &str, public_key: &str) -> bool {
    // the grammar first: nothing outside it is decoded or remembered (a megabyte "signature" costs a scan, never memory)
    if !in_grammar(suite, signature, public_key) {
        return false;
    }
    #[cfg(feature = "std")]
    {
        use sha2::Digest;
        use std::cell::RefCell;
        use std::collections::HashMap;
        // a verdict is remembered by a digest of the four arguments (32 bytes, whatever their size), and the memory is bounded by bytes
        const ENTRY_BYTES: usize = 96;
        const MOST_BYTES: usize = 8 << 20;
        std::thread_local! {
            static VERDICTS: RefCell<HashMap<[u8; 32], bool>> = RefCell::new(HashMap::new());
        }
        let mut h = sha2::Sha256::new();
        for part in [suite.as_bytes(), public_key.as_bytes(), signature.as_bytes(), bytes] {
            h.update((part.len() as u64).to_be_bytes());
            h.update(part);
        }
        let key: [u8; 32] = h.finalize().into();
        if let Some(v) = VERDICTS.with(|m| m.borrow().get(&key).copied()) {
            return v;
        }
        let verdict = verify_bytes_uncached(suite, bytes, signature, public_key);
        VERDICTS.with(|m| {
            let mut m = m.borrow_mut();
            if (m.len() + 1) * ENTRY_BYTES > MOST_BYTES {
                m.clear();
            }
            m.insert(key, verdict);
        });
        return verdict;
    }
    #[cfg(not(feature = "std"))]
    verify_bytes_uncached(suite, bytes, signature, public_key)
}

fn verify_bytes_uncached(suite: &str, bytes: &[u8], signature: &str, public_key: &str) -> bool {
    let Some(sig_bytes) = unhex_lower(signature) else {
        return false;
    };
    if is_std(suite) {
        let Some(key) = verifying_key(public_key) else {
            return false;
        };
        let Ok(sig) = <[u8; 64]>::try_from(sig_bytes) else {
            return false;
        };
        // RFC 8032 with the strict rules (core.md, Suites): S below the group order, R canonical and not of small order, and the
        // cofactorless equation, [S]B = R + [k]A, checked on R's encoding
        return key.verify_strict(bytes, &Signature::from_bytes(&sig)).is_ok();
    }
    #[cfg(feature = "suites")]
    {
        let Some(info) = crate::spec().suite(suite) else {
            return false;
        };
        let Some(point) = public_key
            .strip_prefix(info.spki_prefix.as_str())
            .and_then(unhex_lower)
        else {
            return false;
        };
        return match suite {
            "p256" => {
                use p256::ecdsa::signature::Verifier as _;
                let Ok(key) = p256::ecdsa::VerifyingKey::from_sec1_bytes(&point) else {
                    return false;
                };
                // 64 bytes: the key signed the bytes. More: a passkey signed them (passkey_message).
                let (message, rs) = if sig_bytes.len() == 64 {
                    (bytes.to_vec(), &sig_bytes[..])
                } else {
                    match passkey_message(bytes, &sig_bytes) {
                        Some(m) => m,
                        None => return false,
                    }
                };
                let Ok(sig) = p256::ecdsa::Signature::from_slice(rs) else {
                    return false;
                };
                // low s only (core.md, Suites): s and n - s both verify, and one signature has one written form
                if sig.normalize_s().is_some() {
                    return false;
                }
                key.verify(&message, &sig).is_ok()
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

/// base64url without padding (RFC 4648 section 5): how a WebAuthn challenge is written in `clientDataJSON`.
fn base64url(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |n, (i, b)| n | (u32::from(*b) << (16 - 8 * i)));
        for i in 0..=chunk.len() {
            out.push(A[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

/// The challenge a passkey must be asked to sign for these signed bytes (a block's canonical bytes, or a message
/// part's): base64url, no padding, of their SHA-256 (spec/modules/encoding.md, Passkeys). For a block it is its id.
pub fn passkey_challenge_of(bytes: &[u8]) -> String {
    use sha2::Digest;
    base64url(&sha2::Sha256::digest(bytes))
}

/// A passkey's signature as FoodBlock writes it, hex: `r || s` (64 bytes), the length of the authenticator data (two
/// bytes, big-endian), the authenticator data, then `clientDataJSON`. The WebAuthn signature may be DER (as an
/// authenticator gives it) or already `r || s`; `authenticator_data` and `client_data_json` are the bytes in hex.
#[cfg(feature = "suites")]
pub fn passkey_signature(authenticator_data: &str, client_data_json: &str, signature: &str) -> Result<String> {
    let bad = || Error::new("passkey: authenticator data, clientDataJSON and the signature are hex");
    let (auth, cdj, sig) = (
        unhex(authenticator_data).ok_or_else(bad)?,
        unhex(client_data_json).ok_or_else(bad)?,
        unhex(signature).ok_or_else(bad)?,
    );
    let rs = if sig.len() == 64 {
        p256::ecdsa::Signature::from_slice(&sig)
    } else {
        p256::ecdsa::Signature::from_der(&sig)
    }
    .map_err(|_| Error::new("passkey: the signature is DER or r then s"))?;
    let len = u16::try_from(auth.len()).map_err(|_| Error::new("passkey: authenticator data is too long"))?;
    // an authenticator may give a high s; s and n - s both verify, and the suite accepts the low one (core.md, Suites)
    let mut out = rs.normalize_s().unwrap_or(rs).to_bytes().to_vec();
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(&auth);
    out.extend_from_slice(&cdj);
    Ok(hex(&out))
}

/// What a passkey signature (more than 64 bytes) really signed, and `r || s`: `authenticatorData || SHA-256(clientDataJSON)`.
/// None unless the user was present (authenticator data flag `UP`), `clientDataJSON` is a JSON object with no repeated
/// key whose `type` is `webauthn.get` and whose `challenge` is the challenge of `bytes`. Nothing else is read: not
/// `rpIdHash`, not `origin`, not the counter (spec/modules/encoding.md, Passkeys).
#[cfg(feature = "suites")]
fn passkey_message<'a>(bytes: &[u8], sig: &'a [u8]) -> Option<(Vec<u8>, &'a [u8])> {
    use sha2::Digest;
    let n = usize::from(u16::from_be_bytes([*sig.get(64)?, *sig.get(65)?]));
    let auth = sig.get(66..66 + n)?;
    let cdj = sig.get(66 + n..)?;
    if auth.len() < 37 || cdj.is_empty() || auth[32] & 1 == 0 {
        return None;
    }
    let data = crate::canonical::parse_strict(core::str::from_utf8(cdj).ok()?).ok()?;
    let ok = |k: &str, want: &str| data.get(k).and_then(Value::as_str) == Some(want);
    if !data.is_object() || !ok("type", "webauthn.get") || !ok("challenge", &passkey_challenge_of(bytes)) {
        return None;
    }
    let mut message = auth.to_vec();
    message.extend_from_slice(&sha2::Sha256::digest(cdj));
    Some((message, &sig[..64]))
}

/// Whether a `std` signature is this key's over these bytes.
pub fn verify_bytes(bytes: &[u8], signature: &str, public_key: &str) -> bool {
    verify_bytes_in(crate::spec::default_suite(), bytes, signature, public_key)
}

/// The author's signature over a block's canonical form, hex, in the key's suite.
pub fn sign_in(suite: &str, block: &Value, private_key: &str) -> Result<String> {
    let (t, s, r) = parts(block);
    sign_bytes_in(suite, canonical(t, s, r).as_bytes(), private_key)
}
/// The author's `std` signature over a block's canonical form, hex.
pub fn sign(block: &Value, private_key: &str) -> Result<String> {
    sign_in(crate::spec::default_suite(), block, private_key)
}

/// Whether a signature is this key's over exactly this block, in a suite. Never fails.
pub fn verify_in(suite: &str, block: &Value, signature: &str, public_key: &str) -> bool {
    let (t, s, r) = parts(block);
    verify_bytes_in(suite, canonical(t, s, r).as_bytes(), signature, public_key)
}
/// Whether a `std` signature is this key's over exactly this block.
pub fn verify(block: &Value, signature: &str, public_key: &str) -> bool {
    verify_in(crate::spec::default_suite(), block, signature, public_key)
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
    sign_message_in(crate::spec::default_suite(), part, private_key)
}

/// Whether a signed message part's `signature` is this key's. Never fails.
pub fn verify_message_in(suite: &str, part: &Value, public_key: &str) -> bool {
    let signature = crate::js::str_of(part.get("signature"));
    verify_bytes_in(
        suite,
        canonical_json(&without_signature(part)).as_bytes(),
        &signature,
        public_key,
    )
}
pub fn verify_message(part: &Value, public_key: &str) -> bool {
    verify_message_in(crate::spec::default_suite(), part, public_key)
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

/// The suite a signing key is read in: the one its own text shows (`suite_of_key`), else the default suite (an absent suite is
/// the std spelling, core.md). The one place a key's suite is read when none is named.
pub fn suite_named_by(public_key: &str) -> String {
    suite_of_key(public_key).unwrap_or_else(|| crate::spec::default_suite().to_string())
}

/// Whether this build can sign and verify in a suite (declared and built in).
pub fn knows_suite(suite: &str) -> bool {
    let declared = crate::spec().suite(suite).is_some();
    declared && (is_std(suite) || cfg!(feature = "suites"))
}
