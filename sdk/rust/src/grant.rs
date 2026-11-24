//! Authority (protocol.md §7). A grant gives authority to `refs.to` (left out, to anyone), within `state.scope`. A
//! child grant (`refs.parent`) is a subset of its parent on every field (invariant 10), and a grant is live only while
//! every ancestor is (invariant 9). A grant carries no status: its author ends it by an `updates` with stopped; the
//! receiver declines or leaves by an `answers`. This is the grant check a micro that acts in the world needs.
#[cfg(not(feature = "folds"))]
use crate::decimal::Dec;
use crate::error::Refusal;
use crate::js::{get, hash_of, int, list, rf, rs, ss, st, Index};
use crate::prelude::*;

pub use crate::time::{add_duration, parse_duration};

// Two amounts of one kind (encoding.md, Shapes): the same unit and the same `of`, or neither has one.
fn same_measure(a: &Value, b: &Value) -> bool {
    crate::decimal::Amount::of(Some(a)).zip(crate::decimal::Amount::of(Some(b))).is_some_and(|(x, y)| x.kind == y.kind)
}
// How big an amount is, exactly: its value.
fn size_of(v: &Value) -> Option<&Value> {
    v.get("value")
}
// An amount of the same kind, no larger than the other, compared exactly.
fn no_larger(child: &Value, parent: &Value) -> bool {
    same_measure(child, parent) && crate::decimal::compare(size_of(child), size_of(parent)).is_some_and(|o| o.is_le())
}
// The orders of protocol.json `narrower_than`, field by field: [(field, order)].
fn narrower_table() -> Vec<(&'static str, &'static str)> {
    crate::spec().protocol.get("narrower_than").and_then(Value::as_object).map_or(Vec::new(), |t| {
        t.iter().filter_map(|(k, v)| Some((k.as_str(), v.as_str()?))).collect()
    })
}
// narrower_than(child, parent) for one field: None when the child is within the parent's, else how it must be (the end of the
// refusal's sentence).
fn wider_by(order: &str, child: Option<&Value>, parent: &Value) -> Option<&'static str> {
    let (ok, rule) = match order {
        "subset-or-none" => (
            // types are names and parties ids: text, matched exactly
            match (child, parent) {
                (Some(Value::Array(cs)), Value::Array(ps)) => cs.iter().all(|c| c.as_str().is_some_and(|i| ps.iter().any(|x| x.as_str() == Some(i)))),
                _ => false,
            },
            "is a subset of the parent's",
        ),
        "at-most" => (child.is_some_and(|c| no_larger(c, parent)), "is no larger than the parent's"),
        "at-most-time" => (matches!((child.and_then(Value::as_str), parent.as_str()), (Some(c), Some(p)) if c <= p), "is no later than the parent's"),
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

/// What makes a child grant wider than its parent: `[{ code, detail }]` (`wider_than_parent`, `not_receiver`, `shape`); empty when it is
/// within it (authority.md, Scope subset).
pub fn scope_refusals(child: &Value, parent: &Value) -> Vec<Refusal> {
    // A scope that is not an object names nothing (every read of it below is by key).
    static EMPTY: Value = Value::Null;
    let c = st(child, "scope").unwrap_or(&EMPTY);
    let p = st(parent, "scope").unwrap_or(&EMPTY);
    let mut wrong: Vec<Refusal> = Vec::new();
    let wider = |detail: String| Refusal::new("wider_than_parent", detail);
    let same = |a: Option<&Value>, b: Option<&Value>| a.map(crate::canonical::canonical_json) == b.map(crate::canonical::canonical_json);
    // A child is never open (`shape`). (A grant to a role is gone with roles: `to_role` is no field, refused as any undeclared one.)
    if rf(child, "to").is_none() {
        wrong.push(Refusal::new("shape", "a child grant is never open: it names its receiver in refs.to"));
    }
    // protocol.json `narrower_than`: one order per field.
    let none = json!([]);
    for (key, order) in narrower_table() {
        match order {
            "same" => {
                if !same(c.get(key), p.get(key)) {
                    wrong.push(wider(format!("scope.{key} is the parent's, exactly")));
                }
            }
            "parent-unless-own" => {
                // refs.meter: the parent's, where the parent's meter is not its holder's own line
                let pm = rs(parent, key);
                let own = pm.is_some_and(|m| Some(m) == rs(parent, "to") || meter_is_holders(parent));
                if !own && rs(child, key) != pm {
                    wrong.push(wider(format!("refs.{key} is the parent's: another meter")));
                }
            }
            "at-most" => {
                if let Some(pv) = p.get(key) {
                    if let Some(rule) = wider_by(order, c.get(key), pv) {
                        wrong.push(wider(format!("scope.{key} {rule}")));
                    }
                } else if c.get(key).is_some() {
                    wrong.push(wider(format!("scope.{key} is stated only where the parent states one")));
                }
            }
            _ => {
                let stated = order == "subset-or-none";
                if let Some(pv) = p.get(key).or(stated.then_some(&none)) {
                    if let Some(rule) = wider_by(order, c.get(key).or(stated.then_some(&none)), pv) {
                        wrong.push(wider(format!("scope.{key} {rule}")));
                    }
                }
            }
        }
    }
    // `every`: none, where the parent states `limit`
    if p.get("limit").is_some() && c.get("every").is_some() {
        wrong.push(wider("scope.every is left out where the parent states a limit".into()));
    }
    // refs.what: the parent's, or none
    if rf(child, "what").is_some() && !same(rf(child, "what"), rf(parent, "what")) {
        wrong.push(wider("refs.what is the parent's, or none".into()));
    }
    // A machine's fence is no wider than its parent's (patterns/machines.md, A machine's fence).
    for detail in crate::grant_fence::fence_wider(child.get("state").unwrap_or(&EMPTY), parent.get("state").unwrap_or(&EMPTY)) {
        wrong.push(wider(detail));
    }
    // A grant that names a handle is passed on only to that handle.
    if ss(parent, "handle").is_some_and(|h| ss(child, "handle") != Some(h)) {
        wrong.push(wider("state.handle is the parent's".into()));
    }
    // a depth is a whole number (left out, 0)
    let depth = int(st(parent, "depth")).unwrap_or(0.0);
    let child_depth = int(st(child, "depth")).unwrap_or(0.0);
    if !(depth >= 1.0 && child_depth <= depth - 1.0) {
        wrong.push(wider("state.depth is smaller than the parent's by at least one (a grant with no depth is not passed on)".into()));
    }
    // Only the one who received it passes a grant on: a parent with no receiver (open, or a refs.to that names a set of ids) has no
    // one who may (authority.md). A circle that received one passes it on by a block signed as the circle.
    if rs(parent, "to").is_none_or(|t| Some(t) != rs(child, "author") && Some(t) != rs(child, "as")) {
        wrong.push(Refusal::new(
            "not_receiver",
            "a grant is passed on by the one who received it",
        ));
    }
    wrong
}

// Whether a grant's meter is its holder's own line, read from the grant alone: its `refs.meter` is its holder's id (her genesis key's line).
// read from bytes alone (a key grant of the holder as a meter is read as another line here); the fold reads the line.
fn meter_is_holders(grant: &Value) -> bool {
    rs(grant, "meter").is_some_and(|m| Some(m) == rs(grant, "to"))
}

/// The one official reading of a grant's `state.scope` (authority.md, `state.scope` and Scope subset), with every default the spec states and nothing filled in
/// beyond them. `scope` is the scope object, or null (read as an empty scope). It never fails.
///
/// `{ types, parties, limit, each, every, expires, notice, sealed, condition, junk }`:
/// - `types`, `parties`: the lists as signed; left out, `[]`: a missing `types` covers no block, a missing `parties` names no one but the principal.
/// - `limit`, `each`: the visible fence, money `{ minor, currency }` or an amount `{ value, unit }`; left out, `null`: no money or amount moves
///   under the grant (invariant 23). A sealed scope shows neither.
/// - `every`, `notice`: a duration (core.md, section 3); left out, `null`: `every` null makes a limit cover all time, `notice` null names none.
/// - `expires`: a time; left out, `null`: not a wider grant, it lasts until its author stops it.
/// - `sealed`: `limit_commitment` is there (the amount is the principal's node's alone).
/// - `condition`: as signed, `null` when left out; the protocol fills nothing in and reads none here.
/// - `junk`: the names (sorted) of the fields that are there but cannot be read: exactly those the write check refuses in a scope (a list
///   that is no list of types or of ids, money or an amount that is malformed or below zero, a duration or a time that is none, a visible
///   `limit` or `each` beside a commitment, a commitment that is no hash) and any name that is not a scope field; a scope that is no
///   object is `["scope"]`. An unreadable field reads as `null` or `[]` in the other keys, so **a caller that finds a non-empty `junk` must
///   hold the grant to no word**: a malformed `expires` read as no end would be a wider grant.
pub fn scope_reading(scope: &Value) -> Value {
    let empty = json!({});
    let mut junk = crate::check::scope_junk(if scope.is_null() { &empty } else { scope });
    // a grant's `every` is stated only with `limit` and `expires`, and a fallback only with her deadline (authority.md, Her deadline): without
    // them each is read as nothing
    if let Some(m) = scope.as_object() {
        for (k, needs) in [("every", &["limit", "expires"][..]), ("fallback", &["deadline"][..])] {
            if m.contains_key(k) && needs.iter().any(|n| !m.contains_key(*n)) && !junk.iter().any(|j| j == k) {
                junk.push(k.to_string());
            }
        }
        junk.sort_by(|a, b| crate::js::cmp16(a, b));
    }
    let field = |k: &str| scope.get(k).filter(|_| !junk.iter().any(|j| j == k));
    let list = |k: &str| field(k).cloned().unwrap_or_else(|| json!([]));
    let text = |k: &str| field(k).cloned().unwrap_or(Value::Null);
    json!({
        "types": list("types"),
        "parties": list("parties"),
        "on": list("on"),
        "limit": text("limit"),
        "each": text("each"),
        "every": text("every"),
        "expires": text("expires"),
        "clocks": text("clocks"),
        "deadline": text("deadline"),
        "fallback": text("fallback"),
        "junk": junk,
    })
}

/// A grant's `scope.expires`, as an instant, when it has one that reads.
pub(crate) fn expires_of(grant: &Value) -> Option<i64> {
    get(grant, "state.scope.expires").and_then(Value::as_str).and_then(crate::time::parse)
}

/// Why a grant is not live among these blocks (its own end, the receiver's, its `expires` on the reader's clock, an
/// ancestor's, the death of the person who gave it): empty when live. `now` is the reader's own clock.
pub fn why_not_live_in(grant: Option<&Value>, index: &Index, now: Option<&str>) -> Vec<String> {
    why_not_live_seen(grant, index, now, None, &mut Vec::new())
}

/// The same, for a block that relies on the grant: an end (her close included) ends the grant only for blocks that have it in
/// their causal past, so what was done under it before stands.
pub(crate) fn why_not_live_for(grant: Option<&Value>, index: &Index, now: Option<&str>, relying: &Value) -> Vec<String> {
    let mut wrong = why_not_live_seen(grant, index, now, Some(&index.past_of(relying)), &mut Vec::new());
    // A block dated (its own `at`) at or after the `scope.expires` of its grant, or of any grant above it, acts under none: its
    // signer's own date says the grant had run out, and a backdated act is its signer's lie, answered for by whoever answers for it.
    // a missing `at` reads the same in every part: a block that states none is not in time under a grant with `expires`
    {
        let at = ss(relying, "at").and_then(crate::time::parse);
        let mut seen: Vec<&str> = Vec::new();
        let mut g = grant;
        while let Some(x) = g.filter(|x| !seen.contains(&hash_of(x))) {
            seen.push(hash_of(x));
            if expires_of(x).is_some_and(|u| at.is_none_or(|at| u <= at)) {
                wrong.push("the block is dated at or after its grant's scope.expires".into());
                break;
            }
            g = rs(x, "parent").and_then(|h| index.get(h));
        }
    }
    wrong
}

// The stops and declines that end a grant: a stop by its grantor (its author, or, for a grant signed as a circle, someone who may
// sign for the circle), or a decline or leaving by its receiver.
// `seen`: the stops read. A stop ends a grant only for the blocks that have it in their causal past, as a death does (authority.md,
// Ending): what was done under the grant before stands.
fn ended_by(grant: &Value, index: &Index, seen: &dyn Fn(&str) -> bool) -> Vec<String> {
    ended_reading(grant, index, &|b: &Value| crate::forks::counts_in(b, index), seen)
}
pub(crate) fn ended_reading(grant: &Value, index: &Index, counts: &dyn Fn(&Value) -> bool, seen: &dyn Fn(&str) -> bool) -> Vec<String> {
    let gh = hash_of(grant);
    // Only counted blocks end it: one half of a forked pair binds no one (core.md, invariant 3).
    // A stop is a grant of the author's; a decline is a reading (an `observe` that says `declined`), or, in a block signed before the
    // three moods, a grant that says `declined` or `stopped` (append-only: old blocks keep their meaning).
    let ends = |b: &Value| (crate::js::type_of(b) == "grant" || is_decline_reading(b)) && counts(b) && seen(hash_of(b));
    let mut wrong = Vec::new();
    if index.values().any(|b| ends(b) && crate::js::type_of(b) == "grant" && ending(b, gh) == Some(End::Stop) && same_grantor(b, grant, index)) {
        wrong.push("its author stopped it".into());
    }
    // the holder ends her own place alone: her decline or leaving, or her own stop of it
    if index.values().any(|b| ends(b) && ending(b, gh).is_some() && matches!(list(rf(grant, "to")).as_slice(), [to] if rs(b, "author") == Some(*to)) && rs(b, "author") != rs(grant, "author")) {
        wrong.push("its receiver ended it".into());
    }
    wrong
}
/// A decline written as a reading: an `observe` that answers a block and says `declined` (core.md, Types). It binds nothing of its
/// signer's. A decline written before the three moods has the type of the block it answers and is read as before.
pub(crate) fn is_decline_reading(b: &Value) -> bool {
    crate::js::type_of(b) == "observe" && ss(b, "status") == Some("declined") && !list(rf(b, "answers")).is_empty()
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
    } else if (status == Some("declined") || (status == Some("stopped") && crate::js::type_of(b) != "observe")) && list(rf(b, "answers")).contains(&target) {
        Some(End::Decline)
    } else {
        None
    }
}
// Whether a stop speaks for the grantor of the grant it stops: its own author, or, for a grant signed as a circle, one who may
// sign for that circle.
// (authority.md, Ending) a word signed `as` a circle is ended by a stop of its author while she still holds what her hand
// counted (her hand could still count there), or by a stop `as` the circle that a row holds for; any other stop `as` the circle ends nothing.
fn same_grantor(stop: &Value, grant: &Value, index: &Index) -> bool {
    match rs(grant, "as").filter(|c| !c.is_empty()) {
        None => rs(stop, "author") == rs(grant, "author"),
        Some(circle) => {
            who::stop_counts(stop, grant, circle, index)
        }
    }
}

// `past`: the causal past of the block that relies on the grant, if one does. The chain of parents is walked in a loop, never by
// recursion, so a long chain of grants costs time in step with its length and no stack.
fn why_not_live_seen(
    grant: Option<&Value>,
    index: &Index,
    now: Option<&str>,
    past: Option<&crate::js::Past>,
    seen: &mut Vec<String>,
) -> Vec<String> {
    // the grant and its ancestors, nearest first: a grant, a parent not given, or the one that closes a cycle
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
    // A grant of a forked key still binds its giver, who gave it (folds.md, A fork is a burden); only a key that does not speak gives none.
    if !crate::forks::binds_signer(grant, index) {
        return vec!["it does not count: its signer's key does not speak for them".into()];
    }
    // A block that carries a status is a stop or an answer, never a grant, whatever else it restates (authority.md).
    if st(grant, "status").is_some() {
        return vec!["it is a stop or an answer (it carries a status), not a grant".into()];
    }
    // A stop or a decline ends the grant for the blocks that see it (authority.md, Ending); with no block relying on it, every one given.
    let seen_by = |h: &str| past.is_none_or(|p| p.contains(h));
    let mut wrong = ended_by(grant, index, &seen_by);
    // her own ending term: a counted witness by the host she named, saying exactly her text, `for` this grant (with her handle,
    // where the grant states one), ends it for every block that has the witness in its causal past
    if let Some(e) = get(grant, "state.scope.ends_on") {
        let (Some(host), Some(said)) = (e.get("witness").and_then(Value::as_str), e.get("said").and_then(Value::as_str)) else { return vec!["its scope.ends_on is not read".into()] };
        let gh = hash_of(grant);
        let handle = get(grant, "state.handle");
        let ended = index.values().any(|w| {
            crate::js::type_of(w) == "observe"
                && ss(w, "kind") == Some("witness")
                && rs(w, "author") == Some(host)
                && ss(w, "said") == Some(said)
                && list(rf(w, "for")).contains(&gh)
                && handle.is_none_or(|h| get(w, "state.handle") == Some(h))
                && seen_by(hash_of(w))
                && crate::forks::counts_in(w, index)
        });
        if ended {
            wrong.push("the witness its scope.ends_on names said its words: her own ending term".into());
        }
    }
    // A grant signed as a circle gives the circle's authority only when its signer may sign for it there, with the hands the circle
    // needs; for a block that relies on it, only the confirms in that block's causal past count (circles.md, Many hands).
    if rf(grant, "as").is_some() {
        if !who::holds_for(grant, index, past) {
            wrong.push("it was signed as a circle by someone who may not sign for it there (no_role)".into());
        }
    }
    // a close is an end of every standing word of hers, a grant included, for the blocks that have it in their causal past; a
    // grant signed as a circle is the circle's.
    if rf(grant, "as").is_none() {
        if let Some(person) = rs(grant, "author") {
            if crate::identity::closes_of(person, index).iter().any(|c| seen_by(c)) {
                wrong.push("the person who gave it closed her list: a close ends every standing word of hers".into());
            }
        }
    }
    if let (Some(now), Some(expires)) = (now.filter(|n| !n.is_empty()), get(grant, "state.scope.expires").and_then(Value::as_str)) {
        if expires <= now {
            wrong.push("its scope.expires has passed".into());
        }
    }
    wrong
}

/// Why a grant is not live among these blocks: empty when live.
pub fn why_not_live(grant: &Value, blocks: &[Value], now: Option<&str>) -> Vec<String> {
    why_not_live_in(Some(grant), &crate::js::blocks_index(blocks), now)
}

/// Whether a grant is live among these blocks.
pub fn is_live(grant: &Value, blocks: &[Value], now: Option<&str>) -> bool {
    why_not_live(grant, blocks, now).is_empty()
}

/// The grants above this one, nearest first.
pub fn ancestors(grant: &Value, blocks: &[Value]) -> Vec<Value> {
    let index = crate::js::blocks_index(blocks);
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

/// Whether the grant's scope covers the block: it lists the block's type or `type.kind`. No `types` covers no block (silence only
/// narrows: authority.md, Scope subset).
pub(crate) fn covers(block: &Value, grant: &Value) -> bool {
    let Some(types) = get(grant, "state.scope.types") else { return false };
    let names = type_names(block);
    types.as_array().is_some_and(|a| a.iter().any(|x| x.as_str().is_some_and(|x| names.iter().any(|n| n == x))))
}
// The names a block's type answers to: its type, and `type.kind` when its kind is text.
fn type_names(block: &Value) -> Vec<String> {
    let t = crate::js::type_of(block);
    let mut names = vec![t.to_string()];
    if let Some(kind) = ss(block, "kind") {
        names.push(format!("{t}.{kind}"));
    }
    names
}

/// Whether a block's author receives a grant: it is open (no `refs.to`), or made to them. A `to` that names a set of ids names no one.
pub(crate) fn receives(grant: &Value, block: &Value, _index: &Index) -> bool {
    receives_as(grant, rs(block, "author"))
}
/// The one receiver rule, for a receiver `who`.
pub(crate) fn receives_as(grant: &Value, who: Option<&str>) -> bool {
    let Some(to) = rf(grant, "to") else { return true };
    // a set of ids is not one id: it names no one
    to.as_str().is_some_and(|to| who == Some(to))
}

/// Whether a block signed under a grant (`refs.under`) speaks for its grantor: empty, or why not. `scope.types` lists
/// the block types or `type.kind` names it covers.
pub fn why_not_under_in(block: &Value, index: &Index, now: Option<&str>) -> Vec<String> {
    why_not_under_coded(block, index, now).into_iter().map(|(code, detail)| format!("{code}: {detail}")).collect()
}

/// A tool's word (authority.md, Who a block speaks for): `[(code, detail)]`, empty where the block speaks for the grant's
/// giver. A pair on the grant's line gives `("pair", <the fork answer as JSON text>)`.
pub(crate) fn why_not_under_coded(block: &Value, index: &Index, now: Option<&str>) -> Vec<(String, String)> {
    why_not_under_full(block, index, now).into_iter().map(|v| (v["code"].as_str().unwrap_or("").to_string(), if v["code"] == "pair" { v["pair"].to_string() } else { v["detail"].as_str().unwrap_or("").to_string() })).collect()
}

/// The answer of A tool's word, each entry `{ code, detail }` with what the code carries: `why` (not_kept, the path), `pair` (the fork answer), `lacks`
/// (not_shown), `waiting` (waiting).
pub(crate) fn why_not_under_full(block: &Value, index: &Index, now: Option<&str>) -> Vec<Value> {
    let entry = |c: &str, d: &str| json!({ "code": c, "detail": d });
    let grant = rs(block, "under").and_then(|h| index.get(h));
    let Some(grant) = grant.filter(|g| crate::js::type_of(g) == "grant") else {
        return vec![entry("not_live", "refs.under names no grant this reader holds")];
    };
    #[cfg(feature = "folds")]
    {
        let _ = now;
        return match crate::fold::grants::under(block, grant, index) {
            crate::fold::grants::Under::Ok => vec![],
            crate::fold::grants::Under::No(code, detail, extra) => {
                let mut e = entry(code, &detail);
                if let (Some(m), Some(x)) = (e.as_object_mut(), extra.as_object()) {
                    m.extend(x.clone());
                }
                vec![e]
            }
            crate::fold::grants::Under::Fork(v) => vec![json!({ "code": "pair", "detail": "a pair on the grant's line", "pair": v })],
        };
    }
    #[cfg(not(feature = "folds"))]
    return why_not_under_old(block, grant, index, now).into_iter().map(|d| entry("not_live", &d)).collect();
}

/// The fork answer of A tool's word for a block, where the grant's line holds a pair at or before it.
#[cfg(feature = "folds")]
pub(crate) fn under_fork(block: &Value, index: &Index) -> Option<Value> {
    why_not_under_coded(block, index, None).into_iter().find(|(c, _)| c == "pair").and_then(|(_, v)| serde_json::from_str(&v).ok())
}

// A tool's word in a build without the folds: the reading a micro holds.
#[cfg(not(feature = "folds"))]
fn why_not_under_old(block: &Value, grant: &Value, index: &Index, now: Option<&str>) -> Vec<String> {
    let mut wrong = Vec::new();
    if !receives(grant, block, index) {
        wrong.push("the grant is for someone else".into());
    }
    if !covers(block, grant) {
        wrong.push(format!("the grant's types do not cover a {}", type_name(block)));
    }
    // A block that names a handle (a witness: this handle said yes) is covered only by a grant that names the same one (authority.md).
    if ss(block, "handle").is_some_and(|h| ss(grant, "handle") != Some(h)) {
        wrong.push(format!("the grant does not name the handle {}", ss(block, "handle").unwrap_or("")));
    }
    if let Some(out) = outside_parties(block, grant, index) {
        wrong.push(format!("the grant's parties do not name {out}, whom it deals with"));
    }
    wrong.extend(past_visible_limit(block, grant, index));
    wrong.extend(why_not_live_for(Some(grant), index, now, block));
    wrong
}

/// A visible limit binds the counterparty too (authority.md, The limit is the principal's fence): a block whose own value is past the
/// `limit` or `each` of a grant the counterparty can read does not bind its principal. The grant is visible when it names no `audience`
/// (a public grant); a sealed limit, or a grant with an audience, keeps the rule that the fence is the principal's alone. The block is not
/// cut down to the limit: as signed it exceeds the grant, so it does not bind. A block with no money or amount in it has no value to test.
#[cfg(not(feature = "folds"))]
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
        vec!["the block is worth more than the limit the grant shows, so it does not bind its principal (authority.md, The limit is the principal's fence)".into()]
    }
}

/// What a block is worth in the grant's measure: a transfer's amount. None when it carries no value.
#[cfg(not(feature = "folds"))]
fn act_value(block: &Value, _index: &Index) -> Option<Value> {
    match crate::js::type_of(block) {
        "transfer" => st(block, "amount").cloned(),
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
#[cfg(not(feature = "folds"))]
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

/// A block's type, named as `type.kind` (or `type` with no kind).
pub(crate) fn type_name(block: &Value) -> String {
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
    /// Whether a block signed `as` a circle holds, as the relier whose causal past is `past` sees it (all given where None).
    #[cfg(feature = "folds")]
    pub(super) fn holds_for(block: &Value, index: &Index, past: Option<&crate::js::Past>) -> bool {
        let Some(circle) = crate::js::rs(block, "as").filter(|c| !c.is_empty()) else { return true };
        match past {
            None => crate::fold::circle::holds_in(block, circle, index),
            Some(p) => crate::fold::circle::holds_seen(block, circle, index, p),
        }
    }
    #[cfg(not(feature = "folds"))]
    pub(super) fn holds_for(_block: &Value, _index: &Index, _past: Option<&crate::js::Past>) -> bool {
        false
    }
    #[cfg(feature = "folds")]
    pub(super) fn stop_counts(stop: &Value, grant: &Value, circle: &str, index: &Index) -> bool {
        crate::fold::circle::stop_counts(stop, grant, circle, index)
    }
    #[cfg(not(feature = "folds"))]
    pub(super) fn stop_counts(_stop: &Value, _grant: &Value, _circle: &str, _index: &Index) -> bool {
        false
    }
    #[cfg(not(feature = "folds"))]
    pub(super) fn principal_of(block: &Value, _index: &Index) -> Option<String> {
        if rs(block, "as").is_some_and(|c| !c.is_empty()) { None } else { rs(block, "author").map(String::from) }
    }
}

#[cfg(feature = "folds")]
/// A machine's accept (promises.md, Answers): an `observe` that `answers` a promise and says `accepted`, acting under a grant (`refs.under`).
/// It is the machine's reading, "I accepted this under her rule"; what binds her is her own grant. Under no grant it is no accept at all.
pub(crate) fn is_machine_accept(block: &Value, index: &Index) -> bool {
    crate::js::type_of(block) == "observe"
        && ss(block, "status") == Some("accepted")
        && rf(block, "under").is_some()
        && rs(block, "answers").and_then(|h| index.get(h)).is_some_and(|o| crate::js::type_of(o) == "promise")
}

/// The door op `under_ok` (authority.md, A tool's word): true, false, or the fork answer `{ pair: true, blocks, at_most }`.
// `under_ok` stays a boolean (the fork answer aside); the code A tool's word gives is read from `why_not_under`, each entry
// "code: detail".
pub fn under_ok(block: &Value, blocks: &[Value]) -> Value {
    let index = crate::js::blocks_index(blocks.iter().filter(|b| crate::js::hash_of(b) != crate::js::hash_of(block)).chain([block]));
    if !index.contains_key(crate::js::hash_of(block)) {
        return json!(false);
    }
    let wrong = why_not_under_coded(block, &index, None);
    match wrong.iter().find(|(c, _)| c == "pair") {
        Some((_, v)) => serde_json::from_str(v).unwrap_or(json!(false)),
        None => json!(wrong.is_empty()),
    }
}

/// `why_not_under` with codes: `[{ code, detail }]`, empty where the block speaks for its grantor.
pub fn why_not_under_codes(block: &Value, blocks: &[Value], now: Option<&str>) -> Value {
    let index = crate::js::blocks_index(blocks.iter().filter(|b| crate::js::hash_of(b) != crate::js::hash_of(block)).chain([block]));
    if !index.contains_key(crate::js::hash_of(block)) {
        return json!([{ "code": "not_live", "detail": "the block is no word: it is not valid on what it rests on, or rests on a block not held" }]);
    }
    Value::Array(why_not_under_full(block, &index, now))
}

/// Whether a block signed under a grant speaks for its grantor, among these blocks: empty, or why not.
pub fn why_not_under(block: &Value, blocks: &[Value], now: Option<&str>) -> Vec<String> {
    // the block is read with the input: one no node would take is no word, under no grant (folds.md)
    let index = crate::js::blocks_index(blocks.iter().filter(|b| crate::js::hash_of(b) != crate::js::hash_of(block)).chain([block]));
    if !index.contains_key(crate::js::hash_of(block)) {
        return vec!["the block is no word: it is not valid on what it rests on, or rests on a block not held".into()];
    }
    why_not_under_in(block, &index, now)
}

/// Whether one block of `value` (money, or an amount) stays inside a limit. `limit` is the limit observe, its state, or the
/// limit itself; `spent` is what the principal's node has already counted in the period: minor units of the money, or
/// the amount's value (a whole number or a decimal string), compared exactly. A cap on each block (`each`) holds whatever
/// was spent. Money in another currency, an amount in another unit, or a `spent` that is not a number is never within.
#[cfg(not(feature = "folds"))]
pub(crate) fn within_limit(limit: &Value, value: &Value, spent: &Value) -> bool {
    let fence = limit.get("state").unwrap_or(limit);
    let (cap, each) = match (fence.get("limit"), fence.get("each")) {
        (None, None) => (Some(limit), None),
        (c, e) => (c, e),
    };
    let (Some(spent), Some(size)) = (Dec::of(Some(spent)), Dec::of(size_of(value))) else { return false };
    // A value or a spent amount below zero is never within (authority.md): a block cannot push a cap back.
    let zero = Dec::zero();
    if size.cmp(&zero).is_lt() || spent.cmp(&zero).is_lt() {
        return false;
    }
    let total = spent.add(&size);
    let at_most = |c: &Value, n: &Dec| same_measure(value, c) && Dec::of(size_of(c)).is_some_and(|c| n.cmp(&c).is_le());
    (cap.is_some() || each.is_some()) && cap.is_none_or(|c| at_most(c, &total)) && each.is_none_or(|e| at_most(e, &size))
}

// ---- a range and a list (authority.md) ----
/// A range `{ min, max }` (one end or both) or a list `{ one_of }` (authority.md, A range and a list).
#[cfg(feature = "folds")]
pub(crate) fn is_set(v: &Value) -> bool {
    let Some(m) = v.as_object() else { return false };
    (!m.is_empty() && m.keys().all(|k| k == "min" || k == "max")) || (m.len() == 1 && m.contains_key("one_of"))
}

// The anchor two durations are compared from: durations are compared, never added to a date that means anything (blocks.md, The cut).
// two durations at a set place are compared from one fixed instant (2000-01-01), so P1M against P30D reads the same for
// every reader; a set place may hold a duration whether or not the promise carries `repeat`.
const ANCHOR: &str = "2000-01-01T00:00:00.000Z";

/// Two values at a set place compared, where they are of one kind: amounts (same unit and `of`), prices per unit (the same `per`, byte for
/// byte), times, or durations. None where they are of two kinds.
pub(crate) fn cmp_value(a: &Value, b: &Value) -> Option<core::cmp::Ordering> {
    if let (Some(x), Some(y)) = (crate::decimal::Amount::of(Some(a)), crate::decimal::Amount::of(Some(b))) {
        return (x.kind == y.kind).then(|| x.value.cmp(&y.value));
    }
    if a.get("per").is_some() || b.get("per").is_some() {
        let same_per = a.get("per").is_some_and(|p| Some(crate::canonical::canonical_json(p)) == b.get("per").map(crate::canonical::canonical_json));
        let (x, y) = (crate::decimal::Amount::of(a.get("amount"))?, crate::decimal::Amount::of(b.get("amount"))?);
        return (same_per && x.kind == y.kind).then(|| x.value.cmp(&y.value));
    }
    let (sa, sb) = (a.as_str()?, b.as_str()?);
    if let (Some(x), Some(y)) = (crate::time::parse(sa), crate::time::parse(sb)) {
        return Some(x.cmp(&y));
    }
    if crate::time::parse_duration(sa).is_some() && crate::time::parse_duration(sb).is_some() {
        return crate::time::compare_durations(sa, sb, ANCHOR).map(|c| c.cmp(&0));
    }
    None
}

/// Whether one value is inside a range or a list: of the same kind, from `min` to `max` both counted, or equal to a listed value, compared as
/// decimals. A value that is itself a range or a list is inside nothing (C is always fully stated).
#[cfg(feature = "folds")]
pub(crate) fn inside(v: &Value, set: &Value) -> bool {
    if is_set(v) {
        return false;
    }
    if let Some(items) = set.get("one_of").and_then(Value::as_array) {
        return items.iter().any(|x| cmp_value(v, x) == Some(core::cmp::Ordering::Equal));
    }
    let low = set.get("min").is_none_or(|m| cmp_value(v, m).is_some_and(|o| o != core::cmp::Ordering::Less));
    let high = set.get("max").is_none_or(|m| cmp_value(v, m).is_some_and(|o| o != core::cmp::Ordering::Greater));
    low && high
}


#[cfg(test)]
mod tests {
    use super::*;
    // The one receiver rule's edges (authority.md, refs.to), in every build.
    #[test]
    fn receives_edges() {
        let index = Index::default();
        let (a, c) = ("a".repeat(64), "c".repeat(64));
        let block = json!({ "type": "observe", "state": { "kind": "note" }, "refs": { "author": a } });
        let grant = |refs: Value, state: Value| json!({ "type": "grant", "state": state, "refs": refs });
        assert!(receives(&grant(json!({}), json!({ "kind": "errands" })), &block, &index), "open: anyone");
        assert!(receives(&grant(json!({ "to": a }), json!({ "kind": "errands" })), &block, &index), "made to the author");
        assert!(!receives(&grant(json!({ "to": c }), json!({ "kind": "errands" })), &block, &index), "made to someone else");
        // a set of ids is not one id: it names no one (a refs.to of any other shape is refused by the check, so no fold reads it)
        assert!(!receives(&grant(json!({ "to": [a] }), json!({ "kind": "errands" })), &block, &index), "a to that is a set");
    }
}
