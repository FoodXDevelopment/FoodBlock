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
use crate::js::{index_of, text_or_empty};
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
struct Args(Vec<Value>);
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
    fn list(&self, i: usize) -> Vec<Value> {
        self.v(i).as_array().cloned().unwrap_or_default()
    }
    fn strings(&self, i: usize) -> Vec<String> {
        strings_of(self.v(i))
    }
}
fn strings_of(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| a.iter().map(|x| crate::js::text(Some(x))).collect())
        .unwrap_or_default()
}
fn keypair_of(v: &Value) -> crate::Keypair {
    crate::Keypair {
        suite: text_or_empty(v.get("suite")),
        public_key_sign: text_or_empty(v.get("public_key_sign")),
        private_key: text_or_empty(v.get("private_key")),
    }
}
fn chain_json(c: &crate::Chain) -> Value {
    json!({ "head": c.head.as_ref().map(|h| crate::js::hash_of(h)), "length": c.length, "gaps": c.gaps, "skips": c.skips, "equivocations": c.equivocations,
            "broken": c.broken, "ok": c.ok })
}

fn key_json(k: &crate::identity::KeyEntry) -> Value {
    json!({ "key": k.key, "by": k.by, "signer": k.signer, "void": k.void, "frozen": k.frozen, "suite": k.suite })
}
fn fixed_of(v: &Value) -> Option<crate::envelope::Fixed> {
    if !v.is_object() {
        return None;
    }
    let f = |k: &str| v.get(k).and_then(Value::as_str).map(String::from);
    Some(crate::envelope::Fixed {
        ephemeral: f("ephemeral"),
        content_key: f("contentKey"),
        nonce: f("nonce"),
        key_nonces: strings_of(v.get("keyNonces").unwrap_or(&Value::Null)),
    })
}

/// The arrival log as data: `{ hash: at }`, or null when the reader keeps none.
macro_rules! arrived {
    ($map:expr, $lookup:ident, $arrived:ident) => {
        let map: Value = $map.clone();
        let $lookup = |h: &str| map.get(h).and_then(Value::as_str).map(String::from);
        let $arrived: crate::identity::ArrivedAt = if map.is_object() { Some(&$lookup) } else { None };
    };
}

fn truthy_arg(v: &Value) -> bool {
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
        "canonical" => json!(crate::canonical(a.s(0)?, a.v(1), a.v(2))),
        "canonical_json" => json!(crate::canonical_json(a.v(0))),
        // The compact form (encoding.md): a signed public block as CBOR hex, and back. `short` uses the key table.
        // The id of a decoded block is the hash of its canonical JSON, never of the bytes.
        "cbor_encode" => json!(crate::block::hex(&crate::cbor::encode_message(a.v(0), truthy_arg(a.v(1)))?)),
        "cbor_decode" => crate::cbor::decode_message(&cbor_bytes(a.s(0)?)?)?,
        "cbor_encode_push" => json!(crate::block::hex(&crate::cbor::encode_push_with(crate::spec(), &a.list(0), truthy_arg(a.v(1)))?)),
        "cbor_decode_push" => Value::Array(crate::cbor::decode_push_with(crate::spec(), &cbor_bytes(a.s(0)?)?)?),
        "cbor_encode_header" => json!(crate::block::hex(&crate::cbor::encode_header_with(crate::spec(), a.v(0), truthy_arg(a.v(1)))?)),
        "cbor_decode_header" => crate::cbor::decode_header_with(crate::spec(), &cbor_bytes(a.s(0)?)?)?,
        // The id of a block, in the hash of a suite (default std).
        "hash" => json!(crate::hash_suite(a.opt(3).unwrap_or("std"), a.s(0)?, a.v(1), a.v(2))),
        "hash_hex" => json!(crate::hash_hex(a.s(0)?)),
        "hash_in" => json!(crate::hash_in(a.opt(1).unwrap_or("std"), a.s(0)?)),
        "create" => {
            let name = a.opt(0).filter(|t| !t.is_empty());
            crate::create_in(
                a.opt(3).unwrap_or("std"),
                name.ok_or_else(|| Error::new("FoodBlock: type is required and must be a string"))?,
                a.v(1),
                a.v(2),
            )?
        }
        // Signing: keypair(seed?, suite?), sign(block, private_key, suite?), verify(block, signature, public_key).
        "keypair" => match a.opt(0) {
            Some(seed) => crate::keypair_from_seed_in(a.opt(1).unwrap_or("std"), seed)?.to_json(),
            None => crate::sign::generate_keypair_in(a.opt(1).unwrap_or("std"))?.to_json(),
        },
        "public_key_of" => json!(crate::sign::public_key_in(a.opt(1).unwrap_or("std"), a.s(0)?)?),
        "sign" => json!(crate::sign_in(a.opt(2).unwrap_or("std"), a.v(0), a.s(1)?)?),
        "verify" => json!(crate::verify_in(&suite_of_key_arg(a.s(2)?), a.v(0), a.s(1)?, a.s(2)?)),
        "sign_message" => crate::sign::sign_message_in(a.opt(2).unwrap_or("std"), a.v(0), a.s(1)?)?,
        "verify_message" => json!(crate::sign::verify_message_in(&suite_of_key_arg(a.s(1)?), a.v(0), a.s(1)?)),
        "suite_of_key" => json!(crate::sign::suite_of_key(a.s(0)?)),
        "knows_suite" => json!(crate::sign::knows_suite(a.s(0)?)),
        // The commitment.
        "salted_hash" => json!(crate::salted_hash_in(a.opt(2).unwrap_or("std"), a.s(0)?, a.s(1)?)),
        "commit" => {
            let who = a.strings(0);
            let refs: Vec<&str> = who.iter().map(String::as_str).collect();
            let made = crate::commit_in(a.opt(2).unwrap_or("std"), &refs, a.v(1))?;
            json!({ "audience": made.audience, "salts": made.salts_json() })
        }
        "finds_self" => json!(crate::finds_self(a.v(0), a.s(1)?, a.s(2)?)),
        "reveal_for" => {
            let salts: Vec<(String, String)> = a
                .v(0)
                .as_object()
                .map(|m| m.iter().map(|(k, v)| (k.clone(), text_or_empty(Some(v)))).collect())
                .unwrap_or_default();
            crate::reveal_for(&crate::audience::Audience { audience: vec![], salts }, a.s(1)?)
        }
        "compose" => crate::compose(a.s(0)?, a.v(1), a.v(2), &compose_options(a.v(3)))?,
        "new_salt" => json!(crate::audience::try_new_salt()?),
        // The write check and the words it asks for.
        "check" => {
            let held = index_of(a.list(3).iter());
            let schemas = index_of(a.list(4).iter());
            let options = crate::CheckOptions {
                held: Some(&held),
                schemas: if a.v(4).is_array() { Some(&schemas) } else { None },
            };
            json!(crate::check(a.s(0)?, a.v(1), a.v(2), options))
        }
        "refusals" => {
            let held = index_of(a.list(3).iter());
            let schemas = index_of(a.list(4).iter());
            let options = crate::CheckOptions {
                held: Some(&held),
                schemas: if a.v(4).is_array() { Some(&schemas) } else { None },
            };
            Value::Array(crate::refusals(a.s(0)?, a.v(1), a.v(2), options).iter().map(|r| r.to_json()).collect())
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
        "confidence" => json!(crate::confidence(a.s(0)?)?),
        "terms" => crate::terms(a.v(0)),
        // The one predicate (core.md, section 8): valid(block, context) -> refusals (empty when valid).
        "valid" => {
            let held = index_of(a.list(1).iter());
            let schemas = index_of(a.list(2).iter());
            arrived!(a.v(3), lookup, at);
            Value::Array(
                crate::valid::valid(a.v(0), &held, if a.v(2).is_array() { Some(&schemas) } else { None }, at)
                    .iter()
                    .map(|r| r.to_json())
                    .collect(),
            )
        }
        // Strict writing from the bytes: JSON text with no repeated key, then the strict findings.
        "strict_text" => match crate::canonical::parse_strict(a.s(0)?) {
            Err(e) => json!([{ "code": "not_canonical", "detail": e }]),
            Ok(block) => {
                let none = Value::Null;
                let findings = crate::check::refusals(
                    crate::js::type_of(&block),
                    block.get("state").unwrap_or(&none),
                    block.get("refs").unwrap_or(&none),
                    crate::CheckOptions::default(),
                );
                Value::Array(findings.iter().map(|r| r.to_json()).collect())
            }
        },
        "receipt_code" => json!(crate::strangers::receipt_code(a.s(0)?)),
        "consent" => crate::strangers::consent(a.s(0)?, a.opt(1), &a.list(2)),
        "admission_refusals" => Value::Array(
            crate::strangers::admission_refusals(a.v(0), a.s(1)?, &a.list(2), a.v(3), a.v(4).as_u64().unwrap_or(0))
                .iter()
                .map(|r| r.to_json())
                .collect(),
        ),
        "live_grant" => json!(crate::views::live_grant(&a.list(1), a.s(2)?)),
        "due" => {
            arrived!(a.v(1), lookup, at);
            json!(crate::views::due(a.v(0), at))
        }
        "recovery_reach" => {
            arrived!(a.v(2), lookup, at);
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
            arrived!(a.v(2), lookup, at);
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
                .map(|k| crate::identity::KeyEntry {
                    key: text_or_empty(k.get("key")),
                    by: text_or_empty(k.get("by")),
                    signer: None,
                    void: false,
                    frozen: false,
                    suite: k.get("suite").and_then(Value::as_str).map(String::from).unwrap_or_else(|| "std".to_string()),
                })
                .collect();
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
        "unwrap" => crate::unwrap(a.v(0))?,
        "header" => crate::header(a.v(0)),
        "header_signed_by" => json!(crate::header_signed_by(a.v(0), a.s(1)?)),
        // Who someone is, and authority.
        "genesis" => genesis(a)?,
        "keys_of" => {
            arrived!(a.v(2), lookup, at);
            json!(crate::identity::keys_of(a.s(0)?, &a.list(1), at))
        }
        "key_timeline" => {
            arrived!(a.v(2), lookup, at);
            let keys = crate::identity::key_timeline(a.s(0)?, &a.list(1), at);
            Value::Array(keys.iter().map(key_json).collect())
        }
        "signed_by_author" => {
            arrived!(a.v(2), lookup, at);
            json!(crate::identity::signed_by_author(a.v(0), &a.list(1), at))
        }
        "spec" => json!({ "protocol": crate::spec().protocol }),
        "spec_list" => json!(crate::spec().list(a.s(0)?)),
        "add_duration" => json!(crate::time::add_duration(a.s(0)?, a.s(1)?, a.v(2).as_i64().unwrap_or(1))),
        "compare_durations" => json!(crate::time::compare_durations(a.s(0)?, a.s(1)?, a.s(2)?)),
        "types" => json!(crate::spec().types),
        "grammar" => json!(a.v(1).as_str().is_some_and(|t| crate::spec().is(a.opt(0).unwrap_or(""), t))),
        "recovery_key_hash" => json!(crate::identity::recovery_key_hash_in(a.opt(1).unwrap_or("std"), a.s(0)?)),
        "is_genesis" => json!(crate::identity::is_genesis(a.v(0))),
        "genesis_opens" => json!(crate::identity::genesis_opens(if a.v(0).is_null() { None } else { Some(a.v(0)) })),
        // key_grant(id, new_key, signer { private_key, last, brought_in, recovery_key },
        //           { replaces, counted_to, at, after, encrypt, recovery: { key, reach }, custodian })
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
            let recovery = o.get("recovery").filter(|r| r.is_object());
            let recovery = recovery.map(|r| (text_or_empty(r.get("key")), text_or_empty(r.get("reach"))));
            let extras = crate::identity::KeyGrantExtras {
                replaces: replaces.as_deref(),
                counted_to: counted_to.as_deref(),
                after: &after,
                encrypt: encrypt.as_deref(),
                recovery: recovery.as_ref().map(|(k, r)| (k.as_str(), r.as_str())),
                custodian: custodian.as_deref(),
                suite: suite.as_deref(),
                signer_suite: signer_suite.as_deref(),
                skip: o.get("skip").and_then(Value::as_bool).unwrap_or(false),
            };
            let at = field(o, "at").unwrap_or_else(crate::time::now);
            crate::identity::key_grant_with(
                a.s(0)?,
                a.opt(1),
                &text_or_empty(signer.get("private_key")),
                &place,
                &at,
                field(signer, "recovery_key").as_deref(),
                &extras,
            )?
        }
        "identity_state" => {
            arrived!(a.v(2), lookup, at);
            crate::identity::identity_state(a.s(0)?, &a.list(1), at).to_json()
        }
        "counts" => json!(crate::identity::counts_in(a.v(0), &index_of(a.list(1).iter()))),
        "forked" => json!(crate::identity::forked(a.v(0), &a.list(1))),
        "fork_pairs" => json!(crate::identity::fork_pairs_in(&index_of(a.list(0).iter()))),
        "next_link_for" => crate::identity::next_link_for(a.s(0)?, a.s(1)?, &a.list(2))?.to_json(),
        "is_live" => json!(crate::grant::is_live(a.v(0), &a.list(1), a.opt(2))),
        "ancestors" => json!(crate::grant::ancestors(a.v(0), &a.list(1))),
        "within_limit" => json!(crate::grant::within_limit(a.v(0), a.v(1), a.v(2).as_i64().unwrap_or(0))),
        "limit_fence" => crate::grant::limit_fence(a.s(0)?, a.s(1)?, a.v(2), a.opt(3)),
        "recipients_of" => json!(crate::sync::recipients_of(a.v(0), a.s(1)?)),
        // The one-time converter for pre-1.6 data: convert(oldBlocks, { keys, at, map, existing, channel, request_hash }).
        #[cfg(feature = "legacy")]
        "convert" => {
            let o = a.v(1);
            let options = crate::legacy::ConvertOptions {
                keys: o.get("keys").and_then(Value::as_object).cloned().unwrap_or_default(),
                at: text_or_empty(o.get("at")),
                map: o.get("map").and_then(Value::as_object).cloned().unwrap_or_default(),
                existing: o.get("existing").and_then(Value::as_array).cloned().unwrap_or_default(),
                channel: text_or_empty(o.get("channel")),
                request_hash: text_or_empty(o.get("request_hash")),
                aliases: o.get("aliases").filter(|v| v.is_object()).cloned(),
            };
            let done = crate::legacy::convert(&a.list(0), &options)?;
            json!({
                "blocks": done.blocks, "map": done.map,
                "skipped": done.skipped.iter().map(|(h, why)| json!({ "hash": h, "why": why })).collect::<Vec<_>>(),
            })
        }
        #[cfg(feature = "legacy")]
        "old_hash" => json!(crate::legacy::old_hash(a.v(0))),
        "reading_condition_holds" => json!(crate::tasks::reading_condition_holds(a.v(0), &a.list(1), a.s(2)?)),
        "children_of" => json!(crate::tasks::children_of(a.s(0)?, &a.list(1))),
        "why_not_live_undo" => json!(crate::grant::why_not_live_undo(a.v(0), &index_of(a.list(1).iter()))),
        "act_name" => json!(crate::grant::act_name(a.v(0))),
        "reading_is_persons_claim" => json!(crate::strangers::reading_is_persons_claim(a.v(0), a.s(1)?, &a.list(2))),
        "residency_refusals" => Value::Array(
            crate::profiles::residency_refusals(a.v(0), &a.strings(1)).iter().map(|r| r.to_json()).collect(),
        ),
        #[cfg(feature = "deposits")]
        "deposit_shape_ok" => json!(crate::profiles::deposit_shape_ok(a.v(0))),
        #[cfg(feature = "deposits")]
        "deposit_paid" => json!(crate::profiles::deposit_paid(a.v(0), a.v(1), &a.list(2))),
        "scope_within" => json!(crate::grant::scope_within(a.v(0), a.v(1))),
        "scope_refusals" => Value::Array(crate::grant::scope_refusals(a.v(0), a.v(1)).iter().map(|r| r.to_json()).collect()),
        "operators_of" => json!(crate::grant::operators_of(a.s(0)?, &a.list(1), a.opt(2))),
        "why_not_under" => json!(crate::grant::why_not_under(a.v(0), &a.list(1), a.opt(2))),
        "why_not_live" => json!(crate::grant::why_not_live(a.v(0), &a.list(1), a.opt(2))),
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
        "seal" => crate::envelope::seal_with(a.v(0), &refs, a.opt(2).unwrap_or("std"), fixed_of(a.v(3)).as_ref())?,
        "open" => crate::open(a.v(0), a.s(1)?)?,
        "seal_copy" => crate::seal_copy(a.v(0), &refs, a.v(2), a.s(3)?, fixed_of(a.v(4)).as_ref(), a.opt(5).unwrap_or("std"))?,
        "open_copy" => crate::open_copy(a.v(0), a.s(1)?)?,
        "encryption_keypair" => crate::envelope::generate_encryption_keypair_in(a.opt(0).unwrap_or("std"))?,
        "encryption_key_of" => json!(crate::envelope::encryption_key_in(a.opt(1).unwrap_or("std"), a.s(0)?)?),
        _ => return Ok(None),
    }))
}

#[cfg(feature = "folds")]
fn folds(op: &str, a: &Args) -> core::result::Result<Option<Value>, Fail> {
    use crate::fold;
    Ok(Some(match op {
        "promise_stage" => {
            let o = a.v(2);
            let options = fold::StageOptions {
                confirmers: strings_of(o.get("confirmers").unwrap_or(&Value::Null)),
                ..Default::default()
            };
            fold::promise_stage(a.v(0), &a.list(1), &options)
        }
        "promise_view" => {
            let o = a.v(2);
            crate::views::promise_view(
                a.v(0),
                &a.list(1),
                o.get("now").and_then(Value::as_str),
                strings_of(o.get("confirmers").unwrap_or(&Value::Null)),
            )
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
            let o = fold::ownership(a.v(0), &a.list(1));
            json!({ "owner": o.owner, "transfers": o.transfers, "conflict": o.conflict })
        }
        "receiver_of" => json!(fold::receiver_of(a.v(0), &a.list(1))),
        "orderer_of" => fold::orderer_of(a.v(0)),
        "owner_of" => json!(fold::owner_of(a.v(0), &a.list(1))),
        #[cfg(feature = "successor")]
        "successor_state" | "successor_view" => {
            arrived!(a.v(3), lookup, at);
            fold::successor_state(a.v(0), &a.list(1), a.opt(2), at)
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
                suite: field("suite").unwrap_or("std"),
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
        "pull_errors" => with_fresh!(a.v(1), |f| json!(sync::pull_errors(a.v(0), &f))),
        "push_errors" => with_fresh!(a.v(1), |f| json!(sync::push_errors(a.v(0), &f))),
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
            sync::answer_pull(&log, a.v(1), a.s(2)?, a.opt(3), a.v(4).as_u64().unwrap_or(500), a.opt(5), held.as_ref(), a.opt(7).unwrap_or("std"))?
        }
        "push_answer" => sync::push_answer_of(a.v(0), a.s(1)?, a.s(2)?, a.opt(3).unwrap_or("std"))?,
        "well_known" => {
            let admission = a.opt(3);
            sync::well_known(a.s(0)?, &a.strings(1), &a.strings(2), admission, a.v(4))
        }
        "waited_too_long" => json!(sync::waited_too_long(a.s(0)?, a.s(1)?, a.v(2).as_i64().unwrap_or(0))),
        "matches" => {
            let held = index_of(a.list(2).iter());
            json!(sync::matches(a.v(0), a.v(1), &held))
        }
        "heads_of" => json!(sync::heads_of(&a.list(0))),
        "accept" => {
            arrived!(a.v(2), lookup, at);
            let schemas = index_of(a.list(3).iter());
            sync::accept(&a.list(0), &a.list(1), at, if a.v(3).is_array() { Some(&schemas) } else { None })
                .to_json()
        }
        "answer_signed_by" => json!(sync::answer_signed_by(a.v(0), &a.strings(1))),
        "well_known_errors" => json!(sync::well_known_errors(a.v(0))),
        "announcement" => sync::announcement(a.v(0)),
        _ => return Ok(None),
    }))
}

/// The options `compose` and `write` share: author, audience, after, at, link, salts, nonce.
fn compose_options(o: &Value) -> crate::ComposeOptions {
    let link = o.get("link").filter(|l| l.is_object()).map(|l| Link {
        seq: l.get("seq").and_then(Value::as_i64).unwrap_or(0),
        prev: text_or_empty(l.get("prev")),
    });
    crate::ComposeOptions {
        author: text_or_empty(o.get("author")),
        suite: text_or_empty(o.get("suite")),
        skip: o.get("skip").and_then(Value::as_bool).unwrap_or(false),
        audience: strings_of(o.get("audience").unwrap_or(&Value::Null)),
        after: strings_of(o.get("after").unwrap_or(&Value::Null)),
        at: o.get("at").and_then(Value::as_str).map(String::from),
        clockless: o.get("clockless").and_then(Value::as_bool).unwrap_or(false),
        link,
        salts: o.get("salts").cloned().unwrap_or(Value::Null),
        nonce: o.get("nonce").and_then(Value::as_str).map(String::from),
    }
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
        compose: compose_options(o),
        key: Some(&pair),
        held: &held,
        schemas: o.get("schemas").map(|_| &schemas),
    };
    Ok(crate::write(a.s(0)?, a.v(1), a.v(2), &options)?)
}

/// `genesis(keys, { kind, at, encryption_key, recovery_key, reach, recovery_suite, custodian })`, as fb_genesis takes it.
fn genesis(a: &Args) -> Out {
    let pair = keypair_of(a.v(0));
    let o = a.v(1);
    let field = |k: &str| o.get(k).and_then(Value::as_str);
    let at = field("at").map(String::from).unwrap_or_else(crate::time::now);
    Ok(crate::identity::genesis(
        &pair,
        &crate::identity::GenesisOptions {
            kind: field("kind").unwrap_or("person"),
            at,
            encryption_key: field("encryption_key").unwrap_or(""),
            recovery_key: field("recovery_key").unwrap_or(""),
            reach: field("reach").unwrap_or(""),
            recovery_suite: field("recovery_suite").unwrap_or(""),
            custodian: field("custodian").unwrap_or(""),
        },
    )?)
}

fn suite_of_key_arg(key: &str) -> String {
    crate::sign::suite_of_key(key).unwrap_or_else(|| "std".to_string())
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
    let args = match serde_json::from_slice::<Value>(args) {
        Ok(Value::Array(list)) => Args(list),
        Ok(_) => return fail("argument", "args is a JSON array".into(), vec![]),
        Err(e) => return fail("json", format!("json: args: {e}"), vec![]),
    };
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| dispatch(op, &args))) {
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
