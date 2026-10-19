//! The write check (core.md section 8, the checks that read a block's bytes): `refusals(type, state, refs)` says what is wrong with a block as every
//! node checks it before writing: `[{ code, detail }]`, one entry per rule found, in the order of protocol.json's
//! `refusals.codes.block` (empty when it is a well-formed 1.6 block). The code carries the meaning; the detail is free
//! text for people. `check` gives the details alone. Every list and grammar it reads comes from protocol.json; none is
//! written here. There is no earlier version to read: year zero.
use crate::canonical::{canonical, nfc};
pub use crate::error::Refusal;
use crate::error::{Error, Result};
use crate::js::{
    get, hash_of, int, is_obj, keys_within, number, number_of, rf, strict_eq, text, text_or_empty, truthy, type_of, Index,
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

/// A label (core.md section 7: `state.kind`, "a label"): a non-empty string. Not JavaScript truthiness, which lets `true`, `1`, an array or an object through.
fn is_label(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::String(s)) if !s.is_empty())
}

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
                .is_some_and(|u| !u.is_empty());
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
    // Money is { minor, currency }: `minor` whole minor units; `currency` an ISO 4217 code (grammar.currency) or an
    // issuer's own unit { issuer, unit, decimals } (protocol.json shapes.currency_unit). Never summed across currencies.
    fn money_shape(&self, value: Option<&Value>, name: &str) -> W {
        let Some(v) = value else { return vec![] };
        let ok = is_obj(Some(v))
            && keys_within(v, &self.list("shapes.money"))
            && int(v.get("minor")).is_some()
            && self.currency_ok(v.get("currency"));
        if ok {
            vec![]
        } else {
            s(
                "shape",
                format!("{name} is money: {{ minor (whole minor units), currency (an ISO 4217 code, or an issuer's {{ issuer, unit, decimals }}) }}"),
            )
        }
    }
    fn currency_ok(&self, currency: Option<&Value>) -> bool {
        match currency {
            Some(Value::String(c)) => self.spec.is("currency", c),
            Some(c @ Value::Object(_)) => {
                keys_within(c, &self.list("shapes.currency_unit"))
                    && self.list("shapes.currency_unit").iter().all(|k| c.get(k).is_some())
                    && self.is("id", c.get("issuer"))
                    && c.get("unit").and_then(Value::as_str).is_some_and(|u| !u.is_empty())
                    && int(c.get("decimals"))
                        .is_some_and(|d| d >= 0.0 && d <= self.spec.decimals_max as f64)
            }
            _ => false,
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
        if value.is_none() || self.is("id", value) {
            vec![]
        } else {
            s("grammar", format!("{name} is a hash"))
        }
    }
    #[allow(dead_code)]
    fn hash_list_shape(&self, value: Option<&Value>, name: &str) -> W {
        let ok = match value {
            None => true,
            Some(Value::Array(a)) => !a.is_empty() && a.iter().all(|i| self.test("id", Some(i))),
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
    // A time; or a range { from, to }; or relative { after, wait } (promises.md, Relative time). A schema-led window
    // may add not_before, not_after and takes (profiles/tasks.md).
    fn when_shape(&self, value: Option<&Value>, name: &str) -> W {
        let Some(v) = value else { return vec![] };
        if v.is_string() {
            return self.time_shape(value, name);
        }
        let mut allowed = self.list("shapes.when");
        allowed.extend(self.list("shapes.when_after"));
        let window = self.list("shapes.when_window");
        allowed.extend(window.iter().cloned());
        let range = v.get("from").is_some() && v.get("to").is_some();
        let relative = v.get("after").is_some() && v.get("wait").is_some();
        let windowed = window.iter().any(|k| v.get(k.as_str()).is_some());
        if !(is_obj(Some(v)) && keys_within(v, &allowed) && (range || relative || windowed)) {
            return s("shape", format!("{name} is a time, a range {{ from, to }}, or relative {{ after, wait }}"));
        }
        let mut wrong = vec![];
        if range {
            wrong.extend(self.time_shape(v.get("from"), &format!("{name}.from")));
            wrong.extend(self.time_shape(v.get("to"), &format!("{name}.to")));
            if wrong.is_empty() && text(v.get("from")) > text(v.get("to")) {
                return s("shape", format!("{name}.from is after its to"));
            }
        }
        if relative {
            wrong.extend(self.hash_shape(v.get("after"), &format!("{name}.after")));
            wrong.extend(self.duration_shape(v.get("wait"), &format!("{name}.wait")));
        }
        for k in ["not_before", "not_after"] {
            wrong.extend(self.time_shape(v.get(k), &format!("{name}.{k}")));
        }
        wrong.extend(self.duration_shape(v.get("takes"), &format!("{name}.takes")));
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
                && self.test("id", v.get("of"));
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
                if x == 0.0 && x.is_sign_negative() {
                    s("integer_range", format!("{path} is -0: write 0"))
                } else if n.is_f64() || !crate::js::is_whole(x) {
                    s("float", format!("{path} is a float; write a decimal string, money {{ minor, currency }} or an amount {{ value, unit }}"))
                } else if x < self.spec.int_min || x > self.spec.int_max {
                    s(
                        "integer_range",
                        format!("{path} is outside the whole numbers a block may hold (±(2^53 - 1))"),
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
            Value::Object(map) => map
                .iter()
                .flat_map(|(k, v)| self.numbers(v, &format!("{path}.{k}")))
                .collect(),
            _ => vec![],
        }
    }
    // Shapes are read at the places the protocol gives them, never by a field name deeper in (protocol.json `shapes.places`):
    // the fields of state, of terms and scope, and of each item of lines and split. A value at a place is read by its own
    // keys; the named bare fields (`shapes.places.bare`) hold such an object. A map nested under a field is data.
    fn shapes_in(&self, container: &Value, path: &str) -> W {
        let Value::Object(map) = container else { return vec![] };
        let (containers, lists, bare) = (
            self.list("shapes.places.containers"),
            self.list("shapes.places.lists"),
            self.list("shapes.places.bare"),
        );
        let mut w = vec![];
        for (k, v) in map {
            let here = format!("{path}.{k}");
            if bare.contains(k) && !v.is_object() {
                w.push(f("shape", format!("{here} is an object with its keys")));
            }
            w.extend(self.shape_value(v, &here));
            if containers.contains(k) {
                w.extend(self.shapes_in(v, &here));
            } else if lists.contains(k) {
                if let Value::Array(items) = v {
                    for (i, item) in items.iter().enumerate() {
                        w.extend(self.shapes_in(item, &format!("{here}[{i}]")));
                    }
                }
            }
        }
        w
    }
    // A value at a place, read by its own keys (an array: each item); a composite shape's parts are read as it says.
    fn shape_value(&self, value: &Value, path: &str) -> W {
        match value {
            Value::Array(items) => items
                .iter()
                .enumerate()
                .flat_map(|(i, item)| self.shape_value(item, &format!("{path}[{i}]")))
                .collect(),
            Value::Object(map) => {
                let mut w = if map.contains_key("unit") && keys_within(value, &self.list("shapes.amount")) {
                    self.amount_shape(Some(value), path)
                } else if map.contains_key("minor") && keys_within(value, &self.list("shapes.money")) {
                    self.money_shape(Some(value), path)
                } else {
                    vec![]
                };
                let composite = (map.contains_key("money") && map.contains_key("per"))
                    || (map.contains_key("min") && map.contains_key("max"))
                    || map.contains_key("radius");
                if composite {
                    for part in ["money", "per", "min", "max", "radius"] {
                        if let Some(v) = map.get(part) {
                            if part == "money" && !v.is_object() {
                                w.push(f("shape", format!("{path}.{part} is an object with its keys")));
                            }
                            w.extend(self.shape_value(v, &format!("{path}.{part}")));
                        }
                    }
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
                        if !self.test("id", line.get("what")) {
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
        // A key, member or operator grant (and a profile's own kinds) carries no scope.until; a grant others act under always does.
        let profile_kinds = self.profile_grant_kinds();
        let own = kind
            .and_then(Value::as_str)
            .filter(|k| self.spec.grant_kinds.iter().any(|g| g == k) || profile_kinds.iter().any(|g| g == k));
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
        if !scope
            .get("acts")
            .is_none_or(|a| a.as_array().is_some_and(|a| a.iter().all(Value::is_string)))
        {
            w.push(f("shape", "scope.acts lists acts"));
        }
        if !scope.get("parties").is_none_or(|a| {
            a.as_array()
                .is_some_and(|a| a.iter().all(|p| self.test("id", Some(p))))
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
            .filter(|a| !a.is_empty() && a.iter().all(|w| self.test("id", Some(w))))
        else {
            return s(
                "audience",
                "state.audience is \"public\" or a list of commitments (salted hashes)",
            );
        };
        let mut w = vec![];
        let sorted = list
            .windows(2)
            .all(|p| crate::js::cmp16(&text(Some(&p[0])), &text(Some(&p[1]))).is_lt());
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

    // ---- Suites and keys (core.md, Suites) ----
    // The suite a block's state names for its key: `state.suite`, else the default. `unknown_suite` when the name is
    // not a row of protocol.json `suites`.
    fn suite_named(&self, name_value: Option<&Value>, field: &str, w: &mut W) -> Option<String> {
        match name_value {
            None => Some(self.spec.suite_default.clone()),
            Some(Value::String(n)) if self.spec.suite(n).is_some() => Some(n.clone()),
            Some(other) => {
                w.push(f(
                    "unknown_suite",
                    format!(
                        "state.{field} names {}, which is not a suite this reader knows ({})",
                        text(Some(other)),
                        self.spec.suites.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(", ")
                    ),
                ));
                None
            }
        }
    }
    // A key against its suite's grammar; a key outside it is `unknown_suite` (protocol.json refusals.codes.block).
    fn key_in_suite(&self, key: Option<&Value>, suite: &Option<String>, what: &str, encrypt: bool, w: &mut W) {
        let (Some(key), Some(suite)) = (key, suite) else { return };
        let Some(info) = self.spec.suite(suite) else { return };
        let (rule, re) = if encrypt { (&info.encrypt_key_rule, &info.encrypt_key_re) } else { (&info.sign_key_rule, &info.sign_key_re) };
        let ok = matches!(key, Value::String(k) if re.as_ref().is_some_and(|r| r.test(k)));
        if !ok {
            w.push(f(
                "unknown_suite",
                format!("state.{what} is not a key of the suite {suite} ({rule})"),
            ));
        }
    }
    // A signing key of any suite (a key named without its suite beside it: `replaces`, `recovery_key`, `orderer`).
    fn any_sign_key(&self, key: Option<&Value>, what: &str, w: &mut W) {
        let Some(key) = key else { return };
        let ok = matches!(key, Value::String(k) if self.spec.suites.iter().any(|s| s.sign_key_re.as_ref().is_some_and(|r| r.test(k))));
        if !ok {
            w.push(f("unknown_suite", format!("state.{what} is a signing key of one of the suites")));
        }
    }
    // state.suite, public_key_sign, public_key_encrypt, recovery_suite on a genesis or a key grant.
    fn key_checks(&self, state: &Value) -> W {
        let mut w: W = vec![];
        let g = |k: &str| state.get(k);
        let suite = self.suite_named(g("suite"), "suite", &mut w);
        self.key_in_suite(g("public_key_sign"), &suite, "public_key_sign", false, &mut w);
        self.key_in_suite(g("public_key_encrypt"), &suite, "public_key_encrypt", true, &mut w);
        if g("recovery_suite").is_some() {
            self.suite_named(g("recovery_suite"), "recovery_suite", &mut w);
        }
        w
    }

    // The genesis (core.md section 4): the one block with no author, prev, after or seq; public, naming kind, at,
    // audience and its signing key. A suite, an encryption key, a custodian and the recovery pair are optional.
    // What is missing or extra is `bad_genesis`; what is there but malformed is its grammar's code.
    fn genesis_errors(&self, state: &Value, refs: &Value) -> W {
        let required = &self.spec.genesis_required;
        let optional = &self.spec.genesis_optional;
        let mut w: W = refs
            .as_object()
            .unwrap()
            .keys()
            .map(|k| f("bad_genesis", format!("a genesis has no refs (refs.{k})")))
            .collect();
        for k in state.as_object().unwrap().keys() {
            if !required.contains(k) && !optional.contains(k) {
                w.push(f(
                    "bad_genesis",
                    format!(
                        "a genesis names only {}, and {} if it has them (state.{k})",
                        required.join(", "),
                        optional.join(", ")
                    ),
                ));
            }
        }
        for k in required {
            if state.get(k).is_none() {
                w.push(f("bad_genesis", format!("a genesis names state.{k}")));
            }
        }
        if state.get("kind").is_some() && !is_label(state.get("kind")) {
            w.push(f("bad_genesis", "state.kind says what they are"));
        }
        if state.get("audience").is_some() && state.get("audience").and_then(Value::as_str) != Some("public") {
            w.push(f(
                "bad_genesis",
                "a genesis is public: anyone checks signatures against its key",
            ));
        }
        w.extend(self.key_checks(state));
        let pair = state.get("recovery_key_hash").is_some() as u8 + state.get("recovery_reach").is_some() as u8;
        if pair == 1 {
            w.push(f(
                "bad_genesis",
                "recovery_key_hash and recovery_reach come together or not at all",
            ));
        }
        if state.get("recovery_suite").is_some() && pair != 2 {
            w.push(f("bad_genesis", "recovery_suite goes with the recovery pair"));
        }
        w.extend(self.hash_shape(state.get("recovery_key_hash"), "state.recovery_key_hash"));
        w.extend(self.duration_shape(state.get("recovery_reach"), "state.recovery_reach"));
        w.extend(self.hash_shape(state.get("custodian"), "state.custodian"));
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
            .is_some_and(|x| self.spec.statuses.iter().any(|a| a == x))
        {
            w.push(f(
                "bad_status",
                format!("state.status is one of {}", self.spec.statuses.join(", ")),
            ));
        }
        if status.as_str() == Some("stopped") {
            w.extend(self.stop_shape(state.get("stop")));
        } else if state.get("stop").is_some() {
            w.push(f("bad_status", "state.stop goes with status stopped"));
        }
        w
    }

    // The powers a circle role may hold: the protocol's, and every optional profile's (a node that has never heard of
    // a profile still accepts a block that uses its power).
    fn all_powers(&self) -> Vec<String> {
        let mut out = self.spec.powers.clone();
        if let Some(Value::Object(profiles)) = self.spec.protocol.get("optional_profiles") {
            for p in profiles.values() {
                out.extend(crate::spec::strings_pub(p.get("powers")));
            }
        }
        out
    }
    // Every field, over all optional profiles, that a profile adds to `where_` (`every`, `grant`...).
    fn profile_fields(&self, where_: &str) -> Vec<String> {
        let mut out = Vec::new();
        if let Some(Value::Object(profiles)) = self.spec.protocol.get("optional_profiles") {
            for p in profiles.values() {
                out.extend(crate::spec::strings_pub(p.get("fields").and_then(|x| x.get(where_))));
            }
        }
        out
    }
    fn profile_grant_kinds(&self) -> Vec<String> {
        let mut out = Vec::new();
        if let Some(Value::Object(profiles)) = self.spec.protocol.get("optional_profiles") {
            for p in profiles.values() {
                out.extend(crate::spec::strings_pub(p.get("grant_kinds")));
            }
        }
        out
    }

    // A circle's roles: [{ name, powers }], the powers from the closed list (and the profiles'); the founder holds
    // the first role, so the list is not empty.
    fn roles_shape(&self, roles: Option<&Value>, circle: bool) -> W {
        let allowed = self.all_powers();
        match roles {
            None => {
                if circle {
                    s("bad_roles", "a circle lists its roles: state.roles [{ name, powers }]; the founder holds the first")
                } else {
                    vec![]
                }
            }
            Some(Value::Array(list)) if !list.is_empty() => {
                let mut w = vec![];
                for (i, role) in list.iter().enumerate() {
                    let ok = is_obj(Some(role))
                        && keys_within(role, &["name".to_string(), "powers".to_string()])
                        && role.get("name").and_then(Value::as_str).is_some_and(|n| !n.is_empty())
                        && role.get("powers").and_then(Value::as_array).is_some_and(|p| {
                            p.iter().all(|x| x.as_str().is_some_and(|x| allowed.iter().any(|a| a == x)))
                        });
                    if !ok {
                        w.push(f(
                            "bad_roles",
                            format!("state.roles[{i}] is {{ name (text), powers (from {}) }}", allowed.join(", ")),
                        ));
                    }
                }
                w
            }
            Some(_) => s("bad_roles", "state.roles is a list of roles with at least the founder's first role"),
        }
    }

    fn rules(&self, type_name: &str, state: &Value, refs: &Value, held: Option<&Index>) -> W {
        let g = |k: &str| state.get(k);
        let r = |k: &str| refs.get(k);
        let mut w: W = vec![];
        // An answer (refs.answers) or the author stopping their own (updates with a status) is exempt from the
        // type's required fields (core.md, section 7).
        let answering = truthy(r("answers")) || (truthy(r("updates")) && g("status").is_some());
        // An answer carries a status (core.md section 7); the one exception is a counter-offer, a promise that answers with no status.
        if truthy(r("answers")) && g("status").is_none() && type_name != "promise" {
            w.push(f("required", "an answer carries state.status"));
        }
        match type_name {
            "actor" => {
                if !is_label(g("kind")) {
                    w.push(f("required", "state.kind says what it is: a person, an agent, a circle, a contact"));
                }
                for key in ["public_key_sign", "recovery_key_hash", "recovery_reach", "recovery_suite", "suite"] {
                    if g(key).is_some() {
                        w.push(f(
                            "undeclared_field",
                            format!("only a genesis names state.{key}; a key comes in by a key grant"),
                        ));
                    }
                }
                let kind = g("kind").and_then(Value::as_str);
                if kind == Some("contact") && g("public_key_encrypt").is_some() {
                    w.push(f("undeclared_field", "a contact has no keys"));
                }
                w.extend(self.roles_shape(g("roles"), kind == Some("circle")));
                if !g("removal").is_none_or(|x| {
                    is_obj(Some(x))
                        && keys_within(x, &self.list("circle.removal"))
                        && int(x.get("needed")).is_some_and(|n| n >= 1.0)
                }) {
                    w.push(f("shape", "state.removal is { needed: N }, how many other holders of remove must agree to remove one who holds admit or remove"));
                }
                w.extend(self.marks_shape(g("marks"), "state.marks"));
                w.extend(self.hash_shape(g("custodian"), "state.custodian"));
                if g("public_key_encrypt").is_some() {
                    w.extend(self.key_checks(&json!({ "public_key_encrypt": g("public_key_encrypt") })));
                }
            }
            "transfer" => {
                if !answering {
                    // Money moves by transfer too, naming no thing (things.md): a payment is `to_owner`, `for` and `money`.
                    if !truthy(r("what")) && g("money").is_none() {
                        w.push(f("required", "a transfer names what moved: refs.what (a payment of state.money names none)"));
                    }
                    if !(truthy(r("to_owner"))
                        || truthy(r("to_holder"))
                        || truthy(r("to_place"))
                        || g("count").is_some())
                    {
                        w.push(f("required", "a transfer says what changed (refs.to_owner, to_holder, to_place), or how many received (state.count)"));
                    }
                }
                w.extend(self.status_shape(state, refs));
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
                                        format!("state.split[{i}].for is one of what it is for (refs.for)"),
                                    ));
                                }
                                if part.get("money").is_none() {
                                    w.push(f("shape", format!("state.split[{i}].money says how much")));
                                }
                                if !part.get("line").is_none_or(Value::is_string) {
                                    w.push(f("shape", format!("state.split[{i}].line is a line id")));
                                }
                            }
                        }
                    }
                }
            }
            "promise" => {
                // Who signs for a side: the author, the circle it signs as, or the grantor of the grant it acts under (the grant's
                // author, or the circle that grant was signed as). `None` when the grant is not held: the sides cannot be judged yet.
                let principals: Option<Vec<Option<&Value>>> = match r("under") {
                    None => Some(vec![]),
                    Some(u) => u.as_str().and_then(|u| held.and_then(|h| h.get(u))).map(|gr| vec![rf(gr, "author"), rf(gr, "as")]),
                };
                let speaks_for = |side: Option<&Value>| {
                    side.is_some()
                        && (strict_eq(r("author"), side)
                            || strict_eq(r("as"), side)
                            || principals.as_ref().is_some_and(|p| p.iter().any(|x| strict_eq(*x, side))))
                };
                // A side that names a thing it holds is judged by the fold, not here: who owns the thing is not a block this one
                // needs (promises.md, Bearer; core.md, invariant 25).
                let speaks = |side: Option<&Value>| {
                    speaks_for(side)
                        || side
                            .and_then(Value::as_str)
                            .zip(held)
                            .is_some_and(|(id, h)| h.get(id).is_some_and(|t| type_of(t) == "thing"))
                };
                let (from_speaks, to_speaks) = (speaks(r("from")), speaks(r("to")));
                let asked = to_speaks && !from_speaks;
                w.extend(self.status_shape(state, refs));
                if !answering && r("what").is_none() && g("what").is_none() {
                    w.push(f("required", "a promise names what moves: refs.what, or state.what for time or a job"));
                }
                if !answering && principals.is_some() && !(from_speaks || to_speaks) {
                    w.push(f("not_a_side", "a promise is signed by a side: from (an offer) or to (an ask), as it, or under its grant"));
                }
                if !answering && asked && !is_time(get(state, "terms.expires")) {
                    w.push(f("ask_without_expires", "every ask carries terms.expires"));
                }
                // A deal block names the deal's first promise in refs.for, exactly; it is signed by a side of the deal.
                let target = r("answers").or(r("updates")).and_then(Value::as_str).and_then(|h| held.and_then(|h2| h2.get(h)));
                if truthy(r("answers")) && !truthy(r("for")) {
                    w.push(f("deal_not_named", "an answer or a counter names its deal in refs.for (the first promise)"));
                } else if let (Some(t), true) = (target, truthy(r("answers"))) {
                    let first = if truthy(rf(t, "answers")) { rf(t, "for").and_then(Value::as_str) } else { Some(hash_of(t)) };
                    if first.is_some() && r("for").and_then(Value::as_str) != first {
                        w.push(f("deal_not_named", "refs.for is the deal's first promise"));
                    }
                }
                if let (Some(t), true) = (target.filter(|t| type_of(t) == "promise"), principals.is_some()) {
                    let (tf, tt) = (rf(t, "from"), rf(t, "to"));
                    let is_side = |side: Option<&Value>| speaks(side);
                    // An answer is judged once both sides are named; an `updates` (a stop) is the author's, whatever the sides, and an allocation (an
                    // answer, with no sides of its own) is stopped by its author without the check judging whose side that is.
                    let judged = (tf.is_some() && tt.is_some()) || (r("answers").is_none() && r("updates").is_some() && (tf.is_some() || tt.is_some()));
                    if answering && judged && !(tf.is_some() && is_side(tf)) && !(tt.is_some() && is_side(tt)) {
                        w.push(f("not_a_side", "a deal block is signed by a side of the deal, as it, or under its grant"));
                    }
                }
                if !g("not").is_none_or(|n| n == &Value::Bool(true)) {
                    w.push(f("shape", "state.not is true (a promise not to do the step), or left out"));
                }
                if !g("what").is_none_or(|x| x.is_string() || x.is_object()) {
                    w.push(f("shape", "state.what describes time or a job (text, or data under a schema)"));
                }
                w.extend(self.terms_shape(g("terms"), refs, state));
            }
            "grant" => {
                if !answering && !is_label(g("kind")) {
                    w.push(f("required", "state.kind says what authority it gives"));
                }
                w.extend(self.status_shape(state, refs));
                w.extend(self.whole_shape(g("depth"), "state.depth", 0.0));
                if let Some(scope) = g("scope") {
                    w.extend(self.scope_shape(scope, g("kind")));
                } else if !answering {
                    // A grant others act under carries scope.until: with no scope there is none.
                    let profile_kinds = self.profile_grant_kinds();
                    let own = g("kind").and_then(Value::as_str).is_some_and(|k| {
                        self.spec.grant_kinds.iter().any(|x| x == k) || profile_kinds.iter().any(|x| x == k)
                    });
                    if is_label(g("kind")) && !own {
                        w.push(f("scope_until", "a grant others act under carries scope.until (a UTC time)"));
                    }
                }
                if !(answering || truthy(r("answers"))) {
                    match g("kind").and_then(Value::as_str) {
                        Some("key") => w.extend(self.key_grant_shape(state, refs)),
                        Some("member") => w.extend(self.member_shape(state, refs)),
                        Some("operator") => {
                            if !truthy(r("to")) {
                                w.push(f("required", "an operator grant names the agent or machine it answers for (refs.to)"));
                            }
                        }
                        #[cfg(feature = "successor")]
                        Some("successor") => w.extend(self.successor_shape(state, refs)),
                        _ => {}
                    }
                }
                w.extend(self.hash_shape(g("counted_to"), "state.counted_to"));
            }
            _ => {}
        }
        w
    }

    fn key_grant_shape(&self, state: &Value, refs: &Value) -> W {
        let g = |k: &str| state.get(k);
        let mut w = vec![];
        if !truthy(refs.get("subject")) {
            w.push(f("required", "a key grant names the id it is for (refs.subject)"));
        }
        if g("public_key_sign").is_none() && g("public_key_encrypt").is_none() && g("recovery_key_hash").is_none() {
            w.push(f(
                "required",
                "a key grant names the new key (state.public_key_sign or public_key_encrypt) or the recovery pair",
            ));
        }
        w.extend(self.key_checks(state));
        if g("replaces").is_none() != g("counted_to").is_none() {
            w.push(f("required", "a rotation names both the key it replaces and that key's counted_to block"));
        }
        self.any_sign_key(g("replaces"), "replaces", &mut w);
        w.extend(self.hash_shape(g("counted_to"), "state.counted_to"));
        w.extend(self.hash_shape(g("custodian"), "state.custodian"));
        self.any_sign_key(g("recovery_key"), "recovery_key", &mut w);
        if g("recovery_key_hash").is_none() != g("recovery_reach").is_none() {
            w.push(f("required", "adding recovery names both recovery_key_hash and recovery_reach"));
        }
        w.extend(self.hash_shape(g("recovery_key_hash"), "state.recovery_key_hash"));
        w.extend(self.duration_shape(g("recovery_reach"), "state.recovery_reach"));
        #[cfg(feature = "rekeys")]
        if g("epoch").is_some() {
            w.extend(self.whole_shape(g("epoch"), "state.epoch", 1.0));
            if !truthy(refs.get("as")) {
                w.push(f("required", "a rekey (state.epoch) is signed as the circle (refs.as)"));
            }
            if g("keys").is_none() || !truthy(refs.get("after")) {
                w.push(f("required", "a rekey holds the new private key sealed to each member (state.keys) and names epoch n-1 in refs.after"));
            }
        }
        w
    }
    fn member_shape(&self, state: &Value, refs: &Value) -> W {
        let mut w = vec![];
        if !truthy(refs.get("subject")) {
            w.push(f("required", "a member grant names the circle (refs.subject)"));
        }
        if !strict_eq(refs.get("as"), refs.get("subject")) {
            w.push(f("required", "a member grant is signed as the circle (refs.as)"));
        }
        if !state.get("roles").is_none_or(|x| {
            x.as_array()
                .is_some_and(|a| a.iter().all(|r| r.as_str().is_some_and(|r| !r.is_empty())))
        }) {
            w.push(f("shape", "state.roles lists the role names it gives (text)"));
        }
        w
    }
    #[cfg(feature = "successor")]
    fn successor_shape(&self, state: &Value, refs: &Value) -> W {
        let g = |k: &str| state.get(k);
        let mut w = vec![];
        if !truthy(refs.get("to")) {
            w.push(f("required", "a successor grant names the successor (refs.to)"));
        }
        if g("witnesses").is_none() {
            w.push(f("required", "state.witnesses names who may record the event"));
        } else {
            w.extend(self.hash_list_shape(g("witnesses"), "state.witnesses"));
        }
        let count = g("witnesses").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0) as f64;
        if !int(g("needed")).is_some_and(|n| n >= 1.0 && n <= count) {
            w.push(f("shape", "state.needed is how many witnesses must record it (1 to their number)"));
        }
        if g("wait").is_none() {
            w.push(f("required", "state.wait is how long the trigger waits (a duration)"));
        } else {
            w.extend(self.duration_shape(g("wait"), "state.wait"));
        }
        if g("public_key_sign").is_some() {
            w.push(f("undeclared_field", "a successor gets decryption keys only, never signing keys"));
        }
        w
    }

    // The fields and ref keys a closed block may name: the base, the profiles', and what its schema declares (when
    // the reader holds it).
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
        fields.extend(self.profile_fields("every"));
        fields.extend(self.profile_fields(type_name));
        if let Some(Value::Object(f)) = schema.and_then(|s| get(s, "state.fields")) {
            fields.extend(f.keys().cloned());
        }
        let mut roles = self.spec.ref_keys.clone();
        if let Some(Value::Array(r)) = schema.and_then(|s| get(s, "state.roles")) {
            roles.extend(r.iter().map(|x| text(Some(x))));
        }
        Some((fields, roles))
    }

    // Strict writing (canonical.md): a null, a set not sorted or with a repeat, text or a key outside NFC. All are
    // `not_canonical`. (A float or an integer out of range is its own code, in `numbers`.)
    fn strict(&self, value: &Value, path: &str, in_refs_top: bool) -> W {
        match value {
            Value::Null => s("not_canonical", format!("{path} is null: leave the key out")),
            Value::String(t) if nfc(t).as_ref() != t.as_str() => {
                s("not_canonical", format!("{path} is not Unicode NFC"))
            }
            Value::Array(items) => {
                let mut w: W = vec![];
                if in_refs_top && items.iter().all(Value::is_string) {
                    let strs: Vec<&str> = items.iter().filter_map(Value::as_str).collect();
                    let sorted = strs.windows(2).all(|p| crate::js::cmp16(p[0], p[1]).is_lt());
                    if !sorted {
                        w.push(f("not_canonical", format!("{path} is a set: ascending UTF-16 order, no repeats")));
                    }
                }
                for (i, item) in items.iter().enumerate() {
                    w.extend(self.strict(item, &format!("{path}[{i}]"), false));
                }
                w
            }
            Value::Object(map) => {
                let mut w: W = vec![];
                for (k, v) in map {
                    if nfc(k).as_ref() != k.as_str() {
                        w.push(f("not_canonical", format!("{path} has a key not written in NFC ({})", Value::String(k.clone()))));
                    }
                    w.extend(self.strict(v, &format!("{path}.{k}"), in_refs_top && path == "refs"));
                }
                w
            }
            _ => vec![],
        }
    }

    // Stage 1 and the number rules: what a strict writer never writes.
    fn strict_all(&self, state: &Value, refs: &Value) -> W {
        let mut w = self.strict(state, "state", false);
        w.extend(self.strict(refs, "refs", true));
        w.extend(self.numbers(state, "state"));
        w.extend(self.numbers(refs, "refs"));
        w
    }

    // The ids a block names (refs): each a hash or a set of hashes in the grammar of ids; a prefix names a hash.
    fn refs_grammar(&self, refs: &Value) -> W {
        let mut w = vec![];
        for (key, value) in refs.as_object().unwrap() {
            let items: Vec<&Value> = match value {
                Value::Array(a) => a.iter().collect(),
                other => vec![other],
            };
            if value.is_array() && self.spec.list("refs_single").iter().any(|k| k == key) {
                w.push(f("grammar", format!("refs.{key} is one id")));
                continue;
            }
            if items.is_empty() || !items.iter().all(|h| self.is("id", Some(h))) {
                w.push(f("grammar", format!("refs.{key} is an id or a set of ids (64 lowercase hex, a hash name and a colon before any hash but SHA-256)")));
                continue;
            }
            for h in items {
                if let Some((name, _)) = h.as_str().and_then(|t| t.split_once(':')) {
                    if !self.spec.protocol.get("hashes").and_then(Value::as_object).is_some_and(|hs| {
                        hs.values().any(|h| h.get("prefix").and_then(Value::as_str) == Some(&format!("{name}:")))
                    }) {
                        w.push(f("unknown_suite", format!("refs.{key} names the hash {name}, which this reader does not know")));
                    }
                }
            }
        }
        w
    }

    // The field-level value rules that hold for every block, whatever its type (core.md, section 3).
    fn values(&self, state: &Value, refs: &Value, genesis: bool) -> W {
        let g = |k: &str| state.get(k);
        let mut w: W = vec![];
        w.extend(self.numbers_only_shapes(state, refs, genesis));
        if !g("confidence").is_none_or(|c| self.is("confidence", Some(c))) {
            w.push(f("grammar", "state.confidence is a decimal string from 0 to 1"));
        }
        // Fields that hold an id, wherever they are written (core.md section 3, grammar): the block counted to, a custodian, a recovery
        // hash, who assisted, the parties of an admission, who settles a dispute.
        for key in ["counted_to", "custodian", "recovery_key_hash", "assisted_by"] {
            w.extend(self.hash_shape(g(key), &format!("state.{key}")));
        }
        if let Some(p) = g("parties") {
            let items: Vec<&Value> = match p {
                Value::Array(a) => a.iter().collect(),
                other => vec![other],
            };
            for id in items {
                w.extend(self.hash_shape(Some(id), "state.parties"));
            }
        }
        if let Some(by) = state.get("terms").and_then(|t| t.get("settled_by")) {
            w.extend(self.hash_shape(Some(by), "terms.settled_by"));
        }
        // Keys and suites, wherever they are written (core.md, Suites): a key outside its suite's grammar, or a suite not known.
        w.extend(self.key_checks(state));
        for key in ["replaces", "recovery_key", "orderer"] {
            self.any_sign_key(g(key), key, &mut w);
        }
        if !g("lang").is_none_or(|l| self.is("lang", Some(l))) {
            w.push(f("grammar", "state.lang is a BCP 47 language tag (sw, pt-BR)"));
        }
        if !g("nonce").is_none_or(|n| self.is("nonce", Some(n))) {
            w.push(f("grammar", "state.nonce is 16 random bytes, hex"));
        }
        for flag in ["skip", "withheld"] {
            if !g(flag).is_none_or(|v| v == &Value::Bool(true)) {
                w.push(f("shape", format!("state.{flag} is true, or left out")));
            }
        }
        if !g("line").is_none_or(Value::is_string) {
            w.push(f("shape", "state.line is a line id"));
        }
        if !g("channel").is_none_or(Value::is_string) {
            w.push(f("shape", "state.channel is an open label (sms, ussd, voice, letter, meeting)"));
        }
        w
    }
    fn numbers_only_shapes(&self, state: &Value, _refs: &Value, genesis: bool) -> W {
        // Times, dates and durations are read where the protocol checks them (`time_fields_checked_in`): the state, its terms and
        // scope, and each line of its terms.
        let mut w: W = vec![];
        for (path, place) in time_places(state) {
            w.extend(self.times_in(Some(place), &path));
            w.extend(self.durations_in(Some(place), &path));
        }
        if state.get("audience").is_some() && !genesis {
            w.extend(self.audience_shape(state));
        }
        w.extend(self.where_shape(state.get("where")));
        w.extend(self.shapes_in(state, "state"));
        w
    }
    fn durations_in(&self, object: Option<&Value>, path: &str) -> W {
        let Some(Value::Object(map)) = object else { return vec![] };
        let names = self.list("duration_fields");
        let mut w = vec![];
        for (key, value) in map {
            if names.iter().any(|n| n == key) && !(key == "per" && value.is_object()) {
                w.extend(self.duration_shape(Some(value), &format!("{path}.{key}")));
            }
        }
        w
    }

    // The content checks of a block, in the stages of core.md section 8 that look at its bytes alone. Signature,
    // key and chain (stages 5 and 6) need the context: `valid`.
    fn findings(&self, type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> (W, W) {
        let mut w = vec![];
        if !self.spec.is("type_name", type_name) {
            w.push(f("type_name", format!("{type_name} is not a type name (a lowercase word: letters, digits, underscore)")));
        }
        if !state.is_object() || !refs.is_object() {
            w.push(f("not_canonical", "a block is exactly { type, state, refs }, state and refs objects"));
            return (w, vec![]);
        }
        w.extend(self.strict_all(state, refs));
        w.extend(self.refs_grammar(refs));
        if canonical(type_name, state, refs).len() > self.spec.block_bytes {
            w.push(f(
                "size_limit",
                format!(
                    "a block's canonical body is at most {} bytes; link larger content by its hash",
                    self.spec.block_bytes
                ),
            ));
        }
        if let Some(a) = refs.get("after") {
            let n = a.as_array().map(|x| x.len()).unwrap_or(1);
            if n > self.spec.after_heads {
                w.push(f(
                    "after_limit",
                    format!("refs.after names at most {} heads", self.spec.after_heads),
                ));
            }
        }
        let g = |k: &str| state.get(k);
        // A genesis names its own signing key. (Only a genesis does; core.md section 4.)
        // core.md section 4: a genesis is the one actor with no author. An actor with no author and no key is a malformed genesis.
        if type_name == "actor" && (g("public_key_sign").is_some() || !truthy(refs.get("author"))) {
            w.extend(self.genesis_errors(state, refs));
            w.extend(self.values(state, refs, true));
            return (w, vec![]);
        }
        // Any other block: the common five (core.md, section 5).
        let clockless_ok = matches!(type_name, "observe" | "transform" | "transfer");
        if !truthy(refs.get("author")) {
            w.push(f("chain", "refs.author names who said it"));
        }
        if !int(g("seq")).is_some_and(|n| n >= 1.0) {
            w.push(f("chain", "state.seq is its place in its signing key's chain (1, 2, 3...)"));
        }
        if !truthy(refs.get("prev")) {
            w.push(f("chain", "refs.prev names the key's previous block (or the block that brought the key in)"));
        }
        if g("audience").is_none() {
            w.push(f("chain", "state.audience is public, or a sorted list of commitments"));
        }
        if g("at").is_none() && !clockless_ok {
            w.push(f("at_missing", "state.at is when it was said (only an observe, transform or transfer may leave it out, with no clock)"));
        }
        w.extend(self.values(state, refs, false));
        let mut c: W = vec![];
        if let (Some(held), "grant", true) = (options.held, type_name, truthy(refs.get("parent"))) {
            if let Some(parent) = held.get(&text(refs.get("parent"))) {
                c.extend(crate::grant::scope_refusals(&json!({ "state": state, "refs": refs }), parent));
            }
        }
        // A closed type: its fields are fixed (core.md, Open types, closed authority). An open type stops here.
        if !self.spec.is_closed(type_name) {
            return (w, c);
        }
        match self.declared(type_name, refs, options.schemas) {
            None => {
                if options.schemas.is_some() {
                    c.push(f(
                        "undeclared_ref",
                        "refs.schema names a schema this node does not hold: ask for it",
                    ));
                }
            }
            Some((fields, roles)) => {
                for key in refs.as_object().unwrap().keys() {
                    if !roles.contains(key) {
                        c.push(f(
                            "undeclared_ref",
                            format!("refs.{key} is not declared (the shared refs, or the schema's roles)"),
                        ));
                    }
                }
                for key in state.as_object().unwrap().keys() {
                    if !fields.contains(key) {
                        c.push(f("undeclared_field", format!("state.{key} is not declared for {type_name} (its base fields, or the schema's)")));
                    }
                }
            }
        }
        c.extend(self.rules(type_name, state, refs, options.held));
        (w, c)
    }
}

/// Findings as a refusal list: one entry per code, in the order of `group` (a group of protocol.json's
/// `refusals.codes`: block, fold or message), the details of one code joined with "; " (each once).
pub fn ordered_with(spec: &Spec, found: Vec<Refusal>, group: &str) -> Vec<Refusal> {
    // protocol.json lists a block's codes in the order of the checks in core.md section 8.
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
/// The places a block's time, date and duration fields are checked (protocol.json `time_fields_checked_in`): its state, its
/// terms, its scope and each line of its terms.
fn time_places(state: &Value) -> Vec<(String, &Value)> {
    let mut out = vec![("state".to_string(), state)];
    if let Some(t) = state.get("terms").filter(|t| t.is_object()) {
        out.push(("terms".to_string(), t));
        if let Some(Value::Array(lines)) = t.get("lines") {
            out.extend(lines.iter().enumerate().map(|(i, l)| (format!("terms.lines[{i}]"), l)));
        }
    }
    if let Some(sc) = state.get("scope").filter(|t| t.is_object()) {
        out.push(("scope".to_string(), sc));
    }
    out
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

/// What a strict writer never writes (canonical.md): a null, an unsorted set, text outside NFC, a float, a number out
/// of range. `create` refuses a block with any.
pub fn strict_findings(type_name: &str, state: &Value, refs: &Value) -> Vec<Refusal> {
    let _ = type_name;
    if !state.is_object() || !refs.is_object() {
        return vec![];
    }
    Checker { spec: crate::spec() }.strict_all(state, refs)
}

/// Every finding of the content checks, unordered (the caller orders the whole list once).
pub fn findings_with(spec: &Spec, type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> Vec<Refusal> {
    let (mut bytes, closed) = Checker { spec }.findings(type_name, state, refs, options);
    bytes.extend(closed);
    bytes
}

/// The findings of the bytes (checks 1 to 4 of core.md section 8) and, apart, a closed type's own (check 8).
pub fn findings_staged(spec: &Spec, type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> (Vec<Refusal>, Vec<Refusal>) {
    Checker { spec }.findings(type_name, state, refs, options)
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
        findings_with(spec, type_name, state, refs, options),
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
    findings_with(spec, type_name, state, refs, options)
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

/// The state fields and ref keys the protocol itself declares for a type, before any schema (the base of a closed
/// type). The one-time converter reads it to know what a schema must declare (spec/legacy/converter.md).
pub fn base_declared(type_name: &str) -> (Vec<String>, Vec<String>) {
    let c = Checker { spec: crate::spec() };
    c.declared(type_name, &json!({}), None).unwrap_or_default()
}
