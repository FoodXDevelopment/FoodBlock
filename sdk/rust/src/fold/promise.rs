//! A promise's stage (folds.md, stages 1 to 4): the deal read from its first promise and every block in it.
use super::deal::{status, Binding, Deal};
use super::settle::Settling;
use super::read_all;
use crate::decimal::Dec;
use crate::js::{get, hash_of, index_of, lines_of, list, quantity_of, rf, rs, same_str, ss, st, str_of, type_of};
use crate::order::{earliest, named};
use crate::prelude::*;
use core::cmp::Ordering;

// An amount's exact value in a unit (core.md section 3: a decimal is exact at any size, never a float).
pub(super) fn amount_dec(amount: Option<&Value>, unit: Option<&Value>) -> Option<Dec> {
    let a = amount?;
    if same_str(a.get("unit"), unit) {
        Some(Dec::of(a.get("value")).unwrap_or_else(Dec::zero))
    } else {
        None
    }
}

// An amount's exact value when it is in this unit and its value reads: the one unit match (a unit is text, matched exactly).
pub(super) fn value_in(amount: &Value, unit: Option<&Value>) -> Option<Dec> {
    same_str(amount.get("unit"), unit).then(|| Dec::of(amount.get("value"))).flatten()
}

// The kind an amount is of (encoding.md, Shapes), as the fold compares it: `{ unit, of }` (`of` null when it has none). Two amounts are of
// one kind when both are the same; nothing is ever converted from one kind to another.
pub(super) fn kind_of(amount: &Value) -> Option<Value> {
    crate::decimal::Amount::of(Some(amount)).map(|a| a.kind.json())
}
// A sum of a kind as a fold prints it: an amount, its value in the one printed form.
pub(super) fn kind_json(d: &Dec, kind: &Value) -> Value {
    let k = crate::decimal::Kind { unit: kind.get("unit").and_then(Value::as_str).unwrap_or("").to_string(), of: kind.get("of").and_then(Value::as_str).map(String::from) };
    k.amount(d)
}
// An amount as an exact value in its kind; None for anything else.
pub(super) fn measure(m: &Value) -> Option<(Dec, Value)> {
    crate::decimal::Amount::of(Some(m)).map(|a| (a.value, a.kind.json()))
}

// The total a price comes to for a quantity (promises.md, Terms): a flat amount; or an amount per unit, its value times the quantity over
// `per`'s value, exact; None when nothing is priced, the quantity is not in `per`'s unit, `per` is zero, or the quotient is no decimal.
/// `step`: under a price, the least payable amount its signers take, in the price's unit: the total is the least whole number of
/// steps at or above the exact figure. With no `step` (or one in another unit, which takes nothing), the total is exact.
/// A `step` whose unit is not the total's is read as no step (the text does not say; read so).
pub(super) fn stepped(total: Option<(Dec, Value)>, step: Option<&Value>) -> Option<(Dec, Value)> {
    let (t, kind) = total?;
    match step.and_then(measure) {
        Some((s, sk)) if sk.get("unit") == kind.get("unit") => Some((t.up_to_step(&s).unwrap_or(t), kind)),
        _ => Some((t, kind)),
    }
}

pub(super) fn total_of(price: Option<&Value>, quantity: Option<&Value>) -> Option<(Dec, Value)> {
    let price = price?;
    if price.get("per").is_none() {
        return measure(price);
    }
    let quantity = quantity?;
    if !same_str(quantity.get("unit"), get(price, "per.unit")) {
        return None;
    }
    let q = Dec::of(quantity.get("value"))?;
    let p = Dec::of(get(price, "per.value"))?;
    let (each, kind) = measure(price.get("amount")?)?;
    Some((each.mul(&q).div(&p)?, kind))
}

/// What a promise's terms come to (folds.md, A promise's stage): each priced line at its flat amount, or its amount per unit times its quantity chosen
/// over `per`, exact. `chosen` is what an answer chooses (`[{ id, quantity }]`), else the lines' own quantities. An amount, or null when a
/// price has no total, nothing is priced, or lines are priced in two kinds (they are never added).
pub fn terms_total(terms: &Value, chosen: Option<&Value>) -> Value {
    let priced: Vec<Option<(Dec, Value)>> =
        lines_of(terms).into_iter().filter(|l| l.get("price").is_some_and(Value::is_object)).map(|l| total_of(l.get("price"), quantity_of(l, chosen))).collect();
    if priced.is_empty() || priced.iter().any(Option::is_none) {
        return Value::Null;
    }
    let priced: Vec<(Dec, Value)> = priced.into_iter().flatten().collect();
    let own = priced[0].1.clone();
    if priced.iter().any(|p| p.1 != own) {
        return Value::Null;
    }
    let sum = priced.iter().fold(Dec::zero(), |t, p| t.add(&p.0));
    match stepped(Some((sum, own)), terms.get("step")) {
        Some((sum, own)) => kind_json(&sum, &own),
        None => Value::Null,
    }
}

/// Options for a promise's stage. A stage is a function of the blocks alone: whose confirms count is the deal's schema's to say (its
/// grounds), never the caller's, and the fold reads no clock (folds.md). A backup judge's turn is read from signed times alone
/// (promises.md, Disputes: the first judge's own receipt of the dispute, and the backup's own date on its word).
#[derive(Default, Clone)]
pub struct StageOptions {}

/// A promise's stage, from its first promise and every block in its deal: offered, asked, declined, stopped,
/// accepted, underway, done or reversed. Returns `{ stage, offer, live, accept, sides, quantity, total, paid,
/// lines, takers, stopped, forks }` (and `stop`, `from`, `by` when stopped).
pub fn promise_stage(first_block: &Value, blocks: &[Value], options: &StageOptions) -> Value {
    let mut out = promise_stage_read(first_block, blocks, options);
    if let Value::Object(m) = &mut out {
        m.shift_remove("paid_up");
    }
    out
}
/// The same, with `paid_up` beside it: whether the price is paid in full, compared exactly (the view reads it).
pub(crate) fn promise_stage_read(first_block: &Value, blocks: &[Value], options: &StageOptions) -> Value {
    let index = read_all(
        core::iter::once(first_block).chain(index_of(blocks).values().collect::<Vec<_>>()),
    );
    promise_stage_in(hash_of(first_block), &index, options)
}

/// The stage of the promise given under `first_hash`, in blocks already read for a fold (`read_all`): many deals of one store are read
/// against one reading of it (the MCP door's find: security I, agents/t4).
pub(crate) fn promise_stage_in(first_hash: &str, index: &crate::js::Index, options: &StageOptions) -> Value {
    promise_stage_at(first_hash, index, options, &[])
}

// Whether a stage says its deal binds: accepted or further along (underway, done, reversed), or stopped onward (it bound,
// then a side stopped it). Offered, asked, declined, stopped before, or no stage: it binds nothing.
pub(crate) fn binds(stage: &Value) -> bool {
    match stage.get("stage").and_then(Value::as_str) {
        Some("accepted" | "underway" | "done" | "reversed") => true,
        Some("stopped") => stage.get("stop").and_then(Value::as_str) == Some("onward"),
        _ => false,
    }
}

// An accept consents to the terms of the offer it answers (invariant 15): where the offer's quantity is a range, the accept
// names a quantity in the range's unit, within it; otherwise it names none, or the same (promises.md, Who may bind).
pub(super) fn fits(accept: &Value, offer: &Value) -> bool {
    let offered = lines_of(get(offer, "state.terms").unwrap_or(&Value::Null));
    let chosen: Vec<&Value> = get(accept, "state.terms.lines").and_then(Value::as_array).map(|a| a.iter().collect()).unwrap_or_default();
    // an accept names no line the offer does not state
    if chosen.iter().any(|c| !offered.iter().any(|l| l.get("id").is_some() && l.get("id") == c.get("id"))) {
        return false;
    }
    let same = |x: &Value, y: &Value| value_in(x, y.get("unit")).zip(Dec::of(y.get("value"))).is_some_and(|(p, q)| p.cmp(&q) == Ordering::Equal);
    offered.into_iter().all(|line| {
        let a = chosen.iter().find(|c| c.get("id") == line.get("id")).and_then(|c| c.get("quantity"));
        match line.get("quantity") {
            // a line with no quantity is accepted with none: an accept never adds a quantity the offer did not have
            None => a.is_none(),
            Some(q) if q.get("min").is_some() || q.get("max").is_some() => {
                let unit = q.get("min").or(q.get("max")).and_then(|e| e.get("unit"));
                let Some(v) = a.and_then(|a| value_in(a, unit)) else { return false };
                let bound = |k: &str, wrong: Ordering| q.get(k).is_none_or(|e| value_in(e, unit).is_some_and(|x| x.cmp(&v) != wrong));
                bound("min", Ordering::Greater) && bound("max", Ordering::Less)
            }
            Some(q) => a.is_none_or(|a| same(a, q)),
        }
    })
}

// An open offer's lines are what its allocations that take bind together on each, and its total what the price comes to for that
// (folds.md, What each fold returns): a line's `needed` is the sum, in the line's unit, of what those allocations draw on it.
fn open_totals(first: &Value, takers: &[Value], freed: &[String], index: &crate::js::Index) -> (Vec<Value>, Option<Value>) {
    let takes = |t: &&Value| !freed.iter().any(|f| f.as_str() == str_of(t.get("allocation"))) && t.get("over_allocated").and_then(Value::as_bool) != Some(true);
    let live: Vec<&Value> = takers.iter().filter(takes).collect();
    let counter_of = |t: &Value| t.get("request").and_then(Value::as_str).and_then(|h| index.get(h)).filter(|r| st(r, "status").is_none());
    let drawn = |t: &Value, id: Option<&Value>| t.get("lines").and_then(Value::as_array).and_then(|l| l.iter().find(|x| x.get("id") == id)).and_then(|x| x.get("quantity")).filter(|q| q.get("value").is_some()).cloned();
    let offer_lines = lines_of(get(first, "state.terms").unwrap_or(&Value::Null));
    let sum_of = |ts: &[&Value], line: &Value| -> Option<Value> {
        let unit = line.get("quantity").and_then(|q| q.get("unit").or_else(|| q.get("max").and_then(|m| m.get("unit"))).or_else(|| q.get("min").and_then(|m| m.get("unit"))));
        let values: Vec<String> = ts.iter().filter_map(|t| drawn(t, line.get("id"))).filter(|q| q.get("unit") == unit).filter_map(|q| q.get("value").and_then(Value::as_str).map(String::from)).collect();
        if values.is_empty() { None } else { crate::decimal::sum(&values.iter().map(String::as_str).collect::<Vec<_>>()).map(|v| json!({ "value": v, "unit": unit })) }
    };
    let bound: Vec<Value> = offer_lines.iter().map(|line| json!({ "id": line.get("id"), "needed": sum_of(&live, line), "moved": null })).collect();
    // Its total is what its price comes to for that. A counter its offerer accepted binds at the counter's own price: then the total is the
    // price of what the requests bind, plus each counter's own total, of one kind (several kinds, or a price with no total: null).
    let mut parts: Vec<Option<(Dec, Value)>> = Vec::new();
    let mine: Vec<&Value> = live.iter().copied().filter(|t| counter_of(t).is_none()).collect();
    if !mine.is_empty() {
        for line in offer_lines.iter().filter(|l| l.get("price").is_some()) {
            parts.push(total_of(line.get("price"), sum_of(&mine, line).as_ref()));
        }
    }
    for t in live.iter().filter(|t| counter_of(t).is_some()) {
        let c = counter_of(t).and_then(|c| get(c, "state.terms"));
        for line in c.map(lines_of).unwrap_or_default().into_iter().filter(|l| l.get("price").is_some()) {
            parts.push(total_of(line.get("price"), drawn(t, line.get("id")).as_ref()));
        }
    }
    let parts: Option<Vec<(Dec, Value)>> = parts.into_iter().collect();
    let total = parts.filter(|p| !p.is_empty() && p.iter().all(|x| x.1 == p[0].1)).map(|p| {
        let c = p[0].1.clone();
        kind_json(&p.iter().fold(Dec::zero(), |t, x| t.add(&x.0)), &c)
    });
    (bound, total)
}

// A side's defeats of the deal's head (its first promise, its root, or the offer the binding accept answers), or of a block in the deal
// that speaks for the other side (a delivery, a payment, work), changes nothing: it is shown as disputed, by that side, on the date it
// gives (promises.md, Disputes). A side's defeats of its own block is no dispute.
pub(super) fn disputes_shown(index: &crate::js::Index, in_deal: &[Value], heads: &[&str], side_of: &dyn Fn(&Value) -> Option<&'static str>) -> Vec<Value> {
    let mut shown: Vec<(String, String, Value)> = Vec::new();
    for o in index.values().filter(|o| crate::forks::counts_in(o, index)) {
        let Some(by) = side_of(o) else { continue };
        for target in list(rf(o, "defeats")) {
            let Some(t) = index.get(target) else { continue };
            let other = in_deal.iter().any(|b| hash_of(b) == target) && side_of(t).is_some_and(|s| s != by);
            if heads.contains(&target) || other {
                shown.push((hash_of(o).to_string(), target.to_string(), json!({ "hash": hash_of(o), "of": target, "by": by, "at": ss(o, "at") })));
            }
        }
    }
    shown.sort_by(|a, b| crate::js::cmp16(&a.0, &b.0).then_with(|| crate::js::cmp16(&a.1, &b.1)));
    shown.into_iter().map(|(_, _, v)| v).collect()
}

// The stage, read while the deals in `visiting` are being read (a deal conditioned on another): a condition that leads
// back to a deal being read holds for nothing, so no reading loops.
pub(super) fn promise_stage_at(first_hash: &str, index: &crate::js::Index, options: &StageOptions, visiting: &[String]) -> Value {
    let key = format!("{first_hash}|{}", visiting.join(","));
    index.stage_memo(&key, || {
        let Some(deal) = Deal::read(first_hash, index, options) else { return Value::Null };
        let bound = deal.bind(options, visiting, None);
        let out = deal.stage(&bound);
        // accepts that bind and do not see each other cross: each binds, the deal is read once under each (`per_accept`), and the
        // stage is the furthest of them (ties by the accept's hash)
        if bound.crossed.len() < 2 || out.get("not_shown").is_some() {
            return out;
        }
        let per: Vec<(&String, Value)> = bound.crossed.iter().map(|h| (h, deal.stage(&deal.bind(options, visiting, Some(h))))).collect();
        let best = per.iter().max_by(|x, y| stage_rank(&x.1).cmp(&stage_rank(&y.1)).then_with(|| crate::js::cmp16(y.0, x.0))).map(|x| x.1.clone()).unwrap_or(out);
        let mut out = best;
        let mut rows: Vec<(&String, Value)> = per.iter().map(|(h, st)| (*h, json!({ "accept": h, "stage": st["stage"], "paid": st["paid"], "uncovered": st["uncovered"], "lines": st["lines"] }))).collect();
        rows.sort_by(|x, y| crate::js::cmp16(x.0, y.0));
        out["crossed"] = json!(bound.crossed);
        out["forks"] = json!(bound.forks);
        out["requests"] = json!(bound.requests);
        out["per_accept"] = Value::Array(rows.into_iter().map(|x| x.1).collect());
        out
    })
}

// The order of stages, lowest first (folds.md, A promise's stage): offered or asked, declined, stopped before, accepted, underway, stopped
// onward, done, reversed.
fn stage_rank(st: &Value) -> u8 {
    match st.get("stage").and_then(Value::as_str) {
        Some("declined") => 1,
        Some("stopped") => if st.get("stop").and_then(Value::as_str) == Some("onward") { 5 } else { 2 },
        Some("accepted") => 3,
        Some("underway") => 4,
        Some("done") => 6,
        Some("reversed") => 7,
        _ => 0,
    }
}

impl Deal<'_> {
    // The deal's stage once its accept is known (stages 1 to 4): unbound, an open offer, or settled.
    fn stage(&self, b: &Binding) -> Value {
        let offer = self.offer_of(b);
        let stops: Vec<&Value> = self.in_deal.iter().filter(|x| type_of(x) == "promise" && status(x, "stopped") && (!self.open || self.by_offerer(x))).collect();
        // her plan has no stage: its later blocks are her own record
        if b.plan {
            let mut out = self.result(b, offer, "", json!({}));
            out["stage"] = Value::Null;
            return out;
        }
        let Some(accept_block) = b.accept else { return self.unbound(b, offer) };
        if self.open {
            return self.open_stage(b, offer, &stops);
        }
        Settling::new(self, b, offer, accept_block).settle(&stops)
    }
    // The offer the deal is read by: an allocation of a counter has the counter's own terms, whole (promises.md, Who may bind).
    fn offer_of<'s>(&'s self, b: &Binding<'s>) -> &'s Value {
        match b.accept {
            Some(_) if self.alloc.is_some() => self.alloc.as_ref().map(|(_, r, _)| r).filter(|r| st(r, "status").is_none()).unwrap_or(&self.root),
            Some(a) if !self.open => list(rf(a, "answers")).first().and_then(|h| self.index.get(*h)).unwrap_or(b.live[0]),
            _ => b.live[0],
        }
    }
    // Every name the spec gives (§11, What each fold returns): a field that does not apply is null, or an empty list.
    pub(super) fn result(&self, b: &Binding, offer: &Value, stage: &str, more: Value) -> Value {
        // The offer the binding accept answers; with none, the live offer when there is only one.
        let reported: Value = if b.accept.is_some() { json!(hash_of(offer)) } else if b.live.len() == 1 { json!(hash_of(b.live[0])) } else { Value::Null };
        let mut live_hashes: Vec<String> = b.live.iter().map(|o| hash_of(o).to_string()).collect();
        live_hashes.sort();
        let mut out = json!({
            "stage": stage, "stop": null, "from": null, "by": null, "offer": reported, "requests": b.requests, "live": live_hashes, "accept": b.accept.map(hash_of),
            "sides": { "from": self.from_ref, "to": self.to_ref }, "takers": b.takers, "forks": b.forks, "lines": [], "total": null,
            "paid": null, "stopped": [], "disputed": [], "due": null, "paid_at": null, "occurrences": [], "judge_ties": [],
            "uncovered": { "from": [], "to": null }, "unanswered": [], "over_allocated": false, "to_come": null, "to_come_on": [], "received_at": [], "moved": [], "price_fixed": null,
            "crossed": b.crossed, "per_accept": [], "waiting": self.waiting(), "bench": "none",
        });
        if let Value::Object(m) = more {
            for (k, v) in m {
                out[k] = v;
            }
        }
        out
    }
    // No binding accept: stopped before (the author withdrew every live offer and no accept binds over the stop), declined by the other
    // side, or still offered or asked. The fold reads no clock: expired is the view's (views.rs).
    fn unbound(&self, b: &Binding, offer: &Value) -> Value {
        // the bench the deal would have: its schema's, between the two sides its first promise names
        let sides: Vec<String> = [self.from_ref.clone(), self.to_ref.clone()].into_iter().flatten().collect();
        let judges = self.judges_for(&sides, &self.first_hash);
        let bench = super::bench::bench(rs(&self.root, "schema").and_then(|h| self.index.get(h)), sides, judges).json();
        let result = |stage: &str, mut more: Value| {
            more["bench"] = bench.clone();
            self.result(b, offer, stage, more)
        };
        let withdrawn = |o: &Value| {
            self.in_deal.iter().any(|s| type_of(s) == "promise" && status(s, "stopped") && ss(s, "stop") == Some("before") && (!self.open || self.by_offerer(s)) && crate::grant::ending(s, hash_of(o)).is_some())
        };
        if b.live.iter().all(|o| withdrawn(o)) {
            return result("stopped", json!({ "stop": "before" }));
        }
        if !self.open
            && b.live.iter().any(|one| {
                let so = self.side_of(one);
                self.answers_of(hash_of(one), Some("declined")).iter().any(|d| self.side_of(d).is_some() && self.side_of(d) != so)
            })
        {
            return result("declined", json!({}));
        }
        result(if self.offerer_is_from { "offered" } else { "asked" }, json!({}))
    }
    // `waiting`: each block of the deal that speaks for someone and does not yet stand, `{ block, on }` for each thing it waits
    // on (blocks.md, Finality), sorted by block then on.
    fn waiting(&self) -> Vec<Value> {
        let mut out: Vec<(String, &'static str)> = Vec::new();
        for b in &self.all {
            if rs(b, "author").is_none() || super::speaker_of(b, self.index, None).is_none() {
                continue;
            }
            for on in crate::finality::stands(b, self.index).waiting {
                if !out.iter().any(|(h, o)| h == hash_of(b) && *o == on) {
                    out.push((hash_of(b).to_string(), on));
                }
            }
        }
        out.sort_by(|x, y| crate::js::cmp16(&x.0, &y.0).then_with(|| crate::js::cmp16(x.1, y.1)));
        out.into_iter().map(|(h, on)| json!({ "block": h, "on": on })).collect()
    }
    // An open offer is settled by no one: each allocation is a deal of its own (promises.md, Who may bind). What is left to say of the offer
    // itself is that it binds, or that its offerer stopped it onward.
    fn open_stage(&self, b: &Binding, offer: &Value, stops: &[&Value]) -> Value {
        let (bound, total) = open_totals(&self.first, &b.takers, &b.freed, self.index);
        let over = b.takers.iter().any(|t| t.get("over_allocated").and_then(Value::as_bool) == Some(true));
        let more = json!({ "lines": bound, "total": total, "over_allocated": over });
        // Only a stop of the offer itself stops it: the offerer's stop of one allocation ends that allocation's deal alone.
        let onwards: Vec<&Value> = stops.iter().copied().filter(|x| ss(x, "stop") == Some("onward") && crate::grant::ending(x, &self.first_hash).is_some()).collect();
        if let Some(onward) = named(&earliest(&onwards, self.index)) {
            let mut stopped = more;
            stopped["stop"] = json!("onward");
            stopped["from"] = json!(hash_of(onward));
            stopped["by"] = json!(self.side_of(onward));
            return self.result(b, offer, "stopped", stopped);
        }
        self.result(b, offer, "accepted", more)
    }
}

/// `{ stopped: <first promise>, side }`: an onward stop that speaks for that side is among
/// the first onward stops of that deal and none that speaks for the other side is, among `blocks` (the past of the block it is read for). Two
/// that cross, one of each side, hold for neither (as `forfeit`).
pub(crate) fn stopped_onward_by(first: &Value, blocks: &[Value], side: &str) -> bool {
    let index = read_all(core::iter::once(first).chain(index_of(blocks).values().collect::<Vec<_>>()));
    let Some(deal) = Deal::read(hash_of(first), &index, &StageOptions::default()) else { return false };
    let stops: Vec<&Value> = deal.in_deal.iter().filter(|x| type_of(x) == "promise" && status(x, "stopped") && ss(x, "stop") == Some("onward") && deal.side_of(x).is_some() && crate::forks::counts_in(x, &index)).collect();
    let firsts = earliest(&stops, &index);
    firsts.iter().any(|x| deal.side_of(x) == Some(side)) && !firsts.iter().any(|x| deal.side_of(x).is_some_and(|s| s != side))
}
