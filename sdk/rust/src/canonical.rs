//! The canonical form (spec/canonical.md): RFC 8785 (JCS) of `{ type, state, refs }`. Keys sort by UTF-16 code units
//! at every level; no whitespace; strings in the shortest JSON escapes; numbers as ECMAScript writes them. Nothing is
//! repaired on the way: a null, a float, an unsorted set or text outside NFC is written as given, and the strict
//! writing check (`check`) refuses it (`not_canonical`).
use crate::prelude::*;
use core::fmt::Write as _;
use unicode_normalization::{is_nfc_quick, IsNormalized, UnicodeNormalization};

/// The canonical string of `{ type, state, refs }`: JCS, nothing dropped, sorted or normalised.
pub fn canonical(type_name: &str, state: &Value, refs: &Value) -> String {
    let mut out = String::with_capacity(128);
    out.push_str("{\"refs\":");
    write_value(&mut out, refs);
    out.push_str(",\"state\":");
    write_value(&mut out, state);
    out.push_str(",\"type\":");
    write_string(&mut out, type_name);
    out.push('}');
    out
}

/// The canonical JSON of any value (a signed message part is signed over it).
pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_value(&mut out, value);
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

fn write_value(out: &mut String, value: &Value) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&js_number(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => write_string(out, s),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(out, item);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| crate::js::cmp16(a, b));
            out.push('{');
            for (i, key) in keys.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(out, key);
                out.push(':');
                write_value(out, &map[key.as_str()]);
            }
            out.push('}');
        }
    }
}

/// Parse JSON text and refuse a duplicate key at any depth (canonical.md, strict writing, rule 6): the one thing a
/// parsed value can no longer show. Returns the value, or the path of the first repeated key.
pub fn parse_strict(text: &str) -> core::result::Result<Value, String> {
    use serde::de::{Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
    struct Strict(Value);
    impl<'de> Deserialize<'de> for Strict {
        fn deserialize<D: Deserializer<'de>>(d: D) -> core::result::Result<Self, D::Error> {
            struct V;
            impl<'de> Visitor<'de> for V {
                type Value = Value;
                fn expecting(&self, f: &mut core::fmt::Formatter) -> core::fmt::Result {
                    f.write_str("JSON")
                }
                fn visit_bool<E>(self, v: bool) -> core::result::Result<Value, E> {
                    Ok(Value::Bool(v))
                }
                fn visit_i64<E>(self, v: i64) -> core::result::Result<Value, E> {
                    Ok(Value::from(v))
                }
                fn visit_u64<E>(self, v: u64) -> core::result::Result<Value, E> {
                    Ok(Value::from(v))
                }
                fn visit_f64<E>(self, v: f64) -> core::result::Result<Value, E> {
                    Ok(serde_json::Number::from_f64(v).map(Value::Number).unwrap_or(Value::Null))
                }
                fn visit_str<E>(self, v: &str) -> core::result::Result<Value, E> {
                    Ok(Value::String(v.into()))
                }
                fn visit_string<E>(self, v: String) -> core::result::Result<Value, E> {
                    Ok(Value::String(v))
                }
                fn visit_unit<E>(self) -> core::result::Result<Value, E> {
                    Ok(Value::Null)
                }
                fn visit_none<E>(self) -> core::result::Result<Value, E> {
                    Ok(Value::Null)
                }
                fn visit_seq<A: SeqAccess<'de>>(self, mut a: A) -> core::result::Result<Value, A::Error> {
                    let mut items = Vec::new();
                    while let Some(Strict(v)) = a.next_element()? {
                        items.push(v);
                    }
                    Ok(Value::Array(items))
                }
                fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> core::result::Result<Value, A::Error> {
                    let mut map = serde_json::Map::new();
                    while let Some((k, Strict(v))) = a.next_entry::<String, Strict>()? {
                        if map.contains_key(&k) {
                            return Err(serde::de::Error::custom(format!("duplicate key {k}")));
                        }
                        map.insert(k, v);
                    }
                    Ok(Value::Object(map))
                }
            }
            d.deserialize_any(V).map(Strict)
        }
    }
    serde_json::from_str::<Strict>(text).map(|s| s.0).map_err(|e| e.to_string())
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
