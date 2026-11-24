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
fn subset(got: &Value, want: &Value) -> bool {
    match (got, want) {
        (Value::Array(g), Value::Array(w)) if g.len() == w.len() => g.iter().zip(w).all(|(a, b)| subset(a, b)),
        (g, Value::Object(w)) => w.iter().all(|(k, v)| subset(g.get(k).unwrap_or(&Value::Null), v)),
        (Value::Number(a), Value::Number(b)) => a.as_f64() == b.as_f64(),
        (g, w) => g == w,
    }
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
            // what a writer refuses of the value (write_refusals: a float is `float`, not the wire's `not_canonical`)
            let found = codes_of(&ok("write_refusals", json!([{ "type": b["type"], "state": b["state"], "refs": b["refs"] }, []])));
            good &= strs(r).iter().all(|code| found.contains(code));
        }
        t.check(good, format!("canonical: {}", c["name"]));
    }
    let edge: Value = serde_json::from_str(&std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../test/vectors.json")).unwrap()).unwrap();
    for c in edge.as_array().unwrap() {
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
    stories.push(("sealed stories".into(), v["sealed"]["blocks"].clone()));
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
            let found = ok("strict_text", json!([ok("canonical", json!([e["block"]["type"], e["block"]["state"], e["block"]["refs"]]))]));
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
        // an X-Wing recipient opens with its 32-byte private seed
        let who = c["recipient"].as_str().unwrap();
        let private = if v["keys"][who]["xwing_private"].is_string() { key(who, "xwing_private") } else { key(who, "x25519_private") };
        let inside = ok("open", json!([c["envelope"], private]));
        let m = ok("unwrap", json!([inside]));
        t.check(m["hash"] == c["opens_to"]["hash"] && m["signature"] == c["opens_to"]["signature"], format!("envelope: {}", c["name"]));
    }
    // X-Wing (draft-connolly-cfrg-xwing-kem-11, appendix C): key generation, encapsulation and decapsulation by the core's own primitives
    {
        let d = &v["xwing_draft11"];
        let h = |k: &str| foodblock::block::unhex(d[k].as_str().unwrap()).unwrap();
        let sk: [u8; 32] = h("sk").try_into().unwrap();
        let eseed: [u8; 64] = h("eseed").try_into().unwrap();
        let pk = foodblock::envelope::xwing::public_key(&sk);
        t.check(pk == h("pk"), "xwing draft 11: the key of its private seed");
        let (ss, ct) = foodblock::envelope::xwing::encaps(&pk, &eseed).unwrap();
        t.check(ct == h("ct") && ss.to_vec() == h("ss"), "xwing draft 11: encapsulation with the draft's bytes");
        t.check(foodblock::envelope::xwing::decaps(&sk, &ct).unwrap().to_vec() == h("ss"), "xwing draft 11: decapsulation");
    }
    for c in v["sealed"]["cases"].as_array().unwrap() {
        let m = ok("open_copy", json!([c["message"], key(c["recipient"].as_str().unwrap(), "x25519_private")]));
        let signed = ok("header_signed_by", json!([c["message"], key(c["signer"].as_str().unwrap(), "public_key_sign")])) == json!(true);
        t.check(m["hash"] == c["opens_to"]["hash"] && m["signature"] == c["opens_to"]["signature"] && m["reveals"] == c["opens_to"]["reveals"] && signed, format!("sealed: {}", c["name"]));
    }
    for c in v["headers"].as_array().unwrap() {
        let b = full(&by_hash[c["hash"].as_str().unwrap()]);
        // a header is no message (core.md, section 2): its signature is the block's, over the header
        let msg = json!({ "header": c["header"], "header_signature": c["header_signature"] });
        t.check(ok("header", json!([b])) == c["header"] && ok("header_signed_by", json!([msg, key(c["signer"].as_str().unwrap(), "public_key_sign")])) == json!(true), format!("header: {}", c["name"]));
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

    // The door: the protocol's cases, then every other op's (spec/conventions-vectors.json).
    let conventions: Value = serde_json::from_str(&std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/conventions-vectors.json")).unwrap()).unwrap();
    for d in v["door"].as_array().unwrap().iter().chain(conventions["door"].as_array().unwrap()) {
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
