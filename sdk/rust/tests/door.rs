//! The one JSON door (`fb_call`): the C ABI and the JNI layer share src/door.rs.
#![cfg(feature = "ffi")]
use foodblock::ffi::{fb_call, fb_free, FB_OK};
use std::ffi::{CStr, CString};

fn call(op: &str, args: &str) -> serde_json::Value {
    let (op, args) = (CString::new(op).unwrap(), CString::new(args).unwrap());
    let mut out = std::ptr::null_mut();
    let status = unsafe { fb_call(op.as_ptr(), args.as_ptr(), &mut out) };
    assert_eq!(status, FB_OK);
    let text = unsafe { CStr::from_ptr(out) }.to_str().unwrap().to_string();
    unsafe { fb_free(out) };
    serde_json::from_str(&text).unwrap()
}

#[test]
fn the_door_answers_ok_and_errors_as_data() {
    let protocol: serde_json::Value = serde_json::from_str(include_str!("../spec/protocol.json")).unwrap();
    assert_eq!(call("version", "[]")["ok"], protocol["version"]);
    let hash = call("hash", r#"["thing",{"kind":"eggs"},{}]"#);
    assert_eq!(hash["ok"].as_str().unwrap().len(), 64);
    assert!(call("hash", r#"["thing",{"kind":"eggs"},{}, "sm"]"#)["ok"].as_str().unwrap().starts_with("sm3:"));
    assert_eq!(call("no_such_op", "[]")["error"], "profile");
    assert_eq!(call("hash", "{}")["error"], "argument");
    assert_eq!(call("hash", "not json")["error"], "json");
    assert_eq!(call("keypair", r#"[null, "ml-dsa"]"#)["code"], "unknown_suite");
}

#[test]
fn a_genesis_needs_a_key_and_a_recovery_pair_or_nothing() {
    let keys = call("keypair", &format!(r#"["{}"]"#, "11".repeat(32)))["ok"].clone();
    let recovery = call("keypair", &format!(r#"["{}"]"#, "22".repeat(32)))["ok"]["public_key_sign"].clone();
    let at = "2026-10-15T09:00:00.000Z";
    let bare = call("genesis", &serde_json::json!([keys, { "kind": "person", "at": at, "audience": "public" }]).to_string())["ok"].clone();
    assert!(bare["state"].get("recovery_key_hash").is_none());
    assert_eq!(call("valid", &serde_json::json!([bare, []]).to_string())["ok"], serde_json::json!([]));
    let custodian = "c".repeat(64);
    let g = call("genesis", &serde_json::json!([keys, { "kind": "person", "recovery_key": recovery, "reach": "P30D", "at": at, "audience": "public", "custodian": custodian }]).to_string())["ok"].clone();
    assert_eq!(g["state"]["custodian"], custodian);
    assert_eq!(call("refusals", &serde_json::json!(["actor", g["state"], {}]).to_string())["ok"], serde_json::json!([]));
    let mut half = g["state"].clone();
    half.as_object_mut().unwrap().remove("recovery_reach");
    assert_eq!(call("refusals", &serde_json::json!(["actor", half, {}]).to_string())["ok"][0]["code"], "bad_genesis");
    // A recovery key without its reach is refused before it is signed.
    let e = call("genesis", &serde_json::json!([keys, { "kind": "person", "recovery_key": recovery, "at": at, "audience": "public" }]).to_string());
    assert_eq!(e["error"], "crypto");
}

#[test]
fn the_limit_fence_and_push_for_a_list() {
    let fence = call("limit_fence", &serde_json::json!(["a".repeat(64), "b".repeat(64), { "minor": 5000, "currency": "GBP" }, "P7D"]).to_string())["ok"].clone();
    assert_eq!(fence["audience"], serde_json::json!(["b".repeat(64)]));
    let within = |spent: i64, minor: i64, cur: &str| call("within_limit", &serde_json::json!([fence["state"], { "minor": minor, "currency": cur }, spent]).to_string())["ok"].clone();
    assert_eq!(within(2000, 3000, "GBP"), true);
    assert_eq!(within(2000, 3001, "GBP"), false);
    assert_eq!(within(0, 1, "EUR"), false);
    let one = "d".repeat(64);
    let request = call("push_request", &serde_json::json!([[], { one.clone(): ["e".repeat(64), "f".repeat(64)] }]).to_string())["ok"].clone();
    assert_eq!(request["for"][&one].as_array().unwrap().len(), 2);
}

// Security J (ffi F7): a block given whole to the door is answered only if whole: it never fills in a missing state, refs or type.
#[test]
fn the_door_refuses_a_block_it_would_have_repaired() {
    let hash = |block: &str| call("hash", &format!("[{block}]"));
    assert!(hash(r#"{"type":"thing","state":{},"refs":{}}"#)["ok"].is_string());
    for partial in [r#"{"type":"thing"}"#, "{}", r#"{"type":5,"state":{},"refs":{}}"#, r#"{"type":"thing","state":[],"refs":{}}"#] {
        assert_eq!(hash(partial)["error"], "argument", "{partial}");
    }
}

#[test]
fn a_nodes_own_choices_are_stated_never_filled() {
    let held = serde_json::json!([]);
    let no = |args: serde_json::Value, op: &str| call(op, &args.to_string())["error"].clone();
    // answer_pull: choices { cap >= 1, serves_pairs }
    let log = serde_json::json!([]);
    let pull = |choices: serde_json::Value| call("answer_pull", &serde_json::json!([log, {}, "n".repeat(64), null, choices, null, null, null, null]).to_string());
    assert_eq!(pull(serde_json::json!({ "serves_pairs": true }))["error"], "argument", "no cap");
    assert_eq!(pull(serde_json::json!({ "cap": 0, "serves_pairs": true }))["error"], "argument", "a cap of 0");
    assert_eq!(pull(serde_json::json!({ "cap": 5 }))["error"], "argument", "no serves_pairs");
    assert_eq!(pull(serde_json::json!({ "cap": 5, "serves_pairs": "yes" }))["error"], "argument", "not a boolean");
    assert!(pull(serde_json::json!({ "cap": 5, "serves_pairs": false }))["ok"].is_object());
    assert_eq!(no(serde_json::json!([[], held, null, null]), "accept"), "argument", "accept: no takes_pairs");
    assert!(call("accept", &serde_json::json!([[], held, { "takes_pairs": true }, null]).to_string())["ok"].is_object());
    assert_eq!(no(serde_json::json!([[], held]), "accept_sealed"), "argument", "accept_sealed: no takes_pairs");
    assert!(call("accept_sealed", &serde_json::json!([[], held, { "takes_pairs": false }]).to_string())["ok"].is_object());
    // admission_refusals: the rule's state or an explicit null, and a whole number
    let block = serde_json::json!({ "type": "observe", "state": {}, "refs": { "author": "a".repeat(64) } });
    let adm = |rest: serde_json::Value| call("admission_refusals", &serde_json::json!([block, "b".repeat(64), [], rest[0], rest[1]]).to_string());
    assert!(adm(serde_json::json!([null, 0]))["ok"].is_array(), "an explicit null is no rule");
    assert_eq!(adm(serde_json::json!([{}, null]))["error"], "argument", "no count");
    assert_eq!(call("admission_refusals", &serde_json::json!([block, "b".repeat(64), []]).to_string())["error"], "argument", "no rule, no count");
    assert_eq!(call("pull_cap", "[]")["error"], "profile", "the core names no cap of its own");
    // writing and the genesis state what they need
    let keys = call("keypair", &format!(r#"["{}"]"#, "11".repeat(32)))["ok"].clone();
    assert_eq!(call("genesis", &serde_json::json!([keys, { "kind": "person", "at": "2026-10-15T09:00:00.000Z" }]).to_string())["error"], "crypto", "no audience");
    assert_eq!(call("compose", &serde_json::json!(["observe", {}, {}, { "author": "a".repeat(64), "at": "2026-10-15T09:00:00.000Z" }]).to_string())["error"], "crypto", "no audience");
    assert_eq!(call("compose", &serde_json::json!(["observe", {}, {}, { "author": "a".repeat(64), "audience": "everyone", "at": "2026-10-15T09:00:00.000Z" }]).to_string())["error"], "argument", "audience is public or a list");
}
