//! A promise's own rules (promises.md): its sides, its deal, and its terms.
use super::{f, s, Checker, W};
use crate::js::{hash_of, is_obj, keys_within, rf, Index};
use crate::prelude::*;

impl Checker<'_> {
    pub(super) fn promise(&self, state: &Value, refs: &Value, blocks: Option<&Index>, answering: bool) -> W {
        let g = |k: &str| state.get(k);
        let r = |k: &str| refs.get(k);
        let mut w: W = vec![];
        // Whether the signer is a side is the fold's to read (folds.md, Who a block speaks for): a side may name a thing, whose owner is not
        // a block this one rests on (promises.md, Bearer; core.md, invariant 25), so the check never refuses it. An ask may carry
        // `terms.expires` or not: with none it lasts until its author stops it.
        w.extend(self.status_shape(state, refs));
        // a side is one id (promises.md, Sides): a set would leave whose word binds to a reader
        for k in ["from", "to"] {
            if r(k).is_some_and(Value::is_array) {
                w.push(f("shape", format!("refs.{k} names one side: one id")));
            }
        }
        // A promise's terms are fixed once it is written (promises.md, Terms are fixed): an `updates` of a promise is its author's stop.
        if r("updates").is_some() && r("answers").is_none() && !matches!(g("status").and_then(Value::as_str), Some("stopped" | "resumed")) {
            w.push(f("required", "an updates of a promise is its author's stop (state.status stopped), or the end of a pause of their own (resumed): terms are fixed once written; change them with a counter-offer or a new offer"));
        }
        // a promise states what it moves or prices in its lines, or says in `state.what` what it is (core.md, section 7)
        if !answering && g("terms").and_then(|t| t.get("lines")).is_none() && g("what").is_none() {
            w.push(f("required", "a promise states terms.lines (what moves, an amount of a good, or a price for time or a job), or state.what"));
        }
        // what a promise moves is in its lines and nowhere else (promises.md, What moves)
        if r("what").is_some() {
            w.push(f("lines", "a promise names what moves in its lines, never in refs.what"));
        }
        // A deal block names the deal's first promise in refs.for, exactly; it is signed by a side of the deal.
        let target = r("answers").or(r("updates")).and_then(Value::as_str).and_then(|h| blocks.and_then(|h2| h2.get(h)));
        if r("answers").is_some() && r("for").is_none() {
            w.push(f("deal_not_named", "an answer or a counter names its deal in refs.for (the first promise)"));
        } else if let (Some(t), true) = (target, r("answers").is_some()) {
            let first = if rf(t, "answers").is_some() { rf(t, "for").and_then(Value::as_str) } else { Some(hash_of(t)) };
            if first.is_some() && r("for").and_then(Value::as_str) != first {
                w.push(f("deal_not_named", "refs.for is the deal's first promise"));
            }
        }
        if !g("what").is_none_or(|x| x.is_string() || x.is_object()) {
            w.push(f("shape", "state.what describes time or a job (text, or data under a schema)"));
        }
        // An answer that carries a status names no term but the quantities it chooses (promises.md, Answers): `terms.lines`, each
        // `{ id, quantity }`, the quantity an amount. A price or any other term on an accept would be read by no one, so it is refused.
        if g("status").is_some() {
            if let Some(Value::Object(t)) = g("terms") {
                for k in t.keys().filter(|k| k.as_str() != "lines") {
                    w.push(f("undeclared_field", format!("terms.{k} on an answer: an answer names only the quantities it chooses")));
                }
                match t.get("lines").map(|l| l.as_array().filter(|a| !a.is_empty())) {
                    None => {}
                    Some(None) => w.push(f("lines", "terms.lines on an answer lists { id, quantity }")),
                    Some(Some(lines)) => {
                        for (i, line) in lines.iter().enumerate() {
                            let Some(m) = line.as_object() else {
                                w.push(f("lines", format!("terms.lines[{i}] is {{ id, quantity }}")));
                                continue;
                            };
                            for k in m.keys().filter(|k| !matches!(k.as_str(), "id" | "quantity")) {
                                w.push(f("undeclared_field", format!("terms.lines[{i}].{k} on an answer: it names only the line and the quantity it chooses")));
                            }
                            if m.get("id").and_then(Value::as_str).is_none_or(str::is_empty) {
                                w.push(f("lines", format!("terms.lines[{i}].id names the line")));
                            }
                            w.extend(self.amount_shape(m.get("quantity"), &format!("terms.lines[{i}].quantity")));
                        }
                    }
                }
            }
        } else {
            w.extend(self.terms_shape(g("terms"), state));
        }
        w
    }

    // An RFC 5545 RRULE value: parts in grammar.rrule_part, exactly one of them FREQ from repeat.freq, anywhere (RFC 7529 writes
    // RSCALE first: RSCALE=HEBREW;FREQ=YEARLY).
    pub(super) fn rrule(&self, value: &str) -> bool {
        let freq = self.list("repeat.freq");
        let parts: Vec<&str> = value.split(';').collect();
        parts.iter().all(|p| self.spec.is("rrule_part", p))
            && parts.iter().filter(|p| p.starts_with("FREQ=")).count() == 1
            && parts.iter().any(|p| p.strip_prefix("FREQ=").is_some_and(|f| freq.iter().any(|x| x == f)))
    }

    pub(super) fn terms_shape(&self, terms: Option<&Value>, state: &Value) -> W {
        let Some(t) = terms else { return vec![] };
        if !is_obj(terms) {
            return s("shape", "state.terms is { lines, ... }");
        }
        // Which terms a promise may carry is judged with what its schema declares (check/mod.rs, `declared`).
        let mut w: W = vec![];
        match t.get("repeat") {
            None => {}
            // A rule of dates (RFC 5545, another calendar by RFC 7529 RSCALE), counted from state.when.
            Some(Value::String(r)) => {
                if !self.rrule(r) {
                    w.push(f("grammar", "terms.repeat is an RFC 5545 RRULE value (FREQ=WEEKLY;BYDAY=FR), or { after, by, wait }"));
                }
                if state.get("when").is_none() {
                    w.push(f("shape", "a repeating promise counts its occurrences from state.when"));
                }
                // Read in the signer's zone: the protocol fills in none.
                if t.get("zone").is_none() {
                    w.push(f("shape", "a calendar repeat is read in terms.zone"));
                }
            }
            // An occurrence each time an observe of kind `after` is written for the promise (protocol.json `repeat`).
            Some(r @ Value::Object(_)) => {
                let named = |x: &Value| x.as_str().is_some_and(|x| !x.is_empty());
                let ok = keys_within(r, &self.list("repeat.keys"))
                    && r.get("after").is_some_and(named)
                    && r.get("by").is_none_or(|b| b.as_array().is_some_and(|a| !a.is_empty() && a.iter().all(|x| self.is("id", Some(x)))));
                if !ok {
                    w.push(f("shape", "terms.repeat as an event is { after (an observe kind), by (ids), wait (a duration) }"));
                }
                w.extend(self.duration_shape(r.get("wait"), "terms.repeat.wait"));
            }
            Some(_) => w.push(f("grammar", "terms.repeat is an RFC 5545 RRULE value (FREQ=WEEKLY;BYDAY=FR), or { after, by, wait }")),
        }
        // A condition wrapped in `without` names its deadline and clocks (promises.md, Conditions); `clocks` names the clock an offer's
        // `expires` and an event `when` are read on (blocks.md, A named clock).
        if let Some(m) = t.get("condition").and_then(crate::tasks::condition_malformed) {
            w.push(f("shape", format!("terms.condition: {m}")));
        }
        if let Some(k) = t.get("clocks") {
            if crate::tasks::clocks_of(k).is_none() {
                w.push(f("shape", "terms.clocks is { names (ids), needed }: needed when there is more than one name"));
            }
        }
        // What the payer gives up if the deal ends before it is done (folds.md, Uncovered), and what the signer puts behind the promise
        // ("£800", "up to 2 heifers"): each an amount.
        w.extend(self.amount_shape(t.get("forfeit"), "terms.forfeit"));
        w.extend(self.amount_shape(t.get("backing"), "terms.backing"));
        // the least payable amount its signers take, an amount in the price's unit
        w.extend(self.amount_shape(t.get("step"), "terms.step"));
        // what the landing waits on, `goods` or `price`: her word that the goods are in her hand
        if t.get("waits_on").is_some_and(|x| !matches!(x.as_str(), Some("goods" | "price"))) {
            w.push(f("shape", "terms.waits_on is goods or price"));
        }
        if t.get("in_hand").is_some_and(|x| x != &Value::Bool(true)) {
            w.push(f("shape", "terms.in_hand is true: her word that the goods are in her hand"));
        }
        // A judge's offer that tries to settle first, and the part of the fee she gives back if the sides settle (promises.md, Rulings): `conciliation`
        // is true; `fee_back` is a decimal from 0 to 1, the part of the fee paid, and means nothing without a conciliation.
        if t.get("conciliation").is_some_and(|x| x != &Value::Bool(true)) {
            w.push(f("shape", "terms.conciliation is true: she tries to settle the sides before she rules"));
        }
        if let Some(b) = t.get("fee_back") {
            let within = b.as_str().and_then(crate::decimal::Dec::parse).is_some_and(|d| {
                let (zero, one) = (crate::decimal::Dec::zero(), crate::decimal::Dec::parse("1").unwrap_or_else(crate::decimal::Dec::zero));
                d.cmp(&zero) != core::cmp::Ordering::Less && d.cmp(&one) != core::cmp::Ordering::Greater
            });
            if !within {
                w.push(f("shape", "terms.fee_back is a decimal from 0 to 1: the part of her fee she gives back if the sides settle"));
            } else if t.get("conciliation") != Some(&Value::Bool(true)) {
                w.push(f("shape", "terms.fee_back needs terms.conciliation: a fee is given back only when the sides settle through her"));
            }
        }
        // Catch weight: how far what is delivered may fall from the quantity chosen, either way, as a fraction of it, from 0 to 1.
        if let Some(b) = t.get("band") {
            let within = b.as_str().and_then(crate::decimal::Dec::parse).is_some_and(|d| {
                let (zero, one) = (crate::decimal::Dec::zero(), crate::decimal::Dec::parse("1").unwrap_or_else(crate::decimal::Dec::zero));
                d.cmp(&zero) != core::cmp::Ordering::Less && d.cmp(&one) != core::cmp::Ordering::Greater
            });
            if !within {
                w.push(f("shape", "terms.band is a decimal from 0 to 1: how far a delivery may fall from the quantity chosen, as a fraction of it"));
            }
        }
        if let Some(z) = t.get("zone") {
            if !self.is("zone", Some(z)) {
                w.push(f("grammar", "terms.zone is shaped like an IANA time zone name (Europe/London, or UTC)"));
            }
        }
        if t.get("needs")
            .is_some_and(|n| !(n.is_object() || n.is_array() || n.is_null()))
        {
            w.push(f(
                "shape",
                "terms.needs is data from a schema, never a name",
            ));
        }
        if let Some(lines) = t.get("lines") {
            match lines.as_array().filter(|a| !a.is_empty()) {
                None => w.push(f("lines", "terms.lines lists { id, what, quantity, price }")),
                Some(lines) => {
                    let fields = self.list("line");
                    for (i, line) in lines.iter().enumerate() {
                        if !(is_obj(Some(line)) && keys_within(line, &fields)) {
                            w.push(f("lines", format!("terms.lines[{i}] is {{ {} }}", fields.join(", "))));
                        }
                        if line.get("id").and_then(Value::as_str).is_none_or(|x| x.is_empty()) {
                            w.push(f("lines", format!("terms.lines[{i}].id names the line")));
                        }
                        // what, quantity and price are each optional, and a line states at least one (promises.md, A deal is its lines)
                        if ["what", "quantity", "price"].iter().all(|k| line.get(*k).is_none()) {
                            w.push(f("lines", format!("terms.lines[{i}] states what, quantity or price")));
                        }
                        if line.get("what").is_some() && !self.is("id", line.get("what")) {
                            w.push(f("lines", format!("terms.lines[{i}].what is one id")));
                        }
                        // in a promise whose `state.what` names a job, a line's quantity measures the work; a line with no `what` whose
                        // quantity is of its price's own kind moves that amount back for more of it (a loan): a line is a loan or a job,
                        // never both (promises.md, A deal is its lines)
                        let kind_of = |v: Option<&Value>| v.and_then(|q| crate::decimal::Amount::of(Some(q)).or_else(|| crate::decimal::Amount::of(q.get("min"))).or_else(|| crate::decimal::Amount::of(q.get("max")))).map(|a| a.kind);
                        let price_kind = line.get("price").and_then(|p| crate::decimal::Amount::of(Some(p)).or_else(|| crate::decimal::Amount::of(p.get("amount")))).map(|a| a.kind);
                        if line.get("what").is_none() && state.get("what").is_some() && kind_of(line.get("quantity")).is_some_and(|k| Some(k) == price_kind) {
                            w.push(f("lines", format!("terms.lines[{i}] moves an amount and its promise names a job in state.what: a line is a loan or a job, never both")));
                        }
                        w.extend(self.quantity_shape(line.get("quantity"), line.get("price"), &format!("terms.lines[{i}].quantity")));
                        if line.get("price").is_some() {
                            w.extend(self.price_shape(line.get("price"), &format!("terms.lines[{i}].price")));
                        }
                    }
                    let mut ids: Vec<Option<&Value>> = Vec::new();
                    for line in lines {
                        let id = line.get("id");
                        if !ids.iter().any(|o| *o == id) {
                            ids.push(id);
                        }
                    }
                    if ids.len() != lines.len() {
                        w.push(f("lines", "each line id is unique in the promise"));
                    }
                    // Every line's price is of one kind (amounts of two kinds are never added).
                    let mut kinds: Vec<crate::decimal::Kind> = lines
                        .iter()
                        .filter_map(|l| l.get("price"))
                        .filter_map(|p| crate::decimal::Amount::of(Some(p)).or_else(|| crate::decimal::Amount::of(p.get("amount"))))
                        .map(|a| a.kind)
                        .collect();
                    kinds.sort();
                    kinds.dedup();
                    if kinds.len() > 1 {
                        w.push(f("lines", "every line's price of one promise is of one kind"));
                    }
                }
            }
        }
        w
    }
}
