//! Causal order (protocol.md §1, §11). A block's causal past is every block reachable from it through its refs. Blocks
//! with no causal link are listed by lowest hash only so every reader lists them the same way; no rule of authority
//! reads that order (invariant 7), and nobody's clock is read (invariant 6).
use crate::js::{cmp16, index_of, Index};
use crate::prelude::*;
use alloc::collections::BTreeSet;

/// An id (protocol.json grammar.id): 64 lowercase hex, or the same with the name of its hash and a colon before it (`sm3:`).
/// Reading only the bare form cut every causal edge through the id of an `sm` identity or block (found by the simulator).
fn is_hash(s: &str) -> bool {
    let bare = match s.split_once(':') {
        Some((name, rest)) if !name.is_empty() && name.bytes().all(|b| matches!(b, b'a'..=b'z' | b'0'..=b'9' | b'-')) => rest,
        Some(_) => return false,
        None => s,
    };
    bare.len() == 64 && bare.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// The hashes a block names, through every ref, and by `state.counted_to`.
pub fn causes_of(block: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(Value::Object(refs)) = block.get("refs") {
        for value in refs.values() {
            let items: Vec<&str> = match value {
                Value::Array(a) => a.iter().filter_map(Value::as_str).collect(),
                Value::String(s) => vec![s.as_str()],
                _ => Vec::new(),
            };
            for h in items {
                if is_hash(h) && !out.iter().any(|o| o == h) {
                    out.push(h.to_string());
                }
            }
        }
    }
    // A rotation or removal sees the block it counts to (protocol.json `causal_state`): its causal past holds the chain it cuts.
    if let Some(Value::Array(keys)) = crate::spec().protocol.get("causal_state") {
        for key in keys.iter().filter_map(Value::as_str) {
            if let Some(h) = block.get("state").and_then(|s| s.get(key)).and_then(Value::as_str) {
                if is_hash(h) && !out.iter().any(|o| o == h) {
                    out.push(h.to_string());
                }
            }
        }
    }
    out
}

/// What an index has worked out of its causal order. Each held block (by its place in the index) has a **row**: one bit for every
/// block its causal past names, held or not (a name that is not held gets a bit after the held ones). A row is built once, from
/// its causes' rows, so "does this see that" is a bit test. Past a size where the rows would cost too much memory the index
/// answers by walking, as it always could.
#[derive(Default)]
pub struct Causal {
    rows: Vec<Option<alloc::rc::Rc<Vec<u64>>>>,
    names: indexmap::IndexSet<String, crate::js::BuildHasher>,
}
impl Causal {
    pub(crate) fn forget(&mut self) {
        self.rows.clear();
        self.names.clear();
    }
}
/// The most held blocks for which rows are kept (a row is one bit per block, so memory grows with the square).
const ROWS_MAX: usize = 20_000;

fn set_bit(row: &mut Vec<u64>, bit: usize) {
    if row.len() <= bit / 64 {
        row.resize(bit / 64 + 1, 0);
    }
    row[bit / 64] |= 1 << (bit % 64);
}
fn or_into(row: &mut Vec<u64>, other: &[u64]) {
    if row.len() < other.len() {
        row.resize(other.len(), 0);
    }
    for (a, b) in row.iter_mut().zip(other) {
        *a |= *b;
    }
}
/// The bit a name has in this index: its place if held, else the place it was given among the names not held.
fn bit_of(index: &Index, causal: &mut Causal, name: &str) -> usize {
    match index.get_index_of(name) {
        Some(at) => at,
        None => index.len() + causal.names.insert_full(name.to_string()).0,
    }
}
fn fresh(index: &Index, causal: &mut Causal) {
    if causal.rows.len() != index.len() {
        causal.rows = vec![None; index.len()];
    }
}
/// A block's row from the rows of the blocks it names (those are built first).
fn row_from(index: &Index, causal: &mut Causal, block: &Value) -> alloc::rc::Rc<Vec<u64>> {
    let mut row: Vec<u64> = Vec::new();
    for cause in causes_of(block) {
        let bit = bit_of(index, causal, &cause);
        set_bit(&mut row, bit);
        if let Some(Some(other)) = index.get_index_of(cause.as_str()).map(|at| causal.rows[at].clone()) {
            or_into(&mut row, &other);
        }
    }
    alloc::rc::Rc::new(row)
}
/// The row of the held block at `at`, building it and the rows of its causes that are not built (without recursion).
fn row_at(index: &Index, at: usize) -> alloc::rc::Rc<Vec<u64>> {
    let mut causal = index.causal.borrow_mut();
    fresh(index, &mut causal);
    let mut visiting: Vec<bool> = Vec::new();
    let mut todo: Vec<(usize, bool)> = vec![(at, false)];
    while let Some((here, built)) = todo.pop() {
        if causal.rows[here].is_some() {
            continue;
        }
        let block = &index[here];
        if !built {
            if visiting.is_empty() {
                visiting = vec![false; index.len()];
            }
            visiting[here] = true;
            todo.push((here, true));
            for cause in causes_of(block) {
                if let Some(next) = index.get_index_of(cause.as_str()) {
                    if causal.rows[next].is_none() && !visiting[next] {
                        todo.push((next, false));
                    }
                }
            }
        } else {
            let row = row_from(index, &mut causal, block);
            causal.rows[here] = Some(row);
        }
    }
    causal.rows[at].clone().unwrap()
}
/// A block's row: its causal past among the held blocks (the block itself is not in it unless a cycle names it).
fn row_of(block: &Value, index: &Index) -> alloc::rc::Rc<Vec<u64>> {
    match index.get_index_of(crate::js::hash_of(block)) {
        Some(at) => row_at(index, at),
        None => {
            // Not held: the rows of what it names are built first, then its own.
            for cause in causes_of(block) {
                if let Some(at) = index.get_index_of(cause.as_str()) {
                    row_at(index, at);
                }
            }
            let mut causal = index.causal.borrow_mut();
            fresh(index, &mut causal);
            row_from(index, &mut causal, block)
        }
    }
}

/// Every block in a block's causal past (the hashes; the block itself is not in it unless a cycle names it).
pub fn past_in(block: &Value, index: &Index) -> BTreeSet<String> {
    if index.len() > ROWS_MAX {
        return past_walk(block, index);
    }
    let row = row_of(block, index);
    let causal = index.causal.borrow();
    let mut past = BTreeSet::new();
    for (word, bits) in row.iter().enumerate() {
        for bit in (0..64).filter(|b| bits >> b & 1 == 1) {
            let at = word * 64 + bit;
            past.insert(match index.get_index(at) {
                Some((h, _)) => h.clone(),
                None => causal.names[at - index.len()].clone(),
            });
        }
    }
    past
}

/// How many blocks a block's causal past names. A block that sees another has a strictly larger past, so this orders by causality.
pub fn past_len(block: &Value, index: &Index) -> usize {
    if index.len() > ROWS_MAX {
        return past_walk(block, index).len();
    }
    row_of(block, index).iter().map(|w| w.count_ones() as usize).sum()
}

/// The walk, for an index too large for rows.
fn past_walk(block: &Value, index: &Index) -> BTreeSet<String> {
    let mut past = BTreeSet::new();
    let mut todo = causes_of(block);
    while let Some(h) = todo.pop() {
        if past.contains(&h) {
            continue;
        }
        if let Some(b) = index.get(&h) {
            todo.extend(causes_of(b));
        }
        past.insert(h);
    }
    past
}

/// Every block in a block's causal past, among these blocks.
pub fn past_of(block: &Value, blocks: &[Value]) -> BTreeSet<String> {
    past_in(block, &index_of(blocks))
}

/// Whether `later` has `earlier` (a hash) in its causal past.
pub fn sees_in(later: &Value, earlier: &str, index: &Index) -> bool {
    if earlier.is_empty() {
        return false;
    }
    if index.len() > ROWS_MAX {
        return past_walk(later, index).contains(earlier);
    }
    let row = row_of(later, index);
    let bit = match index.get_index_of(earlier) {
        Some(at) => at,
        None => match index.causal.borrow().names.get_index_of(earlier) {
            Some(g) => index.len() + g,
            None => return false,
        },
    };
    row.get(bit / 64).is_some_and(|w| w >> (bit % 64) & 1 == 1)
}

/// Whether `later` has `earlier` in its causal past, among these blocks.
pub fn sees(later: &Value, earlier: &Value, blocks: &[Value]) -> bool {
    sees_in(later, crate::js::hash_of(earlier), &index_of(blocks))
}

/// The blocks no other block among them has in its causal past.
pub fn heads_among(blocks: &[Value]) -> Vec<Value> {
    let index = index_of(blocks);
    let mut named = BTreeSet::new();
    for b in blocks {
        named.extend(past_in(b, &index));
    }
    blocks
        .iter()
        .filter(|b| !named.contains(crate::js::hash_of(b)))
        .cloned()
        .collect()
}

/// Causes first; each step places, of the blocks whose held causes are all placed, the one with the lowest hash.
pub fn causal_order_in(index: &Index) -> Vec<Value> {
    let mut waits: indexmap::IndexMap<String, i64, crate::js::BuildHasher> = Default::default();
    let mut next: indexmap::IndexMap<String, Vec<String>, crate::js::BuildHasher> =
        Default::default();
    for (h, block) in index {
        let causes: Vec<String> = causes_of(block)
            .into_iter()
            .filter(|c| c != h && index.contains_key(c))
            .collect();
        waits.insert(h.clone(), causes.len() as i64);
        for c in causes {
            next.entry(c).or_default().push(h.clone());
        }
    }
    let mut ready: Vec<String> = waits
        .iter()
        .filter(|(_, n)| **n == 0)
        .map(|(h, _)| h.clone())
        .collect();
    ready.sort_by(|a, b| cmp16(a, b));
    let mut placed = Vec::with_capacity(index.len());
    while placed.len() < index.len() {
        // A cycle (only made-up data can have one) is broken at its lowest hash.
        let h = if !ready.is_empty() {
            ready.remove(0)
        } else {
            let mut stuck: Vec<&String> = waits
                .iter()
                .filter(|(_, n)| **n > 0)
                .map(|(h, _)| h)
                .collect();
            stuck.sort_by(|a, b| cmp16(a, b));
            match stuck.first() {
                Some(h) => (*h).clone(),
                None => break,
            }
        };
        waits.insert(h.clone(), -1);
        placed.push(index[&h].clone());
        for after in next.get(&h).cloned().unwrap_or_default() {
            let n = waits[&after];
            if n > 0 {
                waits.insert(after.clone(), n - 1);
                if n - 1 == 0 {
                    let at = ready
                        .iter()
                        .position(|other| cmp16(other, &after).is_gt())
                        .unwrap_or(ready.len());
                    ready.insert(at, after);
                }
            }
        }
    }
    placed
}

/// Causes first, among a subset, by the causal order of the whole record. A block may follow another only through blocks that are
/// not in the subset (an allocation after an allocation, through a request; a key grant after a key grant, through a note), so the
/// subset's own refs cannot order it: that left the order to hash ties and made later blocks look as if they did not see earlier
/// ones (found by the simulator). A block that sees another has a strictly larger causal past, so past size orders them; ties by hash.
pub fn causal_order_among(subset: &Index, full: &Index) -> Vec<Value> {
    let mut v: Vec<(usize, &String, &Value)> = subset.iter().map(|(h, b)| (past_len(b, full), h, b)).collect();
    v.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| cmp16(a.1, b.1)));
    v.into_iter().map(|(_, _, b)| b.clone()).collect()
}

/// Causal order of a list of blocks.
pub fn causal_order(blocks: &[Value]) -> Vec<Value> {
    causal_order_in(&index_of(blocks))
}
