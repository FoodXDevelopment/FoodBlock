//! Reading blocks. A fold reads only blocks that pass the write check (folds.md), so every field is read as the shape the check
//! proved: an id or a name as text, a whole number as a number, a decimal exactly (decimal.rs). A value of any other shape is
//! absent. Beside them: the given index, the needs, and JavaScript's string order (the order the protocol sorts text in).
use crate::prelude::*;
use core::cmp::Ordering;

pub use crate::index::{Index, Past};

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
        // A block with no author has no key whose signature vouches for its id, so its id must be the hash of its bytes: one that claims
        // another's cannot take another's place in the index.
        if block.get("type").is_some() && rs(block, "author").is_none() && !hash_of(block).is_empty() && hash_of(block) != crate::block::rehash(block) {
            continue;
        }
        // a given header message `{ header, header_signature }` is given as its header entry (a block given only as its header
        // hides what its key's line given at its place, in every fold)
        if block.get("header").is_some() && block.get("type").is_none() {
            if let Some(e) = crate::valid::header_entry(block) {
                // a body given under the same id is the block itself: a header never takes its place
                let id = str_of(e.get("hash")).to_string();
                if !index.get(&id).is_some_and(|b| b.get("type").is_some()) {
                    index.insert(id, e);
                }
            }
            continue;
        }
        index.insert(str_of(block.get("hash")).to_string(), block.clone());
    }
    index
}

/// Calls `f` with each block a block names for its meaning (protocol.json `needs`: `read` reads them, core.md section 8). Never its author
/// or its `prev`: those are no block's meaning. Without allocating.
pub fn each_need(block: &Value, f: &mut dyn FnMut(&str)) {
    let table = crate::spec().protocol.get("needs");
    for group in ["every", type_of(block)] {
        let Some(Value::Array(paths)) = table.and_then(|t| t.get(group)) else { continue };
        for path in paths.iter().filter_map(Value::as_str) {
            let Some(value) = get(block, path) else { continue };
            match value {
                Value::String(h) if !h.is_empty() => f(h),
                Value::Array(items) => {
                    for h in items.iter().filter_map(Value::as_str).filter(|h| !h.is_empty()) {
                        f(h);
                    }
                }
                _ => {}
            }
        }
    }
}

/// The blocks a block names for its meaning (protocol.json `needs`), ascending.
pub fn needs_of(block: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    each_need(block, &mut |h| {
        if !out.iter().any(|o| o == h) {
            out.push(h.to_string());
        }
    });
    out.sort();
    out
}

/// The blocks a block names for its meaning that are not given (`read`'s `names_missing`), ascending.
pub fn needs_missing(block: &Value, index: &Index) -> Vec<String> {
    let mut out = needs_of(block);
    out.retain(|h| !index.contains_key(h));
    out
}

/// What a fold may read of an index (`valid::pool`): each block valid and read whole, each valid and not read as its header, and nothing
/// of one that is not valid. Owned (the index itself when nothing changes).
pub fn closed(index: Index) -> Index {
    match crate::valid::pool(&index) {
        alloc::borrow::Cow::Borrowed(_) => index,
        alloc::borrow::Cow::Owned(whole) => whole,
    }
}

/// An index of blocks by hash, as a fold reads it (`closed`).
pub fn blocks_index<'a>(blocks: impl IntoIterator<Item = &'a Value>) -> Index {
    closed(index_of(blocks))
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

/// Whether two values are the same text: two units, two line ids (a value that is not text matches nothing).
pub fn same_str(a: Option<&Value>, b: Option<&Value>) -> bool {
    matches!((a, b), (Some(Value::String(x)), Some(Value::String(y))) if x == y)
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

/// count_stated: a number a rule asks the author to state (`needed`: how many must agree): a whole number of at least 1, and no more
/// than the voices there are (`most`, when the set has a size). The protocol fills in none: not stated, it is None.
pub fn count_stated(value: Option<&Value>, most: Option<usize>) -> Option<f64> {
    int(value).filter(|n| *n >= 1.0 && most.is_none_or(|m| *n <= m as f64))
}

/// quorum(voices, needed): `needed` different voices have each spoken. A set of voices with no number stated (None) never makes one.
/// Reads voices lazily and stops at the number, so a caller may make each voice's proof costly.
pub fn quorum<T: Ord>(voices: impl IntoIterator<Item = T>, needed: Option<f64>) -> bool {
    let Some(needed) = needed else { return false };
    let mut seen = alloc::collections::BTreeSet::new();
    if seen.len() as f64 >= needed {
        return true;
    }
    voices.into_iter().any(|v| {
        seen.insert(v);
        seen.len() as f64 >= needed
    })
}

/// Whether a number is whole and finite (`Number.isInteger`), without the standard library's float methods.
pub fn is_whole(f: f64) -> bool {
    if !f.is_finite() {
        return false;
    }
    // Every float at or beyond 2^52 is whole.
    f.abs() >= 4_503_599_627_370_496.0 || (f as i64) as f64 == f
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

/// The text of a value when it is text.
pub fn str_of(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or("")
}

/// JavaScript's default string order: by UTF-16 code units.
pub fn cmp16(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}
/// Sort and dedupe text as a set is written: ascending UTF-8 bytes, no repeat.
pub fn sorted_set<S: AsRef<str>>(items: impl IntoIterator<Item = S>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for item in items {
        let s = item.as_ref();
        if !out.iter().any(|o| o == s) {
            out.push(s.to_string());
        }
    }
    out.sort();
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

/// A deal's lines (promises.md, Terms, A deal is its lines): `terms.lines`, each an object; none where the terms state no list.
pub fn lines_of(terms: &Value) -> Vec<&Value> {
    terms.get("lines").and_then(Value::as_array).map(|l| l.iter().filter(|x| x.is_object()).collect()).unwrap_or_default()
}
/// What a block moves or names to move (promises.md, What moves): a promise's lines' `what`, any other block's `refs.what`.
pub fn whats_of(block: &Value) -> Vec<&str> {
    if type_of(block) == "promise" {
        lines_of(get(block, "state.terms").unwrap_or(&Value::Null)).into_iter().filter_map(|l| l.get("what").and_then(Value::as_str)).collect()
    } else {
        list(rf(block, "what"))
    }
}
/// A line's quantity chosen (folds.md): the `quantity` an answer's `terms.lines` names for the line's id (`chosen`), else the line's
/// own quantity where that is an amount (a range is what may be chosen, never a choice).
pub fn quantity_of<'a>(line: &'a Value, chosen: Option<&'a Value>) -> Option<&'a Value> {
    let named = line.get("id").and_then(|id| chosen?.as_array()?.iter().find(|c| c.get("id") == Some(id))?.get("quantity").filter(|q| q.get("value").is_some()));
    named.or_else(|| line.get("quantity").filter(|q| q.get("value").is_some()))
}

