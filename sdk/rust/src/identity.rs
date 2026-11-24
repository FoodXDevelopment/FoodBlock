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
use crate::line::{end_first, wait_run, Run};
use crate::prelude::*;
use crate::sign::sign_in;
use crate::tasks::{clocks_of, Clocks};
use crate::finality::*;

/// Whether a public key opens a block's signature, in the key's suite: over its header (a genesis: its own bytes). A block given by its
/// header alone carries the same one signature as `header_signature`.
pub fn opens_as(block: &Value, public_key: &str, suite: &str) -> bool {
    match block.get("signature").or_else(|| block.get("header_signature")).and_then(Value::as_str) {
        Some(sig) if !sig.is_empty() && !public_key.is_empty() => scoped::opens(block, sig, public_key, suite),
        _ => false,
    }
}

/// One push judges every block of a chain against the store as it stood when its round began, and each round reads the author's keys
/// again: the same given block is checked against the same key round after round. Inside one push (`Scope`), a verdict is remembered by
/// the block's id, its signature and the key, so it is checked once.
/// The ids in one push are one view: the store is keyed by them, and a block off the wire is checked with no id until the node has
/// computed its own (`with_id_in`). Outside a push, nothing is remembered here.
pub(crate) mod scoped {
    use crate::prelude::*;
    #[cfg(feature = "std")]
    std::thread_local! {
        static VERDICTS: core::cell::RefCell<Option<alloc::collections::BTreeMap<(String, String, String, String), bool>>> = const { core::cell::RefCell::new(None) };
    }
    #[cfg(feature = "sync")]
    pub(crate) struct Scope {
        #[cfg(feature = "std")]
        outer: bool,
    }
    #[cfg(feature = "sync")]
    impl Scope {
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
    #[cfg(feature = "sync")]
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
/// a given author opens it.
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

pub(crate) fn signed(block: Value, private_key: &str, suite: &str) -> Result<Value> {
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
pub fn brings_in(p: &Value, author: &str, blocks: &Index) -> Vec<(String, String)> {
    if hash_of(p) == author {
        if !is_genesis(p) {
            return vec![];
        }
        // a genesis that states her list brings in each `key` voice of it
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
    out.extend(shown_key(p, author, blocks));
    out
}

/// The key a key grant shows (identity.md, Her voices): its `state.shown_key`, when a `key_hash` voice of the list its `refs.key` names
/// (a list of hers) holds that key's hash, in that voice's suite.
pub(crate) fn shown_key(p: &Value, author: &str, blocks: &Index) -> Option<(String, String)> {
    let k = ss(p, "shown_key")?;
    if !key_grant_of(p, author) {
        return None;
    }
    // the list that holds the hash: a key grant, or her genesis where it states her list (core.md, section 5)
    let holder = rs(p, "key").and_then(|h| blocks.get(h)).filter(|l| key_grant_of(l, author) || (hash_of(l) == author && genesis_opens(Some(l))))?;
    // the key's own SPKI names its suite (core.md, Suites; a `key_hash` voice states none): the hash and the opening are in that suite
    //
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
/// no `refs.key` is signed by its author's genesis key. A block given by its header alone is read the same way, from the header's `key`.
/// None when no such key opens it over its header, or its pieces are not given.
pub fn key_of(block: &Value, blocks: &Index) -> Option<Signer> {
    if let Some(s) = blocks.signer_memo_get(block) {
        return s;
    }
    let s = key_read(block, blocks);
    blocks.signer_memo_set(block, s.clone());
    s
}
/// The same (the name every reader of a block's signer calls).
pub fn signer_in(block: &Value, blocks: &Index) -> Option<Signer> {
    key_of(block, blocks)
}

/// The keys a block's pieces name, with their suites: those the block its `refs.key` names brings in (none when that block is not given
/// or is not a key grant about the author), or the author's genesis key with no `refs.key`; and a key the block shows itself, for a key
/// named by hash speaks first in the key grant that shows it. None when the author's genesis is not given as one.
pub(crate) fn named_keys(block: &Value, blocks: &Index) -> Option<Vec<(String, String)>> {
    let author = rs(block, "author")?;
    let root = blocks.get(author).filter(|r| genesis_opens(Some(r)))?;
    let mut keys = match rs(block, "key") {
        None => brings_in(root, author, blocks),
        // a block of the genesis key names none: one that names the genesis there names no key grant
        Some(k) if k == author => vec![],
        Some(k) => blocks.get(k).map(|g| match g.get("_brings").and_then(Value::as_array) {
            // a key grant given as its header because this reader cannot read it still brings its keys in (valid::pool keeps them)
            Some(b) if g.get("type").is_none() && rs(g, "subject").is_none_or(|s| s == author) => b.iter().filter_map(|x| Some((x.get(0)?.as_str()?.to_string(), x.get(1)?.as_str()?.to_string()))).collect(),
            _ => brings_in(g, author, blocks),
        }).unwrap_or_default(),
    };
    keys.extend(shown_key(block, author, blocks));
    keys.retain(|(k, _)| !k.is_empty());
    Some(keys)
}

pub(crate) fn key_read(block: &Value, blocks: &Index) -> Option<Signer> {
    let (key, suite) = named_keys(block, blocks)?.into_iter().find(|(k, s)| opens_as(block, k, s))?;
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
// A voice as it was is the whole voice: who, its suite, its wait and reach, and the rest it states (its bounds, `passes`, `receives`,
// `above`).
impl PartialEq for Voice {
    fn eq(&self, o: &Voice) -> bool {
        self.who == o.who && self.suite == o.suite && self.wait == o.wait && self.reach == o.reach && self.rest(None) == o.rest(None)
    }
}
impl Voice {
    /// What the voice states beside who it is, its suite, its wait and its reach, less `drop`.
    fn rest(&self, drop: Option<&str>) -> serde_json::Map<String, Value> {
        const WHO: [&str; 7] = ["key", "key_hash", "names", "needed", "suite", "wait", "reach"];
        self.raw.as_object().map(|o| o.iter().filter(|(k, _)| !WHO.contains(&k.as_str()) && Some(k.as_str()) != drop).map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default()
    }
    /// This place kept as it was, bar the key in it: a new key there starts with no `passes` (identity.md, A voice changes only what
    /// is below it).
    fn kept_bar_key(&self, n: &Voice) -> bool {
        if matches!(self.who, Who::Names(..)) || matches!(n.who, Who::Names(..)) {
            return false;
        }
        // the key in it, its suite with it, may change (a key's own key grant is never a suite move: read apart)
        if self.wait != n.wait || self.reach != n.reach {
            return false;
        }
        if self.who == n.who {
            self.rest(None) == n.rest(None)
        } else {
            n.raw.get("passes").is_none() && self.rest(Some("passes")) == n.rest(None)
        }
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
    pub(crate) fn clock(&self) -> Option<Clocks> {
        self.clocks.as_ref().and_then(clocks_of)
    }
}

/// her closes: each key grant of her standing chain that leaves no voice (by its hash).
pub(crate) fn closes_of(id: &str, blocks: &Index) -> Vec<String> {
    standing_chain(id, blocks, None).into_iter().filter(|l| l.voices.is_empty() && l.by != id).map(|l| l.by).collect()
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
        // a genesis may state her whole list in `state.voices`, the highest voice first, as a key grant does
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
    //
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
    pub(crate) fn index(&self) -> Option<usize> {
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
    pub(crate) fn code(&self) -> &'static str {
        match self {
            Standing::Stands => "stands",
            Standing::Waits(w) => w,
            Standing::Never => "never",
        }
    }
    pub(crate) fn of(code: &str) -> Standing {
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

// A reading of the given blocks, remembered by key for this state of the blocks. A reading asked again while it is being read (the folds of
// two people who name each other's lists) gets `busy` for that inner question: every reading descends into strictly earlier causal pasts,
// so this is met only by a reader-wide question asked again from inside itself.
pub(crate) fn guarded(blocks: &Index, key: &str, busy: Value, f: impl FnOnce() -> Value) -> Value {
    if let Some(v) = blocks.stage_peek(key) {
        return v;
    }
    let mark = format!("busy:{key}");
    if blocks.stage_peek(&mark).is_some() {
        // a value read while its own question is open is a default, not an answer: nothing computed from it is kept (a key grant's standing, read inside its own `signed_by_author`, would be kept as `never`)
        blocks.taint_bump();
        return busy;
    }
    blocks.stage_put(&mark, Value::Bool(true));
    let t0 = blocks.taint();
    let v = f();
    blocks.stage_drop(&mark);
    if blocks.taint() == t0 {
        blocks.stage_put(key, v.clone());
    }
    v
}

// What a reader lets in: everything given, or a block's causal past (the block itself left out).
pub(crate) fn within_key(within: Option<&Value>) -> String {
    within.map_or_else(|| String::from("*"), |w| hash_of(w).to_string())
}

/// The lists that have stood for an id, oldest first, among the blocks given or within a block's causal past (identity.md, Her voices):
/// from her genesis, each next list is the key grant stating `voices` that names the last in `refs.updates` and stands; where several do,
/// the one of the highest voice. Empty when her genesis is not given.
pub fn standing_chain(id: &str, blocks: &Index, within: Option<&Value>) -> Vec<List> {
    let key = format!("chain:{id}:{}", within_key(within));
    let byes = guarded(blocks, &key, json!([id]), || Value::Array(chain_read(id, blocks, within).into_iter().map(Value::String).collect()));
    byes.as_array().into_iter().flatten().filter_map(Value::as_str).filter_map(|h| blocks.get(h)).filter_map(list_of).collect()
}
pub(crate) fn chain_read(id: &str, blocks: &Index, within: Option<&Value>) -> Vec<String> {
    let Some(root) = blocks.get(id).filter(|r| genesis_opens(Some(r))) else { return vec![] };
    let past = within.map(|w| blocks.past_of(w));
    let vis = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    let grants = blocks.grants_memo();
    let mine: Vec<&Value> = grants.key_by_subject.get(id).into_iter().flatten().filter(|h| vis(h)).filter_map(|h| blocks.get(h)).filter(|g| key_grant_of(g, id) && st(g, "voices").is_some()).collect();
    let mut chain: Vec<String> = vec![hash_of(root).to_string()];
    let mut cur = list_of(root).unwrap();
    while chain.len() <= mine.len() {
        let mut best: Option<(i64, &Value)> = None;
        let mut tie = false;
        for g in mine.iter().filter(|g| rs(g, "updates") == Some(cur.by.as_str())) {
            if grant_standing(g, id, blocks, within) != Standing::Stands {
                continue;
            }
            let Some(r) = place_in(g, id, &cur, blocks).map(|p| p.rank()) else { continue };
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

/// The list standing for an id among the blocks given (or within a block's causal past). None when her genesis is not given.
pub fn standing_list(id: &str, blocks: &Index, within: Option<&Value>) -> Option<List> {
    standing_chain(id, blocks, within).pop()
}

/// One start: whether `key` is the voice her list marks `receives: true`, else her first voice. None where no list of hers is
/// given (an id that is no person: its start is read as before).
pub fn receives_on(id: &str, key: &str, blocks: &Index) -> Option<bool> {
    let list = standing_list(id, blocks, None)?;
    let v = list.voices.iter().find(|v| v.raw.get("receives") == Some(&Value::Bool(true))).or_else(|| list.voices.first())?;
    Some(match &v.who {
        Who::Key(k) => k == key,
        Who::Hash(h) => key_hash_in(&v.suite, key) == *h,
        Who::Names(..) => false,
    })
}

// The place of a key in a list: a `key` voice, or a `key_hash` voice that holds its hash.
pub(crate) fn place_of_key(key: &str, list: &List) -> Option<usize> {
    list.voices.iter().position(|v| match &v.who {
        Who::Key(k) => k == key,
        Who::Hash(h) => key_hash_in(&v.suite, key) == *h,
        Who::Names(..) => false,
    })
}

/// Where the signer of a block stands in her list (`list`): for her own block, the voice its key is, or the voice a key under a voice is
/// under (its key grant standing); for a key grant another signs for her list, the voice of named people he is one of.
pub fn place_in(block: &Value, id: &str, list: &List, blocks: &Index) -> Option<Place> {
    place_within(block, id, list, blocks, Some(block))
}
// The same, with the key grant of a key under a voice read as standing within `within`'s causal past (None: all the blocks given).
pub(crate) fn place_within(block: &Value, id: &str, list: &List, blocks: &Index, within: Option<&Value>) -> Option<Place> {
    let author = rs(block, "author")?;
    if author != id {
        if !key_grant_of(block, id) {
            return None;
        }
        return list.voices.iter().position(|v| matches!(&v.who, Who::Names(n, _) if n.iter().any(|x| x == author))).map(Place::At);
    }
    let s = key_of(block, blocks)?;
    if let Some(i) = place_of_key(&s.key, list) {
        return Some(Place::At(i));
    }
    let u = rs(block, "key").and_then(|h| blocks.get(h)).filter(|u| key_grant_of(u, id) && st(u, "voices").is_none() && ss(u, "public_key_sign") == Some(s.key.as_str()))?;
    under_place(u, id, list, blocks, within).map(Place::Under)
}

/// The voice a key under a voice is under in a list (identity.md, A key under a voice): its key grant stands, and the key of its voice
/// is that voice in the list, or was put in that place by a key grant that had the adding block in its causal past (inside that cut).
pub(crate) fn under_place(u: &Value, id: &str, list: &List, blocks: &Index, within: Option<&Value>) -> Option<usize> {
    if grant_standing(u, id, blocks, within) != Standing::Stands {
        return None;
    }
    let voice_key = key_of(u, blocks)?.key;
    let from = standing_list(id, blocks, Some(u))?;
    let i = place_of_key(&voice_key, &from)?;
    // a stop of the key grant that added it, by its signer or a voice above, ends it
    let past = within.map(|w| blocks.past_of(w));
    let stopped = blocks.values().any(|st| {
        type_of(st) == "grant"
            && ss(st, "status") == Some("stopped")
            && rs(st, "updates") == Some(hash_of(u))
            && rs(st, "author") == Some(id)
            && past.as_ref().is_none_or(|p| p.contains(hash_of(st)))
            && signed_by_author_in(st, blocks)
            && standing_list(id, blocks, Some(st)).is_some_and(|l| key_of(st, blocks).and_then(|s| place_of_key(&s.key, &l)).is_some_and(|p| p <= i))
    });
    if stopped {
        return None;
    }
    if from.by == list.by {
        return Some(i);
    }
    // follow the place along the lists that stood since the key grant that added it: each that put another key there had it in its past
    let chain = standing_chain(id, blocks, None);
    let (a, b) = (chain.iter().position(|l| l.by == from.by)?, chain.iter().position(|l| l.by == list.by)?);
    let tag = |v: &Voice| match &v.who {
        Who::Key(k) | Who::Hash(k) => Some(k.clone()),
        Who::Names(..) => None,
    };
    let mut now = tag(&from.voices[i])?;
    for l in chain.get(a + 1..=b)? {
        let t = tag(l.voices.get(i)?)?;
        if t != now {
            if !blocks.get(&l.by).is_some_and(|e| blocks.past_of(e).contains(hash_of(u))) {
                return None;
            }
            now = t;
        }
    }
    Some(i)
}

// ---- When a key grant stands (identity.md) ----
/// Whether a key grant about `id` stands among the blocks given (or within a block's causal past), and if not whether it may yet.
pub fn grant_standing(g: &Value, id: &str, blocks: &Index, within: Option<&Value>) -> Standing {
    let key = format!("gs:{}:{id}:{}", hash_of(g), within_key(within));
    Standing::of(guarded(blocks, &key, json!("confirm"), || json!(grant_standing_read(g, id, blocks, within).code())).as_str().unwrap_or("never"))
}

pub(crate) fn grant_standing_read(g: &Value, id: &str, blocks: &Index, within: Option<&Value>) -> Standing {
    if !key_grant_of(g, id) || !signed_by_author_in(g, blocks) {
        return Standing::Never;
    }
    let Some(list) = standing_list(id, blocks, Some(g)) else { return Standing::Never };
    // One list at a time: a list names the list standing in its own causal past (one already replaced is no key grant).
    let new = list_of(g);
    if new.is_some() && rs(g, "updates") != Some(list.by.as_str()) {
        return Standing::Never;
    }
    let Some(place) = place_in(g, id, &list, blocks) else { return Standing::Never };
    // A key under a voice signs no key grant.
    if matches!(place, Place::Under(_)) {
        return Standing::Never;
    }
    // where her list says so (`above: true`), a voice of other people whose wait is above zero may sign a key grant that
    // puts a new key in a place above its own (that place kept as it was, bar its key), or that leaves no voice. It is never narrowing: it stands
    // only when `needed` of them have signed it again after their wait has run on her clocks, and no voice above them said no in that wait.
    // "placed by her first voice" is read as true of every list: only the first voice adds a voice of other people (the text does not say; read so).
    if let (Some(new), Some(i)) = (&new, place.index()) {
        let v = &list.voices[i];
        let reaches = matches!(v.who, Who::Names(..)) && v.raw.get("above") == Some(&Value::Bool(true)) && v.wait.as_deref().is_some_and(|w| !is_zero(w));
        if reaches && new.clocks == list.clocks && (new.voices.is_empty() || reaches_above(new, &list, i)) {
            let past = within.map(|w| blocks.past_of(w));
            let vis = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
            if paired(g, id, place, blocks, &vis) {
                return Standing::Never;
            }
            return power_standing(g, id, &list, place, blocks, within, true);
        }
    }
    if let Some(new) = &new {
        if !restated(new, &list, place) {
            return Standing::Never;
        }
        // a key in doubt never decides its own replacement: a key's own key grant is never a suite move; only a voice
        // above a key moves it to a key of another suite (each key's suite read from its own spelling)
        if let Place::At(i) = place {
            if let (Some(Who::Key(ok)), Some(Who::Key(nk))) = (list.voices.get(i).map(|v| &v.who), new.voices.get(i).map(|v| &v.who)) {
                if crate::sign::suite_named_by(ok) != crate::sign::suite_named_by(nk) {
                    return Standing::Never;
                }
            }
        }
    }
    let past = within.map(|w| blocks.past_of(w));
    let vis = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    // A voice of named people speaks when `needed` of them have signed it or named it in refs.confirms.
    if let Some(Who::Names(names, needed)) = place.index().map(|i| &list.voices[i].who) {
        let mut signers: Vec<&str> = vec![rs(g, "author").unwrap_or("")];
        signers.extend(confirms_of(g, blocks, &vis).filter(|c| rs(c, "author").is_some_and(|a| names.iter().any(|n| n == a))).filter_map(|c| rs(c, "author")));
        if !crate::js::quorum(signers, Some(*needed as f64)) {
            return Standing::Waits("confirm");
        }
    }
    if free_key_grant(g, new.as_ref(), &list, place) {
        return Standing::Stands;
    }
    if paired(g, id, place, blocks, &vis) {
        return Standing::Never;
    }
    if narrows(g, new.as_ref(), &list) {
        return Standing::Stands;
    }
    power_standing(g, id, &list, place, blocks, within, true)
}

// A voice restates every voice above its place as it was, and its own place as it was, bar the key in it; only the first voice changes
// `clocks`. A voice that leaves its own place out adds nothing below it.
pub(crate) fn restated(new: &List, old: &List, place: Place) -> bool {
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
    match o.who {
        Who::Names(..) => o == n,
        _ => o.kept_bar_key(n),
    }
}

// a list that puts a new key in one place above `i`, keeping that place as it was bar its key, and every other voice as it was.
pub(crate) fn reaches_above(new: &List, old: &List, i: usize) -> bool {
    if new.voices.len() != old.voices.len() {
        return false;
    }
    let changed: Vec<usize> = (0..old.voices.len()).filter(|j| new.voices[*j] != old.voices[*j]).collect();
    match changed.as_slice() {
        [j] if *j < i => old.voices[*j].kept_bar_key(&new.voices[*j]) && matches!(new.voices[*j].who, Who::Key(_)),
        _ => false,
    }
}

// A key grant that stands when signed and waits on nothing (identity.md): one that takes its signer's own place out. No second signature,
// no wait, no reach and no cut. a key grant that states only an encryption key is no longer one: it is a grant of hers, waits
// on its key's reach and passes the cut as any grant of that key does (it is not signed twice: it only narrows), and two of one voice
// apart are a pair.
pub(crate) fn free_key_grant(g: &Value, new: Option<&List>, old: &List, place: Place) -> bool {
    match new {
        Some(n) => takes_self_out(g, n, old, place),
        None => false,
    }
}

// Taking oneself out (identity.md): the list is the old one without the signer's own place, the clock unchanged, no key added.
pub(crate) fn takes_self_out(g: &Value, new: &List, old: &List, place: Place) -> bool {
    let Place::At(i) = place else { return false };
    let mut without = old.voices.clone();
    without.remove(i);
    new.voices == without && new.clocks == old.clocks && st(g, "public_key_sign").is_none() && st(g, "shown_key").is_none()
}

// A key grant that only narrows (blocks.md, Finality, Signed twice): it adds no key and shows none, and its list, if it states one, is the
// old list with some voices left out, each kept one as it was, the clock unchanged. A key grant of an encryption key alone is one.
pub(crate) fn narrows(g: &Value, new: Option<&List>, old: &List) -> bool {
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
pub(crate) fn paired(g: &Value, id: &str, place: Place, blocks: &Index, vis: &dyn Fn(&str) -> bool) -> bool {
    let gh = hash_of(g);
    let same = |h: &Value| -> bool {
        match place {
            Place::At(_) | Place::Under(_) if rs(g, "author") == Some(id) => {
                rs(h, "author") == Some(id) && key_of(h, blocks).zip(key_of(g, blocks)).is_some_and(|(a, b)| a.key == b.key)
            }
            Place::At(_) | Place::Under(_) => {
                rs(h, "author") != Some(id) && rs(h, "updates") == rs(g, "updates") && standing_list(id, blocks, Some(g)).is_some_and(|l| place_in(h, id, &l, blocks) == Some(place))
            }
        }
    };
    blocks.grants_memo().key_by_subject.get(id).into_iter().flatten().filter(|h| vis(h) && h.as_str() != gh).filter_map(|h| blocks.get(h)).any(|h| {
        key_grant_of(h, id) && !blocks.past_of(g).contains(hash_of(h)) && !blocks.past_of(h).contains(gh) && same(h) && signed_by_author_in(h, blocks)
    })
}

// The counted blocks that name a word in `refs.confirms`, among those `vis` lets in.
pub(crate) fn confirms_of<'a>(word: &'a Value, blocks: &'a Index, vis: &'a dyn Fn(&str) -> bool) -> impl Iterator<Item = &'a Value> + 'a {
    let h = hash_of(word);
    // the blocks naming it in `confirms`, from the index's names, never a pass over every block given per word
    let names = blocks.names_memo();
    let named: Vec<&'a Value> = names.by_confirms.get(h).into_iter().flatten().filter_map(|n| blocks.get(n)).collect();
    named.into_iter().filter(move |c| vis(hash_of(c)) && hash_of(c) != h && list(rf(c, "confirms")).contains(&h) && signed_by_author_in(c, blocks))
}

// Whether a voice of a list has signed a block naming `word` in refs.confirms (a voice of named people: `needed` of them), among `vis`.
pub(crate) fn voice_confirms(word: &Value, id: &str, list: &List, i: usize, blocks: &Index, vis: &dyn Fn(&str) -> bool) -> bool {
    match &list.voices[i].who {
        Who::Names(names, needed) => {
            let by = confirms_of(word, blocks, vis).filter_map(|c| rs(c, "author")).filter(|a| names.iter().any(|n| n == a));
            crate::js::quorum(by, Some(*needed as f64))
        }
        _ => confirms_of(word, blocks, vis).any(|c| rs(c, "author") == Some(id) && standing_list(id, blocks, Some(c)).is_some_and(|l| place_in(c, id, &l, blocks) == Some(Place::At(i)))),
    }
}

// A voice above a signer's place has confirmed the word: a voice ranked higher in the list.
pub(crate) fn confirmed_above(word: &Value, id: &str, list: &List, place: Place, blocks: &Index, vis: &dyn Fn(&str) -> bool) -> bool {
    // above a key under a voice is its voice too
    let above = match place {
        Place::Under(i) => i + 1,
        _ => place.index().unwrap_or(0),
    }
    .min(list.voices.len());
    (0..above).any(|j| voice_confirms(word, id, list, j, blocks, vis))
}

// The wait of a signer's place: the first voice's is zero; a key under a voice has its voice's.
pub(crate) fn wait_of(list: &List, place: Place) -> Option<String> {
    match place {
        Place::At(0) | Place::Under(0) => Some(String::from("PT0S")),
        Place::At(i) | Place::Under(i) => list.voices.get(i).and_then(|v| v.wait.clone()),
    }
}
pub(crate) fn is_zero(duration: &str) -> bool {
    crate::time::parse_duration(duration).is_some_and(|d| d.years == 0 && d.months == 0 && d.days == 0 && d.ms == 0)
}

/// Signed twice (blocks.md, Finality; identity.md, When a key grant stands): a word that lets another act or spend for her stands when
/// the same key (for a voice of named people, `needed` of them) has signed it again after its place's wait has run from her clocks' receipt
/// of the first signing, or when a voice above has signed it. A wait of zero has run at once; a wait above zero runs only on her clock; a
/// place that states no wait waits for a voice above. For a key grant, a "no" of a voice above sets it aside: on her clock, when one clock's
/// line holds the no's receipt before her cutoff that closes the wait; else when the no is in the second signing's causal past.
pub(crate) fn power_standing(word: &Value, id: &str, list: &List, place: Place, blocks: &Index, within: Option<&Value>, key_grant: bool) -> Standing {
    let past = within.map(|w| blocks.past_of(w));
    let vis = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    if confirmed_above(word, id, list, place, blocks, &vis) {
        return Standing::Stands;
    }
    let Some(wait) = wait_of(list, place) else { return Standing::Waits("confirm") };
    let zero = is_zero(&wait);
    // (`wait` and `reach`) at `PT0S` a word of a key stands when signed. Signing twice is her
    // own choice in her list, a wait above zero; a voice of named people still speaks only when `needed` of them have signed it.
    if zero && !matches!(place.index().map(|i| &list.voices[i].who), Some(Who::Names(..))) {
        return Standing::Stands;
    }
    let clock = list.clock();
    let no = |n: &Value| key_grant && is_no(n, word, id, list, place, blocks);
    if !zero {
        let Some(k) = &clock else { return Standing::Waits("wait") };
        if wait_run(word, &wait, k, blocks, &vis, &no) == Run::Blocked {
            return Standing::Never;
        }
    }
    // Signing again: a later counted block of the same signer naming the word in refs.confirms, whose causal past shows the wait run.
    let author = rs(word, "author").unwrap_or("");
    let first_key = key_of(word, blocks).map(|s| s.key);
    let again = |c: &Value| -> bool {
        let cp = blocks.past_of(c);
        let cv = |h: &str| cp.contains(h);
        zero || clock.as_ref().is_some_and(|k| wait_run(word, &wait, k, blocks, &cv, &no) == Run::Ran)
    };
    // a "no" in a second signing's causal past sets the word aside: that signing saw it come first
    let mine = |c: &Value| -> bool {
        match place.index().map(|i| &list.voices[i].who) {
            Some(Who::Names(names, _)) => rs(c, "author").is_some_and(|a| names.iter().any(|n| n == a)),
            _ => rs(c, "author") == Some(author) && key_of(c, blocks).map(|s| s.key) == first_key,
        }
    };
    if key_grant && confirms_of(word, blocks, &vis).filter(|c| mine(c)).any(|c| {
        let cp = blocks.past_of(c);
        // a no is a key grant about her, so only her key grants are read, never every block given per signing
        blocks.grants_memo().key_by_subject.get(id).into_iter().flatten().filter_map(|h| blocks.get(h)).any(|n| cp.contains(hash_of(n)) && no(n))
    }) {
        return Standing::Never;
    }
    let ok = match place.index().map(|i| &list.voices[i].who) {
        // at `PT0S` a voice of other people speaks once `needed` of them have signed it (the word, or a confirm of it), each once
        Some(Who::Names(names, needed)) if zero => {
            let mut by: Vec<&str> = confirms_of(word, blocks, &vis).filter_map(|c| rs(c, "author")).filter(|a| names.iter().any(|n| n == a)).collect();
            if names.iter().any(|n| n == author) {
                by.push(author);
            }
            crate::js::quorum(by.into_iter(), Some(*needed as f64))
        }
        Some(Who::Names(names, needed)) => {
            let by = confirms_of(word, blocks, &vis).filter(|c| {
                let a = rs(c, "author").unwrap_or("");
                names.iter().any(|n| n == a)
                    && again(c)
                    && (a == author || confirms_of(word, blocks, &vis).any(|e| hash_of(e) != hash_of(c) && rs(e, "author") == Some(a) && blocks.past_of(c).contains(hash_of(e))))
            });
            crate::js::quorum(by.filter_map(|c| rs(c, "author")), Some(*needed as f64))
        }
        _ => confirms_of(word, blocks, &vis).any(|c| rs(c, "author") == Some(author) && key_of(c, blocks).map(|s| s.key) == first_key && again(c)),
    };
    if ok {
        return Standing::Stands;
    }
    if !zero && clock.as_ref().is_none_or(|k| wait_run(word, &wait, k, blocks, &vis, &no) != Run::Ran) {
        return Standing::Waits("wait");
    }
    Standing::Waits("confirm")
}

// A "no" to a key grant (identity.md, Saying no is signing): another key grant for the same list, by a voice above the grant's signer.
pub(crate) fn is_no(n: &Value, word: &Value, id: &str, list: &List, place: Place, blocks: &Index) -> bool {
    hash_of(n) != hash_of(word)
        && key_grant_of(n, id)
        && st(n, "voices").is_some()
        && rs(n, "updates") == Some(list.by.as_str())
        && signed_by_author_in(n, blocks)
        && place_in(n, id, list, blocks).is_some_and(|p| p.rank() < place.rank())
}

// ---- Who speaks for her (invariant 8) ----
/// The ends of a key of hers (blocks.md, The cut): every key grant standing among the blocks given that leaves the key out of a list that
/// had it; for a key under a voice, the stop of the key grant that added it, and each end of its voice's key that did not see that grant.
pub(crate) fn ends_of<'a>(id: &str, key: &str, under: Option<&Value>, blocks: &'a Index) -> Vec<&'a Value> {
    candidate_ends(id, key, under, blocks).into_iter().filter(|e| is_end(e, id, blocks)).collect()
}
// The key grants that leave the key out (or, for a key under a voice, its voice's key, without having seen the adding grant), and the stops
// of the grant that added a key under a voice: ends once they stand (`is_end`).
pub(crate) fn candidate_ends<'a>(id: &str, key: &str, under: Option<&Value>, blocks: &'a Index) -> Vec<&'a Value> {
    let mut out: Vec<&Value> = Vec::new();
    let voice_key = under.and_then(|u| key_of(u, blocks)).map(|s| s.key);
    for g in blocks.grants_memo().key_by_subject.get(id).into_iter().flatten().filter_map(|h| blocks.get(h)) {
        let ends = match (under, &voice_key) {
            (Some(u), Some(vk)) => leaves_out(g, id, vk, blocks) && !blocks.past_of(g).contains(hash_of(u)),
            _ => leaves_out(g, id, key, blocks),
        };
        if ends {
            out.push(g);
        }
    }
    if let Some(u) = under {
        let uh = hash_of(u);
        out.extend(blocks.values().filter(|s| type_of(s) == "grant" && ss(s, "status") == Some("stopped") && rs(s, "updates") == Some(uh) && rs(s, "author") == Some(id)));
    }
    out
}
pub(crate) fn is_end(e: &Value, id: &str, blocks: &Index) -> bool {
    if st(e, "status").is_some() {
        return signed_by_author_in(e, blocks);
    }
    grant_standing(e, id, blocks, None) == Standing::Stands
}

// The clock a key names (identity.md, Ending a key): her list's, exactly when its voice states a reach.
pub(crate) fn clock_of_key(list: &List, place: Place) -> Option<Clocks> {
    place.index().and_then(|i| list.voices.get(i)).and_then(|v| v.reach.as_ref()).and_then(|_| list.clock())
}

/// Whether a block has seen an end of its key (blocks.md, The cut, Seen): the end is in its causal past, or, where the key names a clock,
/// one clock's line holds her receipt of the end before her receipt of the block. A block's own second signing of an end is not a
/// block made after that end: the end stands only by it.
pub(crate) fn seen(block: &Value, end: &Value, clock: Option<&Clocks>, blocks: &Index) -> bool {
    let eh = hash_of(end);
    !list(rf(block, "confirms")).contains(&eh)
        && (blocks.past_of(block).contains(eh) || clock.is_some_and(|k| end_first(hash_of(block), eh, k, blocks, &|_| true)))
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
        // `valid` answers who said these bytes, whatever `read` says: a block that is not valid is no one's word;
        // a valid one that is not read is still its signer's
        return false;
    }
    let mut all = index.clone();
    all.insert(hash_of(block).to_string(), block.clone());
    speaks_read(block, &all)
}
pub fn signed_by_author(block: &Value, blocks: &[Value]) -> bool {
    signed_by_author_in(block, &crate::js::blocks_index(blocks))
}

pub(crate) fn speaks_read(block: &Value, blocks: &Index) -> bool {
    let Some(id) = rs(block, "author") else { return false };
    let Some(s) = key_of(block, blocks) else { return false };
    let Some(list) = standing_list(id, blocks, Some(block)) else { return false };
    let Some(place) = place_in(block, id, &list, blocks) else { return false };
    let under = match place {
        Place::Under(_) => rs(block, "key").and_then(|u| blocks.get(u)),
        _ => None,
    };
    // a key under a voice signs no key grant
    if under.is_some() && type_of(block) == "grant" && ss(block, "kind") == Some("key") {
        return false;
    }
    let clock = clock_of_key(&list, place);
    // an end it has seen counts it for nothing; a suite move counts only what it has in its causal past
    // a key grant by her voice above that key whose `counted_to` is before it puts a block joined to no other
    // person's block off her line
    let ends = candidate_ends(id, &s.key, under, blocks);
    let after_point = |e: &Value| ss(e, "counted_to").is_some_and(|ct| ct != hash_of(block) && blocks.get(ct).is_some_and(|c| rs(c, "author") == Some(id) && !blocks.past_of(c).contains(hash_of(block))));
    if ends.iter().any(|e| after_point(e) && !blocks.past_of(block).contains(hash_of(e)) && is_end(e, id, blocks)) && joiners_of(block, blocks).is_empty() {
        return false;
    }
    !ends.iter().any(|e| {
        // to a reader who believes the old suite, a suite move is an end, read as any end is (the half for a reader who no
        // longer believes a suite is not built: no argument of the door names a belief)
        seen(block, e, clock.as_ref(), blocks) && is_end(e, id, blocks)
    })
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

/// Every key a list or a key grant of hers brought in, among the blocks given, in the order of the blocks that brought them in: the keys of
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
    key_timeline_in(id, &crate::js::blocks_index(blocks))
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
    live_keys_in(id, &crate::js::blocks_index(blocks))
}

/// The identity fold (folds.md, What each fold returns): `{ signed_by_author, voices, clocks, keys, waiting }`.
pub fn identity_state(id: &str, blocks: &[Value]) -> Value {
    let index = crate::js::blocks_index(blocks);
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
        // per voice, whether it states that what it signs passes
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
    chains_of_in(id, &crate::js::blocks_index(blocks))
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
pub(crate) fn bringer_of(id: &str, public_key: &str, index: &Index) -> Option<String> {
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
    next_link_for_in(id, public_key, &crate::js::blocks_index(blocks), false)
}
