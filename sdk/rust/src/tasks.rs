//! The tasks profile (spec/profiles/tasks.md): any task, software or physical, is a promise, a deed is the worker's own
//! block and evidence is an observe. What code adds is small: a sensor condition is checked against the observes a
//! performer's edge holds. The condition holds the rule; the readings are the evidence; a reading never settles a
//! promise (promises.md, Settling).
use crate::js::{count_stated, hash_of, list, rf, type_of};
#[cfg(feature = "folds")]
use crate::js::{get, rs, ss, st};
use crate::prelude::*;

/// `clocks: { names, needed }`: whose receipts date a block. `names` are block ids, sorted, each naming a line; `needed` follows Counts (folds.md): a set
/// of one needs none, a larger set says how many must agree, and none is filled in.
#[derive(Clone)]
pub(crate) struct Clocks {
    pub names: Vec<String>,
    pub needed: usize,
}

/// A panel (folds.md, Counts): `{ names, needed }`, `names` a non-empty list of ids each once, in the order signed, `needed` how many of them must each
/// sign: a panel of one needs none, a larger one states it. None when it is not well formed.
#[cfg(feature = "folds")]
pub(crate) fn panel_of(v: &Value) -> Option<(Vec<String>, usize)> {
    let o = v.as_object()?;
    if o.keys().any(|k| k != "names" && k != "needed") {
        return None;
    }
    let spec = crate::spec();
    let names: Vec<String> = o.get("names")?.as_array().filter(|a| !a.is_empty())?.iter().map(|x| x.as_str().filter(|s| spec.is("id", s)).map(String::from)).collect::<Option<_>>()?;
    if names.iter().enumerate().any(|(i, n)| names[..i].contains(n)) {
        return None;
    }
    let needed = match (o.get("needed"), names.len()) {
        (None, 1) => 1,
        (None, _) => return None,
        (Some(n), len) => count_stated(Some(n), Some(len))? as usize,
    };
    Some((names, needed))
}

/// The clocks a value names, or None when it is not well formed (the check refuses it, `shape`; a fold reads nothing from it).
pub(crate) fn clocks_of(v: &Value) -> Option<Clocks> {
    let o = v.as_object()?;
    if o.keys().any(|k| k != "names" && k != "needed") {
        return None;
    }
    let spec = crate::spec();
    let names: Vec<String> = o.get("names")?.as_array().filter(|a| !a.is_empty())?.iter().map(|x| x.as_str().filter(|s| spec.is("id", s)).map(String::from)).collect::<Option<_>>()?;
    // a sorted set of block ids, each naming one line (blocks.md, A named clock)
    if names.windows(2).any(|p| p[0] >= p[1]) {
        return None;
    }
    let needed = match (o.get("needed"), names.len()) {
        (None, 1) => 1,
        (None, _) => return None,
        (Some(n), len) => count_stated(Some(n), Some(len))? as usize,
    };
    Some(Clocks { names, needed })
}


// Two decimal strings compared exactly.
#[cfg(feature = "folds")]
fn compare(a: &str, b: &str) -> Option<core::cmp::Ordering> {
    Some(crate::decimal::Dec::parse(a)?.cmp(&crate::decimal::Dec::parse(b)?))
}

// The closed list of ops is protocol.json `condition_ops`; what each means is fixed in `op_holds`.
#[cfg(feature = "folds")]
fn op_known(op: &str) -> bool {
    crate::spec().list("condition_ops").iter().any(|o| o == op)
}

#[cfg(feature = "folds")]
fn op_holds(op: &str, order: core::cmp::Ordering) -> bool {
    use core::cmp::Ordering::*;
    if !op_known(op) {
        return false;
    }
    match op {
        "lt" => order == Less,
        "le" => order != Greater,
        "gt" => order == Greater,
        "ge" => order != Less,
        "eq" => order == Equal,
        _ => false,
    }
}

/// Whether a `reading_condition` holds on the readings given, at the reader's clock `now`:
/// `{ reading: <sensor thing>, kind, op, value: { value, unit }, over: <duration> }`, op one of lt, le, gt, ge, eq.
/// The readings are the `observe`s of that `kind` naming the sensor in `refs.from`, each with an `amount` in the
/// condition's unit and an `at`. It holds when a reading at or before the start of the window (`now` less `over`)
/// shows the state at its start, and every reading since then keeps to the rule.
#[cfg(feature = "folds")]
pub fn reading_condition_holds(condition: &Value, blocks: &[Value], now: &str) -> bool {
    let (Some(sensor), Some(kind), Some(op), Some(over)) = (
        condition.get("reading").and_then(Value::as_str),
        condition.get("kind").and_then(Value::as_str),
        condition.get("op").and_then(Value::as_str),
        condition.get("over").and_then(Value::as_str),
    ) else {
        return false;
    };
    let (Some(want), Some(unit)) = (get(condition, "value.value").and_then(Value::as_str), get(condition, "value.unit")) else {
        return false;
    };
    let Some(start) = crate::time::add_duration(now, over, -1) else { return false };
    // A reading counts only if it speaks for the sensor: signed by the sensor itself, or speaking for the sensor's owner (the ownership fold
    // of the sensor thing), signed by a key of hers (authority.md, Who a block speaks for). A reading a tool signs under a grant speaks for
    // the tool alone, and a device that names the sensor in `refs.from` without speaking for her confirms nothing.
    let index = crate::js::blocks_index(blocks);
    let owner = index.get(sensor).and_then(|s| crate::fold::owner_of(s, blocks));
    let speaks_for_owner = |who: Option<&str>, reading: &Value| who.is_some() && owner.is_some() && (who == owner.as_deref() || crate::fold::speaker_of(reading, &index, None).as_deref() == owner.as_deref());
    let readings: Vec<(&str, &str)> = blocks
        .iter()
        .filter(|b| {
            type_of(b) == "observe"
                && ss(b, "kind") == Some(kind)
                && list(rf(b, "from")).contains(&sensor)
                && get(b, "state.amount.unit") == Some(unit)
                && (rs(b, "author") == Some(sensor) || speaks_for_owner(rs(b, "author"), b))
        })
        .filter_map(|b| Some((ss(b, "at")?, get(b, "state.amount.value")?.as_str()?)))
        .filter(|(at, _)| *at <= now)
        .collect();
    // The reading carried into the window is the latest at or before its start; where several share that instant, every one of
    // them must keep to the rule (tasks.md), so no order among them is read.
    let Some(carried_at) = readings.iter().map(|(at, _)| *at).filter(|at| *at <= start.as_str()).max() else {
        return false;
    };
    readings
        .iter()
        .filter(|(at, _)| *at >= carried_at)
        .all(|(_, v)| compare(v, want).is_some_and(|o| op_holds(op, o)))
}

/// Whether a condition holds (promises.md, Conditions): on the blocks in the causal past of the block it is read for (`at`), or on
/// every block given with none, never on a reader's clock. One of:
/// - `{ settled: <first promise> }`: that promise is done (its stage);
/// - `{ accepted: <first promise> }`: that deal binds: its stage is accepted or further along (underway, done,
///   reversed, or stopped onward), read from its promise fold;
/// - `{ deed: <block> }`: that block is given and counts;
/// - `{ paid: <first promise> }`: that deal's price is paid in full;
/// - `{ opened: <commitment> }`: a counted block carries its opening;
/// - `{ ruled: <deal>, by: <judge>, awards: <person> }`: the judge's head ruling on the deal awards something to that person;
/// - `{ stopped: <first promise>, side: from | to }`: a counted onward stop of that deal speaking for that side;
/// - `{ closed: <id> }`: a key grant that leaves no voice of that id's list stands;
/// - a `reading` (a bare sensor reading can never be shown: it never holds);
/// - `{ signal: <observe kind>, by: { names, needed }, subject, op, value }`: at least `by.needed`
///   different signers that `by` names have signed a counted observe of that kind that they have not themselves defeated;
/// - `{ within | without: <condition>, deadline, clocks }`: shown by the clocks' cutoffs, by their place.
/// A condition reads three ways: it holds (`Some(true)`), it does not (`Some(false)`, also for a shape written wrong), or the protocol does
/// not read it (`None`): a condition of any other shape is data for its schema's readers.
#[cfg(feature = "folds")]
pub fn condition_holds(condition: &Value, blocks: &[Value], at: Option<&Value>) -> Option<bool> {
    // the shapes the protocol reads are protocol.json `condition_shapes`; what each means is fixed here
    if !reads(condition) {
        return None;
    }
    Some(match at {
        Some(b) => {
            let idx = crate::js::blocks_index(blocks.iter().filter(|x| crate::js::hash_of(x) != crate::js::hash_of(b)).chain([b]));
            let past = idx.past_of(b);
            let seen: Vec<Value> = blocks.iter().filter(|x| past.contains(crate::js::hash_of(x))).cloned().collect();
            condition_holds_read(condition, &seen)
        }
        None => condition_holds_read(condition, blocks),
    })
}

/// Whether the protocol reads a condition: it has a key of `condition_shapes`, and a `without` wraps one it reads.
#[cfg(feature = "folds")]
fn reads(condition: &Value) -> bool {
    let Some(c) = condition.as_object() else { return false };
    if let Some(inner) = c.get("without").or_else(|| c.get("within")) {
        return reads(inner);
    }
    // a named reading (protocol.json `named_readings`) is not run by the core: its condition is not read
    let spec = crate::spec();
    spec.list("condition_shapes").iter().any(|k| c.contains_key(k.as_str())) && !spec.list("named_readings").iter().any(|k| c.contains_key(k.as_str()))
}

/// What is wrong with a condition's shape, for the three shapes the check reads (`without`, `opened`, `paid`); None when it is well
/// formed or is of another shape (data for its schema's readers). `without` is `{ without, deadline, clocks }` and nothing else.
pub(crate) fn condition_malformed(condition: &Value) -> Option<String> {
    let c = condition.as_object()?;
    let spec = crate::spec();
    if let Some(inner) = c.get("without").or_else(|| c.get("within")) {
        if c.keys().any(|k| !["without", "within", "deadline", "clocks"].contains(&k.as_str())) || (c.contains_key("without") && c.contains_key("within")) {
            return Some("a condition without (or within) is { without: <condition>, deadline, clocks } and nothing else".into());
        }
        if !c.get("deadline").is_some_and(|d| crate::time::is_time(Some(d))) {
            return Some("a condition without names its deadline: a time".into());
        }
        if !c.get("clocks").and_then(clocks_of).is_some() {
            return Some("a condition without names its clocks: { names (ids), needed } (no default clock; needed when there is more than one name)".into());
        }
        if !inner.is_object() {
            return Some("a condition without wraps a condition".into());
        }
        return condition_malformed(inner);
    }
    let one_hash = |k: &str| c.get(k).is_some_and(|v| v.as_str().is_some_and(|t| spec.is("id", t)));
    if c.contains_key("opened") && !one_hash("opened") {
        return Some("a condition opened names a commitment (privacy.md): an id".into());
    }
    if c.contains_key("paid") && !one_hash("paid") {
        return Some("a condition paid names a first promise: an id".into());
    }
    None
}
#[cfg(feature = "folds")]
fn condition_holds_read(condition: &Value, blocks: &[Value]) -> bool {
    let index = crate::js::blocks_index(blocks);
    // that promise is done (no refrain clause, no reader's clock)
    if let Some(id) = condition.get("settled").and_then(Value::as_str) {
        return index.get(id).is_some_and(|p| crate::fold::promise_stage(p, blocks, &crate::fold::StageOptions::default()).get("stage").and_then(Value::as_str) == Some("done"));
    }
    // `{ stopped: <first promise>, side }`: a counted onward stop of that deal that speaks for that side
    if let Some(id) = condition.get("stopped").and_then(Value::as_str) {
        let Some(side) = condition.get("side").and_then(Value::as_str).filter(|s| matches!(*s, "from" | "to")) else { return false };
        return index.get(id).is_some_and(|p| crate::fold::stopped_onward_by(p, blocks, side));
    }
    // `{ closed: <id> }`: a key grant that leaves no voice of that id's list stands
    if let Some(id) = condition.get("closed").and_then(Value::as_str) {
        return !crate::identity::closes_of(id, &crate::fold::read_all(blocks.iter())).is_empty();
    }
    // A deal binds: the stage of the first promise it names is accepted or further along. A stop before acceptance, a
    // decline, an offer or ask unanswered, or one the reader's clock has seen expire binds nothing. A deal stopped onward did bind.
    if let Some(id) = condition.get("accepted").and_then(Value::as_str) {
        return index.get(id).is_some_and(|p| crate::fold::binds(&crate::fold::promise_stage(p, blocks, &crate::fold::StageOptions::default())));
    }
    if let Some(id) = condition.get("deed").and_then(Value::as_str) {
        return index.get(id).is_some_and(|b| crate::forks::counts_in(b, &index));
    }
    // That deal's price is paid in full (the price side of the deal, read from its stage; it needs a binding accept, which gives it a total).
    if let Some(id) = condition.get("paid").and_then(Value::as_str) {
        return index.get(id).is_some_and(|p| {
            let read = crate::fold::read_all(core::iter::once(p).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()));
            let (view, paid_up) = crate::views::promise_view_read(hash_of(p), &read, None);
            paid_up && view.get("total").is_some_and(|t| !t.is_null())
        });
    }
    // Someone shows the code: a counted block carries the opening of the commitment (privacy.md, A commitment), whoever wrote it.
    if let Some(commitment) = condition.get("opened").and_then(Value::as_str) {
        let suite = crate::block::suite_of_id(commitment);
        return index.values().any(|b| {
            st(b, "opening").is_some_and(|o| match (o.get("salt").and_then(Value::as_str), o.get("value")) {
                (Some(salt), Some(value)) => {
                    let text = match value {
                        Value::String(t) => t.clone(),
                        other => crate::canonical::canonical_json(other),
                    };
                    crate::audience::opens(&suite, salt, &text, commitment)
                }
                _ => false,
            }) && crate::forks::counts_in(b, &index)
        });
    }
    // A judge's ruling awards to a person (promises.md, Rulings)
    if condition.get("ruled").is_some() {
        return matches!(crate::fold::ruled(condition, &index), Some(Ok(_)));
    }
    if condition.get("without").is_some() || condition.get("within").is_some() {
        return by_deadline(condition, blocks, &index);
    }
    // a bare `reading` can never be shown (it names no signer, and reads dates on no clock): it never holds
    if condition.get("reading").is_some() {
        return false;
    }
    let Some(kind) = condition.get("signal").and_then(Value::as_str) else { return false };
    // `by` is a panel: one name needs no `needed`, more than one states it, else the signal is written wrong and does not hold
    let Some((by, needed)) = condition.get("by").and_then(panel_of) else { return false };
    let by: Vec<&str> = by.iter().map(String::as_str).collect();
    let needed = Some(needed as f64);
    let subject = match condition.get("subject") {
        None => None,
        Some(Value::String(s)) => Some(s.as_str()),
        Some(_) => return false,
    };
    let rule = match (condition.get("op"), condition.get("value")) {
        (None, None) => None,
        (Some(op), Some(value)) => {
            let op = op.as_str().filter(|o| op_known(o));
            let want = value.get("value").and_then(Value::as_str).filter(|v| crate::decimal::Dec::parse(v).is_some());
            match (op, want, value.get("unit")) {
                (Some(op), Some(want), Some(unit)) => Some((op, want, Some(unit))),
                _ => return false,
            }
        }
        _ => return false,
    };
    // The voice is its signer: a signal under a grant speaks for its signer alone (authority.md, Blocks that bind: every block under a grant
    // that is none of those speaks for its signer alone).
    let voice = |o: &Value| -> Option<String> { rs(o, "author").map(String::from) };
    // A signer takes their own signal back by defeating it: the defeat is hers when it speaks for the voice the signal speaks for.
    let withdrawn = |o: &Value| {
        let mine = voice(o);
        index.values().any(|d| list(rf(d, "defeats")).contains(&hash_of(o)) && mine.is_some() && voice(d) == mine && crate::forks::counts_in(d, &index))
    };
    // The cheap tests first, the costly ones last, and a signer already counted is skipped, so many readings by one signer cost one read of
    // the folds.
    let mut counted: alloc::collections::BTreeSet<String> = Default::default();
    let signers = index.values().filter_map(|o| {
        // a signal counts once it is counted, whatever its `at`
        if type_of(o) != "observe" || ss(o, "kind") != Some(kind) {
            return None;
        }
        // The voice is whom the block speaks for (folds.md, Who a block speaks for): its author, or, for a block that passes its grant's whole
        // authority test, the grantor ("your refusal notes under this rule speak for me"), so a lead who signs under forty grants counts forty.
        let author_owned: String = voice(o)?;
        let author: &str = &author_owned;
        if counted.contains(author) {
            return None;
        }
        // a signer `by` names
        if !by.iter().any(|who| *who == author) {
            return None;
        }
        if subject.is_some_and(|s| !list(rf(o, "subject")).contains(&s)) {
            return None;
        }
        if let Some((op, want, unit)) = rule {
            let ok = get(o, "state.amount.unit") == unit
                && get(o, "state.amount.value").and_then(Value::as_str).and_then(|v| compare(v, want)).is_some_and(|ord| op_holds(op, ord));
            if !ok {
                return None;
            }
        }
        if !crate::forks::counts_in(o, &index) || withdrawn(o) {
            return None;
        }
        if by.iter().any(|who| *who == author) {
            counted.insert(author_owned.clone());
            Some(author_owned.clone())
        } else {
            None
        }
    });
    crate::js::quorum(signers, needed)
}

/// `{ within: <condition>, deadline: T, clocks }` holds when the inner condition held by T; `{ without: ... }` holds when it did not (promises.md,
/// Conditions). a time is shown only by the clocks' cutoffs, by their place; no reader's clock is read. Each line of
/// the clock reads the inner condition on the blocks it shows before T (a block that decides the inner condition counts only where that
/// line holds a receipt of it, or holds it, with no cutoff of T before it): it held by T on that line, or, once the line holds the cutoff
/// of T, it did not. The reading that makes the word hold (it moves a thing out of its signer's hand) needs `needed` lines; the other,
/// which kills it, takes `names` less `needed`, plus one (Which reading needs `needed`). A wrapper written wrong holds for nothing.
#[cfg(feature = "folds")]
fn by_deadline(condition: &Value, blocks: &[Value], index: &crate::js::Index) -> bool {
    deadline_lines(condition, blocks, index).is_some_and(|r| r.holds())
}

/// What a deadline condition's clock lines show: how many lines show the inner held by T and how many show it did not, with the blocks
/// that show each (receipts, the deciders a line holds, cutoffs).
#[cfg(feature = "folds")]
pub(crate) struct ByDeadline {
    pub yes: usize,
    pub no: usize,
    pub yes_by: Vec<String>,
    pub no_by: Vec<String>,
    pub names: usize,
    pub needed: usize,
    pub without: bool,
}
#[cfg(feature = "folds")]
impl ByDeadline {
    pub(crate) fn holds(&self) -> bool {
        (if self.without { self.no } else { self.yes }) >= self.needed
    }
    /// The blocks that show it can no longer hold, once enough lines show the other reading ; None while it may.
    pub(crate) fn dead(&self) -> Option<Vec<String>> {
        let (n, by) = if self.without { (self.yes, &self.yes_by) } else { (self.no, &self.no_by) };
        (n >= (self.names + 1).saturating_sub(self.needed)).then(|| by.clone())
    }
}

#[cfg(feature = "folds")]
pub(crate) fn deadline_lines(condition: &Value, blocks: &[Value], index: &crate::js::Index) -> Option<ByDeadline> {
    if condition_malformed(condition).is_some() {
        return None;
    }
    let without = condition.get("without").is_some();
    let (inner, deadline, clocks) =
        (condition.get("without").or_else(|| condition.get("within"))?, condition.get("deadline").and_then(Value::as_str)?, condition.get("clocks").and_then(clocks_of)?);
    let deciders = deciders_of(inner, index);
    let all = |_: &str| true;
    let mut r = ByDeadline { yes: 0, no: 0, yes_by: Vec::new(), no_by: Vec::new(), names: clocks.names.len(), needed: clocks.needed, without };
    for name in &clocks.names {
        let Some(line) = crate::line::line_named(name, index) else { continue };
        let shown: Vec<String> = deciders.iter().filter(|d| crate::line::before_time(d, deadline, None, &line, index, &all) == Some(true)).cloned().collect();
        let in_time: Vec<Value> = blocks.iter().filter(|b| !deciders.iter().any(|d| d == hash_of(b)) || shown.iter().any(|d| d == hash_of(b))).cloned().collect();
        if condition_holds_read(inner, &in_time) {
            r.yes += 1;
            for d in &shown {
                r.yes_by.push(d.clone());
                r.yes_by.extend(crate::line::receipts_of(d, &line, index, &all).into_iter().map(|x| hash_of(x).to_string()));
            }
        } else if let Some(c) = crate::line::cutoff_on(deadline, None, &line, index, &all) {
            r.no += 1;
            r.no_by.push(hash_of(c).to_string());
        }
    }
    Some(r)
}

/// whether a condition can no longer hold, by the signed words and clock it names, and the blocks that show it (a later draw of
/// the giver's that has one of them in its past is free of the hold). Read only from the clock's own readings: for `within`, its
/// no-reading; for `without`, the yes-reading of its inner condition. A condition that can never be shown (a bare sensor `reading`, which
/// needs a reader's clock) can no longer hold from its signing (`Some(vec![])`: nothing need be seen).
/// Every other shape (a bare signal, a deed, a deal's stage) may still hold later, so it never dies; a `bench` of `none`
/// is not read here.
#[cfg(feature = "folds")]
pub(crate) fn condition_dead(condition: &Value, blocks: &[Value]) -> Option<Vec<String>> {
    if condition.get("reading").is_some() {
        return Some(Vec::new());
    }
    if condition.get("without").is_none() && condition.get("within").is_none() || !reads(condition) {
        return None;
    }
    let index = crate::js::blocks_index(blocks);
    deadline_lines(condition, blocks, &index)?.dead()
}

/// The blocks that decide a condition, which a clock must have dated for it to hold by a time: the deal's blocks for `settled`, `accepted`
/// and `paid`; the named block for `deed`; the observes of the kind for a signal or a reading; the blocks carrying an opening for `opened`.
#[cfg(feature = "folds")]
fn deciders_of(c: &Value, index: &crate::js::Index) -> Vec<String> {
    let of_deal = |p: &str| -> Vec<String> {
        index.values().filter(|b| hash_of(b) != p && list(rf(b, "for")).contains(&p) && !(type_of(b) == "observe" && matches!(ss(b, "kind"), Some("receipt" | "cutoff")))).map(|b| hash_of(b).to_string()).collect()
    };
    let observes = |kind: &str| -> Vec<String> { index.values().filter(|b| type_of(b) == "observe" && ss(b, "kind") == Some(kind)).map(|b| hash_of(b).to_string()).collect() };
    if let Some(inner) = c.get("without").or_else(|| c.get("within")) {
        return deciders_of(inner, index);
    }
    for k in ["settled", "accepted", "paid", "stopped"] {
        if let Some(p) = c.get(k).and_then(Value::as_str) {
            return of_deal(p);
        }
    }
    if let Some(b) = c.get("deed").and_then(Value::as_str) {
        return vec![b.to_string()];
    }
    if let Some(kind) = c.get("signal").and_then(Value::as_str).or_else(|| c.get("kind").filter(|_| c.get("reading").is_some()).and_then(Value::as_str)) {
        return observes(kind);
    }
    if c.get("ruled").is_some() {
        return observes("ruling");
    }
    // her close is a key grant of hers
    if let Some(id) = c.get("closed").and_then(Value::as_str) {
        return index.values().filter(|b| type_of(b) == "grant" && rs(b, "author") == Some(id)).map(|b| hash_of(b).to_string()).collect();
    }
    if c.get("opened").is_some() {
        return index.values().filter(|b| st(b, "opening").is_some()).map(|b| hash_of(b).to_string()).collect();
    }
    Vec::new()
}

/// A plan's near horizon: the sub-tasks (first promises whose `refs.for` names the parent) a planner may release now.
/// Kept simple: the children of a parent, in the order given, so an edge service can pick the near ones.
pub fn children_of(parent: &str, blocks: &[Value]) -> Vec<String> {
    blocks
        .iter()
        .filter(|b| type_of(b) == "promise")
        .filter(|b| list(rf(b, "for")).contains(&parent) && rf(b, "answers").is_none())
        .map(|b| hash_of(b).to_string())
        .collect()
}

