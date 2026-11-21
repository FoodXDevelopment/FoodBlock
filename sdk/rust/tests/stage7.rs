//! FoodBlock 1.9, stage 7: last (changes-1.9/07-last.md). Each rule's story as a fixed world, asked through the door, with the text's
//! answer. Where the world needs bytes the story does not spell (who confirms, a meter's receipt), the test adds them and says so. Where the
//! text was silent and this build chose, the test names the item of `changes-1.9/stage7-rust-silent.md` it pins.
use foodblock::door::answer;
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{keypair_from_seed, write, ComposeOptions, Keypair, Readers, WriteOptions};
use serde_json::{json, Value};

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
fn sorted(mut v: Vec<String>) -> Vec<String> {
    v.sort();
    v
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
        let held = self.blocks.clone();
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at, clockless: false, audience: Some(Readers::Public), ..Default::default() },
            key: Some(&p.keys),
            held: &held,
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
    /// A confirm of a move: her own `observe` naming it in `refs.confirms` (a hand, C15).
    fn confirm(&mut self, p: &Person, b: &Value) -> Value {
        self.sign(p, "observe", json!({ "kind": "confirm" }), json!({ "confirms": [h(b)] }))
    }
    fn receipt(&mut self, clock: &Person, of: &[&Value], state: Value) -> Value {
        let ids = sorted(of.iter().map(|b| h(b)).collect());
        let mut s = json!({ "kind": "receipt" });
        if let (Value::Object(m), Value::Object(more)) = (&mut s, state) {
            m.extend(more);
        }
        self.sign(clock, "observe", s, json!({ "derives_from": ids }))
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
    /// An order `as` a circle: the circle buys `what` from `from` at `price`.
    fn order_as(&mut self, p: &Person, circle: &Value, from: &Person, what: &str, price: &str) -> Value {
        self.sign(p, "promise", json!({ "terms": { "price": gbp(price) } }), json!({ "as": h(circle), "what": kind(what), "from": from.id, "to": h(circle) }))
    }
    /// A transfer of money `as` a circle.
    fn pay_as(&mut self, p: &Person, circle: &Value, to: &str, v: &str) -> Value {
        self.sign(p, "transfer", json!({ "amount": gbp(v) }), json!({ "as": h(circle), "to_owner": to }))
    }
    fn rows(&self, b: &Value) -> Value {
        call("row_holds", json!([b, self.blocks]))
    }
    fn speaks(&self, b: &Value) -> Value {
        call("speaks_for", json!([b, self.blocks]))
    }
    fn state(&self, circle: &Value) -> Value {
        call("circle_state", json!([h(circle), self.blocks, null]))
    }
    fn state_within(&self, circle: &Value, within: &Value) -> Value {
        call("circle_state", json!([h(circle), self.blocks, within]))
    }
    fn stands(&self, b: &Value) -> Value {
        call("stands", json!([b, self.blocks]))
    }
    fn own(&self, thing: &Value) -> Value {
        call("ownership", json!([thing, self.blocks, null]))
    }
    /// Her own close: a key grant of her first voice that leaves no voice, having seen `after`.
    fn close(&mut self, p: &Person, after: &[&Value]) -> Value {
        let mut refs = json!({ "subject": p.id, "updates": p.id });
        if !after.is_empty() {
            refs["after"] = json!(sorted(after.iter().map(|b| h(b)).collect()));
        }
        self.sign(p, "grant", json!({ "kind": "key", "voices": [] }), refs)
    }
}
impl World {
    /// A block sealed to `to` (its audience the commitments to those ids), signed by `key` (her own, or a key under her list).
    fn sign_to(&mut self, p: &Person, key: &Keypair, t: &str, state: Value, refs: Value, to: &[&str]) -> Value {
        let at = Some(self.at());
        let held = self.blocks.clone();
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at, audience: Some(Readers::To(to.iter().map(|x| x.to_string()).collect())), ..Default::default() },
            key: Some(key),
            held: &held,
            schemas: None,
        };
        let b = write(t, &state, &refs, &o).unwrap_or_else(|e| panic!("{t} {state}: {e:?}"));
        self.blocks.push(b.clone());
        b
    }
    fn sign_key(&mut self, p: &Person, key: &Keypair, t: &str, state: Value, refs: Value) -> Value {
        let at = Some(self.at());
        let held = self.blocks.clone();
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at, audience: Some(Readers::Public), ..Default::default() },
            key: Some(key),
            held: &held,
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

// ---------------------------------------------------------------------------------------------------------------------------------------
// Job A. Who learns what
// ---------------------------------------------------------------------------------------------------------------------------------------

// A1, What stays public. Harry's public H0, Amara's public order A1, Harry's sealed H2 (sack Q to Amara `for` A1, sealed to Amara), Harry's
// public H3 (sack R to Sam). A stranger's unsigned pull gets the public blocks, never H2's header. Sam holding H2 only as its header:
// ownership(Q) not shown, lacking H2; ownership(R) Sam. (The world's sealing key S and its key grant K1 are left out: the node's answer and
// the fold turn on the sealed block alone; stage7-rust-silent.md 1.)
#[test]
fn a1_what_stays_public() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let sam = w.person(5);
    // Harry's sealing key S: a second voice of his list, which signs his sealed words (here, also the thing it sells: Q is on S's line)
    let sk = keypair_from_seed(&"5b".repeat(32)).unwrap();
    let k1 = w.sign(&harry, "grant", json!({ "kind": "key", "voices": [{ "key": harry.keys.public_key_sign }, { "key": sk.public_key_sign }] }), json!({ "subject": harry.id, "updates": harry.id }));
    let q = w.sign_key(&harry, &sk, "thing", json!({ "kind": "sack", "pack": amt("1", "sack") }), json!({ "of": kind("sack"), "after": [h(&k1)] }));
    let r = w.thing(&harry, "sack", "1");
    let a1 = w.sign(&amara, "promise", json!({}), json!({ "what": h(&q), "to": amara.id, "from": harry.id }));
    let hk = sk.clone();
    let h2 = w.sign_to(&harry, &hk, "transfer", json!({ "covers": gbp("0") }), json!({ "what": h(&q), "to_owner": amara.id, "for": h(&a1) }), &[&amara.id, &harry.id]);
    let h3 = w.give(&harry, &r, &sam);
    w.yes(&sam, &h3);
    // the node's log: every block, H2 with a copy for Amara
    let log: Vec<Value> = w
        .blocks
        .iter()
        .enumerate()
        .map(|(i, b)| {
            let mut e = json!({ "n": i + 1, "block": b });
            if b["hash"] == h2["hash"] {
                e["copies"] = json!({ (amara.id.clone()): header_msg(b) });
            }
            e
        })
        .collect();
    let got = call("answer_pull", json!([log, { "since": 0 }, harry.id, null, { "cap": 100, "serves_pairs": false }, null, null]));
    let sent: Vec<String> = got["blocks"].as_array().unwrap().iter().map(|e| e["message"]["block"]["hash"].as_str().map(String::from).unwrap_or_else(|| e["message"]["header"]["hash"].as_str().unwrap_or("").to_string())).collect();
    assert!(!sent.contains(&h(&h2)), "never H2's header: {got}");
    assert_eq!(sent.len(), w.blocks.len() - 1);
    // a stranger who is Sam, signed: the same (he holds no copy)
    let got = call("answer_pull", json!([log, { "since": 0 }, harry.id, null, { "cap": 100, "serves_pairs": false }, sam.id, null]));
    assert_eq!(got["blocks"].as_array().unwrap().len(), w.blocks.len() - 1);
    // Amara, for whom the copy was pushed, gets it
    let got = call("answer_pull", json!([log, { "since": 0 }, harry.id, null, { "cap": 100, "serves_pairs": false }, amara.id, null]));
    assert_eq!(got["blocks"].as_array().unwrap().len(), w.blocks.len());
    // Sam holds H2 only as its header
    let mut sams = sans(&w, &[&h2]);
    sams.push(header_msg(&h2));
    let o = call("ownership", json!([q, sams, null]));
    assert_eq!(o["not_shown"], json!(true), "{o}");
    assert_eq!(o["lacks"], json!([h(&h2)]), "{o}");
    let o = call("ownership", json!([r, sams, null]));
    assert_eq!(o["owner"], json!(sam.id), "{o}");
}

// A1, Not given (deniability). Amara's list [card, phone P]; P signs A1, accepting Harry's offer H1, sealed to Harry; her card's key grant K2
// ends P, counted_to A1; Harry hands A1 to Gita. At Gita: valid(A1) names no fault and stands(A1) is true: wiping a key ends what it can sign
// next, never what it signed.
#[test]
fn a1_not_given_deniability() {
    let mut w = World::new();
    let amara = w.person(3);
    let harry = w.person(1);
    let phone = keypair_from_seed(&"5a".repeat(32)).unwrap();
    let card = amara.keys.public_key_sign.clone();
    let list = w.sign(&amara, "grant", json!({ "kind": "key", "voices": [{ "key": card }, { "key": phone.public_key_sign }] }), json!({ "subject": amara.id, "updates": amara.id }));
    let q = w.thing(&harry, "sack", "1");
    let h1 = w.sign(&harry, "promise", json!({}), json!({ "what": h(&q), "from": harry.id, "to": amara.id }));
    let a1 = w.sign_to(&amara, &phone, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&h1), "for": h(&h1), "after": [h(&list)] }), &[&harry.id, &amara.id]);
    let k2 = w.sign(&amara, "grant", json!({ "kind": "key", "voices": [{ "key": card }], "counted_to": h(&a1) }), json!({ "subject": amara.id, "updates": h(&list) }));
    let _ = k2;
    // Gita, handed A1 and its pieces
    assert_eq!(call("valid", json!([a1, w.blocks])), json!([]));
    let s = call("stands", json!([a1, w.blocks]));
    assert_eq!(s["stands"], json!(true), "{s}");
}

// A1, Showing a deal. Amara shows Harry's accept H2 to Leila: valid(H2) names no fault, with or without a refrain of Amara's in its past.
#[test]
fn a1_showing_a_deal() {
    let mut w = World::new();
    let amara = w.person(3);
    let harry = w.person(1);
    let a1 = w.sign(&amara, "promise", json!({ "terms": { "price": gbp("300") } }), json!({ "what": kind("flour"), "from": harry.id, "to": amara.id }));
    let h2 = w.sign(&harry, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&a1), "for": h(&a1) }));
    assert_eq!(call("valid", json!([h2, w.blocks])), json!([]));
    assert_eq!(call("read", json!([h2, w.blocks])), json!([]));
    // `terms.show` is gone: a deal that names it carries a field no reader reads
    let shown = w.sign(&amara, "promise", json!({ "terms": { "price": gbp("300") } }), json!({ "what": kind("flour"), "from": harry.id, "to": amara.id }));
    let refused = foodblock::check::write_refusals("promise", &json!({ "terms": { "price": gbp("300"), "show": ["from"] }, "seq": 1, "at": "2026-11-12T00:00:00.000Z", "audience": "public" }), &shown["refs"], Default::default());
    assert!(!refused.is_empty(), "terms.show is no term: {refused:?}");
    let stage = call("promise_stage", json!([a1, w.blocks]));
    assert!(stage.get("show").is_none(), "{stage}");
}

// A1, Sealed messages: a sealer that pads pads to the next of 512, 1024, 2048, 4096 bytes, then each 4096. Amara's 600-byte order sealed
// with `pad`: its plaintext is 1024 bytes; `open_copy` gives A1, the same id as unpadded. A 5,000-byte plaintext pads to 8192.
#[test]
fn a1_padding_sizes() {
    let mut w = World::new();
    let amara = w.person(3);
    let maria = w.person(2);
    let enc = call("encryption_keypair", json!([]));
    let a1 = w.sign(&amara, "observe", json!({ "kind": "order", "note": "x".repeat(300) }), json!({ "subject": maria.id }));
    let copy = call("seal_copy", json!([a1, [enc["public_key_encrypt"]], null, null, null, true]));
    let plain = call("open", json!([copy["envelope"], enc["x25519_private"]]));
    let bytes = call("canonical_json", json!([plain])).as_str().unwrap().len();
    assert!(bytes == 512 || bytes == 1024, "{bytes}");
    assert_eq!(call("open_copy", json!([copy, enc["x25519_private"]]))["hash"], a1["hash"]);
    for (n, want) in [(600, 1024), (5000, 8192), (512, 512), (4097, 8192), (1, 512)] {
        assert_eq!(call("padded_size", json!([n])), json!(want), "{n}");
    }
}

// A1, Keeping apart, a wrapped copy, and A2, the admission rule's two answers. Amara's copy of A2, wrapped to Harry's mailbox key X, pushed
// unsigned: a node whose admission rule names X keeps it, holding only { mailbox, bytes }; Harry opens the wrap, then the copy: A2. A node
// whose rule states only signed pushes keeps it nowhere (`taken: []`).
#[test]
fn a1_a2_a_wrapped_copy() {
    let mut w = World::new();
    let amara = w.person(3);
    let harry = w.person(1);
    let ak = amara.keys.clone();
    let a2 = w.sign_to(&amara, &ak, "promise", json!({}), json!({ "what": kind("flour"), "from": harry.id, "to": amara.id }), &[&harry.id, &amara.id]);
    let harry_enc = call("encryption_keypair", json!([]));
    let mailbox = call("encryption_keypair", json!([]));
    let copy = call("seal_copy", json!([a2, [harry_enc["public_key_encrypt"]], null, null, null, true]));
    let wrapped = call("wrap_copy", json!([copy, mailbox["public_key_encrypt"]]));
    let x = mailbox["public_key_encrypt"].as_str().unwrap();
    let held: Vec<Value> = w.blocks.iter().filter(|b| b["hash"] != a2["hash"]).cloned().collect();
    let got = call("accept", json!([[wrapped], held, { "takes_pairs": false, "copies": { "mailboxes": [x] } }, null, {}]));
    assert_eq!(got["taken"], json!([]), "{got}");
    assert_eq!(got["wrapped"][0]["mailbox"], json!(x), "{got}");
    assert!(got["wrapped"][0]["bytes"].as_u64().unwrap() > 1024, "{got}");
    let got = call("accept", json!([[wrapped], held, { "takes_pairs": false, "copies": { "signed": true } }, null, {}]));
    assert_eq!(got["taken"], json!([]));
    assert_eq!(got["wrapped"], json!([]), "kept nowhere: {got}");
    // Harry opens the wrap with his mailbox key, then the copy with his own
    let inner = call("open", json!([wrapped["envelope"], mailbox["x25519_private"]]));
    assert_eq!(call("open_copy", json!([inner["copy"], harry_enc["x25519_private"]]))["hash"], a2["hash"]);
}

// A2, line 44: which pushes a node keeps a sealed copy from is its admission rule. A signed push by the author keeps the author's copy under
// `signed`; the same copy handed on by Leila is kept only under `handed_on`, and never in the author's place; an unsigned push keeps none.
#[test]
fn a2_which_copies_a_node_keeps() {
    let mut w = World::new();
    let amara = w.person(3);
    let harry = w.person(1);
    let leila = w.person(5);
    let ak = amara.keys.clone();
    let a1 = w.sign_to(&amara, &ak, "promise", json!({}), json!({ "what": kind("flour"), "from": harry.id, "to": amara.id }), &[&harry.id, &amara.id]);
    let enc = call("encryption_keypair", json!([]));
    let copy = call("seal_copy", json!([a1, [enc["public_key_encrypt"]], null]));
    let held: Vec<Value> = w.blocks.iter().filter(|b| b["hash"] != a1["hash"]).cloned().collect();
    let for_ = json!({ (h(&a1)): [harry.id] });
    let rule = json!({ "takes_pairs": false, "copies": { "signed": true } });
    let got = call("accept", json!([[copy], held, rule, null, { "signer": amara.id, "for": for_ }]));
    assert_eq!(got["copies"], json!([{ "hash": h(&a1), "for": [harry.id], "from": "author" }]), "{got}");
    let got = call("accept", json!([[copy], held, rule, null, { "signer": leila.id, "for": for_ }]));
    assert_eq!(got["copies"], json!([]), "{got}");
    let got = call("accept", json!([[copy], held, { "takes_pairs": false, "copies": { "handed_on": true } }, null, { "signer": leila.id, "for": for_ }]));
    assert_eq!(got["copies"], json!([{ "hash": h(&a1), "for": [harry.id], "from": "handed_on" }]), "{got}");
    let got = call("accept", json!([[copy], held, rule, null, { "for": for_ }]));
    assert_eq!(got["copies"], json!([]), "an unsigned push under a rule of signed pushes: {got}");
}

// A2, line 15: a receipt sealed to a pusher names only what that pusher's push added. Sam and Leila each push one block in one second; the
// answer to Sam whose receipt names Leila's block is refused; one naming Sam's alone is signed.
#[test]
fn a2_a_receipt_names_only_its_push() {
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

// A5. `withheld` leaves the header and every block; consent reads `yes` and `stop` only.
#[test]
fn a5_the_header_and_consent_words() {
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
    assert_eq!(sp["protocol"]["folds"]["consent"]["word_values"], json!(["yes", "stop"]));
    assert_eq!(sp["protocol"]["header_optional"], json!(["key", "skip"]));
    let harry = w.person(1);
    // KEEP is no word: a writer refuses it, or a reader does not read it
    match w.try_sign(&amara, "observe", json!({ "kind": "consent", "word": "keep", "to": harry.id }), json!({})) {
        Err(_) => {}
        Ok(keep) => assert_ne!(call("read", json!([keep, w.blocks])), json!([]), "KEEP is no word"),
    }
    let c = call("consent", json!([amara.id, harry.id, w.blocks]));
    assert_eq!(c["word"], json!(null), "{c}");
}

// A1, What each one learns: a seller backing his own title. Harry's H2 (sack R to Amara) sealed; his H3 offers Q to Sam with
// `terms.backing` £300. Sam holds H2 only as its header: ownership(Q) not shown, lacking H2; read(H3) reads its backing.
#[test]
fn a1_a_seller_backing_his_title() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let sam = w.person(5);
    let q = w.thing(&harry, "sack", "1");
    let r = w.thing(&harry, "sack", "1");
    let hk = harry.keys.clone();
    let h2 = w.sign_to(&harry, &hk, "transfer", json!({}), json!({ "what": h(&r), "to_owner": amara.id }), &[&amara.id, &harry.id]);
    let h3 = w.sign(&harry, "promise", json!({ "terms": { "price": gbp("200"), "backing": gbp("300") } }), json!({ "what": h(&q), "from": harry.id, "to": sam.id }));
    w.sign(&sam, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&h3), "for": h(&h3) }));
    let mut sams = sans(&w, &[&h2]);
    sams.push(header_msg(&h2));
    let o = call("ownership", json!([q, sams, null]));
    assert_eq!(o["not_shown"], json!(true), "{o}");
    assert_eq!(o["lacks"], json!([h(&h2)]), "{o}");
    assert_eq!(call("read", json!([h3, sams])), json!([]));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Job B. Rule sets by hash, read only by the block that names them
// ---------------------------------------------------------------------------------------------------------------------------------------

// B1, section 11. A rule set is named by the SHA-256 of its manifest's canonical bytes; one byte added to `core.md` gives another id.
#[test]
fn b1_a_rule_set_is_named_by_its_hash() {
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

// B5 and 3a-13. Sam's till S1 sells crate C1 to Ben with `state.rule_set` a hash this reader does not run: `read` is `unknown_rules` and
// ownership(C1) not shown, lacking S1. A reader that runs that set (`runs`) reads it.
#[test]
fn b5_read_runs() {
    let mut w = World::new();
    let sam = w.person(5);
    let ben = w.person(6);
    let c1 = w.thing(&sam, "crate", "1");
    let x = "ab".repeat(32);
    let s1 = w.by_hand(&sam, "transfer", json!({ "rule_set": x }), json!({ "what": h(&c1), "to_owner": ben.id }));
    assert_eq!(codes(&call("read", json!([s1, w.blocks]))), ["unknown_rules"]);
    assert_eq!(call("read", json!([s1, w.blocks, null, [x]])), json!([]));
    let o = call("ownership", json!([c1, w.blocks, null]));
    assert_eq!(o["lacks"], json!([h(&s1)]), "{o}");
}

// B2. Discovery states `reads`, the rule sets the node runs, and no `version`, no `sound`, no `speaks_for`.
#[test]
fn b2_discovery_reads() {
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
// Job C. Readings, renderers and the read-back
// ---------------------------------------------------------------------------------------------------------------------------------------

/// The read-back worlds' bytes: Harry H0, H1 lot L7 (10 sacks), H2 his offer of L7 to Amara at £300.
struct Lot {
    w: World,
    harry: Person,
    amara: Person,
    foodx: Person,
    l7: Value,
    h2: Value,
}
fn lot() -> Lot {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let foodx = w.person(9);
    let l7 = w.thing(&harry, "sack", "10");
    let h2 = w.sign(&harry, "promise", json!({ "terms": { "price": gbp("300") } }), json!({ "what": h(&l7), "from": harry.id, "to": amara.id }));
    Lot { w, harry, amara, foodx, l7, h2 }
}
/// FoodX's read-back RB for a block, as its own `observe`: the state `readback` gives (reading, renderer, read, digits, the digest),
/// with the digest given (an honest host's, or a lie), `refs.for` the block and `refs.to` the person it is read back to.
fn sign_readback(w: &mut World, foodx: &Person, rb: &Value, digest: &str, to: &str) -> Value {
    let mut state = rb["state"].clone();
    state["readback"] = json!(digest);
    w.sign(foodx, "observe", state, json!({ "for": rb["answer"]["for"]["id"], "to": to }))
}

// C3, worlds A to C, and the door op `readback` (settled 2026-11-19: three ops of class `reading`). A: FoodX's read-back for H2, read to
// Amara, is redone by Wanjiru's kiosk, which holds the blocks it read: the same digest. B: FoodX's text says "no price": the kiosk's digest
// differs. C: the kiosk lacks H1: it names H1 and makes no digest. A reading or renderer this build does not run is `not_run`.
#[test]
fn c3_the_read_back_redone() {
    let mut l = lot();
    let rb = call("readback", json!([l.h2, l.w.blocks, l.amara.id, "en", "47"]));
    let st = &rb["state"];
    let read: Vec<String> = st["read"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect();
    assert_eq!(read, sorted(vec![l.harry.id.clone(), h(&l.l7), h(&l.h2)]), "read is the sorted ids the reading read: {rb}");
    assert_eq!(st["read"], rb["answer"]["read"]);
    let names = st.as_object().unwrap().keys().cloned().collect::<Vec<_>>();
    assert_eq!(sorted(names), sorted(["kind", "readback", "reading", "renderer", "read", "digits"].map(String::from).to_vec()));
    assert_eq!((st["kind"].clone(), st["digits"].clone()), (json!("readback"), json!("47")));
    assert!(rb["text"].as_str().unwrap().ends_with("in all. 47"), "the renderer's words, one space, the digits: {rb}");
    assert_eq!(st["readback"], call("hash_hex", json!([rb["text"]])));
    let fx = l.foodx.clone();
    let to = l.amara.id.clone();
    let good = sign_readback(&mut l.w, &fx, &rb, st["readback"].as_str().unwrap(), &to);
    assert!(call("valid", json!([good, l.w.blocks])).as_array().unwrap().is_empty() && call("read", json!([good, l.w.blocks])).as_array().unwrap().is_empty(), "{good}");
    let kiosk: Vec<Value> = l.w.blocks.iter().filter(|b| read.contains(&h(b))).cloned().collect();
    assert_eq!(call("readback_redo", json!([good, kiosk])), json!({ "same": true, "readback": st["readback"], "lacks": [], "not_run": [] }));
    assert_eq!(call("readback_redo", json!([good, l.w.blocks]))["same"], json!(true), "what else she holds changes nothing");
    // B: a lying host
    let lie = call("hash_hex", json!(["From Harry. L7, 10 sacks, no price. 47"]));
    let bad = sign_readback(&mut l.w, &fx, &rb, lie.as_str().unwrap(), &to);
    let r = call("readback_redo", json!([bad, kiosk]));
    assert_eq!((r["same"].clone(), r["readback"].clone()), (json!(false), st["readback"].clone()), "{r}");
    // C: a lacking reader
    let less: Vec<Value> = kiosk.iter().filter(|b| b["hash"] != l.l7["hash"]).cloned().collect();
    let r = call("readback_redo", json!([good, less]));
    assert_eq!(r, json!({ "same": null, "readback": null, "lacks": [h(&l.l7)], "not_run": [] }));
    // a reading this reader does not run
    let mut other = good.clone();
    other["state"]["reading"] = json!("12".repeat(32));
    assert_eq!(call("readback_redo", json!([other, kiosk])), json!({ "same": null, "readback": null, "lacks": [], "not_run": ["12".repeat(32)] }));
    // the names are those of the published files (the hash of each one's manifest over its text and cases), the same as `rule_set` gives
    let files = |a: &str, b: &str| {
        let root = concat!(env!("CARGO_MANIFEST_DIR"), "/spec/");
        json!({ a: std::fs::read_to_string(format!("{root}{a}")).unwrap(), b: std::fs::read_to_string(format!("{root}{b}")).unwrap() })
    };
    assert_eq!(st["reading"], call("rule_set", json!([files("readings/readback.md", "readings/readback.cases.json")]))["id"]);
    assert_eq!(st["renderer"], call("rule_set", json!([files("renderers/en.md", "renderers/en.cases.json")]))["id"]);
}

// C3, the reading's answer (the oracle's design, settled 2026-11-19): read to Amara (`to`, the readback's `refs.to`), she is the viewer and
// her own name is never read; Harry is named by his code (he signed no name); the line naming L7 gives the draw the ownership fold gives H2
// (`held`) and whose word frees it (hers); amounts per side, both ends, units as signed. C4: the renderers copy each answer field.
#[test]
fn c3_c4_the_reading_and_its_renderers() {
    let l = lot();
    let rb = call("readback", json!([l.h2, l.w.blocks, l.amara.id]));
    let a = &rb["answer"];
    assert_eq!(a["viewer"], json!({ "id": l.amara.id, "code": call("short_code", json!([l.amara.id])), "name": null }));
    assert_eq!(a["for"]["signer"]["code"], call("short_code", json!([l.harry.id])));
    let line = &a["things"][0];
    assert_eq!(line["what"]["id"], json!(h(&l.l7)), "{a}");
    assert_eq!(line["to"]["id"], json!(l.amara.id));
    assert_eq!(line["draw"], json!({ "state": "held" }), "{a}");
    assert_eq!(line["freer"]["id"], json!(l.amara.id), "{a}");
    let mine = a["amounts"].as_array().unwrap().iter().find(|x| x["side"]["id"] == json!(l.amara.id)).unwrap();
    assert_eq!(mine["out"], json!([gbp("300")]), "{a}");
    let en = call("render", json!([a, "en"]));
    let en = en.as_str().unwrap();
    assert_eq!(rb["text"], json!(en), "no digits: the text is the renderer's words alone");
    assert!(en.contains("kept for you") && en.contains("You pay at most 300 GBP in all.") && !en.contains('£'), "{en}");
    assert!(!en.contains("n/d") && !en.contains("needed"), "{en}");
    let sms = call("render", json!([a, "en-sms"]));
    assert!(sms.as_str().unwrap().ends_with("You pay max 300 GBP."), "{sms}");
    // (Harry signed no name and L7 none: "Unnamed id CODE" now, but the decision text with its digits is still 170 characters, past 07
    // section 4's 160: the lot's code is said twice and the pack, held and price lines are each needed; see the report)
    assert!(sms.as_str().unwrap().starts_with("Unnamed id "), "{sms}");
    // Amara's yes: the line copies the fold's draw
    let mut w = l.w;
    w.sign(&l.amara, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&l.h2), "for": h(&l.h2) }));
    let a = call("readback", json!([l.h2, w.blocks, l.amara.id]))["answer"].clone();
    let o = call("ownership", json!([l.l7, w.blocks, null]));
    let d = o["draws"].as_array().unwrap().iter().find(|d| d["block"] == l.h2["hash"]).unwrap().clone();
    assert_eq!(a["things"][0]["draw"], json!({ "state": d["state"] }), "the fold's draw, copied: {a} {o}");
    // a block this reader does not read is `not_read`, and nothing else is said of it
    let x = "ab".repeat(32);
    let odd = w.by_hand(&l.harry, "promise", json!({ "terms": { "price": gbp("300") }, "rule_set": x }), json!({ "what": h(&l.l7), "from": l.harry.id, "to": l.amara.id }));
    let a = call("readback", json!([odd, w.blocks, l.amara.id]))["answer"].clone();
    assert_eq!(a["not_read"], json!({ "fields": 0, "rule_set": true, "codes": ["unknown_rules"] }), "{a}");
    assert!(a.get("things").is_none());
    assert!(call("render", json!([a, "en"])).as_str().unwrap().ends_with("Nothing was guessed."));
}

// C3, world D. Harry's H2 and H2', a pair, L7 to Amara and to Leila; Amara accepted: the answer gives both draws `{ draw, to, yes }`, and
// the line says Harry signed it twice, whatever the fold reads Amara's draw as.
#[test]
fn c3_a_pair() {
    let mut l = lot();
    let leila = l.w.person(5);
    // H2' at H2's place, signed by hand (what a writer would refuse)
    let mut s = l.h2["state"].clone();
    s["at"] = json!(l.w.at());
    let mut r = l.h2["refs"].clone();
    r["to"] = json!(leila.id);
    let mut b = call("create", json!(["promise", s, r]));
    let header = call("header", json!([b]));
    b["signature"] = call("sign_message", json!([header, l.harry.keys.private_key]))["signature"].clone();
    l.w.blocks.push(b.clone());
    let am = l.amara.clone();
    let y = l.w.sign(&am, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&l.h2), "for": h(&l.h2) }));
    let a = call("readback", json!([l.h2, l.w.blocks, l.amara.id]))["answer"].clone();
    let pair = a["things"][0]["pair"].as_array().cloned().unwrap_or_default();
    let mut want = vec![(h(&l.h2), l.amara.id.clone(), true), (h(&b), leila.id.clone(), false)];
    want.sort();
    let got: Vec<(String, String, bool)> = pair.iter().map(|p| (p["draw"].as_str().unwrap().into(), p["to"]["id"].as_str().unwrap().into(), p["yes"].as_bool().unwrap())).collect();
    assert_eq!(got, want, "{a}");
    assert!(a["read"].as_array().unwrap().contains(&y["hash"]), "her yes is read: {a}");
    let en = call("render", json!([a, "en"]));
    assert!(en.as_str().unwrap().contains("signed it twice."), "{en}");
}

// C3's last sentence, a host's convention (no op checks it; settled 2026-11-19): the honest host seals the readback observe to Amara, she
// opens her copy, and redo over it gives `same: true`.
#[test]
fn c3_the_sealed_read_back() {
    let mut l = lot();
    let rb = call("readback", json!([l.h2, l.w.blocks, l.amara.id, "en", "47"]));
    let (fx, key, to) = (l.foodx.clone(), l.foodx.keys.clone(), l.amara.id.clone());
    let sealed = l.w.sign_to(&fx, &key, "observe", rb["state"].clone(), json!({ "for": h(&l.h2), "to": to }), &[&to]);
    assert!(sealed["state"]["audience"].is_array(), "{sealed}");
    let enc = call("encryption_keypair", json!([]));
    let copy = call("seal_copy", json!([sealed, [enc["public_key_encrypt"]], null]));
    let hers = call("open_copy", json!([copy, enc["x25519_private"]]));
    assert_eq!(hers["hash"], sealed["hash"]);
    let kiosk: Vec<Value> = l.w.blocks.iter().filter(|b| rb["state"]["read"].as_array().unwrap().contains(&b["hash"])).cloned().collect();
    assert_eq!(call("readback_redo", json!([hers, kiosk])), json!({ "same": true, "readback": rb["state"]["readback"], "lacks": [], "not_run": [] }));
}

// C2, C3, C4: this core runs the published reading and renderers because it passes their cases (spec/readings/readback.cases.json,
// spec/renderers/en.cases.json, en-sms.cases.json, exported from the oracle's stories), and answers the oracle's door questions of the
// read-back alike (tests/fixtures/stage7-readback.json: node spec/oracle/stage7/export-readback.cjs).
#[test]
fn the_published_cases_of_the_read_back() {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/spec/");
    let load = |p: &str| -> Value { serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap() };
    let mut differ = vec![];
    let cases = load(&format!("{root}readings/readback.cases.json"));
    let blocks = cases["blocks"].as_array().unwrap();
    let at = |i: &Value| blocks[i.as_u64().unwrap() as usize].clone();
    for (i, c) in cases["cases"].as_array().unwrap().iter().enumerate() {
        let held: Vec<Value> = c["held"].as_array().unwrap().iter().map(at).collect();
        let out = call("readback", json!([at(&c["block"]), held, c["to"]]));
        if out["answer"] != c["answer"] {
            differ.push(format!("reading case {i}: core {} | oracle {}", out["answer"], c["answer"]));
        }
    }
    for r in ["en", "en-sms"] {
        for (i, c) in load(&format!("{root}renderers/{r}.cases.json"))["cases"].as_array().unwrap().iter().enumerate() {
            let out = call("render", json!([c["answer"], r]));
            if out != c["text"] {
                differ.push(format!("{r} case {i}: core {out} | oracle {}", c["text"]));
            }
        }
    }
    let fx = load(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/stage7-readback.json"));
    let pool = fx["blocks"].as_array().unwrap();
    let back = |v: &Value| -> Value {
        match v {
            Value::Object(m) if m.len() == 1 && m.contains_key("block") => pool[m["block"].as_u64().unwrap() as usize].clone(),
            Value::Object(m) if m.len() == 1 && m.contains_key("held") => json!(m["held"].as_array().unwrap().iter().map(|i| pool[i.as_u64().unwrap() as usize].clone()).collect::<Vec<_>>()),
            x => x.clone(),
        }
    };
    for (i, q) in fx["questions"].as_array().unwrap().iter().enumerate() {
        let op = q["op"].as_str().unwrap();
        let args: Vec<Value> = q["args"].as_array().unwrap().iter().map(back).collect();
        let out = answer(op.as_bytes(), json!(args).to_string().as_bytes());
        let ok = match q.get("error") {
            Some(_) => out.get("ok").is_none(),
            None => out.get("ok") == Some(&q["answer"]),
        };
        if !ok {
            differ.push(format!("door question {i} {op}: core {} | oracle {}", out.get("ok").unwrap_or(&out), q["answer"]));
        }
    }
    assert!(differ.is_empty(), "{} differ:\n{}", differ.len(), differ.join("\n"));
}

// C5, an old reader. This core fixes no depth: on Maria's chain of makes it walks to the end and names the owner (a reader that stops
// would say how far it got, never another owner). The text's 6,000 makes are 300 here, for time (stage7-rust-silent.md).
#[test]
fn c5_an_old_reader_answers_less_never_otherwise() {
    let mut w = World::new();
    let maria = w.person(2);
    let amara = w.person(3);
    let mut last = w.thing(&maria, "starter", "1");
    for _ in 0..300 {
        // the make names its input in `state.inputs` and in `refs.derives_from` (the text's "each from the last"; the oracle reads a make's
        // inputs from refs.derives_from, the core from state.inputs: a split outside stage 7, left to the coordinator)
        last = w.sign(&maria, "transform", json!({ "inputs": [{ "from": h(&last), "amount": amt("1", "starter") }] }), json!({ "derives_from": [h(&last)] }));
        let made = w.sign(&maria, "thing", json!({ "kind": "starter", "pack": amt("1", "starter") }), json!({ "of": kind("starter"), "derives_from": [h(&last)] }));
        last = made;
    }
    let sale = w.give(&maria, &last, &amara);
    w.yes(&amara, &sale);
    let o = call("ownership", json!([last, w.blocks, null]));
    assert_eq!(o["owner"], json!(amara.id), "{o}");
}

// C5, the text's whole world: 6,000 makes, M1 to M6000, each from the last; Amara buys a jar from M6000; a reader that walks it: Amara.
// Slow, so it runs only with `cargo test --test stage7 -- --ignored`.
#[test]
#[ignore]
fn c5_the_long_chain_of_6000_makes() {
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
// Job D. Conformance
// ---------------------------------------------------------------------------------------------------------------------------------------

// D1, D2. The ops sorted: 37 protocol ops, 7 the sound part and 30 word ops, each answered by this door; every other op of the table is a
// reading, library or a node's own business.
#[test]
fn d2_the_ops_sorted() {
    let sp = call("spec", json!([]))["protocol"].clone();
    let sound = sp["door"]["protocol"]["sound"].as_array().unwrap();
    let word = sp["door"]["protocol"]["word"].as_array().unwrap();
    assert_eq!((sound.len(), word.len()), (7, 30));
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

// D6. The machine lock, a reading: Kofi's stop of his mill locks it; Sam's stop of it is Sam's reading (`claimed`), locking nothing; Kofi's
// stop of his own lock ends it.
#[test]
fn d6_the_machine_lock_is_a_reading() {
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
    // the old lock fields are no fields
    let old = foodblock::check::write_refusals("grant", &json!({ "kind": "stop", "how": "hand", "seq": 2, "at": "2026-11-12T00:00:00.000Z", "audience": "public" }), &json!({ "author": kofi.id, "prev": h(&mill), "subject": h(&mill) }), Default::default());
    assert!(old.iter().any(|r| r.code == "undeclared_field"), "{old:?}");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Job F. The mount
// ---------------------------------------------------------------------------------------------------------------------------------------

// F: union, a late piece, forgotten. An op given a mount answers exactly as it does given the same blocks.
#[test]
fn f_the_mount() {
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
// The owner's decisions of 2026-11-19
// ---------------------------------------------------------------------------------------------------------------------------------------

/// The café F (pack 100: Amara 50, Leila 50) with one row, "up to £300 a deal", and Ben who orders two loaves at £3.
fn cafe() -> (World, Person, Person, Value) {
    let mut w = World::new();
    let amara = w.person(3);
    let leila = w.person(5);
    let ben = w.person(6);
    let r1 = json!({ "parts": 1, "scope": { "types": ["promise", "transfer", "transform", "observe", "thing", "grant"], "each": gbp("300") } });
    let f = w.circle(&amara, json!({ "pack": part("100"), "rules": [r1] }), json!({}));
    let p1 = w.parts_to(&amara, &f, "50", &leila.id, None);
    w.yes(&leila, &p1);
    (w, amara, ben, f)
}

// Decision 1. A row's money cap reads a sale's draw as its money total (stage 4's rule for a grant): the till's sale of two loaves `for`
// Ben's order at £3 a loaf is £6, inside "up to £300 a deal"; the same at £200 a loaf is £400, above it.
#[test]
fn owner_1_a_rows_money_cap_reads_a_sale_as_its_total() {
    for (price, holds_) in [("3", true), ("200", false)] {
        let (mut w, amara, ben, f) = cafe();
        let order = w.sign(&ben, "promise", json!({ "terms": { "price": { "amount": gbp(price), "per": amt("1", "loaf") }, "quantity": amt("2", "loaf") } }), json!({ "what": kind("loaf"), "from": h(&f), "to": ben.id }));
        let sale = w.sign(&amara, "transfer", json!({ "amount": amt("2", "loaf") }), json!({ "as": h(&f), "to_owner": ben.id, "for": h(&order) }));
        let r = w.rows(&sale);
        assert_eq!(holds(&r), holds_, "£{price} a loaf: {r}");
    }
    // a loaf moved for no deal has no money total: an amount of another kind is above the cap
    let (mut w, amara, ben, f) = cafe();
    let gift = w.sign(&amara, "transfer", json!({ "amount": amt("2", "loaf") }), json!({ "as": h(&f), "to_owner": ben.id }));
    assert!(!holds(&w.rows(&gift)));
}

// Decision 2. `binds` on a draft signed `as` a circle answers as if her hand counts: true where her row would hold.
#[test]
fn owner_2_binds_as_a_circle() {
    let (w, amara, ben, f) = cafe();
    let oven = json!({ "type": "transfer", "state": { "amount": gbp("900") }, "refs": { "author": amara.id, "as": h(&f), "to_owner": ben.id } });
    assert_eq!(call("binds", json!([oven, w.blocks])), json!(false), "no row holds for £900");
    let small = json!({ "type": "transfer", "state": { "amount": gbp("90") }, "refs": { "author": amara.id, "as": h(&f), "to_owner": ben.id } });
    assert_eq!(call("binds", json!([small, w.blocks])), json!(true));
}

// Decision 3. `circle#role` is gone: a signal `by` a role names no one, and protocol.json says ids.
#[test]
fn owner_3_no_circle_role() {
    let sp = call("spec", json!([]))["protocol"].to_string();
    assert!(!sp.contains("circle#role"));
    let (w, amara, _ben, f) = cafe();
    let c = json!({ "signal": "done", "by": [format!("{}#staff", h(&f))], "signers": 1 });
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
// The oracle's stories (spec/oracle/stage7, but the read-back), asked of the core
// ---------------------------------------------------------------------------------------------------------------------------------------

fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
/// Every door question the oracle's stage 7 stories ask (`node spec/oracle/stage7/export.cjs`), asked of the core with the oracle's answer.
/// A question whose answer is random (a key pair, an envelope, a wrap) is not compared; a mount is a fresh random id on each side, so the
/// oracle's id is read as the core's own in every later question.
#[test]
fn the_oracle_stories_of_stage_7() {
    let text = std::fs::read_to_string(std::env::var("FB_FIXTURE").unwrap_or(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/stage7.json").into())).unwrap();
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
            // `open_copy` answers the opened block in each engine's own shape (as core_set_a.rs): the same block, by its id
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
