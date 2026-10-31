//! Reading blocks. A fold reads only blocks that pass the write check (folds.md), so every field is read as the shape the check
//! proved: an id or a name as text, a whole number as a number, a decimal exactly (decimal.rs). A value of any other shape is
//! absent. Beside them: the held index, the needs, and JavaScript's string order (the order the protocol sorts text in).
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
        // another's cannot take another's place in the index (release 1).
        if block.get("type").is_some() && rs(block, "author").is_none() && !hash_of(block).is_empty() && hash_of(block) != crate::block::rehash(block) {
            continue;
        }
        index.insert(str_of(block.get("hash")).to_string(), block.clone());
    }
    index
}

/// Calls `f` with each block a block rests on (protocol.json `needs`): its `prev`, and by type the grant it passes on, the offer
/// it answers or stops, the grant it acts under, the block a rotation or removal counts to. Without allocating.
pub fn each_need(block: &Value, f: &mut dyn FnMut(&str)) {
    let table = crate::spec().protocol.get("needs");
    for group in ["every", type_of(block)] {
        let Some(Value::Array(paths)) = table.and_then(|t| t.get(group)) else { continue };
        for path in paths.iter().filter_map(Value::as_str) {
            let Some((side, key)) = path.split_once('.') else { continue };
            let Some(value) = block.get(side).and_then(|o| o.get(key)) else { continue };
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

/// The blocks a block rests on (protocol.json `needs`): its `prev`, and by type the grant it passes on, the offer it answers or
/// stops, the grant it acts under, the block a rotation or removal counts to. They are causal dependencies: a block waits until
/// all are held, and a fold reads only blocks whose needs are in its input.
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

/// The needs of a block that are not in the index.
pub fn unmet_in(block: &Value, index: &Index) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    each_need(block, &mut |h| {
        if !index.contains_key(h) && !out.iter().any(|o| o == h) {
            out.push(h.to_string());
        }
    });
    out.sort();
    out
}

// Whether a block is valid against the blocks a fold reads (core.md section 8: the write check, checks 1 to 4 and 8, with their
// schemas as the schema store, and checks 6 and 7 on what it rests on): what a node would take into a store that holds them. A block that fails it counts for nothing
// (folds.md). A sealed block held by its public header alone has no body to check (no `type`): it meets needs and no fold reads it.
/// Whether a block a fold is asked about, but that its input does not hold, could be read with that input: valid on what it rests on
/// (its needs held, the write check and checks 6 and 7). A block the input left out, or one no node would take, is read as no word.
pub(crate) fn readable(block: &Value, index: &Index) -> bool {
    let schemas: Index = index
        .iter()
        .filter(|(_, b)| type_of(b) == "thing" && get(b, "state.kind").and_then(Value::as_str) == Some("schema"))
        .map(|(h, b)| (h.clone(), b.clone()))
        .collect();
    unmet_in(block, index).is_empty() && well_formed(block, index, &schemas)
}

fn well_formed(block: &Value, index: &Index, schemas: &Index) -> bool {
    let (Some(state), Some(refs)) = (block.get("state").filter(|s| s.is_object()), block.get("refs").filter(|r| r.is_object())) else { return false };
    if block.get("type").is_none() {
        return true;
    }
    let options = crate::check::CheckOptions { schemas: Some(schemas), held: Some(index) };
    if !crate::check::findings_with(crate::spec(), type_of(block), state, refs, options).is_empty() {
        return false;
    }
    // checks 6 and 7, read from what the block rests on alone (valid.rs): a block no node would take counts for nothing in a fold
    if crate::identity::is_genesis(block) || (type_of(block) == "actor" && state.get("public_key_sign").is_some()) {
        return crate::identity::genesis_opens(Some(block)) && (hash_of(block).is_empty() || hash_of(block) == crate::block::hash_suite(&crate::identity::suite_named(block), type_of(block), state, refs));
    }
    crate::valid::signature_refusals(block, index).is_empty()
}

// The blocks of an index that cannot be read in it: those the write check refuses against it, and every block that needs one of them
// or a block it does not hold.
fn unread(index: &Index) -> alloc::collections::BTreeSet<&str> {
    let mut gone: alloc::collections::BTreeSet<&str> = Default::default();
    let schemas: Index = index
        .iter()
        .filter(|(_, b)| type_of(b) == "thing" && get(b, "state.kind").and_then(Value::as_str) == Some("schema"))
        .map(|(h, b)| (h.clone(), b.clone()))
        .collect();
    for (h, b) in index {
        if !well_formed(b, index, &schemas) {
            gone.insert(h);
        }
    }
    // A block that needs one gone, or one not held, goes too: a worklist over who needs whom, each block visited once (release 45; it had
    // been a pass over every block, again and again until nothing more went).
    let mut needed_by: alloc::collections::BTreeMap<&str, Vec<&str>> = Default::default();
    let mut work: Vec<&str> = gone.iter().copied().collect();
    for (h, b) in index {
        each_need(b, &mut |n| {
            if index.contains_key(n) {
                needed_by.entry(index.get_key_value(n).map_or("", |(k, _)| k.as_str())).or_default().push(h.as_str());
            } else if gone.insert(h) {
                work.push(h);
            }
        });
    }
    while let Some(g) = work.pop() {
        for d in needed_by.get(g).into_iter().flatten() {
            if gone.insert(d) {
                work.push(d);
            }
        }
    }
    gone
}

/// The largest part of an index in which every block passes the write check against that part and has every need in it: the
/// blocks a fold may read (folds.md). Leaving a block out can leave another without the block its check read (a parent grant,
/// a schema), so the part is read again until nothing more goes. Borrowed, when nothing has to go (the common case: a node's own
/// store is whole and well-formed).
pub fn closed_ref(index: &Index) -> alloc::borrow::Cow<'_, Index> {
    let gone = unread(index);
    if gone.is_empty() {
        return alloc::borrow::Cow::Borrowed(index);
    }
    let mut kept: Index = index.iter().filter(|(h, _)| !gone.contains(h.as_str())).map(|(h, b)| (h.clone(), b.clone())).collect();
    // what is left is read once more: a block's write check read other blocks that may have gone (a parent grant, a schema), and the part is
    // read again until nothing more goes (the common case: once)
    loop {
        let gone: alloc::collections::BTreeSet<String> = unread(&kept).into_iter().map(String::from).collect();
        if gone.is_empty() {
            return alloc::borrow::Cow::Owned(kept);
        }
        kept.retain(|h, _| !gone.contains(h));
    }
}

/// `closed_ref`, owned (the index itself when nothing has to go).
pub fn closed(index: Index) -> Index {
    match closed_ref(&index) {
        alloc::borrow::Cow::Borrowed(_) => index,
        alloc::borrow::Cow::Owned(whole) => whole,
    }
}

/// An index of blocks by hash, closed: what a fold may read of these blocks.
pub fn held_index<'a>(blocks: impl IntoIterator<Item = &'a Value>) -> Index {
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
