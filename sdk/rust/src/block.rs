//! A block and its id: `{ hash, type, state, refs }`, the hash the suite's hash of the canonical form (SHA-256 bare,
//! any other hash with its name as a prefix: `sm3:...`).
use crate::canonical::canonical;
use crate::error::{Error, Result};
use crate::prelude::*;
use sha2::{Digest, Sha256};

/// Lowercase hex of bytes.
pub fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(DIGITS[(b >> 4) as usize] as char);
        out.push(DIGITS[(b & 15) as usize] as char);
    }
    out
}

/// Bytes from hex (either case); None if it is not hex.
pub fn unhex(text: &str) -> Option<Vec<u8>> {
    let bytes = text.as_bytes();
    if bytes.len() % 2 != 0 {
        return None;
    }
    let digit = |c: u8| match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    };
    bytes
        .chunks(2)
        .map(|pair| Some(digit(pair[0])? << 4 | digit(pair[1])?))
        .collect()
}

/// SHA-256 of text, hex.
pub fn hash_hex(text: &str) -> String {
    hex(&Sha256::digest(text.as_bytes()))
}

/// The hash a suite names (protocol.json `suites.<name>.hash`): `sha256` for `std` and `p256`, `sm3` for `sm`.
pub fn hash_name_of(suite: &str) -> String {
    crate::spec()
        .suite(suite)
        .map(|s| s.hash.clone())
        .unwrap_or_else(|| "sha256".to_string())
}

/// Hash text with a named hash (`sha256`, `sm3`): lowercase hex, with the hash's prefix (none for SHA-256, `sm3:`).
/// None for a hash this build cannot compute.
pub fn hash_text(hash_name: &str, text: &str) -> Option<String> {
    let prefix = crate::spec().hash_prefix(hash_name);
    let digest = match hash_name {
        "sha256" => hex(&Sha256::digest(text.as_bytes())),
        #[cfg(feature = "suites")]
        "sm3" => hex(&<sm3::Sm3 as Digest>::digest(text.as_bytes())),
        _ => return None,
    };
    Some(format!("{prefix}{digest}"))
}

/// Hash text with a suite's hash (an id, a commitment): SHA-256 bare, any other hash with its prefix.
pub fn hash_in(suite: &str, text: &str) -> String {
    hash_text(&hash_name_of(suite), text).unwrap_or_default()
}

/// A block's id under the hash of the suite of the key that signed it.
pub fn hash_suite(suite: &str, type_name: &str, state: &Value, refs: &Value) -> String {
    hash_in(suite, &canonical(type_name, state, refs))
}

/// A block's `std` id: SHA-256 of its canonical form, hex.
pub fn hash(type_name: &str, state: &Value, refs: &Value) -> String {
    hash_hex(&canonical(type_name, state, refs))
}

/// The suite whose hash an id names, by its prefix (`sm3:` names sm); a bare hash is SHA-256, which `std` names. Only the hash
/// matters here: `std` and `p256` share SHA-256.
pub fn suite_of_id(id: &str) -> String {
    let spec = crate::spec();
    match id.split_once(':') {
        Some((prefix, _)) => spec
            .suites
            .iter()
            .find(|s| spec.hash_prefix(&s.hash) == format!("{prefix}:"))
            .map(|s| s.name.clone())
            .unwrap_or_else(|| spec.suite_default.clone()),
        None => spec.suite_default.clone(),
    }
}

/// The suite a block is hashed in, read from the block alone (core.md, section 2: the suite of the key that signed it; no
/// label names it): a genesis names its own (`state.suite`), and a key's later block is hashed as its `prev` is. A key's first
/// block after a move to a suite of another hash (and the recovery key's first block, in a `recovery_suite` of another hash) is
/// the one place this differs from the signing key's: a reader that holds the author's keys reads it there
/// (`identity::signed_suite_in`).
pub fn suite_from_block(block: &Value) -> String {
    let refs = block.get("refs");
    if crate::js::type_of(block) == "actor" && refs.and_then(|r| r.get("author")).is_none() {
        return crate::identity::suite_named(block);
    }
    match refs.and_then(|r| r.get("prev")).and_then(Value::as_str) {
        Some(prev) => suite_of_id(prev),
        None => crate::spec().suite_default.clone(),
    }
}

/// A new block, unsigned: `{ hash, type, state, refs }`, its id in the hash of `suite` (the signing key's). Strict writing: it is
/// built as given and the strict check refuses what breaks it, so a null, a float or an unsorted set is an error here,
/// never silently repaired. Each ref is a hash or a list of hashes (text).
pub fn create_in(suite: &str, type_name: &str, state: &Value, refs: &Value) -> Result<Value> {
    if type_name.is_empty() {
        return Err(Error::new(
            "FoodBlock: type is required and must be a string",
        ));
    }
    let state = if state.is_null() { json!({}) } else { state.clone() };
    let refs = if refs.is_null() { json!({}) } else { refs.clone() };
    if !state.is_object() {
        return Err(Error::new("FoodBlock: state must be an object"));
    }
    if !refs.is_object() {
        return Err(Error::new("FoodBlock: refs must be an object"));
    }
    for (key, value) in refs.as_object().unwrap() {
        let ok = value.is_string()
            || value
                .as_array()
                .is_some_and(|a| a.iter().all(Value::is_string));
        if !ok {
            return Err(Error::new(format!(
                "FoodBlock: refs.{key} must be a string or array of strings"
            )));
        }
    }
    let strict = crate::check::strict_findings(type_name, &state, &refs);
    if !strict.is_empty() {
        return Err(Error::refused(crate::check::ordered(strict, "block")));
    }
    let h = hash_suite(suite, type_name, &state, &refs);
    Ok(json!({ "hash": h, "type": type_name, "state": state, "refs": refs }))
}

/// A new `std` block, unsigned.
pub fn create(type_name: &str, state: &Value, refs: &Value) -> Result<Value> {
    create_in(crate::spec::default_suite(), type_name, state, refs)
}

/// The `{ type, state, refs }` of a block, for hashing and signing.
pub fn parts(block: &Value) -> (&str, &Value, &Value) {
    static EMPTY: Value = Value::Null;
    (
        crate::js::type_of(block),
        block.get("state").unwrap_or(&EMPTY),
        block.get("refs").unwrap_or(&EMPTY),
    )
}

/// A block's hash, recomputed from its content (never trusted from a sender), in the suite the block itself shows
/// (`suite_from_block`).
pub fn rehash(block: &Value) -> String {
    let (t, s, r) = parts(block);
    hash_suite(&suite_from_block(block), t, s, r)
}
