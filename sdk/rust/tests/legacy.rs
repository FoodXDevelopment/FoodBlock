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
