//! The compact form (encoding.md, "The compact form (CBOR)"): a public block as CBOR (RFC 8949) for links where JSON is
//! too heavy. It is a transport only: the id is always the hash of the canonical JSON, so a receiver rebuilds the block,
//! hashes its canonical JSON and checks the signature over that. Nothing here hashes or signs CBOR bytes.
//!
//! Writing is deterministic (shortest integers, definite lengths, map keys sorted by their encoded bytes, no tags, no
//! floats). Reading refuses indefinite lengths, floats, tags, null, undefined, duplicate keys and integers outside
//! ±(2^53 - 1), and accepts any other well-formed encoding of the same content. The byte paths, the time fields and the
//! short-key table come from protocol.json (`cbor`); none is written here.
use crate::block::{hex, unhex};
use crate::error::{Error, Result};
use crate::prelude::*;
use crate::spec::Spec;

const MAX: i64 = 9_007_199_254_740_991;
const DEPTH: usize = 64;

/// A CBOR data item, the subset the compact form uses.
#[derive(Debug, Clone, PartialEq)]
enum C {
    Int(i64),
    Bytes(Vec<u8>),
    Text(String),
    Array(Vec<C>),
    Map(Vec<(C, C)>),
    Bool(bool),
}

fn fail(message: impl Into<String>) -> Error {
    Error::new(format!("cbor: {}", message.into()))
}

// ---- Writing ----
fn head(out: &mut Vec<u8>, major: u8, n: u64) {
    let m = major << 5;
    if n < 24 {
        out.push(m | n as u8);
    } else if n <= 0xff {
        out.extend([m | 24, n as u8]);
    } else if n <= 0xffff {
        out.push(m | 25);
        out.extend((n as u16).to_be_bytes());
    } else if n <= 0xffff_ffff {
        out.push(m | 26);
        out.extend((n as u32).to_be_bytes());
    } else {
        out.push(m | 27);
        out.extend(n.to_be_bytes());
    }
}

fn write(out: &mut Vec<u8>, item: &C) -> Result<()> {
    match item {
        C::Int(n) if *n >= 0 => head(out, 0, *n as u64),
        C::Int(n) => head(out, 1, (-1 - *n) as u64),
        C::Bytes(b) => {
            head(out, 2, b.len() as u64);
            out.extend(b);
        }
        C::Text(t) => {
            head(out, 3, t.len() as u64);
            out.extend(t.as_bytes());
        }
        C::Array(items) => {
            head(out, 4, items.len() as u64);
            for i in items {
                write(out, i)?;
            }
        }
        C::Map(pairs) => {
            // Keys sorted by their encoded bytes, length first, then bytewise (RFC 8949 §4.2).
            let mut encoded: Vec<(Vec<u8>, &C)> = Vec::new();
            for (k, v) in pairs {
                let mut kb = Vec::new();
                write(&mut kb, k)?;
                encoded.push((kb, v));
            }
            encoded.sort_by(|a, b| a.0.len().cmp(&b.0.len()).then_with(|| a.0.cmp(&b.0)));
            if encoded.windows(2).any(|w| w[0].0 == w[1].0) {
                return Err(fail("a map has a duplicate key"));
            }
            head(out, 5, encoded.len() as u64);
            for (kb, v) in encoded {
                out.extend(kb);
                write(out, v)?;
            }
        }
        C::Bool(b) => out.push(if *b { 0xf5 } else { 0xf4 }),
    }
    Ok(())
}

// ---- Reading ----
struct Reader<'a> {
    b: &'a [u8],
    at: usize,
}
impl Reader<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8]> {
        let end = self
            .at
            .checked_add(n)
            .filter(|e| *e <= self.b.len())
            .ok_or_else(|| fail("it ends too soon"))?;
        let s = &self.b[self.at..end];
        self.at = end;
        Ok(s)
    }
    fn arg(&mut self, ai: u8) -> Result<u64> {
        Ok(match ai {
            0..=23 => ai as u64,
            24 => self.take(1)?[0] as u64,
            25 => u16::from_be_bytes(self.take(2)?.try_into().unwrap()) as u64,
            26 => u32::from_be_bytes(self.take(4)?.try_into().unwrap()) as u64,
            27 => u64::from_be_bytes(self.take(8)?.try_into().unwrap()),
            31 => return Err(fail("an indefinite length is refused")),
            _ => return Err(fail("a reserved additional information value")),
        })
    }
    fn item(&mut self, depth: usize) -> Result<C> {
        if depth > DEPTH {
            return Err(fail("nested too deep"));
        }
        let first = self.take(1)?[0];
        let (major, ai) = (first >> 5, first & 31);
        match major {
            0 => {
                let n = self.arg(ai)?;
                if n > MAX as u64 {
                    return Err(fail("an integer outside ±(2^53 - 1) is refused"));
                }
                Ok(C::Int(n as i64))
            }
            1 => {
                let n = self.arg(ai)?;
                if n >= MAX as u64 {
                    return Err(fail("an integer outside ±(2^53 - 1) is refused"));
                }
                Ok(C::Int(-1 - n as i64))
            }
            2 | 3 => {
                let n = self.arg(ai)? as usize;
                let bytes = self.take(n)?.to_vec();
                if major == 2 {
                    Ok(C::Bytes(bytes))
                } else {
                    String::from_utf8(bytes)
                        .map(C::Text)
                        .map_err(|_| fail("a text string is not UTF-8"))
                }
            }
            4 => {
                let n = self.arg(ai)? as usize;
                if n > self.b.len() - self.at {
                    return Err(fail("it ends too soon"));
                }
                let mut items = Vec::new();
                for _ in 0..n {
                    items.push(self.item(depth + 1)?);
                }
                Ok(C::Array(items))
            }
            5 => {
                let n = self.arg(ai)? as usize;
                if n > self.b.len() - self.at {
                    return Err(fail("it ends too soon"));
                }
                let mut pairs: Vec<(C, C)> = Vec::new();
                for _ in 0..n {
                    let k = self.item(depth + 1)?;
                    if pairs.iter().any(|(p, _)| *p == k) {
                        return Err(fail("a map has a duplicate key"));
                    }
                    let v = self.item(depth + 1)?;
                    pairs.push((k, v));
                }
                Ok(C::Map(pairs))
            }
            6 => Err(fail("a tag is refused")),
            _ => match ai {
                20 => Ok(C::Bool(false)),
                21 => Ok(C::Bool(true)),
                22 => Err(fail("null is refused: canonical form drops it")),
                23 => Err(fail("undefined is refused")),
                25..=27 => Err(fail("a float is refused")),
                31 => Err(fail("a break (an indefinite length) is refused")),
                _ => Err(fail("a simple value other than true and false is refused")),
            },
        }
    }
}

fn read_all(bytes: &[u8]) -> Result<C> {
    let mut r = Reader { b: bytes, at: 0 };
    let item = r.item(0)?;
    if r.at != bytes.len() {
        return Err(fail("bytes follow the item"));
    }
    Ok(item)
}

// ---- The mapping between JSON values and CBOR items (protocol.json `cbor`) ----
#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Hash,
    SignKey,
    EncryptKey,
    Nonce,
}

/// A byte path matches a value's path: tokens equal, `*` any key; an array's elements are the array's own path unless
/// the pattern says `[]`. The value's path is a list of keys, with "[]" for each array step.
fn path_matches(pattern: &str, path: &[String]) -> bool {
    let mut tokens: Vec<String> = Vec::new();
    for part in pattern.split('.') {
        match part.strip_suffix("[]") {
            Some(name) => {
                tokens.push(name.to_string());
                tokens.push("[]".to_string());
            }
            None => tokens.push(part.to_string()),
        }
    }
    let (mut i, mut j) = (0, 0);
    while i < path.len() {
        if path[i] == "[]" && !(j < tokens.len() && tokens[j] == "[]") {
            i += 1;
            continue;
        }
        if j >= tokens.len() || !(tokens[j] == "*" || tokens[j] == path[i]) {
            return false;
        }
        i += 1;
        j += 1;
    }
    j == tokens.len()
}

struct Codec<'a> {
    spec: &'a Spec,
    short: bool,
    keys: Vec<String>,
    types: Vec<String>,
    bytes: Vec<(Kind, Vec<String>)>,
    time_fields: Vec<String>,
    prefix: Vec<u8>,
}

impl<'a> Codec<'a> {
    fn new(spec: &'a Spec, short: bool) -> Codec<'a> {
        let cbor = spec.protocol.get("cbor");
        let mut bytes = Vec::new();
        for (name, kind) in [
            ("hash", Kind::Hash),
            ("sign_key", Kind::SignKey),
            ("encrypt_key", Kind::EncryptKey),
            ("nonce", Kind::Nonce),
        ] {
            for p in spec.list(&format!("cbor.bytes.{name}")) {
                bytes.push((kind, vec![p]));
            }
        }
        let prefix = spec
            .suite(&spec.suite_default)
            .map(|s| s.spki_prefix.as_str())
            .and_then(unhex)
            .unwrap_or_default();
        let _ = cbor;
        Codec {
            spec,
            short,
            keys: spec.list("cbor.keys"),
            types: spec.types.clone(),
            bytes,
            time_fields: spec.time_fields.clone(),
            prefix,
        }
    }

    fn byte_kind(&self, path: &[String]) -> Option<Kind> {
        self.bytes
            .iter()
            .find(|(_, p)| path_matches(&p[0], path))
            .map(|(k, _)| *k)
    }

    /// Where a block's time fields are checked (protocol.json `time_fields_checked_in`): the state, its terms, its
    /// scope and each line of its terms. `path` is the path of the object holding the field.
    fn time_place(path: &[String]) -> bool {
        let p: Vec<&str> = path.iter().map(String::as_str).collect();
        matches!(
            p.as_slice(),
            ["state"] | ["state", "terms"] | ["state", "scope"] | ["state", "terms", "lines", "[]"]
        )
    }
    fn is_time_field(&self, path: &[String], key: &str) -> bool {
        Self::time_place(path) && self.time_fields.iter().any(|t| t == key)
    }

    // JSON -> CBOR
    fn to_c(&self, v: &Value, path: &mut Vec<String>) -> Result<Option<C>> {
        Ok(Some(match v {
            Value::Null => return Err(fail(format!("{} is null: canonical form has none", path.join(".")))),
            Value::Bool(b) => C::Bool(*b),
            Value::Number(n) => match n.as_i64() {
                Some(i) if (-MAX..=MAX).contains(&i) => C::Int(i),
                Some(_) => return Err(fail(format!("{} is outside ±(2^53 - 1)", path.join(".")))),
                None => {
                    return Err(fail(format!(
                        "{} is a float or too large: signed content holds none",
                        path.join(".")
                    )))
                }
            },
            Value::String(s) => self.string_to_c(s, path)?,
            Value::Array(items) => {
                let mut out = Vec::new();
                for (i, item) in items.iter().enumerate() {
                    let _ = i;
                    path.push("[]".into());
                    let c = self.to_c(item, path);
                    path.pop();
                    if let Some(c) = c? {
                        out.push(c);
                    }
                }
                C::Array(out)
            }
            Value::Object(map) => {
                let here = path.clone();
                let mut pairs = Vec::new();
                for (k, val) in map {
                    path.push(k.clone());
                    let c = if path.len() == 1 && k == "type" {
                        self.type_to_c(val)
                    } else if self.is_time_field(&here, k) {
                        self.time_to_c(val, path)
                    } else {
                        self.to_c(val, path)
                    };
                    path.pop();
                    if let Some(c) = c? {
                        pairs.push((self.key_to_c(k), c));
                    }
                }
                C::Map(pairs)
            }
        }))
    }

    fn key_to_c(&self, k: &str) -> C {
        if self.short {
            if let Some(i) = self.keys.iter().position(|n| n == k) {
                return C::Int(i as i64);
            }
        }
        C::Text(k.to_string())
    }

    fn type_to_c(&self, v: &Value) -> Result<Option<C>> {
        match v {
            Value::String(t) if self.short => match self.types.iter().position(|n| n == t) {
                Some(i) => Ok(Some(C::Int(i as i64))),
                None => Ok(Some(C::Text(t.clone()))),
            },
            Value::String(t) => Ok(Some(C::Text(t.clone()))),
            _ => Err(fail("type is text")),
        }
    }

    // A time at a time field: milliseconds since 1970 when it matches grammar.time; `when` may be { from, to }.
    fn time_to_c(&self, v: &Value, path: &mut Vec<String>) -> Result<Option<C>> {
        match v {
            Value::String(s) if self.spec.is("time", s) => match crate::time::parse(s) {
                Some(ms) => Ok(Some(C::Int(ms))),
                None => Ok(Some(C::Text(s.clone()))),
            },
            Value::Object(map) if path.last().map(String::as_str) == Some("when") => {
                let mut pairs = Vec::new();
                for (k, val) in map {
                    path.push(k.clone());
                    let c = if k == "from" || k == "to" {
                        self.time_to_c(val, path)
                    } else {
                        self.to_c(val, path)
                    };
                    path.pop();
                    if let Some(c) = c? {
                        pairs.push((self.key_to_c(k), c));
                    }
                }
                Ok(Some(C::Map(pairs)))
            }
            other => self.to_c(other, path),
        }
    }

    fn string_to_c(&self, s: &str, path: &[String]) -> Result<C> {
        let text = crate::canonical::nfc(s).into_owned();
        if let Some(kind) = self.byte_kind(path) {
            match kind {
                Kind::Hash if self.spec.is("hash", &text) => {
                    return Ok(C::Bytes(unhex(&text).unwrap_or_default()))
                }
                // A signing key: for `std` its 32 raw bytes (the fixed SPKI prefix left off), for another suite its whole SPKI.
                Kind::SignKey => {
                    let std_key = self
                        .spec
                        .suite(&self.spec.suite_default)
                        .and_then(|s| s.sign_key_re.as_ref())
                        .is_some_and(|r| r.test(&text));
                    let any_key = self.spec.suites.iter().any(|s| s.sign_key_re.as_ref().is_some_and(|r| r.test(&text)));
                    if any_key {
                        let raw = unhex(&text).unwrap_or_default();
                        return Ok(C::Bytes(if std_key { raw[self.prefix.len().min(raw.len())..].to_vec() } else { raw }));
                    }
                }
                Kind::EncryptKey
                    if self.spec.suites.iter().any(|s| s.encrypt_key_re.as_ref().is_some_and(|r| r.test(&text))) =>
                {
                    return Ok(C::Bytes(unhex(&text).unwrap_or_default()))
                }
                Kind::Nonce if self.spec.is("nonce", &text) => {
                    return Ok(C::Bytes(unhex(&text).unwrap_or_default()))
                }
                _ => {}
            }
        }
        Ok(C::Text(text))
    }

    // CBOR -> JSON
    fn from_c(&self, c: &C, path: &mut Vec<String>) -> Result<Value> {
        Ok(match c {
            C::Bool(b) => Value::Bool(*b),
            C::Int(n) => json!(n),
            C::Text(t) => Value::String(t.clone()),
            C::Bytes(b) => self.bytes_to_text(b, path)?,
            C::Array(items) => {
                let mut out = Vec::new();
                for item in items {
                    path.push("[]".into());
                    let v = self.from_c(item, path);
                    path.pop();
                    out.push(v?);
                }
                Value::Array(out)
            }
            C::Map(pairs) => {
                let here = path.clone();
                let mut map = Map::new();
                for (k, v) in pairs {
                    let name = self.name_of(k)?;
                    if map.contains_key(&name) {
                        return Err(fail("a map has a duplicate key"));
                    }
                    path.push(name.clone());
                    let value = if path.len() == 1 && name == "type" {
                        self.type_from_c(v)
                    } else if self.is_time_field(&here, &name) {
                        self.time_from_c(v, path)
                    } else {
                        self.from_c(v, path)
                    };
                    path.pop();
                    map.insert(name, value?);
                }
                Value::Object(map)
            }
        })
    }

    fn name_of(&self, k: &C) -> Result<String> {
        match k {
            C::Text(t) => Ok(t.clone()),
            C::Int(i) if *i >= 0 && (*i as usize) < self.keys.len() => {
                Ok(self.keys[*i as usize].clone())
            }
            C::Int(i) => Err(fail(format!("key {i} is not in the key table"))),
            _ => Err(fail("a map key is text or a table position")),
        }
    }

    fn type_from_c(&self, v: &C) -> Result<Value> {
        match v {
            C::Text(t) => Ok(Value::String(t.clone())),
            C::Int(i) if *i >= 0 && (*i as usize) < self.types.len() => {
                Ok(Value::String(self.types[*i as usize].clone()))
            }
            _ => Err(fail("type is text, or its position in the types list")),
        }
    }

    fn time_from_c(&self, v: &C, path: &mut Vec<String>) -> Result<Value> {
        match v {
            C::Int(ms) => {
                let t = crate::time::iso(*ms);
                if self.spec.is("time", &t) {
                    Ok(Value::String(t))
                } else {
                    Err(fail(format!(
                        "{} is a time outside the years 0000 to 9999",
                        path.join(".")
                    )))
                }
            }
            C::Map(pairs) if path.last().map(String::as_str) == Some("when") => {
                let mut map = Map::new();
                for (k, val) in pairs {
                    let name = self.name_of(k)?;
                    if map.contains_key(&name) {
                        return Err(fail("a map has a duplicate key"));
                    }
                    path.push(name.clone());
                    let value = if name == "from" || name == "to" {
                        self.time_from_c(val, path)
                    } else {
                        self.from_c(val, path)
                    };
                    path.pop();
                    map.insert(name, value?);
                }
                Ok(Value::Object(map))
            }
            other => self.from_c(other, path),
        }
    }

    fn bytes_to_text(&self, b: &[u8], path: &[String]) -> Result<Value> {
        let kind = self.byte_kind(path).ok_or_else(|| {
            fail(format!(
                "{} holds a byte string where the protocol has none",
                path.join(".")
            ))
        })?;
        let ok = match kind {
            Kind::Hash => b.len() == 32,
            Kind::EncryptKey => b.len() == 32 || b.len() == 65,
            Kind::Nonce => b.len() == 16,
            Kind::SignKey => !b.is_empty(),
        };
        if !ok {
            return Err(fail(format!(
                "{} is a byte string of the wrong length",
                path.join(".")
            )));
        }
        // An Ed25519 key travels as its 32 raw bytes; the reader puts the fixed SPKI prefix back. Another algorithm
        // sends its whole SPKI bytes.
        if kind == Kind::SignKey && b.len() == 32 {
            let mut full = self.prefix.clone();
            full.extend(b);
            return Ok(Value::String(hex(&full)));
        }
        Ok(Value::String(hex(b)))
    }
}

fn table_of(spec: &Spec, short: bool) -> i64 {
    if short {
        spec.protocol
            .get("cbor")
            .and_then(|c| c.get("table"))
            .and_then(Value::as_i64)
            .unwrap_or(1)
    } else {
        0
    }
}

fn block_to_c(codec: &Codec, block: &Value) -> Result<C> {
    let map = block
        .as_object()
        .ok_or_else(|| fail("a block is an object"))?;
    let mut body = Map::new();
    for k in ["type", "state", "refs"] {
        body.insert(
            k.to_string(),
            map.get(k)
                .cloned()
                .ok_or_else(|| fail(format!("a block has {k}")))?,
        );
    }
    codec
        .to_c(&Value::Object(body), &mut Vec::new())?
        .ok_or_else(|| fail("a block is not null"))
}

fn message_to_c(spec: &Spec, codec: &Codec, block: &Value) -> Result<C> {
    let sig = block
        .get("signature")
        .and_then(Value::as_str)
        .ok_or_else(|| fail("a message carries the block's signature"))?;
    // 64 bytes, or for a p256 key a passkey's longer form (modules/passkeys.md): the suite's own check says which opens.
    let wide = block.get("suite").and_then(Value::as_str) == Some("p256") && sig.len() > 128;
    if !((sig.len() == 128 || wide) && sig.len() % 2 == 0 && unhex(sig).is_some()) {
        return Err(fail("the signature is 64 bytes, in hex (a passkey's, longer)"));
    }
    let mut parts = vec![
        C::Int(table_of(spec, codec.short)),
        block_to_c(codec, block)?,
        C::Bytes(unhex(sig).unwrap_or_default()),
    ];
    // A suite other than std is named by a text entry after the signature.
    let suite = crate::block::suite_of(block);
    if !suite.is_empty() && suite != "std" {
        parts.push(C::Text(suite.to_string()));
    }
    Ok(C::Array(parts))
}

fn message_from_c(spec: &Spec, c: &C) -> Result<Value> {
    let C::Array(parts) = c else {
        return Err(fail("a message is [t, block, signature]"));
    };
    let (t, body, sig, suite) = match parts.as_slice() {
        [C::Int(t), body, C::Bytes(sig)] => (t, body, sig, "std".to_string()),
        [C::Int(t), body, C::Bytes(sig), C::Text(suite)] => (t, body, sig, suite.clone()),
        _ => return Err(fail("a message is [t, block, signature] and the suite's name when it is not std")),
    };
    if spec.suite(&suite).is_none() {
        return Err(Error::coded("unknown_suite", format!("cbor: the suite {suite} is not one this reader knows")));
    }
    let table = table_of(spec, true);
    if *t != 0 && *t != table {
        return Err(fail(format!(
            "t {t} is neither 0 nor a key table this reader has ({table})"
        )));
    }
    if sig.len() != 64 && !(suite == "p256" && sig.len() > 64) {
        return Err(fail("the signature is 64 bytes (a p256 passkey's, longer)"));
    }
    let codec = Codec::new(spec, *t != 0);
    let body = codec.from_c(body, &mut Vec::new())?;
    let map = body.as_object().ok_or_else(|| fail("the block is a map"))?;
    for k in ["type", "state", "refs"] {
        if !map.contains_key(k) {
            return Err(fail(format!("the block has {k}")));
        }
    }
    if map.len() != 3 {
        return Err(fail("a block is { type, state, refs }"));
    }
    let (ty, state, refs) = (
        map["type"].as_str().unwrap_or(""),
        &map["state"],
        &map["refs"],
    );
    if !state.is_object() || !refs.is_object() || ty.is_empty() {
        return Err(fail("a block is { type, state, refs }"));
    }
    // The id is the hash of the canonical JSON the block is rebuilt as: never of these bytes.
    let hash = crate::hash_suite(&suite, ty, state, refs);
    let mut out = json!({ "hash": hash, "type": ty, "state": state, "refs": refs, "signature": hex(sig) });
    if suite != "std" {
        out["suite"] = json!(suite);
    }
    Ok(out)
}

/// A signed public block as the CBOR message `[t, block, signature]` (hex-free bytes). `short` uses the key table.
pub fn encode_message_with(spec: &Spec, block: &Value, short: bool) -> Result<Vec<u8>> {
    let codec = Codec::new(spec, short);
    let mut out = Vec::new();
    write(&mut out, &message_to_c(spec, &codec, block)?)?;
    Ok(out)
}
/// The block a CBOR message carries, rebuilt with its hash taken from its canonical JSON.
pub fn decode_message_with(spec: &Spec, bytes: &[u8]) -> Result<Value> {
    message_from_c(spec, &read_all(bytes)?)
}
/// A push of several blocks: an array of messages.
pub fn encode_push_with(spec: &Spec, blocks: &[Value], short: bool) -> Result<Vec<u8>> {
    let codec = Codec::new(spec, short);
    let items: Result<Vec<C>> = blocks
        .iter()
        .map(|b| message_to_c(spec, &codec, b))
        .collect();
    let mut out = Vec::new();
    write(&mut out, &C::Array(items?))?;
    Ok(out)
}
pub fn decode_push_with(spec: &Spec, bytes: &[u8]) -> Result<Vec<Value>> {
    let C::Array(items) = read_all(bytes)? else {
        return Err(fail("a push is an array of messages"));
    };
    items.iter().map(|m| message_from_c(spec, m)).collect()
}
/// A chain header `{ author, seq, prev, hash }`: the ids as bytes.
pub fn encode_header_with(spec: &Spec, header: &Value, short: bool) -> Result<Vec<u8>> {
    let codec = Codec::new(spec, short);
    let map = header
        .as_object()
        .ok_or_else(|| fail("a header is { author, seq, prev, hash }"))?;
    let mut pairs = Vec::new();
    for k in ["author", "seq", "prev", "hash"] {
        let v = map
            .get(k)
            .ok_or_else(|| fail(format!("a header has {k}")))?;
        let c = match v {
            Value::String(s) if k != "seq" && spec.is("hash", s) => {
                C::Bytes(unhex(s).unwrap_or_default())
            }
            Value::String(s) if k != "seq" && spec.is("id", s) => C::Text(s.clone()),
            Value::Number(n) if k == "seq" => match n.as_i64() {
                Some(i) if (-MAX..=MAX).contains(&i) => C::Int(i),
                _ => return Err(fail("seq is a whole number")),
            },
            _ => return Err(fail(format!("header {k} is an id"))),
        };
        pairs.push((codec.key_to_c(k), c));
    }
    let mut out = Vec::new();
    write(&mut out, &C::Map(pairs))?;
    Ok(out)
}
pub fn decode_header_with(spec: &Spec, bytes: &[u8]) -> Result<Value> {
    let C::Map(pairs) = read_all(bytes)? else {
        return Err(fail("a header is a map"));
    };
    let codec = Codec::new(spec, true);
    let mut out = Map::new();
    for (k, v) in &pairs {
        let name = codec.name_of(k)?;
        if out.contains_key(&name) {
            return Err(fail("a map has a duplicate key"));
        }
        let value = match (name.as_str(), v) {
            ("seq", C::Int(i)) => json!(i),
            ("author" | "prev" | "hash", C::Bytes(b)) if b.len() == 32 => Value::String(hex(b)),
            ("author" | "prev" | "hash", C::Text(t)) if spec.is("id", t) => Value::String(t.clone()),
            _ => return Err(fail(format!("header {name} is wrong"))),
        };
        out.insert(name, value);
    }
    for k in ["author", "seq", "prev", "hash"] {
        if !out.contains_key(k) {
            return Err(fail(format!("a header has {k}")));
        }
    }
    Ok(Value::Object(out))
}

/// The built-in spec's versions of the above.
pub fn encode_message(block: &Value, short: bool) -> Result<Vec<u8>> {
    encode_message_with(crate::spec(), block, short)
}
pub fn decode_message(bytes: &[u8]) -> Result<Value> {
    decode_message_with(crate::spec(), bytes)
}
