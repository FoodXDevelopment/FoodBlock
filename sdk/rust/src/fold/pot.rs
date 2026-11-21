//! A pot (folds.md, A pot): what a promise's holder put behind it and what has been paid from it. One measure (What is left), whose owner
//! is the holder, whom the head (a first promise) speaks for: `terms.backing`, her own word, plus the pay-ins she accepted. A payout is a
//! draw on it, read along her line by the one rule: it holds from where it is signed, conditioned or not, lands on the receiver's yes and
//! its condition, and one that does not fit takes nothing. One reading serves a vouch and a mutual pool.
use super::draws::{answers, draws_on, Draw, In, Start, To};
use super::speaker_of;
use crate::decimal::{Amount, Dec, Kind};
use crate::js::{hash_of, list, rf, rs, st, type_of};
use crate::order::sees_in;
use crate::prelude::*;

/// The ids a condition's signal names, looking through a `within` or `without` wrapper; None when the condition is no signal.
fn signal_by(cond: &Value) -> Option<Vec<String>> {
    if let Some(by) = cond.get("signal").and(cond.get("by")).and_then(Value::as_array) {
        return Some(by.iter().filter_map(|x| x.as_str().map(String::from)).collect());
    }
    cond.get("within").or_else(|| cond.get("without")).and_then(signal_by)
}

/// A pot read at the reader's clock `now` (a payout's condition may read the clock; "" reads none that does). Null when the block is no
/// first promise that speaks for anyone, or is not read; `{ not_shown: true, lacks }` where the holder's line is not read whole; else
/// `{ holder, kind, backing, paid_in, held, paid_out, left, cap, payouts }`: `kind` `{ unit, of }`, the backing's, with none the one kind
/// every accepted pay-in shares, else null (and no payout takes: `unit`); `backing`, `paid_in`, `held`, `paid_out` and `left` sums;
/// `payouts` the draw list, its `why` also `not_confirmed` or `not_holder`.
pub fn pot(head: &Value, blocks: &[Value], now: &str) -> Value {
    if type_of(head) != "promise" || !list(rf(head, "answers")).is_empty() {
        return Value::Null;
    }
    let index = super::read_all(core::iter::once(head).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()));
    // a fold reads only what is valid and read (folds.md): a head held as its header, or not held, is no pot
    let Some(head) = index.get(hash_of(head)).filter(|b| b.get("type").is_some()) else { return Value::Null };
    let hh = hash_of(head).to_string();
    let Some(holder) = speaker_of(head, &index, None) else { return Value::Null };
    let backing = st(head, "terms").and_then(|t| t.get("backing")).and_then(|b| Amount::of(Some(b)));
    // a cap written out as `all` (the schema's term `cap`): all the holder owns on the day a claim is read, the referee fixing the sum. The
    // fold shows "no limit" (`cap: "all"`, `backing` and `left` null) and a payout is never past the pot (profiles/vouches.md)
    let no_limit = backing.is_none() && st(head, "terms").and_then(|t| t.get("cap")).and_then(Value::as_str) == Some("all");
    let for_head = |t: &&Value| type_of(t) == "transfer" && st(t, "status").is_none() && list(rf(t, "for")) == [hh.as_str()] && sees_in(t, &hh, &index);
    let names = index.names_memo();
    let transfers: Vec<&Value> = names.by_for.get(&hh).into_iter().flatten().filter_map(|h| index.get(h)).filter(for_head).collect();
    // the pay-ins: transfers `for` the head `to_owner` the holder, counted once the holder accepted them (The other side)
    let pay_ins: Vec<(&Value, Amount)> = transfers
        .iter()
        .filter(|t| crate::identity::counts_in(t, &index) && list(rf(t, "to_owner")) == [holder.as_str()] && rf(t, "what").is_none())
        .filter(|t| super::things::accepted_by_receiver(t, &index, &|_| true))
        .filter_map(|t| Amount::of(st(t, "amount")).map(|a| (*t, a)))
        .collect();
    // the pot's kind: the backing's; with none, the one kind every accepted pay-in shares; with a cap of all and neither, the one kind its
    // payouts share; else none, and it pays nothing out
    let one_kind = |kinds: Vec<Kind>| -> Option<Kind> {
        let first = kinds.first()?.clone();
        kinds.iter().all(|k| *k == first).then_some(first)
    };
    let payout_kinds = || transfers.iter().filter(|t| list(rf(t, "to_owner")) != [holder.as_str()]).filter_map(|t| Amount::of(st(t, "amount")).map(|a| a.kind)).collect::<Vec<_>>();
    let kind: Option<Kind> = match &backing {
        Some(b) => Some(b.kind.clone()),
        None if !pay_ins.is_empty() => one_kind(pay_ins.iter().map(|(_, a)| a.kind.clone()).collect()),
        None if no_limit => one_kind(payout_kinds()),
        None => None,
    };
    let confirmers: Vec<String> = rs(head, "schema")
        .and_then(|s| index.get(s))
        .and_then(|s| st(s, "grounds"))
        .map(|g| list(g.get("confirmers")).iter().map(|x| x.to_string()).collect())
        .unwrap_or_default();
    // a vouch to whoever holds a lot (promises.md, Bearer): a payout counts only to the owner, where it stands, of that thing or of a thing
    // made from it that the payout has in its causal past (`made_from`)
    let lot = rs(head, "to").filter(|h| index.get(*h).is_some_and(|t| type_of(t) == "thing"));
    let made: Vec<String> = lot.map(|l| core::iter::once(l.to_string()).chain(super::things::made_from_in(l, &index).iter().filter_map(|r| r["thing"].as_str().map(String::from))).collect()).unwrap_or_default();
    // the payouts: the holder's transfers `for` the head to a named receiver
    let mut draws: Vec<Draw> = Vec::new();
    for t in transfers.iter().copied() {
        let to = list(rf(t, "to_owner"));
        let binds = crate::identity::counts_in(t, &index) || crate::identity::fork_burden(t, &index);
        // a payout is the holder's word (folds.md, A pot): a transfer `for` the head that does not speak for her is no payout of the pot
        if !binds || to.len() != 1 || to[0] == holder || rf(t, "what").is_some() || speaker_of(t, &index, None).as_deref() != Some(holder.as_str()) {
            continue;
        }
        let Some(amount) = Amount::of(st(t, "amount")).filter(|a| !a.value.is_zero()) else { continue };
        let fixed = if !confirmers.is_empty() && !st(t, "condition").and_then(signal_by).is_some_and(|by| !by.is_empty() && by.iter().all(|b| confirmers.contains(b))) {
            Some("not_confirmed")
        } else if lot.is_some() && !made.iter().any(|x| (Some(x.as_str()) == lot || index.past_of(t).contains(x)) && super::things::owner_seen_by(x, t, &index).as_deref() == Some(to[0])) {
            Some("not_holder")
        } else {
            None
        };
        let (yes, no, ends) = answers(t, to[0], &index);
        let condition = st(t, "condition").map(|c| super::things::condition_holds_in(t, c, &index, &|_| true, now) && !super::things::let_go(t, c, &index, &|_| true));
        draws.push(Draw { block: t, by: speaker_of(t, &index, None), to: To::Owner(to[0].to_string()), amount: Some(amount), yes, no, ends, dead: st(t, "condition").and_then(|c| super::things::condition_dead_in(t, c, &index, &|_| true)), condition, fixed, stays: false, offer: None });
    }
    // what the holder has besides her backing where a payout stands: the pay-ins of the pot's kind she accepted in its causal past
    let paid_in_seen = |payout: &Value, _: &str| -> Dec {
        let past = index.past_of(payout);
        pay_ins
            .iter()
            .filter(|(t, a)| kind.as_ref() == Some(&a.kind) && past.contains(hash_of(t)) && super::things::accepted_by_receiver(t, &index, &|h| past.contains(h)))
            .fold(Dec::zero(), |s, (_, a)| s.add(&a.value))
    };
    // a cap of all: the holder's word reaches all she owns, and a payout is never past the pot
    let unlimited = Dec::parse(&format!("1{}", "0".repeat(crate::spec().decimal_digits.saturating_sub(1)))).unwrap_or_else(Dec::zero);
    let start = Start {
        owner: holder.clone(),
        amount: Some(if no_limit { unlimited } else { backing.as_ref().map_or_else(Dec::zero, |b| b.value.clone()) }),
        at: Some(hh.clone()),
        seen: hh.clone(),
    };
    // with no kind the pot pays nothing out: every payout is of another kind (`unit`)
    let drawn = draws_on(kind.as_ref().map_or(In::NoKind, In::Kind), vec![start], draws, &paid_in_seen, &index);
    if let Some(not) = drawn.not_shown() {
        return not;
    }
    // 1.9 3b-7: a block held and not read that could name the pot hides it: the answer is not shown
    let hides = super::draws::hidden(&hh, &drawn.starts, &index, &|_| true);
    if !hides.is_empty() {
        return json!({ "not_shown": true, "lacks": hides });
    }
    // every sum is an amount of the pot's kind; a pot with no kind has no sum (null)
    let text = |d: Dec| kind.as_ref().map_or(Value::Null, |k| k.amount(&d));
    let paid_in = pay_ins.iter().filter(|(_, a)| kind.as_ref() == Some(&a.kind)).fold(Dec::zero(), |s, (_, a)| s.add(&a.value));
    let (held, _) = drawn.sum("held", None);
    let (paid_out, _) = drawn.sum("landed", None);
    let back = backing.as_ref().map_or_else(Dec::zero, |b| b.value.clone());
    let left = back.add(&paid_in).sub(&held).sub(&paid_out);
    json!({
        "holder": holder, "kind": kind.as_ref().map(Kind::json),
        "backing": if no_limit { Value::Null } else { text(back) }, "paid_in": text(paid_in), "held": text(held), "paid_out": text(paid_out),
        "left": if no_limit { Value::Null } else { text(left) }, "cap": if no_limit { json!("all") } else { Value::Null },
        "payouts": drawn.rows_json(kind.as_ref()),
    })
}
