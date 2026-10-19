//! Who someone is (modules/identity.md). Their genesis is the one block with no author: a public `actor` naming its
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
use crate::js::{hash_of, index_of, int, rf, rs, ss, st, truthy, type_of, Index};
use crate::order::{causal_order_among, past_in, sees_in};
use crate::prelude::*;
use crate::sign::{sign_in, verify_in};
use crate::time::add_duration;

/// When a block arrived on this node (an ISO time), for recovery reach.
pub type ArrivedAt<'a> = Option<&'a dyn Fn(&str) -> Option<String>>;

/// Whether a public key opens a block's signature, in the key's suite.
pub fn opens_as(block: &Value, public_key: &str, suite: &str) -> bool {
    match block.get("signature").and_then(Value::as_str) {
        Some(sig) if !sig.is_empty() && !public_key.is_empty() => verify_in(suite, block, sig, public_key),
        _ => false,
    }
}

/// Whether a public key opens a block's signature (a `std` key unless the key says its suite by its SPKI prefix).
pub fn opens(block: &Value, public_key: &str) -> bool {
    let suite = crate::sign::suite_of_key(public_key).unwrap_or_else(|| "std".to_string());
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
    recovery_key_hash_in("std", public_key)
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
    pub kind: &'a str,
    pub at: String,
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
/// the key; the recovery fields come as a pair or not at all.
pub fn genesis(keys: &crate::sign::Keypair, options: &GenesisOptions) -> Result<Value> {
    let suite = if keys.suite.is_empty() { "std" } else { keys.suite.as_str() };
    let mut state = json!({
        "kind": options.kind, "at": options.at, "audience": "public", "public_key_sign": keys.public_key_sign,
    });
    let m = state.as_object_mut().unwrap();
    if suite != "std" {
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
    signed(block, &keys.private_key, suite)
}

/// A genesis: an actor that names its own signing key and has no author (core.md, section 4).
pub fn is_genesis(block: &Value) -> bool {
    type_of(block) == "actor"
        && ss(block, "public_key_sign").is_some()
        && !truthy(rf(block, "author"))
        && st(block, "seq").is_none()
}
/// A genesis is valid when its own key opens it, in its suite.
pub fn genesis_opens(block: Option<&Value>) -> bool {
    block.is_some_and(|b| {
        is_genesis(b) && opens_as(b, ss(b, "public_key_sign").unwrap_or(""), &suite_named(b))
    })
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
/// (`after`), a new `encrypt` key, `recovery` (key, reach) that adds recovery to a genesis without it, the new key's
/// `suite`, whether this block is a `skip`, and the suite the signer signs in.
#[derive(Default)]
pub struct KeyGrantExtras<'a> {
    pub replaces: Option<&'a str>,
    pub counted_to: Option<&'a str>,
    pub after: &'a [&'a str],
    pub encrypt: Option<&'a str>,
    pub recovery: Option<(&'a str, &'a str)>,
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
    let signer_suite = x.signer_suite.filter(|s| !s.is_empty()).unwrap_or("std");
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
    if let Some(a) = x.suite.filter(|a| !a.is_empty() && *a != "std") {
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
    if let Some((key, reach)) = x.recovery {
        let identity_suite = x.suite.filter(|s| !s.is_empty()).unwrap_or(signer_suite);
        m.insert("recovery_key_hash".into(), json!(recovery_key_hash_in(identity_suite, key)));
        m.insert("recovery_reach".into(), json!(reach));
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
// A block is a fork member when its signing key signed another block that names the same `prev`. Which key signed a
// block is found by trying the author's keys, so the pairs are found once per set of blocks (`mark_forks`), and a
// block carries the answer in memory (`_fork`), never in the signed content.

/// The pairs of blocks, among these, that one key of one author signed naming one `prev`: each pair sorted, and the
/// list sorted.
pub fn fork_pairs_in(index: &Index) -> Vec<[String; 2]> {
    let mut by_slot: Vec<(String, Vec<String>)> = Vec::new();
    let mut authors: Vec<&str> = Vec::new();
    for b in index.values() {
        if let Some(a) = rs(b, "author").filter(|a| !a.is_empty() && rs(b, "prev").is_some()) {
            if !authors.contains(&a) {
                authors.push(a);
            }
        }
    }
    for author in authors {
        let keys = identity_in(author, index, None).keys;
        for b in index.values().filter(|b| rs(b, "author") == Some(author) && rs(b, "prev").is_some()) {
            let Some(key) = signer_of(b, &keys) else { continue };
            let slot = format!("{author} {key} {}", rs(b, "prev").unwrap_or(""));
            match by_slot.iter_mut().find(|(s, _)| *s == slot) {
                Some((_, group)) => group.push(hash_of(b).to_string()),
                None => by_slot.push((slot, vec![hash_of(b).to_string()])),
            }
        }
    }
    let mut pairs: Vec<[String; 2]> = Vec::new();
    for (_, mut group) in by_slot {
        group.sort();
        group.dedup();
        for i in 0..group.len() {
            for j in i + 1..group.len() {
                pairs.push([group[i].clone(), group[j].clone()]);
            }
        }
    }
    pairs.sort();
    pairs
}

/// Mark in memory every block of a fork: the pair members, and every later block of the same key (one that has a
/// member in its `prev` ancestry). The identity fold ignores the marks.
pub fn mark_forks(index: &mut Index) {
    let pairs = fork_pairs_in(index);
    // Every block is marked, `true` or `false`: a block that says `false` has been looked at, so `forked_in` never has to
    // find the pairs again for each block it is asked about (that made every fold quadratic, with a signature check
    // per block each time; found by the simulator, tools/sim).
    for b in index.values_mut() {
        if b.is_object() {
            b["_fork"] = json!(false);
        }
    }
    if pairs.is_empty() {
        return;
    }
    let mut marked: Vec<String> = pairs.iter().flat_map(|p| p.iter().cloned()).collect();
    marked.sort();
    marked.dedup();
    // Later blocks: follow `prev` forward among the same author's blocks.
    let mut grew = true;
    while grew {
        grew = false;
        let hashes: Vec<(String, Option<String>, Option<String>)> = index
            .values()
            .map(|b| (hash_of(b).to_string(), rs(b, "prev").map(String::from), rs(b, "author").map(String::from)))
            .collect();
        for (h, prev, author) in hashes {
            if marked.contains(&h) {
                continue;
            }
            let Some(prev) = prev else { continue };
            if marked.contains(&prev) && index.get(&prev).is_some_and(|p| rs(p, "author").map(String::from) == author) {
                marked.push(h);
                grew = true;
            }
        }
    }
    for h in marked {
        if let Some(b) = index.get_mut(&h) {
            b["_fork"] = json!(true);
        }
    }
}

/// Whether a block is one of a pair of one key that name one `prev`, or a later block of that key: proof of a lie,
/// counted for nothing in every fold but the identity fold (folds.md, Equivocations).
pub fn forked_in(block: &Value, index: &Index) -> bool {
    if let Some(mark) = block.get("_fork") {
        return mark == &Value::Bool(true);
    }
    let mut copy = index.clone();
    mark_forks(&mut copy);
    copy.get(hash_of(block)).is_some_and(|b| b.get("_fork") == Some(&Value::Bool(true)))
}

pub fn forked(block: &Value, blocks: &[Value]) -> bool {
    forked_in(block, &crate::js::held_index(blocks))
}

/// Whether a block counts in a fold other than the identity fold: a genesis, or a block of a key that has not signed
/// two blocks naming one `prev` at or before it. (Its signature is the reader's own check.) Folds mark the forks once
/// (`mark_forks`) so this is a lookup.
pub fn counts_in(block: &Value, index: &Index) -> bool {
    if is_genesis(block) {
        return true;
    }
    if st(block, "seq").is_none() {
        return false;
    }
    !forked_in(block, index)
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

/// The live operators of an autonomous system or machine (the authors of its live operator grants) among these blocks.
fn operators_in(id: &str, index: &Index) -> Vec<String> {
    let authors: Vec<&str> = index
        .values()
        .filter(|b| {
            type_of(b) == "grant"
                && ss(b, "kind") == Some("operator")
                && rs(b, "to") == Some(id)
                && rs(b, "subject").is_none()
                && st(b, "status").is_none()
                && crate::grant::is_live_in(b, index, None)
        })
        .filter_map(|b| rs(b, "author"))
        .collect();
    crate::js::sorted_set(authors)
}

fn key_grants_of(id: &str, index: &Index, operators: &[(String, Vec<(String, String)>)]) -> Vec<Value> {
    let mine: Index = index
        .iter()
        .filter(|(_, b)| {
            type_of(b) == "grant"
                && ss(b, "kind") == Some("key")
                && (rs(b, "author") == Some(id) || operators.iter().any(|(o, _)| rs(b, "author") == Some(o.as_str())))
                && rs(b, "subject") == Some(id)
                && int(st(b, "seq")).is_some()
                && st(b, "status").is_none()
        })
        .map(|(h, b)| (h.clone(), b.clone()))
        .collect();
    // In causal order among the blocks of the whole record, not among the grants alone: one grant may follow another only
    // through blocks that are not grants (a new key's chain: a note, a thing, then a second grant), and ordering the grants
    // by themselves loses that. A block that sees another has a strictly larger causal past, so past size orders them.
    let mut ordered: Vec<(usize, String, Value)> = mine.iter().map(|(h, b)| (past_in(b, index).len(), h.clone(), b.clone())).collect();
    ordered.sort_by(|a, b| (a.0, &a.1).cmp(&(b.0, &b.1)));
    ordered.into_iter().map(|(_, _, b)| b).collect()
}

// The earliest of a set of blocks: those whose causal past holds no other of them.
fn earliest<'a>(set: &[&'a Value], index: &Index) -> Vec<&'a Value> {
    set.iter()
        .filter(|one| {
            !set.iter()
                .any(|other| !core::ptr::eq(*other, **one) && sees_in(one, hash_of(other), index))
        })
        .copied()
        .collect()
}

struct Context<'a> {
    index: &'a Index,
    rotations: &'a [(String, Rotation)],
    arrived_at: ArrivedAt<'a>,
}

/// What an id's keys are, among these blocks.
pub fn identity_in(id: &str, index: &Index, arrived_at: ArrivedAt) -> Identity {
    identity_depth(id, index, arrived_at, 0)
}

fn identity_depth(id: &str, index: &Index, arrived_at: ArrivedAt, depth: usize) -> Identity {
    let root = index.get(id);
    if !genesis_opens(root) {
        return Identity::default();
    }
    let root = root.unwrap();
    // An autonomous system's or machine's operator may rotate its keys (identity.md, Who may rotate): the operator's own keys.
    let acts_for = matches!(ss(root, "kind"), Some("agent" | "machine"));
    let operators: Vec<(String, Vec<(String, String)>)> = if acts_for && depth == 0 {
        operators_in(id, index)
            .into_iter()
            .map(|o| {
                let keys = identity_depth(&o, index, None, 1)
                    .keys
                    .into_iter()
                    .filter(|k| !k.void && !k.frozen)
                    .map(|k| (k.key, k.suite))
                    .collect();
                (o, keys)
            })
            .collect()
    } else {
        Vec::new()
    };
    let grants = key_grants_of(id, index, &operators);
    let mut rotations: Vec<(String, Rotation)> = Vec::new();
    let mut result = Identity::default();
    // Rotations can void grants that came before them in causal order, so read until nothing changes.
    for pass in 0..=grants.len() + 1 {
        result = read_keys(id, root, &grants, index, &rotations, arrived_at, &operators);
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
    id: &str,
    root: &Value,
    grants: &[Value],
    index: &Index,
    rotations: &[(String, Rotation)],
    arrived_at: ArrivedAt,
    operators: &[(String, Vec<(String, String)>)],
) -> Identity {
    let mut recovery_hashes: Vec<String> = ss(root, "recovery_key_hash")
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
    let mut slots: Vec<(String, String, Vec<&Value>)> = Vec::new();
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
            keys.iter().position(|e| {
                !e.void && !e.frozen && opens_as(grant, &e.key, &e.suite) && speaks(e, grant, &context)
            })
        };
        // The operator of an autonomous system or machine: a key of its operator opens the grant (the grant's author is the operator).
        let by_operator = !by_recovery
            && signer.is_none()
            && operators.iter().any(|(o, ks)| {
                rs(grant, "author") == Some(o.as_str()) && ks.iter().any(|(k, suite)| opens_as(grant, k, suite))
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
        // An older genesis adds recovery once, by a key grant naming it.
        if let Some(h) = ss(grant, "recovery_key_hash").filter(|s| !s.is_empty()) {
            if recovery_hashes.is_empty() {
                recovery_hashes.push(h.to_string());
            }
        }
        if let Some(old) = st(grant, "replaces").filter(|v| truthy(Some(v))) {
            let old = crate::js::text(Some(old));
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
        if let Some(k) = st(grant, "public_key_sign").filter(|v| truthy(Some(v))) {
            keys.push(KeyEntry {
                key: crate::js::text(Some(k)),
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
        if let Some(i) = signer {
            let key = keys[i].key.clone();
            let prev = rs(grant, "prev").unwrap_or("").to_string();
            match slots.iter_mut().find(|(k, s, _)| *k == key && *s == prev) {
                Some((_, _, pair)) => pair.push(grant),
                None => slots.push((key, prev, vec![grant])),
            }
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
    let crossing = earliest(&all_recovery, index);
    let ended = if crossing.len() > 1 {
        Some(crate::js::sorted_set(crossing.iter().map(|g| hash_of(g))))
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
            let chain = causal_order_among(&index_of(recs.iter()), index);
            let rule = chain.last().unwrap();
            for grant in &selfs {
                if !sees_in(rule, hash_of(grant), index) {
                    for entry in keys.iter_mut() {
                        if entry.by == hash_of(grant) {
                            entry.frozen = true;
                        }
                    }
                }
            }
            let arrived = arrived_at.and_then(|f| f(hash_of(rule)));
            let reach = ss(root, "recovery_reach")
                .filter(|s| !s.is_empty())
                .map(String::from)
                .or_else(|| recovery_reach_of(id, index));
            let floor = arrived
                .filter(|a| !a.is_empty())
                .and_then(|a| add_duration(&a, reach.as_deref().unwrap_or(""), -1));
            let mut all: Vec<String> = selfs
                .iter()
                .chain(recs.iter())
                .map(|g| hash_of(g).to_string())
                .collect();
            all.sort();
            next.push((
                old.clone(),
                Rotation {
                    by: hash_of(rule).to_string(),
                    all,
                    counted_to: counted_to_of(rule),
                    recovery: true,
                    floor,
                },
            ));
            continue;
        }
        if by_self.len() > 1 {
            for grant in &by_self {
                for entry in keys.iter_mut() {
                    if entry.by == hash_of(grant) {
                        entry.frozen = true;
                    }
                }
            }
        }
        let mut goods: Vec<&Value> = by_self
            .iter()
            .filter_map(|g| counted_to_of(g).and_then(|h| index.get(&h)))
            .collect();
        goods.sort_by(|a, b| {
            crate::js::number_of(st(a, "seq"))
                .partial_cmp(&crate::js::number_of(st(b, "seq")))
                .unwrap_or(core::cmp::Ordering::Equal)
        });
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
        next.push((
            old.clone(),
            Rotation {
                by: hashes.join(","),
                all: hashes,
                counted_to,
                recovery: false,
                floor: None,
            },
        ));
    }
    // Two key grants of one key naming one prev (a fork, rotating or not): Conflict applies. The keys they bring in freeze
    // until a recovery rotation of that key settles it; then those in its causal past speak.
    for (signer, _, pair) in slots.iter().filter(|(_, _, p)| p.len() > 1) {
        let settle: Vec<Value> = recovery_rotations
            .iter()
            .find(|(k, _)| k == signer)
            .map(|(_, v)| v.iter().map(|b| (*b).clone()).collect())
            .unwrap_or_default();
        let chain = causal_order_among(&index_of(settle.iter()), index);
        let rule = chain.last();
        for grant in pair {
            if rule.is_none_or(|r| !sees_in(r, hash_of(grant), index)) {
                for entry in keys.iter_mut() {
                    if entry.by == hash_of(grant) {
                        entry.frozen = true;
                    }
                }
            }
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
            if keys[j].void || !speaks_now {
                keys[i].void = true;
            }
            if keys[j].frozen {
                keys[i].frozen = true;
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

/// The block a rotation or removal says the subject's chain counts up to (`counted_to`).
///
/// `last_counted` are older names for it).
fn counted_to_of(grant: &Value) -> Option<String> {
    ss(grant, "counted_to").map(String::from)
}

fn recovery_reach_of(id: &str, index: &Index) -> Option<String> {
    index
        .values()
        .find(|b| {
            type_of(b) == "grant" && rs(b, "author") == Some(id) && truthy(st(b, "recovery_reach"))
        })
        .and_then(|b| ss(b, "recovery_reach"))
        .map(String::from)
}

// Whether a key speaks for a block: never rotated, or the block is at or before its counted_to block (or is the
// rotation itself), or a recovery rotation cannot reach it.
fn speaks(entry: &KeyEntry, block: &Value, cx: &Context) -> bool {
    if entry.void || entry.frozen {
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
    if rotation.counted_to.as_deref() == Some(h) {
        return true;
    }
    let good = rotation.counted_to.as_deref().and_then(|g| cx.index.get(g));
    // A rotation's `counted_to` is one of the blocks it rests on (protocol.json `needs`): a fold never meets a rotation without it.
    if let Some(good_seq) = good.and_then(|g| int(st(g, "seq"))) {
        if crate::js::number_of(st(block, "seq")) <= good_seq {
            return true;
        }
    }
    rotation.recovery && beyond_reach(block, rotation, cx)
}

// A recovery rotation cannot void a block that arrived, or that another identity built on and that arrived, before
// its reach began (the rotation's arrival, less recovery_reach). Without arrival times, everything is within reach.
fn beyond_reach(block: &Value, rotation: &Rotation, cx: &Context) -> bool {
    let (Some(floor), Some(arrived_at)) = (rotation.floor.as_deref(), cx.arrived_at) else {
        return false;
    };
    let h = hash_of(block);
    let author = rf(block, "author");
    let users = cx.index.values().filter(|o| {
        !crate::js::strict_eq(rf(o, "author"), author) && past_in(o, cx.index).contains(h)
    });
    core::iter::once(block)
        .chain(users)
        .any(|one| arrived_at(hash_of(one)).is_some_and(|at| !at.is_empty() && at.as_str() < floor))
}

/// The keys an id has held.
pub fn key_timeline_in(id: &str, index: &Index, arrived_at: ArrivedAt) -> Vec<KeyEntry> {
    identity_in(id, index, arrived_at).keys
}
pub fn key_timeline(id: &str, blocks: &[Value], arrived_at: ArrivedAt) -> Vec<KeyEntry> {
    key_timeline_in(id, &crate::js::held_index(blocks), arrived_at)
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
    } else {
        let mut i = index.clone();
        i.insert(hash_of(block).to_string(), block.clone());
        owned = i;
        &owned
    };
    let id = rs(block, "author").unwrap_or("");
    let state = identity_in(id, all, arrived_at);
    let h = hash_of(block);
    if let Some(ended) = &state.ended {
        if !ended
            .iter()
            .any(|e| e == h || all.get(e).is_some_and(|b| past_in(b, all).contains(h)))
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
    if type_of(block) == "observe"
        && truthy(rf(block, "defeats"))
        && state.recovery.iter().any(|k| opens(block, k))
    {
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
        .any(|e| opens_as(block, &e.key, &e.suite) && speaks(e, block, &cx))
}

/// Whether this key of an id speaks for a sealed block known by its public header alone (`header`: a block without a `type`,
/// with the header's author, seq and prev): the test of `signed_by_author`, with the key the header's signature opened.
pub fn key_speaks_for_header(entry: &KeyEntry, header: &Value, index: &Index, arrived_at: ArrivedAt) -> bool {
    let mut all = index.clone();
    all.insert(hash_of(header).to_string(), header.clone());
    let id = rs(header, "author").unwrap_or("");
    let state = identity_in(id, &all, arrived_at);
    let h = hash_of(header);
    if let Some(ended) = &state.ended {
        if !ended.iter().any(|e| e == h || all.get(e).is_some_and(|b| past_in(b, &all).contains(h))) {
            return false;
        }
    }
    let cx = Context { index: &all, rotations: &state.rotations, arrived_at };
    state.keys.iter().any(|e| e.key == entry.key && speaks(e, header, &cx))
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
    // the recovery key's other act, the defeats of a successor's trigger, carries no key: the keys its grants proved
    named.map(String::from).or_else(|| {
        if !truthy(rf(block, "defeats")) {
            return None;
        }
        identity_in(id, index, None).recovery.into_iter().find(|r| opens(block, r))
    })
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
