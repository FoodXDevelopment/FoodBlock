//! Writing a block and carrying it (core.md sections 5 and 6, modules/privacy.md). `compose` stamps an author's words with
//! what every block carries (who, when, its place in the signing key's chain, what was seen, who may see it); `write`
//! is the one path every writer shares: compose, check, sign, chain. It fills nothing in the author's silence: the audience and the time
//! are stated. On the wire a public block is `{ block, signature }`; a sealed one is `{ header, header_signature, envelope }`.
use crate::audience::{commit_in, try_new_salt};
use crate::block::{create_in, hash_suite};
use crate::canonical::canonical;
use crate::chain::Link;
use crate::check::{write_refusals, CheckOptions};
use crate::error::{Error, Result};
use crate::js::{index_of, rf, st, Index};
use crate::prelude::*;
use crate::sign::{sign_in, verify_message_in, Keypair};

pub const PUBLIC: &str = "public";

/// Who may read a block, as its author states it (privacy.md). Nothing fills it in: a block with no stated audience is refused.
#[derive(Debug, Clone, PartialEq)]
pub enum Readers {
    Public,
    /// Recipients (people and circles), written as commitments with a nonce. Never empty.
    To(Vec<String>),
}

/// What every block carries beside its author's words.
#[derive(Debug, Clone, Default)]
pub struct ComposeOptions {
    /// The author's id (the hash of their genesis).
    pub author: String,
    /// Who may read it: stated, never filled in (None is refused).
    pub audience: Option<Readers>,
    /// Heads the author had seen (at most 16).
    pub after: Vec<String>,
    /// When it was said (UTC, `YYYY-MM-DDTHH:MM:SS.sssZ`): stated, never read from a clock here (None without `clockless` is refused).
    pub at: Option<String>,
    /// A writer with no clock states so and gives no `at` (blocks.md, Time).
    pub clockless: bool,
    /// Its place in the signing key's chain. `write` finds it from the given blocks when None.
    pub link: Option<Link>,
    /// Salts by recipient (only to reproduce a vector, or on a build without randomness).
    pub salts: Value,
    /// The block's nonce for a private block (fresh when None).
    pub nonce: Option<String>,
    /// The suite of the signing key (the hash of its commitments and of the id); `std` when empty.
    pub suite: String,
    /// Mark the block `skip`: it jumps `seq` forward because the counter was lost.
    pub skip: bool,
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
    let at = match (&options.at, options.clockless) {
        (Some(a), _) => Some(a.clone()),
        (None, true) => None,
        (None, false) => return Err(Error::new("write: `at` is stated (a time), or the block is `clockless`: nothing reads a clock for the author")),
    };
    let Some(audience) = &options.audience else {
        return Err(Error::new("write: `audience` is stated (\"public\" or a list of recipients): nothing fills it in for the author"));
    };
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
    if let Readers::To(list) = audience {
        if list.is_empty() {
            return Err(Error::new("write: an audience that is a list names at least one recipient; for everyone, state \"public\""));
        }
        let who: Vec<&str> = list.iter().map(String::as_str).collect();
        let written = commit_in(&options.suite, &who, &options.salts)?;
        state.insert("audience".into(), json!(written.audience));
        salts = Some(written.salts_json());
    } else {
        state.insert("audience".into(), Value::String(PUBLIC.into()));
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
    if options.skip {
        state.insert("skip".into(), Value::Bool(true));
    }
    let mut block = create_in(&options.suite, type_name, &Value::Object(state), &Value::Object(refs))?;
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
    pub blocks: &'a [Value],
    pub schemas: Option<&'a Index>,
}

/// The one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next place in
/// that key's chain among `blocks`. Returns the signed block `{ hash, type, state, refs, signature }` (and `salts` for a
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
    let blocks = index_of(options.blocks);
    let mut compose_options = options.compose.clone();
    if compose_options.suite.is_empty() {
        compose_options.suite = key.suite.clone();
    }
    let author = compose_options.author.clone();
    // A key named by hash shows itself in the key grant it signs (identity.md, Her voices): that grant is the key's first block.
    let shows = type_name == "grant" && crate::js::ss(&json!({ "state": state }), "shown_key") == Some(key.public_key_sign.as_str());
    // The key grant that brought the signing key in (identity.md, refs.key): none for the genesis key.
    let key_ref = crate::identity::key_ref_for(&author, &key.public_key_sign, &blocks);
    let mut refs = refs.clone();
    if let (Some(k), Some(m)) = (&key_ref, refs.as_object_mut()) {
        m.entry("key").or_insert_with(|| json!(k));
    }
    if compose_options.link.is_none() {
        compose_options.link = Some(if shows {
            crate::chain::next_link(None, key_ref.as_deref())?
        } else {
            // a key that has signed two blocks naming one prev may still sign a key grant (identity.md, Taking oneself out)
            let key_grant = type_name == "grant" && state.get("kind").and_then(Value::as_str) == Some("key");
            crate::identity::next_link_for_in(&author, &key.public_key_sign, &blocks, key_grant)?
        });
    }
    let mut block = compose(type_name, state, &refs, &compose_options)?;
    let empty = Value::Null;
    let refused = write_refusals(
        crate::js::type_of(&block),
        block.get("state").unwrap_or(&empty),
        block.get("refs").unwrap_or(&empty),
        CheckOptions {
            schemas: options.schemas,
            blocks: Some(&blocks),
        },
    );
    if !refused.is_empty() {
        return Err(Error::refused(refused));
    }
    let signature = sign_in(&key.suite, &block, &key.private_key)?;
    block["signature"] = Value::String(signature);
    // what the writer signed, judged as a node would (core.md, section 8) on what it holds: a writer never signs a block `valid` refuses
    // (a block whose refs.key names a key grant that does not bring its key in: bad_signature). A block whose pieces the writer does not
    // hold is judged by the node that holds them (`unmet` is a wait).
    let mut judged = block.clone();
    if let Value::Object(m) = &mut judged {
        m.shift_remove("salts");
    }
    let found = crate::valid::valid(&judged, &blocks);
    if !found.is_empty() && !found.iter().all(|r| r.code == "unmet") {
        return Err(Error::refused(found));
    }
    Ok(block)
}

// ---- Messages ----
/// A signed public block as it travels: `{ block, signature }`. Never the hash, and never a suite: a reader recomputes
/// the id in the suite of the key that signed it (core.md, sections 2 and 6).
pub fn wrap(signed: &Value) -> Value {
    json!({
        "block": { "type": signed.get("type"), "state": signed.get("state"), "refs": signed.get("refs") },
        "signature": signed.get("signature"),
    })
}

/// A block off the wire: its hash recomputed from its content (in the suite the block itself shows: `block::suite_from_block`;
/// a reader that holds its pieces computes it in the signing key's, `identity::id_in`), its signature kept beside. A message is exactly
/// `{ block, signature }` (core.md, section 6): any other key, a `suite` or a `version` among them, refuses it (`shape`).
pub fn unwrap(message: &Value) -> Result<Value> {
    let inner = message.get("block");
    let type_name = inner.and_then(|b| b.get("type")).and_then(Value::as_str);
    let signature = message.get("signature").and_then(Value::as_str);
    let (Some(type_name), Some(signature)) = (type_name, signature) else {
        return Err(Error::new(
            "write: a message is { block, signature }",
        ));
    };
    if message.as_object().is_some_and(|m| m.keys().any(|k| k != "block" && k != "signature")) {
        return Err(Error::coded("shape", "write: a message is exactly { block, signature }"));
    }
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
    let suite = crate::block::suite_from_block(&json!({ "type": type_name, "state": state, "refs": refs }));
    Ok(json!({
        "hash": hash_suite(&suite, type_name, &state, &refs), "type": type_name, "state": state, "refs": refs,
        "signature": signature,
    }))
}

/// A block's public header (privacy.md, The public header): `{ author, seq, prev, hash }`, with `key` when the block has `refs.key`, and
/// `skip: true` when the block says so. It is what the block is signed over (core.md, section 2).
pub fn header(block: &Value) -> Value {
    let mut out = Map::new();
    for (key, value) in [("author", rf(block, "author")), ("seq", st(block, "seq")), ("prev", rf(block, "prev"))] {
        if let Some(v) = value {
            out.insert(key.into(), v.clone());
        }
    }
    let h = block.get("hash").and_then(Value::as_str).map(String::from).unwrap_or_else(|| crate::block::rehash(block));
    out.insert("hash".into(), Value::String(h));
    if let Some(k) = rf(block, "key") {
        out.insert("key".into(), k.clone());
    }
    for flag in ["skip"] {
        if st(block, flag) == Some(&Value::Bool(true)) {
            out.insert(flag.into(), Value::Bool(true));
        }
    }
    Value::Object(out)
}

/// Whether a sealed copy's header is signed by this key (the key that signed the block).
pub fn header_signed_by(message: &Value, public_key: &str) -> bool {
    let suite = crate::sign::suite_named_by(public_key);
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
    verify_message_in(&suite, &part, public_key)
}

/// A sealed copy: `{ header, header_signature, envelope }`. A private block is signed over its public header (`sign::signed_bytes`),
/// so its one signature is the header's: it travels as `header_signature`, and the plaintext `{ block, reveals }` carries no other.
/// The plaintext is sealed to `keys` (public encryption keys of the suite `enc_suite`, hex). A copy with reveals goes to one
/// recipient, or to several who share every reveal. No private key is needed: the block was signed once, by its author.
#[cfg(feature = "envelope")]
pub fn seal_copy(
    signed: &Value,
    keys: &[&str],
    reveals: &Value,
    fixed: Option<&crate::envelope::Fixed>,
    enc_suite: &str,
) -> Result<Value> {
    let Some(signature) = signed.get("signature").filter(|v| v.is_string()).cloned() else {
        return Err(Error::new("write: a sealed copy is of a signed block"));
    };
    let top = header(signed);
    let mut plaintext = json!({ "block": { "type": signed.get("type"), "state": signed.get("state"), "refs": signed.get("refs") } });
    plaintext["reveals"] = if reveals.is_null() {
        json!([])
    } else {
        reveals.clone()
    };
    let envelope = crate::envelope::seal_with(&plaintext, keys, enc_suite, fixed)?;
    Ok(json!({ "header": top, "header_signature": signature, "envelope": envelope }))
}

/// The sizes a sealer that pads pads to (privacy.md, Sealed messages): the next of 512, 1024, 2048, 4096 bytes, then each 4096.
pub fn padded_size(bytes: usize) -> usize {
    match [512, 1024, 2048, 4096].into_iter().find(|s| *s >= bytes) {
        Some(s) => s,
        None => bytes.div_ceil(4096) * 4096,
    }
}

/// A plaintext object padded with `pad`, a string of spaces, so its canonical bytes are exactly the next padded size. A value that is not
/// an object is itself.
pub fn pad_plaintext(plaintext: &Value) -> Value {
    let Value::Object(m) = plaintext else { return plaintext.clone() };
    let mut m = m.clone();
    m.insert("pad".into(), Value::String(String::new()));
    let base = crate::canonical::canonical_json(&Value::Object(m.clone())).len();
    m.insert("pad".into(), Value::String(" ".repeat(padded_size(base) - base)));
    Value::Object(m)
}

/// A sealed copy whose plaintext is padded (`pad_plaintext`).
#[cfg(feature = "envelope")]
pub fn seal_copy_padded(
    signed: &Value,
    keys: &[&str],
    reveals: &Value,
    fixed: Option<&crate::envelope::Fixed>,
    enc_suite: &str,
) -> Result<Value> {
    let Some(signature) = signed.get("signature").filter(|v| v.is_string()).cloned() else {
        return Err(Error::new("write: a sealed copy is of a signed block"));
    };
    let reveals = if reveals.is_null() { json!([]) } else { reveals.clone() };
    let plaintext = pad_plaintext(&json!({ "block": { "type": signed.get("type"), "state": signed.get("state"), "refs": signed.get("refs") }, "reveals": reveals }));
    let envelope = crate::envelope::seal_with(&plaintext, keys, enc_suite, fixed)?;
    Ok(json!({ "header": header(signed), "header_signature": signature, "envelope": envelope }))
}

/// Open a sealed copy with a recipient's private encryption key (hex): the block, its signature (the header's) and its reveals.
/// The header must name it.
#[cfg(feature = "envelope")]
pub fn open_copy(message: &Value, x25519_private: &str) -> Result<Value> {
    let plaintext = crate::envelope::open(
        message.get("envelope").unwrap_or(&Value::Null),
        x25519_private,
    )?;
    if message.get("version").is_some() {
        return Err(Error::coded("shape", "write: a sealed copy carries no version: it is { header, header_signature, envelope }"));
    }
    // the plaintext is { block, reveals }, and may carry `pad`, a string of spaces, which a reader ignores
    let fields = crate::spec().convention("messages.plaintext");
    if !fields
        .iter()
        .all(|k| k == "reveals" || k == "pad" || plaintext.get(k).is_some())
    {
        return Err(Error::new(
            "write: a plaintext is { block, reveals }, and may carry pad",
        ));
    }
    // a `pad` that is not a string of spaces opens nothing (`shape`)
    if plaintext.get("pad").is_some_and(|p| !p.as_str().is_some_and(|t| t.bytes().all(|b| b == b' '))) {
        return Err(Error::coded("shape", "write: a plaintext's pad is a string of spaces"));
    }
    // the block's one signature is the header's (privacy.md, Sealed messages)
    let mut inside = unwrap(&json!({ "block": plaintext.get("block"), "signature": message.get("header_signature") }))?;
    if let Some(h) = message.get("header") {
        if h.get("hash") != inside.get("hash") {
            return Err(Error::new("write: the header names another block"));
        }
        // the public header describes the body exactly (privacy.md, The public header): hash, author, key, seq, prev, skip. An
        // author cannot show nodes one place on her line and the recipients another.
        if crate::write::header(&inside) != *h {
            return Err(Error::new("write: the header does not describe the block inside it (author, key, seq, prev, skip)"));
        }
    }
    inside["reveals"] = plaintext
        .get("reveals")
        .filter(|r| !r.is_null())
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(inside)
}
