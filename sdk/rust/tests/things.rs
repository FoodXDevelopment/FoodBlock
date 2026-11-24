//! Things: holds and what is held for whom: each story is a fixed world, asked through the door, with the answer the text gives. Each world is asked as any SDK asks.
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
fn sack(n: &str) -> Value {
    json!({ "value": n, "unit": "sack" })
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
    fn no(&mut self, p: &Person, t: &Value) -> Value {
        self.sign(p, "transfer", json!({ "status": "declined" }), json!({ "answers": h(t) }))
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

// The receiver's door (Rule A): her no after her yes frees what is held for her, before it lands.
#[test]
fn the_receivers_door() {
    let mut w = World::new();
    let (joe, amara, _, _, x, j1) = joes_bond(&mut w);
    // (4) Joe arrives; Amara A2 declines J1
    w.sign(&joe, "observe", json!({ "kind": "arrived" }), json!({}));
    let o = w.own(&x);
    assert_eq!(draw_of(&o, &j1)["state"], json!("held"), "{o}");
    w.no(&amara, &j1);
    let o = w.own(&x);
    assert_eq!(draw_of(&o, &j1)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(joe.id), "X freed, Joe's: {o}");
}

// an accept with the giver's end in its causal past is no yes: the end frees the draw.
#[test]
fn an_accept_after_the_givers_end() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let q = w.thing(&harry, "sack", sack("1"));
    let t = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&q), "to_owner": amara.id }));
    let stop = w.sign(&harry, "transfer", json!({ "status": "stopped", "stop": "before" }), json!({ "updates": h(&t) }));
    // her accept has the end in its causal past
    w.sign(&amara, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&t), "after": [h(&stop)] }));
    let o = w.own(&q);
    assert_eq!(draw_of(&o, &t)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(harry.id), "{o}");
}

// a no after a yes on a draw that landed at that yes frees nothing (what landed stays).
#[test]
fn a_no_after_landing_frees_nothing() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let q = w.thing(&harry, "sack", sack("1"));
    let t = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&q), "to_owner": amara.id }));
    w.yes(&amara, &t);
    w.no(&amara, &t);
    assert_eq!(w.own(&q)["owner"], json!(amara.id));
}

// No reader's clock: no cutoff is signed, so X is held at every reader, whatever its clock says.
#[test]
fn no_readers_clock() {
    let mut w = World::new();
    let (_, _, _, _, x, j1) = joes_bond(&mut w);
    for now in [json!(null), json!("2027-01-01T00:00:00.000Z"), json!("2026-01-01T00:00:00.000Z")] {
        let o = call("ownership", json!([x, w.blocks, now]));
        assert_eq!(draw_of(&o, &j1)["state"], json!("held"), "{now}: {o}");
        assert_eq!(o["owner"], Value::Null);
    }
}

// A dead condition frees. World A: the counter's own signal that the price came before T is on its line before any cutoff: the
// `without` can no longer hold, and W is Maria's.
#[test]
fn a_dead_condition_frees() {
    let mut w = World::new();
    let maria = w.person(2);
    let leila = w.person(5);
    let counter = w.person(12);
    let wheat = w.thing(&maria, "wheat", sack("1"));
    let cond = json!({ "without": { "signal": "price_came", "by": { "names": [counter.id] } }, "deadline": T, "clocks": clocks(&[&counter], 1) });
    let m1 = w.sign(&maria, "transfer", json!({ "condition": cond }), json!({ "what": h(&wheat), "to_owner": leila.id }));
    w.yes(&leila, &m1);
    assert_eq!(draw_of(&w.own(&wheat), &m1)["state"], json!("held"));
    w.sign(&counter, "observe", json!({ "kind": "price_came" }), json!({}));
    let o = w.own(&wheat);
    assert_eq!(draw_of(&o, &m1)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(maria.id), "{o}");

    // World B: a bonus sack on a bare `reading` (silo dry for an hour) can never be shown: freed from signing, never held
    let mut w = World::new();
    let harry = w.person(1);
    let leila = w.person(5);
    let silo = w.thing(&harry, "silo", json!({ "value": "1", "unit": "silo" }));
    let bonus = w.thing(&harry, "sack", sack("1"));
    let cond = json!({ "reading": h(&silo), "kind": "humidity", "op": "lt", "value": { "value": "10", "unit": "%" }, "over": "PT1H" });
    let h1 = w.sign(&harry, "transfer", json!({ "condition": cond }), json!({ "what": h(&bonus), "to_owner": leila.id }));
    w.yes(&leila, &h1);
    let o = w.own(&bonus);
    assert_eq!(draw_of(&o, &h1)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(harry.id), "{o}");
}

impl World {
}

impl World {
}

impl World {
    fn offer(&mut self, from: &Person, what: &Value, to: &Person, terms: Value) -> Value {
        self.sign(from, "promise", json!({ "terms": deal_terms(terms, Some(&h(what))) }), json!({ "from": from.id, "to": to.id }))
    }
    fn accept_at(&mut self, p: &Person, offer: &Value, at: Option<&str>) -> Value {
        let k = p.keys.clone();
        self.sign_at(p, &k, "promise", json!({ "status": "accepted" }), json!({ "answers": h(offer), "for": h(offer) }), at.map(String::from))
    }
}

// Where a hold starts: a one-to-one offer of a lot holds it; a later sale of the lot to another is `past`.
#[test]
fn an_offer_holds() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let bob = w.person(6);
    let l7 = w.thing(&harry, "lentils", sack("10"));
    let h2 = w.offer(&harry, &l7, &amara, json!({ "price": { "value": "60", "unit": "GBP" } }));
    let b1 = w.sign(&bob, "promise", json!({ "kind": "order", "terms": deal_terms(json!({}), Some(&h(&l7))) }), json!({}));
    let h3 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&l7), "to_owner": bob.id, "for": h(&b1) }));
    w.yes(&bob, &h3);
    let o = w.own(&l7);
    assert_eq!(draw_of(&o, &h2)["state"], json!("held"), "{o}");
    assert_eq!(draw_of(&o, &h3)["why"], json!("past"), "{o}");
    // her accept binds it, and his transfer `for` the deal performs it: hers
    let a1 = w.accept_at(&amara, &h2, None);
    let h4 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&l7), "to_owner": amara.id, "for": h(&h2), "after": [h(&a1)] }));
    let o = w.own(&l7);
    assert_eq!(draw_of(&o, &h4)["state"], json!("landed"), "{o}");
    assert_eq!(o["owner"], json!(amara.id), "{o}");
}

// An offer's hold follows its accept: an accept dated after the offer's `expires` (no clock) is no yes; the offer stays held for
// Harry's next word; his decline of the accept frees it.
#[test]
fn an_offers_hold_follows_its_accept() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let l7 = w.thing(&harry, "lentils", sack("10"));
    let h2 = w.offer(&harry, &l7, &amara, json!({ "price": { "value": "60", "unit": "GBP" }, "expires": "2026-11-19T00:00:00.000Z" }));
    let a1 = w.accept_at(&amara, &h2, Some("2026-11-20T09:00:00.000Z"));
    let o = w.own(&l7);
    assert_eq!(draw_of(&o, &h2)["state"], json!("held"), "{o}");
    let stage = call("promise_stage", json!([h2, w.blocks, {}]));
    assert_eq!(stage["stage"], json!("offered"), "{stage}");
    w.sign(&harry, "promise", json!({ "status": "declined" }), json!({ "answers": h(&a1), "for": h(&h2) }));
    let o = w.own(&l7);
    assert_eq!(draw_of(&o, &h2)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(harry.id), "{o}");
}

// A hold that waits on her money: a cash quote ended by its giver after the buyer's yes is freed, unless he accepted a payment
// toward the price before the end.
#[test]
fn a_hold_that_waits_on_her_money() {
    for paid in [false, true] {
        let mut w = World::new();
        let harry = w.person(1);
        let bob = w.person(6);
        let l7 = w.thing(&harry, "lentils", sack("10"));
        let h2 = w.offer(&harry, &l7, &bob, json!({ "price": { "value": "60", "unit": "GBP" }, "waits_on": "price" }));
        let b1 = w.accept_at(&bob, &h2, None);
        let mut after = vec![h(&b1)];
        if paid {
            let b2 = w.sign(&bob, "transfer", json!({ "amount": { "value": "20", "unit": "GBP" } }), json!({ "to_owner": harry.id, "for": h(&h2) }));
            let h2b = w.sign(&harry, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&b2), "after": [h(&b2)] }));
            after = vec![h(&h2b)];
        }
        w.sign(&harry, "promise", json!({ "status": "stopped", "stop": "before" }), json!({ "updates": h(&h2), "after": after }));
        let o = w.own(&l7);
        if paid {
            assert_eq!(draw_of(&o, &h2)["state"], json!("held"), "a payment accepted before the end: L7 stays held for Bob: {o}");
        } else {
            assert_eq!(draw_of(&o, &h2)["state"], json!("freed"), "{o}");
            assert_eq!(o["owner"], json!(harry.id), "{o}");
        }
    }
}

fn kes(v: &str) -> Value {
    json!({ "value": v, "unit": "KES" })
}
impl World {
    fn pay(&mut self, payer: &Person, payee: &Person, deal: &Value, amount: Value) -> Value {
        self.sign(payer, "transfer", json!({ "amount": amount }), json!({ "to_owner": payee.id, "for": h(deal) }))
    }
    fn stage(&self, first: &Value) -> Value {
        call("promise_stage", json!([first, self.blocks, {}]))
    }
}

// A receiving place handed on: Harry hands his place (to receive KSh 2,000) to Wanjiru, who accepts; Mama pays Harry, who accepts:
// paid 2,000, and Harry is shown keeping it for Wanjiru.
#[test]
fn a_receiving_place_handed_on() {
    let mut w = World::new();
    let mama = w.person(4);
    let harry = w.person(1);
    let wanjiru = w.person(8);
    let flour = w.thing(&harry, "flour", json!({ "value": "10", "unit": "kg" }));
    let m1 = w.sign(&mama, "promise", json!({ "terms": deal_terms(json!({ "price": kes("2000") }), Some(&h(&flour))) }), json!({ "from": harry.id, "to": mama.id }));
    w.sign(&harry, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&m1), "for": h(&m1) }));
    let h2 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&m1), "to_owner": wanjiru.id, "for": h(&m1) }));
    // a hand-over of a claim lets another receive for him: he signs it again (blocks.md, Finality, Signed twice)
    w.sign(&harry, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&h2)] }));
    w.yes(&wanjiru, &h2);
    let s = w.stage(&m1);
    assert!(s.get("owed").is_none() && s.get("owed_on").is_none() && s.get("to_come_on").is_some(), "{s}");
    let m2 = w.pay(&mama, &harry, &m1, kes("2000"));
    w.yes(&harry, &m2);
    let s = w.stage(&m1);
    assert_eq!(s["paid"], kes("2000"), "{s}");
    assert_eq!(s["to_come_on"], json!([{ "from": harry.id, "to": wanjiru.id, "amount": kes("2000"), "payment": h(&m2) }]), "{s}");
}

// Every door question the oracle's stories of things ask (spec/oracle/stories/things, each checked there against the text's answer), asked
// of the core: the same answer, a refusal's `detail` aside. Regenerate: node spec/oracle/stories/export.cjs things.
fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
#[test]
fn the_oracle_stories_of_things() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/things.json")).unwrap();
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
