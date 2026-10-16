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
    /// The blocks counted: those that are not part of an equivocation or after one.
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

/// The most missing seq numbers `check_chain` lists.
pub const GAPS_MAX: i64 = 10_000;

/// Check one key's chain: blocks it signed (each with state.seq and refs.prev) and the block that brought it in.
pub fn check_chain(blocks: &[Value], brought_in: &str) -> Chain {
    // Each seq with the blocks at it. A skip may jump forward; two blocks naming one prev are an equivocation.
    let mut by_seq: alloc::collections::BTreeMap<i64, Vec<&Value>> = Default::default();
    for block in blocks {
        let Some(seq) = int(st(block, "seq")) else { continue };
        if seq < 1.0 {
            continue;
        }
        let here = by_seq.entry(seq as i64).or_default();
        if !here.iter().any(|h| hash_of(h) == hash_of(block)) {
            here.push(block);
        }
    }
    let mut by_prev: alloc::collections::BTreeMap<String, Vec<String>> = Default::default();
    for here in by_seq.values() {
        for b in here {
            if let Some(p) = rs(b, "prev") {
                by_prev.entry(p.to_string()).or_default().push(hash_of(b).to_string());
            }
        }
    }
    let mut equivocations: Vec<[String; 2]> = Vec::new();
    for (_, mut group) in by_prev {
        group.sort();
        group.dedup();
        for i in 0..group.len() {
            for j in i + 1..group.len() {
                equivocations.push([group[i].clone(), group[j].clone()]);
            }
        }
    }
    equivocations.sort();
    let in_pair: Vec<&String> = equivocations.iter().flatten().collect();
    let is_skip = |b: &Value| st(b, "skip") == Some(&Value::Bool(true));
    let mut skips: Vec<String> = by_seq
        .values()
        .flatten()
        .filter(|b| is_skip(b))
        .map(|b| hash_of(b).to_string())
        .collect();
    skips.sort();
    let (mut gaps, mut broken) = (Vec::new(), Vec::new());
    // Walk the seqs in order: each block's prev is the block at the nearest lower seq (the one that brought the key
    // in, before the first); a gap is explained when the block after it is a skip.
    let mut before: Option<Vec<&Value>> = None;
    let mut last_seq = 0i64;
    for (seq, here) in &by_seq {
        let explained = here.iter().all(|b| is_skip(b));
        if *seq > last_seq.saturating_add(1) && !explained {
            // A block may name any seq up to 2^53 - 1: listing every number missing before it would be a list that long (a hostile
            // block made the core ask for 72 PB; found by the fuzzer). The first GAPS_MAX numbers are listed; `ok` is false either way.
            let room = GAPS_MAX.saturating_sub(gaps.len() as i64).max(0);
            let end = (last_seq + 1).saturating_add(room).min(*seq);
            gaps.extend(last_seq + 1..end);
        }
        for b in here {
            let want: Option<Vec<&str>> = match &before {
                None => Some(vec![brought_in]),
                Some(prev) if prev.len() == 1 => Some(vec![hash_of(prev[0])]),
                Some(_) => None,
            };
            if let Some(want) = want {
                if rs(b, "prev").is_none_or(|p| !want.contains(&p)) {
                    broken.push(hash_of(b).to_string());
                }
            }
        }
        before = Some(here.clone());
        last_seq = *seq;
    }
    let top = by_seq.values().next_back();
    let head = top.filter(|t| t.len() == 1).map(|t| t[0].clone());
    // Blocks counted: not a member of a pair, and not after one (a block naming a member, or a block after that).
    let mut uncounted: Vec<String> = in_pair.iter().map(|h| (*h).clone()).collect();
    loop {
        let more: Vec<String> = by_seq
            .values()
            .flatten()
            .filter(|b| !uncounted.iter().any(|u| u == hash_of(b)) && rs(b, "prev").is_some_and(|p| uncounted.iter().any(|u| u == p)))
            .map(|b| hash_of(b).to_string())
            .collect();
        if more.is_empty() {
            break;
        }
        uncounted.extend(more);
    }
    let length = by_seq.values().flatten().filter(|b| !uncounted.iter().any(|u| u == hash_of(b))).count() as i64;
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
