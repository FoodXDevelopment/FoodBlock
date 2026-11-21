//! The shapes a value takes (encoding.md, Shapes): amounts, limits, prices, quantities, places and marks, read at the places the protocol gives them.
use super::{f, s, Checker, W};
use crate::decimal::Dec;
use crate::js::{int, is_obj, keys_within, same_str};
use crate::prelude::*;

impl Checker<'_> {
    // An amount is { value, unit } or { value, unit, of }: value a decimal string, unit its author's own text, of the id of the kind it is
    // an amount of. Money is an amount: there is no other shape for it.
    pub(super) fn amount_shape(&self, value: Option<&Value>, name: &str) -> W {
        let Some(v) = value else { return vec![] };
        let keys = [self.list("shapes.amount"), self.list("shapes.amount_optional")].concat();
        let ok = is_obj(Some(v))
            && keys_within(v, &keys)
            && v.get("value").is_some_and(Value::is_string)
            && v.get("unit")
                .and_then(Value::as_str)
                .is_some_and(|u| !u.is_empty())
            && v.get("of").is_none_or(Value::is_string);
        if !ok {
            return s(
                "shape",
                format!(
                    "{name} is an amount: {{ value (a decimal string), unit (the author's text) }}, and optionally of (the id of its kind)"
                ),
            );
        }
        if v.get("of").is_some() {
            let w = self.hash_shape(v.get("of"), &format!("{name}.of"));
            if !w.is_empty() {
                return w;
            }
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
    // A limit is an amount (stage 4 writes the limit whole; only its shape is the amount's here).
    // A limit below zero allows nothing and says nothing: refused (authority.md).
    pub(super) fn limit_shape(&self, value: Option<&Value>, name: &str) -> W {
        let w = self.amount_shape(value, name);
        let size = value.and_then(|v| v.get("value"));
        if w.is_empty() && Dec::of(size).is_some_and(|d| d.cmp(&Dec::zero()).is_lt()) {
            return s("shape", format!("{name} is zero or more"));
        }
        w
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
    // A price fixed later (promises.md, Terms): { figure, by, signers, deadline, clocks }, and optionally fraction, min, max.
    pub(super) fn figure_shape(&self, v: &Value, name: &str) -> W {
        let (required, optional) = (self.list("shapes.price_figure"), self.list("shapes.price_figure_optional"));
        let mut w: W = vec![];
        if !(keys_within(v, &[required.clone(), optional].concat()) && required.iter().all(|k| v.get(k).is_some())) {
            w.push(f("shape", format!("{name} fixed later is {{ {} }}, and optionally fraction, min, max", required.join(", "))));
        }
        if !v.get("figure").and_then(Value::as_str).is_some_and(|k| !k.is_empty()) {
            w.push(f("shape", format!("{name}.figure is the kind of observe that signs the figure (text)")));
        }
        if !v.get("by").and_then(Value::as_array).is_some_and(|a| !a.is_empty() && a.iter().all(|x| self.is("id", Some(x)))) {
            w.push(f("shape", format!("{name}.by is a non-empty list of ids")));
        }
        w.extend(self.whole_shape(v.get("signers"), &format!("{name}.signers"), 1.0));
        if v.get("signers").is_none() {
            w.push(f("shape", format!("{name}.signers is a whole number of at least 1")));
        }
        if v.get("deadline").is_none() {
            w.push(f("time", format!("{name}.deadline is a time")));
        }
        w.extend(self.time_shape(v.get("deadline"), &format!("{name}.deadline")));
        if v.get("clocks").is_none_or(|k| crate::tasks::clocks_of(k).is_none()) {
            w.push(f("shape", format!("{name}.clocks is {{ names (ids), needed }}: the named clock the window is read on")));
        }
        if let Some(x) = v.get("fraction") {
            if !self.decimal_in(Some(x), "0", "1") {
                w.push(f("shape", format!("{name}.fraction is a decimal from 0 to 1")));
            }
        }
        for k in ["min", "max"] {
            w.extend(self.amount_shape(v.get(k), &format!("{name}.{k}")));
        }
        w
    }

    // A price is an amount (of any good), an amount per unit ({ amount, per }), or a method that fixes it later.
    pub(super) fn price_shape(&self, value: Option<&Value>, name: &str) -> W {
        let v = value.unwrap_or(&Value::Null);
        if matches!(self.shape_of(v), Some("range" | "list")) {
            return vec![]; // read at its place by set_shape (shapes_in)
        }
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
                s("shape", format!("{name} per unit is {{ amount, per }}"))
            };
            if v.get("amount").is_none() {
                w.push(f("shape", format!("{name}.amount is the price")));
            } else {
                w.extend(self.amount_shape(v.get("amount"), &format!("{name}.amount")));
            }
            w.extend(self.amount_shape(v.get("per"), &format!("{name}.per")));
            return w;
        }
        if value.is_some() && self.shape_of(v) != Some("amount") {
            return s("shape", format!("{name} is an amount, an amount per unit {{ amount, per }}, or a price fixed later"));
        }
        self.amount_shape(value, name)
    }

    // A quantity is an amount; under a per-unit price it may be a range { min, max } the answer chooses within.
    pub(super) fn quantity_shape(&self, value: Option<&Value>, price: Option<&Value>, name: &str) -> W {
        let v = value.unwrap_or(&Value::Null);
        let _ = price;
        if matches!(self.shape_of(v), Some("range" | "list")) {
            return vec![]; // read at its place by set_shape (shapes_in)
        }
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
            // A field named in `shapes.places.data` is not a place: what it holds is data (a schema's fields, grounds and roles).
            if data.contains(k) {
                continue;
            }
            let here = format!("{path}.{k}");
            // Her list and a clock have their own shapes (protocol.json `shapes.voice`, `shapes.clocks`), read by check 2 where a block states
            // them as its own (its state); in terms, a clock is read by the promise's own check, and a schema's terms are its words for them.
            if k == "voices" || k == "clocks" {
                if path == "state" {
                    w.extend(if k == "voices" { self.voices_shape(v, &here) } else { self.clocks_shape(v, &here) });
                }
                continue;
            }
            // 1.9 (O2): a grant's `scope.ends_on` has its own shape (protocol.json `shapes.ends_on`), read by the grant's scope check
            if k == "ends_on" {
                continue;
            }
            // A bare field holds exactly one shape (encoding.md): `price: { value, unit, place }` is no price.
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
    // price's `amount` and `per`, a transfer's amount, an input's amount). Read at the same places as `shapes_in`.
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
                    Some("price_per") => vec![item.get("amount"), item.get("per")],
                    Some("input") => vec![item.get("amount")],
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
        // An amount has one optional key: `of`.
        if m.contains_key("value") && m.contains_key("unit") && m.len() == 3 && m.contains_key("of") && self.list("shapes.amount_optional").iter().any(|k| k == "of") {
            return Some("amount");
        }
        // 1.9 stage 4 (A range and a list): a range states one end or both; a list is `{ one_of }`
        if !m.is_empty() && m.keys().all(|k| self.list("shapes.range").contains(k)) {
            return Some("range");
        }
        let list_keys = self.list("shapes.list");
        if !list_keys.is_empty() && m.len() == list_keys.len() && list_keys.iter().all(|k| m.contains_key(k)) {
            return Some("list");
        }
        [
            ("amount", "shapes.amount"),
            ("price_per", "shapes.price_per"),
            ("range", "shapes.range"),
            ("mark", "shapes.mark"),
            ("input", "shapes.input"),
            ("point", "shapes.where.point"),
            ("area", "shapes.where.area"),
            ("bound", "shapes.bound"),
        ]
        .into_iter()
        .find(|(_, path)| exact(path))
        .map(|(name, _)| name)
    }
    // A named clock (blocks.md, A named clock): `{ names, needed }`, `names` a non-empty sorted list of ids, each once, `needed` by Counts
    // (folds.md): a set of one needs none, a larger set states it.
    pub(super) fn clocks_shape(&self, v: &Value, path: &str) -> W {
        let Some(o) = v.as_object().filter(|o| keys_within(v, &self.list("shapes.clocks")) && o.contains_key("names")) else {
            return s("shape", format!("{path} is {{ names, needed }}: the lines of her clock"));
        };
        let mut w = self.ids_sorted(o.get("names"), &format!("{path}.names"));
        let n = o.get("names").and_then(Value::as_array).map_or(0, Vec::len);
        let needed_ok = match o.get("needed") {
            None => n == 1,
            Some(x) => crate::js::count_stated(Some(x), Some(n)).is_some(),
        };
        if !needed_ok {
            w.push(f("shape", format!("{path}.needed is how many of its names (1 to their number), stated when there is more than one")));
        }
        w
    }
    // A non-empty sorted list of ids, each once.
    fn ids_sorted(&self, v: Option<&Value>, path: &str) -> W {
        let Some(a) = v.and_then(Value::as_array).filter(|a| !a.is_empty()) else {
            return s("shape", format!("{path} is a non-empty sorted list of ids"));
        };
        if !a.iter().all(|i| self.is("id", Some(i))) {
            return s("grammar", format!("{path} lists ids"));
        }
        if a.windows(2).any(|p| p[0].as_str() >= p[1].as_str()) {
            return s("shape", format!("{path} is sorted, each id once"));
        }
        vec![]
    }
    // Her list of voices (identity.md, Her voices; protocol.json `shapes.voice`): each voice exactly one key set (a key in its suite's
    // grammar, a key's hash, or other people counted), with `wait` and `reach` durations; the first a key or a key's hash; each key, hash
    // and id once in all. A list with no voice left closes her identity (identity.md, Taking oneself out).
    pub(super) fn voices_shape(&self, v: &Value, path: &str) -> W {
        let Some(items) = v.as_array() else { return s("shape", format!("{path} is her list: an array of voices")) };
        let mut w: W = vec![];
        // 1.9 3b-8: `receives: true` on one voice at most
        if items.iter().filter(|v| v.get("receives").is_some()).count() > 1 {
            w.push(f("shape", format!("{path}: receives is true on one voice at most")));
        }
        let mut seen: Vec<&str> = Vec::new();
        for (i, item) in items.iter().enumerate() {
            let here = format!("{path}[{i}]");
            let kind = ["key", "key_hash", "names"].into_iter().find(|k| item.get(*k).is_some());
            let fits = kind.is_some_and(|k| keys_within(item, &self.list(&format!("shapes.voice.{k}"))))
                && ["key", "key_hash", "names"].iter().filter(|k| item.get(**k).is_some()).count() == 1;
            if !fits {
                w.push(f("shape", format!("{here} is one voice: {{ key, suite, wait, reach }}, {{ key_hash, wait }} or {{ names, needed, wait }}")));
                continue;
            }
            if i == 0 && kind == Some("names") {
                w.push(f("shape", format!("{here}: the first voice is a key or a key's hash of hers, never other people")));
            }
            let suite = self.suite_named(item.get("suite"), &format!("{here}.suite"), &mut w);
            match kind {
                Some("key") => self.key_in_suite(item.get("key"), &suite, &format!("{here}.key"), false, &mut w),
                Some("key_hash") => w.extend(self.hash_shape(item.get("key_hash"), &format!("{here}.key_hash"))),
                _ => {
                    w.extend(self.ids_sorted(item.get("names"), &format!("{here}.names")));
                    let n = item.get("names").and_then(Value::as_array).map_or(0, Vec::len);
                    let ok = match item.get("needed") {
                        None => n == 1,
                        Some(x) => crate::js::count_stated(Some(x), Some(n)).is_some(),
                    };
                    if !ok {
                        w.push(f("shape", format!("{here}.needed is how many of its names (1 to their number), stated when there is more than one")));
                    }
                }
            }
            w.extend(self.duration_shape(item.get("wait"), &format!("{here}.wait")));
            w.extend(self.duration_shape(item.get("reach"), &format!("{here}.reach")));
            // 1.9 3b-11 (`passes`, D11) and 3b-8 (`receives`, D7): each `true`, or left out
            // 1.9 3d-14 (`above`, D8): `true` on a voice of other people, or left out
            for flag in ["passes", "receives", "above"] {
                if item.get(flag).is_some_and(|x| x != &Value::Bool(true)) {
                    w.push(f("shape", format!("{here}.{flag} is true, or left out")));
                }
            }
            for x in ["key", "key_hash"].iter().filter_map(|k| item.get(*k).and_then(Value::as_str)).chain(item.get("names").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str)) {
                if seen.contains(&x) {
                    w.push(f("shape", format!("{here}: each key, key hash and id is in her list once")));
                }
                seen.push(x);
            }
        }
        w
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
                Some("price_per") => self.price_shape(Some(value), path),
                Some("price_figure") => self.figure_shape(value, path),
                Some("range" | "list") => self.set_shape(value, path),
                Some("mark") => self.marks_shape(Some(&Value::Array(vec![value.clone()])), path),
                Some("input") => {
                    let mut w = self.hash_shape(value.get("from"), &format!("{path}.from"));
                    if value.get("from").is_some_and(|x| !x.is_string()) && w.is_empty() {
                        w.push(f("grammar", format!("{path}.from is an id")));
                    }
                    w.extend(self.amount_shape(value.get("amount"), &format!("{path}.amount")));
                    w
                }
                Some("point" | "area") => self.where_shape(Some(value)),
                Some("bound") => self.bound_shape(Some(value)),
                _ => vec![],
            },
            _ => vec![],
        }
    }
}

impl Checker<'_> {
    /// A range `{ min, max }` (one end or both) or a list `{ one_of }` (authority.md, A range and a list): only at the set places
    /// (protocol.json `set_places`); of one kind (the same `unit` and `of`; for a price per unit, the same `per`); `min` less than `max`;
    /// a list of two or more values, sorted. Each value an amount, a price per unit, a time or a duration.
    pub(super) fn set_shape(&self, value: &Value, path: &str) -> W {
        let places = self.list("set_places");
        let place = {
            let p = path.strip_prefix("state.").unwrap_or(path);
            // terms.lines[3].price -> lines.price
            match p.strip_prefix("terms.lines[") {
                Some(rest) => rest.split_once("].").map(|(_, f)| format!("lines.{f}")).unwrap_or_default(),
                None => p.to_string(),
            }
        };
        if !places.contains(&place) {
            return s("shape", format!("{path}: a range or a list sits only at the set places ({})", places.join(", ")));
        }
        let ends: Vec<&Value> = match value.get("one_of") {
            Some(Value::Array(items)) => items.iter().collect(),
            Some(_) => return s("shape", format!("{path}.one_of lists two or more values")),
            None => ["min", "max"].iter().filter_map(|k| value.get(*k)).collect(),
        };
        let mut w: W = vec![];
        if value.get("one_of").is_some() && ends.len() < 2 {
            w.push(f("shape", format!("{path}.one_of lists two or more values")));
        }
        for (i, e) in ends.iter().enumerate() {
            let ok = match e {
                Value::String(t) => crate::time::is_time(Some(e)) || crate::time::parse_duration(t).is_some(),
                _ => matches!(self.shape_of(e), Some("amount" | "price_per")),
            };
            if !ok {
                w.push(f("shape", format!("{path}: value {i} is an amount, a price per unit, a time or a duration")));
            } else if let Some("amount") = self.shape_of(e) {
                w.extend(self.amount_shape(Some(e), &format!("{path}[{i}]")));
            } else if let Some("price_per") = self.shape_of(e) {
                w.extend(self.price_shape(Some(e), &format!("{path}[{i}]")));
            }
        }
        if !w.is_empty() {
            return w;
        }
        // of one kind, in order: min less than max; a list sorted, each once
        for pair in ends.windows(2) {
            match crate::grant::cmp_value(pair[0], pair[1]) {
                None => return s("shape", format!("{path}: a range or a list of two kinds")),
                Some(core::cmp::Ordering::Less) => {}
                Some(_) => return s("shape", format!("{path}: min is less than max, and a list is sorted with each value once")),
            }
        }
        w
    }
}

pub(super) fn per_unit(value: Option<&Value>) -> bool {
    value
        .and_then(Value::as_object)
        .is_some_and(|m| m.contains_key("per"))
}
