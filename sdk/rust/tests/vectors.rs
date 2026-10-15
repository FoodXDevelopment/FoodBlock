//! Conformance: every section of spec/vectors.json, spec/canonical-vectors.json and test/vectors.json, checked the
//! way spec/run-vectors.cjs checks the reference SDK. `cargo test -- --nocapture` prints every line.
//! A section this build's profile leaves out says so, by name, instead of passing silently.
use foodblock::js::{deep_eq, index_of, Index};
use serde_json::{json, Value};
use std::sync::OnceLock;

fn load(path: &str) -> Value {
    let full = format!("{}/../../{path}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_slice(&std::fs::read(&full).unwrap_or_else(|e| panic!("{full}: {e}"))).unwrap()
}
fn v() -> &'static Value {
    static V: OnceLock<Value> = OnceLock::new();
    V.get_or_init(|| load("spec/vectors.json"))
}
fn key(signer: &str, field: &str) -> String {
    v()["keys"][signer][field]
        .as_str()
        .unwrap_or_else(|| panic!("no key {signer}.{field}"))
        .to_string()
}
fn public(signer: &str) -> String {
    key(signer, "public_key_sign")
}
fn arr(x: &Value) -> &Vec<Value> {
    x.as_array().unwrap()
}
fn s(x: &Value) -> &str {
    x.as_str().unwrap_or("")
}
/// `{ hash, ...block, signature }` for each vector block.
fn blocks_of(list: &Value) -> Vec<Value> {
    arr(list)
        .iter()
        .map(|b| {
            let mut out = json!({ "hash": b["hash"] });
            for (k, val) in b["block"].as_object().unwrap() {
                out[k] = val.clone();
            }
            out["signature"] = b["signature"].clone();
            out
        })
        .collect()
}
fn find<'a>(held: &'a [Value], hash: &Value) -> &'a Value {
    held.iter()
        .find(|b| b["hash"] == *hash)
        .unwrap_or_else(|| panic!("no block {hash}"))
}
#[allow(dead_code)]
/// Every key of `want` deep-equals the same key of `got`.
fn subset(got: &Value, want: &Value) -> bool {
    want.as_object()
        .unwrap()
        .iter()
        .all(|(k, w)| got.get(k).map_or(w.is_null(), |g| deep_eq(g, w)))
}
/// The codes a refusal list carries, once each, in protocol.json's order.
fn codes_of<'a>(codes: impl IntoIterator<Item = &'a str>) -> Value {
    let mut out: Vec<&str> = vec![];
    for c in codes {
        if !out.contains(&c) {
            out.push(c);
        }
    }
    json!(out)
}
fn codes(block: &Value, options: foodblock::CheckOptions) -> Value {
    let found = foodblock::refusals(s(&block["type"]), &block["state"], &block["refs"], options);
    codes_of(found.iter().map(|r| r.code.as_str()))
}
fn strict(block: &Value) -> Vec<String> {
    foodblock::check(
        s(&block["type"]),
        &block["state"],
        &block["refs"],
        Default::default(),
    )
}

/// A section's tally: every case named, every failure listed.
struct Report {
    section: &'static str,
    pass: usize,
    fail: Vec<String>,
}
impl Report {
    fn new(section: &'static str) -> Self {
        Report {
            section,
            pass: 0,
            fail: vec![],
        }
    }
    fn ok(&mut self, ok: bool, name: impl AsRef<str>) {
        self.why(ok, name, "");
    }
    fn why(&mut self, ok: bool, name: impl AsRef<str>, why: impl AsRef<str>) {
        let name = name.as_ref();
        if ok {
            self.pass += 1;
            println!("✓ {}: {name}", self.section);
        } else {
            println!("✗ {}: {name} {}", self.section, why.as_ref());
            self.fail.push(format!("{name} {}", why.as_ref()));
        }
    }
    fn done(self) {
        println!(
            "{}: {} passed, {} failed",
            self.section,
            self.pass,
            self.fail.len()
        );
        assert!(self.pass > 0, "{}: no vectors ran", self.section);
        assert!(
            self.fail.is_empty(),
            "{}: {} failed:\n{}",
            self.section,
            self.fail.len(),
            self.fail.join("\n")
        );
    }
}

#[test]
fn version_matches_protocol_json() {
    let p = load("spec/protocol.json");
    assert_eq!(foodblock::VERSION, p["version"].as_str().unwrap());
    assert_eq!(foodblock::spec().version, foodblock::VERSION);
    assert!(
        env!("CARGO_PKG_VERSION").starts_with(&format!("{}.", foodblock::VERSION)),
        "the crate's version is the protocol's"
    );
    // Every profile this build claims is one protocol.json names.
    for profile in foodblock::profiles() {
        assert!(
            p["profiles"].get(*profile).is_some(),
            "{profile} is a protocol.json profile"
        );
    }
    println!("profiles in this build: {:?}", foodblock::profiles());
}

#[test]
fn canonical() {
    let mut r = Report::new("canonical");
    for c in arr(&load("spec/canonical-vectors.json")["vectors"]) {
        let b = &c["block"];
        let h = |x: &Value| foodblock::hash(s(&x["type"]), &x["state"], &x["refs"]);
        let text = foodblock::canonical(s(&b["type"]), &b["state"], &b["refs"]);
        let ok = c.get("same_as").is_none_or(|o| h(b) == h(o))
            && c.get("not_same_as").is_none_or(|o| h(b) != h(o))
            && c.get("canonical_contains")
                .is_none_or(|t| text.contains(s(t)));
        r.ok(ok, s(&c["name"]));
    }
    for c in arr(&v()["canonical"]) {
        let b = &c["block"];
        r.ok(
            foodblock::canonical(s(&b["type"]), &b["state"], &b["refs"]) == s(&c["canonical"])
                && foodblock::hash(s(&b["type"]), &b["state"], &b["refs"]) == s(&c["hash"]),
            s(&c["name"]),
        );
    }
    r.done();
}

#[test]
fn legacy_cross_language_hashes() {
    // test/vectors.json: older shapes and floats; they still hash the same.
    let mut r = Report::new("test/vectors.json");
    for c in arr(&load("test/vectors.json")) {
        let text = foodblock::canonical(s(&c["type"]), &c["state"], &c["refs"]);
        let hash = foodblock::hash(s(&c["type"]), &c["state"], &c["refs"]);
        r.why(
            text == s(&c["expected_canonical"]) && hash == s(&c["expected_hash"]),
            s(&c["name"]),
            format!("got {text}"),
        );
    }
    r.done();
}

#[test]
fn hashes_write_check_and_reads() {
    let mut r = Report::new("hashes");
    for c in arr(&v()["hashes"]) {
        let b = &c["block"];
        let name = s(&c["name"]);
        r.ok(
            foodblock::canonical(s(&b["type"]), &b["state"], &b["refs"]) == s(&c["canonical"])
                && foodblock::hash(s(&b["type"]), &b["state"], &b["refs"]) == s(&c["hash"]),
            format!("hash: {name}"),
        );
        // A block in an earlier shape hashes like any other; the strict check refuses it with the codes named.
        if c.get("refused").is_none() {
            let wrong = strict(b);
            r.why(
                wrong.is_empty(),
                format!("write check: {name}"),
                wrong.join("; "),
            );
            continue;
        }
        let got = codes(b, Default::default());
        r.why(
            got == c["refused"],
            format!("strict check refuses it, with its codes: {name}"),
            got.to_string(),
        );
    }
    r.done();
}

#[test]
fn chains() {
    let mut r = Report::new("chains");
    let hashes = arr(&v()["hashes"]);
    let mut authors: Vec<&str> = hashes
        .iter()
        .filter_map(|c| c["block"]["refs"]["author"].as_str())
        .collect();
    authors.dedup();
    let mut seen = vec![];
    for id in authors {
        if seen.contains(&id) {
            continue;
        }
        seen.push(id);
        let mine: Vec<Value> = hashes
            .iter()
            .filter(|c| c["block"]["refs"]["author"].as_str() == Some(id))
            .map(|c| {
                let mut b = c["block"].clone();
                b["hash"] = c["hash"].clone();
                b
            })
            .collect();
        let chain = foodblock::check_chain(&mine, id);
        r.ok(
            chain.ok,
            format!(
                "{}'s {} blocks, no gaps, no equivocation",
                &id[..8],
                mine.len()
            ),
        );
    }
    r.done();
}

#[test]
fn audience() {
    let mut r = Report::new("audience");
    for c in arr(&v()["audience"]) {
        r.ok(
            foodblock::salted_hash(s(&c["salt"]), s(&c["recipient"])) == s(&c["commitment"]),
            s(&c["name"]),
        );
    }
    r.done();
}

/// Every story's blocks, as the runner lists them: (group, name, blocks).
fn stories() -> Vec<(String, String, Value)> {
    let v = v();
    let mut out = vec![];
    fn add(out: &mut Vec<(String, String, Value)>, group: &str, list: &Value) {
        for c in arr(list) {
            out.push((
                group.to_string(),
                s(&c["name"]).to_string(),
                c["blocks"].clone(),
            ));
        }
    }
    add(&mut out, "identity", &v["identities"]);
    add(&mut out, "deal", &v["deals"]);
    add(&mut out, "circle", &v["circles"]);
    for (k, g) in [
        ("promises", "promise fold"),
        ("circles", "circle fold"),
        ("audience", "audience fold"),
        ("things", "thing fold"),
        ("successors", "successor fold"),
        ("rekeys", "rekey fold"),
        ("ballots", "ballot fold"),
    ] {
        add(&mut out, g, &v["folds"][k]);
    }
    out.push((
        "refusal".into(),
        "stories".into(),
        v["refusals"]["blocks"].clone(),
    ));
    for c in arr(&v["refusals"]["cases"]) {
        if c.get("blocks").is_some() {
            out.push((
                "refusal".into(),
                s(&c["name"]).to_string(),
                c["blocks"].clone(),
            ));
        }
    }
    out.push((
        "sealed".into(),
        "stories".into(),
        v["sealed"]["blocks"].clone(),
    ));
    out
}

fn by_hash() -> Index {
    let mut index = Index::default();
    for c in arr(&v()["hashes"]) {
        index.insert(s(&c["hash"]).to_string(), c["block"].clone());
    }
    for (_, _, list) in stories() {
        for b in arr(&list) {
            index.insert(s(&b["hash"]).to_string(), b["block"].clone());
        }
    }
    index
}

#[test]
fn stories_hash_verify_and_check() {
    let mut r = Report::new("stories");
    for (group, name, list) in stories() {
        let mut wrong = vec![];
        for b in arr(&list) {
            let block = &b["block"];
            if foodblock::hash(s(&block["type"]), &block["state"], &block["refs"]) != s(&b["hash"])
            {
                wrong.push(format!("{}: hash", s(&b["name"])));
            }
            if !foodblock::verify(block, s(&b["signature"]), &public(s(&b["signer"]))) {
                wrong.push(format!("{}: signature", s(&b["name"])));
            }
            if block["state"].get("seq").is_some() {
                let w = strict(block);
                if !w.is_empty() {
                    wrong.push(format!("{}: {}", s(&b["name"]), w.join("; ")));
                }
            }
        }
        r.why(
            wrong.is_empty(),
            format!(
                "{group}: {name}: {} blocks hash, verify and pass the write check",
                arr(&list).len()
            ),
            wrong.join(" | "),
        );
    }
    r.done();
}

#[test]
fn signatures_byte_exact_from_seeds() {
    let mut r = Report::new("signatures");
    let index = by_hash();
    // Every vector key rebuilds from its seed, and every signature is reproduced byte for byte.
    for (name, k) in v()["keys"].as_object().unwrap() {
        if let Some(seed) = k.get("ed25519_seed").and_then(Value::as_str) {
            let pair = foodblock::keypair_from_seed(seed).unwrap();
            let private_ok = k
                .get("private_key")
                .is_none_or(|p| pair.private_key == s(p));
            r.ok(
                pair.public_key_sign == s(&k["public_key_sign"]) && private_ok,
                format!("key from seed: {name}"),
            );
        }
    }
    for c in arr(&v()["signatures"]) {
        let block = &index[s(&c["hash"])];
        let signer = s(&c["signer"]);
        let ours = foodblock::sign(block, &key(signer, "private_key")).unwrap();
        r.ok(
            ours == s(&c["signature"]) && foodblock::verify(block, &ours, &public(signer)),
            format!("signed byte for byte: {}", s(&c["name"])),
        );
    }
    // And every story block's signature too.
    let mut count = 0;
    let mut wrong = vec![];
    for (_, _, list) in stories() {
        for b in arr(&list) {
            let signer = s(&b["signer"]);
            if v()["keys"][signer].get("private_key").is_none() {
                continue;
            }
            count += 1;
            if foodblock::sign(&b["block"], &key(signer, "private_key")).unwrap()
                != s(&b["signature"])
            {
                wrong.push(s(&b["name"]).to_string());
            }
        }
    }
    r.why(
        wrong.is_empty(),
        format!("every story block's signature reproduced from its seed ({count})"),
        wrong.join(", "),
    );
    for c in arr(&v()["bad_signatures"]) {
        let ok = index
            .get(s(&c["hash"]))
            .is_some_and(|b| foodblock::verify(b, s(&c["signature"]), &public(s(&c["signer"]))));
        r.ok(!ok, format!("bad signature refused: {}", s(&c["name"])));
    }
    r.done();
}

#[test]
fn headers() {
    let mut r = Report::new("headers");
    let index = by_hash();
    for c in arr(&v()["headers"]) {
        let mut block = index[s(&c["hash"])].clone();
        block["hash"] = c["hash"].clone();
        let mut part = c["header"].clone();
        part["signature"] = c["header_signature"].clone();
        r.ok(
            deep_eq(&foodblock::header(&block), &c["header"])
                && foodblock::verify_message(&part, &public(s(&c["signer"]))),
            s(&c["name"]),
        );
    }
    r.done();
}

#[cfg(feature = "envelope")]
#[test]
fn envelopes_and_sealed_copies() {
    let mut r = Report::new("envelopes");
    for c in arr(&v()["envelopes"]) {
        let got = foodblock::open(&c["envelope"], &key(s(&c["recipient"]), "x25519_private"))
            .and_then(|p| foodblock::unwrap(&p));
        let want = &c["opens_to"];
        r.why(
            got.as_ref().is_ok_and(|m| {
                m["hash"] == want["hash"]
                    && m["signature"] == want["signature"]
                    && m["version"] == want["version"]
            }),
            format!("envelope: {}", s(&c["name"])),
            got.err().map(|e| e.to_string()).unwrap_or_default(),
        );
    }
    for c in arr(&v()["sealed"]["cases"]) {
        let got = foodblock::open_copy(&c["message"], &key(s(&c["recipient"]), "x25519_private"));
        let want = &c["opens_to"];
        let ok = got.as_ref().is_ok_and(|m| {
            m["hash"] == want["hash"]
                && m["signature"] == want["signature"]
                && deep_eq(&m["reveals"], &want["reveals"])
                && foodblock::header_signed_by(&c["message"], &public(s(&c["signer"])))
        });
        r.why(
            ok,
            format!("sealed: {}", s(&c["name"])),
            got.err().map(|e| e.to_string()).unwrap_or_default(),
        );
    }
    // A copy sealed here opens with the reference rules, and its header is signed by the block's key.
    let index = by_hash();
    let c = &arr(&v()["signatures"])[0];
    let mut block = index[s(&c["hash"])].clone();
    block["hash"] = c["hash"].clone();
    block["signature"] = c["signature"].clone();
    let copy = foodblock::seal_copy(
        &block,
        &[&key("bob", "public_key_encrypt")],
        &json!([]),
        &key(s(&c["signer"]), "private_key"),
        None,
    )
    .unwrap();
    let opened = foodblock::open_copy(&copy, &key("bob", "x25519_private")).unwrap();
    r.ok(
        opened["hash"] == c["hash"] && foodblock::header_signed_by(&copy, &public(s(&c["signer"]))),
        "a copy sealed here opens and its header verifies",
    );
    r.done();
}
#[cfg(not(feature = "envelope"))]
#[test]
fn envelopes_and_sealed_copies() {
    println!("envelopes, sealed copies: excluded by this build's profile (they are node: build with --features envelope or node)");
}

#[test]
fn identities() {
    let mut r = Report::new("identities");
    for c in arr(&v()["identities"]) {
        let held = blocks_of(&c["blocks"]);
        let arrivals = c.get("arrivals").cloned();
        let lookup = |h: &str| {
            arrivals
                .as_ref()
                .and_then(|a| a.get(h))
                .and_then(Value::as_str)
                .map(String::from)
        };
        let arrived: foodblock::identity::ArrivedAt = if arrivals.is_some() {
            Some(&lookup)
        } else {
            None
        };
        let name = s(&c["name"]);
        let id = s(&c["id"]);
        for b in &held {
            if let Some(want) = c["signed_by_author"].get(s(&b["hash"])) {
                let label = arr(&c["blocks"])
                    .iter()
                    .find(|x| x["hash"] == b["hash"])
                    .map(|x| s(&x["name"]))
                    .unwrap_or("");
                let got = foodblock::identity::signed_by_author(b, &held, arrived);
                r.ok(
                    Value::Bool(got) == *want,
                    format!(
                        "{name}: {label} {}",
                        if want == true { "stands" } else { "is void" }
                    ),
                );
            }
        }
        if let Some(keys) = c.get("keys") {
            let mut got = foodblock::identity::keys_of(id, &held, arrived);
            got.sort();
            r.why(
                json!(got) == *keys,
                format!("{name}: the keys that speak"),
                format!("{got:?}"),
            );
        }
        if let Some(frozen) = c.get("frozen") {
            let mut got: Vec<String> = foodblock::identity::key_timeline(id, &held, None)
                .into_iter()
                .filter(|k| k.frozen)
                .map(|k| k.key)
                .collect();
            got.sort();
            r.ok(json!(got) == *frozen, format!("{name}: the frozen keys"));
        }
        if let Some(ops) = c.get("operators") {
            r.ok(
                json!(foodblock::grant::operators_of(id, &held, None)) == *ops,
                format!("{name}: its operators"),
            );
        }
        if c.get("history").is_some() {
            let state = foodblock::identity_state(id, &held, arrived);
            let signed_ok = c["signed_by_author"].as_object().is_none_or(|m| {
                m.iter().all(|(h, ok)| {
                    state
                        .signed_by_author
                        .iter()
                        .any(|(x, got)| x == h && Value::Bool(*got) == *ok)
                })
            });
            r.why(
                json!(state.history) == c["history"]
                    && json!(state.keys) == c["keys"]
                    && c.get("frozen").is_none_or(|f| json!(state.frozen) == *f)
                    && signed_ok,
                format!("{name}: the identity fold (signed_by_author, keys, frozen, history)"),
                state.to_json().to_string(),
            );
        }
        if let Some(Value::Object(under)) = c.get("under") {
            for (h, ok) in under {
                let block = find(&held, &json!(h));
                r.ok(
                    foodblock::grant::why_not_under(block, &held, None).is_empty()
                        == ok.as_bool().unwrap(),
                    format!("{name}: a block under the grant speaks for its grantor"),
                );
            }
        }
    }
    r.done();
}

#[cfg(feature = "folds")]
mod folds {
    use super::*;
    use foodblock::fold::{self, StageOptions};

    pub fn stage_of(c: &Value) -> Value {
        let held = blocks_of(&c["blocks"]);
        let first = find(&held, &c["first"]).clone();
        let now = c.get("now").and_then(Value::as_str);
        fold::promise_stage(
            &first,
            &held,
            &StageOptions {
                now,
                confirmers: vec![],
            },
        )
    }

    #[test]
    fn promise_folds() {
        let mut r = Report::new("promise fold");
        for c in arr(&v()["deals"])
            .iter()
            .chain(arr(&v()["folds"]["promises"]))
        {
            let got = stage_of(c);
            r.why(
                subset(&got, &c["expected"]),
                format!("{}: {}", s(&c["name"]), s(&c["expected"]["stage"])),
                got.to_string(),
            );
        }
        r.done();
    }

    #[test]
    fn circle_folds() {
        let mut r = Report::new("circle fold");
        for c in arr(&v()["circles"])
            .iter()
            .chain(arr(&v()["folds"]["circles"]))
        {
            let held = blocks_of(&c["blocks"]);
            let circle = s(&c["circle"]);
            let state = fold::circle_state(circle, &held, None).unwrap();
            let members = if c["expected"]["members"].is_array() {
                let mut keys: Vec<&String> = state.members.keys().collect();
                keys.sort();
                json!(keys)
            } else {
                Value::Object(
                    state
                        .members
                        .iter()
                        .map(|(who, m)| {
                            let mut roles = m.roles.clone();
                            roles.sort();
                            (who.clone(), json!(roles))
                        })
                        .collect(),
                )
            };
            let mut removed: Vec<&String> = state.removed.keys().collect();
            removed.sort();
            let may_act = c.get("may_act").and_then(Value::as_object).is_none_or(|m| {
                m.iter().all(|(h, ok)| {
                    fold::may_act_as(find(&held, &json!(h)), circle, &held, None)
                        == ok.as_bool().unwrap()
                })
            });
            r.why(
                deep_eq(&members, &c["expected"]["members"])
                    && json!(removed) == c["expected"]["removed"]
                    && c["expected"].get("counted_to").is_none_or(|want| {
                        want.as_object().unwrap().iter().all(|(who, h)| state.removed.get(who).and_then(|x| x.as_deref()) == h.as_str())
                    })
                    && may_act,
                s(&c["name"]),
                state.to_json().to_string(),
            );
        }
        r.done();
    }

    #[test]
    fn audience_folds() {
        let mut r = Report::new("audience fold");
        for c in arr(&v()["folds"]["audience"]) {
            let held = blocks_of(&c["blocks"]);
            for case in arr(&c["cases"]) {
                let got =
                    fold::members_then(find(&held, &case["block"]), s(&case["recipient"]), &held);
                r.why(
                    json!(got) == case["members"],
                    s(&case["name"]),
                    format!("{got:?}"),
                );
            }
        }
        r.done();
    }

    #[test]
    fn things_where_and_owner() {
        let mut r = Report::new("thing fold");
        for c in arr(&v()["folds"]["things"]) {
            let held = blocks_of(&c["blocks"]);
            for case in arr(&c["where"]) {
                let got = fold::where_now(find(&held, &case["thing"]), &held);
                r.why(
                    json!(got) == case["places"],
                    format!("where now: {}", s(&case["name"])),
                    format!("{got:?}"),
                );
            }
            for case in arr(&c["owners"]) {
                let got = fold::ownership(find(&held, &case["thing"]), &held);
                r.why(
                    json!(got.owner) == case["owner"] && json!(got.conflict) == case["conflict"],
                    format!("owner: {}", s(&case["name"])),
                    format!("{got:?}"),
                );
            }
        }
        r.done();
    }

    #[test]
    fn successors() {
        let mut r = Report::new("successor fold");
        for c in arr(&v()["folds"]["successors"]) {
            let held = blocks_of(&c["blocks"]);
            let arrivals = c["arrivals"].clone();
            let lookup = |h: &str| arrivals.get(h).and_then(Value::as_str).map(String::from);
            let got = fold::successor_state(
                find(&held, &c["grant"]),
                &held,
                c["now"].as_str(),
                Some(&lookup),
            );
            r.why(subset(&got, &c["expected"]), s(&c["name"]), got.to_string());
        }
        r.done();
    }

    #[test]
    fn ballots_and_rekeys() {
        let mut r = Report::new("ballot and rekey folds");
        for c in arr(&v()["folds"]["ballots"]) {
            let held = blocks_of(&c["blocks"]);
            for case in arr(&c["cases"]) {
                let got = fold::counted_in(
                    find(&held, &case["result"]),
                    s(&case["commitment"]),
                    s(&case["counter"]),
                );
                r.ok(
                    Value::Bool(got) == case["counted"],
                    format!("ballot: {}", s(&case["name"])),
                );
            }
        }
        for c in arr(&v()["folds"]["rekeys"]) {
            let got = fold::circle_key(s(&c["circle"]), &blocks_of(&c["blocks"]));
            r.why(
                subset(&got, &c["expected"]),
                format!("circle key: {}", s(&c["name"])),
                got.to_string(),
            );
        }
        r.done();
    }
}
#[cfg(not(feature = "folds"))]
#[test]
fn folds_excluded() {
    println!("folds (promises, circles, audience, things, successors, ballots, rekeys): excluded by this build's profile (edge and node: --features folds)");
}

#[test]
fn refusals() {
    let mut r = Report::new("refusals");
    let mut all = blocks_of(&v()["refusals"]["blocks"]);
    for (_, _, list) in stories() {
        all.extend(blocks_of(&list));
    }
    let known: Index = index_of(all.iter());
    let get = |h: &Value| {
        known
            .get(s(h))
            .cloned()
            .unwrap_or_else(|| panic!("no block {h}"))
    };
    for c in arr(&v()["refusals"]["cases"]) {
        let name = format!("refused ({}): {}", s(&c["by"]), s(&c["name"]));
        match s(&c["by"]) {
            "check" => {
                let held: Index = c
                    .get("held")
                    .map(|h| index_of(arr(h).iter().map(|x| known.get(s(x)).unwrap())))
                    .unwrap_or_default();
                let b = &c["block"];
                // The codes exactly, as protocol.json orders them: the code carries the meaning.
                let got = codes(
                    b,
                    foodblock::CheckOptions {
                        schemas: None,
                        held: Some(&held),
                    },
                );
                r.why(got == c["codes"], &name, got.to_string());
            }
            "accept" => {
                #[cfg(feature = "sync")]
                {
                    let incoming: Vec<Value> = arr(&c["incoming"]).iter().map(get).collect();
                    let held: Vec<Value> = arr(&c["held"]).iter().map(get).collect();
                    let got = foodblock::sync::accept(&incoming, &held, None, None);
                    let ok = if let Some(pairs) = c.get("equivocations") {
                        // The second of a pair is neither taken nor refused: it is listed in its pair.
                        got.to_json()["taken"] == c["taken"]
                            && got.refused.is_empty()
                            && json!(got.equivocations) == *pairs
                    } else {
                        incoming
                            .iter()
                            .all(|b| got.refused.iter().any(|r| r.hash == s(&b["hash"])))
                            && codes_of(got.refused.iter().map(|r| r.code.as_str())) == c["codes"]
                    };
                    r.why(ok, &name, got.to_json().to_string());
                }
                #[cfg(not(feature = "sync"))]
                println!(
                    "{name}: excluded by this build's profile (push is edge: --features sync)"
                );
            }
            "fold" => {
                #[cfg(feature = "folds")]
                {
                    let got = folds::stage_of(c);
                    r.why(subset(&got, &c["expected"]), &name, got.to_string());
                }
                #[cfg(not(feature = "folds"))]
                println!(
                    "{name}: excluded by this build's profile (folds are edge: --features folds)"
                );
            }
            "open" => {
                #[cfg(feature = "envelope")]
                {
                    let got = foodblock::open_copy(
                        &c["message"],
                        &key(s(&c["recipient"]), "x25519_private"),
                    );
                    r.why(
                        got.as_ref().is_err_and(|e| json!([e.code]) == c["codes"]),
                        &name,
                        format!("{:?}", got.err()),
                    );
                }
                #[cfg(not(feature = "envelope"))]
                println!("{name}: excluded by this build's profile (envelopes are node: --features envelope)");
            }
            other => r.ok(false, format!("{name}: unknown refusal kind {other}")),
        }
    }
    let _ = &get;
    r.done();
}

#[test]
fn alias_reads() {
    let mut r = Report::new("reads");
    for c in arr(&v()["reads"]["cases"]) {
        let b = &c["block"];
        let read =
            foodblock::read_as(&foodblock::create(s(&b["type"]), &b["state"], &b["refs"]).unwrap());
        let mut got = json!({ "type": read["type"], "state": read["state"], "refs": read["refs"] });
        for mark in ["settles", "outside"] {
            if foodblock::js::truthy(read.get(mark)) {
                got[mark] = read[mark].clone();
            }
        }
        if foodblock::js::truthy(read.get("retired")) {
            got["retired"] = json!(true);
        }
        r.why(
            deep_eq(&got, &c["reads_as"]),
            s(&c["name"]),
            got.to_string(),
        );
    }
    r.done();
}

#[cfg(feature = "sync")]
#[test]
fn messages() {
    use foodblock::sync;
    let mut r = Report::new("messages");
    let m = &v()["messages"];
    let node = s(&m["node"]);
    let node_key = public(s(&m["node_signer"]));
    let pull = &m["signed_pull"];
    let keys = vec![public(s(&pull["signer"]))];
    let fresh = |seen: &dyn Fn(&str) -> bool, node: &str, message: &Value| {
        sync::pull_errors(
            message,
            &sync::Freshness {
                node,
                now: s(&pull["now"]),
                keys: &keys,
                seen,
                window_ms: sync::signed_window_ms(),
            },
        )
    };
    let never = |_: &str| false;
    let always = |_: &str| true;
    r.ok(
        fresh(&never, node, &pull["message"]).is_empty(),
        "a signed pull names the node, a fresh nonce and at, and is signed by its signer",
    );
    r.ok(
        !fresh(&always, node, &pull["message"]).is_empty(),
        "a signed pull replayed is refused",
    );
    let mut other = pull["message"].clone();
    other["node"] = json!("0".repeat(64));
    r.ok(
        !fresh(&never, node, &other).is_empty(),
        "a signed pull for another node is refused",
    );
    let sealed = blocks_of(&v()["sealed"]["blocks"]);
    r.ok(
        foodblock::identity::keys_of(node, &sealed, None).contains(&node_key),
        "the node key is a key of its holder, brought in by a key grant",
    );
    let answer = &m["pull_answer"]["message"];
    r.ok(
        sync::answer_signed_by(answer, &[node_key.clone()])
            && arr(&answer["blocks"]).len() as u64 == m["pull_answer"]["matches"].as_u64().unwrap(),
        "a pull answer is signed by the node",
    );
    // The answer names the request it answers: SHA-256 of the canonical signed pull.
    r.ok(
        s(&answer["request"]) == foodblock::hash_hex(&foodblock::canonical_json(&pull["message"])),
        "a pull answer names its request by the hash of its canonical form",
    );
    r.ok(
        sync::answer_signed_by(&m["push_answer"]["message"], &[node_key.clone()]),
        "a push answer is signed by the node",
    );
    {
        // Every key is always there; each refusal is { hash, code, detail } with a code from protocol.json; each pair
        // sorted. Rebuilt from its parts by the node's key, it is the same message, byte for byte.
        let p = &m["push_answer"]["message"];
        let keys: Vec<&String> = p.as_object().unwrap().keys().collect();
        let want = foodblock::spec().list("messages.push_answer");
        let fields = foodblock::spec().list("messages.refusal");
        r.ok(
            keys.iter().map(|k| k.as_str()).eq(want.iter().map(|k| k.as_str()))
                && arr(&p["refused"]).iter().all(|x| {
                    x.as_object().unwrap().keys().eq(fields.iter())
                        && foodblock::check::is_code(s(&x["code"]))
                })
                && arr(&p["equivocations"]).iter().all(|pair| {
                    let mut sorted = arr(pair).clone();
                    sorted.sort_by(|a, b| s(a).cmp(s(b)));
                    sorted == *arr(pair)
                }),
            "a push answer carries every key, refusals as { hash, code, detail }, equivocations as sorted pairs",
        );
        let rebuilt =
            sync::push_answer_of(p, s(&p["node"]), &key(s(&m["node_signer"]), "private_key"))
                .unwrap();
        r.why(
            rebuilt == *p,
            "the push answer rebuilds byte for byte",
            rebuilt.to_string(),
        );
    }
    let mut changed = m["push_answer"]["message"].clone();
    changed["taken"] = json!([]);
    r.ok(
        !sync::answer_signed_by(&changed, &[node_key.clone()]),
        "a changed answer no longer verifies",
    );
    r.ok(
        sync::well_known_errors(&m["discovery"]).is_empty()
            && deep_eq(&m["announcement"], &sync::announcement(&m["discovery"])),
        "discovery and its local announcement",
    );
    r.done();
}
#[cfg(not(feature = "sync"))]
#[test]
fn messages() {
    println!("messages (pull, push, discovery): excluded by this build's profile (edge: --features sync)");
}

/// The compact form: block <-> CBOR bytes in both key forms, the loose encodings a reader accepts, and what it refuses.
#[test]
fn cbor_compact_form() {
    use foodblock::cbor;
    let mut r = Report::new("cbor");
    let c = &v()["cbor"];
    let hex = |b: &[u8]| foodblock::block::hex(b);
    let bytes = |t: &Value| foodblock::block::unhex(s(t)).unwrap();
    let signed = |case: &Value| {
        let mut b = case["block"].clone();
        b["hash"] = case["hash"].clone();
        b["signature"] = case["signature"].clone();
        b
    };
    for case in arr(&c["cases"]) {
        let b = signed(case);
        let text = cbor::encode_message(&b, false).unwrap();
        let short = cbor::encode_message(&b, true).unwrap();
        r.why(
            hex(&text) == s(&case["cbor"]) && hex(&short) == s(&case["cbor_short"]),
            format!("writes deterministic bytes: {}", s(&case["name"])),
            hex(&short),
        );
        let back_text = cbor::decode_message(&bytes(&case["cbor"])).unwrap();
        let back_short = cbor::decode_message(&bytes(&case["cbor_short"])).unwrap();
        r.ok(
            back_text == b && back_short == b && back_text["hash"] == case["hash"],
            format!("reads back to the block, id the hash of its canonical JSON: {}", s(&case["name"])),
        );
    }
    let loose = cbor::decode_message(&bytes(&c["loose"]["cbor"])).unwrap();
    r.ok(loose["hash"] == c["loose"]["hash"], "any well-formed encoding of the same content is accepted");
    let pushed: Vec<Value> = arr(&c["push"]["hashes"])
        .iter()
        .map(|h| signed(arr(&c["cases"]).iter().find(|x| x["hash"] == *h).unwrap()))
        .collect();
    r.ok(
        hex(&cbor::encode_push_with(foodblock::spec(), &pushed, false).unwrap()) == s(&c["push"]["cbor"])
            && cbor::decode_push_with(foodblock::spec(), &bytes(&c["push"]["cbor_short"])).unwrap() == pushed,
        "a push of several blocks is an array of messages",
    );
    for h in arr(&c["headers"]) {
        r.ok(
            hex(&cbor::encode_header_with(foodblock::spec(), &h["header"], false).unwrap()) == s(&h["cbor"])
                && cbor::decode_header_with(foodblock::spec(), &bytes(&h["cbor_short"])).unwrap() == h["header"],
            format!("a chain header: {}", s(&h["name"])),
        );
    }
    for x in arr(&c["refused"]) {
        r.ok(cbor::decode_message(&bytes(&x["cbor"])).is_err(), format!("refused: {}", s(&x["name"])));
    }
    r.done();
}

/// A signed pull's `asker` and a signed push's `pusher` read as `signer` (aliases.json `messages`).
#[cfg(feature = "sync")]
#[test]
fn older_message_words() {
    use foodblock::sync;
    let mut r = Report::new("older messages");
    let m = &v()["messages"];
    for (kind, check) in [("signed_pull", true), ("signed_push", false)] {
        let o = &m["older"][kind];
        let keys = vec![public(s(&o["signer"]))];
        let never = |_: &str| false;
        let f = sync::Freshness { node: s(&m["node"]), now: s(&o["now"]), keys: &keys, seen: &never, window_ms: sync::signed_window_ms() };
        let found = if check { sync::pull_refusals(&o["message"], &f) } else { sync::push_refusals(&o["message"], &f) };
        r.ok(found.is_empty(), format!("an older {kind} reads as signer"));
    }
    r.done();
}
