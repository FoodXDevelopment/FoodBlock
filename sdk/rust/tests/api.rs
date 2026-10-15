use foodblock::*;
use serde_json::json;

#[test]
fn canonical_example() {
    let state = json!({ "name": "Sourdough", "price": { "minor": 450, "currency": "GBP" }, "weight": { "value": "0.8", "unit": "kg" } });
    let refs = json!({ "author": "abc123", "of": "def456" });
    assert_eq!(canonical("thing", &state, &refs), r#"{"refs":{"author":"abc123","of":"def456"},"state":{"name":"Sourdough","price":{"currency":"GBP","minor":450},"weight":{"unit":"kg","value":"0.8"}},"type":"thing"}"#);
    assert_eq!(hash("thing", &state, &refs), "7bda2dba2c55126f32646c376de02d3f7d91a21ff956336649307dd6e7c0d51d");
}

fn suites() -> Vec<&'static str> { vec!["std", "p256", "sm"] }

#[test]
fn each_suite_signs_and_opens() {
    for suite in suites() {
        let k = keypair_from_seed_in(suite, &"11".repeat(32)).unwrap();
        println!("{suite} {} {}", k.public_key_sign, k.private_key);
        let g = identity::genesis(&k, &identity::GenesisOptions { kind: "person", at: "2026-10-15T09:00:00.000Z".into(), ..Default::default() }).unwrap();
        println!("{}", g);
        assert!(identity::genesis_opens(Some(&g)), "{suite}");
        let held = js::index_of([&g]);
        let r = valid::valid(&g, &js::Index::default(), None, None);
        assert!(r.is_empty(), "{suite}: {r:?}");
        let id = js::hash_of(&g).to_string();
        let b = write("observe", &json!({"text":"hi"}), &json!({}), &WriteOptions {
            compose: ComposeOptions { author: id.clone(), at: Some("2026-10-15T09:01:00.000Z".into()), ..Default::default() },
            key: Some(&k), held: std::slice::from_ref(&g), schemas: None }).unwrap();
        let r = valid::valid(&b, &held, None, None);
        assert!(r.is_empty(), "{suite}: {r:?}");
        let mut bad = b.clone(); bad["state"]["text"] = json!("ho");
        assert!(!valid::valid(&bad, &held, None, None).is_empty());
    }
}

#[test]
fn each_suite_seals() {
    for suite in suites() {
        let kp = envelope::generate_encryption_keypair_in(suite).unwrap();
        let env = envelope::seal_with(&json!({"a":1}), &[kp["public_key_encrypt"].as_str().unwrap()], suite, None).unwrap();
        let back = envelope::open(&env, kp["x25519_private"].as_str().unwrap()).unwrap();
        assert_eq!(back, json!({"a":1}), "{suite}");
        println!("{suite} alg {}", env["alg"]);
    }
}

#[test]
fn version_matches_protocol_json() {
    assert_eq!(VERSION, spec().version);
    for peer in peers() {
        assert!(spec().protocol["peers"].get(*peer).is_some(), "{peer} is a peer of protocol.json");
    }
}

#[test]
fn the_default_spec_is_the_repository_spec() {
    let repo = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/protocol.json")).unwrap();
    assert_eq!(repo, spec::PROTOCOL_JSON, "sdk/rust/spec/protocol.json is spec/protocol.json: run node test/sync-spec.cjs");
    let legacy = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/legacy/aliases-0.x.json")).unwrap();
    assert_eq!(legacy, std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/spec/aliases-0.x.json")).unwrap());
}

#[test]
fn strict_writing_is_refused_by_create() {
    let e = create("thing", &json!({ "x": null }), &json!({})).unwrap_err();
    assert!(e.refusals.iter().any(|r| r.code == "not_canonical"));
    let e = create("thing", &json!({ "x": 1.5 }), &json!({})).unwrap_err();
    assert!(e.refusals.iter().any(|r| r.code == "float"));
    let e = create("thing", &json!({}), &json!({ "s": ["b", "a"] })).unwrap_err();
    assert!(e.refusals.iter().any(|r| r.code == "not_canonical"));
    assert!(create("thing", &json!({ "x": 1 }), &json!({ "s": ["a", "b"] })).is_ok());
}

#[test]
fn the_receipt_code_is_five_bytes_in_crockford() {
    assert_eq!(strangers::receipt_code(&"00".repeat(32)).unwrap(), "0000-0000");
    assert_eq!(strangers::receipt_code(&"ff".repeat(32)).unwrap(), "ZZZZ-ZZZZ");
}
