//! The JSON door: one call, one data shape, shared by every language binding (JNI, the C ABI's `fb_call`, and through
//! the C ABI Python, Swift and Go).
//! ```text
//! answer(op: UTF-8 name, args: JSON array) -> { "ok": value }
//!                                              | { "error": kind, "message", "code", "reasons", "refusals" }
//! ```
//!
//! kind is `argument`, `json`, `refused`, `crypto`, `profile` or `internal`. Every op is a thin call into this crate:
//! there is no second implementation here, only the names. An op this build's profile leaves out says `profile`.
#![allow(clippy::needless_pass_by_value)]
use crate::chain::Link;
use crate::error::Error;
use crate::js::index_of;

// A door argument as text (one of another type is empty).
fn arg_text(v: Option<&Value>) -> String {
    crate::js::str_of(v).to_string()
}
use crate::prelude::*;

enum Fail {
    Argument(String),
    Profile(String),
    Lib(Error),
}
impl From<Error> for Fail {
    fn from(e: Error) -> Self {
        Fail::Lib(e)
    }
}
type Out = core::result::Result<Value, Fail>;

/// The arguments of one call, read by position.
///  A collection given as anything but a list or null (a string, a number, an object) is not an empty one: the call is an argument error.
struct Args(Vec<Value>, core::cell::Cell<Option<usize>>);
impl Args {
    fn v(&self, i: usize) -> &Value {
        static NULL: Value = Value::Null;
        self.0.get(i).unwrap_or(&NULL)
    }
    fn s(&self, i: usize) -> core::result::Result<&str, Fail> {
        self.v(i)
            .as_str()
            .ok_or_else(|| Fail::Argument(format!("argument {i} is text")))
    }
    fn opt(&self, i: usize) -> Option<&str> {
        self.v(i).as_str()
    }
    /// A suite named by the caller, resolved once here (`suite_arg`): every function below takes the resolved name.
    fn suite(&self, i: usize) -> core::result::Result<&str, Fail> {
        suite_arg(self.v(i))
    }
    /// A clock: a time (core.md §3, grammar.time). Anything else is refused, never read as a time.
    fn time(&self, i: usize) -> core::result::Result<&str, Fail> {
        clock(self.v(i)).and_then(|t| t.ok_or_else(|| Fail::Argument(format!("argument {i} is a time"))))
    }
    /// A clock that may be left out (null): a time when given.
    fn time_opt(&self, i: usize) -> core::result::Result<Option<&str>, Fail> {
        clock(self.v(i))
    }
    /// A block given whole (an object, `{ type, state, refs }` with nothing filled in) or as its three parts by position; with the
    /// index of the argument after it. `strict_type`: a type that is not text is an argument error (else it reads as empty and the
    /// check refuses it for its type, core.md check 2).
    fn block(&self, strict_type: bool) -> core::result::Result<(&str, &Value, &Value, usize), Fail> {
        let whole = self.v(0);
        if !whole.is_object() {
            let t = if strict_type { self.s(0)? } else { self.opt(0).unwrap_or("") };
            return Ok((t, self.v(1), self.v(2), 3));
        }
        match (whole.get("type"), whole.get("state"), whole.get("refs")) {
            (Some(Value::String(t)), Some(s @ Value::Object(_)), Some(r @ Value::Object(_))) => Ok((t, s, r, 1)),
            _ => Err(Fail::Argument("a block is an object with text type and object state and refs".into())),
        }
    }
    fn list(&self, i: usize) -> Vec<Value> {
        match self.v(i) {
            Value::Array(a) => a.clone(),
            Value::Null => Vec::new(),
            _ => {
                self.1.set(Some(i));
                Vec::new()
            }
        }
    }
    fn strings(&self, i: usize) -> Vec<String> {
        strings_of(self.v(i))
    }
}
// A clock value: null or absent is none; a time (a real calendar instant, core.md section 3) is itself; anything else is
// refused: a nonsense clock (February 30, hour 24) is never read as text.
fn clock(v: &Value) -> core::result::Result<Option<&str>, Fail> {
    match v {
        Value::Null => Ok(None),
        Value::String(t) if crate::time::is_time(Some(v)) => Ok(Some(t.as_str())),
        _ => Err(Fail::Argument("a clock is a time (core.md, section 3)".into())),
    }
}
// A suite named by a caller, resolved once at the door: absent or null is the default suite (protocol.json `suites.default`); a
// name not in protocol.json `suites` (the empty name too, or anything not text) is refused, never read as the default (one suite
// has one spelling).
fn suite_arg(v: &Value) -> core::result::Result<&str, Fail> {
    match v {
        Value::Null => Ok(crate::spec::default_suite()),
        Value::String(n) if !n.is_empty() && crate::spec().suites.iter().any(|s| s.name == *n) => Ok(n.as_str()),
        _ => Err(Fail::Lib(crate::Error::coded("unknown_suite", format!("unknown suite {}", v.as_str().map(String::from).unwrap_or_else(|| v.to_string()))))),
    }
}
fn strings_of(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
        .unwrap_or_default()
}
fn hex_chunks(v: &Value) -> core::result::Result<Vec<Vec<u8>>, Fail> {
    v.as_array()
        .ok_or_else(|| Fail::Argument("chunks is a list of hex".into()))?
        .iter()
        .map(|c| c.as_str().and_then(crate::block::unhex).ok_or_else(|| Fail::Argument("a chunk is hex".into())))
        .collect()
}
fn keypair_of(v: &Value) -> crate::Keypair {
    crate::Keypair {
        suite: arg_text(v.get("suite")),
        public_key_sign: arg_text(v.get("public_key_sign")),
        private_key: arg_text(v.get("private_key")),
    }
}
fn chain_json(c: &crate::Chain) -> Value {
    json!({ "head": c.head.as_ref().map(|h| crate::js::hash_of(h)), "length": c.length, "gaps": c.gaps, "skips": c.skips, "equivocations": c.equivocations,
            "broken": c.broken, "ok": c.ok })
}

fn key_json(k: &crate::identity::KeyEntry) -> Value {
    json!({ "key": k.key, "by": k.by, "signer": k.signer, "void": k.void, "frozen": k.frozen, "suite": k.suite })
}
// Fixed randomness reproduces a vector and nothing else: a key, a content key or a nonce chosen by a caller is a reused nonce waiting to happen.
// The caller says so (`vectorsOnly: true`); without it the call is an argument error (release 41).
fn fixed_of(v: &Value) -> core::result::Result<Option<crate::envelope::Fixed>, Fail> {
    if !v.is_object() {
        return Ok(None);
    }
    if v.get("vectorsOnly") != Some(&Value::Bool(true)) {
        return Err(Fail::Argument("fixed randomness only reproduces a vector: say so with vectorsOnly: true".into()));
    }
    let f = |k: &str| v.get(k).and_then(Value::as_str).map(String::from);
    Ok(Some(crate::envelope::Fixed {
        ephemeral: f("ephemeral"),
        content_key: f("contentKey"),
        nonce: f("nonce"),
        key_nonces: strings_of(v.get("keyNonces").unwrap_or(&Value::Null)),
    }))
}

/// The arrival log as data: `{ hash: at }`, or null when the reader keeps none. An arrival is a time, like a clock (folds.md: a
/// view refuses anything else, never reading it as a time).
fn arrivals(v: &Value) -> core::result::Result<Value, Fail> {
    match v {
        Value::Object(m) if m.values().all(|t| t.is_null() || crate::time::is_time(Some(t))) => Ok(v.clone()),
        Value::Object(_) => Err(Fail::Argument("an arrival is a time (core.md, section 3)".into())),
        _ => Ok(Value::Null),
    }
}
macro_rules! arrived {
    ($map:expr, $lookup:ident, $arrived:ident) => {
        let map: Value = arrivals($map)?;
        let $lookup = |h: &str| map.get(h).and_then(Value::as_str).map(String::from);
        let reading = crate::identity::Arrivals::new(&$lookup);
        let $arrived: crate::identity::ArrivedAt = if map.is_object() { Some(&reading) } else { None };
    };
}
// A reading of the recovery reach: with arrivals, the reader says what a block whose arrival it does not know is read as (identity.md,
// Recovery reach): `inside` or `outside` the reach, no default.
macro_rules! arrived_reach {
    ($map:expr, $choice:expr, $lookup:ident, $arrived:ident) => {
        let map: Value = arrivals($map)?;
        let outside = if map.is_object() { unknown_arrival($choice)? } else { false };
        let $lookup = |h: &str| map.get(h).and_then(Value::as_str).map(String::from);
        let reading = crate::identity::Arrivals::reach(&$lookup, outside);
        let $arrived: crate::identity::ArrivedAt = if map.is_object() { Some(&reading) } else { None };
    };
}
fn unknown_arrival(v: &Value) -> core::result::Result<bool, Fail> {
    match v.as_str() {
        Some("outside") => Ok(true),
        Some("inside") => Ok(false),
        _ => Err(Fail::Argument("unknown_arrival is `inside` or `outside` the reach when arrivals are given: the reader chooses (identity.md, Recovery reach)".into())),
    }
}

/// The challenge for a block (`{ type, state, refs }`: its canonical bytes) or a signed message part (its canonical
/// JSON without `signature`).
fn passkey_challenge(v: &Value) -> String {
    let is_block = v.get("type").is_some_and(Value::is_string) && v.get("state").is_some_and(Value::is_object) && v.get("refs").is_some_and(Value::is_object);
    let bytes = if is_block {
        let (t, s, r) = crate::block::parts(v);
        crate::canonical(t, s, r)
    } else {
        let mut rest = v.clone();
        if let Value::Object(map) = &mut rest {
            map.shift_remove("signature");
        }
        crate::canonical_json(&rest)
    };
    crate::sign::passkey_challenge_of(bytes.as_bytes())
}
fn passkey_signature(auth: &str, cdj: &str, sig: &str) -> core::result::Result<String, Fail> {
    #[cfg(feature = "suites")]
    {
        Ok(crate::sign::passkey_signature(auth, cdj, sig)?)
    }
    #[cfg(not(feature = "suites"))]
    {
        let _ = (auth, cdj, sig);
        Err(Fail::Profile("passkey_signature needs the suites feature".into()))
    }
}

fn flag_arg(v: &Value) -> bool {
    v.as_bool().unwrap_or(false) || v.get("short").and_then(Value::as_bool).unwrap_or(false)
}
fn cbor_bytes(hex: &str) -> core::result::Result<Vec<u8>, Fail> {
    crate::block::unhex(hex).ok_or_else(|| Fail::Argument("CBOR bytes are lowercase hex".into()))
}

fn dispatch(op: &str, a: &Args) -> Out {
    Ok(match op {
        "version" => json!(crate::VERSION),
        "peers" => json!(crate::peers()),
        // A block: its canonical form and its id.
        "canonical" => {
            let (t, s, r, _) = a.block(true)?;
            json!(crate::canonical(t, s, r))
        }
        "canonical_json" => json!(crate::canonical_json(a.v(0))),
        // The compact form (encoding.md): a signed public block as CBOR hex, and back. `short` uses the key table.
        // The id of a decoded block is the hash of its canonical JSON, never of the bytes.
        "cbor_encode" => json!(crate::block::hex(&crate::cbor::encode_message(a.v(0), flag_arg(a.v(1)))?)),
        // cbor_decode(bytes, held?): with held, the id is computed in the suite of the key that signed it (core.md, section 2)
        "cbor_decode" => {
            let block = crate::cbor::decode_message(&cbor_bytes(a.s(0)?)?)?;
            if a.v(1).is_array() { crate::identity::with_id_in(&block, &crate::js::held_index(a.list(1).iter())) } else { block }
        }
        "cbor_encode_push" => json!(crate::block::hex(&crate::cbor::encode_push_with(crate::spec(), &a.list(0), flag_arg(a.v(1)))?)),
        "cbor_decode_push" => Value::Array(crate::cbor::decode_push_with(crate::spec(), &cbor_bytes(a.s(0)?)?)?),
        "cbor_encode_header" => json!(crate::block::hex(&crate::cbor::encode_header_with(crate::spec(), a.v(0), flag_arg(a.v(1)))?)),
        "cbor_decode_header" => crate::cbor::decode_header_with(crate::spec(), &cbor_bytes(a.s(0)?)?)?,
        // The id of a block, in the hash of a suite (default std).
        "hash" => {
            let (t, s, r, n) = a.block(true)?;
            json!(crate::hash_suite(a.suite(n)?, t, s, r))
        }
        // id_of(block, held?): a block's id, in the suite of the key that signed it, read among held (core.md, section 2); with none,
        // in the suite the block itself shows (a genesis's own, else as its prev is hashed)
        "id_of" => json!(match a.v(1) {
            Value::Array(held) => crate::identity::id_in(a.v(0), &crate::js::held_index(held.iter())),
            _ => crate::block::rehash(a.v(0)),
        }),
        "hash_hex" => json!(crate::hash_hex(a.s(0)?)),
        "hash_in" => json!(crate::hash_in(a.suite(1)?, a.s(0)?)),
        "create" => {
            let name = a.opt(0).filter(|t| !t.is_empty());
            crate::create_in(
                a.suite(3)?,
                name.ok_or_else(|| Error::new("FoodBlock: type is required and must be a string"))?,
                a.v(1),
                a.v(2),
            )?
        }
        // Signing: keypair(seed?, suite?), sign(block, private_key, suite?), verify(block, signature, public_key).
        "keypair" => match a.opt(0) {
            Some(seed) => crate::keypair_from_seed_in(a.suite(1)?, seed)?.to_json(),
            None => crate::sign::generate_keypair_in(a.suite(1)?)?.to_json(),
        },
        "public_key_of" => json!(crate::sign::public_key_in(a.suite(1)?, a.s(0)?)?),
        "sign" => json!(crate::sign_in(a.suite(2)?, a.v(0), a.s(1)?)?),
        "verify" => json!(crate::verify_in(&crate::sign::suite_named_by(a.s(2)?), a.v(0), a.s(1)?, a.s(2)?)),
        "sign_message" => crate::sign::sign_message_in(a.suite(2)?, a.v(0), a.s(1)?)?,
        "verify_message" => json!(crate::sign::verify_message_in(&crate::sign::suite_named_by(a.s(1)?), a.v(0), a.s(1)?)),
        // A passkey (modules/encoding.md, Passkeys): the challenge to ask it to sign for a block (or a message part), and its
        // answer written as a FoodBlock signature, which `verify` and `valid` then open like any other.
        "passkey_challenge" => json!(passkey_challenge(a.v(0))),
        "passkey_signature" => json!(passkey_signature(a.s(0)?, a.s(1)?, a.s(2)?)?),
        "suite_of_key" => json!(crate::sign::suite_of_key(a.s(0)?)),
        "knows_suite" => json!(crate::sign::knows_suite(a.s(0)?)),
        // The commitment.
        "salted_hash" => json!(crate::salted_hash_in(a.suite(2)?, a.s(0)?, a.s(1)?)),
        "commit" => {
            let who = a.strings(0);
            let refs: Vec<&str> = who.iter().map(String::as_str).collect();
            let made = crate::commit_in(a.suite(2)?, &refs, a.v(1))?;
            json!({ "audience": made.audience, "salts": made.salts_json() })
        }
        "finds_self" => json!(crate::finds_self(a.v(0), a.s(1)?, a.s(2)?)),
        "reveal_for" => {
            let salts: Vec<(String, String)> = a
                .v(0)
                .as_object()
                .map(|m| m.iter().map(|(k, v)| (k.clone(), arg_text(Some(v)))).collect())
                .unwrap_or_default();
            crate::reveal_for(&crate::audience::Audience { audience: vec![], salts }, a.s(1)?)
        }
        "compose" => crate::compose(a.s(0)?, a.v(1), a.v(2), &compose_options(a.v(3))?)?,
        "new_salt" => json!(crate::audience::try_new_salt()?),
        // The write check and the words it asks for.
        "check" | "refusals" => {
            let (t, s, r, n) = a.block(op == "check")?;
            let (held, schemas) = (index_of(a.list(n).iter()), index_of(a.list(n + 1).iter()));
            let options = crate::CheckOptions { held: Some(&held), schemas: if a.v(n + 1).is_array() { Some(&schemas) } else { None } };
            // a type that is not text is refused for its type like any name outside the grammar (core.md, check 2), never an argument error
            if op == "check" { json!(crate::check(t, s, r, options)) } else { Value::Array(crate::refusals(t, s, r, options).iter().map(|x| x.to_json()).collect()) }
        }
        "amount" => crate::amount(a.s(0)?, a.s(1)?),
        // currency: an ISO 4217 code, or an issuer's own unit { issuer, unit, decimals }
        "money" => {
            let minor = a.v(0).as_i64().ok_or_else(|| Fail::Argument("minor is a whole number".into()))?;
            match a.v(1) {
                Value::String(code) => crate::money(minor, code),
                unit @ Value::Object(_) => json!({ "minor": minor, "currency": unit }),
                _ => return Err(Fail::Argument("argument 1 is a currency code or an issuer unit".into())),
            }
        }
        "terms" => crate::terms(a.v(0)),
        // The one predicate (core.md, section 8): valid(block, context) -> refusals (empty when valid).
        "valid" => {
            let held = index_of(a.list(1).iter());
            let schemas = index_of(a.list(2).iter());
            Value::Array(
                crate::valid::valid(a.v(0), &held, if a.v(2).is_array() { Some(&schemas) } else { None })
                    .iter()
                    .map(|r| r.to_json())
                    .collect(),
            )
        }
        // Strict writing from the bytes: JSON text with no repeated key, then the strict findings.
        "strict_text" => match crate::canonical::parse_strict(a.s(0)?) {
            Err(e) => json!([{ "code": "not_canonical", "detail": e }]),
            Ok(block) => strict_block(&block),
        },
        // A push read from its bytes (transport.md, security K): JSON text with no repeated key anywhere, else an argument error; then,
        // for each message in order, what its block's own text says (as `strict_text`; a sealed message, which carries no block, has
        // none). The push is scanned, never parsed into values, so one block's number, string or depth never makes the others unread.
        "strict_push" => {
            let text = a.s(0)?;
            let spans = crate::canonical::push_block_spans(text).map_err(|e| Fail::Argument(format!("a push is JSON text with no repeated key: {e}")))?;
            Value::Array(
                spans
                    .into_iter()
                    .map(|span| match span {
                        Some((from, to)) => match crate::canonical::parse_strict(&text[from..to]) {
                            Err(e) => json!([{ "code": "not_canonical", "detail": e }]),
                            Ok(block) => strict_block(&block),
                        },
                        None => json!([]),
                    })
                    .collect(),
            )
        }
        // What a block rests on (protocol.json `needs`): all of it, or with the blocks held, what is not held yet.
        "needs" => {
            if a.v(1).is_array() {
                json!(crate::js::unmet_in(a.v(0), &crate::js::held_index(a.list(1).iter())))
            } else {
                json!(crate::js::needs_of(a.v(0)))
            }
        }
        "receipt_code" => json!(if flag_arg(a.v(1)) { crate::strangers::receipt_code_long(a.s(0)?) } else { crate::strangers::receipt_code(a.s(0)?) }),
        "code_matches" => json!(crate::strangers::code_matches(a.s(0)?, a.s(1)?)),
        "consent" => crate::strangers::consent(a.s(0)?, a.opt(1), &a.list(2), Some(a.v(3)).filter(|b| b.is_object())),
        // the node's own stated choices: its rule's state (an object) or an explicit null (no rule), and today's count (an integer)
        "admission_refusals" => Value::Array(
            crate::strangers::admission_refusals(a.v(0), a.s(1)?, &a.list(2), stated_admission(a)?, a.v(4).as_u64().ok_or_else(|| Fail::Argument("strangers_today is a whole number: the node states how many blocks it took today from this sender".into()))?)
                .iter()
                .map(|r| r.to_json())
                .collect(),
        ),
        "live_grant" => json!(crate::views::live_grant(&a.list(1), a.time(2)?)),
        "due" => {
            arrived!(a.v(1), lookup, at);
            json!(crate::views::due(a.v(0), at))
        }
        "recovery_reach" => {
            arrived_reach!(a.v(2), a.v(3), lookup, at);
            json!(crate::views::recovery_reach(a.v(0), &a.list(1), at))
        }
        // Chains and causal order.
        "next_link" => {
            let last = a.v(0);
            crate::next_link(if last.is_null() { None } else { Some(last) }, a.opt(1))?.to_json()
        }
        "check_chain" => chain_json(&crate::check_chain(&a.list(0), a.s(1)?)),
        "causes_of" => json!(crate::order::causes_of(a.v(0))),
        "past_of" => json!(crate::past_of(a.v(0), &a.list(1))),
        "heads_among" => Value::Array(crate::order::heads_among(&a.list(0))),
        "is_time" => json!(crate::time::is_time(Some(a.v(0)))),
        "is_date" => json!(crate::time::is_date(Some(a.v(0)))),
        "parse_duration" => match a.opt(0).and_then(crate::time::parse_duration) {
            Some(d) => json!({ "years": d.years, "months": d.months, "days": d.days, "ms": d.ms }),
            None => Value::Null,
        },
        "identity_of" => {
            arrived_reach!(a.v(2), a.v(3), lookup, at);
            let i = crate::identity::identity_of(a.s(0)?, &a.list(1), at);
            json!({
                "keys": i.keys.iter().map(key_json).collect::<Vec<_>>(),
                "rotations": i.rotations.iter().map(|(k, r)| json!([k, { "by": r.by, "all": r.all, "countedTo": r.counted_to,
                    "recovery": r.recovery, "floor": r.floor }])).collect::<Vec<_>>(),
                "recovery": i.recovery,
                "ended": i.ended,
            })
        }
        "signer_of" => {
            let keys: Vec<crate::identity::KeyEntry> = a
                .list(1)
                .iter()
                .map(|k| {
                    Ok(crate::identity::KeyEntry {
                        key: arg_text(k.get("key")),
                        by: arg_text(k.get("by")),
                        signer: None,
                        void: false,
                        frozen: false,
                        suite: suite_arg(k.get("suite").unwrap_or(&Value::Null))?.to_string(),
                    })
                })
                .collect::<core::result::Result<_, Fail>>()?;
            json!(crate::identity::signer_of(a.v(0), &keys))
        }
        "chains_of" => Value::Array(
            crate::identity::chains_of(a.s(0)?, &a.list(1))
                .iter()
                .map(|k| {
                    let mut c = chain_json(&k.chain);
                    c["key"] = json!(k.key);
                    c["by"] = json!(k.by);
                    c
                })
                .collect(),
        ),
        "causal_order" => json!(crate::causal_order(&a.list(0))),
        "sees" => json!(crate::sees(a.v(0), a.v(1), &a.list(2))),
        // The one way to write, and the wire.
        "write" => write(a)?,
        "wrap" => crate::wrap(a.v(0)),
        // unwrap(message, held?): with held, the id is computed in the suite of the key that signed it (core.md, section 2)
        "unwrap" => {
            let block = crate::unwrap(a.v(0))?;
            if a.v(1).is_array() { crate::identity::with_id_in(&block, &crate::js::held_index(a.list(1).iter())) } else { block }
        }
        "header" => crate::header(a.v(0)),
        "header_signed_by" => json!(crate::header_signed_by(a.v(0), a.s(1)?)),
        // Who someone is, and authority.
        "genesis" => genesis(a)?,
        "live_keys" => json!(crate::identity::live_keys(a.s(0)?, &a.list(1))),
        "keys_of" => {
            arrived_reach!(a.v(2), a.v(3), lookup, at);
            json!(crate::identity::keys_of(a.s(0)?, &a.list(1), at))
        }
        "key_timeline" => {
            arrived_reach!(a.v(2), a.v(3), lookup, at);
            let keys = crate::identity::key_timeline(a.s(0)?, &a.list(1), at);
            // a void key is never listed, so the timeline carries no `void`
            Value::Array(keys.iter().filter(|k| !k.void).map(|k| json!({ "key": k.key, "by": k.by, "signer": k.signer, "frozen": k.frozen, "suite": k.suite })).collect())
        }
        "signed_by_author" => {
            arrived_reach!(a.v(2), a.v(3), lookup, at);
            json!(crate::identity::signed_by_author(a.v(0), &a.list(1), at))
        }
        "spec" => json!({ "protocol": crate::spec().protocol }),
        "spec_list" => json!(crate::spec().list(a.s(0)?)),
        "add_duration" => {
            // the sign is 1 when it is not given, and otherwise a whole number: a wrong one is an error, never read as 1
            let sign = if a.v(2).is_null() { 1 } else { a.v(2).as_i64().ok_or_else(|| Fail::Argument("the sign is a whole number".into()))? };
            json!(crate::time::add_duration(a.s(0)?, a.s(1)?, sign))
        }
        "compare_durations" => json!(crate::time::compare_durations(a.s(0)?, a.s(1)?, a.s(2)?)),
        "types" => json!(crate::spec().types),
        "base_fields" => json!(crate::spec().fields(a.s(0)?)),
        "grammar" => json!(a.v(1).as_str().is_some_and(|t| crate::spec().is(a.opt(0).unwrap_or(""), t))),
        // merkle_root(chunks: [hex]), merkle_proof(chunks, index), merkle_verify(block, chunk, index, proof)
        "merkle_root" => {
            let chunks = hex_chunks(a.v(0))?;
            match crate::merkle::root(&chunks) {
                Some(r) => json!(r),
                None => return Err(Fail::Argument("merkle_root needs at least one chunk".into())),
            }
        }
        "merkle_proof" => {
            let chunks = hex_chunks(a.v(0))?;
            match a.v(1).as_u64().and_then(|i| usize::try_from(i).ok()).and_then(|i| crate::merkle::proof(&chunks, i)) {
                Some(p) => json!(p),
                None => return Err(Fail::Argument("merkle_proof needs an index of a chunk".into())),
            }
        }
        "merkle_verify" => {
            let chunk = crate::block::unhex(a.s(1)?).ok_or_else(|| Fail::Argument("chunk is hex".into()))?;
            json!(a.v(2).as_u64().is_some_and(|i| crate::merkle::verify_block(a.v(0), &chunk, i, &a.strings(3))))
        }
        "recovery_key_hash" => json!(crate::identity::recovery_key_hash_in(a.suite(1)?, a.s(0)?)),
        "is_genesis" => json!(crate::identity::is_genesis(a.v(0))),
        "genesis_opens" => json!(crate::identity::genesis_opens(if a.v(0).is_null() { None } else { Some(a.v(0)) })),
        // key_grant(id, new_key, signer { private_key, last, brought_in, recovery_key },
        //           { replaces, counted_to, at, after, encrypt, custodian }): the recovery pair is named only in a genesis
        "key_grant" => {
            let (signer, o) = (a.v(2), a.v(3));
            let field = |v: &Value, k: &str| v.get(k).and_then(Value::as_str).map(String::from);
            let last = signer.get("last").filter(|l| l.is_object());
            let brought_in = field(signer, "brought_in").unwrap_or_else(|| a.opt(0).unwrap_or("").to_string());
            let place = crate::next_link(last, Some(&brought_in))?;
            let after = strings_of(o.get("after").unwrap_or(&Value::Null));
            let after: Vec<&str> = after.iter().map(String::as_str).collect();
            let (replaces, counted_to, encrypt) = (field(o, "replaces"), field(o, "counted_to"), field(o, "encrypt"));
            let custodian = field(o, "custodian");
            let (suite, signer_suite) = (field(o, "suite"), field(signer, "suite"));
            let extras = crate::identity::KeyGrantExtras {
                replaces: replaces.as_deref(),
                counted_to: counted_to.as_deref(),
                after: &after,
                encrypt: encrypt.as_deref(),
                custodian: custodian.as_deref(),
                suite: suite.as_deref(),
                signer_suite: signer_suite.as_deref(),
                skip: o.get("skip").and_then(Value::as_bool).unwrap_or(false),
            };
            let at = field(o, "at").ok_or_else(|| Fail::Argument("a key grant states `at` (a time): nothing reads a clock for the author".into()))?;
            crate::identity::key_grant_with(
                a.s(0)?,
                a.opt(1),
                &arg_text(signer.get("private_key")),
                &place,
                &at,
                field(signer, "recovery_key").as_deref(),
                &extras,
            )?
        }
        "identity_state" => {
            arrived_reach!(a.v(2), a.v(3), lookup, at);
            crate::identity::identity_state(a.s(0)?, &a.list(1), at).to_json()
        }
        "counts" => json!(crate::identity::counts_in(a.v(0), &crate::js::held_index(a.list(1).iter()))),
        "forked" => json!(crate::identity::forked(a.v(0), &a.list(1))),
        "fork_pairs" => json!(crate::identity::fork_pairs_in(&crate::js::held_index(a.list(0).iter()))),
        "next_link_for" => crate::identity::next_link_for(a.s(0)?, a.s(1)?, &a.list(2))?.to_json(),
        "is_live" => json!(crate::grant::is_live(a.v(0), &a.list(1), a.time_opt(2)?)),
        "ancestors" => json!(crate::grant::ancestors(a.v(0), &a.list(1))),
        "terms_total" => {
            let quantity = Some(a.v(1)).filter(|v| !v.is_null());
            if pure_junk::terms(a.v(0), quantity) { Value::Null } else { crate::fold::terms_total(a.v(0), quantity) }
        }
        "within_limit" => {
            let zero = json!(0);
            json!(crate::grant::within_limit(a.v(0), a.v(1), if a.v(2).is_null() { &zero } else { a.v(2) }))
        }
        "limit_within_parent" => {
            let at = a.time(2)?;
            json!(!pure_junk::fence(a.v(0)) && !pure_junk::fence(a.v(1)) && crate::grant::limit_within_parent(a.v(0), a.v(1), at))
        }
        "limit_fence" => crate::grant::limit_fence(a.s(0)?, a.s(1)?, a.v(2), a.opt(3), a.opt(4), Some(a.v(5)).filter(|v| !v.is_null())),
        "limit_commitment" => json!(crate::grant::limit_commitment_in(suite_arg(a.v(3))?, a.v(0), a.opt(1), a.s(2)?, Some(a.v(4)).filter(|v| !v.is_null()))),
        "limit_opens" => json!(crate::grant::limit_opens_in(suite_arg(a.v(2))?, a.v(0), a.v(1))),
        "recipients_of" => json!(crate::sync::recipients_of(a.v(0), a.s(1)?)),
        // The one-time converter for pre-1.6 data: convert(oldBlocks, { keys, at, map, existing, channel, request_hash, schemas, custodian_key, custodian_for }).
        #[cfg(feature = "legacy")]
        "convert" => {
            let o = a.v(1);
            let options = crate::legacy::ConvertOptions {
                keys: o.get("keys").and_then(Value::as_object).cloned().unwrap_or_default(),
                at: arg_text(o.get("at")),
                map: o.get("map").and_then(Value::as_object).cloned().unwrap_or_default(),
                existing: o.get("existing").and_then(Value::as_array).cloned().unwrap_or_default(),
                channel: arg_text(o.get("channel")),
                request_hash: arg_text(o.get("request_hash")),
                aliases: o.get("aliases").filter(|v| v.is_object()).cloned(),
                schemas: o.get("schemas").and_then(Value::as_array).cloned().unwrap_or_default(),
                custodian_key: o.get("custodian_key").filter(|v| v.is_object()).cloned(),
                custodian_for: o.get("custodian_for").and_then(Value::as_array).map(|l| l.iter().filter_map(Value::as_str).map(String::from).collect()).unwrap_or_default(),
            };
            let done = crate::legacy::convert(&a.list(0), &options)?;
            json!({
                "blocks": done.blocks, "map": done.map,
                "skipped": done.skipped.iter().map(|(h, why)| json!({ "hash": h, "why": why })).collect::<Vec<_>>(),
                "deliveries": done.deliveries,
            })
        }
        #[cfg(feature = "legacy")]
        "old_hash" => json!(crate::legacy::old_hash(a.v(0))),
        "children_of" => json!(crate::tasks::children_of(a.s(0)?, &a.list(1))),
        "why_not_live_undo" => json!(crate::grant::why_not_live_undo(a.v(0), &crate::js::held_index(a.list(1).iter()))),
        "act_name" => json!(crate::grant::act_name(a.v(0))),
        "reading_is_persons_claim" => json!(crate::strangers::reading_is_persons_claim(a.v(0), a.s(1)?, &a.list(2))),
        "residency_refusals" => Value::Array(
            crate::profiles::residency_refusals(a.v(0), &a.strings(1)).iter().map(|r| r.to_json()).collect(),
        ),
        #[cfg(feature = "earnest")]
        "earnest_shape_ok" => json!(crate::profiles::earnest_shape_ok(a.v(0))),
        #[cfg(feature = "earnest")]
        "earnest_paid" => json!(crate::profiles::earnest_paid(a.v(0), a.v(1), &a.list(2))),
        "scope_within" => json!(crate::grant::scope_within(a.v(0), a.v(1))),
        "scope_refusals" => Value::Array(crate::grant::scope_refusals(a.v(0), a.v(1)).iter().map(|r| r.to_json()).collect()),
        "operators_of" => json!(crate::grant::operators_of(a.s(0)?, &a.list(1), a.time_opt(2)?)),
        "why_not_under" => json!(crate::grant::why_not_under(a.v(0), &a.list(1), a.time_opt(2)?)),
        "under_ok" => json!(crate::grant::why_not_under(a.v(0), &a.list(1), None).is_empty()),
        "why_not_live" => json!(crate::grant::why_not_live(a.v(0), &a.list(1), a.time_opt(2)?)),
        _ => return more(op, a),
    })
}

/// The ops past the micro core, each in the profile that has it.
fn more(op: &str, a: &Args) -> Out {
    #[cfg(feature = "envelope")]
    if let Some(v) = envelope(op, a)? {
        return Ok(v);
    }
    #[cfg(feature = "folds")]
    if let Some(v) = folds(op, a)? {
        return Ok(v);
    }
    #[cfg(feature = "sync")]
    if let Some(v) = sync(op, a)? {
        return Ok(v);
    }
    let _ = a;
    Err(Fail::Profile(format!(
        "foodblock: {op} is not in this build (peers: {})",
        crate::peers().join(", ")
    )))
}

#[cfg(feature = "envelope")]
fn envelope(op: &str, a: &Args) -> core::result::Result<Option<Value>, Fail> {
    let keys = a.strings(1);
    let refs: Vec<&str> = keys.iter().map(String::as_str).collect();
    Ok(Some(match op {
        "seal" => crate::envelope::seal_with(a.v(0), &refs, a.suite(2)?, fixed_of(a.v(3))?.as_ref())?,
        "open" => crate::open(a.v(0), a.s(1)?)?,
        // seal_copy(block, keys, reveals, private_key, fixed?, suite?, sign_suite?): the header is signed in the signing key's suite, the
        // copy's suite unless named
        "seal_copy" => {
            let suite = a.suite(5)?;
            let sign_suite = if a.v(6).is_null() { suite } else { a.suite(6)? };
            crate::seal_copy(a.v(0), &refs, a.v(2), a.s(3)?, fixed_of(a.v(4))?.as_ref(), suite, sign_suite)?
        }
        "open_copy" => crate::open_copy(a.v(0), a.s(1)?)?,
        "encryption_keypair" => crate::envelope::generate_encryption_keypair_in(a.suite(0)?)?,
        "encryption_key_of" => json!(crate::envelope::encryption_key_in(a.suite(1)?, a.s(0)?)?),
        _ => return Ok(None),
    }))
}

#[cfg(feature = "folds")]
fn folds(op: &str, a: &Args) -> core::result::Result<Option<Value>, Fail> {
    use crate::fold;
    Ok(Some(match op {
        "reading_condition_holds" => json!(crate::tasks::reading_condition_holds(a.v(0), &a.list(1), a.time(2)?)),
        "condition_holds" => json!(crate::tasks::condition_holds(a.v(0), &a.list(1), a.time(2)?)),
        "promise_stage" => {
            fold::promise_stage(a.v(0), &a.list(1), &fold::StageOptions::default())
        }
        "promise_views" => {
            let o = a.v(2);
            crate::views::promise_views(&a.strings(0), &a.list(1), clock(o.get("now").unwrap_or(&Value::Null))?)
        }
        "promise_view" => {
            let o = a.v(2);
            arrived_reach!(o.get("arrivals").unwrap_or(&Value::Null), o.get("unknown_arrival").unwrap_or(&Value::Null), lookup, at);
            crate::views::promise_view_at(a.v(0), &a.list(1), clock(o.get("now").unwrap_or(&Value::Null))?, at)
        }
        "withdrawal_seen" => {
            arrived!(a.v(3), lookup, at);
            json!(crate::views::withdrawal_seen(a.v(0), a.v(1), &a.list(2), at))
        }
        "circle_state" => {
            let within = a.v(2);
            fold::circle_state(a.s(0)?, &a.list(1), if within.is_null() { None } else { Some(within) })
                .map(|c| c.to_json())
                .unwrap_or(Value::Null)
        }
        "may_act_as" => json!(fold::may_act_as(a.v(0), a.s(1)?, &a.list(2), a.opt(3))),
        "members_then" => json!(fold::members_then(a.v(0), a.s(1)?, &a.list(2))),
        "where_now" => json!(fold::where_now(a.v(0), &a.list(1))),
        "ownership" => {
            let o = fold::ownership_at(a.v(0), &a.list(1), a.time_opt(2)?.unwrap_or(""));
            json!({ "owner": o.owner, "transfers": o.transfers, "conflict": o.conflict })
        }
        "ownership_view" => {
            arrived_reach!(a.v(2), a.v(3), lookup, at);
            let o = fold::ownership_view(a.v(0), &a.list(1), at, a.time_opt(4)?.unwrap_or(""));
            json!({ "owner": o.owner, "transfers": o.transfers, "conflict": o.conflict })
        }
        "shares_on" => fold::shares_on(a.v(0), &a.list(1)),
        "not_free_shown" => fold::not_free_shown(a.v(0), &a.list(1)),
        "invasion_shown" => fold::invasion_shown(a.v(0), &a.list(1)),
        "release_shown" => fold::release_shown(a.v(0), &a.list(1)),
        "bids_shown" => fold::bids_shown(a.v(0), &a.list(1)),
        "pot" => fold::pot(a.v(0), &a.list(1), a.time_opt(2)?.unwrap_or("")),
        "use_shown" => fold::use_shown(a.v(0), &a.list(1), Some(a.v(2)).filter(|k| !k.is_null())),
        "receiver_of" => json!(fold::receiver_of(a.v(0), &a.list(1))),
        "owner_of" => json!(fold::owner_of(a.v(0), &a.list(1))),
        #[cfg(feature = "successor")]
        "successor_state" | "successor_view" => {
            arrived!(a.v(3), lookup, at);
            fold::successor_state(a.v(0), &a.list(1), a.time_opt(2)?, at)
        }
        #[cfg(feature = "ballots")]
        "counted_in" => json!(fold::counted_in(a.v(0), a.s(1)?, a.s(2)?)),
        #[cfg(feature = "rekeys")]
        "circle_key" => fold::circle_key(a.s(0)?, &a.list(1)),
        _ => return Ok(None),
    }))
}

#[cfg(feature = "sync")]
fn sync(op: &str, a: &Args) -> core::result::Result<Option<Value>, Fail> {
    use crate::sync;
    // What a node knows of a signed request: the node's id, the signer's live keys, the highest counter seen from
    // the signer, and the challenges it issued and has not seen used. No clock.
    fn freshness_of(o: &Value) -> (String, Vec<String>, Option<u64>, Vec<String>) {
        (
            o.get("node").and_then(Value::as_str).unwrap_or("").to_string(),
            strings_of(o.get("keys").unwrap_or(&Value::Null)),
            o.get("highest").and_then(Value::as_u64),
            strings_of(o.get("issued").unwrap_or(&Value::Null)),
        )
    }
    macro_rules! with_fresh {
        ($o:expr, |$f:ident| $body:expr) => {{
            let (node, keys, highest, issued) = freshness_of($o);
            let issued_fn = |c: &str| issued.iter().any(|s| s == c);
            let $f = sync::Freshness { node: &node, keys: &keys, highest, issued: &issued_fn };
            $body
        }};
    }
    Ok(Some(match op {
        "pull_request" => sync::pull_request(a.v(0)),
        "push_request" => sync::push_request(&a.list(0), if a.v(1).is_null() { None } else { Some(a.v(1)) }),
        "new_challenge" => json!(sync::new_challenge()?),
        "sign_pull" | "sign_push" => {
            let o = a.v(1);
            let field = |k: &str| o.get(k).and_then(Value::as_str);
            let signer = sync::Signer {
                who: field("who").unwrap_or(""),
                node: field("node").unwrap_or(""),
                private_key: field("private_key").unwrap_or(""),
                suite: suite_arg(o.get("suite").unwrap_or(&Value::Null))?,
                counter: o.get("counter").and_then(Value::as_u64),
                challenge: field("challenge").map(String::from),
            };
            if op == "sign_pull" { sync::sign_pull(a.v(0), &signer)? } else { sync::sign_push(a.v(0), &signer)? }
        }
        "message_refusals" => with_fresh!(a.v(2), |f| Value::Array(
            sync::message_refusals(a.v(0), a.s(1)?, &f).iter().map(|r| r.to_json()).collect()
        )),
        "pull_refusals" => with_fresh!(a.v(1), |f| Value::Array(sync::pull_refusals(a.v(0), &f).iter().map(|r| r.to_json()).collect())),
        "push_refusals" => with_fresh!(a.v(1), |f| Value::Array(sync::push_refusals(a.v(0), &f).iter().map(|r| r.to_json()).collect())),
        "answer_pull" => {
            let log: Vec<sync::Arrival> = a
                .list(0)
                .iter()
                .map(|e| sync::Arrival {
                    n: e.get("n").and_then(Value::as_u64).unwrap_or(0),
                    block: e.get("block").cloned().unwrap_or(Value::Null),
                    header: e.get("header").filter(|v| !v.is_null()).cloned(),
                    header_signature: e.get("header_signature").filter(|v| !v.is_null()).cloned(),
                    copies: e
                        .get("copies")
                        .and_then(Value::as_object)
                        .map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                        .unwrap_or_default(),
                })
                .collect();
            let held = if a.v(6).is_array() { Some(index_of(a.list(6).iter())) } else { None };
            let choices = a.v(4);
            let cap = choices.get("cap").and_then(Value::as_u64).filter(|c| *c >= 1).ok_or_else(|| Fail::Argument("choices.cap is a whole number of at least 1: the node states the most blocks one answer carries".into()))?;
            let serves_pairs = choice_bool(choices, "serves_pairs", "whether the node sends the other half of a forked pair")?;
            sync::answer_pull(&log, a.v(1), a.s(2)?, a.opt(3), sync::PullChoices { cap, serves_pairs }, a.opt(5), held.as_ref(), a.suite(7)?, a.v(8).as_u64())?
        }
        "push_answer" => sync::push_answer_of(a.v(0), a.s(1)?, a.s(2)?, a.suite(3)?)?,
        "well_known" => {
            let admission = a.opt(3);
            sync::well_known(a.s(0)?, &a.strings(1), &a.strings(2), admission, a.v(4))
        }
        "waited_too_long" => {
            let ttl = a.v(2).as_i64().ok_or_else(|| Fail::Argument("the time to wait is a whole number of milliseconds".into()))?;
            json!(sync::waited_too_long(a.s(0)?, a.s(1)?, ttl))
        }
        "matches" => {
            let held = index_of(a.list(2).iter());
            json!(sync::matches(a.v(0), a.v(1), &held))
        }
        "heads_of" => json!(sync::heads_of(&a.list(0))),
        "accept" => {
            let schemas = index_of(a.list(3).iter());
            let takes_pairs = choice_bool(a.v(2), "takes_pairs", "whether the node takes the blocks of a forked pair")?;
            sync::accept(&a.list(0), &a.list(1), takes_pairs, if a.v(3).is_array() { Some(&schemas) } else { None })
                .to_json()
        }
        // The sealed blocks of a push: (messages, held, choices). Held holds whole blocks, sealed messages or their public headers.
        "accept_sealed" => {
            let takes_pairs = choice_bool(a.v(2), "takes_pairs", "whether the node takes the blocks of a forked pair")?;
            sync::accept_sealed(&a.list(0), &a.list(1), takes_pairs).to_json()
        }
        "answer_signed_by" => json!(sync::answer_signed_by(a.v(0), &a.strings(1))),
        "well_known_errors" => json!(sync::well_known_errors(a.v(0))),
        "announcement" => sync::announcement(a.v(0)),
        _ => return Ok(None),
    }))
}

/// A node's choice, stated as a boolean in the object the call takes: a missing or non-boolean one is an argument error, never a default.
fn choice_bool(choices: &Value, name: &str, what: &str) -> core::result::Result<bool, Fail> {
    choices.get(name).and_then(Value::as_bool).ok_or_else(|| Fail::Argument(format!("choices.{name} is true or false: the node states {what}")))
}

/// The admission rule a node states for `admission_refusals`: its state object, or an explicit null (no rule). A missing argument is an error.
fn stated_admission(a: &Args) -> core::result::Result<&Value, Fail> {
    match (a.0.len() > 3, a.v(3)) {
        (true, v) if v.is_object() || v.is_null() => Ok(v),
        _ => Err(Fail::Argument("admission is the rule's state object or an explicit null (no rule): the node states it".into())),
    }
}

/// The audience an author states: "public" or a list of recipients. Missing is not read as either (None).
fn readers_of(v: &Value) -> core::result::Result<Option<crate::Readers>, Fail> {
    match v {
        Value::Null => Ok(None),
        Value::String(s) if s == crate::PUBLIC => Ok(Some(crate::Readers::Public)),
        Value::Array(_) => Ok(Some(crate::Readers::To(strings_of(v)))),
        _ => Err(Fail::Argument("audience is \"public\" or a list of recipients".into())),
    }
}

/// The options `compose` and `write` share: author, audience, after, at, link, salts, nonce.
fn compose_options(o: &Value) -> core::result::Result<crate::ComposeOptions, Fail> {
    let link = o.get("link").filter(|l| l.is_object()).map(|l| Link {
        seq: l.get("seq").and_then(Value::as_i64).unwrap_or(0),
        prev: arg_text(l.get("prev")),
    });
    Ok(crate::ComposeOptions {
        author: arg_text(o.get("author")),
        suite: arg_text(o.get("suite")),
        skip: o.get("skip").and_then(Value::as_bool).unwrap_or(false),
        audience: readers_of(o.get("audience").unwrap_or(&Value::Null))?,
        after: strings_of(o.get("after").unwrap_or(&Value::Null)),
        at: o.get("at").and_then(Value::as_str).map(String::from),
        clockless: o.get("clockless").and_then(Value::as_bool).unwrap_or(false),
        link,
        salts: o.get("salts").cloned().unwrap_or(Value::Null),
        nonce: o.get("nonce").and_then(Value::as_str).map(String::from),
    })
}

/// `write(type, state, refs, options)`, options as the C ABI's fb_write takes them.
fn write(a: &Args) -> Out {
    let o = a.v(3);
    let key = o
        .get("key")
        .filter(|k| k.is_object())
        .ok_or_else(|| Fail::Argument("options.key is { public_key_sign, private_key }".into()))?;
    let pair = keypair_of(key);
    let list = |k: &str| o.get(k).and_then(Value::as_array).cloned().unwrap_or_default();
    let held = list("held");
    let schemas = index_of(list("schemas").iter());
    let options = crate::WriteOptions {
        compose: compose_options(o)?,
        key: Some(&pair),
        held: &held,
        schemas: o.get("schemas").map(|_| &schemas),
    };
    Ok(crate::write(a.s(0)?, a.v(1), a.v(2), &options)?)
}

/// `genesis(keys, { kind, at, audience, encryption_key, recovery_key, reach, recovery_suite, custodian, salts?, nonce? })`, as fb_genesis takes it:
/// `kind`, `at` and `audience` are stated.
fn genesis(a: &Args) -> Out {
    let pair = keypair_of(a.v(0));
    let o = a.v(1);
    let field = |k: &str| o.get(k).and_then(Value::as_str);
    Ok(crate::identity::genesis(
        &pair,
        &crate::identity::GenesisOptions {
            kind: field("kind").unwrap_or(""),
            at: field("at").unwrap_or("").to_string(),
            audience: readers_of(o.get("audience").unwrap_or(&Value::Null))?,
            salts: o.get("salts").cloned().unwrap_or(Value::Null),
            nonce: field("nonce").map(String::from),
            encryption_key: field("encryption_key").unwrap_or(""),
            recovery_key: field("recovery_key").unwrap_or(""),
            reach: field("reach").unwrap_or(""),
            recovery_suite: field("recovery_suite").unwrap_or(""),
            custodian: field("custodian").unwrap_or(""),
        },
    )?)
}

pub fn answer(op: &[u8], args: &[u8]) -> Value {
    let fail = |kind: &str, message: String, reasons: Vec<String>| {
        json!({ "error": kind, "message": message, "reasons": reasons })
    };
    let fail_lib = |kind: &str, e: Error| {
        let refusals: Vec<Value> = e.refusals.iter().map(|r| r.to_json()).collect();
        json!({ "error": kind, "message": e.message, "code": e.code, "reasons": e.reasons, "refusals": refusals })
    };
    let op = match core::str::from_utf8(op) {
        Ok(s) => s,
        Err(_) => return fail("argument", "op is not UTF-8".into(), vec![]),
    };
    let args = match crate::canonical::read_args(args) {
        Ok(Value::Array(list)) => Args(list, Default::default()),
        Ok(_) => return fail("argument", "args is a JSON array".into(), vec![]),
        Err(e) => return fail("json", format!("json: args: {e}"), vec![]),
    };
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| dispatch(op, &args))) {
        Ok(Ok(_)) if args.1.get().is_some() => fail("argument", format!("argument {} is a list", args.1.get().unwrap_or(0)), vec![]),
        Ok(Ok(v)) => json!({ "ok": v }),
        Ok(Err(Fail::Argument(m))) => fail("argument", m, vec![]),
        Ok(Err(Fail::Profile(m))) => fail("profile", m, vec![]),
        Ok(Err(Fail::Lib(e))) => {
            let kind = if !e.refusals.is_empty() || !e.reasons.is_empty() {
                "refused"
            } else if e.message.starts_with("json") {
                "json"
            } else {
                "crypto"
            };
            fail_lib(kind, e)
        }
        Err(_) => fail("internal", "foodblock: an internal error stopped the call".into(), vec![]),
    }
}

/// Strict writing of a block read from text (core.md section 8, check 1, then the content checks): exactly type, state and
/// refs, and every finding the text shows (a float, a key out of place), as `[{ code, detail }]`.
fn strict_block(block: &Value) -> Value {
    let none = Value::Null;
    let whole = block.as_object().is_some_and(|o| o.len() == 3 && ["type", "state", "refs"].iter().all(|k| o.contains_key(*k)));
    if !whole {
        return json!([{ "code": "not_canonical", "detail": "a block is exactly { type, state, refs }" }]);
    }
    let findings = crate::valid::content_refusals(crate::js::type_of(block), block.get("state").unwrap_or(&none), block.get("refs").unwrap_or(&none));
    Value::Array(findings.iter().map(|r| r.to_json()).collect())
}

// The pure functions read only what the write check takes (folds.md, What each fold returns): `terms_total` judges the terms it reads
// (price, quantity, lines) as an offer's and the quantity chosen as an accept's; `limit_within_parent` judges each fence as a grant's
// scope. What the check refuses is junk, and reads as absent: no total, and not within.
mod pure_junk {
    use crate::prelude::*;
    const AT: &str = "2026-01-01T00:00:00.000Z";
    fn id(n: char) -> String {
        core::iter::repeat_n(n, 64).collect()
    }
    fn refused(type_name: &str, state: Value, refs: Value) -> bool {
        let none = crate::js::Index::default();
        !crate::check::refusals(type_name, &state, &refs, crate::CheckOptions { held: Some(&none), schemas: None }).is_empty()
    }
    pub(super) fn terms(terms: &Value, quantity: Option<&Value>) -> bool {
        let Some(t) = terms.as_object() else { return true };
        let read: Map<String, Value> = t.iter().filter(|(k, _)| matches!(k.as_str(), "price" | "quantity" | "lines")).map(|(k, v)| (k.clone(), v.clone())).collect();
        let whats: Vec<String> = match t.get("lines") {
            Some(Value::Array(l)) if l.iter().all(|x| x.get("what").is_some_and(Value::is_string)) => {
                crate::js::sorted_set(l.iter().filter_map(|x| x.get("what").and_then(Value::as_str)))
            }
            _ => vec![id('3')],
        };
        let what = if whats.len() == 1 { json!(whats[0]) } else { json!(whats) };
        let offer = json!({ "seq": 1, "at": AT, "audience": "public", "terms": read });
        let mut junk = refused("promise", offer, json!({ "author": id('1'), "prev": id('1'), "from": id('1'), "what": what }));
        if let Some(q) = quantity {
            let accept = json!({ "seq": 1, "at": AT, "audience": "public", "status": "accepted", "terms": { "quantity": q } });
            junk = junk || refused("promise", accept, json!({ "author": id('1'), "prev": id('1'), "answers": id('4'), "for": id('4') }));
        }
        junk
    }
    pub(super) fn fence(fence: &Value) -> bool {
        let f = match fence.get("state") {
            Some(s) if s.is_object() => s,
            _ => fence,
        };
        let Some(f) = f.as_object() else { return true };
        let mut scope: Map<String, Value> = f.iter().filter(|(k, _)| matches!(k.as_str(), "limit" | "each" | "every")).map(|(k, v)| (k.clone(), v.clone())).collect();
        scope.insert("until".into(), json!(AT));
        let grant = json!({ "seq": 1, "at": AT, "audience": "public", "kind": "fence", "scope": scope });
        refused("grant", grant, json!({ "author": id('1'), "prev": id('1'), "to": id('2') }))
    }
}
