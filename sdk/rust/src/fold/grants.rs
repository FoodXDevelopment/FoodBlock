//! FoodBlock 1.9, stage 4: grants (changes-1.9/04-grants.md). What a person's tool may do for her.
//!
//! - **G1, a tool's word** (`under`): a block under her grant speaks for her only where it is for a promise in `scope.on` (or a deal a
//!   block under the same grant made), keeps to that promise (`keeps_to`), fits on the grant's line (`meter`) and stands.
//! - **Keeps to** (`keeps_to`): C's `state` and `refs` are A's key for key, bar a closed list of eight; one value inside a range or a list A
//!   states, at the six set places.
//! - **The line** (`meter`): every block under a grant is counted on the one line `refs.meter` names: the holder's own key's line, or a
//!   line of another key (a meter she names) that receipts each draw with its running total. A fork on the holder's own line answers
//!   `{ pair: true, held, at_most }`; a false receipt binds its signer, never her past her measures (G7).
//! - **The worst case** (`worst_case`): from her grant and the promises it names alone, per kind, never added across kinds.
//! - **Her deadline** (`lowest_offer`): the lowest offer received on the meter's line before its cutoff through the deadline.
use super::{grant_chain, principal_of, terms_total};
use crate::decimal::{Amount, Dec, Kind};
use crate::js::{get, hash_of, list, rf, rs, ss, st, type_of, Index};
use crate::prelude::*;
use alloc::collections::{BTreeMap, BTreeSet};
use core::cmp::Ordering;

// ---------------------------------------------------------------------------------------------------------------------------------------
// Ranges, lists and Keeps to
// ---------------------------------------------------------------------------------------------------------------------------------------

/// The set places (protocol.json `set_places`): the terms where a range or a list may sit.
const TERM_PLACES: [&str; 4] = ["price", "quantity", "pay_by", "deliver_by"];
const LINE_PLACES: [&str; 2] = ["price", "quantity"];

pub(crate) use crate::grant::{cmp_value, inside, is_set};

fn same(a: &Value, b: &Value) -> bool {
    crate::canonical::canonical_json(a) == crate::canonical::canonical_json(b)
}

/// The values a promise states at one set place, compared with A's: inside A's set, or equal to A's one value.
fn place_keeps(c: Option<&Value>, a: Option<&Value>) -> bool {
    match (c, a) {
        (None, None) => true,
        (Some(c), Some(a)) if is_set(a) => inside(c, a),
        (Some(c), Some(a)) => !is_set(c) && (same(c, a) || cmp_value(c, a) == Some(Ordering::Equal) && Amount::of(Some(c)).is_some()),
        _ => false,
    }
}

/// Keeps to (authority.md, Blocks that bind): C keeps to A when C's `state` and `refs` are A's key for key, bar a closed list of eight.
/// `(keeps, why)`: `why` the first sorted path that differs and is not one of the eight. Paths are written `state.x`, `refs.x`, and
/// `terms.x` for a term (`terms.lines.<id>.price` for a line).
pub(crate) fn keeps_to(c: &Value, a: &Value, index: &Index) -> (bool, Option<String>) {
    keeps_to_depth(c, a, index, 0)
}
// Whether an id names a kind: a held block of kind `kind`, or one a held thing names in `refs.of`.
fn is_kind_id(h: &str, index: &Index) -> bool {
    index.get(h).is_some_and(|t| ss(t, "kind") == Some("kind") || index.values().any(|x| rs(x, "of") == Some(h)))
}
fn keeps_to_depth(c: &Value, a: &Value, index: &Index, depth: usize) -> (bool, Option<String>) {
    let mut wrong: Vec<String> = Vec::new();
    let a_author = rs(a, "author");
    // refs
    let empty = Map::new();
    let (cr, ar) = (c.get("refs").and_then(Value::as_object).unwrap_or(&empty), a.get("refs").and_then(Value::as_object).unwrap_or(&empty));
    let keys: BTreeSet<&String> = cr.keys().chain(ar.keys()).collect();
    for k in keys {
        let (cv, av) = (cr.get(k), ar.get(k));
        let ok = match k.as_str() {
            // 1. what every block has of its own (1.9 stage 6: `as`, the circle its signer speaks for, is hers like `author`, so a circle's
            // want can be kept to by the other side)
            "author" | "prev" | "after" | "key" | "as" => true,
            // 3. C's links: `answers` and `under` freely; `refs.for` naming A or a promise that keeps to A
            "answers" | "under" => true,
            "for" => list(cv).iter().all(|h| *h == hash_of(a) || (depth < 8 && index.get(*h).is_some_and(|x| type_of(x) == "promise" && keeps_to_depth(x, a, index, depth + 1).0))),
            // 4. a side A leaves open, which C names (C is always fully stated: both sides named; `parties` is the grant's, read by G1)
            "from" | "to" => match (cv, av) {
                (Some(x), Some(y)) => same(x, y),
                (Some(_), None) => true,
                _ => false,
            },
            // 5. where A names kinds: each id in C an instance of one of them, each kind with an instance in C; else the same ids
            "what" => match (cv, av) {
                (Some(x), Some(y)) => {
                    let kinds = list(Some(y));
                    let ids = list(Some(x));
                    if !kinds.is_empty() && kinds.iter().all(|k| is_kind_id(k, index)) {
                        let kind_of = |id: &str| index.get(id).and_then(|i| rs(i, "of")).filter(|k| kinds.contains(k));
                        !ids.is_empty() && ids.iter().all(|i| kind_of(i).is_some()) && kinds.iter().all(|k| ids.iter().any(|i| kind_of(i) == Some(*k)))
                    } else {
                        let (mut p, mut q) = (ids.clone(), kinds.clone());
                        p.sort();
                        q.sort();
                        p == q
                    }
                }
                _ => false,
            },
            _ => match (cv, av) {
                (Some(x), Some(y)) => same(x, y),
                (None, None) => true,
                _ => false,
            },
        };
        if !ok {
            wrong.push(format!("refs.{k}"));
        }
    }
    for k in ["from", "to"] {
        if cr.get(k).is_none() && ar.get(k).is_none() {
            wrong.push(format!("refs.{k}"));
        }
    }
    // state
    let (cs, as_) = (c.get("state").and_then(Value::as_object).unwrap_or(&empty), a.get("state").and_then(Value::as_object).unwrap_or(&empty));
    let repeats = get(a, "state.terms.repeat").is_some();
    let keys: BTreeSet<&String> = cs.keys().chain(as_.keys()).collect();
    for k in keys {
        let (cv, av) = (cs.get(k), as_.get(k));
        match k.as_str() {
            // 1. what every block has of its own; 1.9 stage 4 (decided in building): `state.draws`, a block's own word about its line, is read as one of them
            "seq" | "at" | "nonce" | "skip" | "draws" => {}
            // 2. its audience (public, or sealed to the grantor and the holder: a sealed copy is read where it is opened)
            "audience" => {}
            // 8. C's own `occurrence` where A carries repeat
            "occurrence" if repeats && av.is_none() => {}
            "terms" => wrong.extend(terms_differ(cv, av, c, a_author)),
            _ => {
                let ok = match (cv, av) {
                    (Some(x), Some(y)) => same(x, y),
                    (None, None) => true,
                    _ => false,
                };
                if !ok {
                    wrong.push(format!("state.{k}"));
                }
            }
        }
    }
    wrong.sort();
    let why = wrong.into_iter().next();
    (why.is_none(), why)
}

fn terms_differ(c: Option<&Value>, a: Option<&Value>, cblock: &Value, a_author: Option<&str>) -> Vec<String> {
    let empty = Map::new();
    let ct = c.and_then(Value::as_object).unwrap_or(&empty);
    let at = a.and_then(Value::as_object).unwrap_or(&empty);
    if c.is_some_and(|v| !v.is_object()) || a.is_some_and(|v| !v.is_object()) {
        return vec!["state.terms".into()];
    }
    let mut wrong = Vec::new();
    let keys: BTreeSet<&String> = ct.keys().chain(at.keys()).collect();
    for k in keys {
        let (cv, av) = (ct.get(k), at.get(k));
        let ok = match k.as_str() {
            // 8. C's own expires
            "expires" => true,
            // 7. a price, where A states none, she pays it, and the other side signs C
            "price" if av.is_none() => {
                cv.is_some() && a_author.is_some_and(|me| rs(cblock, "author").is_some_and(|by| by != me))
                    // she pays: A names her as the side that receives the goods
                    && rs(cblock, "to") == a_author
                    && cv.is_some_and(|v| !is_set(v))
            }
            "lines" => {
                wrong.extend(lines_keep(cv, av));
                true
            }
            p if TERM_PLACES.contains(&p) => place_keeps(cv, av),
            _ => match (cv, av) {
                (Some(x), Some(y)) => same(x, y),
                (None, None) => true,
                _ => false,
            },
        };
        if !ok {
            wrong.push(format!("terms.{k}"));
        }
    }
    wrong
}

// Lines matched by `id`: each id on either side has a line on the other, keeping to it at price and quantity, and equal elsewhere. The
// paths that differ: `terms.lines.<id>` for a line one side lacks, `terms.lines.<id>.<field>` for a field.
fn lines_keep(c: Option<&Value>, a: Option<&Value>) -> Vec<String> {
    let empty = Vec::new();
    let (cl, al) = (c.and_then(Value::as_array).unwrap_or(&empty), a.and_then(Value::as_array).unwrap_or(&empty));
    let id_of = |l: &Value| l.get("id").map(|i| i.as_str().map(String::from).unwrap_or_else(|| i.to_string())).unwrap_or_else(|| "undefined".into());
    let ids: BTreeSet<String> = cl.iter().chain(al.iter()).map(id_of).collect();
    let mut out = Vec::new();
    for id in ids {
        let (Some(x), Some(y)) = (al.iter().find(|l| id_of(l) == id).and_then(Value::as_object), cl.iter().find(|l| id_of(l) == id).and_then(Value::as_object)) else {
            out.push(format!("terms.lines.{id}"));
            continue;
        };
        let keys: BTreeSet<&String> = x.keys().chain(y.keys()).collect();
        for k in keys {
            let ok = if LINE_PLACES.contains(&k.as_str()) { place_keeps(y.get(k), x.get(k)) } else { matches!((y.get(k), x.get(k)), (Some(p), Some(q)) if same(p, q)) };
            if !ok {
                out.push(format!("terms.lines.{id}.{k}"));
            }
        }
    }
    out
}

/// The door op `keeps_to`: `{ keeps, why }`.
pub fn keeps_to_door(c: &Value, a: &Value, held: &[Value]) -> Value {
    let index = crate::js::index_of(held.iter().chain([c, a]));
    let (keeps, why) = keeps_to(c, a, &index);
    json!({ "keeps": keeps, "why": why })
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// G1, a tool's word
// ---------------------------------------------------------------------------------------------------------------------------------------

/// What G1 answers for a block under a grant.
#[derive(Debug, Clone)]
pub(crate) enum Under {
    /// It speaks for the grant's giver.
    Ok,
    /// It speaks only for its signer: a code, its detail, and what the code carries (`why` for not_kept, `lacks`, `waiting`), or null.
    No(&'static str, String, Value),
    /// A pair on the grant's line at or before it: `{ pair: true, held, at_most }` (A fork on a tool's line).
    Fork(Value),
}

fn no(code: &'static str, detail: impl Into<String>) -> Under {
    Under::No(code, detail.into(), Value::Null)
}
fn no_with(code: &'static str, detail: impl Into<String>, extra: Value) -> Under {
    Under::No(code, detail.into(), extra)
}

/// Whether the grant states `scope.<k>`.
fn scope<'a>(g: &'a Value, k: &str) -> Option<&'a Value> {
    get(g, &format!("state.scope.{k}"))
}
fn scope_list<'a>(g: &'a Value, k: &str) -> Vec<&'a str> {
    list(scope(g, k))
}

/// Whether a block is an accept: a promise (or a machine's observe) that answers a promise and says `accepted`.
fn is_accept(b: &Value, index: &Index) -> bool {
    ss(b, "status") == Some("accepted") && rs(b, "answers").and_then(|h| index.get(h)).is_some_and(|o| type_of(o) == "promise") && matches!(type_of(b), "promise" | "observe")
}

/// The deal a word about what is hers to receive is about: `paid` its subject; `received`, `covers` its `for`; an accepted answer to a
/// transfer, that transfer's `for`.
fn receiving_deal<'a>(b: &'a Value, index: &'a Index) -> Option<Vec<&'a str>> {
    match (type_of(b), ss(b, "kind"), ss(b, "status")) {
        ("observe", Some("paid"), _) => Some(list(rf(b, "subject"))),
        ("observe", Some("received"), _) => Some(list(rf(b, "for"))),
        (_, _, Some("accepted")) => {
            let t = rs(b, "answers").and_then(|h| index.get(h)).filter(|t| type_of(t) == "transfer")?;
            Some(list(rf(t, "for")))
        }
        _ if st(b, "covers").is_some() => Some(list(rf(b, "for"))),
        _ => None,
    }
}

/// The blocks under a grant, or a grant passed on from it, that are accepts: the deals they made (their `for`, and the offer they answer).
fn deals_made<'a>(grant: &Value, index: &'a Index) -> Vec<(&'a Value, Vec<&'a str>)> {
    let gh = hash_of(grant);
    index
        .values()
        .filter(|b| rs(b, "under") == Some(gh) && is_accept(b, index) && crate::identity::binds_signer(b, index))
        .map(|b| {
            let mut d = list(rf(b, "for"));
            d.extend(rs(b, "answers"));
            (b, d)
        })
        .collect()
}

/// Whether two keys (actors' ids) are one hand by a two-key link (identity.md, A two-key link): one signs an `observe` of kind `link` with
/// `same_as` the other, and the other counter-signs with its own `link` naming the first in `refs.confirms`. Both counted.
/// A link is read between the two ids alone: it is not transitive, and a link held anywhere among the blocks counts (no causal past is read).
pub(crate) fn linked(x: &str, y: &str, index: &Index) -> bool {
    if x == y {
        return true;
    }
    let link_by = |a: &str, b: &str| {
        index.values().any(|l| {
            type_of(l) == "observe"
                && ss(l, "kind") == Some("link")
                && rs(l, "author") == Some(a)
                && list(rf(l, "same_as")).contains(&b)
                && crate::identity::counts_in(l, index)
                && index.values().any(|m| {
                    type_of(m) == "observe" && ss(m, "kind") == Some("link") && rs(m, "author") == Some(b) && list(rf(m, "same_as")).contains(&a) && list(rf(m, "confirms")).contains(&hash_of(l)) && crate::identity::counts_in(m, index)
                })
        })
    };
    link_by(x, y) || link_by(y, x)
}

/// The promises in `on`, held.
fn on_promises<'a>(grant: &'a Value, index: &'a Index) -> Vec<&'a Value> {
    scope_list(grant, "on").into_iter().filter_map(|h| index.get(h)).collect()
}

/// The promise in `on` that a promise C keeps to: C keeps to it (Keeps to), or C is itself an answer that accepts it (an order of an open
/// offer: it names only the quantity it chooses, inside A's).
fn kept_by<'a>(c: &Value, ons: &[&'a Value], index: &Index) -> Result<&'a Value, Option<String>> {
    let mut first: Option<String> = None;
    for a in ons {
        if is_accept(c, index) && rs(c, "answers") == Some(hash_of(a)) {
            let q = get(c, "state.terms.quantity");
            if q.is_none_or(|q| place_keeps_at_most(q, get(a, "state.terms.quantity"))) {
                return Ok(a);
            }
            first.get_or_insert_with(|| "terms.quantity".into());
            continue;
        }
        let (k, why) = keeps_to(c, a, index);
        if k {
            return Ok(a);
        }
        if first.is_none() {
            first = why;
        }
    }
    Err(first)
}
// An answer's quantity against the offer's: inside its range, or no more than its one value.
fn place_keeps_at_most(q: &Value, a: Option<&Value>) -> bool {
    match a {
        None => true,
        Some(a) if is_set(a) => inside(q, a),
        Some(a) => cmp_value(q, a).is_some_and(|o| o != Ordering::Greater),
    }
}
/// Whether she sells under a promise in `on`: it names her as the side that hands over (`from`).
fn sells_by(a: &Value, principal: &str) -> bool {
    rs(a, "from") == Some(principal)
}

/// The sides a promise names (`from`, `to`).
fn sides_of(p: &Value) -> Vec<&str> {
    ["from", "to"].iter().flat_map(|k| list(rf(p, k))).collect()
}

/// The grant a block acts under, and G1's answer. `grant` is the block's `refs.under`, held and a grant.
pub(crate) fn under(block: &Value, grant: &Value, index: &Index) -> Under {
    if let Some(u) = under_core(block, grant, index) {
        return u;
    }
    if coming_back(block, grant, index) {
        return Under::Ok;
    }
    // (3) it fits on the grant's line
    match meter_of(grant, index, Some(block)) {
        Ok(m) => {
            if m.get("not_shown").is_some() {
                return no_with("not_shown", "the grant's line is not read whole", json!({ "lacks": m["lacks"].clone() }));
            }
            if m["fits"] == json!(true) {
                Under::Ok
            } else if let Some(p) = m["why"].as_object().filter(|p| p.contains_key("pair")) {
                Under::Fork(Value::Object(p.clone()))
            } else {
                let why = m["why"].as_str().unwrap_or("past");
                no(code_of(why), format!("the block does not fit on the grant's line ({why})"))
            }
        }
        Err(why) => no(code_of(why), format!("the block does not fit on the grant's line ({why})")),
    }
}

/// Coming back: the holder's own transfer `to_owner` her of what the grant's line holds of hers needs no accept, no type in `types`, no
/// room under `limit` and no meter's receipt.
fn coming_back(block: &Value, grant: &Value, index: &Index) -> bool {
    let chain = grant_chain(grant, index);
    let principal = principal_of(chain.last().copied().unwrap_or(grant), index).unwrap_or_default();
    let to_owner = list(rf(block, "to_owner"));
    type_of(block) == "transfer" && st(block, "status").is_none() && to_owner.len() == 1 && to_owner[0] == principal && rf(grant, "what").is_some()
}

/// G1 but the line: None where the block passes every clause but (3), else the answer.
pub(crate) fn under_core(block: &Value, grant: &Value, index: &Index) -> Option<Under> {
    match under_clauses(block, grant, index) {
        Under::Ok => None,
        u => Some(u),
    }
}
fn under_clauses(block: &Value, grant: &Value, index: &Index) -> Under {
    let signer = rs(block, "author").unwrap_or("");
    // the principal at the top of the grant's chain
    let chain = grant_chain(grant, index);
    let top = chain.last().copied().unwrap_or(grant);
    let principal = principal_of(top, index).unwrap_or_default();
    // Coming back: the holder's own transfer `to_owner` her of what the grant's line holds of hers needs no accept, no type in `types`,
    // no room under `limit` and no meter's receipt
    let to_owner = list(rf(block, "to_owner"));
    let back = type_of(block) == "transfer" && st(block, "status").is_none() && to_owner.len() == 1 && to_owner[0] == principal && rf(grant, "what").is_some();
    if back && crate::grant::receives(grant, block, index) && crate::grant::why_not_live_for(Some(grant), index, None, block).is_empty() {
        return Under::Ok;
    }
    // its type is in scope.types (matched exactly)
    if !crate::grant::covers(block, grant) {
        return no("not_live", format!("the grant's types do not name a {}", crate::grant::type_name(block)));
    }
    // the grant is made for its signer
    if !crate::grant::receives(grant, block, index) {
        return no("not_live", "the grant is for someone else");
    }
    // a scope that cannot be read holds the grant to no word
    let junk = st(grant, "scope").map(crate::check::scope_junk).unwrap_or_default();
    if !junk.is_empty() {
        return no("not_live", format!("the grant's scope cannot be read: {}", junk.join(", ")));
    }
    // live for it: its own end and its parents', its until by the block's own date, a parent that is wider
    let dead = crate::grant::why_not_live_for(Some(grant), index, None, block);
    if let Some(d) = dead.first() {
        return no("not_live", d.clone());
    }
    // an end read on the grant's own clocks (blocks.md, The cut; From where a stop counts): a stop narrows, so `names` less `needed`, plus
    // one, of its clock's lines showing the stop before the block cut it.
    // 1.9 stage 4 (decided in building): G1 reads only the narrowing here; the widening join (`needed` receipts of the block) is the relier's question.
    if let Some(end) = clock_end(block, grant, index) {
        return no("not_live", format!("the grant's clocks show its end {end} before the block"));
    }
    // a pair on the grant's line, where the line is the holder's own key
    let line = line_of(grant, index);
    if let Some(l) = &line {
        if l.own {
            if let Some(group) = pair_at(block, l, index) {
                return Under::Fork(json!({ "pair": true, "held": group, "at_most": worst(grant, index)["at_most"].clone() }));
            }
        }
    }
    // every side it deals with is admitted: the principal, an id in `parties`, a side a promise in `on` names, or a side of a deal a block
    // under the grant made
    let parties = scope_list(grant, "parties");
    let ons = on_promises(grant, index);
    let made = deals_made(grant, index);
    // a side A leaves open, which C names: where the grant states parties, one of them; where it states none, anyone
    let open_side = scope(grant, "parties").is_none() && ons.iter().any(|p| rf(p, "from").is_none() || rf(p, "to").is_none());
    let admitted = |id: &str| {
        id == principal
            || open_side
            || (type_of(block) == "transfer" && passes_to_tool(block, id, &principal, index))
            || parties.contains(&id)
            || ons.iter().any(|p| sides_of(p).contains(&id))
            || made.iter().any(|(a, _)| hash_of(a) != hash_of(block) && rs(a, "answers").and_then(|h| index.get(h)).is_some_and(|o| sides_of(o).contains(&id) || rs(o, "author") == Some(id)))
    };
    if let Some(out) = crate::grant::dealt_with(block, index).into_iter().find(|id| !admitted(id)) {
        return no("not_live", format!("the grant does not admit {out}, whom it deals with"));
    }
    // No one is both sides of a word (A9): a block that gives to its own signer, a key linked to it, or a circle in which her hand could count
    if let Some(to) = gives_to(block, index) {
        let named = ons.iter().any(|p| sides_of(p).contains(&to.as_str()));
        // 1.9 stage 6 (C16): a circle in which her hand could count
        let circle_of_hers = to != principal && super::circle::founding(&to, index).is_some() && super::hand_could_count(signer, &to, Some(block), index);
        if !named && to != principal && (to == signer || linked(&to, signer, index) || circle_of_hers) {
            return no("both_sides", format!("it gives to {to}, the signer's own hand"));
        }
    }
    // (1) and (2): for a promise in `on`, keeping to it; or of a deal in `on`, or one a block under the same grant made
    let in_on = |d: &str| ons.iter().any(|p| hash_of(p) == d);
    let made_here = |d: &str| made.iter().any(|(a, ds)| hash_of(a) != hash_of(block) && ds.contains(&d));
    let t = type_of(block);
    let mut accepted: Option<(&Value, &Value)> = None; // (the accepted promise, the promise in `on` it keeps to)
    if is_accept(block, index) || (t == "promise" && st(block, "status").is_none()) {
        // an accept: the block it accepts keeps to a promise in `on`; an offer or a counter of her tool: it keeps to one itself
        let c = if is_accept(block, index) { rs(block, "answers").and_then(|h| index.get(h)).unwrap() } else { block };
        if ons.is_empty() {
            return no("not_kept", "the grant names no promise in scope.on");
        }
        let a = match kept_by(c, &ons, index) {
            Ok(a) => a,
            Err(why) => return no_with("not_kept", why.clone().unwrap_or_default(), json!({ "why": why })),
        };
        accepted = Some((c, a));
        // her quantity is the measure: a grant whose draw on A took nothing holds no part of it, so nothing under it keeps to A
        if her_quantity(grant, a, index).is_some_and(|q| q.value.is_zero()) {
            return no("not_kept", "the grant's draw on the promise it names took nothing (Her quantity is the measure)");
        }
        // G4: one fill for each occurrence
        if get(a, "state.terms.repeat").is_some() && is_accept(block, index) {
            if filled_before(block, c, a, grant, index) {
                return no("not_kept", "the occurrence it fills is already filled (G4)");
            }
        }
        // G15: her deadline, and the lowest offer at it
        if is_accept(block, index) {
            if let Some(u) = deadline_reading(block, c, grant, index, line.as_ref()) {
                return u;
            }
        }
    } else if let Some(deals) = receiving_deal(block, index) {
        if !deals.iter().any(|d| in_on(d) || made_here(d)) {
            return no("not_kept", "a word about what is hers to receive for a deal not in scope.on and not made under the grant");
        }
    } else if t == "transfer" && st(block, "status").is_none() {
        // coming back: the holder's own transfer `to_owner` her of what the grant's line holds of hers needs nothing more
        let to = list(rf(block, "to_owner"));
        let back = to.len() == 1 && to[0] == principal;
        let pass = to.len() == 1 && passes_to_tool(block, to[0], &principal, index);
        if !back && !pass {
            let deals = list(rf(block, "for"));
            if !deals.iter().any(|d| in_on(d) || made_here(d)) {
                return no("not_kept", "a payment or a delivery for a deal not in scope.on and not made under the grant");
            }
            if let Some(why) = not_due(block, grant, &principal, index) {
                return no("not_due", why);
            }
        }
    } else if t == "transform" {
        // a make, under a grant that names an instance (Toll work): its inputs are drawn on that instance
        let what = list(rf(grant, "what"));
        let inputs: Vec<&str> = st(block, "inputs").and_then(Value::as_array).into_iter().flatten().filter_map(|i| i.get("from").and_then(Value::as_str)).collect();
        if what.is_empty() || inputs.is_empty() || !inputs.iter().all(|i| what.contains(i)) {
            return no("not_kept", "a make under a grant that does not name what it is made from");
        }
    } else {
        return no("not_kept", "a block that binds nothing speaks for its signer alone");
    }
    // A stop of one thing: her own stop naming one thing ends, for that thing only, every draw on or move of it under her grants until she
    // lifts it, read as any end of the grant (on its clocks); a hand-back never is
    let things: BTreeSet<&str> = list(rf(block, "what")).into_iter().chain(accepted.map(|(c, _)| list(rf(c, "what"))).unwrap_or_default()).chain(list(rf(block, "derives_from"))).collect();
    let hand_back = t == "transfer" && list(rf(block, "to_owner")) == [principal.as_str()];
    if !things.is_empty() && !hand_back {
        if let Some(s) = thing_stopped(block, grant, &things, &principal, index) {
            return no("stopped_thing", format!("her stop of one thing {s} reaches this block"));
        }
    }
    let _ = accepted;
    Under::Ok
}

/// Her stop of one thing that reaches a block under her grant (authority.md, A stop of one thing): her own counted observe with status
/// `stopped`, `stop: onward` and one `refs.what` the block draws on or moves, seen by the block (in its causal past, or shown first on the
/// grant's clocks: `names` less `needed`, plus one, of their lines), not lifted by her `resumed` update of it that stands in the block's past.
/// With `state.amount`, it reaches only a block after which the grant's line would hold less than that much of the thing undrawn.
fn thing_stopped(block: &Value, grant: &Value, things: &BTreeSet<&str>, principal: &str, index: &Index) -> Option<String> {
    let past = index.past_of(block);
    let clocks = scope(grant, "clocks").and_then(crate::tasks::clocks_of);
    for s in index.values() {
        if type_of(s) != "observe" || ss(s, "status") != Some("stopped") || ss(s, "stop") != Some("onward") || rf(s, "updates").is_some() || rf(s, "answers").is_some() || rs(s, "author") != Some(principal) || !crate::identity::counts_in(s, index) {
            continue;
        }
        let Some(t0) = list(rf(s, "what")).first().copied() else { continue };
        if !things.contains(t0) {
            continue;
        }
        let seen = past.contains(hash_of(s)) || clocks.as_ref().is_some_and(|k| crate::line::end_first(hash_of(block), hash_of(s), k, index, &|_| true));
        if !seen {
            continue;
        }
        let lifted = index.values().any(|x| {
            type_of(x) == "observe" && ss(x, "status") == Some("resumed") && rs(x, "updates") == Some(hash_of(s)) && rs(x, "author") == Some(principal) && crate::identity::counts_in(x, index) && past.contains(hash_of(x)) && crate::identity::stands(x, index).stands
        });
        if lifted {
            continue;
        }
        if let Some(amount) = Amount::of(st(s, "amount")) {
            let pack = index.get(t0).and_then(|t| Amount::of(st(t, "pack")));
            let limit = scope(grant, "limit").and_then(|l| Amount::of(Some(l)));
            let part = match (limit, pack) {
                (Some(l), Some(p)) if l.kind == p.kind => Some(l),
                (_, p) => p,
            };
            let gh = hash_of(grant);
            let amount_of = |x: &Value| -> Option<Amount> {
                Amount::of(st(x, "amount")).or_else(|| st(x, "inputs").and_then(Value::as_array).and_then(|l| l.iter().find(|i| i.get("from").and_then(Value::as_str) == Some(t0))).and_then(|i| Amount::of(i.get("amount"))))
            };
            let drawn = index
                .values()
                .filter(|x| rs(x, "under") == Some(gh) && (hash_of(x) == hash_of(block) || past.contains(hash_of(x))) && (list(rf(x, "what")).contains(&t0) || list(rf(x, "derives_from")).contains(&t0)))
                .filter_map(amount_of)
                .fold(Dec::zero(), |t, a| t.add(&a.value));
            if part.is_some_and(|p| p.value.sub(&drawn).cmp(&amount.value) != Ordering::Less) {
                continue;
            }
        }
        return Some(hash_of(s).to_string());
    }
    None
}

fn code_of(why: &str) -> &'static str {
    match why {
        "past" => "past",
        "unit" => "unit",
        "not_on_line" => "not_on_line",
        "waiting" => "waiting",
        "after_deadline" => "after_deadline",
        "not_shown" => "not_shown",
        _ => "past",
    }
}

/// Whom a block gives to, where it gives: a transfer's `to_owner`; an accept, the side of the accepted promise that receives from her
/// (the author of the promise accepted, where it is not her side). 1.9 stage 4 (decided in building): an accept of an order "gives to" the order's author.
fn gives_to(block: &Value, index: &Index) -> Option<String> {
    if type_of(block) == "transfer" && st(block, "status").is_none() {
        return rs(block, "to_owner").map(String::from);
    }
    if is_accept(block, index) {
        let o = rs(block, "answers").and_then(|h| index.get(h))?;
        return rs(o, "author").map(String::from);
    }
    None
}

/// G13: a block of a tool of hers that gives a part its line holds to another tool of hers: the receiver holds a grant of hers (her own
/// grant, made to it) whose `types` names `transfer`... read as "another tool of hers": a holder of a live grant she gave.
fn passes_to_tool(block: &Value, to: &str, principal: &str, index: &Index) -> bool {
    !rf(rs(block, "under").and_then(|h| index.get(h)).unwrap_or(&Value::Null), "what").is_none()
        && index.values().any(|g| type_of(g) == "grant" && rs(g, "author") == Some(principal) && rs(g, "to") == Some(to) && st(g, "status").is_none() && crate::identity::counts_in(g, index))
}

/// Due (00-shared, Deals): a payment or a delivery under a grant is of a deal whose binding accept, standing, is in its causal past; to its
/// other side; of no more than that deal names her side to hand over; and with what `waits_on` names standing. None where it is due.
fn not_due(block: &Value, grant: &Value, principal: &str, index: &Index) -> Option<String> {
    let past = index.past_of(block);
    let deals = list(rf(block, "for"));
    // the binding accept: an accept in its past, under this grant or by her own hand, of an offer in one of the deals it names; or (1.9 R-P6)
    // the other side's accept of her own offer
    let of_deal = |a: &Value| is_accept(a, index) && past.contains(hash_of(a)) && (list(rf(a, "for")).iter().any(|d| deals.contains(d)) || rs(a, "answers").is_some_and(|o| deals.contains(&o)));
    let accept = index
        .values()
        .find(|a| of_deal(a) && (rs(a, "under") == Some(hash_of(grant)) || rs(a, "author") == Some(principal)))
        .or_else(|| index.values().find(|a| of_deal(a) && rs(a, "answers").and_then(|o| index.get(o)).is_some_and(|o| super::speaker_of(o, index, None).as_deref() == Some(principal))));
    let Some(accept) = accept else { return Some("the deal's binding accept is not in its causal past".into()) };
    let offer = rs(accept, "answers").and_then(|h| index.get(h))?;
    // to its other side
    let other = rs(offer, "author").filter(|a| *a != principal).or_else(|| sides_of(offer).into_iter().find(|s| *s != principal));
    if rs(block, "to_owner") != other {
        return Some("it is not to the deal's other side".into());
    }
    // what that deal names her side to hand over, no more: the price total, where she pays
    // (a payment against the price total; a delivery, which names what it moves, against the quantity chosen)
    let terms = get(offer, "state.terms").cloned().unwrap_or(json!({}));
    let named = if rf(block, "what").is_none() { Some(terms_total(&terms, get(accept, "state.terms.quantity"))) } else { get(accept, "state.terms.quantity").or_else(|| terms.get("quantity")).cloned() };
    if let (Some(moved), Some(due)) = (Amount::of(st(block, "amount")), named.as_ref().and_then(|n| Amount::of(Some(n)))) {
        if moved.kind != due.kind || moved.value.cmp(&due.value) == Ordering::Greater {
            return Some("it moves more than the deal names her side to hand over".into());
        }
    }
    // 1.9 R-C2, R-P6: the deal's condition, held in its causal past (a promise conditioned `{ accepted: X }` binds on its own accept, and what
    // it names is due only once X binds)
    if let Some(c) = get(offer, "state.terms.condition") {
        let seen: Vec<Value> = index.values().filter(|b| past.contains(hash_of(b))).cloned().collect();
        if crate::tasks::condition_holds(c, &seen, None) != Some(true) {
            return Some("the deal's condition has not held in its causal past".into());
        }
    }
    // what waits_on names, standing
    match get(offer, "state.terms.waits_on").and_then(Value::as_str) {
        Some("goods") => {
            // the receiver's word that the goods came: her (or her tool's) accepted answer to a transfer `for` the deal, or her `received`
            let came = index.values().any(|w| {
                past.contains(hash_of(w))
                    && super::speaker_of(w, index, None).as_deref() == Some(principal)
                    && ((ss(w, "status") == Some("accepted")
                        && rs(w, "answers").and_then(|h| index.get(h)).is_some_and(|t| type_of(t) == "transfer" && list(rf(t, "for")).iter().any(|d| deals.contains(d))))
                        || (ss(w, "kind") == Some("received") && list(rf(w, "for")).iter().any(|d| deals.contains(d))))
            });
            if !came {
                return Some("the deal waits on her word that the goods came, and it is not in its causal past".into());
            }
        }
        // 1.9 R-P6: what moves is due only once the payee's signal stands: a counted `observe` of kind `paid` that speaks for the payee,
        // `refs.subject` the deal, in the block's causal past. Read where her side hands over what moves (she is the offer's `from`)
        Some("price") if rs(offer, "from") == Some(principal) => {
            let signal = index.values().any(|o| {
                past.contains(hash_of(o))
                    && type_of(o) == "observe"
                    && ss(o, "kind") == Some("paid")
                    && st(o, "status").is_none()
                    && list(rf(o, "subject")).iter().any(|d| deals.contains(d))
                    && crate::identity::counts_in(o, index)
                    && super::speaker_of(o, index, None).as_deref() == Some(principal)
            });
            if !signal {
                return Some("the deal waits on the payee's signal that the price is paid, and it is not in its causal past".into());
            }
        }
        _ => {}
    }
    None
}

/// G4: whether an occurrence of A is already filled before this accept: another accept, in its causal past, that speaks for her (under a
/// grant naming A, or her own), of a promise that keeps to A for the same occurrence.
fn filled_before(block: &Value, c: &Value, a: &Value, grant: &Value, index: &Index) -> bool {
    let occ = st(c, "occurrence");
    let past = index.past_of(block);
    let principal = rs(a, "author");
    index.values().any(|x| {
        hash_of(x) != hash_of(block)
            && past.contains(hash_of(x))
            && is_accept(x, index)
            && crate::identity::binds_signer(x, index)
            && (rs(x, "author") == principal || rs(x, "under").and_then(|h| index.get(h)).is_some_and(|g| scope_list(g, "on").contains(&hash_of(a)) || hash_of(g) == hash_of(grant)))
            && rs(x, "answers").and_then(|h| index.get(h)).is_some_and(|o| st(o, "occurrence") == occ && keeps_to(o, a, index).0)
    })
}

/// The stops of a grant by its grantor, counted.
fn stops_of<'a>(grant: &Value, index: &'a Index) -> Vec<&'a Value> {
    let gh = hash_of(grant);
    index
        .values()
        .filter(|b| type_of(b) == "grant" && crate::grant::ending(b, gh) == Some(crate::grant::End::Stop) && rs(b, "author") == rs(grant, "author") && crate::identity::counts_in(b, index))
        .collect()
}

/// An end of the grant (or of a grant above it) its clocks show before the block: `names` less `needed`, plus one, of the lines.
fn clock_end(block: &Value, grant: &Value, index: &Index) -> Option<String> {
    for g in grant_chain(grant, index) {
        let Some(clocks) = scope(g, "clocks").and_then(crate::tasks::clocks_of) else { continue };
        for s in stops_of(g, index) {
            if crate::line::end_first(hash_of(block), hash_of(s), &clocks, index, &|_| true) {
                return Some(hash_of(s).to_string());
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The line (G6, G7, G8, G9)
// ---------------------------------------------------------------------------------------------------------------------------------------

/// The line a grant's blocks are counted on.
#[derive(Clone, Debug)]
pub(crate) struct GrantLine {
    /// The id `refs.meter` names.
    pub meter: String,
    /// Whether it is the holder's own key's line.
    pub own: bool,
    pub line: crate::line::Line,
}

/// The line a grant names: its own `refs.meter`. A child passed on from a grant whose meter is not its holder's own line is counted on
/// its parent's (its `refs.meter` must be the parent's: `wider_than_parent` otherwise).
pub(crate) fn line_of(grant: &Value, index: &Index) -> Option<GrantLine> {
    let meter = rs(grant, "meter")?;
    let line = crate::line::line_named(meter, index)?;
    let holder = rs(grant, "to");
    let own = holder.is_some_and(|h| line.author == h && line.from.is_none());
    Some(GrantLine { meter: meter.to_string(), own, line })
}

/// The groups of a pair on the holder's own line that the block is one of, or that are in its causal past: the ids, sorted.
fn pair_at(block: &Value, line: &GrantLine, index: &Index) -> Option<Vec<String>> {
    let past = index.past_of(block);
    let h = hash_of(block);
    for g in crate::identity::pair_groups_in(index) {
        let on = g.iter().all(|x| index.get(x).is_some_and(|b| crate::line::on_line(b, &line.line, index) || rs(b, "author") == Some(line.line.author.as_str())));
        if on && g.iter().any(|x| x == h || past.contains(x.as_str())) {
            let mut g = g.clone();
            g.sort();
            return Some(g);
        }
    }
    None
}

/// A measure counted on the line: the grant's `limit` (its kind), or a part it draws on (a promise in `on`: its quantity, per occurrence
/// where it repeats; an instance in `refs.what`).
#[derive(Clone, Debug)]
struct Measure {
    of: String,
    amount: Option<Amount>,
}

/// One draw on the line, as read.
#[derive(Clone, Debug)]
struct Drawn {
    block: String,
    /// per measure (`of`, and the occurrence where it repeats): the amount
    takes_of: Vec<(String, Amount)>,
    /// a draw reason found before the sums: unit, not_on_line, waiting
    fixed: Option<&'static str>,
    period: usize,
    /// where it stands on the line (its place for ordering)
    place: usize,
}

/// The draws the blocks under a grant (and the grants passed on from it, for their whole `limit`) make on its line, in line order.
/// `Err(code)` for a reason found before the line is read.
fn draws_of(grant: &Value, line: &GrantLine, index: &Index) -> (Vec<Drawn>, Vec<Value>) {
    let gh = hash_of(grant);
    // the line counts only blocks that pass G1's other clauses; a clause that asks for this line again reads it without that filter
    let fresh = index.enter_line(gh);
    let out = draws_of_read(grant, line, index, fresh);
    if fresh {
        index.leave_line(gh);
    }
    out
}
fn draws_of_read(grant: &Value, line: &GrantLine, index: &Index, filter: bool) -> (Vec<Drawn>, Vec<Value>) {
    let gh = hash_of(grant);
    let limit = scope(grant, "limit").and_then(|l| Amount::of(Some(l)));
    let each = scope(grant, "each").and_then(|l| Amount::of(Some(l)));
    let ons = on_promises(grant, index);
    let what = list(rf(grant, "what"));
    // the blocks counted: under this grant, and the grants passed on from it
    let mut blocks: Vec<&Value> = index
        .values()
        .filter(|b| {
            let under_it = rs(b, "under") == Some(gh) && (st(b, "status").is_none() || is_accept(b, index));
            let passed_on = type_of(b) == "grant" && rs(b, "parent") == Some(gh) && st(b, "status").is_none();
            b.get("type").is_some() && (under_it || passed_on) && crate::identity::binds_signer(b, index) && (passed_on || !filter || under_core(b, grant, index).is_none())
        })
        .collect();
    blocks.sort_by_key(|b| hash_of(b).to_string());
    blocks.dedup_by_key(|b| hash_of(b).to_string());
    // where each stands on the line: the holder's own line by its place on that line; another key's line by the place of its first receipt
    let mut waiting: Vec<Value> = Vec::new();
    let mut placed: Vec<(usize, &Value, Option<&'static str>)> = Vec::new();
    let receipts: Vec<&Value> = if line.own { vec![] } else { meter_receipts(line, index) };
    for b in blocks {
        if line.own {
            if !crate::line::on_line(b, &line.line, index) && rs(b, "author") != Some(line.line.author.as_str()) {
                placed.push((usize::MAX, b, Some("not_on_line")));
                continue;
            }
            if rs(b, "author") != Some(line.line.author.as_str()) || (line.line.key.is_some() && !crate::line::on_line(b, &line.line, index)) {
                placed.push((usize::MAX, b, Some("not_on_line")));
                continue;
            }
            let seq = crate::js::int(st(b, "seq")).unwrap_or(0.0) as usize;
            placed.push((seq, b, None));
        } else {
            match receipts.iter().position(|r| list(rf(r, "derives_from")).contains(&hash_of(b))) {
                Some(i) => placed.push((i, b, None)),
                // 1.9 stage 4 (decided in building): a draw on another key's line with no receipt of it is waiting, `on: meter`
                None => {
                    waiting.push(json!({ "block": hash_of(b), "on": "meter" }));
                    placed.push((usize::MAX, b, Some("waiting")));
                }
            }
        }
    }
    placed.sort_by(|x, y| x.0.cmp(&y.0).then_with(|| hash_of(x.1).cmp(hash_of(y.1))));
    let mut out = Vec::new();
    for (place, b, fixed) in placed {
        let mut takes_of: Vec<(String, Amount)> = Vec::new();
        let mut fixed = fixed;
        let t = type_of(b);
        if t == "grant" {
            // a grant passed on: a draw on the parent's line for its whole limit
            if let Some(l) = scope(b, "limit").and_then(|l| Amount::of(Some(l))) {
                takes_of.push((gh.to_string(), l));
            }
        } else if is_accept(b, index) || (t == "promise" && st(b, "status").is_none()) {
            let c = if is_accept(b, index) { rs(b, "answers").and_then(|h| index.get(h)) } else { Some(b) };
            if let Some(c) = c {
                let quantity = get(b, "state.terms.quantity").or_else(|| get(c, "state.terms.quantity"));
                let kept = kept_by(c, &ons, index).ok();
                // her quantity: a draw on the part each promise in `on` it keeps to holds
                if let Some(a) = kept {
                    if let Some(q) = Amount::of(quantity) {
                        let of = match st(c, "occurrence").and_then(Value::as_str) {
                            Some(o) if get(a, "state.terms.repeat").is_some() => format!("{}@{o}", hash_of(a)),
                            _ => hash_of(a).to_string(),
                        };
                        takes_of.push((of, q));
                    }
                }
                // what it binds her to hand over: the price total where she pays, the goods where she sells
                let principal = principal_of(grant_chain(grant, index).last().copied().unwrap_or(grant), index);
                let sells = principal.as_deref().is_some_and(|p| kept.is_some_and(|a| sells_by(a, p)) || rs(c, "from") == Some(p));
                // the terms the deal is on: an order of an open offer is on the offer's
                let on_terms = if is_accept(c, index) { rs(c, "answers").and_then(|h| index.get(h)).unwrap_or(c) } else { c };
                let kind = limit.as_ref().or(each.as_ref()).map(|l| l.kind.clone());
                // what it binds her to, in the limit's kind: the quantity where the limit is of the quantity's kind (or she sells), else
                // the deal's total at the quantity it binds, with the backing she gives
                let q_amount = Amount::of(quantity);
                let binds: Option<Amount> = if sells || (kind.is_some() && q_amount.as_ref().map(|q| &q.kind) == kind.as_ref()) {
                    q_amount
                } else {
                    let terms = get(on_terms, "state.terms").cloned().unwrap_or(json!({}));
                    let total = Amount::of(Some(&terms_total(&terms, quantity)));
                    let backing = Amount::of(get(on_terms, "state.terms.backing"));
                    match (total, backing) {
                        (Some(t), Some(bk)) if bk.kind == t.kind => Some(Amount { value: t.value.add(&bk.value), kind: t.kind }),
                        (t, _) => t,
                    }
                };
                if limit.is_some() || each.is_some() {
                    let stated = get(b, "state.draws.amount").and_then(|a| Amount::of(Some(a))).filter(|_| get(b, "state.draws.grant").and_then(Value::as_str) == Some(gh));
                    match (stated, binds) {
                        (Some(s), Some(bnd)) if Some(&s.kind) == kind.as_ref() && bnd.kind == s.kind && bnd.value.cmp(&s.value) != Ordering::Greater => takes_of.push((gh.to_string(), s)),
                        _ => fixed = fixed.or(Some("unit")),
                    }
                } else if binds.as_ref().is_some_and(|b| b.value.is_pos()) || binds.is_none() {
                    // a missing limit and each lets no block under it draw above zero
                    // 1.9 stage 4 (decided in building): a seller's accept draws on her quantity alone where the grant states no limit
                    if !sells {
                        fixed = fixed.or(Some("past"));
                    }
                }
            }
        } else if t == "transfer" {
            let to = list(rf(b, "to_owner"));
            let principal = principal_of(grant_chain(grant, index).last().copied().unwrap_or(grant), index);
            let back = to.len() == 1 && principal.as_deref() == Some(to[0]);
            if !back {
                // a pass, or a payment: a draw on the instance part it names; a payment draws what it pays, unless a draw on this line
                // already counted its deal (G8)
                let amount = Amount::of(st(b, "amount"));
                let on_part: Vec<&str> = list(rf(b, "what")).into_iter().filter(|w| what.contains(w)).collect();
                if let (Some(w), Some(a)) = (on_part.first(), amount.clone()) {
                    takes_of.push((w.to_string(), a));
                } else if let Some(a) = amount {
                    let counted = deals_made(grant, index).iter().any(|(x, ds)| list(rf(b, "for")).iter().any(|d| ds.contains(d)) && index.past_of(b).contains(hash_of(x)));
                    if !counted {
                        if limit.is_some() || each.is_some() {
                            takes_of.push((gh.to_string(), a));
                        } else if a.value.is_pos() {
                            fixed = fixed.or(Some("past"));
                        }
                    }
                }
            }
        } else if t == "transform" {
            for i in st(b, "inputs").and_then(Value::as_array).into_iter().flatten() {
                let (Some(from), Some(a)) = (i.get("from").and_then(Value::as_str), Amount::of(i.get("amount"))) else { continue };
                if what.contains(&from) {
                    takes_of.push((from.to_string(), a.clone()));
                    // 1.9 stage 4 (decided in building): a make's inputs are its draw on the grant's limit where they are of the limit's kind (no `state.draws` needed)
                    if limit.as_ref().is_some_and(|l| l.kind == a.kind) {
                        takes_of.push((gh.to_string(), a));
                    }
                }
            }
        }
        // each: no block above it
        if let (Some(e), Some((_, a))) = (each.as_ref(), takes_of.iter().find(|(o, _)| o == gh)) {
            if a.kind != e.kind || a.value.cmp(&e.value) == Ordering::Greater {
                fixed = fixed.or(Some("past"));
            }
        }
        // a block that draws nothing needs no place on the line (no meter's receipt)
        if fixed == Some("waiting") && takes_of.is_empty() {
            fixed = None;
            waiting.retain(|w| w["block"].as_str() != Some(hash_of(b)));
        }
        let period = period_of(b, grant, line, index);
        out.push(Drawn { block: hash_of(b).to_string(), takes_of, fixed, period, place });
    }
    (out, waiting)
}

/// The receipts of the meter's line, in line order (by `seq`).
fn meter_receipts<'a>(line: &GrantLine, index: &'a Index) -> Vec<&'a Value> {
    let mut rs_: Vec<&Value> = index.values().filter(|r| type_of(r) == "observe" && ss(r, "kind") == Some("receipt") && crate::line::on_line(r, &line.line, index)).collect();
    rs_.sort_by(|a, b| crate::js::int(st(a, "seq")).unwrap_or(0.0).partial_cmp(&crate::js::int(st(b, "seq")).unwrap_or(0.0)).unwrap_or(Ordering::Equal));
    rs_
}

/// Which period a block is read in (00-shared, A period): the number of the line's cutoffs of the grant's `every` that are before it.
/// A period turns at each cutoff on the meter's line whose `refs.subject` is the grant and whose `when` is a span no shorter than its
/// `every` (a span cutoff closes a span no longer than its own; durations compared, never added to a date); before a block means in its
/// causal past (the holder's own line), or before its receipt (another key's line).
fn period_of(block: &Value, grant: &Value, line: &GrantLine, index: &Index) -> usize {
    let Some(every) = scope(grant, "every").and_then(Value::as_str) else { return 0 };
    let long_enough = |w: &str| crate::time::parse_duration(w).is_some() && cmp_value(&json!(w), &json!(every)).is_some_and(|o| o != Ordering::Less);
    let cuts = index.values().filter(|c| type_of(c) == "observe" && ss(c, "kind") == Some("cutoff") && rs(c, "subject") == Some(hash_of(grant)) && ss(c, "when").is_some_and(long_enough) && crate::line::on_line(c, &line.line, index));
    let past = index.past_of(block);
    if line.own {
        cuts.filter(|c| past.contains(hash_of(c))).count()
    } else {
        let first = meter_receipts(line, index).into_iter().find(|r| list(rf(r, "derives_from")).contains(&hash_of(block)));
        match first {
            Some(r) => {
                let rp = index.past_of(r);
                cuts.filter(|c| rp.contains(hash_of(c))).count()
            }
            None => 0,
        }
    }
}

/// The measures of a grant's line: its `limit`, and each part it draws on.
fn measures_of(grant: &Value, index: &Index) -> Vec<Measure> {
    let gh = hash_of(grant);
    let mut out = Vec::new();
    if let Some(l) = scope(grant, "limit") {
        out.push(Measure { of: gh.to_string(), amount: Amount::of(Some(l)) });
    }
    for a in on_promises(grant, index) {
        out.push(Measure { of: hash_of(a).to_string(), amount: her_quantity(grant, a, index) });
    }
    for w in list(rf(grant, "what")) {
        let amount = scope(grant, "limit").and_then(|l| Amount::of(Some(l))).filter(|l| index.get(w).and_then(|t| Amount::of(st(t, "pack"))).is_some_and(|p| p.kind == l.kind));
        let amount = amount.or_else(|| index.get(w).and_then(|t| Amount::of(st(t, "pack"))));
        out.push(Measure { of: w.to_string(), amount });
    }
    out
}

/// Her quantity is the measure: a grant that names A in `on` draws on A's quantity from her line; a second grant naming A takes only what
/// the first left. Each grant takes all that is left (it states no smaller part): a grant naming A takes nothing where another grant of
/// hers naming A that took is in its causal past and not stopped there, or where the two do not see each other (neither came first).
fn her_quantity(grant: &Value, a: &Value, index: &Index) -> Option<Amount> {
    let q = Amount::of(top(get(a, "state.terms.quantity")))?;
    Some(if quantity_takes(grant, a, index, 0) { q } else { Amount { value: Dec::zero(), kind: q.kind } })
}
fn quantity_takes(grant: &Value, a: &Value, index: &Index, depth: usize) -> bool {
    if rf(grant, "parent").is_some() || depth > 16 {
        return true;
    }
    let past = index.past_of(grant);
    !index.values().any(|g| {
        type_of(g) == "grant"
            && hash_of(g) != hash_of(grant)
            && st(g, "status").is_none()
            && rf(g, "parent").is_none()
            && rs(g, "author") == rs(grant, "author")
            && scope_list(g, "on").contains(&hash_of(a))
            && !stops_of(g, index).iter().any(|s| past.contains(hash_of(s)))
            && if past.contains(hash_of(g)) { quantity_takes(g, a, index, depth + 1) } else { !index.past_of(g).contains(hash_of(grant)) }
    })
}

/// The meter: `{ grant, fits, why, line, start, period, draws, left, waiting, ended }` for one block under the grant (or a grant passed on
/// from it), or for the grant's own draws when `block` is None.
pub(crate) fn meter_of(grant: &Value, index: &Index, block: Option<&Value>) -> Result<Value, &'static str> {
    let gh = hash_of(grant).to_string();
    // the grant's own draw on each promise in `on`: a second grant naming A takes what the first left
    let measures = measures_of(grant, index);
    let own_why: Option<&'static str> = on_promises(grant, index).iter().find_map(|a| her_quantity(grant, a, index).filter(|q| q.value.is_zero()).map(|_| "past"));
    let Some(line) = line_of(grant, index) else {
        let bound = rf(grant, "what").is_some() || scope(grant, "on").is_some() || scope(grant, "limit").is_some();
        if block.is_none() {
            return Ok(json!({ "grant": gh, "fits": own_why.is_none(), "why": own_why, "line": null, "start": null, "period": 0, "draws": [], "left": [], "waiting": [], "ended": null, "comes_back": [] }));
        }
        // a grant that names no meter counts nothing: a block that draws takes nothing on no line
        return if bound { Err("not_on_line") } else { Ok(json!({ "grant": gh, "fits": true, "why": null, "line": null, "start": null, "period": 0, "draws": [], "left": [], "waiting": [], "ended": null, "comes_back": [] })) };
    };
    // a child counted on its parent's meter: read the parent's line, where the parent's meter is not its holder's own
    let (counted_on, read_grant) = match rs(grant, "parent").and_then(|p| index.get(p)) {
        Some(parent) if line_of(parent, index).is_some_and(|pl| !pl.own && pl.meter == line.meter) => (parent, grant),
        _ => (grant, grant),
    };
    let _ = counted_on;
    let (draws, waiting) = draws_of(read_grant, &line, index);
    // a fork on the holder's own line
    if let (true, Some(b)) = (line.own, block) {
        if let Some(group) = pair_at(b, &line, index) {
            let fork = json!({ "pair": true, "held": group, "at_most": worst(grant, index)["at_most"].clone() });
            return Ok(json!({ "grant": gh, "fits": false, "why": fork, "line": "own", "start": line.meter, "period": 0, "draws": [], "left": [], "waiting": waiting, "ended": null, "comes_back": [] }));
        }
    }
    // the end of the grant, receipted on the meter's line: what the line has not drawn comes back
    // 1.9 stage 4 (decided in building): the meter's answer adds `ended` (that end's id); a draw placed after it on another key's line takes nothing
    let ended: Option<String> = if line.own {
        stops_of(grant, index).first().map(|s| hash_of(s).to_string())
    } else {
        let rx = meter_receipts(&line, index);
        stops_of(grant, index).into_iter().find(|s| rx.iter().any(|r| list(rf(r, "derives_from")).contains(&hash_of(s)))).map(|s| hash_of(s).to_string())
    };
    let ended_place: Option<usize> = ended.as_ref().and_then(|e| {
        if line.own {
            None
        } else {
            meter_receipts(&line, index).iter().position(|r| list(rf(r, "derives_from")).contains(&e.as_str()))
        }
    });
    // another key's line: each draw's first receipt there, and whether this reader holds that line whole from the receipt back to the
    // meter's start (one who does not reads the running total from that one receipt: 00-shared, A line's bounds)
    let rx: Vec<&Value> = if line.own { Vec::new() } else { meter_receipts(&line, index) };
    let receipt_of = |blk: &str| rx.iter().copied().find(|r| list(rf(r, "derives_from")).contains(&blk));
    let stated_total = |r: &Value, of: &str| -> Option<Amount> {
        st(r, "drawn").and_then(Value::as_array).and_then(|l| l.iter().find(|i| i.get("of").and_then(Value::as_str) == Some(of))).and_then(|i| Amount::of(i.get("total")))
    };
    // a pair on the meter's own line (another key's): the draws it receipts at or after the pair bind only the meter's name past her
    // measures; a reader who holds the pair answers the fork (A fork on a tool's line)
    let meter_fork: Option<(usize, Value)> = if line.own {
        None
    } else {
        crate::identity::pair_groups_in(index)
            .into_iter()
            .filter(|g| g.iter().all(|x| index.get(x).is_some_and(|b| crate::line::on_line(b, &line.line, index))))
            .filter_map(|g| {
                let place = g.iter().filter_map(|x| rx.iter().position(|r| hash_of(r) == x).or_else(|| index.get(x).map(|b| rx.iter().position(|r| index.past_of(r).contains(hash_of(b))).unwrap_or(usize::MAX)))).min()?;
                let mut held = g.clone();
                held.sort();
                Some((place, json!({ "pair": true, "held": held, "at_most": worst(grant, index)["at_most"].clone() })))
            })
            .min_by_key(|(p, _)| *p)
    };
    // read once along the line: a running sum per measure (and per period), less what a freeing in a draw's own past gave back
    let mut running: BTreeMap<(String, usize), Dec> = BTreeMap::new();
    let mut frees: Vec<(String, usize, Dec, String)> = Vec::new();
    let mut rows: Vec<Value> = Vec::new();
    let mut answer: Option<(bool, Value, usize)> = None;
    let target = block.map(hash_of);
    let cap = |of: &str| -> Option<Amount> {
        let base = of.split('@').next().unwrap_or(of);
        measures.iter().find(|m| m.of == base).and_then(|m| m.amount.clone())
    };
    let period_for = |of: &str, d: &Drawn| if of == gh.as_str() { d.period } else { 0 };
    for d in &draws {
        let mut why: Option<Value> = d.fixed.map(|w| json!(w));
        if why.is_none() && ended_place.is_some_and(|e| d.place > e) {
            why = Some(json!("past"));
        }
        if why.is_none() {
            if let Some((p, fork)) = &meter_fork {
                if d.place != usize::MAX && d.place >= *p {
                    why = Some(fork.clone());
                }
            }
        }
        let past = index.past_of(index.get(&d.block).unwrap_or(&Value::Null));
        let given_back = |of: &str, period: usize| frees.iter().filter(|f| f.0 == of && f.1 == period && past.contains(f.3.as_str())).fold(Dec::zero(), |t, f| t.add(&f.2));
        let r = receipt_of(&d.block);
        let whole = r.is_none_or(|r| crate::line::read_whole(hash_of(r), &line.meter, index).is_ok_and(|w| w.whole));
        if why.is_none() {
            for (of, a) in &d.takes_of {
                let period = period_for(of, d);
                let Some(m) = cap(of) else { why = Some(json!("no_measure")); break };
                if m.kind != a.kind {
                    why = Some(json!("unit"));
                    break;
                }
                let over = match r.filter(|_| !whole).and_then(|r| stated_total(r, of)) {
                    // the one receipt this reader holds states the running total
                    Some(t) => t.kind != m.kind || t.value.cmp(&m.value) == Ordering::Greater,
                    None => {
                        let had = running.get(&(of.clone(), period)).cloned().unwrap_or_else(Dec::zero).sub(&given_back(of, period));
                        had.add(&a.value).cmp(&m.value) == Ordering::Greater
                    }
                };
                if over {
                    why = Some(json!("past"));
                    break;
                }
            }
        }
        if why.is_none() {
            for (of, a) in &d.takes_of {
                let e = running.entry((of.clone(), period_for(of, d))).or_insert_with(Dec::zero);
                *e = e.add(&a.value);
            }
            // the rest of a deal it bound that can no longer fall due comes back (00-shared, Freed)
            if let Some(b) = index.get(&d.block) {
                for (of, amount, by) in rest_freed(b, grant, &d.takes_of, index) {
                    frees.push((of.clone(), period_for(&of, d), amount, by));
                }
            }
        }
        for (of, a) in &d.takes_of {
            rows.push(json!({ "block": d.block, "of": of, "amount": a.json(), "takes": why.is_none(), "why": why }));
        }
        if d.takes_of.is_empty() {
            rows.push(json!({ "block": d.block, "of": null, "amount": null, "takes": why.is_none(), "why": why }));
        }
        if Some(d.block.as_str()) == target {
            answer = Some((why.is_none(), why.clone().unwrap_or(Value::Null), d.period));
        }
    }
    // what is left in the period the block is read in (with no block, the last period read): less what was drawn, plus what was freed in
    // the block's past (every freeing, with no block)
    let now_period = answer.as_ref().map(|a| a.2).unwrap_or_else(|| draws.iter().map(|d| d.period).max().unwrap_or(0));
    let seen = block.map(|b| index.past_of(b));
    let left_of = |m: &Measure| -> Option<Amount> {
        let a = m.amount.as_ref()?;
        let per = if m.of == gh { now_period } else { 0 };
        let mine = |of: &str| of == m.of || of.starts_with(&format!("{}@", m.of));
        let used = running.iter().filter(|((of, p), _)| *p == per && mine(of)).fold(Dec::zero(), |t, (_, v)| t.add(v));
        let back = frees.iter().filter(|f| f.1 == per && mine(&f.0) && seen.as_ref().is_none_or(|p| p.contains(f.3.as_str()))).fold(Dec::zero(), |t, f| t.add(&f.2));
        Some(Amount { value: a.value.sub(&used).add(&back), kind: a.kind.clone() })
    };
    let left: Vec<Value> = measures.iter().filter_map(|m| left_of(m).map(|l| json!({ "of": m.of, "amount": l.json() }))).collect();
    // Coming back: what the line has not drawn, once the grant has ended (on another key's line, once the meter has receipted the end)
    let comes_back: Vec<Value> = if ended.is_some() {
        measures.iter().filter_map(|m| left_of(m).filter(|l| l.value.is_pos()).map(|l| json!({ "of": m.of, "amount": l.json() }))).collect()
    } else {
        Vec::new()
    };
    let (fits, why, period) = match (block, answer) {
        (None, _) => (own_why.is_none(), own_why.map(|w| json!(w)).unwrap_or(Value::Null), 0),
        (Some(_), Some(a)) => a,
        // a block that draws nothing on the line (a word about what is hers to receive): it fits where the grant's own draw does
        (Some(_), None) => (true, Value::Null, 0),
    };
    let why = if fits { Value::Null } else { why };
    Ok(json!({
        "grant": gh, "fits": fits, "why": why, "line": if line.own { json!("own") } else { json!(line.meter) }, "start": line.meter,
        "period": period, "draws": rows, "left": left, "waiting": waiting, "ended": ended, "comes_back": comes_back,
    }))
}

/// The rest of a deal a draw under the grant bound, where it can no longer fall due (00-shared, Freed; 05-deals, The rest of a deal): by
/// the payee's signal that the price is paid; by her stop of the grant, where the offer said ahead that a stop ends what has not come
/// (`terms.stoppable`); by a cutoff through the offer's `deliver_by` on `needed` lines of the clocks the offer names; or by a ruling of a
/// judge both sides named that ends the rest (`state.ends_rest`). Each measure the draw took on gets back what of it the rest held:
/// the quantity not come, or, in money, the total at that quantity. `(of, amount, the freeing block)`.
fn rest_freed(b: &Value, grant: &Value, takes: &[(String, Amount)], index: &Index) -> Vec<(String, Dec, String)> {
    if !is_accept(b, index) {
        return Vec::new();
    }
    let Some(deal) = rs(b, "answers").and_then(|h| index.get(h)) else { return Vec::new() };
    let dh = hash_of(deal);
    let payee = rs(deal, "from").or(rs(deal, "author"));
    let terms = get(deal, "state.terms").cloned().unwrap_or(json!({}));
    let quantity = get(b, "state.terms.quantity").or_else(|| get(deal, "state.terms.quantity")).and_then(|q| Amount::of(Some(q)));
    let counted = |x: &Value| crate::identity::counts_in(x, index);
    let paid = || index.values().find(|x| type_of(x) == "observe" && ss(x, "kind") == Some("paid") && list(rf(x, "subject")).contains(&dh) && counted(x) && super::speaker_of(x, index, None).as_deref() == payee).map(|x| hash_of(x).to_string());
    let stopped = || (get(deal, "state.terms.stoppable") == Some(&json!(true))).then(|| stops_of(grant, index).first().map(|s| hash_of(s).to_string())).flatten();
    let delivered_by = || {
        let t = get(deal, "state.terms.deliver_by").and_then(Value::as_str)?;
        let clocks = get(deal, "state.terms.clocks").and_then(crate::tasks::clocks_of)?;
        let cuts: Vec<String> = clocks.names.iter().filter_map(|n| crate::line::line_named(n, index)).filter_map(|l| crate::line::cutoff_on(t, Some(dh), &l, index, &|_| true).map(|c| hash_of(c).to_string())).collect();
        (cuts.len() >= clocks.needed && !cuts.is_empty()).then(|| cuts[0].clone())
    };
    let ruled = || {
        let sides: Vec<&str> = [payee, rs(deal, "to")].into_iter().flatten().collect();
        let side_of = |x: &Value| super::speaker_of(x, index, None).filter(|w| sides.contains(&w.as_str()));
        let judges: Vec<&str> = index
            .values()
            .filter(|g| type_of(g) == "grant" && ss(g, "kind") == Some("referee") && st(g, "status").is_none() && rs(g, "subject") == Some(dh) && counted(g))
            .filter(|g| {
                let by = side_of(g);
                by.is_some() && index.values().any(|a| type_of(a) == "grant" && ss(a, "status") == Some("accepted") && rs(a, "answers") == Some(hash_of(g)) && counted(a) && side_of(a).is_some_and(|o| Some(&o) != by.as_ref()))
            })
            .filter_map(|g| rs(g, "to"))
            .collect();
        index
            .values()
            .find(|x| type_of(x) == "observe" && ss(x, "kind") == Some("ruling") && rs(x, "subject") == Some(dh) && get(x, "state.ends_rest") == Some(&json!(true)) && counted(x) && rs(x, "author").is_some_and(|a| judges.contains(&a)))
            .map(|x| hash_of(x).to_string())
    };
    let Some(by) = paid().or_else(stopped).or_else(delivered_by).or_else(ruled) else { return Vec::new() };
    // what came: the goods handed over `for` the deal, in the quantity's kind
    let Some(q) = quantity else { return Vec::new() };
    let came = index
        .values()
        .filter(|t| type_of(t) == "transfer" && st(t, "status").is_none() && list(rf(t, "for")).contains(&dh) && counted(t))
        .filter_map(|t| Amount::of(st(t, "amount")).filter(|a| a.kind == q.kind))
        .fold(Dec::zero(), |s, a| s.add(&a.value));
    let rest = q.value.sub(&came);
    if !rest.is_pos() {
        return Vec::new();
    }
    let rest_q = q.kind.amount(&rest);
    let rest_money = Amount::of(Some(&terms_total(&terms, Some(&rest_q))));
    takes
        .iter()
        .filter_map(|(of, a)| {
            let back = if a.kind == q.kind { Some(rest.clone()) } else { rest_money.as_ref().filter(|m| m.kind == a.kind).map(|m| m.value.clone()) }?;
            let back = if back.cmp(&a.value) == Ordering::Greater { a.value.clone() } else { back };
            Some((of.clone(), back, by.clone()))
        })
        .collect()
}

/// The door op `meter`.
pub fn meter(grant: &Value, held: &[Value], block: Option<&Value>) -> Value {
    let index = super::read_all(held.iter().filter(|b| block.is_none_or(|x| hash_of(b) != hash_of(x))).chain(block).chain([grant]));
    let Some(g) = index.get(hash_of(grant)) else { return json!({ "not_shown": true, "lacks": [hash_of(grant)] }) };
    match meter_of(g, &index, block.and_then(|b| index.get(hash_of(b)))) {
        Ok(v) => v,
        Err(why) => json!({ "grant": hash_of(g), "fits": false, "why": why, "line": null, "start": null, "period": 0, "draws": [], "left": [], "waiting": [], "ended": null, "comes_back": [] }),
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// G15, her deadline
// ---------------------------------------------------------------------------------------------------------------------------------------

/// Where a block stands against her deadline on the meter's line (00-shared, Cutoff; Time): `Some(true)` before it (a receipt of it, or
/// the block itself on that line, with no cutoff through the deadline before it), `Some(false)` after it (a cutoff through the deadline,
/// `refs.subject` the grant, with no such receipt before it), `None` where the line has not shown it yet. A date orders nothing here but
/// the block's own: its own `at` at or after the deadline, or none, shows it late against its own signer, and only where lateness
/// counts against it (no fallback).
fn before_deadline(block: &Value, deadline: &str, grant: &Value, line: Option<&GrantLine>, index: &Index) -> Option<bool> {
    let line = line?;
    crate::line::before_time(hash_of(block), deadline, Some(hash_of(grant)), &line.line, index, &|_| true)
}

fn deadline_reading(block: &Value, c: &Value, grant: &Value, index: &Index, line: Option<&GrantLine>) -> Option<Under> {
    let deadline = scope(grant, "deadline").and_then(Value::as_str)?;
    let shown = before_deadline(block, deadline, grant, line, index);
    match scope(grant, "fallback").and_then(Value::as_str) {
        Some("lowest") => match shown {
            // with a fallback, no accept under the grant counts before the deadline: one the meter's line shows before it counts for nothing
            Some(true) => Some(no("not_live", "with a fallback, no accept under the grant counts before the deadline")),
            None => Some(no_with("waiting", "the meter's line has not shown the accept before or after the deadline", json!({ "waiting": [{ "block": hash_of(block), "on": "meter" }] }))),
            Some(false) => {
                let low = lowest(grant, index);
                (low["offer"].as_str() != Some(hash_of(c))).then(|| no("after_deadline", "after the deadline only her tool's accept of the lowest offer counts"))
            }
        },
        _ => {
            // its own date shows it late against its own signer, always
            let d = crate::time::parse(deadline);
            // (a block that states no `at` is in time only where the line shows it before the deadline)
            let own_late = match ss(block, "at").and_then(crate::time::parse) {
                Some(at) => d.is_some_and(|d| at >= d),
                None => shown != Some(true),
            };
            (shown == Some(false) || own_late).then(|| no("after_deadline", "nothing under the grant accepts after its deadline"))
        }
    }
}

/// `lowest_offer`: `{ offer, received, cutoff, why }`.
pub(crate) fn lowest(grant: &Value, index: &Index) -> Value {
    let pending = |why: &str| json!({ "offer": null, "received": null, "cutoff": null, "why": why });
    let Some(deadline) = scope(grant, "deadline").and_then(Value::as_str) else { return pending("pending") };
    let Some(line) = line_of(grant, index) else { return pending("pending") };
    let Some(cut) = crate::line::cutoff_on(deadline, Some(hash_of(grant)), &line.line, index, &|_| true) else { return pending("pending") };
    let cut_past = index.past_of(cut);
    let ons = on_promises(grant, index);
    let parties = scope_list(grant, "parties");
    let limit_kind = scope(grant, "limit").and_then(|l| Amount::of(Some(l))).map(|l| l.kind);
    let rx = meter_receipts(&line, index);
    let mut best: Option<(Dec, usize, String, String)> = None;
    for (i, r) in rx.iter().enumerate().filter(|(_, r)| cut_past.contains(hash_of(r))) {
        for o in list(rf(r, "derives_from")).into_iter().filter_map(|h| index.get(h)) {
            if type_of(o) != "promise" || st(o, "status").is_some() {
                continue;
            }
            let Some(a) = ons.iter().find(|a| keeps_to(o, a, index).0) else { continue };
            // its sides admitted
            let principal = rs(a, "author").unwrap_or("");
            if !sides_of(o).iter().all(|s| *s == principal || parties.contains(s) || sides_of(a).contains(s)) {
                continue;
            }
            // standing there: no cutoff through its own `expires` on that line at or before the deadline's (an offer's own date orders
            // nothing against her deadline), and not stopped before the cutoff
            if let Some(exp) = get(o, "state.terms.expires").and_then(Value::as_str) {
                if crate::line::cutoff_on(exp, Some(hash_of(o)), &line.line, index, &|_| true).is_some_and(|c| hash_of(c) == hash_of(cut) || cut_past.contains(hash_of(c))) {
                    continue;
                }
            }
            if index.values().any(|s| crate::grant::ending(s, hash_of(o)) == Some(crate::grant::End::Stop) && cut_past.contains(hash_of(s))) {
                continue;
            }
            let terms = get(o, "state.terms").cloned().unwrap_or(json!({}));
            let Some(total) = Amount::of(Some(&terms_total(&terms, get(a, "state.terms.quantity")))) else { continue };
            if limit_kind.as_ref().is_some_and(|k| *k != total.kind) {
                continue;
            }
            let better = best.as_ref().is_none_or(|(v, j, _, _)| total.value.cmp(v) == Ordering::Less || (total.value.cmp(v) == Ordering::Equal && i < *j));
            if better {
                best = Some((total.value, i, hash_of(o).to_string(), hash_of(r).to_string()));
            }
        }
    }
    match best {
        Some((_, _, o, r)) => json!({ "offer": o, "received": r, "cutoff": hash_of(cut), "why": null }),
        None => json!({ "offer": null, "received": null, "cutoff": hash_of(cut), "why": "none" }),
    }
}

/// The door op `lowest_offer`.
pub fn lowest_offer(grant: &Value, held: &[Value]) -> Value {
    let index = super::read_all(held.iter().chain([grant]));
    match index.get(hash_of(grant)) {
        Some(g) => lowest(g, &index),
        None => json!({ "not_shown": true, "lacks": [hash_of(grant)] }),
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// G18, the worst case
// ---------------------------------------------------------------------------------------------------------------------------------------

fn add_kind(m: &mut BTreeMap<Kind, Option<Dec>>, a: Option<Amount>, kind: Option<Kind>) {
    match (a, kind) {
        (Some(a), _) => {
            let e = m.entry(a.kind.clone()).or_insert(Some(Dec::zero()));
            if let Some(v) = e {
                *v = v.add(&a.value);
            }
        }
        (None, Some(k)) => {
            m.insert(k, None);
        }
        _ => {}
    }
}

/// The most of a set place's value: its `max`, or the one value; None where it has no top.
pub(crate) fn top(v: Option<&Value>) -> Option<&Value> {
    let v = v?;
    if is_set(v) {
        if let Some(items) = v.get("one_of").and_then(Value::as_array) {
            return items.iter().max_by(|a, b| cmp_value(a, b).unwrap_or(Ordering::Equal));
        }
        return v.get("max");
    }
    Some(v)
}
pub(crate) fn bottom(v: Option<&Value>) -> Option<&Value> {
    let v = v?;
    if is_set(v) {
        if let Some(items) = v.get("one_of").and_then(Value::as_array) {
            return items.iter().min_by(|a, b| cmp_value(a, b).unwrap_or(Ordering::Equal));
        }
        return v.get("min");
    }
    Some(v)
}

/// G18: `worst_case` from her grant and the promises it names alone.
pub(crate) fn worst(grant: &Value, index: &Index) -> Value {
    let principal = rs(grant, "author").unwrap_or("");
    let limit = scope(grant, "limit").and_then(|l| Amount::of(Some(l)));
    // what each promise in `on` can bind her to hand over, at most, per kind: the price total at the top of each range where she pays,
    // the quantity at its top where she sells; None for a kind with no top
    let mut hand: BTreeMap<Kind, Option<Dec>> = BTreeMap::new();
    let mut to_come: BTreeMap<Kind, Option<Dec>> = BTreeMap::new();
    let mut on_out: Vec<Value> = Vec::new();
    // 1.9 stage 7 (compare): a sell from an instance the grant names counts once with that instance's part, at the largest of them
    let whats = list(rf(grant, "what"));
    let mut from_what: BTreeMap<String, Vec<Amount>> = BTreeMap::new();
    for a in on_promises(grant, index) {
        let sells = rs(a, "from") == Some(principal);
        let price = get(a, "state.terms.price");
        let qty = get(a, "state.terms.quantity");
        let total_at = |p: Option<&Value>, q: Option<&Value>| -> Option<Amount> {
            let mut t = json!({});
            t["price"] = p?.clone();
            Amount::of(Some(&terms_total(&t, q)))
        };
        let money_kind = price.and_then(|p| top(Some(p)).or(bottom(Some(p)))).and_then(|p| Amount::of(Some(p)).or_else(|| Amount::of(p.get("amount")))).map(|a| a.kind);
        let inst = if sells { whats.iter().find(|w| list(rf(a, "what")).contains(w)).map(|w| w.to_string()) } else { None };
        let q_top = top(qty).and_then(|q| Amount::of(Some(q)));
        if let (Some(inst), Some(q)) = (inst, q_top.clone().filter(|_| sells)) {
            from_what.entry(inst).or_default().push(q);
            add_kind(&mut to_come, total_at(top(price), top(qty)), money_kind.clone());
        } else if sells {
            add_kind(&mut hand, q_top, None);
            add_kind(&mut to_come, total_at(top(price), top(qty)), money_kind.clone());
        } else {
            add_kind(&mut hand, total_at(top(price), top(qty)), money_kind.clone().or_else(|| limit.as_ref().map(|l| l.kind.clone())));
        }
        on_out.push(json!({ "promise": hash_of(a), "side": if sells { "from" } else { "to" }, "price": price, "quantity": qty }));
    }
    // the part the grant's line holds: the instance it names, at its limit or all of it
    let mut part: Vec<Value> = Vec::new();
    let mut lose: BTreeMap<Kind, Option<Dec>> = BTreeMap::new();
    for m in measures_of(grant, index).into_iter().filter(|m| list(rf(grant, "what")).contains(&m.of.as_str())) {
        if let Some(a) = &m.amount {
            part.push(a.json());
        }
        add_kind(&mut lose, m.amount.clone(), None);
        let mut once: BTreeMap<Kind, Amount> = BTreeMap::new();
        for x in m.amount.into_iter().chain(from_what.remove(&m.of).unwrap_or_default()) {
            let bigger = once.get(&x.kind).is_none_or(|e| x.value.cmp(&e.value) == Ordering::Greater);
            if bigger {
                once.insert(x.kind.clone(), x);
            }
        }
        for x in once.into_values() {
            add_kind(&mut hand, Some(x), None);
        }
    }
    // where her grant names a word about what is hers to receive, what is still to come to her on each deal in `on`
    let types = scope_list(grant, "types");
    if types.contains(&"observe.paid") || types.contains(&"observe.received") {
        for (k, v) in to_come {
            match (lose.get_mut(&k), v) {
                (Some(Some(x)), Some(v)) => *x = x.add(&v),
                (Some(x), None) => *x = None,
                (None, v) => {
                    lose.insert(k, v);
                }
                _ => {}
            }
        }
    }
    // the limit bounds its own kind
    if let Some(l) = &limit {
        let e = hand.entry(l.kind.clone()).or_insert(None);
        *e = Some(match e.as_ref() {
            Some(v) if v.cmp(&l.value) == Ordering::Less => v.clone(),
            _ => l.value.clone(),
        });
    } else if scope(grant, "each").is_none() {
        // a missing limit and each lets no block under it draw above zero (the price where she pays)
        for (k, v) in hand.iter_mut() {
            if !lose.contains_key(k) {
                let _ = k;
                *v = Some(Dec::zero());
            }
        }
    }
    let per_kind = |m: &BTreeMap<Kind, Option<Dec>>| -> Vec<Value> { m.iter().filter_map(|(k, v)| v.as_ref().filter(|v| v.is_pos()).map(|v| k.amount(v))).collect() };
    let line = line_of(grant, index);
    let clocks = scope(grant, "clocks").cloned();
    let stop = scope(grant, "clocks").and_then(crate::tasks::clocks_of).map(|c| json!({ "names": c.names, "lines": c.names.len() + 1 - c.needed }));
    let mut sides: Vec<String> = scope_list(grant, "parties").into_iter().map(String::from).collect();
    for a in on_promises(grant, index) {
        sides.extend(sides_of(a).into_iter().filter(|s| *s != principal).map(String::from));
    }
    let sides = crate::js::sorted_set(sides);
    json!({
        "holder": rf(grant, "to").cloned().unwrap_or(Value::Null),
        "types": scope(grant, "types").cloned().unwrap_or(json!([])),
        // 1.9 stage 4 (decided in building): `on` lists { promise, side, price, quantity } per promise, so her floor (line 13) is read from it
        "on": on_out,
        "what": rf(grant, "what").cloned().unwrap_or(Value::Null),
        "part": part,
        "sides": sides,
        "each": scope(grant, "each").cloned().unwrap_or(Value::Null),
        "limit": scope(grant, "limit").cloned().unwrap_or(Value::Null),
        "every": scope(grant, "every").cloned().unwrap_or(Value::Null),
        "until": scope(grant, "until").cloned().unwrap_or(Value::Null),
        // 1.9 stage 4 (decided in building): no span is added to a date, so the number of periods is not counted: `periods` is the period itself (with
        // `every`, at_most is per period), null without one
        "periods": scope(grant, "every").cloned().unwrap_or(Value::Null),
        "at_most": per_kind(&hand),
        "can_lose": per_kind(&lose),
        "clocks": clocks.unwrap_or(Value::Null),
        "deadline": scope(grant, "deadline").cloned().unwrap_or(Value::Null),
        "fallback": scope(grant, "fallback").cloned().unwrap_or(Value::Null),
        "stop": stop.unwrap_or(Value::Null),
        "meter": match line { Some(l) if l.own => json!("own"), Some(l) => json!(l.meter), None => Value::Null },
        "pays": types.contains(&"transfer"),
    })
}

/// The door op `worst_case`.
pub fn worst_case(grant: &Value, held: &[Value]) -> Value {
    let index = super::read_all(held.iter().chain([grant]));
    match index.get(hash_of(grant)) {
        Some(g) => worst(g, &index),
        None => json!({ "not_shown": true, "lacks": [hash_of(grant)] }),
    }
}
