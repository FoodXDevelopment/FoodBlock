//! The conformance vectors (spec/vectors.json) through the JSON door of this crate: every section, as
//! spec/run-vectors.cjs runs them through the JavaScript SDK (which is the same door in WebAssembly).
use foodblock::door::answer;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

fn vectors() -> Value {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/vectors.json")).unwrap();
    serde_json::from_str(&text).unwrap()
}
fn adversarial() -> Value {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/canonical-vectors.json")).unwrap();
    serde_json::from_str(&text).unwrap()
}

/// One call of the door: Ok(value) or Err(the error answer).
fn call(op: &str, args: Value) -> Result<Value, Value> {
    let out = answer(op.as_bytes(), args.to_string().as_bytes());
    match out.get("ok") {
        Some(v) => Ok(v.clone()),
        None => Err(out),
    }
}
fn ok(op: &str, args: Value) -> Value {
    call(op, args.clone()).unwrap_or_else(|e| panic!("{op} {args:.200}: {e}"))
}
fn codes_of(list: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for r in list.as_array().cloned().unwrap_or_default() {
        let c = r["code"].as_str().unwrap_or("").to_string();
        if !out.contains(&c) {
            out.push(c);
        }
    }
    out
}
fn strs(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().map(|x| x.as_str().unwrap_or("").to_string()).collect()).unwrap_or_default()
}
fn full(b: &Value) -> Value {
    let mut o = Map::new();
    o.insert("hash".into(), b["hash"].clone());
    for k in ["type", "state", "refs"] {
        o.insert(k.into(), b["block"][k].clone());
    }
    if let Some(s) = b.get("suite") {
        o.insert("suite".into(), s.clone());
    }
    o.insert("signature".into(), b["signature"].clone());
    Value::Object(o)
}
fn blocks_of(list: &Value) -> Value {
    Value::Array(list.as_array().unwrap().iter().map(full).collect())
}
fn subset(got: &Value, want: &Value) -> bool {
    match (got, want) {
        (Value::Array(g), Value::Array(w)) if g.len() == w.len() => g.iter().zip(w).all(|(a, b)| subset(a, b)),
        (g, Value::Object(w)) => w.iter().all(|(k, v)| subset(g.get(k).unwrap_or(&Value::Null), v)),
        (Value::Number(a), Value::Number(b)) => a.as_f64() == b.as_f64(),
        (g, w) => g == w,
    }
}
fn sorted(mut v: Vec<String>) -> Vec<String> {
    v.sort();
    v
}

struct Tally {
    pass: usize,
    failed: Vec<String>,
}
impl Tally {
    fn check(&mut self, ok: bool, name: impl Into<String>) {
        if ok {
            self.pass += 1;
        } else {
            self.failed.push(name.into());
        }
    }
}

#[test]
fn every_vector_section() {
    let v = vectors();
    let mut t = Tally { pass: 0, failed: vec![] };
    let key = |name: &str, field: &str| v["keys"][name][field].as_str().unwrap_or("").to_string();

    // Canonical form.
    for c in adversarial()["vectors"].as_array().unwrap() {
        let b = &c["block"];
        let canon = |b: &Value| ok("canonical", json!([b["type"], b["state"], b["refs"]]));
        let hash = |b: &Value| ok("hash", json!([b["type"], b["state"], b["refs"]]));
        let mut good = true;
        if let Some(s) = c.get("same_as") {
            good &= hash(b) == hash(s);
        }
        if let Some(s) = c.get("not_same_as") {
            good &= hash(b) != hash(s);
        }
        if let Some(s) = c["canonical_contains"].as_str() {
            good &= canon(b).as_str().unwrap().contains(s);
        }
        if let Some(s) = c["canonical"].as_str() {
            good &= canon(b).as_str().unwrap() == s;
        }
        if let Some(r) = c.get("refused") {
            let found = codes_of(&ok("refusals", json!([b["type"], b["state"], b["refs"]])));
            good &= strs(r).iter().all(|code| found.contains(code));
        }
        t.check(good, format!("canonical: {}", c["name"]));
    }
    let older: Value = serde_json::from_str(&std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../test/vectors.json")).unwrap()).unwrap();
    for c in older.as_array().unwrap() {
        let args = json!([c["type"], c["state"], c["refs"]]);
        t.check(ok("canonical", args.clone()) == c["expected_canonical"] && ok("hash", args) == c["expected_hash"], format!("canonical (test/vectors.json): {}", c["name"]));
    }
    for c in v["canonical"].as_array().unwrap() {
        let b = &c["block"];
        let args = json!([b["type"], b["state"], b["refs"]]);
        t.check(ok("canonical", args.clone()) == c["canonical"] && ok("hash", args) == c["hash"], format!("canonical: {}", c["name"]));
    }

    // The ledger: valid against the blocks before it, a signature that opens, one chain per author.
    let mut by_hash: BTreeMap<String, Value> = BTreeMap::new();
    let mut before: Vec<Value> = vec![];
    let ledger: Vec<&Value> = v["ledger"]["genesis"].as_array().unwrap().iter().chain(v["hashes"].as_array().unwrap()).collect();
    for e in &ledger {
        let b = full(e);
        by_hash.insert(e["hash"].as_str().unwrap().to_string(), (*e).clone());
        let signer_pub = key(e["signer"].as_str().unwrap(), "public_key_sign");
        let args = json!([e["block"]["type"], e["block"]["state"], e["block"]["refs"]]);
        t.check(ok("hash", args) == e["hash"] && ok("verify", json!([b, e["signature"], signer_pub])) == json!(true), format!("ledger: {}", e["name"]));
        let wrong = ok("valid", json!([b, before]));
        t.check(wrong.as_array().unwrap().is_empty(), format!("valid: {} {wrong}", e["name"]));
        before.push(b);
    }
    for c in v["audience"].as_array().unwrap() {
        t.check(ok("salted_hash", json!([c["salt"], c["recipient"]])) == c["commitment"], format!("audience: {}", c["name"]));
    }

    // Stories: every block hashes, verifies and passes the strict check.
    let mut stories: Vec<(String, Value)> = vec![];
    for k in ["identities", "deals", "circles"] {
        for s in v[k].as_array().unwrap() {
            stories.push((format!("{k}: {}", s["name"]), s["blocks"].clone()));
        }
    }
    for k in ["promises", "circles", "audience", "things", "successors", "rekeys", "ballots"] {
        for s in v["folds"][k].as_array().unwrap() {
            stories.push((format!("{k} fold: {}", s["name"]), s["blocks"].clone()));
        }
    }
    stories.push(("refusal stories".into(), v["refusals"]["blocks"].clone()));
    stories.push(("sealed stories".into(), v["sealed"]["blocks"].clone()));
    for c in v["refusals"]["cases"].as_array().unwrap() {
        if c.get("blocks").is_some() {
            stories.push((format!("refusal: {}", c["name"]), c["blocks"].clone()));
        }
    }
    let mut refusal_blocks: BTreeMap<String, Value> = BTreeMap::new();
    for (name, list) in &stories {
        let mut wrong: Vec<String> = vec![];
        for e in list.as_array().unwrap() {
            let b = full(e);
            by_hash.insert(e["hash"].as_str().unwrap().to_string(), e.clone());
            refusal_blocks.insert(e["hash"].as_str().unwrap().to_string(), b.clone());
            let suite = e.get("suite").cloned().unwrap_or(json!("std"));
            let args = json!([e["block"]["type"], e["block"]["state"], e["block"]["refs"], suite]);
            if ok("hash", args) != e["hash"] {
                wrong.push(format!("{}: hash", e["name"]));
            }
            if ok("verify", json!([b, e["signature"], key(e["signer"].as_str().unwrap(), "public_key_sign")])) != json!(true) {
                wrong.push(format!("{}: signature", e["name"]));
            }
            let found = ok("refusals", json!([e["block"]["type"], e["block"]["state"], e["block"]["refs"]]));
            if !found.as_array().unwrap().is_empty() {
                wrong.push(format!("{}: {:?}", e["name"], codes_of(&found)));
            }
        }
        t.check(wrong.is_empty(), format!("story {name}: {}", wrong.join(" | ")));
    }
    for c in v["signatures"].as_array().unwrap() {
        let b = &by_hash[c["hash"].as_str().unwrap()];
        t.check(ok("verify", json!([full(b), c["signature"], key(c["signer"].as_str().unwrap(), "public_key_sign")])) == json!(true), format!("signature: {}", c["name"]));
    }
    for c in v["bad_signatures"].as_array().unwrap() {
        let b = &by_hash[c["hash"].as_str().unwrap()];
        t.check(ok("verify", json!([full(b), c["signature"], key(c["signer"].as_str().unwrap(), "public_key_sign")])) == json!(false), format!("bad signature: {}", c["name"]));
    }

    // Envelopes, sealed copies, headers.
    for c in v["envelopes"].as_array().unwrap() {
        let inside = ok("open", json!([c["envelope"], key(c["recipient"].as_str().unwrap(), "x25519_private")]));
        let m = ok("unwrap", json!([inside]));
        t.check(m["hash"] == c["opens_to"]["hash"] && m["signature"] == c["opens_to"]["signature"] && m["version"] == c["opens_to"]["version"], format!("envelope: {}", c["name"]));
    }
    for c in v["sealed"]["cases"].as_array().unwrap() {
        let m = ok("open_copy", json!([c["message"], key(c["recipient"].as_str().unwrap(), "x25519_private")]));
        let signed = ok("header_signed_by", json!([c["message"], key(c["signer"].as_str().unwrap(), "public_key_sign")])) == json!(true);
        t.check(m["hash"] == c["opens_to"]["hash"] && m["signature"] == c["opens_to"]["signature"] && m["reveals"] == c["opens_to"]["reveals"] && signed, format!("sealed: {}", c["name"]));
    }
    for c in v["headers"].as_array().unwrap() {
        let b = full(&by_hash[c["hash"].as_str().unwrap()]);
        let mut part = c["header"].clone();
        part["signature"] = c["header_signature"].clone();
        t.check(ok("header", json!([b])) == c["header"] && ok("verify_message", json!([part, key(c["signer"].as_str().unwrap(), "public_key_sign")])) == json!(true), format!("header: {}", c["name"]));
    }

    // Identities.
    for c in v["identities"].as_array().unwrap() {
        let held = blocks_of(&c["blocks"]);
        let arrivals = c.get("arrivals").cloned().unwrap_or(Value::Null);
        for e in c["blocks"].as_array().unwrap() {
            if let Some(want) = c["signed_by_author"].get(e["hash"].as_str().unwrap()) {
                let got = ok("signed_by_author", json!([full(e), held, arrivals]));
                t.check(&got == want, format!("identity: {}: {} stands={want}", c["name"], e["name"]));
            }
        }
        let keys = sorted(strs(&ok("keys_of", json!([c["id"], held, arrivals]))));
        t.check(json!(keys) == c["keys"], format!("identity: {}: keys", c["name"]));
        if let Some(f) = c.get("frozen") {
            let timeline = ok("key_timeline", json!([c["id"], held, Value::Null]));
            let frozen: Vec<String> = sorted(timeline.as_array().unwrap().iter().filter(|k| k["frozen"] == json!(true)).map(|k| k["key"].as_str().unwrap().to_string()).collect());
            t.check(&json!(frozen) == f, format!("identity: {}: frozen", c["name"]));
        }
        if let Some(o) = c.get("operators") {
            t.check(&ok("operators_of", json!([c["id"], held, Value::Null])) == o, format!("identity: {}: operators", c["name"]));
        }
        let state = ok("identity_state", json!([c["id"], held, arrivals]));
        let all_stand = c["signed_by_author"].as_object().unwrap().iter().all(|(h, want)| state["signed_by_author"].get(h).is_none_or(|g| g == want));
        t.check(state["keys"] == c["keys"] && all_stand && c.get("frozen").is_none_or(|f| &state["frozen"] == f), format!("identity: {}: the fold", c["name"]));
        if let Some(f) = c.get("fence") {
            let find = |h: &Value| held.as_array().unwrap().iter().find(|b| &b["hash"] == h).unwrap().clone();
            let limit = find(&f["block"]);
            let salt = f["salt"].clone();
            let finds = |who: &Value| ok("finds_self", json!([limit, who, salt])) == json!(true);
            t.check(limit["refs"]["for"] == f["grant"] && limit["state"]["limit"] == f["limit"] && finds(&f["agent"]) && !finds(&f["principal"]), format!("identity: {}: sealed to the agent alone", c["name"]));
            let without: Vec<Value> = held.as_array().unwrap().iter().filter(|b| b["hash"] != limit["hash"]).cloned().collect();
            let same_check = c["under"].as_object().unwrap().keys().all(|h| ok("why_not_under", json!([find(&json!(h)), held, Value::Null])) == ok("why_not_under", json!([find(&json!(h)), without, Value::Null])));
            t.check(same_check, format!("identity: {}: the grant check never reads the limit", c["name"]));
            let within = f["within"].as_array().unwrap().iter().all(|w| ok("within_limit", json!([limit, w["money"], w["spent"]])) == w["within"]);
            t.check(within, format!("identity: {}: within_limit", c["name"]));
        }
        for (h, live) in c.get("under").and_then(Value::as_object).cloned().unwrap_or_default() {
            let b = held.as_array().unwrap().iter().find(|b| b["hash"] == json!(h)).unwrap().clone();
            let why = ok("why_not_under", json!([b, held, Value::Null]));
            t.check(why.as_array().unwrap().is_empty() == live.as_bool().unwrap(), format!("identity: {}: under", c["name"]));
        }
    }

    // Folds.
    let stage = |c: &Value| {
        let held = blocks_of(&c["blocks"]);
        let first = held.as_array().unwrap().iter().find(|b| b["hash"] == c["first"]).unwrap().clone();
        ok("promise_stage", json!([first, held, {}]))
    };
    for c in v["deals"].as_array().unwrap().iter().chain(v["folds"]["promises"].as_array().unwrap()) {
        t.check(subset(&stage(c), &c["expected"]), format!("promise fold: {}", c["name"]));
    }
    for c in v["circles"].as_array().unwrap().iter().chain(v["folds"]["circles"].as_array().unwrap()) {
        let held = blocks_of(&c["blocks"]);
        let state = ok("circle_state", json!([c["circle"], held, Value::Null]));
        let members = if c["expected"]["members"].is_array() {
            json!(sorted(state["members"].as_object().unwrap().keys().cloned().collect()))
        } else {
            Value::Object(state["members"].as_object().unwrap().iter().map(|(k, m)| (k.clone(), json!(sorted(strs(&m["roles"]))))).collect())
        };
        let mut good = members == c["expected"]["members"] && json!(sorted(state["removed"].as_object().unwrap().keys().cloned().collect())) == c["expected"]["removed"];
        if let Some(ct) = c["expected"].get("counted_to") {
            good &= &state["removed"] == ct;
        }
        for (h, want) in c.get("may_act").and_then(Value::as_object).cloned().unwrap_or_default() {
            let b = held.as_array().unwrap().iter().find(|b| b["hash"] == json!(h)).unwrap().clone();
            good &= ok("may_act_as", json!([b, c["circle"], held, Value::Null])) == want;
        }
        t.check(good, format!("circle fold: {}", c["name"]));
    }
    for c in v["folds"]["audience"].as_array().unwrap() {
        let held = blocks_of(&c["blocks"]);
        for k in c["cases"].as_array().unwrap() {
            let b = held.as_array().unwrap().iter().find(|b| b["hash"] == k["block"]).unwrap().clone();
            t.check(ok("members_then", json!([b, k["recipient"], held])) == k["members"], format!("audience fold: {}", k["name"]));
        }
    }
    for c in v["folds"]["things"].as_array().unwrap() {
        let held = blocks_of(&c["blocks"]);
        let find = |h: &Value| held.as_array().unwrap().iter().find(|b| &b["hash"] == h).unwrap().clone();
        for k in c["where"].as_array().unwrap() {
            t.check(ok("where_now", json!([find(&k["thing"]), held])) == k["places"], format!("where now: {}", k["name"]));
        }
        for k in c["owners"].as_array().unwrap() {
            let o = ok("ownership", json!([find(&k["thing"]), held]));
            t.check(o["owner"] == k["owner"] && o["conflict"] == k["conflict"], format!("owner: {}", k["name"]));
        }
    }
    for c in v["folds"]["successors"].as_array().unwrap() {
        let held = blocks_of(&c["blocks"]);
        let grant = held.as_array().unwrap().iter().find(|b| b["hash"] == c["grant"]).unwrap().clone();
        t.check(subset(&ok("successor_view", json!([grant, held, c["now"], c["arrivals"]])), &c["expected"]), format!("successor: {}", c["name"]));
    }
    for c in v["folds"]["ballots"].as_array().unwrap() {
        let held = blocks_of(&c["blocks"]);
        for k in c["cases"].as_array().unwrap() {
            let r = held.as_array().unwrap().iter().find(|b| b["hash"] == k["result"]).unwrap().clone();
            t.check(ok("counted_in", json!([r, k["commitment"], k["counter"]])) == k["counted"], format!("ballot: {}", k["name"]));
        }
    }
    for c in v["folds"]["rekeys"].as_array().unwrap() {
        t.check(subset(&ok("circle_key", json!([c["circle"], blocks_of(&c["blocks"])])), &c["expected"]), format!("circle key: {}", c["name"]));
    }

    // Refusals.
    for c in v["refusals"]["cases"].as_array().unwrap() {
        let by = c["by"].as_str().unwrap();
        let held: Vec<Value> = c["held"].as_array().map(|h| h.iter().map(|x| refusal_blocks[x.as_str().unwrap()].clone()).collect()).unwrap_or_default();
        let good = match by {
            "check" => codes_of(&ok("refusals", json!([c["block"]["type"], c["block"]["state"], c["block"]["refs"], held]))) == strs(&c["codes"]),
            "valid" => codes_of(&ok("valid", json!([c["block"], held]))) == strs(&c["codes"]),
            "accept" => {
                let incoming: Vec<Value> = match c.get("inline") {
                    Some(i) => i.as_array().unwrap().clone(),
                    None => c["incoming"].as_array().unwrap().iter().map(|h| refusal_blocks[h.as_str().unwrap()].clone()).collect(),
                };
                let got = ok("accept", json!([incoming, held, Value::Null, Value::Null]));
                if let Some(e) = c.get("equivocations") {
                    got["taken"] == c["taken"] && got["refused"].as_array().unwrap().is_empty() && &got["equivocations"] == e
                } else if let Some(w) = c.get("waiting") {
                    json!(got["waiting"].as_array().unwrap().iter().map(|x| x["hash"].clone()).collect::<Vec<_>>()) == *w && got["refused"].as_array().unwrap().is_empty()
                } else if c.get("taken").is_some() {
                    got["taken"] == c["taken"]
                } else {
                    c["incoming"].as_array().unwrap().iter().all(|h| got["refused"].as_array().unwrap().iter().any(|r| &r["hash"] == h)) && codes_of(&got["refused"]) == strs(&c["codes"])
                }
            }
            "fold" => subset(&stage(c), &c["expected"]),
            "may_act_as" => {
                let held = blocks_of(&c["blocks"]);
                let b = held.as_array().unwrap().iter().find(|b| b["hash"] == c["block"]).unwrap().clone();
                ok("may_act_as", json!([b, c["circle"], held, Value::Null])) == c["ok"]
            }
            "under" => {
                let all: Vec<Value> = refusal_blocks.values().cloned().collect();
                let b = refusal_blocks[c["block"].as_str().unwrap()].clone();
                ok("why_not_under", json!([b, all, Value::Null])).as_array().unwrap().is_empty() == c["live"].as_bool().unwrap()
            }
            "open" => match call("open_copy", json!([c["message"], key(c["recipient"].as_str().unwrap(), "x25519_private")])) {
                Ok(_) => false,
                Err(e) => json!([e["code"]]) == c["codes"],
            },
            _ => false,
        };
        t.check(good, format!("refused ({by}): {}", c["name"]));
    }

    // Messages.
    let m = &v["messages"];
    let node = m["node"].clone();
    let fresh = |o: Value| o;
    let jem = key(m["signed_pull"]["signer"].as_str().unwrap(), "public_key_sign");
    let p = &m["signed_pull"];
    let pull = |msg: &Value, o: Value| ok("pull_refusals", json!([msg, o]));
    t.check(pull(&p["message"], fresh(json!({ "node": node, "keys": [jem], "highest": p["highest"] }))).as_array().unwrap().is_empty() && p["message"].get("at").is_none(), "message: signed pull");
    t.check(codes_of(&pull(&p["message"], json!({ "node": node, "keys": [jem], "highest": p["message"]["counter"] }))) == vec!["replay"], "message: counter replay");
    let c = &m["signed_pull_challenge"];
    t.check(pull(&c["message"], json!({ "node": node, "keys": [jem], "issued": [c["challenge"]] })).as_array().unwrap().is_empty(), "message: issued challenge");
    t.check(codes_of(&pull(&c["message"], json!({ "node": node, "keys": [jem], "issued": [] }))) == vec!["replay"], "message: challenge not issued");
    t.check(codes_of(&pull(&p["message"], json!({ "node": "0".repeat(64), "keys": [jem], "highest": p["highest"] }))) == vec!["wrong_node"], "message: wrong node");
    let mut changed = p["message"].clone();
    changed["since"] = json!(1);
    t.check(codes_of(&pull(&changed, json!({ "node": node, "keys": [jem], "highest": p["highest"] }))) == vec!["bad_signature"], "message: changed request");
    let node_key = key(m["node_signer"].as_str().unwrap(), "public_key_sign");
    t.check(ok("answer_signed_by", json!([m["pull_answer"]["message"], [node_key]])) == json!(true), "message: pull answer signed");
    t.check(ok("answer_signed_by", json!([m["push_answer"]["message"], [node_key]])) == json!(true), "message: push answer signed");
    let rebuilt = ok("push_answer", json!([m["push_answer"]["message"], m["push_answer"]["message"]["node"], key(m["node_signer"].as_str().unwrap(), "private_key")]));
    t.check(rebuilt == m["push_answer"]["message"], "message: the push answer rebuilds byte for byte");
    t.check(ok("well_known_errors", json!([m["discovery"]])).as_array().unwrap().is_empty() && ok("announcement", json!([m["discovery"]])) == m["announcement"], "message: discovery");

    // The compact form.
    let cb = &v["cbor"];
    for c in cb["cases"].as_array().unwrap() {
        let block = json!({ "hash": c["hash"], "type": c["block"]["type"], "state": c["block"]["state"], "refs": c["block"]["refs"], "signature": c["signature"] });
        let text = ok("cbor_encode", json!([block, false]));
        let short = ok("cbor_encode", json!([block, true]));
        t.check(text == c["cbor"] && short == c["cbor_short"] && ok("cbor_decode", json!([c["cbor"]])) == block && ok("cbor_decode", json!([c["cbor_short"]])) == block, format!("cbor: {}", c["name"]));
    }
    t.check(ok("cbor_decode", json!([cb["loose"]["cbor"]]))["hash"] == cb["loose"]["hash"], "cbor: loose");
    for r in cb["refused"].as_array().unwrap() {
        t.check(call("cbor_decode", json!([r["cbor"]])).is_err(), format!("cbor refused: {}", r["name"]));
    }

    // The door.
    for d in v["door"].as_array().unwrap() {
        let res = call(d["op"].as_str().unwrap(), d["args"].clone());
        let good = if let Some(e) = d.get("error") {
            match &res {
                Err(a) => e.get("code").is_none_or(|c| &a["code"] == c) && e.get("kind").is_none_or(|k| &a["error"] == k),
                Ok(_) => false,
            }
        } else if let Ok(got) = &res {
            if let Some(c) = d.get("codes") {
                json!(codes_of(got)) == *c
            } else if d.get("exact") == Some(&json!(true)) {
                got == &d["expect"]
            } else {
                subset(got, &d["expect"])
            }
        } else {
            false
        };
        t.check(good, format!("door: {} {:?}", d["name"], res.err()));
    }

    assert!(t.failed.is_empty(), "{} passed, {} failed:\n{}", t.pass, t.failed.len(), t.failed.join("\n"));
    println!("{} vectors pass", t.pass);
}
