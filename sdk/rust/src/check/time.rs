//! Times, dates and durations (core.md section 3): where the protocol names them, in the shapes it gives them.
use super::{s, Checker, W};
use crate::js::{is_obj, keys_within};
use crate::prelude::*;
use crate::time::{is_date, is_time};

impl Checker<'_> {
    // A time or date in the right shape that is not a real calendar instant is `calendar`; any other, `time`.
    pub(super) fn calendar_shape(&self, value: Option<&Value>, name: &str, rule: &str, words: &str) -> W {
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
    pub(super) fn time_shape(&self, value: Option<&Value>, name: &str) -> W {
        self.calendar_shape(
            value,
            name,
            "time",
            "a UTC time, exactly YYYY-MM-DDTHH:MM:SS.sssZ",
        )
    }
    pub(super) fn date_shape(&self, value: Option<&Value>, name: &str) -> W {
        self.calendar_shape(value, name, "date", "a date")
    }
    pub(super) fn duration_shape(&self, value: Option<&Value>, name: &str) -> W {
        if value.is_none() || self.is("duration", value) {
            vec![]
        } else {
            s("time", format!("{name} is an ISO 8601 duration (P30D)"))
        }
    }

    // A time; or a range { from, to }; or relative { after, wait } (promises.md, Relative time). A schema-led window
    // may add not_before, not_after and takes (profiles/tasks.md).
    pub(super) fn when_shape(&self, value: Option<&Value>, name: &str) -> W {
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
            if wrong.is_empty() && v.get("from").and_then(Value::as_str) > v.get("to").and_then(Value::as_str) {
                return s("shape", format!("{name}.from is after its to"));
            }
        }
        if relative {
            // `after` is a block (a hash) or an observe kind (any other text, promises.md, Relative time)
            if !v.get("after").and_then(Value::as_str).is_some_and(|a| !a.is_empty()) {
                wrong.extend(s("shape", format!("{name}.after is a block's id or an observe kind")));
            }
            wrong.extend(self.duration_shape(v.get("wait"), &format!("{name}.wait")));
        }
        for k in ["not_before", "not_after"] {
            wrong.extend(self.time_shape(v.get(k), &format!("{name}.{k}")));
        }
        // a window opens before it closes, as a range's from comes before its to
        let (nb, na) = (v.get("not_before"), v.get("not_after"));
        if self.time_shape(nb, "").is_empty() && self.time_shape(na, "").is_empty() && nb.and_then(Value::as_str).zip(na.and_then(Value::as_str)).is_some_and(|(a, b)| a > b) {
            wrong.extend(s("shape", format!("{name}.not_before is after its not_after")));
        }
        wrong.extend(self.duration_shape(v.get("takes"), &format!("{name}.takes")));
        wrong
    }

    // The time and date fields (protocol.json `time_fields`, `date_fields`) where the protocol names them: in state, its terms
    // and lines, and its scope (`time_fields_checked_in`).
    pub(super) fn times_in(&self, object: Option<&Value>, path: &str) -> W {
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

    pub(super) fn durations_in(&self, object: Option<&Value>, path: &str) -> W {
        let Some(Value::Object(map)) = object else { return vec![] };
        let names = self.spec.fields_of("duration");
        let mut w = vec![];
        for (key, value) in map {
            if names.iter().any(|n| n == key) {
                w.extend(self.duration_shape(Some(value), &format!("{path}.{key}")));
            }
        }
        w
    }
}

/// The places a block's time, date and duration fields are checked (protocol.json `time_fields_checked_in`): its state, its
/// terms, its scope and each line of its terms.
pub(super) fn time_places(state: &Value) -> Vec<(String, &Value)> {
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
