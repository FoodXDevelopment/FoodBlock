//! The canonical form (spec/canonical.md): the deterministic UTF-8 JSON every hash and signature covers. Keys sort by
//! UTF-16 code units at every level; no whitespace; numbers as JavaScript writes them; strings in NFC; nulls dropped,
//! inside arrays too; string arrays under any key named `refs` sort as sets; every other array keeps its order.
use crate::prelude::*;
use core::fmt::Write as _;
use unicode_normalization::{is_nfc_quick, IsNormalized, UnicodeNormalization};

/// The canonical string of `{ type, state, refs }`.
pub fn canonical(type_name: &str, state: &Value, refs: &Value) -> String {
    let mut out = String::with_capacity(128);
    out.push('{');
    let mut first = true;
    for (key, value, in_refs) in [("refs", refs, true), ("state", state, false)] {
        let mut part = String::new();
        if write_value(&mut part, value, in_refs) {
            if !first {
                out.push(',');
            }
            first = false;
            write_string(&mut out, key);
            out.push(':');
            out.push_str(&part);
        }
    }
    if !first {
        out.push(',');
    }
    out.push_str("\"type\":");
    write_string(&mut out, type_name);
    out.push('}');
    out
}

/// The canonical JSON of any value (a signed message part is signed over it). `None` for a value that is null.
pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_value(&mut out, value, false);
    out
}

/// NFC, with a fast path for text that is already normalised.
pub fn nfc(s: &str) -> alloc::borrow::Cow<'_, str> {
    if s.is_ascii() || is_nfc_quick(s.chars()) == IsNormalized::Yes {
        alloc::borrow::Cow::Borrowed(s)
    } else {
        alloc::borrow::Cow::Owned(s.nfc().collect())
    }
}

/// Writes a value; false when it is omitted (null).
fn write_value(out: &mut String, value: &Value, in_refs: bool) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => {
            out.push_str(if *b { "true" } else { "false" });
            true
        }
        Value::Number(n) => {
            out.push_str(&js_number(n.as_f64().unwrap_or(0.0)));
            true
        }
        Value::String(s) => {
            write_string(out, &nfc(s));
            true
        }
        Value::Array(items) => {
            out.push('[');
            let mut first = true;
            let mut push = |out: &mut String, item: &Value| {
                let mut part = String::new();
                if write_value(&mut part, item, in_refs) {
                    if !first {
                        out.push(',');
                    }
                    first = false;
                    out.push_str(&part);
                }
            };
            if in_refs && items.iter().all(Value::is_string) {
                let mut sorted: Vec<&Value> = items.iter().collect();
                sorted.sort_by(|a, b| crate::js::cmp16(a.as_str().unwrap(), b.as_str().unwrap()));
                for item in sorted {
                    push(out, item);
                }
            } else {
                for item in items {
                    push(out, item);
                }
            }
            out.push(']');
            true
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| crate::js::cmp16(a, b));
            out.push('{');
            let mut first = true;
            for key in keys {
                let mut part = String::new();
                if write_value(&mut part, &map[key.as_str()], in_refs || key == "refs") {
                    if !first {
                        out.push(',');
                    }
                    first = false;
                    write_string(out, &nfc(key));
                    out.push(':');
                    out.push_str(&part);
                }
            }
            out.push('}');
            true
        }
    }
}

/// A JSON string as JavaScript's JSON.stringify writes it.
fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

/// A number exactly as JavaScript writes it (ECMAScript Number::toString): `1e+21`, `1e-7`, `0.000001`, `123.456`.
pub fn js_number(x: f64) -> String {
    if x.is_nan() {
        return "NaN".to_string();
    }
    if x == 0.0 {
        return "0".to_string();
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
    }
    if x < 0.0 {
        return format!("-{}", js_number(-x));
    }
    // The shortest digits that read back as x (Rust and JavaScript agree on them), and their exponent.
    let sci = format!("{:e}", x);
    let (mantissa, exponent) = sci.split_once('e').unwrap();
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exponent.parse::<i32>().unwrap() + 1;
    if k <= n && n <= 21 {
        let mut s = digits;
        for _ in 0..(n - k) {
            s.push('0');
        }
        s
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{}", "0".repeat((-n) as usize), digits)
    } else {
        let e = n - 1;
        let sign = if e < 0 { '-' } else { '+' };
        if k == 1 {
            format!("{}e{}{}", digits, sign, e.abs())
        } else {
            format!("{}.{}e{}{}", &digits[..1], &digits[1..], sign, e.abs())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn numbers_as_javascript_writes_them() {
        let cases = [
            (1.0, "1"),
            (1.5, "1.5"),
            (1e21, "1e+21"),
            (1e-7, "1e-7"),
            (0.000001, "0.000001"),
            (123.456, "123.456"),
            (-0.0, "0"),
            (1.2345e-10, "1.2345e-10"),
            (4.5, "4.5"),
            (100.0, "100"),
            (1e20, "100000000000000000000"),
            (0.1 + 0.2, "0.30000000000000004"),
            (18446744073709552000.0, "18446744073709552000"),
        ];
        for (x, want) in cases {
            assert_eq!(js_number(x), want);
        }
    }
}
