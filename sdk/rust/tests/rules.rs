//! Rules: keeping apart, rule sets by hash, discovery, an old reader, the machine lock, the mount, and the rows' reading of a sale. Each story is a fixed world, asked through the door, with the text's answer.
//! Where the world needs bytes the story does not spell, the test adds them and says so.
// Helpers are shared by copy between the story test files; each file keeps the ones it may use.
use foodblock::door::answer;
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{keypair_from_seed, write, ComposeOptions, Keypair, Readers, WriteOptions};
use serde_json::{json, Value};

/// A deal's terms in the one form: the price and quantity named here move into one line (with the thing, when there is one).
fn deal_terms(mut t: Value, what: Option<impl AsRef<str>>) -> Value {
    let mut line = json!({ "id": "item" });
    for k in ["quantity", "price"] {
        if let Some(v) = t.as_object_mut().unwrap().remove(k) {
            line[k] = v;
        }
    }
    if let Some(w) = what {
        line["what"] = json!(w.as_ref());
    }
    if line.as_object().unwrap().len() > 1 {
        t["lines"] = json!([line]);
    }
    t
}

fn call(op: &str, args: Value) -> Value {
    let out = answer(op.as_bytes(), args.to_string().as_bytes());
    record(std::thread::current().name().unwrap_or("main"), op, &args, &out);
    out.get("ok").cloned().unwrap_or_else(|| panic!("{op}: {out}"))
}
/// With `FB_RECORD` set to a directory, every door question a story asks is written there (one file per test), so the oracle can be asked
/// the same questions.
fn record(story: &str, op: &str, args: &Value, out: &Value) {
    let Ok(dir) = std::env::var("FB_RECORD") else { return };
    let name = story.replace("::", "_").replace(' ', "_");
    let line = json!({ "story": name, "op": op, "args": args, "answer": out.get("ok"), "error": out.get("error") }).to_string() + "\n";
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(format!("{dir}/{name}.jsonl")).unwrap();
    f.write_all(line.as_bytes()).unwrap();
}
fn h(b: &Value) -> String {
    b["hash"].as_str().unwrap().to_string()
}
fn kind(word: &str) -> String {
    format!("{:0>64}", word.bytes().map(|b| format!("{b:02x}")).collect::<String>())[..64].to_string()
}
fn amt(v: &str, unit: &str) -> Value {
    json!({ "value": v, "unit": unit })
}
fn gbp(v: &str) -> Value {
    amt(v, "GBP")
}
fn part(v: &str) -> Value {
    amt(v, "part")
}
#[derive(Clone)]
struct Person {
    id: String,
    keys: Keypair,
}
struct World {
    blocks: Vec<Value>,
    minute: u32,
}
impl World {
    fn new() -> World {
        World { blocks: vec![], minute: 0 }
    }
    fn at(&mut self) -> String {
        self.minute += 1;
        let (d, m) = (self.minute / 1440, self.minute % 1440);
        format!("2026-{:02}-{:02}T{:02}:{:02}:00.000Z", 1 + d / 28, 1 + d % 28, m / 60, m % 60)
    }
    fn person(&mut self, seed: u8) -> Person {
        let keys = keypair_from_seed(&format!("{seed:02x}").repeat(32)).unwrap();
        let at = self.at();
        let g = genesis(&keys, &GenesisOptions { kind: "person", at, audience: Some(Readers::Public), ..Default::default() }).unwrap();
        self.blocks.push(g.clone());
        Person { id: h(&g), keys }
    }
    fn try_sign(&mut self, p: &Person, t: &str, state: Value, refs: Value) -> Result<Value, String> {
        let at = Some(self.at());
        let blocks = self.blocks.clone();
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at, clockless: false, audience: Some(Readers::Public), ..Default::default() },
            key: Some(&p.keys),
            blocks: &blocks,
            schemas: None,
        };
        match write(t, &state, &refs, &o) {
            Ok(b) => {
                self.blocks.push(b.clone());
                Ok(b)
            }
            Err(e) => Err(format!("{e:?}")),
        }
    }
    fn sign(&mut self, p: &Person, t: &str, state: Value, refs: Value) -> Value {
        let (s, r) = (state.clone(), refs.clone());
        self.try_sign(p, t, state, refs).unwrap_or_else(|e| panic!("{t} {s} {r}: {e}"))
    }
    fn yes(&mut self, p: &Person, t: &Value) -> Value {
        self.sign(p, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(t) }))
    }
    /// A circle's founding block, signed by its founder.
    fn circle(&mut self, founder: &Person, state: Value, refs: Value) -> Value {
        let mut s = json!({ "kind": "circle" });
        if let (Value::Object(m), Value::Object(more)) = (&mut s, state) {
            m.extend(more);
        }
        self.sign(founder, "actor", s, refs)
    }
    /// A transfer of parts of a circle, signed in her own name (or `as` a circle).
    fn parts_to(&mut self, p: &Person, circle: &Value, n: &str, to: &str, as_circle: Option<&Value>) -> Value {
        let mut refs = json!({ "what": h(circle), "to_owner": to });
        if let Some(c) = as_circle {
            refs["as"] = json!(h(c));
        }
        self.sign(p, "transfer", json!({ "amount": part(n) }), refs)
    }
    fn rows(&self, b: &Value) -> Value {
        call("row_holds", json!([b, self.blocks]))
    }
}
impl World {
    /// A block sealed to `to` (its audience the commitments to those ids), signed by `key` (her own, or a key under her list).
    fn sign_to(&mut self, p: &Person, key: &Keypair, t: &str, state: Value, refs: Value, to: &[&str]) -> Value {
        let at = Some(self.at());
        let blocks = self.blocks.clone();
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at, audience: Some(Readers::To(to.iter().map(|x| x.to_string()).collect())), ..Default::default() },
            key: Some(key),
            blocks: &blocks,
            schemas: None,
        };
        let b = write(t, &state, &refs, &o).unwrap_or_else(|e| panic!("{t} {state}: {e:?}"));
        self.blocks.push(b.clone());
        b
    }
    fn thing(&mut self, p: &Person, word: &str, n: &str) -> Value {
        self.sign(p, "thing", json!({ "kind": word, "pack": amt(n, word) }), json!({ "of": kind(word) }))
    }
    /// A sale of a whole instance: her transfer of `what` to `to`.
    fn give(&mut self, p: &Person, what: &Value, to: &Person) -> Value {
        self.sign(p, "transfer", json!({}), json!({ "what": h(what), "to_owner": to.id }))
    }
}
fn fails(op: &str, args: Value) -> Value {
    let out = answer(op.as_bytes(), args.to_string().as_bytes());
    assert!(out.get("ok").is_none(), "{op} should fail: {out}");
    out
}
fn codes(v: &Value) -> Vec<String> {
    v.as_array().unwrap_or_else(|| panic!("codes: {v}")).iter().map(|r| r["code"].as_str().unwrap().to_string()).collect()
}
fn header_msg(b: &Value) -> Value {
    json!({ "header": call("header", json!([b])), "header_signature": b["signature"] })
}
fn sans(w: &World, gone: &[&Value]) -> Vec<Value> {
    w.blocks.iter().filter(|b| !gone.iter().any(|g| g["hash"] == b["hash"])).cloned().collect()
}

// Keeping apart, a wrapped copy, and the admission rule's two answers. Amara's copy of A2, wrapped to Harry's mailbox key X, pushed
// unsigned: a node whose admission rule names X keeps it, holding only { mailbox, bytes }; Harry opens the wrap, then the copy. A node
// whose rule states only signed pushes keeps it nowhere (`taken: []`).
#[test]
fn a_wrapped_copy() {
    let mut w = World::new();
    let amara = w.person(3);
    let harry = w.person(1);
    let ak = amara.keys.clone();
    let a2 = w.sign_to(&amara, &ak, "promise", json!({ "terms": deal_terms(json!({}), Some(&kind("flour"))) }), json!({ "from": harry.id, "to": amara.id }), &[&harry.id, &amara.id]);
    let harry_enc = call("encryption_keypair", json!([]));
    let mailbox = call("encryption_keypair", json!([]));
    let copy = call("seal_copy", json!([a2, [harry_enc["public_key_encrypt"]], null, null, null, true]));
    let wrapped = call("wrap_copy", json!([copy, mailbox["public_key_encrypt"]]));
    let x = mailbox["public_key_encrypt"].as_str().unwrap();
    let blocks: Vec<Value> = w.blocks.iter().filter(|b| b["hash"] != a2["hash"]).cloned().collect();
    let got = call("accept", json!([[wrapped], blocks, { "takes_pairs": false, "copies": { "mailboxes": [x] } }, null, {}]));
    assert_eq!(got["taken"], json!([]), "{got}");
    assert_eq!(got["wrapped"][0]["mailbox"], json!(x), "{got}");
    assert!(got["wrapped"][0]["bytes"].as_u64().unwrap() > 1024, "{got}");
    let got = call("accept", json!([[wrapped], blocks, { "takes_pairs": false, "copies": { "signed": true } }, null, {}]));
    assert_eq!(got["taken"], json!([]));
    assert_eq!(got["wrapped"], json!([]), "kept nowhere: {got}");
    // Harry opens the wrap with his mailbox key, then the copy with his own
    let inner = call("open", json!([wrapped["envelope"], mailbox["x25519_private"]]));
    assert_eq!(call("open_copy", json!([inner["copy"], harry_enc["x25519_private"]]))["hash"], a2["hash"]);
}

// Which pushes a node keeps a sealed copy from is its admission rule. A signed push by the author keeps the author's copy under
// `signed`; the same copy handed on by Leila is kept only under `handed_on`, and never in the author's place; an unsigned push keeps none.
#[test]
fn which_copies_a_node_keeps() {
    let mut w = World::new();
    let amara = w.person(3);
    let harry = w.person(1);
    let leila = w.person(5);
    let ak = amara.keys.clone();
    let a1 = w.sign_to(&amara, &ak, "promise", json!({ "terms": deal_terms(json!({}), Some(&kind("flour"))) }), json!({ "from": harry.id, "to": amara.id }), &[&harry.id, &amara.id]);
    let enc = call("encryption_keypair", json!([]));
    let copy = call("seal_copy", json!([a1, [enc["public_key_encrypt"]], null]));
    let blocks: Vec<Value> = w.blocks.iter().filter(|b| b["hash"] != a1["hash"]).cloned().collect();
    let for_ = json!({ (h(&a1)): [harry.id] });
    let rule = json!({ "takes_pairs": false, "copies": { "signed": true } });
    let got = call("accept", json!([[copy], blocks, rule, null, { "signer": amara.id, "for": for_ }]));
    assert_eq!(got["copies"], json!([{ "hash": h(&a1), "for": [harry.id], "from": "author" }]), "{got}");
    let got = call("accept", json!([[copy], blocks, rule, null, { "signer": leila.id, "for": for_ }]));
    assert_eq!(got["copies"], json!([]), "{got}");
    let got = call("accept", json!([[copy], blocks, { "takes_pairs": false, "copies": { "handed_on": true } }, null, { "signer": leila.id, "for": for_ }]));
    assert_eq!(got["copies"], json!([{ "hash": h(&a1), "for": [harry.id], "from": "handed_on" }]), "{got}");
    let got = call("accept", json!([[copy], blocks, rule, null, { "for": for_ }]));
    assert_eq!(got["copies"], json!([]), "an unsigned push under a rule of signed pushes: {got}");
}

// A receipt sealed to a pusher names only what that pusher's push added. Sam and Leila each push one block in one second; the
// answer to Sam whose receipt names Leila's block is refused; one naming Sam's alone is signed.
#[test]
fn a_receipt_names_only_its_push() {
    let mut w = World::new();
    let sam = w.person(5);
    let leila = w.person(6);
    let node = w.person(9);
    let s1 = w.sign(&sam, "observe", json!({ "kind": "note" }), json!({}));
    let l1 = w.sign(&leila, "observe", json!({ "kind": "note" }), json!({}));
    let receipt = |ids: Vec<String>| json!({ "type": "observe", "state": { "kind": "receipt" }, "refs": { "derives_from": ids } });
    let parts = json!({ "taken": [h(&s1)], "unjudged": [], "refused": [], "unread": [], "equivocations": [], "receipt": receipt(vec![h(&s1), h(&l1)]) });
    fails("push_answer", json!([parts, node.id, node.keys.private_key]));
    let parts = json!({ "taken": [h(&s1)], "unjudged": [], "refused": [], "unread": [], "equivocations": [], "receipt": receipt(vec![h(&s1)]) });
    let signed = call("push_answer", json!([parts, node.id, node.keys.private_key]));
    assert_eq!(signed["taken"], json!([h(&s1)]));
}

// The header and every block carry no `withheld`; consent reads `yes` and `stop` only.
#[test]
fn the_header_and_consent_words() {
    let mut w = World::new();
    let amara = w.person(3);
    let b = w.sign(&amara, "observe", json!({ "kind": "note" }), json!({}));
    let hd = call("header", json!([b]));
    let mut keys: Vec<String> = hd.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(keys, ["author", "hash", "prev", "seq"]);
    let refused = foodblock::check::write_refusals("transfer", &json!({ "amount": gbp("1"), "withheld": true, "seq": 2, "at": "2026-11-12T00:00:00.000Z", "audience": "public" }), &json!({ "author": amara.id, "prev": h(&b), "to_owner": amara.id }), Default::default());
    assert!(refused.iter().any(|r| r.code == "undeclared_field"), "{refused:?}");
    let sp = call("spec", json!([]));
    assert_eq!(sp["conventions"]["folds"]["consent"]["word_values"], json!(["yes", "stop"]));
    assert_eq!(sp["protocol"]["header_optional"], json!(["key", "skip"]));
    let harry = w.person(1);
    // consent is a reading (readings/consent.md): KEEP is refused by nothing, and the reading reads no word from it
    let keep = w.sign(&amara, "observe", json!({ "kind": "consent", "word": "keep", "to": harry.id }), json!({}));
    assert_eq!(call("read", json!([keep, w.blocks])), json!([]));
    let c = call("consent", json!([amara.id, harry.id, w.blocks]));
    assert_eq!(c["word"], json!(null), "{c}");
}

// What each one learns: a seller backing his own title. Harry's H2 (sack R to Amara) sealed; his H3 offers Q to Sam with
// `terms.backing` £300. Sam holds H2 only as its header: ownership(Q) not shown, lacking H2; read(H3) reads its backing.
#[test]
fn a_seller_backing_his_title() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let sam = w.person(5);
    let q = w.thing(&harry, "sack", "1");
    let r = w.thing(&harry, "sack", "1");
    let hk = harry.keys.clone();
    let h2 = w.sign_to(&harry, &hk, "transfer", json!({}), json!({ "what": h(&r), "to_owner": amara.id }), &[&amara.id, &harry.id]);
    let h3 = w.sign(&harry, "promise", json!({ "terms": deal_terms(json!({ "price": gbp("200"), "backing": gbp("300") }), Some(&h(&q))) }), json!({ "from": harry.id, "to": sam.id }));
    w.sign(&sam, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&h3), "for": h(&h3) }));
    let mut sams = sans(&w, &[&h2]);
    sams.push(header_msg(&h2));
    let o = call("ownership", json!([q, sams, null]));
    assert_eq!(o["not_shown"], json!(true), "{o}");
    assert_eq!(o["lacks"], json!([h(&h2)]), "{o}");
    assert_eq!(call("read", json!([h3, sams])), json!([]));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Rule sets by hash, read only by the block that names them
// ---------------------------------------------------------------------------------------------------------------------------------------

// core.md, section 11. A rule set is named by the SHA-256 of its manifest's canonical bytes; one byte added to `core.md` gives another id.
#[test]
fn a_rule_set_is_named_by_its_hash() {
    let files = json!({ "core.md": "# FoodBlock\n", "canonical.md": "one byte form\n", "protocol.json": "{}\n" });
    let a = call("rule_set", json!([files]));
    let manifest = &a["manifest"];
    assert_eq!(manifest["files"]["core.md"], json!(call("hash_hex", json!(["# FoodBlock\n"]))));
    let mut keys: Vec<&String> = manifest.as_object().unwrap().keys().collect();
    keys.sort();
    assert_eq!(keys, ["files"], "no continues, no sound: {manifest}");
    assert_eq!(a["id"], json!(call("hash_hex", json!([call("canonical_json", json!([manifest]))]))));
    let mut more = files.clone();
    more["core.md"] = json!("# FoodBlock\n\n");
    assert_ne!(call("rule_set", json!([more]))["id"], a["id"]);
    // no version is read: protocol.json carries none, and `spec` names the build's rule set (none given to this build)
    let sp = call("spec", json!([]));
    assert!(sp["protocol"].get("version").is_none());
    assert_eq!(sp["rule_set"], json!(null));
}

// Sam's till S1 sells crate C1 to Ben with `state.rule_set` a hash this build is not made from: `read` is `unknown_rules` and
// ownership(C1) not shown, lacking S1. A block that names no set is read by H0 (core.md, section 11).
#[test]
fn read_h0() {
    let mut w = World::new();
    let sam = w.person(5);
    let ben = w.person(6);
    let c1 = w.thing(&sam, "crate", "1");
    let x = "ab".repeat(32);
    let s1 = w.by_hand(&sam, "transfer", json!({ "rule_set": x }), json!({ "what": h(&c1), "to_owner": ben.id }));
    assert_eq!(codes(&call("read", json!([s1, w.blocks]))), ["unknown_rules"]);
    let s0 = w.by_hand(&sam, "observe", json!({ "kind": "note" }), json!({}));
    assert_eq!(call("read", json!([s0, w.blocks])), json!([]));
    let o = call("ownership", json!([c1, w.blocks, null]));
    assert_eq!(o["lacks"], json!([h(&s1)]), "{o}");
}

// Discovery states `reads`, the rule sets the node runs, and no `version`, no `sound`, no `speaks_for`.
#[test]
fn discovery_reads() {
    let node = "cd".repeat(32);
    let set = "ef".repeat(32);
    let doc = call("well_known", json!([node, [set], null, { "pull": "https://n.example/pull", "push": "https://n.example/push", "challenge": "https://n.example/c" }]));
    assert_eq!(doc["reads"], json!([set]));
    for gone in ["version", "sound", "speaks_for"] {
        assert!(doc.get(gone).is_none(), "{gone}: {doc}");
    }
    assert_eq!(call("well_known_errors", json!([doc])), json!([]));
    let mut old = doc.clone();
    old["version"] = json!("1.8");
    assert_ne!(call("well_known_errors", json!([old])), json!([]));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Readings, renderers and the read-back
// ---------------------------------------------------------------------------------------------------------------------------------------

/// The read-back worlds' bytes: Harry H0, H1 lot L7 (10 sacks), H2 his offer of L7 to Amara at £300.
struct Lot {
    w: World,
    amara: Person,
    l7: Value,
    h2: Value,
}
fn lot() -> Lot {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    w.person(9);
    let l7 = w.thing(&harry, "sack", "10");
    let h2 = w.sign(&harry, "promise", json!({ "terms": deal_terms(json!({ "price": gbp("300") }), Some(&h(&l7))) }), json!({ "from": harry.id, "to": amara.id }));
    Lot { w, amara, l7, h2 }
}

// An old reader. This core fixes no depth: on Maria's chain of makes it walks to the end and names the owner (a reader that stops
// would say how far it got, never another owner). The text's 6,000 makes are 300 here, for time.
#[test]
fn an_old_reader_answers_less_never_otherwise() {
    let mut w = World::new();
    let maria = w.person(2);
    let amara = w.person(3);
    let mut last = w.thing(&maria, "starter", "1");
    for _ in 0..300 {
        // the make names its input in `state.inputs` and in `refs.derives_from` (the text's "each from the last"; the oracle reads a make's
        // inputs from refs.derives_from, the core from state.inputs)
        last = w.sign(&maria, "transform", json!({ "inputs": [{ "from": h(&last), "amount": amt("1", "starter") }] }), json!({ "derives_from": [h(&last)] }));
        let made = w.sign(&maria, "thing", json!({ "kind": "starter", "pack": amt("1", "starter") }), json!({ "of": kind("starter"), "derives_from": [h(&last)] }));
        last = made;
    }
    let sale = w.give(&maria, &last, &amara);
    w.yes(&amara, &sale);
    let o = call("ownership", json!([last, w.blocks, null]));
    assert_eq!(o["owner"], json!(amara.id), "{o}");
}

// The text's whole world: 6,000 makes, M1 to M6000, each from the last; Amara buys a jar from M6000; a reader that walks it: Amara.
// Slow, so it runs only with `cargo test --test rules -- --ignored`.
#[test]
#[ignore]
fn the_long_chain_of_6000_makes() {
    let mut w = World::new();
    let maria = w.person(2);
    let amara = w.person(3);
    let mut last = w.thing(&maria, "starter", "1");
    for _ in 0..6000 {
        let make = w.sign(&maria, "transform", json!({ "inputs": [{ "from": h(&last), "amount": amt("1", "starter") }] }), json!({}));
        last = w.sign(&maria, "thing", json!({ "kind": "starter", "pack": amt("1", "starter") }), json!({ "of": kind("starter"), "derives_from": [h(&make)] }));
    }
    let sale = w.give(&maria, &last, &amara);
    w.yes(&amara, &sale);
    let o = call("ownership", json!([last, w.blocks, null]));
    assert_eq!(o["owner"], json!(amara.id), "{o}");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Conformance
// ---------------------------------------------------------------------------------------------------------------------------------------

// The ops sorted: 38 protocol ops, 7 the sound part and 31 word ops, each answered by this door; every other op of the table is a
// reading, library or a node's own business.
#[test]
fn the_ops_sorted() {
    let sp = call("spec", json!([]))["protocol"].clone();
    let sound = sp["door"]["protocol"]["sound"].as_array().unwrap();
    let word = sp["door"]["protocol"]["word"].as_array().unwrap();
    assert_eq!((sound.len(), word.len()), (7, 31));
    assert_eq!(sound.iter().map(|x| x.as_str().unwrap()).collect::<Vec<_>>(), ["hash", "id_of", "header", "strict_text", "verify", "suite_of_key", "valid"]);
    for op in sound.iter().chain(word) {
        let op = op.as_str().unwrap();
        assert!(sp["door"]["ops"].get(op).is_some(), "{op} in the door table");
        let out = answer(op.as_bytes(), b"[]");
        assert_ne!(out.get("error"), Some(&json!("profile")), "{op}: {out}");
    }
    for gone in ["operators_of", "may_act_as", "add_duration"] {
        assert!(!word.iter().any(|x| x == gone), "{gone}");
    }
    // protocol.json's door table holds the protocol ops only; every other op's entry and the classes are conventions.json's
    let conv = call("spec", json!([]))["conventions"].clone();
    for op in sp["door"]["ops"].as_object().unwrap().keys() {
        assert!(sound.iter().chain(word).any(|x| x == op), "{op} in protocol.json is a protocol op");
    }
    let classed: Vec<&Value> = conv["door"]["classes"].as_object().unwrap().values().flat_map(|v| v.as_array().unwrap()).collect();
    for op in conv["door"]["ops"].as_object().unwrap().keys() {
        assert!(!sound.iter().chain(word).any(|x| x == op) && classed.iter().any(|x| *x == op), "{op} is sorted");
    }
    // `lifted`, the lock's fields and `successor`, `close` leave the lists
    assert!(!sp["statuses"].as_array().unwrap().contains(&json!("lifted")));
    assert!(sp.get("machine_lock").is_none() && sp.get("version").is_none());
    assert!(!sp["kinds"]["grant"].as_array().unwrap().contains(&json!("successor")));
    assert_eq!(sp["condition_shapes_class"]["reading"], json!(["paid", "settled"]));
}

// The machine lock, a reading: Kofi's stop of his mill locks it; Sam's stop of it is Sam's reading (`claimed`), locking nothing; Kofi's
// stop of his own lock ends it.
#[test]
fn the_machine_lock_is_a_reading() {
    let mut w = World::new();
    let kofi = w.person(4);
    let sam = w.person(5);
    let mill = w.thing(&kofi, "mill", "1");
    let lock = w.sign(&kofi, "grant", json!({ "kind": "stop" }), json!({ "subject": h(&mill) }));
    let theirs = w.sign(&sam, "grant", json!({ "kind": "stop" }), json!({ "subject": h(&mill) }));
    let m = call("machine_lock", json!([mill, w.blocks]));
    assert_eq!(m, json!({ "locked": true, "locks": [h(&lock)], "claimed": [h(&theirs)] }));
    w.sign(&kofi, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": h(&lock) }));
    let m = call("machine_lock", json!([mill, w.blocks]));
    assert_eq!(m["locked"], json!(false), "{m}");
    // the old lock fields are refused as undeclared
    let old = foodblock::check::write_refusals("grant", &json!({ "kind": "stop", "how": "hand", "seq": 2, "at": "2026-11-12T00:00:00.000Z", "audience": "public" }), &json!({ "author": kofi.id, "prev": h(&mill), "subject": h(&mill) }), Default::default());
    assert!(old.iter().any(|r| r.code == "undeclared_field"), "{old:?}");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The mount
// ---------------------------------------------------------------------------------------------------------------------------------------

// Union, a late piece, forgotten. An op given a mount answers exactly as it does given the same blocks.
#[test]
fn the_mount() {
    let mut l = lot();
    let am = l.amara.clone();
    l.w.sign(&am, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&l.h2), "for": h(&l.h2) }));
    let (a, b) = l.w.blocks.split_at(3);
    let m = call("mount", json!([a]));
    assert_eq!(m.as_str().map(str::len), Some(32), "{m}");
    assert_eq!(call("mount", json!([b, m])), m);
    assert_eq!(call("ownership", json!([l.l7, m, null])), call("ownership", json!([l.l7, l.w.blocks, null])));
    // a late piece: Harry's offer mounted before his genesis is unjudged, then valid once it comes
    let late = call("mount", json!([[l.h2]]));
    assert_eq!(codes(&call("valid", json!([l.h2, late]))), ["unmet"]);
    call("mount", json!([[l.w.blocks[0]], late]));
    assert_eq!(call("valid", json!([l.h2, late])), json!([]));
    // forgotten
    assert_eq!(call("unmount", json!([m])), json!(true));
    let out = fails("ownership", json!([l.l7, m, null]));
    assert!(out["message"].as_str().unwrap().contains("unknown_mount"), "{out}");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Rows and signals
// ---------------------------------------------------------------------------------------------------------------------------------------

/// The café F (pack 100: Amara 50, Leila 50) with one row, "up to £300 a deal", and Ben who orders two loaves at £3.
fn cafe() -> (World, Person, Person, Value) {
    let mut w = World::new();
    let amara = w.person(3);
    let leila = w.person(5);
    let ben = w.person(6);
    let r1 = json!({ "parts": 1, "scope": { "types": ["promise", "transfer", "transform", "observe", "thing", "grant"], "parties": "any", "on": "any", "each": gbp("300") } });
    let f = w.circle(&amara, json!({ "pack": part("100"), "rules": [r1] }), json!({}));
    let p1 = w.parts_to(&amara, &f, "50", &leila.id, None);
    w.yes(&leila, &p1);
    (w, amara, ben, f)
}

// A row's money cap reads a sale's draw as its money total: the till's sale of two loaves `for`
// Ben's order at £3 a loaf is £6, inside "up to £300 a deal"; the same at £200 a loaf is £400, above it.
#[test]
fn a_rows_money_cap_reads_a_sale_as_its_total() {
    for (price, holds_) in [("3", true), ("200", false)] {
        let (mut w, amara, ben, f) = cafe();
        let order = w.sign(&ben, "promise", json!({ "terms": deal_terms(json!({ "price": { "amount": gbp(price), "per": amt("1", "loaf") }, "quantity": amt("2", "loaf") }), Some(&kind("loaf"))) }), json!({ "from": h(&f), "to": ben.id }));
        let sale = w.sign(&amara, "transfer", json!({ "amount": amt("2", "loaf") }), json!({ "as": h(&f), "to_owner": ben.id, "for": h(&order) }));
        let r = w.rows(&sale);
        assert_eq!(holds(&r), holds_, "£{price} a loaf: {r}");
    }
    // a loaf moved for no deal has no money total: an amount of another kind is above the cap
    let (mut w, amara, ben, f) = cafe();
    let gift = w.sign(&amara, "transfer", json!({ "amount": amt("2", "loaf") }), json!({ "as": h(&f), "to_owner": ben.id }));
    assert!(!holds(&w.rows(&gift)));
}

// `binds` on a draft signed `as` a circle answers as if her hand counts: true where her row would hold.
#[test]
fn binds_as_a_circle() {
    let (w, amara, ben, f) = cafe();
    let oven = json!({ "type": "transfer", "state": { "amount": gbp("900") }, "refs": { "author": amara.id, "as": h(&f), "to_owner": ben.id } });
    assert_eq!(call("binds", json!([oven, w.blocks])), json!(false), "no row holds for £900");
    let small = json!({ "type": "transfer", "state": { "amount": gbp("90") }, "refs": { "author": amara.id, "as": h(&f), "to_owner": ben.id } });
    assert_eq!(call("binds", json!([small, w.blocks])), json!(true));
}

// A signal `by` a role names no one, and protocol.json says ids: there is no `circle#role`.
#[test]
fn no_circle_role() {
    let sp = call("spec", json!([]))["protocol"].to_string();
    assert!(!sp.contains("circle#role"));
    let (w, amara, _ben, f) = cafe();
    let c = json!({ "signal": "done", "by": { "names": [format!("{}#staff", h(&f))] } });
    assert_eq!(call("condition_holds", json!([c, w.blocks, null])), json!(false));
    let _ = amara;
}
fn holds(r: &Value) -> bool {
    r["holds"] == json!(true)
}

impl World {
    /// A block signed by hand on her own line (what her writer would refuse: a rule set it does not run), added to the world.
    fn by_hand(&mut self, p: &Person, t: &str, state: Value, refs: Value) -> Value {
        let last = self.blocks.iter().filter(|b| b["refs"]["author"] == json!(p.id) && b["refs"]["key"].is_null()).last().cloned();
        let (prev, seq) = match &last {
            Some(b) => (h(b), b["state"]["seq"].as_i64().unwrap() + 1),
            None => (p.id.clone(), 1),
        };
        let mut s = state;
        s["at"] = json!(self.at());
        s["audience"] = json!("public");
        s["seq"] = json!(seq);
        let mut r = refs;
        r["author"] = json!(p.id);
        r["prev"] = json!(prev);
        let mut b = call("create", json!([t, s, r]));
        let header = call("header", json!([b]));
        b["signature"] = call("sign_message", json!([header, p.keys.private_key]))["signature"].clone();
        self.blocks.push(b.clone());
        b
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The oracle's stories (spec/oracle/stories/rules), asked of the core
// ---------------------------------------------------------------------------------------------------------------------------------------

fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
/// Every door question the oracle's rules stories ask (`node spec/oracle/stories/export.cjs rules`), asked of the core with the oracle's answer.
/// A question whose answer is random (a key pair, an envelope, a wrap) is not compared; a mount is a fresh random id on each side, so the
/// oracle's id is read as the core's own in every later question.
#[test]
fn the_oracle_stories_of_rules() {
    let text = std::fs::read_to_string(std::env::var("FB_FIXTURE").unwrap_or(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/rules.json").into())).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    let mut differ = vec![];
    let qs = all["questions"].as_array().unwrap();
    let skip = std::env::var("FB_SKIP").unwrap_or_default();
    let mut mounts: Vec<(String, String)> = vec![];
    for (i, q) in qs.iter().enumerate() {
        let op = q["op"].as_str().unwrap();
        if matches!(op, "keypair" | "seal" | "encryption_keypair" | "seal_copy" | "wrap_copy") || skip.split(',').any(|s| s == i.to_string()) {
            continue;
        }
        let mut args = q["args"].to_string();
        for (theirs, ours) in &mounts {
            args = args.replace(theirs.as_str(), ours.as_str());
        }
        let out = answer(op.as_bytes(), args.as_bytes());
        record(&format!("oracle {}", q["story"].as_str().unwrap()), op, &serde_json::from_str(&args).unwrap(), &out);
        if op == "mount" {
            if let (Some(theirs), Some(ours)) = (q["answer"].as_str(), out.get("ok").and_then(Value::as_str)) {
                if theirs != ours {
                    mounts.push((theirs.to_string(), ours.to_string()));
                }
                continue;
            }
        }
        let ok = match q.get("error") {
            Some(_) => out.get("ok").is_none(),
            // `open_copy` answers the opened block in each engine's own shape (as records.rs): the same block, by its id
            None if op == "open_copy" => out["ok"]["hash"] == q["answer"]["hash"],
            None => out.get("ok").map(without_detail) == Some(without_detail(&q["answer"])),
        };
        if !ok {
            if let Ok(f) = std::env::var("FB_DIFF") {
                use std::io::Write;
                let mut o = std::fs::OpenOptions::new().create(true).append(true).open(f).unwrap();
                writeln!(o, "{}", json!({ "i": i, "story": q["story"], "op": op, "core": out.get("ok").unwrap_or(&out), "oracle": q.get("answer") })).unwrap();
            }
            differ.push(format!("#{i} {} {op}: core {} | oracle {}", q["story"], out.get("ok").unwrap_or(&out).to_string().chars().take(700).collect::<String>(), q["answer"].to_string().chars().take(700).collect::<String>()));
        }
    }
    assert!(differ.is_empty(), "{} of the stories' {} questions differ:\n{}", differ.len(), qs.len(), differ.join("\n"));
}
