//! A key's own chain (protocol.md §1). Every block but a genesis sits in its signing key's chain: `state.seq` its
//! number, `refs.prev` the key's previous block. A key's first block has seq 1 and its prev is the block that brought
//! the key in. Gaps show what is missing; two blocks with one seq prove a lie (invariant 3).
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

/// One key's chain, checked.
#[derive(Debug, Clone, PartialEq)]
pub struct Chain {
    pub head: Option<Value>,
    pub length: i64,
    /// The missing seq numbers.
    pub gaps: Vec<i64>,
    /// The sets of hashes sharing a seq.
    pub equivocations: Vec<Vec<String>>,
    /// The blocks whose prev is not the block before them.
    pub broken: Vec<String>,
    pub ok: bool,
}

/// Check one key's chain: blocks it signed (each with state.seq and refs.prev) and the block that brought it in.
pub fn check_chain(blocks: &[Value], brought_in: &str) -> Chain {
    let mut by_seq: alloc::collections::BTreeMap<i64, Vec<String>> = Default::default();
    for block in blocks {
        let Some(seq) = int(st(block, "seq")) else {
            continue;
        };
        if seq < 1.0 {
            continue;
        }
        let here = by_seq.entry(seq as i64).or_default();
        if !here.iter().any(|h| h == hash_of(block)) {
            here.push(hash_of(block).to_string());
        }
    }
    let block_of = crate::js::index_of(blocks);
    let length = by_seq.keys().max().copied().unwrap_or(0);
    let (mut gaps, mut equivocations, mut broken) = (Vec::new(), Vec::new(), Vec::new());
    for seq in 1..=length {
        let Some(here) = by_seq.get(&seq) else {
            gaps.push(seq);
            continue;
        };
        if here.len() > 1 {
            let mut set = here.clone();
            set.sort();
            equivocations.push(set);
        }
        let before: Option<Vec<String>> = if seq == 1 {
            Some(vec![brought_in.to_string()])
        } else {
            by_seq.get(&(seq - 1)).cloned()
        };
        if let Some(before) = before {
            if before.len() == 1 {
                for h in here {
                    if rs(&block_of[h.as_str()], "prev") != Some(before[0].as_str()) {
                        broken.push(h.clone());
                    }
                }
            }
        }
    }
    let head = by_seq
        .get(&length)
        .filter(|top| top.len() == 1)
        .map(|top| block_of[top[0].as_str()].clone());
    let ok = gaps.is_empty() && equivocations.is_empty() && broken.is_empty();
    Chain {
        head,
        length,
        gaps,
        equivocations,
        broken,
        ok,
    }
}
