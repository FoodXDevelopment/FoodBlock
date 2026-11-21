//! The read-back that can be redone (1.9 stage 7, Job C): `spec/readings/readback.md`'s answer, rendered by `spec/renderers/en.md` or
//! `en-sms.md`, each named as a rule set is (the hash of the manifest over its text and its cases), so a second reader who holds the same
//! blocks makes the same text, or names the block she lacks. Three door ops of class `reading`: `readback`, `render`, `readback_redo`.
//!
//! This file is this engine's implementation of those published texts; it runs them because it passes their cases (`tests/stage7.rs`).
//! A reading and a renderer change none of the four answers: nothing here is protocol. The reading reads typed fields and the engine's own
//! door ops only (`crate::door::ask`), never free text, and classifies nothing.
use crate::prelude::*;
use alloc::collections::{BTreeMap, BTreeSet};

/// The published files, built in (synced copies of spec/readings and spec/renderers), by path under spec/.
const FILES: [(&str, &[u8]); 6] = [
    ("readings/readback.md", include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/readings/readback.md"))),
    ("readings/readback.cases.json", include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/readings/readback.cases.json"))),
    ("renderers/en.md", include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/renderers/en.md"))),
    ("renderers/en.cases.json", include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/renderers/en.cases.json"))),
    ("renderers/en-sms.md", include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/renderers/en-sms.md"))),
    ("renderers/en-sms.cases.json", include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/renderers/en-sms.cases.json"))),
];

/// The name of a reading or renderer: as a rule set's, the SHA-256 of the canonical manifest over its text and its cases. Never written down.
fn name_of(stem: &str) -> String {
    let mut files = Map::new();
    for (path, bytes) in FILES.iter().filter(|(p, _)| p.starts_with(stem) && (p[stem.len()..] == *".md" || p[stem.len()..] == *".cases.json")) {
        files.insert((*path).to_string(), Value::String(String::from_utf8_lossy(bytes).into_owned()));
    }
    crate::rules::rule_set(&files).and_then(|r| r["id"].as_str().map(String::from)).unwrap_or_default()
}
/// The names this build runs: `{ reading, en, en-sms }`.
pub fn names() -> Value {
    json!({ "reading": name_of("readings/readback"), "en": name_of("renderers/en"), "en-sms": name_of("renderers/en-sms") })
}

// ------------------------------------------------------------------------------------------------------------------------------------
// readings/readback
// ------------------------------------------------------------------------------------------------------------------------------------

fn ask(op: &str, args: Vec<Value>) -> Option<Value> {
    crate::door::ask(op, args)
}
fn s(v: &Value) -> Option<&str> {
    v.as_str()
}
fn obj(v: &Value) -> bool {
    v.is_object()
}
fn is_amt(v: &Value) -> bool {
    v.is_object() && v.get("value").is_some_and(Value::is_string) && v.get("unit").is_some_and(Value::is_string)
}
fn absent(v: &Value, k: &str) -> bool {
    v.get(k).is_none()
}
/// The kind of an amount, as text: `JSON.stringify([unit, of or null])`.
fn kind_key(a: &Value) -> String {
    serde_json::to_string(&json!([a["unit"], a.get("of").cloned().unwrap_or(Value::Null)])).unwrap_or_default()
}
fn dcmp(a: &Value, b: &Value) -> core::cmp::Ordering {
    let p = |v: &Value| crate::decimal::Dec::parse(v.as_str().unwrap_or("0")).unwrap_or_else(crate::decimal::Dec::zero);
    p(a).cmp(&p(b))
}
/// The ends of a value: its `min` and `max` where it has either, its `one_of`, else the value (none where absent).
fn ends(v: Option<&Value>) -> Vec<Value> {
    match v {
        None => vec![],
        Some(v) if v.is_object() && (v.get("min").is_some() || v.get("max").is_some()) => [v.get("min"), v.get("max")].into_iter().flatten().cloned().collect(),
        Some(v) if v.is_object() && v.get("one_of").is_some_and(Value::is_array) => v["one_of"].as_array().cloned().unwrap_or_default(),
        Some(v) => vec![v.clone()],
    }
}
fn list(v: Option<&Value>) -> Vec<Value> {
    match v {
        None => vec![],
        Some(Value::Array(a)) => a.clone(),
        Some(x) => vec![x.clone()],
    }
}
fn text_of(v: &Value) -> String {
    match v {
        Value::String(t) => t.clone(),
        x => serde_json::to_string(x).unwrap_or_default(),
    }
}
/// ids first (ascending, once), then the entries, once each by canonical JSON, sorted by it.
fn sort_lacks(l: &[Value]) -> Vec<Value> {
    let ids: BTreeSet<String> = l.iter().filter_map(|x| x.as_str().map(String::from)).collect();
    let mut ent: BTreeMap<String, Value> = BTreeMap::new();
    for e in l.iter().filter(|x| x.is_object()) {
        ent.entry(crate::canonical::canonical_json(e)).or_insert_with(|| e.clone());
    }
    ids.into_iter().map(Value::String).chain(ent.into_values()).collect()
}

struct Reading {
    by_id: BTreeMap<String, Value>,
    all: Vec<Value>,
    viewer: Option<String>,
    read: BTreeSet<String>,
    lacks: Vec<Value>,
}
impl Reading {
    fn has(&self, id: &str) -> bool {
        self.by_id.contains_key(id)
    }
    fn get(&self, id: &str) -> Option<&Value> {
        self.by_id.get(id)
    }
    fn all(&self) -> Value {
        Value::Array(self.all.clone())
    }
    fn code(&self, id: &str) -> Value {
        ask("short_code", vec![json!(id)]).unwrap_or(Value::Null)
    }
    // each piece held is read; each not held is lacked (refs.author and refs.key, and theirs, to a genesis)
    fn pieces(&mut self, b: &Value, lack: bool) {
        let mut seen = BTreeSet::new();
        let mut stack = vec![b["refs"].get("author").cloned(), b["refs"].get("key").cloned()];
        while let Some(id) = stack.pop() {
            let Some(Value::String(id)) = id else { continue };
            if !seen.insert(id.clone()) {
                continue;
            }
            let Some(p) = self.get(&id).cloned() else {
                if lack {
                    self.lacks.push(json!(id));
                }
                continue;
            };
            self.read.insert(id);
            if p["refs"].get("author").is_some_and(Value::is_string) {
                stack.push(p["refs"].get("author").cloned());
                stack.push(p["refs"].get("key").cloned());
            }
        }
    }
    // a person by the name she signed herself: her own valid `actor` that `updates` her genesis; of several, the one no other sees
    fn person(&mut self, id: Option<&Value>) -> Value {
        let Some(id) = id.and_then(Value::as_str).map(String::from) else { return Value::Null };
        if self.viewer.as_deref() == Some(id.as_str()) {
            return json!({ "id": id, "code": self.code(&id), "name": null });
        }
        let all = self.all();
        let own: Vec<Value> = self
            .all
            .iter()
            .filter(|b| {
                s(&b["type"]) == Some("actor")
                    && s(&b["refs"]["author"]) == Some(id.as_str())
                    && s(&b["refs"]["updates"]) == Some(id.as_str())
                    && b["state"]["name"].is_string()
            })
            .filter(|b| ask("valid", vec![(*b).clone(), all.clone()]).and_then(|v| v.as_array().map(Vec::len)) == Some(0))
            .cloned()
            .collect();
        let heads: Vec<&Value> = own
            .iter()
            .enumerate()
            .filter(|(i, b)| !own.iter().enumerate().any(|(j, o)| j != *i && ask("sees", vec![o.clone(), (*b).clone(), all.clone()]) == Some(Value::Bool(true))))
            .map(|(_, b)| b)
            .collect();
        if heads.len() == 1 {
            let h = heads[0].clone();
            self.read.insert(text_of(&h["hash"]));
            self.pieces(&h, false);
            return json!({ "id": id, "code": self.code(&id), "name": h["state"]["name"] });
        }
        for b in &own {
            self.read.insert(text_of(&b["hash"]));
            self.pieces(b, false);
        }
        json!({ "id": id, "code": self.code(&id), "name": null })
    }
}

fn signer_of(b: &Value) -> Value {
    if b["refs"]["author"].is_string() {
        b["refs"]["author"].clone()
    } else {
        b["hash"].clone()
    }
}

/// `readings/readback`: the answer for `block` over `held`, read to `to`.
pub fn reading(block: &Value, held: &[Value], to: Option<&str>) -> Value {
    let mut order: Vec<String> = vec![];
    let mut by_id: BTreeMap<String, Value> = BTreeMap::new();
    let key = |b: &Value| b["hash"].as_str().map(String::from).unwrap_or_else(|| "\u{0}undefined".into());
    for b in held.iter().filter(|b| b.is_object()) {
        let k = key(b);
        if !by_id.contains_key(&k) {
            order.push(k.clone());
        }
        by_id.insert(k, b.clone());
    }
    let fk = key(block);
    if !by_id.contains_key(&fk) {
        order.push(fk.clone());
        by_id.insert(fk.clone(), block.clone());
    }
    let all: Vec<Value> = order.iter().map(|k| by_id[k].clone()).collect();
    let mut r = Reading { by_id, all, viewer: to.map(String::from), read: BTreeSet::new(), lacks: vec![] };
    r.read.insert(fk.clone());
    let all_v = r.all();
    let fid = block["hash"].clone();
    r.pieces(block, true);
    let viewer_p = r.person(to.map(|t| json!(t)).as_ref());
    let signer = signer_of(block);
    let signer_p = r.person(Some(&signer));
    let mut answer = json!({
        "viewer": viewer_p,
        "for": { "id": fid, "code": r.code(&text_of(&fid)), "type": block["type"], "signer": signer_p },
    });
    // every block read is read with its pieces held (a block is someone's word only with them)
    // and with its line before it held (`prev`, to the line's start: where a draw sits on its line is read from them)
    let finish = |r: &mut Reading, mut answer: Value| {
        let mut done: BTreeSet<String> = BTreeSet::new();
        loop {
            let todo: Vec<String> = r.read.iter().filter(|id| !done.contains(*id)).cloned().collect();
            if todo.is_empty() {
                break;
            }
            for id in todo {
                done.insert(id.clone());
                let Some(b) = r.get(&id).cloned().filter(|b| b["refs"].is_object()) else { continue };
                r.pieces(&b, false);
                if let Some(p) = b["refs"]["prev"].as_str().filter(|p| r.has(p)) {
                    r.read.insert(p.to_string());
                }
            }
        }
        answer["read"] = json!(r.read.iter().collect::<Vec<_>>());
        answer["lacks"] = json!(sort_lacks(&r.lacks));
        answer
    };
    // who said these bytes; a block not valid is said to be so and nothing else
    let v = ask("valid", vec![block.clone(), all_v.clone()]).and_then(|v| v.as_array().cloned()).unwrap_or_default();
    if !v.is_empty() {
        if v.iter().all(|x| s(&x["code"]) == Some("unmet")) {
            answer["not_shown"] = json!(true);
        } else {
            answer["not_valid"] = json!(v.iter().map(|x| x["code"].clone()).collect::<Vec<_>>());
        }
        return finish(&mut r, answer);
    }
    // a field this reading does not read, or a rule set this reader does not run: `not_read`, and nothing else is said of the block
    let rf = ask("read", vec![block.clone(), all_v.clone(), Value::Null]).and_then(|v| v.as_array().cloned()).unwrap_or_default();
    let is_names = |x: &Value| matches!(s(&x["code"]), Some("names_missing" | "names_unread"));
    let other: Vec<&Value> = rf.iter().filter(|x| !is_names(x)).collect();
    if !other.is_empty() {
        let fields = other.iter().filter(|x| s(&x["code"]) == Some("undeclared_field")).count();
        let codes: BTreeSet<String> = other.iter().map(|x| text_of(&x["code"])).collect();
        answer["not_read"] = json!({ "fields": fields, "rule_set": other.iter().any(|x| s(&x["code"]) == Some("unknown_rules")), "codes": codes.into_iter().collect::<Vec<_>>() });
        return finish(&mut r, answer);
    }
    if rf.iter().any(is_names) {
        let missing = ask("needs", vec![block.clone(), all_v.clone()]).and_then(|v| v.as_array().cloned()).unwrap_or_default();
        r.lacks.extend(missing);
    }
    for id in ask("needs", vec![block.clone()]).and_then(|v| v.as_array().cloned()).unwrap_or_default() {
        if let Some(b) = id.as_str().and_then(|i| r.get(i)).cloned() {
            r.read.insert(text_of(&id));
            r.pieces(&b, false);
        }
    }

    // the deal this block belongs to: a first promise is its own; an accept reads the block it answers
    let mut deal = block.clone();
    let mut deal_is_block = true;
    if s(&block["type"]) == Some("promise") && s(&block["state"]["status"]) == Some("accepted") && block["refs"]["answers"].is_string() {
        let a = text_of(&block["refs"]["answers"]);
        if let Some(d) = r.get(&a).cloned() {
            r.read.insert(text_of(&d["hash"]));
            deal = d;
            deal_is_block = false;
        } else {
            r.lacks.push(json!(a));
        }
    }
    let terms = if deal["state"]["terms"].is_object() { deal["state"]["terms"].clone() } else { json!({}) };
    let dtype = s(&deal["type"]).unwrap_or("").to_string();
    let giver = match dtype.as_str() {
        "promise" => deal["refs"].get("from").cloned(),
        "transfer" => Some(signer_of(&deal)),
        _ => Some(signer.clone()),
    };
    let receiver = match dtype.as_str() {
        "promise" => deal["refs"].get("to").cloned(),
        "transfer" => deal["refs"].get("to_owner").or_else(|| deal["refs"].get("to_holder")).cloned(),
        "grant" => deal["refs"].get("to").cloned(),
        _ => None,
    };
    answer["to"] = r.person(receiver.as_ref());
    answer["audience"] = match block["state"].get("audience") {
        Some(Value::Array(a)) => json!({ "readers": a.len() }),
        _ => json!("public"),
    };

    // her record: is there an earlier block joining her and the other side
    let counter = if dtype == "promise" {
        [deal["refs"].get("from"), deal["refs"].get("to")].into_iter().flatten().find(|x| x.is_string() && **x != signer).cloned()
    } else {
        receiver.clone()
    };
    let viewer = to.map(String::from);
    let other2: Option<Value> = if viewer.as_deref() == signer.as_str() && viewer.is_some() { counter } else { Some(signer.clone()) };
    let other2s: Option<String> = other2.as_ref().and_then(|x| x.as_str().map(String::from));
    let apart = other2s.is_some() && viewer.is_some() && other2s != viewer;
    let mut joins = 0;
    if apart {
        let (o, me) = (other2s.clone().unwrap_or_default(), viewer.clone().unwrap_or_default());
        let names_in = |b: &Value, who: &str| b["refs"].as_object().is_some_and(|m| m.iter().any(|(k, x)| k != "author" && list(Some(x)).iter().any(|y| y.as_str() == Some(who))));
        let found: Vec<String> = r
            .all
            .iter()
            .filter(|b| b["hash"] != fid && b["hash"] != deal["hash"] && b["refs"].is_object())
            .filter(|b| (s(&b["refs"]["author"]) == Some(me.as_str()) && names_in(b, &o)) || (s(&b["refs"]["author"]) == Some(o.as_str()) && names_in(b, &me)))
            .map(|b| text_of(&b["hash"]))
            .collect();
        joins = found.len();
        r.read.extend(found);
    }
    // apart without a viewer: the oracle's test reads `isStr(other2) && other2 !== viewer` (a null viewer is apart from any id)
    let apart_any = other2s.is_some() && other2s != viewer;
    answer["other"] = if apart_any { r.person(other2.as_ref()) } else { Value::Null };
    answer["first_deal"] = json!(apart_any && joins == 0 && (apart || viewer.is_none()));
    answer["other_side"] = if apart_any {
        let o = other2.clone().unwrap_or(Value::Null);
        if dtype == "promise" {
            json!(if deal["refs"].get("from") == Some(&o) { "from" } else { "to" })
        } else {
            json!(if giver.as_ref() == Some(&o) { "from" } else { "to" })
        }
    } else {
        Value::Null
    };
    // the deal's own words for what moves (`state.what`, free text): quoted as signed, every character, as its signer's; never read (2026-11-20)
    if let Some(t) = deal["state"]["what"].as_str() {
        let by = r.person(Some(&signer_of(&deal)));
        answer["what"] = json!({ "text": t, "by": by });
    }

    // each line that names a thing: the draw the ownership fold gives this block on it
    let named: Vec<Value> = if dtype == "promise" {
        match terms.get("lines") {
            Some(Value::Array(l)) if !l.is_empty() => l.iter().map(|x| if x.is_object() { x.get("what").cloned().unwrap_or(Value::Null) } else { Value::Null }).collect(),
            _ => list(deal["refs"].get("what")),
        }
    } else if dtype == "transfer" && absent(&deal["state"], "status") {
        list(deal["refs"].get("what"))
    } else {
        vec![]
    };
    let mut things = vec![];
    let fork_pairs = ask("fork_pairs", vec![all_v.clone()]).and_then(|v| v.as_array().cloned()).unwrap_or_default();
    for w in named.iter().filter_map(Value::as_str) {
        let by = r.person(giver.as_ref());
        let tp = r.person(receiver.as_ref());
        let mut line = json!({ "what": { "id": w, "code": r.code(w), "name": null }, "by": by, "to": tp });
        let Some(t) = r.get(w).cloned() else {
            r.lacks.push(json!(w));
            line["draw"] = json!({ "not_shown": true, "lacks": [w] });
            things.push(line);
            continue;
        };
        r.read.insert(w.to_string());
        line["what"]["name"] = if s(&t["type"]) == Some("thing") && t["state"]["name"].is_string() { t["state"]["name"].clone() } else { Value::Null };
        if absent(&t["refs"], "of") {
            // a kind: a line that names no instance holds nothing
            let q = if dtype == "promise" { terms.get("quantity").cloned() } else { deal["state"].get("amount").cloned() };
            line["draw"] = Value::Null;
            if let Some(q) = q.filter(is_amt) {
                line["amount"] = q;
            }
            things.push(line);
            continue;
        }
        if is_amt(&t["state"]["pack"]) {
            line["what"]["pack"] = t["state"]["pack"].clone();
            line["what"]["stated_by"] = r.person(t["refs"].get("author"));
        }
        let own = ask("ownership", vec![t.clone(), all_v.clone()]).unwrap_or(Value::Null);
        if own.is_null() {
            line["draw"] = json!({ "not_shown": true, "lacks": [w] });
            r.lacks.push(json!(w));
            things.push(line);
            continue;
        }
        // what the fold read, shown or not, and every block held that answers one of those (a yes, a no, a stop)
        let r0: BTreeSet<String> = own["read"].as_array().into_iter().flatten().map(text_of).collect();
        r.read.extend(r0.iter().cloned());
        let answering: Vec<String> = r.all.iter().filter(|x| x["refs"]["answers"].as_str().is_some_and(|a| r0.contains(a)) && x["hash"].is_string()).map(|x| text_of(&x["hash"])).collect();
        r.read.extend(answering);
        let not_shown = own.get("not_shown").is_some_and(|x| x.as_bool() == Some(true) || (!x.is_null() && x != &Value::Bool(false)));
        // a fold that is not shown names no `read`: every block held is read, so a second reader holding them finds the same lacks
        if not_shown && !own["read"].is_array() {
            let every: Vec<String> = r.all.iter().filter_map(|x| x["hash"].as_str().map(String::from)).collect();
            r.read.extend(every);
        }
        if not_shown {
            let ol = own["lacks"].as_array().cloned().unwrap_or_default();
            line["draw"] = json!({ "not_shown": true, "lacks": sort_lacks(&ol) });
            r.lacks.extend(ol);
            things.push(line);
            continue;
        }
        let draws = own["draws"].as_array().cloned().unwrap_or_default();
        let d = draws.iter().find(|x| x["block"] == fid).or_else(|| if !deal_is_block { draws.iter().find(|x| x["block"] == deal["hash"]) } else { None }).cloned();
        let Some(d) = d else {
            // an instance a block names but does not draw on: given only where read_whole from the block to the instance is whole
            let whole = ask("read_whole", vec![fid.clone(), json!(w), all_v.clone()]).is_some_and(|x| x["whole"] == Value::Bool(true));
            if !whole {
                continue;
            }
            line["draw"] = json!("not_drawn");
            let owners: Vec<Value> = own["owners"].as_array().cloned().unwrap_or_default();
            let mut out = vec![];
            for o in owners {
                let p = r.person(o.get("owner"));
                let amount = match o.get("amount") {
                    Some(a) if !a.is_null() && a != &Value::Bool(false) => a.clone(),
                    _ => Value::Null,
                };
                out.push(json!({ "owner": p, "amount": amount }));
            }
            line["owners"] = json!(out);
            things.push(line);
            continue;
        };
        line["by"] = r.person(d.get("by"));
        line["to"] = r.person(d.get("to"));
        let truthy = |v: &Value| !(v.is_null() || v == &Value::Bool(false) || v.as_str() == Some(""));
        line["draw"] = if truthy(&d["state"]) { json!({ "state": d["state"] }) } else if truthy(&d["why"]) { json!({ "why": d["why"] }) } else { json!({ "state": null }) };
        let db = d["block"].as_str().and_then(|b| r.get(b)).cloned();
        line["holder"] = match db {
            Some(ref db) if s(&db["type"]) == Some("transfer") && db["refs"]["to_holder"].is_string() && Some(&db["refs"]["to_holder"]) != d.get("to") => r.person(db["refs"].get("to_holder")),
            _ => Value::Null,
        };
        line["freer"] = if s(&d["state"]) == Some("held") { r.person(d.get("to")) } else { Value::Null };
        // a pair: where another block of the pair draws on this instance too, both draws are given, whatever the fold reads the draw as
        let mates: BTreeSet<String> = fork_pairs
            .iter()
            .filter_map(Value::as_array)
            .filter(|p| p.contains(&d["block"]))
            .flat_map(|p| p.iter().filter_map(|x| x.as_str().map(String::from)).collect::<Vec<_>>())
            .collect();
        let pair_draws: Vec<Value> = draws.iter().filter(|x| x["block"].as_str().is_some_and(|b| mates.contains(b))).cloned().collect();
        if pair_draws.iter().any(|x| x["block"] != d["block"]) {
            let mut pair = vec![];
            for x in &pair_draws {
                let h = text_of(&x["block"]);
                let hb = r.get(&h).cloned().unwrap_or(Value::Null);
                let ys: Vec<String> = r
                    .all
                    .iter()
                    .filter(|b| {
                        b["refs"].is_object()
                            && s(&b["refs"]["answers"]) == Some(h.as_str())
                            && s(&b["state"]["status"]) == Some("accepted")
                            && (b["refs"].get("author").is_some() && (b["refs"].get("author") == hb["refs"].get("to") || b["refs"].get("author") == hb["refs"].get("to_owner")))
                    })
                    .map(|b| text_of(&b["hash"]))
                    .collect();
                let yes = !ys.is_empty();
                r.read.extend(ys);
                let p = r.person(x.get("to"));
                pair.push(json!({ "draw": x["block"], "to": p, "yes": yes }));
            }
            pair.sort_by(|a, b| text_of(&a["draw"]).cmp(&text_of(&b["draw"])));
            for p in &pair {
                r.read.insert(text_of(&p["draw"]));
            }
            line["pair"] = json!(pair);
        }
        things.push(line);
    }
    answer["things"] = json!(things);

    // each amount per side and per kind: the most of hers that goes out and the least that comes in, at both ends of every range
    let mut sides: BTreeMap<String, (BTreeMap<String, Value>, BTreeMap<String, Value>)> = BTreeMap::new();
    let mut moves = |from: Option<&Value>, to: Option<&Value>, amts: &[Value]| {
        if amts.is_empty() {
            return;
        }
        let mut sorted = amts.to_vec();
        sorted.sort_by(|a, b| dcmp(&a["value"], &b["value"]));
        for (who, most) in [(from, true), (to, false)] {
            let Some(id) = who.and_then(Value::as_str) else { continue };
            let e = sides.entry(id.to_string()).or_default();
            let m = if most { &mut e.0 } else { &mut e.1 };
            for a in &sorted {
                let k = kind_key(a);
                let keep = match m.get(&k) {
                    None => true,
                    Some(x) => {
                        let c = dcmp(&a["value"], &x["value"]);
                        if most { c == core::cmp::Ordering::Greater } else { c == core::cmp::Ordering::Less }
                    }
                };
                if keep {
                    m.insert(k, a.clone());
                }
            }
        }
    };
    let mut money = vec![];
    if dtype == "promise" {
        let qs: Vec<Value> = ends(terms.get("quantity")).into_iter().filter(is_amt).collect();
        let ps = ends(terms.get("price"));
        if !named.is_empty() || terms.get("quantity").is_some() {
            moves(deal["refs"].get("from"), deal["refs"].get("to"), &qs);
        }
        let mut totals = vec![];
        for p in &ps {
            let qq: Vec<Option<&Value>> = if qs.is_empty() { vec![None] } else { qs.iter().map(Some).collect() };
            for q in qq {
                let mut t = json!({ "price": p });
                if let Some(st) = terms.get("step") {
                    t["step"] = st.clone();
                }
                if let Some(q) = q {
                    t["quantity"] = q.clone();
                }
                if let Some(x) = ask("terms_total", vec![t, q.cloned().unwrap_or(Value::Null)]).filter(is_amt) {
                    totals.push(x);
                }
            }
        }
        moves(deal["refs"].get("to"), deal["refs"].get("from"), &totals);
        if !totals.is_empty() {
            totals.sort_by(|a, b| dcmp(&b["value"], &a["value"]));
            let by = r.person(deal["refs"].get("to"));
            let tp = r.person(deal["refs"].get("from"));
            money.push(json!({ "amount": totals[0], "by": by, "to": tp, "draw": null }));
        }
    } else if dtype == "transfer" && absent(&deal["state"], "status") && is_amt(&deal["state"]["amount"]) && named.is_empty() {
        let a = deal["state"]["amount"].clone();
        moves(giver.as_ref(), receiver.as_ref(), core::slice::from_ref(&a));
        let by = r.person(giver.as_ref());
        let tp = r.person(receiver.as_ref());
        money.push(json!({ "amount": a, "by": by, "to": tp, "draw": null }));
    }
    let mut amounts = vec![];
    for (id, (out, inn)) in sides {
        let side = r.person(Some(&json!(id)));
        amounts.push(json!({ "side": side, "out": out.into_values().collect::<Vec<_>>(), "in": inn.into_values().collect::<Vec<_>>() }));
    }
    answer["amounts"] = json!(amounts);
    answer["money"] = json!(money);
    let wo = terms.get("waits_on").and_then(Value::as_str).filter(|x| *x == "price" || *x == "goods");
    answer["terms"] = json!({ "waits_on": wo });

    // a grant: what it can bind her to (worst_case, stage 4), who must hear each deal, the floor of what it may sell for
    if s(&block["type"]) == Some("grant") && s(&block["state"]["kind"]) != Some("key") {
        let wc = ask("worst_case", vec![block.clone(), all_v.clone()]).unwrap_or(Value::Null);
        if wc.get("not_shown").is_some_and(|x| x.as_bool() == Some(true)) {
            let l = wc["lacks"].as_array().cloned().unwrap_or_default();
            answer["grant"] = json!({ "not_shown": true, "lacks": l });
            r.lacks.extend(l);
        } else {
            let sc = if block["state"]["scope"].is_object() { block["state"]["scope"].clone() } else { json!({}) };
            let on = wc["on"].as_array().cloned().unwrap_or_default();
            for o in &on {
                r.read.insert(text_of(&o["promise"]));
            }
            for h in list(block["refs"].get("what")) {
                let h = text_of(&h);
                if r.has(&h) {
                    r.read.insert(h);
                } else {
                    r.lacks.push(json!(h));
                }
            }
            if let Some(m) = block["refs"]["meter"].as_str().filter(|m| r.has(m)) {
                r.read.insert(m.to_string());
            }
            let ck = if sc["clocks"].is_object() && sc["clocks"]["names"].is_array() { Some(sc["clocks"].clone()) } else { None };
            let mut names = vec![];
            for id in ck.as_ref().and_then(|c| c["names"].as_array().cloned()).unwrap_or_default() {
                let b = id.as_str().and_then(|i| r.get(i)).cloned();
                if b.is_some() {
                    r.read.insert(text_of(&id));
                }
                names.push(match b {
                    Some(b) if b["refs"]["author"].is_string() => {
                        let of = r.person(b["refs"].get("author"));
                        json!({ "block": { "id": id, "code": r.code(&text_of(&id)) }, "of": of })
                    }
                    _ => json!({ "block": null, "of": r.person(Some(&id)) }),
                });
            }
            let needed = ck.as_ref().map_or(0, |c| match c.get("needed").and_then(Value::as_f64) {
                Some(n) if n.fract() == 0.0 => n as i64,
                _ => names.len() as i64,
            });
            let backs: Vec<Value> = if names.len() == 1 {
                let of = names[0]["of"]["id"].clone();
                r.all
                    .iter()
                    .filter(|b| s(&b["type"]) == Some("promise") && b["refs"]["for"] == fid && !of.is_null() && b["refs"]["author"] == of && b["state"]["terms"].is_object() && b["state"]["terms"].get("backing").is_some())
                    .cloned()
                    .collect()
            } else {
                vec![]
            };
            let mut backed_by: Vec<Value> = vec![];
            for b in &backs {
                r.read.insert(text_of(&b["hash"]));
            }
            for b in &backs {
                let p = r.person(b["refs"].get("author"));
                if !backed_by.iter().any(|x| x["id"] == p["id"]) {
                    backed_by.push(p);
                }
            }
            let from_side: Vec<&Value> = on.iter().filter(|o| s(&o["side"]) == Some("from")).collect();
            let sold: BTreeSet<String> = from_side.iter().flat_map(|o| ends(o.get("quantity").filter(|q| !q.is_null()))).filter(is_amt).map(|a| kind_key(&a)).collect();
            let mut floor = vec![];
            for o in &from_side {
                let p = &o["price"];
                let one_of = p.get("one_of").is_some_and(Value::is_array);
                if p.is_object() && (p.get("min").is_some() || p.get("max").is_some() || one_of) {
                    let mut e: Vec<Value> = ends(Some(p)).into_iter().filter(|x| x.is_object() && is_amt(&x["amount"])).collect();
                    e.sort_by(|a, b| dcmp(&a["amount"]["value"], &b["amount"]["value"]));
                    if let Some(lo) = e.first() {
                        if p.get("max").is_none() || p.get("min").is_some() || one_of {
                            floor.push(lo.clone());
                        }
                    }
                }
            }
            let at_most = wc["at_most"].as_array().cloned().unwrap_or_default();
            let holder = r.person(wc.get("holder"));
            let clocks = ck.as_ref().map(|_| json!({ "hear": names, "all": needed == names.len() as i64, "one": needed == 1 && names.len() == 1 }));
            answer["grant"] = json!({
                "holder": holder,
                "can_lose": wc["can_lose"],
                "meter_own": wc["meter"] == json!("own"),
                "pays": wc["pays"] == Value::Bool(true),
                "pay_at_most": at_most.iter().filter(|x| !sold.contains(&kind_key(x))).cloned().collect::<Vec<_>>(),
                "hand_over_at_most": at_most.iter().filter(|x| sold.contains(&kind_key(x))).cloned().collect::<Vec<_>>(),
                "clocks": clocks.unwrap_or(Value::Null),
                "backed_by": backed_by,
                "floor": floor,
            });
        }
    }
    let _ = obj;
    finish(&mut r, answer)
}

// ------------------------------------------------------------------------------------------------------------------------------------
// renderers/en and renderers/en-sms
// ------------------------------------------------------------------------------------------------------------------------------------

struct Words<'a> {
    me: Option<&'a str>,
    seen: BTreeSet<String>,
    sms: bool,
}
impl Words<'_> {
    fn mine(&self, p: &Value) -> bool {
        p.is_object() && self.me.is_some() && p["id"].as_str() == self.me
    }
    fn who(&mut self, p: &Value) -> String {
        if !p.is_object() {
            return if self.sms { "an id not named" } else { "an id not named here" }.into();
        }
        if self.mine(p) {
            return "you".into();
        }
        let id = text_of(&p["id"]);
        let code = text_of(&p["code"]);
        if p["name"].is_null() {
            if !self.seen.insert(id) {
                return "that id".into();
            }
            return if self.sms { format!("unnamed id {code}") } else { format!("an id you have no name for ({code})") };
        }
        let name = text_of(&p["name"]);
        if !self.seen.insert(id) {
            return name;
        }
        if self.sms { format!("{name} {code}") } else { format!("{name} ({code})") }
    }
    fn whose(&mut self, p: &Value) -> String {
        if self.mine(p) { "your".into() } else { format!("{}'s", self.who(p)) }
    }
    fn says(&mut self, p: &Value) -> String {
        if self.mine(p) { "you say".into() } else { format!("{} says", self.who(p)) }
    }
    fn thing(&mut self, t: &Value) -> String {
        if t["name"].is_null() {
            return text_of(&t["code"]);
        }
        let name = text_of(&t["name"]);
        if !self.seen.insert(text_of(&t["id"])) {
            return name;
        }
        if self.sms { format!("{name} {}", text_of(&t["code"])) } else { format!("{name} ({})", text_of(&t["code"])) }
    }
}
fn amt(x: &Value) -> String {
    format!("{} {}", text_of(&x["value"]), text_of(&x["unit"]))
}
fn cap(t: &str) -> String {
    let mut c = t.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}
fn and(l: &[String]) -> String {
    match l.len() {
        0 => String::new(),
        1 => l[0].clone(),
        n => format!("{} and {}", l[..n - 1].join(", "), l[n - 1]),
    }
}
fn money_kind(x: &Value) -> String {
    format!("{}|{}", text_of(&x["unit"]), x.get("of").filter(|o| !o.is_null() && o.as_str() != Some("")).map(text_of).unwrap_or_default())
}

/// A renderer's words for one answer of `readings/readback`: `en` (a line each) or `en-sms` (short, for a basic phone). It reads the answer only.
pub fn render(a: &Value, renderer: &str) -> Option<String> {
    let sms = match renderer {
        "en" => false,
        "en-sms" => true,
        _ => return None,
    };
    let me = a["viewer"].get("id").and_then(Value::as_str).filter(|_| a["viewer"].is_object());
    let mut w = Words { me, seen: BTreeSet::new(), sms };
    let join = if sms { " " } else { "\n" };
    let mut out: Vec<String> = vec![];
    let signer = a["for"]["signer"].clone();
    let not_me = |w: &Words, p: &Value| p.is_object() && !w.mine(p);
    if not_me(&w, &signer) {
        let x = w.who(&signer);
        out.push(if sms { format!("{}:", cap(&x)) } else { format!("From {x}.") });
    } else if a["other"].is_object() {
        let x = w.who(&a["other"]);
        out.push(if sms { format!("To {x}:") } else { format!("To {x}.") });
    }
    let truthy = |v: &Value| !(v.is_null() || v == &Value::Bool(false) || v.as_u64() == Some(0) || v.as_str() == Some(""));
    if truthy(&a["not_valid"]) {
        out.push(if sms { "no key signed this as it is." } else { "No key signed this as it stands." }.into());
        return Some(out.join(join));
    }
    if truthy(&a["not_shown"]) {
        let n = a["lacks"].as_array().map_or(0, Vec::len);
        let x = w.whose(&signer);
        out.push(if sms { format!("can't tell yet; {n} of {x} blocks missing.") } else { format!("Can't tell yet: {n} of {x} blocks {} missing.", if n == 1 { "is" } else { "are" }) });
        return Some(out.join(join));
    }
    if a["not_read"].is_object() {
        let nr = &a["not_read"];
        let fields = nr["fields"].as_u64().unwrap_or(0);
        let rules = nr["rule_set"] == Value::Bool(true) && fields == 0;
        out.push(match (sms, rules) {
            (false, true) => "Your reader does not read the rules this names, so it cannot say what this binds you to. Nothing was guessed.".into(),
            (false, false) => format!("Your reader does not read {} here, so it cannot say what this binds you to. Nothing was guessed.", if fields <= 1 { "one field".into() } else { format!("{fields} fields") }),
            (true, true) => "your reader can't read the rules this names; nothing guessed.".into(),
            (true, false) => format!("your reader can't read {} here; nothing guessed.", if fields <= 1 { "1 field".into() } else { format!("{fields} fields") }),
        });
        return Some(out.join(join));
    }
    if truthy(&a["first_deal"]) && not_me(&w, &signer) {
        out.push(format!("First deal with this {}.", if a["other_side"] == json!("to") { "buyer" } else { "seller" }));
    }
    if a["audience"] != json!("public") && not_me(&w, &signer) {
        out.push(format!("{} readers; you {} only yourself.", text_of(&a["audience"]["readers"]), if sms { "see" } else { "can see" }));
    }
    // the deal's own words, quoted word for word, never read
    if a["what"].is_object() {
        let x = w.whose(&a["what"]["by"]);
        out.push(format!("In {x} words: \"{}\".", text_of(&a["what"]["text"])));
    }
    for l in a["things"].as_array().into_iter().flatten() {
        let to = &l["to"];
        let mine = w.mine(to);
        let d = &l["draw"];
        if l["what"]["pack"].is_object() && mine && d.is_object() && d["state"] == json!("held") {
            let t = w.thing(&l["what"]);
            let x = w.whose(&l["what"]["stated_by"]);
            out.push(if sms { format!("{t}: {}, {x} word.", amt(&l["what"]["pack"])) } else { format!("{t}: {}, on {x} word.", amt(&l["what"]["pack"])) });
        }
        if l["pair"].is_array() && !(d.is_object() && d["why"] == json!("pair")) {
            let t = w.thing(&l["what"]);
            let x = w.who(&l["by"]);
            out.push(format!("{t}: {x} signed it twice."));
        }
        if d == &json!("not_drawn") {
            continue;
        }
        if d.is_null() {
            if l["amount"].is_object() && mine && not_me(&w, &l["by"]) && signer.is_object() && l["by"]["id"] == signer["id"] {
                let t = w.thing(&l["what"]);
                let x = w.whose(&l["by"]);
                out.push(if sms { format!("{t} {}: {x} word; nothing set aside.", amt(&l["amount"])) } else { format!("{t}, {}: {x} word; nothing set aside.", amt(&l["amount"])) });
            }
            continue;
        }
        let t = w.thing(&l["what"]);
        let state = d["state"].as_str().filter(|x| !x.is_empty());
        let why = d["why"].as_str().filter(|x| !x.is_empty());
        let line = if truthy(&d["not_shown"]) {
            let n = d["lacks"].as_array().map_or(0, Vec::len);
            let x = w.whose(&l["by"]);
            if sms { format!("{t}: can't tell yet; {n} of {x} blocks missing.") } else { format!("{t}: can't tell yet: {n} of {x} blocks {} missing.", if n == 1 { "is" } else { "are" }) }
        } else if state == Some("landed") {
            if mine { format!("{t}: yours.") } else { format!("{t}: {}.", w.whose(to)) }
        } else if state == Some("held") && l["holder"].is_object() {
            let (a1, a2, a3) = (w.who(to), w.who(&l["holder"]), w.says(&l["freer"]));
            if sms { format!("{t}: held for {a1} by {a2} till {a3} no.") } else { format!("{t}: held for {a1} by {a2}, until {a3} no.") }
        } else if state == Some("held") {
            let a1 = w.who(to);
            let a2 = w.whose(&l["by"]);
            if sms {
                let a3 = w.says(&l["freer"]);
                format!("{t}: kept for {a1} in {a2} hands till {a3} no.")
            } else {
                let rec = if mine { format!(", on {} record as you hold it", w.whose(&l["by"])) } else { String::new() };
                let a3 = w.says(&l["freer"]);
                format!("{t}: kept for {a1}, in {a2} hands{rec}, until {a3} no.")
            }
        } else if state == Some("freed") {
            let x = w.who(&l["by"]);
            if sms { format!("{t}: freed; {x} may sell it again.") } else { format!("{t}: freed: {x} may sell it again.") }
        } else if why == Some("past") || why == Some("not_owner") {
            let x = w.whose(&l["by"]);
            if sms { format!("{t}: not {x} to give.") } else { format!("{t}: not {x} to give: already another's.") }
        } else if why == Some("pair") {
            let x = w.who(&l["by"]);
            let to_me = l["pair"].as_array().is_some_and(|p| p.iter().any(|e| w.mine(&e["to"])));
            if sms { format!("{t}: {x} signed it twice{}", if to_me { "; neither shown as yours." } else { "." }) } else { format!("{t}: {x} signed it twice.{}", if to_me { " Neither is shown as yours." } else { "" }) }
        } else if why.is_some() {
            let x = w.whose(&l["by"]);
            if sms { format!("{t}: {x} word takes none of it.") } else { format!("{t}: {x} word here takes none of it.") }
        } else {
            format!("{t}: can't tell yet.")
        };
        out.push(line);
    }
    let money = a["money"].as_array().cloned().unwrap_or_default();
    for m in &money {
        if w.mine(&m["to"]) && not_me(&w, &m["by"]) && signer.is_object() && m["by"]["id"] == signer["id"] {
            let x = w.whose(&m["by"]);
            out.push(format!("{} to you: {x} word; nothing set aside.", amt(&m["amount"])));
        }
    }
    let kinds: BTreeSet<String> = money.iter().map(|m| money_kind(&m["amount"])).collect();
    if let Some(mine) = a["amounts"].as_array().into_iter().flatten().find(|x| w.mine(&x["side"])) {
        for x in mine["out"].as_array().into_iter().flatten().filter(|x| kinds.contains(&money_kind(x))) {
            out.push(if sms { format!("You pay max {}.", amt(x)) } else { format!("You pay at most {} in all.", amt(x)) });
        }
        for x in mine["in"].as_array().into_iter().flatten().filter(|x| kinds.contains(&money_kind(x))) {
            out.push(if sms { format!("You may get as little as {}.", amt(x)) } else { format!("You may be paid as little as {}.", amt(x)) });
        }
    }
    let first = money.first().cloned().unwrap_or(Value::Null);
    if a["terms"]["waits_on"] == json!("price") {
        let x = w.says(&first["to"]);
        out.push(cap(&format!("done when {x} so.")));
    }
    if a["terms"]["waits_on"] == json!("goods") {
        let x = w.says(&first["by"]);
        out.push(cap(&if sms { format!("pay when {x} it came.") } else { format!("paid when {x} it came.") }));
    }
    let g = &a["grant"];
    if g.is_object() && truthy(&g["not_shown"]) {
        out.push(if sms { "Most you can be made to pay: can't tell yet." } else { "The most you can be made to pay: can't tell yet." }.into());
    } else if g.is_object() {
        for x in g["pay_at_most"].as_array().into_iter().flatten() {
            out.push(if sms { format!("You pay max {}.", amt(x)) } else { format!("You pay at most {} in all.", amt(x)) });
        }
        for x in g["hand_over_at_most"].as_array().into_iter().flatten() {
            out.push(if sms { format!("You hand over max {}.", amt(x)) } else { format!("You hand over at most {} in all.", amt(x)) });
        }
        let lose: Vec<String> = g["can_lose"].as_array().into_iter().flatten().map(amt).collect();
        out.push(if lose.is_empty() {
            "It can give away nothing of yours.".into()
        } else if sms {
            format!("It can give away up to {}.", and(&lose))
        } else {
            format!("It can give away up to these {}.", and(&lose))
        });
        if g["meter_own"] == Value::Bool(true) {
            out.push("A copied key could show this to several sellers.".into());
        }
        for f in g["floor"].as_array().into_iter().flatten() {
            let h = cap(&w.who(&g["holder"]));
            out.push(if sms {
                format!("{h} may sell at {} per {} or more; every buyer sees it.", amt(&f["amount"]), amt(&f["per"]))
            } else {
                format!("{h} may sell for as little as {} per {}. Every buyer can read this.", amt(&f["amount"]), amt(&f["per"]))
            });
        }
        if g["clocks"].is_object() {
            let c = &g["clocks"];
            let mut names = vec![];
            for k in c["hear"].as_array().into_iter().flatten() {
                names.push(if k["block"].is_object() { format!("{} key {}", w.whose(&k["of"]), text_of(&k["block"]["code"])) } else { w.who(&k["of"]) });
            }
            if c["one"] == Value::Bool(true) {
                let back = g["backed_by"].as_array().and_then(|b| b.first()).cloned();
                let tail = match back {
                    Some(b) => format!("; if it misses it, {} pays you back.", w.who(&b)),
                    None => ".".into(),
                };
                out.push(format!("Only {} hears your STOP{tail}", names.first().cloned().unwrap_or_default()));
            } else if c["all"] == Value::Bool(true) {
                let two = names.len() == 2;
                out.push(if sms {
                    format!("{} must {} hear each deal.", cap(&and(&names)), if two { "both" } else { "all" })
                } else {
                    format!("{} must {} hear each deal. If {} is silent, deals wait.", cap(&and(&names)), if two { "both" } else { "all" }, if two { "either" } else { "one" })
                });
            } else {
                out.push(format!("{} hear each deal and your STOP.", cap(&and(&names))));
            }
        }
        if g["pays"] == Value::Bool(true) {
            out.push(if sms { "Your bank's limit, not this, caps what it moves there." } else { "What it can move on your bank is your bank's limit, not this." }.into());
        }
    }
    Some(out.join(join))
}

// ------------------------------------------------------------------------------------------------------------------------------------
// The door ops
// ------------------------------------------------------------------------------------------------------------------------------------

fn text_with(rendered: String, digits: Option<&str>) -> String {
    match digits {
        Some(d) => format!("{rendered} {d}"),
        None => rendered,
    }
}

/// `readback(block, held, to?, renderer?, digits?)`: `{ answer, text, state }`, `state` exactly the state of the `observe` an honest host signs;
/// for en-sms also `texts`, the text whole over texts of at most 160 characters, in order (the digest is still of the one text).
pub fn readback(block: &Value, held: &[Value], to: Option<&str>, renderer: &str, digits: Option<&str>) -> Option<Value> {
    let answer = reading(block, held, to);
    let text = text_with(render(&answer, renderer)?, digits);
    let n = names();
    let mut state = json!({ "kind": "readback", "readback": crate::block::hash_hex(&text), "reading": n["reading"], "renderer": n[renderer], "read": answer["read"] });
    if let Some(d) = digits {
        state["digits"] = json!(d);
    }
    if renderer == "en-sms" {
        let texts = sms_texts(&text);
        return Some(json!({ "answer": answer, "text": text, "texts": texts, "state": state }));
    }
    Some(json!({ "answer": answer, "text": text, "state": state }))
}

/// en-sms (renderers/en-sms.md, Texts): a text longer than 160 characters runs whole over several texts, in order, never cut short.
/// Each takes the most whole words that fit 160 characters (code points), split at a space that is dropped; a longer word is cut every 160.
fn sms_texts(text: &str) -> Vec<String> {
    const SMS: usize = 160;
    if text.chars().count() <= SMS {
        return vec![text.to_string()];
    }
    let mut out: Vec<String> = vec![];
    let mut cur: Option<Vec<char>> = None;
    for word in text.split(' ') {
        let mut w: Vec<char> = word.chars().collect();
        if let Some(c) = cur.as_mut() {
            if c.len() + 1 + w.len() <= SMS {
                c.push(' ');
                c.extend(w);
                continue;
            }
        }
        if let Some(c) = cur.take() {
            out.push(c.into_iter().collect());
        }
        while w.len() > SMS {
            out.push(w[..SMS].iter().collect());
            w = w[SMS..].to_vec();
        }
        cur = Some(w);
    }
    out.push(cur.unwrap_or_default().into_iter().collect());
    out
}

/// `readback_redo(rb, held)`: `{ same, readback, lacks, not_run }`, run on the ids of `rb.state.read` (and `refs.for`) alone.
pub fn redo(rb: &Value, held: &[Value]) -> Value {
    let st = &rb["state"];
    let n = names();
    let mut by_id: BTreeMap<String, Value> = BTreeMap::new();
    for b in held.iter().filter(|b| b.is_object() && b["hash"].is_string() && b["type"].is_string()) {
        by_id.insert(text_of(&b["hash"]), b.clone());
    }
    let renderer = ["en", "en-sms"].into_iter().find(|k| !n[*k].as_str().unwrap_or("").is_empty() && n[*k] == st["renderer"]);
    let mut not_run = vec![];
    if st.get("reading") != Some(&n["reading"]) {
        not_run.push(st.get("reading").cloned().unwrap_or(Value::Null));
    }
    if renderer.is_none() {
        not_run.push(st.get("renderer").cloned().unwrap_or(Value::Null));
    }
    let inputs: Vec<String> = st["read"].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect();
    let for_id = rb["refs"]["for"].as_str().map(String::from);
    let mut want: BTreeSet<String> = inputs.iter().cloned().collect();
    if let Some(f) = &for_id {
        want.insert(f.clone());
    }
    let mut lacks: Vec<Value> = want.into_iter().filter(|i| !by_id.contains_key(i)).map(Value::String).collect();
    if for_id.is_none() && lacks.is_empty() {
        lacks.push(Value::Null);
    }
    if !not_run.is_empty() || !lacks.is_empty() {
        return json!({ "same": null, "readback": null, "lacks": lacks, "not_run": not_run });
    }
    let for_id = for_id.unwrap_or_default();
    let given: Vec<Value> = inputs.iter().filter_map(|i| by_id.get(i).cloned()).collect();
    let answer = reading(&by_id[&for_id], &given, rb["refs"]["to"].as_str());
    let digits = match st.get("digits") {
        None | Some(Value::Null) => None,
        Some(Value::String(d)) => Some(d.clone()),
        Some(x) => Some(x.to_string()),
    };
    let digest = crate::block::hash_hex(&text_with(render(&answer, renderer.unwrap_or("en")).unwrap_or_default(), digits.as_deref()));
    json!({ "same": st["readback"] == json!(digest), "readback": digest, "lacks": [], "not_run": [] })
}
