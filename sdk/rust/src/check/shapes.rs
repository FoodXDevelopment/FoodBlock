//! The shapes a value takes (encoding.md, Shapes): money, amounts, limits, prices, quantities, places and marks, read at the places the protocol gives them.
use super::{f, s, Checker, W};
use crate::decimal::Dec;
use crate::js::{int, is_obj, keys_within, same_str};
use crate::prelude::*;

impl Checker<'_> {
    pub(super) fn amount_shape(&self, value: Option<&Value>, name: &str) -> W {
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
                    "{name} is an amount: {{ value (a decimal string), unit (the author's text) }}"
                ),
            );
        }
        if self.is("decimal", v.get("value")) {
            vec![]
        } else {
            s(
                "decimal",
                format!("{name}.value is a decimal string (-?(0|[1-9][0-9]*)(.[0-9]+)?) of at most {} digits", self.spec.decimal_digits),
            )
        }
    }
    // Money is { minor, currency }: `minor` whole minor units; `currency` an ISO 4217 code (grammar.currency) or an
    // issuer's own unit { issuer, unit, decimals } (protocol.json shapes.currency_unit). Never summed across currencies.
    pub(super) fn money_shape(&self, value: Option<&Value>, name: &str) -> W {
        let Some(v) = value else { return vec![] };
        let ok = is_obj(Some(v))
            && keys_within(v, &self.list("shapes.money"))
            && int(v.get("minor")).is_some_and(|m| m >= 0.0)
            && self.currency_ok(v.get("currency"));
        if ok {
            vec![]
        } else {
            s(
                "shape",
                format!("{name} is money: {{ minor (whole minor units, zero or more: a debt is a promise, a refund a transfer back), currency (an ISO 4217 code, or an issuer's {{ issuer, unit, decimals }}) }}"),
            )
        }
    }
    // A limit is money, or an amount of anything else (kilos, covers, hours, a count).
    // A limit below zero allows nothing and says nothing: refused (authority.md).
    pub(super) fn limit_shape(&self, value: Option<&Value>, name: &str) -> W {
        let w = match value {
            Some(v) if v.get("unit").is_some() => self.amount_shape(value, name),
            _ => self.money_shape(value, name),
        };
        let size = value.and_then(|v| if v.get("unit").is_some() { v.get("value") } else { v.get("minor") });
        if w.is_empty() && Dec::of(size).is_some_and(|d| d.cmp(&Dec::zero()).is_lt()) {
            return s("shape", format!("{name} is zero or more"));
        }
        w
    }
    pub(super) fn currency_ok(&self, currency: Option<&Value>) -> bool {
        match currency {
            Some(Value::String(c)) => self.spec.is("currency", c),
            Some(c @ Value::Object(_)) => {
                keys_within(c, &self.list("shapes.currency_unit"))
                    && self.list("shapes.currency_unit").iter().all(|k| c.get(k).is_some())
                    && self.is("id", c.get("issuer"))
                    && !self.unknown_hash(c.get("issuer"))
                    && c.get("unit").and_then(Value::as_str).is_some_and(|u| !u.is_empty())
                    && int(c.get("decimals"))
                        .is_some_and(|d| d >= 0.0 && d <= self.spec.decimals_max as f64)
            }
            _ => false,
        }
    }

    pub(super) fn whole_shape(&self, value: Option<&Value>, name: &str, min: f64) -> W {
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

    // A decimal string within bounds, compared exactly (core.md section 3).
    pub(super) fn decimal_in(&self, value: Option<&Value>, low: &str, high: &str) -> bool {
        let d = |t: &str| Dec::of(Some(&Value::String(t.to_string())));
        self.is("decimal", value)
            && Dec::of(value).zip(d(low)).zip(d(high)).is_some_and(|((n, lo), hi)| !n.cmp(&lo).is_lt() && !n.cmp(&hi).is_gt())
    }

    pub(super) fn where_shape(&self, value: Option<&Value>) -> W {
        let ok = match value {
            None => true,
            Some(v) => {
                is_obj(Some(v))
                    && keys_within(v, &self.list("shapes.where.area"))
                    && self.decimal_in(v.get("lat"), "-90", "90")
                    && self.decimal_in(v.get("lon"), "-180", "180")
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
    /// `state.bound`: a GeoJSON-shaped polygon, one closed ring of [lon, lat] decimal strings of at most nine places (things.md, Uses of a place).
    pub(super) fn bound_shape(&self, value: Option<&Value>) -> W {
        match value {
            None => vec![],
            Some(v) if crate::bound::ring_of(v).is_some() => vec![],
            Some(_) => s("shape", "state.bound is { type: \"Polygon\", coordinates: [ring] }: one closed ring of four to limits.bound_points [lon, lat] positions, decimal strings of at most nine places"),
        }
    }
    pub(super) fn marks_shape(&self, value: Option<&Value>, name: &str) -> W {
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
    // A price fixed later (promises.md, Terms): { figure, by, signers, deadline, keepers }, and optionally fraction, min, max.
    pub(super) fn figure_shape(&self, v: &Value, name: &str) -> W {
        let (required, optional) = (self.list("shapes.price_figure"), self.list("shapes.price_figure_optional"));
        let mut w: W = vec![];
        if !(keys_within(v, &[required.clone(), optional].concat()) && required.iter().all(|k| v.get(k).is_some())) {
            w.push(f("shape", format!("{name} fixed later is {{ {} }}, and optionally fraction, min, max", required.join(", "))));
        }
        if !v.get("figure").and_then(Value::as_str).is_some_and(|k| !k.is_empty()) {
            w.push(f("shape", format!("{name}.figure is the kind of observe that signs the figure (text)")));
        }
        if !v.get("by").and_then(Value::as_array).is_some_and(|a| !a.is_empty() && a.iter().all(|x| self.is("id", Some(x)) || self.is("role_ref", Some(x)))) {
            w.push(f("shape", format!("{name}.by is a non-empty list of ids or circle#role")));
        }
        w.extend(self.whole_shape(v.get("signers"), &format!("{name}.signers"), 1.0));
        if v.get("signers").is_none() {
            w.push(f("shape", format!("{name}.signers is a whole number of at least 1")));
        }
        if v.get("deadline").is_none() {
            w.push(f("time", format!("{name}.deadline is a time")));
        }
        w.extend(self.time_shape(v.get("deadline"), &format!("{name}.deadline")));
        if v.get("keepers").is_none_or(|k| crate::tasks::keepers_of(k).is_none()) {
            w.push(f("shape", format!("{name}.keepers is {{ names (ids or circle#role), needed }}: the named clock the window is read on")));
        }
        if let Some(x) = v.get("fraction") {
            if !self.decimal_in(Some(x), "0", "1") {
                w.push(f("shape", format!("{name}.fraction is a decimal from 0 to 1")));
            }
        }
        for k in ["min", "max"] {
            w.extend(self.money_shape(v.get(k), &format!("{name}.{k}")));
        }
        w
    }

    // A price is money, an amount of goods (a price in any kind), money per unit ({ money, per }), or a method that fixes it later.
    pub(super) fn price_shape(&self, value: Option<&Value>, name: &str) -> W {
        let v = value.unwrap_or(&Value::Null);
        if is_obj(value) && v.get("figure").is_some() {
            return self.figure_shape(v, name);
        }
        if self.shape_of(v) == Some("amount") {
            return self.amount_shape(value, name);
        }
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
        self.money_shape(value, name)
    }

    // A quantity is an amount; under a per-unit price it may be a range { min, max } the answer chooses within.
    pub(super) fn quantity_shape(&self, value: Option<&Value>, price: Option<&Value>, name: &str) -> W {
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
        if min.is_some()
            && max.is_some()
            && same_str(min.unwrap().get("unit"), max.unwrap().get("unit"))
            && Dec::of(min.unwrap().get("value"))
                .zip(Dec::of(max.unwrap().get("value")))
                .is_some_and(|(a, b)| a.cmp(&b).is_gt())
        {
            w.push(f("shape", format!("{name}.min is above its max")));
        }
        w
    }

    // Shapes are read at the places the protocol gives them, never by a field name deeper in (protocol.json `shapes.places`):
    // the fields of state, of terms and scope, and of each item of lines and split. A value at a place is read by its own
    // keys; the named bare fields (`shapes.places.bare`) hold such an object. A map nested under a field is data, and so is
    // what the fields named in `shapes.places.data` hold.
    pub(super) fn shapes_in(&self, container: &Value, path: &str) -> W {
        let Value::Object(map) = container else { return vec![] };
        let (containers, lists, bare, data) = (
            self.list("shapes.places.containers"),
            self.list("shapes.places.lists"),
            self.spec.fields_of("shape"),
            self.list("shapes.places.data"),
        );
        let mut w = vec![];
        for (k, v) in map {
            // A field named in `shapes.places.data` is not a place: what it holds is data (a schema's fields, grounds and roles, the
            // items of shares).
            if data.contains(k) {
                continue;
            }
            let here = format!("{path}.{k}");
            // A bare field holds exactly one shape (encoding.md): `price: { minor, currency, place }` is no price.
            if bare.contains(k) && self.shape_of(v).is_none() {
                w.push(f("shape", format!("{here} holds exactly one shape (an object with exactly its keys)")));
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
    // What a promise or a transfer moves is never below zero (encoding.md, Shapes): every amount at a place (a quantity, a range's ends, a
    // price's `per`, a transfer's amount), as money is never below zero anywhere. Read at the same places as `shapes_in`.
    pub(super) fn amounts_below_zero(&self, container: &Value, path: &str) -> W {
        let Value::Object(map) = container else { return vec![] };
        let (containers, lists, data) = (self.list("shapes.places.containers"), self.list("shapes.places.lists"), self.list("shapes.places.data"));
        let below = |a: Option<&Value>| a.and_then(|a| Dec::of(a.get("value"))).is_some_and(|d| d.cmp(&Dec::zero()).is_lt());
        let mut w = vec![];
        for (k, v) in map {
            if data.contains(k) {
                continue;
            }
            let here = format!("{path}.{k}");
            let items: Vec<&Value> = match v {
                Value::Array(a) => a.iter().collect(),
                one => vec![one],
            };
            for item in items {
                let parts: Vec<Option<&Value>> = match self.shape_of(item) {
                    Some("amount") => vec![Some(item)],
                    Some("price_per") => vec![item.get("per")],
                    Some("range") => vec![item.get("min"), item.get("max")],
                    _ => vec![],
                };
                if parts.into_iter().any(below) {
                    w.push(f("shape", format!("{here} is zero or more: what a promise or a transfer moves is never below zero")));
                }
            }
            if containers.contains(k) {
                w.extend(self.amounts_below_zero(v, &here));
            } else if lists.contains(k) {
                if let Value::Array(items) = v {
                    for (i, item) in items.iter().enumerate() {
                        w.extend(self.amounts_below_zero(item, &format!("{here}[{i}]")));
                    }
                }
            }
        }
        w
    }
    // The shape an object is (encoding.md, Shapes): the one whose keys are exactly its keys (protocol.json `shapes`); None for data.
    pub(super) fn shape_of(&self, value: &Value) -> Option<&'static str> {
        let Value::Object(m) = value else { return None };
        let exact = |path: &str| {
            let keys = self.list(path);
            keys.len() == m.len() && keys.iter().all(|k| m.contains_key(k))
        };
        // A price fixed later has optional keys: its required keys, and any of the optional ones.
        if m.contains_key("figure") {
            let (req, opt) = (self.list("shapes.price_figure"), self.list("shapes.price_figure_optional"));
            if req.iter().all(|k| m.contains_key(k)) && m.keys().all(|k| req.contains(k) || opt.contains(k)) {
                return Some("price_figure");
            }
            return None;
        }
        [
            ("amount", "shapes.amount"),
            ("money", "shapes.money"),
            ("price_per", "shapes.price_per"),
            ("range", "shapes.range"),
            ("mark", "shapes.mark"),
            ("share", "shapes.share"),
            ("currency_unit", "shapes.currency_unit"),
            ("point", "shapes.where.point"),
            ("area", "shapes.where.area"),
            ("bound", "shapes.bound"),
        ]
        .into_iter()
        .find(|(_, path)| exact(path))
        .map(|(name, _)| name)
    }
    // A value at a place, read by its own keys (an array: each item): an object whose keys are exactly a shape's is checked as that
    // shape, in any field; a shape's own parts are read as it says. Any other object is data.
    pub(super) fn shape_value(&self, value: &Value, path: &str) -> W {
        match value {
            Value::Array(items) => items
                .iter()
                .enumerate()
                .flat_map(|(i, item)| self.shape_value(item, &format!("{path}[{i}]")))
                .collect(),
            Value::Object(_) => match self.shape_of(value) {
                Some("amount") => self.amount_shape(Some(value), path),
                Some("money") => self.money_shape(Some(value), path),
                Some("price_per") => self.price_shape(Some(value), path),
                Some("price_figure") => self.figure_shape(value, path),
                Some("range") => self.quantity_shape(Some(value), Some(&json!({ "per": {} })), path),
                Some("mark") => self.marks_shape(Some(&Value::Array(vec![value.clone()])), path),
                Some("share") => {
                    let mut w = self.hash_shape(value.get("from"), &format!("{path}.from"));
                    if value.get("from").is_some_and(|x| !x.is_string()) && w.is_empty() {
                        w.push(f("grammar", format!("{path}.from is an id")));
                    }
                    if !self.is("decimal", value.get("share")) {
                        w.push(f("decimal", format!("{path}.share is a decimal string")));
                    }
                    w
                }
                Some("currency_unit") => {
                    if self.currency_ok(Some(value)) {
                        vec![]
                    } else {
                        s("shape", format!("{path} is a currency of an issuer: {{ issuer (an id), unit (text), decimals (0 to {}) }}", self.spec.decimals_max))
                    }
                }
                Some("point" | "area") => self.where_shape(Some(value)),
                Some("bound") => self.bound_shape(Some(value)),
                _ => vec![],
            },
            _ => vec![],
        }
    }
}

pub(super) fn per_unit(value: Option<&Value>) -> bool {
    value
        .and_then(Value::as_object)
        .is_some_and(|m| m.contains_key("per"))
}
