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
    assert_eq!(call("version", "[]")["ok"], "1.6");
    let hash = call("hash", r#"["thing",{"kind":"eggs"},{}]"#);
    assert_eq!(hash["ok"].as_str().unwrap().len(), 64);
    assert_eq!(call("no_such_op", "[]")["error"], "profile");
    assert_eq!(call("hash", "{}")["error"], "argument");
    assert_eq!(call("hash", "not json")["error"], "json");
}

#[test]
fn custody_the_limit_fence_and_push_for_a_list() {
    let seed = "11".repeat(32);
    let keys = call("keypair", &format!(r#"["{seed}"]"#))["ok"].clone();
    let recovery = call("keypair", &format!(r#"["{}"]"#, "22".repeat(32)))["ok"]["public_key_sign"].clone();
    let custodian = "c".repeat(64);
    let options = serde_json::json!({ "recovery_key": recovery, "at": "2026-10-15T09:00:00.000Z", "custodian": custodian });
    let g = call("genesis", &serde_json::json!([keys, options]).to_string())["ok"].clone();
    assert_eq!(g["state"]["custodian"], custodian);
    let mut bad = g["state"].clone();
    bad["custodian"] = "co-op".into();
    let wrong = call("refusals", &serde_json::json!(["actor", bad, {}]).to_string());
    assert_eq!(wrong["ok"][0]["code"], "grammar");
    assert_eq!(call("refusals", &serde_json::json!(["actor", g["state"], {}]).to_string())["ok"], serde_json::json!([]));
    // The limit: sealed to the agent alone; within_limit adds what is spent.
    let fence = call("limit_fence", &serde_json::json!(["a".repeat(64), "b".repeat(64), { "minor": 5000, "currency": "GBP" }, "P7D"]).to_string())["ok"].clone();
    assert_eq!(fence["audience"], serde_json::json!(["b".repeat(64)]));
    let within = |spent: i64, minor: i64, cur: &str| call("within_limit", &serde_json::json!([fence["state"], { "minor": minor, "currency": cur }, spent]).to_string())["ok"].clone();
    assert_eq!(within(2000, 3000, "GBP"), true);
    assert_eq!(within(2000, 3001, "GBP"), false);
    assert_eq!(within(0, 1, "EUR"), false);
    // Push `for`: a list; an older single id is a list of one.
    let one = "d".repeat(64);
    let request = call("push_request", &serde_json::json!([[], { one.clone(): ["e".repeat(64), "f".repeat(64)] }]).to_string())["ok"].clone();
    assert_eq!(request["for"][&one].as_array().unwrap().len(), 2);
    let old = call("push_request", &serde_json::json!([[], { one.clone(): "e".repeat(64) }]).to_string())["ok"].clone();
    assert_eq!(old["for"][&one], serde_json::json!(["e".repeat(64)]));
}
