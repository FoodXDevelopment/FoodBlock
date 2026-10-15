//! Who someone is (protocol.md §2). Their genesis is the one block with no author: a public `actor` naming its own
//! signing key, its encryption key, the hash of an offline recovery key and how far back that key may reach, signed by
//! its own key. Its hash is their id. A key comes in by a `grant` of kind key. A rotation (`replaces` and `last_good`)
//! voids the old key's blocks after its last good block, and is signed only by that key or by the recovery key
//! (invariant 8). A key brought in by a void block is void, and so is every key it brought in. Two rotations of one
//! key that do not see each other freeze the keys they bring in, until the recovery key settles it; two recovery
//! rotations that do not see each other end the identity. Recovery reach is read from arrival on the reader's node
//! (`arrived_at`), never from `at` (invariant 6). History is closed (invariant 16).
use crate::block::{create, hash_hex};
use crate::chain::{check_chain, next_link, Chain, Link};
use crate::error::{Error, Result};
use crate::js::{hash_of, index_of, int, list, rf, rs, ss, st, truthy, type_of, Index};
use crate::order::{causal_order_in, past_in, sees_in};
use crate::prelude::*;
use crate::sign::{sign, verify};
use crate::time::add_duration;

/// When a block arrived on this node (an ISO time), for recovery reach.
pub type ArrivedAt<'a> = Option<&'a dyn Fn(&str) -> Option<String>>;

/// Whether a public key opens a block's signature.
pub fn opens(block: &Value, public_key: &str) -> bool {
    match block.get("signature").and_then(Value::as_str) {
        Some(sig) if !sig.is_empty() && !public_key.is_empty() => verify(block, sig, public_key),
        _ => false,
    }
}

/// The recovery key's hash, as a genesis names it: SHA-256 of its SPKI hex, as UTF-8 text.
pub fn recovery_key_hash(public_key: &str) -> String {
    hash_hex(public_key)
}

fn signed(block: Value, private_key: &str) -> Result<Value> {
    let signature = sign(&block, private_key)?;
    let mut block = block;
    block
        .as_object_mut()
        .unwrap()
        .insert("signature".into(), Value::String(signature));
    Ok(block)
}

/// What a new genesis names beside its signing key.
#[derive(Debug, Clone)]
pub struct GenesisOptions<'a> {
    pub kind: &'a str,
    pub at: String,
    /// The X25519 public key (hex), if the identity will receive sealed blocks; empty for a micro that only signs,
    /// which adds one later by a key grant.
    pub encryption_key: &'a str,
    /// The offline recovery key's public signing key (SPKI hex): only its hash is written.
    pub recovery_key: &'a str,
    /// How far back the recovery key may reach (a duration).
    pub reach: &'a str,
    /// The id of the custodian who holds the key for the person (empty when they hold it themselves): written as
    /// `state.custodian`, so every reader sees the key is held by someone else (§2 Held keys).
    pub custodian: &'a str,
}

/// A new person, agent, machine or circle that signs: their genesis, signed.
pub fn genesis(keys: &crate::sign::Keypair, options: &GenesisOptions) -> Result<Value> {
    if options.recovery_key.is_empty() {
        return Err(Error::new("identity: a 1.6 genesis names its recovery key"));
    }
    let mut state = json!({
        "kind": options.kind, "at": options.at, "audience": "public", "public_key_sign": keys.public_key_sign,
        "recovery_key_hash": recovery_key_hash(options.recovery_key), "recovery_reach": options.reach,
    });
    if !options.encryption_key.is_empty() {
        state["public_key_encrypt"] = json!(options.encryption_key);
    }
    if !options.custodian.is_empty() {
        state["custodian"] = json!(options.custodian);
    }
    signed(create("actor", &state, &json!({}))?, &keys.private_key)
}

pub fn is_genesis(block: &Value) -> bool {
    type_of(block) == "actor"
        && ss(block, "public_key_sign").is_some()
        && !truthy(rf(block, "author"))
        && st(block, "seq").is_none()
}
/// A genesis with the recovery fields: a 1.6 genesis, which has no history.
pub fn is_16_genesis(block: &Value) -> bool {
    is_genesis(block)
        && st(block, "recovery_key_hash").is_some()
        && st(block, "recovery_reach").is_some()
}
/// A genesis is valid when its own key opens it.
pub fn genesis_opens(block: Option<&Value>) -> bool {
    block.is_some_and(|b| is_genesis(b) && opens(b, ss(b, "public_key_sign").unwrap_or("")))
}

/// A key grant, signed: brings `new_key` into the id. `signer_private` signs at `place` in its own chain (a key's
/// next link, or for the recovery key `next_link(None, id)`). A rotation also names the key it `replaces` and that
/// key's `last_good` block; a recovery-key rotation names `recovery_key`.
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
        last_good: replaces.map(|r| r.1),
        after,
        ..KeyGrantExtras::default()
    };
    key_grant_with(id, new_key, signer_private, place, at, recovery_key, &extras)
}

/// What a key grant may also carry: the key it `replaces` and that key's `last_good` block (a rotation), blocks seen
/// (`after`), a new `encrypt` key, and `recovery` (key, reach) that adds recovery to an older genesis.
#[derive(Default)]
pub struct KeyGrantExtras<'a> {
    pub replaces: Option<&'a str>,
    pub last_good: Option<&'a str>,
    pub after: &'a [&'a str],
    pub encrypt: Option<&'a str>,
    pub recovery: Option<(&'a str, &'a str)>,
    /// The custodian who holds the key (written as `state.custodian`).
    pub custodian: Option<&'a str>,
}

/// Take your keys (§2 Held keys): a key grant to a key on the person's own device that rotates the custodian's key
/// out. It is `key_grant_with` with `replaces` and `last_good` set and no `custodian`, so the keys are the person's
/// own and their record stays one chain.
pub fn take_keys(
    id: &str,
    own_key: &str,
    signer_private: &str,
    place: &Link,
    at: &str,
    held_key: &str,
    last_good: &str,
) -> Result<Value> {
    let extras = KeyGrantExtras { replaces: Some(held_key), last_good: Some(last_good), ..KeyGrantExtras::default() };
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
    if let Some(old) = x.replaces.filter(|r| !r.is_empty()) {
        m.insert("replaces".into(), json!(old));
        m.insert("last_good".into(), x.last_good.map(|g| json!(g)).unwrap_or(Value::Null));
    }
    if let Some(r) = recovery_key.filter(|r| !r.is_empty()) {
        m.insert("recovery_key".into(), json!(r));
    }
    if let Some((key, reach)) = x.recovery {
        m.insert("recovery_key_hash".into(), json!(recovery_key_hash(key)));
        m.insert("recovery_reach".into(), json!(reach));
    }
    let mut refs = json!({ "author": id, "subject": id, "prev": place.prev });
    let seen = crate::js::sorted_set(x.after.iter());
    if !seen.is_empty() {
        refs["after"] = json!(seen);
    }
    signed(create("grant", &state, &refs)?, signer_private)
}

// ---- History (§2) ----
/// Whether a block without seq counts as its author's history: never for a 1.6 genesis (it has none); while an older
/// identity has written no 1.6 block, its history is open and counts; once it has, only what is in its first 1.6
/// block's causal past or manifest counts. What counts, counts in every fold under the rules it was written in, read
/// through aliases (an old membership or grant stands). A reader that holds neither the genesis nor a 1.6 block of
/// the author has nothing that closes the history, so it reads it as open.
pub fn history_counts_in(block: &Value, id: &str, index: &Index) -> bool {
    if st(block, "seq").is_some() {
        return false;
    }
    if index.get(id).is_some_and(is_16_genesis) {
        return false;
    }
    let firsts: Vec<&Value> = index
        .values()
        .filter(|o| {
            rs(o, "author") == Some(id)
                && int(st(o, "seq")) == Some(1.0)
                && rs(o, "prev") == Some(id)
        })
        .collect();
    if firsts.is_empty() {
        return true;
    }
    let h = hash_of(block);
    firsts
        .iter()
        .any(|first| past_in(first, index).contains(h) || list(st(first, "manifest")).contains(&h))
}

// ---- Two blocks at one seq (§2) ----
// A key's place in its chain, read from the chain alone (no signature): the block that brought the key in, found by
// walking `prev` back to seq 1 (the recovery key's chain, which also starts at the genesis, begins with a block naming
// `recovery_key`). A chain with a gap is named by the first missing link and the seq above it.
fn chain_root(block: &Value, index: &Index) -> Option<String> {
    let seq = int(st(block, "seq"))?;
    let mut at = block;
    let mut steps = 0.0;
    while steps <= seq {
        let at_seq = int(st(at, "seq")).unwrap_or(f64::NAN);
        let prev = crate::js::text(rf(at, "prev"));
        if at_seq == 1.0 {
            let recovery = if truthy(st(at, "recovery_key")) {
                "recovery "
            } else {
                ""
            };
            return Some(format!("{recovery}{prev}"));
        }
        match index.get(&prev) {
            Some(p) if int(st(p, "seq")) == Some(at_seq - 1.0) => at = p,
            _ => return Some(format!("{prev}@{}", crate::canonical::js_number(at_seq))),
        }
        steps += 1.0;
    }
    None
}

fn root_key(author: &str, root: &Option<String>) -> String {
    format!("{author} {}", root.as_deref().unwrap_or("null"))
}

/// Where each key of each author first signed two blocks at one seq: `(author root, seq)`.
fn forks_of(index: &Index) -> Vec<(String, f64)> {
    let mut by_slot: Vec<(String, Vec<&Value>)> = Vec::new();
    for block in index.values() {
        let (Some(author), Some(seq)) = (
            rs(block, "author").filter(|a| !a.is_empty()),
            int(st(block, "seq")),
        ) else {
            continue;
        };
        let slot = format!("{author} {seq}");
        match by_slot.iter_mut().find(|(s, _)| *s == slot) {
            Some((_, group)) => group.push(block),
            None => by_slot.push((slot, vec![block])),
        }
    }
    let mut out: Vec<(String, f64)> = Vec::new();
    for (_, group) in by_slot.iter().filter(|(_, g)| g.len() > 1) {
        let mut roots: Vec<(String, usize)> = Vec::new();
        for block in group {
            let key = root_key(rs(block, "author").unwrap_or(""), &chain_root(block, index));
            match roots.iter_mut().find(|(k, _)| *k == key) {
                Some((_, n)) => *n += 1,
                None => roots.push((key, 1)),
            }
        }
        let seq = int(st(group[0], "seq")).unwrap_or(0.0);
        for (key, n) in roots {
            if n < 2 {
                continue;
            }
            match out.iter_mut().find(|(k, _)| *k == key) {
                Some((_, s)) if *s > seq => *s = seq,
                Some(_) => {}
                None => out.push((key, seq)),
            }
        }
    }
    out
}

/// Whether a block is one of two at one seq of its key, or a later block of that key: proof of a lie, counted for
/// nothing in every fold but the identity fold (§2, Two blocks at one seq; §11, Equivocations in folds).
pub fn forked_in(block: &Value, index: &Index) -> bool {
    let (Some(author), Some(seq)) = (
        rs(block, "author").filter(|a| !a.is_empty()),
        int(st(block, "seq")),
    ) else {
        return false;
    };
    let forks = forks_of(index);
    if forks.is_empty() {
        return false;
    }
    let key = root_key(author, &chain_root(block, index));
    forks.iter().any(|(k, at)| *k == key && seq >= *at)
}

pub fn forked(block: &Value, blocks: &[Value]) -> bool {
    forked_in(block, &index_of(blocks))
}

/// Whether a block counts in a fold other than the identity fold: one with seq unless its key signed two blocks at one
/// seq at or before it (its signature is the reader's own check); one without, as history.
pub fn counts_in(block: &Value, index: &Index) -> bool {
    if is_genesis(block) {
        return true;
    }
    if st(block, "seq").is_some() {
        return !forked_in(block, index);
    }
    history_counts_in(block, rs(block, "author").unwrap_or(""), index)
}

pub fn history_counts(block: &Value, id: &str, blocks: &[Value]) -> bool {
    history_counts_in(block, id, &index_of(blocks))
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
}

/// A rotated key: who rotated it and from where it is void.
#[derive(Debug, Clone, PartialEq)]
pub struct Rotation {
    pub by: String,
    pub all: Vec<String>,
    pub last_good: Option<String>,
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

fn key_grants_of(id: &str, index: &Index) -> Vec<Value> {
    let mine: Index = index
        .iter()
        .filter(|(_, b)| {
            type_of(b) == "grant"
                && ss(b, "kind") == Some("key")
                && rs(b, "author") == Some(id)
                && rs(b, "subject") == Some(id)
                && int(st(b, "seq")).is_some()
                && st(b, "status").is_none()
        })
        .map(|(h, b)| (h.clone(), b.clone()))
        .collect();
    causal_order_in(&mine)
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
    id: &'a str,
}

/// What an id's keys are, among these blocks.
pub fn identity_in(id: &str, index: &Index, arrived_at: ArrivedAt) -> Identity {
    let root = index.get(id);
    if !genesis_opens(root) {
        return Identity::default();
    }
    let root = root.unwrap();
    let grants = key_grants_of(id, index);
    let mut rotations: Vec<(String, Rotation)> = Vec::new();
    let mut result = Identity::default();
    // Rotations can void grants that came before them in causal order, so read until nothing changes.
    for pass in 0..=grants.len() + 1 {
        result = read_keys(id, root, &grants, index, &rotations, arrived_at);
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
    identity_in(id, &index_of(blocks), arrived_at)
}

fn read_keys(
    id: &str,
    root: &Value,
    grants: &[Value],
    index: &Index,
    rotations: &[(String, Rotation)],
    arrived_at: ArrivedAt,
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
    }];
    let mut recovery: Vec<String> = Vec::new();
    let mut self_rotations: Vec<(String, Vec<&Value>)> = Vec::new();
    let mut recovery_rotations: Vec<(String, Vec<&Value>)> = Vec::new();
    // Each key's key grants by seq: two at one seq of one signing key are a fork.
    let mut slots: Vec<(String, f64, Vec<&Value>)> = Vec::new();
    let context = Context {
        index,
        rotations,
        arrived_at,
        id,
    };
    for grant in grants {
        let recovery_key = ss(grant, "recovery_key");
        let by_recovery = recovery_key
            .is_some_and(|r| recovery_hashes.contains(&recovery_key_hash(r)) && opens(grant, r));
        let signer = if by_recovery {
            None
        } else {
            keys.iter().position(|e| {
                !e.void && !e.frozen && opens(grant, &e.key) && speaks(e, grant, &context)
            })
        };
        if !by_recovery && signer.is_none() {
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
            // A key is rotated only by itself or by the recovery key.
            if !by_recovery && keys[signer.unwrap()].key != old {
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
                } else {
                    keys[signer.unwrap()].key.clone()
                }),
                void: false,
                frozen: false,
            });
        }
        if let Some(i) = signer {
            let key = keys[i].key.clone();
            let seq = int(st(grant, "seq")).unwrap_or(f64::NAN);
            match slots.iter_mut().find(|(k, s, _)| *k == key && *s == seq) {
                Some((_, _, pair)) => pair.push(grant),
                None => slots.push((key, seq, vec![grant])),
            }
        }
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
            let chain = causal_order_in(&index_of(recs.iter()));
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
                    last_good: ss(rule, "last_good").map(String::from),
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
            .filter_map(|g| ss(g, "last_good").and_then(|h| index.get(h)))
            .collect();
        goods.sort_by(|a, b| {
            crate::js::number_of(st(a, "seq"))
                .partial_cmp(&crate::js::number_of(st(b, "seq")))
                .unwrap_or(core::cmp::Ordering::Equal)
        });
        let mut hashes: Vec<String> = by_self.iter().map(|g| hash_of(g).to_string()).collect();
        hashes.sort();
        let last_good = goods
            .first()
            .map(|g| hash_of(g).to_string())
            .filter(|h| !h.is_empty())
            .or_else(|| {
                by_self
                    .first()
                    .and_then(|g| ss(g, "last_good"))
                    .map(String::from)
            });
        next.push((
            old.clone(),
            Rotation {
                by: hashes.join(","),
                all: hashes,
                last_good,
                recovery: false,
                floor: None,
            },
        ));
    }
    // Two key grants at one seq of one key (a fork, rotating or not): Conflict applies. The keys they bring in freeze
    // until a recovery rotation of that key settles it; then those in its causal past speak.
    for (signer, _, pair) in slots.iter().filter(|(_, _, p)| p.len() > 1) {
        let settle: Vec<Value> = recovery_rotations
            .iter()
            .find(|(k, _)| k == signer)
            .map(|(_, v)| v.iter().map(|b| (*b).clone()).collect())
            .unwrap_or_default();
        let chain = causal_order_in(&index_of(settle.iter()));
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
        id,
    };
    for i in 1..keys.len() {
        let grant = index.get(&keys[i].by);
        let signer = match keys[i].signer.as_deref() {
            Some("recovery") | None => None,
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

fn recovery_reach_of(id: &str, index: &Index) -> Option<String> {
    index
        .values()
        .find(|b| {
            type_of(b) == "grant" && rs(b, "author") == Some(id) && truthy(st(b, "recovery_reach"))
        })
        .and_then(|b| ss(b, "recovery_reach"))
        .map(String::from)
}

// Whether a key speaks for a block: never rotated, or the block is at or before its last good block (or is the
// rotation itself), or a recovery rotation cannot reach it.
fn speaks(entry: &KeyEntry, block: &Value, cx: &Context) -> bool {
    if entry.void || entry.frozen {
        return false;
    }
    if st(block, "seq").is_none() {
        return history_counts_in(block, cx.id, cx.index);
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
    if rotation.last_good.as_deref() == Some(h) {
        return true;
    }
    let good = rotation.last_good.as_deref().and_then(|g| cx.index.get(g));
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
    key_timeline_in(id, &index_of(blocks), arrived_at)
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
    // The recovery key also signs defeats of a successor's trigger.
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
        id,
    };
    state
        .keys
        .iter()
        .any(|e| opens(block, &e.key) && speaks(e, block, &cx))
}

pub fn signed_by_author(block: &Value, blocks: &[Value], arrived_at: ArrivedAt) -> bool {
    signed_by_author_in(block, &index_of(blocks), arrived_at)
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
    /// `none` for a 1.6 genesis, else `open` or `closed`.
    pub history: String,
}

impl IdentityState {
    /// `{ signed_by_author, keys, frozen, operators, history }`.
    pub fn to_json(&self) -> Value {
        json!({
            "signed_by_author": Value::Object(self.signed_by_author.iter().map(|(h, ok)| (h.clone(), Value::Bool(*ok))).collect()),
            "keys": self.keys, "frozen": self.frozen, "operators": self.operators, "history": self.history,
        })
    }
}

/// The identity fold: who an id is among these blocks: `{ signed_by_author, keys (sorted), frozen (sorted), operators
/// (sorted), history (none for a 1.6 genesis, open or closed) }`.
pub fn identity_state(id: &str, blocks: &[Value], arrived_at: ArrivedAt) -> IdentityState {
    let index = index_of(blocks);
    let timeline = key_timeline_in(id, &index, arrived_at);
    let closed = index.values().any(|b| {
        rs(b, "author") == Some(id) && int(st(b, "seq")) == Some(1.0) && rs(b, "prev") == Some(id)
    });
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
        history: if index.get(id).is_some_and(is_16_genesis) {
            "none"
        } else if closed {
            "closed"
        } else {
            "open"
        }
        .to_string(),
    }
}

/// Which of an id's keys signed a block (its public key), or None.
pub fn signer_of(block: &Value, keys: &[KeyEntry]) -> Option<String> {
    keys.iter()
        .find(|e| opens(block, &e.key))
        .map(|e| e.key.clone())
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
                .filter(|b| opens(b, &e.key))
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
    chains_of_in(id, &index_of(blocks))
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
            "identity: this key has signed two blocks with one seq",
        ));
    }
    next_link(chain.chain.head.as_ref(), Some(&chain.by))
}
pub fn next_link_for(id: &str, public_key: &str, blocks: &[Value]) -> Result<Link> {
    next_link_for_in(id, public_key, &index_of(blocks))
}
