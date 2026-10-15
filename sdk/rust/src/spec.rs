//! The one source (protocol.md, "One source for lists"): every closed list and grammar is read from protocol.json,
//! every older shape from aliases.json, exactly as written there. The caller may hand in its own bytes
//! ([`Spec::from_json`]); the repository's spec/ is built in as the default ([`spec`]), so the crate works on its own.
use crate::error::{Error, Result};
use crate::js::text;
use crate::prelude::*;
use crate::regex::Regex;

/// protocol.json, built in (a synced copy of spec/protocol.json).
pub const PROTOCOL_JSON: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/protocol.json"));
/// aliases.json, built in (a synced copy of spec/aliases.json).
pub const ALIASES_JSON: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/aliases.json"));

/// protocol.json and aliases.json, read once, with the lists every module asks for.
#[derive(Debug, Clone)]
pub struct Spec {
    pub protocol: Value,
    pub aliases: Value,
    pub version: String,
    pub types: Vec<String>,
    pub verbs: Vec<String>,
    pub ref_keys: Vec<String>,
    pub answers: Vec<String>,
    pub stops: Vec<String>,
    pub grant_kinds: Vec<String>,
    pub genesis: Vec<String>,
    pub genesis_optional: Vec<String>,
    pub terms: Vec<String>,
    pub line: Vec<String>,
    pub scope: Vec<String>,
    pub schema: Vec<String>,
    pub grounds: Vec<String>,
    pub field_types: Vec<String>,
    pub time_fields: Vec<String>,
    pub date_fields: Vec<String>,
    pub every: Vec<String>,
    pub int_min: f64,
    pub int_max: f64,
    pub block_bytes: usize,
    pub after_heads: usize,
    /// The most decimal places an issuer's own currency unit may name (limits.decimals_max).
    pub decimals_max: usize,
    /// The algorithms protocol.json `algs` knows: signing (key, signature) and encryption (key, envelope).
    pub sign_algs: Vec<String>,
    pub encrypt_algs: Vec<String>,
    pub sign_default: String,
    pub encrypt_default: String,
    /// How far a signed message's `at` may be from a node's clock, either way (limits.signed_window, a duration).
    pub signed_window: String,
    pub outside: String,
    grammar: Vec<(String, Regex)>,
}

fn strings(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items.iter().map(|v| text(Some(v))).collect(),
        Some(Value::Object(map)) => map.keys().cloned().collect(),
        _ => Vec::new(),
    }
}

impl Spec {
    /// Read protocol.json and aliases.json from bytes.
    pub fn from_json(protocol: &[u8], aliases: &[u8]) -> Result<Spec> {
        let protocol: Value = serde_json::from_slice(protocol)?;
        let aliases: Value = serde_json::from_slice(aliases)?;
        Spec::from_values(protocol, aliases)
    }

    pub fn from_values(protocol: Value, aliases: Value) -> Result<Spec> {
        let p = &protocol;
        let order = strings(crate::js::get(p, "aliases.order"));
        if order.join(",") != "types,shapes,refs,outside" {
            return Err(Error::new(format!(
                "aliases: this reader follows the order types, shapes, refs, outside; protocol.json says {}",
                order.join(", ")
            )));
        }
        let read = strings(crate::js::get(p, "envelope.read"));
        if read.first().map(String::as_str)
            != crate::js::get(p, "envelope.write").and_then(Value::as_str)
        {
            return Err(Error::new(
                "envelope: protocol.json writes the first alg it reads",
            ));
        }
        let mut grammar = Vec::new();
        if let Some(Value::Object(map)) = p.get("grammar") {
            for (name, pattern) in map {
                grammar.push((name.clone(), Regex::new(pattern.as_str().unwrap_or(""))?));
            }
        }
        let list = |path: &str| strings(crate::js::get(p, path));
        let mut ref_keys = list("refs.who_and_where");
        ref_keys.extend(list("refs.what_and_which"));
        ref_keys.extend(list("refs.verbs"));
        let number = |path: &str| crate::js::get(p, path).and_then(Value::as_f64);
        Ok(Spec {
            version: crate::js::str_of(p.get("version")).to_string(),
            types: list("types"),
            verbs: list("verbs"),
            ref_keys,
            answers: list("answers"),
            stops: list("stop"),
            grant_kinds: list("grant_kinds"),
            genesis: list("genesis"),
            genesis_optional: list("genesis_optional"),
            terms: list("terms"),
            line: list("line"),
            scope: list("scope"),
            schema: list("schema"),
            grounds: list("grounds"),
            field_types: list("field_types"),
            time_fields: list("time_fields"),
            date_fields: list("date_fields"),
            every: list("fields.every"),
            int_min: number("integers.min").unwrap_or(-9007199254740991.0),
            int_max: number("integers.max").unwrap_or(9007199254740991.0),
            block_bytes: number("limits.block_bytes").unwrap_or(65536.0) as usize,
            after_heads: number("limits.after_heads").unwrap_or(16.0) as usize,
            sign_algs: list("algs.sign.known"),
            encrypt_algs: list("algs.encrypt.known"),
            sign_default: crate::js::str_of(crate::js::get(p, "algs.sign.default")).to_string(),
            encrypt_default: crate::js::str_of(crate::js::get(p, "algs.encrypt.default")).to_string(),
            decimals_max: number("limits.decimals_max").unwrap_or(18.0) as usize,
            signed_window: crate::js::str_of(crate::js::get(p, "limits.signed_window")).to_string(),
            outside: crate::js::str_of(aliases.get("outside")).to_string(),
            grammar,
            protocol,
            aliases,
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
    /// The grammar rule a key of this signing algorithm must match (`algs.sign.known.<alg>.key`), if the alg is known.
    pub fn sign_key_rule(&self, alg: &str) -> Option<&str> {
        self.protocol.get("algs")?.get("sign")?.get("known")?.get(alg)?.get("key")?.as_str()
    }
    /// The grammar rule a key of this encryption algorithm must match (`algs.encrypt.known.<alg>.key`).
    pub fn encrypt_key_rule(&self, alg: &str) -> Option<&str> {
        self.protocol.get("algs")?.get("encrypt")?.get("known")?.get(alg)?.get("key")?.as_str()
    }
    pub fn has_type(&self, name: &str) -> bool {
        self.types.iter().any(|t| t == name)
    }
}

static DEFAULT: once_cell::race::OnceBox<Spec> = once_cell::race::OnceBox::new();

/// The built-in protocol.json and aliases.json, read once.
pub fn spec() -> &'static Spec {
    DEFAULT.get_or_init(|| {
        Box::new(
            Spec::from_json(PROTOCOL_JSON, ALIASES_JSON)
                .expect("the built-in protocol.json and aliases.json read"),
        )
    })
}
