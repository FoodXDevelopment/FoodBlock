//! Writing a block and carrying it (protocol.md §1, §9, Encoding: Messages). `compose` stamps an author's words with
//! what every block carries (who, when, its place in the signing key's chain, what was seen, who may see it); `write`
//! is the one path every writer shares: compose, check, sign, chain. On the wire a public block is
//! `{ version, block, signature }`; a sealed one is `{ version, header, header_signature, envelope }`.
use crate::audience::{commit, try_new_salt};
use crate::block::{create, hash};
use crate::canonical::canonical;
use crate::chain::Link;
use crate::check::{refusals, CheckOptions};
use crate::error::{Error, Result};
use crate::js::{index_of, rf, st, Index};
use crate::prelude::*;
#[cfg(feature = "envelope")]
use crate::sign::sign_message;
use crate::sign::{sign, verify_message, Keypair};

pub const PUBLIC: &str = "public";

/// What every block carries beside its author's words.
#[derive(Debug, Clone, Default)]
pub struct ComposeOptions {
    /// The author's id (the hash of their genesis).
    pub author: String,
    /// Recipients (people, circles, `circle#role`), written as commitments with a nonce. Empty: public.
    pub audience: Vec<String>,
    /// Heads the author had seen (at most 16).
    pub after: Vec<String>,
    /// When it was said (UTC, `YYYY-MM-DDTHH:MM:SS.sssZ`). None: now (std only).
    pub at: Option<String>,
    /// A micro with no clock leaves out `at` (blocks.md, No clock); only an observe, transform or transfer may.
    /// The write check refuses it on any other type (`at_missing`).
    pub clockless: bool,
    /// Its place in the signing key's chain. `write` finds it from the held blocks when None.
    pub link: Option<Link>,
    /// Salts by recipient (only to reproduce a vector, or on a build without randomness).
    pub salts: Value,
    /// The block's nonce for a private block (fresh when None).
    pub nonce: Option<String>,
}

fn at_or_now(at: &Option<String>) -> Result<String> {
    match at {
        Some(a) => Ok(a.clone()),
        #[cfg(feature = "std")]
        None => Ok(crate::time::now()),
        #[cfg(not(feature = "std"))]
        None => Err(Error::new("write: this build has no clock; give `at`")),
    }
}

/// A block as its author says it, stamped with author, at, audience, seq/prev and after. A private block comes back
/// with its salts beside it (`salts`), never signed.
pub fn compose(
    type_name: &str,
    state: &Value,
    refs: &Value,
    options: &ComposeOptions,
) -> Result<Value> {
    if options.author.is_empty() {
        return Err(Error::new("write: a block names its author"));
    }
    let at = if options.clockless && options.at.is_none() { None } else { Some(at_or_now(&options.at)?) };
    if at.as_deref().is_some_and(|a| crate::time::parse(a).is_none()) {
        return Err(Error::new("write: at is a time"));
    }
    let seen = crate::js::sorted_set(options.after.iter());
    let mut state = state.as_object().cloned().unwrap_or_default();
    let mut refs = refs.as_object().cloned().unwrap_or_default();
    let mut salts = None;
    if let Some(at) = at {
        state.insert("at".into(), Value::String(at));
    }
    if options.audience.is_empty() {
        state.insert("audience".into(), Value::String(PUBLIC.into()));
    } else {
        let who: Vec<&str> = options.audience.iter().map(String::as_str).collect();
        let written = commit(&who, &options.salts)?;
        state.insert("audience".into(), json!(written.audience));
        salts = Some(written.salts_json());
    }
    if let Some(link) = &options.link {
        state.insert("seq".into(), json!(link.seq));
    }
    if salts.is_some() && !state.contains_key("nonce") {
        let nonce = match &options.nonce {
            Some(n) => n.clone(),
            None => try_new_salt()?,
        };
        state.insert("nonce".into(), Value::String(nonce));
    }
    refs.insert("author".into(), Value::String(options.author.clone()));
    if let Some(link) = &options.link {
        refs.insert("prev".into(), Value::String(link.prev.clone()));
    }
    if !seen.is_empty() {
        refs.insert("after".into(), json!(seen));
    }
    let mut block = create(type_name, &Value::Object(state), &Value::Object(refs))?;
    if let Some(salts) = salts {
        block["salts"] = salts;
    }
    Ok(block)
}

/// What `write` needs beside the words: the author's key, what it holds, and what `compose` takes.
#[derive(Clone, Default)]
pub struct WriteOptions<'a> {
    pub compose: ComposeOptions,
    /// The signing key: `{ public_key_sign, private_key }`.
    pub key: Option<&'a Keypair>,
    /// The author's genesis, key grants and blocks (to find the next place in the key's chain), and anything named.
    pub held: &'a [Value],
    pub schemas: Option<&'a Index>,
}

/// The one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next place in
/// that key's chain among `held`. Returns the signed block `{ hash, type, state, refs, signature }` (and `salts` for a
/// private one); an error with every refusal (`{ code, detail }`) when the check refuses.
pub fn write(
    type_name: &str,
    state: &Value,
    refs: &Value,
    options: &WriteOptions,
) -> Result<Value> {
    let key = options
        .key
        .ok_or_else(|| Error::new("write: a block is signed with its author's key"))?;
    let held = index_of(options.held);
    let mut compose_options = options.compose.clone();
    if compose_options.link.is_none() {
        compose_options.link = Some(crate::identity::next_link_for_in(
            &compose_options.author,
            &key.public_key_sign,
            &held,
        )?);
    }
    let mut block = compose(type_name, state, refs, &compose_options)?;
    let empty = Value::Null;
    let refused = refusals(
        crate::js::type_of(&block),
        block.get("state").unwrap_or(&empty),
        block.get("refs").unwrap_or(&empty),
        CheckOptions {
            schemas: options.schemas,
            held: Some(&held),
        },
    );
    if !refused.is_empty() {
        return Err(Error::refused(refused));
    }
    let signature = sign(&block, &key.private_key)?;
    block["signature"] = Value::String(signature);
    Ok(block)
}

// ---- Messages ----
/// A signed public block as it travels: `{ version, block, signature }`. Never the hash: readers recompute it.
pub fn wrap(signed: &Value) -> Value {
    json!({
        "version": crate::spec().version,
        "block": { "type": signed.get("type"), "state": signed.get("state"), "refs": signed.get("refs") },
        "signature": signed.get("signature"),
    })
}

/// A block off the wire: its hash recomputed from its content, its signature and version kept beside.
pub fn unwrap(message: &Value) -> Result<Value> {
    let inner = message.get("block");
    let type_name = inner.and_then(|b| b.get("type")).and_then(Value::as_str);
    let signature = message.get("signature").and_then(Value::as_str);
    let (Some(type_name), Some(signature)) = (type_name, signature) else {
        return Err(Error::new(
            "write: a message is { version, block, signature }",
        ));
    };
    let state = inner
        .and_then(|b| b.get("state"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let refs = inner
        .and_then(|b| b.get("refs"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let limit = crate::spec().block_bytes;
    if canonical(type_name, &state, &refs).len() > limit {
        return Err(Error::coded(
            "size_limit",
            format!("write: a block is at most {limit} bytes"),
        ));
    }
    let mut out = json!({
        "hash": hash(type_name, &state, &refs), "type": type_name, "state": state, "refs": refs,
        "signature": signature, "version": message.get("version"),
    });
    if let Some(r) = message
        .get("reveals")
        .filter(|r| crate::js::truthy(Some(r)))
    {
        out["reveals"] = r.clone();
    }
    Ok(out)
}

/// A block's public header: `{ author, seq, prev, hash }`.
pub fn header(block: &Value) -> Value {
    let mut out = Map::new();
    for (key, value) in [
        ("author", rf(block, "author")),
        ("seq", st(block, "seq")),
        ("prev", rf(block, "prev")),
    ] {
        if let Some(v) = value {
            out.insert(key.into(), v.clone());
        }
    }
    let h = block
        .get("hash")
        .and_then(Value::as_str)
        .map(String::from)
        .unwrap_or_else(|| crate::block::rehash(block));
    out.insert("hash".into(), Value::String(h));
    Value::Object(out)
}

/// Whether a sealed copy's header is signed by this key (the key that signed the block).
pub fn header_signed_by(message: &Value, public_key: &str) -> bool {
    let mut part = message.get("header").cloned().unwrap_or_else(|| json!({}));
    if let Value::Object(m) = &mut part {
        m.insert(
            "signature".into(),
            message
                .get("header_signature")
                .cloned()
                .unwrap_or(Value::Null),
        );
    }
    verify_message(&part, public_key)
}

/// A sealed copy: `{ version, header, header_signature, envelope }`. The plaintext `{ version, block, signature,
/// reveals }` is sealed to `keys` (X25519 public keys, hex). A copy with reveals goes to one recipient, or to several
/// who share every reveal. `private_key` is the key that signed the block.
#[cfg(feature = "envelope")]
pub fn seal_copy(
    signed: &Value,
    keys: &[&str],
    reveals: &Value,
    private_key: &str,
    fixed: Option<&crate::envelope::Fixed>,
) -> Result<Value> {
    let top = header(signed);
    let header_signature = sign_message(&top, private_key)?
        .get("signature")
        .cloned()
        .unwrap_or(Value::Null);
    let mut plaintext = wrap(signed);
    plaintext["reveals"] = if reveals.is_null() {
        json!([])
    } else {
        reveals.clone()
    };
    let envelope = crate::envelope::seal_with(&plaintext, keys, crate::envelope::ALG, fixed)?;
    Ok(
        json!({ "version": crate::spec().version, "header": top, "header_signature": header_signature, "envelope": envelope }),
    )
}

/// Open a sealed copy with a recipient's X25519 private key (hex): the block, its signature and its reveals. The
/// header must name it.
#[cfg(feature = "envelope")]
pub fn open_copy(message: &Value, x25519_private: &str) -> Result<Value> {
    let plaintext = crate::envelope::open(
        message.get("envelope").unwrap_or(&Value::Null),
        x25519_private,
    )?;
    let fields = crate::spec().list("messages.plaintext");
    if !fields
        .iter()
        .all(|k| k == "reveals" || plaintext.get(k).is_some())
    {
        return Err(Error::new(
            "write: a plaintext is { version, block, signature, reveals }",
        ));
    }
    let mut inside = unwrap(&plaintext)?;
    if let Some(h) = message.get("header") {
        if h.get("hash") != inside.get("hash") {
            return Err(Error::new("write: the header names another block"));
        }
    }
    inside["reveals"] = plaintext
        .get("reveals")
        .filter(|r| crate::js::truthy(Some(r)))
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(inside)
}
