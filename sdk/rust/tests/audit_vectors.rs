//! spec/audit-vectors.json through the JSON door: the audit's worlds (test/audit), frozen as their answers. Each world's blocks
//! once ("$blocks" in an argument), and each question a word op asks of it with the oracle's answer: `expect` is a subset match, as
//! a door case's is (vectors.json), and `error` an argument error. spec/oracle/run.cjs runs the same file through the oracle.
use foodblock::door::answer;
use serde_json::Value;

fn subset(got: &Value, want: &Value) -> bool {
    match want {
        Value::Object(w) => got.is_object() && w.iter().all(|(k, v)| subset(&got[k], v)),
        Value::Array(w) => got.as_array().is_some_and(|g| g.len() == w.len() && g.iter().zip(w).all(|(a, b)| subset(a, b))),
        _ => got == want,
    }
}

#[test]
fn every_audit_world_answers_as_frozen() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/audit-vectors.json")).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    let mut failed = vec![];
    for w in all["worlds"].as_array().unwrap() {
        for (i, c) in w["cases"].as_array().unwrap().iter().enumerate() {
            let args: Vec<Value> = c["args"].as_array().unwrap().iter().map(|a| if a == "$blocks" { w["blocks"].clone() } else { a.clone() }).collect();
            let out = answer(c["op"].as_str().unwrap().as_bytes(), Value::Array(args).to_string().as_bytes());
            let ok = if c["error"] == Value::Bool(true) { out.get("error").is_some() } else { out.get("ok").is_some_and(|g| subset(g, &c["expect"])) };
            if !ok {
                failed.push(format!("{}: {} {}: got {}", w["name"], c["op"], i, out.to_string().chars().take(200).collect::<String>()));
            }
        }
    }
    assert!(failed.is_empty(), "{} audit answers differ:\n{}", failed.len(), failed.join("\n"));
}
