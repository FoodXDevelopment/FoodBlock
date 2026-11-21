//! Who someone is (modules/identity.md). Her genesis is the one block with no author: an `actor` naming its own signing key, signed by
//! it; its hash is her id, and it is a list of one voice. Who may speak as her is her **list of voices**, ranked, highest first: keys of
//! hers (`key`), keys named only by their hash (`key_hash`), and counts of other people (`names`, `needed`). A key grant (a `grant` of
//! kind `key`, `refs.subject` her id) that states `voices` states her whole list again and names in `refs.updates` the list it replaces;
//! one that states one `public_key_sign` and no voices adds a key under its signer's voice; one that states only `public_key_encrypt`
//! brings in no voice. Every block signed by a key other than its author's genesis key names, in `refs.key`, the key grant that brought
//! that key in. A voice changes only what is below it. A key grant that brings a key in stands only when signed again after its voice's
//! wait (read on her clock, `clocks`), or by a voice above (blocks.md, Finality). A key speaks for her while it is a voice, or under one,
//! of the list standing in the block's own causal past, and no end of it has reached the block (The cut).
use crate::block::{create_in, hash_in};
use crate::chain::{check_chain, next_link, Chain, Link};
use crate::error::{Error, Result};
use crate::js::{hash_of, int, list, rf, rs, ss, st, type_of, Index};
use crate::line::{end_first, received_first, wait_run, Run};
use crate::prelude::*;
use crate::sign::sign_in;
use crate::tasks::{clocks_of, Clocks};

/// Whether a public key opens a block's signature, in the key's suite: over its header (a genesis: its own bytes). A block held by its
/// header alone carries the same one signature as `header_signature`.
pub fn opens_as(block: &Value, public_key: &str, suite: &str) -> bool {
    match block.get("signature").or_else(|| block.get("header_signature")).and_then(Value::as_str) {
        Some(sig) if !sig.is_empty() && !public_key.is_empty() => scoped::opens(block, sig, public_key, suite),
        _ => false,
    }
}

/// One push judges every block of a chain against the store as it stood when its round began, and each round reads the author's keys
/// again: the same held block is checked against the same key round after round. Inside one push (`Scope`), a verdict is remembered by
/// the block's id, its signature and the key, so it is checked once (security I: 1,000 key grants of one author took half a minute).
/// The ids in one push are one view: the store is keyed by them, and a block off the wire is checked with no id until the node has
/// computed its own (`with_id_in`). Outside a push, nothing is remembered here.
pub(crate) mod scoped {
    use crate::prelude::*;
    #[cfg(feature = "std")]
    std::thread_local! {
        static VERDICTS: core::cell::RefCell<Option<alloc::collections::BTreeMap<(String, String, String, String), bool>>> = const { core::cell::RefCell::new(None) };
    }
    #[allow(dead_code)]
    pub(crate) struct Scope {
        #[cfg(feature = "std")]
        outer: bool,
    }
    impl Scope {
        #[allow(dead_code)]
        pub(crate) fn new() -> Scope {
            #[cfg(feature = "std")]
            {
                let outer = VERDICTS.with(|v| v.borrow().is_some());
                if !outer {
                    VERDICTS.with(|v| *v.borrow_mut() = Some(Default::default()));
                }
                Scope { outer }
            }
            #[cfg(not(feature = "std"))]
            Scope {}
        }
    }
    impl Drop for Scope {
        fn drop(&mut self) {
            #[cfg(feature = "std")]
            if !self.outer {
                VERDICTS.with(|v| *v.borrow_mut() = None);
            }
        }
    }
    pub(crate) fn opens(block: &Value, sig: &str, key: &str, suite: &str) -> bool {
        #[cfg(feature = "std")]
        {
            let id = crate::js::hash_of(block);
            if !id.is_empty() {
                let k = (id.to_string(), sig.to_string(), key.to_string(), suite.to_string());
                if let Some(v) = VERDICTS.with(|v| v.borrow().as_ref().and_then(|m| m.get(&k).copied())) {
                    return v;
                }
                let verdict = crate::sign::verify_in(suite, block, sig, key);
                VERDICTS.with(|v| {
                    if let Some(m) = v.borrow_mut().as_mut() {
                        m.insert(k, verdict);
                    }
                });
                return verdict;
            }
        }
        crate::sign::verify_in(suite, block, sig, key)
    }
}

/// The suite of the key that signed a block (core.md, section 2): a genesis's own; else the key its `refs.key` names. None when no key of
/// a held author opens it.
pub fn signed_suite_in(block: &Value, index: &Index) -> Option<String> {
    if is_genesis(block) {
        return Some(suite_named(block));
    }
    key_of(block, index).map(|s| s.suite)
}

/// A block's id as a reader that holds its author's keys computes it: in the suite of the key that signed it, else in the suite
/// the block itself shows (`block::suite_from_block`).
pub fn id_in(block: &Value, index: &Index) -> String {
    let suite = signed_suite_in(block, index).unwrap_or_else(|| crate::block::suite_from_block(block));
    let (state, refs) = (block.get("state").unwrap_or(&Value::Null), block.get("refs").unwrap_or(&Value::Null));
    // a `type` that is not text still has bytes, and so an id (the block is refused as `type_name`)
    if let Some(t) = block.get("type").filter(|t| !t.is_string()) {
        return crate::block::hash_in(&suite, &crate::canonical::canonical_any_type(t, state, refs));
    }
    crate::block::hash_suite(&suite, type_of(block), state, refs)
}

/// The same block with its id recomputed by `id_in` (a block off the wire carries the id `unwrap` could read from it alone).
pub fn with_id_in(block: &Value, index: &Index) -> Value {
    let mut out = block.clone();
    if out.get("type").is_some() {
        // read with no id: the id it came with is not yet one the node computed (scoped, above)
        let mut bare = block.clone();
        if let Value::Object(m) = &mut bare {
            m.shift_remove("hash");
        }
        out["hash"] = Value::String(id_in(&bare, index));
    }
    out
}

/// Whether a public key opens a block's signature (a `std` key unless the key says its suite by its SPKI prefix).
pub fn opens(block: &Value, public_key: &str) -> bool {
    let suite = crate::sign::suite_of_key(public_key).unwrap_or_else(|| crate::spec::default_suite().to_string());
    opens_as(block, public_key, &suite)
}

/// The suite a genesis or key grant names for its key (`state.suite`), the default when it names none.
pub fn suite_named(block: &Value) -> String {
    ss(block, "suite")
        .map(String::from)
        .unwrap_or_else(|| crate::spec().suite_default.clone())
}

/// A key named by its hash (identity.md, Her voices): its suite's hash of its SPKI hex, as UTF-8 text.
pub fn key_hash_in(suite: &str, public_key: &str) -> String {
    hash_in(suite, public_key)
}
pub fn key_hash(public_key: &str) -> String {
    key_hash_in(crate::spec::default_suite(), public_key)
}

fn signed(block: Value, private_key: &str, suite: &str) -> Result<Value> {
    let signature = sign_in(suite, &block, private_key)?;
    let mut block = block;
    block
        .as_object_mut()
        .unwrap()
        .insert("signature".into(), Value::String(signature));
    Ok(block)
}

/// What a new genesis names beside its signing key. The suite is the key's own (`keys.suite`).
#[derive(Debug, Clone, Default)]
pub struct GenesisOptions<'a> {
    /// What it is (person, agent, machine, circle, ...): stated, never filled in.
    pub kind: &'a str,
    /// When it was said: stated (a time), never read from a clock.
    pub at: String,
    /// Who may read it: stated, never filled in (None is refused). A list is written as commitments with a `nonce`.
    pub audience: Option<crate::write::Readers>,
    /// Salts by recipient (only to reproduce a vector, or on a build without randomness).
    pub salts: Value,
    /// The nonce of a private genesis (fresh when None).
    pub nonce: Option<String>,
    /// The public encryption key (hex), if the identity will receive sealed blocks; empty for a micro that only
    /// signs, which adds one later by a key grant.
    pub encryption_key: &'a str,
    /// Her first voice's reach (a duration): a wait before her promises, transfers and grants stand. Empty: none.
    pub reach: &'a str,
    /// Her clock (`{ names, needed }`), required with a reach. None: none.
    pub clocks: Option<Value>,
}

/// A new person, autonomous system, machine or circle that signs: their genesis, signed. It needs only kind, at, audience and the key,
/// each stated (nothing fills them in). A private genesis comes back with its salts beside it (`salts`), as `write` gives them.
pub fn genesis(keys: &crate::sign::Keypair, options: &GenesisOptions) -> Result<Value> {
    use crate::write::Readers;
    let suite = crate::spec::suite_or_default(&keys.suite);
    if options.kind.is_empty() {
        return Err(Error::new("identity: a genesis states its `kind`: nothing fills it in"));
    }
    if options.at.is_empty() {
        return Err(Error::new("identity: a genesis states `at` (a time): nothing reads a clock for the author"));
    }
    let Some(audience) = &options.audience else {
        return Err(Error::new("identity: a genesis states its `audience` (\"public\" or a list of recipients): nothing fills it in"));
    };
    let mut state = json!({
        "kind": options.kind, "at": options.at, "public_key_sign": keys.public_key_sign,
    });
    let mut salts = None;
    match audience {
        Readers::Public => state["audience"] = json!(crate::write::PUBLIC),
        Readers::To(list) => {
            if list.is_empty() {
                return Err(Error::new("identity: an audience that is a list names at least one recipient; for everyone, state \"public\""));
            }
            let who: Vec<&str> = list.iter().map(String::as_str).collect();
            let written = crate::audience::commit_in(suite, &who, &options.salts)?;
            state["audience"] = json!(written.audience);
            state["nonce"] = json!(match &options.nonce {
                Some(n) => n.clone(),
                None => crate::audience::try_new_salt()?,
            });
            salts = Some(written.salts_json());
        }
    }
    let m = state.as_object_mut().unwrap();
    if suite != crate::spec::default_suite() {
        m.insert("suite".into(), json!(suite));
    }
    if !options.encryption_key.is_empty() {
        m.insert("public_key_encrypt".into(), json!(options.encryption_key));
    }
    if !options.reach.is_empty() {
        m.insert("reach".into(), json!(options.reach));
    }
    if let Some(k) = options.clocks.as_ref().filter(|k| !k.is_null()) {
        m.insert("clocks".into(), k.clone());
    }
    let block = create_in(suite, "actor", &state, &json!({}))?;
    let refused = crate::check::write_refusals("actor", block.get("state").unwrap(), block.get("refs").unwrap(), crate::CheckOptions::default());
    if !refused.is_empty() {
        return Err(Error::refused(refused));
    }
    let mut out = signed(block, &keys.private_key, suite)?;
    if let Some(salts) = salts {
        out["salts"] = salts;
    }
    Ok(out)
}

/// A genesis: an actor that names its own signing key and has no author (core.md, section 4).
pub fn is_genesis(block: &Value) -> bool {
    type_of(block) == "actor"
        && ss(block, "public_key_sign").is_some()
        && rf(block, "author").is_none()
        && st(block, "seq").is_none()
}
/// A genesis is valid when its own key opens it, in its suite.
pub fn genesis_opens(block: Option<&Value>) -> bool {
    block.is_some_and(|b| {
        is_genesis(b) && opens_as(b, ss(b, "public_key_sign").unwrap_or(""), &suite_named(b))
    })
}

/// autonomous(actor): an autonomous system, by what its genesis says it is: an actor of kind `agent` or `machine`. The only place
/// the `kind` label is read, and it is consent's (strangers::is_agents), never validity's.
pub fn autonomous(actor: &Value) -> bool {
    matches!(ss(actor, "kind"), Some("agent" | "machine"))
}

// ---- refs.key: the key that signed a block (core.md, section 5; identity.md, refs.key) ----
/// The key that signed a block of an author, with its suite.
#[derive(Debug, Clone, PartialEq)]
pub struct Signer {
    pub key: String,
    pub suite: String,
}

/// A key grant about an id: a `grant` of kind `key`, no status, `refs.subject` the id (its author may be another).
pub(crate) fn key_grant_of(p: &Value, id: &str) -> bool {
    type_of(p) == "grant" && ss(p, "kind") == Some("key") && st(p, "status").is_none() && rs(p, "subject") == Some(id)
}

/// The keys a block brings into an author, with their suites (identity.md, refs.key): her genesis brings in its own key; a key grant
/// about her brings in each `key` voice of the list it states, the one `public_key_sign` it adds under a voice, and the key it shows
/// (`shown_key`). Nothing else brings a key in.
pub fn brings_in(p: &Value, author: &str, held: &Index) -> Vec<(String, String)> {
    if hash_of(p) == author {
        if !is_genesis(p) {
            return vec![];
        }
        // 1.9 3d-17: a genesis that states her list brings in each `key` voice of it
        if st(p, "voices").is_some() {
            return list_of(p).map(|l| l.voices.iter().filter_map(|v| match &v.who {
                Who::Key(k) => Some((k.clone(), v.suite.clone())),
                _ => None,
            }).collect()).unwrap_or_default();
        }
        return vec![(ss(p, "public_key_sign").unwrap_or("").to_string(), suite_named(p))];
    }
    if !key_grant_of(p, author) {
        return vec![];
    }
    let mut out: Vec<(String, String)> = match list_of(p) {
        Some(l) => l.voices.iter().filter_map(|v| match &v.who {
            Who::Key(k) => Some((k.clone(), v.suite.clone())),
            _ => None,
        }).collect(),
        None => ss(p, "public_key_sign").map(|k| vec![(k.to_string(), suite_named(p))]).unwrap_or_default(),
    };
    out.extend(shown_key(p, author, held));
    out
}

/// The key a key grant shows (identity.md, Her voices): its `state.shown_key`, when a `key_hash` voice of the list its `refs.key` names
/// (a list of hers) holds that key's hash, in that voice's suite.
fn shown_key(p: &Value, author: &str, held: &Index) -> Option<(String, String)> {
    let k = ss(p, "shown_key")?;
    if !key_grant_of(p, author) {
        return None;
    }
    let holder = rs(p, "key").and_then(|h| held.get(h)).filter(|l| key_grant_of(l, author))?;
    // the key's own SPKI names its suite (core.md, Suites; a `key_hash` voice states none): the hash and the opening are in that suite
    // (end pass 2026-11-20: a p256 key named by hash was read as std, and its suite move never opened)
    let suite = crate::sign::suite_of_key(k);
    list_of(holder)?.voices.iter().find_map(|v| {
        let s = suite.clone().unwrap_or_else(|| v.suite.clone());
        match &v.who {
            Who::Hash(h) if key_hash_in(&s, k) == *h => Some((k.to_string(), s)),
            _ => None,
        }
    })
}

/// The key that signed a block (core.md, section 8, check 6), read from its pieces alone: its author's genesis and the key grant its
/// `refs.key` names, never from other blocks a reader happens to hold, so every node that holds the pieces reads one signer. A block with
/// no `refs.key` is signed by its author's genesis key. A block held by its header alone is read the same way, from the header's `key`.
/// None when no such key opens it over its header, or its pieces are not held.
pub fn key_of(block: &Value, held: &Index) -> Option<Signer> {
    if let Some(s) = held.signer_memo_get(block) {
        return s;
    }
    let s = key_read(block, held);
    held.signer_memo_set(block, s.clone());
    s
}
/// The same (the name every reader of a block's signer calls).
pub fn signer_in(block: &Value, held: &Index) -> Option<Signer> {
    key_of(block, held)
}

/// The keys a block's pieces name, with their suites: those the block its `refs.key` names brings in (none when that block is not held
/// or is not a key grant about the author), or the author's genesis key with no `refs.key`; and a key the block shows itself, for a key
/// named by hash speaks first in the key grant that shows it. None when the author's genesis is not held as one.
pub(crate) fn named_keys(block: &Value, held: &Index) -> Option<Vec<(String, String)>> {
    let author = rs(block, "author")?;
    let root = held.get(author).filter(|r| genesis_opens(Some(r)))?;
    let mut keys = match rs(block, "key") {
        None => brings_in(root, author, held),
        // a block of the genesis key names none: one that names the genesis there names no key grant
        Some(k) if k == author => vec![],
        Some(k) => held.get(k).map(|g| match g.get("_brings").and_then(Value::as_array) {
            // a key grant held as its header because this reader cannot read it still brings its keys in (valid::pool keeps them)
            Some(b) if g.get("type").is_none() && rs(g, "subject").is_none_or(|s| s == author) => b.iter().filter_map(|x| Some((x.get(0)?.as_str()?.to_string(), x.get(1)?.as_str()?.to_string()))).collect(),
            _ => brings_in(g, author, held),
        }).unwrap_or_default(),
    };
    keys.extend(shown_key(block, author, held));
    keys.retain(|(k, _)| !k.is_empty());
    Some(keys)
}

fn key_read(block: &Value, held: &Index) -> Option<Signer> {
    let (key, suite) = named_keys(block, held)?.into_iter().find(|(k, s)| opens_as(block, k, s))?;
    Some(Signer { key, suite })
}

// ---- Her voices (identity.md, Her voices) ----
/// Who a voice is: a key of hers, a key named by its hash, or other people counted.
#[derive(Clone, Debug, PartialEq)]
pub enum Who {
    Key(String),
    Hash(String),
    Names(Vec<String>, usize),
}

/// One voice of her list: who it is, its suite (`std` when left out), and its `wait` and `reach`, as stated.
#[derive(Clone, Debug)]
pub struct Voice {
    pub who: Who,
    pub suite: String,
    pub wait: Option<String>,
    pub reach: Option<String>,
    /// The voice as signed.
    pub raw: Value,
}
impl PartialEq for Voice {
    fn eq(&self, o: &Voice) -> bool {
        self.who == o.who && self.suite == o.suite && self.wait == o.wait && self.reach == o.reach
    }
}

/// Her list of voices, highest first, and its clock, as the block `by` states it (her genesis, or a key grant that states `voices`).
#[derive(Clone, Debug)]
pub struct List {
    pub by: String,
    pub voices: Vec<Voice>,
    pub clocks: Option<Value>,
}
impl List {
    fn clock(&self) -> Option<Clocks> {
        self.clocks.as_ref().and_then(clocks_of)
    }
}

/// 1.9 3d-15: her closes: each key grant of her standing chain that leaves no voice (by its hash).
pub(crate) fn closes_of(id: &str, held: &Index) -> Vec<String> {
    standing_chain(id, held, None).into_iter().filter(|l| l.voices.is_empty() && l.by != id).map(|l| l.by).collect()
}

/// One voice, read from its object (identity.md, Her voices); None when it is no voice (the check refuses it, `shape`).
pub fn voice_of(v: &Value) -> Option<Voice> {
    let o = v.as_object()?;
    let text = |k: &str| o.get(k).and_then(Value::as_str).map(String::from);
    let who = if let Some(k) = text("key") {
        Who::Key(k)
    } else if let Some(h) = text("key_hash") {
        Who::Hash(h)
    } else {
        let names: Vec<String> = o.get("names")?.as_array()?.iter().map(|n| n.as_str().map(String::from)).collect::<Option<_>>()?;
        let needed = match (o.get("needed"), names.len()) {
            (None, 1) => 1,
            (None, _) => return None,
            (Some(n), len) => crate::js::count_stated(Some(n), Some(len))? as usize,
        };
        Who::Names(names, needed)
    };
    Some(Voice { who, suite: text("suite").unwrap_or_else(|| crate::spec().suite_default.clone()), wait: text("wait"), reach: text("reach"), raw: v.clone() })
}

/// The list a block states: a genesis is a list of one voice, its own key (its reach in `state.reach`); a key grant that states
/// `voices` states the whole list. None for any other block.
pub fn list_of(block: &Value) -> Option<List> {
    if is_genesis(block) {
        // 1.9 3d-17: a genesis may state her whole list in `state.voices`, the highest voice first, as a key grant does
        if let Some(vs) = st(block, "voices").and_then(Value::as_array) {
            let voices = vs.iter().map(voice_of).collect::<Option<Vec<_>>>()?;
            return Some(List { by: hash_of(block).to_string(), voices, clocks: st(block, "clocks").cloned() });
        }
        let key = ss(block, "public_key_sign")?.to_string();
        let mut raw = json!({ "key": key });
        for f in ["suite", "reach"] {
            if let Some(v) = st(block, f) {
                raw[f] = v.clone();
            }
        }
        let voice = Voice { who: Who::Key(key), suite: suite_named(block), wait: None, reach: ss(block, "reach").map(String::from), raw };
        return Some(List { by: hash_of(block).to_string(), voices: vec![voice], clocks: st(block, "clocks").cloned() });
    }
    if !(type_of(block) == "grant" && ss(block, "kind") == Some("key") && st(block, "status").is_none()) {
        return None;
    }
    let mut voices = st(block, "voices")?.as_array()?.iter().map(voice_of).collect::<Option<Vec<_>>>()?;
    // a key names its suite in `state.suite` of the genesis or key grant (core.md, Which suite): a voice that states none is in that suite
    // (end pass 2026-11-20, as the oracle reads it: a key grant in a suite this reader does not know brings in keys it cannot use, `unknown_suite`)
    if let Some(s) = ss(block, "suite") {
        for v in voices.iter_mut().filter(|v| v.raw.get("suite").is_none()) {
            v.suite = s.to_string();
        }
    }
    Some(List { by: hash_of(block).to_string(), voices, clocks: st(block, "clocks").cloned() })
}

/// Where a signer stands in her list: a voice's place (0 is first), or a key under a voice.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Place {
    At(usize),
    Under(usize),
}
impl Place {
    fn rank(&self) -> i64 {
        match self {
            Place::At(i) | Place::Under(i) => *i as i64,
        }
    }
    fn index(&self) -> Option<usize> {
        match self {
            Place::At(i) | Place::Under(i) => Some(*i),
        }
    }
}

/// Whether a key grant stands (identity.md, When a key grant stands), and if not, whether it may yet.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Standing {
    Stands,
    Waits(&'static str),
    Never,
}
impl Standing {
    fn code(&self) -> &'static str {
        match self {
            Standing::Stands => "stands",
            Standing::Waits(w) => w,
            Standing::Never => "never",
        }
    }
    fn of(code: &str) -> Standing {
        match code {
            "stands" => Standing::Stands,
            "never" => Standing::Never,
            "wait" => Standing::Waits("wait"),
            "reach" => Standing::Waits("reach"),
            "end" => Standing::Waits("end"),
            "named" => Standing::Waits("named"),
            "condition" => Standing::Waits("condition"),
            "hands" => Standing::Waits("hands"),
            _ => Standing::Waits("confirm"),
        }
    }
}

// A reading of the held blocks, remembered by key for this state of the blocks. A reading asked again while it is being read (the folds of
// two people who name each other's lists) gets `busy` for that inner question: every reading descends into strictly earlier causal pasts,
// so this is met only by a reader-wide question asked again from inside itself.
fn guarded(held: &Index, key: &str, busy: Value, f: impl FnOnce() -> Value) -> Value {
    if let Some(v) = held.stage_peek(key) {
        return v;
    }
    let mark = format!("busy:{key}");
    if held.stage_peek(&mark).is_some() {
        // a value read while its own question is open is a default, not an answer: nothing computed from it is kept (end pass
        // 2026-11-20: a key grant's standing, read inside its own `signed_by_author`, was kept as `never`)
        held.taint_bump();
        return busy;
    }
    held.stage_put(&mark, Value::Bool(true));
    let t0 = held.taint();
    let v = f();
    held.stage_drop(&mark);
    if held.taint() == t0 {
        held.stage_put(key, v.clone());
    }
    v
}

// What a reader lets in: everything held, or a block's causal past (the block itself left out).
fn within_key(within: Option<&Value>) -> String {
    within.map_or_else(|| String::from("*"), |w| hash_of(w).to_string())
}

/// The lists that have stood for an id, oldest first, among the blocks held or within a block's causal past (identity.md, Her voices):
/// from her genesis, each next list is the key grant stating `voices` that names the last in `refs.updates` and stands; where several do,
/// the one of the highest voice. Empty when her genesis is not held.
pub fn standing_chain(id: &str, held: &Index, within: Option<&Value>) -> Vec<List> {
    let key = format!("chain:{id}:{}", within_key(within));
    let byes = guarded(held, &key, json!([id]), || Value::Array(chain_read(id, held, within).into_iter().map(Value::String).collect()));
    byes.as_array().into_iter().flatten().filter_map(Value::as_str).filter_map(|h| held.get(h)).filter_map(list_of).collect()
}
fn chain_read(id: &str, held: &Index, within: Option<&Value>) -> Vec<String> {
    let Some(root) = held.get(id).filter(|r| genesis_opens(Some(r))) else { return vec![] };
    let past = within.map(|w| held.past_of(w));
    let vis = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    let grants = held.grants_memo();
    let mine: Vec<&Value> = grants.key_by_subject.get(id).into_iter().flatten().filter(|h| vis(h)).filter_map(|h| held.get(h)).filter(|g| key_grant_of(g, id) && st(g, "voices").is_some()).collect();
    let mut chain: Vec<String> = vec![hash_of(root).to_string()];
    let mut cur = list_of(root).unwrap();
    while chain.len() <= mine.len() {
        let mut best: Option<(i64, &Value)> = None;
        let mut tie = false;
        for g in mine.iter().filter(|g| rs(g, "updates") == Some(cur.by.as_str())) {
            if grant_standing(g, id, held, within) != Standing::Stands {
                continue;
            }
            let Some(r) = place_in(g, id, &cur, held).map(|p| p.rank()) else { continue };
            match best {
                Some((br, b)) if br == r && hash_of(b) != hash_of(g) => tie = true,
                Some((br, _)) if br <= r => {}
                _ => {
                    best = Some((r, g));
                    tie = false;
                }
            }
        }
        let Some((_, g)) = best.filter(|_| !tie) else { break };
        let Some(next) = list_of(g) else { break };
        chain.push(next.by.clone());
        cur = next;
    }
    chain
}

/// The list standing for an id among the blocks held (or within a block's causal past). None when her genesis is not held.
pub fn standing_list(id: &str, held: &Index, within: Option<&Value>) -> Option<List> {
    standing_chain(id, held, within).pop()
}

/// 1.9 3b-8, One start: whether `key` is the voice her list marks `receives: true`, else her first voice. None where no list of hers is
/// held (an id that is no person: its start is read as before).
pub fn receives_on(id: &str, key: &str, held: &Index) -> Option<bool> {
    let list = standing_list(id, held, None)?;
    let v = list.voices.iter().find(|v| v.raw.get("receives") == Some(&Value::Bool(true))).or_else(|| list.voices.first())?;
    Some(match &v.who {
        Who::Key(k) => k == key,
        Who::Hash(h) => key_hash_in(&v.suite, key) == *h,
        Who::Names(..) => false,
    })
}

// The place of a key in a list: a `key` voice, or a `key_hash` voice that holds its hash.
fn place_of_key(key: &str, list: &List) -> Option<usize> {
    list.voices.iter().position(|v| match &v.who {
        Who::Key(k) => k == key,
        Who::Hash(h) => key_hash_in(&v.suite, key) == *h,
        Who::Names(..) => false,
    })
}

/// Where the signer of a block stands in her list (`list`): for her own block, the voice its key is, or the voice a key under a voice is
/// under (its key grant standing); for a key grant another signs for her list, her operator or the voice of named people he is one of.
pub fn place_in(block: &Value, id: &str, list: &List, held: &Index) -> Option<Place> {
    place_within(block, id, list, held, Some(block))
}
// The same, with the key grant of a key under a voice read as standing within `within`'s causal past (None: all the blocks held).
fn place_within(block: &Value, id: &str, list: &List, held: &Index, within: Option<&Value>) -> Option<Place> {
    let author = rs(block, "author")?;
    if author != id {
        if !key_grant_of(block, id) {
            return None;
        }
        return list.voices.iter().position(|v| matches!(&v.who, Who::Names(n, _) if n.iter().any(|x| x == author))).map(Place::At);
    }
    let s = key_of(block, held)?;
    if let Some(i) = place_of_key(&s.key, list) {
        return Some(Place::At(i));
    }
    let u = rs(block, "key").and_then(|h| held.get(h)).filter(|u| key_grant_of(u, id) && st(u, "voices").is_none() && ss(u, "public_key_sign") == Some(s.key.as_str()))?;
    under_place(u, id, list, held, within).map(Place::Under)
}

/// The voice a key under a voice is under in a list (identity.md, A key under a voice): its key grant stands, and the key of its voice
/// is that voice in the list, or was put in that place by a key grant that had the adding block in its causal past (inside that cut).
fn under_place(u: &Value, id: &str, list: &List, held: &Index, within: Option<&Value>) -> Option<usize> {
    if grant_standing(u, id, held, within) != Standing::Stands {
        return None;
    }
    let voice_key = key_of(u, held)?.key;
    let from = standing_list(id, held, Some(u))?;
    let i = place_of_key(&voice_key, &from)?;
    // a stop of the key grant that added it, by its signer or a voice above, ends it
    let past = within.map(|w| held.past_of(w));
    let stopped = held.values().any(|st| {
        type_of(st) == "grant"
            && ss(st, "status") == Some("stopped")
            && rs(st, "updates") == Some(hash_of(u))
            && rs(st, "author") == Some(id)
            && past.as_ref().is_none_or(|p| p.contains(hash_of(st)))
            && signed_by_author_in(st, held)
            && standing_list(id, held, Some(st)).is_some_and(|l| key_of(st, held).and_then(|s| place_of_key(&s.key, &l)).is_some_and(|p| p <= i))
    });
    if stopped {
        return None;
    }
    if from.by == list.by {
        return Some(i);
    }
    // follow the place along the lists that stood since the key grant that added it: each that put another key there had it in its past
    let chain = standing_chain(id, held, None);
    let (a, b) = (chain.iter().position(|l| l.by == from.by)?, chain.iter().position(|l| l.by == list.by)?);
    let tag = |v: &Voice| match &v.who {
        Who::Key(k) | Who::Hash(k) => Some(k.clone()),
        Who::Names(..) => None,
    };
    let mut now = tag(&from.voices[i])?;
    for l in chain.get(a + 1..=b)? {
        let t = tag(l.voices.get(i)?)?;
        if t != now {
            if !held.get(&l.by).is_some_and(|e| held.past_of(e).contains(hash_of(u))) {
                return None;
            }
            now = t;
        }
    }
    Some(i)
}

// ---- When a key grant stands (identity.md) ----
/// Whether a key grant about `id` stands among the blocks held (or within a block's causal past), and if not whether it may yet.
pub fn grant_standing(g: &Value, id: &str, held: &Index, within: Option<&Value>) -> Standing {
    let key = format!("gs:{}:{id}:{}", hash_of(g), within_key(within));
    Standing::of(guarded(held, &key, json!("confirm"), || json!(grant_standing_read(g, id, held, within).code())).as_str().unwrap_or("never"))
}

fn grant_standing_read(g: &Value, id: &str, held: &Index, within: Option<&Value>) -> Standing {
    if !key_grant_of(g, id) || !signed_by_author_in(g, held) {
        return Standing::Never;
    }
    let Some(list) = standing_list(id, held, Some(g)) else { return Standing::Never };
    // One list at a time: a list names the list standing in its own causal past (one already replaced is no key grant).
    let new = list_of(g);
    if new.is_some() && rs(g, "updates") != Some(list.by.as_str()) {
        return Standing::Never;
    }
    let Some(place) = place_in(g, id, &list, held) else { return Standing::Never };
    // A key under a voice signs no key grant.
    if matches!(place, Place::Under(_)) {
        return Standing::Never;
    }
    // 1.9 3d-14 (D8, E2): where her list says so (`above: true`), a voice of other people whose wait is above zero may sign a key grant that
    // puts a new key in a place above its own (that place's wait and reach kept), or that leaves no voice. It is never narrowing: it stands
    // only when `needed` of them have signed it again after their wait has run on her clocks, and no voice above them said no in that wait.
    // 1.9-GUESS [3d-14a]: "placed by her first voice" is read as true of every list: only the first voice adds a voice of other people.
    if let (Some(new), Some(i)) = (&new, place.index()) {
        let v = &list.voices[i];
        let reaches = matches!(v.who, Who::Names(..)) && v.raw.get("above") == Some(&Value::Bool(true)) && v.wait.as_deref().is_some_and(|w| !is_zero(w));
        if reaches && new.clocks == list.clocks && (new.voices.is_empty() || reaches_above(new, &list, i)) {
            let past = within.map(|w| held.past_of(w));
            let vis = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
            if paired(g, id, place, held, &vis) {
                return Standing::Never;
            }
            return power_standing(g, id, &list, place, held, within, true);
        }
    }
    if let Some(new) = &new {
        if !restated(new, &list, place) {
            return Standing::Never;
        }
        // 1.9 3d-12 (rule 10): a key in doubt never decides its own replacement: a key's own key grant is never a suite move; only a voice
        // above a key moves it to a key of another suite (each key's suite read from its own spelling)
        if let Place::At(i) = place {
            if let (Some(Who::Key(ok)), Some(Who::Key(nk))) = (list.voices.get(i).map(|v| &v.who), new.voices.get(i).map(|v| &v.who)) {
                if crate::sign::suite_named_by(ok) != crate::sign::suite_named_by(nk) {
                    return Standing::Never;
                }
            }
        }
    }
    let past = within.map(|w| held.past_of(w));
    let vis = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    // A voice of named people speaks when `needed` of them have signed it or named it in refs.confirms.
    if let Some(Who::Names(names, needed)) = place.index().map(|i| &list.voices[i].who) {
        let mut signers: Vec<&str> = vec![rs(g, "author").unwrap_or("")];
        signers.extend(confirms_of(g, held, &vis).filter(|c| rs(c, "author").is_some_and(|a| names.iter().any(|n| n == a))).filter_map(|c| rs(c, "author")));
        if !crate::js::quorum(signers, Some(*needed as f64)) {
            return Standing::Waits("confirm");
        }
    }
    if free_key_grant(g, new.as_ref(), &list, place) {
        return Standing::Stands;
    }
    if paired(g, id, place, held, &vis) {
        return Standing::Never;
    }
    if narrows(g, new.as_ref(), &list) {
        return Standing::Stands;
    }
    power_standing(g, id, &list, place, held, within, true)
}

// A voice restates every voice above its place as it was, and its own place's wait and reach as they were (a new key may go in its own
// place); only the first voice changes `clocks`. A voice that leaves its own place out adds nothing below it.
fn restated(new: &List, old: &List, place: Place) -> bool {
    let Place::At(i) = place else { return false };
    if new.voices.len() < i || new.voices[..i] != old.voices[..i] {
        return false;
    }
    if i != 0 && new.clocks != old.clocks {
        return false;
    }
    if new.voices.len() == i {
        return true;
    }
    let mut without = old.voices.clone();
    without.remove(i);
    if new.voices == without {
        return true;
    }
    let (o, n) = (&old.voices[i], &new.voices[i]);
    o.wait == n.wait
        && o.reach == n.reach
        && match (&o.who, &n.who) {
            (Who::Names(..), _) => o == n,
            (_, Who::Names(..)) => false,
            _ => true,
        }
}

// 1.9 3d-14: a list that puts a new key in one place above `i`, keeping that place's wait and reach, and every other voice as it was.
fn reaches_above(new: &List, old: &List, i: usize) -> bool {
    if new.voices.len() != old.voices.len() {
        return false;
    }
    let changed: Vec<usize> = (0..old.voices.len()).filter(|j| new.voices[*j] != old.voices[*j]).collect();
    match changed.as_slice() {
        [j] if *j < i => {
            let (o, n) = (&old.voices[*j], &new.voices[*j]);
            o.wait == n.wait && o.reach == n.reach && matches!(n.who, Who::Key(_))
        }
        _ => false,
    }
}

// A key grant that stands when signed and waits on nothing (identity.md): one that takes its signer's own place out. No second signature,
// no wait, no reach and no cut. 1.9 3d-11: a key grant that states only an encryption key is no longer one: it is a grant of hers, waits
// on its key's reach and passes the cut as any grant of that key does (it is not signed twice: it only narrows), and two of one voice
// apart are a pair.
fn free_key_grant(g: &Value, new: Option<&List>, old: &List, place: Place) -> bool {
    let _ = g;
    match new {
        Some(n) => takes_self_out(g, n, old, place),
        None => false,
    }
}

// Taking oneself out (identity.md): the list is the old one without the signer's own place, the clock unchanged, no key added.
fn takes_self_out(g: &Value, new: &List, old: &List, place: Place) -> bool {
    let Place::At(i) = place else { return false };
    let mut without = old.voices.clone();
    without.remove(i);
    new.voices == without && new.clocks == old.clocks && st(g, "public_key_sign").is_none() && st(g, "shown_key").is_none()
}

// A key grant that only narrows (blocks.md, Finality, Signed twice): it adds no key and shows none, and its list, if it states one, is the
// old list with some voices left out, each kept one as it was, the clock unchanged. A key grant of an encryption key alone is one.
fn narrows(g: &Value, new: Option<&List>, old: &List) -> bool {
    if st(g, "public_key_sign").is_some() || st(g, "shown_key").is_some() {
        return false;
    }
    let Some(new) = new else { return true };
    if new.clocks != old.clocks {
        return false;
    }
    let mut rest = old.voices.iter();
    new.voices.iter().all(|v| rest.any(|o| o == v))
}

// Two by one voice (identity.md): another key grant about her of the same voice, neither in the other's causal past.
fn paired(g: &Value, id: &str, place: Place, held: &Index, vis: &dyn Fn(&str) -> bool) -> bool {
    let gh = hash_of(g);
    let same = |h: &Value| -> bool {
        match place {
            Place::At(_) | Place::Under(_) if rs(g, "author") == Some(id) => {
                rs(h, "author") == Some(id) && key_of(h, held).zip(key_of(g, held)).is_some_and(|(a, b)| a.key == b.key)
            }
            Place::At(_) | Place::Under(_) => {
                rs(h, "author") != Some(id) && rs(h, "updates") == rs(g, "updates") && standing_list(id, held, Some(g)).is_some_and(|l| place_in(h, id, &l, held) == Some(place))
            }
        }
    };
    held.grants_memo().key_by_subject.get(id).into_iter().flatten().filter(|h| vis(h) && h.as_str() != gh).filter_map(|h| held.get(h)).any(|h| {
        key_grant_of(h, id) && !held.past_of(g).contains(hash_of(h)) && !held.past_of(h).contains(gh) && same(h) && signed_by_author_in(h, held)
    })
}

// The counted blocks that name a word in `refs.confirms`, among those `vis` lets in.
fn confirms_of<'a>(word: &'a Value, held: &'a Index, vis: &'a dyn Fn(&str) -> bool) -> impl Iterator<Item = &'a Value> + 'a {
    let h = hash_of(word);
    // seat 33 mend 5: the blocks naming it in `confirms`, from the index's names, never a pass over every block held per word
    let names = held.names_memo();
    let named: Vec<&'a Value> = names.by_confirms.get(h).into_iter().flatten().filter_map(|n| held.get(n)).collect();
    named.into_iter().filter(move |c| vis(hash_of(c)) && hash_of(c) != h && list(rf(c, "confirms")).contains(&h) && signed_by_author_in(c, held))
}

// Whether a voice of a list has signed a block naming `word` in refs.confirms (a voice of named people: `needed` of them), among `vis`.
fn voice_confirms(word: &Value, id: &str, list: &List, i: usize, held: &Index, vis: &dyn Fn(&str) -> bool) -> bool {
    match &list.voices[i].who {
        Who::Names(names, needed) => {
            let by = confirms_of(word, held, vis).filter_map(|c| rs(c, "author")).filter(|a| names.iter().any(|n| n == a));
            crate::js::quorum(by, Some(*needed as f64))
        }
        _ => confirms_of(word, held, vis).any(|c| rs(c, "author") == Some(id) && standing_list(id, held, Some(c)).is_some_and(|l| place_in(c, id, &l, held) == Some(Place::At(i)))),
    }
}

// A voice above a signer's place has confirmed the word: a voice ranked higher in the list.
fn confirmed_above(word: &Value, id: &str, list: &List, place: Place, held: &Index, vis: &dyn Fn(&str) -> bool) -> bool {
    // above a key under a voice is its voice too
    let above = match place {
        Place::Under(i) => i + 1,
        _ => place.index().unwrap_or(0),
    }
    .min(list.voices.len());
    (0..above).any(|j| voice_confirms(word, id, list, j, held, vis))
}

// The wait of a signer's place: the first voice's is zero; a key under a voice has its voice's.
fn wait_of(list: &List, place: Place) -> Option<String> {
    match place {
        Place::At(0) | Place::Under(0) => Some(String::from("PT0S")),
        Place::At(i) | Place::Under(i) => list.voices.get(i).and_then(|v| v.wait.clone()),
    }
}
fn is_zero(duration: &str) -> bool {
    crate::time::parse_duration(duration).is_some_and(|d| d.years == 0 && d.months == 0 && d.days == 0 && d.ms == 0)
}

/// Signed twice (blocks.md, Finality; identity.md, When a key grant stands): a word that lets another act or spend for her stands when
/// the same key (for a voice of named people, `needed` of them) has signed it again after its place's wait has run from her clocks' receipt
/// of the first signing, or when a voice above has signed it. A wait of zero has run at once; a wait above zero runs only on her clock; a
/// place that states no wait waits for a voice above. For a key grant, a "no" of a voice above sets it aside: on her clock, when one clock's
/// line holds the no's receipt before her cutoff that closes the wait; else when the no is in the second signing's causal past.
fn power_standing(word: &Value, id: &str, list: &List, place: Place, held: &Index, within: Option<&Value>, key_grant: bool) -> Standing {
    let past = within.map(|w| held.past_of(w));
    let vis = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    if confirmed_above(word, id, list, place, held, &vis) {
        return Standing::Stands;
    }
    let Some(wait) = wait_of(list, place) else { return Standing::Waits("confirm") };
    let zero = is_zero(&wait);
    // 1.9 (00-shared, `wait` and `reach`; owner's ruling of 2026-11-19): at `PT0S` a word of a key stands when signed. Signing twice is her
    // own choice in her list, a wait above zero; a voice of named people still speaks only when `needed` of them have signed it.
    if zero && !matches!(place.index().map(|i| &list.voices[i].who), Some(Who::Names(..))) {
        return Standing::Stands;
    }
    let clock = list.clock();
    let wh = hash_of(word);
    let no = |n: &Value| key_grant && is_no(n, word, id, list, place, held);
    let reads = |d: &str| d == wh || held.get(d).is_some_and(|b| key_grant_of(b, id));
    if !zero {
        let Some(k) = &clock else { return Standing::Waits("wait") };
        if wait_run(word, &wait, k, held, &vis, &no, &reads) == Run::Blocked {
            return Standing::Never;
        }
    }
    // Signing again: a later counted block of the same signer naming the word in refs.confirms, whose causal past shows the wait run.
    let author = rs(word, "author").unwrap_or("");
    let first_key = key_of(word, held).map(|s| s.key);
    let again = |c: &Value| -> bool {
        let cp = held.past_of(c);
        let cv = |h: &str| cp.contains(h);
        zero || clock.as_ref().is_some_and(|k| wait_run(word, &wait, k, held, &cv, &no, &reads) == Run::Ran)
    };
    // a "no" in a second signing's causal past sets the word aside: that signing saw it come first
    let mine = |c: &Value| -> bool {
        match place.index().map(|i| &list.voices[i].who) {
            Some(Who::Names(names, _)) => rs(c, "author").is_some_and(|a| names.iter().any(|n| n == a)),
            _ => rs(c, "author") == Some(author) && key_of(c, held).map(|s| s.key) == first_key,
        }
    };
    if key_grant && confirms_of(word, held, &vis).filter(|c| mine(c)).any(|c| {
        let cp = held.past_of(c);
        // seat 33 mend 6: a no is a key grant about her, so only her key grants are read, never every block held per signing
        held.grants_memo().key_by_subject.get(id).into_iter().flatten().filter_map(|h| held.get(h)).any(|n| cp.contains(hash_of(n)) && no(n))
    }) {
        return Standing::Never;
    }
    let ok = match place.index().map(|i| &list.voices[i].who) {
        // 3d-18: at `PT0S` a voice of other people speaks once `needed` of them have signed it (the word, or a confirm of it), each once
        Some(Who::Names(names, needed)) if zero => {
            let mut by: Vec<&str> = confirms_of(word, held, &vis).filter_map(|c| rs(c, "author")).filter(|a| names.iter().any(|n| n == a)).collect();
            if names.iter().any(|n| n == author) {
                by.push(author);
            }
            crate::js::quorum(by.into_iter(), Some(*needed as f64))
        }
        Some(Who::Names(names, needed)) => {
            let by = confirms_of(word, held, &vis).filter(|c| {
                let a = rs(c, "author").unwrap_or("");
                names.iter().any(|n| n == a)
                    && again(c)
                    && (a == author || confirms_of(word, held, &vis).any(|e| hash_of(e) != hash_of(c) && rs(e, "author") == Some(a) && held.past_of(c).contains(hash_of(e))))
            });
            crate::js::quorum(by.filter_map(|c| rs(c, "author")), Some(*needed as f64))
        }
        _ => confirms_of(word, held, &vis).any(|c| rs(c, "author") == Some(author) && key_of(c, held).map(|s| s.key) == first_key && again(c)),
    };
    if ok {
        return Standing::Stands;
    }
    if !zero && clock.as_ref().is_none_or(|k| wait_run(word, &wait, k, held, &vis, &no, &reads) != Run::Ran) {
        return Standing::Waits("wait");
    }
    Standing::Waits("confirm")
}

// A "no" to a key grant (identity.md, Saying no is signing): another key grant for the same list, by a voice above the grant's signer.
fn is_no(n: &Value, word: &Value, id: &str, list: &List, place: Place, held: &Index) -> bool {
    hash_of(n) != hash_of(word)
        && key_grant_of(n, id)
        && st(n, "voices").is_some()
        && rs(n, "updates") == Some(list.by.as_str())
        && signed_by_author_in(n, held)
        && place_in(n, id, list, held).is_some_and(|p| p.rank() < place.rank())
}

// ---- Who speaks for her (invariant 8) ----
/// The ends of a key of hers (blocks.md, The cut): every key grant standing among the blocks held that leaves the key out of a list that
/// had it; for a key under a voice, the stop of the key grant that added it, and each end of its voice's key that did not see that grant.
fn ends_of<'a>(id: &str, key: &str, under: Option<&Value>, held: &'a Index) -> Vec<&'a Value> {
    candidate_ends(id, key, under, held).into_iter().filter(|e| is_end(e, id, held)).collect()
}
// The key grants that leave the key out (or, for a key under a voice, its voice's key, without having seen the adding grant), and the stops
// of the grant that added a key under a voice: ends once they stand (`is_end`).
fn candidate_ends<'a>(id: &str, key: &str, under: Option<&Value>, held: &'a Index) -> Vec<&'a Value> {
    let mut out: Vec<&Value> = Vec::new();
    let voice_key = under.and_then(|u| key_of(u, held)).map(|s| s.key);
    for g in held.grants_memo().key_by_subject.get(id).into_iter().flatten().filter_map(|h| held.get(h)) {
        let ends = match (under, &voice_key) {
            (Some(u), Some(vk)) => leaves_out(g, id, vk, held) && !held.past_of(g).contains(hash_of(u)),
            _ => leaves_out(g, id, key, held),
        };
        if ends {
            out.push(g);
        }
    }
    if let Some(u) = under {
        let uh = hash_of(u);
        out.extend(held.values().filter(|s| type_of(s) == "grant" && ss(s, "status") == Some("stopped") && rs(s, "updates") == Some(uh) && rs(s, "author") == Some(id)));
    }
    out
}
fn is_end(e: &Value, id: &str, held: &Index) -> bool {
    if st(e, "status").is_some() {
        return signed_by_author_in(e, held);
    }
    grant_standing(e, id, held, None) == Standing::Stands
}

// The clock a key names (identity.md, Ending a key): her list's, exactly when its voice states a reach.
fn clock_of_key(list: &List, place: Place) -> Option<Clocks> {
    place.index().and_then(|i| list.voices.get(i)).and_then(|v| v.reach.as_ref()).and_then(|_| list.clock())
}

/// Whether a block has seen an end of its key (blocks.md, The cut, Seen): the end is in its causal past, or, where the key names a clock,
/// one clock's line holds her receipt of the end before her receipt of the block. A block's own second signing of an end is not a
/// block made after that end: the end stands only by it.
fn seen(block: &Value, end: &Value, clock: Option<&Clocks>, held: &Index) -> bool {
    let eh = hash_of(end);
    !list(rf(block, "confirms")).contains(&eh)
        && (held.past_of(block).contains(eh) || clock.is_some_and(|k| end_first(hash_of(block), eh, k, held, &|_| true)))
}

/// Whether a key of the block's author spoke for her there (identity.md, invariant 8): a key of a voice of the list standing in the block's
/// own causal past, or a key under such a voice, and no end of it that the block has seen; a key a suite move replaced speaks only for what
/// that move has in its causal past. A genesis is its own author's when its key opens it. A block the reader's blocks hold or can read.
pub fn signed_by_author_in(block: &Value, index: &Index) -> bool {
    if is_genesis(block) {
        return genesis_opens(Some(block));
    }
    if index.get(hash_of(block)).is_some_and(|b| b == block) {
        let key = format!("sba:{}", hash_of(block));
        return guarded(index, &key, json!(false), || json!(speaks_read(block, index))) == Value::Bool(true);
    }
    if block.get("type").is_none() || !crate::valid::valid(block, index).is_empty() {
        // `valid` answers who said these bytes, whatever `read` says (stage 7 compare, settled): a block that is not valid is no one's word;
        // a valid one that is not read is still its signer's
        return false;
    }
    let mut all = index.clone();
    all.insert(hash_of(block).to_string(), block.clone());
    speaks_read(block, &all)
}
pub fn signed_by_author(block: &Value, blocks: &[Value]) -> bool {
    signed_by_author_in(block, &crate::js::held_index(blocks))
}

fn speaks_read(block: &Value, held: &Index) -> bool {
    let Some(id) = rs(block, "author") else { return false };
    let Some(s) = key_of(block, held) else { return false };
    let Some(list) = standing_list(id, held, Some(block)) else { return false };
    let Some(place) = place_in(block, id, &list, held) else { return false };
    let under = match place {
        Place::Under(_) => rs(block, "key").and_then(|u| held.get(u)),
        _ => None,
    };
    // a key under a voice signs no key grant
    if under.is_some() && type_of(block) == "grant" && ss(block, "kind") == Some("key") {
        return false;
    }
    let clock = clock_of_key(&list, place);
    // an end it has seen counts it for nothing; a suite move counts only what it has in its causal past
    // 1.9 3d-8 (question 5): a key grant by her voice above that key whose `counted_to` is before it puts a block joined to no other
    // person's block off her line
    let ends = candidate_ends(id, &s.key, under, held);
    let after_point = |e: &Value| ss(e, "counted_to").is_some_and(|ct| ct != hash_of(block) && held.get(ct).is_some_and(|c| rs(c, "author") == Some(id) && !held.past_of(c).contains(hash_of(block))));
    if ends.iter().any(|e| after_point(e) && !held.past_of(block).contains(hash_of(e)) && is_end(e, id, held)) && joiners_of(block, held).is_empty() {
        return false;
    }
    !ends.iter().any(|e| {
        // 1.9 3d-12: to a reader who believes the old suite, a suite move is an end, read as any end is (the half for a reader who no
        // longer believes a suite is not built: no argument of the door names a belief)
        seen(block, e, clock.as_ref(), held) && is_end(e, id, held)
    })
}

// ---- Finality (blocks.md) ----
/// Whether a word stands among the blocks held (blocks.md, Finality), read with no clock and no arrival: `stands`, and while it does not,
/// what it waits on (`wait`, `reach`, `confirm`, `end`, `named`, `condition`), each once; empty when it can never stand.
#[derive(Clone, Debug, PartialEq)]
pub struct Stood {
    pub stands: bool,
    pub waiting: Vec<&'static str>,
}
impl Stood {
    pub fn to_json(&self, block: &str) -> Value {
        json!({ "stands": self.stands, "waiting": self.waiting.iter().map(|on| json!({ "block": block, "on": on })).collect::<Vec<_>>() })
    }
}

/// `stands(block, held)` (blocks.md, Finality): every block it names for its meaning stands; it has passed every end of its key (The cut);
/// a promise, transfer or grant of a key whose voice states a reach has been held by her clock that long, or a voice above confirmed it;
/// a word that lets another act or spend for her is signed twice; and a condition it carries has held.
pub fn stands(block: &Value, index: &Index) -> Stood {
    let mut s = stands_own(block, index);
    // 1.9 stage 6 (blocks.md, Finality; circles.md, C15, C18): a block `as` a circle stands only where a row of it holds for it or every
    // owner signed it; until then it waits `on: hands`
    #[cfg(feature = "folds")]
    if let Some(circle) = rs(block, "as").filter(|c| !c.is_empty()) {
        if (s.stands || !s.waiting.is_empty()) && !crate::fold::circle::holds_in(block, circle, index) {
            s.stands = false;
            let at = s.waiting.iter().position(|w| *w == "condition").unwrap_or(s.waiting.len());
            s.waiting.insert(at, "hands");
        }
    }
    s
}

/// `stands` without the rows of the circle the block is `as` (the circle's own reading of a hand asks this).
pub(crate) fn stands_own(block: &Value, index: &Index) -> Stood {
    let key = format!("stands:{}", hash_of(block));
    let held = index.get(hash_of(block)).is_some_and(|b| b == block);
    let read = || {
        let s = stands_read(block, index);
        json!({ "stands": s.stands, "waiting": s.waiting })
    };
    let v = if held { guarded(index, &key, json!({ "stands": false, "waiting": ["end"] }), read) } else { read() };
    Stood {
        stands: v["stands"] == Value::Bool(true),
        waiting: v["waiting"].as_array().into_iter().flatten().filter_map(Value::as_str).map(|w| Standing::of(w).code()).collect(),
    }
}

fn stands_read(block: &Value, held: &Index) -> Stood {
    let never = Stood { stands: false, waiting: vec![] };
    if is_genesis(block) {
        return Stood { stands: genesis_opens(Some(block)), waiting: vec![] };
    }
    if !signed_by_author_in(block, held) {
        return never;
    }
    let (Some(id), Some(s)) = (rs(block, "author"), key_of(block, held)) else { return never };
    let Some(list) = standing_list(id, held, Some(block)) else { return never };
    let Some(place) = place_in(block, id, &list, held) else { return never };
    let mut on: Vec<&'static str> = Vec::new();
    let wait = |w: &'static str, on: &mut Vec<&'static str>| {
        if !on.contains(&w) {
            on.push(w);
        }
    };
    // every block it names for its meaning stands
    // 1.9 3d-7: no reading of a clock reaches outside the causal past of the block that relies on it: a key grant it names for its meaning
    // stands as read in that past (its reach and wait read only the clocks' blocks this block holds)
    let names = named_for_meaning(block);
    let past_only = names.iter().any(|n| held.get(n).is_some_and(|b| type_of(b) == "grant" && ss(b, "kind") == Some("key")));
    let sub = past_only.then(|| {
        let past = held.past_of(block);
        crate::js::index_of(held.values().filter(|x| past.contains(hash_of(x)) || hash_of(x) == hash_of(block)))
    });
    for n in names {
        let kg = held.get(&n).is_some_and(|b| type_of(b) == "grant" && ss(b, "kind") == Some("key"));
        let within = if kg { sub.as_ref().unwrap_or(held) } else { held };
        if !within.get(&n).is_some_and(|b| stands(b, within).stands) {
            wait("named", &mut on);
        }
    }
    // a rekey (profiles/rekeys.md, `epoch`) is her circle's encryption key, not a voice of any list: it stands as any word of its signer does
    let key_grant = type_of(block) == "grant" && ss(block, "kind") == Some("key") && st(block, "epoch").is_none();
    let mut free = false;
    if key_grant {
        let Some(subject) = rs(block, "subject") else { return never };
        match grant_standing(block, subject, held, None) {
            Standing::Stands => {}
            Standing::Waits(w) => wait(w, &mut on),
            Standing::Never => return never,
        }
        // an encryption key, or taking oneself out, waits on nothing (identity.md)
        free = standing_list(subject, held, Some(block)).is_some_and(|old| place_in(block, subject, &old, held).is_some_and(|p| free_key_grant(block, list_of(block).as_ref(), &old, p)));
    }
    if !free {
        // the cut: every end of its key it has not seen, it must pass
        let under = match place {
            Place::Under(_) => rs(block, "key").and_then(|u| held.get(u)),
            _ => None,
        };
        let clock = clock_of_key(&list, place);
        let ends = ends_of(id, &s.key, under, held);
        if ends.iter().any(|e| seen(block, e, clock.as_ref(), held)) {
            return never;
        }
        // passed: inside the end's cut; her own later counted block names it; where the key names a clock, `needed` lines received it before
        // any received the end; where it names none, another person's block joined to it that has not seen the end (1.9 3d-9: a relier's
        // counted block uses it, or the block names another's block, her yes, that has not seen the end)
        // 1.9 3d-8: her own word stands alone: a block joined to no other person's block stands against her own voices' ends when signed;
        // only a key grant of a voice above with `counted_to` before it, or a pair at its place, puts it off her line (read elsewhere)
        // question 5's second exception: a key grant by her voice above this key that names in `counted_to` the last block of it that
        // counts puts every later block of that key off her line, toward every block that does not have it in its past; for one whose block
        // already built on it, it takes back nothing
        // (3d-8: only a block joined to no other person's block; a joined block is read by the rest of The cut)
        let joiners = joiners_of(block, held);
        for e in &ends {
            let Some(ct) = ss(e, "counted_to") else { continue };
            let after_point = ct != hash_of(block) && held.get(ct).is_some_and(|c| !held.past_of(c).contains(hash_of(block)));
            if after_point && joiners.is_empty() {
                return never;
            }
        }
        // 1.9 3d-8, 3d-9: it passes an end where the end has it in its past; where it is joined to no other person's block (her own word
        // stands alone); or where another person's block is joined to it and has not seen the end (where the key names a clock: the clocks'
        // receipts of it, held in that block's past, state that no end is before it, `needed` of them)
        let passed = |e: Option<&Value>| -> bool {
            e.is_some_and(|e| hash_of(e) == hash_of(block) || held.past_of(e).contains(hash_of(block)))
                || joiners.is_empty()
                || joiners.iter().any(|o| {
                    let op = held.past_of(o);
                    match &clock {
                        Some(k) => received_first(hash_of(block), &e.map(hash_of).into_iter().collect::<Vec<_>>(), k, held, &|h| op.contains(h)),
                        None => e.is_none_or(|e| !op.contains(hash_of(e))),
                    }
                })
        };
        if ends.is_empty() && !passed(None) || ends.iter().any(|e| !passed(Some(e))) {
            wait("end", &mut on);
        }
        // reach: her promises, transfers and grants, her key grants of her own list among them (a key grant she signs in another's list
        // waits on nothing of hers)
        let reach = place.index().and_then(|i| list.voices.get(i)).and_then(|v| v.reach.clone());
        let reached = matches!(type_of(block), "promise" | "transfer" | "grant") && (!key_grant || rs(block, "subject") == Some(id));
        if let Some(reach) = reach.filter(|_| reached) {
            let vis = |_: &str| true;
            if !confirmed_above(block, id, &list, place, held, &vis) {
                // a key grant that leaves the key out sets the reach aside; a key grant is never its own end
                let leaves = |b: &Value| hash_of(b) != hash_of(block) && (key_grant_of(b, id) && ends.iter().any(|e| hash_of(e) == hash_of(b)) || leaves_out(b, id, &s.key, held));
                let bh = hash_of(block);
                let reads = |d: &str| d == bh || held.get(d).is_some_and(|b| key_grant_of(b, id));
                match list.clock().map(|k| wait_run(block, &reach, &k, held, &vis, &leaves, &reads)) {
                    Some(Run::Ran) => {}
                    Some(Run::Blocked) => return never,
                    _ => wait("reach", &mut on),
                }
            }
        }
        // a voice's bounds (identity.md, A voice's bounds): a word of a capped key that moves an amount of hers is counted on that key's
        // line; one that does not fit stands only when a voice above that key has said it
        if !bounds_fit(block, id, &s.key, &list, place, held, 0) {
            let vis = |_: &str| true;
            if !confirmed_above(block, id, &list, place, held, &vis) {
                wait("confirm", &mut on);
            }
        }
        // a word that lets another act or spend for her is signed twice
        if !key_grant && gives_power(block, held) {
            match power_standing(block, id, &list, place, held, None, false) {
                Standing::Stands => {}
                Standing::Waits(w) => wait(w, &mut on),
                Standing::Never => return never,
            }
        }
    }
    if st(block, "condition").is_some() {
        wait("condition", &mut on);
    }
    // in the order `stands` lists them (protocol.json door.ops.stands)
    const ORDER: [&str; 6] = ["wait", "reach", "confirm", "end", "named", "condition"];
    on.sort_by_key(|w| ORDER.iter().position(|o| o == w));
    Stood { stands: on.is_empty(), waiting: on }
}

/// 1.9 3d-9: the blocks of another person a block is joined to by naming them (any ref but its line's own links): her yes it is made on.
/// 1.9-GUESS [3d-8a]: naming a person by her id (her genesis) is no join: a genesis is no word; a block of another signer the block names
/// in any ref but `author`, `prev`, `key`, `after` and `confirms` is.
fn joins_out<'a>(block: &Value, held: &'a Index) -> Vec<&'a Value> {
    let me = rs(block, "author").unwrap_or("");
    let Some(refs) = block.get("refs").and_then(Value::as_object) else { return Vec::new() };
    refs.iter()
        .filter(|(k, _)| !matches!(k.as_str(), "author" | "prev" | "key" | "after" | "confirms"))
        .flat_map(|(_, v)| list(Some(v)))
        .filter_map(|h| held.get(h))
        .filter(|o| o.get("type").is_some() && !is_genesis(o) && rs(o, "author").is_some_and(|a| a != me))
        .collect()
}

/// 1.9 3d-9: the blocks of other persons joined to a block: those it names (her yes it is made on) and those that name it, by any ref but
/// `author`, `prev`, `key` and `after`; a clock's receipt or cutoff is the clock's reading, no block joined to the word.
fn joiners_of<'a>(block: &Value, held: &'a Index) -> Vec<&'a Value> {
    let me = rs(block, "author").unwrap_or("");
    let h = hash_of(block);
    let mut out = joins_out(block, held);
    let names = held.names_memo();
    for o in names.by_use.get(h).into_iter().flatten().filter_map(|n| held.get(n)) {
        let names_it = o.get("refs").and_then(Value::as_object).is_some_and(|r| r.iter().any(|(k, v)| !matches!(k.as_str(), "author" | "prev" | "key" | "after") && list(Some(v)).contains(&h)));
        let clock_word = type_of(o) == "observe" && matches!(ss(o, "kind"), Some("receipt" | "cutoff"));
        if names_it && !clock_word && hash_of(o) != h && rs(o, "author").is_some_and(|a| a != me) && signed_by_author_in(o, held) && !out.iter().any(|x| hash_of(x) == hash_of(o)) {
            out.push(o);
        }
    }
    out.retain(|o| !(type_of(o) == "observe" && matches!(ss(o, "kind"), Some("receipt" | "cutoff"))));
    // 1.9 stage 6 (C15, D13): for a gathered move (a block `as` a circle), no signer of one of its hands, no tool of hers and no one under
    // a grant she gave is another person joined to it
    #[cfg(feature = "folds")]
    if rs(block, "as").is_some_and(|c| !c.is_empty()) {
        let ours = crate::fold::circle::gathered(block, held);
        out.retain(|o| rs(o, "author").is_none_or(|a| !ours.iter().any(|x| x == a)));
    }
    out
}

// Whether a key grant leaves a key of hers out of the list it replaces (the receipt of which, before the cutoffs, sets a reach aside).
fn leaves_out(g: &Value, id: &str, key: &str, held: &Index) -> bool {
    let (Some(new), Some(old)) = (list_of(g), rs(g, "updates").and_then(|u| held.get(u)).and_then(list_of)) else { return false };
    key_grant_of(g, id) && place_of_key(key, &old).is_some() && place_of_key(key, &new).is_none()
}

// The blocks a block names for its meaning (00-shared, Names for its meaning): `refs.under`, `answers`, `updates`, `for`, `parent` and
// `schema` on every type, `state.counted_to`, and a grant's `scope.on`. (protocol.json `needs` is rebuilt to this list by stage 2.)
fn named_for_meaning(block: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for k in ["under", "answers", "updates", "for", "parent", "schema"] {
        out.extend(list(rf(block, k)).into_iter().map(String::from));
    }
    out.extend(ss(block, "counted_to").map(String::from));
    if type_of(block) == "grant" {
        out.extend(list(crate::js::get(block, "state.scope.on")).into_iter().map(String::from));
    }
    out.sort();
    out.dedup();
    out
}

/// What a word of a key moves of hers, for a voice's line (identity.md, A voice's bounds): a transfer, its `state.amount`; a key grant that
/// adds a key under a voice and passes it a part, that part (`state.limit`). None for any other word.
fn bound_amount(block: &Value, id: &str) -> Option<crate::decimal::Amount> {
    match type_of(block) {
        "transfer" if st(block, "status").is_none() => crate::decimal::Amount::of(st(block, "amount")),
        "grant" if ss(block, "kind") == Some("key") && st(block, "voices").is_none() && rs(block, "subject") == Some(id) => crate::decimal::Amount::of(st(block, "limit")),
        _ => None,
    }
}

/// Whether a word fits on its key's line (identity.md, A voice's bounds): its place's `each` and `limit` (a voice's own, or the part the
/// key grant of a key under a voice passed it), with `every` the line's period turning at the cutoffs of her list's clocks whose
/// `refs.subject` is the block that brought the key in and whose span is no shorter than `every`. The words before it on that line that
/// fit are counted; a word a voice above said instead holds nothing on it.
fn bounds_fit(block: &Value, id: &str, key: &str, list: &List, place: Place, held: &Index, depth: usize) -> bool {
    let Some(a) = bound_amount(block, id) else { return true };
    let bounds: Option<&Value> = match place {
        Place::At(i) => list.voices.get(i).map(|v| &v.raw),
        Place::Under(_) => rs(block, "key").and_then(|u| held.get(u)).and_then(|u| u.get("state")),
    };
    let Some(bounds) = bounds else { return true };
    let amount = |k: &str| crate::decimal::Amount::of(bounds.get(k));
    let (each, limit) = (amount("each"), amount("limit"));
    if each.is_none() && limit.is_none() {
        return true;
    }
    if each.as_ref().is_some_and(|e| e.kind != a.kind || a.value.cmp(&e.value) == core::cmp::Ordering::Greater) {
        return false;
    }
    let Some(limit) = limit else { return true };
    if limit.kind != a.kind || depth > 64 {
        return false;
    }
    let brought = rs(block, "key").unwrap_or(id);
    let every = bounds.get("every").and_then(Value::as_str);
    let period = |b: &Value| -> usize {
        let (Some(every), Some(clocks)) = (every, list.clock()) else { return 0 };
        let past = held.past_of(b);
        let lines: Vec<crate::line::Line> = clocks.names.iter().filter_map(|n| crate::line::line_named(n, held)).collect();
        held.values()
            .filter(|c| {
                type_of(c) == "observe"
                    && ss(c, "kind") == Some("cutoff")
                    && rs(c, "subject") == Some(brought)
                    && ss(c, "when").is_some_and(|w| crate::time::parse_duration(w).is_some() && crate::grant::cmp_value(&json!(w), &json!(every)).is_some_and(|o| o != core::cmp::Ordering::Less))
                    && past.contains(hash_of(c))
                    && lines.iter().any(|l| crate::line::on_line(c, l, held))
            })
            .count()
    };
    let mine = period(block);
    let past = held.past_of(block);
    let used = held
        .values()
        .filter(|x| hash_of(x) != hash_of(block) && past.contains(hash_of(x)) && rs(x, "author") == Some(id) && rs(x, "key") == rs(block, "key"))
        .filter(|x| key_of(x, held).is_some_and(|k| k.key == key))
        .filter(|x| bound_amount(x, id).is_some_and(|b| b.kind == limit.kind) && period(x) == mine && bounds_fit(x, id, key, list, place, held, depth + 1))
        .filter_map(|x| bound_amount(x, id))
        .fold(crate::decimal::Dec::zero(), |t, b| t.add(&b.value));
    used.add(&a.value).cmp(&limit.value) != core::cmp::Ordering::Greater
}

// A word that lets another act or spend for her (blocks.md, Finality, Signed twice): a grant (not a stop, an answer or a machine lock), an
// account word, a hand-over of a claim (a transfer that names in `refs.what` any block that is not a thing: 1.9 R-J5).
fn gives_power(block: &Value, held: &Index) -> bool {
    match type_of(block) {
        "grant" => st(block, "status").is_none() && rf(block, "answers").is_none() && ss(block, "kind") != Some("stop"),
        // an account word; and her lift of a stop of one thing (`resumed`), which gives her tools their power back
        "observe" => (ss(block, "kind") == Some("account") && st(block, "status").is_none()) || (ss(block, "status") == Some("resumed") && rf(block, "updates").is_some()),
        // 1.9 R-J5: a hand-over of a claim (a receiving place, a claim) is a transfer that names in `refs.what` any block that is not a `thing`
        "transfer" => st(block, "status").is_none() && list(rf(block, "what")).iter().any(|w| held.get(*w).is_some_and(|d| type_of(d) != "thing")),
        _ => false,
    }
}

// ---- Forks (core.md, invariant 3; folds.md, A fork is a burden) ----
// Each block of a known author, read once: (hash, author, the key that signed it, whether it speaks for its author). A block held by its
// header alone is read too: a pair needs no body, its two headers are the whole proof. An author whose genesis is not held is unknown:
// none of their blocks is read here, so nothing of theirs is void or forked.
fn read_authors(index: &Index) -> Vec<(String, String, Option<String>, bool)> {
    let mut out = Vec::new();
    for b in index.values() {
        let Some(a) = rs(b, "author").filter(|a| !a.is_empty() && st(b, "seq").is_some()) else { continue };
        if !genesis_opens(index.get(a)) {
            continue;
        }
        let speaks = b.get("type").is_none() || signed_by_author_in(b, index);
        out.push((hash_of(b).to_string(), a.to_string(), key_of(b, index).map(|s| s.key), speaks));
    }
    out
}

/// The groups of blocks already read that prove a lie (core.md, invariant 3): blocks that speak, of one author and one key, that name one
/// `prev` or state one `seq`, two or more to a group, each group ascending. A block may be in two groups.
fn groups_of(read: &[(String, String, Option<String>, bool)], index: &Index) -> Vec<Vec<String>> {
    let mut groups: alloc::collections::BTreeMap<(&str, &str, String), Vec<String>> = Default::default();
    for (h, author, key, speaks) in read {
        let (Some(key), true) = (key, *speaks) else { continue };
        let Some(b) = index.get(h) else { continue };
        if let Some(p) = rs(b, "prev") {
            groups.entry((author.as_str(), key.as_str(), format!("prev {p}"))).or_default().push(h.clone());
        }
        if let Some(n) = int(st(b, "seq")) {
            groups.entry((author.as_str(), key.as_str(), format!("seq {n}"))).or_default().push(h.clone());
        }
    }
    groups
        .into_values()
        .filter_map(|mut g| {
            g.sort();
            g.dedup();
            (g.len() > 1).then_some(g)
        })
        .collect()
}

/// The groups of a pair among the blocks held (`groups_of`): each group of two or more blocks of one key on one `prev` or at one `seq`.
pub fn pair_groups_in(index: &Index) -> Vec<Vec<String>> {
    // read once per state of the blocks (a fold asks it once per measure)
    let v = index.stage_memo("identity:pair_groups", || json!(groups_of(&read_on_line(index), index)));
    v.as_array().into_iter().flatten().map(|g| g.as_array().into_iter().flatten().filter_map(Value::as_str).map(String::from).collect()).collect()
}

// The blocks read (`read_authors`) that are on a line of their key: a block on no line is no block of a pair (1.9 3b-1).
fn read_on_line(index: &Index) -> Vec<(String, String, Option<String>, bool)> {
    read_authors(index).into_iter().filter(|(h, ..)| !index.get(h).is_some_and(|b| off_line_in(b, index))).collect()
}

/// The pairs that prove the lie of each group, as a star (nodes.md): every block of it paired with the group's lowest hash. Each pair
/// sorted, the list sorted.
fn pairs_of(read: &[(String, String, Option<String>, bool)], index: &Index) -> Vec<[String; 2]> {
    let mut pairs: alloc::collections::BTreeSet<[String; 2]> = Default::default();
    for group in groups_of(read, index) {
        for other in group.iter().skip(1) {
            pairs.insert([group[0].clone(), other.clone()]);
        }
    }
    pairs.into_iter().collect()
}

/// The pairs of blocks, among these, that one key of one author signed naming one `prev` or stating one `seq`, both speaking for their
/// author: each pair sorted, and the list sorted. Read from bodies or headers.
pub fn fork_pairs_in(index: &Index) -> Vec<[String; 2]> {
    pairs_of(&read_on_line(index), index)
}

/// Mark in memory every block a fold does not count for its signer's claim: `_void` when its key does not speak for its author, `_fork`
/// for the pair members and every block of the same key whose `seq` is at or above the lower `seq` of a pair (folds.md, A fork is a
/// burden): a burden, never a claim (`binds_signer`). Blocks of another key of the same author are not touched.
pub fn mark_forks(index: &mut Index) {
    let read = read_authors(index);
    // Every block is marked, `true` or `false`: a block that says `false` has been looked at, so `counts_in` never has to read the
    // authors again for each block it is asked about.
    for b in index.values_mut() {
        if b.is_object() {
            b["_fork"] = json!(false);
            b["_void"] = json!(false);
            b["_out"] = json!(false);
            b["_off"] = json!(false);
        }
    }
    for (h, _, _, speaks) in &read {
        if !speaks {
            if let Some(b) = index.get_mut(h) {
                b["_void"] = json!(true);
            }
        }
    }
    // 1.9 3b-1, In its place: a block is in its place on its key's line where its `prev` names a block of that key and its `seq` is above
    // that block's, or, for a key's first block, where its `prev` names the first block that brought that key in and its `seq` is 1. A
    // block whose `prev` the reader does not hold is not shown, never out of place. A block whose `prev` is held and names neither a block
    // of its key nor the first block that brought its key in is on no line of that key (`_off`: a draw it signs is `not_on_line`, and it is
    // no block of a pair). Of several blocks that bring one key in, the first is the one the others have in their causal past; where none is
    // (two apart), none starts the line. A block out of its place, or on no line, takes nothing and binds its signer as a block of a fork
    // does (`_out`, `_off`, read by `counts_in` and `fork_burden`).
    let key_at: alloc::collections::BTreeMap<&str, (&str, Option<&str>)> = read.iter().map(|(h, a, k, _)| (h.as_str(), (a.as_str(), k.as_deref()))).collect();
    let mut bringers: alloc::collections::BTreeMap<(String, String), Option<String>> = Default::default();
    let mut first_bringer = |author: &str, key: &str, index: &Index| -> Option<String> {
        bringers
            .entry((author.to_string(), key.to_string()))
            .or_insert_with(|| {
                let bs: Vec<&Value> = index
                    .values()
                    .filter(|x| x.get("type").is_some() && (hash_of(x) == author || key_grant_of(x, author)) && brings_in(x, author, index).iter().any(|(k, _)| k == key))
                    .collect();
                let mins: Vec<&&Value> = bs.iter().filter(|x| !bs.iter().any(|y| hash_of(y) != hash_of(x) && index.past_of(x).contains(hash_of(y)))).collect();
                match mins.as_slice() {
                    [one] => Some(hash_of(one).to_string()),
                    _ => None,
                }
            })
            .clone()
    };
    let (mut out_of_place, mut off): (Vec<String>, Vec<String>) = (Vec::new(), Vec::new());
    for (h, a, k, _) in &read {
        let Some(b) = index.get(h) else { continue };
        let (Some(p), Some(seq)) = (rs(b, "prev"), int(st(b, "seq"))) else { continue };
        let Some(q) = index.get(p) else { continue };
        let same_key = p != a.as_str() && key_at.get(p).is_some_and(|(pa, pk)| *pa == a.as_str() && pk.is_some() && *pk == k.as_deref());
        if same_key {
            if !int(st(q, "seq")).is_some_and(|ps| seq > ps) {
                out_of_place.push(h.clone());
            }
            continue;
        }
        match k.as_deref().and_then(|k| first_bringer(a, k, index)) {
            Some(f) if f == p => {
                if seq != 1.0 {
                    out_of_place.push(h.clone());
                }
            }
            _ => off.push(h.clone()),
        }
    }
    for h in out_of_place {
        if let Some(b) = index.get_mut(&h) {
            b["_out"] = json!(true);
        }
    }
    for h in &off {
        if let Some(b) = index.get_mut(h) {
            b["_off"] = json!(true);
        }
    }
    // a block on no line of its key is no block of a pair
    let read_on: Vec<(String, String, Option<String>, bool)> = read.iter().filter(|(h, ..)| !off.contains(h)).cloned().collect();
    let pairs = pairs_of(&read_on, index);
    if pairs.is_empty() {
        return;
    }
    let seq_of = |h: &str| index.get(h).and_then(|b| int(st(b, "seq")));
    let line_of: alloc::collections::BTreeMap<&str, (&str, &str)> =
        read.iter().filter_map(|(h, a, k, _)| k.as_deref().map(|k| (h.as_str(), (a.as_str(), k)))).collect();
    // the lowest seq of a pair on each line: from there on, every block of that key is a fork's
    let mut from: alloc::collections::BTreeMap<(&str, &str), f64> = Default::default();
    for [a, b] in &pairs {
        let (Some(line), Some(sa), Some(sb)) = (line_of.get(a.as_str()), seq_of(a), seq_of(b)) else { continue };
        let low = sa.min(sb);
        from.entry(*line).and_modify(|x| *x = x.min(low)).or_insert(low);
    }
    let marked: Vec<String> = read
        .iter()
        .filter(|(h, a, k, _)| k.as_deref().is_some_and(|k| from.get(&(a.as_str(), k)).is_some_and(|low| seq_of(h).is_some_and(|s| s >= *low))))
        .map(|(h, ..)| h.clone())
        .collect();
    for h in marked {
        if let Some(b) = index.get_mut(&h) {
            b["_fork"] = json!(true);
        }
    }
}

// The marks of a block, read from the index once it is marked (else from a marked copy).
fn mark_of(block: &Value, index: &Index, mark: &str) -> bool {
    if let Some(m) = block.get(mark) {
        return m == &Value::Bool(true);
    }
    if let Some(held) = index.get(hash_of(block)) {
        if let Some(m) = held.get(mark) {
            return m == &Value::Bool(true);
        }
        // held but unmarked: mark a copy of the whole index once (kept beside it), not once per block asked about
        let marks = index.marks_memo(|| {
            let mut copy = index.clone();
            mark_forks(&mut copy);
            let on = |b: &Value, m: &str| b.get(m) == Some(&Value::Bool(true));
            copy.iter().map(|(h, b)| (h.clone(), (on(b, "_fork"), on(b, "_void"), on(b, "_out"), on(b, "_off")))).collect()
        });
        return marks.get(hash_of(block)).is_some_and(|&(fork, void, out, off)| match mark {
            "_fork" => fork,
            "_out" => out,
            "_off" => off,
            _ => void,
        });
    }
    let mut copy = index.clone();
    copy.entry(hash_of(block).to_string()).or_insert_with(|| block.clone());
    mark_forks(&mut copy);
    copy.get(hash_of(block)).is_some_and(|b| b.get(mark) == Some(&Value::Bool(true)))
}

/// Whether a block is one of a pair of one key that name one `prev`, or a later block of that key: proof of a lie, a burden on its
/// signer and never her claim in every fold but the identity fold (folds.md, A fork is a burden).
pub fn forked_in(block: &Value, index: &Index) -> bool {
    mark_of(block, index, "_fork")
}

/// Whether a block is out of its place on its key's line (1.9 3b-1, folds.md, A line): it takes nothing, and binds its signer as a block of
/// a fork does.
pub fn out_of_place_in(block: &Value, index: &Index) -> bool {
    mark_of(block, index, "_out")
}

/// Whether a block is on no line of its key (1.9 3b-1): its `prev` is held and names neither a block of its key nor the first block that
/// brought its key in. A draw it signs takes nothing (`not_on_line`); it binds its signer as a block of a fork does.
pub fn off_line_in(block: &Value, index: &Index) -> bool {
    mark_of(block, index, "_off")
}

/// Whether a block's key does not speak for its author (invariant 8).
pub fn void_in(block: &Value, index: &Index) -> bool {
    mark_of(block, index, "_void")
}

pub fn forked(block: &Value, blocks: &[Value]) -> bool {
    forked_in(block, &crate::js::held_index(blocks))
}

/// Whether a block counts in a fold other than the identity fold: a genesis, or a block whose key speaks for its author (not void)
/// and has not signed two blocks naming one `prev` at or before it. Folds mark the blocks once (`mark_forks`) so this is a lookup.
pub fn counts_in(block: &Value, index: &Index) -> bool {
    if is_genesis(block) {
        return true;
    }
    if st(block, "seq").is_none() {
        return false;
    }
    !void_in(block, index) && !forked_in(block, index) && !out_of_place_in(block, index) && !off_line_in(block, index)
}

/// fork-as-burden (folds.md, A fork is a burden): a block of a forked key (and not of a void one) counts for its signer's claim never, but
/// counts as what its signer owes, and as the base of another's acceptance.
pub fn fork_burden(block: &Value, index: &Index) -> bool {
    !counts_in(block, index) && st(block, "seq").is_some() && (forked_in(block, index) || out_of_place_in(block, index) || off_line_in(block, index)) && !void_in(block, index)
}

/// Whether a block binds its signer: it counts, or it is a fork's block that is not a stop or a decline (those would free her by her own
/// word). The one rule folds read for what a signer owes, or what another built on (folds.md, A fork is a burden).
pub fn binds_signer(block: &Value, index: &Index) -> bool {
    counts_in(block, index) || (fork_burden(block, index) && !matches!(ss(block, "status"), Some("stopped" | "declined")))
}


// ---- The identity fold ----
/// One key an id has held (the door's `key_timeline`): the block that brought it in, its place in the list that brought it (None for a key
/// under a voice), the key of the voice it is under, its suite, and the key grant (or stop) that ended it.
#[derive(Debug, Clone, PartialEq)]
pub struct KeyEntry {
    pub key: String,
    pub by: String,
    pub voice: Option<usize>,
    pub under: Option<String>,
    pub suite: String,
    pub ended: Option<String>,
}
impl KeyEntry {
    pub fn to_json(&self) -> Value {
        json!({ "key": self.key, "by": self.by, "voice": self.voice, "under": self.under, "suite": self.suite, "ended": self.ended })
    }
}

/// Every key a list or a key grant of hers brought in, among the blocks held, in the order of the blocks that brought them in: the keys of
/// the lists that stood, the keys they showed, and the keys under a voice whose key grant stands.
pub fn key_timeline_in(id: &str, index: &Index) -> Vec<KeyEntry> {
    let chain = standing_chain(id, index, None);
    let Some(last) = chain.last() else { return vec![] };
    let mut out: Vec<KeyEntry> = Vec::new();
    let ended_list = |k: &str, from: usize| chain[from + 1..].iter().find(|l| place_of_key(k, l).is_none()).map(|l| l.by.clone());
    for (n, l) in chain.iter().enumerate() {
        for (i, v) in l.voices.iter().enumerate() {
            if let Who::Key(k) = &v.who {
                if !out.iter().any(|e| e.key == *k) {
                    out.push(KeyEntry { key: k.clone(), by: l.by.clone(), voice: Some(i), under: None, suite: v.suite.clone(), ended: ended_list(k, n) });
                }
            }
        }
    }
    let grants = index.grants_memo();
    for g in grants.key_by_subject.get(id).into_iter().flatten().filter_map(|h| index.get(h)) {
        if let Some((k, suite)) = shown_key(g, id, index).filter(|_| signed_by_author_in(g, index)) {
            if !out.iter().any(|e| e.key == k) {
                let n = chain.iter().rposition(|l| place_of_key(&k, l).is_some()).unwrap_or(0);
                let voice = place_of_key(&k, &chain[n]);
                out.push(KeyEntry { key: k.clone(), by: hash_of(g).to_string(), voice, under: None, suite, ended: ended_list(&k, n) });
            }
        }
        if st(g, "voices").is_none() && grant_standing(g, id, index, None) == Standing::Stands {
            if let (Some(k), Some(voice)) = (ss(g, "public_key_sign"), key_of(g, index)) {
                if !out.iter().any(|e| e.key == k) {
                    let ended = if under_place(g, id, last, index, None).is_some() { None } else { ends_of(id, k, Some(g), index).first().map(|e| hash_of(e).to_string()).or_else(|| Some(String::new())) };
                    out.push(KeyEntry { key: k.to_string(), by: hash_of(g).to_string(), voice: None, under: Some(voice.key), suite: suite_named(g), ended });
                }
            }
        }
    }
    // in the order of the blocks that brought them in; of one block, by place (a key under a voice last)
    let order = |e: &KeyEntry| (index.get(&e.by).map_or(0, |b| index.past_of(b).len()), e.by.clone(), e.voice.unwrap_or(usize::MAX));
    out.sort_by_key(order);
    out
}
pub fn key_timeline(id: &str, blocks: &[Value]) -> Vec<KeyEntry> {
    key_timeline_in(id, &crate::js::held_index(blocks))
}

/// The keys of an id that speak now (nodes.md, Messages): the keys of the standing list's voices, the keys they showed, and the keys under
/// them whose key grant stands, that no standing key grant or stop has ended. Sorted.
pub fn live_keys_in(id: &str, index: &Index) -> Vec<String> {
    let Some(last) = standing_list(id, index, None) else { return vec![] };
    let mut out: Vec<String> = key_timeline_in(id, index)
        .into_iter()
        .filter(|e| e.ended.is_none() && (e.under.is_some() || place_of_key(&e.key, &last).is_some()))
        .map(|e| e.key)
        .collect();
    out.sort();
    out.dedup();
    out
}
pub fn live_keys(id: &str, blocks: &[Value]) -> Vec<String> {
    live_keys_in(id, &crate::js::held_index(blocks))
}

/// The identity fold (folds.md, What each fold returns): `{ signed_by_author, voices, clocks, keys, waiting }` (1.9 stage 4: `operators` left with the operator grant).
pub fn identity_state(id: &str, blocks: &[Value]) -> Value {
    let index = crate::js::held_index(blocks);
    let list = standing_list(id, &index, None);
    let mine = |b: &Value| hash_of(b) == id || rs(b, "author") == Some(id);
    let signed: Map<String, Value> = index.values().filter(|b| mine(b)).map(|b| (hash_of(b).to_string(), Value::Bool(signed_by_author_in(b, &index)))).collect();
    let mut waiting: Vec<Value> = Vec::new();
    for b in index.values().filter(|b| hash_of(b) != id && (rs(b, "author") == Some(id) || key_grant_of(b, id))) {
        let s = stands(b, &index);
        if !s.stands {
            waiting.extend(s.waiting.iter().map(|on| json!({ "block": hash_of(b), "on": on })));
        }
    }
    waiting.sort_by(|a, b| (a["block"].as_str(), a["on"].as_str()).cmp(&(b["block"].as_str(), b["on"].as_str())));
    json!({
        "signed_by_author": Value::Object(signed),
        // 1.9 3b-11: per voice, whether it states that what it signs passes
        "voices": list.as_ref().map(|l| l.voices.iter().map(|v| {
            let mut raw = v.raw.clone();
            if let Some(o) = raw.as_object_mut() {
                let passes = o.get("passes") == Some(&Value::Bool(true));
                o.insert("passes".into(), Value::Bool(passes));
            }
            raw
        }).collect::<Vec<_>>()).unwrap_or_default(),
        "clocks": list.as_ref().and_then(|l| l.clocks.clone()),
        "keys": live_keys_in(id, &index),
        "waiting": waiting,
    })
}

// ---- Chains ----
/// One key's chain for an id.
#[derive(Debug, Clone, PartialEq)]
pub struct KeyChain {
    pub key: String,
    pub by: String,
    pub chain: Chain,
}

/// Each key's chain for an id. Blocks without seq sit in no chain.
pub fn chains_of_in(id: &str, index: &Index) -> Vec<KeyChain> {
    key_timeline_in(id, index)
        .into_iter()
        .map(|e| {
            let signed: Vec<Value> = index
                .values()
                .filter(|b| rs(b, "author") == Some(id) && int(st(b, "seq")).is_some() && key_of(b, index).is_some_and(|s| s.key == e.key))
                .cloned()
                .collect();
            let bringer = bringer_of(id, &e.key, index).unwrap_or_else(|| e.by.clone());
            KeyChain { key: e.key, chain: check_chain(&signed, &bringer), by: bringer }
        })
        .collect()
}
pub fn chains_of(id: &str, blocks: &[Value]) -> Vec<KeyChain> {
    chains_of_in(id, &crate::js::held_index(blocks))
}

/// The block that brought a key of hers in, as her blocks name it in `refs.key` (none for her genesis key, whose blocks name none): the
/// earliest key grant about her that brings the key in, or, for a key named by hash and not yet shown, the list that holds its hash.
pub fn key_ref_for(id: &str, public_key: &str, index: &Index) -> Option<String> {
    if index.get(id).and_then(|g| ss(g, "public_key_sign")) == Some(public_key) {
        return None;
    }
    let grants = index.grants_memo();
    let mut found: Vec<&Value> = grants
        .key_by_subject
        .get(id)
        .into_iter()
        .flatten()
        .filter_map(|h| index.get(h))
        .filter(|g| brings_in(g, id, index).iter().any(|(k, _)| k == public_key))
        .collect();
    if found.is_empty() {
        found = grants
            .key_by_subject
            .get(id)
            .into_iter()
            .flatten()
            .filter_map(|h| index.get(h))
            .filter(|g| list_of(g).is_some_and(|l| l.voices.iter().any(|v| matches!(&v.who, Who::Hash(h) if key_hash_in(&v.suite, public_key) == *h))))
            .collect();
    }
    found.sort_by_key(|g| (index.past_of(g).len(), hash_of(g).to_string()));
    found.first().map(|g| hash_of(g).to_string())
}

// The block a key's first block names in `prev`: her genesis for the genesis key, else the block it names in refs.key.
fn bringer_of(id: &str, public_key: &str, index: &Index) -> Option<String> {
    match key_ref_for(id, public_key, index) {
        None => index.get(id).filter(|g| ss(g, "public_key_sign") == Some(public_key)).map(|_| id.to_string()),
        some => some,
    }
}

/// Where an id's next block goes for one of its keys. A key that has signed two blocks naming one `prev` goes on from its highest place
/// only when `forked_ok` (a key grant that takes the key out may still be written: identity.md, Taking oneself out).
pub fn next_link_for_in(id: &str, public_key: &str, index: &Index, forked_ok: bool) -> Result<Link> {
    let bringer = bringer_of(id, public_key, index).ok_or_else(|| Error::new("identity: that key is not one of theirs"))?;
    let mine: Vec<Value> = index
        .values()
        .filter(|b| rs(b, "author") == Some(id) && int(st(b, "seq")).is_some() && key_of(b, index).is_some_and(|s| s.key == public_key))
        .cloned()
        .collect();
    let chain = check_chain(&mine, &bringer);
    if !chain.equivocations.is_empty() && !forked_ok {
        return Err(Error::new("identity: this key has signed two blocks naming one prev"));
    }
    let head = chain.head.clone().or_else(|| mine.iter().max_by(|a, b| int(st(a, "seq")).partial_cmp(&int(st(b, "seq"))).unwrap_or(core::cmp::Ordering::Equal).then(hash_of(b).cmp(hash_of(a)))).cloned());
    next_link(head.as_ref(), Some(&bringer))
}
pub fn next_link_for(id: &str, public_key: &str, blocks: &[Value]) -> Result<Link> {
    next_link_for_in(id, public_key, &crate::js::held_index(blocks), false)
}
