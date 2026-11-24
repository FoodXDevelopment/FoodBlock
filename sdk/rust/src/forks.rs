//! Forks (core.md, invariant 3; folds.md, A fork is a burden): a key's two words at one place, and what counts in a fold.
use crate::js::{hash_of, int, rs, ss, st, Index};
use crate::prelude::*;
use crate::identity::*;

// Each block of a known author, read once: (hash, author, the key that signed it, whether it speaks for its author). A block given by its
// header alone is read too: a pair needs no body, its two headers are the whole proof. An author whose genesis is not given is unknown:
// none of their blocks is read here, so nothing of theirs is void or forked.
pub(crate) fn read_authors(index: &Index) -> Vec<(String, String, Option<String>, bool)> {
    let mut out = Vec::new();
    for b in index.values() {
        let Some(a) = rs(b, "author").filter(|a| !a.is_empty() && st(b, "seq").is_some()) else { continue };
        if !genesis_opens(index.get(a)) {
            continue;
        }
        let speaks = b.get("type").is_none() || signed_by_author_in(b, index);
        out.push((hash_of(b).to_string(), a.to_string(), key_of(b, index).map(|s| s.key), speaks));
    }
    out
}

/// The groups of blocks already read that prove a lie (core.md, invariant 3): blocks that speak, of one author and one key, that name one
/// `prev` or state one `seq`, two or more to a group, each group ascending. A block may be in two groups.
pub(crate) fn groups_of(read: &[(String, String, Option<String>, bool)], index: &Index) -> Vec<Vec<String>> {
    let mut groups: alloc::collections::BTreeMap<(&str, &str, String), Vec<String>> = Default::default();
    for (h, author, key, speaks) in read {
        let (Some(key), true) = (key, *speaks) else { continue };
        let Some(b) = index.get(h) else { continue };
        if let Some(p) = rs(b, "prev") {
            groups.entry((author.as_str(), key.as_str(), format!("prev {p}"))).or_default().push(h.clone());
        }
        if let Some(n) = int(st(b, "seq")) {
            groups.entry((author.as_str(), key.as_str(), format!("seq {n}"))).or_default().push(h.clone());
        }
    }
    groups
        .into_values()
        .filter_map(|mut g| {
            g.sort();
            g.dedup();
            (g.len() > 1).then_some(g)
        })
        .collect()
}

/// The groups of a pair among the blocks given (`groups_of`): each group of two or more blocks of one key on one `prev` or at one `seq`.
pub fn pair_groups_in(index: &Index) -> Vec<Vec<String>> {
    // read once per state of the blocks (a fold asks it once per measure)
    let v = index.stage_memo("identity:pair_groups", || json!(groups_of(&read_on_line(index), index)));
    v.as_array().into_iter().flatten().map(|g| g.as_array().into_iter().flatten().filter_map(Value::as_str).map(String::from).collect()).collect()
}

// The blocks read (`read_authors`) that are on a line of their key: a block on no line is no block of a pair.
pub(crate) fn read_on_line(index: &Index) -> Vec<(String, String, Option<String>, bool)> {
    read_authors(index).into_iter().filter(|(h, ..)| !index.get(h).is_some_and(|b| off_line_in(b, index))).collect()
}

/// The pairs that prove the lie of each group, as a star (nodes.md): every block of it paired with the group's lowest hash. Each pair
/// sorted, the list sorted.
pub(crate) fn pairs_of(read: &[(String, String, Option<String>, bool)], index: &Index) -> Vec<[String; 2]> {
    let mut pairs: alloc::collections::BTreeSet<[String; 2]> = Default::default();
    for group in groups_of(read, index) {
        for other in group.iter().skip(1) {
            pairs.insert([group[0].clone(), other.clone()]);
        }
    }
    pairs.into_iter().collect()
}

/// The pairs of blocks, among these, that one key of one author signed naming one `prev` or stating one `seq`, both speaking for their
/// author: each pair sorted, and the list sorted. Read from bodies or headers.
pub fn fork_pairs_in(index: &Index) -> Vec<[String; 2]> {
    pairs_of(&read_on_line(index), index)
}

/// Mark in memory every block a fold does not count for its signer's claim: `_void` when its key does not speak for its author, `_fork`
/// for the pair members and every block of the same key whose `seq` is at or above the lower `seq` of a pair (folds.md, A fork is a
/// burden): a burden, never a claim (`binds_signer`). Blocks of another key of the same author are not touched.
pub fn mark_forks(index: &mut Index) {
    let read = read_authors(index);
    // Every block is marked, `true` or `false`: a block that says `false` has been looked at, so `counts_in` never has to read the
    // authors again for each block it is asked about.
    for b in index.values_mut() {
        if b.is_object() {
            b["_fork"] = json!(false);
            b["_void"] = json!(false);
            b["_out"] = json!(false);
            b["_off"] = json!(false);
        }
    }
    for (h, _, _, speaks) in &read {
        if !speaks {
            if let Some(b) = index.get_mut(h) {
                b["_void"] = json!(true);
            }
        }
    }
    // In its place: a block is in its place on its key's line where its `prev` names a block of that key and its `seq` is above
    // that block's, or, for a key's first block, where its `prev` names the first block that brought that key in and its `seq` is 1. A
    // block whose `prev` the reader does not hold is not shown, never out of place. A block whose `prev` is given and names neither a block
    // of its key nor the first block that brought its key in is on no line of that key (`_off`: a draw it signs is `not_on_chain`, and it is
    // no block of a pair). Of several blocks that bring one key in, the first is the one the others have in their causal past; where none is
    // (two apart), none starts the line. A block out of its place, or on no line, takes nothing and binds its signer as a block of a fork
    // does (`_out`, `_off`, read by `counts_in` and `fork_burden`).
    let key_at: alloc::collections::BTreeMap<&str, (&str, Option<&str>)> = read.iter().map(|(h, a, k, _)| (h.as_str(), (a.as_str(), k.as_deref()))).collect();
    let mut bringers: alloc::collections::BTreeMap<(String, String), Option<String>> = Default::default();
    let mut first_bringer = |author: &str, key: &str, index: &Index| -> Option<String> {
        bringers
            .entry((author.to_string(), key.to_string()))
            .or_insert_with(|| {
                let bs: Vec<&Value> = index
                    .values()
                    .filter(|x| x.get("type").is_some() && (hash_of(x) == author || key_grant_of(x, author)) && brings_in(x, author, index).iter().any(|(k, _)| k == key))
                    .collect();
                let mins: Vec<&&Value> = bs.iter().filter(|x| !bs.iter().any(|y| hash_of(y) != hash_of(x) && index.past_of(x).contains(hash_of(y)))).collect();
                match mins.as_slice() {
                    [one] => Some(hash_of(one).to_string()),
                    _ => None,
                }
            })
            .clone()
    };
    let (mut out_of_place, mut off): (Vec<String>, Vec<String>) = (Vec::new(), Vec::new());
    for (h, a, k, _) in &read {
        let Some(b) = index.get(h) else { continue };
        let (Some(p), Some(seq)) = (rs(b, "prev"), int(st(b, "seq"))) else { continue };
        let Some(q) = index.get(p) else { continue };
        let same_key = p != a.as_str() && key_at.get(p).is_some_and(|(pa, pk)| *pa == a.as_str() && pk.is_some() && *pk == k.as_deref());
        if same_key {
            if !int(st(q, "seq")).is_some_and(|ps| seq > ps) {
                out_of_place.push(h.clone());
            }
            continue;
        }
        match k.as_deref().and_then(|k| first_bringer(a, k, index)) {
            Some(f) if f == p => {
                if seq != 1.0 {
                    out_of_place.push(h.clone());
                }
            }
            _ => off.push(h.clone()),
        }
    }
    for h in out_of_place {
        if let Some(b) = index.get_mut(&h) {
            b["_out"] = json!(true);
        }
    }
    for h in &off {
        if let Some(b) = index.get_mut(h) {
            b["_off"] = json!(true);
        }
    }
    // a block on no line of its key is no block of a pair
    let read_on: Vec<(String, String, Option<String>, bool)> = read.iter().filter(|(h, ..)| !off.contains(h)).cloned().collect();
    let pairs = pairs_of(&read_on, index);
    if pairs.is_empty() {
        return;
    }
    let seq_of = |h: &str| index.get(h).and_then(|b| int(st(b, "seq")));
    let line_of: alloc::collections::BTreeMap<&str, (&str, &str)> =
        read.iter().filter_map(|(h, a, k, _)| k.as_deref().map(|k| (h.as_str(), (a.as_str(), k)))).collect();
    // the lowest seq of a pair on each line: from there on, every block of that key is a fork's
    let mut from: alloc::collections::BTreeMap<(&str, &str), f64> = Default::default();
    for [a, b] in &pairs {
        let (Some(line), Some(sa), Some(sb)) = (line_of.get(a.as_str()), seq_of(a), seq_of(b)) else { continue };
        let low = sa.min(sb);
        from.entry(*line).and_modify(|x| *x = x.min(low)).or_insert(low);
    }
    let marked: Vec<String> = read
        .iter()
        .filter(|(h, a, k, _)| k.as_deref().is_some_and(|k| from.get(&(a.as_str(), k)).is_some_and(|low| seq_of(h).is_some_and(|s| s >= *low))))
        .map(|(h, ..)| h.clone())
        .collect();
    for h in marked {
        if let Some(b) = index.get_mut(&h) {
            b["_fork"] = json!(true);
        }
    }
}

// The marks of a block, read from the index once it is marked (else from a marked copy).
pub(crate) fn mark_of(block: &Value, index: &Index, mark: &str) -> bool {
    if let Some(m) = block.get(mark) {
        return m == &Value::Bool(true);
    }
    if let Some(blocks) = index.get(hash_of(block)) {
        if let Some(m) = blocks.get(mark) {
            return m == &Value::Bool(true);
        }
        // given but unmarked: mark a copy of the whole index once (kept beside it), not once per block asked about
        let marks = index.marks_memo(|| {
            let mut copy = index.clone();
            mark_forks(&mut copy);
            let on = |b: &Value, m: &str| b.get(m) == Some(&Value::Bool(true));
            copy.iter().map(|(h, b)| (h.clone(), (on(b, "_fork"), on(b, "_void"), on(b, "_out"), on(b, "_off")))).collect()
        });
        return marks.get(hash_of(block)).is_some_and(|&(fork, void, out, off)| match mark {
            "_fork" => fork,
            "_out" => out,
            "_off" => off,
            _ => void,
        });
    }
    let mut copy = index.clone();
    copy.entry(hash_of(block).to_string()).or_insert_with(|| block.clone());
    mark_forks(&mut copy);
    copy.get(hash_of(block)).is_some_and(|b| b.get(mark) == Some(&Value::Bool(true)))
}

/// Whether a block is one of a pair of one key that name one `prev`, or a later block of that key: proof of a lie, a burden on its
/// signer and never her claim in every fold but the identity fold (folds.md, A fork is a burden).
pub fn forked_in(block: &Value, index: &Index) -> bool {
    mark_of(block, index, "_fork")
}

/// Whether a block is out of its place on its key's line (folds.md, A chain): it takes nothing, and binds its signer as a block of
/// a fork does.
pub fn out_of_place_in(block: &Value, index: &Index) -> bool {
    mark_of(block, index, "_out")
}

/// Whether a block is on no line of its key its `prev` is given and names neither a block of its key nor the first block that
/// brought its key in. A draw it signs takes nothing (`not_on_chain`); it binds its signer as a block of a fork does.
pub fn off_line_in(block: &Value, index: &Index) -> bool {
    mark_of(block, index, "_off")
}

/// Whether a block's key does not speak for its author (invariant 8).
pub fn void_in(block: &Value, index: &Index) -> bool {
    mark_of(block, index, "_void")
}

pub fn forked(block: &Value, blocks: &[Value]) -> bool {
    forked_in(block, &crate::js::blocks_index(blocks))
}

/// Whether a block counts in a fold other than the identity fold: a genesis, or a block whose key speaks for its author (not void)
/// and has not signed two blocks naming one `prev` at or before it. Folds mark the blocks once (`mark_forks`) so this is a lookup.
pub fn counts_in(block: &Value, index: &Index) -> bool {
    if is_genesis(block) {
        return true;
    }
    if st(block, "seq").is_none() {
        return false;
    }
    !void_in(block, index) && !forked_in(block, index) && !out_of_place_in(block, index) && !off_line_in(block, index)
}

/// fork-as-burden (folds.md, A fork is a burden): a block of a forked key (and not of a void one) counts for its signer's claim never, but
/// counts as what its signer owes, and as the base of another's acceptance.
pub fn fork_burden(block: &Value, index: &Index) -> bool {
    !counts_in(block, index) && st(block, "seq").is_some() && (forked_in(block, index) || out_of_place_in(block, index) || off_line_in(block, index)) && !void_in(block, index)
}

/// Whether a block binds its signer: it counts, or it is a fork's block that is not a stop or a decline (those would free her by her own
/// word). The one rule folds read for what a signer owes, or what another built on (folds.md, A fork is a burden).
pub fn binds_signer(block: &Value, index: &Index) -> bool {
    counts_in(block, index) || (fork_burden(block, index) && !matches!(ss(block, "status"), Some("stopped" | "declined")))
}


