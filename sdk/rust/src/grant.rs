//! Authority (protocol.md §7). A grant gives authority to `refs.to` (left out, to anyone), within `state.scope`. A
//! child grant (`refs.parent`) is a subset of its parent on every field (invariant 10), and a grant is live only while
//! every ancestor is (invariant 9). A grant carries no status: its author ends it by an `updates` with stopped; the
//! receiver declines or leaves by an `answers`. This is the grant check a micro that acts in the world needs.
use crate::error::Refusal;
use crate::js::{get, hash_of, list, rf, rs, ss, st, strict_eq, text, truthy, Index};
use crate::prelude::*;
use crate::time::compare_durations;

pub use crate::time::{add_duration, parse_duration};

// A child's value holds every part of the parent's (sets as sets, objects key by key).
fn contains(outer: Option<&Value>, inner: Option<&Value>) -> bool {
    match inner {
        None => true,
        Some(Value::Array(items)) => match outer {
            Some(Value::Array(others)) => items.iter().all(|item| {
                others.iter().any(|other| {
                    contains(Some(other), Some(item)) && contains(Some(item), Some(other))
                })
            }),
            _ => false,
        },
        Some(Value::Object(map)) => match outer {
            Some(o @ (Value::Object(_) | Value::Array(_))) => {
                map.iter().all(|(k, v)| contains(o.get(k), Some(v)))
            }
            _ => false,
        },
        Some(other) => strict_eq(outer, Some(other)),
    }
}

/// What makes a child grant wider than its parent, in plain words (empty when it is within it).
pub fn scope_within(child: &Value, parent: &Value) -> Vec<String> {
    scope_refusals(child, parent)
        .into_iter()
        .map(|one| one.detail)
        .collect()
}

/// What makes a child grant wider than its parent: `[{ code, detail }]` (`wider_than_parent`, `not_receiver`); empty
/// when it is within it.
pub fn scope_refusals(child: &Value, parent: &Value) -> Vec<Refusal> {
    static EMPTY: Value = Value::Null;
    let empty = json!({});
    let c = st(child, "scope")
        .filter(|v| truthy(Some(v)))
        .unwrap_or(&empty);
    let p = st(parent, "scope")
        .filter(|v| truthy(Some(v)))
        .unwrap_or(&empty);
    let from = ss(parent, "at")
        .filter(|s| !s.is_empty())
        .unwrap_or("2000-01-01T00:00:00.000Z");
    let mut wrong: Vec<Refusal> = Vec::new();
    let wider = |detail: String| Refusal::new("wider_than_parent", detail);
    for set in ["acts", "parties"] {
        let Some(ps) = p.get(set) else { continue };
        let within = match (c.get(set), ps) {
            (Some(Value::Array(cs)), Value::Array(ps)) => cs
                .iter()
                .all(|item| ps.iter().any(|x| strict_eq(Some(x), Some(item)))),
            _ => false,
        };
        if !within {
            wrong.push(wider(format!("scope.{set} is a subset of the parent's")));
        }
    }
    if truthy(p.get("limit")) {
        let (cl, pl) = (c.get("limit").unwrap_or(&EMPTY), p.get("limit").unwrap());
        let ok = truthy(c.get("limit"))
            && strict_eq(cl.get("currency"), pl.get("currency"))
            && crate::js::number_of(cl.get("minor")) <= crate::js::number_of(pl.get("minor"));
        if !ok {
            wrong.push(wider("scope.limit is no larger than the parent's".into()));
        }
    }
    let duration = |key: &str, ok: fn(i32) -> bool| -> bool {
        match (
            c.get(key).and_then(Value::as_str),
            p.get(key).and_then(Value::as_str),
        ) {
            (Some(a), Some(b)) if truthy(c.get(key)) => {
                compare_durations(a, b, from).is_some_and(ok)
            }
            _ => false,
        }
    };
    if truthy(p.get("per")) && !duration("per", |s| s <= 0) {
        wrong.push(wider("scope.per is no longer than the parent's".into()));
    }
    if truthy(p.get("until")) {
        let ok = truthy(c.get("until")) && text(c.get("until")) <= text(p.get("until"));
        if !ok {
            wrong.push(wider("scope.until is no later than the parent's".into()));
        }
    }
    if truthy(p.get("notice")) && !duration("notice", |s| s >= 0) {
        wrong.push(wider("scope.notice is no shorter than the parent's".into()));
    }
    if p.get("condition").is_some() && !contains(c.get("condition"), p.get("condition")) {
        wrong.push(wider(
            "scope.condition keeps every condition of the parent's".into(),
        ));
    }
    let depth = match st(parent, "depth") {
        None | Some(Value::Null) => 0.0,
        Some(v) => crate::js::number_of(Some(v)),
    };
    let child_depth = match st(child, "depth") {
        None | Some(Value::Null) => 0.0,
        Some(v) => crate::js::number_of(Some(v)),
    };
    if !(depth >= 1.0 && child_depth <= depth - 1.0) {
        wrong.push(wider("state.depth is smaller than the parent's by at least one (a grant with no depth is not passed on)".into()));
    }
    if truthy(rf(parent, "to")) && !strict_eq(rf(child, "author"), rf(parent, "to")) {
        wrong.push(Refusal::new(
            "not_receiver",
            "a grant is passed on by the one who received it",
        ));
    }
    wrong
}

/// Why a grant is not live among these blocks (its own end, the receiver's, its `until` on the reader's clock, an
/// ancestor's): empty when live. `now` is the reader's own clock.
pub fn why_not_live_in(grant: Option<&Value>, index: &Index, now: Option<&str>) -> Vec<String> {
    why_not_live_seen(grant, index, now, &mut Vec::new())
}

fn why_not_live_seen(
    grant: Option<&Value>,
    index: &Index,
    now: Option<&str>,
    seen: &mut Vec<String>,
) -> Vec<String> {
    let Some(grant) = grant else {
        return vec!["the grant is not held".into()];
    };
    let gh = hash_of(grant).to_string();
    if seen.contains(&gh) {
        return vec!["its parents form a cycle".into()];
    }
    seen.push(gh.clone());
    let mut wrong = Vec::new();
    for block in index.values() {
        if crate::js::type_of(block) != "grant" || st(block, "status").is_none() {
            continue;
        }
        let ends = matches!(ss(block, "status"), Some("stopped" | "declined"));
        let author_or_as = strict_eq(rf(block, "author"), rf(grant, "author"))
            || (truthy(rf(grant, "as")) && strict_eq(rf(block, "as"), rf(grant, "as")));
        if ends && list(rf(block, "updates")).contains(&gh.as_str()) && author_or_as {
            wrong.push("its author stopped it".into());
        }
        if ends
            && list(rf(block, "answers")).contains(&gh.as_str())
            && truthy(rf(grant, "to"))
            && strict_eq(rf(block, "author"), rf(grant, "to"))
        {
            wrong.push("its receiver ended it".into());
        }
    }
    if let (Some(now), Some(until)) = (
        now.filter(|n| !n.is_empty()),
        get(grant, "state.scope.until").filter(|v| truthy(Some(v))),
    ) {
        if text(Some(until)).as_str() <= now {
            wrong.push("its scope.until has passed".into());
        }
    }
    if truthy(rf(grant, "parent")) {
        let parent = rs(grant, "parent").and_then(|h| index.get(h));
        let above = why_not_live_seen(parent, index, now, seen);
        if !above.is_empty() {
            wrong.push(format!("its parent is not live ({})", above.join("; ")));
        } else if let Some(parent) = parent {
            wrong.extend(scope_within(grant, parent));
        }
    }
    wrong
}

/// Why a grant is not live among these blocks: empty when live.
pub fn why_not_live(grant: &Value, blocks: &[Value], now: Option<&str>) -> Vec<String> {
    why_not_live_in(Some(grant), &crate::js::held_index(blocks), now)
}

pub fn is_live_in(grant: &Value, index: &Index, now: Option<&str>) -> bool {
    why_not_live_in(Some(grant), index, now).is_empty()
}

/// Whether a grant is live among these blocks.
pub fn is_live(grant: &Value, blocks: &[Value], now: Option<&str>) -> bool {
    why_not_live(grant, blocks, now).is_empty()
}

/// The grants above this one, nearest first.
pub fn ancestors(grant: &Value, blocks: &[Value]) -> Vec<Value> {
    let index = crate::js::held_index(blocks);
    let (mut out, mut seen): (Vec<Value>, Vec<String>) = (Vec::new(), Vec::new());
    let mut at = rs(grant, "parent").and_then(|h| index.get(h));
    while let Some(g) = at {
        if seen.iter().any(|s| s == hash_of(g)) {
            break;
        }
        seen.push(hash_of(g).to_string());
        out.push(g.clone());
        at = rs(g, "parent").and_then(|h| index.get(h));
    }
    out
}

/// Whether a block signed under a grant (`refs.under`) speaks for its grantor: empty, or why not. `scope.acts` lists
/// the block types or `type.kind` names it covers.
pub fn why_not_under_in(block: &Value, index: &Index, now: Option<&str>) -> Vec<String> {
    let grant = rs(block, "under").and_then(|h| index.get(h));
    let Some(grant) = grant.filter(|g| crate::js::type_of(g) == "grant") else {
        return vec!["refs.under names no grant this reader holds".into()];
    };
    let mut wrong = Vec::new();
    // A witness's trigger (profiles/successor.md) is the witness's own word, signed under the successor grant, which is
    // for the successor: the witnesses the grant lists are the ones it covers, and it has no scope.
    let trigger = is_trigger(block, grant);
    if trigger == Some(false) {
        wrong.push("the signer is not a witness the successor grant names".into());
    }
    if trigger.is_none() && truthy(rf(grant, "to")) && !strict_eq(rf(grant, "to"), rf(block, "author")) {
        wrong.push("the grant is for someone else".into());
    }
    if let Some(acts) = get(grant, "state.scope.acts").filter(|v| trigger.is_none() && truthy(Some(v))) {
        let t = crate::js::type_of(block);
        let kind = text(st(block, "kind"));
        let typed = format!("{t}.{kind}");
        let has = |name: &str| {
            acts.as_array()
                .is_some_and(|a| a.iter().any(|x| x.as_str() == Some(name)))
        };
        if !has(t) && !has(&typed) {
            let shown = if truthy(st(block, "kind")) {
                typed.clone()
            } else {
                t.to_string()
            };
            wrong.push(format!("the grant's acts do not cover a {shown}"));
        }
    }
    wrong.extend(why_not_live_in(Some(grant), index, now));
    wrong.extend(why_not_live_undo(block, index));
    wrong
}

/// Whether a block is a trigger under a successor grant: `None` when it is not one (an `observe` of kind `trigger` under
/// a grant of kind `successor`); `Some(true)` when its author is a witness the grant lists, `Some(false)` when not.
#[cfg(feature = "successor")]
fn is_trigger(block: &Value, grant: &Value) -> Option<bool> {
    (crate::js::type_of(block) == "observe" && ss(block, "kind") == Some("trigger") && ss(grant, "kind") == Some("successor"))
        .then(|| rs(block, "author").is_some_and(|a| list(st(grant, "witnesses")).contains(&a)))
}
#[cfg(not(feature = "successor"))]
fn is_trigger(_block: &Value, _grant: &Value) -> Option<bool> {
    None
}

/// The act a block is, named as `type.kind` (or `type` with no kind).
pub fn act_name(block: &Value) -> String {
    match st(block, "kind").filter(|v| truthy(Some(v))) {
        Some(k) => format!("{}.{}", crate::js::type_of(block), text(Some(k))),
        None => crate::js::type_of(block).to_string(),
    }
}

/// Acts that cannot be undone (authority.md): a block whose schema (`refs.schema`) says `undo: never` is `not_live`
/// unless it has a specific ask its principal answered `accepted`, naming that act, or a grant whose `scope.acts` names
/// that act and has a `limit`. Empty when the act can be taken back, or the block has what it needs. A broad grant
/// that lists only a kind of act is not enough. The block names that ask in `refs.for`. An ask names the act when its `state.what` is the act's name or it
/// follows the same schema; the principal is the grant's author, or the circle the block signs `as`.
pub fn why_not_live_undo(block: &Value, index: &Index) -> Vec<String> {
    let schema = rs(block, "schema").and_then(|h| index.get(h));
    if !schema.is_some_and(|s| ss(s, "undo") == Some("never")) {
        return vec![];
    }
    let act = act_name(block);
    let grant = rs(block, "under").and_then(|h| index.get(h));
    let principal = grant
        .and_then(|g| rs(g, "author"))
        .or_else(|| rs(block, "as"))
        .or_else(|| rs(block, "author"));
    let asked = index.values().any(|ask| {
        crate::js::type_of(ask) == "promise"
            && (get(ask, "state.what").and_then(Value::as_str) == Some(act.as_str())
                || (truthy(rf(ask, "schema")) && rf(ask, "schema") == rf(block, "schema")))
            && index.values().any(|a| {
                ss(a, "status") == Some("accepted")
                    && list(rf(a, "answers")).contains(&hash_of(ask))
                    && rs(a, "author") == principal
            })
            && list(rf(block, "for")).contains(&hash_of(ask))
    });
    let granted = grant.is_some_and(|g| {
        get(g, "state.scope.acts")
            .and_then(Value::as_array)
            .is_some_and(|a| a.iter().any(|x| x.as_str() == Some(act.as_str())))
            && truthy(get(g, "state.scope.limit"))
    });
    if asked || granted {
        vec![]
    } else {
        vec![format!(
            "{act} cannot be undone: it needs a specific ask its principal answered accepted, or a grant that names it and has a limit"
        )]
    }
}

/// Whether a block signed under a grant speaks for its grantor, among these blocks: empty, or why not.
pub fn why_not_under(block: &Value, blocks: &[Value], now: Option<&str>) -> Vec<String> {
    why_not_under_in(block, &crate::js::held_index(blocks), now)
}

/// Who answers for an agent or machine: the authors of its live grants of kind operator, naming it in refs.to (§2).
pub fn operators_of(agent: &str, blocks: &[Value], now: Option<&str>) -> Vec<String> {
    let index = crate::js::held_index(blocks);
    let authors: Vec<&str> = index
        .values()
        .filter(|b| {
            crate::js::type_of(b) == "grant"
                && ss(b, "kind") == Some("operator")
                && rs(b, "to") == Some(agent)
                && st(b, "status").is_none()
                && is_live_in(b, &index, now)
        })
        .filter_map(|b| rs(b, "author"))
        .collect();
    crate::js::sorted_set(authors)
}

// ---- The limit is the principal's fence (§7) ----
/// The `observe` of kind limit for a grant, as `{ type, state, refs, audience }` to hand to `write`: `agent`, the
/// grant's receiver, is its whole audience, so no counterparty ever reads the limit and the grant check never looks
/// at it.
pub fn limit_fence(grant_hash: &str, agent: &str, limit: &Value, per: Option<&str>) -> Value {
    let mut state = json!({ "kind": "limit", "limit": limit });
    if let Some(p) = per.filter(|p| !p.is_empty()) {
        state["per"] = json!(p);
    }
    json!({ "type": "observe", "state": state, "refs": { "for": grant_hash }, "audience": [agent] })
}

/// Whether spending `money` stays inside a limit. `limit` is the limit observe, its state, or the money itself;
/// `spent` is what the principal's node has already counted in the period (whole minor units). Money in another
/// currency is never within.
pub fn within_limit(limit: &Value, money: &Value, spent: i64) -> bool {
    let cap = limit.pointer("/state/limit").or_else(|| limit.get("limit")).unwrap_or(limit);
    let (Some(cap_minor), Some(minor)) = (cap.get("minor").and_then(Value::as_i64), money.get("minor").and_then(Value::as_i64)) else {
        return false;
    };
    cap.get("currency").is_some() && cap.get("currency") == money.get("currency") && spent + minor <= cap_minor
}
