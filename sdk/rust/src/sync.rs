//! Between nodes (modules/nodes.md): Pull and Push. Pull asks for the blocks the asker may see since the responder's
//! arrival number (never a time); `heads: true` returns only the heads among the matches. A signed request names its
//! signer, the node it is for, and one proof against replay (a `counter` or a `challenge`; no time). A node takes
//! blocks that are `valid` (valid.rs), holds back (waiting) those whose prev it lacks, lists the second of two blocks
//! naming one prev beside the first (`equivocations`), and refuses the rest, each `{ hash, code, detail }` with a code
//! from protocol.json's `refusals.codes`. Every node answer is signed by the node (invariant 18).
use crate::canonical::canonical_json;
use crate::check::ordered;
use crate::error::{Refusal, Result};
use crate::identity::{key_timeline_in, signer_of, ArrivedAt};
use crate::js::{hash_of, index_of, list, rf, rs, ss, st, truthy, Index};
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
    let mut r = request.clone();
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
            let above = c
                .as_u64()
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
        let suite = crate::sign::suite_of_key(k).unwrap_or_else(|| "std".to_string());
        verify_message_in(&suite, message, k)
    });
    if !opens {
        wrong.push(Refusal::new("bad_signature", "it is not signed by its signer"));
    }
    ordered(wrong, "message")
}
fn details(refused: Vec<Refusal>) -> Vec<String> {
    refused.into_iter().map(|one| one.detail).collect()
}
fn rs_top<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

/// Why a node refuses a signed pull: `[{ code, detail }]`, empty when it may be answered.
pub fn pull_refusals(message: &Value, freshness: &Freshness) -> Vec<Refusal> {
    message_refusals(message, "messages.signed_pull", freshness)
}

/// What is wrong with a signed pull, in plain words, for the node `node` whose clock reads `now`: empty when it may be
/// answered.
pub fn pull_errors(message: &Value, freshness: &Freshness) -> Vec<String> {
    details(pull_refusals(message, freshness))
}

/// Every first version a block is a version of (itself, and back through `updates`).
pub fn record_of(block: &Value, held: &Index) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut todo = vec![block.clone()];
    while let Some(one) = todo.pop() {
        let h = hash_of(&one).to_string();
        if out.contains(&h) {
            continue;
        }
        out.push(h);
        for u in list(rf(&one, "updates")).into_iter().rev() {
            todo.push(
                held.get(u)
                    .cloned()
                    .unwrap_or_else(|| json!({ "hash": u, "refs": {} })),
            );
        }
    }
    out
}

/// Whether a block matches a pull filter (every key, ANDed): `type`, `kind`, `author`, `hash`, `record` (a record's
/// first hash: every version), `marks` (`{ scheme, value }`: the block carries that exact mark) and `refs`
/// (`{ key: hash }`). `held` resolves records.
pub fn matches(block: &Value, filter: &Value, held: &Index) -> bool {
    let Some(f) = filter.as_object().filter(|f| !f.is_empty()) else {
        return true;
    };
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
        _ => true,
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

/// Answer a pull from a node's arrival log. A public block travels whole; a sealed one as its header or, to a signed
/// pull's asker, the copy sealed to them. Signed by the node: `{ node, request, blocks: [{ n, message }], next,
/// signature }`. `cap` is the responder's own limit; `asker` overrides the pull's own; `held` is what a filter's record
/// is read from (the log's own blocks when none).
pub fn answer_pull(
    log: &[Arrival],
    request: &Value,
    node: &str,
    private_key: Option<&str>,
    cap: u64,
    asker: Option<&str>,
    held: Option<&Index>,
    suite: &str,
) -> Result<Value> {
    let since = request.get("since").and_then(Value::as_f64).unwrap_or(0.0) as u64;
    let limit = request
        .get("limit")
        .and_then(Value::as_f64)
        .map(|l| l as u64)
        .filter(|l| *l > 0)
        .unwrap_or(cap)
        .min(cap);
    let asker = asker.or_else(|| request.get("signer").and_then(Value::as_str));
    let own = index_of(log.iter().map(|e| &e.block));
    let held = held.unwrap_or(&own);
    let filter = request.get("filter").cloned().unwrap_or(Value::Null);
    let mut found: Vec<&Arrival> = log
        .iter()
        .filter(|e| e.n > since && matches(&e.block, &filter, held))
        .collect();
    found.sort_by_key(|e| e.n);
    if truthy(request.get("heads")) {
        let blocks: Vec<Value> = found.iter().map(|e| e.block.clone()).collect();
        let heads: Vec<String> = heads_of(&blocks)
            .iter()
            .map(|b| hash_of(b).to_string())
            .collect();
        found.retain(|e| heads.iter().any(|h| h == hash_of(&e.block)));
    }
    found.truncate(limit as usize);
    // The next number is where the matches end; the proofs below may sit beyond it and are sent again then.
    let next = found.last().map(|e| e.n).unwrap_or(since);
    // Lies travel with their proof (nodes.md, Pull): a block of a pair that one key signed naming one `prev` is never
    // answered without the other, whether or not the other matches, was asked for, or came before `since`.
    let mut proofs: Vec<&Arrival> = Vec::new();
    for e in &found {
        // cheap first: only blocks of the same author naming the same prev can be a pair
        let rivals: Vec<&Arrival> = log
            .iter()
            .filter(|o| {
                hash_of(&o.block) != hash_of(&e.block)
                    && rs(&o.block, "author").is_some()
                    && rs(&o.block, "author") == rs(&e.block, "author")
                    && rs(&o.block, "prev").is_some()
                    && rs(&o.block, "prev") == rs(&e.block, "prev")
                    && !found.iter().chain(proofs.iter()).any(|x| hash_of(&x.block) == hash_of(&o.block))
            })
            .collect();
        if rivals.is_empty() {
            continue;
        }
        let Some(at) = place_of(&e.block, held) else { continue };
        for other in rivals {
            if place_of(&other.block, held).is_some_and(|p| same_place(&p, &at)) {
                proofs.push(other);
            }
        }
    }
    found.extend(proofs);
    found.sort_by_key(|e| e.n);
    let message_of = |e: &Arrival| -> Value {
        let public = st(&e.block, "audience").and_then(Value::as_str) == Some("public")
            || !st(&e.block, "audience").is_some_and(Value::is_array);
        if public {
            return wrap(&e.block);
        }
        if let Some(copy) = asker
            .and_then(|a| e.copies.iter().find(|(who, _)| who == a))
            .map(|(_, c)| c.clone())
        {
            return copy;
        }
        json!({
            "version": crate::spec().version,
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
        let suite = crate::sign::suite_of_key(k).unwrap_or_else(|| "std".to_string());
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

/// What is wrong with a signed push, in plain words: empty when it may be taken in.
pub fn push_errors(message: &Value, freshness: &Freshness) -> Vec<String> {
    details(push_refusals(message, freshness))
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
}

impl Accepted {
    /// `{ taken, waiting: [{ hash, needs }], refused: [{ hash, code, detail }], equivocations }`.
    pub fn to_json(&self) -> Value {
        json!({
            "taken": self.taken.iter().map(hash_of).collect::<Vec<_>>(),
            "waiting": self.waiting.iter().map(|(h, n)| json!({ "hash": h, "needs": n })).collect::<Vec<_>>(),
            "refused": self.refused.iter().map(|r| json!({ "hash": r.hash, "code": r.code, "detail": r.detail })).collect::<Vec<_>>(),
            "equivocations": self.equivocations,
        })
    }
}

/// Which key signed a block, as far as the reader can tell: a full block's signature opens with one key of its author; a
/// sealed block held by its public header carries the header's signature (`header_signature`), which opens with the same key.
/// `None` when it cannot be told.
fn signing_key(block: &Value, known: &Index) -> Option<String> {
    let author = rs(block, "author")?;
    let keys = key_timeline_in(author, known, None);
    if block.get("type").is_some() {
        // The recovery key is a signer of its own (identity.md): its first block names the genesis, as the first key's
        // does, and the two are not a pair. Only the same key with the same `prev` is.
        return signer_of(block, &keys).or_else(|| crate::identity::recovery_signer_of(block, author, known));
    }
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
    Some(Place { author: rs(block, "author")?.to_string(), prev: rs(block, "prev")?.to_string(), key: signing_key(block, known) })
}
fn same_place(a: &Place, b: &Place) -> bool {
    a.author == b.author && a.prev == b.prev && (a.key.is_none() || b.key.is_none() || a.key == b.key)
}

/// The rounds shared by `accept` and `accept_sealed`. `pending` are the incoming entries, `judge` says what is wrong with one
/// whose needs are held (empty: take it). A block waits until every block it needs is held and is then judged once;
/// the blocks of a round are all judged against the store as it stood when the round began, so the answer never depends on the
/// order of a push. Two blocks of one key naming one `prev` are both kept and listed as a pair; neither block of a pair that
/// arrives in one round is taken, and the later block of a pair is not taken.
fn take_in(mut pending: Vec<Value>, known: &mut Index, judge: &dyn Fn(&Value, &Index) -> Vec<Refusal>) -> Accepted {
    let mut out = Accepted::default();
    let mut pairs: alloc::collections::BTreeSet<[String; 2]> = Default::default();
    loop {
        let (ready, rest): (Vec<Value>, Vec<Value>) = pending.into_iter().partition(|b| crate::js::unmet_in(b, known).is_empty());
        pending = rest;
        if ready.is_empty() {
            break;
        }
        // every block of the round is judged against the store as it stood when the round began
        let mut good: Vec<(Value, Option<Place>)> = Vec::new();
        let mut ready = ready;
        ready.sort_by(|a, b| hash_of(a).cmp(hash_of(b)));
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
        for (block, at) in &good {
            let Some(at) = at else { continue };
            let h = hash_of(block);
            // every block already held, or arriving in this round, that takes the same place in the same key's chain
            let mut others: Vec<String> = known
                .iter()
                .filter(|(k, held)| k.as_str() != h && rs(held, "author") == Some(at.author.as_str()) && rs(held, "prev") == Some(at.prev.as_str()))
                .filter(|(_, held)| place_of(held, known).is_some_and(|p| same_place(&p, at)))
                .map(|(k, _)| k.clone())
                .collect();
            others.extend(good.iter().filter(|(o, oat)| hash_of(o) != h && oat.as_ref().is_some_and(|p| same_place(p, at))).map(|(o, _)| hash_of(o).to_string()));
            if !others.is_empty() {
                forked.push(h.to_string());
                for other in others {
                    let mut pair = [other, h.to_string()];
                    pair.sort();
                    pairs.insert(pair);
                }
            }
        }
        for (block, _) in good {
            let h = hash_of(&block).to_string();
            known.insert(h.clone(), block.clone());
            if !forked.contains(&h) {
                out.taken.push(block);
            }
        }
    }
    pending.sort_by(|a, b| hash_of(a).cmp(hash_of(b)));
    for block in pending {
        out.waiting.push((hash_of(&block).to_string(), crate::js::unmet_in(&block, known)));
    }
    out.equivocations = pairs.into_iter().collect();
    out
}

/// What a store holds, read as blocks: a sealed message (`{ version, header, header_signature }`) is read as the entry of its public
/// header (`header_entry`); anything else is itself.
fn normalised(held: &[Value]) -> Vec<Value> {
    held.iter().map(|h| if h.get("header").is_some() && h.get("type").is_none() { header_entry(h).unwrap_or(Value::Null) } else { h.clone() }).collect()
}

/// Whether the store holds a whole block under this hash (a sealed block is held by its public header alone, which has no
/// `type`: its body is not held).
fn holds_body(known: &Index, hash: &str) -> bool {
    known.get(hash).is_some_and(|b| b.get("type").is_some())
}

/// What a node takes of a push (`incoming`, blocks off the wire) given what it holds (read closed). A block waits until
/// every block it needs is held (its `prev`, the offer it answers, the grant it acts under or passes on, the block it counts
/// to: protocol.json `needs`) and is then judged once by `valid` (valid.rs): refused with each code it breaks, or taken.
/// Blocks are judged in rounds against the same store, so the answer never depends on the order of a push. Two blocks of one
/// key naming one `prev` prove a lie: every such pair is listed in `equivocations` (each pair sorted, the list sorted), both
/// blocks are kept, and neither block of a pair that arrives together is taken (the later of a pair is not taken). A block
/// whose hash is held only as a sealed public header is a body arriving for its header: the other half, taken and judged like
/// any other, never a duplicate. Any type is taken (open types are stored and passed on): the check reads only what core.md fixes.
pub fn accept(
    incoming: &[Value],
    held: &[Value],
    arrived_at: ArrivedAt,
    schemas: Option<&Index>,
) -> Accepted {
    let normal = normalised(held);
    let mut known = crate::js::held_index(normal.iter());
    let pending: Vec<Value> = causal_order(incoming).into_iter().filter(|b| !holds_body(&known, hash_of(b))).collect();
    take_in(pending, &mut known, &|block, known| crate::valid::valid_in_closed(block, known, schemas, arrived_at))
}

/// The pseudo-block a sealed block is held as: its public header (`{ author, seq, prev, hash, withheld?, skip? }`) and its
/// signature, in the shape of a block without a `type` and without a body. `message` is a sealed message
/// (`{ version, header, header_signature }`).
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
fn judge_header(entry: &Value, known: &Index, arrived_at: ArrivedAt) -> Vec<Refusal> {
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
    let (author, prev_hash) = (rs(entry, "author").unwrap_or(""), rs(entry, "prev").unwrap_or(""));
    let timeline = key_timeline_in(author, known, arrived_at);
    if timeline.is_empty() {
        return vec![Refusal::new("bad_signature", "the author's genesis is not held, so no key of the author can open the header")];
    }
    let message = json!({ "header": crate::write::header(entry), "header_signature": entry.get("header_signature") });
    let Some(signer) = timeline.iter().find(|e| crate::write::header_signed_by(&message, &e.key)) else {
        return vec![Refusal::new("bad_signature", "the header is not signed by a key of its author")];
    };
    if !crate::identity::key_speaks_for_header(signer, entry, known, arrived_at) {
        return vec![Refusal::new("void_key", "signed by a key of its author that does not speak for it: void, frozen, or rotated past counted_to")];
    }
    let Some(p) = known.get(prev_hash) else {
        return vec![Refusal::new("chain", "refs.prev is not held")];
    };
    let seq = seq.unwrap_or(0) as f64;
    let skip = state.get("skip") == Some(&Value::Bool(true));
    let prev_seq = crate::js::int(st(p, "seq"));
    let same_key = rs(p, "author") == Some(author)
        && match signing_key(p, known) {
            Some(k) => k == signer.key,
            // a sealed block held without its header's signature: its key cannot be told, and it is in this author's chain
            None => p.get("type").is_none(),
        };
    if same_key {
        let ok = prev_seq.is_some_and(|b| (!skip && seq == b + 1.0) || (skip && seq > b));
        if !ok {
            return vec![Refusal::new("chain", "state.seq is one more than the previous block's (or a skip that jumps forward)")];
        }
    } else {
        let brought = ss(p, "public_key_sign") == Some(signer.key.as_str());
        if !brought {
            return vec![Refusal::new("chain", "refs.prev is neither the key's previous block nor the block that brought the key in")];
        }
        if !(seq == 1.0 || (skip && seq >= 1.0)) {
            return vec![Refusal::new("chain", "a key's first block has seq 1")];
        }
    }
    vec![]
}

/// What a node takes of the sealed blocks of a push (`incoming`: sealed messages `{ version, header, header_signature,
/// envelope }`) given what it holds: whole blocks, sealed blocks held by their public header (a block without a `type`), or
/// sealed messages. A header is judged by `judge_header` after the blocks it needs, in rounds, and equivocation works as for
/// `accept`. A header whose hash is held as a whole block is the other half of it: taken when it matches the body (same author,
/// `seq` and `prev`), refused (`bad_hash`) when it does not. A header already held is nothing new.
pub fn accept_sealed(incoming: &[Value], held: &[Value], arrived_at: ArrivedAt) -> Accepted {
    let normal = normalised(held);
    let mut known = crate::js::held_index(normal.iter());
    let mut out_early = Accepted::default();
    let mut pending: Vec<Value> = Vec::new();
    for message in incoming {
        let Some(entry) = header_entry(message) else {
            out_early.refused.push(Refused { hash: String::new(), code: "shape".into(), detail: "a sealed block is { version, header, header_signature, envelope }".into() });
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
    let mut out = take_in(pending, &mut known, &|entry, known| judge_header(entry, known, arrived_at));
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

/// A node's signed answer to a push, from its parts `{ taken, waiting, refused, equivocations }` (each taken or waiting
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
    let answer = json!({
        "node": node,
        "taken": items("taken").iter().map(hash_or_self).collect::<Vec<_>>(),
        "waiting": items("waiting").iter().map(hash_or_self).collect::<Vec<_>>(),
        "refused": items("refused").iter().map(|r| json!({ "hash": field(r, "hash"), "code": field(r, "code"), "detail": field(r, "detail") })).collect::<Vec<_>>(),
        "equivocations": items("equivocations").iter().map(|pair| {
            let mut p: Vec<Value> = pair.as_array().cloned().unwrap_or_default();
            p.sort_by(|a, b| crate::js::text(Some(a)).cmp(&crate::js::text(Some(b))));
            Value::Array(p)
        }).collect::<Vec<_>>(),
    });
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
        "endpoints": Value::Object(keys.iter().map(|k| (k.clone(), endpoints.get(k).cloned().filter(|v| truthy(Some(v))).unwrap_or(Value::Null))).collect()),
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
                crate::js::text_or_empty(doc.get(&k))
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
