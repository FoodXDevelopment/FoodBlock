//! Key stories: keys, clocks, time, a close and a will: each story is a fixed world, asked through the door, with the answer the text gives. Each world is asked as any SDK asks.
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
    out.get("ok").cloned().unwrap_or_else(|| panic!("{op}: {out}"))
}
fn h(b: &Value) -> String {
    b["hash"].as_str().unwrap().to_string()
}
fn kind(word: &str) -> String {
    format!("{:0>64}", word.bytes().map(|b| format!("{b:02x}")).collect::<String>())[..64].to_string()
}
fn sorted(mut v: Vec<String>) -> Vec<String> {
    v.sort();
    v
}

struct World {
    blocks: Vec<Value>,
    minute: u32,
}
#[derive(Clone)]
struct Person {
    id: String,
    keys: Keypair,
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
    fn sign_at(&mut self, p: &Person, key: &Keypair, t: &str, state: Value, refs: Value, at: Option<String>) -> Value {
        let at = at.unwrap_or_else(|| self.at());
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at: Some(at), audience: Some(Readers::Public), ..Default::default() },
            key: Some(key),
            blocks: &self.blocks,
            schemas: None,
        };
        let b = write(t, &state, &refs, &o).unwrap_or_else(|e| panic!("{t} {state}: {e:?}"));
        self.blocks.push(b.clone());
        b
    }
    fn sign(&mut self, p: &Person, t: &str, state: Value, refs: Value) -> Value {
        let k = p.keys.clone();
        self.sign_at(p, &k, t, state, refs, None)
    }
    fn thing(&mut self, p: &Person, word: &str, pack: Value) -> Value {
        self.sign(p, "thing", json!({ "kind": word, "pack": pack }), json!({ "of": kind(word) }))
    }
    fn yes(&mut self, p: &Person, t: &Value) -> Value {
        self.sign(p, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(t) }))
    }
    fn receipt(&mut self, clock: &Person, of: &[&Value]) -> Value {
        let mut ids: Vec<String> = of.iter().map(|b| h(b)).collect();
        ids.sort();
        self.sign(clock, "observe", json!({ "kind": "receipt" }), json!({ "derives_from": ids }))
    }
    fn cutoff(&mut self, clock: &Person, word: &Value, when: &str, at: Option<&str>) -> Value {
        let k = clock.keys.clone();
        self.sign_at(clock, &k, "observe", json!({ "kind": "cutoff", "when": when }), json!({ "subject": h(word) }), at.map(String::from))
    }
    fn own(&self, thing: &Value) -> Value {
        call("ownership", json!([thing, self.blocks, null]))
    }
}
fn clocks(people: &[&Person], needed: usize) -> Value {
    let names = sorted(people.iter().map(|p| p.id.clone()).collect());
    if names.len() == 1 {
        json!({ "names": names })
    } else {
        json!({ "names": names, "needed": needed })
    }
}
fn draw_of<'a>(o: &'a Value, b: &Value) -> &'a Value {
    o["draws"].as_array().unwrap().iter().find(|d| d["block"] == b["hash"]).unwrap_or_else(|| panic!("no draw {} in {o}", b["hash"]))
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Holds
// ---------------------------------------------------------------------------------------------------------------------------------------

const T: &str = "2026-11-20T07:00:00.000Z";

/// Joe's bond: (1) Joe J0, box X. (2) Joe J1: X to Amara, on the condition that he is late (`without` his arrival by T, clocks Wanjiru and
/// Leila, needed 2). (3) Amara A1 accepts.
fn joes_bond(w: &mut World) -> (Person, Person, Person, Person, Value, Value) {
    let joe = w.person(11);
    let amara = w.person(3);
    let wanjiru = w.person(8);
    let leila = w.person(5);
    let x = w.thing(&joe, "box", json!({ "value": "1", "unit": "box" }));
    let cond = json!({ "without": { "signal": "arrived", "by": { "names": [joe.id] } }, "deadline": T, "clocks": clocks(&[&wanjiru, &leila], 2) });
    let j1 = w.sign(&joe, "transfer", json!({ "condition": cond }), json!({ "what": h(&x), "to_owner": amara.id }));
    w.yes(&amara, &j1);
    (joe, amara, wanjiru, leila, x, j1)
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Keys and time
// ---------------------------------------------------------------------------------------------------------------------------------------

// A cutoff by its place. World A: Wanjiru's cutoff of T is on her line before her receipt of Joe's arrival (dated 06:55): on her
// line Joe is late. With Leila's line also showing late (her cutoff, nothing before it), `needed` 2 lines show late: X lands to Amara.
// World B: a cutoff signed on 1 October for 07:00 20 November closes nothing.
#[test]
fn a_cutoff_by_its_place() {
    let mut w = World::new();
    let (_, amara, wanjiru, leila, x, j1) = joes_bond(&mut w);
    let joe_arrives = {
        let joe = Person { id: w.blocks[0]["hash"].as_str().unwrap().to_string(), keys: keypair_from_seed(&format!("{:02x}", 11).repeat(32)).unwrap() };
        w.sign(&joe, "observe", json!({ "kind": "arrived" }), json!({}))
    };
    w.cutoff(&wanjiru, &j1, T, Some("2026-11-20T07:00:00.000Z"));
    let k = wanjiru.keys.clone();
    w.sign_at(&wanjiru, &k, "observe", json!({ "kind": "receipt" }), json!({ "derives_from": [h(&joe_arrives)] }), Some("2026-11-20T06:55:00.000Z".into()));
    // one line of two shows late: not yet
    assert_eq!(draw_of(&w.own(&x), &j1)["state"], json!("held"));
    // World B on Leila's line: a cutoff dated before its own time closes nothing
    w.cutoff(&leila, &j1, T, Some("2026-10-01T00:00:00.000Z"));
    assert_eq!(draw_of(&w.own(&x), &j1)["state"], json!("held"), "an early cutoff closes nothing");
    // Leila's cutoff in time, nothing received before it: two lines show late, X goes to Amara
    w.cutoff(&leila, &j1, T, Some("2026-11-20T07:01:00.000Z"));
    let o = w.own(&x);
    assert_eq!(draw_of(&o, &j1)["state"], json!("landed"), "{o}");
    assert_eq!(o["owner"], json!(amara.id), "{o}");
}

// Which reading needs `needed`. World A: the move is "late", needed 2: Wanjiru cuts off late, Leila receipts Joe on time: one line
// showing on time is `names` less `needed`, plus one: X Joe's.
#[test]
fn which_reading_needs_needed() {
    let mut w = World::new();
    let (joe, _, wanjiru, leila, x, j1) = joes_bond(&mut w);
    w.cutoff(&wanjiru, &j1, T, None);
    let arrived = w.sign(&joe, "observe", json!({ "kind": "arrived" }), json!({}));
    w.receipt(&leila, &[&arrived]);
    let o = w.own(&x);
    assert_eq!(draw_of(&o, &j1)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(joe.id), "{o}");
}

impl World {
    fn stands(&self, b: &Value) -> Value {
        call("stands", json!([b, self.blocks]))
    }
}

// Her own word stands alone: Mama's `received` stands when signed; a thief's stop signed with her SIM after the point her card's key
// grant names in `counted_to` is off her line, so her grant to Soko stands.
#[test]
fn her_own_word_stands_alone() {
    let mut w = World::new();
    let mama = w.person(4);
    let leila = w.person(5);
    let soko = w.person(13);
    let sim = keypair_from_seed(&"5d".repeat(32)).unwrap();
    // her list: card A first, the SIM key second; no clock, reach PT0S
    let k1 = w.sign(&mama, "grant", json!({ "kind": "key", "voices": [{ "key": mama.keys.public_key_sign }, { "key": sim.public_key_sign }] }), json!({ "subject": mama.id, "updates": mama.id }));
    let again = w.sign(&mama, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)] }));
    let order = w.sign(&leila, "promise", json!({ "kind": "order", "terms": deal_terms(json!({ "price": { "value": "100", "unit": "KES" }, "quantity": { "value": "2", "unit": "kg" } }), None::<&str>) }), json!({ "from": mama.id, "to": leila.id }));
    let m1 = w.sign_at(&mama, &sim, "observe", json!({ "kind": "received", "amount": { "value": "100", "unit": "KES" } }), json!({ "for": h(&order), "after": [h(&again)] }), None);
    assert_eq!(w.stands(&m1)["stands"], json!(true), "stands when signed: {}", w.stands(&m1));
    // her grant to Soko, by her card
    let g = w.sign(&mama, "grant", json!({ "kind": "shop", "scope": { "types": ["observe.note"] } }), json!({ "to": soko.id }));
    // a thief with her SIM stops it
    let m2 = w.sign_at(&mama, &sim, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": h(&g) }), None);
    // card A ends the SIM key, counted_to M1
    w.sign(&mama, "grant", json!({ "kind": "key", "voices": [{ "key": mama.keys.public_key_sign }], "counted_to": h(&m1) }), json!({ "subject": mama.id, "updates": h(&k1) }));
    assert_eq!(w.stands(&m2)["stands"], json!(false), "M2 is off her line: {}", w.stands(&m2));
    assert_eq!(w.stands(&m1)["stands"], json!(true));
}

// The join: a cash sale is done at the seller's block.
#[test]
fn the_join() {
    let mut w = World::new();
    let mama = w.person(4);
    let leila = w.person(5);
    let t = w.thing(&mama, "tomatoes", json!({ "value": "10", "unit": "kg" }));
    let e1 = w.sign(&leila, "promise", json!({ "kind": "order", "terms": deal_terms(json!({}), Some(&h(&t))) }), json!({}));
    let m2 = w.sign(&mama, "transfer", json!({ "amount": { "value": "2", "unit": "kg" } }), json!({ "what": h(&t), "to_owner": leila.id, "for": h(&e1) }));
    assert_eq!(w.stands(&m2), json!({ "stands": true, "waiting": [] }));
}

// A passkey signature counts only when the user was verified: flags 0x01 is bad_signature, 0x05 valid.
#[test]
fn a_passkey_needs_the_user_verified() {
    use p256::ecdsa::signature::Signer as _;
    use sha2::Digest;
    let k = call("keypair", json!(["a7".repeat(32), "p256"]));
    let device = p256::ecdsa::SigningKey::from_slice(&foodblock::block::unhex(k["private_key"].as_str().unwrap()).unwrap()).unwrap();
    let state = json!({ "kind": "person", "at": "2026-11-12T10:00:00.000Z", "audience": "public", "public_key_sign": k["public_key_sign"], "suite": "p256" });
    let mut m0 = call("create", json!(["actor", state, {}, "p256"]));
    m0["signature"] = call("sign_message", json!([{ "type": m0["type"], "state": m0["state"], "refs": m0["refs"] }, k["private_key"], "p256"]))["signature"].clone();
    let m1 = call("create", json!(["observe", { "kind": "note", "at": "2026-11-12T10:01:00.000Z", "audience": "public", "seq": 1 }, { "author": h(&m0), "prev": h(&m0) }]));
    let header = call("header", json!([m1]));
    let bytes = call("canonical_json", json!([header])).as_str().unwrap().to_string();
    let challenge = foodblock::sign::passkey_challenge_of(bytes.as_bytes());
    let signed = |flags: u8| {
        let mut auth = sha2::Sha256::digest(b"foodx.network").to_vec();
        auth.extend_from_slice(&[flags, 0, 0, 0, 9]);
        let cdj = format!(r#"{{"type":"webauthn.get","challenge":"{challenge}","origin":"https://foodx.network"}}"#);
        let mut msg = auth.clone();
        msg.extend_from_slice(&sha2::Sha256::digest(cdj.as_bytes()));
        let sig: p256::ecdsa::Signature = device.sign(&msg);
        let mut b = m1.clone();
        b["signature"] = json!(foodblock::sign::passkey_signature(&foodblock::block::hex(&auth), &foodblock::block::hex(cdj.as_bytes()), &foodblock::block::hex(sig.to_der().as_bytes())).unwrap());
        b
    };
    let codes = |v: Value| v.as_array().unwrap().iter().map(|r| r["code"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    assert_eq!(codes(call("valid", json!([signed(0x01), [m0]]))), ["bad_signature"], "a touch alone signs nothing");
    assert!(codes(call("valid", json!([signed(0x05), [m0]]))).is_empty());
}

impl World {
    /// A block signed by hand at a place the caller names (a writer would refuse a pair): its body as given, signed over its header.
    fn by_hand(&mut self, p: &Person, t: &str, state: Value, refs: Value, prev: &str, seq: i64) -> Value {
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

// A transform's inputs are draws in the pair test: a make of all F and a give of F to Leila at one place: neither takes.
#[test]
fn a_make_in_a_pair() {
    let mut w = World::new();
    let maria = w.person(2);
    let leila = w.person(5);
    let f = w.thing(&maria, "flour", json!({ "value": "10", "unit": "kg" }));
    let m2 = w.by_hand(&maria, "transform", json!({ "inputs": [{ "from": h(&f), "amount": { "value": "10", "unit": "kg" } }] }), json!({ "derives_from": [h(&f)] }), &h(&f), 2);
    let m2b = w.by_hand(&maria, "transfer", json!({}), json!({ "what": h(&f), "to_owner": leila.id }), &h(&f), 2);
    w.yes(&leila, &m2b);
    let o = w.own(&f);
    assert_eq!(o["owners"], json!([]), "F held on a pair: {o}");
    assert_eq!(draw_of(&o, &m2)["takes"], json!(false), "{o}");
    assert_eq!(draw_of(&o, &m2b)["takes"], json!(false), "{o}");
}

impl World {
    fn offer(&mut self, from: &Person, what: &Value, to: &Person, terms: Value) -> Value {
        self.sign(from, "promise", json!({ "terms": deal_terms(terms, Some(&h(what))) }), json!({ "from": from.id, "to": to.id }))
    }
}

// Time: a block's `at` is its signer's word; a line is read by `prev`. T10, dated before T9, is after it by `prev`.
#[test]
fn time_is_what_is_in_the_past() {
    let mut w = World::new();
    let leila = w.person(5);
    let k = leila.keys.clone();
    let t9 = w.sign_at(&leila, &k, "observe", json!({ "kind": "note" }), json!({}), Some("2026-11-18T10:00:00.000Z".into()));
    let t10 = w.sign_at(&leila, &k, "observe", json!({ "kind": "note" }), json!({}), Some("2026-11-17T10:00:00.000Z".into()));
    assert_eq!(t10["refs"]["prev"], t9["hash"]);
    let line: Vec<&Value> = w.blocks.iter().filter(|b| b["refs"]["author"] == json!(leila.id)).collect();
    let chain = call("check_chain", json!([line, leila.id]));
    assert_eq!(chain["broken"], json!([]), "{chain}");
    assert_eq!(w.stands(&t10)["stands"], json!(true));
}

// A stated end, and a missing `at`: Harry's undated accept of Maria's offer after its `expires` is not in time: F is held until
// Maria's next word; her end frees it.
#[test]
fn a_stated_end_and_a_missing_at() {
    let mut w = World::new();
    let maria = w.person(2);
    let harry = w.person(1);
    let f = w.thing(&maria, "flour", json!({ "value": "10", "unit": "kg" }));
    let m1 = w.offer(&maria, &f, &harry, json!({ "price": { "value": "20", "unit": "GBP" }, "quantity": { "value": "10", "unit": "kg" }, "expires": "2026-01-12T00:00:00.000Z" }));
    // Harry's accept states no `at`
    let a = call("create", json!(["promise", { "status": "accepted", "audience": "public", "seq": 1 }, { "author": harry.id, "prev": harry.id, "answers": h(&m1), "for": h(&m1) }]));
    let mut a = a;
    a["signature"] = call("sign", json!([a, harry.keys.private_key]));
    w.blocks.push(a.clone());
    let o = w.own(&f);
    assert_eq!(draw_of(&o, &m1)["state"], json!("held"), "not in time: held until her next word: {o}");
    assert_eq!(call("promise_stage", json!([m1, w.blocks, {}]))["stage"], json!("offered"));
    let stop = w.sign(&maria, "promise", json!({ "status": "stopped", "stop": "before" }), json!({ "updates": h(&m1) }));
    // her end frees it where Harry has seen it (folds.md, Freed)
    assert_eq!(draw_of(&w.own(&f), &m1)["state"], json!("held"));
    w.sign(&harry, "observe", json!({ "kind": "note", "text": "seen" }), json!({ "subject": h(&m1), "after": [h(&stop)] }));
    let o = w.own(&f);
    assert_eq!(draw_of(&o, &m1)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(maria.id), "{o}");
}

/// Maria with a phone P (reach P1D) under her card, and three clocks, `needed` 2; a thief with P sells her oven to Sam `for` Sam's order (a
/// join); her card ends P. Returns (maria, clocks, sale S, end K2).
fn maria_three_clocks(w: &mut World) -> (Person, Vec<Person>, Value, Value) {
    let maria = w.person(2);
    let clocks_: Vec<Person> = vec![w.person(21), w.person(22), w.person(23)];
    let sam = w.person(30);
    let phone = keypair_from_seed(&"5e".repeat(32)).unwrap();
    let refs: Vec<&Person> = clocks_.iter().collect();
    let k1 = w.sign(&maria, "grant", json!({ "kind": "key", "voices": [{ "key": maria.keys.public_key_sign }, { "key": phone.public_key_sign, "reach": "P1D", "wait": "PT0S" }], "clocks": clocks(&refs, 2) }), json!({ "subject": maria.id, "updates": maria.id }));
    let again = w.sign(&maria, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)] }));
    let oven = w.sign(&maria, "thing", json!({ "kind": "oven" }), json!({ "of": kind("oven") }));
    let order = w.sign(&sam, "promise", json!({ "kind": "order", "terms": deal_terms(json!({}), Some(&h(&oven))) }), json!({}));
    let s = w.sign_at(&maria, &phone, "transfer", json!({}), json!({ "what": h(&oven), "to_owner": sam.id, "for": h(&order), "after": [h(&again)] }), None);
    let k2 = w.sign(&maria, "grant", json!({ "kind": "key", "voices": [{ "key": maria.keys.public_key_sign }], "clocks": clocks(&refs, 2) }), json!({ "subject": maria.id, "updates": h(&k1) }));
    (maria, clocks_, s, k2)
}
fn counts(w: &World, who: &Person, b: &Value) -> bool {
    call("identity_state", json!([who.id, w.blocks]))["signed_by_author"][h(b)] == json!(true)
}

// World B: her stop reaches one clock first; the thief's sale holds two receipts with no end before them: S counts. With her stop
// first on two lines: S counts for nothing.
#[test]
fn a_stop_on_one_clock_of_three() {
    let mut w = World::new();
    let (maria, c, s, k2) = maria_three_clocks(&mut w);
    w.receipt(&c[0], &[&k2]);
    w.receipt(&c[0], &[&s]);
    w.receipt(&c[1], &[&s]);
    w.receipt(&c[2], &[&s]);
    assert!(counts(&w, &maria, &s), "S counts");
    let mut w = World::new();
    let (maria, c, s, k2) = maria_three_clocks(&mut w);
    for i in 0..2 {
        w.receipt(&c[i], &[&k2]);
        w.receipt(&c[i], &[&s]);
    }
    w.receipt(&c[2], &[&s]);
    assert!(!counts(&w, &maria, &s), "her stop first on two lines: S counts for nothing");
}

// One receipt that names an end and a block: neither came first: S waits on the end; a later receipt of S on those lines is after
// the end: S counts for nothing.
#[test]
fn one_receipt_names_an_end_and_a_block() {
    let mut w = World::new();
    let (maria, c, s, k2) = maria_three_clocks(&mut w);
    for x in &c {
        w.receipt(x, &[&k2, &s]);
    }
    assert!(counts(&w, &maria, &s), "not seen: neither came first");
    assert!(w.stands(&s)["waiting"].as_array().unwrap().iter().any(|x| x["on"] == json!("end")), "{}", w.stands(&s));
    for x in &c[..2] {
        w.receipt(x, &[&s]);
    }
    assert!(!counts(&w, &maria, &s), "a later receipt of S is after the end");
}

// A clock is a line, read as it goes on: Wanjiru replaces her phone key; her new key's receipt and span cutoff close Maria's reach.
#[test]
fn a_clock_that_changed_keys() {
    let mut w = World::new();
    let wanjiru = w.person(8);
    let maria = w.person(2);
    let sam = w.person(30);
    let card = keypair_from_seed(&"6b".repeat(32)).unwrap();
    let card_hash = call("key_hash", json!([card.public_key_sign]));
    let k1 = w.sign(&maria, "grant", json!({ "kind": "key", "voices": [{ "key_hash": card_hash }, { "key": maria.keys.public_key_sign, "reach": "P1D", "wait": "PT0S" }], "clocks": clocks(&[&wanjiru], 1) }), json!({ "subject": maria.id, "updates": maria.id }));
    let again = w.sign(&maria, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)] }));
    let f = w.sign(&maria, "thing", json!({ "kind": "flour", "pack": { "value": "1", "unit": "kg" } }), json!({ "of": kind("flour"), "after": [h(&again)] }));
    let s9 = w.sign(&maria, "transfer", json!({}), json!({ "what": h(&f), "to_owner": sam.id }));
    assert!(w.stands(&s9)["waiting"].as_array().unwrap().iter().any(|x| x["on"] == json!("reach")), "{}", w.stands(&s9));
    // Wanjiru replaces her key (her first voice puts a new key in its place)
    let newkey = keypair_from_seed(&"6a".repeat(32)).unwrap();
    let w5 = w.sign(&wanjiru, "grant", json!({ "kind": "key", "voices": [{ "key": newkey.public_key_sign }] }), json!({ "subject": wanjiru.id, "updates": wanjiru.id }));
    let w6 = w.sign(&wanjiru, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&w5)] }));
    let r = w.sign_at(&wanjiru, &newkey, "observe", json!({ "kind": "receipt" }), json!({ "derives_from": [h(&s9)], "after": [h(&w6)] }), None);
    assert!(call("identity_state", json!([wanjiru.id, w.blocks]))["signed_by_author"][h(&r)] == json!(true), "her new key speaks for her");
    w.sign_at(&wanjiru, &newkey, "observe", json!({ "kind": "cutoff", "when": "P1D" }), json!({ "subject": h(&s9), "derives_from": [h(&r)] }), None);
    assert_eq!(w.stands(&s9)["stands"], json!(true), "{}", w.stands(&s9));
}
impl World {
}

// A key grant is a key grant; the mail key: a thief's mail key from an ended phone does not stand; a new phone's mail key waits on
// its reach (one day on her clock), then stands.
#[test]
fn the_mail_key() {
    let mut w = World::new();
    let leila = w.person(5);
    let wanjiru = w.person(8);
    let phone = keypair_from_seed(&"7a".repeat(32)).unwrap();
    let q = keypair_from_seed(&"7b".repeat(32)).unwrap();
    let card = leila.keys.public_key_sign.clone();
    let k1 = w.sign(&leila, "grant", json!({ "kind": "key", "voices": [{ "key": card }, { "key": phone.public_key_sign, "reach": "P1D", "wait": "PT0S" }], "clocks": clocks(&[&wanjiru], 1) }), json!({ "subject": leila.id, "updates": leila.id }));
    let again = w.sign(&leila, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)] }));
    // the card ends P
    let k2 = w.sign(&leila, "grant", json!({ "kind": "key", "voices": [{ "key": card }], "clocks": clocks(&[&wanjiru], 1) }), json!({ "subject": leila.id, "updates": h(&k1), "after": [h(&again)] }));
    // a thief with P signs a mail key grant, after the end
    let e1 = w.sign_at(&leila, &phone, "grant", json!({ "kind": "key", "public_key_encrypt": "ab".repeat(32) }), json!({ "subject": leila.id, "after": [h(&k2)] }), None);
    assert_eq!(w.stands(&e1)["stands"], json!(false), "{}", w.stands(&e1));
    // the card adds a new phone Q; Q signs a mail key grant: it waits on its reach
    let k3 = w.sign(&leila, "grant", json!({ "kind": "key", "voices": [{ "key": card }, { "key": q.public_key_sign, "reach": "P1D", "wait": "PT0S" }], "clocks": clocks(&[&wanjiru], 1) }), json!({ "subject": leila.id, "updates": h(&k2) }));
    let again3 = w.sign(&leila, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k3)] }));
    let e2 = w.sign_at(&leila, &q, "grant", json!({ "kind": "key", "public_key_encrypt": "cd".repeat(32) }), json!({ "subject": leila.id, "after": [h(&again3)] }), None);
    assert!(w.stands(&e2)["waiting"].as_array().unwrap().iter().any(|x| x["on"] == json!("reach")), "{}", w.stands(&e2));
    let r = w.receipt(&wanjiru, &[&e2]);
    let k = wanjiru.keys.clone();
    w.sign_at(&wanjiru, &k, "observe", json!({ "kind": "cutoff", "when": "P1D" }), json!({ "subject": h(&e2), "derives_from": [h(&r)] }), None);
    assert_eq!(w.stands(&e2)["stands"], json!(true), "{}", w.stands(&e2));
}

/// Maria's list: card C (her first key), phone P, and Mum and Brother (needed 2, wait P30D, `above: true`), clocks Wanjiru. Returns
/// (maria, phone, mum, brother, wanjiru, list).
fn maria_and_kin(w: &mut World) -> (Person, Keypair, Person, Person, Person, Value) {
    let maria = w.person(2);
    let mum = w.person(31);
    let brother = w.person(32);
    let wanjiru = w.person(8);
    let phone = keypair_from_seed(&"7c".repeat(32)).unwrap();
    let kin = sorted(vec![mum.id.clone(), brother.id.clone()]);
    let list = w.sign(&maria, "grant", json!({ "kind": "key", "voices": [{ "key": maria.keys.public_key_sign }, { "key": phone.public_key_sign }, { "names": kin, "needed": 2, "wait": "P30D", "above": true }], "clocks": clocks(&[&wanjiru], 1) }), json!({ "subject": maria.id, "updates": maria.id }));
    let again = w.sign(&maria, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&list)] }));
    // the list as it stands: the blocks of her kin and her clock name its second signing
    let mut list = list;
    list["_again"] = json!(h(&again));
    (maria, phone, mum, brother, wanjiru, list)
}

// The people of a voice may reach above it: Mum and Brother put a new card in the burnt card's place; after thirty days on
// Wanjiru's clock they confirm again: it stands. World B: the phone, a voice above them, says no inside the thirty days: it never stands.
#[test]
fn kin_reach_above() {
    for no in [false, true] {
        let mut w = World::new();
        let (maria, phone, mum, brother, wanjiru, list) = maria_and_kin(&mut w);
        let c2 = keypair_from_seed(&"7d".repeat(32)).unwrap();
        let mut voices = list["state"]["voices"].clone();
        voices[0] = json!({ "key": c2.public_key_sign });
        let k1 = w.sign(&mum, "grant", json!({ "kind": "key", "voices": voices, "clocks": list["state"]["clocks"] }), json!({ "subject": maria.id, "updates": h(&list), "after": [list["_again"]] }));
        let b1 = w.sign(&brother, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)] }));
        let r = w.receipt(&wanjiru, &[&k1]);
        if no {
            // the phone restates the list unchanged: a no from a voice above, received before the wait closes
            let n = w.sign_at(&maria, &phone, "grant", json!({ "kind": "key", "voices": list["state"]["voices"], "clocks": list["state"]["clocks"] }), json!({ "subject": maria.id, "updates": h(&list), "after": [list["_again"]] }), None);
            w.receipt(&wanjiru, &[&n]);
        }
        let k = wanjiru.keys.clone();
        let c = w.sign_at(&wanjiru, &k, "observe", json!({ "kind": "cutoff", "when": "P30D" }), json!({ "subject": h(&k1), "derives_from": [h(&r)] }), None);
        w.sign(&mum, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)], "after": [h(&c)] }));
        w.sign(&brother, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)], "after": sorted(vec![h(&c), h(&b1)]) }));
        let s = w.stands(&k1);
        if no {
            assert_eq!(s["stands"], json!(false), "a voice above said no: {s}");
        } else {
            assert_eq!(s["stands"], json!(true), "{s}");
        }
    }
}

// A close: Mum and Brother close her list (by the path above); a block of her card signed after it counts for nothing.
#[test]
fn a_close() {
    let mut w = World::new();
    let (maria, _, mum, brother, wanjiru, list) = maria_and_kin(&mut w);
    let mill = w.thing(&maria, "mill", json!({ "value": "1", "unit": "mill" }));
    let k1 = w.sign(&mum, "grant", json!({ "kind": "key", "voices": [], "clocks": list["state"]["clocks"] }), json!({ "subject": maria.id, "updates": h(&list), "after": [list["_again"]] }));
    let b1 = w.sign(&brother, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)] }));
    let r = w.receipt(&wanjiru, &[&k1]);
    let k = wanjiru.keys.clone();
    let c = w.sign_at(&wanjiru, &k, "observe", json!({ "kind": "cutoff", "when": "P30D" }), json!({ "subject": h(&k1), "derives_from": [h(&r)] }), None);
    w.sign(&mum, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)], "after": [h(&c)] }));
    let b2 = w.sign(&brother, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&k1)], "after": sorted(vec![h(&c), h(&b1)]) }));
    assert_eq!(w.stands(&k1)["stands"], json!(true), "{}", w.stands(&k1));
    // the nephew with the card signs H9: the mill to Ben, after the close
    let ben = w.person(6);
    let h9 = w.sign(&maria, "transfer", json!({}), json!({ "what": h(&mill), "to_owner": ben.id, "after": [h(&b2)] }));
    assert!(!counts(&w, &maria, &h9), "after the close no key of hers speaks");
}

// A clock is read in the past of the block that relies on it: for Mill Lane's block M, which names K for its meaning and holds no
// cutoff, K is still waiting (M waits on the block it names); M2, made after the cutoff, stands. `stands` of the relying block reads the key
// grant it names within its own causal past, so no new door op is needed.
#[test]
fn a_clock_read_in_the_relying_blocks_past() {
    let mut w = World::new();
    let leila = w.person(5);
    let wanjiru = w.person(8);
    let mill = w.person(14);
    let phone = keypair_from_seed(&"7d".repeat(32)).unwrap();
    let tablet = keypair_from_seed(&"7e".repeat(32)).unwrap();
    let card = leila.keys.public_key_sign.clone();
    let k1 = w.sign(&leila, "grant", json!({ "kind": "key", "voices": [{ "key": card }, { "key": phone.public_key_sign, "reach": "P30D", "wait": "PT0S" }], "clocks": clocks(&[&wanjiru], 1) }), json!({ "subject": leila.id, "updates": leila.id }));
    // K: the phone adds a tablet below it: a key grant of her own list by a voice with a reach, so it waits on that reach
    let k = w.sign_at(&leila, &phone, "grant", json!({ "kind": "key", "voices": [{ "key": card }, { "key": phone.public_key_sign, "reach": "P30D", "wait": "PT0S" }, { "key": tablet.public_key_sign, "wait": "PT0S" }], "clocks": clocks(&[&wanjiru], 1) }), json!({ "subject": leila.id, "updates": h(&k1) }), None);
    let m = w.sign(&mill, "observe", json!({ "kind": "note" }), json!({ "for": h(&k) }));
    let r = w.receipt(&wanjiru, &[&k]);
    let wk = wanjiru.keys.clone();
    let cut = w.sign_at(&wanjiru, &wk, "observe", json!({ "kind": "cutoff", "when": "P30D" }), json!({ "subject": h(&k), "derives_from": [h(&r)] }), None);
    let m2 = w.sign(&mill, "observe", json!({ "kind": "note" }), json!({ "for": h(&k), "after": [h(&cut)] }));
    assert_eq!(w.stands(&k)["stands"], json!(true));
    let s = w.stands(&m);
    assert!(s["waiting"].as_array().unwrap().iter().any(|x| x["on"] == json!("named")), "{s}");
    assert_eq!(w.stands(&m2)["stands"], json!(true));
}

// A suite move only by a voice above: a forger with the phone's key putting a new-suite key in the phone's place is no suite move;
// the card's same move is.
#[test]
fn a_suite_move_only_by_a_voice_above() {
    let mut w = World::new();
    let harry = w.person(1);
    let card = keypair_from_seed(&"7e".repeat(32)).unwrap();
    let card_hash = call("key_hash", json!([card.public_key_sign]));
    let list = w.sign(&harry, "grant", json!({ "kind": "key", "voices": [{ "key_hash": card_hash }, { "key": harry.keys.public_key_sign }] }), json!({ "subject": harry.id, "updates": harry.id }));
    let k = call("keypair", json!(["7f".repeat(32), "p256"]));
    let f1 = w.sign(&harry, "grant", json!({ "kind": "key", "voices": [{ "key_hash": card_hash }, { "key": k["public_key_sign"], "suite": "p256" }] }), json!({ "subject": harry.id, "updates": h(&list) }));
    assert_eq!(w.stands(&f1)["stands"], json!(false));
    let s = call("identity_state", json!([harry.id, w.blocks]));
    assert_eq!(s["voices"][1]["key"], json!(harry.keys.public_key_sign), "{s}");
}

// A will holds nothing in life: Harry's mill willed to Leila on `{ closed: Harry }` is Harry's; a later sale to Sam goes through;
// at the close the will takes nothing.
#[test]
fn a_will_holds_nothing_in_life() {
    let mut w = World::new();
    let harry = w.person(1);
    let leila = w.person(5);
    let sam = w.person(30);
    let x = w.thing(&harry, "mill", json!({ "value": "1", "unit": "mill" }));
    let h1 = w.sign(&harry, "transfer", json!({ "condition": { "closed": harry.id } }), json!({ "what": h(&x), "to_owner": leila.id }));
    w.yes(&leila, &h1);
    assert_eq!(w.own(&x)["owner"], json!(harry.id));
    let h2 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&x), "to_owner": sam.id }));
    w.yes(&sam, &h2);
    assert_eq!(w.own(&x)["owner"], json!(sam.id));
}

// A genesis may state her list: Harry's genesis states `[card (key_hash), phone]`, signed by the phone; a forger's own-key move of
// the phone's place to a p256 key is no suite move, and Harry's card stays first.
#[test]
fn a_genesis_may_state_her_list() {
    let phone = keypair_from_seed(&"80".repeat(32)).unwrap();
    let card = keypair_from_seed(&"81".repeat(32)).unwrap();
    let card_hash = call("key_hash", json!([card.public_key_sign]));
    let state = json!({ "kind": "person", "at": "2026-11-12T10:00:00.000Z", "audience": "public", "public_key_sign": phone.public_key_sign, "voices": [{ "key_hash": card_hash }, { "key": phone.public_key_sign }] });
    let mut g = call("create", json!(["actor", state, {}]));
    g["signature"] = call("sign_message", json!([{ "type": g["type"], "state": g["state"], "refs": g["refs"] }, phone.private_key]))["signature"].clone();
    assert!(call("valid", json!([g, []])).as_array().unwrap().is_empty());
    let s = call("identity_state", json!([g["hash"], [g]]));
    assert_eq!(s["voices"][0]["key_hash"], card_hash, "{s}");
}

// Every door question the oracle's stories of keys ask (spec/oracle/stories/keys, each checked there against the text's answer), asked
// of the core: the same answer, a refusal's `detail` aside. Regenerate: node spec/oracle/stories/export.cjs keys.
fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
#[test]
fn the_oracle_stories_of_keys() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/keys.json")).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    let mut differ = vec![];
    for q in all["questions"].as_array().unwrap() {
        let op = q["op"].as_str().unwrap();
        if matches!(op, "keypair" | "seal") {
            continue;
        }
        let out = answer(op.as_bytes(), q["args"].to_string().as_bytes());
        let ok = match q.get("error") {
            Some(_) => out.get("ok").is_none(),
            None => {
                out.get("ok").map(without_detail) == Some(without_detail(&q["answer"]))
            }
        };
        if !ok {
            differ.push(format!("{} {op}: core {} | oracle {}", q["story"], out.to_string().chars().take(400).collect::<String>(), q["answer"].to_string().chars().take(400).collect::<String>()));
        }
    }
    assert!(differ.is_empty(), "{} of the stories' questions differ:\n{}", differ.len(), differ.join("\n"));
}
