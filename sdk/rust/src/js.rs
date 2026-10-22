//! Reading JSON the way the reference SDK reads it. The protocol was first written in JavaScript, so a few of its
//! rules are JavaScript's: what counts as "present" (truthy), how a value turns into text, how numbers compare. These
//! helpers say each once, so every module reads blocks the same way.
use crate::prelude::*;
use core::cmp::Ordering;

/// A held set of blocks by hash, in the order they were first given (a later copy replaces the value, not the place).
/// It remembers what it has worked out of its own causal order (order.rs), so a fold asks "does this see that" once per pair
/// however often it asks; any change to the set forgets it.
#[derive(Default)]
pub struct Index {
    map: indexmap::IndexMap<String, Value, BuildHasher>,
    pub(crate) causal: core::cell::RefCell<crate::order::Causal>,
    /// Which blocks name which: `"key value"` -> the places of the blocks whose `refs.key` is (or lists) that value.
    named: core::cell::RefCell<Option<alloc::rc::Rc<indexmap::IndexMap<String, Vec<usize>, BuildHasher>>>>,
}
impl Index {
    /// The blocks whose `refs.key` names `target` (a text, or in a list), by their place in the index and in that order. Built once
    /// for the whole set on the first ask, so a fold that asks for many targets reads the set once.
    pub fn naming(&self, key: &str, target: &str) -> Vec<usize> {
        let table = {
            let mut slot = self.named.borrow_mut();
            slot.get_or_insert_with(|| {
                let mut table: indexmap::IndexMap<String, Vec<usize>, BuildHasher> = Default::default();
                for (at, block) in self.map.values().enumerate() {
                    if let Some(Value::Object(refs)) = block.get("refs") {
                        for (k, v) in refs {
                            let mut add = |t: &str| {
                                let places = table.entry(format!("{k} {t}")).or_default();
                                if places.last() != Some(&at) {
                                    places.push(at)
                                }
                            };
                            match v {
                                Value::String(t) => add(t),
                                Value::Array(list) => list.iter().filter_map(Value::as_str).for_each(&mut add),
                                _ => {}
                            }
                        }
                    }
                }
                alloc::rc::Rc::new(table)
            })
            .clone()
        };
        table.get(format!("{key} {target}").as_str()).cloned().unwrap_or_default()
    }
}
impl core::ops::Deref for Index {
    type Target = indexmap::IndexMap<String, Value, BuildHasher>;
    fn deref(&self) -> &Self::Target {
        &self.map
    }
}
impl core::ops::DerefMut for Index {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.causal.get_mut().forget();
        *self.named.get_mut() = None;
        &mut self.map
    }
}
impl Clone for Index {
    fn clone(&self) -> Self {
        Index { map: self.map.clone(), ..Default::default() }
    }
}
impl FromIterator<(String, Value)> for Index {
    fn from_iter<I: IntoIterator<Item = (String, Value)>>(items: I) -> Self {
        Index { map: items.into_iter().collect(), ..Default::default() }
    }
}
impl Extend<(String, Value)> for Index {
    fn extend<I: IntoIterator<Item = (String, Value)>>(&mut self, items: I) {
        self.causal.get_mut().forget();
        *self.named.get_mut() = None;
        self.map.extend(items)
    }
}
impl<'a> IntoIterator for &'a Index {
    type Item = (&'a String, &'a Value);
    type IntoIter = indexmap::map::Iter<'a, String, Value>;
    fn into_iter(self) -> Self::IntoIter {
        self.map.iter()
    }
}
impl IntoIterator for Index {
    type Item = (String, Value);
    type IntoIter = indexmap::map::IntoIter<String, Value>;
    fn into_iter(self) -> Self::IntoIter {
        self.map.into_iter()
    }
}

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

fn is_read(block: &Value) -> bool {
    block.get("state").is_some_and(Value::is_object) && block.get("refs").is_some_and(Value::is_object)
}

/// The largest part of an index in which every block's needs are present: the blocks a fold may read. Borrowed, when nothing
/// has to go (the common case: a node's own store is whole).
pub fn closed_ref(index: &Index) -> alloc::borrow::Cow<'_, Index> {
    let mut gone: alloc::collections::BTreeSet<&str> = Default::default();
    for (h, b) in index {
        if !is_read(b) {
            gone.insert(h);
        }
    }
    loop {
        let before = gone.len();
        for (h, b) in index {
            if gone.contains(h.as_str()) {
                continue;
            }
            let mut unmet = false;
            each_need(b, &mut |n| {
                if !index.contains_key(n) || gone.contains(n) {
                    unmet = true;
                }
            });
            if unmet {
                gone.insert(h);
            }
        }
        if gone.len() == before {
            break;
        }
    }
    if gone.is_empty() {
        return alloc::borrow::Cow::Borrowed(index);
    }
    alloc::borrow::Cow::Owned(index.iter().filter(|(h, _)| !gone.contains(h.as_str())).map(|(h, b)| (h.clone(), b.clone())).collect())
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
