//! The views (modules/folds.md): a fold plus one more thing, the reader's clock or when blocks arrived on the reader's
//! node. A view is right for the reader that computes it and says whose clock it used; it may show but never decide what
//! another reader must accept. Each takes the clock or the arrivals as an argument: none reads the system clock.
use crate::identity::{signed_by_author_in, ArrivedAt};
#[allow(unused_imports)]
use crate::js::{get, hash_of, index_of, rs, ss, st, type_of, Index};
#[allow(unused_imports)]
use crate::order::sees_in;
use crate::prelude::*;

/// `live_grant`: the clock is that of the node that relies on the act, read when it takes the block in. True when every
/// grant's `scope.until` is later than the clock (a grant with no `until`, like a key grant, has no end of its own).
pub fn live_grant(grants: &[Value], now: &str) -> bool {
    // an until is a time (text): one that is not names no end the clock could be before
    grants.iter().all(|g| match get(g, "state.scope.until") {
        Some(until) => until.as_str().is_some_and(|u| u > now),
        None => true,
    })
}

/// `withdrawal_seen`: true when the withdrawal is in the causal past of the counterparty's block, or has arrived on the
/// counterparty's node (`arrived`: a lookup of arrivals there).
#[cfg(feature = "folds")]
pub fn withdrawal_seen(withdrawal: &Value, block: &Value, blocks: &[Value], arrived: ArrivedAt) -> bool {
    // the two blocks are read with the input: one no node would take is no word, seen by no one (folds.md)
    let index = crate::js::held_index(blocks.iter().filter(|b| hash_of(b) != hash_of(withdrawal) && hash_of(b) != hash_of(block)).chain([withdrawal, block]));
    if !index.contains_key(hash_of(withdrawal)) || !index.contains_key(hash_of(block)) {
        return false;
    }
    sees_in(block, hash_of(withdrawal), &index) || arrived.is_some_and(|f| f.at(hash_of(withdrawal)).is_some())
}

/// `due`: a promise with a relative `when` `{ after, wait }` falls due `wait` after the `after` block arrived on the
/// performer's node, counted on the performer's clock. The instant, or None while the anchor has not arrived.
pub fn due(promise: &Value, arrived: ArrivedAt) -> Option<String> {
    let when = get(promise, "state.when")?;
    let (after, wait) = (when.get("after")?.as_str()?, when.get("wait")?.as_str()?);
    let at = arrived.and_then(|f| f.at(after))?;
    crate::time::add_duration(&at, wait, 1)
}

/// `recovery_reach`: the blocks a recovery rotation voids in the pure fold but the reach protects on this reader's node
/// (they, or a block of another identity that built on them, arrived before the reach began). Sorted.
pub fn recovery_reach(rotation: &Value, blocks: &[Value], arrived: ArrivedAt) -> Vec<String> {
    let index: Index = crate::js::held_index(blocks.iter().chain([rotation]));
    let Some(id) = rs(rotation, "author") else { return vec![] };
    // asked about anything but a rotation the recovery key signed, nothing: the reach limits recovery rotations alone (identity.md)
    let recovery = crate::js::type_of(rotation) == "grant"
        && crate::js::ss(rotation, "kind") == Some("key")
        && crate::js::ss(rotation, "replaces").is_some()
        && index.contains_key(hash_of(rotation))
        && crate::identity::recovery_signer_of(rotation, id, &index).is_some();
    if !recovery {
        return vec![];
    }
    let mut out: Vec<String> = index
        .values()
        .filter(|b| rs(b, "author") == Some(id) && hash_of(b) != hash_of(rotation))
        .filter(|b| !signed_by_author_in(b, &index, None) && signed_by_author_in(b, &index, arrived))
        .map(|b| hash_of(b).to_string())
        .collect();
    out.sort();
    out
}

/// A promise's stage, with offered or asked read as expired, and an accepted or underway refrain read as elapsed, by the reader's
/// clock (folds.md).
#[cfg(feature = "folds")]
pub fn promise_view(first: &Value, blocks: &[Value], now: Option<&str>) -> Value {
    promise_view_at(first, blocks, now, None)
}

/// The same, with the reader's arrivals too: a block the recovery reach protects counts for that reader (decision c9).
#[cfg(feature = "folds")]
pub fn promise_view_at(first: &Value, blocks: &[Value], now: Option<&str>, arrived_at: crate::identity::ArrivedAt) -> Value {
    let index = crate::fold::read_all_at(core::iter::once(first).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()), arrived_at);
    promise_view_in(hash_of(first), &index, now)
}

/// The views of many deals of one store, read against one reading of it: `{ hash: view }` (the MCP door's find reads every offer it
/// shows; reading the store once for each made it quadratic: security I, agents/t4). Each first promise is one of the blocks.
#[cfg(feature = "folds")]
pub fn promise_views(firsts: &[String], blocks: &[Value], now: Option<&str>) -> Value {
    let index = crate::fold::read_all(blocks.iter());
    let mut out = serde_json::Map::new();
    for h in firsts {
        out.insert(h.clone(), promise_view_in(h, &index, now));
    }
    Value::Object(out)
}

/// `promise_view` of the promise held under `first_hash`, in blocks already read for a fold.
#[cfg(feature = "folds")]
pub(crate) fn promise_view_in(first_hash: &str, index: &Index, now: Option<&str>) -> Value {
    let mut view = promise_view_read(first_hash, index, now).0;
    // The condition of the offer in force, as a fact beside the stage (promises.md, Conditions): `holds`, `not`, or `unread` (a shape the
    // protocol does not read); null when the promise states none. A condition that did not hold reads as nothing owed, never as broken.
    let offer = view.get("offer").and_then(Value::as_str).and_then(|h| index.get(h)).or_else(|| index.get(first_hash));
    if let (Some(cond), true) = (offer.and_then(|o| get(o, "state.terms.condition")), view.is_object()) {
        let blocks: Vec<Value> = index.values().cloned().collect();
        let word = match crate::tasks::condition_holds(cond, &blocks, now.unwrap_or("")) {
            Some(true) => "holds",
            Some(false) => "not",
            None => "unread",
        };
        view["condition"] = json!(word);
        // Failure spreads visibly (promises.md, The condition fact): a condition that does not hold because the deal it names ended without it
        // (stopped, declined, expired, breached) or itself rests on such a deal names that deal, never just "open".
        view["condition_failed"] = if word == "not" { condition_failed(cond, index, now, &mut vec![first_hash.to_string()]).map_or(Value::Null, Value::String) } else { Value::Null };
    } else if view.is_object() {
        view["condition"] = Value::Null;
        view["condition_failed"] = Value::Null;
    }
    // Which date was missed (promises.md, Terms: pay_by): the dates in force in the order agreed (the first promise's own `pay_by`, then each
    // date both sides signed) that passed before the price was paid in full, or, while it is unpaid, before the reader's clock. Facts of the
    // signed dates, never a verdict; null when the promise states no `pay_by` or is a standing one.
    if view.is_object() {
        let first_pay_by = offer.and_then(|o| get(o, "state.terms.pay_by")).and_then(Value::as_str).map(String::from).filter(|_| offer.is_some_and(|o| get(o, "state.terms.repeat").is_none()));
        view["missed"] = match first_pay_by {
            None => Value::Null,
            Some(first) => {
                let mut dates = vec![first];
                dates.extend(view.get("moved").and_then(Value::as_array).into_iter().flatten().filter_map(|m| m.get("pay_by").and_then(Value::as_str).map(String::from)));
                let horizon = view.get("paid_at").and_then(Value::as_str).map(String::from).or_else(|| now.filter(|n| !n.is_empty()).map(String::from));
                json!(dates.into_iter().filter(|d| horizon.as_deref().is_some_and(|h| d.as_str() < h)).collect::<Vec<_>>())
            }
        };
    }
    view
}

/// The deal a condition rests on that can no longer give it: the first promise it names (`settled`, `paid` or `accepted`) when that deal ended
/// without the condition's matter (stopped, declined, expired, or breached; a stop before binds nothing, so an `accepted` fails on it), or when
/// that deal's own condition failed. None for any other shape, or a cycle.
#[cfg(feature = "folds")]
fn condition_failed(cond: &Value, index: &Index, now: Option<&str>, seen: &mut Vec<String>) -> Option<String> {
    let (key, target) = ["settled", "paid", "accepted"].iter().find_map(|k| cond.get(*k).and_then(Value::as_str).map(|t| (*k, t.to_string())))?;
    if seen.contains(&target) || !index.contains_key(&target) {
        return None;
    }
    seen.push(target.clone());
    let v = promise_view_read(&target, index, now).0;
    let stage = ss_of(&v, "stage");
    let stop = ss_of(&v, "stop");
    let ended = match stage.as_str() {
        "declined" | "expired" => true,
        "stopped" => stop == "before" || key != "accepted",
        "breached" => key != "accepted",
        _ => false,
    };
    let mut own = || {
        let offer = v.get("offer").and_then(Value::as_str).and_then(|h| index.get(h)).or_else(|| index.get(&target))?;
        let c = get(offer, "state.terms.condition")?;
        let blocks: Vec<Value> = index.values().cloned().collect();
        (crate::tasks::condition_holds(c, &blocks, now.unwrap_or("")) == Some(false)).then_some(())?;
        condition_failed(c, index, now, seen)
    };
    (ended || own().is_some()).then_some(target)
}

/// The same, with whether the price is paid in full beside it (compared exactly, as the stage compared it; false where the stage says
/// nothing of it): the `settled` condition reads both.
#[cfg(feature = "folds")]
pub(crate) fn promise_view_read(first_hash: &str, index: &Index, now: Option<&str>) -> (Value, bool) {
    let mut stage = crate::fold::promise_stage_in(first_hash, index, &crate::fold::StageOptions::default());
    let exact_paid_up = stage.as_object_mut().and_then(|m| m.shift_remove("paid_up")).and_then(|v| v.as_bool());
    let Some(first) = index.get(first_hash) else { return (stage, false) };
    // Offered or asked becomes expired once the reader's own clock passes `expires` and nothing binds.
    let st_name = ss_of(&stage, "stage");
    if matches!(st_name.as_str(), "offered" | "asked") {
        // Expired when every live offer has an `expires` the reader's clock has passed (one still open could bind).
        let live: Vec<String> = stage.get("live").and_then(Value::as_array).map(|l| l.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
        let all_past = !live.is_empty()
            && live.iter().all(|h| {
                let expires = index.get(h).and_then(|o| get(o, "state.terms.expires")).and_then(Value::as_str);
                matches!((now, expires), (Some(n), Some(e)) if !n.is_empty() && n > e)
            });
        if all_past {
            stage["stage"] = json!("expired");
        }
    }
    // A refrain that is accepted or underway is elapsed once the reader's clock passes its until (folds.md, Views; decision H15): a
    // fact, its term ran with no referee's defeat counted, never a verdict that it was kept (never done). What was paid is beside it
    // (`paid`). One that a stop ended stays stopped: when the stop came, against the until, is a fact for each reader to judge.
    if matches!(st_name.as_str(), "accepted" | "underway") {
        let offer = stage.get("offer").and_then(Value::as_str).and_then(|h| index.get(h)).unwrap_or(first);
        let refrain = get(offer, "state.terms.refrain") == Some(&Value::Bool(true));
        let until = get(offer, "state.terms.until").and_then(Value::as_str);
        if refrain && matches!((now, until), (Some(n), Some(u)) if !n.is_empty() && n > u) {
            stage["stage"] = json!("elapsed");
        }
    }
    // a stage that says nothing of it (an open offer, settled by no one: promises.md) is not read as paid
    (stage, exact_paid_up == Some(true))
}

#[cfg(feature = "folds")]
fn ss_of(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or("").to_string()
}
