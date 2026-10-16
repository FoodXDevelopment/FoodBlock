//! `valid(block, context)` (core.md, section 8): one predicate. The context is the blocks the checker holds; it never
//! includes a clock. The checks run in the order of core.md and every failure found is one refusal `{ code, detail }`,
//! one per code, in that order (empty when the block is valid):
//!
//! 1. canonical form and strict writing;  2. values and grammars;  3. the limits;  4. the genesis, or the common five;
//! 5. the signing key and its signature;  6. `prev` and `seq` against the key's chain;  7. a closed type's required
//!    fields, undeclared fields and its module's checks.
//!
//! Stages 1 to 4 and 7 read the block alone (check.rs); 5 and 6 read the context. A block whose `prev` is not held
//! cannot be checked against its chain: a node holds it as waiting (sync.rs) rather than calling it invalid.
use crate::block::{rehash, suite_of};
use crate::check::{findings_with, ordered, CheckOptions};
use crate::error::Refusal;
use crate::identity::{
    identity_in, is_genesis, opens_as, recovery_key_hash_in, signed_by_author_in, suite_named, ArrivedAt,
};
use crate::js::{hash_of, int, rs, ss, st, truthy, type_of, Index};
use crate::prelude::*;

fn f(code: &str, detail: impl Into<String>) -> Refusal {
    Refusal::new(code, detail)
}

/// The recovery hash the identity names: its genesis's, else the one a key grant added.
fn recovery_hash_of(id: &str, held: &Index) -> Option<(String, String)> {
    let root = held.get(id)?;
    let suite = suite_named(root);
    let named = ss(root, "recovery_key_hash")
        .map(String::from)
        .or_else(|| {
            held.values()
                .find(|b| {
                    type_of(b) == "grant" && rs(b, "author") == Some(id) && ss(b, "recovery_key_hash").is_some()
                })
                .and_then(|b| ss(b, "recovery_key_hash").map(String::from))
        })?;
    let rsuite = ss(root, "recovery_suite").map(String::from).unwrap_or(suite);
    Some((named, rsuite))
}

/// Whether a block is a key grant, or a successor trigger's `defeats` (the two things a recovery key may sign).
fn recovery_may_sign(block: &Value) -> bool {
    let key_grant = type_of(block) == "grant" && ss(block, "kind") == Some("key");
    #[cfg(feature = "successor")]
    {
        key_grant || (type_of(block) == "observe" && truthy(crate::js::rf(block, "defeats")))
    }
    #[cfg(not(feature = "successor"))]
    key_grant
}

/// Every refusal of a signed block against what the checker holds (`held`, blocks by hash, not including the block).
/// `schemas` lets a named schema's fields and roles count as declared.
pub fn valid(block: &Value, held: &Index, schemas: Option<&Index>, arrived_at: ArrivedAt) -> Vec<Refusal> {
    let spec = crate::spec();
    let (t, state, refs) = (type_of(block), block.get("state").unwrap_or(&Value::Null), block.get("refs").unwrap_or(&Value::Null));
    let mut w = findings_with(spec, t, state, refs, CheckOptions { schemas, held: Some(held) });
    // core.md section 8, check 1: a block is exactly { type, state, refs }. A block with no `type` is not canonical (a `type`
    // that is not a word is `type_name`, found above).
    if block.get("type").is_none() {
        w.push(f("not_canonical", "a block is exactly { type, state, refs }: this one has no type"));
    }
    let content_ok = state.is_object() && refs.is_object();
    if !content_ok {
        return ordered(w, "block");
    }
    let hash = hash_of(block);
    if !hash.is_empty() && hash != rehash(block) {
        w.push(f("bad_hash", "the id sent with it is not the hash of its canonical bytes"));
    }
    let asked_suite = suite_of(block);
    // A genesis is signed by its own key.
    if is_genesis(block) || (t == "actor" && state.get("public_key_sign").is_some()) {
        let suite = suite_named(block);
        let key = ss(block, "public_key_sign").unwrap_or("");
        if !crate::sign::knows_suite(&suite) {
            if spec.suite(&suite).is_some() {
                w.push(f("unknown_suite", format!("the suite {suite} is declared but this build cannot use it")));
            }
        } else if !opens_as(block, key, &suite) {
            w.push(f("bad_genesis", "a genesis is signed by its own key"));
        }
        if !asked_suite.is_empty() && asked_suite != "std" && asked_suite != suite {
            w.push(f("bad_hash", "the message names a suite other than the key's"));
        }
        return ordered(w, "block");
    }
    // Any other block: its signing key is a key of its author that speaks for it.
    let author = rs(block, "author").unwrap_or("");
    if author.is_empty() {
        return ordered(w, "block");
    }
    let mut with = held.clone();
    let signer_entry;
    let identity = identity_in(author, held, arrived_at);
    if identity.keys.is_empty() {
        w.push(f("bad_signature", "the author's genesis is not held, so no key of the author can open it"));
        return ordered(w, "block");
    }
    signer_entry = identity.keys.iter().find(|k| opens_as(block, &k.key, &k.suite)).cloned();
    // The recovery key: named by the genesis's hash, in the identity's suite unless the genesis names another.
    let root = held.get(author);
    let recovery_signed = match (ss(block, "recovery_key"), recovery_hash_of(author, held), root) {
        (Some(key), Some((hash, rsuite)), Some(root)) => {
            recovery_key_hash_in(&suite_named(root), key) == hash && opens_as(block, key, &rsuite)
        }
        _ => false,
    };
    if signer_entry.is_none() && !recovery_signed {
        // An operator may rotate the keys of its agent or machine: a block by the operator's own key. It is then the
        // operator's block (refs.author is the operator); nothing to do here.
        let unbuilt = identity.keys.iter().any(|k| !crate::sign::knows_suite(&k.suite));
        if unbuilt {
            w.push(f("unknown_suite", "a key of its author is in a suite this reader cannot use"));
        } else {
            w.push(f("bad_signature", "its signature opens with no key of its author"));
        }
        return ordered(w, "block");
    }
    if recovery_signed && !recovery_may_sign(block) {
        w.push(f("recovery_scope", "the recovery key signs only key grants and the defeats a profile gives it"));
    }
    with.insert(hash_of(block).to_string(), block.clone());
    if !(recovery_signed && !recovery_may_sign(block)) && !signed_by_author_in(block, &with, arrived_at) {
        w.push(f(
            "void_key",
            "signed by a key of its author that does not speak for it: void, frozen, or rotated past counted_to",
        ));
    }
    // A key is rotated only by itself, by the recovery key, or by the operator of an agent or machine.
    if t == "grant" && ss(block, "kind") == Some("key") && truthy(st(block, "replaces")) && !recovery_signed {
        if let Some(e) = &signer_entry {
            if Some(e.key.as_str()) != ss(block, "replaces") {
                w.push(f("not_own_rotation", "a key is rotated only by itself, by the recovery key, or by its operator"));
            }
        }
    }
    // Stage 6: prev and seq against the key's chain.
    if let Some(prev) = rs(block, "prev").filter(|p| !p.is_empty()) {
        let seq = int(st(block, "seq"));
        let skip = st(block, "skip") == Some(&Value::Bool(true));
        match held.get(prev) {
            None => w.push(f("chain", format!("refs.prev ({prev}) is not held: the key's previous block cannot be checked"))),
            Some(p) => {
                let key = signer_entry.as_ref().map(|e| e.key.clone());
                let same_key = signer_entry
                    .as_ref()
                    .is_some_and(|e| rs(p, "author") == Some(author) && opens_as(p, &e.key, &e.suite))
                    || (recovery_signed && rs(p, "author") == Some(author) && ss(p, "recovery_key").is_some() && p.get("signature").is_some() && {
                        let k = ss(p, "recovery_key").unwrap_or("");
                        let suite = recovery_hash_of(author, held).map(|(_, s)| s).unwrap_or_else(|| "std".into());
                        opens_as(p, k, &suite)
                    });
                if same_key {
                    let before = int(st(p, "seq"));
                    let ok = match (seq, before) {
                        (Some(s), Some(b)) => (!skip && s == b + 1.0) || (skip && s > b),
                        _ => false,
                    };
                    if !ok {
                        w.push(f("chain", "state.seq is one more than the previous block's (or a skip that jumps forward)"));
                    }
                } else {
                    // The key's first block names the block that brought the key in: the genesis, or a key grant.
                    let brought = ss(p, "public_key_sign") == key.as_deref() && key.is_some()
                        || (recovery_signed && prev == author);
                    let by_operator = false;
                    if !(brought || by_operator) {
                        w.push(f("chain", "refs.prev is neither the key's previous block nor the block that brought the key in"));
                    } else if !(seq == Some(1.0) || (skip && seq.is_some_and(|s| s >= 1.0))) {
                        w.push(f("chain", "a key's first block has seq 1"));
                    }
                }
            }
        }
    }
    ordered(w, "block")
}
