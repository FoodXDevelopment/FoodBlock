//! Reading older blocks (protocol.md: strict writing, generous reading; Encoding: Aliases). Every earlier shape is
//! read as its 1.6 form through the one table, aliases.json, in the order protocol.json gives: type names, then the
//! shape rules for the block's type.kind and type, then the shared ref renames, then `outside`. It applies to every
//! block, with or without seq, and reads every row. Reading never changes a block or its hash: what `read_as` adds
//! beside the content (`readFrom`, `settles`, `outside`, `retired`) is a reader's mark, never signed.
use crate::js::{get, strict_eq, text, type_of};
use crate::prelude::*;
use crate::spec::Spec;

fn has_type(spec: &Spec, name: &str) -> bool {
    spec.has_type(name)
}

// The 1.6 type and kind an old type name reads as. Any other old `base.kind` reads as its base's type, with that kind.
fn type_alias(spec: &Spec, name: &str) -> Option<Map<String, Value>> {
    let types = spec.aliases.get("types");
    if has_type(spec, name) {
        return Some(json!({ "type": name }).as_object().unwrap().clone());
    }
    if let Some(Value::Object(alias)) = types.and_then(|t| t.get(name)) {
        return Some(alias.clone());
    }
    let mut parts = name.split('.');
    let base = parts.next().unwrap_or("");
    let rest: Vec<&str> = parts.collect();
    let as_base = if has_type(spec, base) {
        Some(json!({ "type": base }).as_object().unwrap().clone())
    } else {
        types
            .and_then(|t| t.get(base))
            .and_then(Value::as_object)
            .cloned()
    };
    if let Some(mut alias) = as_base {
        if !crate::js::truthy(alias.get("retired")) && !rest.is_empty() {
            alias.insert("kind".into(), Value::String(rest.join(".")));
            return Some(alias);
        }
    }
    None
}

// `when`: every path holds its value ("*" present, null absent).
fn holds(read: &Value, when: Option<&Value>) -> bool {
    let Some(Value::Object(when)) = when else {
        return true;
    };
    when.iter().all(|(path, value)| {
        let at = get(read, path);
        match value {
            Value::String(s) if s == "*" => at.is_some_and(|v| !v.is_null()),
            Value::Null => at.is_none_or(Value::is_null),
            other => strict_eq(at, Some(other)),
        }
    })
}

// Paths are `state.x.y` or `refs.x`; intermediate values that are not objects become objects.
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

// One shape rule applied to a block as read so far.
fn apply(read: &mut Value, rule: &Value, marks: &mut Map<String, Value>) {
    let force = crate::js::truthy(rule.get("force"));
    for (from, to) in entries(rule, "refs") {
        let value = read["refs"]
            .as_object_mut()
            .and_then(|r| r.shift_remove(&from));
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
    if let Some(t) = rule.get("type").filter(|v| crate::js::truthy(Some(v))) {
        read["type"] = t.clone();
    }
    if let Some(k) = rule.get("kind").filter(|v| crate::js::truthy(Some(v))) {
        read["state"]["kind"] = k.clone();
    }
    if let Some(s) = rule.get("settles").filter(|v| crate::js::truthy(Some(v))) {
        if let Some(v) = read["refs"].get(text(Some(s))).cloned() {
            marks.insert("settles".into(), v);
        }
    }
}

fn type_kind(read: &Value) -> String {
    format!("{}.{}", type_of(read), text(crate::js::st(read, "kind")))
}

// Per-type rows (type.kind, then type), then the every-type rows (`*`).
fn shapes_of(spec: &Spec, read: &Value) -> Vec<Value> {
    let shapes = spec.aliases.get("shapes");
    let rows = |key: &str| {
        shapes
            .and_then(|s| s.get(key))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    let mut out = rows(&type_kind(read));
    out.extend(rows(type_of(read)));
    out.extend(rows("*"));
    out
}

/// A block of any earlier shape, read as FoodBlock 1.6, with the given protocol.json and aliases.json. A block that
/// needs no reading comes back as itself.
pub fn read_as_with(spec: &Spec, block: &Value) -> Value {
    let Some(alias) = type_alias(spec, type_of(block)) else {
        return block.clone();
    };
    if crate::js::truthy(alias.get("retired")) {
        let mut out = block.clone();
        out["retired"] = Value::Bool(true);
        return out;
    }
    let mut defaults = alias.clone();
    let new_type = defaults.shift_remove("type").unwrap_or(Value::Null);
    let renamed = defaults.shift_remove("fields");
    defaults.shift_remove("retired");
    defaults.shift_remove("outside");
    let mut state = block
        .get("state")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
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
    let refs = block
        .get("refs")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut read = json!({ "type": new_type, "state": merged, "refs": refs });
    let mut marks = Map::new();
    let mut seen: Vec<String> = Vec::new();
    while !seen.contains(&type_kind(&read)) {
        seen.push(type_kind(&read));
        for rule in shapes_of(spec, &read) {
            if holds(&read, rule.get("when")) {
                apply(&mut read, &rule, &mut marks);
            }
        }
    }
    let outside = &spec.outside;
    let mut refs = Map::new();
    let mut outside_marks = Map::new();
    if let Some(Value::Object(read_refs)) = read.get("refs") {
        for (old, value) in read_refs {
            let role = spec
                .aliases
                .get("refs")
                .and_then(|r| r.get(old))
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .unwrap_or(old);
            // A ref naming someone with no record (`outside:Plenish`) is an open side: the name is kept beside.
            match value {
                Value::String(s) if !outside.is_empty() && s.starts_with(outside.as_str()) => {
                    outside_marks.insert(
                        role.to_string(),
                        Value::String(s[outside.len()..].to_string()),
                    );
                }
                _ => {
                    refs.insert(role.to_string(), value.clone());
                }
            }
        }
    }
    if !outside_marks.is_empty() {
        marks.insert("outside".into(), Value::Object(outside_marks));
    }
    read["refs"] = Value::Object(refs);
    let same = read.get("type") == block.get("type")
        && read
            .get("state")
            .map(|s| crate::js::deep_eq(s, block.get("state").unwrap_or(&json!({}))))
            .unwrap_or(false)
        && read
            .get("refs")
            .map(|r| crate::js::deep_eq(r, block.get("refs").unwrap_or(&json!({}))))
            .unwrap_or(false);
    if same && marks.is_empty() {
        return block.clone();
    }
    let mut out = block.clone();
    if !out.is_object() {
        out = json!({});
    }
    let o = out.as_object_mut().unwrap();
    for key in ["type", "state", "refs"] {
        o.insert(key.into(), read[key].take());
    }
    for (k, v) in marks {
        o.insert(k, v);
    }
    o.insert("readFrom".into(), Value::String(type_of(block).to_string()));
    out
}

/// A block of any earlier shape, read as FoodBlock 1.6 (the built-in aliases.json). A block that needs no reading
/// comes back as itself.
pub fn read_as(block: &Value) -> Value {
    read_as_with(crate::spec(), block)
}

/// Whether a block, old or new, is of this 1.6 type (and kind, when named): the one test every reader uses.
pub fn is_a(block: &Value, type_name: &str, kind: Option<&str>) -> bool {
    let read = read_as(block);
    !crate::js::truthy(read.get("retired"))
        && type_of(&read) == type_name
        && kind.is_none_or(|k| crate::js::ss(&read, "kind") == Some(k))
}

/// A message of an earlier shape, read as 1.6: the field renames of aliases.json `messages` for this kind of message
/// (`signed_pull`, `signed_push`), e.g. an `asker` or a `pusher` read as `signer`. A new name already present is
/// never written over. Reading never changes the message or its signature, which covers the bytes as sent.
pub fn read_message_with(spec: &Spec, kind: &str, message: &Value) -> Value {
    let Some(Value::Object(renames)) = spec.aliases.get("messages").and_then(|m| m.get(kind)) else {
        return message.clone();
    };
    let Value::Object(fields) = message else {
        return message.clone();
    };
    let mut out = Map::new();
    for (k, v) in fields {
        let new = renames.get(k).and_then(Value::as_str).unwrap_or(k);
        if new != k.as_str() && fields.contains_key(new) {
            out.insert(k.clone(), v.clone());
        } else {
            out.insert(new.to_string(), v.clone());
        }
    }
    Value::Object(out)
}

/// `read_message_with` on the built-in aliases.json.
pub fn read_message(kind: &str, message: &Value) -> Value {
    read_message_with(crate::spec(), kind, message)
}
