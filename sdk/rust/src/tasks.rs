//! The tasks profile (spec/profiles/tasks.md): any task, software or physical, is a promise, a deed is the worker's own
//! block and evidence is an observe. What code adds is small: a sensor condition is checked against the observes a
//! performer's edge holds. The condition holds the rule; the readings are the evidence; a reading never settles a
//! promise (promises.md, Settling).
use crate::js::{count_stated, hash_of, list, rf, type_of};
#[cfg(feature = "folds")]
use crate::js::{get, rs, ss, st};
use crate::prelude::*;

/// `keepers: { names, needed }`: whose receipts date a block. `names` are ids or `circle#role`; `needed` follows Counts (folds.md): a set
/// of one needs none, a larger set says how many must agree, and none is filled in.
#[derive(Clone)]
pub(crate) struct Keepers {
    pub names: Vec<String>,
    pub needed: usize,
}

/// The keepers a value names, or None when it is not well formed (the check refuses it, `shape`; a fold reads nothing from it).
pub(crate) fn keepers_of(v: &Value) -> Option<Keepers> {
    let o = v.as_object()?;
    if o.keys().any(|k| k != "names" && k != "needed") {
        return None;
    }
    let spec = crate::spec();
    let names: Vec<String> = o.get("names")?.as_array().filter(|a| !a.is_empty())?.iter().map(|x| x.as_str().filter(|s| spec.is("id", s) || spec.is("role_ref", s)).map(String::from)).collect::<Option<_>>()?;
    let needed = match (o.get("needed"), names.len()) {
        (None, 1) => 1,
        (None, _) => return None,
        (Some(n), len) => count_stated(Some(n), Some(len))? as usize,
    };
    Some(Keepers { names, needed })
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

/// Whether a `reading_condition` holds on the readings held, at the reader's clock `now`:
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
    // A reading counts only if its signer is the sensor itself, the sensor's owner (the ownership fold of the sensor thing), or an autonomous system
    // the owner named: the receiver of a live `operator` grant the owner signed whose `refs.subject` names the sensor. A grant anyone
    // else signs makes no one an operator of someone's sensor, and a rogue device that names the sensor in `refs.from` confirms nothing.
    let index = crate::js::held_index(blocks);
    let owner = index.get(sensor).and_then(|s| crate::fold::owner_of(s, blocks));
    // The operator grant is judged as of each reading: a death ends it only for readings that have the close in their causal past.
    let operated_by = |who: Option<&str>, reading: &Value| {
        who.is_some()
            && owner.is_some()
            && (who == owner.as_deref()
                || index.values().any(|g| {
                    type_of(g) == "grant"
                        && ss(g, "kind") == Some("operator")
                        && st(g, "status").is_none()
                        && list(rf(g, "subject")).contains(&sensor)
                        && rs(g, "to") == who
                        && rs(g, "author") == owner.as_deref()
                        && crate::grant::why_not_live_for(Some(g), &index, Some(now), reading).is_empty()
                }))
    };
    let readings: Vec<(&str, &str)> = blocks
        .iter()
        .filter(|b| {
            type_of(b) == "observe"
                && ss(b, "kind") == Some(kind)
                && list(rf(b, "from")).contains(&sensor)
                && get(b, "state.amount.unit") == Some(unit)
                && (rs(b, "author") == Some(sensor) || operated_by(rs(b, "author"), b))
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

/// Whether a condition holds on the blocks held, at the reader's clock `now` (promises.md, Conditions). One of:
/// - `{ settled: <first promise> }`: that promise is done (its view), or it is a refrain whose view is elapsed with its price, if it
///   has one, paid (decision H15: a refrain is never done; its term ran unbreached and nothing is owed);
/// - `{ accepted: <first promise> }`: that deal binds (decision H17): its stage is accepted or further along (underway, done,
///   reversed, breached, or stopped onward), read from its promise fold (no clock);
/// - `{ deed: <block> }`: that block is held and counts;
/// - a `reading_condition` (`reading`, `kind`, `op`, `value`, `over`): a sensor's readings keep to a rule;
/// - `{ signal: <observe kind>, by: [ids or circle#role], signers, subject, op, value }`: at least `signers` (default 1)
///   different signers that `by` names have signed, by `now`, a counted observe of that kind that they have not themselves
///   defeated (naming `subject` in `refs.subject` when one is given, with an `amount` that keeps to `op` and `value` when they
///   are given). A holder of circle#role is one in the circle's fold of the observe's causal past. A moon sighted, a price
///   trigger, an award. `by` is a non-empty list of ids or circle#role; `signers` a whole number of at least 1; `subject` one
///   id; `op` and `value` come together, `value` an amount.
/// A condition reads three ways (promises.md, Conditions): it holds (`Some(true)`), it does not (`Some(false)`, also for one of these
/// four shapes written wrong), or the protocol does not read it (`None`): a condition of any other shape is data for its schema's
/// readers, and the protocol says nothing of it.
#[cfg(feature = "folds")]
pub fn condition_holds(condition: &Value, blocks: &[Value], now: &str) -> Option<bool> {
    // the shapes the protocol reads are protocol.json `condition_shapes`; what each means is fixed here
    reads(condition).then(|| condition_holds_read(condition, blocks, now))
}

/// Whether the protocol reads a condition: it has a key of `condition_shapes`, and a `without` wraps one it reads.
#[cfg(feature = "folds")]
fn reads(condition: &Value) -> bool {
    let Some(c) = condition.as_object() else { return false };
    if let Some(inner) = c.get("without").or_else(|| c.get("within")) {
        return reads(inner);
    }
    crate::spec().list("condition_shapes").iter().any(|k| c.contains_key(k.as_str()))
}

/// What is wrong with a condition's shape, for the three shapes the check reads (`without`, `opened`, `paid`); None when it is well
/// formed or is of another shape (data for its schema's readers). `without` is `{ without, deadline, keepers }` and nothing else.
pub(crate) fn condition_malformed(condition: &Value) -> Option<String> {
    let c = condition.as_object()?;
    let spec = crate::spec();
    if let Some(inner) = c.get("without").or_else(|| c.get("within")) {
        if c.keys().any(|k| !["without", "within", "deadline", "keepers"].contains(&k.as_str())) || (c.contains_key("without") && c.contains_key("within")) {
            return Some("a condition without (or within) is { without: <condition>, deadline, keepers } and nothing else".into());
        }
        if !c.get("deadline").is_some_and(|d| crate::time::is_time(Some(d))) {
            return Some("a condition without names its deadline: a time".into());
        }
        if !c.get("keepers").and_then(keepers_of).is_some() {
            return Some("a condition without names its keepers: { names (ids or circle#role), needed } (no default clock; needed when there is more than one name)".into());
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
fn condition_holds_read(condition: &Value, blocks: &[Value], now: &str) -> bool {
    let index = crate::js::held_index(blocks);
    if let Some(id) = condition.get("settled").and_then(Value::as_str) {
        return index.get(id).is_some_and(|p| {
            let read = crate::fold::read_all(core::iter::once(p).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()));
            let (view, paid_up) = crate::views::promise_view_read(hash_of(p), &read, Some(now));
            match view.get("stage").and_then(Value::as_str) {
                Some("done") => true,
                Some("elapsed") => paid_up,
                _ => false,
            }
        });
    }
    // A deal binds (decision H17): the stage of the first promise it names is accepted or further along. A stop before acceptance, a
    // decline, an offer or ask unanswered, or one the reader's clock has seen expire binds nothing. A deal stopped onward did bind.
    if let Some(id) = condition.get("accepted").and_then(Value::as_str) {
        return index.get(id).is_some_and(|p| crate::fold::binds(&crate::fold::promise_stage(p, blocks, &crate::fold::StageOptions::default())));
    }
    if let Some(id) = condition.get("deed").and_then(Value::as_str) {
        return index.get(id).is_some_and(|b| crate::identity::counts_in(b, &index));
    }
    // That deal's price is paid in full (the price side of the deal, read from its stage; it needs a binding accept, which gives it a total).
    if let Some(id) = condition.get("paid").and_then(Value::as_str) {
        return index.get(id).is_some_and(|p| {
            let read = crate::fold::read_all(core::iter::once(p).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()));
            let (view, paid_up) = crate::views::promise_view_read(hash_of(p), &read, Some(now));
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
            }) && crate::identity::counts_in(b, &index)
        });
    }
    if condition.get("without").is_some() || condition.get("within").is_some() {
        return by_deadline(condition, blocks, &index, now);
    }
    if condition.get("reading").is_some() {
        return reading_condition_holds(condition, blocks, now);
    }
    let Some(kind) = condition.get("signal").and_then(Value::as_str) else { return false };
    let Some(by) = condition.get("by").and_then(Value::as_array).filter(|a| !a.is_empty()) else { return false };
    let by: Vec<&str> = by.iter().filter_map(Value::as_str).collect();
    let named_ok = |n: &&str| !n.is_empty() && n.split_once('#').is_none_or(|(c, r)| !c.is_empty() && !r.is_empty() && !r.contains('#'));
    if by.len() != condition["by"].as_array().map_or(0, Vec::len) || !by.iter().all(named_ok) {
        return false;
    }
    // with no `signers`, one: the plain meaning only where `by` names one signer; a `by` that may name more (two ids, or a role)
    // states how many (decision F2, as E3), else the signal is written wrong and does not hold
    let needed = match condition.get("signers") {
        None if by.len() > 1 || by.iter().any(|n| n.contains('#')) => return false,
        None => Some(1.0),
        Some(n) => match crate::js::count_stated(Some(n), None) {
            Some(n) => Some(n),
            None => return false,
        },
    };
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
    // The voice is whom the block speaks for (folds.md, Who a block speaks for): its author, or, for a block that passes its grant's whole
    // authority test, the grantor ("your refusal notes under this rule speak for me"), so a lead who signs under forty grants counts forty.
    let voice = |o: &Value| -> Option<String> {
        let key = rs(o, "author")?;
        Some(if rs(o, "as").is_none() && rs(o, "under").is_some() { crate::fold::speaker_of(o, &index, None).unwrap_or_else(|| key.to_string()) } else { key.to_string() })
    };
    // A signer takes their own signal back by defeating it: the defeat is hers when it speaks for the voice the signal speaks for.
    let withdrawn = |o: &Value| {
        let mine = voice(o);
        index.values().any(|d| list(rf(d, "defeats")).contains(&hash_of(o)) && mine.is_some() && voice(d) == mine && crate::identity::counts_in(d, &index))
    };
    // The cheap tests first, the costly ones last, and a signer already counted is skipped, so many readings by one signer cost one read of
    // the folds (release 43).
    let mut counted: alloc::collections::BTreeSet<String> = Default::default();
    let signers = index.values().filter_map(|o| {
        if type_of(o) != "observe" || ss(o, "kind") != Some(kind) || !ss(o, "at").is_some_and(|at| at <= now) {
            return None;
        }
        // The voice is whom the block speaks for (folds.md, Who a block speaks for): its author, or, for a block that passes its grant's whole
        // authority test, the grantor ("your refusal notes under this rule speak for me"), so a lead who signs under forty grants counts forty.
        let author_owned: String = voice(o)?;
        let author: &str = &author_owned;
        if counted.contains(author) {
            return None;
        }
        // a signer a plain name or a role in `by` could name; a role is read from the folds last
        if !by.iter().any(|who| who.contains('#') || *who == author) {
            return None;
        }
        if subject.is_some_and(|s| !list(rf(o, "subject")).contains(&s)) {
            return None;
        }
        // a `close` reads only when it truly counts: the successor profile's own test (a defeated trigger, a stopped grant, a dead
        // successor) is the test of a will's condition too (profiles/successor.md, When a close counts)
        #[cfg(feature = "successor")]
        if kind == "close" && !list(rf(o, "subject")).iter().any(|p| crate::grant::closes_of(p, &[], &index).iter().any(|c| c == hash_of(o))) {
            return None;
        }
        if let Some((op, want, unit)) = rule {
            let ok = get(o, "state.amount.unit") == unit
                && get(o, "state.amount.value").and_then(Value::as_str).and_then(|v| compare(v, want)).is_some_and(|ord| op_holds(op, ord));
            if !ok {
                return None;
            }
        }
        if !crate::identity::counts_in(o, &index) || withdrawn(o) {
            return None;
        }
        let named = by.iter().any(|who| match who.split_once('#') {
            Some(_) => crate::fold::members_then(o, who, blocks).iter().any(|m| m == author),
            None => *who == author,
        });
        if named {
            counted.insert(author_owned.clone());
            Some(author_owned.clone())
        } else {
            None
        }
    });
    crate::js::quorum(signers, needed)
}

/// `{ within: <condition>, deadline: T, keepers }` holds when the inner condition held by T; `{ without: ... }` holds when it did not (promises.md,
/// Conditions). By T means read at T, on the blocks that were in time: each block that decides the inner condition counts only if `needed`
/// keepers received it by T (their receipts: the named clock, blocks.md), never by its own `at`. `within` needs no clock. `without` holds
/// once the reader's clock is past T, or `needed` keepers have signed a cutoff through T: the two are exact complements from then on. A
/// wrapper written wrong holds for nothing.
#[cfg(feature = "folds")]
fn by_deadline(condition: &Value, blocks: &[Value], index: &crate::js::Index, now: &str) -> bool {
    if condition_malformed(condition).is_some() {
        return false;
    }
    let negate = condition.get("without").is_some();
    let (Some(inner), Some(deadline), Some(keepers)) =
        (condition.get("without").or_else(|| condition.get("within")), condition.get("deadline").and_then(Value::as_str), condition.get("keepers").and_then(keepers_of))
    else {
        return false;
    };
    if negate {
        let over = !now.is_empty() && now > deadline;
        if !over && !crate::fold::clock::closed_through(&keepers, index).is_some_and(|t| t.as_str() >= deadline) {
            return false;
        }
    }
    let deciders = deciders_of(inner, index);
    let in_time: Vec<Value> = blocks
        .iter()
        .filter(|b| !deciders.iter().any(|d| d == hash_of(b)) || crate::fold::clock::received_by(hash_of(b), &keepers, index, deadline))
        .cloned()
        .collect();
    condition_holds_read(inner, &in_time, deadline) != negate
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
    for k in ["settled", "accepted", "paid"] {
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
    if c.get("opened").is_some() {
        return index.values().filter(|b| st(b, "opening").is_some()).map(|b| hash_of(b).to_string()).collect();
    }
    Vec::new()
}

/// A plan's near horizon: the sub-tasks (first promises whose `refs.for` names the parent) a planner may release now.
/// Kept simple: the children of a parent, in the order held, so an edge service can pick the near ones.
pub fn children_of(parent: &str, blocks: &[Value]) -> Vec<String> {
    blocks
        .iter()
        .filter(|b| type_of(b) == "promise")
        .filter(|b| list(rf(b, "for")).contains(&parent) && rf(b, "answers").is_none())
        .map(|b| hash_of(b).to_string())
        .collect()
}

