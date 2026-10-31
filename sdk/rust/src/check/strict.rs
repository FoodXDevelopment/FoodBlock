//! Strict writing (canonical.md): what a strict writer never writes: a null, an unsorted set, text outside NFC, a float, a number out of range.
use super::{f, s, Checker, W};
use crate::canonical::nfc;
use crate::js::{cmp16, is_whole};
use crate::prelude::*;

impl Checker<'_> {
    // Numbers in signed content are integers within protocol.json's bounds; never floats. Keys are written in NFC.
    pub(super) fn numbers(&self, value: &Value, path: &str) -> W {
        // A whole number written in digits past what u64 or i64 holds reaches us as f64; below 1e21 JSON writes it in digits
        // (RFC 8785), so it is a whole number out of range, not a float.
        fn overflowed(x: f64) -> bool {
            is_whole(x) && x.abs() < 1e21 && (x >= 18446744073709551616.0 || x <= -9223372036854775808.0)
        }
        match value {
            Value::Number(n) => {
                let x = n.as_f64().unwrap_or(f64::NAN);
                if x == 0.0 && x.is_sign_negative() {
                    s("integer_range", format!("{path} is -0: write 0"))
                } else if (n.is_f64() && !overflowed(x)) || !is_whole(x) || x.abs() >= 1e21 {
                    // From 1e21 on, JSON (RFC 8785) writes a number with an exponent: it is a float, whatever its value.
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

    // Strict writing (canonical.md): a null, a set not sorted or with a repeat, text or a key outside NFC. All are
    // `not_canonical`. (A float or an integer out of range is its own code, in `numbers`.)
    pub(super) fn strict(&self, value: &Value, path: &str, in_refs_top: bool) -> W {
        match value {
            Value::Null => s("not_canonical", format!("{path} is null: leave the key out")),
            Value::String(t) if nfc(t).as_ref() != t.as_str() => {
                s("not_canonical", format!("{path} is not Unicode NFC"))
            }
            Value::Array(items) => {
                let mut w: W = vec![];
                if in_refs_top && items.iter().all(Value::is_string) {
                    let strs: Vec<&str> = items.iter().filter_map(Value::as_str).collect();
                    let sorted = strs.windows(2).all(|p| cmp16(p[0], p[1]).is_lt());
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
    pub(super) fn strict_all(&self, state: &Value, refs: &Value) -> W {
        let mut w = self.strict(state, "state", false);
        w.extend(self.strict(refs, "refs", true));
        w.extend(self.numbers(state, "state"));
        w.extend(self.numbers(refs, "refs"));
        w
    }
}
