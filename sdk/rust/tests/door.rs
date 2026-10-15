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
    let bare = call("genesis", &serde_json::json!([keys, { "at": at }]).to_string())["ok"].clone();
    assert!(bare["state"].get("recovery_key_hash").is_none());
    assert_eq!(call("valid", &serde_json::json!([bare, []]).to_string())["ok"], serde_json::json!([]));
    let custodian = "c".repeat(64);
    let g = call("genesis", &serde_json::json!([keys, { "recovery_key": recovery, "reach": "P30D", "at": at, "custodian": custodian }]).to_string())["ok"].clone();
    assert_eq!(g["state"]["custodian"], custodian);
    assert_eq!(call("refusals", &serde_json::json!(["actor", g["state"], {}]).to_string())["ok"], serde_json::json!([]));
    let mut half = g["state"].clone();
    half.as_object_mut().unwrap().remove("recovery_reach");
    assert_eq!(call("refusals", &serde_json::json!(["actor", half, {}]).to_string())["ok"][0]["code"], "bad_genesis");
    // A recovery key without its reach is refused before it is signed.
    let e = call("genesis", &serde_json::json!([keys, { "recovery_key": recovery, "at": at }]).to_string());
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
