//! Between nodes (protocol.md §10, Encoding: Messages): Pull and Push. Pull asks for the blocks the asker may see
//! since the responder's arrival number (never a time); `heads: true` returns only the heads among the matches. A
//! signed pull (or push) names its signer, the node it is for, a fresh nonce and `at`. A node takes blocks
//! signed by a live key of their author that pass the write check, holds back (waiting) those whose prev it lacks,
//! lists the second of two blocks at one seq beside the first (`equivocations`), and refuses the rest, each
//! `{ hash, code, detail }` with a code from protocol.json's `refusals.codes`. Every node answer is signed by the node
//! (invariant 18).
use crate::canonical::canonical_json;
use crate::check::{ordered, refusals, CheckOptions};
use crate::error::{Refusal, Result};
use crate::identity::{
    history_counts_in, is_16_genesis, is_genesis, key_timeline_in, signed_by_author_in, signer_of,
    ArrivedAt,
};
use crate::js::{hash_of, index_of, int, list, rf, rs, ss, st, truthy, type_of, Index};
use crate::order::causal_order;
use crate::prelude::*;
use crate::read::read_as;
use crate::sign::{sign_message, verify_message};
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

/// Who signs a request, for whom, and with what freshness.
pub struct Signer<'a> {
    /// The signer's id.
    pub who: &'a str,
    /// The node the request is for.
    pub node: &'a str,
    pub private_key: &'a str,
    /// 16 random bytes, hex (fresh when None, std only).
    pub nonce: Option<String>,
    /// When it is sent (now when None, std only).
    pub at: Option<String>,
}

fn stamp(mut message: Value, role: &str, signer: &Signer) -> Result<Value> {
    let nonce = match &signer.nonce {
        Some(n) => n.clone(),
        None => crate::audience::try_new_salt()?,
    };
    let at = match &signer.at {
        Some(a) => a.clone(),
        #[cfg(feature = "std")]
        None => crate::time::now(),
        #[cfg(not(feature = "std"))]
        None => {
            return Err(crate::Error::new(
                "sync: this build has no clock; give `at`",
            ))
        }
    };
    message[role] = json!(signer.who);
    message["node"] = json!(signer.node);
    message["nonce"] = json!(nonce);
    message["at"] = json!(at);
    sign_message(&message, signer.private_key)
}

/// A signed pull: the request, plus signer, node, a fresh nonce and at, signed by one of the signer's keys.
pub fn sign_pull(request: &Value, signer: &Signer) -> Result<Value> {
    stamp(pull_request(request), "signer", signer)
}

/// What a node checks of a signed request.
pub struct Freshness<'a> {
    /// This node's id.
    pub node: &'a str,
    /// This node's clock.
    pub now: &'a str,
    /// The signer's live signing keys.
    pub keys: &'a [String],
    /// Whether this node has seen the nonce.
    pub seen: &'a dyn Fn(&str) -> bool,
    /// How far `at` may be from this node's clock, in ms: protocol.json `limits.signed_window` ([`signed_window_ms`]).
    pub window_ms: i64,
}

/// How far a signed message's `at` may be from the node's clock, either way, in ms (protocol.json
/// `limits.signed_window`, PT5M): the window a [`Freshness`] gives unless the node chooses its own.
pub fn signed_window_ms() -> i64 {
    let base = "2000-01-01T00:00:00.000Z";
    crate::time::add_duration(base, &crate::spec().signed_window, 1)
        .and_then(|t| crate::time::parse(&t))
        .zip(crate::time::parse(base))
        .map(|(a, b)| a - b)
        .unwrap_or(0)
}

/// Why a node refuses a signed message (`fields`: the protocol.json list of its keys, a pull's or a push's), for the
/// node whose clock reads `now`: `[{ code, detail }]` with codes from protocol.json's `refusals.codes.message`, empty
/// when it may be answered.
pub fn message_refusals(message: &Value, fields: &str, f: &Freshness) -> Vec<Refusal> {
    let allowed = crate::spec().list(fields);
    let sp = crate::spec();
    let mut wrong = Vec::new();
    // Older names (`asker`, `pusher`) are read as `signer`; the signature below still covers the bytes as sent.
    let kind = fields.rsplit('.').next().unwrap_or(fields);
    let read = crate::read::read_message(kind, message);
    if !read
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
    match message
        .get("nonce")
        .and_then(Value::as_str)
        .filter(|n| sp.is("nonce", n))
    {
        Some(n) if (f.seen)(n) => {
            wrong.push(Refusal::new("replay", "this nonce was seen: a replay"))
        }
        Some(_) => {}
        None => wrong.push(Refusal::new(
            "replay",
            "a signed message carries a fresh nonce",
        )),
    }
    let at = message
        .get("at")
        .and_then(Value::as_str)
        .filter(|a| sp.is("time", a))
        .and_then(crate::time::parse);
    let fresh = matches!((at, crate::time::parse(f.now)), (Some(a), Some(n)) if (a - n).abs() <= f.window_ms);
    if !fresh {
        wrong.push(Refusal::new(
            "window",
            "its at is outside this node's window",
        ));
    }
    if !f.keys.iter().any(|k| verify_message(message, k)) {
        wrong.push(Refusal::new(
            "bad_signature",
            "it is not signed by its signer",
        ));
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

/// Whether a block matches a pull filter (every key, ANDed; `type` read through aliases). `held` resolves records.
pub fn matches(block: &Value, filter: &Value, held: &Index) -> bool {
    let Some(f) = filter.as_object().filter(|f| !f.is_empty()) else {
        return true;
    };
    let read = read_as(block);
    if f.get("type").is_some_and(|t| Some(t) != read.get("type")) {
        return false;
    }
    if f.get("kind").is_some_and(|k| Some(k) != st(&read, "kind")) {
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
    match f.get("refs") {
        Some(Value::Object(refs)) => refs
            .iter()
            .all(|(k, h)| h.as_str().is_some_and(|h| list(rf(&read, k)).contains(&h))),
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
) -> Result<Value> {
    let since = request.get("since").and_then(Value::as_f64).unwrap_or(0.0) as u64;
    let limit = request
        .get("limit")
        .and_then(Value::as_f64)
        .map(|l| l as u64)
        .filter(|l| *l > 0)
        .unwrap_or(cap)
        .min(cap);
    let read_request = crate::read::read_message("signed_pull", request);
    let asker = asker.or_else(|| read_request.get("signer").and_then(Value::as_str));
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
        "next": found.last().map(|e| e.n).unwrap_or(since),
    });
    match private_key {
        Some(k) => sign_message(&answer, k),
        None => Ok(answer),
    }
}

/// Whether a node's answer (pull or push) is signed by one of the node's keys (any live key of its holder).
pub fn answer_signed_by(answer: &Value, node_keys: &[String]) -> bool {
    node_keys.iter().any(|k| verify_message(answer, k))
}

// ---- Push ----
/// Who a sealed copy is for: `for` maps its hash to a list of ids. An older single id (a string) reads as a list
/// of one.
pub fn recipients_of(for_whom: &Value, hash: &str) -> Vec<String> {
    match for_whom.get(hash) {
        Some(Value::Array(a)) => a.iter().filter_map(|i| i.as_str().map(String::from)).collect(),
        Some(Value::String(s)) if !s.is_empty() => vec![s.clone()],
        _ => vec![],
    }
}

/// A push: `{ messages, for }`, `for` optional (`{ hash: [id] }`, a list of ids per sealed copy; a single id is read
/// as a list of one).
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

/// A signed push: the push, plus signer, node, a fresh nonce and at, signed by one of the signer's keys.
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

/// What a node takes of a push (`incoming`, blocks off the wire) given what it holds. A block without seq is taken only
/// as history: an older identity's, while its history is open or inside its closed history (a grant or an answer
/// there stands). A 1.6 block passes the write check and is signed by a key of its author that speaks for it
/// (`bad_signature` when no key of the author opens it, `void_key` when one does but does not speak); one whose key's
/// previous block is not held waits. The second of two blocks from one key at one seq is neither taken nor refused:
/// the pair is listed in `equivocations` (sorted), and the node keeps both as proof.
pub fn accept(
    incoming: &[Value],
    held: &[Value],
    arrived_at: ArrivedAt,
    schemas: Option<&Index>,
) -> Accepted {
    let known = index_of(held.iter().chain(incoming));
    let mut out = Accepted::default();
    let mut slots: Vec<(String, String)> = Vec::new();
    let slot = |block: &Value| -> Option<String> {
        let author = rs(block, "author")?;
        let key = signer_of(block, &key_timeline_in(author, &known, None))?;
        Some(format!(
            "{author} {key} {}",
            crate::js::text(st(block, "seq"))
        ))
    };
    for block in held {
        if int(st(block, "seq")).is_some() && truthy(rf(block, "author")) {
            if let Some(at) = slot(block) {
                slots.push((at, hash_of(block).to_string()));
            }
        }
    }
    // Not the author's: no key of the author opens it (bad_signature), or one does but does not speak for it
    // (void_key), the recovery key included. A genesis is signed by its own key.
    let unsigned = |block: &Value| -> (&'static str, &'static str) {
        if is_genesis(block) {
            return ("bad_genesis", "a genesis is signed by its own key");
        }
        let author = rs(block, "author").unwrap_or("");
        let opened = signer_of(block, &key_timeline_in(author, &known, None)).is_some()
            || ss(block, "recovery_key").is_some_and(|r| crate::identity::opens(block, r));
        let keys = key_timeline_in(author, &known, None);
        if !opened && keys.iter().any(|k| !crate::sign::knows_sign_alg(&k.alg)) {
            (
                "unknown_alg",
                "its author has a key that names a signing algorithm this reader does not know",
            )
        } else if opened {
            ("void_key", "signed by a key of its author that does not speak for it: void, frozen, or rotated past counted_to")
        } else {
            (
                "bad_signature",
                "its signature opens with no key of its author",
            )
        }
    };
    for block in causal_order(incoming) {
        let h = hash_of(&block).to_string();
        let mut refuse = |code: &str, detail: &str| {
            out.refused.push(Refused {
                hash: h.clone(),
                code: code.to_string(),
                detail: detail.to_string(),
            })
        };
        if !is_genesis(&block) && st(&block, "seq").is_none() {
            let root = rs(&block, "author").and_then(|a| known.get(a));
            if root.is_some_and(is_16_genesis) {
                refuse(
                    "no_history",
                    "a 1.6 identity has no history: a block without seq is refused",
                );
                continue;
            }
            if let Some(r) = root {
                if !history_counts_in(&block, hash_of(r), &known) {
                    refuse("history_closed", "history is closed: it is in neither the first 1.6 block's causal past nor its manifest");
                    continue;
                }
            }
            if !signed_by_author_in(&block, &known, arrived_at) {
                let (code, detail) = unsigned(&block);
                refuse(code, detail);
                continue;
            }
            out.taken.push(block);
            continue;
        }
        let empty = Value::Null;
        let wrong = refusals(
            type_of(&block),
            block.get("state").unwrap_or(&empty),
            block.get("refs").unwrap_or(&empty),
            CheckOptions {
                schemas,
                held: None,
            },
        );
        if !wrong.is_empty() {
            for one in &wrong {
                refuse(&one.code, &one.detail);
            }
            continue;
        }
        if let Some(prev) =
            rs(&block, "prev").filter(|p| !is_genesis(&block) && !known.contains_key(*p))
        {
            out.waiting.push((h.clone(), vec![prev.to_string()]));
            continue;
        }
        if !signed_by_author_in(&block, &known, arrived_at) {
            let (code, detail) = unsigned(&block);
            refuse(code, detail);
            continue;
        }
        if type_of(&block) == "grant"
            && ss(&block, "kind") == Some("key")
            && truthy(st(&block, "replaces"))
            && !truthy(st(&block, "recovery_key"))
        {
            let author = rs(&block, "author").unwrap_or("");
            if signer_of(&block, &key_timeline_in(author, &known, None)).as_deref()
                != ss(&block, "replaces")
            {
                refuse(
                    "not_own_rotation",
                    "a key is rotated only by itself or by the recovery key",
                );
                continue;
            }
        }
        let at = if int(st(&block, "seq")).is_some() {
            slot(&block)
        } else {
            None
        };
        if let Some(at) = &at {
            if let Some((_, other)) = slots.iter().find(|(s, _)| s == at) {
                if *other != h {
                    // The second of a pair: neither taken nor refused, listed with the first.
                    let mut pair = [other.clone(), h.clone()];
                    pair.sort();
                    out.equivocations.push(pair);
                    continue;
                }
            }
            slots.push((at.clone(), h.clone()));
        }
        out.taken.push(block);
    }
    out
}

/// A node's signed answer to a push (signed by a key of its holder, a person or a machine, brought in by a key grant):
/// `{ node, taken, waiting, refused: [{ hash, code, detail }], equivocations: [[hash, hash]], signature }`. Every key is
/// always there; an empty list is []. Each pair is sorted as text.
pub fn push_answer(accepted: &Accepted, node: &str, private_key: &str) -> Result<Value> {
    push_answer_of(&accepted.to_json(), node, private_key)
}

/// A node's signed answer to a push, from its parts `{ taken, waiting, refused, equivocations }` (each taken or waiting
/// entry a hash or `{ hash, ... }`, each refusal `{ hash, code, detail }`; a part left out is empty).
pub fn push_answer_of(parts: &Value, node: &str, private_key: &str) -> Result<Value> {
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
    sign_message(
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
    let is_hash = |v: Option<&Value>| v.and_then(Value::as_str).is_some_and(|h| sp.is("hash", h));
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
