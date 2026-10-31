//! A pot (folds.md, A pot): money put behind a promise, and what has been paid from it. One reading for a vouch ("up to N of mine") and
//! a mutual pool (members pay in, a confirmer's signal pays out): the holder's payouts are read in causal order against what the pot
//! held where each one stands, and a payout past it counts for nothing against it.
use super::speaker_of;
use crate::decimal::Dec;
use crate::js::{cmp16, hash_of, list, rf, rs, st, type_of};
use crate::order::sees_in;
use crate::prelude::*;
use core::cmp::Ordering;

fn minor(v: Option<&Value>) -> Dec {
    Dec::of(v).unwrap_or_else(Dec::zero)
}

/// What a pot counts: money in one currency, or an amount in one unit.
#[derive(Clone, PartialEq)]
enum Measure {
    Money(Value),
    Count(Value),
}

impl Measure {
    /// The measure a money or amount value is in.
    fn of(v: &Value) -> Option<Measure> {
        if v.get("currency").is_some_and(Value::is_string) {
            Some(Measure::Money(v["currency"].clone()))
        } else if v.get("unit").is_some_and(Value::is_string) && v.get("value").is_some_and(Value::is_string) {
            Some(Measure::Count(v["unit"].clone()))
        } else {
            None
        }
    }
    /// What a transfer carries in this measure: its money in this currency, or its amount in this unit.
    fn qty(&self, t: &Value) -> Option<Dec> {
        match self {
            Measure::Money(c) => st(t, "money").filter(|m| m.get("currency") == Some(c)).map(|m| minor(m.get("minor"))),
            Measure::Count(u) => st(t, "amount").filter(|m| m.get("unit") == Some(u)).and_then(|m| Dec::of(m.get("value"))),
        }
    }
    /// A sum as the fold reports it.
    fn out(&self, d: &Dec) -> Value {
        match self {
            Measure::Money(_) => d.minor_json(),
            Measure::Count(_) => Value::String(d.text()),
        }
    }
    fn row(&self, d: &Dec) -> Value {
        match self {
            Measure::Money(c) => json!({ "money": { "minor": d.minor_json(), "currency": c } }),
            Measure::Count(u) => json!({ "amount": { "value": d.text(), "unit": u } }),
        }
    }
}

/// The ids a condition's signal names, looking through a `within` or `without` wrapper; None when the condition is no signal.
fn signal_by(cond: &Value) -> Option<Vec<String>> {
    if let Some(by) = cond.get("signal").and(cond.get("by")).and_then(Value::as_array) {
        return Some(by.iter().filter_map(|x| x.as_str().map(String::from)).collect());
    }
    cond.get("within").or_else(|| cond.get("without")).and_then(signal_by)
}

/// The lot and everything made from it, read along the makes (things.md, A make): a counted `transform` that names a thing in `derives_from`
/// makes things that name that transform in theirs, and so on down. A make counts only when its maker owned what it made from, where it stands.
fn made_from(lot: &str, index: &crate::js::Index) -> Vec<String> {
    let mut found: Vec<String> = vec![lot.to_string()];
    loop {
        let before = found.len();
        let makes: Vec<String> = index
            .values()
            .filter(|t| {
                // a make counts only when its maker owned a thing it made from, where the make stands: a stranger's "cheese" from another's lot is no make of that lot
                type_of(t) == "transform"
                    && crate::identity::counts_in(t, index)
                    && list(rf(t, "derives_from")).iter().any(|d| found.iter().any(|f| f == d) && super::things::owner_seen_by(d, t, index).is_some_and(|w| speaker_of(t, index, None).as_deref() == Some(w.as_str())))
            })
            .map(|t| hash_of(t).to_string())
            .collect();
        for o in index.values().filter(|o| type_of(o) == "thing" && list(rf(o, "derives_from")).iter().any(|d| makes.iter().any(|m| m == d))) {
            if !found.iter().any(|f| f == hash_of(o)) {
                found.push(hash_of(o).to_string());
            }
        }
        if found.len() == before {
            return found;
        }
    }
}

struct Payout {
    hash: String,
    to: String,
    amount: Dec,
    past: Vec<String>,
}

/// A pot read at the reader's clock `now` (a payout's condition may read the clock; "" reads none that does). The head is a first
/// promise; its holder is whom it speaks for. The pot holds `terms.backing` (the holder's own word, money) and every pay-in: a money
/// transfer `for` the head to the holder, accepted by the holder. A payout is a money transfer `for` the head signed by the holder to a
/// named receiver who accepts it; one that carries `state.condition` counts only once the condition holds, and where the head's schema
/// names confirmers, only on a signal by them. Payouts are read in causal order: one counts when the pot as its causal past shows it holds
/// its money, less the payouts that count there, and less every payout it does not see (and that it is not seen by) that fits the pot
/// alone. With no order named, two that together pass the pot both count for nothing against it: the protocol picks neither.
/// The pot holds money, or a count of one named kind (`terms.backing` an amount `{ value, unit }`: "up to 2 heifers"), read the same way:
/// pay-ins and payouts are transfers of that money, or of an amount in that unit; nothing is converted.
/// Returns null when the block is no first promise that speaks for anyone, else
/// `{ holder, currency, unit, backing, paid_in, paid_out, left, payouts: [{ block, to, money | amount, counts, why }] }`, payouts sorted by block;
/// a money pot reports its sums as numbers, a count pot as decimal text.
pub fn pot(head: &Value, blocks: &[Value], now: &str) -> Value {
    if type_of(head) != "promise" || !list(rf(head, "answers")).is_empty() {
        return Value::Null;
    }
    let index = super::read_all(core::iter::once(head).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()));
    let hh = hash_of(head).to_string();
    let Some(holder) = speaker_of(head, &index, None) else { return Value::Null };
    let backing = st(head, "terms").and_then(|t| t.get("backing")).filter(|m| Measure::of(m).is_some());
    // each pay-in is kept (a premium: leaving takes nothing back) or held (it comes back in full and is never paid out while held); the head's
    // `pay_in` says which. Only `kept` is spent: with neither said a pay-in counts toward no payout, and the card shows it as not said (profiles/pools.md)
    let pay_in: Option<&str> = st(head, "terms").and_then(|t| t.get("pay_in")).and_then(Value::as_str).filter(|w| *w == "kept" || *w == "held");
    let spent = pay_in == Some("kept");
    let pay_held = pay_in == Some("held");
    // a cap written out as `all` (the schema's term `cap`): all the holder owns on the day a claim is read, the referee fixing the sum. It reaches
    // property only; the fold shows "no limit" (`cap: "all"`, `backing` and `left` null) and a payout is never past the pot (profiles/vouches.md)
    let no_limit = backing.is_none() && st(head, "terms").and_then(|t| t.get("cap")).and_then(Value::as_str) == Some("all");
    let money_of = |t: &Value| st(t, "money").filter(|m| m.get("currency").is_some_and(Value::is_string)).cloned().or_else(|| st(t, "amount").filter(|m| m.get("unit").is_some_and(Value::is_string)).cloned());
    let base = |t: &&Value| {
        type_of(t) == "transfer" && st(t, "status").is_none() && list(rf(t, "for")) == [hh.as_str()] && crate::identity::counts_in(t, &index) && sees_in(t, &hh, &index)
    };
    let pay_ins_all: Vec<&Value> = index
        .values()
        .filter(base)
        .filter(|t| money_of(t).is_some() && list(rf(t, "to_owner")) == [holder.as_str()] && super::things::accepted_by_receiver(t, &index, &|_| true))
        .collect();
    // the pot is in one measure: the backing's, else the lowest pay-in's (named only to name one); nothing is converted
    let measure: Option<Measure> = backing.and_then(Measure::of).or_else(|| {
        let mut ins: Vec<&&Value> = pay_ins_all.iter().collect();
        ins.sort_by(|a, b| cmp16(hash_of(a), hash_of(b)));
        ins.first().and_then(|t| money_of(t)).and_then(|m| Measure::of(&m))
    }).or_else(|| {
        if !no_limit {
            return None;
        }
        let mut outs: Vec<&Value> = index.values().filter(base).filter(|t| money_of(t).is_some() && list(rf(t, "to_owner")) != [holder.as_str()]).collect();
        outs.sort_by(|a, b| cmp16(hash_of(a), hash_of(b)));
        outs.first().and_then(|t| money_of(t)).and_then(|m| Measure::of(&m))
    });
    let Some(measure) = measure else {
        return json!({ "holder": holder, "currency": null, "unit": null, "backing": 0, "paid_in": 0, "paid_out": 0, "left": 0, "pay_in": pay_in, "held_back": 0, "cap": if no_limit { json!("all") } else { Value::Null }, "payouts": [] });
    };
    let in_measure = |t: &Value| measure.qty(t);
    let back = backing.filter(|b| Measure::of(b).as_ref() == Some(&measure)).map_or_else(Dec::zero, |b| match &measure {
        Measure::Money(_) => minor(b.get("minor")),
        Measure::Count(_) => Dec::of(b.get("value")).unwrap_or_else(Dec::zero),
    });
    let ins: Vec<(&Value, Dec)> = pay_ins_all.iter().filter_map(|t| in_measure(t).map(|d| (*t, d))).collect();
    let paid_in = ins.iter().fold(Dec::zero(), |s, (_, d)| s.add(d));
    // what the pot held where a block stands: the backing, and the pay-ins (with their accepts) in its causal past
    let held_at = |past: &[String]| {
        let seen = |h: &str| past.iter().any(|p| p == h);
        if !spent {
            return back.clone();
        }
        ins.iter()
            .filter(|(t, _)| seen(hash_of(t)) && super::things::accepted_by_receiver(t, &index, &|h| seen(h)))
            .fold(back.clone(), |s, (_, d)| s.add(d))
    };
    let confirmers: Vec<String> = rs(head, "schema")
        .and_then(|s| index.get(s))
        .and_then(|s| st(s, "grounds"))
        .map(|g| list(g.get("confirmers")).iter().map(|x| x.to_string()).collect())
        .unwrap_or_default();
    // the payouts: the holder's own conditioned transfers, accepted by the one they go to
    let mut payouts: Vec<Payout> = Vec::new();
    let mut cond_fails: Vec<String> = Vec::new();
    // A vouch to whoever holds a lot (promises.md, Bearer): when the head's receiver is a thing, a payout counts as the claim of the
    // thing's owner where the payout stands (the ownership fold of its causal past); a payout to anyone else is shown and counts for nothing.
    let lot = rs(head, "to").filter(|h| index.get(*h).is_some_and(|t| type_of(t) == "thing"));
    let mut holder_fails: Vec<String> = Vec::new();
    for t in index.values().filter(base) {
        let Some(amount) = in_measure(t) else { continue };
        let to = list(rf(t, "to_owner"));
        if amount.cmp(&Dec::zero()) != Ordering::Greater || to.len() != 1 || to[0] == holder || speaker_of(t, &index, None).as_deref() != Some(holder.as_str()) {
            continue;
        }
        if !super::things::accepted_by_receiver(t, &index, &|_| true) {
            continue;
        }
        let ok = st(t, "condition").is_none_or(|c| super::things::condition_holds_in(t, c, &index, &|_| true, now) && !super::things::let_go(t, c, &index, &|_| true));
        if !ok {
            continue;
        }
        let named = confirmers.is_empty() || st(t, "condition").and_then(signal_by).is_some_and(|by| !by.is_empty() && by.iter().all(|b| confirmers.contains(b)));
        if !named {
            cond_fails.push(hash_of(t).to_string());
        }
        // the claimant owns the lot, or a thing made from it that the payout sees, where the payout stands
        let claims = |l: &str| {
            let past = index.past_of(t);
            made_from(l, &index).iter().any(|x| (x == l || past.contains(x.as_str())) && super::things::owner_seen_by(x, t, &index).as_deref() == Some(to[0]))
        };
        if lot.is_some_and(|l| !claims(l)) {
            holder_fails.push(hash_of(t).to_string());
        }
        payouts.push(Payout { hash: hash_of(t).to_string(), to: to[0].to_string(), amount, past: index.past_of(t).hashes() });
    }
    payouts.sort_by(|a, b| a.past.len().cmp(&b.past.len()).then_with(|| cmp16(&a.hash, &b.hash)));
    // a payout fits alone when the pot as it sees it holds its money; it counts when it also fits beside every payout it does not see
    let fits_alone: Vec<bool> = payouts.iter().map(|p| p.amount.cmp(&held_at(&p.past)) != Ordering::Greater).collect();
    let mut counts: Vec<bool> = vec![false; payouts.len()];
    let mut why: Vec<Option<&str>> = vec![None; payouts.len()];
    for i in 0..payouts.len() {
        let p = &payouts[i];
        if cond_fails.contains(&p.hash) {
            why[i] = Some("not_confirmed");
            continue;
        }
        if holder_fails.contains(&p.hash) {
            why[i] = Some("not_holder");
            continue;
        }
        if no_limit {
            counts[i] = true;
            continue;
        }
        let used = payouts.iter().enumerate().filter(|(j, q)| *j != i && counts[*j] && p.past.iter().any(|h| *h == q.hash)).fold(Dec::zero(), |s, (_, q)| s.add(&q.amount));
        let room = held_at(&p.past).sub(&used);
        if p.amount.cmp(&room) == Ordering::Greater {
            why[i] = Some("past_the_pot");
            continue;
        }
        let unseen = payouts
            .iter()
            .enumerate()
            .filter(|(j, q)| *j != i && fits_alone[*j] && !cond_fails.contains(&q.hash) && !holder_fails.contains(&q.hash) && !p.past.iter().any(|h| *h == q.hash) && !q.past.iter().any(|h| *h == p.hash))
            .fold(Dec::zero(), |s, (_, q)| s.add(&q.amount));
        if p.amount.add(&unseen).cmp(&room) == Ordering::Greater {
            why[i] = Some("unseen_together");
            continue;
        }
        counts[i] = true;
    }
    let paid_out = payouts.iter().zip(&counts).filter(|(_, c)| **c).fold(Dec::zero(), |s, (p, _)| s.add(&p.amount));
    let mut left = back.add(&if spent { paid_in.clone() } else { Dec::zero() }).sub(&paid_out);
    if left.cmp(&Dec::zero()) != Ordering::Greater {
        left = Dec::zero();
    }
    let mut rows: Vec<Value> = payouts
        .iter()
        .zip(counts.iter().zip(&why))
        .map(|(p, (c, w))| {
            let mut row = json!({ "block": p.hash, "to": p.to, "counts": c, "why": w });
            row.as_object_mut().map(|o| o.extend(measure.row(&p.amount).as_object().cloned().unwrap_or_default()));
            row
        })
        .collect();
    rows.sort_by(|a, b| cmp16(a["block"].as_str().unwrap_or(""), b["block"].as_str().unwrap_or("")));
    let (currency, unit) = match &measure {
        Measure::Money(c) => (c.clone(), Value::Null),
        Measure::Count(u) => (Value::Null, u.clone()),
    };
    json!({
        "holder": holder, "currency": currency, "unit": unit, "backing": if no_limit { Value::Null } else { measure.out(&back) }, "paid_in": measure.out(&paid_in),
        "paid_out": measure.out(&paid_out), "left": if no_limit { Value::Null } else { measure.out(&left) }, "cap": if no_limit { json!("all") } else { Value::Null }, "pay_in": pay_in, "held_back": measure.out(&if pay_held { paid_in.clone() } else { Dec::zero() }), "payouts": rows
    })
}
