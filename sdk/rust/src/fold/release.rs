//! A release and sealed bids (promises.md, A release; profiles/bids.md): two readings that show facts and move nothing.
//! `release_shown`: whose claims on a deal or a thing a signer has let go of, and which debts a general release names as still open.
//! `bids_shown`: two sides' sealed numbers for one quarrel, opened in time, and whether they overlap.
use super::speaker_of;
use crate::decimal::Dec;
use crate::js::{cmp16, hash_of, list, rf, rs, ss, st, type_of};
use crate::order::sees_in;
use crate::prelude::*;

fn held_with(block: &Value, blocks: &[Value]) -> crate::js::Index {
    super::read_all(core::iter::once(block).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()))
}

/// A release is an `observe` of kind `release`, signed by the one who lets go. It binds only its signer and lets go only of her own claims.
/// With `refs.subject` it lets go of her claims on that deal or thing. Without, it lets go of her claims on every deal with `refs.to`
/// (the other side) whose first promise it has in its causal past, except the deals `state.except` lists, which stay open. Only a side of
/// a deal lets go of its claims. Returns `{ subject, released: [{ block, by, side, to }], kept_open: [{ block, by, side }] }`, each sorted by
/// block: `side` is `from` or `to` for a deal (`from` is owed the price, `to` what moves), null for a thing.
pub fn release_shown(subject: &Value, blocks: &[Value]) -> Value {
    let index = held_with(subject, blocks);
    let sh = hash_of(subject).to_string();
    let deal = type_of(subject) == "promise" && list(rf(subject, "answers")).is_empty();
    let side_of = |id: &str| -> Option<&'static str> {
        if !deal {
            None
        } else if rs(subject, "from") == Some(id) {
            Some("from")
        } else if rs(subject, "to") == Some(id) {
            Some("to")
        } else {
            None
        }
    };
    let (mut released, mut kept): (Vec<(String, Value)>, Vec<(String, Value)>) = (vec![], vec![]);
    for o in index.values().filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("release") && st(o, "status").is_none() && crate::identity::counts_in(o, &index)) {
        let Some(by) = speaker_of(o, &index, None) else { continue };
        let side = side_of(&by);
        if deal && side.is_none() {
            continue;
        }
        let entry = json!({ "block": hash_of(o), "by": by, "side": side, "to": rs(o, "to") });
        match rs(o, "subject") {
            Some(s) if s == sh => released.push((hash_of(o).to_string(), entry)),
            Some(_) => {}
            None => {
                let other = if side == Some("from") { rs(subject, "to") } else { rs(subject, "from") };
                if !deal || other.is_none() || rs(o, "to") != other || !sees_in(o, &sh, &index) {
                    continue;
                }
                if list(st(o, "except")).contains(&sh.as_str()) {
                    kept.push((hash_of(o).to_string(), json!({ "block": hash_of(o), "by": by, "side": side })));
                } else {
                    released.push((hash_of(o).to_string(), entry));
                }
            }
        }
    }
    let sorted = |mut v: Vec<(String, Value)>| -> Vec<Value> {
        v.sort_by(|a, b| cmp16(&a.0, &b.0));
        v.into_iter().map(|x| x.1).collect()
    };
    json!({ "subject": sh, "released": sorted(released), "kept_open": sorted(kept) })
}

/// Sealed bids for one quarrel (profiles/bids.md). The quarrel is a deal's first promise; its `from` side is owed the price and its `to` side
/// pays it. Each side signs one `observe` of kind `bid` with `refs.subject` the quarrel and `state.commitment` to a number (whole minor
/// units, text) and states the `deadline`, the named clock `keepers` and the `currency` the form runs on; the two must state the same, else
/// no bid counts. A side that signs two bids counts for none. A bid counts when `needed` keepers received it by the deadline. An opening is
/// any counted block of the same side carrying `state.opening` that opens the commitment (privacy.md), received by the deadline too, and no earlier than the later bid was. When
/// both are open, the numbers overlap when the `to` side's (the most it would pay) is at least the `from` side's (the least it would take),
/// and the middle is their mean, rounded half up. With no overlap nothing more is shown. Returns
/// `{ quarrel, currency, in, opened, overlap, middle }`: `in` and `opened` the sides whose bid and opening count (sorted), `overlap` null
/// until both are open, then true or false, `middle` money or null. Nothing here moves: the sides may settle at the middle by a transfer.
pub fn bids_shown(quarrel: &Value, blocks: &[Value]) -> Value {
    let index = held_with(quarrel, blocks);
    let qh = hash_of(quarrel).to_string();
    let empty = |currency: Value| json!({ "quarrel": qh, "currency": currency, "in": [], "opened": [], "overlap": null, "middle": null });
    if type_of(quarrel) != "promise" || !list(rf(quarrel, "answers")).is_empty() {
        return Value::Null;
    }
    let sides = [("from", rs(quarrel, "from")), ("to", rs(quarrel, "to"))];
    let Some(bids) = sides
        .iter()
        .map(|(side, id)| {
            let id = (*id)?;
            let mine: Vec<&Value> = index
                .values()
                .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("bid") && rs(o, "subject") == Some(qh.as_str()) && crate::identity::counts_in(o, &index) && speaker_of(o, &index, None).as_deref() == Some(id))
                .collect();
            match mine.as_slice() {
                [one] => Some((*side, id, *one)),
                _ => None,
            }
        })
        .collect::<Option<Vec<_>>>()
    else {
        return empty(Value::Null);
    };
    // the two bids state one form: the same deadline, clock and currency
    let form = |b: &Value| (st(b, "deadline").cloned(), st(b, "keepers").cloned(), st(b, "currency").cloned());
    let (f0, f1) = (form(bids[0].2), form(bids[1].2));
    let currency = f0.2.clone().unwrap_or(Value::Null);
    let agreed = f0 == f1 && f0.0.is_some() && f0.1.is_some() && f0.2.is_some();
    let keepers = f0.1.as_ref().and_then(crate::tasks::keepers_of);
    let deadline = f0.0.as_ref().and_then(Value::as_str);
    let (true, Some(keepers), Some(deadline)) = (agreed, keepers, deadline) else { return empty(currency) };
    let timely = |b: &Value| super::clock::received_by(hash_of(b), &keepers, &index, deadline);
    // an opening comes after both bids are in: `needed` keepers received it no earlier than they received the later bid
    let later_bid: Option<String> = bids.iter().map(|(_, _, bid)| super::clock::received_at(hash_of(bid), &keepers, &index)).collect::<Option<Vec<_>>>().and_then(|v| v.into_iter().max());
    let after_both = |b: &Value| later_bid.as_ref().is_some_and(|l| super::clock::received_at(hash_of(b), &keepers, &index).is_some_and(|at| at >= *l));
    let mut shown_in: Vec<&str> = Vec::new();
    let mut opened: Vec<(&str, Dec)> = Vec::new();
    for (side, id, bid) in &bids {
        if !timely(bid) {
            continue;
        }
        shown_in.push(side);
        let Some(commitment) = st(bid, "commitment").and_then(Value::as_str) else { continue };
        let suite = crate::block::suite_of_id(commitment);
        let value = index
            .values()
            .filter(|b| crate::identity::counts_in(b, &index) && speaker_of(b, &index, None).as_deref() == Some(*id) && timely(b) && after_both(b))
            .filter_map(|b| st(b, "opening"))
            .find_map(|o| match (o.get("salt").and_then(Value::as_str), o.get("value").and_then(Value::as_str)) {
                (Some(salt), Some(text)) if crate::audience::opens(&suite, salt, text, commitment) => Some(text.to_string()),
                _ => None,
            })
            .and_then(|t| Dec::parse(&t))
            .filter(|d| d.cmp(&Dec::zero()) != core::cmp::Ordering::Less && !d.text().contains('.'));
        if let Some(v) = value {
            opened.push((side, v));
        }
    }
    shown_in.sort();
    let open_sides: Vec<&str> = opened.iter().map(|(s, _)| *s).collect();
    let (overlap, middle) = match (opened.iter().find(|(s, _)| *s == "to"), opened.iter().find(|(s, _)| *s == "from")) {
        (Some((_, most)), Some((_, least))) => {
            if most.cmp(least) == core::cmp::Ordering::Less {
                (json!(false), Value::Null)
            } else {
                let mid = crate::decimal::per_unit(&most.add(least), &Dec::parse("1").unwrap_or_else(Dec::zero), &Dec::parse("2").unwrap_or_else(Dec::zero));
                (json!(true), mid.map_or(Value::Null, |m| json!({ "minor": m.minor_json(), "currency": currency })))
            }
        }
        _ => (Value::Null, Value::Null),
    };
    let mut o = open_sides.clone();
    o.sort();
    json!({ "quarrel": qh, "currency": currency, "in": shown_in, "opened": o, "overlap": overlap, "middle": middle })
}
