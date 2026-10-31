//! The one source: every closed list and grammar is read from protocol.json, exactly as written there. The caller may
//! hand in its own bytes ([`Spec::from_json`]); the repository's spec/protocol.json is built in as the default
//! ([`spec`]), so the crate works on its own. There is no alias table: year zero (spec/legacy/converter.md).
use crate::error::{Error, Result};
use crate::prelude::*;
use crate::regex::Regex;

/// protocol.json, built in (a synced copy of spec/protocol.json).
pub const PROTOCOL_JSON: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/protocol.json"));

/// One suite of protocol.json `suites`: a hash, a signature algorithm and an envelope, named together.
#[derive(Debug, Clone)]
pub struct SuiteInfo {
    pub name: String,
    pub hash: String,
    pub sign: String,
    pub envelope: String,
    pub sign_key_rule: String,
    pub spki_prefix: String,
    pub encrypt_key_rule: String,
    pub signature_rule: String,
    pub sign_key_re: Option<Regex>,
    pub encrypt_key_re: Option<Regex>,
    pub signature_re: Option<Regex>,
    /// The grammar of a passkey's longer signature, in a suite that has one (`signature.passkey.grammar`).
    pub passkey_re: Option<Regex>,
    /// How many bytes a signing key's raw point is (`sign_key.raw_key_bytes`) and a signature (`signature.bytes`).
    pub raw_key_bytes: usize,
    pub signature_bytes: usize,
}

/// protocol.json, read once, with the lists every module asks for.
#[derive(Debug, Clone)]
pub struct Spec {
    pub protocol: Value,
    pub version: String,
    pub types: Vec<String>,
    pub closed_types: Vec<String>,
    pub verbs: Vec<String>,
    pub ref_keys: Vec<String>,
    pub statuses: Vec<String>,
    pub stops: Vec<String>,
    pub powers: Vec<String>,
    pub genesis_required: Vec<String>,
    pub genesis_optional: Vec<String>,
    pub common: Vec<String>,
    pub terms: Vec<String>,
    pub line: Vec<String>,
    pub scope: Vec<String>,
    pub time_fields: Vec<String>,
    pub date_fields: Vec<String>,
    pub every: Vec<String>,
    pub int_min: f64,
    pub int_max: f64,
    pub block_bytes: usize,
    pub after_heads: usize,
    /// The most decimal places an issuer's own currency unit may name (limits.decimals_max).
    pub decimals_max: usize,
    /// The most digits a decimal string names (limits.decimal_digits): exact arithmetic on it stays cheap.
    pub decimal_digits: usize,
    /// How deep a block nests (limits.depth): the block is 1, each object or array inside one more.
    pub depth: usize,
    /// The most positions a bound's ring names (limits.bound_points): the overlap of two bounds costs the product of their edges, so it is capped.
    pub bound_points: usize,
    /// How deep a reader reads what carries blocks (limits.depth_read), so a block deeper than `depth` is refused, never unreadable.
    pub depth_read: usize,
    pub suites: Vec<SuiteInfo>,
    pub suite_default: String,
    grammar: Vec<(String, Regex)>,
}

pub fn strings_pub(value: Option<&Value>) -> Vec<String> {
    strings(value)
}
fn strings(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items.iter().filter_map(Value::as_str).map(String::from).collect(),
        Some(Value::Object(map)) => map.keys().cloned().collect(),
        _ => Vec::new(),
    }
}

/// The field names that protocol.json `field_shape` gives one shape (`time`, `date`, `duration`, `shape`), in the table's order.
fn fields_of(protocol: &Value, shape: &str) -> Vec<String> {
    match protocol.get("field_shape") {
        Some(Value::Object(map)) => map.iter().filter(|(_, s)| s.as_str() == Some(shape)).map(|(k, _)| k.clone()).collect(),
        _ => Vec::new(),
    }
}

impl Spec {
    /// The names a `field_shape` gives one shape: `time`, `date`, `duration` or `shape` (a field that holds exactly one keyed shape).
    pub fn fields_of(&self, shape: &str) -> Vec<String> {
        fields_of(&self.protocol, shape)
    }
    /// Read protocol.json from bytes.
    pub fn from_json(protocol: &[u8]) -> Result<Spec> {
        let protocol: Value = serde_json::from_slice(protocol)?;
        Spec::from_values(protocol)
    }

    pub fn from_values(protocol: Value) -> Result<Spec> {
        let p = &protocol;
        let mut grammar = Vec::new();
        if let Some(Value::Object(map)) = p.get("grammar") {
            for (name, pattern) in map {
                if let Some(pattern) = pattern.as_str() {
                    // `*_about` entries are prose, not patterns.
                    if name.ends_with("_about") {
                        continue;
                    }
                    grammar.push((name.clone(), Regex::new(pattern)?));
                }
            }
        }
        let list = |path: &str| strings(crate::js::get(p, path));
        let mut ref_keys = list("refs.who_and_where");
        ref_keys.extend(list("refs.what_and_which"));
        ref_keys.extend(list("verbs"));
        ref_keys.extend(list("causal"));
        let number = |path: &str| crate::js::get(p, path).and_then(Value::as_f64);
        let suite_default = crate::js::str_of(crate::js::get(p, "suites.default")).to_string();
        let mut suites = Vec::new();
        if let Some(Value::Object(map)) = p.get("suites") {
            for (name, row) in map {
                // The rows are the objects that name a hash; `about`, `default` and `future` are not suites.
                let (Some(hash), Some(sign)) = (
                    row.get("hash").and_then(Value::as_str),
                    row.get("sign").and_then(Value::as_str),
                ) else {
                    continue;
                };
                let at = |a: &str, b: &str| {
                    row.get(a)
                        .and_then(|x| x.get(b))
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string()
                };
                let (sk, ek, sg) = (at("sign_key", "grammar"), at("encrypt_key", "grammar"), at("signature", "grammar"));
                suites.push(SuiteInfo {
                    sign_key_re: Regex::new(&sk).ok(),
                    encrypt_key_re: Regex::new(&ek).ok(),
                    signature_re: Regex::new(&sg).ok(),
                    passkey_re: crate::js::get(row, "signature.passkey.grammar").and_then(Value::as_str).and_then(|g| Regex::new(g).ok()),
                    raw_key_bytes: crate::js::get(row, "sign_key.raw_key_bytes").and_then(Value::as_u64).unwrap_or(0) as usize,
                    signature_bytes: crate::js::get(row, "signature.bytes").and_then(Value::as_u64).unwrap_or(0) as usize,
                    name: name.clone(),
                    hash: hash.to_string(),
                    sign: sign.to_string(),
                    envelope: row
                        .get("envelope")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    sign_key_rule: sk,
                    spki_prefix: at("sign_key", "spki_prefix"),
                    encrypt_key_rule: ek,
                    signature_rule: sg,
                });
            }
        }
        Ok(Spec {
            version: crate::js::str_of(p.get("version")).to_string(),
            types: list("types"),
            closed_types: list("closed_types"),
            verbs: list("verbs"),
            ref_keys,
            statuses: list("statuses"),
            stops: list("stop"),
            powers: list("powers"),
            genesis_required: list("genesis.required"),
            // A genesis may carry any key field but `roles` (a circle's), and the recovery fields, beyond what it requires.
            genesis_optional: list("key_fields.fields")
                .into_iter()
                .chain(list("genesis.recovery"))
                .chain(list("genesis.private"))
                .filter(|f| f != "roles" && !list("genesis.required").contains(f))
                .collect(),
            common: list("common"),
            terms: list("terms"),
            line: list("line"),
            scope: list("scope"),
            time_fields: fields_of(p, "time"),
            date_fields: fields_of(p, "date"),
            every: list("fields.every"),
            int_min: number("integers.min").unwrap_or(-9007199254740991.0),
            int_max: number("integers.max").unwrap_or(9007199254740991.0),
            block_bytes: number("limits.block_bytes").unwrap_or(65536.0) as usize,
            after_heads: number("limits.after_heads").unwrap_or(16.0) as usize,
            decimals_max: number("limits.decimals_max").unwrap_or(15.0) as usize,
            decimal_digits: number("limits.decimal_digits").unwrap_or(40.0) as usize,
            depth: number("limits.depth").unwrap_or(32.0) as usize,
            bound_points: number("limits.bound_points").unwrap_or(256.0) as usize,
            depth_read: number("limits.depth_read").unwrap_or(128.0) as usize,
            suites,
            suite_default,
            grammar,
            protocol,
        })
    }

    /// A grammar rule by name (`hash`, `time`, `decimal`...). An unknown name matches nothing.
    pub fn re(&self, name: &str) -> Option<&Regex> {
        self.grammar.iter().find(|(n, _)| n == name).map(|(_, r)| r)
    }
    /// Whether text matches a grammar rule.
    pub fn is(&self, name: &str, text: &str) -> bool {
        // a decimal names at most limits.decimal_digits digits (core.md section 3)
        if name == "decimal" && text.bytes().filter(u8::is_ascii_digit).count() > self.decimal_digits {
            return false;
        }
        self.re(name).is_some_and(|r| r.test(text))
    }
    /// A list of protocol.json at a path (`shapes.amount`, `messages.pull`...).
    pub fn list(&self, path: &str) -> Vec<String> {
        strings(crate::js::get(&self.protocol, path))
    }
    /// The base fields of a type (protocol.json `fields` and, for an actor and a grant, `key_fields`).
    pub fn fields(&self, type_name: &str) -> Vec<String> {
        let mut out = strings(self.protocol.get("fields").and_then(|f| f.get(type_name)));
        // The key fields are defined once and carried by every type in `key_fields.on` (an actor and a grant).
        let keys = self.protocol.get("key_fields");
        if strings(keys.and_then(|k| k.get("on"))).iter().any(|t| t == type_name) {
            out.extend(strings(keys.and_then(|k| k.get("fields"))));
        }
        out
    }
    pub fn has_type(&self, name: &str) -> bool {
        self.types.iter().any(|t| t == name)
    }
    /// Whether a type is closed: its fields are fixed by the spec (core.md, Open types, closed authority).
    pub fn is_closed(&self, name: &str) -> bool {
        self.closed_types.iter().any(|t| t == name)
    }
    /// A suite by name (`std`, `p256`, `sm`); the default when the name is empty.
    pub fn suite(&self, name: &str) -> Option<&SuiteInfo> {
        let name = if name.is_empty() { self.suite_default.as_str() } else { name };
        self.suites.iter().find(|s| s.name == name)
    }
    /// Whether a hash name is a hash the protocol knows (`hashes`).
    pub fn knows_hash(&self, name: &str) -> bool {
        self.protocol.get("hashes").and_then(|h| h.get(name)).is_some()
    }
    /// The prefix of a hash (`sm3:`), empty for the bare one (SHA-256).
    pub fn hash_prefix(&self, name: &str) -> String {
        self.protocol
            .get("hashes")
            .and_then(|h| h.get(name))
            .and_then(|h| h.get("prefix"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    }
}

static DEFAULT: once_cell::race::OnceBox<Spec> = once_cell::race::OnceBox::new();

/// The built-in protocol.json, read once.
pub fn spec() -> &'static Spec {
    DEFAULT.get_or_init(|| {
        Box::new(Spec::from_json(PROTOCOL_JSON).expect("the built-in protocol.json reads"))
    })
}

/// The suite a block or a call means when it names none (protocol.json `suites.default`): one name, read from the spec, never a
/// second literal beside it.
pub fn default_suite() -> &'static str {
    spec().suite_default.as_str()
}

/// A suite name as a call gives it: the empty name is the default suite's (one place resolves it).
pub fn suite_or_default(name: &str) -> &str {
    if name.is_empty() { default_suite() } else { name }
}

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::new(s)
    }
}
