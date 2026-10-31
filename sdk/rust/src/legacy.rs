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
use crate::js::{get, hash_of, index_of, list, rf, rs, ss, st, type_of};

// Old data was written by JavaScript and is read once, untyped, by JavaScript's rules: what counts as present, how a value turns into
// text, how two values compare. Only the converter reads that way; the protocol's own readings are typed (js.rs).
fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(false),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}
fn strict_eq(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(Value::Null), Some(Value::Null)) => true,
        (Some(Value::Bool(x)), Some(Value::Bool(y))) => x == y,
        (Some(Value::Number(x)), Some(Value::Number(y))) => x.as_f64() == y.as_f64(),
        (Some(Value::String(x)), Some(Value::String(y))) => x == y,
        _ => false,
    }
}
fn number_of(value: Option<&Value>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(b)) => *b as u8 as f64,
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() {
                0.0
            } else if t.bytes().any(|b| b.is_ascii_alphabetic() && b != b'e' && b != b'E') {
                f64::NAN
            } else {
                t.parse::<f64>().unwrap_or(f64::NAN)
            }
        }
        Some(_) => f64::NAN,
    }
}
fn text(value: Option<&Value>) -> String {
    match value {
        None => "undefined".to_string(),
        Some(Value::Null) => "null".to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => crate::canonical::js_number(n.as_f64().unwrap_or(0.0)),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(items)) => items.iter().map(|v| if v.is_null() { String::new() } else { text(Some(v)) }).collect::<Vec<_>>().join(","),
        Some(Value::Object(_)) => "[object Object]".to_string(),
    }
}
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

// ---- Values (converter.md step 3): each old value to its 1.6 grammar, from the protocol's own lists ----
fn to_time(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => crate::time::parse(&s.trim().replacen(' ', "T", 1)).map(crate::time::iso),
        Value::Number(n) => {
            let x = n.as_f64()?;
            // Seconds or milliseconds since the epoch.
            let ms = if x.abs() < 1.0e11 { x * 1000.0 } else { x };
            if ms.is_finite() { Some(crate::time::iso(ms.round() as i64)) } else { None }
        }
        _ => None,
    }
}

fn walk(key: &str, v: &mut Value, times: &[String], dates: &[String]) {
    match v {
        Value::Object(m) => {
            for (k, x) in m.iter_mut() {
                walk(k, x, times, dates);
            }
        }
        Value::Array(a) => {
            for x in a.iter_mut() {
                if x.is_object() {
                    walk(key, x, times, dates);
                }
            }
        }
        Value::String(_) | Value::Number(_) => {
            if times.iter().any(|t| t == key) {
                if let Some(t) = to_time(v) {
                    *v = Value::String(t);
                }
            } else if dates.iter().any(|t| t == key) {
                if let Some(t) = to_time(v) {
                    *v = Value::String(t[..10].to_string());
                }
            }
        }
        _ => {}
    }
}

/// Times and dates to the 1.6 form (the fields `field_shape` marks time and date). Nothing else is given a
/// meaning: an old `confidence` is kept like any undeclared legacy field (converter.md, Nothing is undeclared; decision H4),
/// never as a core-shaped number, for 1.7 has no `confidence` and a one-off has no probability.
fn normalise(state: &mut Map<String, Value>) {
    let spec = crate::spec();
    let (times, dates) = (spec.fields_of("time"), spec.fields_of("date"));
    for (k, v) in state.iter_mut() {
        walk(k, v, &times, &dates);
    }
}

fn suite_for(alg: &str) -> Option<&'static str> {
    match alg {
        "ed25519" | "x25519" | "" => None,
        "ecdsa-p256-sha256" | "p256" | "ecdh-p256" => Some("p256"),
        "sm2-sm3" | "sm2" | "ecdh-sm2" => Some("sm"),
        _ => None,
    }
}

/// The final steps on a block already read through the table: refs.kind to refs.of, state.sequencer dropped (1.7 has no
/// orderer field: who may allocate is handed over by a grant),
/// the alg fields to suite and recovery_suite, dkim and manifest dropped, then the clean-up that strict writing needs.
pub fn reshape(read: &Value) -> Value {
    let mut state = read.get("state").and_then(Value::as_object).cloned().unwrap_or_default();
    let mut refs = read.get("refs").and_then(Value::as_object).cloned().unwrap_or_default();
    if let Some(v) = refs.shift_remove("kind") {
        refs.entry("of".to_string()).or_insert(v);
    }
    state.shift_remove("sequencer");
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
    normalise(&mut state);
    json!({
        "type": read.get("type"),
        "state": tidy(&Value::Object(state), false).unwrap_or_else(|| json!({})),
        "refs": tidy_refs(&Value::Object(refs)),
    })
}

/// What a person gives the converter.
#[derive(Default)]
pub struct ConvertOptions {
    /// The key that signs for each old identity, by the old genesis hash: `{ public_key_sign, private_key, suite?,
    /// custodian?, channel? }`. An identity with no key here is not converted (it is reported in `skipped`). A key with
    /// a `custodian` (an old identity hash that is converted too, or a 1.6 id) is held by that custodian: the new
    /// genesis names it in `state.custodian`, and every block it signs carries `state.channel` (the key's, else
    /// `import`).
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
    /// Schemas already published (things of kind schema, with their `hash`): one that declares what a block needs is
    /// named in the block's `refs.schema` instead of writing a new one.
    pub schemas: Vec<Value>,
    /// The key of a custodian that signs for the identities named in `custodian_for` that have no key of its own (`{ public_key_sign,
    /// private_key, suite?, custodian, channel? }`, `custodian` being the custodian's own identity). Without it such an
    /// identity's blocks are reported in `skipped`.
    pub custodian_key: Option<Value>,
    /// The old identities the custodian's key signs for (`custodian_key` applies to these and to no other).
    pub custodian_for: Vec<String>,
}

/// What a run made.
pub struct Converted {
    /// The new blocks, signed, in the order written (every genesis first).
    pub blocks: Vec<Value>,
    /// `old -> new`, this run and the earlier ones.
    pub map: Map<String, Value>,
    /// Old blocks not converted: no key for their author, a retired type, or a block no 1.6 shape holds.
    pub skipped: Vec<(String, String)>,
    /// For each private block, what each recipient is given: `{ block, to, reveals: [{ salt, value }], sealed }`.
    /// `sealed` is the sealed copy (privacy.md) when the recipient's genesis names an encryption key, else null.
    pub deliveries: Vec<Value>,
}

fn causal(blocks: &[Value]) -> Vec<Value> {
    // Causes first: the old blocks' refs name older blocks. The order among unrelated blocks is by old hash.
    let index = index_of(blocks.iter());
    crate::order::causal_order_in(&index)
}

/// Whether a ref value is an id the protocol can read: a hash in the id grammar whose hash name (the prefix before a
/// colon, if any) is one the protocol knows. `message:<hex>` is not a link to a block.
fn is_ref_value(s: &str) -> bool {
    let spec = crate::spec();
    if !(spec.is("id", s) || spec.is("role_ref", s)) {
        return false;
    }
    match s.split('#').next().unwrap_or("").split_once(':') {
        Some((name, _)) => spec.knows_hash(name),
        None => true,
    }
}

/// The hint a converted schema gives for a field's value: text, integer, boolean, list or object.
fn field_type_of(v: &Value) -> &'static str {
    match v {
        Value::Bool(_) => "boolean",
        Value::Number(_) => "integer",
        Value::Array(_) => "list",
        Value::Object(_) => "object",
        _ => "text",
    }
}

/// An old block ready to become a 1.6 block: its type, state and refs (old ids still in the refs), what a schema
/// must declare for it, or why it cannot be converted.
struct Prepared {
    ty: String,
    state: Map<String, Value>,
    refs: Map<String, Value>,
    /// `type.kind`, or the type: what a schema for it targets.
    target: String,
    /// Fields and roles beyond the protocol's base for this type, to be declared by a schema.
    fields: Vec<(String, String)>,
    roles: Vec<String>,
    skip: Option<String>,
}

/// What the protocol's own check (the checks that read the block alone) finds in a block with these parts, a dummy
/// chain and, when it needs one, a dummy schema declaring exactly its extras.
fn findings_of(ty: &str, state: &Map<String, Value>, refs: &Map<String, Value>, fields: &[(String, String)], roles: &[String]) -> Vec<String> {
    let mut st = state.clone();
    st.insert("seq".into(), json!(1));
    st.insert("at".into(), json!("2026-01-01T00:00:00.000Z"));
    st.insert("audience".into(), json!("public"));
    let mut rf = refs.clone();
    rf.insert("author".into(), json!("0".repeat(64)));
    rf.insert("prev".into(), json!("1".repeat(64)));
    let mut schemas = crate::js::Index::default();
    if !rf.contains_key("schema") && (!fields.is_empty() || !roles.is_empty()) {
        let named = "2".repeat(64);
        let declared: Map<String, Value> = fields.iter().map(|(k, t)| (k.clone(), json!(t))).collect();
        schemas.insert(named.clone(), json!({ "type": "thing", "state": { "kind": "schema", "fields": declared, "roles": roles }, "refs": {} }));
        rf.insert("schema".into(), json!(named));
    }
    crate::check::findings_with(
        crate::spec(),
        ty,
        &Value::Object(st),
        &Value::Object(rf),
        crate::check::CheckOptions { schemas: Some(&schemas), held: None },
    )
    .into_iter()
    .map(|r| r.code)
    .collect()
}

/// Step 3 and the exits for what has no 1.6 home. The block is read through the table and reshaped; a ref that is
/// not an id moves to a `was_<role>` field; whatever its type does not declare is named for a schema (a closed type)
/// or already allowed (an open one); and if the protocol's own check still refuses the block, it becomes an
/// `observe` of kind `legacy` (`state.was` names the old type and kind) that carries everything it held.
fn prepare(read: &Value, circle_roles: &Map<String, Value>, old_id: &str) -> Prepared {
    let mut shaped = reshape(read);
    let mut circle_skip: Option<String> = None;
    if type_of(&shaped) == "actor" && ss(&shaped, "kind") == Some("circle") {
        let named: Vec<String> = circle_roles
            .get(old_id)
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default();
        let signers: Vec<String> = list(st(read, "signers")).iter().map(|s| s.to_string()).collect();
        // Only the roles the old circle's own grants and signers showed. An old `admin` keeps its three powers.
        let mut roles: Vec<Value> = Vec::new();
        for r in named.iter().chain(signers.iter()) {
            if !roles.iter().any(|x| x["name"] == json!(r)) {
                let powers: Vec<&str> = if r == "admin" {
                    vec!["sign", "admit", "remove"]
                } else if signers.contains(r) {
                    vec!["sign"]
                } else {
                    vec![]
                };
                roles.push(json!({ "name": r, "powers": powers }));
            }
        }
        if roles.is_empty() {
            circle_skip = Some("the old circle showed no role: none is made up for it".to_string());
        }
        shaped["state"]["roles"] = json!(roles);
    }
    let mut ty = type_of(&shaped).to_string();
    let mut state = shaped["state"].as_object().cloned().unwrap_or_default();
    let mut refs = shaped["refs"].as_object().cloned().unwrap_or_default();
    // A ref that is not an id (a message, a URL) is not a link: it is kept as text.
    for (k, v) in refs.clone() {
        let not_id = match &v {
            Value::String(s) => !is_ref_value(s),
            Value::Array(a) => a.iter().any(|x| !x.as_str().is_some_and(is_ref_value)),
            _ => false,
        };
        if not_id {
            refs.shift_remove(&k);
            state.insert(format!("was_{k}"), v);
        }
    }
    let target = match state.get("kind").and_then(Value::as_str) {
        Some(k) if !k.is_empty() => format!("{ty}.{k}"),
        _ => ty.clone(),
    };
    let extras = |ty: &str, state: &Map<String, Value>, refs: &Map<String, Value>| -> (Vec<(String, String)>, Vec<String>) {
        if !crate::spec().is_closed(ty) {
            return (Vec::new(), Vec::new());
        }
        let (base_fields, base_roles) = crate::check::base_declared(ty);
        let fields = state.iter().filter(|(k, _)| !base_fields.contains(k)).map(|(k, v)| (k.clone(), field_type_of(v).to_string())).collect();
        let roles = refs.keys().filter(|k| !base_roles.contains(k)).cloned().collect();
        (fields, roles)
    };
    let (mut fields, mut roles) = extras(&ty, &state, &refs);
    let mut skip = circle_skip;
    if skip.is_none() && !findings_of(&ty, &state, &refs, &fields, &roles).is_empty() {
        // No 1.6 shape of this type holds it: it is kept whole as an observe of kind `legacy`.
        state.insert("was".into(), json!(target));
        state.insert("kind".into(), json!("legacy"));
        ty = "observe".into();
        fields = Vec::new();
        roles = Vec::new();
        let again = findings_of(&ty, &state, &refs, &fields, &roles);
        if !again.is_empty() {
            skip = Some(format!("no 1.6 block holds it: {}", again.join(", ")));
        }
    }
    Prepared { ty, state, refs, target, fields, roles, skip }
}

/// A recipient of an old audience as a 1.6 id: the old identity's new id (`circle#role` keeps its role).
fn recipient_id(old: &str, map: &Map<String, Value>) -> Option<String> {
    let (who, role) = match old.split_once('#') {
        Some((w, r)) => (w, Some(r)),
        None => (old, None),
    };
    let new = map
        .get(who)
        .and_then(Value::as_str)
        .map(String::from)
        .or_else(|| map.values().any(|v| v.as_str() == Some(who)).then(|| who.to_string()))?;
    Some(match role {
        Some(r) => format!("{new}#{r}"),
        None => new,
    })
}

/// Who signs, and how the blocks it signs are marked.
struct Signer {
    suite: String,
    private_key: String,
    /// A custodian holds this key: the channel its blocks carry (`state.channel`).
    channel: Option<String>,
}

/// Why a held key cannot be used: a custodian signs only under a channel that was named (options or the key).
fn channel_refused(options: &ConvertOptions, key: &Value) -> Option<String> {
    let custodian = key.get("custodian").is_some_and(|c| !c.is_null());
    let named = key.get("channel").and_then(Value::as_str).is_some_and(|c| !c.is_empty());
    if custodian && options.channel.is_empty() && !named {
        Some("a custodian holds its key and no channel was named".to_string())
    } else {
        None
    }
}

fn signer_of(options: &ConvertOptions, key: &Value) -> Signer {
    let suite = text(key.get("suite")).replace("undefined", "");
    let suite = if suite.is_empty() { "std".to_string() } else { suite };
    let custodian = key.get("custodian").is_some_and(|c| !c.is_null());
    let channel = if !options.channel.is_empty() {
        Some(options.channel.clone())
    } else if custodian {
        Some(key.get("channel").and_then(Value::as_str).unwrap_or_default().to_string())
    } else {
        None
    };
    Signer { suite, private_key: text(key.get("private_key")), channel }
}

/// Write one block into an identity's chain: `author`, `prev`, `seq`, `at` and the channel are put in, the key signs.
#[allow(clippy::too_many_arguments)]
fn emit(
    heads: &mut Map<String, Value>,
    out: &mut Vec<Value>,
    options: &ConvertOptions,
    author_old: &str,
    signer: &Signer,
    ty: &str,
    mut state: Map<String, Value>,
    mut refs: Map<String, Value>,
) -> Result<Value> {
    let head = heads.get(author_old).cloned().unwrap_or(Value::Null);
    let last = head.get("last").filter(|l| l.is_object()).cloned();
    let link = crate::chain::next_link(last.as_ref(), Some(&text(head.get("genesis"))))?;
    refs.insert("author".into(), json!(text(head.get("id"))));
    refs.insert("prev".into(), json!(link.prev));
    state.insert("at".into(), json!(options.at));
    state.insert("seq".into(), json!(link.seq));
    // A block that named no audience is for its author alone; nothing makes it public.
    if !state.contains_key("audience") {
        let id = text(head.get("id"));
        let aud = crate::audience::commit_in(&signer.suite, &[id.as_str()], &json!({}))?;
        state.insert("audience".into(), json!(aud.audience));
        state.insert("nonce".into(), json!(crate::audience::try_new_salt()?));
    }
    if let Some(c) = &signer.channel {
        state.insert("channel".into(), json!(c));
    }
    let block = create_in(&signer.suite, ty, &Value::Object(state), &Value::Object(refs))?;
    let mut signed = block.clone();
    signed["signature"] = json!(sign_in(&signer.suite, &block, &signer.private_key)?);
    heads.get_mut(author_old).unwrap()["last"] = signed.clone();
    out.push(signed.clone());
    Ok(signed)
}

/// Convert old blocks into fresh 1.6 blocks (see the module docs). `old` carries each block's `hash` when it has one.
pub fn convert(old: &[Value], options: &ConvertOptions) -> Result<Converted> {
    let aliases: Value = match &options.aliases {
        Some(a) => a.clone(),
        None => serde_json::from_slice(ALIASES_JSON)?,
    };
    // Each old block with its old id, computed from its content: a supplied `hash` that is not the hash of the block is a lie about which
    // block this is, and the block is skipped (release 22: a supplied hash was trusted)
    let mut skipped: Vec<(String, String)> = Vec::new();
    let mut olds: Vec<Value> = Vec::new();
    for b in old {
        let mut b = b.clone();
        if b.is_object() {
            let h = old_hash(&b);
            let given = hash_of(&b).to_string();
            if !given.is_empty() && given != h {
                skipped.push((given, "its supplied hash is not the hash of its content".to_string()));
                continue;
            }
            b["hash"] = json!(h);
        }
        olds.push(b);
    }
    let mut map = options.map.clone();
    let mut out: Vec<Value> = Vec::new();
    let mut deliveries: Vec<Value> = Vec::new();
    let existing = index_of(options.existing.iter());
    let reads: Vec<Option<Value>> = olds.iter().map(|b| read_old(&aliases, b)).collect();
    let by_hash: crate::js::Index = index_of(olds.iter());
    let read_of: Map<String, Value> = olds.iter().zip(&reads).filter_map(|(b, r)| r.clone().map(|r| (hash_of(b).to_string(), r))).collect();
    // The identity an old block belongs to: an actor that carries a key and updates nothing is its own identity (the
    // genesis, whoever made it); any other block belongs to its author.
    let identity_of = |b: &Value| -> Option<String> {
        let id = hash_of(b);
        let genesis = read_of.get(id).is_some_and(|r| type_of(r) == "actor" && ss(r, "public_key_sign").is_some() && rf(r, "updates").is_none());
        if genesis {
            Some(id.to_string())
        } else {
            rs(b, "author").map(String::from)
        }
    };
    // The key that signs for each identity: its own, else the custodian's, but only for an identity the custodian
    // names (`custodian_for`). A held key with no channel, and a genesis that was not public, are refused.
    let mut keys = options.keys.clone();
    if let Some(held) = &options.custodian_key {
        for id in &options.custodian_for {
            if !keys.contains_key(id) {
                keys.insert(id.clone(), held.clone());
            }
        }
    }
    let mut refused: Map<String, Value> = Map::new();
    for id in keys.keys().cloned().collect::<Vec<_>>() {
        let why = channel_refused(options, &keys[&id]).or_else(|| {
            let genesis = read_of.get(&id).is_some_and(|r| type_of(r) == "actor" && ss(r, "public_key_sign").is_some() && rf(r, "updates").is_none());
            if genesis && read_of.get(&id).and_then(|r| ss(r, "audience")) != Some("public") {
                Some("its genesis named no public audience: a genesis cannot be for its author alone".to_string())
            } else {
                None
            }
        });
        if let Some(w) = why {
            keys.shift_remove(&id);
            refused.insert(id, json!(w));
        }
    }
    // Roles each old circle's members were given, for the circle's new roles list.
    let mut circle_roles: Map<String, Value> = Map::new();
    for read in read_of.values() {
        if type_of(read) == "grant" && ss(read, "kind") == Some("member") {
            if let Some(circle) = rs(read, "subject") {
                let slot = circle_roles.entry(circle.to_string()).or_insert_with(|| json!([]));
                for r in list(st(read, "roles")) {
                    if !slot.as_array().unwrap().iter().any(|x| x.as_str() == Some(r)) {
                        slot.as_array_mut().unwrap().push(json!(r));
                    }
                }
            }
        }
    }
    // Step 2: a new genesis per identity that has a key. A custodian's own identity first: others name it.
    let mut identities: Vec<String> = Vec::new();
    for b in &olds {
        let Some(id) = identity_of(b) else { continue };
        if keys.contains_key(&id) && !identities.contains(&id) {
            identities.push(id);
        }
    }
    identities.sort();
    let custodians: Vec<String> =
        identities.iter().filter_map(|i| keys[i].get("custodian").and_then(Value::as_str).map(String::from)).collect();
    identities.sort_by_key(|i| !custodians.contains(i));
    let mut heads: Map<String, Value> = Map::new(); // old identity -> { id (new), last (block), genesis }
    let mut signers: Map<String, Value> = Map::new();
    for id in &identities {
        let k = keys.get(id).unwrap();
        let pair = Keypair {
            suite: text(k.get("suite")).replace("undefined", ""),
            public_key_sign: text(k.get("public_key_sign")),
            private_key: text(k.get("private_key")),
        };
        let signer = signer_of(options, k);
        let suite = signer.suite.clone();
        let new_id = match map.get(id).and_then(Value::as_str) {
            Some(n) => n.to_string(),
            None => {
                let read = read_of.get(id.as_str());
                let kind = read.and_then(|r| ss(r, "kind")).unwrap_or("person").to_string();
                let mut state = json!({
                    "kind": kind, "at": options.at, "audience": "public", "public_key_sign": pair.public_key_sign,
                });
                if suite != "std" {
                    state["suite"] = json!(suite);
                }
                if let Some(e) = read.and_then(|r| ss(r, "public_key_encrypt")) {
                    state["public_key_encrypt"] = json!(e);
                }
                // The held key names its custodian: the custodian's new id when it was converted, else as given.
                if let Some(c) = k.get("custodian").and_then(Value::as_str) {
                    state["custodian"] = json!(map.get(c).and_then(Value::as_str).unwrap_or(c));
                }
                // The old recovery key's hash and reach are carried as a pair; one without the other is dropped.
                if let Some(r) = read {
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
                // chain, an `observe` the owner (or custodian) signs, `derives_from` the old hash.
                let link = crate::chain::next_link(None, Some(&n))?;
                let mut from = vec![id.clone()];
                if !options.request_hash.is_empty() && signer.channel.is_some() {
                    from.push(options.request_hash.clone());
                }
                let mut note = json!({
                    "kind": "converted", "at": options.at, "seq": link.seq,
                });
                // The link names the old hash: it is for the author alone, not public.
                let aud = crate::audience::commit_in(&suite, &[n.as_str()], &json!({}))?;
                note["audience"] = json!(aud.audience);
                note["nonce"] = json!(crate::audience::try_new_salt()?);
                if let Some(c) = &signer.channel {
                    note["channel"] = json!(c);
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
            .max_by_key(|b| number_of(st(b, "seq")) as i64)
            .cloned();
        if last.is_none() {
            last = out.iter().rev().find(|b| rs(b, "author") == Some(new_id.as_str())).cloned();
        }
        heads.insert(id.clone(), json!({ "id": new_id, "last": last, "genesis": new_id }));
        signers.insert(id.clone(), json!({ "suite": signer.suite, "private_key": signer.private_key, "channel": signer.channel }));
    }
    let signer_for = |author: &str| -> Signer {
        let s = &signers[author];
        Signer {
            suite: text(s.get("suite")),
            private_key: text(s.get("private_key")),
            channel: s.get("channel").and_then(Value::as_str).map(String::from),
        }
    };
    let order = causal(&olds);
    // What each (identity, target) needs a schema to declare: found before any block is written, so one schema
    // serves them all.
    let mut needs: Map<String, Value> = Map::new();
    for b in &order {
        let id = hash_of(b).to_string();
        let Some(read) = read_of.get(&id) else { continue };
        let Some(author_old) = identity_of(b) else { continue };
        if !heads.contains_key(&author_old) || map.contains_key(&id) {
            continue;
        }
        let p = prepare(read, &circle_roles, &id);
        if p.skip.is_some() || (p.fields.is_empty() && p.roles.is_empty()) {
            continue;
        }
        let slot = needs.entry(format!("{author_old} {}", p.target)).or_insert_with(|| json!({ "fields": {}, "roles": [] }));
        for (name, t) in &p.fields {
            let have = slot["fields"].get(name).and_then(Value::as_str).map(String::from);
            let scalar = |x: &str| ["text", "integer", "boolean"].contains(&x);
            let t = match have {
                Some(h) if h != *t && scalar(&h) && scalar(t) => "text".to_string(),
                Some(h) => h,
                None => t.clone(),
            };
            slot["fields"][name.as_str()] = json!(t);
        }
        for r in &p.roles {
            if !slot["roles"].as_array().unwrap().iter().any(|x| x.as_str() == Some(r)) {
                slot["roles"].as_array_mut().unwrap().push(json!(r));
            }
        }
    }
    let mut own_schemas: Map<String, Value> = Map::new(); // "identity target" -> hash of the schema written
    let _ = &by_hash;
    // Steps 3 to 8, in causal order.
    for b in &order {
        let old_id = hash_of(b).to_string();
        let Some(author_old) = identity_of(b) else {
            skipped.push((old_id, "it names no author".into()));
            continue;
        };
        let is_genesis = identities.contains(&old_id) && author_old == old_id;
        if map.contains_key(&old_id) || is_genesis {
            continue;
        }
        if !heads.contains_key(&author_old) {
            let why = refused.get(&author_old).and_then(Value::as_str).unwrap_or("no key was given for its author");
            skipped.push((old_id, why.into()));
            continue;
        }
        let Some(read) = read_of.get(&old_id) else {
            skipped.push((old_id, "its type is retired".into()));
            continue;
        };
        let p = prepare(read, &circle_roles, &old_id);
        if let Some(why) = p.skip {
            skipped.push((old_id, why));
            continue;
        }
        let signer = signer_for(&author_old);
        let new_author = text(heads[&author_old].get("id"));
        // Refs: every old id to its new one (a ref to an old block that was not converted stays as it was); sets sorted.
        let mut refs = Map::new();
        for (k, v) in &p.refs {
            let swap = |h: &str| match h.split_once('#') {
                Some((who, role)) => map.get(who).and_then(Value::as_str).map(|n| format!("{n}#{role}")).unwrap_or_else(|| h.to_string()),
                None => map.get(h).and_then(Value::as_str).map(String::from).unwrap_or_else(|| h.to_string()),
            };
            let nv = match v {
                Value::String(s) => json!(swap(s)),
                Value::Array(a) => json!(crate::js::sorted_set(a.iter().filter_map(Value::as_str).map(swap))),
                other => other.clone(),
            };
            refs.insert(k.clone(), nv);
        }
        // Step 7: the link back (derives_from the old hash, and the raw request when a custodian signs).
        let mut from = list(refs.get("derives_from")).iter().map(|s| s.to_string()).collect::<Vec<_>>();
        from.push(old_id.clone());
        if !options.request_hash.is_empty() && signer.channel.is_some() {
            from.push(options.request_hash.clone());
        }
        refs.insert("derives_from".into(), json!(crate::js::sorted_set(from)));
        // A schema declares what the type does not: one already published, else the converter's own (a thing of kind
        // schema, written first by the same signer).
        if !p.fields.is_empty() || !p.roles.is_empty() {
            let known = options.schemas.iter().find(|s| {
                let target = ss(s, "target");
                let declared = get(s, "state.fields").and_then(Value::as_object);
                let roles = list(get(s, "state.roles"));
                (target == Some(p.target.as_str()) || target == Some(p.ty.as_str()))
                    && p.fields.iter().all(|(f, _)| declared.is_some_and(|d| d.contains_key(f)))
                    && p.roles.iter().all(|r| roles.contains(&r.as_str()))
            });
            let schema = match known {
                Some(s) => hash_of(s).to_string(),
                None => {
                    let key = format!("{author_old} {}", p.target);
                    if let Some(h) = own_schemas.get(&key).and_then(Value::as_str) {
                        h.to_string()
                    } else {
                        let need = needs.get(&key).cloned().unwrap_or_else(|| json!({ "fields": {}, "roles": [] }));
                        let mut state = json!({ "kind": "schema", "target": p.target, "fields": need["fields"], "roles": need["roles"] });
                        // The schema is public only when the block that needs it is; else it is its author's alone.
                        if matches!(p.state.get("audience"), Some(Value::String(a)) if a == "public") {
                            state["audience"] = json!("public");
                        }
                        let made = emit(&mut heads, &mut out, options, &author_old, &signer, "thing", state.as_object().unwrap().clone(), Map::new())?;
                        let h = hash_of(&made).to_string();
                        own_schemas.insert(key, json!(h));
                        h
                    }
                }
            };
            refs.insert("schema".into(), json!(schema));
        }
        // Step 6: at is the conversion time; the old time goes in `when`.
        let mut state = p.state.clone();
        if let Some(old_at) = state.shift_remove("at") {
            if crate::time::is_time(Some(&old_at)) {
                state.entry("when".to_string()).or_insert(old_at);
            }
        }
        // A private audience: an old plain list of identities becomes one commitment per recipient, and each
        // recipient is given the salt that opens theirs (privacy.md).
        let mut gifts: Option<(crate::audience::Audience, Vec<String>)> = None;
        match state.get("audience").cloned() {
            Some(Value::String(s)) if s == "public" => {}
            other => {
                let named: Vec<String> = match &other {
                    Some(Value::Array(a)) => a.iter().filter_map(Value::as_str).filter_map(|r| recipient_id(r, &map)).collect(),
                    _ => Vec::new(),
                };
                // A recipient with no new id is left out; with none left, the block is its author's alone.
                let who = if named.is_empty() { vec![new_author.clone()] } else { crate::js::unique(named) };
                let refs_who: Vec<&str> = who.iter().map(String::as_str).collect();
                let aud = crate::audience::commit_in(&signer.suite, &refs_who, &json!({}))?;
                state.insert("audience".into(), json!(aud.audience));
                state.insert("nonce".into(), json!(crate::audience::try_new_salt()?));
                gifts = Some((aud, who));
            }
        }
        let signed = emit(&mut heads, &mut out, options, &author_old, &signer, &p.ty, state, refs)?;
        map.insert(old_id, json!(hash_of(&signed)));
        if let Some((aud, who)) = gifts {
            for to in who {
                let reveals = json!([crate::audience::reveal_for(&aud, &to)]);
                // The recipient's genesis names an encryption key: the copy is sealed to it.
                let genesis_id = to.split('#').next().unwrap_or("").to_string();
                let genesis = out.iter().find(|g| hash_of(g) == genesis_id).or_else(|| existing.get(genesis_id.as_str()));
                let key = genesis.and_then(|g| ss(g, "public_key_encrypt")).map(String::from);
                let enc_suite = genesis.and_then(|g| ss(g, "suite")).unwrap_or("std").to_string();
                let sealed = match key {
                    Some(k) if !to.contains('#') => {
                        crate::write::seal_copy(&signed, &[k.as_str()], &reveals, &signer.private_key, None, &enc_suite, if signer.suite.is_empty() { "std" } else { signer.suite.as_str() }).unwrap_or(Value::Null)
                    }
                    _ => Value::Null,
                };
                deliveries.push(json!({ "block": hash_of(&signed), "to": to, "reveals": reveals, "sealed": sealed }));
            }
        }
    }
    Ok(Converted { blocks: out, map, skipped, deliveries })
}
