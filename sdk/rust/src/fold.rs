//! The folds (modules/folds.md): a set of blocks read into one answer, the same on every node from the same blocks.
//! A fold reads no clock and no arrival; the views that do are in views.rs. No step breaks a tie on authority by
//! hash.
use crate::grant::is_live_in;
#[allow(unused_imports)]
use crate::identity::ArrivedAt;
use crate::js::{
    cmp16, get, hash_of, index_of, int, list, num, number_of, rf, rs, sorted_set, ss, st,
    strict_eq, text, truthy, type_of, unique, Index,
};
use crate::order::{causal_order_among, heads_among, past_in, sees_in};
use crate::prelude::*;
use core::cell::RefCell;

/// The blocks held, by hash, with the forks marked once (a pair of one key naming one prev counts for nothing).
fn read_all<'a>(blocks: impl IntoIterator<Item = &'a Value>) -> Index {
    let mut index = Index::default();
    for b in blocks {
        index.insert(hash_of(b).to_string(), b.clone());
    }
    let mut index = crate::js::closed(index);
    crate::identity::mark_forks(&mut index);
    index
}
fn earliest<'a>(set: &[&'a Value], index: &Index) -> Vec<&'a Value> {
    set.iter()
        .filter(|one| {
            !set.iter()
                .any(|other| !core::ptr::eq(*other, **one) && sees_in(one, hash_of(other), index))
        })
        .copied()
        .collect()
}
fn sub_index(blocks: &[&Value]) -> Index {
    index_of(blocks.iter().copied())
}

// ---- A promise's stage ----
// Who a block speaks for (folds.md, Who a block speaks for): one party. A block that names a circle in `as` speaks for that
// circle when its author may sign for it (the `sign` power in the circle's fold of the block's causal past), else for
// no one (`no_role`). Otherwise a block under a live grant, made for its receiver, speaks for the grant's grantor; any other
// block speaks for its author.
pub(crate) fn speaker_of(block: &Value, index: &Index, now: Option<&str>) -> Option<String> {
    if let Some(circle) = rs(block, "as").filter(|c| !c.is_empty()) {
        return may_act_as_in(block, circle, index, None).then(|| circle.to_string());
    }
    if let Some(grant) = rs(block, "under").and_then(|h| index.get(h)) {
        if type_of(grant) == "grant"
            && (!truthy(rf(grant, "to")) || strict_eq(rf(grant, "to"), rf(block, "author")))
            && is_live_in(grant, index, now)
        {
            return grantor_of(grant, index);
        }
    }
    rs(block, "author").map(String::from)
}
// The grantor of a grant: the circle it was signed `as` (when its signer may sign for it), else its author.
pub(crate) fn grantor_of(grant: &Value, index: &Index) -> Option<String> {
    match rs(grant, "as").filter(|c| !c.is_empty()) {
        Some(circle) => may_act_as_in(grant, circle, index, None).then(|| circle.to_string()),
        None => rs(grant, "author").map(String::from),
    }
}
fn speaks_as(block: &Value, side: Option<&str>, index: &Index, now: Option<&str>) -> bool {
    side.filter(|s| !s.is_empty()).is_some_and(|s| speaker_of(block, index, now).as_deref() == Some(s))
}

fn amount_in(amount: Option<&Value>, unit: Option<&Value>) -> Option<f64> {
    let a = amount.filter(|a| truthy(Some(a)))?;
    if strict_eq(a.get("unit"), unit) {
        Some(number_of(a.get("value")))
    } else {
        None
    }
}

// A decimal string as an exact fraction of whole numbers: "1.25" is 125 / 100.
fn fraction(value: Option<&Value>) -> Option<(i128, i128)> {
    let t = text(value);
    let (whole, part) = t.split_once('.').unwrap_or((t.as_str(), ""));
    let n: i128 = format!("{whole}{part}").parse().ok()?;
    let d = 10i128.checked_pow(part.len() as u32)?;
    Some((n, d))
}
// n / d rounded to the nearest whole number, halves up (toward +infinity), exactly: floor((2n + d) / 2d).
fn round_half_up(n: i128, d: i128) -> Option<i128> {
    let (n, d) = if d < 0 { (-n, -d) } else { (n, d) };
    if d == 0 {
        return None;
    }
    Some((2 * n + d).div_euclid(2 * d))
}

// The total a price comes to for a quantity: money; money per unit, `money.minor` times the quantity over `per`,
// rounded to the nearest minor unit, halves up (§6); or None when it is a share of something measured.
fn total_of(price: Option<&Value>, quantity: Option<&Value>) -> Option<(f64, Value)> {
    let price = price.filter(|p| truthy(Some(p)))?;
    if let Some(minor) = int(price.get("minor")) {
        return Some((minor, price.get("currency").cloned().unwrap_or(Value::Null)));
    }
    if truthy(price.get("per")) && truthy(price.get("money")) {
        let quantity = quantity.filter(|q| truthy(Some(q)))?;
        if !strict_eq(quantity.get("unit"), get(price, "per.unit")) {
            return None;
        }
        let (qn, qd) = fraction(quantity.get("value"))?;
        let (pn, pd) = fraction(get(price, "per.value"))?;
        let m = int(get(price, "money.minor"))? as i128;
        let minor = round_half_up(m * qn * pd, qd * pn)? as f64;
        return Some((
            minor,
            get(price, "money.currency").cloned().unwrap_or(Value::Null),
        ));
    }
    None
}

/// Options for a promise's stage: `confirmers` (ids whose confirms count a transfer, beside those the deal's schema
/// names in its grounds). The fold reads no clock.
#[derive(Default, Clone)]
pub struct StageOptions<'a> {
    pub confirmers: Vec<String>,
    pub _p: core::marker::PhantomData<&'a ()>,
}

/// A promise's stage, from its first promise and every block in its deal: offered, asked, declined, stopped,
/// accepted, underway, done or reversed. Returns `{ stage, offer, accept, sides, quantity, total, paid, lines,
/// takers, stopped, forks }` (and `stop`, `from` when stopped).
pub fn promise_stage(first_block: &Value, blocks: &[Value], options: &StageOptions) -> Value {
    let now: Option<&str> = None;
    let index = read_all(
        core::iter::once(first_block).chain(index_of(blocks).values().collect::<Vec<_>>()),
    );
    let first_hash = hash_of(first_block).to_string();
    // A promise that rests on blocks the input lacks is not read yet: there is no stage.
    let Some(first) = index.get(&first_hash).cloned() else { return Value::Null };
    // The deal: every block naming the first promise in `for`, or answering or updating a block in it (history only
    // where it counts).
    let mut deal: Vec<String> = vec![first_hash.clone()];
    let mut grew = true;
    while grew {
        grew = false;
        for b in index.values() {
            let h = hash_of(b);
            if deal.iter().any(|d| d == h) || !crate::identity::counts_in(b, &index) {
                continue;
            }
            // A promise with no `answers` is not in the deal even if it names P in `for`: it is a new deal that P serves.
            let joins = (list(rf(b, "for")).contains(&first_hash.as_str())
                && (type_of(b) != "promise" || !list(rf(b, "answers")).is_empty()))
                || list(rf(b, "answers"))
                    .iter()
                    .any(|a| deal.iter().any(|d| d == a))
                || list(rf(b, "updates"))
                    .iter()
                    .any(|a| deal.iter().any(|d| d == a));
            if joins {
                deal.push(h.to_string());
                grew = true;
            }
        }
    }
    // A side that names a thing is whoever owns the thing now (promises.md, Bearer): the ownership fold of the input.
    let side_of_ref = |r: Option<&str>| -> Option<String> {
        let r = r.filter(|r| !r.is_empty())?;
        match index.get(r) {
            Some(t) if type_of(t) == "thing" => ownership_in(r, &index).owner,
            _ => Some(r.to_string()),
        }
    };
    let (from_ref, to_ref) = (rs(&first, "from"), rs(&first, "to"));
    let (from_id, to_id) = (side_of_ref(from_ref), side_of_ref(to_ref));
    let (from, to) = (from_id.as_deref(), to_id.as_deref());
    let offerer_is_from = speaks_as(&first, from, &index, now);
    // A first promise that speaks for neither side is nobody's promise: it has no stage (folds.md, Who a block speaks for).
    if !offerer_is_from && !speaks_as(&first, to, &index, now) {
        return Value::Null;
    }
    let offerer = if offerer_is_from { from } else { to };
    let other = if offerer_is_from { to_ref } else { from_ref };
    let open = other.is_none_or(str::is_empty);
    let side_of = |b: &Value| -> Option<&'static str> {
        if speaks_as(b, from, &index, now) {
            Some("from")
        } else if speaks_as(b, to, &index, now) {
            Some("to")
        } else {
            None
        }
    };
    let by_offerer = |b: &Value| speaks_as(b, offerer, &index, now);
    // 1. Only blocks a side signed (an open side is anyone, until an accept binds).
    let deal_blocks: Vec<&Value> = deal.iter().map(|h| &index[h.as_str()]).collect();
    let in_deal: Vec<Value> = causal_order_among(&sub_index(&deal_blocks), &index)
        .into_iter()
        .filter(|b| hash_of(b) != first_hash && (side_of(b).is_some() || (open && !by_offerer(b))))
        .collect();
    let status = |b: &Value, word: &str| ss(b, "status") == Some(word);
    let answers_of = |h: &str, word: Option<&str>| -> Vec<&Value> {
        in_deal
            .iter()
            .filter(|b| {
                list(rf(b, "answers")).contains(&h)
                    && word.map_or(st(b, "status").is_none(), |w| status(b, w))
            })
            .collect()
    };

    // 2. The live offers: the first promise, or the latest counters between the same two sides.
    let mut live: Vec<&Value> = vec![&first];
    if !open {
        loop {
            let next: Vec<&Value> = live
                .iter()
                .flat_map(|offer| {
                    let so = side_of(offer);
                    answers_of(hash_of(offer), None)
                        .into_iter()
                        .filter(move |c| {
                            type_of(c) == "promise" && side_of(c).is_some() && side_of(c) != so
                        })
                })
                .collect();
            if next.is_empty() {
                break;
            }
            live = next;
        }
    }
    // An author's stop before acceptance. An accept binds unless that stop is in its causal past (promises.md).
    // On an open offer anyone may answer (an accept is a request), but only the author ends the offer (promises.md, Who may
    // bind): a stop by anyone else stops nothing.
    let before_stops: Vec<&Value> = in_deal
        .iter()
        .filter(|b| status(b, "stopped") && ss(b, "stop") == Some("before") && (!open || by_offerer(b)))
        .collect();
    // An agent's ask is a quote request unless its grant names the act: no accept of it binds. The grantor's own
    // `accepted` answer to it, or a grant that lists `promise` in scope.acts, makes it bind (promises.md, invariant 22).
    let quote_only = |offer: &Value| -> bool {
        let grant = rs(offer, "under").and_then(|h| index.get(h));
        let agent_by_kind = rs(offer, "author")
            .and_then(|a| index.get(a))
            .is_some_and(|g| matches!(ss(g, "kind"), Some("agent" | "machine")));
        let named = match grant {
            Some(g) => match get(g, "state.scope.acts") {
                None => true,
                Some(Value::Array(acts)) => acts.iter().any(|a| {
                    a.as_str().is_some_and(|a| a == "promise" || a.starts_with("promise."))
                }),
                Some(_) => false,
            },
            None => !agent_by_kind && rs(offer, "under").is_none(),
        };
        if named {
            return false;
        }
        let principal = grant.and_then(|g| grantor_of(g, &index));
        !in_deal.iter().any(|b| {
            status(b, "accepted")
                && list(rf(b, "answers")).contains(&hash_of(offer))
                && principal.as_deref().is_some_and(|p| speaks_as(b, Some(p), &index, now))
        })
    };
    // 6. A binding accept: one to one, the other side's accept of a live offer unless the offerer declined it; open to
    // many, the offerer's own allocation, each seeing the one before.
    let declined_by_offerer = |accept: &Value| {
        answers_of(hash_of(accept), Some("declined"))
            .iter()
            .any(|b| by_offerer(b))
    };
    let mut takers: Vec<Value> = Vec::new();
    let mut forks: Vec<String> = Vec::new();
    let mut accept: Option<&Value> = None;
    // To yourself: a promise whose from and to both name its author is accepted when made.
    let to_self = from.is_some_and(|f| !f.is_empty()) && from == to && rs(&first, "author") == from;
    if to_self {
        accept = Some(&first);
    } else if !open {
        // Binding accepts, across every live offer. The earliest in causal order binds; two that do not see each other prove the
        // accepter's lie: neither binds, and both are listed in `forks`.
        let mut candidates: Vec<&Value> = live
            .iter()
            .filter(|offer| !quote_only(offer))
            .flat_map(|offer| {
                let so = side_of(offer);
                answers_of(hash_of(offer), Some("accepted"))
                    .into_iter()
                    .filter(move |b| side_of(b).is_some() && side_of(b) != so)
            })
            .filter(|b| !declined_by_offerer(b) && !before_stops.iter().any(|s| sees_in(b, hash_of(s), &index)))
            .collect();
        candidates.dedup_by(|a, b| hash_of(a) == hash_of(b));
        let first_ones = earliest(&candidates, &index);
        if first_ones.len() == 1 {
            accept = Some(first_ones[0]);
        } else if first_ones.len() > 1 {
            forks = sorted_set(first_ones.iter().map(|b| hash_of(b).to_string()));
        }
    } else {
        let requests: Vec<&Value> = answers_of(&first_hash, Some("accepted"))
            .into_iter()
            .filter(|b| !by_offerer(b) && !quote_only(&first))
            .collect();
        let allocations: Vec<&Value> = in_deal
            .iter()
            .filter(|b| {
                by_offerer(b)
                    && status(b, "accepted")
                    && list(rf(b, "answers"))
                        .iter()
                        .any(|h| requests.iter().any(|r| hash_of(r) == *h))
            })
            .collect();
        let terms_q = get(&first, "state.terms.quantity");
        let cap = get(&first, "state.terms.quantity.max")
            .filter(|v| truthy(Some(v)))
            .or(terms_q)
            .filter(|v| truthy(Some(v)));
        // The orderer's allocations form one chain, each seeing the one before. Two that do not see each other
        // prove a lie: neither counts, nor anything after them; only what came before the pair binds.
        let mut allocated = 0.0;
        for allocation in causal_order_among(&sub_index(&allocations), &index) {
            let crossed = takers.iter().position(|t| {
                !sees_in(&allocation, crate::js::str_of(t.get("allocation")), &index)
            });
            if let Some(i) = crossed {
                let mut pair = vec![
                    crate::js::str_of(takers[i].get("allocation")).to_string(),
                    hash_of(&allocation).to_string(),
                ];
                pair.sort();
                forks.extend(pair);
                takers.truncate(i);
                break;
            }
            let answered = list(rf(&allocation, "answers"));
            let Some(request) = requests.iter().find(|r| answered.contains(&hash_of(r))) else {
                continue;
            };
            let quantity = get(&allocation, "state.terms.quantity")
                .filter(|v| truthy(Some(v)))
                .or_else(|| get(request, "state.terms.quantity").filter(|v| truthy(Some(v))))
                .cloned();
            let q = match (cap, &quantity) {
                (Some(c), Some(q)) => amount_in(Some(q), c.get("unit")),
                _ => None,
            };
            // What is bound from an offer never exceeds what is offered (invariant 11).
            if let (Some(q), Some(c)) = (q, cap) {
                if allocated + q > number_of(c.get("value")) {
                    continue;
                }
            }
            allocated += q.unwrap_or(0.0);
            takers.push(json!({
                "who": rf(request, "author"), "request": hash_of(request), "allocation": hash_of(&allocation),
                "quantity": quantity.unwrap_or(Value::Null),
            }));
        }
        if let Some(t) = takers.first() {
            accept = index.get(crate::js::str_of(t.get("allocation")));
        }
    }
    let offer: &Value = match accept {
        Some(a) if !open && !to_self => list(rf(a, "answers"))
            .first()
            .and_then(|h| index.get(*h))
            .unwrap_or(live[0]),
        _ => live[0],
    };
    let sides = json!({ "from": from_ref, "to": to_ref });
    // Every name the spec gives (§11, What each fold returns): a field that does not apply is null, or an empty list.
    let result = |stage: &str, more: Value| -> Value {
        // The offer the binding accept answers; with none, the live offer when there is only one.
        let reported: Value = if accept.is_some() { json!(hash_of(offer)) } else if live.len() == 1 { json!(hash_of(live[0])) } else { Value::Null };
        let mut live_hashes: Vec<String> = live.iter().map(|o| hash_of(o).to_string()).collect();
        live_hashes.sort();
        let mut out = json!({
            "stage": stage, "stop": null, "from": null, "offer": reported, "live": live_hashes, "accept": accept.map(hash_of),
            "sides": sides, "quantity": null, "takers": takers, "forks": forks, "lines": [], "total": null,
            "paid": null, "stopped": [],
        });
        if let Value::Object(m) = more {
            for (k, v) in m {
                out[k] = v;
            }
        }
        out
    };

    let stops: Vec<&Value> = in_deal.iter().filter(|b| status(b, "stopped") && (!open || by_offerer(b))).collect();
    // No binding accept: stopped before (the author withdrew it and no accept binds over the stop), declined by the
    // other side, or still offered or asked. The fold reads no clock: expired is the view's (views.rs).
    let Some(accept_block) = accept else {
        if !before_stops.is_empty() {
            return result("stopped", json!({ "stop": "before" }));
        }
        if !open
            && live.iter().any(|one| {
                let so = side_of(one);
                answers_of(hash_of(one), Some("declined"))
                    .iter()
                    .any(|b| side_of(b).is_some() && side_of(b) != so)
            })
        {
            return result("declined", json!({}));
        }
        // A block sent despite a live STOP is valid and kept; consent decides what binds (consent.md). The person
        // told the sender she wants no contact, so the fold reads that ask as declined in advance. Her own accept
        // (above) would still bind: `answers` is the only consent to a deal.
        if !open {
            if let (Some(person), Some(sender)) = (other.filter(|s| !s.is_empty()), rs(&first, "author")) {
                let held: Vec<Value> = index.values().cloned().collect();
                if crate::strangers::consent(person, Some(sender), &held, rs(&first, "under")).get("word").and_then(Value::as_str) == Some("stop") {
                    return result("declined", json!({}));
                }
            }
        }
        return result(if offerer_is_from { "offered" } else { "asked" }, json!({}));
    };
    // 7, 8. Settling.
    let empty = json!({});
    let terms = get(offer, "state.terms")
        .filter(|t| truthy(Some(t)))
        .unwrap_or(&empty);
    let chosen = get(accept_block, "state.terms.quantity")
        .filter(|v| truthy(Some(v)))
        .cloned()
        .or_else(|| {
            takers
                .first()
                .and_then(|t| t.get("quantity"))
                .filter(|v| truthy(Some(v)))
                .cloned()
        })
        .or_else(|| terms.get("quantity").filter(|v| truthy(Some(v))).cloned());
    let other_side = if offerer_is_from { "to" } else { "from" };
    let receiver = |side: &str| -> Option<String> {
        if let Some(r) = if side == "from" { from } else { to } {
            return Some(r.to_string());
        }
        if side == other_side {
            return takers
                .first()
                .and_then(|t| t.get("who"))
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .or(rs(accept_block, "author"))
                .map(String::from);
        }
        None
    };
    let to_side = receiver("to");
    let from_side = receiver("from");
    // A confirmer is one given, or one the deal's schema names in its grounds (an id, or circle#role: its holders).
    let schema = rs(&first, "schema").and_then(|h| index.get(h));
    let mut named_raw: Vec<String> = options.confirmers.clone();
    if let Some(Value::Array(c)) = schema.and_then(|s| get(s, "state.grounds.confirmers")) {
        named_raw.extend(c.iter().map(|x| text(Some(x))));
    }
    let named: Vec<String> = named_raw
        .iter()
        .flat_map(|who| {
            let mut parts = who.splitn(2, '#');
            let circle = parts.next().unwrap_or("");
            match parts.next().map(|r| r.split('#').next().unwrap_or("")) {
                Some(role) if !role.is_empty() => {
                    holders_of(circle_state_in(circle, &index, None).as_ref(), role)
                }
                _ => vec![who.clone()],
            }
        })
        .collect();
    let counted = |b: &Value, receiver: &Option<String>| -> bool {
        let r = receiver.as_deref();
        answers_of(hash_of(b), Some("accepted"))
            .iter()
            .any(|a| speaks_as(a, r, &index, now))
            || index.values().any(|o| {
                list(rf(o, "confirms")).contains(&hash_of(b))
                    && rs(o, "author").is_some_and(|a| named.iter().any(|n| n == a))
            })
    };
    let includes = |b: &Value, key: &str, who: &Option<String>| {
        who.as_deref()
            .is_some_and(|w| list(rf(b, key)).contains(&w))
    };
    let transfers: Vec<&Value> = in_deal
        .iter()
        .filter(|b| type_of(b) == "transfer" && st(b, "status").is_none())
        .collect();
    let goods: Vec<&Value> = transfers
        .iter()
        .copied()
        .filter(|b| {
            !truthy(st(b, "money"))
                && (((includes(b, "to_owner", &to_side) || includes(b, "to_holder", &to_side))
                    && counted(b, &to_side))
                    || (st(b, "count").is_some()
                        && !truthy(rf(b, "to_owner"))
                        && by_offerer(b)
                        && offerer_is_from))
        })
        .collect();
    let pays: Vec<&Value> = transfers
        .iter()
        .copied()
        .filter(|b| {
            truthy(st(b, "money")) && includes(b, "to_owner", &from_side) && counted(b, &from_side)
        })
        .collect();
    let refunds: Vec<&Value> = transfers
        .iter()
        .copied()
        .filter(|b| {
            truthy(st(b, "money")) && includes(b, "to_owner", &to_side) && counted(b, &to_side)
        })
        .collect();
    let work: Vec<&Value> = in_deal
        .iter()
        .filter(|b| {
            (type_of(b) == "transform"
                || (type_of(b) == "observe" && ss(b, "kind") == Some("work")))
                && side_of(b).is_some()
                && st(b, "status").is_none()
        })
        .collect();
    let accepted_work: Vec<&&Value> = work.iter().filter(|b| counted(b, &to_side)).collect();
    // Each line (or the whole) is covered when counted transfers move at least its quantity of `what` to the `to` side.
    let lines: Vec<Value> = match terms.get("lines").filter(|l| truthy(Some(l))) {
        Some(Value::Array(l)) => l.clone(),
        _ => vec![
            json!({ "id": null, "what": rf(offer, "what"), "quantity": chosen, "price": terms.get("price") }),
        ],
    };
    let moved = |line: &Value| -> f64 {
        let id = line.get("id").filter(|v| truthy(Some(v)));
        let unit = get(line, "quantity.unit");
        goods
            .iter()
            .filter(|b| id.is_none_or(|i| strict_eq(st(b, "line"), Some(i))))
            .map(|b| {
                if let Some(a) = amount_in(st(b, "amount"), unit) {
                    return a;
                }
                let packs: Vec<f64> = list(rf(b, "what"))
                    .iter()
                    .filter_map(|h| amount_in(index.get(*h).and_then(|t| st(t, "pack")), unit))
                    .collect();
                if packs.is_empty() {
                    f64::INFINITY
                } else {
                    packs.iter().sum()
                }
            })
            .sum()
    };
    struct LineState {
        id: Value,
        needed: Option<f64>,
        moved: f64,
        total: Option<(f64, Value)>,
    }
    let line_state: Vec<LineState> = lines
        .iter()
        .map(|line| LineState {
            id: line.get("id").cloned().unwrap_or(Value::Null),
            needed: line
                .get("quantity")
                .filter(|q| truthy(Some(q)))
                .map(|q| number_of(q.get("value"))),
            moved: moved(line),
            total: total_of(line.get("price"), line.get("quantity")),
        })
        .collect();
    let priced: Vec<&(f64, Value)> = line_state.iter().filter_map(|l| l.total.as_ref()).collect();
    let total: Option<(f64, Value)> = if priced.is_empty() {
        None
    } else {
        // Money in different currencies is never added: the price's own currency is the first line's.
        let own = &priced[0].1;
        Some((priced.iter().filter(|p| &p.1 == own).map(|p| p.0).sum(), own.clone()))
    };
    // The currency the promise is paid in: the price's, else the first payment's. Only that currency is counted.
    let currency_of = |b: &Value| -> Value {
        match st(b, "split").filter(|s| truthy(Some(s))) {
            Some(Value::Array(parts)) => parts
                .iter()
                .find(|p| p.get("for").and_then(Value::as_str) == Some(&first_hash))
                .and_then(|p| get(p, "money.currency").cloned())
                .unwrap_or(Value::Null),
            _ => get(b, "state.money.currency").cloned().unwrap_or(Value::Null),
        }
    };
    let own_currency: Value = total
        .as_ref()
        .map(|(_, c)| c.clone())
        .filter(|c| truthy(Some(c)))
        .or_else(|| pays.first().map(|b| currency_of(b)))
        .unwrap_or(Value::Null);
    // Only money in the price's own currency counts, as paid or as paid back.
    let money_for = |b: &Value| -> f64 {
        match st(b, "split").filter(|s| truthy(Some(s))) {
            Some(Value::Array(parts)) => parts
                .iter()
                .filter(|p| p.get("for").and_then(Value::as_str) == Some(&first_hash))
                .filter(|p| get(p, "money.currency").unwrap_or(&Value::Null) == &own_currency)
                .map(|p| number_of(get(p, "money.minor")))
                .sum(),
            Some(_) => 0.0,
            None if currency_of(b) == own_currency => number_of(get(b, "state.money.minor")),
            None => 0.0,
        }
    };
    let paid: f64 = pays.iter().map(|b| money_for(b)).sum();
    let back: f64 = refunds.iter().map(|b| money_for(b)).sum();
    let goods_done = lines.iter().zip(&line_state).all(|(line, ls)| {
        !truthy(line.get("what"))
            || match ls.needed {
                None => ls.moved > 0.0,
                Some(n) => ls.moved >= n,
            }
    });
    let offer_what = truthy(rf(offer, "what"));
    let work_done = if truthy(terms.get("quantity")) && !offer_what {
        let unit = get(terms, "quantity.unit");
        accepted_work
            .iter()
            .map(|b| {
                amount_in(st(b, "amount"), unit)
                    .filter(|a| *a != 0.0 && !a.is_nan())
                    .unwrap_or(0.0)
            })
            .sum::<f64>()
            >= number_of(get(terms, "quantity.value"))
    } else {
        !accepted_work.is_empty()
    };
    let done = goods_done
        && total.as_ref().is_none_or(|t| paid >= t.0)
        && (offer_what || truthy(terms.get("lines")) || work_done);
    let mut occurrences: Vec<String> = Vec::new();
    for s in &stops {
        if let Some(Value::Array(o)) = get(s, "state.stop.occurrences") {
            occurrences.extend(o.iter().map(|x| text(Some(x))));
        }
    }
    let occurrences = sorted_set(occurrences);
    // `paid` carries a currency even with no total: the first payment's.
    let currency = own_currency.clone();
    let paid_json = if total.is_some() || paid != 0.0 {
        json!({ "minor": num(paid), "currency": currency })
    } else {
        Value::Null
    };
    let mut more = json!({
        "quantity": chosen,
        "total": total.as_ref().map(|(m, c)| json!({ "minor": num(*m), "currency": c })),
        "paid": paid_json,
        "lines": line_state.iter().map(|l| json!({
            "id": l.id, "needed": l.needed.map(num),
            "moved": if l.moved.is_finite() { num(l.moved) } else { l.needed.map(num).unwrap_or(Value::Null) },
        })).collect::<Vec<_>>(),
        "stopped": occurrences,
    });
    // 1. Reversed: a done promise with counted transfers back for it covering what was paid.
    if done && paid > 0.0 && back >= paid {
        return result("reversed", more);
    }
    // 2. Done.
    if done {
        return result("done", more);
    }
    // 3. Stopped onward, from that block.
    if let Some(onward) = stops.iter().find(|b| ss(b, "stop") == Some("onward")) {
        more["stop"] = json!("onward");
        more["from"] = json!(hash_of(onward));
        return result("stopped", more);
    }
    let stage = if !goods.is_empty() || !pays.is_empty() || !work.is_empty() {
        "underway"
    } else {
        "accepted"
    };
    result(stage, more)
}

// ---- A circle: membership and roles ----
/// One member of a circle: the roles they hold and the grant that made them a member (with several current grants that do not
/// see each other, the roles of all of them, and the grant with the lowest hash, to name one).
#[derive(Debug, Clone, PartialEq)]
pub struct Member {
    pub roles: Vec<String>,
    pub grant: Option<String>,
    /// Every current grant (the heads that have not ended).
    pub grants: Vec<String>,
}

/// A circle's members and roles: `{ founder, members: { id: { roles, grant, counted_to } }, removed: { id:
/// counted_to } }` (counted_to is null for a current member, and for a removal that names none).
#[derive(Debug, Clone, PartialEq)]
pub struct CircleState {
    pub founder: String,
    pub members: indexmap::IndexMap<String, Member, crate::js::BuildHasher>,
    pub removed: indexmap::IndexMap<String, Option<String>, crate::js::BuildHasher>,
    /// For each grant that ended, the cut of every stop that ended it: the block the stop names in `counted_to`, else the stop.
    pub cuts: Vec<(String, String)>,
    /// The blocks signed as the circle by a member after the cut of a grant that ended: they carry no authority for the circle.
    pub void: alloc::collections::BTreeSet<String>,
}

impl CircleState {
    pub fn to_json(&self) -> Value {
        json!({
            "founder": self.founder,
            "members": Value::Object(self.members.iter().map(|(k, m)| (k.clone(), json!({ "roles": m.roles, "grant": m.grant, "counted_to": null }))).collect()),
            "removed": Value::Object(self.removed.iter().map(|(k, v)| (k.clone(), json!(v))).collect()),
        })
    }
}

struct Invitation {
    to: Option<String>,
    roles: Vec<String>,
    update: bool,
    grant: Option<String>,
    added: Vec<String>,
}

/// One accepted grant of a member that no later acceptance of theirs supersedes (a head), and whether it has ended.
#[derive(Clone)]
struct Head {
    grant: String,
    accept: String,
    roles: Vec<String>,
    ended: bool,
}

struct Circle<'a> {
    index: &'a Index,
    id: String,
    founder: String,
    /// The circle's roles: `[(name, powers)]`, the founder holding the first.
    roles: Vec<(String, Vec<String>)>,
    removal_needed: f64,
    related: Vec<Value>,
    memo: RefCell<Vec<(String, CircleState)>>,
}

impl<'a> Circle<'a> {
    /// Whether any of these role names carries a power.
    fn has_power(&self, roles: &[String], power: &str) -> bool {
        self.roles
            .iter()
            .any(|(name, powers)| roles.contains(name) && powers.iter().any(|p| p == power))
    }
    fn empty(&self) -> CircleState {
        let mut members = indexmap::IndexMap::default();
        members.insert(
            self.founder.clone(),
            Member {
                roles: self.roles.first().map(|(n, _)| vec![n.clone()]).unwrap_or_default(),
                grant: Some(self.id.clone()),
                grants: vec![self.id.clone()],
            },
        );
        CircleState {
            founder: self.founder.clone(),
            members,
            removed: Default::default(),
            cuts: Vec::new(),
            void: Default::default(),
        }
    }
    fn past_fold(&self, block: &Value) -> CircleState {
        let past = past_in(block, self.index);
        let set: Vec<Value> = self
            .related
            .iter()
            .filter(|b| past.contains(hash_of(b)))
            .cloned()
            .collect();
        self.fold(&set)
    }
    fn fold(&self, set: &[Value]) -> CircleState {
        let mut hashes: Vec<&str> = set.iter().map(hash_of).collect();
        hashes.sort();
        let key = hashes.join(",");
        if let Some((_, s)) = self.memo.borrow().iter().find(|(k, _)| *k == key) {
            return s.clone();
        }
        self.memo.borrow_mut().push((key.clone(), self.empty()));
        let state = self.fold_now(set);
        for entry in self.memo.borrow_mut().iter_mut() {
            if entry.0 == key {
                entry.1 = state.clone();
            }
        }
        state
    }
    // One pass in causal order: each invitation, answer, change and removal applies where it falls, so a member
    // removed and later invited again is in, by the new grant; a grant once ended stays ended. A member may hold several
    // accepted grants: those no later acceptance of theirs supersedes are their heads, and they are a member while a head
    // has not ended, holding the roles of all heads that have not.
    fn fold_now(&self, set: &[Value]) -> CircleState {
        let id = self.id.as_str();
        let founder = self.founder.as_str();
        let mut state = self.empty();
        let mut invitations: Vec<(String, Invitation)> = Vec::new();
        let mut updates: Vec<(String, Invitation)> = Vec::new();
        let mut ended: Vec<String> = Vec::new();
        let mut agreed: Vec<(String, Vec<String>)> = Vec::new();
        // Every authorised stop of a grant and its cut; those of grants that ended are kept (a block must be within every cut).
        let mut stop_cuts: Vec<(String, String)> = Vec::new();
        // Every end that took a member's last current grant: who, the stop, and the counted_to it names.
        let mut ends: Vec<(String, String, Option<String>)> = Vec::new();
        // Each member's heads, ended or not (an ended head still supersedes what it saw).
        let mut book: Vec<(String, Vec<Head>)> = Vec::new();
        // The grant that last made each one a member (kept after they are removed, for crossing removals).
        let mut held: Vec<(String, String)> = vec![(founder.to_string(), id.to_string())];
        let held_of = |held: &[(String, String)], who: &str| -> Option<String> {
            held.iter()
                .rev()
                .find(|(k, _)| k == who)
                .map(|(_, g)| g.clone())
        };
        // A block signed as the circle by a member who holds a power in the fold of the block's causal past.
        let can = |b: &Value, power: &str| {
            rs(b, "as") == Some(id) && {
                let past = self.past_fold(b);
                rs(b, "author")
                    .and_then(|a| past.members.get(a))
                    .is_some_and(|m| self.has_power(&m.roles, power))
            }
        };
        let is_stop = |b: &Value| {
            ss(b, "status") == Some("stopped")
                && !list(rf(b, "updates")).is_empty()
                && list(rf(b, "answers")).is_empty()
        };
        // Whose admin grant is earlier in causal order (the circle itself, the founder's, above all).
        let earlier = |a: Option<&str>, b: Option<&str>| -> bool {
            match (a, b) {
                (Some(a), Some(b)) if a != b => {
                    a == id
                        || self.index.get(b).is_some_and(|bb| {
                            self.index.contains_key(a) && sees_in(bb, a, self.index)
                        })
                }
                _ => false,
            }
        };
        let stops: Vec<&Value> = set.iter().filter(|b| is_stop(b) && can(b, "remove")).collect();
        let counted_to = |b: &Value| {
            ss(b, "counted_to")
                .filter(|s| !s.is_empty())
                .map(String::from)
        };
        // What the circle fold keeps of a member from their heads.
        // A member's current grants: the heads (accepted grants no other acceptance of theirs supersedes) that have not ended.
        let current = |book: &[(String, Vec<Head>)], who: &str| -> Vec<Head> {
            let hs: &[Head] = book.iter().find(|(k, _)| k == who).map(|(_, h)| h.as_slice()).unwrap_or(&[]);
            hs.iter()
                .filter(|h| {
                    !h.ended
                        && !hs
                            .iter()
                            .any(|o| o.accept != h.accept && self.index.get(&o.accept).is_some_and(|ob| sees_in(ob, &h.accept, self.index)))
                })
                .cloned()
                .collect()
        };
        let refresh = |state: &mut CircleState, book: &[(String, Vec<Head>)], who: &str| {
            let live_heads = current(book, who);
            let live: Vec<&Head> = live_heads.iter().collect();
            if live.is_empty() {
                return;
            }
            let mut roles: Vec<String> = Vec::new();
            for h in &live {
                for r in &h.roles {
                    if !roles.contains(r) {
                        roles.push(r.clone());
                    }
                }
            }
            if live.len() > 1 {
                roles.sort();
            }
            let mut grants: Vec<String> = live.iter().map(|h| h.grant.clone()).collect();
            grants.sort_by(|a, b| cmp16(a, b));
            state.members.insert(who.to_string(), Member { roles, grant: grants.first().cloned(), grants });
        };
        let refs: Vec<&Value> = set.iter().collect();
        for block in causal_order_among(&sub_index(&refs), self.index) {
            let answered = list(rf(&block, "answers"));
            let updated = list(rf(&block, "updates"));
            let status = ss(&block, "status");
            if answered.is_empty() && updated.is_empty() && st(&block, "status").is_none() {
                if can(&block, "admit") {
                    let roles = match st(&block, "roles") {
                        Some(Value::Array(r)) => r.iter().map(|x| text(Some(x))).collect(),
                        _ => vec![],
                    };
                    let to = rs(&block, "to").filter(|s| !s.is_empty()).map(String::from);
                    invitations.push((
                        hash_of(&block).to_string(),
                        Invitation {
                            to,
                            roles,
                            update: false,
                            grant: None,
                            added: vec![],
                        },
                    ));
                }
            } else if !answered.is_empty() {
                let find = |h: &str| {
                    invitations
                        .iter()
                        .find(|(k, _)| k == h)
                        .or_else(|| updates.iter().find(|(k, _)| k == h))
                };
                let Some((grant, target)) = answered.iter().find_map(|h| find(h)) else {
                    continue;
                };
                let grant = grant.clone();
                let who = rs(&block, "author").unwrap_or("").to_string();
                if target.to.as_deref().is_some_and(|t| t != who) {
                    continue;
                }
                let cut = counted_to(&block).unwrap_or_else(|| hash_of(&block).to_string());
                if status == Some("accepted") {
                    if target.update {
                        let of = target.grant.clone().unwrap_or_default();
                        if !ended.contains(&of) {
                            if let Some((_, hs)) = book.iter_mut().find(|(k, _)| *k == who) {
                                if let Some(h) = hs.iter_mut().find(|h| h.grant == of && !h.ended) {
                                    h.roles = unique(h.roles.iter().chain(target.added.iter()));
                                }
                            }
                            refresh(&mut state, &book, &who);
                        }
                    } else if !ended.contains(&grant) {
                        let at = match book.iter().position(|(k, _)| *k == who) {
                            Some(at) => at,
                            None => {
                                book.push((who.clone(), vec![]));
                                book.len() - 1
                            }
                        };
                        book[at].1.push(Head { grant: grant.clone(), accept: hash_of(&block).to_string(), roles: target.roles.clone(), ended: false });
                        held.push((who.clone(), grant.clone()));
                        state.removed.shift_remove(&who);
                        refresh(&mut state, &book, &who);
                    }
                } else if matches!(status, Some("stopped" | "declined")) && who != founder {
                    let of = if target.update {
                        target.grant.clone().unwrap_or_default()
                    } else {
                        grant.clone()
                    };
                    let head = book.iter().find(|(k, _)| *k == who).and_then(|(_, hs)| hs.iter().find(|h| h.grant == of));
                    if head.is_some() {
                        stop_cuts.push((of.clone(), cut));
                        if !ended.contains(&of) {
                            ended.push(of.clone());
                            if let Some((_, hs)) = book.iter_mut().find(|(k, _)| *k == who) {
                                for h in hs.iter_mut().filter(|h| h.grant == of) {
                                    h.ended = true;
                                }
                            }
                            let any_live = !current(&book, &who).is_empty();
                            if any_live {
                                refresh(&mut state, &book, &who);
                            } else {
                                ends.push((who.clone(), hash_of(&block).to_string(), counted_to(&block)));
                                state.members.shift_remove(&who);
                            }
                        }
                    }
                }
            } else if !updated.is_empty() && (can(&block, if is_stop(&block) { "remove" } else { "admit" })) {
                let Some(grant) = updated
                    .iter()
                    .find(|h| invitations.iter().any(|(k, _)| k == *h))
                    .map(|h| h.to_string())
                else {
                    continue;
                };
                // the member whose current head this grant is
                let who = book
                    .iter()
                    .find(|(_, hs)| hs.iter().any(|h| h.grant == grant && !h.ended))
                    .map(|(k, _)| k.clone());
                if is_stop(&block) {
                    stop_cuts.push((grant.clone(), counted_to(&block).unwrap_or_else(|| hash_of(&block).to_string())));
                }
                if ended.contains(&grant) {
                    continue;
                }
                if is_stop(&block) {
                    // An invitation not yet answered simply ends: a stop that has not seen the member's answer comes before it, so
                    // the answer accepts nothing, whichever of the two a reader meets first.
                    let Some(who) = who else {
                        ended.push(grant);
                        continue;
                    };
                    let answer = book
                        .iter()
                        .find(|(k, _)| *k == who)
                        .and_then(|(_, hs)| hs.iter().find(|h| h.grant == grant && !h.ended))
                        .map(|h| h.accept.clone())
                        .unwrap_or_default();
                    if who != founder && !sees_in(&block, &answer, self.index) {
                        ended.push(grant.clone());
                        if let Some((_, hs)) = book.iter_mut().find(|(k, _)| *k == who) {
                            hs.retain(|h| h.grant != grant);
                        }
                        if !current(&book, &who).is_empty() {
                            refresh(&mut state, &book, &who);
                        } else {
                            state.members.shift_remove(&who);
                        }
                        continue;
                    }
                    if who == founder {
                        continue;
                    }
                    // Removing an admin takes `state.removal.needed` other admins (default 1); a member, one admin.
                    let remover = rs(&block, "author").unwrap_or("").to_string();
                    let at = match agreed.iter().position(|(g, _)| *g == grant) {
                        Some(at) => at,
                        None => {
                            agreed.push((grant.clone(), vec![]));
                            agreed.len() - 1
                        }
                    };
                    if !agreed[at].1.contains(&remover) {
                        agreed[at].1.push(remover.clone());
                    }
                    let others = agreed[at].1.iter().filter(|by| **by != who).count() as f64;
                    let is_admin = state
                        .members
                        .get(&who)
                        .is_some_and(|m| self.has_power(&m.roles, "admit") || self.has_power(&m.roles, "remove"));
                    if is_admin && others < self.removal_needed {
                        continue;
                    }
                    // Crossing removals of admins: the one whose admin grant is earlier wins; if neither is, both stand.
                    let mine = held_of(&held, &remover);
                    let theirs = held_of(&held, &who);
                    let rival = stops.iter().any(|other| {
                        rs(other, "author") == Some(who.as_str())
                            && mine
                                .as_deref()
                                .is_some_and(|g| list(rf(other, "updates")).contains(&g))
                            && !sees_in(other, hash_of(&block), self.index)
                            && !sees_in(&block, hash_of(other), self.index)
                    });
                    if rival && remover != founder && earlier(theirs.as_deref(), mine.as_deref()) {
                        continue;
                    }
                    ended.push(grant.clone());
                    if let Some((_, hs)) = book.iter_mut().find(|(k, _)| *k == who) {
                        for h in hs.iter_mut().filter(|h| h.grant == grant) {
                            h.ended = true;
                        }
                    }
                    let any_live = !current(&book, &who).is_empty();
                    if any_live {
                        refresh(&mut state, &book, &who);
                    } else {
                        ends.push((who.clone(), hash_of(&block).to_string(), counted_to(&block)));
                        state.members.shift_remove(&who);
                    }
                } else if let (Some(Value::Array(after)), Some(who)) = (st(&block, "roles"), who) {
                    let after: Vec<String> = after.iter().map(|x| text(Some(x))).collect();
                    let mut before: Vec<String> = Vec::new();
                    if let Some((_, hs)) = book.iter_mut().find(|(k, _)| *k == who) {
                        if let Some(h) = hs.iter_mut().find(|h| h.grant == grant && !h.ended) {
                            before = h.roles.clone();
                            h.roles = before.iter().filter(|r| after.contains(r)).cloned().collect();
                        }
                    }
                    refresh(&mut state, &book, &who);
                    let added = after.iter().filter(|r| !before.contains(r)).cloned().collect();
                    updates.push((
                        hash_of(&block).to_string(),
                        Invitation {
                            to: Some(who),
                            roles: vec![],
                            update: true,
                            grant: Some(grant),
                            added,
                        },
                    ));
                }
            }
        }
        state.cuts = stop_cuts.into_iter().filter(|(g, _)| ended.contains(g)).collect();
        // Who is out: the counted_to of the last stop that took their last current grant (of several that do not see each other,
        // the one with the lowest hash, only to name one), null when it names none.
        for (who, _, _) in &ends {
            if state.members.contains_key(who) || state.removed.contains_key(who) {
                continue;
            }
            let mine: Vec<&(String, String, Option<String>)> = ends.iter().filter(|e| e.0 == *who).collect();
            let last = mine
                .iter()
                .filter(|e| !mine.iter().any(|o| o.1 != e.1 && self.index.get(&o.1).is_some_and(|ob| sees_in(ob, &e.1, self.index))))
                .min_by(|a, b| cmp16(&a.1, &b.1));
            state.removed.insert(who.clone(), last.and_then(|e| e.2.clone()));
        }
        state
    }
}

/// A circle's members and roles from its member grants (already read), optionally only within a block's causal past.
pub fn circle_state_in(circle: &str, read: &Index, within: Option<&Value>) -> Option<CircleState> {
    let root = read.get(circle)?;
    let id = hash_of(root).to_string();
    let founder = rs(root, "author").unwrap_or("").to_string();
    let related: Vec<Value> = read
        .values()
        .filter(|b| {
            type_of(b) == "grant"
                && ss(b, "kind") == Some("member")
                && list(rf(b, "subject")).contains(&id.as_str())
                // Every member grant and answer naming the circle that counts: with seq, or as its author's history.
                && crate::identity::counts_in(b, read)
        })
        .cloned()
        .collect();
    let needed = get(root, "state.removal.needed")
        .filter(|v| truthy(Some(v)))
        .map(|v| number_of(Some(v)));
    let default_needed = get(&crate::spec().protocol, "circle.removal_default.needed")
        .and_then(Value::as_f64)
        .unwrap_or(1.0);
    let roles: Vec<(String, Vec<String>)> = match get(root, "state.roles") {
        Some(Value::Array(list)) => list
            .iter()
            .map(|r| {
                (
                    text(r.get("name")),
                    r.get("powers")
                        .and_then(Value::as_array)
                        .map(|p| p.iter().map(|x| text(Some(x))).collect())
                        .unwrap_or_default(),
                )
            })
            .collect(),
        _ => Vec::new(),
    };
    let build = |related: Vec<Value>| Circle {
        index: read,
        id: id.clone(),
        founder: founder.clone(),
        roles: roles.clone(),
        removal_needed: needed.unwrap_or(default_needed),
        related,
        memo: RefCell::new(Vec::new()),
    };
    let run = |c: &Circle| match within {
        Some(w) => c.past_fold(read.get(hash_of(w)).unwrap_or(w)),
        None => c.fold(&c.related),
    };
    // Pass 1 reads every stop and the cut it names. A block a member signed as the circle that is neither the cut of a grant that
    // ended nor in the cut's causal past carries no authority for the circle, whether or not it saw the stop (circles.md).
    let first = build(related.clone());
    let whole = first.fold(&first.related);
    let mut void: alloc::collections::BTreeSet<String> = Default::default();
    if !whole.cuts.is_empty() {
        for b in read.values() {
            let Some(author) = rs(b, "author").filter(|a| *a != founder) else { continue };
            if rs(b, "as") != Some(id.as_str()) {
                continue;
            }
            // A removal is never set aside this way: two that cross follow the crossing rule.
            if type_of(b) == "grant" && ss(b, "kind") == Some("member") && ss(b, "status") == Some("stopped") && !list(rf(b, "updates")).is_empty() && list(rf(b, "answers")).is_empty() {
                continue;
            }
            let at = first.past_fold(b);
            let Some(member) = at.members.get(author) else { continue };
            let outside = whole.cuts.iter().any(|(g, cut)| {
                member.grants.contains(g)
                    && hash_of(b) != cut
                    && !read.get(cut).is_some_and(|x| sees_in(x, hash_of(b), read))
            });
            if outside {
                void.insert(hash_of(b).to_string());
            }
        }
    }
    let mut out = if void.is_empty() {
        run(&first)
    } else {
        let kept: Vec<Value> = related.into_iter().filter(|b| !void.contains(hash_of(b))).collect();
        run(&build(kept))
    };
    out.void = void;
    Some(out)
}

/// A circle's members and roles (protocol.md §8, §11). A member grant counts if signed as the circle by someone holding
/// admin in the fold of its own causal past; a member holds its roles once their own answer accepts it; roles taken
/// away count at once, roles added once answered. `within`: fold only that block's causal past.
pub fn circle_state(circle: &str, blocks: &[Value], within: Option<&Value>) -> Option<CircleState> {
    circle_state_in(circle, &read_all(blocks), within)
}

/// The holders of a role in a circle (the members holding it), sorted.
pub fn holders_of(state: Option<&CircleState>, role: &str) -> Vec<String> {
    let Some(state) = state else { return vec![] };
    let mut out: Vec<String> = state
        .members
        .iter()
        .filter(|(_, m)| m.roles.iter().any(|r| r == role))
        .map(|(k, _)| k.clone())
        .collect();
    out.sort_by(|a, b| cmp16(a, b));
    out
}

fn may_act_as_in(block: &Value, circle: &str, read: &Index, role: Option<&str>) -> bool {
    may_with_in(block, circle, read, role, "sign")
}

// Whether the block's author, in the circle's fold of the block's causal past, holds `role` if one is named, else a
// role with the power.
fn may_with_in(block: &Value, circle: &str, read: &Index, role: Option<&str>, power: &str) -> bool {
    // a block that rests on blocks not held is not read yet
    if !crate::js::unmet_in(block, read).is_empty() {
        return false;
    }
    let Some(state) = circle_state_in(circle, read, Some(block)) else { return false };
    if state.void.contains(hash_of(block)) {
        return false;
    }
    let Some(member) = rs(block, "author").and_then(|a| state.members.get(a)) else { return false };
    match role {
        Some(r) => member.roles.iter().any(|x| x == r),
        None => {
            let root = &read[circle];
            let powers: Vec<(String, Vec<String>)> = match get(root, "state.roles") {
                Some(Value::Array(list)) => list
                    .iter()
                    .map(|r| {
                        (
                            text(r.get("name")),
                            r.get("powers").and_then(Value::as_array).map(|p| p.iter().map(|x| text(Some(x))).collect()).unwrap_or_default(),
                        )
                    })
                    .collect(),
                _ => Vec::new(),
            };
            powers.iter().any(|(n, p)| member.roles.contains(n) && p.iter().any(|x| x == power))
        }
    }
}

/// Whether a block may be signed as a circle: its author holds, in the fold of its causal past, `role` if one is
/// named, else a role with the power `sign`.
pub fn may_act_as(block: &Value, circle: &str, blocks: &[Value], role: Option<&str>) -> bool {
    may_act_as_in(block, circle, &read_all(blocks), role)
}

/// Who a circle (or `circle#role`) in a block's audience means: the members (or holders) in the fold of the circle's
/// grants within that block's causal past.
pub fn members_then(block: &Value, recipient: &str, blocks: &[Value]) -> Vec<String> {
    let mut parts = recipient.split('#');
    let circle = parts.next().unwrap_or("");
    let role = parts.next();
    let index = crate::js::held_index(blocks);
    if !index.contains_key(circle) {
        return vec![];
    }
    let state = circle_state_in(circle, &read_all(index.values()), Some(block));
    match role {
        Some(r) => holders_of(state.as_ref(), r),
        None => state
            .map(|s| sorted_set(s.members.keys()))
            .unwrap_or_default(),
    }
}

// ---- Things: who owns an instance, and where it is now ----
/// Who owns an instance, the transfers that moved it, and a conflict (two that do not see each other prove a lie).
#[derive(Debug, Clone, PartialEq)]
pub struct Ownership {
    pub owner: Option<String>,
    pub transfers: Vec<String>,
    pub conflict: Option<Vec<String>>,
}

/// Who owns an instance: the `to_owner` of its last counted ownership transfer, else its maker. A transfer of
/// ownership counts only if signed by the owner the previous counted transfer named (or the maker, for the first),
/// with that transfer in its causal past; to a named receiver, once the receiver answers it accepted.
pub fn ownership(instance: &Value, blocks: &[Value]) -> Ownership {
    let index =
        read_all(core::iter::once(instance).chain(index_of(blocks).values().collect::<Vec<_>>()));
    ownership_in(hash_of(instance), &index)
}

fn ownership_in(thing_hash: &str, index: &Index) -> Ownership {
    let Some(thing) = index.get(thing_hash) else {
        return Ownership {
            owner: None,
            transfers: vec![],
            conflict: None,
        };
    };
    // The maker is who the thing's block speaks for: a thing made `as` a circle is the circle's.
    let mut owner: Option<String> = speaker_of(thing, index, None);
    let mut last: Option<&Value> = None;
    let accepted = |transfer: &Value| {
        index.values().any(|b| {
            type_of(b) == "transfer"
                && ss(b, "status") == Some("accepted")
                && crate::identity::counts_in(b, index)
                && list(rf(b, "answers")).contains(&hash_of(transfer))
                && speaker_of(b, index, None).is_some_and(|a| list(rf(transfer, "to_owner")).contains(&a.as_str()))
        })
    };
    let candidates: Vec<&Value> = index
        .values()
        .filter(|b| {
            type_of(b) == "transfer"
                && crate::identity::counts_in(b, index)
                && st(b, "status").is_none()
                && list(rf(b, "what")).contains(&thing_hash)
                && st(b, "amount").is_none()
                && if truthy(rf(b, "to_owner")) {
                    accepted(b)
                } else {
                    st(b, "count").is_some()
                }
        })
        .collect();
    let mut transfers: Vec<String> = Vec::new();
    loop {
        let o = owner.as_deref();
        let open: Vec<&Value> = candidates
            .iter()
            .copied()
            .filter(|b| {
                !transfers.iter().any(|t| t == hash_of(b))
                    && o.is_some()
                    && speaker_of(b, index, None).as_deref() == o
                    && last.is_none_or(|l| sees_in(b, hash_of(l), index))
            })
            .collect();
        let next = earliest(&open, index);
        if next.len() > 1 {
            return Ownership {
                owner,
                transfers,
                conflict: Some(sorted_set(next.iter().map(|b| hash_of(b)))),
            };
        }
        let Some(n) = next.first() else {
            return Ownership {
                owner,
                transfers,
                conflict: None,
            };
        };
        last = Some(n);
        transfers.push(hash_of(n).to_string());
        owner = list(rf(n, "to_owner")).first().map(|s| s.to_string());
        if owner.is_none() {
            return Ownership {
                owner,
                transfers,
                conflict: None,
            };
        }
    }
}

/// Who owns an instance now.
pub fn owner_of(instance: &Value, blocks: &[Value]) -> Option<String> {
    ownership(instance, blocks).owner
}

/// Who receives a bearer promise (refs.to names a thing): whoever owns it now; otherwise refs.to itself.
pub fn receiver_of(promise: &Value, blocks: &[Value]) -> Option<String> {
    let index = crate::js::held_index(blocks);
    let to = rs(promise, "to")?;
    match index.get(to) {
        Some(t) if type_of(t) == "thing" => owner_of(t, blocks),
        _ => Some(to.to_string()),
    }
}

/// Where a thing is now: the `to_place` of its latest counted move (by its owner, or a holder its owner named), else
/// its own refs.place; a place that is a thing is wherever that thing is (stopping at a repeat). Two moves that do not
/// see each other give both places. A sorted list of hashes.
pub fn where_now(thing: &Value, blocks: &[Value]) -> Vec<String> {
    let index = crate::js::held_index(blocks);
    let read = read_all(index.values());
    where_now_in(thing, &index, &read, &mut Vec::new())
}

fn where_now_in(thing: &Value, index: &Index, read: &Index, seen: &mut Vec<String>) -> Vec<String> {
    let me = index.get(hash_of(thing)).unwrap_or(thing).clone();
    let h = hash_of(&me).to_string();
    if seen.contains(&h) {
        return vec![h];
    }
    seen.push(h.clone());
    let mut with_me = read.clone();
    if !with_me.contains_key(&h) {
        with_me.insert(h.clone(), me.clone());
    }
    let owner = ownership_in(&h, &with_me).owner;
    let all: Vec<&Value> = read
        .values()
        .filter(|b| {
            type_of(b) == "transfer"
                && st(b, "status").is_none()
                && list(rf(b, "what")).contains(&h.as_str())
                && crate::identity::counts_in(b, read)
        })
        .collect();
    let mut holders: Vec<Option<String>> = vec![owner.clone()];
    for b in &all {
        if speaker_of(b, read, None) == owner {
            holders.extend(
                list(rf(b, "to_holder"))
                    .into_iter()
                    .map(|x| Some(x.to_string())),
            );
        }
    }
    let moves: Vec<Value> = all
        .iter()
        .filter(|b| {
            truthy(rf(b, "to_place")) && holders.contains(&speaker_of(b, read, None))
        })
        .map(|b| (*b).clone())
        .collect();
    let places: Vec<String> = if !moves.is_empty() {
        unique(heads_among(&moves).iter().flat_map(|b| {
            list(rf(b, "to_place"))
                .into_iter()
                .map(String::from)
                .collect::<Vec<_>>()
        }))
    } else {
        list(rf(&me, "place"))
            .into_iter()
            .map(String::from)
            .collect()
    };
    let mut out: Vec<String> = Vec::new();
    for place in places {
        match index.get(&place) {
            Some(at) if type_of(at) == "thing" => {
                let further = where_now_in(at, index, read, seen);
                if further.is_empty() {
                    out.push(place);
                } else {
                    out.extend(further);
                }
            }
            _ => out.push(place),
        }
    }
    sorted_set(out)
}

// ---- A successor's trigger (profiles/successor.md) ----
/// Where a successor grant's trigger stands: the needed witnesses' trigger observes, less those the person defeats
/// before it fires. It fires `wait` after the needed-th event arrived on this node (`arrived_at`), on the reader's own
/// clock (`now`). Returns `{ events, cancelled, since, fires, fired }`.
#[cfg(feature = "successor")]
pub fn successor_state(
    grant: &Value,
    blocks: &[Value],
    now: Option<&str>,
    arrived_at: ArrivedAt,
) -> Value {
    let index = crate::js::held_index(blocks);
    let gh = hash_of(grant);
    let person = rs(grant, "author");
    let witnesses = list(st(grant, "witnesses"));
    let needed = number_of(st(grant, "needed"));
    let wait = ss(grant, "wait").unwrap_or("");
    let events: Vec<&Value> = index
        .values()
        .filter(|b| {
            type_of(b) == "observe"
                && ss(b, "kind") == Some("trigger")
                && rs(b, "under") == Some(gh)
                && rs(b, "author").is_some_and(|a| witnesses.contains(&a))
                && crate::identity::counts_in(b, &index)
        })
        .collect();
    let arrived = |b: &Value| {
        arrived_at
            .and_then(|f| f(hash_of(b)))
            .filter(|s| !s.is_empty())
    };
    let defeats: Vec<&Value> = index
        .values()
        .filter(|b| {
            rs(b, "author") == person
                && person.is_some()
                && !list(rf(b, "defeats")).is_empty()
                && crate::identity::signed_by_author_in(b, &index, None)
        })
        .collect();
    let read = |until: Option<&str>| {
        let (mut cancelled, mut standing): (Vec<String>, Vec<&Value>) = (vec![], vec![]);
        let (mut since, mut fires): (Option<String>, Option<String>) = (None, None);
        let mut sorted = events.clone();
        sorted.sort_by(|a, b| {
            arrived(a)
                .unwrap_or_else(|| "null".into())
                .cmp(&arrived(b).unwrap_or_else(|| "null".into()))
        });
        for event in sorted {
            let cancels = defeats.iter().any(|d| {
                list(rf(d, "defeats")).contains(&hash_of(event))
                    && (until.is_none() || arrived(d).is_none_or(|a| a.as_str() < until.unwrap()))
            });
            if cancels {
                cancelled.push(hash_of(event).to_string());
                continue;
            }
            if !standing
                .iter()
                .any(|o| strict_eq(rf(o, "author"), rf(event, "author")))
            {
                standing.push(event);
            }
            if standing.len() as f64 == needed && since.is_none() {
                since = arrived(event);
                fires = since
                    .as_deref()
                    .and_then(|s| crate::time::add_duration(s, wait, 1));
            }
        }
        (cancelled, standing, since, fires)
    };
    let mut state = read(None);
    for _ in 0..=events.len() {
        let next = read(state.3.as_deref());
        let settled = next.3 == state.3;
        state = next;
        if settled {
            break;
        }
    }
    let (cancelled, standing, since, fires) = state;
    let fired = matches!((&fires, now), (Some(f), Some(n)) if n >= f.as_str());
    json!({
        "events": sorted_set(standing.iter().map(|e| hash_of(e))),
        "cancelled": sorted_set(cancelled),
        "since": since, "fires": fires, "fired": fired,
    })
}

// ---- A circle's key, by epoch (§8) ----
/// A circle's encryption key now: the key grants signed as the circle by a holder of the power rekey, each with state.epoch one higher,
/// naming epoch n-1 in after. Two rekeys in one epoch both open; the next settles. Returns `{ epoch, keys, grants }`.
#[cfg(feature = "rekeys")]
pub fn circle_key(circle: &str, blocks: &[Value]) -> Value {
    let read = read_all(blocks);
    let Some(root) = read.get(circle) else {
        return json!({ "epoch": 0, "keys": [], "grants": [] });
    };
    let rekeys: Vec<&Value> = read
        .values()
        .filter(|b| {
            type_of(b) == "grant"
                && ss(b, "kind") == Some("key")
                && rs(b, "as") == Some(circle)
                && int(st(b, "epoch")).is_some()
                && truthy(st(b, "public_key_encrypt"))
                && crate::identity::counts_in(b, &read)
        })
        .filter(|b| may_with_in(b, circle, &read, None, "rekey"))
        .collect();
    let mut epoch = 0i64;
    let mut open: Vec<(String, String)> = vec![(
        hash_of(root).to_string(),
        text(st(root, "public_key_encrypt")),
    )];
    for next in 1.. {
        let these: Vec<(String, String)> = rekeys
            .iter()
            .filter(|b| {
                int(st(b, "epoch")) == Some(next as f64)
                    && open
                        .iter()
                        .any(|(h, _)| list(rf(b, "after")).contains(&h.as_str()))
            })
            .map(|b| (hash_of(b).to_string(), text(st(b, "public_key_encrypt"))))
            .collect();
        if these.is_empty() {
            break;
        }
        epoch = next;
        open = these;
    }
    json!({ "epoch": epoch, "keys": sorted_set(open.iter().map(|o| &o.1)), "grants": sorted_set(open.iter().map(|o| &o.0)) })
}

// ---- A secret ballot (§8) ----
/// Whether a voter's commitment is among those the named counter signed as counted (`state.counted`).
#[cfg(feature = "ballots")]
pub fn counted_in(result: &Value, commitment: &str, counter: &str) -> bool {
    rs(result, "author") == Some(counter) && list(st(result, "counted")).contains(&commitment)
}

/// A record's orderer: `{ key }` named by its first block's state.orderer, else `{ author }`.
pub fn orderer_of(record: &Value) -> Value {
    match st(record, "orderer").filter(|v| truthy(Some(v))) {
        Some(k) => json!({ "key": k }),
        None => json!({ "author": rf(record, "author") }),
    }
}
