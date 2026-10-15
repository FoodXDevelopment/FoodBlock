//! The JNI door, for Kotlin on the JVM and on Android (sdk/kotlin). One native function, one data shape:
//!
//!     world.foodx.foodblock.Native.call(op: ByteArray, args: ByteArray): ByteArray
//!
//! `op` is a name (UTF-8), `args` a JSON array (UTF-8), and the answer is JSON: `{ "ok": value }`, or
//! `{ "error": kind, "message", "code", "reasons", "refusals" }` where kind is `argument`, `json`, `refused`, `crypto`, `profile` or
//! `internal`. Bytes, not Java strings, so text crosses exactly as UTF-8. Every op is a thin call into this crate:
//! there is no second implementation here, only the names. An op this build's profile leaves out says `profile`.
#![allow(clippy::needless_pass_by_value)]
use crate::chain::Link;
use crate::error::Error;
use crate::js::{index_of, text_or_empty};
use crate::prelude::*;
use ::jni::objects::{JByteArray, JClass};
use ::jni::sys::jbyteArray;
use ::jni::JNIEnv;

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
        public_key_sign: text_or_empty(v.get("public_key_sign")),
        private_key: text_or_empty(v.get("private_key")),
    }
}
fn chain_json(c: &crate::Chain) -> Value {
    json!({ "head": c.head, "length": c.length, "gaps": c.gaps, "equivocations": c.equivocations,
            "broken": c.broken, "ok": c.ok })
}

/// The arrival log as data: `{ hash: at }`, or null when the reader keeps none.
macro_rules! arrived {
    ($map:expr, $lookup:ident, $arrived:ident) => {
        let map: Value = $map.clone();
        let $lookup = |h: &str| map.get(h).and_then(Value::as_str).map(String::from);
        let $arrived: crate::identity::ArrivedAt = if map.is_object() { Some(&$lookup) } else { None };
    };
}

fn dispatch(op: &str, a: &Args) -> Out {
    Ok(match op {
        "version" => json!(crate::VERSION),
        "profiles" => json!(crate::profiles()),
        // A block: its canonical form and its id.
        "canonical" => json!(crate::canonical(a.s(0)?, a.v(1), a.v(2))),
        "canonical_json" => json!(crate::canonical_json(a.v(0))),
        "hash" => json!(crate::hash(a.s(0)?, a.v(1), a.v(2))),
        "hash_hex" => json!(crate::hash_hex(a.s(0)?)),
        "create" => crate::create(a.s(0)?, a.v(1), a.v(2))?,
        // Signing.
        "keypair" => match a.opt(0) {
            Some(seed) => crate::keypair_from_seed(seed)?.to_json(),
            None => crate::generate_keypair()?.to_json(),
        },
        "public_key_of" => json!(crate::sign::public_key_of(a.s(0)?)?),
        "sign" => json!(crate::sign(a.v(0), a.s(1)?)?),
        "verify" => json!(crate::verify(a.v(0), a.s(1)?, a.s(2)?)),
        "sign_message" => crate::sign_message(a.v(0), a.s(1)?)?,
        "verify_message" => json!(crate::verify_message(a.v(0), a.s(1)?)),
        // The commitment.
        "salted_hash" => json!(crate::salted_hash(a.s(0)?, a.s(1)?)),
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
        "money" => crate::money(
            a.v(0).as_i64().ok_or_else(|| Fail::Argument("minor is a whole number".into()))?,
            a.s(1)?,
        ),
        "confidence" => json!(crate::confidence(a.s(0)?)?),
        "terms" => crate::terms(a.v(0)),
        // Reading every earlier shape as 1.6.
        "read_as" => crate::read_as(a.v(0)),
        "is_a" => json!(crate::is_a(a.v(0), a.s(1)?, a.opt(2))),
        // Chains and causal order.
        "next_link" => {
            let last = a.v(0);
            crate::next_link(if last.is_null() { None } else { Some(last) }, a.opt(1))?.to_json()
        }
        "check_chain" => chain_json(&crate::check_chain(&a.list(0), a.s(1)?)),
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
            Value::Array(
                keys.iter()
                    .map(|k| json!({ "key": k.key, "by": k.by, "signer": k.signer, "void": k.void, "frozen": k.frozen }))
                    .collect(),
            )
        }
        "signed_by_author" => {
            arrived!(a.v(2), lookup, at);
            json!(crate::identity::signed_by_author(a.v(0), &a.list(1), at))
        }
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
        "foodblock: {op} is not in this build (profiles: {})",
        crate::profiles().join(", ")
    )))
}

#[cfg(feature = "envelope")]
fn envelope(op: &str, a: &Args) -> core::result::Result<Option<Value>, Fail> {
    let keys = a.strings(1);
    let refs: Vec<&str> = keys.iter().map(String::as_str).collect();
    Ok(Some(match op {
        "seal" => crate::seal(a.v(0), &refs)?,
        "open" => crate::open(a.v(0), a.s(1)?)?,
        "seal_copy" => crate::seal_copy(a.v(0), &refs, a.v(2), a.s(3)?, None)?,
        "open_copy" => crate::open_copy(a.v(0), a.s(1)?)?,
        "encryption_keypair" => crate::generate_encryption_keypair()?,
        "encryption_key_of" => json!(crate::encryption_key_of(a.s(0)?)?),
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
                now: o.get("now").and_then(Value::as_str),
                confirmers: strings_of(o.get("confirmers").unwrap_or(&Value::Null)),
            };
            fold::promise_stage(a.v(0), &a.list(1), &options)
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
        "owner_of" => json!(fold::owner_of(a.v(0), &a.list(1))),
        "successor_state" => {
            arrived!(a.v(3), lookup, at);
            fold::successor_state(a.v(0), &a.list(1), a.opt(2), at)
        }
        "counted_in" => json!(fold::counted_in(a.v(0), a.s(1)?, a.s(2)?)),
        "circle_key" => fold::circle_key(a.s(0)?, &a.list(1)),
        _ => return Ok(None),
    }))
}

#[cfg(feature = "sync")]
fn sync(op: &str, a: &Args) -> core::result::Result<Option<Value>, Fail> {
    use crate::sync;
    let fresh = |f: &dyn Fn(&sync::Freshness) -> Vec<String>| -> core::result::Result<Value, Fail> {
        let o = a.v(1);
        let keys = strings_of(o.get("keys").unwrap_or(&Value::Null));
        let seen = strings_of(o.get("seen").unwrap_or(&Value::Null));
        let seen_fn = |n: &str| seen.iter().any(|s| s == n);
        Ok(json!(f(&sync::Freshness {
            node: o.get("node").and_then(Value::as_str).unwrap_or(""),
            now: o.get("now").and_then(Value::as_str).unwrap_or(""),
            keys: &keys,
            seen: &seen_fn,
            window_ms: o.get("window_ms").and_then(Value::as_i64).unwrap_or(5 * 60 * 1000),
        })))
    };
    Ok(Some(match op {
        "accept" => {
            arrived!(a.v(2), lookup, at);
            let schemas = index_of(a.list(3).iter());
            sync::accept(&a.list(0), &a.list(1), at, if a.v(3).is_array() { Some(&schemas) } else { None })
                .to_json()
        }
        "pull_errors" => fresh(&|f| sync::pull_errors(a.v(0), f))?,
        "push_errors" => fresh(&|f| sync::push_errors(a.v(0), f))?,
        "answer_signed_by" => json!(sync::answer_signed_by(a.v(0), &a.strings(1))),
        "well_known_errors" => json!(sync::well_known_errors(a.v(0))),
        "announcement" => sync::announcement(a.v(0)),
        _ => return Ok(None),
    }))
}

/// `write(type, state, refs, options)`, options as the C ABI's fb_write takes them.
fn write(a: &Args) -> Out {
    let o = a.v(3);
    let key = o
        .get("key")
        .filter(|k| k.is_object())
        .ok_or_else(|| Fail::Argument("options.key is { public_key_sign, private_key }".into()))?;
    let pair = keypair_of(key);
    let link = o.get("link").filter(|l| l.is_object()).map(|l| Link {
        seq: l.get("seq").and_then(Value::as_i64).unwrap_or(0),
        prev: text_or_empty(l.get("prev")),
    });
    let list = |k: &str| o.get(k).and_then(Value::as_array).cloned().unwrap_or_default();
    let held = list("held");
    let schemas = index_of(list("schemas").iter());
    let options = crate::WriteOptions {
        compose: crate::ComposeOptions {
            author: text_or_empty(o.get("author")),
            audience: strings_of(o.get("audience").unwrap_or(&Value::Null)),
            after: strings_of(o.get("after").unwrap_or(&Value::Null)),
            at: o.get("at").and_then(Value::as_str).map(String::from),
            link,
            salts: o.get("salts").cloned().unwrap_or(Value::Null),
            nonce: o.get("nonce").and_then(Value::as_str).map(String::from),
        },
        key: Some(&pair),
        held: &held,
        schemas: o.get("schemas").map(|_| &schemas),
    };
    Ok(crate::write(a.s(0)?, a.v(1), a.v(2), &options)?)
}

/// `genesis(keys, { kind, at, encryption_key, recovery_key, reach })`, as fb_genesis takes it.
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
            reach: field("reach").unwrap_or("P30D"),
        },
    )?)
}

fn answer(op: &[u8], args: &[u8]) -> Value {
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

/// `world.foodx.foodblock.Native.call(op, args)`. Never throws into the JVM: every failure is an answer.
#[no_mangle]
pub extern "system" fn Java_world_foodx_foodblock_Native_call<'l>(
    env: JNIEnv<'l>,
    _class: JClass<'l>,
    op: JByteArray<'l>,
    args: JByteArray<'l>,
) -> jbyteArray {
    let op = env.convert_byte_array(&op).unwrap_or_default();
    let args = env.convert_byte_array(&args).unwrap_or_default();
    let out = answer(&op, &args).to_string();
    match env.byte_array_from_slice(out.as_bytes()) {
        Ok(a) => a.into_raw(),
        Err(_) => core::ptr::null_mut(),
    }
}
