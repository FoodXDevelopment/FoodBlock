//! A transfer's own rules (things.md, Transfers; core.md section 7): what moved, to whom, and a payment's split. A transfer names an
//! instance, or names none: one that names none moves an amount of a good the record does not hold, and names its owner (`to_owner`).
use super::{f, Checker, W};
use crate::decimal::Amount;
use crate::js::{is_obj, keys_within, list};
use crate::prelude::*;
use core::cmp::Ordering;

impl Checker<'_> {
    pub(super) fn transfer(&self, state: &Value, refs: &Value, held: Option<&crate::js::Index>, answering: bool) -> W {
        let g = |k: &str| state.get(k);
        let r = |k: &str| refs.get(k);
        let mut w: W = vec![];
        if !answering {
            if r("what").is_none() && g("amount").is_none() {
                w.push(f("required", "a transfer names what moved: refs.what, or state.amount (an amount of a good the record does not hold)"));
            }
            if !(r("to_owner").is_some() || r("to_holder").is_some() || r("to_place").is_some() || g("count").is_some())
            {
                w.push(f("required", "a transfer says what changed (refs.to_owner, to_holder, to_place), or how many received (state.count)"));
            }
            // an amount of a good the record does not hold moves only title: it names its owner
            if r("what").is_none() && g("amount").is_some() && r("to_owner").is_none() {
                w.push(f("required", "a transfer that names no instance names refs.to_owner: an amount moves only title"));
            }
        }
        // what is kept apart or placed is a thing, never an amount (things.md, Transfers)
        if g("amount").is_some() && (r("to_holder").is_some() || r("to_place").is_some()) {
            w.push(f("shape", "a transfer with state.amount names neither refs.to_holder nor refs.to_place: what is kept apart or placed is a thing"));
        }
        // beside refs.what an amount's kind is the instance's own (its refs.of)
        if r("what").is_some() && g("amount").is_some_and(|a| a.get("of").is_some()) {
            w.push(f("shape", "state.amount beside refs.what carries no of: its kind is the instance's own"));
        }
        w.extend(self.status_shape(state, refs));
        w.extend(self.whole_shape(g("count"), "state.count", 1.0));
        // What a payment covers is the word of the side it is paid to (promises.md, Settling): an amount, on that side's accepted answer; or
        // (1.9 R-P5, A spot exchange) on the seller's own transfer `for` the buyer's order, his yes and his delivery in one block.
        // The seller's transfer `for` the buyer's order (the order her own first promise, `from` him, `to` her, naming what it moves), `to_owner`
        // her, where he has not already accepted the order: his yes and his delivery in one block; it states `covers` (`required`, R-P5: a
        // missing covers is never read as credit). Read where the order is held; a writer that holds nothing reads the looser shape.
        let spot_order = held.and_then(|held| {
            let (author, to, deal) = (r("author")?.as_str()?, r("to_owner")?.as_str()?, r("for")?.as_str()?);
            if r("answers").is_some() || g("status").is_some() {
                return None;
            }
            let o = held.get(deal).filter(|o: &&Value| {
                o.get("type").and_then(Value::as_str) == Some("promise")
                    && crate::js::rf(o, "answers").is_none()
                    && crate::js::st(o, "status").is_none()
                    && crate::js::rs(o, "to") == Some(to)
                    && crate::js::rs(o, "author") == Some(to)
                    && crate::js::rs(o, "from") == Some(author)
                    && list(crate::js::rf(o, "what")).iter().any(|h| list(r("what")).contains(h))
            })?;
            let accepted = held.values().any(|x: &Value| {
                x.get("type").and_then(Value::as_str) == Some("promise") && crate::js::ss(x, "status") == Some("accepted") && crate::js::rs(x, "answers") == Some(crate::js::hash_of(o)) && crate::js::rs(x, "author") == Some(author)
            });
            (!accepted).then_some(())
        });
        if let Some(c) = g("covers") {
            w.extend(self.amount_shape(Some(c), "state.covers"));
            let answer = r("answers").is_some() && g("status").and_then(Value::as_str) == Some("accepted");
            let spot = if held.is_some() { spot_order.is_some() } else { g("status").is_none() && r("for").is_some() && r("what").is_some() };
            if !answer && !spot {
                w.push(f("shape", "state.covers goes only on an accepted answer to a payment, or on the seller's transfer for the buyer's order"));
            }
        } else if spot_order.is_some() {
            w.push(f("required", "a seller's transfer for a buyer's order states state.covers (0 if nothing came): a missing covers is never read as credit"));
        }
        // A payment names the occurrence of a standing promise it pays (promises.md, Settling; decision E4): its start time, or the hash
        // of the block that started it, as a stop names occurrences.
        if let Some(o) = g("occurrence") {
            if !(crate::time::is_time(Some(o)) || self.is("hash", Some(o))) || g("amount").is_none() || r("what").is_some() {
                w.push(f("shape", "state.occurrence goes on a payment: the start time of the occurrence it pays, or the hash of the block that started it"));
            }
        }
        // Whoever lets a thing go may name a clock for its takers (things.md, Transfers): `clocks` goes on an open hand-over, never on one to a named receiver.
        if let Some(k) = g("clocks") {
            if r("to_owner").is_some() || crate::tasks::clocks_of(k).is_none() {
                w.push(f("shape", "state.clocks goes on an open hand-over (no refs.to_owner) and is { names (ids), needed }: the clock its takers are read on"));
            }
        }
        // A payment `for` several promises says how much goes to each (things.md, Transfers): one payment never pays two
        // promises in full.
        if !answering && g("amount").is_some() && r("what").is_none() && g("split").is_none() && hashes_text(r("for")).len() > 1 {
            w.push(f("required", "a payment for several promises says how much goes to each (state.split)"));
        }
        // The parts are the payment's own amount: of its kind, adding up to no more than it.
        if let (Some(Value::Array(parts)), Some(whole)) = (g("split"), Amount::of(g("amount"))) {
            let amounts: Vec<Amount> = parts.iter().filter_map(|p| Amount::of(p.get("amount"))).collect();
            if amounts.len() == parts.len() {
                if amounts.iter().any(|a| a.kind != whole.kind) {
                    w.push(f("shape", "every part of state.split is of the payment's own kind"));
                } else {
                    let sum = amounts.iter().fold(crate::decimal::Dec::zero(), |t, a| t.add(&a.value));
                    if sum.cmp(&whole.value) == Ordering::Greater {
                        w.push(f("shape", "state.split adds up to no more than state.amount"));
                    }
                }
            }
        }
        if let Some(split) = g("split") {
            match split.as_array().filter(|a| !a.is_empty()) {
                None => w.push(f("shape", "state.split lists { for, line, amount }")),
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
                        if part.get("amount").is_none_or(|m| self.shape_of(m) != Some("amount")) {
                            w.push(f("shape", format!("state.split[{i}].amount is the amount that part is: {{ value, unit }}")));
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
