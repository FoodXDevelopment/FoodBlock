//! The C ABI (include/foodblock.h): a small, stable surface, JSON in and JSON out as NUL-terminated UTF-8.
//!
//! Every function returns a status (`FB_OK` is 0). On success `*out` holds the answer; on failure it holds the reason
//! in plain words. Either way the caller frees `*out` with `fb_free`. Nothing panics across the boundary.
#![allow(clippy::missing_safety_doc)]
use crate::chain::Link;
use crate::error::Error;
use crate::js::index_of;
use crate::prelude::*;
use core::ffi::{c_char, c_int};
use std::ffi::{CStr, CString};

pub const FB_OK: c_int = 0;
/// A pointer was null, or text was not UTF-8.
pub const FB_ERR_ARGUMENT: c_int = 1;
/// The JSON could not be read.
pub const FB_ERR_JSON: c_int = 2;
/// The write check refused the block (`*out` is a JSON array of refusals, `[{ code, detail }]`).
pub const FB_ERR_REFUSED: c_int = 3;
/// A key, signature or envelope was wrong.
pub const FB_ERR_CRYPTO: c_int = 4;
/// A bug: the call stopped before it finished.
pub const FB_ERR_INTERNAL: c_int = 5;

enum Fail {
    Argument(String),
    Json(String),
    Refused(Vec<Value>),
    Crypto(String),
}
impl From<Error> for Fail {
    fn from(e: Error) -> Self {
        if !e.refusals.is_empty() {
            Fail::Refused(e.refusals.iter().map(|r| r.to_json()).collect())
        } else if e.message.starts_with("json") {
            Fail::Json(e.message)
        } else {
            Fail::Crypto(e.message)
        }
    }
}
type Out = core::result::Result<String, Fail>;

unsafe fn text<'a>(p: *const c_char, what: &str) -> core::result::Result<&'a str, Fail> {
    if p.is_null() {
        return Err(Fail::Argument(format!("{what} is null")));
    }
    CStr::from_ptr(p)
        .to_str()
        .map_err(|_| Fail::Argument(format!("{what} is not UTF-8")))
}
unsafe fn json_arg(p: *const c_char, what: &str) -> core::result::Result<Value, Fail> {
    let t = text(p, what)?;
    serde_json::from_str(t).map_err(|e| Fail::Json(format!("{what}: {e}")))
}
unsafe fn json_or_null(p: *const c_char, what: &str) -> core::result::Result<Value, Fail> {
    if p.is_null() {
        Ok(Value::Null)
    } else {
        json_arg(p, what)
    }
}

fn put(out: *mut *mut c_char, s: String) {
    if out.is_null() {
        return;
    }
    let c = CString::new(s.replace('\0', "")).unwrap_or_default();
    unsafe { *out = c.into_raw() };
}

fn run(out: *mut *mut c_char, f: impl FnOnce() -> Out) -> c_int {
    if !out.is_null() {
        unsafe { *out = core::ptr::null_mut() };
    }
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(Ok(s)) => {
            put(out, s);
            FB_OK
        }
        Ok(Err(Fail::Argument(m))) => {
            put(out, m);
            FB_ERR_ARGUMENT
        }
        Ok(Err(Fail::Json(m))) => {
            put(out, m);
            FB_ERR_JSON
        }
        Ok(Err(Fail::Refused(r))) => {
            put(out, json!(r).to_string());
            FB_ERR_REFUSED
        }
        Ok(Err(Fail::Crypto(m))) => {
            put(out, m);
            FB_ERR_CRYPTO
        }
        Err(_) => {
            put(out, "foodblock: an internal error stopped the call".into());
            FB_ERR_INTERNAL
        }
    }
}

fn parts(block: &Value) -> (String, Value, Value) {
    (
        crate::js::type_of(block).to_string(),
        block.get("state").cloned().unwrap_or(json!({})),
        block.get("refs").cloned().unwrap_or(json!({})),
    )
}

/// Free text this library returned. Null is fine.
#[no_mangle]
pub unsafe extern "C" fn fb_free(s: *mut c_char) {
    if !s.is_null() {
        drop(CString::from_raw(s));
    }
}

/// The protocol version this library writes ("1.6").
#[no_mangle]
pub unsafe extern "C" fn fb_version(out: *mut *mut c_char) -> c_int {
    run(out, || Ok(crate::VERSION.to_string()))
}

/// The canonical string of a block `{ type, state, refs }`.
#[no_mangle]
pub unsafe extern "C" fn fb_canonical(block_json: *const c_char, out: *mut *mut c_char) -> c_int {
    run(out, || {
        let (t, s, r) = parts(&json_arg(block_json, "block")?);
        Ok(crate::canonical(&t, &s, &r))
    })
}

/// A block's id: SHA-256 of its canonical form, hex.
#[no_mangle]
pub unsafe extern "C" fn fb_hash(block_json: *const c_char, out: *mut *mut c_char) -> c_int {
    run(out, || {
        let (t, s, r) = parts(&json_arg(block_json, "block")?);
        Ok(crate::hash(&t, &s, &r))
    })
}

/// The signing key a 32-byte seed (hex) gives: `{ public_key_sign, private_key }`. With a null seed, a new random key.
#[no_mangle]
pub unsafe extern "C" fn fb_keypair(seed_hex: *const c_char, out: *mut *mut c_char) -> c_int {
    run(out, || {
        let pair = if seed_hex.is_null() {
            crate::generate_keypair()?
        } else {
            crate::keypair_from_seed(text(seed_hex, "seed")?)?
        };
        Ok(pair.to_json().to_string())
    })
}

/// A genesis, signed. `keys_json` is `{ public_key_sign, private_key }`; `options_json` is `{ kind, at,
/// encryption_key, recovery_key, reach }` (`at` defaults to now, `reach` to P30D).
#[no_mangle]
pub unsafe extern "C" fn fb_genesis(
    keys_json: *const c_char,
    options_json: *const c_char,
    out: *mut *mut c_char,
) -> c_int {
    run(out, || {
        let keys = json_arg(keys_json, "keys")?;
        let o = json_arg(options_json, "options")?;
        let pair = crate::Keypair {
            public_key_sign: crate::js::text_or_empty(keys.get("public_key_sign")),
            private_key: crate::js::text_or_empty(keys.get("private_key")),
        };
        let at = o
            .get("at")
            .and_then(Value::as_str)
            .map(String::from)
            .unwrap_or_else(crate::time::now);
        let g = crate::identity::genesis(
            &pair,
            &crate::identity::GenesisOptions {
                kind: o.get("kind").and_then(Value::as_str).unwrap_or("person"),
                at,
                encryption_key: o
                    .get("encryption_key")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
                recovery_key: o.get("recovery_key").and_then(Value::as_str).unwrap_or(""),
                reach: o.get("reach").and_then(Value::as_str).unwrap_or("P30D"),
                custodian: o.get("custodian").and_then(Value::as_str).unwrap_or(""),
            },
        )?;
        Ok(g.to_string())
    })
}

/// The author's signature over a block's canonical form, hex.
#[no_mangle]
pub unsafe extern "C" fn fb_sign(
    block_json: *const c_char,
    private_key: *const c_char,
    out: *mut *mut c_char,
) -> c_int {
    run(out, || {
        Ok(crate::sign(
            &json_arg(block_json, "block")?,
            text(private_key, "private_key")?,
        )?)
    })
}

/// Whether a signature is this key's over exactly this block: `*out` is "true" or "false".
#[no_mangle]
pub unsafe extern "C" fn fb_verify(
    block_json: *const c_char,
    signature: *const c_char,
    public_key: *const c_char,
    out: *mut *mut c_char,
) -> c_int {
    run(out, || {
        let ok = crate::verify(
            &json_arg(block_json, "block")?,
            text(signature, "signature")?,
            text(public_key, "public_key")?,
        );
        Ok(ok.to_string())
    })
}

fn held_of(options: &Value, key: &str) -> Vec<Value> {
    options
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

/// What is wrong with a block, as every node checks it before writing: `*out` is a JSON array of reasons ("[]" when
/// it is well-formed). `options_json` (may be null): `{ held: [blocks], schemas: [schema blocks] }`.
#[no_mangle]
pub unsafe extern "C" fn fb_check(
    block_json: *const c_char,
    options_json: *const c_char,
    out: *mut *mut c_char,
) -> c_int {
    run(out, || {
        let (t, s, r) = parts(&json_arg(block_json, "block")?);
        let o = json_or_null(options_json, "options")?;
        let held = index_of(held_of(&o, "held").iter());
        let schemas = index_of(held_of(&o, "schemas").iter());
        let options = crate::CheckOptions {
            held: Some(&held),
            schemas: o.get("schemas").map(|_| &schemas),
        };
        Ok(json!(crate::check(&t, &s, &r, options)).to_string())
    })
}

/// Why every node refuses a block: `*out` is a JSON array `[{ code, detail }]`, one entry per rule found, codes from
/// protocol.json `refusals.codes.block` in its order ("[]" when it is well-formed). `options_json` as for `fb_check`.
#[no_mangle]
pub unsafe extern "C" fn fb_refusals(
    block_json: *const c_char,
    options_json: *const c_char,
    out: *mut *mut c_char,
) -> c_int {
    run(out, || {
        let (t, s, r) = parts(&json_arg(block_json, "block")?);
        let o = json_or_null(options_json, "options")?;
        let held = index_of(held_of(&o, "held").iter());
        let schemas = index_of(held_of(&o, "schemas").iter());
        let options = crate::CheckOptions {
            held: Some(&held),
            schemas: o.get("schemas").map(|_| &schemas),
        };
        let found: Vec<Value> = crate::refusals(&t, &s, &r, options)
            .iter()
            .map(|one| one.to_json())
            .collect();
        Ok(json!(found).to_string())
    })
}

/// A block of any earlier shape, read as 1.6 (aliases.json).
#[no_mangle]
pub unsafe extern "C" fn fb_read_as(block_json: *const c_char, out: *mut *mut c_char) -> c_int {
    run(out, || {
        Ok(crate::read_as(&json_arg(block_json, "block")?).to_string())
    })
}

/// Where a key's next block goes: `{ seq, prev }`. `last_json` is the key's latest block (or null); with none,
/// `brought_in` is the hash of the genesis or key grant that brought the key in.
#[no_mangle]
pub unsafe extern "C" fn fb_next_link(
    last_json: *const c_char,
    brought_in: *const c_char,
    out: *mut *mut c_char,
) -> c_int {
    run(out, || {
        let last = json_or_null(last_json, "last")?;
        let brought = if brought_in.is_null() {
            None
        } else {
            Some(text(brought_in, "brought_in")?)
        };
        Ok(
            crate::next_link(if last.is_null() { None } else { Some(&last) }, brought)?
                .to_json()
                .to_string(),
        )
    })
}

/// The one way to write: compose, check, sign, chain. `options_json`: `{ author, key: { public_key_sign,
/// private_key }, held: [the author's genesis, key grants and blocks], at, audience: [recipients], after: [heads],
/// link: { seq, prev }, salts, nonce }`. `*out` is the signed block; on refusal (`FB_ERR_REFUSED`) the refusals,
/// `[{ code, detail }]`.
#[no_mangle]
pub unsafe extern "C" fn fb_write(
    type_name: *const c_char,
    state_json: *const c_char,
    refs_json: *const c_char,
    options_json: *const c_char,
    out: *mut *mut c_char,
) -> c_int {
    run(out, || {
        let t = text(type_name, "type")?;
        let state = json_or_null(state_json, "state")?;
        let refs = json_or_null(refs_json, "refs")?;
        let o = json_arg(options_json, "options")?;
        let strings = |k: &str| -> Vec<String> {
            o.get(k)
                .and_then(Value::as_array)
                .map(|a| a.iter().map(|x| crate::js::text(Some(x))).collect())
                .unwrap_or_default()
        };
        let key = o.get("key").ok_or_else(|| {
            Fail::Argument("options.key is { public_key_sign, private_key }".into())
        })?;
        let pair = crate::Keypair {
            public_key_sign: crate::js::text_or_empty(key.get("public_key_sign")),
            private_key: crate::js::text_or_empty(key.get("private_key")),
        };
        let link = o.get("link").filter(|l| l.is_object()).map(|l| Link {
            seq: l.get("seq").and_then(Value::as_i64).unwrap_or(0),
            prev: crate::js::text_or_empty(l.get("prev")),
        });
        let held = held_of(&o, "held");
        let schemas = index_of(held_of(&o, "schemas").iter());
        let options = crate::WriteOptions {
            compose: crate::ComposeOptions {
                author: crate::js::text_or_empty(o.get("author")),
                audience: strings("audience"),
                after: strings("after"),
                at: o.get("at").and_then(Value::as_str).map(String::from),
                link,
                salts: o.get("salts").cloned().unwrap_or(Value::Null),
                nonce: o.get("nonce").and_then(Value::as_str).map(String::from),
            },
            key: Some(&pair),
            held: &held,
            schemas: o.get("schemas").map(|_| &schemas),
        };
        Ok(crate::write(t, &state, &refs, &options)?.to_string())
    })
}

/// Encrypt a value (JSON) to recipients' X25519 public keys (`keys_json`, a JSON array of hex keys): the envelope.
#[no_mangle]
pub unsafe extern "C" fn fb_seal(
    value_json: *const c_char,
    keys_json: *const c_char,
    out: *mut *mut c_char,
) -> c_int {
    run(out, || {
        let value = json_arg(value_json, "value")?;
        let keys: Vec<String> = json_arg(keys_json, "keys")?
            .as_array()
            .map(|a| a.iter().map(|x| crate::js::text(Some(x))).collect())
            .unwrap_or_default();
        let refs: Vec<&str> = keys.iter().map(String::as_str).collect();
        Ok(crate::seal(&value, &refs)?.to_string())
    })
}

/// Open an envelope with a recipient's X25519 private key (hex): the value inside.
#[no_mangle]
pub unsafe extern "C" fn fb_open(
    envelope_json: *const c_char,
    x25519_private: *const c_char,
    out: *mut *mut c_char,
) -> c_int {
    run(out, || {
        Ok(crate::open(
            &json_arg(envelope_json, "envelope")?,
            text(x25519_private, "x25519_private")?,
        )?
        .to_string())
    })
}

/// The one JSON door (src/door.rs), the same call Kotlin uses: `op` is an operation name, `args_json` a JSON array of
/// its arguments. `*out` is always the answer, `{ "ok": value }` or `{ "error": kind, "message", "code", "reasons",
/// "refusals" }`, and the status is `FB_OK` whenever an answer was made (the error is in the answer, not the status).
#[no_mangle]
pub unsafe extern "C" fn fb_call(op: *const c_char, args_json: *const c_char, out: *mut *mut c_char) -> c_int {
    run(out, || {
        let op = text(op, "op")?;
        let args = text(args_json, "args")?;
        Ok(crate::door::answer(op.as_bytes(), args.as_bytes()).to_string())
    })
}
