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

/// The canonical bytes of a block whose `type` is not text (it is refused, `type_name`, but its bytes still have an id): the type is written
/// as the value it is, so a reader and the oracle hash the same bytes.
pub fn canonical_any_type(type_value: &Value, state: &Value, refs: &Value) -> String {
    let mut out = String::with_capacity(128);
    out.push_str("{\"refs\":");
    write_value(&mut out, refs);
    out.push_str(",\"state\":");
    write_value(&mut out, state);
    out.push_str(",\"type\":");
    write_value(&mut out, type_value);
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
    // read to limits.depth_read deep and no deeper (encoding.md): every reader agrees where a text stops being one it reads
    if json_depth(text.as_bytes()) > crate::spec().depth_read {
        return Err(format!("nested deeper than {} (limits.depth_read)", crate::spec().depth_read));
    }
    let mut de = serde_json::Deserializer::from_str(text);
    de.disable_recursion_limit();
    let value = Strict::deserialize(&mut de).map(|s| s.0).map_err(|e| e.to_string())?;
    de.end().map_err(|e| e.to_string())?;
    Ok(value)
}

/// A push read from its text (nodes.md, Push; transport.md): JSON with no repeated key at any depth, scanned without building a value and
/// without recursion, so nothing inside one block (a number too large for a float, a lone surrogate, a block nested too deep) makes the
/// push unreadable: each block is judged by its own text (`strict_text`). Returns, for each message in order, the span of its `block`
/// text (None for a sealed message, which carries none). Text that is not JSON, has a repeated key, or is not `{ messages: [...] }` is an
/// error.
pub fn push_block_spans(text: &str) -> core::result::Result<Vec<Option<(usize, usize)>>, String> {
    // an object: the keys seen, the key being read, whether a key (or its end) comes next; an array: its element, whether any came
    enum Frame {
        Obj { keys: alloc::collections::BTreeSet<Vec<u16>>, key: Vec<u16>, want_key: bool, first: bool },
        Arr { n: usize, any: bool, first: bool },
    }
    let b = text.as_bytes();
    let bad = |what: &str, at: usize| format!("{what} at byte {at}");
    let skip_ws = |mut i: usize| {
        while i < b.len() && matches!(b[i], b' ' | b'\t' | b'\n' | b'\r') {
            i += 1;
        }
        i
    };
    // a string from its opening quote: its UTF-16 units (keys compare so), and the index past its closing quote
    let string = |at: usize| -> core::result::Result<(Vec<u16>, usize), String> {
        let mut j = at + 1;
        let mut units: Vec<u16> = Vec::new();
        loop {
            let Some(&c) = b.get(j) else { return Err(bad("an unclosed string", at)) };
            match c {
                b'"' => return Ok((units, j + 1)),
                b'\\' => {
                    let unit = match b.get(j + 1) {
                        Some(b'"') => 0x22,
                        Some(b'\\') => 0x5c,
                        Some(b'/') => 0x2f,
                        Some(b'b') => 0x08,
                        Some(b'f') => 0x0c,
                        Some(b'n') => 0x0a,
                        Some(b'r') => 0x0d,
                        Some(b't') => 0x09,
                        Some(b'u') => {
                            let hex = b.get(j + 2..j + 6).and_then(|h| core::str::from_utf8(h).ok()).filter(|h| h.bytes().all(|x| x.is_ascii_hexdigit()));
                            let unit = hex.and_then(|h| u16::from_str_radix(h, 16).ok()).ok_or_else(|| bad("a bad \\u escape", j))?;
                            j += 4;
                            unit
                        }
                        _ => return Err(bad("a bad escape", j)),
                    };
                    units.push(unit);
                    j += 2;
                }
                0..=0x1f => return Err(bad("a control character in a string", j)),
                _ => {
                    let ch = text.get(j..).and_then(|t| t.chars().next()).ok_or_else(|| bad("text that is not UTF-8", j))?;
                    let mut buf = [0u16; 2];
                    units.extend_from_slice(ch.encode_utf16(&mut buf));
                    j += ch.len_utf8();
                }
            }
        }
    };
    // a number or a literal, read by its grammar alone (never as a float): the index past it
    let scalar = |at: usize| -> core::result::Result<usize, String> {
        for lit in ["true", "false", "null"] {
            if b[at..].starts_with(lit.as_bytes()) {
                return Ok(at + lit.len());
            }
        }
        let digits = |mut j: usize| {
            let s = j;
            while j < b.len() && b[j].is_ascii_digit() {
                j += 1;
            }
            (j, j > s)
        };
        let mut j = at;
        if b.get(j) == Some(&b'-') {
            j += 1;
        }
        if b.get(j) == Some(&b'0') {
            j += 1;
        } else {
            let (k, some) = digits(j);
            if !some {
                return Err(bad("a value that is not JSON", at));
            }
            j = k;
        }
        if b.get(j) == Some(&b'.') {
            let (k, some) = digits(j + 1);
            if !some {
                return Err(bad("a number that is not JSON", at));
            }
            j = k;
        }
        if matches!(b.get(j), Some(b'e' | b'E')) {
            j += 1;
            if matches!(b.get(j), Some(b'+' | b'-')) {
                j += 1;
            }
            let (k, some) = digits(j);
            if !some {
                return Err(bad("a number that is not JSON", at));
            }
            j = k;
        }
        Ok(j)
    };
    let messages: Vec<u16> = "messages".encode_utf16().collect();
    let block: Vec<u16> = "block".encode_utf16().collect();
    let is_key = |f: Option<&Frame>, want: &Vec<u16>| matches!(f, Some(Frame::Obj { key, .. }) if key == want);
    let mut stack: Vec<Frame> = Vec::new();
    let mut spans: alloc::collections::BTreeMap<usize, (usize, usize)> = Default::default();
    let mut count: Option<usize> = None;
    let (mut top_is_object, mut messages_array) = (false, false);
    let mut i = skip_ws(0);
    let mut value_next = true;
    loop {
        if !value_next {
            // inside a container: a key, a separator or its end. A value's parent already waits for what follows it.
            i = skip_ws(i);
            let mut closed = false;
            match stack.last_mut() {
                None => break,
                Some(Frame::Obj { keys, key, want_key, first }) => match b.get(i) {
                    Some(b'}') if !*want_key || *first => {
                        i += 1;
                        closed = true;
                    }
                    Some(b',') if !*want_key => {
                        i += 1;
                        *want_key = true;
                    }
                    Some(b'"') if *want_key => {
                        let (k, next) = string(i)?;
                        if !keys.insert(k.clone()) {
                            return Err(bad("a repeated key", i));
                        }
                        *key = k;
                        i = skip_ws(next);
                        if b.get(i) != Some(&b':') {
                            return Err(bad("an object that is not JSON", i));
                        }
                        i += 1;
                        *want_key = false;
                        *first = false;
                        value_next = true;
                    }
                    _ => return Err(bad("an object that is not JSON", i)),
                },
                Some(Frame::Arr { n, any, first }) => match b.get(i) {
                    Some(b']') => {
                        i += 1;
                        closed = true;
                    }
                    Some(b',') if !*first => {
                        i += 1;
                        *n += 1;
                        value_next = true;
                    }
                    _ if *first => {
                        *first = false;
                        *any = true;
                        value_next = true;
                    }
                    _ => return Err(bad("an array that is not JSON", i)),
                },
            }
            if closed {
                let done = stack.pop();
                // the messages array closed: how many messages it held
                if stack.len() == 1 && is_key(stack.first(), &messages) {
                    if let Some(Frame::Arr { n, any, .. }) = done {
                        count.get_or_insert(if any { n + 1 } else { 0 });
                    }
                }
                // a message's block closed: its span ends here
                if stack.len() == 3 && is_key(stack.first(), &messages) && is_key(stack.get(2), &block) {
                    if let Some(Frame::Arr { n, .. }) = stack.get(1) {
                        if let Some(span) = spans.get_mut(n) {
                            span.1 = i;
                        }
                    }
                }
            }
            continue;
        }
        // a value begins
        value_next = false;
        i = skip_ws(i);
        let depth = stack.len();
        let at_block = depth == 3 && is_key(stack.first(), &messages) && matches!(stack.get(1), Some(Frame::Arr { .. })) && is_key(stack.get(2), &block);
        let message_n = match stack.get(1) {
            Some(Frame::Arr { n, .. }) => *n,
            _ => 0,
        };
        let start = i;
        match b.get(i) {
            Some(b'{') => {
                top_is_object |= depth == 0;
                i += 1;
                stack.push(Frame::Obj { keys: Default::default(), key: Vec::new(), want_key: true, first: true });
            }
            Some(b'[') => {
                messages_array |= depth == 1 && is_key(stack.first(), &messages);
                i += 1;
                stack.push(Frame::Arr { n: 0, any: false, first: true });
            }
            Some(b'"') => i = string(i)?.1,
            Some(_) => i = scalar(i)?,
            None => return Err(bad("text that ends early", i)),
        }
        if at_block {
            spans.insert(message_n, (start, i));
        }
        if depth == 0 && stack.is_empty() {
            break;
        }
    }
    if skip_ws(i) != b.len() {
        return Err(bad("text after the push", i));
    }
    if !top_is_object || !messages_array {
        return Err("a push is { messages, for }".into());
    }
    Ok((0..count.unwrap_or(0)).map(|k| spans.get(&k).copied()).collect())
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

/// Read the JSON a caller hands the core (the door's arguments): as deep as limits.depth_read plus room for what wraps a block (a call,
/// a push, a message), so a block is never unreadable because of what carries it, and too deep a block is refused by code.
pub fn read_args(bytes: &[u8]) -> core::result::Result<Value, String> {
    use serde::Deserialize;
    let most = crate::spec().depth_read + 32;
    if json_depth(bytes) > most {
        return Err(format!("nested deeper than {most}"));
    }
    let mut de = serde_json::Deserializer::from_slice(bytes);
    de.disable_recursion_limit();
    let value = Value::deserialize(&mut de).map_err(|e| e.to_string())?;
    de.end().map_err(|e| e.to_string())?;
    Ok(value)
}
