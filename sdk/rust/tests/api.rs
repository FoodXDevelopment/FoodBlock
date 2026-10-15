//! The API a device uses, end to end: an identity, a signed reading, the chain, and (on larger profiles) envelopes,
//! folds and signed messages. Fixed seeds and times, so it runs anywhere with no randomness.
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{amount, check, keypair_from_seed, next_link, write, ComposeOptions, WriteOptions};
use serde_json::{json, Value};

const SENSOR: &str = "1111111111111111111111111111111111111111111111111111111111111111";
const RECOVERY: &str = "2222222222222222222222222222222222222222222222222222222222222222";
const X25519: &str = "3333333333333333333333333333333333333333333333333333333333333333";

fn sensor() -> (foodblock::Keypair, Value) {
    let keys = keypair_from_seed(SENSOR).unwrap();
    let recovery = keypair_from_seed(RECOVERY).unwrap();
    let encrypt = "0f101bc98e786e795207789cf2e203f0cad2c7cc97a96fb7c3a9b458e8fe4729";
    let me = genesis(
        &keys,
        &GenesisOptions {
            kind: "sensor",
            at: "2026-10-15T09:00:00.000Z".into(),
            encryption_key: encrypt,
            recovery_key: &recovery.public_key_sign,
            reach: "P30D",
            custodian: "",
            ..Default::default()
        },
    )
    .unwrap();
    (keys, me)
}

fn reading(
    keys: &foodblock::Keypair,
    me: &Value,
    held: &[Value],
    at: &str,
    celsius: &str,
) -> foodblock::error::Result<Value> {
    let options = WriteOptions {
        compose: ComposeOptions {
            author: foodblock::js::hash_of(me).into(),
            at: Some(at.into()),
            ..Default::default()
        },
        key: Some(keys),
        held,
        schemas: None,
    };
    write(
        "observe",
        &json!({ "kind": "reading", "amount": amount(celsius, "Cel") }),
        &json!({ "subject": foodblock::js::hash_of(me) }),
        &options,
    )
}

#[test]
fn a_sensor_signs_its_readings_in_one_chain() {
    let (keys, me) = sensor();
    assert!(
        check("actor", &me["state"], &me["refs"], Default::default()).is_empty(),
        "the genesis passes the write check"
    );
    let first = reading(&keys, &me, &[me.clone()], "2026-10-15T09:01:00.000Z", "3.9").unwrap();
    assert_eq!(first["state"]["seq"], 1);
    assert_eq!(first["refs"]["prev"], me["hash"]);
    assert!(foodblock::verify(
        &first,
        first["signature"].as_str().unwrap(),
        &keys.public_key_sign
    ));
    let second = reading(
        &keys,
        &me,
        &[me.clone(), first.clone()],
        "2026-10-15T09:02:00.000Z",
        "4.1",
    )
    .unwrap();
    assert_eq!(second["state"]["seq"], 2);
    assert_eq!(second["refs"]["prev"], first["hash"]);
    assert_eq!(next_link(Some(&second), None).unwrap().seq, 3);
    let chain = foodblock::check_chain(
        &[first.clone(), second.clone()],
        me["hash"].as_str().unwrap(),
    );
    assert!(chain.ok && chain.length == 2);
    assert!(foodblock::identity::signed_by_author(
        &second,
        &[me.clone(), first.clone(), second.clone()],
        None
    ));
}

#[test]
fn the_write_check_refuses_never_repairs() {
    let (keys, me) = sensor();
    let options = WriteOptions {
        compose: ComposeOptions {
            author: foodblock::js::hash_of(&me).into(),
            at: Some("2026-10-15T09:01:00.000Z".into()),
            ..Default::default()
        },
        key: Some(&keys),
        held: &[me.clone()],
        schemas: None,
    };
    let err = write(
        "observe",
        &json!({ "kind": "reading", "temperature": 3.9 }),
        &json!({}),
        &options,
    )
    .unwrap_err();
    assert!(
        err.reasons.iter().any(|r| r.contains("is a float")),
        "{err}"
    );
    let bad_time = WriteOptions {
        compose: ComposeOptions {
            at: Some("2026-02-30T00:00:00.000Z".into()),
            ..options.compose.clone()
        },
        ..options.clone()
    };
    assert!(
        write("observe", &json!({ "kind": "note" }), &json!({}), &bad_time).is_err(),
        "no 30 February"
    );
}

#[test]
fn a_custom_protocol_json_drives_the_check() {
    // The lists are data: a protocol.json given at runtime is the one the check reads.
    let mut protocol: Value = serde_json::from_slice(foodblock::spec::PROTOCOL_JSON).unwrap();
    protocol["fields"]["observe"]
        .as_array_mut()
        .unwrap()
        .push(json!("temperature_c"));
    let spec = foodblock::Spec::from_values(
        protocol,
        serde_json::from_slice(foodblock::spec::ALIASES_JSON).unwrap(),
    )
    .unwrap();
    let state = json!({ "seq": 1, "at": "2026-10-15T09:01:00.000Z", "audience": "public", "kind": "reading", "temperature_c": "3.9" });
    let refs = json!({ "author": "a".repeat(64), "prev": "a".repeat(64) });
    assert!(!check("observe", &state, &refs, Default::default()).is_empty());
    assert!(
        foodblock::check::check_with(&spec, "observe", &state, &refs, Default::default())
            .is_empty()
    );
}

#[cfg(feature = "envelope")]
#[test]
fn seal_and_open() {
    let public = foodblock::encryption_key_of(X25519).unwrap();
    let envelope = foodblock::envelope::seal_with(
        &json!({ "hello": "café" }),
        &[&public],
        foodblock::ALG,
        Some(&foodblock::envelope::Fixed {
            ephemeral: Some("44".repeat(32)),
            content_key: Some("55".repeat(32)),
            nonce: Some("66".repeat(12)),
            key_nonces: vec!["77".repeat(12)],
        }),
    )
    .unwrap();
    assert_eq!(envelope["alg"], foodblock::ALG);
    assert_eq!(
        foodblock::open(&envelope, X25519).unwrap(),
        json!({ "hello": "café" })
    );
    assert!(
        foodblock::open(&envelope, &"88".repeat(32)).is_err(),
        "another key opens nothing"
    );
}

#[cfg(feature = "sync")]
#[test]
fn signed_pull_and_push() {
    use foodblock::sync::{self, Freshness, Signer};
    let (keys, me) = sensor();
    let id = me["hash"].as_str().unwrap();
    let node = "b".repeat(64);
    let signer = Signer {
        who: id,
        node: &node,
        private_key: &keys.private_key,
        nonce: Some("ab".repeat(16)),
        at: Some("2026-10-15T12:59:00.000Z".into()),
    };
    let pull = sync::sign_pull(
        &json!({ "since": 0, "limit": 10, "filter": { "author": id } }),
        &signer,
    )
    .unwrap();
    let never = |_: &str| false;
    let fresh = Freshness {
        node: &node,
        now: "2026-10-15T13:00:00.000Z",
        keys: &[keys.public_key_sign.clone()],
        seen: &never,
        window_ms: 300_000,
    };
    assert!(sync::pull_errors(&pull, &fresh).is_empty());
    let first = reading(&keys, &me, &[me.clone()], "2026-10-15T09:01:00.000Z", "3.9").unwrap();
    let push = sync::sign_push(
        &sync::push_request(&[foodblock::wrap(&first)], None),
        &signer,
    )
    .unwrap();
    assert!(
        sync::push_errors(&push, &fresh).is_empty(),
        "{:?}",
        sync::push_errors(&push, &fresh)
    );
    let taken = sync::accept(&[first.clone()], &[me.clone()], None, None);
    assert_eq!(taken.taken.len(), 1, "{:?}", taken.to_json());
    let answer = sync::push_answer(&taken, &node, &keys.private_key).unwrap();
    assert!(sync::answer_signed_by(
        &answer,
        &[keys.public_key_sign.clone()]
    ));
    let doc = sync::well_known(
        id,
        &[],
        &[],
        None,
        &json!({ "pull": "http://10.0.0.2/pull", "push": "http://10.0.0.2/push" }),
    );
    assert!(sync::well_known_errors(&doc).is_empty());
    let (service, txt) = sync::local_service(&doc);
    assert_eq!(service, "_foodblock._tcp");
    assert!(txt.iter().any(|(k, v)| k == "node" && v == id));
}
