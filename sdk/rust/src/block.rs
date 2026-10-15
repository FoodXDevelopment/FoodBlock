//! A block and its id: `{ hash, type, state, refs }`, the hash the SHA-256 of the canonical form.
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

/// A block's id: SHA-256 of its canonical form, hex.
pub fn hash(type_name: &str, state: &Value, refs: &Value) -> String {
    hash_hex(&canonical(type_name, state, refs))
}

// Nulls dropped from objects at every depth (arrays are kept as given; the canonical form drops their nulls).
fn omit_nulls(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(_, v)| !v.is_null())
                .map(|(k, v)| (k.clone(), omit_nulls(v)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// A new block: `{ hash, type, state, refs }`, nulls dropped. Each ref is a hash or a list of hashes (text).
pub fn create(type_name: &str, state: &Value, refs: &Value) -> Result<Value> {
    if type_name.is_empty() {
        return Err(Error::new(
            "FoodBlock: type is required and must be a string",
        ));
    }
    let state = if state.is_null() {
        json!({})
    } else {
        state.clone()
    };
    let refs = if refs.is_null() {
        json!({})
    } else {
        refs.clone()
    };
    if !state.is_object() {
        return Err(Error::new("FoodBlock: state must be an object"));
    }
    if !refs.is_object() {
        return Err(Error::new("FoodBlock: refs must be an object"));
    }
    let state = omit_nulls(&state);
    let refs = omit_nulls(&refs);
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
    let h = hash(type_name, &state, &refs);
    Ok(json!({ "hash": h, "type": type_name, "state": state, "refs": refs }))
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

/// A block's hash, recomputed from its content (never trusted from a sender).
pub fn rehash(block: &Value) -> String {
    let (t, s, r) = parts(block);
    hash(t, s, r)
}
