//! The canonical form (spec/canonical.md): RFC 8785 (JCS) of `{ type, state, refs }`. Keys sort by UTF-16 code units
//! at every level; no whitespace; strings in the shortest JSON escapes; numbers as ECMAScript writes them. Nothing is
//! repaired on the way: a null, a float or an unsorted set is written as given, and the strict writing check refuses it.
//! On the wire a message is its canonical bytes (canonical.md, On the wire): `parse_wire` takes text only when it is exactly the
//! canonical bytes of the value it parses to. Text is compared byte for byte: no normal form, no table.
use crate::prelude::*;
use core::fmt::Write as _;

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

/// The canonical bytes of a block whose `type` is not text (it is refused, `type_name`, but its bytes still have an id, and a refusal names
/// them): the type is written as the value it is.
pub fn canonical_any_type(type_value: &Value, state: &Value, refs: &Value) -> String {
    canonical_json(&json!({ "type": type_value, "state": state, "refs": refs }))
}

/// The canonical JSON of any value (a signed message part is signed over it).
pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_value(&mut out, value);
    out
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
            // 1.9 3a-6, the one form: members in ascending order of the UTF-8 bytes of their keys, byte by byte (a Rust string's own order)
            keys.sort();
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

/// Read a message from the wire (canonical.md, On the wire): JSON whose bytes are exactly the canonical bytes of the value they parse to.
/// Any other text is not canonical: a space, a key out of order, a repeated key (it parses to one key, so the bytes written back differ), an
/// escape that is not the shortest, a number not written as the writer writes it, a lone surrogate, text that is not JSON.
pub fn parse_canonical(text: &str) -> core::result::Result<Value, String> {
    use serde::Deserialize;
    // a value nested deeper than a reader reads is refused by its bytes, before anything is built from them
    if json_depth(text.as_bytes()) > read_depth() {
        return Err(format!("nested deeper than {}", read_depth()));
    }
    let mut de = serde_json::Deserializer::from_str(text);
    de.disable_recursion_limit();
    let value = Value::deserialize(&mut de).map_err(|e| e.to_string())?;
    de.end().map_err(|e| e.to_string())?;
    if canonical_json(&value) != text {
        return Err("the bytes are not the canonical bytes of the value they parse to".into());
    }
    Ok(value)
}

/// Read a block's bytes from the wire: canonical (`parse_canonical`), and a value that follows strict writing in its numbers: each a whole
/// number written in digits within ±(2^53 - 1). No reader turns a token into a float to judge it: any other number is not canonical.
pub fn parse_wire(text: &str) -> core::result::Result<Value, String> {
    let value = parse_canonical(text)?;
    if let Some(n) = not_whole(&value) {
        return Err(format!("the number {n} is not a whole number written in digits within ±(2^53 - 1)"));
    }
    Ok(value)
}

// The first number in a value parsed from text that is not a whole number in range: a token with a fraction or an exponent reaches
// here as a float, and one past what 64 bits hold as well.
fn not_whole(v: &Value) -> Option<String> {
    match v {
        Value::Number(n) => {
            let ok = n.as_i64().is_some_and(|i| i.unsigned_abs() <= 9_007_199_254_740_991) || n.as_u64().is_some_and(|u| u <= 9_007_199_254_740_991);
            (!ok).then(|| n.to_string())
        }
        Value::Array(a) => a.iter().find_map(not_whole),
        Value::Object(m) => m.values().find_map(not_whole),
        _ => None,
    }
}

/// How deep a reader reads what carries blocks (a push, a message, the door's arguments, a CBOR item) and the chain of places a thing is in:
/// `limits.read_depth` (encoding.md, Limits). A block deeper than `limits.depth` is still read, and refused by code (`size_limit`).
pub fn read_depth() -> usize {
    crate::spec().read_depth
}

/// How deep JSON text nests, counted on its bytes before it is parsed: each `[` or `{` outside a string one deeper. Text that is not
/// JSON is counted the same way and then refused by the parser.
pub fn json_depth(bytes: &[u8]) -> usize {
    let (mut depth, mut most, mut in_string, mut escaped) = (0usize, 0usize, false, false);
    for b in bytes {
        if in_string {
            if escaped {
                escaped = false;
            } else if *b == b'\\' {
                escaped = true;
            } else if *b == b'"' {
                in_string = false;
            }
            continue;
        }
        match b {
            b'"' => in_string = true,
            b'[' | b'{' => {
                depth += 1;
                most = most.max(depth);
            }
            b']' | b'}' => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    most
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

/// Read the JSON a caller hands the core (the door's arguments): as deep as `read_depth`, so a block is never unreadable because of what
/// carries it, and too deep a block is refused by code.
pub fn read_args(bytes: &[u8]) -> core::result::Result<Value, String> {
    use serde::Deserialize;
    let most = read_depth();
    if json_depth(bytes) > most {
        return Err(format!("nested deeper than {most}"));
    }
    let mut de = serde_json::Deserializer::from_slice(bytes);
    de.disable_recursion_limit();
    let value = Value::deserialize(&mut de).map_err(|e| e.to_string())?;
    de.end().map_err(|e| e.to_string())?;
    Ok(value)
}
