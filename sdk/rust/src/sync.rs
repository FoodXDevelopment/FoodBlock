//! Between nodes (modules/nodes.md): Pull and Push. Pull asks for the blocks the asker may see since the responder's
//! arrival number (never a time); `heads: true` returns only the heads among the matches. A signed request names its
//! signer, the node it is for, and one proof against replay (a `counter` or a `challenge`; no time). A node takes
//! blocks that are `valid` (valid.rs), holds back (waiting) those whose prev it lacks, lists the second of two blocks
//! naming one prev beside the first (`equivocations`), and refuses the rest, each `{ hash, code, detail }` with a code
//! from protocol.json's `refusals.codes`. Every node answer is signed by the node (invariant 18).
use crate::canonical::canonical_json;
use crate::check::ordered;
use crate::error::{Refusal, Result};
use crate::identity::{key_timeline_in, signer_of};
use crate::js::{hash_of, index_of, list, rf, rs, st, Index};
use crate::order::causal_order;
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
    pick(&r, &crate::spec().list("messages.pull"))
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
    let allowed = crate::spec().list(fields);
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

/// A non-public block as one who may not see it knows it: the entry of its public header (`header`, `header_entry`), nothing else.
fn header_view(block: &Value) -> Value {
    header_entry(&json!({ "header": crate::write::header(block) })).unwrap_or(Value::Null)
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
/// pull's asker, the copy sealed to them. Signed by the node: `{ node, request, blocks: [{ n, message }], next,
/// signature }`. `choices` are the responder's own (its cap and whether it serves a pair's proof); `asker` overrides the pull's own; `held` is what a filter's record
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
    let seen_by_asker = |e: &Arrival| -> bool {
        is_public(&e.block) || asker.is_some_and(|a| e.copies.iter().any(|(who, _)| who == a))
    };
    // A genesis has no public header (decision H10): to an asker outside its audience nothing of a sealed genesis is sent.
    let mut found: Vec<&Arrival> = log
        .iter()
        .filter(|e| {
            e.n > since
                && if seen_by_asker(e) {
                    matches(&e.block, &filter, held)
                } else {
                    !crate::identity::is_genesis(&e.block) && matches(&header_view(&e.block), &filter, held)
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
    // A node that serves a pair's proof (its own choice) sends the other half of a pair that one key signed naming one `prev`
    // with any answer that includes one, whether or not the other matches, was asked for, or came before `since`.
    let mut proofs: Vec<&Arrival> = Vec::new();
    // cheap first: only blocks of the same author naming the same prev can be a pair, found through one map of the log
    let mut by_place: alloc::collections::BTreeMap<(&str, &str), Vec<&Arrival>> = Default::default();
    let mut by_author: alloc::collections::BTreeMap<&str, Vec<&Arrival>> = Default::default();
    for o in log {
        if let (Some(a), Some(p)) = (rs(&o.block, "author"), rs(&o.block, "prev")) {
            by_place.entry((a, p)).or_default().push(o);
            by_author.entry(a).or_default().push(o);
        }
    }
    let mut sent: alloc::collections::BTreeSet<&str> = found.iter().map(|x| hash_of(&x.block)).collect();
    for e in found.iter().filter(|_| choices.serves_pairs) {
        let Some(at) = place_of(&e.block, held) else { continue };
        let candidates = if at.prev == "^first" { by_author.get(at.author.as_str()) } else { by_place.get(&(at.author.as_str(), at.prev.as_str())) };
        let unsent = candidates.into_iter().flatten().copied().filter(|o| !sent.contains(hash_of(&o.block))).map(|o| (&o.block, o));
        for other in rivals_of(hash_of(&e.block), &at, unsent, held) {
            if sent.insert(hash_of(&other.block)) {
                proofs.push(other);
            }
        }
    }
    found.extend(proofs);
    found.sort_by_key(|e| e.n);
    let message_of = |e: &Arrival| -> Value {
        if is_public(&e.block) {
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
            "header_signature": e.header_signature,
        })
    };
    let answer = json!({
        "node": node,
        "request": crate::block::hash_hex(&canonical_json(request)),
        "blocks": found.iter().map(|e| json!({ "n": e.n, "message": message_of(e) })).collect::<Vec<_>>(),
        "next": next,
    });
    match private_key {
        Some(k) => sign_message_in(suite, &answer, k),
        None => Ok(answer),
    }
}

/// Whether a node's answer (pull or push) is signed by one of the node's keys (any live key of its holder).
pub fn answer_signed_by(answer: &Value, node_keys: &[String]) -> bool {
    node_keys.iter().any(|k| {
        let suite = crate::sign::suite_named_by(k);
        verify_message_in(&suite, answer, k)
    })
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
    pick(&r, &crate::spec().list("messages.push"))
}

/// A signed push: the push, plus signer, node and one proof against replay, signed by one of the signer's keys.
pub fn sign_push(push: &Value, signer: &Signer) -> Result<Value> {
    stamp(
        pick(push, &crate::spec().list("messages.push")),
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

/// What a node takes of a push.
#[derive(Debug, Clone, Default)]
pub struct Accepted {
    pub taken: Vec<Value>,
    /// Blocks whose prev is not held: `(hash, needs)`.
    pub waiting: Vec<(String, Vec<String>)>,
    /// One entry per code for each refused block.
    pub refused: Vec<Refused>,
    /// Pairs of blocks from one key at one seq, each sorted: the second is neither taken nor refused; the node keeps
    /// both and serves them together.
    pub equivocations: Vec<[String; 2]>,
    /// Hashes held as a sealed block's public header that a whole block taken under the same hash proves false: the header
    /// names another author, `seq` or `prev` (privacy.md). The body is self-certifying, so the node keeps it in the header's place.
    pub false_headers: Vec<String>,
}

impl Accepted {
    /// `{ taken, waiting: [{ hash, needs }], refused: [{ hash, code, detail }], equivocations }`.
    pub fn to_json(&self) -> Value {
        json!({
            "taken": self.taken.iter().map(hash_of).collect::<Vec<_>>(),
            "waiting": self.waiting.iter().map(|(h, n)| json!({ "hash": h, "needs": n })).collect::<Vec<_>>(),
            "refused": self.refused.iter().map(|r| json!({ "hash": r.hash, "code": r.code, "detail": r.detail })).collect::<Vec<_>>(),
            "equivocations": self.equivocations,
            "false_headers": self.false_headers,
        })
    }
}

/// Which key signed a block, as far as the reader can tell: a full block's signature opens with one key of its author; a
/// sealed block held by its public header carries the header's signature (`header_signature`), which opens with the same key.
/// `None` when it cannot be told.
fn signing_key(block: &Value, known: &Index) -> Option<String> {
    let author = rs(block, "author")?;
    if block.get("type").is_some() {
        // The key check 6 reads from what the block rests on (a block held or judged has its needs held), never a guess among keys:
        // two different keys never share a place. The recovery key is a signer of its own (identity.md): its first block names the
        // genesis, as the first key's does, and the two are not a pair. Only the same key with the same `prev` is.
        if let Some(s) = crate::identity::signer_in(block, known) {
            return Some(s.key);
        }
        let keys = key_timeline_in(author, known, None);
        return signer_of(block, &keys).or_else(|| crate::identity::recovery_signer_of(block, author, known));
    }
    let keys = key_timeline_in(author, known, None);
    let message = json!({ "header": crate::write::header(block), "header_signature": block.get("header_signature").cloned().unwrap_or(Value::Null) });
    keys.iter().find(|e| crate::write::header_signed_by(&message, &e.key)).map(|e| e.key.clone())
}

/// A block and the place it takes in its key's chain: author, prev and the key (unknown for a sealed block held without its
/// header's signature, which then rivals any block of that author naming that prev).
struct Place {
    author: String,
    prev: String,
    key: Option<String>,
}
fn place_of(block: &Value, known: &Index) -> Option<Place> {
    let prev = rs(block, "prev")?.to_string();
    let key = signing_key(block, known);
    // a key's first block takes the key's root (identity::chain_slot): two first blocks of one key are a pair
    let prev = match crate::identity::signer_in(block, known) {
        Some(s) if key.as_deref() == Some(s.key.as_str()) => crate::identity::chain_slot(block, &s),
        _ => prev,
    };
    Some(Place { author: rs(block, "author")?.to_string(), prev, key })
}
fn same_place(a: &Place, b: &Place) -> bool {
    a.author == b.author && a.prev == b.prev && (a.key.is_none() || b.key.is_none() || a.key == b.key)
}

/// The blocks of `store` that take the same place as a block (hash `hash`, place `at`) in its key's chain: the rivals it forms a pair
/// with. A key's first block rivals every other first block of that key, whatever bringer it names (identity::chain_slot). Each
/// item of `store` is a block and what the caller wants back for it. Read by `answer_pull` (a fork travels with its proof) and by
/// `take_in` (a fork is listed as a pair).
fn rivals_of<'a, T>(hash: &str, at: &Place, store: impl Iterator<Item = (&'a Value, T)>, known: &Index) -> Vec<T> {
    store
        .filter(|(o, _)| hash_of(o) != hash && rs(o, "author") == Some(at.author.as_str()) && (at.prev == "^first" || rs(o, "prev") == Some(at.prev.as_str())))
        .filter(|(o, _)| place_of(o, known).is_some_and(|p| same_place(&p, at)))
        .map(|(_, t)| t)
        .collect()
}

/// The rounds shared by `accept` and `accept_sealed`. `pending` are the incoming entries, `judge` says what is wrong with one
/// whose needs are held (empty: take it). A block waits until every block it needs is held and is then judged once;
/// the blocks of a round are all judged against the store as it stood when the round began, so the answer never depends on the
/// order of a push. Two blocks of one key naming one `prev` are both kept and listed as a pair; whether a pair's blocks are taken
/// is the node's own choice (`takes_pairs`): if not, neither block of a pair that arrives in one round is taken, and the later block of a pair is not.
fn take_in(mut pending: Vec<Value>, known: &mut Index, takes_pairs: bool, judge: &dyn Fn(&Value, &Index) -> Vec<Refusal>) -> Accepted {
    let _scope = crate::identity::scoped::Scope::new();
    let mut out = Accepted::default();
    let mut pairs: alloc::collections::BTreeSet<[String; 2]> = Default::default();
    // Each waiting block is filed under the blocks it still needs, and looked at again only when one of them is taken (nodes.md: a
    // waiting block is tried again when a block it waits for arrives), so a long chain pushed at once costs one look per link, never
    // a scan of every waiting block every round (security I).
    let mut slots: Vec<Option<Value>> = pending.drain(..).map(Some).collect();
    let mut waits_on: alloc::collections::BTreeMap<String, Vec<usize>> = Default::default();
    let mut next: Vec<usize> = Vec::new();
    for (i, b) in slots.iter().enumerate() {
        let unmet = crate::js::unmet_in(b.as_ref().unwrap(), known);
        if unmet.is_empty() {
            next.push(i);
        }
        for n in unmet {
            waits_on.entry(n).or_default().push(i);
        }
    }
    loop {
        let ready: Vec<Value> = next.drain(..).filter_map(|i| slots[i].take()).collect();
        if ready.is_empty() {
            break;
        }
        // every block of the round is judged against the store as it stood when the round began. Its id is the one a reader that holds
        // its author's keys computes, in the suite of the key that signed it (core.md, section 2): what it rests on is held now.
        let mut good: Vec<(Value, Option<Place>)> = Vec::new();
        let mut ready: Vec<Value> = ready.into_iter().map(|b| crate::identity::with_id_in(&b, known)).collect();
        // copies of one block (one id once computed so: a copy that came with another id is the same block) are taken once, the one
        // with the lowest signature only to name one; a block whose body is held is nothing new
        ready.sort_by(|a, b| (hash_of(a), a.get("signature").and_then(Value::as_str)).cmp(&(hash_of(b), b.get("signature").and_then(Value::as_str))));
        ready.dedup_by(|b, a| hash_of(a) == hash_of(b));
        ready.retain(|b| b.get("type").is_none() || !holds_body(known, hash_of(b)));
        for block in ready {
            let wrong = judge(&block, known);
            for one in &wrong {
                out.refused.push(Refused { hash: hash_of(&block).to_string(), code: one.code.clone(), detail: one.detail.clone() });
            }
            if wrong.is_empty() {
                let at = place_of(&block, known);
                good.push((block, at));
            }
        }
        let mut forked: Vec<String> = Vec::new();
        // The store as it stands once the round is taken: a block the round voids (an old key's sibling off the counted line of a
        // rotation that arrives now: identity.md, Rotation) speaks for no one there, and forms no pair.
        let mut after: Option<Index> = None;
        let speaking: core::cell::RefCell<alloc::collections::BTreeMap<String, bool>> = Default::default();
        for (block, at) in &good {
            let Some(at) = at else { continue };
            let h = hash_of(block);
            // every block already held, or arriving in this round, that takes the same place in the same key's chain
            let store = known.values().map(|v| (v, hash_of(v).to_string())).chain(good.iter().map(|(o, _)| (o, hash_of(o).to_string())));
            let others: Vec<String> = rivals_of(h, at, store, known);
            if others.is_empty() {
                continue;
            }
            // read closed, as every fold reads (folds.md): a block the folds cannot read speaks for no one, so it forms no pair
            let after = after.get_or_insert_with(|| {
                let mut a = known.clone();
                for (g, _) in &good {
                    a.insert(hash_of(g).to_string(), g.clone());
                }
                crate::js::closed(a)
            });
            // whether each block speaks for its author once the round is taken: read once per block (asked again for every block of its place)
            let speaks = |x: &str| {
                if let Some(v) = speaking.borrow().get(x) {
                    return *v;
                }
                let v = after.get(x).is_some_and(|b| b.get("type").is_none() || crate::identity::signed_by_author_in(b, after, None));
                speaking.borrow_mut().insert(x.to_string(), v);
                v
            };
            if !speaks(h) {
                continue;
            }
            let others: Vec<String> = others.into_iter().filter(|o| speaks(o)).collect();
            if !others.is_empty() {
                forked.push(h.to_string());
                // a star (nodes.md): the block paired with the lowest hash of its place; the lowest, with each of the others
                let lowest = others.iter().min().cloned().unwrap_or_default();
                if lowest.as_str() < h {
                    pairs.insert([lowest, h.to_string()]);
                } else {
                    for other in others {
                        pairs.insert([h.to_string(), other]);
                    }
                }
            }
        }
        for (block, _) in good {
            let h = hash_of(&block).to_string();
            known.insert(h.clone(), block.clone());
            // what waited on this block is looked at again: it joins the next round once nothing it needs is missing
            for i in waits_on.remove(&h).unwrap_or_default() {
                if slots[i].as_ref().is_some_and(|b| crate::js::unmet_in(b, known).is_empty()) && !next.contains(&i) {
                    next.push(i);
                }
            }
            if takes_pairs || !forked.contains(&h) {
                out.taken.push(block);
            }
        }
        next.sort_unstable();
    }
    let mut pending: Vec<Value> = slots.into_iter().flatten().collect();
    pending.sort_by(|a, b| hash_of(a).cmp(hash_of(b)));
    for block in pending {
        out.waiting.push((hash_of(&block).to_string(), crate::js::unmet_in(&block, known)));
    }
    out.equivocations = pairs.into_iter().collect();
    out
}

/// What a store holds, read as blocks: a sealed message (`{ header, header_signature }`) is read as the entry of its public
/// header (`header_entry`); anything else is itself.
fn normalised(held: &[Value]) -> Vec<Value> {
    let out: Vec<Value> = held.iter().map(|h| if h.get("header").is_some() && h.get("type").is_none() { header_entry(h).unwrap_or(Value::Null) } else { h.clone() }).collect();
    // a header held beside the whole block of its hash adds nothing: the body is held, so the block is held, in whatever order
    // the store lists them (nodes.md, Rounds: a block whose body is held is nothing new)
    let whole: alloc::collections::BTreeSet<String> = out.iter().filter(|h| h.get("type").is_some()).map(|h| hash_of(h).to_string()).collect();
    out.into_iter().filter(|h| h.get("type").is_some() || !whole.contains(hash_of(h))).collect()
}

/// Whether the store holds a whole block under this hash (a sealed block is held by its public header alone, which has no
/// `type`: its body is not held).
fn holds_body(known: &Index, hash: &str) -> bool {
    known.get(hash).is_some_and(|b| b.get("type").is_some())
}

/// A block with no author string whose id is not the hash of its bytes: the index reads it as nobody's (js.rs, `index_of`), so `accept` must
/// refuse it by its bytes rather than lose it.
fn unreadable_id(b: &Value) -> bool {
    rs(b, "author").is_none() && !hash_of(b).is_empty() && hash_of(b) != crate::block::rehash(b)
}

/// What a node takes of a push (`incoming`, blocks off the wire) given what it holds (read closed). A block waits until
/// every block it needs is held (its `prev`, the offer it answers, the grant it acts under or passes on, the block it counts
/// to: protocol.json `needs`) and is then judged once by `valid` (valid.rs): refused with each code it breaks, or taken.
/// Blocks are judged in rounds against the same store, so the answer never depends on the order of a push. Two blocks of one
/// key naming one `prev` prove a lie: every such pair is listed in `equivocations` (each pair sorted, the list sorted), both
/// blocks are kept, and, unless the node chose to take pairs (`takes_pairs`), neither block of a pair that arrives together is taken
/// (the later of a pair is not taken). A block
/// whose hash is held only as a sealed public header is a body arriving for its header: the other half, taken and judged like
/// any other, never a duplicate. Any type is taken (open types are stored and passed on): the check reads only what core.md fixes.
pub fn accept(incoming: &[Value], held: &[Value], takes_pairs: bool, schemas: Option<&Index>) -> Accepted {
    let normal = normalised(held);
    // a header held under a hash whose body arrives, naming another author, seq or prev, was a lie about that hash (security K:
    // a stranger's header pre-registered on a victim's hash dropped the victim's block): it is read as never held, so the body
    // and what follows it are judged as if it were not there
    let lie = |h: &Value| {
        h.get("type").is_none()
            && incoming.iter().any(|b| {
                hash_of(b) == hash_of(h) && b.get("type").is_some() && (rs(h, "author") != rs(b, "author") || st(h, "seq") != st(b, "seq") || rs(h, "prev") != rs(b, "prev"))
            })
    };
    let lies: Vec<String> = normal.iter().filter(|h| lie(h)).map(|h| hash_of(h).to_string()).collect();
    let mut known = crate::js::held_index(normal.iter().filter(|h| !lie(h)));
    // a block whose `state` or `refs` is not an object is refused by its bytes (core.md, check 1): failure is out loud, never a silent drop
    // The same for every check that reads the bytes alone (checks 1 to 4): such a block is refused at once, whatever it rests on, and never waits.
    let (whole, ill): (Vec<&Value>, Vec<&Value>) = incoming.iter().partition(|b| {
        b.get("state").is_some_and(Value::is_object)
            && b.get("refs").is_some_and(Value::is_object)
            && (b.get("type").is_none() || (crate::js::unmet_in(b, &known).is_empty() && !unreadable_id(b)) || crate::valid::bytes_findings(b, schemas).is_empty())
    });
    let whole: Vec<Value> = whole.into_iter().cloned().collect();
    let pending: Vec<Value> = causal_order(&whole).into_iter().filter(|b| !holds_body(&known, hash_of(b))).collect();
    let mut out = take_in(pending, &mut known, takes_pairs, &|block, known| crate::valid::valid_in_closed(block, known, schemas));
    for b in ill.into_iter().filter(|b| b.get("type").is_some()) {
        let id = crate::block::hash(crate::js::type_of(b), b.get("state").unwrap_or(&Value::Null), b.get("refs").unwrap_or(&Value::Null));
        let found = crate::valid::bytes_findings(b, schemas);
        if found.is_empty() {
            out.refused.push(Refused { hash: id.clone(), code: "not_canonical".into(), detail: "a block is exactly { type, state, refs }, state and refs objects".into() });
        }
        for one in found {
            out.refused.push(Refused { hash: id.clone(), code: one.code.clone(), detail: one.detail.clone() });
        }
    }
    out.false_headers = out.taken.iter().map(|b| hash_of(b).to_string()).filter(|h| lies.contains(h)).collect();
    out.false_headers.sort();
    out
}

/// The pseudo-block a sealed block is held as: its public header (`{ author, seq, prev, hash, withheld?, skip? }`) and its
/// signature, in the shape of a block without a `type` and without a body. `message` is a sealed message
/// (`{ header, header_signature }`).
pub fn header_entry(message: &Value) -> Option<Value> {
    let header = message.get("header")?;
    let mut state = serde_json::Map::new();
    state.insert("seq".into(), header.get("seq")?.clone());
    state.insert("audience".into(), json!(["sealed"]));
    for flag in ["withheld", "skip"] {
        if let Some(v) = header.get(flag) {
            state.insert(flag.into(), v.clone());
        }
    }
    let mut refs = serde_json::Map::new();
    refs.insert("author".into(), header.get("author")?.clone());
    refs.insert("prev".into(), header.get("prev")?.clone());
    let mut out = json!({ "hash": header.get("hash")?, "state": state, "refs": refs });
    // a header is those fields and no other: the signature covers exactly them
    let allowed = ["author", "seq", "prev", "hash", "withheld", "skip"];
    if header.as_object().is_some_and(|h| h.keys().any(|k| !allowed.contains(&k.as_str()))) {
        out["bad_header"] = Value::Bool(true);
    }
    if let Some(sig) = message.get("header_signature") {
        out["header_signature"] = sig.clone();
    }
    Some(out)
}

/// What the check of a sealed block's public header finds wrong (core.md check 6 and 7 over the header alone): its shape, a
/// key of its author that speaks for it and opens its signature, and the link in that key's chain (same key, the next `seq`
/// or a skip, or `seq` 1 on the block that brought the key in). The body stays sealed: opening it and checking it is the
/// recipients' to do, with `valid`. `entry` is `header_entry`'s answer.
fn judge_header(entry: &Value, known: &Index) -> Vec<Refusal> {
    let sp = crate::spec();
    let (state, refs) = (entry.get("state").unwrap_or(&Value::Null), entry.get("refs").unwrap_or(&Value::Null));
    let seq = state.get("seq").and_then(Value::as_i64).filter(|n| *n >= 1);
    let ids_ok = ["author", "prev"].iter().all(|k| refs.get(*k).and_then(Value::as_str).is_some_and(|h| sp.is("id", h)))
        && hash_of(entry) != ""
        && sp.is("id", hash_of(entry));
    let flags_ok = ["withheld", "skip"].iter().all(|f| state.get(*f).is_none_or(|v| v == &Value::Bool(true)));
    if seq.is_none() || !ids_ok || !flags_ok || entry.get("bad_header").is_some() || !entry.get("header_signature").is_some_and(Value::is_string) {
        return vec![Refusal::new("shape", "a sealed block's header is { author, seq, prev, hash } and its signature; withheld and skip only true")];
    }
    let author = rs(entry, "author").unwrap_or("");
    if !crate::identity::genesis_opens(known.get(author)) {
        return vec![Refusal::new("bad_signature", "the author's genesis is not held, so no key of the author can open the header")];
    }
    if !known.contains_key(rs(entry, "prev").unwrap_or("")) {
        return vec![Refusal::new("chain", "refs.prev is not held")];
    }
    // the header's signer, read from what it rests on alone, as for a whole block (core.md, checks 6 and 7)
    let Some(signer) = crate::identity::signer_in(entry, known) else {
        return vec![Refusal::new("bad_signature", "the header is not signed by a key of its author that what it rests on brought in")];
    };
    let seq = seq.unwrap_or(0) as f64;
    let skip = state.get("skip") == Some(&Value::Bool(true));
    let prev_seq = known.get(rs(entry, "prev").unwrap_or("")).and_then(|p| crate::js::int(st(p, "seq")));
    let fits = if signer.first { seq == 1.0 || (skip && seq >= 1.0) } else { prev_seq.is_some_and(|b| (!skip && seq == b + 1.0) || (skip && seq > b)) };
    if !fits {
        let why = if signer.first { "a key's first block has seq 1" } else { "state.seq is one more than the previous block's (or a skip that jumps forward)" };
        return vec![Refusal::new("chain", why)];
    }
    vec![]
}

/// What a node takes of the sealed blocks of a push (`incoming`: sealed messages `{ header, header_signature,
/// envelope }`) given what it holds: whole blocks, sealed blocks held by their public header (a block without a `type`), or
/// sealed messages. A header is judged by `judge_header` after the blocks it needs, in rounds, and equivocation works as for
/// `accept`. A header whose hash is held as a whole block is the other half of it: taken when it matches the body (same author,
/// `seq` and `prev`), refused (`bad_hash`) when it does not. A header already held is nothing new.
pub fn accept_sealed(incoming: &[Value], held: &[Value], takes_pairs: bool) -> Accepted {
    let normal = normalised(held);
    let mut known = crate::js::held_index(normal.iter());
    let mut out_early = Accepted::default();
    let mut pending: Vec<Value> = Vec::new();
    for message in incoming {
        if message.get("version").is_some() {
            out_early.refused.push(Refused { hash: String::new(), code: "shape".into(), detail: "a sealed block carries no version: it is { header, header_signature, envelope }".into() });
            continue;
        }
        let Some(entry) = header_entry(message) else {
            // a genesis has no public header (decision H10): it travels whole, to whom its author shows it
            let detail = if message.get("header").is_some_and(|h| h.get("hash").is_some() && h.get("author").is_none()) {
                "a genesis has no public header: it travels whole, to whom its author shows it"
            } else {
                "a sealed block is { header, header_signature, envelope }"
            };
            out_early.refused.push(Refused { hash: String::new(), code: "shape".into(), detail: detail.into() });
            continue;
        };
        let h = hash_of(&entry).to_string();
        match known.get(&h) {
            Some(body) if body.get("type").is_some() => {
                let matches = rs(body, "author") == rs(&entry, "author") && st(body, "seq") == st(&entry, "seq") && rs(body, "prev") == rs(&entry, "prev");
                if matches {
                    out_early.taken.push(entry);
                } else {
                    out_early.refused.push(Refused { hash: h, code: "bad_hash".into(), detail: "the header does not describe the block held under this hash".into() });
                }
            }
            Some(_) => {}
            None => pending.push(entry),
        }
    }
    let mut out = take_in(pending, &mut known, takes_pairs, &|entry, known| judge_header(entry, known));
    out_early.taken.sort_by(|a, b| hash_of(a).cmp(hash_of(b)));
    out_early.refused.sort_by(|a, b| a.hash.cmp(&b.hash));
    out.taken.splice(0..0, out_early.taken);
    out.refused.splice(0..0, out_early.refused);
    out
}

/// A node's signed answer to a push (signed by a key of its holder, a person or a machine, brought in by a key grant):
/// `{ node, taken, waiting, refused: [{ hash, code, detail }], equivocations: [[hash, hash]], signature }`. Every key is
/// always there; an empty list is []. Each pair is sorted as text.
pub fn push_answer(accepted: &Accepted, node: &str, private_key: &str, suite: &str) -> Result<Value> {
    push_answer_of(&accepted.to_json(), node, private_key, suite)
}

/// A node's signed answer to a push, from its parts `{ taken, waiting, refused, equivocations, held?, at? }` (each taken or waiting
/// entry a hash or `{ hash, ... }`, each refusal `{ hash, code, detail }`; a part left out is empty).
pub fn push_answer_of(parts: &Value, node: &str, private_key: &str, suite: &str) -> Result<Value> {
    let items = |key: &str| {
        parts
            .get(key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    let hash_or_self = |v: &Value| v.get("hash").cloned().unwrap_or_else(|| v.clone());
    let field = |v: &Value, k: &str| v.get(k).cloned().unwrap_or(Value::Null);
    let mut answer = json!({
        "node": node,
        "taken": items("taken").iter().map(hash_or_self).collect::<Vec<_>>(),
        "waiting": items("waiting").iter().map(hash_or_self).collect::<Vec<_>>(),
        "refused": items("refused").iter().map(|r| json!({ "hash": field(r, "hash"), "code": field(r, "code"), "detail": field(r, "detail") })).collect::<Vec<_>>(),
        "equivocations": items("equivocations").iter().map(|pair| {
            let mut p: Vec<Value> = pair.as_array().cloned().unwrap_or_default();
            p.sort_by(|a, b| crate::js::str_of(Some(a)).cmp(crate::js::str_of(Some(b))));
            Value::Array(p)
        }).collect::<Vec<_>>(),
    });
    // the blocks of the push the node already held, when it chooses to say so (nodes.md, decision F7): its own word, binding it
    // alone, so a pusher who lost the first answer learns they got there; no node must give it
    if let Some(held) = parts.get("held").and_then(Value::as_array) {
        let mut hs: Vec<String> = held.iter().map(hash_or_self).filter_map(|v| v.as_str().map(String::from)).collect();
        hs.sort();
        hs.dedup();
        answer["held"] = json!(hs);
    }
    // the node's own time it took the push, when it gives one: a receipt its pusher may carry into a deal (promises.md, Who may bind)
    if let Some(at) = parts.get("at").filter(|t| crate::time::is_time(Some(t))) {
        answer["at"] = at.clone();
    }
    sign_message_in(
        suite,
        &pick(&answer, &crate::spec().list("messages.push_answer")),
        private_key,
    )
}

/// Whether a waiting block has waited past the node's own time to live (`ttl_ms` since it arrived).
pub fn waited_too_long(since: &str, now: &str, ttl_ms: i64) -> bool {
    matches!((crate::time::parse(since), crate::time::parse(now)), (Some(s), Some(n)) if n - s > ttl_ms)
}

// ---- Discovery ----
/// What a node publishes at `.well-known/foodblock`.
pub fn well_known(
    node: &str,
    holds: &[String],
    speaks_for: &[String],
    admission: Option<&str>,
    endpoints: &Value,
) -> Value {
    let keys = crate::spec().list("messages.endpoints");
    json!({
        "protocol": "foodblock", "version": crate::spec().version, "node": node, "holds": holds, "speaks_for": speaks_for,
        "admission": admission,
        "endpoints": Value::Object(keys.iter().map(|k| (k.clone(), endpoints.get(k).filter(|v| v.as_str().is_some_and(|s| !s.is_empty())).cloned().unwrap_or(Value::Null))).collect()),
    })
}

/// A local announcement (mDNS / DNS-SD or a short-range link): `{ protocol, version, node, endpoints }`.
pub fn announcement(doc: &Value) -> Value {
    pick(doc, &crate::spec().list("messages.announcement"))
}

/// The mDNS / DNS-SD service a node announces nearby: `(service type, TXT records)` from protocol.json
/// `local_discovery` (`_foodblock._tcp`; `version`, `node`, `path`).
pub fn local_service(doc: &Value) -> (String, Vec<(String, String)>) {
    let p = &crate::spec().protocol;
    let service = crate::js::get(p, "local_discovery.service")
        .and_then(Value::as_str)
        .unwrap_or("_foodblock._tcp")
        .to_string();
    let path = crate::js::get(p, "local_discovery.path")
        .and_then(Value::as_str)
        .unwrap_or("/.well-known/foodblock");
    let txt = crate::spec()
        .list("local_discovery.txt")
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
    let discovery = sp.list("messages.discovery");
    let endpoints = sp.list("messages.endpoints");
    let is_hash = |v: Option<&Value>| v.and_then(Value::as_str).is_some_and(|h| sp.is("id", h));
    let mut w: Vec<String> = doc
        .as_object()
        .unwrap()
        .keys()
        .filter(|k| !discovery.contains(k))
        .map(|k| format!("{k} is not part of discovery ({})", discovery.join(", ")))
        .collect();
    if !doc.get("version").is_some_and(Value::is_string) {
        w.push("version names the rules the node speaks".into());
    }
    if !is_hash(doc.get("node")) {
        w.push("node is the id of the node (an actor)".into());
    }
    for key in ["holds", "speaks_for"] {
        if !doc
            .get(key)
            .and_then(Value::as_array)
            .is_some_and(|a| a.iter().all(|x| is_hash(Some(x))))
        {
            w.push(format!("{key} lists ids (hashes)"));
        }
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
