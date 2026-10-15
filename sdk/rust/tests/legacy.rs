//! The one-time converter (spec/legacy/converter.md). Not part of the protocol: its fixtures are the old examples that
//! were conformance vectors before year zero, and a small old record converted end to end.
use foodblock::legacy::{convert, old_hash, read_old, reshape, ConvertOptions};
use foodblock::*;
use serde_json::{json, Value};

fn aliases() -> Value {
    serde_json::from_slice(legacy::ALIASES_JSON).unwrap()
}

#[test]
fn every_old_example_reads_through_the_table() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/legacy.json")).unwrap();
    let fixtures: Value = serde_json::from_str(&text).unwrap();
    let table = aliases();
    let mut checked = 0;
    for c in fixtures["cases"].as_array().unwrap() {
        let read = read_old(&table, &c["block"]);
        let want = &c["reads_as"];
        if want.get("retired") == Some(&json!(true)) {
            assert!(read.is_none(), "{}: a retired type is not converted", c["name"]);
        } else {
            let read = read.unwrap_or_else(|| panic!("{}: reads", c["name"]));
            assert_eq!(read["type"], want["type"], "{}", c["name"]);
            assert_eq!(read["state"], want["state"], "{}", c["name"]);
            // An `outside:` ref is an open side: the converter leaves it out.
            let refs_want: serde_json::Map<String, Value> = want["refs"].as_object().unwrap().iter().filter(|(_, v)| !v.as_str().is_some_and(|s| s.starts_with("outside:"))).map(|(k, v)| (k.clone(), v.clone())).collect();
            assert_eq!(read["refs"], Value::Object(refs_want), "{}", c["name"]);
        }
        checked += 1;
    }
    assert!(checked > 30, "{checked} fixtures");
}

#[test]
fn the_final_steps_make_a_block_strict() {
    let read = json!({ "type": "thing", "state": { "name": "Bread", "weight": 1.5, "n": 3.0, "gone": null, "sequencer": "k", "alg_sign": "ed25519", "dkim": { "domain": "x", "pass": true }, "manifest": ["a"], "s": "cafe\u{0301}" }, "refs": { "kind": "k1", "ids": ["b", "a", "b"] } });
    let out = reshape(&read);
    assert_eq!(out["state"]["weight"], "1.5");
    assert_eq!(out["state"]["n"], 3);
    assert_eq!(out["state"]["orderer"], "k");
    assert!(out["state"].get("gone").is_none() && out["state"].get("dkim").is_none() && out["state"].get("manifest").is_none() && out["state"].get("alg_sign").is_none());
    assert_eq!(out["state"]["s"], "caf\u{e9}");
    assert_eq!(out["refs"]["of"], "k1");
    assert_eq!(out["refs"]["ids"], json!(["a", "b"]));
}

#[test]
fn an_old_record_becomes_fresh_blocks_and_running_again_adds_nothing() {
    let owner = keypair_from_seed(&"21".repeat(32)).unwrap();
    let genesis = json!({ "type": "actor.foodie", "state": { "name": "Ann", "public_key_sign": owner.public_key_sign, "at": "2024-01-01T00:00:00.000Z", "audience": "public" }, "refs": {} });
    let gh = old_hash(&genesis);
    let note = json!({ "type": "observe.received", "state": { "text": "two trays", "at": "2024-01-02T00:00:00.000Z" }, "refs": { "author": gh, "kind": "a".repeat(64) } });
    let nh = old_hash(&note);
    let mut keys = serde_json::Map::new();
    keys.insert(gh.clone(), owner.to_json());
    let options = ConvertOptions { keys, at: "2026-10-15T12:00:00.000Z".into(), ..Default::default() };
    let done = convert(&[genesis.clone(), note.clone()], &options).unwrap();
    assert!(done.skipped.is_empty(), "{:?}", done.skipped);
    assert_eq!(done.blocks.len(), 3);
    let (g, link, n) = (&done.blocks[0], &done.blocks[1], &done.blocks[2]);
    assert_eq!(done.map[&gh], g["hash"]);
    assert_eq!(done.map[&nh], n["hash"]);
    // Fresh 1.6 blocks, valid, chained from the new genesis, deriving from the old hash, the old time in `when`.
    assert!(valid::valid(g, &js::Index::default(), None, None).is_empty());
    // The genesis has no refs, so the old identity is named by the first block of the new chain.
    assert_eq!(link["state"]["kind"], "converted");
    assert_eq!(link["refs"]["derives_from"], json!([gh]));
    assert_eq!(link["state"]["seq"], 1);
    let index = js::index_of([g]);
    assert!(valid::valid(link, &index, None, None).is_empty());
    let index = js::index_of([g, link]);
    let wrong = valid::valid(n, &index, None, None);
    assert!(wrong.is_empty(), "{wrong:?}");
    assert_eq!(n["refs"]["author"], g["hash"]);
    assert_eq!(n["refs"]["prev"], link["hash"]);
    assert_eq!(n["state"]["seq"], 2);
    assert_eq!(n["state"]["at"], "2026-10-15T12:00:00.000Z");
    assert_eq!(n["state"]["when"], "2024-01-02T00:00:00.000Z");
    assert_eq!(n["refs"]["derives_from"], json!([nh]));
    assert_eq!(n["refs"]["of"], "a".repeat(64));
    // The same map and the blocks already written: nothing is added.
    let again = ConvertOptions { map: done.map.clone(), existing: done.blocks.clone(), at: "2026-10-16T12:00:00.000Z".into(), keys: options.keys.clone(), ..Default::default() };
    assert!(convert(&[genesis, note], &again).unwrap().blocks.is_empty());
}

#[test]
fn a_block_whose_author_has_no_key_is_not_converted() {
    let note = json!({ "type": "observe.received", "state": { "text": "x" }, "refs": { "author": "b".repeat(64) } });
    let done = convert(&[note], &ConvertOptions { at: "2026-10-15T12:00:00.000Z".into(), ..Default::default() }).unwrap();
    assert!(done.blocks.is_empty() && done.skipped.len() == 1);
}

#[test]
fn the_old_canonical_hashes_are_reproduced() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/old-canonical.json")).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    for v in all["vectors"].as_array().unwrap() {
        let block = json!({ "type": v["type"], "state": v["state"], "refs": v["refs"] });
        assert_eq!(old_hash(&block), v["expected_hash"].as_str().unwrap(), "{}", v["name"]);
    }
}

// ---- The classes the converter makes valid (spec/legacy/converter.md) ----
use foodblock::audience::finds_self;

fn key(seed: &str) -> foodblock::Keypair {
    keypair_from_seed(&seed.repeat(32)).unwrap()
}

fn old_person(owner: &foodblock::Keypair, encrypt: Option<&str>) -> Value {
    let mut state = json!({ "name": "P", "public_key_sign": owner.public_key_sign, "at": "2024-01-01T00:00:00.000Z", "audience": "public" });
    if let Some(e) = encrypt {
        state["public_key_encrypt"] = json!(e);
    }
    json!({ "type": "actor.foodie", "state": state, "refs": {} })
}

fn world(extra: Vec<Value>, keys: &[(&str, &foodblock::Keypair)], tweak: impl FnOnce(&mut ConvertOptions)) -> (Done, Vec<String>) {
    let mut options = ConvertOptions { at: "2026-10-15T12:00:00.000Z".into(), ..Default::default() };
    for (id, k) in keys {
        options.keys.insert(id.to_string(), k.to_json());
    }
    tweak(&mut options);
    let done = convert(&extra, &options).unwrap();
    let ids = done.blocks.iter().map(|b| js::hash_of(b).to_string()).collect();
    (Done(done), ids)
}

struct Done(foodblock::legacy::Converted);

/// Every converted block is valid against the others (the schemas it names are among them).
fn all_valid(done: &foodblock::legacy::Converted) {
    let schemas: Vec<Value> = done.blocks.iter().filter(|b| b["type"] == "thing" && b["state"]["kind"] == "schema").cloned().collect();
    let held = js::index_of(done.blocks.iter());
    let schema_index = js::index_of(schemas.iter());
    for b in &done.blocks {
        let mut others = held.clone();
        others.shift_remove(js::hash_of(b));
        let wrong = valid::valid(b, &others, Some(&schema_index), None);
        assert!(wrong.is_empty(), "{} {}: {wrong:?}", b["type"], b["state"]["kind"]);
    }
}

#[test]
fn old_value_classes_take_the_1_6_grammar() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/legacy-classes.json")).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    for c in all["cases"].as_array().unwrap() {
        let out = reshape(&json!({ "type": "observe", "state": c["state"], "refs": {} }));
        for (k, v) in c["becomes"].as_object().unwrap() {
            assert_eq!(&out["state"][k], v, "{}: {k}", c["name"]);
        }
    }
}

#[test]
fn a_plain_audience_becomes_commitments_each_recipient_can_open() {
    let (ann, bob) = (key("31"), key("32"));
    let bob_encrypt = foodblock::generate_encryption_keypair().unwrap();
    let a = old_person(&ann, None);
    let b = old_person(&bob, bob_encrypt["public_key_encrypt"].as_str());
    let (ah, bh) = (old_hash(&a), old_hash(&b));
    let note = json!({ "type": "observe.note", "state": { "text": "for Bob", "audience": [bh, ah, "f".repeat(64)] }, "refs": { "author": ah } });
    let (done, _) = world(vec![a, b, note.clone()], &[(&ah, &ann), (&bh, &bob)], |_| {});
    let done = done.0;
    assert!(done.skipped.is_empty(), "{:?}", done.skipped);
    all_valid(&done);
    let block = done.blocks.iter().find(|x| x["state"]["audience"].is_array()).unwrap();
    // One commitment per recipient with a new id (the unknown recipient is left out), sorted, and a nonce.
    let audience = block["state"]["audience"].as_array().unwrap();
    assert_eq!(audience.len(), 2);
    assert_eq!(block["state"]["nonce"].as_str().unwrap().len(), 32);
    // Each recipient is given the reveal that opens its entry; Bob's copy is sealed to his encryption key.
    assert_eq!(done.deliveries.len(), 2);
    let (new_bob, new_ann) = (done.map[&bh].as_str().unwrap(), done.map[&ah].as_str().unwrap());
    for d in &done.deliveries {
        let who = d["to"].as_str().unwrap();
        let reveal = &d["reveals"][0];
        assert_eq!(reveal["value"], who);
        assert!(finds_self(block, who, reveal["salt"].as_str().unwrap()), "{who} finds itself");
        assert!(who == new_bob || who == new_ann);
    }
    let to_bob = done.deliveries.iter().find(|d| d["to"] == new_bob).unwrap();
    let opened = foodblock::write::open_copy(&to_bob["sealed"], bob_encrypt["x25519_private"].as_str().unwrap()).unwrap();
    assert_eq!(opened["hash"], block["hash"]);
    assert_eq!(opened["reveals"], to_bob["reveals"]);
    // Ann has no encryption key in her genesis: her reveal is delivered unsealed.
    assert!(done.deliveries.iter().find(|d| d["to"] == new_ann).unwrap()["sealed"].is_null());
}

#[test]
fn a_set_of_refs_is_sorted_after_the_ids_are_replaced() {
    let owner = key("33");
    let people: Vec<(foodblock::Keypair, Value)> = (0..4).map(|i| { let k = key(&format!("4{i}")); let g = old_person(&k, None); (k, g) }).collect();
    let hashes: Vec<String> = people.iter().map(|(_, g)| old_hash(g)).collect();
    let g = old_person(&owner, None);
    let gh = old_hash(&g);
    // Sorted by the old ids; the new ids come out in another order.
    let mut sorted = hashes.clone();
    sorted.sort();
    let talk = json!({ "type": "observe.conversation", "state": { "is_group": true }, "refs": { "author": gh, "participants": sorted } });
    let mut all = vec![g.clone(), talk];
    all.extend(people.iter().map(|(_, g)| g.clone()));
    let mut keys: Vec<(&str, &foodblock::Keypair)> = vec![(&gh, &owner)];
    for (i, (k, _)) in people.iter().enumerate() {
        keys.push((&hashes[i], k));
    }
    let (done, _) = world(all, &keys, |_| {});
    assert!(done.0.skipped.is_empty(), "{:?}", done.0.skipped);
    all_valid(&done.0);
    let talk = done.0.blocks.iter().find(|b| b["state"]["kind"] == "conversation").unwrap();
    let ids: Vec<&str> = talk["refs"]["participants"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
    assert_eq!(ids.len(), 4);
    assert!(ids.windows(2).all(|w| w[0] < w[1]));
}

#[test]
fn what_a_closed_type_does_not_declare_goes_under_a_schema() {
    let owner = key("35");
    let g = old_person(&owner, None);
    let gh = old_hash(&g);
    let member = json!({ "type": "grant.member", "state": { "roles": ["cook"], "instance_id": "abc", "group_name": "Home", "nested": { "a": 1 } }, "refs": { "author": gh, "member": gh, "group": gh, "witness": gh, "from": format!("message:{}", "e".repeat(64)) } });
    let (done, _) = world(vec![g.clone(), member.clone()], &[(&gh, &owner)], |_| {});
    let done = done.0;
    assert!(done.skipped.is_empty(), "{:?}", done.skipped);
    all_valid(&done);
    let block = done.blocks.iter().find(|b| b["type"] == "grant").unwrap();
    // A schema (a thing of kind schema) written by the same signer names the fields and roles, and the block names it.
    let schema = done.blocks.iter().find(|b| b["state"]["kind"] == "schema").unwrap();
    assert_eq!(block["refs"]["schema"], schema["hash"]);
    assert_eq!(schema["refs"]["author"], block["refs"]["author"]);
    assert_eq!(schema["state"]["target"], "grant.member");
    assert_eq!(schema["state"]["fields"]["instance_id"], "text");
    assert_eq!(schema["state"]["fields"]["nested"], "object");
    assert!(schema["state"]["roles"].as_array().unwrap().iter().any(|r| r == "witness"));
    // A ref that is not an id is kept as text, never a ref.
    assert!(block["refs"].get("from").is_none());
    assert_eq!(block["state"]["was_from"], format!("message:{}", "e".repeat(64)));
    // Without the schema in hand, the check refuses the same block.
    let wrong = valid::valid(block, &js::index_of(done.blocks.iter().filter(|b| *b != block)), Some(&js::Index::default()), None);
    assert!(wrong.iter().any(|r| r.code == "undeclared_ref"));
    // A schema already published that declares everything is named instead of writing another.
    let known = json!({ "type": "thing", "hash": "9".repeat(64), "state": { "kind": "schema", "target": "grant", "fields": { "instance_id": "text", "group_name": "text", "nested": "object", "was_from": "text" }, "roles": ["witness"] }, "refs": {} });
    let (done2, _) = world(vec![g, member], &[(&gh, &owner)], |o| o.schemas = vec![known.clone()]);
    assert!(!done2.0.blocks.iter().any(|b| b["state"]["kind"] == "schema"));
    assert_eq!(done2.0.blocks.iter().find(|b| b["type"] == "grant").unwrap()["refs"]["schema"], "9".repeat(64));
}

#[test]
fn a_block_no_1_6_shape_holds_becomes_an_observe_deriving_from_it() {
    let owner = key("36");
    let g = old_person(&owner, None);
    let gh = old_hash(&g);
    // A status with no answer, an ask with no expiry: a promise cannot carry them.
    let order = json!({ "type": "promise.order", "state": { "what": "six eggs", "status": "accepted" }, "refs": { "author": gh, "to": gh } });
    let oh = old_hash(&order);
    let (done, _) = world(vec![g, order], &[(&gh, &owner)], |_| {});
    let done = done.0;
    assert!(done.skipped.is_empty(), "{:?}", done.skipped);
    all_valid(&done);
    let block = &done.blocks[done.blocks.len() - 1];
    assert_eq!(block["type"], "observe");
    assert_eq!(block["state"]["kind"], "legacy");
    assert_eq!(block["state"]["was"], "promise.order");
    assert_eq!(block["state"]["what"], "six eggs");
    assert_eq!(block["refs"]["derives_from"], json!([oh]));
}

#[test]
fn an_author_with_no_key_is_signed_for_by_the_custodian_or_reported() {
    let custodian = key("37");
    let g = old_person(&custodian, None);
    let ch = old_hash(&g);
    // An author whose own genesis is not in the data at all.
    let ghost = "d".repeat(64);
    let note = json!({ "type": "observe.note", "state": { "text": "from a ghost" }, "refs": { "author": ghost } });
    let nh = old_hash(&note);
    let request = "c".repeat(64);
    // Without a custodian key the block is reported, with its reason.
    let (none, _) = world(vec![g.clone(), note.clone()], &[(&ch, &custodian)], |_| {});
    assert_eq!(none.0.skipped.len(), 1);
    assert_eq!(none.0.skipped[0].0, nh);
    // With one: the new genesis names the custodian, and the blocks are marked import and derive from the old hash.
    let held = json!({ "public_key_sign": custodian.public_key_sign, "private_key": custodian.private_key, "custodian": ch, "channel": "import" });
    let (done, _) = world(vec![g, note], &[(&ch, &custodian)], |o| {
        o.custodian_key = Some(held);
        o.request_hash = request.clone();
    });
    let done = done.0;
    assert!(done.skipped.is_empty(), "{:?}", done.skipped);
    all_valid(&done);
    let custodian_new = done.map[&ch].as_str().unwrap();
    let genesis = done.blocks.iter().find(|b| b["type"] == "actor" && b["state"]["custodian"].is_string()).unwrap();
    assert_eq!(genesis["state"]["custodian"], custodian_new);
    let block = done.blocks.iter().find(|b| b["state"]["text"] == "from a ghost").unwrap();
    assert_eq!(block["state"]["channel"], "import");
    assert_eq!(block["refs"]["author"], genesis["hash"]);
    assert!(block["refs"]["derives_from"].as_array().unwrap().iter().any(|h| *h == nh));
}
