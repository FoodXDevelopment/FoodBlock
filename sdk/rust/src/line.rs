//! A named clock read along its lines (blocks.md, A named clock). Each name in `clocks` is a block id naming a **line**: that block's
//! key's blocks after it (a person's id names her genesis key's line). A clock's line is read by its key and its `seq` alone: which came
//! first is the line's order, never a date. A **receipt** is an `observe` of kind `receipt` on the line, `refs.derives_from` the blocks it
//! names; a **cutoff** is an `observe` of kind `cutoff` on the line, `state.when` an instant, `refs.subject` the word. The readings here are
//! the ones a wait, a reach and the cut read: whether a wait has run, whether an end came first on a line, whether a block was received
//! before any end. The time-only readings ("by T") that conditions and deals read are fold/clock.rs's.
use crate::identity::key_of;
use crate::js::{hash_of, int, list, rf, rs, ss, st, type_of, Index};
use crate::prelude::*;
use crate::tasks::Clocks;

fn seq_of(b: &Value) -> i64 {
    int(st(b, "seq")).unwrap_or(0.0) as i64
}

/// A clock's line (blocks.md, A named clock): the line a name names, read as it goes on. A person's id names her line: every block
/// of hers whose key spoke for her there (a receipt counts only where its key spoke for that clock's owner at that block), whatever key
/// her list moved on to. A key grant that brings in one key (a key under a voice) names that key's blocks. Any other block names its
/// author's blocks that have it in their causal past.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Line {
    pub author: String,
    /// Some: only this key's blocks (a key under a voice).
    pub key: Option<String>,
    /// Some: only blocks that have this block in their causal past.
    pub from: Option<String>,
}

/// The line a clock's name names.
pub(crate) fn line_named(name: &str, blocks: &Index) -> Option<Line> {
    let b = blocks.get(name)?;
    if crate::identity::is_genesis(b) {
        return Some(Line { author: name.to_string(), key: None, from: None });
    }
    if type_of(b) == "grant" && ss(b, "kind") == Some("key") && st(b, "voices").is_none() {
        if let (Some(k), Some(subject)) = (ss(b, "public_key_sign"), rs(b, "subject")) {
            return Some(Line { author: subject.to_string(), key: Some(k.to_string()), from: None });
        }
    }
    Some(Line { author: rs(b, "author")?.to_string(), key: None, from: Some(name.to_string()) })
}

/// Whether a block is on a clock's line: by the line's owner, its key speaking for her there (the line is read as it goes on, so
/// a clock that replaced its key keeps its line).
pub(crate) fn on_line(b: &Value, line: &Line, blocks: &Index) -> bool {
    if rs(b, "author") != Some(line.author.as_str()) || b.get("type").is_none() {
        return false;
    }
    if let Some(k) = &line.key {
        if !key_of(b, blocks).is_some_and(|s| &s.key == k) {
            return false;
        }
    }
    if let Some(f) = &line.from {
        if !blocks.past_of(b).contains(f.as_str()) {
            return false;
        }
    }
    crate::identity::signed_by_author_in(b, blocks)
}

pub(crate) fn observes_on<'a>(kind: &'a str, line: &'a Line, blocks: &'a Index, vis: &'a dyn Fn(&str) -> bool) -> impl Iterator<Item = &'a Value> + 'a {
    blocks.values().filter(move |o| type_of(o) == "observe" && ss(o, "kind") == Some(kind) && vis(hash_of(o)) && on_line(o, line, blocks))
}

/// Every receipt of a block on a line.
pub(crate) fn receipts_of<'a>(target: &str, line: &Line, blocks: &'a Index, vis: &dyn Fn(&str) -> bool) -> Vec<&'a Value> {
    blocks.names_memo()
        .by_derives
        .get(target)
        .into_iter()
        .flatten()
        .filter_map(|h| blocks.get(h))
        .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("receipt") && vis(hash_of(o)) && list(rf(o, "derives_from")).contains(&target) && on_line(o, line, blocks))
        .collect()
}

/// One receipt is before another on a line where the other has it in its causal past: a place, never a date. A receipt is
/// not before itself.
pub(crate) fn before(a: &Value, b: &Value, blocks: &Index) -> bool {
    hash_of(a) != hash_of(b) && blocks.past_of(b).contains(hash_of(a))
}

/// Whether a cutoff closes nothing by its own date: its own `at` is before its `when`, where `when` is an instant. A span's
/// cutoff is read by its place alone.
/// A cutoff that states no `at` is not shown early (no date of its own shows it); a span (`when` a duration) has no date
/// to compare, so it is never early.
pub(crate) fn early(cutoff: &Value) -> bool {
    match (ss(cutoff, "at").and_then(crate::time::parse), st(cutoff, "when").and_then(Value::as_str).and_then(crate::time::parse)) {
        (Some(at), Some(when)) => at < when,
        _ => false,
    }
}

/// What a wait reads on a clock: run, still pending, or set aside for good by a block that came first.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Run {
    Ran,
    Pending,
    Blocked,
}

/// Whether a wait has run on a clock (blocks.md, A named clock): a line has run it where it holds a receipt of `start` and,
/// after it, a counted cutoff whose subject is `start`, which runs from that receipt (`refs.derives_from` the receipt, or an earlier such
/// cutoff), its `when` the span (a duration at least the wait). No date is read and no span is added to a date. A line that holds, before
/// that cutoff, a receipt of a block `stops` names shows the wait set aside. A wait run widens what a word allows, so `needed` lines must
/// show it; set aside takes `names` less `needed`, plus one (Which reading needs `needed`). Read among the blocks `vis` lets in.
/// A span cutoff's `when` is a duration; it closes a wait whose span is no longer than it (durations compared, never
/// added to a date). A cutoff is not shown false by a later receipt's date.
pub(crate) fn wait_run(start: &Value, wait: &str, clocks: &Clocks, blocks: &Index, vis: &dyn Fn(&str) -> bool, stops: &dyn Fn(&Value) -> bool) -> Run {
    // a span of zero has run when signed (`PT0S` for none)
    if crate::time::parse_duration(wait).is_some_and(|d| d.years == 0 && d.months == 0 && d.days == 0 && d.ms == 0) {
        return Run::Ran;
    }
    let s = hash_of(start);
    let (mut run, mut blocked) = (0, 0);
    let long_enough = |w: &str| crate::time::compare_durations(w, wait, "2000-01-01T00:00:00.000Z").is_some_and(|c| c >= 0);
    for name in &clocks.names {
        let Some(line) = line_named(name, blocks) else { continue };
        let rs_ = receipts_of(s, &line, blocks, vis);
        if rs_.is_empty() {
            continue;
        }
        // a cutoff that runs from a receipt of `start`, directly or through earlier cutoffs of the same word
        let cutoffs: Vec<&Value> = observes_on("cutoff", &line, blocks, vis).filter(|c| rs(c, "subject") == Some(s)).collect();
        let runs_from = |c: &Value| -> bool {
            let mut todo: Vec<&Value> = vec![c];
            let mut seen: alloc::collections::BTreeSet<String> = Default::default();
            while let Some(x) = todo.pop() {
                if !seen.insert(hash_of(x).to_string()) {
                    continue;
                }
                for d in list(rf(x, "derives_from")) {
                    if rs_.iter().any(|r| hash_of(r) == d) {
                        return true;
                    }
                    if let Some(e) = cutoffs.iter().find(|e| hash_of(e) == d) {
                        todo.push(e);
                    }
                }
            }
            false
        };
        let closing: Vec<&Value> = cutoffs
            .iter()
            .copied()
            .filter(|c| st(c, "when").and_then(Value::as_str).is_some_and(long_enough) && rs_.iter().any(|r| before(r, c, blocks)) && runs_from(c) && !early(c))
            .collect();
        // the first closing cutoff on the line: none of the others before it
        let Some(c) = closing.iter().copied().find(|c| !closing.iter().any(|o| before(o, c, blocks))) else { continue };
        let stopped = observes_on("receipt", &line, blocks, vis).any(|o| before(o, c, blocks) && list(rf(o, "derives_from")).iter().any(|d| blocks.get(*d).is_some_and(|b| vis(d) && stops(b))));
        if stopped {
            blocked += 1;
        } else {
            run += 1;
        }
    }
    if blocked >= (clocks.names.len() + 1).saturating_sub(clocks.needed) {
        Run::Blocked
    } else if run >= clocks.needed {
        Run::Ran
    } else {
        Run::Pending
    }
}

/// What one line shows of a block and an end: Some(true) where a receipt of the end is before every receipt of the block (one
/// receipt that names both shows neither: a later receipt of the block on that line is after the end); Some(false) where a receipt of the
/// block has no receipt of an end at or before it; None where the line shows neither.
fn end_on_line(block: &str, ends: &[&str], line: &Line, blocks: &Index, vis: &dyn Fn(&str) -> bool) -> Option<bool> {
    let rb = receipts_of(block, line, blocks, vis);
    if rb.is_empty() {
        return None;
    }
    let re: Vec<&Value> = ends.iter().flat_map(|e| receipts_of(e, line, blocks, vis)).collect();
    let at_or_before = |r: &Value| re.iter().any(|e| hash_of(e) == hash_of(r) || before(e, r, blocks));
    if rb.iter().any(|r| !at_or_before(r)) {
        return Some(false);
    }
    if rb.iter().any(|r| re.iter().any(|e| before(e, r, blocks))) {
        return Some(true);
    }
    None
}

/// Whether an end came first for a block on a clock (blocks.md, The cut, Seen): the reading that keeps a thing in its
/// signer's hand, so `names` less `needed`, plus one, lines must show the end before the block.
pub(crate) fn end_first(block: &str, end: &str, clocks: &Clocks, blocks: &Index, vis: &dyn Fn(&str) -> bool) -> bool {
    let n = clocks.names.iter().filter_map(|n| line_named(n, blocks)).filter(|line| end_on_line(block, &[end], line, blocks, vis) == Some(true)).count();
    n >= (clocks.names.len() + 1).saturating_sub(clocks.needed)
}

/// Whether `needed` lines received a block before any of them received an end (blocks.md, The cut): each holds a receipt of the block with
/// no receipt of an end at or before it.
pub(crate) fn received_first(block: &str, ends: &[&str], clocks: &Clocks, blocks: &Index, vis: &dyn Fn(&str) -> bool) -> bool {
    clocks.names.iter().filter_map(|n| line_named(n, blocks)).filter(|line| end_on_line(block, ends, line, blocks, vis) == Some(false)).count() >= clocks.needed
}

/// What one line shows of a time a word states: its first counted cutoff whose `when` is that time's own text (one that
/// is early by its own date closes nothing), with `subject` the word where one is named; and each block's place against it. A receipt
/// before the cutoff came before the time; after it, after.
#[cfg(feature = "folds")]
pub(crate) fn cutoff_on<'a>(t: &str, subject: Option<&str>, line: &'a Line, blocks: &'a Index, vis: &'a dyn Fn(&str) -> bool) -> Option<&'a Value> {
    let cs: Vec<&Value> = observes_on("cutoff", line, blocks, vis)
        .filter(|c| ss(c, "when") == Some(t) && subject.is_none_or(|s| rs(c, "subject") == Some(s)) && !early(c))
        .collect();
    cs.iter().copied().find(|c| !cs.iter().any(|o| before(o, c, blocks)))
}

/// Whether a line shows a block before the time `t` (Some(true): a receipt of it, or the block itself on the line, with no cutoff of `t`
/// at or before it), after it (Some(false): a cutoff of `t` with no such receipt before it), or neither yet (None).
/// A receipt with no cutoff of `t` before it is before the time on that line: a cutoff of `t` can only come later on it.
#[cfg(feature = "folds")]
pub(crate) fn before_time(block: &str, t: &str, subject: Option<&str>, line: &Line, blocks: &Index, vis: &dyn Fn(&str) -> bool) -> Option<bool> {
    let cut = cutoff_on(t, subject, line, blocks, vis);
    let mut rx = receipts_of(block, line, blocks, vis);
    if let Some(b) = blocks.get(block).filter(|b| vis(block) && on_line(b, line, blocks)) {
        rx.push(b);
    }
    let early_enough = |r: &Value| cut.is_none_or(|c| before(r, c, blocks));
    if rx.iter().any(|r| early_enough(r)) {
        return Some(true);
    }
    cut.map(|_| false)
}

// ---- Read whole (folds.md, A chain) ----
/// The answer of `read_whole`: whether the line is read whole from a block back to a start, and each block it would need (`lacks`): its id
/// where a given block's `prev` names it, else `{ author, key, seq }` (`key` the id of the key grant that brought the key in, null for the
/// genesis key).
#[derive(Debug, Clone, PartialEq)]
pub struct Whole {
    pub whole: bool,
    pub lacks: Vec<Value>,
}

impl Whole {
    pub fn to_json(&self) -> Value {
        json!({ "whole": self.whole, "lacks": self.lacks })
    }
}

/// `read_whole(block, start, blocks)` (folds.md, A chain): the reader holds the line read whole from `block` back to `start` when it holds every
/// block reached from `block` by `prev` until `start`, the two ends included, each valid and read; a block given only as its header, or not
/// read, is needed by its id. A block not valid is not given. The line goes on past its key's replacement: at the key grant that brought in
/// the key of the block before it, the walk goes on from the block that key grant names in `state.counted_to`, else from the key grant
/// itself (the old key signed it). Past a block not given, the walk goes on from the highest given block of the same key below it, listing
/// each `seq` between as `{ author, key, seq }` (none when the block naming the missing one states `skip`). A start the walk never reaches,
/// with nothing lacking on the way, is not on the block's line: an error.
pub fn read_whole(block: &str, start: &str, blocks: &Index) -> core::result::Result<Whole, String> {
    let (reached, _, lacks) = walk(block, Some(start), blocks)?;
    if !reached && lacks.is_empty() {
        return Err("the start is not on the block's line".into());
    }
    Ok(Whole { whole: reached && lacks.is_empty(), lacks })
}

/// The walk of `read_whole`, back to `start`, or with none to where the line begins: (whether it reached the start, whether it ended at
/// the line's beginning, what it lacks in the order met).
pub(crate) fn walk(block: &str, start: Option<&str>, blocks: &Index) -> core::result::Result<(bool, bool, Vec<Value>), String> {
    let judge = crate::valid::Judge::new(blocks, None);
    let have = |h: &str| blocks.get(h).filter(|_| judge.valid_given(h).is_some_and(|v| v.is_empty()));
    let mut lacks: Vec<Value> = Vec::new();
    let mut seen: alloc::collections::BTreeSet<String> = Default::default();
    let by_line: core::cell::OnceCell<alloc::collections::BTreeMap<(String, Option<String>), Vec<(i64, usize)>>> = Default::default();
    let Some(mut cur) = have(block) else {
        return Ok((false, false, vec![json!(block)]));
    };
    loop {
        let h = hash_of(cur).to_string();
        if !seen.insert(h.clone()) {
            return Err("the line runs in a ring".into());
        }
        if !judge.reads_given(&h) {
            lacks.push(json!(h));
        }
        if Some(h.as_str()) == start {
            return Ok((true, false, lacks));
        }
        let Some(prev) = rs(cur, "prev") else {
            return Ok((false, true, lacks));
        };
        // at the key grant that brought in this block's key, the line of the key it replaced goes on from its `counted_to`
        let crossing = rs(cur, "key") == Some(prev);
        let next = match have(prev) {
            Some(k) if crossing => ss(k, "counted_to").unwrap_or(prev),
            _ => prev,
        };
        if let Some(n) = have(next) {
            // a `prev` that names a block of another person (not her genesis, not a key grant about her) leaves her key's line: the
            // walk ends there; a header given under that id naming another author is no block of her line, so her block there is lacking
            //
            let me = rs(cur, "author");
            if let (Some(a), Some(other)) = (me, rs(n, "author")) {
                if other != a && hash_of(n) != a && !(type_of(n) == "grant" && rs(n, "subject") == Some(a)) {
                    // (a header proves nothing of the block its id names; a body given and not read shows its author by its own bytes)
                    if n.get("type").is_none() {
                        lacks.push(json!(next));
                        return Ok((false, false, lacks));
                    }
                    return Ok((false, true, lacks));
                }
            }
            cur = n;
            continue;
        }
        // a hole: the block `prev` names is not given
        lacks.push(json!(next));
        if Some(next) == start {
            return Ok((true, false, lacks));
        }
        let (author, key, seq) = (rs(cur, "author").unwrap_or(""), rs(cur, "key"), seq_of(cur));
        // the given valid blocks of each (author, key), sorted by (seq, place given), built once per walk; the highest
        // below is found by search, never by a pass over every block given per hole (the last of equal seqs, as max_by_key gave)
        let lines = by_line.get_or_init(|| {
            let mut m: alloc::collections::BTreeMap<(String, Option<String>), Vec<(i64, usize)>> = Default::default();
            for (i, (k, b)) in blocks.iter().enumerate() {
                if have(k).is_some() && seq_of(b) >= 1 {
                    m.entry((rs(b, "author").unwrap_or("").to_string(), rs(b, "key").map(String::from))).or_default().push((seq_of(b), i));
                }
            }
            for v in m.values_mut() {
                v.sort();
            }
            m
        });
        let bound = seq.saturating_sub(1);
        let below = lines.get(&(author.to_string(), key.map(String::from))).and_then(|v| {
            let n = v.partition_point(|(s, _)| *s < bound);
            if n == 0 { None } else { blocks.get_index(v[n - 1].1).map(|(_, b)| b) }
        });
        let skip = st(cur, "skip") == Some(&Value::Bool(true));
        let start_seq = start.and_then(|s| have(s)).filter(|s| rs(s, "author") == Some(author) && rs(s, "key") == key).map(seq_of);
        let floor = below.map(seq_of).or(start_seq).unwrap_or(0);
        if !skip {
            for n in (floor + 1..seq.saturating_sub(1)).rev().take(crate::chain::gaps_max() as usize) {
                lacks.push(json!({ "author": author, "key": key, "seq": n }));
            }
        }
        match below {
            Some(b) => cur = b,
            None => return Ok((false, false, lacks)),
        }
    }
}
