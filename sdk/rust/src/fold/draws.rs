//! What is left (folds.md, What is left): the one rule that counts every measure that is drawn on. A measure is an amount its owner
//! stated; what each owner owns of it is drawn on along one line. A draw holds its amount from where it is signed, lands on the receiver's
//! yes, is freed by her no or an end she has seen, and takes only when it fits: it is never cut down to what is left. Ownership of an
//! instance, a pot's payouts, an open offer's allocations and a claim handed on are each a reading of this one function: each says only
//! what states its measure, who owns it first, what draws on it, and what a draw that does not take means there.
//!
//! Each owner's draws are read once, along her line, against a running amount: the draws of one line are kept as one running sum, so
//! no draw is compared with every other. The draws are visited in the record's causal order only as a schedule (every answer is read
//! from the draw's own causal past and its own line, so any order that puts causes first gives the same answers); no answer is ordered by
//! hash, by the size of a causal past, or by arrival.
use crate::decimal::{Amount, Dec, Kind};
use crate::js::{hash_of, list, rf, rs, ss, st, type_of, Index};
use crate::prelude::*;
use alloc::collections::{BTreeMap, BTreeSet};

/// What an owner came to own of a measure, and where: her start (folds.md, What is left, Her start).
#[derive(Clone, Debug)]
pub(super) struct Start {
    pub owner: String,
    /// How much: None where it is not said (one whole; an output of unlike inputs).
    pub amount: Option<Dec>,
    /// The block that starts her line for it; None when it is on no line (two accepts apart: One start).
    pub at: Option<String>,
    /// The block a draw must have in its causal past to count it at all (her start, or the draw that landed it).
    pub seen: String,
}

/// Whom a draw names.
#[derive(Clone, Debug, PartialEq)]
pub(super) enum To {
    /// No receiver: a make, a payout's own leaving (it lands where it stands).
    Nobody,
    /// A let-go to an open receiver.
    Open,
    Owner(String),
}

/// A draw as its reader found it: a counted block that speaks for an owner, names the measure, and takes an amount of it.
pub(super) struct Draw<'a> {
    pub block: &'a Value,
    /// Whom it speaks for.
    pub by: Option<String>,
    pub to: To,
    /// What it states; None: all she owns of it.
    pub amount: Option<Amount>,
    /// The receiver's yes: her binding accept of the deal the draw is `for`, in the draw's own past, or her `accepted` answer to it.
    pub yes: Vec<&'a Value>,
    /// The receiver's own counted no (`declined`, `stopped`).
    pub no: Vec<&'a Value>,
    /// Ends of the draw: its signer's stop of it.
    pub ends: Vec<&'a Value>,
    /// Whether its condition has held: None when it carries none.
    pub condition: Option<bool>,
    /// 1.9 3c-5: its condition can no longer hold: the blocks that show it (empty: it never could, from its signing).
    pub dead: Option<Vec<String>>,
    /// A reason its reader already found that it is no draw of this measure (a pot's `not_confirmed`, `not_holder`): it takes and holds
    /// nothing, and is listed with that reason.
    pub fixed: Option<&'static str>,
    /// What it takes stays in the measure, the receiver's from where it lands (a transfer, a hand-over); else it leaves it.
    pub stays: bool,
    /// 1.9 3c-1, 3c-2: an offer that names an instance holds it; its accept binds, and the transfers `for` its deal perform it (they take
    /// over its hold: for each, the offer is freed). An offer itself never lands.
    pub offer: Option<Vec<String>>,
}

/// One draw as read: the draw list's row (folds.md, What is left).
#[derive(Clone, Debug)]
pub(super) struct Row {
    pub block: String,
    pub by: Option<String>,
    pub to: To,
    pub amount: Option<Amount>,
    pub takes: bool,
    pub why: Option<&'static str>,
    pub state: Option<&'static str>,
    /// What it took (None: all of a whole, or of a part not said).
    pub took: Option<Dec>,
    /// What landed, once it landed.
    pub landed: Option<Dec>,
    /// Whether it took a part whose amount is not said.
    pub unsaid: bool,
    /// The receiver's start for what landed (None: on no line).
    pub start: Option<String>,
    /// 1.9 3c-2: an offer a transfer `for` its deal performs: the transfers; its hold is theirs (it is counted in no sum of its own), and it
    /// is landed where one of them lands.
    pub performed_by: Vec<String>,
}

impl Row {
    pub(super) fn json(&self, kind: Option<&Kind>) -> Value {
        let to = match &self.to {
            To::Nobody => Value::Null,
            To::Open => json!("open"),
            To::Owner(o) => json!(o),
        };
        let amount = match (&self.amount, kind) {
            (Some(a), _) => a.json(),
            (None, _) => Value::Null,
        };
        json!({ "block": self.block, "by": self.by, "to": to, "amount": amount, "takes": self.takes, "why": self.why, "state": self.state })
    }
}

/// What the measure reads, every draw read once.
pub(super) struct Drawn {
    /// The rows, in block order.
    pub rows: Vec<Row>,
    /// `[{ block, on }]`: each draw that waits, and what on.
    pub waiting: Vec<(String, &'static str)>,
    /// What a line it read lacks; non-empty: the fold's answer is `{ not_shown: true, lacks }`.
    pub lacks: Vec<Value>,
    /// Every start, the first owners' and those of draws that landed.
    pub starts: Vec<Start>,
    /// The starts (by block) on a line where the thing was drawn twice: their owner owns none of it there (A fork is a burden).
    pub void: BTreeSet<String>,
    /// 1.9 3b-9: the draws of each pair on this measure that did not fit: `[{ draw, to, yes }]`, sorted by draw.
    pub pair: Vec<Value>,
    /// 1.9 3b-9: the blocks read besides the starts and the draws: each yes that landed a draw.
    pub read: BTreeSet<String>,
}

impl Drawn {
    /// The answer of a fold whose line is not read whole: `{ not_shown: true, lacks }`, nothing else (folds.md, A line).
    pub(super) fn not_shown(&self) -> Option<Value> {
        (!self.lacks.is_empty()).then(|| json!({ "not_shown": true, "lacks": self.lacks }))
    }
    pub(super) fn rows_json(&self, kind: Option<&Kind>) -> Vec<Value> {
        self.rows.iter().map(|r| r.json(kind)).collect()
    }
    pub(super) fn waiting_json(&self) -> Vec<Value> {
        let mut w: Vec<Value> = self.waiting.iter().map(|(b, on)| json!({ "block": b, "on": on })).collect();
        w.sort_by(|a, b| crate::js::cmp16(a["block"].as_str().unwrap_or(""), b["block"].as_str().unwrap_or("")).then_with(|| a["on"].as_str().cmp(&b["on"].as_str())));
        w.dedup();
        w
    }
    /// What each owner owns at the end, with nothing she drew that takes and is not freed: `(owner, amount)` sorted by owner, the amount
    /// None where it is not said; owners of nothing left out.
    pub(super) fn owners(&self) -> Vec<(String, Option<Dec>)> {
        let mut known: BTreeMap<String, Dec> = BTreeMap::new();
        let mut unsaid: BTreeMap<String, i64> = BTreeMap::new();
        for s in self.starts.iter().filter(|s| s.at.as_ref().is_none_or(|a| !self.void.contains(a))) {
            match &s.amount {
                Some(d) => {
                    let e = known.entry(s.owner.clone()).or_insert_with(Dec::zero);
                    *e = e.add(d);
                }
                None => *unsaid.entry(s.owner.clone()).or_default() += 1,
            }
        }
        // an offer performed by a transfer `for` its deal holds nothing itself: its hold is that transfer's (CORE-SET 3c), so it is not counted
        // twice against its giver (end pass 2026-11-20: what she owns, what is held and what landed add up to the measure, as `sum` reads it)
        for r in self.rows.iter().filter(|r| r.takes && r.state != Some("freed") && r.performed_by.is_empty()) {
            let Some(by) = &r.by else { continue };
            if r.unsaid {
                *unsaid.entry(by.clone()).or_default() -= 1;
            }
            // what she gave: what landed, else all it took while it holds
            let gone = match (r.state, &r.landed, &r.took) {
                (Some("landed"), Some(l), _) => Some(l.clone()),
                (_, _, t) => t.clone(),
            };
            if let Some(g) = gone.filter(|_| !r.unsaid) {
                let e = known.entry(by.clone()).or_insert_with(Dec::zero);
                *e = e.sub(&g);
            }
        }
        let mut names: BTreeSet<String> = known.keys().cloned().collect();
        names.extend(unsaid.keys().cloned());
        names
            .into_iter()
            .filter_map(|o| {
                let k = known.get(&o).cloned().unwrap_or_else(Dec::zero);
                let u = unsaid.get(&o).copied().unwrap_or(0);
                if u > 0 {
                    Some((o, None))
                } else if k.is_pos() {
                    Some((o, Some(k)))
                } else {
                    None
                }
            })
            .collect()
    }
    /// The sum of what the rows in `state` took (or landed, for `landed`), and whether any of them took a part not said.
    pub(super) fn sum(&self, state: &str, leaves: Option<bool>) -> (Dec, bool) {
        let mut d = Dec::zero();
        let mut any_unsaid = false;
        for r in self.rows.iter().filter(|r| r.takes && r.state == Some(state) && r.performed_by.is_empty() && leaves.is_none_or(|l| l == matches!(r.to, To::Nobody | To::Open))) {
            let v = if state == "landed" { r.landed.clone().or(r.took.clone()) } else { r.took.clone() };
            match v.filter(|_| !r.unsaid) {
                Some(v) => d = d.add(&v),
                None => any_unsaid = true,
            }
        }
        (d, any_unsaid)
    }
}

/// What a measure is counted in: one whole (no amount is drawn on it), a kind, or no kind at all (a pot whose pay-ins are of two kinds
/// and that states no backing: every amount drawn on it is of another kind).
#[derive(Clone, Copy)]
pub(super) enum In<'k> {
    Whole,
    Kind(&'k Kind),
    NoKind,
}

impl<'k> In<'k> {
    pub(super) fn of(kind: Option<&'k Kind>) -> Self {
        kind.map_or(In::Whole, In::Kind)
    }
}

/// The line a block is on: its author and the key grant that brought its key in (none for the genesis key).
type LineKey = (String, String);

fn line_key(b: &Value) -> LineKey {
    (rs(b, "author").unwrap_or("").to_string(), rs(b, "key").unwrap_or("").to_string())
}

/// The line a circle's draw is counted on (C21, D12): its meter's one line (with the draw's place there, the first of the meter's receipts
/// that names it), or the lines of the block it names in `state.counted_to` (in its causal past).
enum CircleLine {
    Meter(String, Option<usize>),
    Taken(Vec<LineKey>),
}
fn meter_line_key(circle: &str) -> LineKey {
    ("\u{0}circle".to_string(), circle.to_string())
}
fn circle_line(d: &Draw, index: &Index) -> Option<CircleLine> {
    let by = d.by.as_deref()?;
    if rs(d.block, "as") != Some(by) || super::circle::founding(by, index).is_none() {
        return None;
    }
    if let Some(meter) = super::circle::circle_meter(by, index) {
        let line = crate::line::line_named(meter, index)?;
        let key = format!("c21receipts:{meter}");
        let order = match index.stage_peek(&key) {
            Some(v) => v,
            None => {
                let mut rs_: Vec<&Value> = index
                    .values()
                    .filter(|r| crate::js::type_of(r) == "observe" && ss(r, "kind") == Some("receipt") && crate::line::on_line(r, &line, index) && crate::identity::counts_in(r, index))
                    .collect();
                rs_.sort_by(|a, b| st(a, "seq").and_then(Value::as_u64).cmp(&st(b, "seq").and_then(Value::as_u64)).then_with(|| hash_of(a).cmp(hash_of(b))));
                let v = json!(rs_.iter().map(|r| list(rf(r, "derives_from"))).collect::<Vec<_>>());
                index.stage_put(&key, v.clone());
                v
            }
        };
        let place = order.as_array().and_then(|a| a.iter().position(|names| names.as_array().is_some_and(|n| n.iter().any(|x| x.as_str() == Some(hash_of(d.block))))));
        return Some(CircleLine::Meter(by.to_string(), place));
    }
    let x = ss(d.block, "counted_to").and_then(|c| index.get(c)).filter(|x| index.past_of(d.block).contains(hash_of(x)))?;
    Some(CircleLine::Taken(line_keys(x, index)))
}

/// The line a draw is counted on: a tool's block under her grant that passes a part of a thing (`refs.what`) is counted on the line of the
/// grant, the giver's own, where the part was passed from (Toll work; 00-shared, A part passed); any other block, on its key's line.
fn draw_line(b: &Value, index: &Index) -> LineKey {
    match passed_grant(b, index) {
        Some(g) => line_key(g),
        None => line_key(b),
    }
}
/// The grant a tool's block draws under, where it passes a part: the block's `refs.under`, a grant made to the block's signer that names
/// an instance in `refs.what`.
pub(super) fn passed_grant<'a>(b: &Value, index: &'a Index) -> Option<&'a Value> {
    let g = rs(b, "under").and_then(|h| index.get(h))?;
    (crate::js::type_of(g) == "grant" && rf(g, "what").is_some() && rs(g, "to").is_some() && rs(g, "to") == rs(b, "author")).then_some(g)
}

/// The lines a block's line goes on from (folds.md, A line goes on): its own, then, where the key grant that brought its key in puts it in
/// an old key's place (it states `counted_to`, or the old key signed it and its list leaves that key out), the old key's line, and so on.
/// A key grant that only adds a key under a voice continues nothing: that key's line is its own.
fn line_keys(b: &Value, index: &Index) -> Vec<LineKey> {
    if let Some(g) = passed_grant(b, index) {
        return line_keys(g, index);
    }
    let mut out = vec![line_key(b)];
    let mut grant = rs(b, "key").and_then(|h| index.get(h));
    while let Some(g) = grant {
        let replaces = ss(g, "counted_to").is_some() || st(g, "voices").is_some_and(|v| !v.to_string().contains(&format!("\"{}\"", key_text(g, index))));
        if !replaces {
            break;
        }
        let from = ss(g, "counted_to").and_then(|h| index.get(h)).unwrap_or(g);
        let k = line_key(from);
        if out.contains(&k) {
            break;
        }
        out.push(k);
        grant = rs(from, "key").and_then(|h| index.get(h));
    }
    out
}

// The signing key of a block, as text (empty when it is not found).
fn key_text(b: &Value, index: &Index) -> String {
    crate::identity::key_of(b, index).map(|s| s.key).unwrap_or_default()
}

/// What hides a measure from this reader (1.9 3b-7, Read whole): each block held and not read that could name it. Held as a body (its
/// header carries `_names`), it could name each id in its refs; held only as its header, each measure its key's line held at its place:
/// a start of the measure on that line below it. The ids, sorted.
/// 1.9 3b (decided, CORE-SET "What building changed"): "each word of that key it could end" is not read (no fold here asks about a word); "held at its place" is read as a
/// start on the same line with a lower `seq`.
pub(super) fn hidden(measure: &str, starts: &[Start], index: &Index, seen: &dyn Fn(&str) -> bool) -> Vec<String> {
    let seq = |b: &Value| crate::js::int(st(b, "seq")).unwrap_or(0.0);
    let mut out: Vec<String> = Vec::new();
    for (_, e) in index.iter().filter(|(_, e)| e.get("type").is_none() && seen(hash_of(e))) {
        let hides = match e.get("_names").or_else(|| e.get("_unjudged")).and_then(Value::as_array) {
            Some(names) => names.iter().any(|n| n.as_str() == Some(measure)),
            None => starts.iter().filter_map(|s| s.at.as_ref()).filter_map(|at| index.get(at)).any(|b| line_key(b) == line_key(e) && seq(b) < seq(e)),
        };
        if hides {
            out.push(hash_of(e).to_string());
        }
    }
    crate::js::sorted_set(out)
}

/// Each held block's place in the record's causal order (causes first), found once per state of the blocks: the schedule draws are
/// visited in. It decides no answer.
pub(super) fn causal_rank(index: &Index) -> BTreeMap<String, usize> {
    let v = index.stage_memo("draws:causal_order", || Value::Array(crate::order::causal_order_in(index).iter().map(|b| json!(hash_of(b))).collect()));
    v.as_array().into_iter().flatten().enumerate().filter_map(|(i, h)| h.as_str().map(|h| (h.to_string(), i))).collect()
}

/// A line read whole from a block back to a start (folds.md, A line), each block walked once for all the draws of a fold: a walk stops at a
/// block already found whole back to that start.
struct Whole<'a> {
    index: &'a Index,
    judge: crate::valid::Judge<'a>,
    known: BTreeSet<(String, String)>,
}

impl<'a> Whole<'a> {
    fn new(index: &'a Index) -> Self {
        Whole { index, judge: crate::valid::Judge::new(index, None), known: BTreeSet::new() }
    }
    // Whether a held block is held and valid (1.9 3b-7, Read whole: each block on the line held and valid; one held and not read hides
    // what it could name, which `hidden` reads). The fold's index holds only valid blocks: bodies read, and headers.
    fn good(&self, h: &str) -> bool {
        let _ = &self.judge;
        self.index.get(h).is_some()
    }
    /// What the line from `block` back to `start` lacks: empty when it is read whole.
    fn lacks(&mut self, block: &str, start: &str) -> Vec<Value> {
        let mut path: Vec<String> = Vec::new();
        let mut cur = block.to_string();
        loop {
            if self.known.contains(&(cur.clone(), start.to_string())) {
                break;
            }
            if !self.good(&cur) {
                return self.slow(block, start);
            }
            path.push(cur.clone());
            if cur == start {
                break;
            }
            let Some(b) = self.index.get(&cur) else { return self.slow(block, start) };
            let Some(prev) = rs(b, "prev") else { return self.slow(block, start) };
            // at the key grant that brought in this block's key, the line of the key it replaced goes on from its `counted_to`
            let next = if rs(b, "key") == Some(prev) { self.index.get(prev).and_then(|k| ss(k, "counted_to")).unwrap_or(prev) } else { prev };
            cur = next.to_string();
        }
        for p in path {
            self.known.insert((p, start.to_string()));
        }
        Vec::new()
    }
    // A line that is not whole (or does not reach the start along `prev`): the stage-2 walk lists what it lacks.
    fn slow(&self, block: &str, start: &str) -> Vec<Value> {
        // only what is not held is lacking here: a block held and not read is read by `hidden`
        let missing = |lacks: Vec<Value>| -> Vec<Value> { lacks.into_iter().filter(|l| l.as_str().is_none_or(|h| self.index.get(h).is_none())).collect() };
        match crate::line::walk(block, Some(start), self.index) {
            Ok((true, _, lacks)) => missing(lacks),
            // the walk ended without meeting the start, a block held only as its header (or not read) on the way: the line is not read
            // whole, and each such block is lacking (folds.md, A line: "with nothing lacking on the way" it would be no line of hers)
            // (a body held and not read is lacking only where it could name the measure, which `hidden` reads; a true header always)
            Ok((false, true, lacks)) if !lacks.is_empty() => lacks.into_iter().filter(|l| l.as_str().is_none_or(|h| self.index.get(h).is_none_or(|b| b.get("_names").is_none() && b.get("_unjudged").is_none()))).collect(),
            Ok((false, _, lacks)) if !lacks.is_empty() => missing(lacks),
            // the start is not on this line along `prev`: the line it is on is read by its key (line_keys), so nothing is lacking
            _ => Vec::new(),
        }
    }
}

// A running amount on one owner's line: what took and is out for good, and what is out unless a block that frees it is in the past.
#[derive(Default)]
struct Running {
    out: Dec,
    // (amount, the blocks any one of which frees it for a draw that has it in its past, whether an end of it is unseen)
    maybe: Vec<(Dec, Vec<String>, bool)>,
    // a part not said, or a whole, is out
    whole_out: bool,
    whole_maybe: Vec<(Vec<String>, bool)>,
}

/// What is left, read along each owner's line: every draw read once against a running amount. `kind` is what the measure is counted in; `starts` the first owners'; `extra(draw, owner)` what she has of the measure besides her starts where the
/// draw stands (a pot's accepted pay-ins in its past).
pub(super) fn draws_on(kind: In<'_>, starts: Vec<Start>, draws: Vec<Draw<'_>>, extra: &dyn Fn(&Value, &str) -> Dec, index: &Index) -> Drawn {
    let rank = causal_rank(index);
    let mut order: Vec<usize> = (0..draws.len()).collect();
    // 1.9 3b-6: a block of a new key that goes on an old key's line is read after the old key's blocks, so what a pair there holds is known
    let continued = |d: &Draw| line_keys(d.block, index).len() > 1;
    // 1.9 R-H7 (stage 5 compare): a will is read after every other draw of hers, whatever her close saw (what landed and stood stays: a close
    // that did not see a sale takes nothing back from it), its wills among themselves in the order of her line
    let at = |d: &Draw| -> (bool, usize) { (super::things::is_will(d.block), rank.get(hash_of(d.block)).copied().unwrap_or(usize::MAX)) };
    order.sort_by_key(|i| (continued(&draws[*i]), at(&draws[*i])));
    // 1.9 stage 6 (C21, D12): a draw that speaks for a circle is counted on the circle's line. With a meter, one line, in the order of the
    // meter's receipts that name each draw (a draw none names comes after, in causal order): the circle's draws keep their places among the
    // others and are ordered among themselves. With none, the line of the key that signed it, or, where it names in `state.counted_to` a
    // block in its causal past, that block's line (A line goes on).
    let circle_lines: Vec<Option<CircleLine>> = draws.iter().map(|d| circle_line(d, index)).collect();
    {
        let mut by_circle: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for (slot, i) in order.iter().enumerate() {
            if let Some(CircleLine::Meter(c, _)) = &circle_lines[*i] {
                by_circle.entry(c.clone()).or_default().push(slot);
            }
        }
        for slots in by_circle.values() {
            let mut members: Vec<usize> = slots.iter().map(|s| order[*s]).collect();
            members.sort_by_key(|i| match &circle_lines[*i] {
                Some(CircleLine::Meter(_, place)) => (place.is_none(), place.unwrap_or(0), at(&draws[*i]).1),
                _ => (true, 0, usize::MAX),
            });
            for (s, i) in slots.iter().zip(members) {
                order[*s] = i;
            }
        }
    }
    let mut whole = Whole::new(index);
    let mut starts = starts;
    let mut rows: Vec<Option<Row>> = vec![None; draws.len()];
    let mut waiting: Vec<(String, &'static str)> = Vec::new();
    let mut lacks: Vec<Value> = Vec::new();
    // seat 33 mend 2: the lacks already listed, by their text, so each new one is checked in log time
    let mut lacks_seen: alloc::collections::BTreeSet<String> = Default::default();
    let mut running: BTreeMap<(String, LineKey), Running> = BTreeMap::new();
    // 1.9 3b-13 (a clock orders a pair where his voice states a reach): NOT BUILT in this half. It waits for the random-world test
    // (CORE-SET 3b-13); until then a pair is read as A fork is a burden says, whatever its key's voice states.
    // A thing drawn twice (folds.md, A fork is a burden; 1.9 3b-5, Rule B). The draws of a pair on this measure are decided together: the
    // pair's own blocks (joined where pairs share a block), never a later block of the fork, which is read as any draw unless the pair
    // did not fit (then it reads `pair`, 3b-2). Twins `for` one deal (the same deal in `refs.for`, the same receiver and the same amount)
    // are one draw: the lowest hash names which one is read, never which counts, and the other is listed with its answer and counted
    // once. Of the rest, those whose receiver gave them up (her `declined` or `stopped`) are read as any draw. Of the live ones: where all
    // come to no more than what was there, each takes; else a draw without her yes changes nothing on the others and takes nothing
    // (`pair`): where one has her yes it is read as a draw alone; where two or more have it and they come to more, none takes, each reads
    // `pair`, the pair is listed in `pair`, and no owner of that measure is shown on that line.
    let twin_class = |d: &Draw| -> String {
        let mut f: Vec<&str> = list(rf(d.block, "for"));
        f.sort();
        let to = match &d.to { To::Owner(o) => o.clone(), To::Open => "open".into(), To::Nobody => String::new() };
        format!("{}|{}|{}", f.join(","), to, d.amount.as_ref().map_or(Value::Null, Amount::json))
    };
    let let_go = |d: &Draw| !d.no.is_empty();
    let pos: BTreeMap<&str, usize> = draws.iter().enumerate().filter(|(_, d)| d.fixed.is_none()).map(|(i, d)| (hash_of(d.block), i)).collect();
    // union of the pair groups over this measure's draws
    let mut root: Vec<usize> = (0..draws.len()).collect();
    fn find(root: &mut Vec<usize>, mut x: usize) -> usize {
        while root[x] != x {
            root[x] = root[root[x]];
            x = root[x];
        }
        x
    }
    // the blocks of a pair whose other branch is held only as its header: what they draw is not shown (3b-7: "where either branch is not
    // read or held only as a header, every draw of that key on a measure it could name ... is not_shown"), so no receiver starts a line
    // from one of them (end pass 2026-11-20, as the oracle reads it)
    let header_paired: BTreeSet<String> = crate::identity::pair_groups_in(index)
        .into_iter()
        .filter(|g| g.iter().any(|h| index.get(h).is_some_and(|b| b.get("type").is_none())))
        .flatten()
        .collect();
    let mut member: BTreeSet<usize> = BTreeSet::new();
    for g in crate::identity::pair_groups_in(index) {
        let idx: Vec<usize> = g.iter().filter_map(|h| pos.get(h.as_str()).copied()).collect();
        for w in idx.windows(2) {
            let (x, y) = (find(&mut root, w[0]), find(&mut root, w[1]));
            root[y] = x;
        }
        member.extend(idx);
    }
    let mut groups: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for &i in &member {
        let r = find(&mut root, i);
        groups.entry(r).or_default().push(i);
    }
    groups.retain(|_, g| g.len() >= 2);
    let group_of: BTreeMap<usize, usize> = groups.iter().flat_map(|(r, g)| g.iter().map(move |i| (*i, *r))).collect();
    // twin_of[i] = the draw it repeats
    let mut twin_of: BTreeMap<usize, usize> = BTreeMap::new();
    for g in groups.values() {
        let mut by_hash: Vec<usize> = g.clone();
        by_hash.sort_by(|x, y| hash_of(draws[*x].block).cmp(hash_of(draws[*y].block)));
        let mut reps: Vec<usize> = Vec::new();
        for i in by_hash {
            let d = &draws[i];
            let twin = if list(rf(d.block, "for")).is_empty() { None } else { reps.iter().find(|r| twin_class(&draws[**r]) == twin_class(d)).copied() };
            match twin {
                Some(r) => {
                    twin_of.insert(i, r);
                }
                None => reps.push(i),
            }
        }
    }
    // what each group decided, once its first draw is reached: the draws that take, and whether it stands unresolved
    let mut decided: BTreeMap<usize, (BTreeSet<usize>, BTreeSet<usize>)> = BTreeMap::new();
    // what was left where each group's first draw is read (its amount, and whether a whole was out): a draw of the pair its receiver gave
    // up is read from there, as what it would do alone, then freed (1.9 3b-5: "a draw given up is freed and holds nothing against the others")
    let mut pair_left: BTreeMap<usize, (Dec, bool)> = BTreeMap::new();
    let mut paired_lines: BTreeSet<LineKey> = BTreeSet::new();
    let mut pair_out: Vec<Value> = Vec::new();
    let mut yes_read: BTreeSet<String> = BTreeSet::new();
    let mut maybe_lacks: Vec<(String, Vec<Value>)> = Vec::new();
    // who may own some of this measure: a first owner, or one a draw with her yes names as its receiver
    let may_own: BTreeSet<String> = starts.iter().map(|s| s.owner.clone()).chain(draws.iter().filter(|d| !d.yes.is_empty()).filter_map(|d| match &d.to { To::Owner(o) => Some(o.clone()), _ => None })).collect();
    // 1.9 3b-6: per line, what the draws of a pair that did not fit come to: it stays out of what a new key that goes on that line may
    // draw on, until the pair ends
    let mut lingering: BTreeMap<LineKey, Dec> = BTreeMap::new();
    // whether a block's `prev` walk reaches a start of its own key (folds.md, A line), each block read once per start
    let reach_memo: core::cell::RefCell<BTreeMap<(String, String), bool>> = Default::default();
    let reaches = |from: &str, start: &str| -> bool {
        let mut path: Vec<String> = Vec::new();
        let mut cur = from.to_string();
        // (a block held only as its header, or not read, met on the way: a start the walk never meets is "not on the line" only with
        // nothing lacking on the way (folds.md, A line); with something lacking, the line is not read whole and the walk that lists what
        // it lacks answers. end pass 2026-11-20, as the oracle reads it)
        let mut last_header: Option<usize> = None;
        let base = loop {
            if cur == start {
                break true;
            }
            if let Some(v) = reach_memo.borrow().get(&(cur.clone(), start.to_string())) {
                break *v;
            }
            if path.len() > 100_000 || path.contains(&cur) {
                break false;
            }
            path.push(cur.clone());
            let Some(b) = index.get(&cur) else { break true };
            // (only a block held as its header alone: a body held and not read shows its own author and prev, and is walked as any)
            if b.get("type").is_none() && b.get("_names").is_none() && b.get("_unjudged").is_none() {
                last_header = Some(path.len() - 1);
            }
            // a held header or a missing block is read by the walk that lists what it lacks: not answered here
            let Some(p) = rs(b, "prev") else { break false };
            // at the key grant that brought its key in, the line goes on as `line::walk` reads it
            if rs(b, "key") == Some(p) {
                break matches!(crate::line::walk(&cur, Some(start), index), Ok((true, _, _)) | Ok((false, false, _)));
            }
            cur = p.to_string();
        };
        // each block on the path answers for its own remainder: a header at or after it on the way leaves its answer to the lacks
        let mut m = reach_memo.borrow_mut();
        for (i, p) in path.into_iter().enumerate() {
            m.insert((p, start.to_string()), base || last_header.is_some_and(|h| h >= i));
        }
        base || last_header.is_some()
    };
    for i in order {
        let d = &draws[i];
        let h = hash_of(d.block).to_string();
        let mut row = Row { block: h.clone(), by: d.by.clone(), to: d.to.clone(), amount: d.amount.clone(), takes: false, why: None, state: None, took: None, landed: None, unsaid: false, start: None, performed_by: Vec::new() };
        let refuse = |row: &mut Row, why: &'static str| row.why = Some(why);
        if let Some(why) = d.fixed {
            refuse(&mut row, why);
            rows[i] = Some(row);
            continue;
        }
        // nothing is converted: an amount of another kind takes nothing; an amount drawn on one whole takes nothing of it
        if let Some(a) = &d.amount {
            match kind {
                In::Whole => {
                    refuse(&mut row, "no_measure");
                    rows[i] = Some(row);
                    continue;
                }
                In::Kind(k) if *k == a.kind => {}
                _ => {
                    refuse(&mut row, "unit");
                    rows[i] = Some(row);
                    continue;
                }
            }
        }
        // a block that speaks for no one is no draw (A draw: a counted block that speaks for an owner): it is not listed
        let Some(by) = d.by.clone() else { continue };
        // 1.9 3b-1: a block out of its place on its key's line takes nothing; a block on no line of its key takes nothing there
        // (`not_on_line`). Its place is read before whose the measure is.
        if crate::identity::out_of_place_in(d.block, index) {
            refuse(&mut row, "out_of_place");
            rows[i] = Some(row);
            continue;
        }
        if crate::identity::off_line_in(d.block, index) {
            refuse(&mut row, "not_on_line");
            rows[i] = Some(row);
            continue;
        }
        let past = index.past_of(d.block);
        let lines = match &circle_lines[i] {
            Some(CircleLine::Meter(c, _)) => vec![meter_line_key(c)],
            Some(CircleLine::Taken(ls)) => ls.clone(),
            None => line_keys(d.block, index),
        };
        let mine: Vec<&Start> = starts.iter().filter(|s| s.owner == by && (s.seen == h || past.contains(&s.seen))).collect();
        if mine.is_empty() {
            // 1.9 3b-9: an answer never says "nobody" where it holds a signed word naming someone. Where the draw's own line back from it
            // lacks a block, what she owned there could be in it: not shown, with lacks, never `not_owner`.
            // (only for one who owns some of it somewhere: one who owns none of it anywhere is `not_owner` whatever his own line lacks)
            // (only for one who owns some of it somewhere, read once every draw is read: one who owns none of it anywhere is `not_owner`
            // whatever his own line lacks)
            let owns_some = may_own.contains(&by);
            let missing: Vec<Value> = if !owns_some { Vec::new() } else { crate::line::walk(&h, None, index).map(|(_, _, l)| l).unwrap_or_default().into_iter().filter(|l| l.as_str().is_none_or(|x| index.get(x).is_none())).collect() };
            if !missing.is_empty() {
                maybe_lacks.push((by.clone(), missing));
            }
            refuse(&mut row, "not_owner");
            rows[i] = Some(row);
            continue;
        }
        let on_line: Vec<&Start> = mine
            .iter()
            .copied()
            .filter(|s| s.at.as_ref().is_some_and(|at| (at == &h || past.contains(at)) && (matches!(circle_lines[i], Some(CircleLine::Meter(..))) || index.get(at).is_some_and(|b| lines.contains(&line_key(b))))))
            .collect();
        // the line is read whole from the draw back to her start by `prev` (folds.md, A line): a start of the draw's own key that its `prev`
        // walk never reaches (a twin of the start at the start's own place) is on no line of it (end pass 2026-11-20, as the oracle reads it)
        let on_line: Vec<&Start> = on_line
            .into_iter()
            .filter(|s| {
                let at = s.at.as_deref().unwrap_or("");
                at == h || !index.get(at).is_some_and(|b| line_key(b) == line_key(d.block)) || reaches(&h, at)
            })
            .collect();
        if on_line.is_empty() {
            refuse(&mut row, "not_on_line");
            rows[i] = Some(row);
            continue;
        }
        // a fold counts a draw only on its owner's line read whole from the draw back to her start
        let mut seen_starts: Vec<&str> = Vec::new();
        for s in &on_line {
            let at = s.at.as_deref().unwrap_or("");
            if seen_starts.contains(&at) || index.get(at).is_some_and(|b| line_key(b) != line_key(d.block)) {
                continue;
            }
            seen_starts.push(at);
            for l in whole.lacks(&h, at) {
                if lacks_seen.insert(l.to_string()) {
                    lacks.push(l);
                }
            }
        }
        let lk = match &circle_lines[i] {
            Some(CircleLine::Meter(c, _)) => meter_line_key(c),
            Some(CircleLine::Taken(ls)) => ls[0].clone(),
            None => draw_line(d.block, index),
        };
        let unsaid = on_line.iter().any(|s| s.amount.is_none());
        // a later block of a fork, on a line whose pair did not fit, that draws on this measure reads `pair` (3b-2)
        if !group_of.contains_key(&i) && crate::identity::forked_in(d.block, index) && paired_lines.contains(&lk) {
            refuse(&mut row, "pair");
            rows[i] = Some(row);
            continue;
        }
        // a twin is listed with the answer of the draw it repeats, below
        if twin_of.contains_key(&i) {
            continue;
        }
        if unsaid && d.amount.is_some() {
            refuse(&mut row, "no_measure");
            rows[i] = Some(row);
            continue;
        }
        // what she owns of it here: her starts on this line, and what else is hers where the draw stands
        let have = on_line.iter().filter_map(|s| s.amount.clone()).fold(extra(d.block, &by), |t, a| t.add(&a));
        // what the draws before it on her line hold: out for good, or out until a block that frees it is in this draw's past
        let mut out = Dec::zero();
        let mut unseen = Dec::zero();
        let mut whole_out = false;
        let mut whole_unseen = false;
        for l in &lines {
            let Some(r) = running.get(&(by.clone(), l.clone())) else { continue };
            out = out.add(&r.out);
            whole_out |= r.whole_out;
            for (a, frees, end_unseen) in &r.maybe {
                if !frees.iter().any(|f| past.contains(f) || *f == h) {
                    out = out.add(a);
                    if *end_unseen {
                        unseen = unseen.add(a);
                    }
                }
            }
            for (frees, end_unseen) in &r.whole_maybe {
                if !frees.iter().any(|f| past.contains(f) || *f == h) {
                    if *end_unseen {
                        whole_unseen = true;
                    } else {
                        whole_out = true;
                    }
                }
            }
        }
        let mut left = have.sub(&out);
        for l in lines.iter().filter(|l| **l != lk) {
            if let Some(x) = lingering.get(l) {
                left = left.sub(x);
            }
        }
        // 1.9 3b-5 (Rule B): the draws of a pair are decided together, from what was left where the first of them is read
        let mut decided_take = false;
        if let Some(&g) = group_of.get(&i) {
            if !decided.contains_key(&g) {
                let reps: Vec<usize> = groups[&g].iter().copied().filter(|j| !twin_of.contains_key(j)).collect();
                // a draw of the pair that takes nothing by itself (out of its place, on no line) changes nothing on the others
                let live: Vec<usize> = reps
                    .iter()
                    .copied()
                    .filter(|j| !let_go(&draws[*j]) && !crate::identity::out_of_place_in(draws[*j].block, index) && !crate::identity::off_line_in(draws[*j].block, index))
                    .collect();
                let want = |j: usize| -> Option<Dec> { if unsaid { None } else { draws[j].amount.as_ref().map(|a| a.value.clone()).or_else(|| Some(left.clone())) } };
                let fits = |set: &[usize]| -> bool {
                    if set.len() == 1 {
                        return true;
                    }
                    set.iter().map(|j| want(*j)).try_fold(Dec::zero(), |t, w| w.map(|w| t.add(&w))).is_some_and(|t| t.cmp(&left).is_le())
                };
                // the live draws that would take alone (a draw past what is left alone is read as any draw)
                let alone: Vec<usize> = live.iter().copied().filter(|j| if unsaid { !whole_out } else { want(*j).is_some_and(|w| w.is_pos() && w.cmp(&left).is_le()) }).collect();
                // 1.9 3d-10: a transform's inputs are draws in the pair test as everywhere: a make (no receiver) needs no one's yes
                let has_yes = |j: usize| !draws[j].yes.is_empty() || draws[j].to == To::Nobody;
                let with_yes: Vec<usize> = alone.iter().copied().filter(|j| has_yes(*j)).collect();
                let takers: Vec<usize> = if live.len() <= 1 {
                    alone.clone()
                } else if !alone.is_empty() && fits(&alone) {
                    alone.clone()
                } else if with_yes.len() >= 2 && fits(&with_yes) || with_yes.len() == 1 {
                    with_yes.clone()
                } else {
                    Vec::new()
                };
                let unresolved = live.len() >= 2 && alone.len() >= 2 && with_yes.len() >= 2 && takers.is_empty();
                if unresolved {
                    paired_lines.insert(lk.clone());
                    let sum = with_yes.iter().filter_map(|j| want(*j)).fold(Dec::zero(), |t, w| t.add(&w));
                    let e = lingering.entry(lk.clone()).or_insert_with(Dec::zero);
                    *e = e.add(&sum);
                    for j in &groups[&g] {
                        let r = twin_of.get(j).copied().unwrap_or(*j);
                        let to = match &draws[*j].to { To::Owner(o) => json!(o), To::Open => json!("open"), To::Nobody => Value::Null };
                        pair_out.push(json!({ "draw": hash_of(draws[*j].block), "to": to, "yes": has_yes(r) }));
                    }
                }
                decided.insert(g, (takers.into_iter().collect(), alone.into_iter().collect()));
                pair_left.insert(g, (left.clone(), whole_out));
            }
            let (takers, alone) = &decided[&g];
            if !let_go(d) && alone.contains(&i) && !takers.contains(&i) {
                refuse(&mut row, "pair");
                rows[i] = Some(row);
                continue;
            }
            decided_take = !let_go(d) && takers.contains(&i);
        }
        let given_up_in_pair = group_of.get(&i).and_then(|g| pair_left.get(g)).filter(|_| let_go(d)).cloned();
        let (takes, took, wait) = if let Some((left0, whole_out0)) = given_up_in_pair {
            // a draw of the pair its receiver gave up: what it would take alone where the pair is read; it is freed below
            if unsaid {
                (!whole_out0, None, false)
            } else {
                match &d.amount {
                    Some(a) => (a.value.is_pos() && a.value.cmp(&left0).is_le(), Some(a.value.clone()), false),
                    None => (left0.is_pos(), Some(left0.clone()), false),
                }
            }
        } else if unsaid {
            // a whole, or a part not said: a draw of all she owns takes it while no earlier draw on her line holds it
            (!whole_out && !whole_unseen, None, !whole_out && whole_unseen)
        } else {
            match &d.amount {
                Some(a) => {
                    let fits = a.value.is_pos() && (decided_take || a.value.cmp(&left).is_le());
                    let fits_freed = a.value.is_pos() && a.value.cmp(&left.add(&unseen)).is_le();
                    (fits, Some(a.value.clone()), !fits && fits_freed)
                }
                None => (left.is_pos(), Some(left.clone()), !left.is_pos() && left.add(&unseen).is_pos()),
            }
        };
        if wait {
            // it would fit only once an end she has not seen frees an earlier draw: it waits, and is neither past nor landed
            waiting.push((h.clone(), "end"));
            rows[i] = Some(row);
            continue;
        }
        if !takes {
            refuse(&mut row, "past");
            rows[i] = Some(row);
            continue;
        }
        row.takes = true;
        row.took = took.clone();
        row.unsaid = unsaid;
        // lands: the draw stands, her yes is given (in its past, or her accepted answer), and its condition has held
        let mut stood = crate::identity::stands(d.block, index);
        // a word acts on what is its signer's own when signed (provisional, awaiting the owner): where the receiver's yes is already in the
        // draw's causal past, every end of the draw has that yes in its past and so frees nothing (Freed), so the cut has nothing to wait for
        if d.yes.iter().any(|y| past.contains(hash_of(y))) && stood.waiting.contains(&"end") {
            stood.waiting.retain(|w| *w != "end");
            stood.stands = stood.waiting.is_empty();
        }
        // its own condition is read once, by its reader: `stands` reads it with none
        if d.condition == Some(true) && !stood.waiting.is_empty() {
            stood.waiting.retain(|w| *w != "condition");
            stood.stands = stood.waiting.is_empty();
        }
        // freed (1.9 3c-3, Rule A): before a draw lands, the one it would go to frees it by her own counted `declined` or `stopped` answer, even
        // with her yes in its past; an end by its giver frees it where she has seen the end before any yes (an accept with the end in its own
        // past is no yes)
        let yes_seen = |b: &Value| d.yes.iter().any(|y| hash_of(y) == hash_of(b) || index.past_of(b).contains(hash_of(y)));
        let yes_before = |b: &Value| d.yes.iter().any(|y| hash_of(y) != hash_of(b) && index.past_of(b).contains(hash_of(y)));
        let in_pair = group_of.contains_key(&i);
        // 1.9-GUESS [3c-3a]: "before a draw lands" is read from what is held: her no after her yes frees the draw unless it landed at that
        // yes, which it did only where it stands and carries no condition that had not held (a condition she let go of had not held).
        // (an offer never lands at its yes: its landing waits on Due, so her no after her yes frees it, Rule A)
        let landed_at_yes = d.offer.is_none() && stood.stands && d.condition.is_none_or(|c| c);
        let mut frees: Vec<String> = d.no.iter().filter(|n| in_pair || !yes_seen(n) || !landed_at_yes).map(|n| hash_of(n).to_string()).collect();
        let mut end_unseen = false;
        // 1.9 3c-3 (Rule A), the clock path (stage 5 compare): where the draw names a clock (an offer's `terms.clocks`, a transfer's
        // `state.clocks`), an end by its giver that has no yes of hers in its past frees it once the lines that read no (`names` less
        // `needed`, plus one) hold the end with no yes before it
        let draw_clocks = crate::js::get(d.block, "state.terms.clocks").or_else(|| st(d.block, "clocks")).and_then(crate::tasks::clocks_of);
        if let (To::Owner(_), Some(k)) = (&d.to, &draw_clocks) {
            for e in &d.ends {
                if !d.yes.is_empty()
                    && !d.yes.iter().any(|y| index.past_of(e).contains(hash_of(y)))
                    && d.yes.iter().all(|y| crate::line::end_first(hash_of(y), hash_of(e), k, index, &|_| true))
                    && !frees.iter().any(|f| f == hash_of(e))
                {
                    frees.push(hash_of(e).to_string());
                }
            }
        }
        if let To::Owner(r) = &d.to {
            for e in &d.ends {
                let seers: Vec<&Value> = index
                    .values()
                    .filter(|b| rs(b, "author") == Some(r.as_str()) && b.get("type").is_some() && index.past_of(b).contains(hash_of(e)) && !yes_before(b))
                    .collect();
                if seers.is_empty() {
                    end_unseen = d.yes.iter().all(|y| !index.past_of(y).contains(hash_of(e)));
                } else {
                    frees.extend(seers.iter().map(|b| hash_of(b).to_string()));
                }
            }
        }
        // 1.9 3c-1, 3c-2: an offer holds until its accept binds and a transfer `for` its deal performs it (that transfer takes its hold
        // over), or until it is freed. Its giver's end frees it where no yes in time came before it (a late accept is no yes, and waits on
        // his next word); 3c-4: where its landing waits on payment, his end frees it even after her yes, where no block of his side
        // accepting a payment toward the price is in the end's causal past.
        let mut performed = false;
        if let Some(by_perf) = &d.offer {
            performed = !by_perf.is_empty();
            frees.extend(by_perf.iter().cloned());
            let waits_on_price = crate::js::get(d.block, "state.terms.waits_on").and_then(Value::as_str) == Some("price");
            // 1.9 3d-2 (decided in building): an offer that no yes in time answers is freed by its giver's end at once; once a yes answers it,
            // his end frees it only where she has seen the end before any yes (read above), or, where it waits on payment, as 3c-4 says
            for e in &d.ends {
                let paid_before_end = waits_on_price && payment_accepted_before(d.block, e, index);
                if d.yes.is_empty() || (waits_on_price && !paid_before_end) {
                    frees.push(hash_of(e).to_string());
                }
            }
        }
        // 1.9 3c-5: a condition that can no longer hold frees what it held, for its giver's later draws that have that in their past
        if let Some(by) = &d.dead {
            if by.is_empty() {
                frees.push(h.clone());
            } else {
                frees.extend(by.iter().cloned());
            }
        }
        let yes: Vec<&Value> = d.yes.iter().copied().filter(|y| !frees.iter().any(|f| index.past_of(y).contains(f))).collect();
        let answered = !matches!(d.to, To::Owner(_)) || !yes.is_empty();
        let cond = d.condition.unwrap_or(true);
        // each freeing block was signed before any yes (a no or an end that has her yes in its past frees nothing), and a yes that has a
        // freeing block in its past came too late
        if !frees.is_empty() && !(d.offer.is_some() && performed && frees.iter().all(|f| d.offer.as_ref().is_some_and(|p| p.contains(f)))) {
            row.state = Some("freed");
        } else if d.offer.is_some() {
            // an offer never lands itself: held until freed, or performed by a transfer `for` its deal (then its hold is that transfer's,
            // and it is landed where that transfer lands: read once every row is read)
            row.state = Some("held");
            if performed {
                row.performed_by = d.offer.clone().unwrap_or_default();
            }
        } else if stood.stands && answered && cond {
            row.state = Some("landed");
            // the yes that landed it: her first, the one no other of her yeses to it has in its past (3b-9: `read` lists each yes that landed
            // a draw; a later yes lands nothing; end pass 2026-11-20, as the oracle reads it)
            // (among her answers to the draw itself; a yes in its own past, to the deal, is read beside them)
            let direct = |y: &Value| rs(y, "answers") == Some(h.as_str());
            let landing: Vec<&&Value> = yes.iter().filter(|y| !direct(y) || !yes.iter().any(|o| direct(o) && hash_of(o) != hash_of(y) && index.past_of(y).contains(hash_of(o)))).collect();
            yes_read.extend(landing.iter().map(|y| hash_of(y).to_string()));
            // her accepted answer may state less: that much lands, and the rest is freed. Only the yes that landed it says how much: a later
            // yes lands nothing, and what landed stays landed (3b-9; blocks.md, Finality; end pass 2026-11-20)
            let said = landing.iter().filter_map(|y| Amount::of(st(y, "amount"))).filter(|a| matches!(kind, In::Kind(k) if *k == a.kind)).map(|a| a.value).min_by(|a, b| a.cmp(b));
            row.landed = match (&took, said) {
                (Some(t), Some(s)) if s.cmp(t).is_lt() => Some(s),
                (t, _) => t.clone(),
            };
        } else {
            row.state = Some("held");
            if !stood.stands {
                for on in &stood.waiting {
                    waiting.push((h.clone(), on));
                }
            }
            if !cond {
                waiting.push((h.clone(), "condition"));
            }
        }
        // a draw of a pair its receiver gave up holds nothing against the others (1.9 3b-5): it is freed, and out of the running amount
        if in_pair && let_go(d) {
            row.state = Some("freed");
            rows[i] = Some(row);
            continue;
        }
        // the running amount of her line
        let r = running.entry((by.clone(), lk.clone())).or_default();
        let freed_by = frees.clone();
        if unsaid {
            if row.state == Some("landed") || freed_by.is_empty() && !end_unseen {
                r.whole_out = true;
            } else {
                r.whole_maybe.push((freed_by, end_unseen));
            }
        } else if let Some(t) = &took {
            match (row.state, &row.landed) {
                (Some("landed"), Some(l)) => {
                    r.out = r.out.add(l);
                    let rest = t.sub(l);
                    if rest.is_pos() {
                        r.maybe.push((rest, yes.iter().map(|y| hash_of(y).to_string()).collect(), false));
                    }
                }
                _ if freed_by.is_empty() && !end_unseen => r.out = r.out.add(t),
                _ => r.maybe.push((t.clone(), freed_by, end_unseen)),
            }
        }
        // what lands stays in the measure: the receiver owns it from her start (One start)
        if let (Some("landed"), To::Owner(to), true, false) = (row.state, &d.to, d.stays, header_paired.contains(&h)) {
            let (at, given) = one_start(&yes, to, d.by.as_deref() == Some(to.as_str()), index);
            row.start = at.clone();
            // she owns it for a later draw of hers only where that draw has this one in its past (whether a draw takes is read from its
            // own causal past and nothing else): her yes may come before the draw (her accept of the deal it is `for`)
            let _ = given;
            let seen = h.clone();
            starts.push(Start { owner: to.clone(), amount: if unsaid { None } else { row.landed.clone() }, at, seen });
        }
        rows[i] = Some(row);
    }
    // a draw by one who owns some of the measure (a start of hers, once every draw is read) whose own line lacks a block: not shown
    for (by, missing) in maybe_lacks {
        if starts.iter().any(|s| s.owner == by) {
            for l in missing {
                if lacks_seen.insert(l.to_string()) {
                    lacks.push(l);
                }
            }
        }
    }
    // a twin is listed with the answer of the draw it repeats, and counted once (nothing more is out, nothing more lands)
    for (t, r) in &twin_of {
        if let Some(rep) = rows[*r].clone() {
            let d = &draws[*t];
            rows[*t] = Some(Row { block: hash_of(d.block).to_string(), by: d.by.clone(), to: d.to.clone(), amount: d.amount.clone(), took: None, landed: None, unsaid: false, start: None, performed_by: Vec::new(), ..rep });
        }
    }
    // a pair that did not fit: which one moved it is not shown, so no owner is shown on that line (Rule B)
    let void: BTreeSet<String> = starts
        .iter()
        .filter_map(|s| s.at.clone())
        .filter(|at| index.get(at).is_some_and(|b| paired_lines.contains(&line_key(b))))
        .collect();
    let mut rows: Vec<Row> = rows.into_iter().flatten().collect();
    // 1.9 3c-2: an offer lands exactly where the accept that answers it binds, its landing waiting on Due: where a transfer that performs it
    // lands, the offer is landed with it
    let landed_now: BTreeSet<String> = rows.iter().filter(|r| r.state == Some("landed")).map(|r| r.block.clone()).collect();
    // a transfer takes the offer's hold over only where it takes (end pass 2026-11-20: an amount on one whole takes nothing, `no_measure`,
    // and is read as a transfer that names no instance, folds.md, One whole): an offer no taking transfer performs keeps its own hold
    let taking: BTreeSet<String> = rows.iter().filter(|r| r.takes).map(|r| r.block.clone()).collect();
    for r in rows.iter_mut().filter(|r| !r.performed_by.is_empty()) {
        if !r.performed_by.iter().any(|t| taking.contains(t)) {
            r.performed_by.clear();
        }
    }
    for r in rows.iter_mut().filter(|r| !r.performed_by.is_empty() && r.state == Some("held")) {
        if r.performed_by.iter().any(|t| landed_now.contains(t)) {
            r.state = Some("landed");
        }
    }
    rows.sort_by(|a, b| crate::js::cmp16(&a.block, &b.block));
    lacks.sort_by(|a, b| match (a.as_str(), b.as_str()) {
        (Some(x), Some(y)) => crate::js::cmp16(x, y),
        (Some(_), None) => core::cmp::Ordering::Less,
        (None, Some(_)) => core::cmp::Ordering::Greater,
        (None, None) => a.to_string().cmp(&b.to_string()),
    });
    pair_out.sort_by(|a, b| a["draw"].as_str().cmp(&b["draw"].as_str()));
    let read = yes_read;
    Drawn { rows, waiting, lacks, starts, void, pair: pair_out, read }
}

/// 1.9 3c-4: whether a block of the offer's giver's side accepting a payment toward its price is in an end's causal past: his `accepted`
/// answer to a transfer `for` the deal, or his `received` `for` it.
fn payment_accepted_before(offer: &Value, end: &Value, index: &Index) -> bool {
    let giver = super::speaker_of(offer, index, None);
    let past = index.past_of(end);
    let deal = hash_of(offer);
    index.values().filter(|b| past.contains(hash_of(b)) && b.get("type").is_some() && super::speaker_of(b, index, None) == giver && crate::identity::counts_in(b, index)).any(|b| {
        let received = ss(b, "kind") == Some("received") && list(rf(b, "for")).contains(&deal);
        let accepted = ss(b, "status") == Some("accepted")
            && list(rf(b, "answers")).iter().any(|a| index.get(*a).is_some_and(|t| type_of(t) == "transfer" && list(rf(t, "for")).contains(&deal) && super::speaker_of(t, index, None) != giver));
        received || accepted
    })
}

/// Where what landed starts the receiver's line (folds.md, What is left, One start): her one yes; of several, the one the others have in
/// their past; where two by keys that may each give it do not see each other, neither starts a line, until a later block of hers whose
/// `after` names both; with none such, it is on no line (None). Beside it, the one yes from which she owns it, when one gave it (None:
/// accepts apart gave it).
///
/// 1.9 3b-8: an amount that comes to her starts on the line of the voice her list marks `receives: true`, else her first voice: of her
/// yeses, only those signed by that voice's key start it (one, or the one the others have in their past; apart: none). Another key's
/// accept is her yes and starts nothing. A part she passes from one key's line to another's (a transfer to its own giver) starts on the
/// line of the key it is handed to, as does an amount that comes to an id with no list held (read as before).
pub(super) fn one_start(yes: &[&Value], to: &str, passed: bool, index: &Index) -> (Option<String>, Option<String>) {
    let mut mine: Vec<&Value> = yes.iter().copied().filter(|y| super::speaker_of(y, index, None).as_deref() == Some(to)).collect();
    // G13: a part passed between her own tools starts on the receiving tool's line at its accept (the yes the draw names is that tool's)
    if passed && mine.is_empty() {
        mine = yes.to_vec();
    }
    let receiving = |y: &Value| crate::identity::key_of(y, index).and_then(|s| crate::identity::receives_on(to, &s.key, index));
    if !passed && !mine.is_empty() && mine.iter().all(|y| receiving(y).is_some()) {
        let on: Vec<&Value> = mine.iter().copied().filter(|y| receiving(y) == Some(true)).collect();
        let minima: Vec<&&Value> = on.iter().filter(|y| !on.iter().any(|o| hash_of(o) != hash_of(y) && index.past_of(y).contains(hash_of(o)))).collect();
        return match minima.as_slice() {
            [one] => (Some(hash_of(one).to_string()), Some(hash_of(one).to_string())),
            _ => (None, None),
        };
    }
    match mine.as_slice() {
        [] => (None, None),
        [one] => (Some(hash_of(one).to_string()), Some(hash_of(one).to_string())),
        many => {
            // the first accepts: those that have no other yes in their past (two or more of them are apart)
            let minima: Vec<&&Value> = many.iter().filter(|y| !many.iter().any(|o| hash_of(o) != hash_of(y) && index.past_of(y).contains(hash_of(o)))).collect();
            if let [one] = minima.as_slice() {
                return (Some(hash_of(one).to_string()), Some(hash_of(one).to_string()));
            }
            // a later block of hers that sees them all (its `after` names them) is the one start: of several such, the one the others see
            let names = |b: &Value| minima.iter().all(|m| list(rf(b, "after")).contains(&hash_of(m)) || index.past_of(b).contains(hash_of(m)));
            let mut later: Vec<&Value> = index
                .values()
                .filter(|b| b.get("type").is_some() && list(rf(b, "after")).iter().any(|a| minima.iter().any(|m| hash_of(m) == *a)) && names(b))
                .filter(|b| super::speaker_of(b, index, None).as_deref() == Some(to) && crate::identity::counts_in(b, index))
                .collect();
            later.sort_by(|a, b| crate::js::cmp16(hash_of(a), hash_of(b)));
            (later.iter().find(|y| later.iter().all(|o| hash_of(o) == hash_of(y) || index.past_of(o).contains(hash_of(y)))).map(|b| hash_of(b).to_string()), None)
        }
    }
}

/// A transfer's answers, read the one way every draw on a thing, a pot or a claim reads them: the receiver's yes (her binding accept of the
/// deal the transfer is `for`, in its own past, or her counted `accepted` answer to it), her own counted no (`declined` or `stopped`), and
/// the ends of the transfer (its signer's own counted `stopped` update of it).
pub(super) fn answers<'a>(t: &'a Value, to: &str, index: &'a Index) -> (Vec<&'a Value>, Vec<&'a Value>, Vec<&'a Value>) {
    let names = index.names_memo();
    let named: Vec<&Value> = names.by_answer.get(hash_of(t)).into_iter().flatten().filter_map(|n| index.get(n)).collect();
    let speaks = |b: &Value| super::speaker_of(b, index, None).as_deref() == Some(to);
    let mut yes: Vec<&Value> = named
        .iter()
        .copied()
        .filter(|b| ss(b, "status") == Some("accepted") && list(rf(b, "answers")).contains(&hash_of(t)) && crate::identity::counts_in(b, index) && speaks(b))
        .collect();
    // her binding accept of the deal it is `for`, in the transfer's own past
    let past = index.past_of(t);
    for f in list(rf(t, "for")) {
        for a in names.by_answer.get(f).into_iter().flatten().filter_map(|n| index.get(n)) {
            if type_of(a) == "promise" && ss(a, "status") == Some("accepted") && list(rf(a, "answers")).contains(&f) && past.contains(hash_of(a)) && crate::identity::counts_in(a, index) && speaks(a) {
                yes.push(a);
            }
        }
        // she may be the deal's first promise's own signer, answering an ask with an offer that the transfer's author accepted
        if let Some(first) = index.get(f).filter(|p| type_of(p) == "promise" && past.contains(f) && speaks(p) && st(p, "status").is_none()) {
            let giver = super::speaker_of(t, index, None);
            let accepted_by_giver = names.by_answer.get(f).into_iter().flatten().filter_map(|n| index.get(n)).any(|a| {
                type_of(a) == "promise" && ss(a, "status") == Some("accepted") && past.contains(hash_of(a)) && crate::identity::counts_in(a, index) && giver.is_some() && super::speaker_of(a, index, None) == giver
            });
            // 1.9 R-P5 (A spot exchange): her order naming the instance, and the giver's transfer `for` it, `to_owner` her, which is his yes
            let her_order_names_it = list(rf(first, "what")).iter().any(|w| list(rf(t, "what")).contains(w));
            if accepted_by_giver || her_order_names_it {
                yes.push(first);
            }
        }
    }
    // a fork's no counts for nothing (folds.md, A fork is a burden)
    let no: Vec<&Value> = named
        .iter()
        .copied()
        .filter(|b| matches!(ss(b, "status"), Some("declined" | "stopped")) && list(rf(b, "answers")).contains(&hash_of(t)) && crate::identity::counts_in(b, index) && speaks(b))
        .collect();
    // 1.9 3c-3: her own counted `declined` or `stopped` answer to the deal the draw is `for` frees it too
    let mut no = no;
    for f in list(rf(t, "for")) {
        for a in names.by_answer.get(f).into_iter().flatten().filter_map(|n| index.get(n)) {
            if hash_of(a) != hash_of(t) && matches!(ss(a, "status"), Some("declined" | "stopped")) && list(rf(a, "answers")).contains(&f) && crate::identity::counts_in(a, index) && speaks(a) && !no.iter().any(|n| hash_of(n) == hash_of(a)) {
                no.push(a);
            }
        }
    }
    let giver = super::speaker_of(t, index, None);
    let mut ends: Vec<&Value> = named
        .iter()
        .copied()
        .filter(|b| crate::grant::ending(b, hash_of(t)) == Some(crate::grant::End::Stop) && crate::identity::counts_in(b, index) && giver.is_some() && super::speaker_of(b, index, None) == giver)
        .collect();
    // 1.9 3d-15: her close is an end by its giver of every standing word of hers but a will, read as any end of hers (Freed)
    if let (Some(g), false) = (&giver, super::things::is_will(t)) {
        ends.extend(closes_of_giver(g, index));
    }
    // a time the transfer states (`expires`) is an end of it, read only against the receiver's own dated word (blocks.md, Time): her counted
    // block dated at or after it that has the transfer in its past, or answers it, has seen it and frees it; her accept dated at or after it,
    // or with no date, is late by its own word and no yes
    let mut no = no;
    if let Some(exp) = ss(t, "expires").filter(|_| type_of(t) == "transfer") {
        yes.retain(|y| type_of(y) == "promise" && !list(rf(y, "answers")).contains(&hash_of(t)) || ss(y, "at").is_some_and(|at| at < exp));
        for b in index.values().filter(|b| b.get("type").is_some() && hash_of(b) != hash_of(t) && ss(b, "at").is_some_and(|at| at >= exp)) {
            if (index.past_of(b).contains(hash_of(t)) || list(rf(b, "answers")).contains(&hash_of(t))) && speaks(b) && crate::identity::counts_in(b, index) && !no.iter().any(|n| hash_of(n) == hash_of(b)) {
                no.push(b);
            }
        }
    }
    yes.sort_by(|a, b| crate::js::cmp16(hash_of(a), hash_of(b)));
    yes.dedup_by(|a, b| hash_of(a) == hash_of(b));
    (yes, no, ends)
}

/// 1.9 3d-15: her closes, as blocks: each is an end by its giver of every standing word of hers but a will (Freed reads it as any end).
pub(super) fn closes_of_giver<'a>(giver: &str, index: &'a Index) -> Vec<&'a Value> {
    crate::identity::closes_of(giver, index).iter().filter_map(|c| index.get(c.as_str())).collect()
}
