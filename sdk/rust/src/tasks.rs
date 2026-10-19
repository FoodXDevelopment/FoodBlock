//! The tasks profile (spec/profiles/tasks.md): any task, software or physical, is a promise, a deed is the worker's own
//! block and evidence is an observe. What code adds is small: a sensor condition is checked against the observes a
//! performer's edge holds. The condition holds the rule; the readings are the evidence; a reading never settles a
//! promise (promises.md, Settling).
use crate::js::{hash_of, list, rf, st, text, type_of};
#[cfg(feature = "folds")]
use crate::js::{get, rs, ss};
use crate::prelude::*;

// A decimal string as an exact fraction: "1.25" is 125 / 100.
#[cfg(feature = "folds")]
fn fraction(value: &str) -> Option<(i128, i128)> {
    let (whole, part) = value.split_once('.').unwrap_or((value, ""));
    let n: i128 = format!("{whole}{part}").parse().ok()?;
    Some((n, 10i128.checked_pow(part.len() as u32)?))
}

#[cfg(feature = "folds")]
fn compare(a: &str, b: &str) -> Option<core::cmp::Ordering> {
    let ((an, ad), (bn, bd)) = (fraction(a)?, fraction(b)?);
    Some((an * bd).cmp(&(bn * ad)))
}

#[cfg(feature = "folds")]
fn op_holds(op: &str, order: core::cmp::Ordering) -> bool {
    use core::cmp::Ordering::*;
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
    // A reading counts only if its signer is the sensor itself, the sensor's owner (the ownership fold of the sensor thing), or an agent
    // the owner named: the receiver of a live `operator` grant the owner signed whose `refs.subject` names the sensor. A grant anyone
    // else signs makes no one an operator of someone's sensor, and a rogue device that names the sensor in `refs.from` confirms nothing.
    let index = crate::js::held_index(blocks);
    let owner = index.get(sensor).and_then(|s| crate::fold::owner_of(s, blocks));
    let operated_by = |who: Option<&str>| {
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
                        && crate::grant::is_live_in(g, &index, Some(now))
                }))
    };
    let mut readings: Vec<(&str, &str)> = blocks
        .iter()
        .filter(|b| {
            type_of(b) == "observe"
                && ss(b, "kind") == Some(kind)
                && list(rf(b, "from")).contains(&sensor)
                && get(b, "state.amount.unit") == Some(unit)
                && (rs(b, "author") == Some(sensor) || operated_by(rs(b, "author")))
        })
        .filter_map(|b| Some((ss(b, "at")?, get(b, "state.amount.value")?.as_str()?)))
        .filter(|(at, _)| *at <= now)
        .collect();
    readings.sort();
    let carried = readings.iter().rev().find(|(at, _)| *at <= start.as_str());
    let since: Vec<&(&str, &str)> = readings.iter().filter(|(at, _)| *at > start.as_str()).collect();
    if carried.is_none() {
        return false;
    }
    carried
        .into_iter()
        .chain(since)
        .all(|(_, v)| compare(v, want).is_some_and(|o| op_holds(op, o)))
}

/// A plan's near horizon: the sub-tasks (first promises whose `refs.for` names the parent) a planner may release now.
/// Kept simple: the children of a parent, in the order held, so an edge service can pick the near ones.
pub fn children_of(parent: &str, blocks: &[Value]) -> Vec<String> {
    blocks
        .iter()
        .filter(|b| type_of(b) == "promise" && st(b, "terms").is_some() || type_of(b) == "promise")
        .filter(|b| list(rf(b, "for")).contains(&parent) && rf(b, "answers").is_none())
        .map(|b| hash_of(b).to_string())
        .collect()
}

#[allow(dead_code)]
fn _t(v: &Value) -> String {
    text(Some(v))
}
