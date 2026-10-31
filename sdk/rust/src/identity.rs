//! Who someone is (modules/identity.md). Their genesis is the one block with no author: an `actor` (any audience) naming its
//! own signing key (and, if it likes, a suite, an encryption key, a custodian and a recovery pair), signed by its own
//! key. Its hash is their id. A key comes in by a `grant` of kind key. A rotation (`replaces` and `counted_to`) voids
//! the old key's blocks after its counted_to block, and is signed only by that key, by the recovery key, or for an
//! autonomous system or machine by its operator (invariant 8). A key brought in by a void block is void, and so is every key it
//! brought in. Two rotations of one key that do not see each other freeze the keys they bring in, until the recovery
//! key settles it; two recovery rotations that do not see each other end the identity. Two blocks of one key that name
//! one `prev` are a fork (invariant 3). Recovery reach is read from arrival on the reader's node (`arrived_at`),
//! never from `at` (invariant 6).
use crate::block::{create_in, hash_in};
use crate::chain::{check_chain, next_link, Chain, Link};
use crate::error::{Error, Result};
use crate::js::{hash_of, int, rf, rs, ss, st, type_of, Index};
use crate::order::{earliest, sees_in};
use crate::prelude::*;
use crate::sign::sign_in;
use crate::time::add_duration;

/// When blocks arrived on the reader's node (an ISO time each), for recovery reach, and what the reader reads a block whose arrival it
/// does not know as: `outside` the reach (it arrived before the reach began, so the reach protects it when another built on it) or
/// inside (the rotation voids it). The protocol picks neither: the reader's node chooses, and a reader of the reach states it
/// (`Arrivals::reach`). A reading of arrival that is no reach (`due`, a successor's trigger) states none.
pub struct Arrivals<'a> {
    lookup: &'a dyn Fn(&str) -> Option<String>,
    unknown_outside: Option<bool>,
}
impl<'a> Arrivals<'a> {
    pub fn new(lookup: &'a dyn Fn(&str) -> Option<String>) -> Self {
        Arrivals { lookup, unknown_outside: None }
    }
    /// With the reader's choice for a block whose arrival it does not know: `outside` true or false (inside).
    pub fn reach(lookup: &'a dyn Fn(&str) -> Option<String>, outside: bool) -> Self {
        Arrivals { lookup, unknown_outside: Some(outside) }
    }
    /// When a block arrived; None when the reader does not know (no entry, or none given).
    pub fn at(&self, hash: &str) -> Option<String> {
        (self.lookup)(hash).filter(|a| !a.is_empty())
    }
    // Unknown is read outside only when the reader said so; a reader that said nothing narrows (the rotation voids).
    fn outside(&self) -> bool {
        self.unknown_outside == Some(true)
    }
}
pub type ArrivedAt<'a> = Option<&'a Arrivals<'a>>;

/// Whether a public key opens a block's signature, in the key's suite.
pub fn opens_as(block: &Value, public_key: &str, suite: &str) -> bool {
    match block.get("signature").and_then(Value::as_str) {
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

/// The suite of the key that signed a block (core.md, section 2): a genesis's own; else the key of its author that opens it, or its
/// recovery key. None when no key of a held author opens it.
pub fn signed_suite_in(block: &Value, index: &Index) -> Option<String> {
    if is_genesis(block) {
        return Some(suite_named(block));
    }
    let author = rs(block, "author")?;
    // read from what the block rests on (its prev, the key's chain, the genesis), as check 6 reads it
    if let Some(s) = signer_in(block, index) {
        return Some(s.suite);
    }
    let keys = key_timeline_in(author, index, None);
    if let Some(e) = keys.iter().find(|e| opens_as(block, &e.key, &e.suite)) {
        return Some(e.suite.clone());
    }
    recovery_signer_of(block, author, index)?;
    crate::valid::recovery_hash_of(author, index).map(|(_, s)| s)
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

/// The recovery key's hash, as a genesis names it: the identity suite's hash of its SPKI hex, as UTF-8 text.
pub fn recovery_key_hash_in(suite: &str, public_key: &str) -> String {
    hash_in(suite, public_key)
}
pub fn recovery_key_hash(public_key: &str) -> String {
    recovery_key_hash_in(crate::spec::default_suite(), public_key)
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
    /// The offline recovery key's public signing key (SPKI hex): only its hash is written. Empty: no recovery.
    pub recovery_key: &'a str,
    /// How far back the recovery key may reach (a duration); written only with the recovery key.
    pub reach: &'a str,
    /// The suite of the recovery key, when it is not the identity's own.
    pub recovery_suite: &'a str,
    /// The id of the custodian who holds the key for the person (empty when they hold it themselves): written as
    /// `state.custodian`, so every reader sees the key is held by someone else.
    pub custodian: &'a str,
}

/// A new person, autonomous system, machine or circle that signs: their genesis, signed. It needs only kind, at, audience and
/// the key, each stated (nothing fills them in); the recovery fields come as a pair or not at all. A private genesis comes back
/// with its salts beside it (`salts`), as `write` gives them.
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
    if !options.custodian.is_empty() {
        m.insert("custodian".into(), json!(options.custodian));
    }
    if !options.recovery_key.is_empty() {
        if options.reach.is_empty() {
            return Err(Error::coded("bad_genesis", "identity: the recovery key comes with how far back it may reach"));
        }
        let rsuite = if options.recovery_suite.is_empty() { suite } else { options.recovery_suite };
        m.insert("recovery_key_hash".into(), json!(recovery_key_hash_in(suite, options.recovery_key)));
        m.insert("recovery_reach".into(), json!(options.reach));
        if rsuite != suite {
            m.insert("recovery_suite".into(), json!(rsuite));
        }
    }
    let block = create_in(suite, "actor", &state, &json!({}))?;
    let refused = crate::refusals("actor", block.get("state").unwrap(), block.get("refs").unwrap(), crate::CheckOptions::default());
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

// ---- Who signed a block, read from what it rests on alone (core.md, checks 6 and 7) ----
/// The key that signed a block of an author, read from the block and what it rests on alone, never from other blocks a reader
/// happens to hold, so every node that holds what the block needs reads the same signer (core.md, check 6). `first` says the block
/// is the key's first (its `prev` brought the key in); otherwise it follows the key's previous block. `recovery`: the recovery key.
#[derive(Debug, Clone, PartialEq)]
pub struct Signer {
    pub key: String,
    pub suite: String,
    pub recovery: bool,
    pub first: bool,
}

/// Whether a key opens an entry: a whole block's signature, or, for a sealed block held by its public header alone, the header's
/// signature (privacy.md: the header is signed by the same key).
pub fn entry_opens(entry: &Value, key: &str, suite: &str) -> bool {
    if entry.get("type").is_none() && entry.get("signature").is_none() {
        let message = json!({ "header": crate::write::header(entry), "header_signature": entry.get("header_signature").cloned().unwrap_or(Value::Null) });
        return crate::write::header_signed_by(&message, key);
    }
    opens_as(entry, key, suite)
}

/// The key a block brings into an author, with its suite: the author's genesis brings in its own key; a key grant about the author
/// (`refs.subject` the author, no status) brings in its `public_key_sign` when the author signed it, or when it names in `refs.under`
/// an operator grant of its own author's that names the author in `refs.to` (identity.md, Keys). That grant is one of the key grant's
/// needs, so every node gives one verdict. Nothing else brings a key in; no `kind` label is read.
pub fn brought_key(p: &Value, author: &str, held: &Index) -> Option<(String, String)> {
    if hash_of(p) == author {
        return is_genesis(p).then(|| (ss(p, "public_key_sign").unwrap_or("").to_string(), suite_named(p)));
    }
    let key_grant = type_of(p) == "grant" && ss(p, "kind") == Some("key") && rs(p, "subject") == Some(author) && st(p, "status").is_none();
    if !(key_grant && (rs(p, "author") == Some(author) || operator_grant_under(p, author, held).is_some())) {
        return None;
    }
    ss(p, "public_key_sign").map(|k| (k.to_string(), suite_named(p)))
}

/// The operator grant a key grant names in `refs.under`: a grant of kind `operator`, no subject, no status, naming the actor in
/// `refs.to`, by the key grant's own author. Whether that grant stands is the identity fold's to judge.
pub(crate) fn operator_grant_under<'a>(key_grant: &Value, actor: &str, held: &'a Index) -> Option<&'a Value> {
    let g = rs(key_grant, "under").and_then(|h| held.get(h))?;
    (type_of(g) == "grant"
        && ss(g, "kind") == Some("operator")
        && rs(g, "to") == Some(actor)
        && rs(g, "subject").is_none()
        && st(g, "status").is_none()
        && rs(g, "author").is_some()
        && rs(g, "author") == rs(key_grant, "author"))
    .then_some(g)
}

/// autonomous(actor): an autonomous system, by what its genesis says it is: an actor of kind `agent` or `machine`. The only place
/// the `kind` label is read, and it is consent's (strangers::is_agents), never validity's.
pub fn autonomous(actor: &Value) -> bool {
    matches!(ss(actor, "kind"), Some("agent" | "machine"))
}

/// The signer of a block of an author, read from what it rests on (`Signer`): its `prev`, and through it the key's chain back to
/// the block that brought the key in, and the author's genesis. None when no such key opens it, or what it rests on is not held.
pub fn signer_in(block: &Value, held: &Index) -> Option<Signer> {
    let author = rs(block, "author")?;
    let root = held.get(author).filter(|r| genesis_opens(Some(r)))?;
    // The chain back from the block, through the author's own blocks, until a block whose signer is known (memo) or none follows.
    let mut chain: Vec<&Value> = vec![block];
    // the hashes on the walk, so a cycle ends it in one lookup and a long chain costs no more than its length (release 42)
    let mut on_chain: alloc::collections::BTreeSet<&str> = alloc::collections::BTreeSet::from([hash_of(block)]);
    let mut known: Option<Option<Signer>> = None;
    loop {
        let top = *chain.last().unwrap();
        let Some(p) = rs(top, "prev").and_then(|h| held.get(h)) else { break };
        if rs(p, "author") != Some(author) || !on_chain.insert(hash_of(p)) {
            break;
        }
        if let Some(s) = held.signer_memo_get(p) {
            known = Some(s);
            break;
        }
        chain.push(p);
    }
    // Resolve from the oldest forward: each block's signer is read from its prev alone.
    let mut below: Option<Signer> = known.flatten();
    let mut out: Option<Signer> = None;
    for x in chain.iter().rev() {
        let s = signer_step(x, author, root, held, below.as_ref());
        held.signer_memo_set(x, s.clone());
        below = s.clone();
        out = s;
    }
    out
}

// One block's signer, given its prev's (`below`, when its prev is the author's own block).
fn signer_step(x: &Value, author: &str, root: &Value, held: &Index, below: Option<&Signer>) -> Option<Signer> {
    let prev = rs(x, "prev")?;
    let p = held.get(prev)?;
    let seq = int(st(x, "seq"));
    let skip = st(x, "skip") == Some(&Value::Bool(true));
    let prev_seq = int(st(p, "seq"));
    let fits_first = seq == Some(1.0) || (skip && seq.is_some_and(|s| s >= 1.0));
    let fits_next = matches!((seq, prev_seq), (Some(s), Some(b)) if (!skip && s == b + 1.0) || (skip && s > b));
    // The recovery key: named by the genesis's hash, in the identity's suite unless the genesis names another. Its first block names
    // the genesis; it then follows its own chain.
    if x.get("type").is_some() {
        if let (Some(rk), Some((hash, rsuite))) = (ss(x, "recovery_key"), crate::valid::recovery_hash_of(author, held)) {
            if recovery_key_hash_in(&suite_named(root), rk) == hash && opens_as(x, rk, &rsuite) {
                if prev == author {
                    return Some(Signer { key: rk.to_string(), suite: rsuite, recovery: true, first: true });
                }
                if below.is_some_and(|b| b.recovery && b.key == rk) {
                    return Some(Signer { key: rk.to_string(), suite: rsuite, recovery: true, first: false });
                }
            }
        }
    }
    let next = below.filter(|b| !b.recovery && entry_opens(x, &b.key, &b.suite));
    let brought = brought_key(p, author, held).filter(|(k, s)| !k.is_empty() && entry_opens(x, k, s));
    // Of the two, the one the seq fits; the key's own chain first.
    match (next, brought) {
        (Some(b), _) if fits_next => Some(Signer { key: b.key.clone(), suite: b.suite.clone(), recovery: false, first: false }),
        (_, Some((k, s))) if fits_first => Some(Signer { key: k, suite: s, recovery: false, first: true }),
        (Some(b), _) => Some(Signer { key: b.key.clone(), suite: b.suite.clone(), recovery: false, first: false }),
        (None, Some((k, s))) => Some(Signer { key: k, suite: s, recovery: false, first: true }),
        (None, None) => None,
    }
}

/// The place a block takes in its key's chain, for telling forks (core.md, invariant 3): its `prev`, or, for the key's first block
/// (one whose `prev` brought the key in), the key's root. A key has one first block: two first blocks of one key are a pair, whichever
/// blocks that brought it in they name, as two blocks naming one `prev` are.
pub fn chain_slot(block: &Value, signer: &Signer) -> String {
    if signer.first {
        return String::from("^first");
    }
    rs(block, "prev").unwrap_or("").to_string()
}

/// A key grant, signed: brings `new_key` into the id. `signer_private` signs (in `signer_suite`) at `place` in its own
/// chain (a key's next link, or for the recovery key `next_link(None, id)`). A rotation also names the key it
/// `replaces` and that key's `counted_to` block; a recovery-key rotation names `recovery_key`.
pub fn key_grant(
    id: &str,
    new_key: Option<&str>,
    signer_private: &str,
    place: &Link,
    at: &str,
    replaces: Option<(&str, &str)>,
    recovery_key: Option<&str>,
    after: &[&str],
) -> Result<Value> {
    let extras = KeyGrantExtras {
        replaces: replaces.map(|r| r.0),
        counted_to: replaces.map(|r| r.1),
        after,
        ..KeyGrantExtras::default()
    };
    key_grant_with(id, new_key, signer_private, place, at, recovery_key, &extras)
}

/// What a key grant may also carry: the key it `replaces` and that key's `counted_to` block (a rotation), blocks seen
/// (`after`), a new `encrypt` key, the new key's
/// `suite`, whether this block is a `skip`, and the suite the signer signs in.
#[derive(Default)]
pub struct KeyGrantExtras<'a> {
    pub replaces: Option<&'a str>,
    pub counted_to: Option<&'a str>,
    pub after: &'a [&'a str],
    pub encrypt: Option<&'a str>,
    /// The custodian who holds the key (written as `state.custodian`).
    pub custodian: Option<&'a str>,
    /// The new key's suite (`state.suite`); left out, `std`.
    pub suite: Option<&'a str>,
    /// The suite of the key that signs this grant (it hashes the block); left out, `std`.
    pub signer_suite: Option<&'a str>,
    pub skip: bool,
}

/// Take your keys (identity.md, Held keys): a key grant to a key on the person's own device that rotates the
/// custodian's key out. It is `key_grant_with` with `replaces` and `counted_to` set and no `custodian`, so the keys
/// are the person's own and their record stays one chain.
pub fn take_keys(
    id: &str,
    own_key: &str,
    signer_private: &str,
    place: &Link,
    at: &str,
    held_key: &str,
    counted_to: &str,
) -> Result<Value> {
    let extras = KeyGrantExtras { replaces: Some(held_key), counted_to: Some(counted_to), ..KeyGrantExtras::default() };
    key_grant_with(id, Some(own_key), signer_private, place, at, None, &extras)
}

/// `key_grant` with every optional part. `recovery_key` is the recovery key's public key when it signs (a
/// recovery-key rotation).
pub fn key_grant_with(
    id: &str,
    new_key: Option<&str>,
    signer_private: &str,
    place: &Link,
    at: &str,
    recovery_key: Option<&str>,
    x: &KeyGrantExtras,
) -> Result<Value> {
    let signer_suite = crate::spec::suite_or_default(x.signer_suite.unwrap_or(""));
    let mut state = json!({ "seq": place.seq, "at": at, "audience": "public", "kind": "key" });
    let m = state.as_object_mut().unwrap();
    if let Some(k) = new_key.filter(|k| !k.is_empty()) {
        m.insert("public_key_sign".into(), json!(k));
    }
    if let Some(e) = x.encrypt.filter(|e| !e.is_empty()) {
        m.insert("public_key_encrypt".into(), json!(e));
    }
    if let Some(c) = x.custodian.filter(|c| !c.is_empty()) {
        m.insert("custodian".into(), json!(c));
    }
    if let Some(a) = x.suite.filter(|a| !a.is_empty() && *a != crate::spec::default_suite()) {
        m.insert("suite".into(), json!(a));
    }
    if let Some(old) = x.replaces.filter(|r| !r.is_empty()) {
        m.insert("replaces".into(), json!(old));
        if let Some(g) = x.counted_to {
            m.insert("counted_to".into(), json!(g));
        }
    }
    if let Some(r) = recovery_key.filter(|r| !r.is_empty()) {
        m.insert("recovery_key".into(), json!(r));
    }
    if x.skip {
        m.insert("skip".into(), json!(true));
    }
    let mut refs = json!({ "author": id, "subject": id, "prev": place.prev });
    let seen = crate::js::sorted_set(x.after.iter());
    if !seen.is_empty() {
        refs["after"] = json!(seen);
    }
    signed(create_in(signer_suite, "grant", &state, &refs)?, signer_private, signer_suite)
}

// ---- Two blocks of one key that name one prev (core.md, invariant 3) ----
// A block is a fork member when its signing key signed another block that names the same `prev`, and both speak for their author
// (a block a rotation voided, such as an old key's sibling off its counted line, forms no pair: identity.md, Rotation). Which key
// signed a block is found by trying the author's keys, so each author is read once per set of blocks (`mark_forks`), and a block
// carries the answer in memory (`_void`, `_fork`), never in the signed content.

/// Each block of a known author, read once: (hash, author, the key that signed it, whether that key speaks for it). An author whose
/// genesis is not held is unknown: none of their blocks is read here, so nothing of theirs is void or forked.
fn read_authors(index: &Index) -> Vec<(String, String, Option<String>, bool)> {
    read_authors_at(index, None)
}
// The same, with the reader's arrivals (the recovery reach, a view): a block the reach protects speaks.
fn read_authors_at(index: &Index, arrived_at: ArrivedAt) -> Vec<(String, String, Option<String>, bool)> {
    let mut authors: Vec<&str> = Vec::new();
    for b in index.values() {
        if let Some(a) = rs(b, "author").filter(|a| !a.is_empty() && b.get("type").is_some() && st(b, "seq").is_some()) {
            if !authors.contains(&a) {
                authors.push(a);
            }
        }
    }
    let mut out = Vec::new();
    for author in authors {
        if !genesis_opens(index.get(author)) {
            continue;
        }
        let state = identity_in(author, index, arrived_at);
        for b in index.values().filter(|b| rs(b, "author") == Some(author) && b.get("type").is_some() && st(b, "seq").is_some()) {
            let key = signer_of(b, &state.keys).or_else(|| recovery_signer_of(b, author, index));
            out.push((hash_of(b).to_string(), author.to_string(), key, signed_with(b, &state, index, arrived_at)));
        }
    }
    out
}

// The pairs among blocks already read: blocks that speak, of one author and one key, naming one prev.
fn pairs_of(read: &[(String, String, Option<String>, bool)], index: &Index) -> Vec<[String; 2]> {
    let mut by_slot: alloc::collections::BTreeMap<(&str, &str, String), Vec<String>> = Default::default();
    for (h, author, key, speaks) in read {
        let (Some(key), true) = (key, *speaks) else { continue };
        let Some(b) = index.get(h) else { continue };
        if rs(b, "prev").is_none() {
            continue;
        }
        // a key's first block takes the key's root: two first blocks of one key are a pair, whichever bringer each names
        let slot = match signer_in(b, index) {
            Some(s) if s.key == *key => chain_slot(b, &s),
            _ => rs(b, "prev").unwrap_or("").to_string(),
        };
        by_slot.entry((author.as_str(), key.as_str(), slot)).or_default().push(h.clone());
    }
    // a star: each block of a slot paired with the slot's lowest hash (nodes.md: one pair per block proves the lie)
    let mut pairs: Vec<[String; 2]> = Vec::new();
    for (_, mut group) in by_slot {
        group.sort();
        group.dedup();
        for other in group.iter().skip(1) {
            pairs.push([group[0].clone(), other.clone()]);
        }
    }
    pairs.sort();
    pairs
}

/// The pairs of blocks, among these, that one key of one author signed naming one `prev`, both speaking for their author: each
/// pair sorted, and the list sorted.
pub fn fork_pairs_in(index: &Index) -> Vec<[String; 2]> {
    pairs_of(&read_authors(index), index)
}

/// Mark in memory every block a fold does not count for its signer's claim: `_void` when the key that signed it does not speak for its author (a rotation
/// voided it), `_fork` for the pair members and every later block of the same key (one whose `prev`-ancestry, through blocks of
/// that key, holds a member): a burden, never a claim (`binds_signer`). Blocks of another key of the same author are not touched. The identity fold ignores the marks.
pub fn mark_forks(index: &mut Index) {
    mark_forks_at(index, None)
}
/// The same marks with the reader's arrivals: a block the recovery reach protects is not void (a view's reading, never a fold's).
pub fn mark_forks_at(index: &mut Index, arrived_at: ArrivedAt) {
    let read = read_authors_at(index, arrived_at);
    let pairs = pairs_of(&read, index);
    // Every block is marked, `true` or `false`: a block that says `false` has been looked at, so `counts_in` never has to read the
    // authors again for each block it is asked about (that made every fold quadratic; found by the simulator, tools/sim).
    for b in index.values_mut() {
        if b.is_object() {
            b["_fork"] = json!(false);
            b["_void"] = json!(false);
        }
    }
    for (h, _, _, speaks) in &read {
        if !speaks {
            if let Some(b) = index.get_mut(h) {
                b["_void"] = json!(true);
            }
        }
    }
    if pairs.is_empty() {
        return;
    }
    let keys: alloc::collections::BTreeMap<&str, (&str, &str)> =
        read.iter().filter_map(|(h, a, k, _)| k.as_deref().map(|k| (h.as_str(), (a.as_str(), k)))).collect();
    let key_of = |h: &str| keys.get(h).copied();
    let mut marked: alloc::collections::BTreeSet<String> = pairs.iter().flat_map(|p| p.iter().cloned()).collect();
    // Later blocks: follow `prev` forward among the blocks of the same author and key, once.
    let mut after: alloc::collections::BTreeMap<String, Vec<String>> = Default::default();
    for (h, _, key, _) in &read {
        if key.is_none() {
            continue;
        }
        if let Some(prev) = index.get(h).and_then(|b| rs(b, "prev")) {
            if key_of(prev).is_some() && key_of(prev) == key_of(h) {
                after.entry(prev.to_string()).or_default().push(h.clone());
            }
        }
    }
    let mut todo: Vec<String> = marked.iter().cloned().collect();
    while let Some(h) = todo.pop() {
        for next in after.get(&h).into_iter().flatten() {
            if marked.insert(next.clone()) {
                todo.push(next.clone());
            }
        }
    }
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
            copy.iter().map(|(h, b)| (h.clone(), (b.get("_fork") == Some(&Value::Bool(true)), b.get("_void") == Some(&Value::Bool(true))))).collect()
        });
        return marks.get(hash_of(block)).is_some_and(|&(fork, void)| if mark == "_fork" { fork } else { void });
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

/// Whether a block's signing key does not speak for its author (identity.md, Rotation: void after a rotation, off the counted line).
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
    !void_in(block, index) && !forked_in(block, index)
}

/// fork-as-burden (folds.md, A fork is a burden): a block of a forked key (and not of a voided one) counts for its signer's claim never, but
/// counts as what its signer owes, and as the base of another's acceptance. True for such a block; a caller adds its own test of
/// whether the block binds its signer (a promise's stop frees it; a transfer to a named receiver, a giver owes).
pub fn fork_burden(block: &Value, index: &Index) -> bool {
    !counts_in(block, index) && st(block, "seq").is_some() && forked_in(block, index) && !void_in(block, index)
}

/// Whether a block binds its signer: it counts, or it is a fork's block that is not a stop or a decline (those would free her by her own
/// word). The one rule folds read for what a signer owes, or what another built on (folds.md, A fork is a burden).
pub fn binds_signer(block: &Value, index: &Index) -> bool {
    counts_in(block, index) || (fork_burden(block, index) && !matches!(ss(block, "status"), Some("stopped" | "declined")))
}

// ---- Keys ----
/// One key an id has held.
#[derive(Debug, Clone, PartialEq)]
pub struct KeyEntry {
    pub key: String,
    /// The block that brought it in (the genesis or a key grant).
    pub by: String,
    /// The key that signed that block ("recovery" for the recovery key; None for the genesis key).
    pub signer: Option<String>,
    pub void: bool,
    pub frozen: bool,
    /// The key's suite (`state.suite` of the block that brought it in; `std` when unnamed).
    pub suite: String,
}

/// A rotated key: who rotated it and from where it is void.
#[derive(Debug, Clone, PartialEq)]
pub struct Rotation {
    pub by: String,
    pub all: Vec<String>,
    pub counted_to: Option<String>,
    /// The old key's counted line (identity.md, Rotation): `counted_to` and its `prev`-ancestry in the old key's chain, sorted.
    /// With rotations that cross, the part of their lines they share; with a recovery rotation, the latest recovery rotation's.
    pub line: Vec<String>,
    pub recovery: bool,
    pub floor: Option<String>,
}

/// What an id's keys are, read from its chain alone.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Identity {
    pub keys: Vec<KeyEntry>,
    pub rotations: Vec<(String, Rotation)>,
    /// The recovery keys proven by a rotation they signed.
    pub recovery: Vec<String>,
    /// Two recovery rotations that cross end the identity: the rotations' hashes.
    pub ended: Option<Vec<String>>,
}

fn rotation_of<'a>(rotations: &'a [(String, Rotation)], key: &str) -> Option<&'a Rotation> {
    rotations.iter().find(|(k, _)| k == key).map(|(_, r)| r)
}

/// The operators of an autonomous system or machine (the authors of its operator grants that still stand) among these blocks;
/// with `relying`, as a block that rests on them sees it (a death ends them only for blocks that see the close).
pub(crate) fn operators_in(id: &str, index: &Index) -> Vec<String> {
    operators_for(id, index, None)
}
/// The one observe besides key grants a recovery key signs (profiles/successor.md): a `defeats` that names, in `refs.under`, a
/// successor grant its author gave. Read from what it rests on alone (the grant is a need; the blocks it defeats are not), so every node
/// gives one verdict (core.md, invariant 25): what it defeats is the successor fold's to read, and a target that is no trigger under
/// that grant cancels nothing.
#[cfg(feature = "successor")]
pub(crate) fn recovery_defeats_ok(block: &Value, index: &Index) -> bool {
    let Some(under) = rs(block, "under") else { return false };
    let grant = index.get(under).filter(|g| {
        type_of(g) == "grant" && ss(g, "kind") == Some("successor") && st(g, "status").is_none() && rs(g, "author") == rs(block, "author")
    });
    type_of(block) == "observe" && grant.is_some() && !crate::js::list(rf(block, "defeats")).is_empty()
}

// The authors of every operator grant naming this id (no subject, no status), whether or not it stands.
fn operator_candidates(id: &str, index: &Index) -> Vec<String> {
    let authors: Vec<&str> = index
        .values()
        .filter(|b| type_of(b) == "grant" && ss(b, "kind") == Some("operator") && rs(b, "to") == Some(id) && rs(b, "subject").is_none() && st(b, "status").is_none())
        .filter_map(|b| rs(b, "author"))
        .collect();
    crate::js::sorted_set(authors)
}
fn operators_for(id: &str, index: &Index, relying: Option<&Value>) -> Vec<String> {
    let authors: Vec<&str> = index
        .values()
        .filter(|b| type_of(b) == "grant" && ss(b, "kind") == Some("operator") && rs(b, "to") == Some(id) && operator_grant_stands(b, index, relying))
        .filter_map(|b| rs(b, "author"))
        .collect();
    crate::js::sorted_set(authors)
}
// An operator grant (no subject, no status) that stands: the machine's accept, no stop, no death, and it is its author's word.
fn operator_grant_stands(b: &Value, index: &Index, relying: Option<&Value>) -> bool {
    type_of(b) == "grant"
        && ss(b, "kind") == Some("operator")
        && rs(b, "subject").is_none()
        && st(b, "status").is_none()
        && crate::grant::operator_stands(b, index, relying)
        // the grant is its author's word: signed by a key that speaks for them (read without their own operators, so no loop)
        && rs(b, "author").is_some_and(|o| signed_with(b, &identity_depth(o, index, None, 1), index, None))
}

/// The one exception to "a stop cuts where it was signed" (identity.md, Keys): a key grant the operator signs under an operator grant counts
/// only if no stop or decline of that grant, signed by a key that speaks for its author, exists anywhere in the index without the key grant in
/// its causal past. A stop that does not see the key grant cuts it, so an operator cannot keep rotating a machine's keys by not citing the
/// decline. Read by signatures alone (as the machine's accept is), because judging forks would need this very fold.
fn operator_grant_cut(grant: &Value, key_grant: &Value, index: &Index) -> bool {
    let kh = hash_of(key_grant);
    let counts = |s: &Value| signed_plain(s, index) && !index.past_of(s).contains(kh);
    !crate::grant::ended_reading(grant, index, &counts, &|_: &str| true).is_empty()
}

/// Whether a block is its author's word, read without the author's own operators (so an operator's reading of a machine never loops):
/// signed by a key that speaks for them.
pub(crate) fn signed_plain(block: &Value, index: &Index) -> bool {
    rs(block, "author").is_some_and(|a| signed_with(block, &identity_depth(a, index, None, 1), index, None))
}

fn key_grants_of(id: &str, index: &Index, operators: &[(String, Identity)]) -> Vec<Value> {
    let mine: Index = index
        .iter()
        .filter(|(_, b)| {
            type_of(b) == "grant"
                && ss(b, "kind") == Some("key")
                && (rs(b, "author") == Some(id)
                    || (operators.iter().any(|(o, _)| rs(b, "author") == Some(o.as_str()))
                        && operator_grant_under(b, id, index).is_some_and(|g| operator_grant_stands(g, index, Some(b)) && !operator_grant_cut(g, b, index))))
                && rs(b, "subject") == Some(id)
                && int(st(b, "seq")).is_some()
                && st(b, "status").is_none()
        })
        .map(|(h, b)| (h.clone(), b.clone()))
        .collect();
    // In causal order among the blocks of the whole record, not among the grants alone: one grant may follow another only
    // through blocks that are not grants (a new key's chain: a note, a thing, then a second grant), and ordering the grants
    // by themselves loses that. A block that sees another has a strictly larger causal past, so past size orders them.
    // Ties: by seq, then by hash (the oracle's order, so the timeline lists keys alike).
    let mut ordered: Vec<(usize, i64, String, Value)> =
        mine.iter().map(|(h, b)| (index.past_of(b).len(), int(st(b, "seq")).unwrap_or(0.0) as i64, h.clone(), b.clone())).collect();
    ordered.sort_by(|a, b| (a.0, a.1, &a.2).cmp(&(b.0, b.1, &b.2)));
    ordered.into_iter().map(|(_, _, _, b)| b).collect()
}

struct Context<'a> {
    index: &'a Index,
    rotations: &'a [(String, Rotation)],
    arrived_at: ArrivedAt<'a>,
}

/// What an id's keys are, among these blocks.
pub fn identity_in(id: &str, index: &Index, arrived_at: ArrivedAt) -> Identity {
    match arrived_at {
        None => (*index.identity_memo(id, || identity_depth(id, index, None, 0))).clone(),
        Some(_) => identity_depth(id, index, arrived_at, 0),
    }
}

fn identity_depth(id: &str, index: &Index, arrived_at: ArrivedAt, depth: usize) -> Identity {
    let root = index.get(id);
    if !genesis_opens(root) {
        return Identity::default();
    }
    let root = root.unwrap();
    // An actor's operator may bring in and rotate its keys (identity.md, Keys): the operator's own keys.
    let operators: Vec<(String, Identity)> = if depth == 0 {
        // Every author of an operator grant naming it: whether the grant stands (the machine's accept, no stop, no death) is judged
        // per key grant, from that grant's own causal past (key_grants_of). The operator's own identity says whether a key grant it
        // signed is its word (signed by a key that speaks for it there: a rotated-out key off its line is not).
        operator_candidates(id, index).into_iter().map(|o| { let st = identity_depth(&o, index, None, 1); (o, st) }).collect()
    } else {
        Vec::new()
    };
    let grants = key_grants_of(id, index, &operators);
    let mut rotations: Vec<(String, Rotation)> = Vec::new();
    let mut result = Identity::default();
    // Rotations can void grants that came before them in causal order, so read until nothing changes.
    for pass in 0..=grants.len() + 1 {
        result = read_keys(root, &grants, index, &rotations, arrived_at, &operators);
        let same = result.rotations == rotations;
        rotations = result.rotations.clone();
        if same && pass > 0 {
            break;
        }
    }
    result
}

/// What an id's keys are, among these blocks.
pub fn identity_of(id: &str, blocks: &[Value], arrived_at: ArrivedAt) -> Identity {
    identity_in(id, &crate::js::held_index(blocks), arrived_at)
}

fn read_keys(
    root: &Value,
    grants: &[Value],
    index: &Index,
    rotations: &[(String, Rotation)],
    arrived_at: ArrivedAt,
    operators: &[(String, Identity)],
) -> Identity {
    // The recovery key is named only by the genesis (identity.md, The recovery key).
    let recovery_hashes: Vec<String> = ss(root, "recovery_key_hash")
        .filter(|s| !s.is_empty())
        .map(|s| vec![s.to_string()])
        .unwrap_or_default();
    let mut keys = vec![KeyEntry {
        key: ss(root, "public_key_sign").unwrap_or("").to_string(),
        by: hash_of(root).to_string(),
        signer: None,
        void: false,
        frozen: false,
        suite: suite_named(root),
    }];
    // The recovery key is in the identity's suite unless the genesis names `recovery_suite`.
    let identity_suite = suite_named(root);
    let recovery_alg = ss(root, "recovery_suite").map(String::from).unwrap_or_else(|| identity_suite.clone());
    let mut recovery: Vec<String> = Vec::new();
    let mut self_rotations: Vec<(String, Vec<&Value>)> = Vec::new();
    let mut recovery_rotations: Vec<(String, Vec<&Value>)> = Vec::new();
    // Each key's key grants by prev: two naming one prev from one signing key are a fork.
    let mut slots: indexmap::IndexMap<(String, String), Vec<&Value>, crate::js::BuildHasher> = Default::default();
    let context = Context {
        index,
        rotations,
        arrived_at,
    };
    // A grant is read once the key that signed it is known. Which comes first is not always settled by causal order (the recovery
    // key's first block names the genesis, not the grant that added the recovery hash), so a grant whose signer is not yet known
    // is put back and tried again after the others, until a pass reads none.
    let mut queue: Vec<&Value> = grants.iter().collect();
    let mut rounds = 0;
    while !queue.is_empty() && rounds <= grants.len() {
    rounds += 1;
    let mut deferred: Vec<&Value> = Vec::new();
    let read_before = queue.len();
    for grant in queue.drain(..) {
        let recovery_key = ss(grant, "recovery_key");
        let by_recovery = recovery_key.is_some_and(|r| {
            recovery_hashes.contains(&recovery_key_hash_in(&identity_suite, r)) && opens_as(grant, r, &recovery_alg)
        });
        let signer = if by_recovery {
            None
        } else {
            // The key a grant is signed with is nearly always the one its `prev` brought in, or the newest: try those first, so a long chain of
            // key grants costs one signature check each, never one per key held. The key chosen is the first, in the order the keys were
            // read, that passes: a later entry of the same key never wins over an earlier one (release 11).
            let passes = |e: &KeyEntry| !e.void && !e.frozen && opens_as(grant, &e.key, &e.suite) && speaks(e, grant, &context);
            let prev = rs(grant, "prev");
            let first = keys
                .iter()
                .rposition(|e| Some(e.by.as_str()) == prev)
                .into_iter()
                .chain(keys.len().checked_sub(1))
                .find(|i| passes(&keys[*i]));
            match first {
                Some(i) => (0..=i).find(|j| keys[*j].key == keys[i].key && keys[*j].suite == keys[i].suite && passes(&keys[*j])),
                None => keys.iter().position(|e| passes(e)),
            }
        };
        // The operator of an autonomous system or machine: a key of its operator opens the grant (the grant's author is the operator).
        let by_operator = !by_recovery
            && signer.is_none()
            && operators.iter().any(|(o, ks)| {
                rs(grant, "author") == Some(o.as_str()) && signed_with(grant, ks, index, None)
            });
        if !by_recovery && signer.is_none() && !by_operator {
            deferred.push(grant);
            continue;
        }
        if by_recovery {
            let r = recovery_key.unwrap().to_string();
            if !recovery.contains(&r) {
                recovery.push(r);
            }
        }
        if let Some(old) = ss(grant, "replaces") {
            let old = old.to_string();
            // A key is rotated only by itself, by the recovery key, or by the operator of an autonomous system or machine.
            if !by_recovery && !by_operator && keys[signer.unwrap()].key != old {
                continue;
            }
            let list = if by_recovery {
                &mut recovery_rotations
            } else {
                &mut self_rotations
            };
            match list.iter_mut().find(|(k, _)| *k == old) {
                Some((_, v)) => v.push(grant),
                None => list.push((old, vec![grant])),
            }
        }
        if let Some(k) = ss(grant, "public_key_sign") {
            keys.push(KeyEntry {
                key: k.to_string(),
                by: hash_of(grant).to_string(),
                signer: Some(if by_recovery {
                    "recovery".to_string()
                } else if by_operator {
                    "operator".to_string()
                } else {
                    keys[signer.unwrap()].key.clone()
                }),
                void: false,
                frozen: false,
                suite: suite_named(grant),
            });
        }
        // The recovery key is a signer with its own chain: two of its key grants naming one prev are a fork too (Conflict).
        let slot_key = match signer {
            Some(i) => Some(keys[i].key.clone()),
            None if by_recovery => recovery_key.map(String::from),
            None => None,
        };
        if let Some(key) = slot_key {
            let prev = rs(grant, "prev").unwrap_or("").to_string();
            slots.entry((key, prev)).or_default().push(grant);
        }
    }
    if deferred.len() == read_before {
        break;
    }
    queue = deferred;
    }
    // Each rotated key: the recovery's rotation rules; two that do not see each other freeze (self) or end (recovery).
    let mut next: Vec<(String, Rotation)> = Vec::new();
    let all_recovery: Vec<&Value> = recovery_rotations
        .iter()
        .flat_map(|(_, v)| v.iter().copied())
        .collect();
    // Two recovery rotations that do not see each other (of any keys) end the identity: the recovery rotations and their causal
    // pasts stand, and nothing else counts.
    let crossed = all_recovery.iter().enumerate().any(|(i, a)| {
        all_recovery[i + 1..]
            .iter()
            .any(|b| !sees_in(a, hash_of(b), index) && !sees_in(b, hash_of(a), index))
    });
    let ended = if crossed {
        Some(crate::js::sorted_set(all_recovery.iter().map(|g| hash_of(g))))
    } else {
        None
    };
    let mut olds: Vec<String> = self_rotations.iter().map(|(k, _)| k.clone()).collect();
    for (k, _) in &recovery_rotations {
        if !olds.contains(k) {
            olds.push(k.clone());
        }
    }
    let get = |list: &Vec<(String, Vec<&'_ Value>)>, old: &str| -> Vec<Value> {
        list.iter()
            .find(|(k, _)| k == old)
            .map(|(_, v)| v.iter().map(|b| (*b).clone()).collect())
            .unwrap_or_default()
    };
    for old in &olds {
        let recs = get(&recovery_rotations, old);
        let selfs = get(&self_rotations, old);
        let rec_refs: Vec<&Value> = recs.iter().collect();
        let self_refs: Vec<&Value> = selfs.iter().collect();
        let by_recovery = earliest(&rec_refs, index);
        let by_self = earliest(&self_refs, index);
        if !by_recovery.is_empty() {
            // Two recovery rotations of the key that do not see each other are a Conflict too: the key each brings in is frozen
            // unless another recovery rotation of the key settles it (sees it, or counts to it).
            // Two rotations of the key that do not see each other (recovery or not) are a Conflict: the key each brings in is
            // frozen unless a recovery rotation of the key settles it (sees it, or counts to it).
            let rotations_of_key: Vec<&Value> = recs.iter().chain(selfs.iter()).collect();
            for a in &rotations_of_key {
                let ha = hash_of(a);
                let crosses = rotations_of_key.iter().any(|b| hash_of(b) != ha && !sees_in(a, hash_of(b), index) && !sees_in(b, ha, index));
                let settled = recs.iter().any(|r| sees_in(r, ha, index) || counted_to_of(r).as_deref() == Some(ha));
                if crosses && !settled {
                    for entry in keys.iter_mut() {
                        if entry.by == ha {
                            entry.frozen = true;
                        }
                    }
                }
            }
            // The latest recovery rotation (the one that has every other in its causal past) decides the line; with none, the
            // part of their lines that all share.
            let latest = recs.iter().find(|r| recs.iter().all(|o| hash_of(o) == hash_of(r) || sees_in(r, hash_of(o), index)));
            // With none (recovery rotations of the key that cross, which end the identity), the key speaks on every block either counts:
            // no rotation un-counts a block another counted (identity.md, Conflict), and the end keeps only their causal pasts.
            let rec_line: Vec<String> = match latest {
                Some(r) => line_of(counted_to_of(r).as_deref(), old, &keys, root, index),
                None => {
                    let mut union: Vec<String> = recs.iter().flat_map(|r| line_of(counted_to_of(r).as_deref(), old, &keys, root, index)).collect();
                    union.sort();
                    union.dedup();
                    union
                }
            };
            // The reach is counted from the latest recovery rotation's arrival alone: with none, no arrival decides (no hash picks one).
            let arrived = latest.and_then(|r| arrived_at.and_then(|f| f.at(hash_of(r))));
            // The reach is the genesis's own `recovery_reach`. The check refuses a genesis that names a recovery key and no reach (the
            // pair comes together, check/keys.rs), so a reader never guesses one: with none stated, explicitly, no floor is read.
            let floor = match ss(root, "recovery_reach").filter(|s| !s.is_empty()) {
                Some(reach) => arrived.filter(|a| !a.is_empty()).and_then(|a| add_duration(&a, reach, -1)),
                None => None,
            };
            let by = match latest {
                Some(r) => hash_of(r).to_string(),
                None => crate::js::sorted_set(recs.iter().map(|r| hash_of(r))).join(","),
            };
            let mut all: Vec<String> = selfs
                .iter()
                .chain(recs.iter())
                .map(|g| hash_of(g).to_string())
                .collect();
            all.sort();
            next.push((
                old.clone(),
                Rotation {
                    by,
                    all,
                    counted_to: latest.and_then(|r| counted_to_of(r)),
                    line: rec_line,
                    recovery: true,
                    floor,
                },
            ));
            continue;
        }
        // Two rotations of the key that do not see each other (its own, or an operator's) freeze what each brings in (Conflict).
        for grant in &selfs {
            let h = hash_of(grant);
            if selfs.iter().any(|o| hash_of(o) != h && !sees_in(grant, hash_of(o), index) && !sees_in(o, h, index)) {
                for entry in keys.iter_mut() {
                    if entry.by == h {
                        entry.frozen = true;
                    }
                }
            }
        }
        let mut goods: Vec<&Value> = by_self
            .iter()
            .filter_map(|g| counted_to_of(g).and_then(|h| index.get(&h)))
            .collect();
        goods.sort_by(|a, b| int(st(a, "seq")).partial_cmp(&int(st(b, "seq"))).unwrap_or(core::cmp::Ordering::Equal));
        let mut hashes: Vec<String> = by_self.iter().map(|g| hash_of(g).to_string()).collect();
        hashes.sort();
        let counted_to = goods
            .first()
            .map(|g| hash_of(g).to_string())
            .filter(|h| !h.is_empty())
            .or_else(|| {
                by_self
                    .first()
                    .and_then(|g| counted_to_of(g))
            });
        // Every standing rotation of the key that is not the recovery key's (its own, an operator's: one that has no other rotation of
        // the key in its causal past): the old key speaks on every block a standing rotation counts, so no rotation un-counts a block
        // another counted (identity.md, Conflict).
        let mut line: Vec<String> = Vec::new();
        for g in &by_self {
            line.extend(line_of(counted_to_of(g).as_deref(), old, &keys, root, index));
        }
        line.sort();
        line.dedup();
        // A rotation stands; a later rotation by the old key itself that has another of that key in its causal past is a block of the
        // old key like any other (its speech ended at the first).
        let mut all: Vec<String> = selfs.iter().map(|g| hash_of(g).to_string()).collect();
        all.sort();
        next.push((
            old.clone(),
            Rotation {
                by: hashes.join(","),
                all,
                counted_to,
                line,
                recovery: false,
                floor: None,
            },
        ));
    }
    // Two key grants of one key naming one prev (a fork, rotating or not): Conflict applies. The keys they bring in freeze
    // until a recovery rotation of that key settles it; then those in its causal past speak.
    for ((signer, _), pair) in slots.iter().filter(|(_, p)| p.len() > 1) {
        for (i, a) in pair.iter().enumerate() {
            for c in &pair[i + 1..] {
                // A pair that also rotates one key, the two not seeing each other, is settled by a recovery rotation of that key;
                // any other pair by a recovery rotation of the key that signed both.
                let replaced = ss(a, "replaces").filter(|r| {
                    ss(c, "replaces") == Some(*r) && !sees_in(a, hash_of(c), index) && !sees_in(c, hash_of(a), index)
                });
                let of = replaced.unwrap_or(signer.as_str());
                let settle: Vec<&Value> = recovery_rotations.iter().filter(|(k, _)| k == of).flat_map(|(_, v)| v.iter().copied()).collect();
                for m in [*a, *c] {
                    let hm = hash_of(m);
                    if !settle.iter().any(|r| sees_in(r, hm, index) || counted_to_of(r).as_deref() == Some(hm)) {
                        for entry in keys.iter_mut() {
                            if entry.by == hm {
                                entry.frozen = true;
                            }
                        }
                    }
                }
            }
        }
    }
    // A key is one key however many grants bring it in (An identity's keys): frozen when any of them is.
    let frozen: Vec<String> = keys.iter().filter(|k| k.frozen).map(|k| k.key.clone()).collect();
    for k in keys.iter_mut() {
        if frozen.contains(&k.key) {
            k.frozen = true;
        }
    }
    // A key brought in by a void block is void, and so is every key it brought in.
    let context = Context {
        index,
        rotations: &next,
        arrived_at,
    };
    for i in 1..keys.len() {
        let grant = index.get(&keys[i].by);
        let signer = match keys[i].signer.as_deref() {
            Some("recovery") | Some("operator") | None => None,
            Some(s) => keys.iter().position(|o| o.key == s),
        };
        if let Some(j) = signer {
            let speaks_now = grant.is_some_and(|g| speaks(&keys[j], g, &context));
            // Nothing a frozen key signs counts, so a key grant it signed brings in no key (identity.md, Conflict).
            if keys[j].void || keys[j].frozen || !speaks_now {
                keys[i].void = true;
            }
        }
    }
    Identity {
        keys,
        rotations: next,
        recovery,
        ended,
    }
}

/// The block a rotation says the old key's chain counts up to (`counted_to`).
fn counted_to_of(grant: &Value) -> Option<String> {
    ss(grant, "counted_to").map(String::from)
}

/// A rotated key's counted line (identity.md, Rotation): `counted_to` and every block reached from it by `prev` while each is a
/// block of this id signed by the old key. A sibling off that line (one that names the same `prev` as a block on it) is not on it.
fn line_of(counted_to: Option<&str>, old: &str, keys: &[KeyEntry], root: &Value, index: &Index) -> Vec<String> {
    let id = hash_of(root);
    let Some(suite) = keys.iter().find(|k| k.key == old).map(|k| k.suite.clone()) else { return Vec::new() };
    let mut out: Vec<String> = Vec::new();
    let mut at = counted_to.and_then(|h| index.get(h));
    while let Some(b) = at {
        let h = hash_of(b);
        if rs(b, "author") != Some(id) || st(b, "seq").is_none() || out.iter().any(|o| o == h) || !opens_as(b, old, &suite) {
            break;
        }
        out.push(h.to_string());
        at = rs(b, "prev").and_then(|p| index.get(p));
    }
    out.sort();
    out
}


// Whether a key speaks for a block: never rotated, or the block is on the old key's counted line (or is the rotation itself),
// or a recovery rotation cannot reach it.
fn speaks(entry: &KeyEntry, block: &Value, cx: &Context) -> bool {
    if entry.void || entry.frozen || past_until(entry, block, cx) {
        return false;
    }
    if st(block, "seq").is_none() {
        return false;
    }
    let Some(rotation) = rotation_of(cx.rotations, &entry.key) else {
        return true;
    };
    let h = hash_of(block);
    if rotation.all.iter().any(|a| a == h) && (!rotation.recovery || rotation.by == h) {
        // The rotation itself stands; a later rotation of the same key that has seen it does not.
        return !rotation.all.iter().any(|other| {
            other != h && cx.index.contains_key(other) && sees_in(block, other, cx.index)
        });
    }
    // A key's own rotation (or its operator's) only closes its future (decision C1): a block of the old key is void once a rotation of
    // the key is in its causal past, and every block it signed that has none still speaks, whatever `counted_to` says. Two of them that
    // name one `prev` are a pair like any other (A fork): what the signer owes on either stands.
    if !rotation.recovery {
        return !rotation.all.iter().any(|r| r != h && cx.index.contains_key(r) && sees_in(block, r, cx.index));
    }
    // Only the recovery key reaches back. Its `counted_to` is one of the blocks it rests on (protocol.json `needs`), so its line is
    // held: a block of the old key counts when it is on the line, never by its `seq` alone (a sibling of a counted block is void and
    // forms no pair), unless the reach protects it (a view).
    if rotation.line.binary_search_by(|l| l.as_str().cmp(h)).is_ok() {
        return true;
    }
    beyond_reach(block, rotation, cx)
}

// A key grant with `scope.until` brings its key in until then (decision H11): the key speaks for no block that grant cuts (`ran_out`).
fn past_until(entry: &KeyEntry, block: &Value, cx: &Context) -> bool {
    cx.index.get(&entry.by).filter(|g| type_of(g) == "grant").is_some_and(|g| crate::grant::ran_out(g, block))
}

/// built-on stands (folds.md): whether a block of another author rests on this one, holding it in its causal past. A void, a stop, a
/// fork, a rotation or a removal never un-counts what such a block built on before it had seen the cut.
fn built_on(block: &Value, index: &Index) -> bool {
    let (h, author) = (hash_of(block), rs(block, "author"));
    index.values().any(|o| rs(o, "author").is_some() && rs(o, "author") != author && hash_of(o) != h && sees_in(o, h, index))
}

/// Whether `other` relied on `block`: it names the block (by any ref but its own `prev`), or the block is the yes to what `other` did
/// (an `accepted` answer to a transfer: a payment taken, a delivery received). The circle's cut (C6) and a successor's close (d1) stand
/// aside for what such a block relied on.
#[cfg(feature = "folds")]
pub(crate) fn relied_on(other: &Value, block: &Value) -> bool {
    let h = hash_of(block);
    hash_of(other) != h
        && ((rs(other, "prev") != Some(h) && crate::order::causes_of(other).iter().any(|c| c == h))
            || (type_of(block) == "transfer" && ss(block, "status") == Some("accepted") && rs(block, "answers") == Some(hash_of(other))))
}

// A crossing never erases what someone else built on (decision C1, n3): a block of a key that a crossing froze, while no recovery
// rotation has settled it, still speaks when a block of another author holds it in its causal past. A key grant is not such a block:
// a frozen key brings in no key.
fn built_on_frozen(entry: &KeyEntry, block: &Value, cx: &Context) -> bool {
    if entry.void || !entry.frozen || past_until(entry, block, cx) || type_of(block) == "grant" && ss(block, "kind") == Some("key") || st(block, "seq").is_none() {
        return false;
    }
    let froze = cx.index.get(&entry.by).and_then(|g| ss(g, "replaces").map(String::from).or_else(|| entry.signer.clone()));
    if froze.is_some_and(|k| rotation_of(cx.rotations, &k).is_some_and(|r| r.recovery)) {
        return false;
    }
    built_on(block, cx.index)
}

// A recovery rotation cannot void a block that another identity built on (holds in its causal past) when that block arrived
// before its reach began (the rotation's arrival, less recovery_reach). A block nobody built on is void whenever it arrived. A block whose
// arrival the reader does not know is read as the reader chose (`Arrivals`); a rotation whose arrival it does not know has no reach start,
// so the pure fold's voiding stands. Without arrivals (the fold), everything is within reach.
fn beyond_reach(block: &Value, rotation: &Rotation, cx: &Context) -> bool {
    let (Some(floor), Some(arrived_at)) = (rotation.floor.as_deref(), cx.arrived_at) else {
        return false;
    };
    built_on(block, cx.index) && arrived_at.at(hash_of(block)).map_or_else(|| arrived_at.outside(), |at| at.as_str() < floor)
}

/// The keys an id has held.
/// A key brought in by two key grants is one key (identity.md: the keys are a set): it is listed once, by the grant that brought
/// it first, void only when every listing is, frozen when any is.
pub fn key_timeline_in(id: &str, index: &Index, arrived_at: ArrivedAt) -> Vec<KeyEntry> {
    let mut out: indexmap::IndexMap<String, KeyEntry, crate::js::BuildHasher> = Default::default();
    for e in identity_in(id, index, arrived_at).keys {
        match out.get_mut(&e.key) {
            Some(o) => {
                o.void &= e.void;
                o.frozen |= e.frozen;
            }
            None => {
                out.insert(e.key.clone(), e);
            }
        }
    }
    out.into_values().collect()
}
pub fn key_timeline(id: &str, blocks: &[Value], arrived_at: ArrivedAt) -> Vec<KeyEntry> {
    key_timeline_in(id, &crate::js::held_index(blocks), arrived_at)
}
/// The keys of an id that are live (nodes.md, Messages: a signed request is signed by a live key of its signer): not void, not frozen,
/// and not rotated out. A rotated-out key still speaks for its blocks up to `counted_to`, but signs no new request. Sorted.
pub fn live_keys(id: &str, blocks: &[Value]) -> Vec<String> {
    let index = crate::js::held_index(blocks);
    let identity = identity_in(id, &index, None);
    let mut out: Vec<String> = identity
        .keys
        .iter()
        .filter(|e| !e.void && !e.frozen && rotation_of(&identity.rotations, &e.key).is_none())
        .map(|e| e.key.clone())
        .collect();
    out.sort();
    out.dedup();
    out
}

/// The keys that speak for an id (every key it holds that is not void).
pub fn keys_of(id: &str, blocks: &[Value], arrived_at: ArrivedAt) -> Vec<String> {
    key_timeline(id, blocks, arrived_at)
        .into_iter()
        .filter(|e| !e.void)
        .map(|e| e.key)
        .collect()
}

/// Whether a signed block is its author's: its signature opens with one of the id's keys that speaks for it, or it is
/// a key grant the recovery key signed. Two recovery rotations that cross end the identity: then only what either of
/// them saw still stands.
pub fn signed_by_author_in(block: &Value, index: &Index, arrived_at: ArrivedAt) -> bool {
    if is_genesis(block) {
        return genesis_opens(Some(block));
    }
    let owned;
    let all = if index.contains_key(hash_of(block)) {
        index
    } else if !crate::js::readable(block, index) {
        // a block no node would take on what it rests on is no word of anyone's (folds.md: a fold reads only valid blocks)
        return false;
    } else {
        let mut i = index.clone();
        i.insert(hash_of(block).to_string(), block.clone());
        owned = i;
        &owned
    };
    let id = rs(block, "author").unwrap_or("");
    let state = identity_in(id, all, arrived_at);
    signed_with(block, &state, all, arrived_at)
}

/// `signed_by_author` with the author's identity already read from `all` (which holds the block).
fn signed_with(block: &Value, state: &Identity, all: &Index, arrived_at: ArrivedAt) -> bool {
    let h = hash_of(block);
    if let Some(ended) = &state.ended {
        if !ended
            .iter()
            .any(|e| e == h || all.get(e).is_some_and(|b| all.past_of(b).contains(h)))
        {
            return false;
        }
    }
    if type_of(block) == "grant" {
        if let Some(r) = ss(block, "recovery_key") {
            if state.recovery.iter().any(|k| k == r) && opens(block, r) {
                return true;
            }
        }
    }
    // The recovery key also signs the defeats of a successor's trigger (profiles/successor.md).
    #[cfg(feature = "successor")]
    if recovery_defeats_ok(block, all) && recovery_signer_of(block, rs(block, "author").unwrap_or(""), all).is_some() {
        return true;
    }
    let cx = Context {
        index: all,
        rotations: &state.rotations,
        arrived_at,
    };
    state
        .keys
        .iter()
        .any(|e| opens_as(block, &e.key, &e.suite) && (speaks(e, block, &cx) || built_on_frozen(e, block, &cx)))
}

pub fn signed_by_author(block: &Value, blocks: &[Value], arrived_at: ArrivedAt) -> bool {
    signed_by_author_in(block, &crate::js::held_index(blocks), arrived_at)
}

/// The identity fold (§11, What each fold returns).
#[derive(Debug, Clone, PartialEq)]
pub struct IdentityState {
    /// Hash → whether the block is the id's, for the genesis and every block naming it as author.
    pub signed_by_author: Vec<(String, bool)>,
    /// The keys that speak (not void), sorted.
    pub keys: Vec<String>,
    /// The keys frozen (and not void), sorted.
    pub frozen: Vec<String>,
    /// Who answers for it (operator grants), sorted.
    pub operators: Vec<String>,
}

impl IdentityState {
    /// `{ signed_by_author, keys, frozen, operators }`.
    pub fn to_json(&self) -> Value {
        json!({
            "signed_by_author": Value::Object(self.signed_by_author.iter().map(|(h, ok)| (h.clone(), Value::Bool(*ok))).collect()),
            "keys": self.keys, "frozen": self.frozen, "operators": self.operators,
        })
    }
}

/// The identity fold: who an id is among these blocks: `{ signed_by_author, keys (sorted), frozen (sorted), operators
/// (sorted) }`.
pub fn identity_state(id: &str, blocks: &[Value], arrived_at: ArrivedAt) -> IdentityState {
    let index = crate::js::held_index(blocks);
    let timeline = key_timeline_in(id, &index, arrived_at);
    let mut keys: Vec<String> = timeline
        .iter()
        .filter(|e| !e.void)
        .map(|e| e.key.clone())
        .collect();
    keys.sort();
    let mut frozen: Vec<String> = timeline
        .iter()
        .filter(|e| !e.void && e.frozen)
        .map(|e| e.key.clone())
        .collect();
    frozen.sort();
    let all: Vec<Value> = index.values().cloned().collect();
    IdentityState {
        signed_by_author: index
            .values()
            .filter(|b| hash_of(b) == id || rs(b, "author") == Some(id))
            .map(|b| {
                (
                    hash_of(b).to_string(),
                    signed_by_author_in(b, &index, arrived_at),
                )
            })
            .collect(),
        keys,
        frozen,
        operators: crate::grant::operators_of(id, &all, None),
    }
}

/// Which of an id's keys signed a block (its public key), or None.
pub fn signer_of(block: &Value, keys: &[KeyEntry]) -> Option<String> {
    keys.iter()
        .find(|e| opens_as(block, &e.key, &e.suite))
        .map(|e| e.key.clone())
}

/// The recovery key that signed a block of this id, when one did (a key of the id's own never does): the recovery keys
/// the id's key grants prove, or the one the block itself names and the genesis hashes.
pub fn recovery_signer_of(block: &Value, id: &str, index: &Index) -> Option<String> {
    let named = ss(block, "recovery_key").filter(|r| {
        let Some((hash, rsuite)) = crate::valid::recovery_hash_of(id, index) else { return false };
        index.get(id).is_some_and(|root| recovery_key_hash_in(&suite_named(root), r) == hash) && opens_as(block, r, &rsuite)
    });
    // every block the recovery key signs names it in state.recovery_key (a key grant, and the defeats of a successor's trigger)
    named.map(String::from)
}

/// One key's chain for an id.
#[derive(Debug, Clone, PartialEq)]
pub struct KeyChain {
    pub key: String,
    pub by: String,
    pub chain: Chain,
}

/// Each key's chain for an id. Blocks without seq sit in no chain.
pub fn chains_of_in(id: &str, index: &Index) -> Vec<KeyChain> {
    let mine: Vec<&Value> = index
        .values()
        .filter(|b| rs(b, "author") == Some(id) && int(st(b, "seq")).is_some())
        .collect();
    key_timeline_in(id, index, None)
        .into_iter()
        .map(|e| {
            let signed: Vec<Value> = mine
                .iter()
                .filter(|b| opens_as(b, &e.key, &e.suite))
                .map(|b| (*b).clone())
                .collect();
            let chain = check_chain(&signed, &e.by);
            KeyChain {
                key: e.key,
                by: e.by,
                chain,
            }
        })
        .collect()
}
pub fn chains_of(id: &str, blocks: &[Value]) -> Vec<KeyChain> {
    chains_of_in(id, &crate::js::held_index(blocks))
}

/// Where an id's next block goes for one of its keys.
pub fn next_link_for_in(id: &str, public_key: &str, index: &Index) -> Result<Link> {
    let chains = chains_of_in(id, index);
    let chain = chains
        .iter()
        .find(|c| c.key == public_key)
        .ok_or_else(|| Error::new("identity: that key is not one of theirs"))?;
    if !chain.chain.equivocations.is_empty() {
        return Err(Error::new(
            "identity: this key has signed two blocks naming one prev",
        ));
    }
    next_link(chain.chain.head.as_ref(), Some(&chain.by))
}
pub fn next_link_for(id: &str, public_key: &str, blocks: &[Value]) -> Result<Link> {
    next_link_for_in(id, public_key, &crate::js::held_index(blocks))
}
