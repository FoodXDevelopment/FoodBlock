//! The one source: every closed list and grammar is read from protocol.json, exactly as written there. The caller may
//! hand in its own bytes ([`Spec::from_json`]); the repository's spec/protocol.json is built in as the default
//! ([`spec`]), so the crate works on its own. There is no alias table: year zero (spec/legacy/converter.md).
use crate::error::{Error, Result};
use crate::js::text;
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
    pub grant_kinds: Vec<String>,
    pub powers: Vec<String>,
    pub genesis_required: Vec<String>,
    pub genesis_optional: Vec<String>,
    pub common: Vec<String>,
    pub terms: Vec<String>,
    pub line: Vec<String>,
    pub scope: Vec<String>,
    pub schema: Vec<String>,
    pub grounds: Vec<String>,
    pub time_fields: Vec<String>,
    pub date_fields: Vec<String>,
    pub every: Vec<String>,
    pub int_min: f64,
    pub int_max: f64,
    pub block_bytes: usize,
    pub after_heads: usize,
    /// The most decimal places an issuer's own currency unit may name (limits.decimals_max).
    pub decimals_max: usize,
    pub suites: Vec<SuiteInfo>,
    pub suite_default: String,
    grammar: Vec<(String, Regex)>,
}

pub fn strings_pub(value: Option<&Value>) -> Vec<String> {
    strings(value)
}
fn strings(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items.iter().map(|v| text(Some(v))).collect(),
        Some(Value::Object(map)) => map.keys().cloned().collect(),
        _ => Vec::new(),
    }
}

impl Spec {
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
                    // `*_note` entries are prose, not patterns.
                    if name.ends_with("_note") {
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
            grant_kinds: list("grant_kinds"),
            powers: list("powers"),
            genesis_required: list("genesis.required"),
            genesis_optional: list("genesis.optional"),
            common: list("common"),
            terms: list("terms"),
            line: list("line"),
            scope: list("scope"),
            schema: list("schema"),
            grounds: list("grounds"),
            time_fields: list("time_fields"),
            date_fields: list("date_fields"),
            every: list("fields.every"),
            int_min: number("integers.min").unwrap_or(-9007199254740991.0),
            int_max: number("integers.max").unwrap_or(9007199254740991.0),
            block_bytes: number("limits.block_bytes").unwrap_or(65536.0) as usize,
            after_heads: number("limits.after_heads").unwrap_or(16.0) as usize,
            decimals_max: number("limits.decimals_max").unwrap_or(15.0) as usize,
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
        self.re(name).is_some_and(|r| r.test(text))
    }
    /// A list of protocol.json at a path (`shapes.amount`, `messages.pull`...).
    pub fn list(&self, path: &str) -> Vec<String> {
        strings(crate::js::get(&self.protocol, path))
    }
    /// The base fields of a type (protocol.json `fields`).
    pub fn fields(&self, type_name: &str) -> Vec<String> {
        strings(self.protocol.get("fields").and_then(|f| f.get(type_name)))
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

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::new(s)
    }
}
