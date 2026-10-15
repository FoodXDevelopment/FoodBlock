//! The write check (protocol.md §1, Refusals): `refusals(type, state, refs)` says what is wrong with a block as every
//! node checks it before writing: `[{ code, detail }]`, one entry per rule found, in the order of protocol.json's
//! `refusals.codes.block` (empty when it is a well-formed 1.6 block). The code carries the meaning; the detail is free
//! text for people. `check` gives the details alone. Every list and grammar it reads comes from protocol.json; none is
//! written here. Older shapes are read, never re-checked (`read_as`).
use crate::canonical::{canonical, nfc};
pub use crate::error::Refusal;
use crate::error::{Error, Result};
use crate::js::{
    get, int, is_obj, keys_within, number, number_of, strict_eq, text, text_or_empty, truthy, Index,
};
use crate::prelude::*;
use crate::spec::Spec;
use crate::time::{is_date, is_time};

/// What the check may look up: `schemas` (hash → schema block) so a named schema's fields and roles count as
/// declared (a schema not among them is refused); `held` (hash → block) so `at` is checked against what refs.after
/// names and a child grant against its parent.
#[derive(Default, Clone, Copy)]
pub struct CheckOptions<'a> {
    pub schemas: Option<&'a Index>,
    pub held: Option<&'a Index>,
}

type W = Vec<Refusal>;

struct Checker<'a> {
    spec: &'a Spec,
}

/// One finding: a code from protocol.json (`refusals.codes`) and free text for people.
fn f(code: &str, detail: impl Into<String>) -> Refusal {
    Refusal::new(code, detail)
}
fn s(code: &str, detail: impl Into<String>) -> W {
    vec![f(code, detail)]
}

impl<'a> Checker<'a> {
    fn is(&self, rule: &str, v: Option<&Value>) -> bool {
        matches!(v, Some(Value::String(t)) if self.spec.is(rule, t))
    }
    // JavaScript's RE.test(value || ''): a value that is not text is turned into text first.
    fn test(&self, rule: &str, v: Option<&Value>) -> bool {
        self.spec.is(rule, &text_or_empty(v))
    }
    fn list(&self, path: &str) -> Vec<String> {
        self.spec.list(path)
    }

    fn amount_shape(&self, value: Option<&Value>, name: &str) -> W {
        let Some(v) = value else { return vec![] };
        let ok = is_obj(Some(v))
            && keys_within(v, &self.list("shapes.amount"))
            && v.get("value").is_some_and(Value::is_string)
            && v.get("unit")
                .and_then(Value::as_str)
                .is_some_and(|u| !u.trim().is_empty());
        if !ok {
            return s(
                "shape",
                format!(
                    "{name} is an amount: {{ value (a decimal string), unit (UCUM or a pack) }}"
                ),
            );
        }
        if self.is("decimal", v.get("value")) {
            vec![]
        } else {
            s(
                "decimal",
                format!("{name}.value is a decimal string (-?(0|[1-9][0-9]*)(.[0-9]+)?)"),
            )
        }
    }
    fn money_shape(&self, value: Option<&Value>, name: &str) -> W {
        let Some(v) = value else { return vec![] };
        let currency = text(v.get("currency"));
        let ok = is_obj(Some(v))
            && keys_within(v, &self.list("shapes.money"))
            && int(v.get("minor")).is_some()
            && currency.len() == 3
            && currency.bytes().all(|b| b.is_ascii_uppercase());
        if ok {
            vec![]
        } else {
            s(
                "shape",
                format!("{name} is money: {{ minor (whole minor units), currency (ISO 4217) }}"),
            )
        }
    }
    // A time or date in the right shape that is not a real calendar instant is `calendar`; any other, `time`.
    fn calendar_shape(&self, value: Option<&Value>, name: &str, rule: &str, words: &str) -> W {
        let Some(v) = value else { return vec![] };
        let real = if rule == "date" {
            is_date(value)
        } else {
            is_time(value)
        };
        if real {
            vec![]
        } else if self.is(rule, Some(v)) {
            s(
                "calendar",
                format!(
                    "{name} is not a real calendar {}",
                    if rule == "date" { "date" } else { "instant" }
                ),
            )
        } else {
            s("time", format!("{name} is {words}"))
        }
    }
    fn time_shape(&self, value: Option<&Value>, name: &str) -> W {
        self.calendar_shape(
            value,
            name,
            "time",
            "a UTC time, exactly YYYY-MM-DDTHH:MM:SS.sssZ",
        )
    }
    fn date_shape(&self, value: Option<&Value>, name: &str) -> W {
        self.calendar_shape(value, name, "date", "a date")
    }
    fn duration_shape(&self, value: Option<&Value>, name: &str) -> W {
        if value.is_none() || self.is("duration", value) {
            vec![]
        } else {
            s("time", format!("{name} is an ISO 8601 duration (P30D)"))
        }
    }
    fn hash_shape(&self, value: Option<&Value>, name: &str) -> W {
        if value.is_none() || self.is("hash", value) {
            vec![]
        } else {
            s("grammar", format!("{name} is a hash"))
        }
    }
    fn hash_list_shape(&self, value: Option<&Value>, name: &str) -> W {
        let ok = match value {
            None => true,
            Some(Value::Array(a)) => !a.is_empty() && a.iter().all(|i| self.test("hash", Some(i))),
            _ => false,
        };
        if ok {
            vec![]
        } else {
            s("grammar", format!("{name} is a set of hashes"))
        }
    }
    fn whole_shape(&self, value: Option<&Value>, name: &str, min: f64) -> W {
        if value.is_none() || int(value).is_some_and(|n| n >= min) {
            vec![]
        } else {
            s(
                "shape",
                format!(
                    "{name} is a whole number{}",
                    if min != 0.0 {
                        format!(" from {}", crate::canonical::js_number(min))
                    } else {
                        String::new()
                    }
                ),
            )
        }
    }
    fn when_shape(&self, value: Option<&Value>, name: &str) -> W {
        let Some(v) = value else { return vec![] };
        if v.is_string() {
            return self.time_shape(value, name);
        }
        if !(is_obj(Some(v))
            && keys_within(v, &self.list("shapes.when"))
            && v.get("from").is_some()
            && v.get("to").is_some())
        {
            return s("shape", format!("{name} is a time, or {{ from, to }}"));
        }
        let mut wrong = self.time_shape(v.get("from"), &format!("{name}.from"));
        wrong.extend(self.time_shape(v.get("to"), &format!("{name}.to")));
        if wrong.is_empty() && text(v.get("from")) > text(v.get("to")) {
            return s("shape", format!("{name}.from is after its to"));
        }
        wrong
    }
    fn decimal_in(&self, value: Option<&Value>, low: f64, high: f64) -> bool {
        self.is("decimal", value) && {
            let n = number(value.unwrap().as_str().unwrap());
            n >= low && n <= high
        }
    }
    fn where_shape(&self, value: Option<&Value>) -> W {
        let ok = match value {
            None => true,
            Some(v) => {
                is_obj(Some(v))
                    && keys_within(v, &self.list("shapes.where.area"))
                    && self.decimal_in(v.get("lat"), -90.0, 90.0)
                    && self.decimal_in(v.get("lon"), -180.0, 180.0)
                    && (v.get("radius").is_none()
                        || (self.amount_shape(v.get("radius"), "radius").is_empty()
                            && v.get("radius")
                                .and_then(|r| r.get("unit"))
                                .and_then(Value::as_str)
                                == Some("m")))
            }
        };
        if ok {
            vec![]
        } else {
            s("shape", "state.where is a point { lat, lon } (WGS84 degrees, decimal strings), or an area: a point with radius (an amount in m)")
        }
    }
    fn marks_shape(&self, value: Option<&Value>, name: &str) -> W {
        let mark = self.list("shapes.mark");
        let ok = match value {
            None => true,
            Some(Value::Array(a)) => a.iter().all(|m| {
                is_obj(Some(m))
                    && keys_within(m, &mark)
                    && m.get("scheme").is_some_and(Value::is_string)
                    && m.get("value").is_some_and(Value::is_string)
            }),
            _ => false,
        };
        if ok {
            vec![]
        } else {
            s(
                "shape",
                format!("{name} lists exact marks: [{{ scheme, value }}]"),
            )
        }
    }
    // A price is money, money per unit ({ money, per }), or a share of something measured ({ share, of }).
    fn price_shape(&self, value: Option<&Value>, name: &str) -> W {
        let v = value.unwrap_or(&Value::Null);
        if per_unit(value) {
            let mut w = if keys_within(v, &self.list("shapes.price_per")) {
                vec![]
            } else {
                s("shape", format!("{name} per unit is {{ money, per }}"))
            };
            if v.get("money").is_none() {
                w.push(f("shape", format!("{name}.money is the price")));
            } else {
                w.extend(self.money_shape(v.get("money"), &format!("{name}.money")));
            }
            w.extend(self.amount_shape(v.get("per"), &format!("{name}.per")));
            return w;
        }
        if is_obj(value) && v.get("share").is_some() {
            let ok = keys_within(v, &self.list("shapes.price_share"))
                && v.get("share").is_some_and(Value::is_string)
                && self.test("hash", v.get("of"));
            if !ok {
                return s("shape", format!("{name} as a share is {{ share (a decimal string), of (the schema saying what is measured) }}"));
            }
            return if self.is("decimal", v.get("share")) {
                vec![]
            } else {
                s("decimal", format!("{name}.share is a decimal string"))
            };
        }
        self.money_shape(value, name)
    }
    // A quantity is an amount; under a per-unit price it may be a range { min, max } the answer chooses within.
    fn quantity_shape(&self, value: Option<&Value>, price: Option<&Value>, name: &str) -> W {
        let v = value.unwrap_or(&Value::Null);
        if !(is_obj(value) && (v.get("min").is_some() || v.get("max").is_some())) {
            return self.amount_shape(value, name);
        }
        let mut w = if per_unit(price) {
            vec![]
        } else {
            s(
                "shape",
                format!("{name} is a range only under a per-unit price"),
            )
        };
        if !keys_within(v, &self.list("shapes.range")) {
            w.push(f("shape", format!("{name} as a range is {{ min, max }}")));
        }
        w.extend(self.amount_shape(v.get("min"), &format!("{name}.min")));
        w.extend(self.amount_shape(v.get("max"), &format!("{name}.max")));
        let (min, max) = (v.get("min"), v.get("max"));
        if truthy(min)
            && truthy(max)
            && strict_eq(min.unwrap().get("unit"), max.unwrap().get("unit"))
            && number_of(min.unwrap().get("value")) > number_of(max.unwrap().get("value"))
        {
            w.push(f("shape", format!("{name}.min is above its max")));
        }
        w
    }
    fn stop_shape(&self, stop: Option<&Value>) -> W {
        let stops = &self.spec.stops;
        let two: Vec<&String> = stops.iter().take(2).collect();
        let ok = matches!(stop, Some(Value::String(x)) if two.contains(&x))
            || (is_obj(stop)
                && keys_within(stop.unwrap(), &["occurrences".to_string()])
                && stop
                    .unwrap()
                    .get("occurrences")
                    .and_then(Value::as_array)
                    .is_some_and(|a| a.iter().all(|t| is_time(Some(t)))));
        if ok {
            vec![]
        } else {
            s(
                "bad_status",
                format!(
                    "state.stop is {}, or {{ occurrences: [start times] }}",
                    two.iter()
                        .map(|x| x.as_str())
                        .collect::<Vec<_>>()
                        .join(" or ")
                ),
            )
        }
    }

    // Numbers in signed content are integers within protocol.json's bounds; never floats. Keys are written in NFC.
    fn numbers(&self, value: &Value, path: &str) -> W {
        match value {
            Value::Number(n) => {
                let x = n.as_f64().unwrap_or(f64::NAN);
                if !crate::js::is_whole(x) {
                    s("float", format!("{path} is a float; write a decimal string, money {{ minor, currency }} or an amount {{ value, unit }}"))
                } else if x < self.spec.int_min || x > self.spec.int_max {
                    s(
                        "integer_range",
                        format!(
                            "{path} is outside the whole numbers a block may hold (±(2^53 - 1))"
                        ),
                    )
                } else {
                    vec![]
                }
            }
            Value::Array(items) => items
                .iter()
                .enumerate()
                .flat_map(|(i, item)| self.numbers(item, &format!("{path}[{i}]")))
                .collect(),
            Value::Object(map) => {
                let mut w: W = map
                    .keys()
                    .filter(|k| nfc(k).as_ref() != k.as_str())
                    .map(|k| {
                        f(
                            "not_canonical",
                            format!(
                                "{path} has a key not written in NFC ({})",
                                Value::String(k.clone())
                            ),
                        )
                    })
                    .collect();
                for (k, v) in map {
                    w.extend(self.numbers(v, &format!("{path}.{k}")));
                }
                w
            }
            _ => vec![],
        }
    }
    // Every amount and money object, wherever it sits in state.
    fn shapes_in(&self, value: &Value, path: &str) -> W {
        match value {
            Value::Array(items) => items
                .iter()
                .enumerate()
                .flat_map(|(i, item)| self.shapes_in(item, &format!("{path}[{i}]")))
                .collect(),
            Value::Object(map) => {
                let mut w = if map.contains_key("unit")
                    && keys_within(value, &self.list("shapes.amount"))
                {
                    self.amount_shape(Some(value), path)
                } else if map.contains_key("minor")
                    && keys_within(value, &self.list("shapes.money"))
                {
                    self.money_shape(Some(value), path)
                } else {
                    vec![]
                };
                for (k, v) in map {
                    w.extend(self.shapes_in(v, &format!("{path}.{k}")));
                }
                w
            }
            _ => vec![],
        }
    }
    // The time and date fields (protocol.json `time_fields`, `date_fields`) where 1.6 names them: in state, its terms
    // and lines, and its scope (`time_fields_checked_in`).
    fn times_in(&self, object: Option<&Value>, path: &str) -> W {
        let Some(Value::Object(map)) = object else {
            return vec![];
        };
        let mut w = vec![];
        for (key, value) in map {
            let name = format!("{path}.{key}");
            if key == "when" {
                w.extend(self.when_shape(Some(value), &name));
            } else if self.spec.time_fields.iter().any(|t| t == key) {
                w.extend(self.time_shape(Some(value), &name));
            } else if self.spec.date_fields.iter().any(|t| t == key) {
                w.extend(self.date_shape(Some(value), &name));
            }
        }
        w
    }

    fn terms_shape(&self, terms: Option<&Value>, refs: &Value, state: &Value) -> W {
        let Some(t) = terms else { return vec![] };
        if !is_obj(terms) {
            return s("shape", "state.terms is { price, quantity, lines, ... }");
        }
        let all = &self.spec.terms;
        let mut w: W = t
            .as_object()
            .unwrap()
            .keys()
            .filter(|k| !all.contains(k))
            .map(|k| {
                f(
                    "undeclared_field",
                    format!("terms.{k} is not a 1.6 term ({})", all.join(", ")),
                )
            })
            .collect();
        if t.get("price").is_some() {
            w.extend(self.price_shape(t.get("price"), "terms.price"));
        }
        w.extend(self.quantity_shape(t.get("quantity"), t.get("price"), "terms.quantity"));
        w.extend(self.times_in(Some(t), "terms"));
        w.extend(self.hash_shape(t.get("text"), "terms.text"));
        w.extend(self.hash_shape(t.get("settled_by"), "terms.settled_by"));
        if let Some(r) = t.get("repeat") {
            if !r.as_str().is_some_and(rrule) {
                w.push(f(
                    "grammar",
                    "terms.repeat is an RFC 5545 RRULE value (FREQ=WEEKLY;BYDAY=FR)",
                ));
            }
            if state.get("when").is_none() {
                w.push(f(
                    "shape",
                    "a repeating promise counts its occurrences from state.when",
                ));
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
                        if !self.test("hash", line.get("what")) {
                            w.push(f(
                                "lines",
                                format!("terms.lines[{i}].what is a thing's hash"),
                            ));
                        }
                        w.extend(self.times_in(Some(line), &format!("terms.lines[{i}]")));
                        w.extend(self.quantity_shape(
                            line.get("quantity"),
                            line.get("price"),
                            &format!("terms.lines[{i}].quantity"),
                        ));
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
                        if !ids.iter().any(|o| strict_eq(*o, id)) {
                            ids.push(id);
                        }
                    }
                    if ids.len() != lines.len() {
                        w.push(f("lines", "each line id is unique in the promise"));
                    }
                    if t.get("price").is_some() || t.get("quantity").is_some() {
                        w.push(f(
                            "lines",
                            "with lines, the price and quantity are on each line",
                        ));
                    }
                    let whats: Vec<String> = lines.iter().map(|l| text(l.get("what"))).collect();
                    let same = match refs.get("what") {
                        None => false,
                        Some(b) => {
                            let bs: Vec<String> = match b {
                                Value::Array(a) => a.iter().map(|x| text(Some(x))).collect(),
                                other => vec![text(Some(other))],
                            };
                            crate::js::sorted_set(whats) == crate::js::sorted_set(bs)
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

    fn scope_shape(&self, scope: &Value, kind: Option<&Value>) -> W {
        let all = &self.spec.scope;
        if !scope.is_object() {
            return s("shape", format!("state.scope is {{ {} }}", all.join(", ")));
        }
        let mut w: W = scope
            .as_object()
            .unwrap()
            .keys()
            .filter(|k| !all.contains(k))
            .map(|k| {
                f(
                    "undeclared_field",
                    format!("scope.{k} is not part of a 1.6 scope ({})", all.join(", ")),
                )
            })
            .collect();
        // A key, member, successor or operator grant carries no scope.until; a grant others act under always does.
        let own = kind
            .and_then(Value::as_str)
            .filter(|k| self.spec.grant_kinds.iter().any(|g| g == k));
        match (own, scope.get("until")) {
            (Some(k), Some(_)) => w.push(f(
                "scope_until",
                format!("a {k} grant carries no scope.until"),
            )),
            (None, None) => w.push(f(
                "scope_until",
                "a grant others act under carries scope.until (a UTC time)",
            )),
            _ => {}
        }
        w.extend(self.times_in(Some(scope), "scope"));
        if !scope
            .get("acts")
            .is_none_or(|a| a.as_array().is_some_and(|a| a.iter().all(Value::is_string)))
        {
            w.push(f("shape", "scope.acts lists acts"));
        }
        if !scope.get("parties").is_none_or(|a| {
            a.as_array()
                .is_some_and(|a| a.iter().all(|p| self.test("hash", Some(p))))
        }) {
            w.push(f(
                "grammar",
                "scope.parties lists hashes (left out, it is everyone)",
            ));
        }
        w.extend(self.money_shape(scope.get("limit"), "scope.limit"));
        w.extend(self.duration_shape(scope.get("per"), "scope.per"));
        w.extend(self.duration_shape(scope.get("notice"), "scope.notice"));
        w
    }

    fn audience_shape(&self, state: &Value) -> W {
        let audience = state.get("audience");
        if audience.and_then(Value::as_str) == Some("public") {
            return vec![];
        }
        let Some(list) = audience
            .and_then(Value::as_array)
            .filter(|a| !a.is_empty() && a.iter().all(|w| self.test("hash", Some(w))))
        else {
            return s(
                "audience",
                "state.audience is \"public\" or a list of commitments (salted hashes)",
            );
        };
        let mut w = vec![];
        let sorted = list
            .windows(2)
            .all(|p| text(Some(&p[0])) < text(Some(&p[1])));
        if !sorted {
            w.push(f(
                "audience",
                "state.audience commitments are sorted, each once",
            ));
        }
        if !self.is("nonce", state.get("nonce")) {
            w.push(f(
                "audience",
                "a private block carries state.nonce (16 random bytes, hex)",
            ));
        }
        w
    }

    // The genesis (§2): the one block with no author, prev, after or seq; public, naming its own keys and its recovery.
    // An encryption key is optional (genesis_optional): a micro that only signs leaves it out and adds one by a key grant.
    // What is missing or extra is `bad_genesis`; what is there but malformed is its grammar's code.
    fn genesis_errors(&self, state: &Value, refs: &Value) -> W {
        let genesis = &self.spec.genesis;
        let optional = &self.spec.genesis_optional;
        let mut w: W = refs
            .as_object()
            .unwrap()
            .keys()
            .map(|k| f("bad_genesis", format!("a genesis has no refs (refs.{k})")))
            .collect();
        for k in state.as_object().unwrap().keys() {
            if !genesis.contains(k) && !optional.contains(k) {
                w.push(f(
                    "bad_genesis",
                    format!(
                        "a genesis names only {}, and {} if it has one (state.{k})",
                        genesis.join(", "),
                        optional.join(", ")
                    ),
                ));
            }
        }
        if !truthy(state.get("kind")) {
            w.push(f("bad_genesis", "state.kind says what they are"));
        }
        if state.get("at").is_none() {
            w.push(f("bad_genesis", "state.at is when it was said"));
        } else {
            w.extend(self.time_shape(state.get("at"), "state.at"));
        }
        if state.get("audience").and_then(Value::as_str) != Some("public") {
            w.push(f(
                "bad_genesis",
                "a genesis is public: anyone checks signatures against its key",
            ));
        }
        if state.get("public_key_sign").is_none() {
            w.push(f(
                "bad_genesis",
                "state.public_key_sign names its signing key",
            ));
        } else if !self.test("sign_key", state.get("public_key_sign")) {
            w.push(f(
                "grammar",
                "state.public_key_sign is an Ed25519 key, SPKI DER hex",
            ));
        }
        if !state
            .get("public_key_encrypt")
            .is_none_or(|x| self.is("encrypt_key", Some(x)))
        {
            w.push(f(
                "grammar",
                "state.public_key_encrypt is an X25519 key, 32 bytes hex",
            ));
        }
        if state.get("recovery_key_hash").is_none() {
            w.push(f(
                "bad_genesis",
                "state.recovery_key_hash names the recovery key",
            ));
        } else if !self.test("hash", state.get("recovery_key_hash")) {
            w.push(f(
                "grammar",
                "state.recovery_key_hash is the hash of the recovery key",
            ));
        }
        if state.get("recovery_reach").is_none() {
            w.push(f(
                "bad_genesis",
                "state.recovery_reach says how far back the recovery key may reach",
            ));
        } else {
            w.extend(self.duration_shape(state.get("recovery_reach"), "state.recovery_reach"));
        }
        w
    }

    fn status_shape(&self, state: &Value, refs: &Value) -> W {
        let Some(status) = state.get("status") else {
            return if state.get("stop").is_none() {
                vec![]
            } else {
                s("bad_status", "state.stop goes with status stopped")
            };
        };
        let mut w = vec![];
        if !(truthy(refs.get("answers")) || truthy(refs.get("updates"))) {
            w.push(f("status_not_answer", "only an answer (refs.answers) or the author stopping their own (refs.updates) carries a status"));
        }
        if !status
            .as_str()
            .is_some_and(|x| self.spec.answers.iter().any(|a| a == x))
        {
            w.push(f(
                "bad_status",
                format!("state.status is one of {}", self.spec.answers.join(", ")),
            ));
        }
        if status.as_str() == Some("stopped") {
            w.extend(self.stop_shape(state.get("stop")));
        } else if state.get("stop").is_some() {
            w.push(f("bad_status", "state.stop goes with status stopped"));
        }
        w
    }

    fn rules(&self, type_name: &str, state: &Value, refs: &Value) -> Option<W> {
        let g = |k: &str| state.get(k);
        let r = |k: &str| refs.get(k);
        let mut w: W = vec![];
        match type_name {
            "actor" => {
                if !truthy(g("kind")) {
                    w.push(f(
                        "shape",
                        "state.kind says what it is: a person, an agent, a circle, a contact",
                    ));
                }
                for key in ["public_key_sign", "recovery_key_hash", "recovery_reach"] {
                    if g(key).is_some() {
                        w.push(f(
                            "undeclared_field",
                            format!(
                                "only a genesis names state.{key}; a key comes in by a key grant"
                            ),
                        ));
                    }
                }
                if g("kind").and_then(Value::as_str) == Some("contact")
                    && g("public_key_encrypt").is_some()
                {
                    w.push(f("undeclared_field", "a contact has no keys"));
                }
                if !g("signers").is_none_or(|x| {
                    x.as_array().is_some_and(|a| {
                        !a.is_empty() && a.iter().all(|r| r.as_str().is_some_and(|r| !r.is_empty()))
                    })
                }) {
                    w.push(f(
                        "shape",
                        "state.signers lists the roles that may sign as the circle",
                    ));
                }
                if !g("removal").is_none_or(|x| {
                    is_obj(Some(x))
                        && keys_within(x, &self.list("circle.removal"))
                        && int(x.get("needed")).is_some_and(|n| n >= 1.0)
                }) {
                    w.push(f("shape", "state.removal is { needed: N }, how many other admins must agree to remove an admin"));
                }
                if !g("public_key_encrypt").is_none_or(|x| self.is("encrypt_key", Some(x))) {
                    w.push(f(
                        "grammar",
                        "state.public_key_encrypt is an X25519 key, 32 bytes hex",
                    ));
                }
            }
            "thing" => {
                if !(truthy(g("kind")) || truthy(r("kind"))) {
                    w.push(f(
                        "shape",
                        "a thing is a kind (state.kind) or one of a kind (refs.kind)",
                    ));
                }
                w.extend(self.marks_shape(g("marks"), "state.marks"));
                if !g("words").is_none_or(Value::is_string) {
                    w.push(f(
                        "shape",
                        "state.words are the words printed on it, as read",
                    ));
                }
                if g("kind").and_then(Value::as_str) == Some("schema") {
                    w.extend(self.schema_shape(state));
                } else {
                    for key in &self.spec.schema {
                        if g(key).is_some() {
                            w.push(f(
                                "undeclared_field",
                                format!("state.{key} belongs to a schema (a thing of kind schema)"),
                            ));
                        }
                    }
                }
            }
            "transform" => {
                let inputs = hashes_text(r("derives_from"));
                let share = self.list("shapes.share");
                let ok = g("shares").is_none_or(|x| {
                    x.as_array().is_some_and(|a| {
                        a.iter().all(|item| {
                            is_obj(Some(item))
                                && keys_within(item, &share)
                                && item.get("from").is_some_and(|f| {
                                    inputs.iter().any(|i| Some(i.as_str()) == f.as_str())
                                })
                                && self.is("decimal", item.get("share"))
                        })
                    })
                });
                if !ok {
                    w.push(f("shape", "state.shares lists { from (an input it derives_from), share (a decimal string) }"));
                }
            }
            "transfer" => {
                if !(truthy(r("answers"))
                    || truthy(r("to_owner"))
                    || truthy(r("to_holder"))
                    || truthy(r("to_place"))
                    || g("count").is_some())
                {
                    w.push(f("shape", "a transfer says what changed (refs.to_owner, to_holder, to_place), or how many received (state.count)"));
                }
                w.extend(self.whole_shape(g("count"), "state.count", 1.0));
                w.extend(self.marks_shape(g("marks"), "state.marks"));
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
                                        fors.iter().any(|x| Some(x.as_str()) == f.as_str())
                                    });
                                if !ok {
                                    w.push(f(
                                        "shape",
                                        format!(
                                            "state.split[{i}].for is one of what it is for (refs.for)"
                                        ),
                                    ));
                                }
                                if part.get("money").is_none() {
                                    w.push(f(
                                        "shape",
                                        format!("state.split[{i}].money says how much"),
                                    ));
                                }
                                if !part.get("line").is_none_or(Value::is_string) {
                                    w.push(f(
                                        "shape",
                                        format!("state.split[{i}].line is a line id"),
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            "observe" => {
                if (truthy(r("confirms")) || truthy(r("same_as"))) && g("confidence").is_none() {
                    w.push(f("shape", "a confirm or a same_as carries a confidence"));
                }
                if !g("dkim").is_none_or(|d| {
                    is_obj(Some(d))
                        && d.get("domain").is_some_and(Value::is_string)
                        && d.get("pass").is_some_and(Value::is_boolean)
                }) {
                    w.push(f("shape", "state.dkim is { domain, pass }"));
                }
            }
            "promise" => {
                let answer = truthy(r("answers")) && g("status").is_some();
                let stopping = truthy(r("updates")) && g("status").is_some();
                let from_speaks = speaks_for(refs, r("from"));
                let to_speaks = speaks_for(refs, r("to"));
                let asked = to_speaks && !from_speaks;
                w.extend(self.status_shape(state, refs));
                if !(answer || stopping || from_speaks || to_speaks) {
                    w.push(f("not_a_side", "a promise is signed by a side: from (an offer) or to (an ask), as it, or under its grant"));
                }
                if !answer && !stopping && asked && !is_time(get(state, "terms.expires")) {
                    w.push(f("ask_without_expires", "every ask carries terms.expires"));
                }
                if truthy(r("answers")) && !truthy(r("for")) {
                    w.push(f(
                        "deal_not_named",
                        "an answer or a counter names its deal in refs.for (the first promise)",
                    ));
                }
                if !g("not").is_none_or(|n| n == &Value::Bool(true)) {
                    w.push(f(
                        "shape",
                        "state.not is true (a promise not to do the step), or left out",
                    ));
                }
                if !g("what").is_none_or(|x| x.is_string() || x.is_object()) {
                    w.push(f(
                        "shape",
                        "state.what describes time or a job (text, or data under a schema)",
                    ));
                }
                w.extend(self.terms_shape(g("terms"), refs, state));
            }
            "grant" => {
                let ending =
                    (truthy(r("answers")) || truthy(r("updates"))) && g("status").is_some();
                if !truthy(g("kind")) {
                    w.push(f("shape", "state.kind says what authority it gives"));
                }
                w.extend(self.status_shape(state, refs));
                w.extend(self.whole_shape(g("depth"), "state.depth", 0.0));
                if let Some(scope) = g("scope") {
                    w.extend(self.scope_shape(scope, g("kind")));
                }
                if !(ending || truthy(r("answers"))) {
                    match g("kind").and_then(Value::as_str) {
                        Some("key") => w.extend(self.key_grant_shape(state, refs)),
                        Some("member") => w.extend(self.member_shape(state, refs)),
                        Some("successor") => w.extend(self.successor_shape(state, refs)),
                        Some("operator") => {
                            if !truthy(r("to")) {
                                w.push(f("shape", "an operator grant names the agent or machine it answers for (refs.to)"));
                            }
                        }
                        _ => {}
                    }
                }
                w.extend(self.hash_shape(g("last_counted"), "state.last_counted"));
            }
            _ => return None,
        }
        Some(w)
    }

    fn key_grant_shape(&self, state: &Value, refs: &Value) -> W {
        let g = |k: &str| state.get(k);
        let mut w = vec![];
        if !truthy(refs.get("subject")) {
            w.push(f(
                "shape",
                "a key grant names the id it is for (refs.subject)",
            ));
        }
        if g("public_key_sign").is_none()
            && g("public_key_encrypt").is_none()
            && g("recovery_key_hash").is_none()
        {
            w.push(f(
                "shape",
                "a key grant names the new key (state.public_key_sign or public_key_encrypt)",
            ));
        }
        if !g("public_key_sign").is_none_or(|x| self.is("sign_key", Some(x))) {
            w.push(f(
                "grammar",
                "state.public_key_sign is an Ed25519 key, SPKI DER hex",
            ));
        }
        if !g("public_key_encrypt").is_none_or(|x| self.is("encrypt_key", Some(x))) {
            w.push(f(
                "grammar",
                "state.public_key_encrypt is an X25519 key, 32 bytes hex",
            ));
        }
        if g("replaces").is_none() != g("last_good").is_none() {
            w.push(f(
                "shape",
                "a rotation names both the key it replaces and that key's last good block",
            ));
        }
        if !g("replaces").is_none_or(|x| self.is("sign_key", Some(x))) {
            w.push(f("grammar", "state.replaces is the key it replaces"));
        }
        w.extend(self.hash_shape(g("last_good"), "state.last_good"));
        if !g("recovery_key").is_none_or(|x| self.is("sign_key", Some(x))) {
            w.push(f(
                "grammar",
                "state.recovery_key is the recovery key that signed it",
            ));
        }
        if g("recovery_key_hash").is_none() != g("recovery_reach").is_none() {
            w.push(f(
                "shape",
                "adding recovery names both recovery_key_hash and recovery_reach",
            ));
        }
        w.extend(self.hash_shape(g("recovery_key_hash"), "state.recovery_key_hash"));
        w.extend(self.duration_shape(g("recovery_reach"), "state.recovery_reach"));
        w.extend(self.whole_shape(g("epoch"), "state.epoch", 1.0));
        if g("epoch").is_some() && !truthy(refs.get("as")) {
            w.push(f(
                "shape",
                "a rekey (state.epoch) is signed as the circle (refs.as)",
            ));
        }
        if g("epoch").is_some() && (g("keys").is_none() || !truthy(refs.get("after"))) {
            w.push(f("shape", "a rekey holds the new private key sealed to each member (state.keys) and names epoch n-1 in refs.after"));
        }
        w
    }
    fn member_shape(&self, state: &Value, refs: &Value) -> W {
        let mut w = vec![];
        if !truthy(refs.get("subject")) {
            w.push(f("shape", "a member grant names the circle (refs.subject)"));
        }
        if !strict_eq(refs.get("as"), refs.get("subject")) {
            w.push(f(
                "shape",
                "a member grant is signed as the circle (refs.as)",
            ));
        }
        if !state.get("roles").is_none_or(|x| {
            x.as_array()
                .is_some_and(|a| a.iter().all(|r| r.as_str().is_some_and(|r| !r.is_empty())))
        }) {
            w.push(f("shape", "state.roles lists the roles it gives (words)"));
        }
        w
    }
    fn successor_shape(&self, state: &Value, refs: &Value) -> W {
        let g = |k: &str| state.get(k);
        let mut w = vec![];
        if !truthy(refs.get("to")) {
            w.push(f(
                "shape",
                "a successor grant names the successor (refs.to)",
            ));
        }
        if g("witnesses").is_none() {
            w.push(f("shape", "state.witnesses names who may record the event"));
        } else {
            w.extend(self.hash_list_shape(g("witnesses"), "state.witnesses"));
        }
        let count = g("witnesses")
            .and_then(Value::as_array)
            .map(|a| a.len())
            .unwrap_or(0) as f64;
        if !int(g("needed")).is_some_and(|n| n >= 1.0 && n <= count) {
            w.push(f(
                "shape",
                "state.needed is how many witnesses must record it (1 to their number)",
            ));
        }
        if g("wait").is_none() {
            w.push(f(
                "shape",
                "state.wait is how long the trigger waits (a duration)",
            ));
        } else {
            w.extend(self.duration_shape(g("wait"), "state.wait"));
        }
        if g("public_key_sign").is_some() {
            w.push(f(
                "undeclared_field",
                "a successor gets decryption keys only, never signing keys",
            ));
        }
        w
    }
    fn schema_shape(&self, state: &Value) -> W {
        let target = text_or_empty(state.get("target"));
        let mut parts = target.split('.');
        let t = parts.next().unwrap_or("");
        let kind: Vec<&str> = parts.collect();
        let types = &self.spec.types;
        let mut w = vec![];
        if !(types.iter().any(|x| x == t) && (kind.is_empty() || !kind.join(".").is_empty())) {
            w.push(f(
                "shape",
                format!(
                    "a schema names its target: a type ({}) or type.kind",
                    types.join(", ")
                ),
            ));
        }
        let field_types = self.list("field_types");
        if !state.get("fields").is_none_or(|f| {
            f.as_object().is_some_and(|m| {
                m.values().all(|v| {
                    v.as_str()
                        .is_some_and(|v| field_types.iter().any(|x| x == v))
                })
            })
        }) {
            w.push(f(
                "shape",
                format!(
                    "state.fields maps each field to a field type ({})",
                    field_types.join(", ")
                ),
            ));
        }
        if !state
            .get("roles")
            .is_none_or(|x| x.as_array().is_some_and(|a| a.iter().all(Value::is_string)))
        {
            w.push(f("shape", "state.roles lists the ref keys it declares"));
        }
        let grounds = state.get("grounds");
        if !grounds.is_none_or(|x| is_obj(Some(x)) && keys_within(x, &self.spec.grounds)) {
            w.push(f(
                "shape",
                format!("state.grounds is {{ {} }}", self.spec.grounds.join(", ")),
            ));
        }
        if !grounds.and_then(|g| g.get("confirmers")).is_none_or(|c| {
            c.as_array().is_some_and(|a| {
                a.iter()
                    .all(|who| self.test("hash", Some(who)) || self.test("role_ref", Some(who)))
            })
        }) {
            w.push(f(
                "grammar",
                "state.grounds.confirmers lists ids or circle#role",
            ));
        }
        w
    }

    // The fields and roles a block may name: the base, and what its schema declares (when the reader holds it).
    fn declared(
        &self,
        type_name: &str,
        refs: &Value,
        schemas: Option<&Index>,
    ) -> Option<(Vec<String>, Vec<String>)> {
        let named = refs.get("schema").filter(|v| truthy(Some(v)));
        let schema = match (named, schemas) {
            (Some(h), Some(store)) => store.get(&text(Some(h))),
            _ => None,
        };
        if named.is_some() && schema.is_none() {
            return None;
        }
        let mut fields = self.spec.every.clone();
        fields.extend(self.spec.fields(type_name));
        if let Some(Value::Object(f)) = schema.and_then(|s| get(s, "state.fields")) {
            fields.extend(f.keys().cloned());
        }
        let mut roles = self.spec.ref_keys.clone();
        if let Some(Value::Array(r)) = schema.and_then(|s| get(s, "state.roles")) {
            roles.extend(r.iter().map(|x| text(Some(x))));
        }
        Some((fields, roles))
    }

    // Every finding, in the order found.
    fn findings(&self, type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> W {
        let rule_known = matches!(
            type_name,
            "actor" | "thing" | "observe" | "transform" | "transfer" | "promise" | "grant"
        );
        if !(rule_known && self.spec.has_type(type_name)) {
            return s(
                "unknown_type",
                format!(
                    "{type_name} is not a FoodBlock 1.6 type ({})",
                    self.spec.types.join(", ")
                ),
            );
        }
        if !state.is_object() || !refs.is_object() {
            return s("shape", "state and refs are objects");
        }
        let mut w = vec![];
        if canonical(type_name, state, refs).len() > self.spec.block_bytes {
            w.push(f(
                "size_limit",
                format!(
                    "a block's canonical body is at most {} bytes; link larger content by its hash",
                    self.spec.block_bytes
                ),
            ));
        }
        for (key, value) in refs.as_object().unwrap() {
            if key == "prev" {
                if !self.is("hash", Some(value)) {
                    w.push(f("grammar", "refs.prev is one hash"));
                }
            } else {
                let items: Vec<&Value> = match value {
                    Value::Array(a) => a.iter().collect(),
                    other => vec![other],
                };
                if items.is_empty() || !items.iter().all(|h| self.is("hash", Some(h))) {
                    w.push(f(
                        "grammar",
                        format!("refs.{key} is a hash or a set of hashes (64 lowercase hex)"),
                    ));
                }
            }
        }
        w.extend(self.numbers(state, "state"));
        w.extend(self.numbers(refs, "refs"));
        let g = |k: &str| state.get(k);
        if type_name == "actor" && !truthy(refs.get("author")) && g("seq").is_none() {
            w.extend(self.genesis_errors(state, refs));
            return w;
        }
        if !truthy(refs.get("author")) {
            w.push(f("chain", "refs.author names who said it"));
        }
        if !int(g("seq")).is_some_and(|n| n >= 1.0) {
            w.push(f(
                "chain",
                "state.seq is its place in its signing key's chain (1, 2, 3...)",
            ));
        }
        if !truthy(refs.get("prev")) {
            w.push(f(
                "chain",
                "refs.prev names the key's previous block (or the block that brought the key in)",
            ));
        }
        if g("at").is_none() {
            w.push(f("time", "state.at is when it was said"));
        }
        w.extend(self.times_in(Some(state), "state"));
        w.extend(self.audience_shape(state));
        w.extend(self.where_shape(g("where")));
        w.extend(self.shapes_in(state, "state"));
        if !g("confidence").is_none_or(|c| self.is("confidence", Some(c))) {
            w.push(f(
                "grammar",
                "state.confidence is a decimal string from 0 to 1",
            ));
        }
        if !g("sequencer").is_none_or(|c| self.is("sign_key", Some(c))) {
            w.push(f(
                "grammar",
                "state.sequencer is the signing key that orders the record",
            ));
        }
        w.extend(self.hash_list_shape(g("manifest"), "state.manifest"));
        w.extend(self.hash_list_shape(g("counted"), "state.counted"));
        if !g("line").is_none_or(Value::is_string) {
            w.push(f("shape", "state.line is a line id"));
        }
        let after = refs.get("after");
        if let Some(a) = after {
            let n = a.as_array().map(|x| x.len()).unwrap_or(1);
            if n > self.spec.after_heads {
                w.push(f(
                    "after_limit",
                    format!("refs.after names at most {} heads", self.spec.after_heads),
                ));
            }
        }
        if let (Some(held), Some(a)) = (options.held, after) {
            if is_time(g("at")) {
                let at = text(g("at"));
                let items: Vec<String> = match a {
                    Value::Array(x) => x.iter().map(|h| text(Some(h))).collect(),
                    other => vec![text(Some(other))],
                };
                for h in items {
                    let seen_at = held.get(&h).and_then(|b| crate::js::st(b, "at"));
                    if is_time(seen_at) && text(seen_at) > at {
                        w.push(f(
                            "at_before_after",
                            format!("state.at is earlier than {h}, which it names as seen"),
                        ));
                    }
                }
            }
        }
        if let (Some(held), "grant", true) = (options.held, type_name, truthy(refs.get("parent"))) {
            if let Some(parent) = held.get(&text(refs.get("parent"))) {
                w.extend(crate::grant::scope_refusals(
                    &json!({ "state": state, "refs": refs }),
                    parent,
                ));
            }
        }
        match self.declared(type_name, refs, options.schemas) {
            None => {
                if options.schemas.is_some() {
                    w.push(f(
                        "undeclared_ref",
                        "refs.schema names a schema this node does not hold: ask for it",
                    ));
                }
            }
            Some((fields, roles)) => {
                for key in refs.as_object().unwrap().keys() {
                    if !roles.contains(key) {
                        w.push(f(
                            "undeclared_ref",
                            format!(
                                "refs.{key} is not declared (the shared refs, or the schema's roles)"
                            ),
                        ));
                    }
                }
                for key in state.as_object().unwrap().keys() {
                    if !fields.contains(key) {
                        w.push(f("undeclared_field", format!("state.{key} is not declared for {type_name} (its base fields, or the schema's)")));
                    }
                }
            }
        }
        w.extend(self.rules(type_name, state, refs).unwrap_or_default());
        w
    }
}

/// Findings as a refusal list: one entry per code, in the order of `group` (a group of protocol.json's
/// `refusals.codes`: block, fold or message), the details of one code joined with "; " (each once).
pub fn ordered_with(spec: &Spec, found: Vec<Refusal>, group: &str) -> Vec<Refusal> {
    let order = spec.list(&format!("refusals.codes.{group}"));
    let mut by: Vec<(String, Vec<String>)> = Vec::new();
    for one in found {
        match by.iter_mut().find(|(c, _)| *c == one.code) {
            Some((_, details)) => {
                if !details.contains(&one.detail) {
                    details.push(one.detail)
                }
            }
            None => by.push((one.code, vec![one.detail])),
        }
    }
    // A code outside the group sorts first, as JavaScript's indexOf -1 does; the sort is stable.
    let place = |code: &str| {
        order
            .iter()
            .position(|c| c == code)
            .map_or(-1, |i| i as i64)
    };
    by.sort_by_key(|(code, _)| place(code));
    by.into_iter()
        .map(|(code, details)| Refusal {
            code,
            detail: details.join("; "),
        })
        .collect()
}

/// Findings as a refusal list under the built-in protocol.json (see [`ordered_with`]).
pub fn ordered(found: Vec<Refusal>, group: &str) -> Vec<Refusal> {
    ordered_with(crate::spec(), found, group)
}

/// The codes of protocol.json's `refusals.codes` (every group), for checking that a refusal names a known one.
pub fn is_code(code: &str) -> bool {
    let p = &crate::spec().protocol;
    get(p, "refusals.codes")
        .and_then(Value::as_object)
        .is_some_and(|groups| groups.values().any(|g| g.get(code).is_some()))
}

fn per_unit(value: Option<&Value>) -> bool {
    value
        .and_then(Value::as_object)
        .is_some_and(|m| m.contains_key("per"))
}

fn hashes_text(value: Option<&Value>) -> Vec<String> {
    match value {
        None => vec![],
        Some(Value::Array(a)) => a.iter().map(|x| text(Some(x))).collect(),
        Some(other) => vec![text(Some(other))],
    }
}

// A side signs for itself, or a member signs as it (refs.as), or an agent under its grant (refs.under).
fn speaks_for(refs: &Value, side: Option<&Value>) -> bool {
    side.is_some()
        && (strict_eq(refs.get("author"), side)
            || strict_eq(refs.get("as"), side)
            || truthy(refs.get("under")))
}

// FREQ=(SECONDLY|...|YEARLY)(;[A-Z]+=[A-Za-z0-9,:+-]+)*: an RFC 5545 RRULE value.
fn rrule(value: &str) -> bool {
    let mut parts = value.split(';');
    let first = parts.next().unwrap_or("");
    let freq = [
        "SECONDLY", "MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY",
    ];
    let ok_first = first
        .strip_prefix("FREQ=")
        .is_some_and(|f| freq.contains(&f));
    ok_first
        && parts.all(|p| {
            p.split_once('=').is_some_and(|(k, v)| {
                !k.is_empty()
                    && k.bytes().all(|b| b.is_ascii_uppercase())
                    && !v.is_empty()
                    && v.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b",:+-".contains(&b))
            })
        })
}

/// What is wrong with a FoodBlock 1.6 block under the given protocol.json: `[{ code, detail }]`, one entry per rule
/// found, in the order of protocol.json's `refusals.codes.block` (empty when it is well-formed). Strict: only the 1.6
/// words.
pub fn refusals_with(
    spec: &Spec,
    type_name: &str,
    state: &Value,
    refs: &Value,
    options: CheckOptions,
) -> Vec<Refusal> {
    ordered_with(
        spec,
        Checker { spec }.findings(type_name, state, refs, options),
        "block",
    )
}

/// What is wrong with a FoodBlock 1.6 block: `[{ code, detail }]`, one entry per rule found, in the order of
/// protocol.json's `refusals.codes.block` (empty when it is well-formed). Options: `schemas` (hash → schema block) so a
/// named schema's fields and roles count as declared (a schema not among them is refused); `held` (hash → block) so
/// `at` is checked against what refs.after names and a child grant against its parent.
pub fn refusals(
    type_name: &str,
    state: &Value,
    refs: &Value,
    options: CheckOptions,
) -> Vec<Refusal> {
    refusals_with(crate::spec(), type_name, state, refs, options)
}

/// What is wrong with a FoodBlock 1.6 block, in plain words (each finding's detail), under the given protocol.json
/// (empty when it is well-formed). Strict: only the 1.6 words.
pub fn check_with(
    spec: &Spec,
    type_name: &str,
    state: &Value,
    refs: &Value,
    options: CheckOptions,
) -> Vec<String> {
    Checker { spec }
        .findings(type_name, state, refs, options)
        .into_iter()
        .map(|one| one.detail)
        .collect()
}

/// What is wrong with a FoodBlock 1.6 block, in plain words (empty when it is well-formed). Strict: only the 1.6 words.
pub fn check(type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> Vec<String> {
    check_with(crate::spec(), type_name, state, refs, options)
}

/// An amount: `amount("2.5", "kg")`. The value is a decimal string.
pub fn amount(value: &str, unit: &str) -> Value {
    json!({ "value": value, "unit": unit })
}
/// Money in whole minor units: `money(420, "GBP")` is £4.20.
pub fn money(minor: i64, currency: &str) -> Value {
    json!({ "minor": minor, "currency": currency })
}
/// A confidence from 0 to 1, as the decimal string 1.6 signs.
pub fn confidence(value: &str) -> Result<String> {
    if crate::spec().is("confidence", value) {
        Ok(value.to_string())
    } else {
        Err(Error::new("protocol: a confidence is from 0 to 1"))
    }
}
/// Terms on a promise; only the 1.6 terms given are kept.
pub fn terms(given: &Value) -> Value {
    let all = &crate::spec().terms;
    Value::Object(
        given
            .as_object()
            .map(|m| {
                m.iter()
                    .filter(|(k, v)| !v.is_null() && all.contains(k))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect()
            })
            .unwrap_or_default(),
    )
}
