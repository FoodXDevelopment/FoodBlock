//! Reading JSON the way the reference SDK reads it. The protocol was first written in JavaScript, so a few of its
//! rules are JavaScript's: what counts as "present" (truthy), how a value turns into text, how numbers compare. These
//! helpers say each once, so every module reads blocks the same way.
use crate::prelude::*;
use core::cmp::Ordering;

/// A held set of blocks by hash, in the order they were first given (a later copy replaces the value, not the place).
pub type Index = indexmap::IndexMap<String, Value, BuildHasher>;

/// A fixed hasher, so the index needs no randomness (and works without the standard library).
#[derive(Clone, Default)]
pub struct BuildHasher;
impl core::hash::BuildHasher for BuildHasher {
    type Hasher = Fnv;
    fn build_hasher(&self) -> Fnv {
        Fnv(0xcbf29ce484222325)
    }
}
pub struct Fnv(u64);
impl core::hash::Hasher for Fnv {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        for b in bytes {
            self.0 ^= *b as u64;
            self.0 = self.0.wrapping_mul(0x100000001b3);
        }
    }
}

/// An index of blocks by their `hash`.
pub fn index_of<'a>(blocks: impl IntoIterator<Item = &'a Value>) -> Index {
    let mut index = Index::default();
    for block in blocks {
        index.insert(str_of(block.get("hash")).to_string(), block.clone());
    }
    index
}

/// A block's hash ("" when it has none).
pub fn hash_of(block: &Value) -> &str {
    block.get("hash").and_then(Value::as_str).unwrap_or("")
}
pub fn type_of(block: &Value) -> &str {
    block.get("type").and_then(Value::as_str).unwrap_or("")
}
/// `block.state[key]`.
pub fn st<'a>(block: &'a Value, key: &str) -> Option<&'a Value> {
    block.get("state").and_then(|s| s.get(key))
}
/// `block.refs[key]`.
pub fn rf<'a>(block: &'a Value, key: &str) -> Option<&'a Value> {
    block.get("refs").and_then(|r| r.get(key))
}
/// `block.refs[key]` when it is one hash (text).
pub fn rs<'a>(block: &'a Value, key: &str) -> Option<&'a str> {
    rf(block, key).and_then(Value::as_str)
}
/// `block.state[key]` when it is text.
pub fn ss<'a>(block: &'a Value, key: &str) -> Option<&'a str> {
    st(block, key).and_then(Value::as_str)
}
/// A path like `state.terms.quantity` (undefined through anything that is not an object).
pub fn get<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut at = value;
    for key in path.split('.') {
        at = match at {
            Value::Object(map) => map.get(key)?,
            Value::Array(items) => items.get(key.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(at)
}

/// A ref as a list of hashes: an array's text items, one text, or nothing.
pub fn list(value: Option<&Value>) -> Vec<&str> {
    match value {
        Some(Value::Array(items)) => items.iter().filter_map(Value::as_str).collect(),
        Some(Value::String(s)) if !s.is_empty() => vec![s.as_str()],
        _ => Vec::new(),
    }
}

/// JavaScript truthiness.
pub fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(false),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// JavaScript `===` on JSON values: undefined equals undefined; objects and arrays are never equal.
pub fn strict_eq(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(Value::Null), Some(Value::Null)) => true,
        (Some(Value::Bool(x)), Some(Value::Bool(y))) => x == y,
        (Some(Value::Number(x)), Some(Value::Number(y))) => x.as_f64() == y.as_f64(),
        (Some(Value::String(x)), Some(Value::String(y))) => x == y,
        _ => false,
    }
}

/// Whether a value is a plain object.
pub fn is_obj(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Object(_)))
}

/// `Number.isInteger`: the value as a whole number, when it is one.
pub fn int(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(n)) => n.as_f64().filter(|f| is_whole(*f)),
        _ => None,
    }
}

/// Whether a number is whole and finite (`Number.isInteger`), without the standard library's float methods.
pub fn is_whole(f: f64) -> bool {
    if !f.is_finite() {
        return false;
    }
    // Every float at or beyond 2^52 is whole.
    f.abs() >= 4_503_599_627_370_496.0 || (f as i64) as f64 == f
}

/// `Math.floor`, without the standard library.
pub fn floor(x: f64) -> f64 {
    if !x.is_finite() || x.abs() >= 4_503_599_627_370_496.0 {
        return x;
    }
    let t = (x as i64) as f64;
    if t > x {
        t - 1.0
    } else {
        t
    }
}

/// A number as JSON: a whole number is written as an integer.
pub fn num(f: f64) -> Value {
    if is_whole(f) && f.abs() < 9.0e15 {
        Value::from(f as i64)
    } else if let Some(n) = serde_json::Number::from_f64(f) {
        Value::Number(n)
    } else {
        Value::Null
    }
}

/// `Number(text)` for the decimal strings the protocol writes.
pub fn number(text: &str) -> f64 {
    let t = text.trim();
    if t.is_empty() {
        return 0.0;
    }
    if t.bytes()
        .any(|b| b.is_ascii_alphabetic() && b != b'e' && b != b'E')
    {
        return f64::NAN;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}
/// `Number(value)` for any JSON value.
pub fn number_of(value: Option<&Value>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(b)) => *b as u8 as f64,
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) => number(s),
        Some(_) => f64::NAN,
    }
}

/// `String(value)`.
pub fn text(value: Option<&Value>) -> String {
    match value {
        None => "undefined".to_string(),
        Some(Value::Null) => "null".to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => crate::canonical::js_number(n.as_f64().unwrap_or(0.0)),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    text(Some(v))
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".to_string(),
    }
}
/// `String(value || '')`.
pub fn text_or_empty(value: Option<&Value>) -> String {
    if truthy(value) {
        text(value)
    } else {
        String::new()
    }
}

/// The text of a value when it is text.
pub fn str_of(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or("")
}

/// JavaScript's default string order: by UTF-16 code units.
pub fn cmp16(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}
/// Sort and dedupe text the JavaScript way (`[...new Set(x)].sort()`).
pub fn sorted_set<S: AsRef<str>>(items: impl IntoIterator<Item = S>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for item in items {
        let s = item.as_ref();
        if !out.iter().any(|o| o == s) {
            out.push(s.to_string());
        }
    }
    out.sort_by(|a, b| cmp16(a, b));
    out
}
/// Dedupe text keeping first-seen order (`[...new Set(x)]`).
pub fn unique<S: AsRef<str>>(items: impl IntoIterator<Item = S>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for item in items {
        let s = item.as_ref();
        if !out.iter().any(|o| o == s) {
            out.push(s.to_string());
        }
    }
    out
}

/// Whether every key of an object is in `allowed`.
pub fn keys_within(value: &Value, allowed: &[String]) -> bool {
    value
        .as_object()
        .map(|m| m.keys().all(|k| allowed.iter().any(|a| a == k)))
        .unwrap_or(false)
}

/// Deep equality as the conformance runner uses it (`assert.deepEqual`): numbers compare by value.
pub fn deep_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(p, q)| deep_eq(p, q))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len()
                && x.iter()
                    .all(|(k, v)| y.get(k).map(|w| deep_eq(v, w)).unwrap_or(false))
        }
        _ => a == b,
    }
}
