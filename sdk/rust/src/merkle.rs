//! The Merkle root of large content (modules/encoding.md, Large content): one convention, SHA-256.
//! A leaf is the hash of the byte `00` then the chunk; a node is the hash of the byte `01` then its left and right
//! hashes (32 bytes each); an odd one at the end of a level is carried up unchanged. A proof is the list of sibling
//! hashes from the leaf up, with nothing for a level where the node was carried.
use crate::block::{hex, unhex};
use crate::prelude::*;
use sha2::{Digest, Sha256};

fn leaf(chunk: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update([0u8]);
    h.update(chunk);
    h.finalize().into()
}

fn node(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update([1u8]);
    h.update(left);
    h.update(right);
    h.finalize().into()
}

fn up(level: &[[u8; 32]]) -> Vec<[u8; 32]> {
    level
        .chunks(2)
        .map(|pair| if pair.len() == 2 { node(&pair[0], &pair[1]) } else { pair[0] })
        .collect()
}

/// The root over chunks, hex. None when there are no chunks.
pub fn root(chunks: &[Vec<u8>]) -> Option<String> {
    if chunks.is_empty() {
        return None;
    }
    let mut level: Vec<[u8; 32]> = chunks.iter().map(|c| leaf(c)).collect();
    while level.len() > 1 {
        level = up(&level);
    }
    Some(hex(&level[0]))
}

/// The sibling hashes (hex) that prove one chunk, bottom first. None when there is no such chunk.
pub fn proof(chunks: &[Vec<u8>], index: usize) -> Option<Vec<String>> {
    if index >= chunks.len() {
        return None;
    }
    let mut level: Vec<[u8; 32]> = chunks.iter().map(|c| leaf(c)).collect();
    let (mut at, mut out) = (index, Vec::new());
    while level.len() > 1 {
        if at % 2 == 1 {
            out.push(hex(&level[at - 1]));
        } else if at + 1 < level.len() {
            out.push(hex(&level[at + 1]));
        }
        level = up(&level);
        at /= 2;
    }
    Some(out)
}

/// Whether `proof` shows that `chunk` is chunk number `index` of `count` chunks under `root`.
pub fn verify(root_hex: &str, chunk: &[u8], index: usize, count: usize, proof: &[String]) -> bool {
    if count == 0 || index >= count {
        return false;
    }
    let sibling = |s: &String| -> Option<[u8; 32]> {
        if s.len() != 64 || s.bytes().any(|b| b.is_ascii_uppercase()) {
            return None;
        }
        unhex(s)?.try_into().ok()
    };
    let (mut h, mut at, mut width, mut used) = (leaf(chunk), index, count, 0usize);
    while width > 1 {
        if at % 2 == 1 || at + 1 < width {
            let Some(Some(s)) = proof.get(used).map(sibling) else { return false };
            used += 1;
            h = if at % 2 == 1 { node(&s, &h) } else { node(&h, &s) };
        }
        at /= 2;
        width = width.div_ceil(2);
    }
    used == proof.len() && hex(&h) == root_hex
}

/// The check a reader makes of a block that names a Merkle root: the block's `state.marks` holds exactly one mark
/// `{ scheme: "merkle", value: <root> }` and its `state.chunks` is the signed count (an integer, at least 1). `proof` shows that `chunk`
/// is chunk number `index` of that many chunks under that root. The count is never an argument: the one who offers the chunk cannot choose it.
pub fn verify_block(block: &Value, chunk: &[u8], index: usize, proof: &[String]) -> bool {
    let Some(state) = block.get("state") else { return false };
    let roots: Vec<&Value> = state
        .get("marks")
        .and_then(Value::as_array)
        .map(|m| m.iter().filter(|x| x.get("scheme").and_then(Value::as_str) == Some("merkle")).collect())
        .unwrap_or_default();
    let (Some(root), Some(count)) = (
        roots.first().filter(|_| roots.len() == 1).and_then(|m| m.get("value")).and_then(Value::as_str),
        state.get("chunks").and_then(Value::as_u64).filter(|n| *n >= 1),
    ) else {
        return false;
    };
    verify(root, chunk, index, count as usize, proof)
}
