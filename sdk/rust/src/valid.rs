//! `valid(block, context)` (core.md, section 8): one predicate. The context is the blocks the checker holds; it never
//! includes a clock. The checks run in the order of core.md and every failure found is one refusal `{ code, detail }`,
//! one per code, in that order (empty when the block is valid):
//!
//! 1. canonical form and strict writing;  2. values and grammars;  3. the limits;  4. the genesis, or the common five;
//! 5. what it rests on (`unmet`);  6. the id, the signing key and its signature;  7. `prev` and `seq` against the key's chain;
//! 8. a closed type's required fields, undeclared fields and its module's checks.
//!
//! Checks 1 to 4 read the bytes alone; 5 to 8 read only what the block rests on (its needs), never another block the checker
//! happens to hold. A block that lacks a need is not judged: a node holds it as waiting (sync.rs) rather than calling it invalid.

use crate::check::{ordered, CheckOptions};
use crate::error::Refusal;
use crate::identity::{brought_key, genesis_opens, is_genesis, opens_as, signer_in, suite_named};
use crate::js::{hash_of, int, rs, ss, st, type_of, Index};
use crate::prelude::*;

// The suite a block shows by itself (block::suite_from_block), for a block no key of a held author opens.
fn rehash_suite(block: &Value) -> String {
    crate::block::suite_from_block(block)
}

fn f(code: &str, detail: impl Into<String>) -> Refusal {
    Refusal::new(code, detail)
}

/// The recovery hash the identity names: its genesis's (no key grant names one: identity.md, The recovery key).
pub(crate) fn recovery_hash_of(id: &str, held: &Index) -> Option<(String, String)> {
    let root = held.get(id)?;
    let suite = suite_named(root);
    let named = ss(root, "recovery_key_hash").map(String::from)?;
    let rsuite = ss(root, "recovery_suite").map(String::from).unwrap_or(suite);
    Some((named, rsuite))
}

/// Whether a block is a key grant, or a successor trigger's `defeats` (the two things a recovery key may sign).
fn recovery_may_sign(block: &Value, held: &Index) -> bool {
    let key_grant = type_of(block) == "grant" && ss(block, "kind") == Some("key");
    #[cfg(feature = "successor")]
    {
        key_grant || crate::identity::recovery_defeats_ok(block, held)
    }
    #[cfg(not(feature = "successor"))]
    {
        let _ = held;
        key_grant
    }
}

/// The check (protocol.json `refusals.checks`, 1 to 4) a finding of the bytes belongs to: the first that lists its code.
fn content_check(code: &str) -> usize {
    let checks = crate::js::get(&crate::spec().protocol, "refusals.checks").and_then(Value::as_array).cloned().unwrap_or_default();
    for (i, codes) in checks.iter().take(4).enumerate() {
        if codes.as_array().is_some_and(|c| c.iter().any(|x| x.as_str() == Some(code))) {
            return i + 1;
        }
    }
    4
}

/// What the bytes alone say (checks 1 to 4, then a closed type's own, check 8): the refusal of the first of them that finds
/// anything. It needs no context, so it is the answer for text read from the wire before anything is held.
pub fn content_refusals(t: &str, state: &Value, refs: &Value) -> Vec<Refusal> {
    let (w, closed) = crate::check::findings_staged(crate::spec(), t, state, refs, CheckOptions::default());
    for check in 1..=4 {
        let found: Vec<Refusal> = w.iter().filter(|r| content_check(&r.code) == check).cloned().collect();
        if !found.is_empty() {
            return ordered(found, "block");
        }
    }
    ordered(closed, "block")
}

/// `valid(block, context)` (core.md, section 8): the checks run in order (protocol.json `refusals.checks`) and stop at the
/// first that finds anything; the refusal is every code that check found, one per code, in the order of the block codes.
/// A block that rests on blocks the context lacks is not judged: its refusal is `unmet` alone, and a node waits.
/// `held` is read closed (a block whose needs are not in it is not there). `schemas` lets a named schema's fields and roles
/// count as declared.
pub fn valid(block: &Value, held: &Index, schemas: Option<&Index>) -> Vec<Refusal> {
    valid_in_closed(block, &crate::js::closed_ref(held), schemas)
}

/// What checks 1 to 4 find, which read the bytes alone (core.md, section 8): a block failing one is refused at once, whatever it rests on.
pub fn bytes_findings(block: &Value, schemas: Option<&Index>) -> Vec<Refusal> {
    let spec = crate::spec();
    let (t, state, refs) = (type_of(block), block.get("state").unwrap_or(&Value::Null), block.get("refs").unwrap_or(&Value::Null));
    let (mut w, _) = crate::check::findings_staged(spec, t, state, refs, CheckOptions { schemas, held: None });
    if block.get("type").is_none() {
        w.push(f("not_canonical", "a block is exactly { type, state, refs }: this one has no type"));
    }
    for check in 1..=4 {
        let found: Vec<Refusal> = w.iter().filter(|r| content_check(&r.code) == check).cloned().collect();
        if !found.is_empty() {
            return ordered(found, "block");
        }
    }
    if !(state.is_object() && refs.is_object()) {
        return ordered(w, "block");
    }
    vec![]
}

/// `valid` over a context that is already closed (a node's own store is; `accept` reads it closed once).
pub fn valid_in_closed(block: &Value, held: &Index, schemas: Option<&Index>) -> Vec<Refusal> {
    let spec = crate::spec();
    let (t, state, refs) = (type_of(block), block.get("state").unwrap_or(&Value::Null), block.get("refs").unwrap_or(&Value::Null));
    let (mut w, closed_type_findings) = crate::check::findings_staged(spec, t, state, refs, CheckOptions { schemas, held: Some(held) });
    // core.md section 8, check 1: a block is exactly { type, state, refs }. A block with no `type` is not canonical (a `type`
    // that is not a word is `type_name`, found above).
    if block.get("type").is_none() {
        w.push(f("not_canonical", "a block is exactly { type, state, refs }: this one has no type"));
    }
    // Checks 1 to 4 read the bytes alone.
    for check in 1..=4 {
        let found: Vec<Refusal> = w.iter().filter(|r| content_check(&r.code) == check).cloned().collect();
        if !found.is_empty() {
            return ordered(found, "block");
        }
    }
    if !(state.is_object() && refs.is_object()) {
        return ordered(w, "block");
    }
    // Check 5: what the block rests on (core.md section 8; protocol.json `needs`).
    let missing = crate::js::unmet_in(block, held);
    if !missing.is_empty() {
        return vec![f("unmet", format!("it rests on blocks not held: {}", missing.join(", ")))];
    }
    let hash = hash_of(block);
    // Check 6: the id sent, the signing key and the signature. The id is the hash of the bytes in the suite of the key that opens
    // the signature (core.md, section 2): no label names it, so a block has one id, and another is `bad_hash`.
    let mut w6: Vec<Refusal> = Vec::new();
    let id_is = |suite: &str| hash.is_empty() || hash == crate::block::hash_suite(suite, t, state, refs);
    // A genesis is signed by its own key.
    if is_genesis(block) || (t == "actor" && state.get("public_key_sign").is_some()) {
        let suite = suite_named(block);
        if !id_is(&suite) {
            w6.push(f("bad_hash", "the id sent with it is not the hash of its canonical bytes in its key's suite"));
        }
        let key = ss(block, "public_key_sign").unwrap_or("");
        if !crate::sign::knows_suite(&suite) {
            if spec.suite(&suite).is_some() {
                w6.push(f("unknown_suite", format!("the suite {suite} is declared but this build cannot use it")));
            }
        } else if !opens_as(block, key, &suite) {
            w6.push(f("bad_genesis", "a genesis is signed by its own key"));
        }
        if !w6.is_empty() {
            return ordered(w6, "block");
        }
        return ordered(closed_type_findings, "block");
    }
    let w = signature_refusals(block, held);
    if !w.is_empty() {
        return w;
    }
    // Check 8: a closed type's own: required and undeclared fields, and its module's checks.
    ordered(closed_type_findings, "block")
}

/// The keys of an author that what a block rests on brings in: the genesis key, and the key each key grant among its needs (and
/// their needs in turn, as far as they are held) brings in (`brought_key`).
fn rested_keys(block: &Value, author: &str, held: &Index) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut seen: alloc::collections::BTreeSet<String> = Default::default();
    let mut todo: Vec<String> = crate::js::needs_of(block);
    while let Some(h) = todo.pop() {
        if !seen.insert(h.clone()) {
            continue;
        }
        let Some(p) = held.get(&h) else { continue };
        if let Some(k) = brought_key(p, author, held) {
            if !out.contains(&k) {
                out.push(k);
            }
        }
        todo.extend(crate::js::needs_of(p).into_iter().filter(|n| !seen.contains(n)));
    }
    out
}

/// Checks 6 and 7 for a block that is not a genesis, read from the block and what it rests on alone (its `prev`, through it the key's
/// chain back to the block that brought the key in, and its author's genesis: `identity::signer_in`), never from other blocks a
/// reader holds, so the verdict is the same on every node that holds what the block needs (core.md, section 8). Whether the key
/// still speaks for its author (a rotation, a freeze, a fork) is the folds' to say (folds.md, A fork is a burden), never validity's.
pub fn signature_refusals(block: &Value, held: &Index) -> Vec<Refusal> {
    let (t, state, refs) = (type_of(block), block.get("state").unwrap_or(&Value::Null), block.get("refs").unwrap_or(&Value::Null));
    let hash = hash_of(block);
    let id_is = |suite: &str| hash.is_empty() || hash == crate::block::hash_suite(suite, t, state, refs);
    let mut w6: Vec<Refusal> = Vec::new();
    let author = rs(block, "author").unwrap_or("");
    if author.is_empty() {
        // no author, no key to check: the id is still the hash of the bytes (release 1: an authorless block cannot claim another's id)
        if !id_is(&rehash_suite(block)) {
            w6.push(f("bad_hash", "the id sent with it is not the hash of its canonical bytes"));
        }
        return ordered(w6, "block");
    }
    let root = held.get(author).filter(|r| genesis_opens(Some(r)));
    let Some(_) = root else {
        if !id_is(&rehash_suite(block)) {
            w6.push(f("bad_hash", "the id sent with it is not the hash of its canonical bytes"));
        }
        w6.push(f("bad_signature", "the author's genesis is not held, so no key of the author can open it"));
        return ordered(w6, "block");
    };
    let Some(signer) = signer_in(block, held) else {
        if !id_is(&rehash_suite(block)) {
            w6.push(f("bad_hash", "the id sent with it is not the hash of its canonical bytes"));
        }
        // a key its prev brought in, or that signed its prev, in a suite this build cannot use
        let p = rs(block, "prev").and_then(|h| held.get(h));
        // "a key of its author" is one that what the block rests on brings in (its needs, and theirs in turn), never a key some other
        // held block brings in: the code is the same on every node that holds what the block needs (core.md, section 8)
        let keys = rested_keys(block, author, held);
        let unbuilt = p.and_then(|p| brought_key(p, author, held)).is_some_and(|(_, s)| !crate::sign::knows_suite(&s))
            || keys.iter().any(|(k, s)| !crate::sign::knows_suite(s) && opens_as(block, k, s));
        if unbuilt {
            w6.push(f("unknown_suite", "a key of its author is in a suite this reader cannot use"));
        } else if keys.iter().any(|(k, s)| opens_as(block, k, s)) {
            // a key of the author opens it, but its prev neither brought that key in nor is that key's own block
            return vec![f("chain", "refs.prev is neither the key's previous block nor the block that brought the key in")];
        } else {
            w6.push(f("bad_signature", "its signature opens with no key of its author that what it rests on brought in"));
        }
        return ordered(w6, "block");
    };
    if !id_is(&signer.suite) {
        w6.push(f("bad_hash", "the id sent with it is not the hash of its canonical bytes in the suite of the key that signed it"));
    }
    if signer.recovery && !recovery_may_sign(block, held) {
        w6.push(f("recovery_scope", "the recovery key signs only key grants and the defeats a profile gives it"));
    }
    // A key is rotated only by itself, by the recovery key, or by the operator of an autonomous system or machine. An author's own
    // key grant (about themselves) that replaces a key is signed by that key or by the recovery key; one an operator signs about the
    // machine is the identity fold's to judge (whether the operator stands is not what this block rests on).
    if t == "grant" && ss(block, "kind") == Some("key") && ss(block, "replaces").is_some() && !signer.recovery && rs(block, "subject") == Some(author)
        && Some(signer.key.as_str()) != ss(block, "replaces")
    {
        w6.push(f("not_own_rotation", "a key is rotated only by itself, by the recovery key, or by its operator"));
    }
    if !w6.is_empty() {
        return ordered(w6, "block");
    }
    // Check 7: prev and seq against the key's chain (the signer was read so: the key's first block has seq 1, a later one follows
    // the key's previous block by one, a skip may jump forward).
    let seq = int(st(block, "seq"));
    let skip = st(block, "skip") == Some(&Value::Bool(true));
    let p = rs(block, "prev").and_then(|h| held.get(h));
    let fits = if signer.first {
        seq == Some(1.0) || (skip && seq.is_some_and(|s| s >= 1.0))
    } else {
        matches!((seq, p.and_then(|p| int(st(p, "seq")))), (Some(s), Some(b)) if (!skip && s == b + 1.0) || (skip && s > b))
    };
    if !fits {
        let why = if signer.first { "a key's first block has seq 1" } else { "state.seq is one more than the previous block's (or a skip that jumps forward)" };
        return vec![f("chain", why)];
    }
    Vec::new()
}
