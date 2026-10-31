//! A transfer's own rules (things.md, Transfers): what moved, to whom, and a payment's split.
use super::{f, Checker, W};
use crate::decimal::Dec;
use crate::js::{int, is_obj, keys_within, list};
use crate::prelude::*;
use core::cmp::Ordering;

impl Checker<'_> {
    pub(super) fn transfer(&self, state: &Value, refs: &Value, answering: bool) -> W {
        let g = |k: &str| state.get(k);
        let r = |k: &str| refs.get(k);
        let mut w: W = vec![];
        if !answering {
            // Money moves by transfer too, naming no thing (things.md): a payment is `to_owner`, `for` and `money`.
            if r("what").is_none() && g("money").is_none() {
                w.push(f("required", "a transfer names what moved: refs.what (a payment of state.money names none)"));
            }
            if !(r("to_owner").is_some() || r("to_holder").is_some() || r("to_place").is_some() || g("count").is_some())
            {
                w.push(f("required", "a transfer says what changed (refs.to_owner, to_holder, to_place), or how many received (state.count)"));
            }
        }
        w.extend(self.status_shape(state, refs));
        w.extend(self.whole_shape(g("count"), "state.count", 1.0));
        // What a payment covers is the word of the side it is paid to (promises.md, Settling): money or an amount, on that side's accepted answer.
        if let Some(c) = g("covers") {
            // money, or an amount where the price is in goods
            w.extend(if c.get("unit").is_some() { self.amount_shape(Some(c), "state.covers") } else { self.money_shape(Some(c), "state.covers") });
            if r("answers").is_none() || g("status").and_then(Value::as_str) != Some("accepted") {
                w.push(f("shape", "state.covers goes only on an accepted answer to a payment"));
            }
        }
        // A payment names the occurrence of a standing promise it pays (promises.md, Settling; decision E4): its start time, or the hash
        // of the block that started it, as a stop names occurrences.
        if let Some(o) = g("occurrence") {
            if !(crate::time::is_time(Some(o)) || self.is("hash", Some(o))) || g("money").is_none() {
                w.push(f("shape", "state.occurrence goes on a payment: the start time of the occurrence it pays, or the hash of the block that started it"));
            }
        }
        // Whoever lets a thing go may name a clock for its takers (things.md, Transfers): `keepers` goes on an open hand-over, never on one to a named receiver.
        if let Some(k) = g("keepers") {
            if r("to_owner").is_some() || crate::tasks::keepers_of(k).is_none() {
                w.push(f("shape", "state.keepers goes on an open hand-over (no refs.to_owner) and is { names (ids or circle#role), needed }: the clock its takers are read on"));
            }
        }
        // A payment `for` several promises says how much goes to each (things.md, Transfers): one payment never pays two
        // promises in full.
        if !answering && g("money").is_some() && g("split").is_none() && hashes_text(r("for")).len() > 1 {
            w.push(f("required", "a payment for several promises says how much goes to each (state.split)"));
        }
        // The parts are the payment's own money: in its currency, adding up to no more than it.
        if let (Some(Value::Array(parts)), Some(money)) = (g("split"), g("money").filter(|m| self.shape_of(m) == Some("money") && int(m.get("minor")).is_some())) {
            let monies: Vec<&Value> = parts.iter().filter_map(|p| p.get("money").filter(|m| self.shape_of(m) == Some("money") && int(m.get("minor")).is_some())).collect();
            if monies.len() == parts.len() {
                let currency = |m: &Value| m.get("currency").map(crate::canonical::canonical_json);
                if monies.iter().any(|m| currency(m) != currency(money)) {
                    w.push(f("shape", "every part of state.split is in the payment's own currency"));
                } else {
                    let sum = monies.iter().fold(Dec::zero(), |t, m| t.add(&Dec::of(m.get("minor")).unwrap_or_else(Dec::zero)));
                    if Dec::of(money.get("minor")).is_some_and(|whole| sum.cmp(&whole) == Ordering::Greater) {
                        w.push(f("shape", "state.split adds up to no more than state.money"));
                    }
                }
            }
        }
        if let Some(split) = g("split") {
            match split.as_array().filter(|a| !a.is_empty()) {
                None => w.push(f("shape", "state.split lists { for, line, money }")),
                Some(parts) => {
                    let fors = hashes_text(r("for"));
                    let shape = self.list("shapes.split");
                    for (i, part) in parts.iter().enumerate() {
                        let ok = is_obj(Some(part))
                            && keys_within(part, &shape)
                            && part.get("for").is_some_and(|f| {
                                fors.iter().any(|x| Some(*x) == f.as_str())
                            });
                        if !ok {
                            w.push(f(
                                "shape",
                                format!("state.split[{i}].for is one of what it is for (refs.for)"),
                            ));
                        }
                        if part.get("money").is_none_or(|m| self.shape_of(m) != Some("money")) {
                            w.push(f("shape", format!("state.split[{i}].money is the money that part is (money: {{ minor, currency }})")));
                        }
                        if !part.get("line").is_none_or(Value::is_string) {
                            w.push(f("shape", format!("state.split[{i}].line is a line id")));
                        }
                        if part.get("occurrence").is_some_and(|o| !(crate::time::is_time(Some(o)) || self.is("hash", Some(o)))) {
                            w.push(f("shape", format!("state.split[{i}].occurrence is the start time of the occurrence it pays, or the hash of the block that started it")));
                        }
                    }
                }
            }
        }
        w
    }
}

// The ids a ref names (one, or a set): its text.
fn hashes_text(value: Option<&Value>) -> Vec<&str> {
    list(value)
}
