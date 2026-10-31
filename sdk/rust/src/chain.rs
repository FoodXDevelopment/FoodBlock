//! A key's own chain (core.md, The chain). Every block but a genesis sits in its signing key's chain: `state.seq` its
//! number, `refs.prev` the key's previous block. A key's first block has seq 1 and its prev is the block that brought
//! the key in; a skip may jump forward. Two blocks naming one prev prove a lie (invariant 3).
use crate::error::{Error, Result};
use crate::js::{hash_of, int, rs, st};
use crate::prelude::*;

/// Where the next block for a key goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Link {
    pub seq: i64,
    pub prev: String,
}

impl Link {
    pub fn to_json(&self) -> Value {
        json!({ "seq": self.seq, "prev": self.prev })
    }
}

/// Where the next block for a key goes. `last` is the key's latest block; with none, the key's first block follows
/// `brought_in` (the hash of the genesis or key grant that brought the key in).
pub fn next_link(last: Option<&Value>, brought_in: Option<&str>) -> Result<Link> {
    if let Some(last) = last {
        let seq = int(st(last, "seq")).ok_or_else(|| {
            Error::new("chain: the last block has no seq; a key whose blocks have no seq starts again from the block that brought it in")
        })?;
        // seq is an integer to 2^53 - 1 (core.md, section 3): past it there is no next place, and `as i64 + 1` would overflow.
        if !(0.0..9_007_199_254_740_991.0).contains(&seq) {
            return Err(Error::new("chain: the last seq is the largest a block may carry; this key's chain cannot go on"));
        }
        return Ok(Link {
            seq: seq as i64 + 1,
            prev: hash_of(last).to_string(),
        });
    }
    match brought_in {
        Some(b) if !b.is_empty() => Ok(Link {
            seq: 1,
            prev: b.to_string(),
        }),
        _ => Err(Error::new(
            "chain: a key's first block follows the block that brought the key in",
        )),
    }
}

/// One key's chain, checked (folds.md, the `chain` fold).
#[derive(Debug, Clone, PartialEq)]
pub struct Chain {
    /// The latest block, when one block is the latest.
    pub head: Option<Value>,
    /// The blocks counted: those that are not part of an equivocation pair.
    pub length: i64,
    /// The seq numbers missing that no skip block explains.
    pub gaps: Vec<i64>,
    /// The hashes of the skip blocks.
    pub skips: Vec<String>,
    /// The pairs of blocks naming one `prev`, each pair sorted, the list sorted.
    pub equivocations: Vec<[String; 2]>,
    /// The blocks whose prev is not the block before them.
    pub broken: Vec<String>,
    pub ok: bool,
}

/// The most missing seq numbers `check_chain` lists (protocol.json `limits.gaps_max`).
pub fn gaps_max() -> i64 {
    crate::spec().protocol.get("limits").and_then(|l| l.get("gaps_max")).and_then(Value::as_i64).unwrap_or(10_000)
}

/// Check one key's chain: blocks it signed (each with state.seq and refs.prev) and the block that brought it in.
pub fn check_chain(blocks: &[Value], brought_in: &str) -> Chain {
    // Each seq with the blocks at it. A skip may jump forward; two blocks naming one prev are an equivocation.
    let mut by_seq: alloc::collections::BTreeMap<i64, Vec<&Value>> = Default::default();
    for block in blocks {
        let Some(seq) = int(st(block, "seq")) else { continue };
        if seq < 1.0 || hash_of(block) == brought_in {
            continue;
        }
        let here = by_seq.entry(seq as i64).or_default();
        if !here.iter().any(|h| hash_of(h) == hash_of(block)) {
            here.push(block);
        }
    }
    let mine: alloc::collections::BTreeMap<&str, &Value> = by_seq.values().flatten().map(|b| (hash_of(b), *b)).collect();
    let is_skip = |b: &Value| st(b, "skip") == Some(&Value::Bool(true));
    let seq_of = |b: &Value| int(st(b, "seq")).unwrap_or(0.0) as i64;
    // The place each block takes (core.md, invariant 3): its prev, or, for a first block of the key, the key's root. A first block names
    // the block that brought the key in (`brought_in`), or, at seq 1, a block that is none of the key's: another block that brought it in.
    let first = |b: &Value| rs(b, "prev").is_some_and(|p| p == brought_in || (!mine.contains_key(p) && seq_of(b) == 1));
    let mut by_prev: alloc::collections::BTreeMap<String, Vec<String>> = Default::default();
    for b in mine.values() {
        let slot = if first(b) { Some("^first") } else { rs(b, "prev") };
        if let Some(p) = slot {
            by_prev.entry(p.to_string()).or_default().push(hash_of(b).to_string());
        }
    }
    // Each group of blocks taking one place proves the lie by a star: every block of it paired with the group's lowest hash (folds.md,
    // chain), so a key that signs a thousand blocks on one prev lists 999 pairs, never half a million.
    let mut equivocations: Vec<[String; 2]> = Vec::new();
    let mut in_pair: alloc::collections::BTreeSet<String> = Default::default();
    for (_, mut group) in by_prev {
        group.sort();
        group.dedup();
        if group.len() > 1 {
            in_pair.extend(group.iter().cloned());
        }
        for other in group.iter().skip(1) {
            equivocations.push([group[0].clone(), other.clone()]);
        }
    }
    equivocations.sort();
    let mut skips: Vec<String> = mine.values().filter(|b| is_skip(b)).map(|b| hash_of(b).to_string()).collect();
    skips.sort();
    // A block is broken when its prev does not name the block before it: the block that brought the key in, at seq 1 (or a skip), or
    // a block of the key one seq lower (any lower, for a skip). Read from each block and its prev alone, never from the order given.
    let mut broken: Vec<String> = mine
        .values()
        .filter(|b| match rs(b, "prev") {
            Some(p) if p == brought_in => !(seq_of(b) == 1 || is_skip(b)),
            Some(p) => match mine.get(p) {
                Some(q) => !(if is_skip(b) { seq_of(b) > seq_of(q) } else { seq_of(b) == seq_of(q) + 1 }),
                None => true,
            },
            None => true,
        })
        .map(|b| hash_of(b).to_string())
        .collect();
    broken.sort();
    // A gap: a seq missing before a block that is not a skip.
    let mut gaps = Vec::new();
    let mut last_seq = 0i64;
    for (seq, here) in &by_seq {
        let explained = here.iter().all(|b| is_skip(b));
        if *seq > last_seq.saturating_add(1) && !explained {
            // A block may name any seq up to 2^53 - 1: listing every number missing before it would be a list that long (a hostile
            // block made the core ask for 72 PB; found by the fuzzer). The first gaps_max numbers are listed; `ok` is false either way.
            let room = gaps_max().saturating_sub(gaps.len() as i64).max(0);
            let end = (last_seq + 1).saturating_add(room).min(*seq);
            gaps.extend(last_seq + 1..end);
        }
        last_seq = *seq;
    }
    let top = by_seq.values().next_back();
    let head = top.filter(|t| t.len() == 1).map(|t| t[0].clone());
    // Blocks counted: those that are not a member of a pair. A later block of the key is counted (A fork is a burden).
    let length = by_seq.values().flatten().filter(|b| !in_pair.contains(hash_of(b))).count() as i64;
    let ok = gaps.is_empty() && equivocations.is_empty() && broken.is_empty();
    Chain {
        head,
        length,
        gaps,
        skips,
        equivocations,
        broken,
        ok,
    }
}
