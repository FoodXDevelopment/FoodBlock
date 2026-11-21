//! Between nodes (modules/nodes.md): Pull and Push. Pull asks for the blocks the asker may see since an arrival number on the log it names
//! (never a time); `heads: true` returns only the heads among the matches. A signed request names its signer, the node it is for, and one
//! proof against replay (a `counter` or a `challenge`; no time). A node judges each block of a push by `valid` against what it holds and
//! the rest of the push (valid.rs): it takes what is valid (listing in `unread` what it cannot read), keeps unjudged what lacks a piece,
//! lists the pairs (`equivocations`), and refuses the rest, each `{ hash, code, detail }` with a code from protocol.json's
//! `refusals.codes`. A node's arrivals are a line of receipts on a key of its own (The arrival log): `log_shown` reads what its signed words
//! show, and `export_whole` whether her record leaves whole. Every node answer is signed by the node (invariant 18).
use crate::canonical::canonical_json;
use crate::check::ordered;
use crate::error::{Refusal, Result};
use crate::js::{hash_of, index_of, list, rf, rs, st, Index};
use crate::prelude::*;
use crate::sign::{sign_message_in, verify_message_in};
use crate::write::wrap;

fn pick(object: &Value, keys: &[String]) -> Value {
    Value::Object(
        keys.iter()
            .filter_map(|k| {
                object
                    .get(k)
                    .filter(|v| !v.is_null())
                    .map(|v| (k.clone(), v.clone()))
            })
            .collect(),
    )
}

// ---- Pull ----
/// A pull: `{ since, limit, filter, heads }` (since: the exclusive arrival number, 0 from the start).
pub fn pull_request(request: &Value) -> Value {
    // anything but an object is a pull of everything from the start (a request is an object; a bare value names nothing)
    let mut r = if request.is_object() { request.clone() } else { json!({}) };
    if r.get("since").is_none() {
        r["since"] = json!(0);
    }
    pick(&r, &crate::spec().convention("messages.pull"))
}

/// Who signs a request, for whom, and the one proof against replay it carries.
pub struct Signer<'a> {
    /// The signer's id.
    pub who: &'a str,
    /// The node the request is for.
    pub node: &'a str,
    pub private_key: &'a str,
    /// The suite of the signing key (`std` when empty).
    pub suite: &'a str,
    /// An integer above the highest the node has seen from this signer; or
    pub counter: Option<u64>,
    /// a value the node handed out for this one request.
    pub challenge: Option<String>,
}

fn stamp(mut message: Value, role: &str, signer: &Signer) -> Result<Value> {
    if !message.is_object() {
        return Err(crate::Error::new("sync: a request to sign is an object"));
    }
    message[role] = json!(signer.who);
    message["node"] = json!(signer.node);
    match (&signer.counter, &signer.challenge) {
        (Some(c), None) => message["counter"] = json!(c),
        (None, Some(ch)) => message["challenge"] = json!(ch),
        _ => {
            return Err(crate::Error::new(
                "sync: a signed request carries exactly one of counter or challenge",
            ))
        }
    }
    sign_message_in(signer.suite, &message, signer.private_key)
}

/// A signed pull: the request, plus signer, node and one proof against replay, signed by one of the signer's keys.
pub fn sign_pull(request: &Value, signer: &Signer) -> Result<Value> {
    stamp(pull_request(request), "signer", signer)
}

/// A new challenge value a node hands out (16 random bytes, hex). The node keeps what it issued and what was used.
pub fn new_challenge() -> Result<String> {
    crate::audience::try_new_salt()
}

/// What a node checks of a signed request.
pub struct Freshness<'a> {
    /// This node's id.
    pub node: &'a str,
    /// The signer's live signing keys.
    pub keys: &'a [String],
    /// The highest counter this node has seen from the signer (None: none yet).
    pub highest: Option<u64>,
    /// Whether this node issued the challenge and has not seen it used.
    pub issued: &'a dyn Fn(&str) -> bool,
}

/// Why a node refuses a signed message (`fields`: the protocol.json list of its keys, a pull's or a push's):
/// `[{ code, detail }]` with codes from protocol.json's `refusals.codes.message`, empty when it may be answered. No
/// clock is read: freshness is the counter or the challenge.
pub fn message_refusals(message: &Value, fields: &str, f: &Freshness) -> Vec<Refusal> {
    let allowed = crate::spec().convention(fields);
    let mut wrong = Vec::new();
    if !message
        .as_object()
        .is_some_and(|m| m.keys().all(|k| allowed.contains(k)))
    {
        wrong.push(Refusal::new(
            "bad_signature",
            format!("a signed message is {{ {} }}", allowed.join(", ")),
        ));
    }
    if rs_top(message, "node") != Some(f.node) {
        wrong.push(Refusal::new("wrong_node", "the message names another node"));
    }
    let (counter, challenge) = (message.get("counter"), message.get("challenge"));
    match (counter, challenge) {
        (Some(c), None) => {
            // an integer of signed content runs to 2^53 - 1 (core.md, section 3): past it the signed text writes many counters one way,
            // so one signature would answer for them all
            let above = c
                .as_u64()
                .filter(|c| *c <= 9_007_199_254_740_991)
                .is_some_and(|c| f.highest.is_none_or(|h| c > h));
            if !above {
                wrong.push(Refusal::new("replay", "its counter is not above the highest seen from this signer"));
            }
        }
        (None, Some(ch)) => {
            if !ch.as_str().is_some_and(|c| (f.issued)(c)) {
                wrong.push(Refusal::new("replay", "its challenge was not issued by this node, or was used"));
            }
        }
        _ => wrong.push(Refusal::new(
            "replay",
            "a signed request carries exactly one of counter or challenge",
        )),
    }
    let opens = f.keys.iter().any(|k| {
        let suite = crate::sign::suite_named_by(k);
        verify_message_in(&suite, message, k)
    });
    if !opens {
        wrong.push(Refusal::new("bad_signature", "it is not signed by its signer"));
    }
    ordered(wrong, "message")
}
fn rs_top<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

/// Why a node refuses a signed pull: `[{ code, detail }]`, empty when it may be answered.
pub fn pull_refusals(message: &Value, freshness: &Freshness) -> Vec<Refusal> {
    message_refusals(message, "messages.signed_pull", freshness)
}

/// Every first version a block is a version of (itself, and back through `updates`). One walk with a set of what was seen: no block is
/// copied and none is visited twice (release 16: a filter on a record was cubic).
pub fn record_of(block: &Value, held: &Index) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: alloc::collections::BTreeSet<&str> = Default::default();
    let mut todo: Vec<&Value> = vec![block];
    while let Some(one) = todo.pop() {
        let h = hash_of(one);
        if !seen.insert(h) {
            continue;
        }
        out.push(h.to_string());
        for u in list(rf(one, "updates")).into_iter().rev() {
            match held.get(u) {
                Some(b) => todo.push(b),
                None => {
                    // named but not held: it is a version all the same, with no further updates
                    if seen.insert(u) {
                        out.push(u.to_string());
                    }
                }
            }
        }
    }
    out
}

/// Whether a block matches a pull filter (every key, ANDed): `type`, `kind`, `author`, `hash`, `record` (a record's
/// first hash: every version), `marks` (`{ scheme, value }`: the block carries that exact mark) and `refs`
/// (`{ key: hash }`). `held` resolves records.
pub fn matches(block: &Value, filter: &Value, held: &Index) -> bool {
    // no filter matches every block; a filter that is not an object matches none (a filter never fails open)
    if filter.is_null() {
        return true;
    }
    let Some(f) = filter.as_object() else {
        return false;
    };
    if f.is_empty() {
        return true;
    }
    // a key the filter does not know matches nothing: a filter never fails open (nodes.md, Pull; divergence R4)
    if f.keys().any(|k| !["type", "kind", "author", "hash", "record", "marks", "refs"].contains(&k.as_str())) {
        return false;
    }
    if f.get("type").is_some_and(|t| Some(t) != block.get("type")) {
        return false;
    }
    if f.get("kind").is_some_and(|k| Some(k) != st(block, "kind")) {
        return false;
    }
    if f.get("author")
        .is_some_and(|a| Some(a) != rf(block, "author"))
    {
        return false;
    }
    if f.get("hash")
        .is_some_and(|h| h.as_str() != Some(hash_of(block)))
    {
        return false;
    }
    if let Some(r) = f.get("record") {
        if !record_of(block, held)
            .iter()
            .any(|x| Some(x.as_str()) == r.as_str())
        {
            return false;
        }
    }
    if let Some(m) = f.get("marks") {
        let (scheme, value) = (m.get("scheme"), m.get("value"));
        let has = st(block, "marks").and_then(Value::as_array).is_some_and(|marks| {
            marks
                .iter()
                .any(|x| x.get("scheme") == scheme && x.get("value") == value)
        });
        if !has {
            return false;
        }
    }
    match f.get("refs") {
        Some(Value::Object(refs)) => refs
            .iter()
            .all(|(k, h)| h.as_str().is_some_and(|h| list(rf(block, k)).contains(&h))),
        None => true,
        Some(_) => false,
    }
}

/// The heads among blocks: those no other among them names by prev or updates.
pub fn heads_of(blocks: &[Value]) -> Vec<Value> {
    let mut named: Vec<&str> = Vec::new();
    for b in blocks {
        named.extend(list(rf(b, "prev")));
        named.extend(list(rf(b, "updates")));
    }
    blocks
        .iter()
        .filter(|b| !named.contains(&hash_of(b)))
        .cloned()
        .collect()
}

/// One entry of a node's arrival log: the block, its arrival number, and (for a sealed block) its signed header and the
/// copies sealed to each recipient id.
#[derive(Debug, Clone)]
pub struct Arrival {
    pub n: u64,
    pub block: Value,
    pub header: Option<Value>,
    pub header_signature: Option<Value>,
    pub copies: Vec<(String, Value)>,
}

/// Whether a block travels whole to anyone: its audience is not a list.
fn is_public(block: &Value) -> bool {
    !st(block, "audience").is_some_and(Value::is_array)
}

/// A non-public block as one who may not see it knows it: the entry of its public header (`valid::as_header`), nothing else.
fn header_view(block: &Value) -> Value {
    crate::valid::as_header(block)
}

/// What a node promises when it answers a pull (nodes.md, A node's promise): each is its own stated choice, with no default.
#[derive(Debug, Clone, Copy)]
pub struct PullChoices {
    /// The most blocks one answer carries (at least 1); a pull's own `limit` is cut to it.
    pub cap: u64,
    /// Whether the node sends the other half of a forked pair with any answer that includes one (the proof of the fork).
    pub serves_pairs: bool,
}

/// Answer a pull from a node's arrival log. A public block travels whole; a sealed one as its header or, to a signed
/// pull's asker, the copy sealed to them. Signed by the node: `{ node, request, log, blocks: [{ n, message }], next,
/// signature }`, `log` the log the request names. Each entry's `n` is its arrival number on that log, as the node gives it. `choices` are the responder's own (its cap and whether it serves a pair's proof); `asker` overrides the pull's own; `held` is what a filter's record
/// is read from (the log's own blocks when none). `through` is the last arrival number the node read to answer (a node reads a
/// bounded window for a filtered pull): an answer that is not full says to go on from there, never from its last match.
#[allow(clippy::too_many_arguments)]
pub fn answer_pull(
    log: &[Arrival],
    request: &Value,
    node: &str,
    private_key: Option<&str>,
    choices: PullChoices,
    asker: Option<&str>,
    held: Option<&Index>,
    suite: &str,
    through: Option<u64>,
) -> Result<Value> {
    let cap = choices.cap;
    let since = request.get("since").and_then(Value::as_f64).unwrap_or(0.0) as u64;
    let limit = request
        .get("limit")
        .and_then(Value::as_f64)
        .map(|l| l as u64)
        .filter(|l| *l > 0)
        .unwrap_or(cap)
        .min(cap);
    let asker = asker.or_else(|| request.get("signer").and_then(Value::as_str));
    let own;
    let held = match held {
        Some(h) => h,
        None => {
            own = index_of(log.iter().map(|e| &e.block));
            &own
        }
    };
    let filter = request.get("filter").cloned().unwrap_or(Value::Null);
    // A filter reads only what the asker may see (security K): a public block whole, a non-public one whole only by an asker
    // it has a copy for, and otherwise its public header alone (author, prev, seq, hash). A private block a node holds in the
    // clear is never an oracle on its kind, its marks or whom it names.
    // 1.9 stage 7 (A2, nodes.md line 37): an unsigned pull gets public blocks; a signed pull also gets each sealed block the node holds a
    // copy of for the asker. Nothing of a sealed block (not even its header) goes to any other asker, and for anyone else it matches no filter.
    let has_copy = |e: &Arrival| asker.is_some_and(|a| e.copies.iter().any(|(who, _)| who == a));
    let mut found: Vec<&Arrival> = log
        .iter()
        .filter(|e| {
            e.n > since
                && if e.block.get("type").is_some() && is_public(&e.block) {
                    matches(&e.block, &filter, held)
                } else if has_copy(e) {
                    if e.block.get("type").is_some() { matches(&e.block, &filter, held) } else { matches(&header_view(&e.block), &filter, held) }
                } else {
                    false
                }
        })
        .collect();
    found.sort_by_key(|e| e.n);
    // only the rows the node read answer the pull; a rival row beyond them rides below as a proof, after `next` is known (release 5: it had
    // pushed `next` past rows nobody had sent)
    if let Some(t) = through {
        found.retain(|e| e.n <= t);
    }
    if request.get("heads") == Some(&Value::Bool(true)) {
        let blocks: Vec<Value> = found.iter().map(|e| e.block.clone()).collect();
        let heads: Vec<String> = heads_of(&blocks)
            .iter()
            .map(|b| hash_of(b).to_string())
            .collect();
        found.retain(|e| heads.iter().any(|h| h == hash_of(&e.block)));
    }
    let full = found.len() as u64 >= limit;
    found.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
    // The next number is where the matches end; the proofs below may sit beyond it and are sent again then. An answer that is not full
    // goes on from the last arrival the node read (`through`), so a filter that matches nothing in a window still moves on.
    let last = found.last().map(|e| e.n).unwrap_or(since);
    let next = match through {
        Some(t) if !full => last.max(t),
        _ => last,
    };
    // A node that serves a pair's proof (its own choice) sends the other blocks of a pair (one key, one `prev` or one `seq`) with any answer
    // that includes one, whether or not the other matches, was asked for, or came before `since`.
    let mut proofs: Vec<&Arrival> = Vec::new();
    if choices.serves_pairs {
        let mut index = held.clone();
        for o in log {
            index.entry(hash_of(&o.block).to_string()).or_insert_with(|| o.block.clone());
        }
        let groups = crate::identity::pair_groups_in(&index);
        let mut sent: alloc::collections::BTreeSet<&str> = found.iter().map(|x| hash_of(&x.block)).collect();
        let found_now: Vec<String> = found.iter().map(|x| hash_of(&x.block).to_string()).collect();
        for h in &found_now {
            for g in groups.iter().filter(|g| g.contains(h)) {
                // a sealed half goes only as the asker may see it: to one it holds a copy for; nothing of it goes to any other asker
                // (nodes.md, A fork's proof; Messages)
                for other in log.iter().filter(|o| g.iter().any(|x| x == hash_of(&o.block)) && ((o.block.get("type").is_some() && is_public(&o.block)) || has_copy(o))) {
                    if sent.insert(hash_of(&other.block)) {
                        proofs.push(other);
                    }
                }
            }
        }
    }
    found.extend(proofs);
    found.sort_by_key(|e| e.n);
    let message_of = |e: &Arrival| -> Value {
        // 1.9 3a-5: a node shows a block's body only to an audience it can read: it holds the body, and every commitment of the audience
        // is written in a hash name it knows. A body whose audience it cannot read, it shows to no one and passes on as its header. A
        // sealed copy pushed for one person is passed to her as it came: it shows no body (a relay that holds only the copy passes it on).
        let known = |c: &Value| c.as_str().is_some_and(|x| x.split_once(':').is_none_or(|(p, _)| crate::spec().suites.iter().any(|s| crate::spec().hash_prefix(&s.hash) == format!("{p}:"))));
        let body = e.block.get("type").is_some() && st(&e.block, "audience").and_then(Value::as_array).is_none_or(|a| a.iter().all(known));
        if body && is_public(&e.block) {
            return wrap(&e.block);
        }
        if let Some(copy) = asker
            .and_then(|a| e.copies.iter().find(|(who, _)| who == a))
            .map(|(_, c)| c.clone())
        {
            return copy;
        }
        json!({
            "header": e.header.clone().unwrap_or_else(|| crate::write::header(&e.block)),
            "header_signature": e.header_signature.clone().or_else(|| e.block.get("signature").cloned()),
        })
    };
    // the answer names the log the asker reads (nodes.md, Pull); with none named, `n` and `next` are the node's own numbers, and a signed
    // answer holds no null, so it names none
    let mut answer = json!({
        "node": node,
        "request": crate::block::hash_hex(&canonical_json(request)),
        "blocks": found.iter().map(|e| json!({ "n": e.n, "message": message_of(e) })).collect::<Vec<_>>(),
        "next": next,
    });
    if let Some(l) = request.get("log").filter(|l| l.is_string()) {
        answer["log"] = l.clone();
    }
    match private_key {
        Some(k) => sign_message_in(suite, &answer, k),
        None => Ok(answer),
    }
}

/// Whether a node's answer (pull or push) is signed by one of the node's keys (any live key of its holder).
pub fn answer_signed_by(answer: &Value, node_keys: &[String]) -> bool {
    crate::sign::message_signed_by(answer, node_keys)
}

// ---- Push ----
/// Who a sealed copy is for: `for` maps its hash to a list of ids.
pub fn recipients_of(for_whom: &Value, hash: &str) -> Vec<String> {
    match for_whom.get(hash) {
        Some(Value::Array(a)) => a.iter().filter_map(|i| i.as_str().map(String::from)).collect(),
        _ => vec![],
    }
}

/// A push: `{ messages, for }`, `for` optional (`{ hash: [id] }`, a list of ids per sealed copy).
pub fn push_request(messages: &[Value], for_whom: Option<&Value>) -> Value {
    let mut r = json!({ "messages": messages });
    if let Some(f) = for_whom {
        let listed: serde_json::Map<String, Value> = f
            .as_object()
            .map(|o| o.keys().map(|h| (h.clone(), json!(recipients_of(f, h)))).collect())
            .unwrap_or_default();
        r["for"] = Value::Object(listed);
    }
    pick(&r, &crate::spec().convention("messages.push"))
}

/// A signed push: the push, plus signer, node and one proof against replay, signed by one of the signer's keys.
pub fn sign_push(push: &Value, signer: &Signer) -> Result<Value> {
    stamp(
        pick(push, &crate::spec().convention("messages.push")),
        "signer",
        signer,
    )
}

/// Why a node refuses a signed push: `[{ code, detail }]`, empty when it may be taken in.
pub fn push_refusals(message: &Value, freshness: &Freshness) -> Vec<Refusal> {
    message_refusals(message, "messages.signed_push", freshness)
}

/// One block a node refused: its hash, a code from protocol.json's `refusals.codes`, and free text for people.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refused {
    pub hash: String,
    pub code: String,
    pub detail: String,
}

/// What a node takes of a push (nodes.md, Push).
#[derive(Debug, Clone, Default)]
pub struct Accepted {
    /// The blocks taken: valid, read or not. Ascending by hash.
    pub taken: Vec<Value>,
    /// Blocks whose pieces are not all held, or whose suite this node does not know: `(hash, the pieces it lacks)`. Kept, judged later.
    pub unjudged: Vec<(String, Vec<String>)>,
    /// One entry per code for each refused block.
    pub refused: Vec<Refused>,
    /// Blocks taken and not read: `(hash, codes)`. Held as their header.
    pub unread: Vec<(String, Vec<String>)>,
    /// The pairs of each group of blocks of one key on one `prev` or at one `seq` that a block of this push belongs to, as a star.
    pub equivocations: Vec<[String; 2]>,
    /// Hashes held as a header that a body taken under the same hash shows false (privacy.md, The public header).
    pub false_headers: Vec<String>,
}

impl Accepted {
    /// `{ taken, unjudged: [{ hash, needs }], refused: [{ hash, code, detail }], unread: [{ hash, codes }], equivocations, false_headers }`.
    pub fn to_json(&self) -> Value {
        json!({
            "taken": self.taken.iter().map(hash_of).collect::<Vec<_>>(),
            "unjudged": self.unjudged.iter().map(|(h, n)| json!({ "hash": h, "needs": n })).collect::<Vec<_>>(),
            "refused": self.refused.iter().map(|r| json!({ "hash": r.hash, "code": r.code, "detail": r.detail })).collect::<Vec<_>>(),
            "unread": self.unread.iter().map(|(h, c)| json!({ "hash": h, "codes": c })).collect::<Vec<_>>(),
            "equivocations": self.equivocations,
            "false_headers": self.false_headers,
        })
    }
}

/// Whether a message is a wrapped copy (privacy.md, Keeping apart: a copy wrapped, in an envelope of its own, to a key the reader gave
/// the sender, her mailbox): exactly `{ mailbox, envelope }`, `mailbox` an encryption key.
pub fn is_wrapped(m: &Value) -> bool {
    m.as_object().is_some_and(|o| o.len() == 2 && o.get("mailbox").is_some_and(Value::is_string) && o.get("envelope").is_some_and(Value::is_object))
}

/// A sealed copy wrapped to a mailbox key: `{ mailbox, envelope }`, the envelope sealing the plaintext `{ copy, pad }` to that one key: the
/// copy message whole, padded to the sizes of Sealed messages (privacy.md, Keeping apart: a host learns how big after padding; stage 7
/// compare: the oracle's shape, so a copy stays exactly the sealed copy it was).
#[cfg(feature = "envelope")]
pub fn wrap_copy(copy: &Value, mailbox: &str, suite: &str, fixed: Option<&crate::envelope::Fixed>) -> Result<Value> {
    let plaintext = crate::write::pad_plaintext(&json!({ "copy": copy }));
    Ok(json!({ "mailbox": mailbox, "envelope": crate::envelope::seal_with(&plaintext, &[mailbox], suite, fixed)? }))
}
/// What a host holds of a wrapped copy's size: its envelope's ciphertext bytes (the padded plaintext and the 16-byte tag).
fn wrapped_bytes(m: &Value) -> usize {
    crate::envelope::base64_decode(crate::js::str_of(m.get("envelope").and_then(|e| e.get("ciphertext")))).map_or(0, |c| c.len())
}

/// What a node takes of a push, and which sealed copies it keeps (nodes.md, line 44; 1.9 stage 7, A2). Which pushes a node keeps a sealed
/// copy from is its admission rule, its own stated word (`copies`: `{ signed, handed_on, unsigned, mailboxes }`, each optional; a rule that
/// states nothing keeps no copy): `signed` keeps a copy from a signed push whose signer is the block's author; `handed_on` one from a signed
/// push by anyone else (a handed-on copy, never in the author's place); `unsigned` one from an unsigned push; `mailboxes` keeps a wrapped
/// copy to one of those keys (it learns which mailbox and how big, never who wrote it). `push` is `{ signer?, for? }`. The answer is
/// `accept`'s, with `copies: [{ hash, for, from }]` (`from` `author` or `handed_on`; sorted by hash) and `wrapped: [{ mailbox, bytes }]`.
pub fn accept_copies(incoming: &[Value], held: &[Value], takes_pairs: bool, schemas: Option<&Index>, push: &Value, rule: &Value) -> Value {
    let (wrapped, plain): (Vec<&Value>, Vec<&Value>) = incoming.iter().partition(|m| is_wrapped(m));
    let plain: Vec<Value> = plain.into_iter().cloned().collect();
    let mut out = accept(&plain, held, takes_pairs, schemas).to_json();
    let says = |k: &str| rule.get(k) == Some(&Value::Bool(true));
    let mailboxes: Vec<&str> = rule.get("mailboxes").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
    let signer = push.get("signer").and_then(Value::as_str);
    let for_whom = push.get("for").cloned().unwrap_or(Value::Null);
    let taken: Vec<String> = out["taken"].as_array().map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect()).unwrap_or_default();
    let held_hashes: alloc::collections::BTreeSet<String> = normalised(held).iter().map(|h| hash_of(h).to_string()).collect();
    let mut copies: Vec<Value> = Vec::new();
    for m in &plain {
        let (Some(h), true) = (m.get("header"), m.get("envelope").is_some()) else { continue };
        let hash = crate::js::str_of(h.get("hash")).to_string();
        if !(taken.contains(&hash) || held_hashes.contains(&hash)) {
            continue;
        }
        let readers = recipients_of(&for_whom, &hash);
        if readers.is_empty() {
            continue;
        }
        let from = match signer {
            Some(sg) if Some(sg) == h.get("author").and_then(Value::as_str) && says("signed") => "author",
            Some(sg) if Some(sg) != h.get("author").and_then(Value::as_str) && says("handed_on") => "handed_on",
            None if says("unsigned") => "handed_on",
            _ => continue,
        };
        copies.push(json!({ "hash": hash, "for": readers, "from": from }));
    }
    copies.sort_by(|a, b| crate::js::str_of(a.get("hash")).cmp(crate::js::str_of(b.get("hash"))));
    let mut kept_wrapped: Vec<Value> = wrapped
        .iter()
        .filter(|m| m.get("mailbox").and_then(Value::as_str).is_some_and(|x| mailboxes.contains(&x)))
        .map(|m| json!({ "mailbox": m["mailbox"], "bytes": wrapped_bytes(m) }))
        .collect();
    kept_wrapped.sort_by(|a, b| crate::js::str_of(a.get("mailbox")).cmp(crate::js::str_of(b.get("mailbox"))).then(a["bytes"].as_u64().cmp(&b["bytes"].as_u64())));
    out["copies"] = json!(copies);
    out["wrapped"] = json!(kept_wrapped);
    out
}

/// What a store holds, read as blocks: a sealed message (`{ header, header_signature }`) is read as its header entry
/// (`valid::header_entry`); anything else is itself. A header held beside the whole block of its hash adds nothing.
fn normalised(held: &[Value]) -> Vec<Value> {
    let out: Vec<Value> = held.iter().map(|h| if h.get("header").is_some() && h.get("type").is_none() { crate::valid::header_entry(h).unwrap_or(Value::Null) } else { h.clone() }).collect();
    let whole: alloc::collections::BTreeSet<String> = out.iter().filter(|h| h.get("type").is_some()).map(|h| hash_of(h).to_string()).collect();
    out.into_iter().filter(|h| h.get("type").is_some() || !whole.contains(hash_of(h))).collect()
}

// Whether a header entry describes a block exactly (privacy.md, The public header: hash, author, key, seq, prev, skip).
fn describes(entry: &Value, body: &Value) -> bool {
    crate::write::header(entry) == crate::write::header(body)
}

/// What a node takes of a push (nodes.md, Push). `incoming` are full blocks and sealed header messages `{ header, header_signature,
/// envelope? }`; `held` is what the node holds. Each block is judged once by `valid` against what the node holds and the rest of the push
/// (no rounds, so what is taken never depends on the order of a push): valid is taken; a block whose pieces are not all held, or whose suite
/// this node does not know, is unjudged with the pieces it lacks; anything else is refused with every code its first failing check found.
/// A taken block is then read, and one that is not read is listed in `unread` with its codes (it is held as its header). Pairs are listed in
/// `equivocations`; whether a node takes their blocks is its own word (`takes_pairs`): one that does not takes neither block of a pair that
/// arrives in one push, and not a block that forks one already held. A body arriving under the hash of a header it does not fit shows that
/// header false (`false_headers`) and takes its place.
pub fn accept(incoming: &[Value], held: &[Value], takes_pairs: bool, schemas: Option<&Index>) -> Accepted {
    let _scope = crate::identity::scoped::Scope::new();
    let mut out = Accepted::default();
    let mut known = index_of(normalised(held).iter());
    // each incoming block as an entry: a body, or a header entry. A body whose bytes break checks 1 to 4 is refused at once.
    let mut entries: Vec<Value> = Vec::new();
    for m in incoming {
        if m.get("type").is_none() && m.get("header").is_some() {
            match (m.get("version"), crate::valid::header_entry(m)) {
                (None, Some(e)) => entries.push(e),
                _ => out.refused.push(Refused { hash: String::new(), code: "shape".into(), detail: "a sealed block is { header, header_signature, envelope }".into() }),
            }
            continue;
        }
        let found = crate::valid::bytes_findings(m);
        // an id in a hash this reader does not know is a wait (`unknown_suite`), judged below with the rest
        if found.iter().all(|r| r.code == "unknown_suite") {
            entries.push(m.clone());
        } else {
            let id = crate::block::hash(crate::js::type_of(m), m.get("state").unwrap_or(&Value::Null), m.get("refs").unwrap_or(&Value::Null));
            out.refused.extend(found.into_iter().map(|r| Refused { hash: id.clone(), code: r.code, detail: r.detail }));
        }
    }
    // a header held under a hash whose body arrives naming another author, key, seq or prev was a lie about that hash: read as never held
    let lies: Vec<String> = entries
        .iter()
        .filter(|b| b.get("type").is_some() && known.get(hash_of(b)).is_some_and(|h| h.get("type").is_none() && !describes(h, b)))
        .map(|b| hash_of(b).to_string())
        .collect();
    for h in &lies {
        known.shift_remove(h);
    }
    // the pool every block is judged against: what the node holds and the rest of the push. A block's id is the hash of its bytes in the
    // suite of the key its pieces name, read once the pool holds them; a block whose body is held is nothing new.
    let mut pool = known.clone();
    for e in &entries {
        pool.entry(hash_of(e).to_string()).or_insert_with(|| e.clone());
    }
    let mut new: alloc::collections::BTreeMap<String, Value> = Default::default();
    for e in entries {
        let e = if e.get("type").is_some() { crate::identity::with_id_in(&e, &pool) } else { e };
        let h = hash_of(&e).to_string();
        match known.get(&h) {
            Some(b) if b.get("type").is_some() => {
                if e.get("type").is_none() && !describes(&e, b) {
                    out.refused.push(Refused { hash: h, code: "bad_hash".into(), detail: "the header does not describe the block held under this hash".into() });
                }
                continue;
            }
            Some(_) if e.get("type").is_none() => continue,
            _ => {}
        }
        // 1.9 3a-8: where one hash comes more than once in one push, each copy is judged, and the valid one is kept; the order of arrival
        // never changes what is taken. Of two copies both valid, or neither, the lowest signature, only to name one.
        let sig = |b: &Value| b.get("signature").or_else(|| b.get("header_signature")).and_then(Value::as_str).unwrap_or("").to_string();
        let good = |b: &Value| crate::valid::valid(b, &pool).is_empty();
        let keep = new.get(&h).is_none_or(|o| {
            (o.get("type").is_none() && e.get("type").is_some())
                || (o.get("type").is_some() == e.get("type").is_some() && match (good(&e), good(o)) {
                    (true, false) => true,
                    (false, true) => false,
                    _ => sig(&e) < sig(o),
                })
        });
        if keep {
            new.insert(h, e);
        }
    }
    let mut pool = known.clone();
    for (h, e) in &new {
        pool.insert(h.clone(), e.clone());
    }
    let judge = crate::valid::Judge::new(&pool, schemas);
    let mut good: Vec<String> = Vec::new();
    for h in new.keys() {
        let v = judge.valid_held(h).unwrap_or_default();
        if v.is_empty() {
            good.push(h.clone());
        } else if v.iter().all(|r| r.code == "unmet" || r.code == "unknown_suite") {
            out.unjudged.push((h.clone(), judge.lacks_held(h)));
        } else {
            out.refused.extend(v.into_iter().map(|r| Refused { hash: h.clone(), code: r.code, detail: r.detail }));
        }
    }
    // the store once the push is taken, as the folds read it: the pairs a block of this push belongs to, each a star around its group's
    // lowest hash, counting only blocks that speak for their author then
    let mut after = known.clone();
    for h in &good {
        after.insert(h.clone(), new[h].clone());
    }
    let read_after = crate::js::closed(after.clone());
    let mut pairs: alloc::collections::BTreeSet<[String; 2]> = Default::default();
    let mut forked: alloc::collections::BTreeSet<String> = Default::default();
    for group in crate::identity::pair_groups_in(&read_after) {
        for x in group.iter().filter(|x| good.contains(x)) {
            forked.insert(x.clone());
            if *x == group[0] {
                pairs.extend(group.iter().skip(1).map(|o| [x.clone(), o.clone()]));
            } else {
                pairs.insert([group[0].clone(), x.clone()]);
            }
        }
    }
    out.equivocations = pairs.into_iter().collect();
    // each block taken is read against the store as it then stands
    let taken: Vec<String> = good.into_iter().filter(|h| takes_pairs || !forked.contains(h)).collect();
    let mut stored = known;
    for h in &taken {
        stored.insert(h.clone(), new[h].clone());
    }
    let reader = crate::valid::Judge::new(&stored, schemas);
    for h in &taken {
        if new[h].get("type").is_some() {
            let codes = reader.read_held(h).unwrap_or_default();
            if !codes.is_empty() {
                out.unread.push((h.clone(), codes.into_iter().map(|r| r.code).collect()));
            }
        }
    }
    out.false_headers = taken.iter().filter(|h| lies.contains(h)).cloned().collect();
    out.taken = taken.into_iter().map(|h| new[&h].clone()).collect();
    out.refused.sort_by(|a, b| a.hash.cmp(&b.hash));
    out
}

/// A node's signed answer to a push (nodes.md, Messages), from what it took.
pub fn push_answer(accepted: &Accepted, node: &str, private_key: &str, suite: &str) -> Result<Value> {
    push_answer_of(&accepted.to_json(), node, private_key, suite)
}

/// A node's signed answer to a push from its parts `{ receipt?, held?, taken, unjudged, refused, unread, equivocations }`: `{ node, receipt,
/// taken, held, unjudged, refused, unread, equivocations, signature }` (nodes.md, Messages). Every key is always present but `receipt` and
/// `held`, which the node gives by its own word (a receipt of what the push added, as a sealed block message; the blocks already held); an
/// empty list is `[]`. Each list in the order protocol.json `messages.push_answer_order` fixes.
pub fn push_answer_of(parts: &Value, node: &str, private_key: &str, suite: &str) -> Result<Value> {
    let items = |key: &str| parts.get(key).and_then(Value::as_array).cloned().unwrap_or_default();
    let hash_or_self = |v: &Value| v.get("hash").cloned().unwrap_or_else(|| v.clone());
    let field = |v: &Value, k: &str| v.get(k).cloned().unwrap_or(Value::Null);
    let by_hash = |mut v: Vec<Value>| {
        v.sort_by(|a, b| crate::js::str_of(Some(&hash_or_self(a))).cmp(crate::js::str_of(Some(&hash_or_self(b)))));
        v
    };
    let sorted = |v: &Value| {
        let mut l: Vec<String> = v.as_array().map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect()).unwrap_or_default();
        l.sort();
        l
    };
    let mut pairs: Vec<Vec<String>> = items("equivocations").iter().map(sorted).collect();
    pairs.sort();
    let mut answer = json!({
        "node": node,
        "taken": by_hash(items("taken")).iter().map(hash_or_self).collect::<Vec<_>>(),
        "unjudged": by_hash(items("unjudged")).iter().map(|u| json!({ "hash": field(u, "hash"), "needs": sorted(&field(u, "needs")) })).collect::<Vec<_>>(),
        "refused": by_hash(items("refused")).iter().map(|r| json!({ "hash": field(r, "hash"), "code": field(r, "code"), "detail": field(r, "detail") })).collect::<Vec<_>>(),
        "unread": by_hash(items("unread")).iter().map(|u| json!({ "hash": field(u, "hash"), "codes": field(u, "codes") })).collect::<Vec<_>>(),
        "equivocations": pairs,
    });
    if let Some(r) = parts.get("receipt").filter(|r| r.is_object()) {
        // 1.9 stage 7 (A2, nodes.md line 15): a receipt sealed to a pusher names only what that pusher's push added
        let taken = answer["taken"].as_array().cloned().unwrap_or_default();
        let named = r.get("refs").and_then(|x| x.get("derives_from")).map(|d| match d {
            Value::Array(a) => a.clone(),
            other => vec![other.clone()],
        });
        if named.is_some_and(|n| n.iter().any(|x| !taken.contains(x))) {
            return Err(crate::Error::coded("shape", "push_answer: a receipt to a pusher names only what that pusher's push added (nodes.md)"));
        }
        answer["receipt"] = r.clone();
    }
    if let Some(held) = parts.get("held").and_then(Value::as_array) {
        let mut hs: Vec<String> = held.iter().map(hash_or_self).filter_map(|v| v.as_str().map(String::from)).collect();
        hs.sort();
        hs.dedup();
        answer["held"] = json!(hs);
    }
    sign_message_in(suite, &pick(&answer, &crate::spec().convention("messages.push_answer")), private_key)
}

// ---- The arrival log (nodes.md, The arrival log) ----
/// A block on a log: a receipt or a `dropped` is on the log named by `log` when it is the block that brought its key in (`refs.key`, or its
/// author's genesis with none).
fn on_log(b: &Value, log: &str) -> bool {
    rs(b, "key").or_else(|| rs(b, "author")) == Some(log)
}

/// What a door log's signed words show (nodes.md, The arrival log; the door's `log_shown`): `left_out`, each block a receipt on the log puts
/// at a number that a pull answer signed for the same log covers (the request's `since` below it, the answer's `next` at or above it), that
/// matches the request's filter as the asker may see it, that no `dropped` at or below `next` names (nor the receipt that took it), and that
/// is not in the answer; and `stopped_short`, when the request names in `seen` a receipt on the log and the answer's `next` is below that
/// receipt's `seq` and equals the request's `since`. A receipt held as its header names nothing readable and puts no block at a number.
/// The answer counts only when its `request` is the hash of this request and it is signed by a key that speaks for its node.
pub fn log_shown(receipts: &[Value], request: &Value, answer: &Value, held: &Index) -> Value {
    let log = request.get("log").and_then(Value::as_str).unwrap_or("");
    let signed = answer.get("request").and_then(Value::as_str) == Some(crate::block::hash_hex(&canonical_json(request)).as_str())
        && answer.get("log").and_then(Value::as_str) == Some(log)
        && crate::sign::message_signed_by(answer, &crate::identity::live_keys_in(answer.get("node").and_then(Value::as_str).unwrap_or(""), held));
    // the receipts: whole blocks, valid with what is held, on the request's log (a receipt held as its header names nothing)
    let given: Vec<Value> = receipts.iter().filter(|r| r.get("type").is_some()).cloned().collect();
    let with = {
        let mut p = held.clone();
        for r in &given {
            p.entry(hash_of(r).to_string()).or_insert_with(|| r.clone());
        }
        p
    };
    let judge = crate::valid::Judge::new(&with, None);
    let entries: Vec<Value> = given.into_iter().filter(|r| !log.is_empty() && on_log(r, log) && judge.valid(r).is_empty()).collect();
    let seq = |b: &Value| crate::js::int(st(b, "seq")).unwrap_or(0.0);
    let since = request.get("since").and_then(Value::as_f64).unwrap_or(0.0);
    let next = answer.get("next").and_then(Value::as_f64).unwrap_or(0.0);
    let kind = |b: &Value, k: &str| crate::js::type_of(b) == "observe" && crate::js::ss(b, "kind") == Some(k);
    // the arrival number of each block: the seq of the first receipt on the log that names it, and that receipt's door person
    let mut at: alloc::collections::BTreeMap<String, (f64, String, String)> = Default::default();
    for r in entries.iter().filter(|r| kind(r, "receipt")) {
        for x in list(rf(r, "derives_from")) {
            let e = at.entry(x.to_string()).or_insert((seq(r), hash_of(r).to_string(), rs(r, "subject").unwrap_or("").to_string()));
            if seq(r) < e.0 {
                *e = (seq(r), hash_of(r).to_string(), rs(r, "subject").unwrap_or("").to_string());
            }
        }
    }
    // a drop reaches only a block the door's person neither signed nor answered (nodes.md, The arrival log)
    let hers = |x: &str, who: &str| {
        held.get(x).is_some_and(|b| rs(b, "author") == Some(who)) || held.values().any(|y| rs(y, "author") == Some(who) && list(rf(y, "answers")).contains(&x))
    };
    let dropped: alloc::collections::BTreeSet<&str> = entries.iter().filter(|d| kind(d, "dropped") && seq(d) <= next).flat_map(|d| list(rf(d, "derives_from"))).collect();
    // what the answer carries, by hash: a public block's id, a sealed block's header hash
    let pool = {
        let mut p = held.clone();
        for r in &entries {
            p.entry(hash_of(r).to_string()).or_insert_with(|| r.clone());
        }
        p
    };
    let carried: alloc::collections::BTreeSet<String> = answer
        .get("blocks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|e| e.get("message"))
        .filter_map(|m| match m.get("header") {
            Some(h) => h.get("hash").and_then(Value::as_str).map(String::from),
            None => crate::write::unwrap(m).ok().map(|b| crate::identity::id_in(&b, &pool)),
        })
        .collect();
    let filter = request.get("filter").cloned().unwrap_or(Value::Null);
    let asker = request.get("signer").and_then(Value::as_str);
    let matches_seen = |h: &str| match held.get(h) {
        Some(b) if b.get("type").is_some() && (is_public(b) || asker.is_some_and(|a| rs(b, "author") == Some(a))) => matches(b, &filter, held),
        Some(b) => matches(&header_view(b), &filter, held),
        None => filter.is_null() || filter.as_object().is_some_and(|f| f.is_empty()),
    };
    let mut left_out: Vec<String> = Vec::new();
    if signed {
        for (x, (n, r, who)) in &at {
            let gone = (dropped.contains(x.as_str()) || dropped.contains(r.as_str())) && !hers(x, who);
            if *n > since && *n <= next && matches_seen(x) && !gone && !carried.contains(x) {
                left_out.push(x.clone());
            }
        }
    }
    let stopped_short = signed
        && request.get("seen").and_then(Value::as_str).and_then(|s| entries.iter().find(|r| hash_of(r) == s)).is_some_and(|r| next < seq(r) && next == since);
    json!({ "left_out": left_out, "stopped_short": stopped_short })
}

/// `export_whole(document, log, last)` (nodes.md, A host, Her record at a host; protocol.json `door.ops.export_whole`): `{ whole, lacks }`,
/// the receipts given opened. `lacks`, each once, the ids ascending, then each `{ author, key, seq }` by author, key (null first) and seq:
/// what the door log lacks from `last` back to the block that brought its key in (`log`); each block a receipt on the log names that is not
/// in it, unless a `dropped` on the log names it or its receipt; each piece of a block in it that is not in it; and each block a receipt
/// names that is not in it and that a line a fold reads of a block in it lacks, read back from that block to the fold's own start (a
/// draw's: its owner's start for what it draws on). A `last` that is no block on the log is an argument error.
// The measures a block draws on (folds.md, What is left, A draw): the instances a transfer names, the inputs a make names, the head a transfer
// is `for` (a pot's payout).
fn measures_of(b: &Value) -> Vec<&str> {
    match crate::js::type_of(b) {
        "transfer" if crate::js::st(b, "status").is_none() => list(rf(b, "what")).into_iter().chain(list(rf(b, "for"))).collect(),
        "transform" => list(rf(b, "derives_from")),
        _ => Vec::new(),
    }
}

/// Where the line a draw's fold reads starts (folds.md, What is left, Her start): going back along the draw's line, the first block where
/// its owner came to own what it draws on: the measure itself (her thing, her offer, her head), or her answer to a block that names it (her
/// yes on which a draw to her landed). None when the block draws on nothing (no fold of
/// this stage reads its line); Some(None) when no start is found on the line held: the line is read to where it begins.
fn draw_start(h: &str, index: &crate::js::Index) -> Option<Option<String>> {
    let b = index.get(h)?;
    let measures = measures_of(b);
    if measures.is_empty() {
        return None;
    }
    let names_measure = |x: &Value| measures.iter().any(|m| crate::order::causes_of(x).iter().any(|c| c == m));
    let starts_here = |x: &Value| measures.contains(&hash_of(x)) || list(rf(x, "answers")).iter().any(|a| index.get(*a).is_some_and(|t| names_measure(t)));
    let mut cur = rs(b, "prev").and_then(|p| index.get(p));
    let mut steps = 0usize;
    while let Some(x) = cur {
        if starts_here(x) {
            return Some(Some(hash_of(x).to_string()));
        }
        steps += 1;
        if steps > index.len() {
            break;
        }
        cur = rs(x, "prev").and_then(|p| index.get(p));
    }
    // the measure itself, signed on this line before the draw, is its start even where the walk above did not meet it
    Some(measures.iter().find(|m| index.get(**m).is_some_and(|t| rs(t, "author") == rs(b, "author"))).map(|m| m.to_string()))
}

pub fn export_whole(document: &Value, log: &str, last: &str) -> Result<Value> {
    let messages = document.get("messages").and_then(Value::as_array).ok_or_else(|| crate::Error::new("export_whole takes { format, messages }"))?.clone();
    let blocks: Vec<Value> = messages
        .iter()
        .filter_map(|m| if m.get("header").is_some() && m.get("type").is_none() { crate::valid::header_entry(m) } else { crate::write::unwrap(m).ok() })
        .collect();
    let mut index = index_of(blocks.iter());
    let fixed: Vec<Value> = index.values().map(|b| if b.get("type").is_some() { crate::identity::with_id_in(b, &index) } else { b.clone() }).collect();
    index = index_of(fixed.iter());
    let kind = |b: &Value, k: &str| crate::js::type_of(b) == "observe" && crate::js::ss(b, "kind") == Some(k);
    let mut lacks: Vec<Value> = Vec::new();
    // the log, unbroken from the block of it she holds back to the block that brought its key in
    match index.get(last) {
        None => lacks.push(json!(last)),
        Some(r) => {
            if r.get("type").is_none() || !on_log(r, log) {
                return Err(crate::Error::new("the block she holds is a block on the log"));
            }
            let (reached, _, l) = crate::line::walk(last, Some(log), &index).map_err(crate::Error::new)?;
            if !reached && l.is_empty() {
                return Err(crate::Error::new("the block she holds is not on the log's line"));
            }
            lacks.extend(l);
        }
    }
    let on: Vec<&Value> = index.values().filter(|r| r.get("type").is_some() && on_log(r, log)).collect();
    let dropped: alloc::collections::BTreeSet<&str> = on.iter().filter(|d| kind(d, "dropped")).flat_map(|d| list(rf(d, "derives_from"))).collect();
    let named: alloc::collections::BTreeSet<&str> = on.iter().filter(|r| kind(r, "receipt")).flat_map(|r| list(rf(r, "derives_from"))).collect();
    // every block a receipt names is in it, or dropped (itself or by its receipt)
    for r in on.iter().filter(|r| kind(r, "receipt")) {
        for x in list(rf(r, "derives_from")) {
            if !index.contains_key(x) && !dropped.contains(x) && !dropped.contains(hash_of(r)) {
                lacks.push(json!(x));
            }
        }
    }
    // every piece of every block in it is in it
    for b in index.values() {
        for p in [rs(b, "author"), rs(b, "key")].into_iter().flatten() {
            if !index.contains_key(p) {
                lacks.push(json!(p));
            }
        }
    }
    // no line a fold reads of a block in it lacks a block a receipt names that is not in it: for a draw, its line back to its owner's start
    // for what it draws on, and no further (folds.md, What is left; each later fold names its own start)
    let judge = crate::valid::Judge::new(&index, None);
    for h in index.keys().filter(|h| judge.valid_held(h).is_some_and(|v| v.is_empty())) {
        let Some(start) = draw_start(h, &index) else { continue };
        if let Ok((_, _, l)) = crate::line::walk(h, start.as_deref(), &index) {
            for x in l.iter().filter_map(Value::as_str) {
                if named.contains(x) && !index.contains_key(x) {
                    lacks.push(json!(x));
                }
            }
        }
    }
    let ids: alloc::collections::BTreeSet<String> = lacks.iter().filter_map(Value::as_str).map(String::from).collect();
    let mut nums: Vec<Value> = Vec::new();
    for l in lacks.iter().filter(|l| l.is_object()) {
        if !nums.contains(l) {
            nums.push(l.clone());
        }
    }
    let text = |v: &Value, k: &str| v.get(k).and_then(Value::as_str).map(String::from);
    nums.sort_by(|a, b| (text(a, "author"), text(a, "key"), a.get("seq").and_then(Value::as_i64)).cmp(&(text(b, "author"), text(b, "key"), b.get("seq").and_then(Value::as_i64))));
    let out: Vec<Value> = ids.into_iter().map(Value::String).chain(nums).collect();
    Ok(json!({ "whole": out.is_empty(), "lacks": out }))
}

/// Whether a waiting block has waited past the node's own time to live (`ttl_ms` since it arrived).
pub fn waited_too_long(since: &str, now: &str, ttl_ms: i64) -> bool {
    matches!((crate::time::parse(since), crate::time::parse(now)), (Some(s), Some(n)) if n - s > ttl_ms)
}

// ---- Discovery ----
/// What a node publishes at `.well-known/foodblock` (nodes.md, Discovery), unsigned: `{ protocol, version, node, speaks_for, admission,
/// endpoints, log? }`. `log` names its public log, when it keeps one. The node signs it like any answer (`sign_message`).
/// A node's discovery document (nodes.md, Discovery): `{ protocol, reads, node, admission, endpoints, log? }`. `reads` lists the rule sets
/// the node runs (core.md, section 11), sorted: it lists one only when it runs a build made from that set's files (1.9 stage 7, B2).
pub fn well_known(node: &str, reads: &[String], admission: Option<&str>, endpoints: &Value, log: Option<&str>) -> Value {
    let keys = crate::spec().convention("messages.endpoints");
    let mut reads = reads.to_vec();
    reads.sort();
    reads.dedup();
    let mut doc = json!({
        "protocol": "foodblock", "reads": reads, "node": node,
        "admission": admission,
        "endpoints": Value::Object(keys.iter().map(|k| (k.clone(), endpoints.get(k).filter(|v| v.as_str().is_some_and(|s| !s.is_empty())).cloned().unwrap_or(Value::Null))).collect()),
    });
    if let Some(l) = log {
        doc["log"] = json!(l);
    }
    doc
}

/// A local announcement (mDNS / DNS-SD or a short-range link): `{ protocol, reads, node, endpoints }` (1.9 stage 7, B2: `reads` where `version` was).
pub fn announcement(doc: &Value) -> Value {
    pick(doc, &crate::spec().convention("messages.announcement"))
}

/// The mDNS / DNS-SD service a node announces nearby: `(service type, TXT records)` from protocol.json
/// `local_discovery` (`_foodblock._tcp`; `node`, `path`).
pub fn local_service(doc: &Value) -> (String, Vec<(String, String)>) {
    let p = &crate::spec().conventions;
    let service = crate::js::get(p, "local_discovery.service")
        .and_then(Value::as_str)
        .unwrap_or("_foodblock._tcp")
        .to_string();
    let path = crate::js::get(p, "local_discovery.path")
        .and_then(Value::as_str)
        .unwrap_or("/.well-known/foodblock");
    let txt = crate::spec()
        .convention("local_discovery.txt")
        .into_iter()
        .map(|k| {
            let v = if k == "path" {
                path.to_string()
            } else {
                crate::js::str_of(doc.get(&k)).to_string()
            };
            (k, v)
        })
        .collect();
    (service, txt)
}

/// What is wrong with a `.well-known/foodblock` document, in plain words.
pub fn well_known_errors(doc: &Value) -> Vec<String> {
    if doc.get("protocol").and_then(Value::as_str) != Some("foodblock") {
        return vec!["protocol is \"foodblock\"".into()];
    }
    let sp = crate::spec();
    let discovery = sp.convention("messages.discovery");
    let endpoints = sp.convention("messages.endpoints");
    let is_hash = |v: Option<&Value>| v.and_then(Value::as_str).is_some_and(|h| sp.is("id", h));
    let mut w: Vec<String> = doc
        .as_object()
        .unwrap()
        .keys()
        .filter(|k| !discovery.contains(k))
        .map(|k| format!("{k} is not part of discovery ({})", discovery.join(", ")))
        .collect();
    if !is_hash(doc.get("node")) {
        w.push("node is the id of the node (an actor)".into());
    }
    if !doc.get("reads").and_then(Value::as_array).is_some_and(|a| a.iter().all(|x| is_hash(Some(x)))) {
        w.push("reads lists the ids of the rule sets the node runs".into());
    }
    if doc.get("log").is_some_and(|l| !is_hash(Some(l))) {
        w.push("log is the id of the block that brought the log's key in".into());
    }
    if !(doc.get("admission").is_some_and(Value::is_null) || is_hash(doc.get("admission"))) {
        w.push("admission is the hash of the admission block".into());
    }
    let ok = doc
        .get("endpoints")
        .and_then(Value::as_object)
        .is_some_and(|e| {
            e.keys().all(|k| endpoints.contains(k))
                && endpoints.iter().all(|k| match e.get(k) {
                    Some(Value::Null) => true,
                    Some(Value::String(u)) => u.starts_with("http://") || u.starts_with("https://"),
                    _ => false,
                })
        });
    if !ok {
        w.push(format!(
            "endpoints: {{ {} }} are URLs",
            endpoints.join(", ")
        ));
    }
    w
}
