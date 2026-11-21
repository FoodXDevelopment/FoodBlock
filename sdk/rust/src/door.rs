//! The JSON door: one call, one data shape, shared by every language binding (JNI, the C ABI's `fb_call`, and through
//! the C ABI Python, Swift and Go).
//! ```text
//! answer(op: UTF-8 name, args: JSON array) -> { "ok": value }
//!                                              | { "error": kind, "message", "code", "reasons", "refusals" }
//! ```
//!
//! kind is `argument`, `json`, `refused`, `crypto`, `profile` or `internal`. Every op is a thin call into this crate:
//! there is no second implementation here, only the names. Only the ops in spec/protocol.json `door.ops` are the protocol (the vectors bind
//! them); every other arm is a convenience of this SDK, listed in sdk/door.table, and no vector binds it. An op this build's profile leaves out says `profile`.
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
struct Args(Vec<Value>, core::cell::Cell<Option<usize>>, core::cell::RefCell<Option<String>>);
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
            // 1.9 stage 7 (Job F): a mount in the place of a collection is that mount's set of blocks; a text that names no mount of this
            // door is an argument error (unknown_mount)
            #[cfg(feature = "std")]
            Value::String(m) => crate::rules::mounted(m).unwrap_or_else(|| {
                *self.2.borrow_mut() = Some(m.clone());
                Vec::new()
            }),
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

/// The challenge for a block (`{ type, state, refs }`: the bytes its key signs, its header, a genesis its own bytes; `sign::signed_bytes`,
/// in `p256`, the passkey's suite) or a signed message part (its canonical JSON without `signature`).
fn passkey_challenge(v: &Value) -> String {
    let is_block = v.get("type").is_some_and(Value::is_string) && v.get("state").is_some_and(Value::is_object) && v.get("refs").is_some_and(Value::is_object);
    let bytes = if is_block {
        crate::sign::signed_bytes("p256", v)
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
        // id_of(block, held?): a block's id, in the suite of the key its pieces name, read among held (core.md, section 2); with none, a
        // reader's guess: a genesis's own suite, else the hash name of refs.key, else of refs.author
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
        // 1.9 3a-3: a writer signs only what its own `read` reads. A block whose body the reader's value checks refuse is not signed.
        // 1.9 3a (decided, CORE-SET "What building changed"): `sign` holds no store, so its `read` is the body's own: every value finding, not `names_missing` (the blocks a
        // block names may be held elsewhere); a header (no `type`), and a body with no author (signed over its own bytes, as a genesis
        // is: no header to place it), are signed as given.
        "sign" => {
            let block = a.v(0);
            if block.get("type").is_some() && block.pointer("/refs/author").is_some() {
                let (t, s, r) = crate::block::parts(block);
                let found = crate::check::write_refusals(t, s, r, Default::default());
                if !found.is_empty() {
                    let codes: Vec<&str> = found.iter().map(|x| x.code.as_str()).collect();
                    return Err(Fail::Lib(Error::new(format!("FoodBlock: a writer signs only what its own read reads; this block is refused: {}", codes.join(", ")))));
                }
            }
            json!(crate::sign_in(a.suite(2)?, block, a.s(1)?)?)
        }
        "verify" => json!(crate::verify_in(&crate::sign::suite_named_by(a.s(2)?), a.v(0), a.s(1)?, a.s(2)?)),
        "sign_message" => crate::sign::sign_message_in(a.suite(2)?, a.v(0), a.s(1)?)?,
        // 1.9 3a-10: `verify_message` checks the key set before the signature: a header or a block (a genesis is signed over its own bytes)
        // is no message part, so it is false before any signature is read.
        // 1.9 3a (decided, CORE-SET "What building changed"): "the key set" is read as the part's own keys: exactly a header's, or a block's { type, state, refs }.
        "verify_message" => json!(!crate::sign::is_block_bytes(a.v(0)) && crate::sign::verify_message_in(&crate::sign::suite_named_by(a.s(1)?), a.v(0), a.s(1)?)),
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
        // an amount (encoding.md, Shapes): money is an amount like any other; `of` the id of its kind, when given
        "amount" => crate::amount(a.s(0)?, a.s(1)?, a.v(2).as_str()),
        "terms" => crate::terms(a.v(0)),
        // valid(block, held) (core.md, section 8): who said these bytes. The block is a full block or a held header { header,
        // header_signature }; the codes of checks 1 to 6, empty when valid.
        "valid" => Value::Array(crate::valid::valid(a.v(0), &held_of(&a.list(1))).iter().map(|r| r.to_json()).collect()),
        // write_refusals(draft, held) (1.9 3a-3, stage 5 compare): what a writer refuses to sign, asked of a draft before anyone signs it
        // ({ type, state, refs }, unsigned): every code `write` would refuse it with, read against `held` (a deal block against what it
        // answers, a child grant against its parent), in protocol.json's order; empty when it may be signed. Her own write runs the same.
        "write_refusals" => {
            let held = held_of(&a.list(1));
            let d = a.v(0);
            let t = d.get("type").and_then(Value::as_str).ok_or_else(|| Fail::Argument("argument 0 is a draft: { type, state, refs }".into()))?;
            let opts = crate::check::CheckOptions { schemas: None, held: Some(&held) };
            Value::Array(crate::check::write_refusals(t, d.get("state").unwrap_or(&Value::Null), d.get("refs").unwrap_or(&Value::Null), opts).iter().map(|r| r.to_json()).collect())
        }
        // read(block, held, schemas?) (core.md, section 8): whether this reader can read a valid block; every code found, empty when read.
        // Asked of a block that is not valid, or of a header, it is an argument error: read is asked only of a valid body.
        "read" => {
            let held = held_of(&a.list(1));
            let schemas = index_of(a.list(2).iter());
            let block = a.v(0);
            if block.get("type").is_none() {
                return Err(Fail::Argument("read is asked of a block's body: a block held by its header alone is not read".into()));
            }
            // 1.9 stage 7 (B5): `runs`, the ids of the rule sets this reader runs (core.md, section 11)
            // `runs` is null, left out, or a list of ids (stage 7 compare): anything else is an argument error, never read as none
            let runs = a.strings(3);
            if !(a.v(3).is_null() || a.v(3).as_array().is_some_and(|l| l.iter().all(|x| x.as_str().is_some_and(|h| crate::spec().is("id", h))))) {
                return Err(Fail::Argument("argument 3 (runs) is a list of rule set ids".into()));
            }
            crate::rules::running(&runs, || {
                let judge = crate::valid::Judge::new(&held, if a.v(2).is_array() { Some(&schemas) } else { None });
                if !judge.valid(block).is_empty() {
                    return Err(Fail::Argument("read is asked of a valid block: this one is not valid".into()));
                }
                Ok(Value::Array(judge.read(block).iter().map(|r| r.to_json()).collect()))
            })?
        }
        // The schema store a reader makes of the blocks it holds (core.md, section 8): every `thing` of kind `schema`, once per id, ascending.
        "schemas_from" => {
            let store: alloc::collections::BTreeMap<String, Value> = crate::valid::schemas_from(&index_of(a.list(0).iter())).iter().map(|(h, b)| (h.clone(), b.clone())).collect();
            Value::Array(store.into_values().collect())
        }
        // A block read from the wire (canonical.md, On the wire): its bytes first (size_limit), then exactly the canonical bytes of a strict
        // value that is { type, state, refs } (not_canonical), then checks 2 to 4.
        "strict_text" => strict_text(a.s(0)?),
        // 1.9 3a-8, 3a-9: a push read from the wire, as its bytes. One reader for every message: the push's size and count first
        // (`limits.push_bytes`, `limits.push_messages`), no carrier deeper than `limits.read_depth`, exactly `{ messages, for }`, and
        // nothing strict writing does not allow (no float, no null, no whole number past 2^53 - 1) anywhere in it. A push that fails is
        // refused whole: `{ refused: { hash, code, detail }, messages: [] }`, `hash` the SHA-256 of its bytes. Else `{ messages }`: for each
        // message in order what its block's bytes alone say (as `strict_text`; a sealed message has none).
        // 1.9 3a-9: the door's argument is the push's text, read by the core as its bytes; `refused` is left out of a push that is read
        // (the one form has no null). 1.9 3a-8: a push over its bytes or count, or deeper than read_depth, is `size_limit`; any other
        // refusal of the whole push is `not_canonical`. limits.push_bytes 8 MiB and limits.push_messages 1024.
        "strict_push" => strict_push(a.s(0)?),
        // What a block names for its meaning (protocol.json `needs`): all of it, or with the blocks held, what is not held. Never its author
        // or its prev.
        "needs" => {
            if a.v(1).is_array() {
                json!(crate::js::needs_missing(a.v(0), &index_of(a.list(1).iter())))
            } else {
                json!(crate::js::needs_of(a.v(0)))
            }
        }
        "short_code" => json!(crate::strangers::short_code(a.s(0)?)),
        // the short reply (profiles/short-form.md, way 1): the text of an answer, and the answer rebuilt from it among the blocks held
        "short_reply" => json!(crate::strangers::short_reply(a.v(0))),
        "short_reply_open" => crate::strangers::short_reply_open(a.s(0)?, a.s(1)?, &a.list(2)).unwrap_or(Value::Null),
        "code_matches" => json!(crate::strangers::code_matches(a.s(0)?, a.s(1)?)),
        "consent" => crate::strangers::consent(a.s(0)?, a.opt(1), &a.list(2), Some(a.v(3)).filter(|b| b.is_object())),
        // the occurrences of a standing promise's calendar repeat from `from` up to (not including) `to`, in UTC (promises.md, Terms: repeat, zone)
        "repeat_occurrences" => {
            let p = a.v(0);
            let when = p.pointer("/state/when").and_then(Value::as_str).ok_or_else(|| Fail::Argument("the promise's state.when is a time: a repeat that follows an event has no calendar".into()))?;
            let repeat = p.pointer("/state/terms/repeat").and_then(Value::as_str).ok_or_else(|| Fail::Argument("the promise's terms.repeat is an RRULE text: an event repeat has no calendar".into()))?;
            let zone = p.pointer("/state/terms/zone").and_then(Value::as_str).ok_or_else(|| Fail::Argument("a calendar repeat is read in terms.zone".into()))?;
            let ms = |t: &str| crate::time::parse(t).ok_or_else(|| Fail::Argument("a time".into()));
            let (from, to) = (ms(a.time(1)?)?, ms(a.time(2)?)?);
            json!(crate::recur::occurrences(when, repeat, zone, from, to).map_err(Fail::Argument)?)
        }
        // a stranger to a sender (consent.md); the sender's block, when given, names the principal it speaks for
        "is_stranger" => json!(crate::strangers::is_stranger(a.s(0)?, a.s(1)?, &a.list(2), Some(a.v(3)).filter(|b| b.is_object()))),
        // the node's own stated choices: its rule's state (an object) or an explicit null (no rule), and today's count (an integer)
        "admission_refusals" => Value::Array(
            crate::strangers::admission_refusals(a.v(0), a.s(1)?, &a.list(2), stated_admission(a)?, a.v(4).as_u64().ok_or_else(|| Fail::Argument("asks_today is a whole number: the node states how many asks it took today from this sender".into()))?)
                .iter()
                .map(|r| r.to_json())
                .collect(),
        ),
        "due" => {
            let map = arrivals(a.v(1))?;
            json!(crate::views::due(a.v(0), &|h: &str| map.get(h).and_then(Value::as_str).map(String::from)))
        }
        // Chains and causal order.
        "next_link" => {
            let last = a.v(0);
            crate::next_link(if last.is_null() { None } else { Some(last) }, a.opt(1))?.to_json()
        }
        "check_chain" => chain_json(&crate::check_chain(&a.list(0), a.s(1)?)),
        // read_whole(block, start, held) (folds.md, A line): { whole, lacks }. A start not on the block's line is an argument error.
        "read_whole" => crate::line::read_whole(a.s(0)?, a.s(1)?, &held_of(&a.list(2))).map_err(Fail::Argument)?.to_json(),
        "causes_of" => json!(crate::order::causes_of(a.v(0))),
        "past_of" => json!(crate::past_of(a.v(0), &a.list(1))),
        "heads_among" => Value::Array(crate::order::heads_among(&a.list(0))),
        "is_time" => json!(crate::time::is_time(Some(a.v(0)))),
        "is_date" => json!(crate::time::is_date(Some(a.v(0)))),
        "parse_duration" => match a.opt(0).and_then(crate::time::parse_duration) {
            Some(d) => json!({ "years": d.years, "months": d.months, "days": d.days, "ms": d.ms }),
            None => Value::Null,
        },
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
        "key_timeline" => Value::Array(crate::identity::key_timeline(a.s(0)?, &a.list(1)).iter().map(|k| k.to_json()).collect()),
        "signed_by_author" => json!(crate::identity::signed_by_author(a.v(0), &a.list(1))),
        // stands(block, held) (blocks.md, Finality): { stands, waiting: [{ block, on }] }, read with no clock and no arrival
        "stands" => {
            let index = crate::js::held_index(a.list(1).iter().filter(|b| crate::js::hash_of(b) != crate::js::hash_of(a.v(0))).chain([a.v(0)]));
            let block = index.get(crate::js::hash_of(a.v(0))).cloned().unwrap_or_else(|| a.v(0).clone());
            crate::identity::stands(&block, &index).to_json(crate::js::hash_of(a.v(0)))
        }
        "spec" => json!({ "protocol": crate::spec().protocol, "conventions": crate::spec().conventions, "rule_set": crate::rules::BUILT_FROM }),
        // rule_set(files) (core.md, section 11): { id, manifest }, library
        "rule_set" => crate::rules::rule_set(a.v(0).as_object().ok_or_else(|| Fail::Argument("files is { path: the file's bytes as text }".into()))?)
            .ok_or_else(|| Fail::Argument("each file is its bytes as text".into()))?,
        // mount(blocks, into?), unmount(mount) (core.md, section 12): library; a mount is no part of any answer
        #[cfg(feature = "std")]
        "mount" => json!(crate::rules::mount(&a.list(0), a.opt(1)).map_err(Fail::Argument)?),
        #[cfg(feature = "std")]
        "unmount" => {
            if !crate::rules::unmount(a.s(0)?) {
                return Err(Fail::Argument(format!("unknown_mount: {} is no mount of this door", a.s(0)?)));
            }
            json!(true)
        }
        "spec_list" => json!(crate::spec().list(a.s(0)?)),
        // count_of(needed, members): a threshold read against a set of that many voices (folds.md, Counts); null when it names no count
        "count_of" => {
            let members = a.v(1).as_u64().ok_or_else(|| Fail::Argument("members is a whole number".into()))?;
            json!(crate::bound::count_of(a.v(0), members))
        }
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
        "key_hash" => json!(crate::identity::key_hash_in(a.suite(1)?, a.s(0)?)),
        "is_genesis" => json!(crate::identity::is_genesis(a.v(0))),
        "genesis_opens" => json!(crate::identity::genesis_opens(if a.v(0).is_null() { None } else { Some(a.v(0)) })),
        "identity_state" => crate::identity::identity_state(a.s(0)?, &a.list(1)),
        "counts" => json!(crate::identity::counts_in(a.v(0), &crate::js::held_index(a.list(1).iter()))),
        "forked" => json!(crate::identity::forked(a.v(0), &a.list(1))),
        // the pairs among blocks held as bodies or as headers (nodes.md, Equivocation)
        "fork_pairs" => json!(crate::identity::fork_pairs_in(&crate::js::closed(held_of(&a.list(0))))),
        "next_link_for" => crate::identity::next_link_for(a.s(0)?, a.s(1)?, &a.list(2))?.to_json(),
        "is_live" => json!(crate::grant::is_live(a.v(0), &a.list(1), a.time_opt(2)?)),
        "ancestors" => json!(crate::grant::ancestors(a.v(0), &a.list(1))),
        "terms_total" => {
            let quantity = Some(a.v(1)).filter(|v| !v.is_null());
            if pure_junk::terms(a.v(0), quantity) { Value::Null } else { crate::fold::terms_total(a.v(0), quantity) }
        }
        "recipients_of" => json!(crate::sync::recipients_of(a.v(0), a.s(1)?)),
        "children_of" => json!(crate::tasks::children_of(a.s(0)?, &a.list(1))),
        "why_not_live_undo" => json!(crate::grant::why_not_live_undo(a.v(0), &crate::js::held_index(a.list(1).iter()))),
        "reading_is_persons_claim" => json!(crate::strangers::reading_is_persons_claim(a.v(0), a.s(1)?, &a.list(2))),
        "residency_refusals" => Value::Array(
            crate::profiles::residency_refusals(a.v(0), &a.strings(1)).iter().map(|r| r.to_json()).collect(),
        ),
        "scope_within" => json!(crate::grant::scope_within(a.v(0), a.v(1))),
        // the one reading of a grant's scope (authority.md): a scope that is null reads as an empty one; a non-empty `junk` holds the grant to no word
        "scope_reading" => crate::grant::scope_reading(a.v(0)),
        "fence_reading" => crate::grant_fence::fence_reading(a.v(0), a.time(1)?, a.v(2), a.time_opt(3)?),
        "scope_refusals" => Value::Array(crate::grant::scope_refusals(a.v(0), a.v(1)).iter().map(|r| r.to_json()).collect()),
        "why_not_under" => crate::grant::why_not_under_codes(a.v(0), &a.list(1), a.time_opt(2)?),
        "under_ok" => crate::grant::under_ok(a.v(0), &a.list(1)),
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
        // seal(plaintext, keys, suite?, fixed?, pad?): with `pad` true an object plaintext is padded to the next size (privacy.md, Sealed messages)
        "seal" => {
            let plain = if a.v(4) == &Value::Bool(true) { crate::write::pad_plaintext(a.v(0)) } else { a.v(0).clone() };
            crate::envelope::seal_with(&plain, &refs, a.suite(2)?, fixed_of(a.v(3))?.as_ref())?
        }
        "open" => crate::open(a.v(0), a.s(1)?)?,
        // seal_copy(block, keys, reveals, fixed?, suite?): the block's own signature is its header's (privacy.md); `suite` names the envelope
        "seal_copy" if a.v(5) == &Value::Bool(true) => crate::write::seal_copy_padded(a.v(0), &refs, a.v(2), fixed_of(a.v(3))?.as_ref(), a.suite(4)?)?,
        "seal_copy" => crate::seal_copy(a.v(0), &refs, a.v(2), fixed_of(a.v(3))?.as_ref(), a.suite(4)?)?,
        // padded_size(bytes): the size a sealer that pads pads a plaintext of that many bytes to
        "padded_size" => json!(crate::write::padded_size(a.v(0).as_u64().ok_or_else(|| Fail::Argument("bytes is a whole number".into()))? as usize)),
        "open_copy" => crate::open_copy(a.v(0), a.s(1)?)?,
        // wrap_copy(copy, mailbox_key, suite?, fixed?): a sealed copy wrapped to a mailbox (privacy.md, Keeping apart)
        "wrap_copy" => crate::sync::wrap_copy(a.v(0), a.s(1)?, a.suite(2)?, fixed_of(a.v(3))?.as_ref())?,
        "encryption_keypair" => crate::envelope::generate_encryption_keypair_in(a.suite(0)?)?,
        "encryption_key_of" => json!(crate::envelope::encryption_key_in(a.suite(1)?, a.s(0)?)?),
        _ => return Ok(None),
    }))
}

/// The block a condition is read for: a block, or the id of one held; None for null (every block held).
#[cfg(feature = "folds")]
fn relying(v: &Value, held: &[Value]) -> core::result::Result<Option<Value>, Fail> {
    match v {
        Value::Null => Ok(None),
        Value::Object(_) => Ok(Some(v.clone())),
        Value::String(h) => held.iter().find(|b| crate::js::hash_of(b) == h.as_str()).cloned().map(Some).ok_or_else(|| Fail::Argument("the block it is read for is not held".into())),
        _ => Err(Fail::Argument("the block it is read for is a block, an id held, or null".into())),
    }
}

#[cfg(feature = "folds")]
fn folds(op: &str, a: &Args) -> core::result::Result<Option<Value>, Fail> {
    use crate::fold;
    Ok(Some(match op {
        // 1.9 R-C1: read on the blocks in the causal past of the block it is read for (its id or the block; null: every block held), never on a
        // reader's clock. A sensor reading's window ends at that block's own `at`, its signer's word read against her.
        "reading_condition_holds" => {
            let held = a.list(1);
            let at = relying(a.v(2), &held)?.ok_or_else(|| Fail::Argument("argument 2 is the block it is read for".into()))?;
            let past = crate::js::held_index(held.iter().filter(|b| crate::js::hash_of(b) != crate::js::hash_of(&at)).chain([&at])).past_of(&at).hashes();
            let seen: Vec<Value> = held.iter().filter(|b| past.iter().any(|h| h == crate::js::hash_of(b))).cloned().collect();
            json!(crate::js::ss(&at, "at").is_some_and(|now| crate::tasks::reading_condition_holds(a.v(0), &seen, now)))
        }
        "condition_holds" => {
            let held = a.list(1);
            let at = relying(a.v(2), &held)?;
            json!(crate::tasks::condition_holds(a.v(0), &held, at.as_ref()))
        }
        "promise_stage" => {
            fold::promise_stage(a.v(0), &a.list(1), &fold::StageOptions::default())
        }
        "promise_views" => {
            let o = a.v(2);
            crate::views::promise_views(&a.strings(0), &a.list(1), clock(o.get("now").unwrap_or(&Value::Null))?)
        }
        "promise_view" => crate::views::promise_view(a.v(0), &a.list(1), clock(a.v(2).get("now").unwrap_or(&Value::Null))?),
        "circle_state" => {
            let within = a.v(2);
            fold::circle_state(a.s(0)?, &a.list(1), if within.is_null() { None } else { Some(within) })
        }
        "circle_versions" => fold::circle_versions(a.s(0)?, &a.list(1)),
        // 1.9 stage 6: whether a row of the circle a block is `as` holds for it, or every owner signed it (circles.md, C10, C15)
        "row_holds" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("argument 0 is a block".into()));
            }
            fold::row_holds(a.v(0), &a.list(1))
        }
        // 1.9 stage 6, a reading: the fewest hands each row needs, and the every-owner way
        "ways_in" => fold::ways_in(a.s(0)?, &a.list(1)),
        // the one party a fold counts a block for (authority.md, Who a block speaks for): its id, or null for no one; no clock
        "speaks_for" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("argument 0 is a block".into()));
            }
            json!(fold::who_speaks(a.v(0), &a.list(1)))
        }
        // is this block backed by this person (authority.md, Backed by a person): { backed, why, chain }; no clock, no arrival
        "backed" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("argument 0 is a block".into()));
            }
            fold::backed(a.v(0), a.s(1)?, &a.list(2))
        }
        // the same, for a whole set at once: { hash: { backed, why } }, read together
        "backed_all" => fold::backed_all(a.s(0)?, &a.list(1)),
        // 1.9 stage 4 (authority.md): Keeps to, the grant's line, the worst case, the lowest offer at her deadline
        "keeps_to" => fold::keeps_to_door(a.v(0), a.v(1), &a.list(2)),
        "meter" => fold::meter(a.v(0), &a.list(1), Some(a.v(2)).filter(|v| v.is_object())),
        "worst_case" => fold::worst_case(a.v(0), &a.list(1)),
        "lowest_offer" => fold::lowest_offer(a.v(0), &a.list(1)),
        // an amount moved in this person's name that they do not back (promises.md, What is to come back): { to_come: [{ block, amount, to, why }] }
        "to_come_back" => fold::to_come_back(a.s(0)?, &a.list(1)),
        // a list-keeper's answer against the lookup it answers (promises.md, Finding): { ok, why, bad, left_out }
        "listing_check" => {
            if !a.v(0).is_object() || !a.v(1).is_object() {
                return Err(Fail::Argument("arguments 0 and 1 are blocks".into()));
            }
            fold::listing_check(a.v(0), a.v(1), &a.list(2))
        }
        // a signed check of someone's record against the blocks it names (promises.md, A signed check): { ok, why, read }
        "check_reads" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("argument 0 is a block".into()));
            }
            fold::check_reads(a.v(0), &a.list(1))
        }
        // a circle of IOUs cancelled, each promise reduced (promises.md, Clearing): { binds, why, who, missing, lines }
        "clearing_applied" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("argument 0 is a block".into()));
            }
            fold::clearing_applied(a.v(0), &a.list(1))
        }
        // whether a judge's ruling releases a stake that names it (promises.md, Rulings): { releases, to, amount, ruling, why }
        "ruling_releases" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("argument 0 is a block".into()));
            }
            fold::ruling_releases(a.v(0), &a.list(1))
        }
        // whether a judge's ruling is public: her offer's `terms.rulings`, or an unhonoured award (promises.md, Rulings): { audience, why }
        "ruling_audience" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("argument 0 is a block".into()));
            }
            fold::ruling_audience(a.v(0), &a.list(1), a.time_opt(2)?)
        }
        // what a judge's fee back comes to when the sides settle (promises.md, Rulings): { settled, releases, to_come, why }
        "fee_back" => {
            if !a.v(0).is_object() || !a.v(1).is_object() {
                return Err(Fail::Argument("arguments 0 and 1 are blocks".into()));
            }
            fold::fee_back(a.v(0), a.v(1), &a.list(2))
        }
        // what of this person's becomes whose if this block stands, and whether it can come back (promises.md, What becomes whose)
        "gives" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("argument 0 is a block".into()));
            }
            fold::gives(a.v(0), a.s(1)?, &a.list(2))
        }
        // 1.9 stage 6 (O1): whether a draft, signed, would bind anyone: an accept, or a draft that gives something of the one whose word it is
        // (`refs.as` where signed as a circle, else `refs.author`)
        "binds" => {
            let d = a.v(0);
            if !d.is_object() {
                return Err(Fail::Argument("argument 0 is a draft { type, state, refs }".into()));
            }
            let accepted = crate::js::ss(d, "status") == Some("accepted");
            let held = a.list(1);
            // a circle's founding block that states its parts binds its founder: it puts every part in her hand, and is her start for them
            // (06-circles C1; the owner's decision, 2026-11-20)
            if crate::js::type_of(d) == "actor"
                && crate::js::ss(d, "kind") == Some("circle")
                && crate::js::rs(d, "updates").is_none()
                && crate::js::rs(d, "as").is_none()
                && crate::js::rs(d, "author").is_some()
                && fold::circle::pack_of(d).is_some()
            {
                return Ok(Some(json!(true)));
            }
            match crate::js::rs(d, "as").filter(|c| !c.is_empty()) {
                // the owner's decision (2026-11-19): a draft signed `as` a circle answers as if her hand counts: true where her row would
                // hold. The draft is read as signed now, after every block held (its `after` the heads held, where it names no line).
                Some(c) => {
                    let mut x = d.clone();
                    if crate::js::rs(&x, "prev").is_none() && x["refs"].get("after").is_none() {
                        let heads: Vec<Value> = crate::order::heads_among(&held).iter().filter_map(|b| b.get("hash").cloned()).collect();
                        let mut heads: Vec<String> = heads.iter().filter_map(|h| h.as_str().map(String::from)).collect();
                        heads.sort();
                        if !heads.is_empty() {
                            x["refs"]["after"] = json!(heads);
                        }
                    }
                    let h = crate::block::rehash(&x);
                    x["hash"] = json!(h);
                    let c = c.to_string();
                    // (stage 7 compare, with the oracle) where her row would hold for it, or every owner signs it, and, for any but an
                    // accept, something of the circle's moves; an accept `as` a circle binds only where the row would hold
                    let index = crate::js::held_index(held.iter());
                    json!(fold::as_drafted(&h, || fold::circle::holds_in(&x, &c, &index) && (accepted || fold::gives(&x, &c, &held)["gives"].as_array().is_some_and(|g| !g.is_empty()))))
                }
                None if accepted => json!(true),
                None => {
                    let who = crate::js::rs(d, "author");
                    json!(who.is_some_and(|w| fold::gives(d, w, &held)["gives"].as_array().is_some_and(|g| !g.is_empty())))
                }
            }
        }
        "members_then" => json!(fold::members_then(a.v(0), a.s(1)?, &a.list(2))),
        // 1.9 stage 7 (Job C), readings (door.classes.reading): the read-back's answer, its text and the state an honest host signs; a renderer's
        // words; a second reader's redo (spec/readings/readback.md, spec/renderers/)
        "readback" => {
            let held = a.list(1);
            let block = match a.v(0) {
                Value::String(h) => held.iter().find(|b| b.get("hash").and_then(Value::as_str) == Some(h.as_str())).cloned(),
                v if v.is_object() && v.get("hash").is_some_and(Value::is_string) => Some(v.clone()),
                _ => None,
            }
            .ok_or_else(|| Fail::Argument("argument 0 is the block a read-back is for (a block, or its id among held)".into()))?;
            let to = match a.v(2) {
                Value::Null => None,
                Value::String(t) => Some(t.as_str()),
                _ => return Err(Fail::Argument("to is an id".into())),
            };
            let renderer = match a.v(3) {
                Value::Null => "en",
                Value::String(r) if r == "en" || r == "en-sms" => r.as_str(),
                _ => return Err(Fail::Argument("renderer is en or en-sms".into())),
            };
            let digits = match a.v(4) {
                Value::Null => None,
                Value::String(d) if !d.is_empty() && d.bytes().all(|c| c.is_ascii_digit()) => Some(d.clone()),
                v if v.is_u64() => Some(v.to_string()),
                _ => return Err(Fail::Argument("digits is text of digits, or a whole number".into())),
            };
            crate::readback::readback(&block, &held, to, renderer, digits.as_deref()).ok_or_else(|| Fail::Argument("renderer is en or en-sms".into()))?
        }
        "readback_redo" => {
            let rb = a.v(0);
            if !rb.get("state").is_some_and(Value::is_object) || !rb.get("refs").is_some_and(Value::is_object) {
                return Err(Fail::Argument("rb is an observe of kind readback".into()));
            }
            crate::readback::redo(rb, &a.list(1))
        }
        "render" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("answer is a readback reading's answer".into()));
            }
            json!(crate::readback::render(a.v(0), a.s(1)?).ok_or_else(|| Fail::Argument("renderer is en or en-sms".into()))?)
        }
        "where_now" => json!(fold::where_now(a.v(0), &a.list(1))),
        // 1.9 3c-6: `ownership` takes no clock (a reader's clock is a view's: `ownership_view`)
        // 1.9-GUESS [3c-6c]: a third argument is still taken and read as nothing, so callers that pass null keep working.
        "ownership" => fold::ownership_at(a.v(0), &a.list(1), ""),
        // 1.9 stage 5 (section 11): `ownership_view` takes no clock either (no condition reads one, 3c-6)
        "ownership_view" => fold::ownership_at(a.v(0), &a.list(1), ""),
        "made_from" => fold::made_from(a.v(0), &a.list(1)),
        // is a machine locked now (authority.md, A machine lock): { locked, locks, lifted }
        "machine_lock" => {
            if !a.v(0).is_object() {
                return Err(Fail::Argument("argument 0 is the machine (a thing block)".into()));
            }
            fold::machine_lock(a.v(0), &a.list(1), a.time_opt(2)?)
        }
        "shares_on" => fold::shares_on(a.v(0), &a.list(1)),
        "not_free_shown" => fold::not_free_shown(a.v(0), &a.list(1)),
        "invasion_shown" => fold::invasion_shown(a.v(0), &a.list(1)),
        "account_of" => fold::account_of(a.s(0)?, &a.list(1)),
        "release_shown" => fold::release_shown(a.v(0), &a.list(1)),
        // 1.9 3c-6: `pot` takes no clock
        "pot" => fold::pot(a.v(0), &a.list(1), ""),
        "use_shown" => fold::use_shown(a.v(0), &a.list(1), Some(a.v(2)).filter(|k| !k.is_null())),
        "receiver_of" => json!(fold::receiver_of(a.v(0), &a.list(1))),
        "owner_of" => json!(fold::owner_of(a.v(0), &a.list(1))),
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
            let held = if a.v(6).is_array() { Some(crate::js::held_index(a.list(6).iter())) } else { None };
            let choices = a.v(4);
            let cap = choices.get("cap").and_then(Value::as_u64).filter(|c| *c >= 1).ok_or_else(|| Fail::Argument("choices.cap is a whole number of at least 1: the node states the most blocks one answer carries".into()))?;
            let serves_pairs = choice_bool(choices, "serves_pairs", "whether the node sends the other half of a forked pair")?;
            sync::answer_pull(&log, a.v(1), a.s(2)?, a.opt(3), sync::PullChoices { cap, serves_pairs }, a.opt(5), held.as_ref(), a.suite(7)?, a.v(8).as_u64())?
        }
        "push_answer" => sync::push_answer_of(a.v(0), a.s(1)?, a.s(2)?, a.suite(3)?)?,
        "well_known" => sync::well_known(a.s(0)?, &a.strings(1), a.opt(2), a.v(3), a.opt(4)),
        // log_shown(receipts, request, answer, held) (nodes.md, The arrival log): { left_out, stopped_short }
        "log_shown" => sync::log_shown(&a.list(0), a.v(1), a.v(2), &held_of(&a.list(3))),
        // export_whole(document, log, last): whether her export is whole (nodes.md, A host): { whole, lacks }
        "export_whole" => sync::export_whole(a.v(0), a.s(1)?, a.s(2)?)?,
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
            let schemas = if a.v(3).is_array() { Some(&schemas) } else { None };
            // 1.9 stage 7 (A2): the node's admission rule for sealed copies (`choices.copies`) and the push (`{ signer?, for? }`)
            match (a.v(2).get("copies"), a.v(4)) {
                (None, Value::Null) => sync::accept(&a.list(0), &a.list(1), takes_pairs, schemas).to_json(),
                (rule, push) => sync::accept_copies(&a.list(0), &a.list(1), takes_pairs, schemas, push, rule.unwrap_or(&Value::Null)),
            }
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

/// `genesis(keys, { kind, at, audience, encryption_key, reach, clocks, salts?, nonce? })`, as fb_genesis takes it: `kind`, `at` and
/// `audience` are stated; `clocks` comes with `reach`.
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
            reach: field("reach").unwrap_or(""),
            clocks: o.get("clocks").filter(|k| !k.is_null()).cloned(),
        },
    )?)
}

/// An op asked from inside this crate, exactly as a caller asks it through the door: a reading reads the engine's own ops
/// (spec/readings/readback.md). An error is `None`.
pub(crate) fn ask(op: &str, args: Vec<Value>) -> Option<Value> {
    let a = Args(args, Default::default(), Default::default());
    match dispatch(op, &a) {
        Ok(v) if a.1.get().is_none() && a.2.borrow().is_none() => Some(v),
        _ => None,
    }
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
        Ok(Value::Array(list)) => Args(list, Default::default(), Default::default()),
        Ok(_) => return fail("argument", "args is a JSON array".into(), vec![]),
        Err(e) => return fail("json", format!("json: args: {e}"), vec![]),
    };
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| dispatch(op, &args))) {
        Ok(Ok(_)) if args.2.borrow().is_some() => fail("argument", format!("unknown_mount: {} is no mount of this door", args.2.borrow().clone().unwrap_or_default()), vec![]),
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

/// A block read from its bytes as they came (canonical.md, On the wire; core.md, section 8, checks 1 to 4): longer than `limits.block_bytes`
/// or opening more than `limits.depth` levels is `size_limit` and nothing else is read; bytes that are not exactly the canonical bytes of a
/// strict value `{ type, state, refs }` are `not_canonical`; else what checks 2 to 4 find. Each refusal names the bytes it refuses (canonical.md,
/// A refusal names bytes): `{ hash, code, detail }`, `hash` the SHA-256 of the bytes as they came.
fn strict_push(text: &str) -> Value {
    let sp = crate::spec();
    let limit = |name: &str, or: usize| crate::js::get(&sp.protocol, &format!("limits.{name}")).and_then(Value::as_u64).map_or(or, |n| n as usize);
    let hash = crate::block::hash_hex(text);
    let refuse = |code: &str, detail: String| json!({ "refused": { "hash": hash, "code": code, "detail": detail }, "messages": [] });
    if text.len() > limit("push_bytes", usize::MAX) {
        return refuse("size_limit", format!("a push is at most {} bytes", limit("push_bytes", 0)));
    }
    if crate::canonical::json_depth(text.as_bytes()) > crate::canonical::read_depth() {
        return refuse("size_limit", format!("a push opens at most {} levels", crate::canonical::read_depth()));
    }
    let push = match crate::canonical::parse_wire(text) {
        Ok(p) => p,
        Err(e) => return refuse("not_canonical", format!("the push is not canonical bytes of a strict value whole: {e}")),
    };
    if contains_null(&push) {
        return refuse("not_canonical", "a push holds no null".into());
    }
    let exact = push.as_object().is_some_and(|o| o.keys().all(|k| k == "messages" || k == "for"));
    let Some(messages) = push.get("messages").and_then(Value::as_array).filter(|_| exact) else {
        return refuse("not_canonical", "a push is exactly { messages, for }, `for` left out where it says nothing, messages a list".into());
    };
    if messages.len() > limit("push_messages", usize::MAX) {
        return refuse("size_limit", format!("a push carries at most {} messages", limit("push_messages", 0)));
    }
    json!({ "messages": messages.iter().map(|m| match m.get("block") {
        Some(b) => strict_text(&crate::canonical_json(b)),
        None => json!([]),
    }).collect::<Vec<_>>() })
}

fn contains_null(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::Array(a) => a.iter().any(contains_null),
        Value::Object(m) => m.values().any(contains_null),
        _ => false,
    }
}

fn strict_text(text: &str) -> Value {
    let sp = crate::spec();
    let seen = crate::block::hash_hex(text);
    let one = |code: &str, detail: String| json!([{ "hash": seen, "code": code, "detail": detail }]);
    if text.len() > sp.block_bytes || crate::canonical::json_depth(text.as_bytes()) > sp.depth {
        return one("size_limit", format!("a block's bytes are at most {} and open at most {} levels", sp.block_bytes, sp.depth));
    }
    let block = match crate::canonical::parse_wire(text) {
        Ok(b) => b,
        Err(e) => return one("not_canonical", e),
    };
    let whole = block.as_object().is_some_and(|o| o.len() == 3 && ["type", "state", "refs"].iter().all(|k| o.contains_key(*k)));
    if !whole {
        return one("not_canonical", "a block is exactly { type, state, refs }".into());
    }
    Value::Array(crate::valid::bytes_findings(&block).iter().map(|r| json!({ "hash": seen, "code": r.code, "detail": r.detail })).collect())
}

/// The blocks held as a reader holds them: a held header message `{ header, header_signature }` as its header entry, anything else as
/// itself, by hash.
fn held_of(list: &[Value]) -> crate::js::Index {
    index_of(list.iter().map(|h| if h.get("header").is_some() && h.get("type").is_none() { crate::valid::header_entry(h).unwrap_or(Value::Null) } else { h.clone() }).collect::<Vec<_>>().iter())
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
        !crate::check::write_refusals(type_name, &state, &refs, crate::CheckOptions { held: Some(&none), schemas: None }).is_empty()
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
}
