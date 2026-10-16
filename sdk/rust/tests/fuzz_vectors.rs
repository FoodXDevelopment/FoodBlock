//! spec/fuzz-vectors.json through the JSON door: the minimal reproducers of what the differential fuzzer (tools/fuzz) and the
//! world simulator (tools/sim) found. The blocks are made and signed by the spec-only oracle; tools/fuzz/run-vectors.cjs runs
//! the same file through the oracle too. Also: the inputs that made the core panic.
use foodblock::door::answer;
use serde_json::{json, Value};

fn call(op: &str, args: &Value) -> Value {
    answer(op.as_bytes(), args.to_string().as_bytes())
}

fn codes(list: &Value) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for r in list.as_array().cloned().unwrap_or_default() {
        let c = r["code"].as_str().unwrap_or("").to_string();
        if !out.contains(&c) {
            out.push(c);
        }
    }
    out
}

fn subset(got: &Value, want: &Value) -> bool {
    match want {
        Value::Object(w) => w.iter().all(|(k, v)| subset(&got[k], v)),
        _ => got == want,
    }
}

#[test]
fn every_reproducer_the_fuzzers_found_holds() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/fuzz-vectors.json")).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    let mut failed = vec![];
    for v in all["vectors"].as_array().unwrap() {
        let out = call(v["op"].as_str().unwrap(), &v["args"]);
        let got = &out["ok"];
        let want = &v["expect"];
        let ok = match v["by"].as_str().unwrap_or("exact") {
            "first_code" => codes(got).into_iter().take(1).collect::<Vec<_>>() == codes_of_strings(want),
            "includes_code" => codes_of_strings(want).iter().all(|c| codes(got).contains(c)),
            "codes" => codes(got) == codes_of_strings(want),
            "subset" => subset(got, want),
            _ => got == want,
        };
        if !ok {
            failed.push(format!("{}: got {}", v["name"], out.to_string().chars().take(200).collect::<String>()));
        }
    }
    assert!(failed.is_empty(), "{} reproducers fail:\n{}", failed.len(), failed.join("\n"));
}

fn codes_of_strings(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().map(|x| x.as_str().unwrap_or("").to_string()).collect()).unwrap_or_default()
}

/// The converter took a non-object "old block" and indexed into it. The door reports a panic as `internal`; no input may.
#[test]
fn the_converter_does_not_panic_on_a_block_that_is_not_an_object() {
    for old in [json!(["text"]), json!([1]), json!([[]]), json!([null]), json!([true])] {
        let out = call("convert", &json!([old, { "keys": {}, "at": "2026-10-15T12:00:00.000Z" }]));
        assert_ne!(out["error"], json!("internal"), "{out}");
    }
}

/// A rotation of a key names the last block of the old key that counts; the new key's chain does not see the old chain unless it
/// says so (`after`). Neither is a reason for the core to hang: a fold of a few hundred blocks takes milliseconds.
#[test]
fn a_fold_over_many_blocks_is_not_quadratic_in_signature_checks() {
    // 300 transfers of one thing by its maker, none accepted: every candidate is looked at; each look used to re-find the forks of the whole
    // record (a signature check per block each time), which took seconds.
    let key = foodblock::keypair_from_seed(&"07".repeat(32)).unwrap();
    let g = foodblock::identity::genesis(&key, &foodblock::identity::GenesisOptions { kind: "person", at: "2026-10-15T09:00:00.000Z".into(), ..Default::default() }).unwrap();
    let id = g["hash"].as_str().unwrap().to_string();
    let mut blocks = vec![g];
    let mut prev = id.clone();
    let mut thing = String::new();
    for seq in 1..=300i64 {
        let (typ, state, mut refs) = if seq == 1 {
            ("thing", json!({ "kind": "eggs", "name": "Eggs", "at": "2026-10-15T09:00:01.000Z", "audience": "public", "seq": 1 }), json!({}))
        } else {
            ("transfer", json!({ "at": "2026-10-15T09:00:01.000Z", "audience": "public", "seq": seq }), json!({ "to_owner": "b".repeat(64), "what": thing }))
        };
        refs["author"] = json!(id);
        refs["prev"] = json!(prev);
        let mut b = foodblock::create(typ, &state, &refs).unwrap();
        b["signature"] = json!(foodblock::sign(&b, &key.private_key).unwrap());
        prev = b["hash"].as_str().unwrap().to_string();
        if seq == 1 {
            thing = prev.clone();
        }
        blocks.push(b);
    }
    let started = std::time::Instant::now();
    let o = foodblock::fold::ownership(&blocks[1], &blocks);
    assert_eq!(o.owner.as_deref(), Some(id.as_str()));
    assert!(started.elapsed().as_secs() < 5, "ownership over 301 blocks took {:?}", started.elapsed());
}
