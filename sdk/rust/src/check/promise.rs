//! A promise's own rules (promises.md): its sides, its deal, and its terms.
use super::{f, s, Checker, W};
use crate::js::{get, hash_of, is_obj, keys_within, rf, sorted_set, str_of, Index};
use crate::prelude::*;

impl Checker<'_> {
    pub(super) fn promise(&self, state: &Value, refs: &Value, held: Option<&Index>, answering: bool) -> W {
        let g = |k: &str| state.get(k);
        let r = |k: &str| refs.get(k);
        let mut w: W = vec![];
        // Whether the signer is a side is the fold's to read (folds.md, Who a block speaks for): a side may name a thing, whose owner is not
        // a block this one rests on (promises.md, Bearer; core.md, invariant 25), so the check never refuses it. An ask may carry
        // `terms.expires` or not (decision H11): with none it lasts until its author stops it.
        w.extend(self.status_shape(state, refs));
        // a side is one id (promises.md, Sides): a set would leave whose word binds to a reader
        for k in ["from", "to"] {
            if r(k).is_some_and(Value::is_array) {
                w.push(f("shape", format!("refs.{k} names one side: one id")));
            }
        }
        // A promise's terms are fixed once it is written (promises.md, Terms are fixed): an `updates` of a promise is its author's stop.
        if r("updates").is_some() && r("answers").is_none() && g("status") != Some(&Value::String("stopped".into())) {
            w.push(f("required", "an updates of a promise is its author's stop (state.status stopped): terms are fixed once written; change them with a counter-offer or a new offer"));
        }
        if !answering && r("what").is_none() && g("what").is_none() {
            w.push(f("required", "a promise names what moves: refs.what, or state.what for time or a job"));
        }
        // A deal block names the deal's first promise in refs.for, exactly; it is signed by a side of the deal.
        let target = r("answers").or(r("updates")).and_then(Value::as_str).and_then(|h| held.and_then(|h2| h2.get(h)));
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
        w.extend(self.terms_shape(g("terms"), refs, state));
        // An answer that carries a status names no term but the quantity it chooses (promises.md, Answers): a price or any other term on an
        // accept would be read by no one, so it is refused.
        if g("status").is_some() {
            if let Some(Value::Object(t)) = g("terms") {
                for k in t.keys().filter(|k| k.as_str() != "quantity") {
                    w.push(f("undeclared_field", format!("terms.{k} on an answer: an answer names only the quantity it chooses")));
                }
            }
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

    pub(super) fn terms_shape(&self, terms: Option<&Value>, refs: &Value, state: &Value) -> W {
        let Some(t) = terms else { return vec![] };
        if !is_obj(terms) {
            return s("shape", "state.terms is { price, quantity, lines, ... }");
        }
        // Which terms a promise may carry is judged with what its schema declares (check/mod.rs, `declared`).
        let mut w: W = vec![];
        if t.get("price").is_some() {
            w.extend(self.price_shape(t.get("price"), "terms.price"));
        }
        w.extend(self.quantity_shape(t.get("quantity"), t.get("price"), "terms.quantity"));
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
                    && r.get("by").is_none_or(|b| b.as_array().is_some_and(|a| !a.is_empty() && a.iter().all(|x| self.is("id", Some(x)) || self.is("role_ref", Some(x)))));
                if !ok {
                    w.push(f("shape", "terms.repeat as an event is { after (an observe kind), by (ids or circle#role), wait (a duration) }"));
                }
                w.extend(self.duration_shape(r.get("wait"), "terms.repeat.wait"));
            }
            Some(_) => w.push(f("grammar", "terms.repeat is an RFC 5545 RRULE value (FREQ=WEEKLY;BYDAY=FR), or { after, by, wait }")),
        }
        // A condition wrapped in `without` names its deadline and keepers (promises.md, Conditions); `keepers` names the clock an offer's
        // `expires` and an event `when` are read on (blocks.md, A named clock).
        if let Some(m) = t.get("condition").and_then(crate::tasks::condition_malformed) {
            w.push(f("shape", format!("terms.condition: {m}")));
        }
        if let Some(k) = t.get("keepers") {
            if crate::tasks::keepers_of(k).is_none() {
                w.push(f("shape", "terms.keepers is { names (ids or circle#role), needed }: needed when there is more than one name"));
            }
        }
        // What the payer gives up if the deal ends before it is done (folds.md, Uncovered): money. A claim that cannot be handed on: true.
        w.extend(self.money_shape(t.get("forfeit"), "terms.forfeit"));
        // What the signer puts behind the promise: money, or a count of one named kind (an amount: "up to 2 heifers").
        if t.get("backing").is_some_and(|b| b.get("unit").is_some()) {
            w.extend(self.amount_shape(t.get("backing"), "terms.backing"));
        } else {
            w.extend(self.money_shape(t.get("backing"), "terms.backing"));
        }
        if t.get("personal").is_some_and(|x| x != &Value::Bool(true)) {
            w.push(f("shape", "terms.personal is true: the claim cannot be handed on"));
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
        // A promise not to do something: kept by its until unless a counted defeats breaks it (folds.md).
        if let Some(x) = t.get("refrain") {
            if x != &Value::Bool(true) {
                w.push(f("shape", "terms.refrain is true: a promise not to do something"));
            } else if t.get("until").is_none() {
                w.push(f("required", "a promise not to do something carries terms.until, the instant it is kept to"));
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
                None => w.push(f(
                    "lines",
                    "terms.lines lists { id, what, quantity, price }",
                )),
                Some(lines) => {
                    let fields = self.list("line");
                    for (i, line) in lines.iter().enumerate() {
                        if !(is_obj(Some(line)) && keys_within(line, &fields)) {
                            w.push(f(
                                "lines",
                                format!("terms.lines[{i}] is {{ {} }}", fields.join(", ")),
                            ));
                        }
                        if line
                            .get("id")
                            .and_then(Value::as_str)
                            .is_none_or(|x| x.is_empty())
                        {
                            w.push(f("lines", format!("terms.lines[{i}].id names the line")));
                        }
                        if !self.is("id", line.get("what")) {
                            w.push(f(
                                "lines",
                                format!("terms.lines[{i}].what is a thing's hash"),
                            ));
                        }
                        w.extend(self.quantity_shape(
                            line.get("quantity"),
                            line.get("price"),
                            &format!("terms.lines[{i}].quantity"),
                        ));
                        // a line's quantity is an amount: no answer can choose within a range on one line (an answer names only
                        // the top-level quantity), so a range there could never be chosen (promises.md, Terms)
                        if line.get("quantity").is_some_and(|q| q.get("min").is_some() || q.get("max").is_some()) {
                            w.push(f("lines", format!("terms.lines[{i}].quantity is an amount, never a range")));
                        }
                        if line.get("price").is_some_and(|p| p.get("figure").is_some()) {
                            w.push(f("lines", format!("terms.lines[{i}].price is money or an amount: a price fixed later is on the whole promise")));
                        }
                        if line.get("price").is_some() {
                            w.extend(self.price_shape(
                                line.get("price"),
                                &format!("terms.lines[{i}].price"),
                            ));
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
                    // One promise has one currency: every line's price is in it (money in different currencies is never added).
                    let mut currencies: Vec<String> = lines
                        .iter()
                        .filter_map(|l| l.get("price"))
                        .filter_map(|p| p.get("currency").or_else(|| get(p, "money.currency")))
                        .map(crate::canonical::canonical_json)
                        .collect();
                    currencies.sort();
                    currencies.dedup();
                    if currencies.len() > 1 {
                        w.push(f("lines", "every line of one promise is priced in one currency"));
                    }
                    if t.get("price").is_some() || t.get("quantity").is_some() {
                        w.push(f(
                            "lines",
                            "with lines, the price and quantity are on each line",
                        ));
                    }
                    let whats: Vec<String> = lines.iter().map(|l| str_of(l.get("what")).to_string()).collect();
                    let same = match refs.get("what") {
                        None => false,
                        Some(b) => {
                            let bs: Vec<String> = match b {
                                Value::Array(a) => a.iter().map(|x| str_of(Some(x)).to_string()).collect(),
                                other => vec![str_of(Some(other)).to_string()],
                            };
                            sorted_set(whats) == sorted_set(bs)
                        }
                    };
                    if !same {
                        w.push(f("lines", "refs.what is the set of every line's what"));
                    }
                }
            }
        }
        w
    }
}
