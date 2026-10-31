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
        let g = identity::genesis(&k, &identity::GenesisOptions { kind: "person", at: "2026-10-15T09:00:00.000Z".into(), audience: Some(foodblock::Readers::Public), ..Default::default() }).unwrap();
        println!("{}", g);
        assert!(identity::genesis_opens(Some(&g)), "{suite}");
        let held = js::index_of([&g]);
        let r = valid::valid(&g, &js::Index::default(), None);
        assert!(r.is_empty(), "{suite}: {r:?}");
        let id = js::hash_of(&g).to_string();
        let b = write("observe", &json!({"text":"hi"}), &json!({}), &WriteOptions {
            compose: ComposeOptions { author: id.clone(), at: Some("2026-10-15T09:01:00.000Z".into()), audience: Some(foodblock::Readers::Public), ..Default::default() },
            key: Some(&k), held: std::slice::from_ref(&g), schemas: None }).unwrap();
        let r = valid::valid(&b, &held, None);
        assert!(r.is_empty(), "{suite}: {r:?}");
        let mut bad = b.clone(); bad["state"]["text"] = json!("ho");
        assert!(!valid::valid(&bad, &held, None).is_empty());
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
    assert_eq!(strangers::receipt_code_long(&"ff".repeat(32)).unwrap(), "ZZZZZ-ZZZZZ");
}

#[test]
fn a_typed_code_names_a_block_the_way_a_person_types_it() {
    let id = format!("{}{}", "0123456789abcd", "00".repeat(25));
    let short = strangers::receipt_code(&id).unwrap();
    assert!(strangers::code_matches(&short, &id));
    assert!(strangers::code_matches(&short.to_lowercase(), &id), "case does not matter");
    assert!(strangers::code_matches(&short.replace('-', " "), &id), "a space for the hyphen");
    assert!(strangers::code_matches(&strangers::receipt_code_long(&id).unwrap(), &id));
    assert!(strangers::code_matches("OOOO-OOOO", &"00".repeat(32)), "O is read as zero");
    assert!(!strangers::code_matches(&short[..short.len() - 1], &id), "seven characters match nothing");
    assert!(!strangers::code_matches("ZZZZ-ZZZZ", &id));
}

// A passkey (spec/modules/encoding.md, Passkeys): a real-shaped WebAuthn assertion from a test P-256 key opens a block, and the
// parts the protocol deliberately does not read (rpIdHash, origin, counter) change nothing.
#[test]
fn a_passkey_signs_a_block() {
    use p256::ecdsa::signature::Signer as _;
    use sha2::Digest;
    let k = keypair_from_seed_in("p256", &"22".repeat(32)).unwrap();
    let device = p256::ecdsa::SigningKey::from_slice(&unhex_32(&k.private_key)).unwrap();
    let block = json!({ "type": "observe", "state": { "kind": "note", "text": "hi" }, "refs": {} });
    let challenge = sign::passkey_challenge_of(canonical("observe", &block["state"], &block["refs"]).as_bytes());
    assert_eq!(challenge.len(), 43);
    let answer = |flags: u8, rp: &str, type_: &str, challenge: &str| {
        let mut auth = sha2::Sha256::digest(rp.as_bytes()).to_vec();
        auth.extend_from_slice(&[flags, 0, 0, 0, 9]);
        let cdj = format!(r#"{{"type":"{type_}","challenge":"{challenge}","origin":"https://{rp}","crossOrigin":false}}"#);
        let mut signed = auth.clone();
        signed.extend_from_slice(&sha2::Sha256::digest(cdj.as_bytes()));
        let sig: p256::ecdsa::Signature = device.sign(&signed);
        sign::passkey_signature(&block::hex(&auth), &block::hex(cdj.as_bytes()), &block::hex(sig.to_der().as_bytes())).unwrap()
    };
    let opens = |s: &str| verify_in("p256", &block, s, &k.public_key_sign);
    assert!(opens(&answer(0x05, "foodx.network", "webauthn.get", &challenge)));
    assert!(opens(&answer(0x01, "elsewhere.example", "webauthn.get", &challenge)), "rpId and UV are not read");
    assert!(!opens(&answer(0x04, "foodx.network", "webauthn.get", &challenge)), "UP unset");
    assert!(!opens(&answer(0x05, "foodx.network", "webauthn.create", &challenge)), "wrong type");
    assert!(!opens(&answer(0x05, "foodx.network", "webauthn.get", "AAAA")), "wrong challenge");
    let good = answer(0x05, "foodx.network", "webauthn.get", &challenge);
    assert!(opens(&good) && !opens(&format!("{}00", good)) && !opens(&good[..good.len() - 2]));
}
fn unhex_32(h: &str) -> [u8; 32] {
    block::unhex(h).unwrap().try_into().unwrap()
}

#[test]
fn writing_fills_nothing_in_the_authors_silence() {
    let author = "a".repeat(64);
    let says = |audience: Option<Readers>, at: Option<&str>, clockless: bool| {
        compose("observe", &json!({ "kind": "note" }), &json!({}), &ComposeOptions { author: author.clone(), audience, at: at.map(String::from), clockless, ..Default::default() })
    };
    let at = Some("2026-10-15T09:00:00.000Z");
    assert!(says(None, at, false).unwrap_err().message.contains("audience"), "no audience: refused, not made public");
    assert!(says(Some(Readers::Public), None, false).unwrap_err().message.contains("`at`"), "no time: refused, not read from a clock");
    assert!(says(Some(Readers::To(vec![])), at, false).is_err(), "an empty list of recipients is not a way to say public");
    assert_eq!(says(Some(Readers::Public), at, false).unwrap()["state"]["audience"], "public");
    assert!(says(Some(Readers::Public), None, true).unwrap()["state"].get("at").is_none(), "clockless states that there is no time");
}

#[test]
fn a_genesis_states_its_kind_time_and_audience() {
    let k = keypair_from_seed(&"11".repeat(32)).unwrap();
    let full = identity::GenesisOptions { kind: "person", at: "2026-10-15T09:00:00.000Z".into(), audience: Some(Readers::Public), ..Default::default() };
    assert!(identity::genesis(&k, &full).is_ok());
    for (name, bad) in [
        ("kind", identity::GenesisOptions { kind: "", ..full.clone() }),
        ("at", identity::GenesisOptions { at: String::new(), ..full.clone() }),
        ("audience", identity::GenesisOptions { audience: None, ..full.clone() }),
    ] {
        assert!(identity::genesis(&k, &bad).unwrap_err().message.contains(name), "{name} is stated");
    }
    let private = identity::GenesisOptions { audience: Some(Readers::To(vec!["b".repeat(64)])), ..full };
    let g = identity::genesis(&k, &private).unwrap();
    assert!(g["state"]["audience"].is_array() && g["state"]["nonce"].is_string() && g["salts"].is_object());
}

#[test]
fn a_message_has_no_version() {
    let k = keypair_from_seed(&"11".repeat(32)).unwrap();
    let g = identity::genesis(&k, &identity::GenesisOptions { kind: "person", at: "2026-10-15T09:00:00.000Z".into(), audience: Some(Readers::Public), ..Default::default() }).unwrap();
    let message = wrap(&g);
    assert_eq!(message.as_object().unwrap().keys().collect::<Vec<_>>(), ["block", "signature"]);
    assert_eq!(unwrap(&message).unwrap()["hash"], g["hash"]);
    let mut old = message.clone();
    old["version"] = json!("1.7");
    assert_eq!(unwrap(&old).unwrap_err().code.as_deref(), Some("shape"));
}

// Judging a block under a grant signed as a circle once marked a copy of every held block again for each block it asked about, so five
// such blocks took 12 to 39 s (fold-fuzz seed 72000097). The marks are read once per set of blocks now; the answers are unchanged.
#[test]
fn a_block_under_a_circle_grant_is_judged_fast() {
    let w: serde_json::Value = serde_json::from_str(include_str!("fixtures/deep-grants.json")).unwrap();
    let held: Vec<serde_json::Value> = w["held"].as_array().unwrap().clone();
    let start = std::time::Instant::now();
    let answers: Vec<bool> = w["asked"].as_array().unwrap().iter().map(|a| grant::why_not_under(&a["block"], &held, None).is_empty()).collect();
    assert_eq!(answers, vec![false, false, false, false, true]);
    assert!(start.elapsed().as_secs() < 10, "took {:?}", start.elapsed());
}
