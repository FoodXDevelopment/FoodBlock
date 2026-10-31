//! Authority (protocol.md §7). A grant gives authority to `refs.to` (left out, to anyone), within `state.scope`. A
//! child grant (`refs.parent`) is a subset of its parent on every field (invariant 10), and a grant is live only while
//! every ancestor is (invariant 9). A grant carries no status: its author ends it by an `updates` with stopped; the
//! receiver declines or leaves by an `answers`. This is the grant check a micro that acts in the world needs.
use crate::decimal::Dec;
use crate::error::Refusal;
use crate::js::{get, hash_of, int, list, rf, rs, ss, st, Index};
use crate::prelude::*;
use crate::time::compare_durations;

pub use crate::time::{add_duration, parse_duration};

// Both amounts in the same unit, or both money in the same currency (an issuer's currency is an object: compared by its canonical form).
fn same_measure(a: &Value, b: &Value) -> bool {
    let key = if b.get("unit").is_some() { "unit" } else { "currency" };
    let same = |x: &Value, y: &Value| crate::canonical::canonical_json(x) == crate::canonical::canonical_json(y);
    a.get("unit").is_some() == b.get("unit").is_some() && a.get(key).zip(b.get(key)).is_some_and(|(x, y)| same(x, y))
}
// How big money or an amount is, exactly: its minor units, or its value.
fn size_of(v: &Value) -> Option<&Value> {
    if v.get("unit").is_some() { v.get("value") } else { v.get("minor") }
}
// Money in the same currency, or an amount in the same unit, no larger than the other, compared exactly.
fn no_larger(child: &Value, parent: &Value) -> bool {
    same_measure(child, parent) && crate::decimal::compare(size_of(child), size_of(parent)).is_some_and(|o| o.is_le())
}
// A child keeps every condition of its parent and may add more (authority.md): each of the parent's keys with exactly the same
// value (compared by canonical form, nested values and all), or, for a list or a single value, every item of the parent's.
fn keeps_condition(child: Option<&Value>, parent: &Value) -> bool {
    let Some(child) = child else { return false };
    let same = |a: &Value, b: &Value| crate::canonical::canonical_json(a) == crate::canonical::canonical_json(b);
    match (parent, child) {
        (Value::Object(p), Value::Object(c)) => p.iter().all(|(k, v)| c.get(k).is_some_and(|x| same(x, v))),
        _ => {
            let items = |v: &Value| match v {
                Value::Array(a) => a.clone(),
                other => vec![other.clone()],
            };
            let ours = items(child);
            items(parent).iter().all(|x| ours.iter().any(|y| same(x, y)))
        }
    }
}

// The orders of protocol.json `narrower_than`, field by field: [(field, order)].
fn narrower_table() -> Vec<(&'static str, &'static str)> {
    crate::spec().protocol.get("narrower_than").and_then(Value::as_object).map_or(Vec::new(), |t| {
        t.iter().filter_map(|(k, v)| Some((k.as_str(), v.as_str()?))).collect()
    })
}
// narrower_than(child, parent) for one field: None when the child is within the parent's, else how it must be (the end of the
// refusal's sentence). `from` is the parent's `at`: durations are compared by adding both to it (protocol.md §7); a parent with no
// `at` gives no instant, no anchor is filled in, and a child under its `per` or `notice` is refused.
fn wider_by(order: &str, child: Option<&Value>, parent: &Value, from: Option<&str>) -> Option<&'static str> {
    let (ok, rule) = match order {
        "subset" | "subset-or-none" => (
            // acts are names and parties ids: text, matched exactly
            match (child, parent) {
                (Some(Value::Array(cs)), Value::Array(ps)) => cs.iter().all(|c| c.as_str().is_some_and(|i| ps.iter().any(|x| x.as_str() == Some(i)))),
                _ => false,
            },
            "is a subset of the parent's",
        ),
        "at-most" => (child.is_some_and(|c| no_larger(c, parent)), "is no larger than the parent's"),
        "at-least-duration" => (
            match (child.and_then(Value::as_str), parent.as_str()) {
                (Some(a), Some(b)) => from.and_then(|t| compare_durations(a, b, t)).is_some_and(|s| s >= 0),
                _ => false,
            },
            "is no shorter than the parent's",
        ),
        "at-most-time" => (matches!((child.and_then(Value::as_str), parent.as_str()), (Some(c), Some(p)) if c <= p), "is no later than the parent's"),
        "superset" => (keeps_condition(child, parent), "keeps every condition of the parent's"),
        _ => return None,
    };
    (!ok).then_some(rule)
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
    // A scope that is not an object names nothing (every read of it below is by key).
    static EMPTY: Value = Value::Null;
    let c = st(child, "scope").unwrap_or(&EMPTY);
    let p = st(parent, "scope").unwrap_or(&EMPTY);
    // Durations are compared by adding both to the parent's own `at` (protocol.md §7). A parent with no `at` (a clockless block) gives
    // no instant to compare from: no anchor is filled in, and a child under its `per` or `notice` is refused (wider_than_parent).
    let from = ss(parent, "at").filter(|s| !s.is_empty());
    let mut wrong: Vec<Refusal> = Vec::new();
    let wider = |detail: String| Refusal::new("wider_than_parent", detail);
    // A child is narrower than its parent on every field the parent states (protocol.json `narrower_than`: one order per field).
    // A field of the order `subset-or-none` left out names none: a child that states more than a parent that states none is wider.
    let none = json!([]);
    for (key, order) in narrower_table() {
        let stated = order == "subset-or-none";
        if let Some(pv) = p.get(key).or(stated.then_some(&none)) {
            if let Some(rule) = wider_by(order, c.get(key).or(stated.then_some(&none)), pv, from) {
                wrong.push(wider(format!("scope.{key} {rule}")));
            }
        }
    }
    // A sealed limit (a commitment) is compared only on the principal's node, where the amount is. Everyone else checks that the child
    // still carries a limit: a commitment of its own, or a visible limit.
    if p.get("limit_commitment").is_some() && !(c.get("limit_commitment").is_some() || c.get("limit").is_some()) {
        wrong.push(wider("scope carries a limit (a commitment or a visible limit), as the parent's does".into()));
    }
    // A limit with no period covers all time: a child with a period under it could spend the same limit again every period.
    if p.get("limit").is_some() && p.get("every").is_none() && c.get("every").is_some() {
        wrong.push(wider("scope.every is left out, as the parent's is: a limit with no period covers all time".into()));
    }
    // a depth is a whole number (left out, 0)
    let depth = int(st(parent, "depth")).unwrap_or(0.0);
    let child_depth = int(st(child, "depth")).unwrap_or(0.0);
    if !(depth >= 1.0 && child_depth <= depth - 1.0) {
        wrong.push(wider("state.depth is smaller than the parent's by at least one (a grant with no depth is not passed on)".into()));
    }
    // Only the one who received it passes a grant on: a parent with no receiver (open, or a refs.to that names a set of ids) has no
    // one who may (authority.md). A circle that received one passes it on by a block signed as the circle (decision D15): whether its
    // signer holds the role that may sign for the circle there is the fold's, as for any block signed as a circle.
    if rs(parent, "to").is_none_or(|t| Some(t) != rs(child, "author") && Some(t) != rs(child, "as")) {
        wrong.push(Refusal::new(
            "not_receiver",
            "a grant is passed on by the one who received it",
        ));
    }
    wrong
}

/// The close that ends a person's standing arrangements (profiles/successor.md, What a close ends): a counted `observe` of
/// kind `close` about them, signed under a successor grant the person gave in their own name, by the successor it names
/// (someone else), while no stop or decline has ended that grant, with the triggers of as many witnesses as it needs in the
/// close's causal past and none of them defeated by the person; and that does not carry any of `keep` on (its
/// `state.continues`). `visible` limits the closes read (a fold of a block's causal past). Its hash, the lowest of several
/// only to name one.
#[cfg(feature = "successor")]
pub(crate) fn closed_by(person: &str, keep: &[&str], index: &Index, visible: &dyn Fn(&str) -> bool) -> Option<String> {
    closed_by_reading(person, keep, index, visible, &|b: &Value| crate::identity::counts_in(b, index))
}
/// The same close, with `counts` deciding which blocks count. The identity fold reads it by signatures alone (every block it
/// is given counts), because judging forks needs the identity fold itself: that kept the two apart and never looped.
#[cfg(feature = "successor")]
pub(crate) fn closed_by_reading(person: &str, keep: &[&str], index: &Index, visible: &dyn Fn(&str) -> bool, counts: &dyn Fn(&Value) -> bool) -> Option<String> {
    closes_reading(person, keep, index, visible, counts).into_iter().next()
}
/// Every such close, sorted by hash.
#[cfg(feature = "successor")]
pub(crate) fn closes_of(person: &str, keep: &[&str], index: &Index) -> Vec<String> {
    closes_reading(person, keep, index, &|_| true, &|b: &Value| crate::identity::counts_in(b, index))
}
#[cfg(feature = "successor")]
fn closes_reading(person: &str, keep: &[&str], index: &Index, visible: &dyn Fn(&str) -> bool, counts: &dyn Fn(&Value) -> bool) -> Vec<String> {
    let mut found: Vec<String> = index
        .values()
        .filter(|o| {
            crate::js::type_of(o) == "observe"
                && ss(o, "kind") == Some("close")
                && list(rf(o, "subject")).contains(&person)
                && visible(hash_of(o))
                && rs(o, "author").is_some_and(|a| a != person)
                && counts(o)
                && rs(o, "under").and_then(|h| index.get(h)).is_some_and(|g| successor_backs(g, o, person, index, counts))
                && !keep.iter().any(|k| list(st(o, "continues")).contains(k))
                // A successor who has died closes no one: their own counted close in this close's causal past voids it.
                && rs(o, "author").is_none_or(|a| { let past = index.past_of(o); closes_reading(a, &[], index, &|h| past.contains(h), counts).is_empty() })
        })
        .map(|o| hash_of(o).to_string())
        .collect();
    found.sort();
    found
}
// Whether a successor grant backs a close of the person: theirs, in their own name, to the close's author, counted, covering the
// close by its scope, not ended by its author or receiver, and with the needed witnesses' triggers in the close's causal past, none defeated by the person.
#[cfg(feature = "successor")]
fn successor_backs(grant: &Value, close: &Value, person: &str, index: &Index, counts: &dyn Fn(&Value) -> bool) -> bool {
    let past = index.past_of(close);
    if crate::js::type_of(grant) != "grant"
        || st(grant, "status").is_some()
        || ss(grant, "kind") != Some("successor")
        || rs(grant, "author") != Some(person)
        || rf(grant, "as").is_some()
        || rs(grant, "to").is_none_or(|to| rs(close, "author") != Some(to))
        // the successor's decline or leaving ends the grant for the closes that see it (authority.md, Ending); the person's own
        // counted stop of it voids every close under it, whenever it came: the person can always take it back
        || !ended_reading(grant, index, counts, &|h| past.contains(h)).is_empty()
        || index.values().any(|b| {
            crate::js::type_of(b) == "grant" && ss(b, "status") == Some("stopped") && rs(b, "updates") == Some(hash_of(grant)) && rs(b, "author") == Some(person) && counts(b)
        })
        // the grant itself counts (a forked half binds no one, core.md invariant 3), and its scope covers the close
        || !counts(grant)
        // the close is a record, not an act for the person: the grant's `scope.acts`, if it states any, must cover it (profiles/successor.md)
        || get(grant, "state.scope.acts").is_some() && !covers(close, grant)
    {
        return false;
    }
    let witnesses = list(st(grant, "witnesses"));
    let denied = |t: &Value| {
        index.values().any(|d| {
            list(rf(d, "defeats")).contains(&hash_of(t)) && rs(d, "author") == Some(person) && counts(d)
        })
    };
    let signers = index.values().filter_map(|t| {
        let author = rs(t, "author")?;
        (crate::js::type_of(t) == "observe"
            && ss(t, "kind") == Some("trigger")
            && rs(t, "under") == Some(hash_of(grant))
            && list(rf(t, "subject")).contains(&person)
            && witnesses.contains(&author)
            && past.contains(hash_of(t))
            && counts(t)
            && !denied(t))
        .then_some(author)
    });
    crate::js::quorum(signers, crate::js::int(st(grant, "needed")))
}
#[cfg(not(feature = "successor"))]
pub(crate) fn closed_by(_person: &str, _keep: &[&str], _index: &Index, _visible: &dyn Fn(&str) -> bool) -> Option<String> {
    None
}
#[cfg(not(feature = "successor"))]
pub(crate) fn closed_by_reading(_person: &str, _keep: &[&str], _index: &Index, _visible: &dyn Fn(&str) -> bool, _counts: &dyn Fn(&Value) -> bool) -> Option<String> {
    None
}

/// A grant's `scope.until`, as an instant, when it has one that reads.
pub(crate) fn until_of(grant: &Value) -> Option<i64> {
    get(grant, "state.scope.until").and_then(Value::as_str).and_then(crate::time::parse)
}
/// ran_out(grant, block): the grant's `scope.until` has come by the block's own date, a cut at that time (decision H11). A block with
/// no date is cut too: silence may only narrow, never widen (a key, an operator or a member grant with an `until` speaks only for
/// what is dated before it).
pub(crate) fn ran_out(grant: &Value, block: &Value) -> bool {
    until_of(grant).is_some_and(|u| ss(block, "at").and_then(crate::time::parse).is_none_or(|at| u <= at))
}

/// Why a grant is not live among these blocks (its own end, the receiver's, its `until` on the reader's clock, an
/// ancestor's, the death of the person who gave it): empty when live. `now` is the reader's own clock.
pub fn why_not_live_in(grant: Option<&Value>, index: &Index, now: Option<&str>) -> Vec<String> {
    why_not_live_seen(grant, index, now, None, &mut Vec::new())
}

/// The same, for a block that relies on the grant: a death ends the grant only for blocks that have the close in their causal
/// past (profiles/successor.md: from that block on), so what was done under it before stands.
pub(crate) fn why_not_live_for(grant: Option<&Value>, index: &Index, now: Option<&str>, relying: &Value) -> Vec<String> {
    let mut wrong = why_not_live_seen(grant, index, now, Some(&index.past_of(relying)), &mut Vec::new());
    // An act dated (its own `at`) at or after the `scope.until` of its grant, or of any grant above it, acts under none (decision D14): its
    // signer's own date says the grant had run out, and a backdated act is its signer's lie, answered for by whoever answers for it.
    if let Some(at) = ss(relying, "at").and_then(crate::time::parse) {
        let mut seen: Vec<&str> = Vec::new();
        let mut g = grant;
        while let Some(x) = g.filter(|x| !seen.contains(&hash_of(x))) {
            seen.push(hash_of(x));
            if until_of(x).is_some_and(|u| u <= at) {
                wrong.push("the act is dated at or after its grant's scope.until".into());
                break;
            }
            g = rs(x, "parent").and_then(|h| index.get(h));
        }
    }
    if grant.is_some_and(|g| not_yet_dead(g, index, relying)) {
        wrong.push("a successor grant has no power until the person's death: no counted close under it is in this block's causal past".into());
    }
    wrong
}

/// A successor grant backs nothing until its death conditions hold (profiles/successor.md, After it fires): a block under it, other
/// than a witness's trigger or the successor's close, needs a counted close of the person under that grant in its causal past.
#[cfg(feature = "successor")]
fn not_yet_dead(grant: &Value, index: &Index, relying: &Value) -> bool {
    if ss(grant, "kind") != Some("successor") || (crate::js::type_of(relying) == "observe" && matches!(ss(relying, "kind"), Some("trigger" | "close"))) {
        return false;
    }
    let Some(person) = rs(grant, "author") else { return true };
    let past = index.past_of(relying);
    let backed = |read: &Index| closes_of(person, &[], read).iter().any(|c| past.contains(c.as_str()) && read.get(c).and_then(|o| rs(o, "under")) == Some(hash_of(grant)));
    if backed(index) {
        return false;
    }
    // A voided close voids only what the successor claimed for himself (decision d1): an act of theirs that someone else built on (a
    // counted block of another, neither the person nor the successor, that names it, or whose transfer it accepts) stands when that
    // block's own causal past holds a close that counted there: the voiding came after what the outsider relied on.
    let h = hash_of(relying);
    let successor = rs(grant, "to");
    !index.values().any(|o| {
        let by = rs(o, "author");
        by.is_some() && by != Some(person) && by != successor && crate::identity::relied_on(o, relying) && crate::identity::counts_in(o, index) && {
            let seen = index.past_of(o);
            let read = crate::js::index_of(index.values().filter(|b| seen.contains(hash_of(b)) || hash_of(b) == h));
            backed(&read)
        }
    })
}
#[cfg(not(feature = "successor"))]
fn not_yet_dead(grant: &Value, _index: &Index, _relying: &Value) -> bool {
    ss(grant, "kind") == Some("successor")
}

// The stops and declines that end a grant: a stop by its grantor (its author, or, for a grant signed as a circle, someone who may
// sign for the circle), or a decline or leaving by its receiver.
// `seen`: the stops read. A stop ends a grant only for the blocks that have it in their causal past, as a death does (authority.md,
// Ending): what was done under the grant before stands.
fn ended_by(grant: &Value, index: &Index, seen: &dyn Fn(&str) -> bool) -> Vec<String> {
    ended_reading(grant, index, &|b: &Value| crate::identity::counts_in(b, index), seen)
}
pub(crate) fn ended_reading(grant: &Value, index: &Index, counts: &dyn Fn(&Value) -> bool, seen: &dyn Fn(&str) -> bool) -> Vec<String> {
    let gh = hash_of(grant);
    // Only counted blocks end it: one half of a forked pair binds no one (core.md, invariant 3).
    let ends = |b: &Value| crate::js::type_of(b) == "grant" && counts(b) && seen(hash_of(b));
    let mut wrong = Vec::new();
    if index.values().any(|b| ends(b) && ending(b, gh) == Some(End::Stop) && same_grantor(b, grant, index)) {
        wrong.push("its author stopped it".into());
    }
    if index.values().any(|b| ends(b) && ending(b, gh) == Some(End::Decline) && rs(grant, "to").is_some_and(|to| rs(b, "author") == Some(to))) {
        wrong.push("its receiver ended it".into());
    }
    wrong
}
/// How a block ends another (authority.md, Ending).
#[derive(Clone, Copy, PartialEq, Debug)]
pub(crate) enum End {
    /// The author's stop: an `updates` of it that says `stopped`.
    Stop,
    /// The receiver's decline or leaving: an `answers` of it that says `declined` or `stopped`.
    Decline,
}
/// ended(block, seen), the one rule for ending anything (a grant, a member grant, a promise, a transfer): whether `b` is a stop or a
/// decline of `target` (a hash). Whether it counts, whether the reader has seen it, and whether its signer is the one who may end
/// `target` are each caller's own.
pub(crate) fn ending(b: &Value, target: &str) -> Option<End> {
    let status = ss(b, "status");
    if status == Some("stopped") && list(rf(b, "updates")).contains(&target) && list(rf(b, "answers")).is_empty() {
        Some(End::Stop)
    } else if matches!(status, Some("stopped" | "declined")) && list(rf(b, "answers")).contains(&target) {
        Some(End::Decline)
    } else {
        None
    }
}
// Whether a stop speaks for the grantor of the grant it stops: its own author, or, for a grant signed as a circle, one who may
// sign for that circle.
fn same_grantor(stop: &Value, grant: &Value, index: &Index) -> bool {
    rs(stop, "author") == rs(grant, "author")
        || (rs(grant, "as").is_some_and(|circle| rs(stop, "as") == Some(circle)) && who::principal_of(stop, index).is_some())
}

// `past`: the causal past of the block that relies on the grant, if one does. The chain of parents is walked in a loop, never by
// recursion, so a long chain of grants costs time in step with its length and no stack (security I: a 2,500-hop chain overflowed it).
fn why_not_live_seen(
    grant: Option<&Value>,
    index: &Index,
    now: Option<&str>,
    past: Option<&crate::js::Past>,
    seen: &mut Vec<String>,
) -> Vec<String> {
    // the grant and its ancestors, nearest first: a grant, a parent not held, or the one that closes a cycle
    enum Link<'a> {
        Grant(&'a Value),
        Missing,
        Cycle,
    }
    let mut chain: Vec<Link> = Vec::new();
    let mut names: alloc::collections::BTreeSet<String> = seen.iter().cloned().collect();
    let mut at = grant;
    loop {
        match at {
            None => {
                chain.push(Link::Missing);
                break;
            }
            Some(g) if !names.insert(hash_of(g).to_string()) => {
                chain.push(Link::Cycle);
                break;
            }
            Some(g) => {
                chain.push(Link::Grant(g));
                if rf(g, "parent").is_none() {
                    break;
                }
                at = rs(g, "parent").and_then(|h| index.get(h));
            }
        }
    }
    // judged from the farthest down: each grant's own reasons, then whether its parent is live and keeps it within
    let mut above: Vec<String> = Vec::new();
    for i in (0..chain.len()).rev() {
        let wrong = match &chain[i] {
            Link::Missing => vec!["the grant is not held".into()],
            Link::Cycle => vec!["its parents form a cycle".into()],
            Link::Grant(g) => {
                let mut wrong = own_reasons(g, index, now, past);
                if rf(g, "parent").is_some() {
                    if !above.is_empty() {
                        wrong.push(format!("its parent is not live ({})", above.first().cloned().unwrap_or_default()));
                    } else if let Some(Link::Grant(parent)) = chain.get(i + 1) {
                        wrong.extend(scope_within(g, parent));
                    }
                }
                wrong
            }
        };
        above = wrong;
    }
    seen.extend(names);
    above
}

// A grant's own reasons for not being live, apart from its parent (why_not_live_seen walks the parents).
fn own_reasons(grant: &Value, index: &Index, now: Option<&str>, past: Option<&crate::js::Past>) -> Vec<String> {
    let gh = hash_of(grant).to_string();
    // A grant of a forked key still binds its giver, who gave it (folds.md, A fork is a burden); only a key that does not speak gives none.
    if !crate::identity::binds_signer(grant, index) {
        return vec!["it does not count: its signer's key does not speak for them".into()];
    }
    // A block that carries a status is a stop or an answer, never a grant, whatever else it restates (authority.md).
    if st(grant, "status").is_some() {
        return vec!["it is a stop or an answer (it carries a status), not a grant".into()];
    }
    // A stop or a decline ends the grant for the blocks that see it (authority.md, Ending); with no block relying on it, every one held.
    let seen_by = |h: &str| past.is_none_or(|p| p.contains(h));
    let mut wrong = ended_by(grant, index, &seen_by);
    // A grant signed as a circle gives the circle's authority only when its signer may sign for it there, with the hands the circle
    // needs; for a block that relies on it, only the confirms in that block's causal past count (circles.md, Many hands).
    if rf(grant, "as").is_some() {
        let seen: Option<Index> = past.map(|p| index.iter().filter(|(h, _)| p.contains(h.as_str())).map(|(h, b)| (h.clone(), b.clone())).collect());
        if who::principal_of(grant, seen.as_ref().unwrap_or(index)).is_none() {
            wrong.push("it was signed as a circle by someone who may not sign for it there (no_role)".into());
        }
    }
    // A grant a person gave in their own name ends at a counted close of them, unless the close carries it on. The successor
    // grant itself is how the successor acts, and a grant signed as a circle is the circle's, which does not die.
    if rf(grant, "as").is_none() && ss(grant, "kind") != Some("successor") {
        if let Some(person) = rs(grant, "author") {
            if closed_by(person, &[gh.as_str()], index, &seen_by).is_some() {
                wrong.push("the person who gave it has died: a close ended it".into());
            }
        }
    }
    if let (Some(now), Some(until)) = (now.filter(|n| !n.is_empty()), get(grant, "state.scope.until").and_then(Value::as_str)) {
        if until <= now {
            wrong.push("its scope.until has passed".into());
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

/// Whether the grant's scope covers the block's act: it lists the block's type or `type.kind`. No `acts` covers no act (silence only
/// narrows: release P2).
#[allow(dead_code)]
pub(crate) fn covers(block: &Value, grant: &Value) -> bool {
    let Some(acts) = get(grant, "state.scope.acts") else { return false };
    let names = act_names(block);
    acts.as_array().is_some_and(|a| a.iter().any(|x| x.as_str().is_some_and(|x| names.iter().any(|n| n == x))))
}
// The names a block's act answers to: its type, and `type.kind` when its kind is text.
fn act_names(block: &Value) -> Vec<String> {
    let t = crate::js::type_of(block);
    let mut names = vec![t.to_string()];
    if let Some(kind) = ss(block, "kind") {
        names.push(format!("{t}.{kind}"));
    }
    names
}

/// Whether a block's author receives a grant: it is open (no `refs.to`), or made to them, or made to a role of a circle
/// (refs.to the circle, state.to_role the role) that they hold in the circle's fold of the block's causal past. A `to`
/// that names a set of ids names no one. A micro has no circle fold: a grant to a role is for no one it can name (authority.md).
/// The grant passed the write check (folds.md), so its `to` is ids and its `to_role` a role's name.
#[cfg_attr(not(feature = "folds"), allow(unused_variables))]
pub(crate) fn receives(grant: &Value, block: &Value, index: &Index) -> bool {
    receives_as(grant, rs(block, "author"), |circle, role| {
        #[cfg(feature = "folds")]
        return index.contains_key(circle) && crate::fold::may_act_as_in(block, circle, index, Some(role));
        #[cfg(not(feature = "folds"))]
        return false;
    })
}
/// The one receiver rule, for a receiver `who`: `holds(circle, role)` says whether they hold the role (in the circle's fold
/// of their block's causal past, or, where there is no block of theirs to read it at, of the blocks held).
pub(crate) fn receives_as(grant: &Value, who: Option<&str>, holds: impl Fn(&str, &str) -> bool) -> bool {
    let Some(to) = rf(grant, "to") else { return true };
    // a set of ids is not one id: it names no one
    let Some(to) = to.as_str() else { return false };
    match ss(grant, "to_role") {
        Some(role) => holds(to, role),
        None => who == Some(to),
    }
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
    if trigger.is_none() && !receives(grant, block, index) {
        wrong.push("the grant is for someone else".into());
    }
    if trigger.is_none() && !covers(block, grant) {
        wrong.push(format!("the grant's acts do not cover a {}", act_name(block)));
    }
    if trigger.is_none() {
        if let Some(out) = outside_parties(block, grant, index) {
            wrong.push(format!("the grant's parties do not name {out}, whom it deals with"));
        }
    }
    if trigger.is_none() {
        wrong.extend(past_visible_limit(block, grant, index));
    }
    wrong.extend(why_not_live_for(Some(grant), index, now, block));
    wrong.extend(why_not_live_undo(block, index));
    wrong
}

/// A visible limit binds the counterparty too (authority.md, The limit is the principal's fence): an act whose own value is past the
/// `limit` or `each` of a grant the counterparty can read does not bind its principal. The grant is visible when it names no `audience`
/// (a public grant); a sealed limit, or a grant with an audience, keeps the rule that the fence is the principal's alone. The act is not
/// cut down to the limit: as signed it exceeds the grant, so it does not bind. An act with no money or amount in it has no value to test.
fn past_visible_limit(block: &Value, grant: &Value, index: &Index) -> Vec<String> {
    let visible = |k: &str| get(grant, &format!("state.scope.{k}"));
    if grant.get("audience").is_some() || (visible("limit").is_none() && visible("each").is_none()) {
        return vec![];
    }
    let Some(value) = act_value(block, index) else { return vec![] };
    let mut fence = json!({});
    for k in ["limit", "each"] {
        if let Some(v) = visible(k) {
            fence[k] = v.clone();
        }
    }
    if within_limit(&fence, &value, &json!(0)) {
        vec![]
    } else {
        vec!["the act is worth more than the limit the grant shows, so it does not bind its principal (authority.md, The limit is the principal's fence)".into()]
    }
}

/// What an act is worth in the grant's measure: a transfer's money or amount; a promise's terms at the quantity chosen (an accept
/// reads the offer it answers). None when it carries no value.
#[cfg(feature = "folds")]
fn act_value(block: &Value, index: &Index) -> Option<Value> {
    match crate::js::type_of(block) {
        "transfer" => st(block, "money").or(st(block, "amount")).cloned(),
        "promise" => {
            let own = get(block, "state.terms").filter(|t| t.is_object());
            let answered = (ss(block, "status") == Some("accepted")).then(|| rs(block, "answers").and_then(|h| index.get(h))).flatten();
            let terms = answered.and_then(|o| get(o, "state.terms")).or(own)?;
            let quantity = get(block, "state.terms.quantity");
            let total = crate::fold::terms_total(terms, quantity);
            (!total.is_null()).then_some(total)
        }
        _ => None,
    }
}
#[cfg(not(feature = "folds"))]
fn act_value(block: &Value, _index: &Index) -> Option<Value> {
    match crate::js::type_of(block) {
        "transfer" => st(block, "money").or(st(block, "amount")).cloned(),
        _ => None,
    }
}

/// Whom a block deals with (authority.md, scope.parties): the ids it names as a side (`refs.from`, `to`, `to_owner`, `to_holder`), and,
/// for an answer, the sides of the block it answers (or that block's author, when it names no side: a request).
pub(crate) fn dealt_with<'a>(block: &'a Value, index: &'a Index) -> Vec<&'a str> {
    let mut out: Vec<&str> = ["from", "to", "to_owner", "to_holder"].iter().flat_map(|k| list(rf(block, k))).collect();
    if let Some(answered) = rs(block, "answers").and_then(|h| index.get(h)) {
        let sides: Vec<&str> = ["from", "to"].iter().flat_map(|k| list(rf(answered, k))).collect();
        if sides.is_empty() {
            out.extend(rs(answered, "author"));
        } else {
            out.extend(sides);
        }
    }
    out
}
// The first id a block under a grant deals with that `scope.parties` does not name (its principal aside); None when the block keeps to
// them. A grant that states no parties names none: it covers no one beyond its principal, never everyone.
fn outside_parties(block: &Value, grant: &Value, index: &Index) -> Option<String> {
    let parties = list(get(grant, "state.scope.parties"));
    let principal = who::principal_of(grant, index);
    dealt_with(block, index)
        .into_iter()
        .find(|id| principal.as_deref() != Some(*id) && !parties.contains(id))
        .map(String::from)
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
    match ss(block, "kind").filter(|k| !k.is_empty()) {
        Some(k) => format!("{}.{}", crate::js::type_of(block), k),
        None => crate::js::type_of(block).to_string(),
    }
}

/// Who a block or a grant speaks for (folds.md, Who a block speaks for). A micro has no circle fold, so it cannot judge a circle's
/// `sign` power: a block or grant signed `as` a circle speaks for no one it can name, and only its author is known.
mod who {
    use crate::js::Index;
    #[cfg(not(feature = "folds"))]
    use crate::js::rs;
    use crate::prelude::*;
    #[cfg(feature = "folds")]
    pub(super) fn principal_of(grant: &Value, index: &Index) -> Option<String> {
        crate::fold::principal_of(grant, index)
    }
    #[cfg(feature = "folds")]
    pub(super) fn speaker_of(block: &Value, index: &Index, now: Option<&str>) -> Option<String> {
        crate::fold::speaker_of(block, index, now)
    }
    #[cfg(not(feature = "folds"))]
    pub(super) fn principal_of(block: &Value, _index: &Index) -> Option<String> {
        if rs(block, "as").is_some_and(|c| !c.is_empty()) { None } else { rs(block, "author").map(String::from) }
    }
    #[cfg(not(feature = "folds"))]
    pub(super) fn speaker_of(block: &Value, index: &Index, _now: Option<&str>) -> Option<String> {
        principal_of(block, index)
    }
}

/// Whether an act moves things or binds its principal (authority.md, Acts that can be undone): a transfer, a transform, or a
/// promise that is not an ask, a decline or a stop.
fn moves_or_binds(block: &Value, principal: Option<&str>) -> bool {
    match crate::js::type_of(block) {
        "transfer" | "transform" => true,
        "promise" => {
            let ends = matches!(ss(block, "status"), Some("declined" | "stopped"));
            let ask = list(rf(block, "answers")).is_empty()
                && principal.is_some_and(|p| list(rf(block, "to")).contains(&p) && !list(rf(block, "from")).contains(&p));
            !ends && !ask
        }
        _ => false,
    }
}

// Whether a block acts under `grant` or a grant passed on from it (a descendant, through `parent`).
fn under_same_or_descendant(block: &Value, grant: Option<&Value>, index: &Index) -> bool {
    let Some(g) = grant else { return false };
    let mut at = rs(block, "under");
    let mut steps = 0;
    while let Some(h) = at {
        if h == hash_of(g) {
            return true;
        }
        steps += 1;
        if steps > 64 {
            return false;
        }
        at = index.get(h).and_then(|x| rs(x, "parent"));
    }
    false
}

/// Acts that can be undone (authority.md): the default is that they cannot. A block under a grant that moves things or binds its
/// principal is `not_live` unless the schema it names in `refs.schema` says `undo: ok`, and that schema is trusted (the grantor's
/// own, or one the grantor confirmed), or it has a specific ask its principal answered `accepted`, naming that act, or a grant whose
/// `scope.acts` names that act and has a `limit`. A broad grant that lists only a kind of act is not enough. Empty when the act can be
/// taken back, or the block has what it needs. The block names the ask in `refs.for`. An ask names the act when its `state.what` is
/// the act's name or it follows the same schema; the principal is the grantor of the grant.
pub fn why_not_live_undo(block: &Value, index: &Index) -> Vec<String> {
    let grant = rs(block, "under").and_then(|h| index.get(h));
    // A successor acts as the person did, once the person has died (profiles/successor.md, No power before the death): the death conditions
    // are the successor grant's fence, and no limit or ask stands in for them.
    if grant.is_some_and(|g| ss(g, "kind") == Some("successor")) {
        return vec![];
    }
    let principal = grant
        .and_then(|g| who::principal_of(g, index))
        .or_else(|| who::speaker_of(block, index, None));
    let trusted = |schema: &Value| {
        crate::js::type_of(schema) == "thing"
            && ss(schema, "kind") == Some("schema")
            && principal.as_deref().is_some_and(|p| {
                who::speaker_of(schema, index, None).as_deref() == Some(p)
                    || index.values().any(|c| {
                        list(rf(c, "confirms")).contains(&hash_of(schema))
                            && who::speaker_of(c, index, None).as_deref() == Some(p)
                    })
            })
    };
    let marked = rs(block, "schema").and_then(|h| index.get(h)).filter(|s| trusted(s)).and_then(|s| ss(s, "undo"));
    // Irreversible: a trusted schema says never (whatever the block's type: a spray is recorded as an observe), or the act moves things
    // or binds and no trusted schema says ok.
    let irreversible = marked == Some("never") || (marked != Some("ok") && moves_or_binds(block, principal.as_deref()));
    if !irreversible {
        return vec![];
    }
    let act = act_name(block);
    // A specific ask backs one act (authority.md, How an ask names the act): the act names it in `refs.for`; it names the act; the
    // principal answered it `accepted` (counted), and no stop or decline of it by the principal is in the act's causal past; and of the
    // acts under a grant that rely on it, this one is the first in causal order (one that crosses another, neither seeing the other, is not).
    let past = index.past_of(block);
    let asked = list(rf(block, "for")).iter().filter_map(|h| index.get(*h)).any(|ask| {
        let ah = hash_of(ask);
        let by_principal = |b: &Value| principal.is_some() && who::speaker_of(b, index, None) == principal && crate::identity::counts_in(b, index);
        crate::js::type_of(ask) == "promise"
            && (get(ask, "state.what").and_then(Value::as_str) == Some(act.as_str())
                || rf(ask, "schema").is_some_and(|h| rf(block, "schema") == Some(h)))
            && index.values().any(|a| ss(a, "status") == Some("accepted") && rs(a, "answers") == Some(ah) && by_principal(a))
            && !index.values().any(|w| {
                matches!(ss(w, "status"), Some("stopped" | "declined"))
                    && (rs(w, "answers") == Some(ah) || rs(w, "updates") == Some(ah))
                    && past.contains(hash_of(w))
                    && by_principal(w)
            })
            && !index.values().any(|other| {
                hash_of(other) != hash_of(block)
                    && rs(other, "answers") != Some(ah)
                    && rf(other, "under").is_some()
                    && list(rf(other, "for")).contains(&ah)
                    && moves_or_binds(other, principal.as_deref())
                    // a rival counts only if it is a counted block acting under this grant or one passed on from it, by one that grant is made for
                    // (release 13: a stranger's block naming the ask cannot spend it). It reads no fold of speaking, so no act reads another's in a loop.
                    && crate::identity::counts_in(other, index)
                    && under_same_or_descendant(other, grant, index)
                    && rs(other, "under").and_then(|h| index.get(h)).is_some_and(|og| receives(og, other, index))
                    && !crate::order::sees_in(other, hash_of(block), index)
            })
    });
    let granted = grant.is_some_and(|g| {
        get(g, "state.scope.acts")
            .and_then(Value::as_array)
            .is_some_and(|a| a.iter().any(|x| x.as_str() == Some(act.as_str())))
            // a cap on each act alone is a limit too (authority.md)
            && ["limit", "each", "limit_commitment"].iter().any(|k| get(g, &format!("state.scope.{k}")).is_some())
    });
    if asked || granted {
        vec![]
    } else {
        vec![format!(
            "{act} may not be undone: it needs a trusted schema that says undo ok, a specific ask its principal answered accepted, or a grant that names it and has a limit (visible, or sealed as a commitment)"
        )]
    }
}

/// Whether a block signed under a grant speaks for its grantor, among these blocks: empty, or why not.
pub fn why_not_under(block: &Value, blocks: &[Value], now: Option<&str>) -> Vec<String> {
    // the block is read with the input: one no node would take is no word, under no grant (folds.md)
    let index = crate::js::held_index(blocks.iter().filter(|b| crate::js::hash_of(b) != crate::js::hash_of(block)).chain([block]));
    if !index.contains_key(crate::js::hash_of(block)) {
        return vec!["the block is no word: it is not valid on what it rests on, or rests on a block not held".into()];
    }
    why_not_under_in(block, &index, now)
}

/// Who answers for an autonomous system or machine: the authors of its operator grants, naming it in refs.to and no `subject`
/// (§2), that no stop, leaving or death has ended. An operator grant that names a `subject` appoints `to` as operator of
/// that thing (a sensor); it makes its author no one's operator. The same reading the identity fold uses.
pub fn operators_of(agent: &str, blocks: &[Value], _now: Option<&str>) -> Vec<String> {
    crate::identity::operators_in(agent, &crate::js::held_index(blocks))
}

/// Whether an operator grant still stands, read from signatures alone (the identity fold's reading, which must not call
/// back into the identity fold): not ended by its author or receiver, and its author not dead by a close that does not
/// carry it on.
/// `relying`, a block that rests on the grant (a key grant the operator signed): a death ends the grant only for blocks that have
/// the close in their causal past, so what the operator did before stands (authority.md, Ending).
pub(crate) fn operator_stands(grant: &Value, index: &Index, relying: Option<&Value>) -> bool {
    let all = |_: &Value| true;
    let past = relying.map(|r| index.past_of(r));
    let seen_by = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    // The machine consents (identity.md, Autonomous systems and machines): its own `accepted` answer to the grant, which the
    // relying block has seen. A grant a stranger signs naming someone else's machine makes the stranger no one's operator.
    let gh = hash_of(grant);
    let accepted = rs(grant, "to").is_some_and(|machine| {
        index.values().any(|a| {
            crate::js::type_of(a) == "grant"
                && ss(a, "status") == Some("accepted")
                && rs(a, "answers") == Some(gh)
                && rs(a, "author") == Some(machine)
                && seen_by(hash_of(a))
                // the machine's own word: signed by a key that speaks for it, as every fold reads a block (security A)
                && crate::identity::signed_plain(a, index)
        })
    });
    // An operator grant with `scope.until` answers for the machine until then (decision H11): a block that relies on it is cut by `ran_out`.
    accepted
        && !relying.is_some_and(|r| ran_out(grant, r))
        && ended_reading(grant, index, &all, &seen_by).is_empty()
        && rs(grant, "author").is_none_or(|a| closed_by_reading(a, &[hash_of(grant)], index, &seen_by, &all).is_none())
}

// ---- The limit is the principal's fence (§7) ----
/// The `observe` of kind limit for a grant, as `{ type, state, refs, audience }` to hand to `write`: `agent`, the
/// grant's receiver, is its whole audience, so no counterparty ever reads the limit and the grant check never looks
/// at it.
///
/// With a `salt`, the observe also carries it: whoever holds the observe can open the grant's `scope.limit_commitment`
/// (`limit_opens`). The salt is private to the principal's node and the autonomous system.
pub fn limit_fence(grant_hash: &str, agent: &str, limit: &Value, every: Option<&str>, salt: Option<&str>, each: Option<&Value>) -> Value {
    let mut state = json!({ "kind": "limit" });
    if !limit.is_null() {
        state["limit"] = limit.clone();
    }
    if let Some(e) = each.filter(|e| !e.is_null()) {
        state["each"] = e.clone();
    }
    if let Some(p) = every.filter(|p| !p.is_empty()) {
        state["every"] = json!(p);
    }
    if let Some(s) = salt.filter(|s| !s.is_empty()) {
        state["salt"] = json!(s);
    }
    json!({ "type": "observe", "state": state, "refs": { "for": grant_hash }, "audience": [agent] })
}

/// Whether one act of `value` (money, or an amount) stays inside a limit. `limit` is the limit observe, its state, or the
/// limit itself; `spent` is what the principal's node has already counted in the period: minor units of the money, or
/// the amount's value (a whole number or a decimal string), compared exactly. A cap on each act (`each`) holds whatever
/// was spent. Money in another currency, an amount in another unit, or a `spent` that is not a number is never within.
pub fn within_limit(limit: &Value, value: &Value, spent: &Value) -> bool {
    let fence = limit.get("state").unwrap_or(limit);
    let (cap, each) = match (fence.get("limit"), fence.get("each")) {
        (None, None) => (Some(limit), None),
        (c, e) => (c, e),
    };
    let (Some(spent), Some(size)) = (Dec::of(Some(spent)), Dec::of(size_of(value))) else { return false };
    // A value or a spent amount below zero is never within (authority.md): an act cannot push a cap back.
    let zero = Dec::zero();
    if size.cmp(&zero).is_lt() || spent.cmp(&zero).is_lt() {
        return false;
    }
    let total = spent.add(&size);
    let at_most = |c: &Value, n: &Dec| same_measure(value, c) && Dec::of(size_of(c)).is_some_and(|c| n.cmp(&c).is_le());
    (cap.is_some() || each.is_some()) && cap.is_none_or(|c| at_most(c, &total)) && each.is_none_or(|e| at_most(e, &size))
}

/// Whether a child grant's limit is within its parent's (authority.md, What a reader can check about a child's sealed limit): the
/// check only the principal's node can make, holding both limit observes. `child` and `parent` are the limit observes, their states,
/// or `{ limit, every, each }`. Each of the parent's `limit` and `each` the child has too, in the same currency or unit and no larger,
/// compared exactly; where the parent has an `every`, the child's is no shorter, both added to `at` (the parent grant's `at`).
pub fn limit_within_parent(child: &Value, parent: &Value, at: &str) -> bool {
    let (c, p) = (child.get("state").unwrap_or(child), parent.get("state").unwrap_or(parent));
    // a limit with no period covers all time: a child with a period under it could spend the same limit again every period (as in scope_refusals)
    if p.get("limit").is_some() && p.get("every").is_none() && c.get("every").is_some() {
        return false;
    }
    narrower_table()
        .into_iter()
        .filter(|(key, _)| ["limit", "each", "every"].contains(key))
        .all(|(key, order)| p.get(key).is_none_or(|pv| wider_by(order, c.get(key), pv, Some(at)).is_none()))
}

/// The commitment to a limit (authority.md, The limit is the principal's fence): the salted hash (privacy.md) of the canonical JSON of
/// `{ limit, every, each }` (`every` and `each` left out when there are none), in a suite's hash. It goes in the grant's `scope.limit_commitment`.
pub fn limit_commitment_in(suite: &str, limit: &Value, every: Option<&str>, salt: &str, each: Option<&Value>) -> String {
    crate::audience::salted_hash_in(suite, salt, &limit_text(limit, every, each))
}
// The canonical JSON of `{ limit, every, each }`, each left out when there is none: the value a limit commitment commits to.
fn limit_text(limit: &Value, every: Option<&str>, each: Option<&Value>) -> String {
    let mut value = json!({});
    if !limit.is_null() {
        value["limit"] = limit.clone();
    }
    if let Some(p) = every.filter(|p| !p.is_empty()) {
        value["every"] = json!(p);
    }
    if let Some(e) = each.filter(|e| !e.is_null()) {
        value["each"] = e.clone();
    }
    crate::canonical::canonical_json(&value)
}

/// Whether the limit observe is the opening of the grant's `scope.limit_commitment`: the observe is of kind `limit`, `for` this grant,
/// and its `limit`, `every`, `each` and `salt` hash to the commitment. This is the check on the principal's node (and the autonomous system's); a reader without
/// the observe can only see that the commitment exists.
pub fn limit_opens_in(suite: &str, grant: &Value, fence: &Value) -> bool {
    let Some(commitment) = get(grant, "state.scope.limit_commitment").and_then(Value::as_str) else {
        return false;
    };
    crate::js::type_of(fence) == "observe"
        && ss(fence, "kind") == Some("limit")
        && list(rf(fence, "for")).contains(&hash_of(grant))
        // the salt is 16 random bytes as hex (protocol.json grammar.salt): a short one is guessable; `audience::opens` refuses it
        && match (st(fence, "limit").or(st(fence, "each")), st(fence, "salt").and_then(Value::as_str)) {
            (Some(_), Some(salt)) => {
                let limit = st(fence, "limit").cloned().unwrap_or(Value::Null);
                crate::audience::opens(suite, salt, &limit_text(&limit, st(fence, "every").and_then(Value::as_str), st(fence, "each")), commitment)
            }
            _ => false,
        }
}

#[cfg(test)]
mod tests {
    use super::*;
    // The one receiver rule's edges (authority.md, refs.to and To a role), in every build: a micro has no circle fold, so a
    // grant to a role is for no one it can name.
    #[test]
    fn receives_edges() {
        let index = Index::default();
        let (a, c) = ("a".repeat(64), "c".repeat(64));
        let block = json!({ "type": "observe", "state": { "kind": "note" }, "refs": { "author": a } });
        let grant = |refs: Value, state: Value| json!({ "type": "grant", "state": state, "refs": refs });
        assert!(receives(&grant(json!({}), json!({ "kind": "errands" })), &block, &index), "open: anyone");
        assert!(receives(&grant(json!({ "to": a }), json!({ "kind": "errands" })), &block, &index), "made to the author");
        assert!(!receives(&grant(json!({ "to": c }), json!({ "kind": "errands" })), &block, &index), "made to someone else");
        // a set of ids is not one id: it names no one (a refs.to or to_role of any other shape is refused by the check, so no fold reads it)
        assert!(!receives(&grant(json!({ "to": [a] }), json!({ "kind": "errands" })), &block, &index), "a to that is a set");
        // a role in a circle this reader does not hold (and, in a micro, any role): no one
        assert!(!receives(&grant(json!({ "to": c }), json!({ "kind": "errands", "to_role": "cook" })), &block, &index));
        assert!(!receives_as(&grant(json!({ "to": c }), json!({ "kind": "errands", "to_role": "cook" })), Some(&a), |_, _| false));
        assert!(receives_as(&grant(json!({ "to": c }), json!({ "kind": "errands", "to_role": "cook" })), Some(&a), |circle, role| circle == c && role == "cook"));
    }
}
