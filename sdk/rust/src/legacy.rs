//! The one-time converter (spec/legacy/converter.md). NOT part of the protocol: no node reads an older shape. A person
//! runs this on their own old blocks (0.x to 1.5) and gets fresh 1.6 blocks, signed by the owner's or custodian's key
//! they give, each carrying `refs.derives_from` the old hash. It never edits an old block. The tables it reads are
//! `spec/legacy/aliases-0.x.json` (type names, field moves and ref renames; its own `$comment` is the algorithm).
//!
//! Steps (converter.md): 1 group by owner; 2 a new genesis per identity; 3 reshape (the table, then the final
//! steps); 4 rewrite refs to the new ids, in causal order; 5 chain each owner's blocks anew; 6 time (`at` is the
//! conversion time, the old time goes in `when`); 7 link back (`derives_from`); 8 sign; 9 the map `old -> new`
//! (running again with the same map adds only what is new).
use crate::block::{create_in, hash_hex};
use crate::canonical::{js_number, nfc};
use crate::error::Result;
use crate::js::{get, hash_of, index_of, list, rf, rs, ss, st, strict_eq, text, truthy, type_of};
use crate::prelude::*;
use crate::sign::{sign_in, Keypair};

/// aliases-0.x.json, built in (a synced copy of spec/legacy/aliases-0.x.json).
pub const ALIASES_JSON: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/aliases-0.x.json"));

/// The 1.6 types (a type name the table maps to is one of these).
const TYPES: [&str; 7] = ["actor", "thing", "observe", "transform", "transfer", "promise", "grant"];

// ---- The old id: the hash of the old canonical form (nulls dropped, string sets under refs sorted, NFC) ----
fn old_value(out: &mut String, value: &Value, in_refs: bool) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => {
            out.push_str(if *b { "true" } else { "false" });
            true
        }
        Value::Number(n) => {
            out.push_str(&js_number(n.as_f64().unwrap_or(0.0)));
            true
        }
        Value::String(s) => {
            out.push_str(&Value::String(nfc(s).into_owned()).to_string());
            true
        }
        Value::Array(items) => {
            out.push('[');
            let mut first = true;
            let mut items: Vec<&Value> = items.iter().collect();
            if in_refs && items.iter().all(|i| i.is_string()) {
                items.sort_by(|a, b| crate::js::cmp16(a.as_str().unwrap(), b.as_str().unwrap()));
            }
            for item in items {
                let mut part = String::new();
                if old_value(&mut part, item, in_refs) {
                    if !first {
                        out.push(',');
                    }
                    first = false;
                    out.push_str(&part);
                }
            }
            out.push(']');
            true
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| crate::js::cmp16(a, b));
            out.push('{');
            let mut first = true;
            for key in keys {
                let mut part = String::new();
                if old_value(&mut part, &map[key.as_str()], in_refs || key == "refs") {
                    if !first {
                        out.push(',');
                    }
                    first = false;
                    out.push_str(&Value::String(nfc(key).into_owned()).to_string());
                    out.push(':');
                    out.push_str(&part);
                }
            }
            out.push('}');
            true
        }
    }
}

/// The id an old block had: SHA-256 of its old canonical form.
pub fn old_hash(block: &Value) -> String {
    let mut out = String::new();
    let wrapped = json!({ "type": block.get("type"), "state": block.get("state"), "refs": block.get("refs") });
    old_value(&mut out, &wrapped, false);
    hash_hex(&out)
}

// ---- The table (aliases-0.x.json) ----
fn type_alias(aliases: &Value, name: &str) -> Option<Map<String, Value>> {
    let types = aliases.get("types");
    if TYPES.contains(&name) {
        return Some(json!({ "type": name }).as_object().unwrap().clone());
    }
    if let Some(Value::Object(alias)) = types.and_then(|t| t.get(name)) {
        return Some(alias.clone());
    }
    let mut parts = name.split('.');
    let base = parts.next().unwrap_or("");
    let rest: Vec<&str> = parts.collect();
    let as_base = if TYPES.contains(&base) {
        Some(json!({ "type": base }).as_object().unwrap().clone())
    } else {
        types.and_then(|t| t.get(base)).and_then(Value::as_object).cloned()
    };
    if let Some(mut alias) = as_base {
        if !truthy(alias.get("retired")) && !rest.is_empty() {
            alias.insert("kind".into(), Value::String(rest.join(".")));
            return Some(alias);
        }
    }
    None
}

fn holds(read: &Value, when: Option<&Value>) -> bool {
    let Some(Value::Object(when)) = when else { return true };
    when.iter().all(|(path, value)| {
        let at = get(read, path);
        match value {
            Value::String(s) if s == "*" => at.is_some_and(|v| !v.is_null()),
            Value::Null => at.is_none_or(Value::is_null),
            other => strict_eq(at, Some(other)),
        }
    })
}

fn put(read: &mut Value, path: &str, value: Value, force: bool) {
    let keys: Vec<&str> = path.split('.').collect();
    let (last, parents) = keys.split_last().unwrap();
    let mut node = read;
    for key in parents {
        let map = node.as_object_mut().unwrap();
        let entry = map.entry(key.to_string()).or_insert(Value::Null);
        if !entry.is_object() {
            *entry = json!({});
        }
        node = entry;
    }
    let map = node.as_object_mut().unwrap();
    if force || !map.contains_key(*last) {
        map.insert(last.to_string(), value);
    }
}

fn remove(read: &mut Value, path: &str) {
    let keys: Vec<&str> = path.split('.').collect();
    let (last, parents) = keys.split_last().unwrap();
    let mut node = read;
    for key in parents {
        match node.get_mut(*key) {
            Some(next) => node = next,
            None => return,
        }
    }
    if let Value::Object(map) = node {
        map.shift_remove(*last);
    }
}

fn entries(rule: &Value, key: &str) -> Vec<(String, Value)> {
    match rule.get(key) {
        Some(Value::Object(m)) => m.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        _ => Vec::new(),
    }
}

fn apply(read: &mut Value, rule: &Value) {
    let force = truthy(rule.get("force"));
    for (from, to) in entries(rule, "refs") {
        let value = read["refs"].as_object_mut().and_then(|r| r.shift_remove(&from));
        if let Some(value) = value {
            put(read, &format!("refs.{}", text(Some(&to))), value, force);
        }
    }
    for (from, to) in entries(rule, "move") {
        if let Some(value) = get(read, &from).cloned() {
            remove(read, &from);
            put(read, &text(Some(&to)), value, force);
        }
    }
    for (to, from) in entries(rule, "copy") {
        if let Some(value) = get(read, &text(Some(&from))).cloned() {
            put(read, &to, value, force);
        }
    }
    for (to, from) in entries(rule, "join") {
        let parts: Vec<String> = from
            .as_array()
            .map(|paths| {
                paths
                    .iter()
                    .filter_map(|p| get(read, &text(Some(p))).filter(|v| !v.is_null()))
                    .map(|v| text(Some(v)))
                    .collect()
            })
            .unwrap_or_default();
        if !parts.is_empty() {
            put(read, &to, Value::String(parts.join(".")), true);
        }
    }
    if let Some(Value::Array(paths)) = rule.get("drop") {
        for path in paths {
            remove(read, &text(Some(path)));
        }
    }
    for (path, value) in entries(rule, "set") {
        put(read, &path, value, force);
    }
    if let Some(t) = rule.get("type").filter(|v| truthy(Some(v))) {
        read["type"] = t.clone();
    }
    if let Some(k) = rule.get("kind").filter(|v| truthy(Some(v))) {
        read["state"]["kind"] = k.clone();
    }
}

fn type_kind(read: &Value) -> String {
    format!("{}.{}", type_of(read), text(st(read, "kind")))
}

/// An old block read through the table as 1.5-shaped `{ type, state, refs }`; `None` when its type is retired (it
/// is no longer protocol: the converter leaves it as an archive).
pub fn read_old(aliases: &Value, block: &Value) -> Option<Value> {
    let alias = type_alias(aliases, type_of(block))?;
    if truthy(alias.get("retired")) {
        return None;
    }
    let mut defaults = alias.clone();
    let new_type = defaults.shift_remove("type").unwrap_or(Value::Null);
    let renamed = defaults.shift_remove("fields");
    defaults.shift_remove("retired");
    defaults.shift_remove("outside");
    let mut state = block.get("state").and_then(Value::as_object).cloned().unwrap_or_default();
    if let Some(Value::Object(renamed)) = renamed {
        for (from, to) in renamed {
            if let Some(v) = state.shift_remove(&from) {
                state.insert(text(Some(&to)), v);
            }
        }
    }
    let mut merged = defaults;
    for (k, v) in state {
        merged.insert(k, v);
    }
    let refs = block.get("refs").and_then(Value::as_object).cloned().unwrap_or_default();
    let mut read = json!({ "type": new_type, "state": merged, "refs": refs });
    let mut seen: Vec<String> = Vec::new();
    while !seen.contains(&type_kind(&read)) {
        seen.push(type_kind(&read));
        let shapes = aliases.get("shapes");
        let rows = |key: &str| shapes.and_then(|s| s.get(key)).and_then(Value::as_array).cloned().unwrap_or_default();
        let mut rules = rows(&type_kind(&read));
        rules.extend(rows(type_of(&read)));
        rules.extend(rows("*"));
        for rule in rules {
            if holds(&read, rule.get("when")) {
                apply(&mut read, &rule);
            }
        }
    }
    let outside = aliases.get("outside").and_then(Value::as_str).unwrap_or("");
    let mut refs = Map::new();
    if let Some(Value::Object(read_refs)) = read.get("refs") {
        for (old, value) in read_refs {
            let role = aliases
                .get("refs")
                .and_then(|r| r.get(old))
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .unwrap_or(old);
            match value {
                // A ref naming someone with no record is an open side: it is left out.
                Value::String(s) if !outside.is_empty() && s.starts_with(outside) => {}
                _ => {
                    refs.insert(role.to_string(), value.clone());
                }
            }
        }
    }
    read["refs"] = Value::Object(refs);
    Some(read)
}

// ---- The final steps (converter.md step 3) ----
// Nulls dropped, floats to decimal strings or integers, strings and keys in NFC, string sets under refs sorted.
fn tidy(value: &Value, in_refs_top: bool) -> Option<Value> {
    Some(match value {
        Value::Null => return None,
        Value::Bool(b) => Value::Bool(*b),
        Value::Number(n) => {
            let x = n.as_f64().unwrap_or(0.0);
            if crate::js::is_whole(x) && x.abs() <= 9007199254740991.0 {
                crate::js::num(x)
            } else {
                Value::String(js_number(x))
            }
        }
        Value::String(s) => Value::String(nfc(s).into_owned()),
        Value::Array(items) => {
            let mut out: Vec<Value> = items.iter().filter_map(|i| tidy(i, false)).collect();
            if in_refs_top && out.iter().all(Value::is_string) {
                let set = crate::js::sorted_set(out.iter().filter_map(Value::as_str));
                out = set.into_iter().map(Value::String).collect();
            }
            Value::Array(out)
        }
        Value::Object(map) => Value::Object(
            map.iter()
                .filter_map(|(k, v)| tidy(v, false).map(|t| (nfc(k).into_owned(), t)))
                .collect(),
        ),
    })
}

fn tidy_refs(refs: &Value) -> Value {
    let mut out = Map::new();
    if let Some(m) = refs.as_object() {
        for (k, v) in m {
            if let Some(t) = tidy(v, true) {
                out.insert(nfc(k).into_owned(), t);
            }
        }
    }
    Value::Object(out)
}

fn suite_for(alg: &str) -> Option<&'static str> {
    match alg {
        "ed25519" | "x25519" | "" => None,
        "ecdsa-p256-sha256" | "p256" | "ecdh-p256" => Some("p256"),
        "sm2-sm3" | "sm2" | "ecdh-sm2" => Some("sm"),
        _ => None,
    }
}

/// The final steps on a block already read through the table: refs.kind to refs.of, state.sequencer to state.orderer,
/// the alg fields to suite and recovery_suite, dkim and manifest dropped, then the clean-up that strict writing needs.
pub fn reshape(read: &Value) -> Value {
    let mut state = read.get("state").and_then(Value::as_object).cloned().unwrap_or_default();
    let mut refs = read.get("refs").and_then(Value::as_object).cloned().unwrap_or_default();
    if let Some(v) = refs.shift_remove("kind") {
        refs.entry("of".to_string()).or_insert(v);
    }
    if let Some(v) = state.shift_remove("sequencer") {
        state.entry("orderer".to_string()).or_insert(v);
    }
    if let Some(a) = state.shift_remove("alg_sign") {
        if let Some(s) = suite_for(a.as_str().unwrap_or("")) {
            state.insert("suite".into(), json!(s));
        }
    }
    state.shift_remove("alg_encrypt");
    if let Some(a) = state.shift_remove("alg_recovery") {
        if let Some(s) = suite_for(a.as_str().unwrap_or("")) {
            state.insert("recovery_suite".into(), json!(s));
        }
    }
    for gone in ["dkim", "manifest", "signers"] {
        state.shift_remove(gone);
    }
    json!({
        "type": read.get("type"),
        "state": tidy(&Value::Object(state), false).unwrap_or_else(|| json!({})),
        "refs": tidy_refs(&Value::Object(refs)),
    })
}

/// What a person gives the converter.
#[derive(Default)]
pub struct ConvertOptions {
    /// The key that signs for each old identity, by the old genesis hash: `{ public_key_sign, private_key, suite? }`.
    /// An identity with no key here is not converted.
    pub keys: Map<String, Value>,
    /// The conversion time, UTC (`state.at` of every new block).
    pub at: String,
    /// The map written by an earlier run, `old -> new`.
    pub map: Map<String, Value>,
    /// The new blocks an earlier run wrote (to continue each chain).
    pub existing: Vec<Value>,
    /// A custodian signing for the owners: its channel, and the hash of the raw request that asked for the batch.
    pub channel: String,
    pub request_hash: String,
    /// The recovery keys' public signing keys, by old genesis hash, for an identity that had one (only its hash is
    /// carried: it is copied from the old genesis when it has one).
    pub aliases: Option<Value>,
}

/// What a run made.
pub struct Converted {
    /// The new blocks, signed, in the order written (every genesis first).
    pub blocks: Vec<Value>,
    /// `old -> new`, this run and the earlier ones.
    pub map: Map<String, Value>,
    /// Old blocks not converted: no key for their author, a retired type, or a chain a gap broke.
    pub skipped: Vec<(String, String)>,
}

fn causal(blocks: &[Value]) -> Vec<Value> {
    // Causes first: the old blocks' refs name older blocks. The order among unrelated blocks is by old hash.
    let index = index_of(blocks.iter());
    crate::order::causal_order_in(&index)
}

/// Convert old blocks into fresh 1.6 blocks (see the module docs). `old` carries each block's `hash` when it has one.
pub fn convert(old: &[Value], options: &ConvertOptions) -> Result<Converted> {
    let aliases: Value = match &options.aliases {
        Some(a) => a.clone(),
        None => serde_json::from_slice(ALIASES_JSON)?,
    };
    // Each old block with its old id.
    let olds: Vec<Value> = old
        .iter()
        .map(|b| {
            let mut b = b.clone();
            if hash_of(&b).is_empty() {
                let h = old_hash(&b);
                b["hash"] = json!(h);
            }
            b
        })
        .collect();
    let mut map = options.map.clone();
    let mut out: Vec<Value> = Vec::new();
    let mut skipped: Vec<(String, String)> = Vec::new();
    let existing = index_of(options.existing.iter());
    // Roles each old circle's members were given, for the circle's new roles list.
    let mut circle_roles: Map<String, Value> = Map::new();
    for b in &olds {
        if let Some(read) = read_old(&aliases, b) {
            if type_of(&read) == "grant" && ss(&read, "kind") == Some("member") {
                if let Some(circle) = rs(&read, "subject") {
                    let slot = circle_roles.entry(circle.to_string()).or_insert_with(|| json!([]));
                    for r in list(st(&read, "roles")) {
                        if !slot.as_array().unwrap().iter().any(|x| x.as_str() == Some(r)) {
                            slot.as_array_mut().unwrap().push(json!(r));
                        }
                    }
                }
            }
        }
    }
    // Step 2: a new genesis per identity that has a key.
    let mut identities: Vec<String> = Vec::new();
    for b in &olds {
        let id = rs(b, "author").map(String::from).unwrap_or_else(|| hash_of(b).to_string());
        if options.keys.contains_key(&id) && !identities.contains(&id) {
            identities.push(id);
        }
    }
    identities.sort();
    let mut heads: Map<String, Value> = Map::new(); // old identity -> { id (new), key, last (block) }
    for id in &identities {
        let k = options.keys.get(id).unwrap();
        let pair = Keypair {
            suite: text(k.get("suite")).replace("undefined", ""),
            public_key_sign: text(k.get("public_key_sign")),
            private_key: text(k.get("private_key")),
        };
        let suite = if pair.suite.is_empty() { "std".to_string() } else { pair.suite.clone() };
        let new_id = match map.get(id).and_then(Value::as_str) {
            Some(n) => n.to_string(),
            None => {
                let old_genesis = olds.iter().find(|b| hash_of(b) == id);
                let read = old_genesis.and_then(|b| read_old(&aliases, b));
                let kind = read.as_ref().and_then(|r| ss(r, "kind")).unwrap_or("person").to_string();
                let mut state = json!({
                    "kind": kind, "at": options.at, "audience": "public", "public_key_sign": pair.public_key_sign,
                });
                if suite != "std" {
                    state["suite"] = json!(suite);
                }
                if let Some(e) = read.as_ref().and_then(|r| ss(r, "public_key_encrypt")) {
                    state["public_key_encrypt"] = json!(e);
                }
                // The old recovery key's hash and reach are carried as a pair; one without the other is dropped.
                if let Some(r) = read.as_ref() {
                    if let (Some(h), Some(reach)) = (ss(r, "recovery_key_hash"), ss(r, "recovery_reach")) {
                        state["recovery_key_hash"] = json!(h);
                        state["recovery_reach"] = json!(reach);
                    }
                }
                let block = create_in(&suite, "actor", &state, &json!({}))?;
                let mut signed = block.clone();
                signed["signature"] = json!(sign_in(&suite, &block, &pair.private_key)?);
                let n = hash_of(&signed).to_string();
                map.insert(id.clone(), json!(n));
                out.push(signed);
                // The link back: a genesis has no refs, so the old identity is named by the first block of the new
                // chain, an `observe` of kind `converted` the owner (or custodian) signs, `derives_from` the old hash.
                let link = crate::chain::next_link(None, Some(&n))?;
                let mut from = vec![id.clone()];
                if !options.request_hash.is_empty() {
                    from.push(options.request_hash.clone());
                }
                let mut note = json!({
                    "kind": "converted", "at": options.at, "seq": link.seq, "audience": "public",
                });
                if !options.channel.is_empty() {
                    note["channel"] = json!(options.channel);
                }
                let refs = json!({
                    "author": n, "prev": link.prev, "subject": n, "derives_from": crate::js::sorted_set(from),
                });
                let block = create_in(&suite, "observe", &note, &refs)?;
                let mut signed = block.clone();
                signed["signature"] = json!(sign_in(&suite, &block, &pair.private_key)?);
                out.push(signed);
                n
            }
        };
        // Where this identity's chain stands: the last block an earlier run wrote.
        let mut last: Option<Value> = existing
            .values()
            .filter(|b| rs(b, "author") == Some(new_id.as_str()) && st(b, "seq").is_some())
            .max_by_key(|b| crate::js::number_of(st(b, "seq")) as i64)
            .cloned();
        if last.is_none() {
            last = out.iter().rev().find(|b| rs(b, "author") == Some(new_id.as_str())).cloned();
        }
        heads.insert(id.clone(), json!({ "id": new_id, "last": last, "genesis": new_id }));
    }
    // Steps 3 to 8, in causal order.
    for b in causal(&olds) {
        let old_id = hash_of(&b).to_string();
        let author_old = rs(&b, "author").map(String::from).unwrap_or_else(|| old_id.clone());
        let is_genesis = type_of(&b) == "actor" && rs(&b, "author").is_none() && identities.contains(&old_id);
        if map.contains_key(&old_id) || (is_genesis && heads.contains_key(&old_id)) {
            continue;
        }
        let Some(head) = heads.get(&author_old).cloned() else {
            skipped.push((old_id, "no key was given for its author".into()));
            continue;
        };
        let Some(read) = read_old(&aliases, &b) else {
            skipped.push((old_id, "its type is retired".into()));
            continue;
        };
        let mut shaped = reshape(&read);
        // Roles: a circle lists its roles as data; `admin` holds the three powers.
        if type_of(&shaped) == "actor" && ss(&shaped, "kind") == Some("circle") {
            let named: Vec<String> = circle_roles
                .get(&old_id)
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let signers: Vec<String> = list(st(&read, "signers")).iter().map(|s| s.to_string()).collect();
            let mut roles = vec![json!({ "name": "admin", "powers": ["sign", "admit", "remove"] })];
            for r in named.iter().chain(signers.iter()) {
                if r != "admin" && !roles.iter().any(|x| x["name"] == json!(r)) {
                    let powers: Vec<&str> = if signers.contains(r) { vec!["sign"] } else { vec![] };
                    roles.push(json!({ "name": r, "powers": powers }));
                }
            }
            shaped["state"]["roles"] = json!(roles);
        }
        // Refs: every old id to its new one. A ref to an old block that was not converted stays as it was.
        let mut refs = Map::new();
        for (k, v) in shaped["refs"].as_object().cloned().unwrap_or_default() {
            let swap = |h: &str| map.get(h).and_then(Value::as_str).map(String::from).unwrap_or_else(|| h.to_string());
            let nv = match &v {
                Value::String(s) => json!(swap(s)),
                Value::Array(a) => json!(a.iter().filter_map(Value::as_str).map(swap).collect::<Vec<_>>()),
                other => other.clone(),
            };
            refs.insert(k, nv);
        }
        // Step 5, 7: author, chain, the link back (derives_from the old hash, and the raw request when a custodian signs).
        let new_author = text(head.get("id"));
        let last = head.get("last").filter(|l| l.is_object()).cloned();
        let link = crate::chain::next_link(last.as_ref(), Some(&text(head.get("genesis"))))?;
        refs.insert("author".into(), json!(new_author));
        refs.insert("prev".into(), json!(link.prev));
        let mut from = list(refs.get("derives_from")).iter().map(|s| s.to_string()).collect::<Vec<_>>();
        from.push(old_id.clone());
        if !options.request_hash.is_empty() {
            from.push(options.request_hash.clone());
        }
        refs.insert("derives_from".into(), json!(crate::js::sorted_set(from)));
        // Step 6: at is the conversion time; the old time goes in `when`.
        let mut state = shaped["state"].as_object().cloned().unwrap_or_default();
        if let Some(old_at) = state.shift_remove("at") {
            if crate::time::is_time(Some(&old_at)) {
                state.entry("when".to_string()).or_insert(old_at);
            }
        }
        state.insert("at".into(), json!(options.at));
        state.insert("seq".into(), json!(link.seq));
        state.entry("audience".to_string()).or_insert(json!("public"));
        if !options.channel.is_empty() {
            state.insert("channel".into(), json!(options.channel));
        }
        let key = options.keys.get(&author_old).unwrap();
        let suite = ss(&json!({ "suite": key.get("suite") }), "suite").unwrap_or("std").to_string();
        let block = match create_in(&suite, type_of(&shaped), &Value::Object(state), &Value::Object(refs)) {
            Ok(b) => b,
            Err(e) => {
                skipped.push((old_id, format!("it does not become a 1.6 block: {e}")));
                continue;
            }
        };
        let mut signed = block.clone();
        signed["signature"] = json!(sign_in(&suite, &block, &text(key.get("private_key")))?);
        map.insert(old_id, json!(hash_of(&signed)));
        heads.get_mut(&author_old).unwrap()["last"] = signed.clone();
        out.push(signed);
    }
    Ok(Converted { blocks: out, map, skipped })
}

#[allow(dead_code)]
fn _keep(v: &Value) -> Option<&Value> {
    rf(v, "x")
}
