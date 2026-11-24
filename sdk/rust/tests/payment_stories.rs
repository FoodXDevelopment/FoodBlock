//! Payment stories: amounts, payments and pots: each story is a fixed world, asked through the door, with the answer the text gives. Each world is asked as any SDK asks.
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
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Holds
// ---------------------------------------------------------------------------------------------------------------------------------------

impl World {
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

impl World {
}
// ---------------------------------------------------------------------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------------------------------------------------------------------

// A pay-in the pot's holder accepted by a block of a fork of his own line counts: her accept of money binds its signer (promises.md, Settling).
#[test]
fn a_pay_in_accepted_by_a_block_of_a_fork() {
    let mut w = World::new();
    let holder = w.person(7);
    let payer = w.person(5);
    let n1 = w.by_hand(&holder, "observe", json!({ "kind": "note", "text": "a" }), json!({}), &holder.id, 1);
    w.by_hand(&holder, "observe", json!({ "kind": "note", "text": "b" }), json!({}), &holder.id, 1);
    let head = w.by_hand(&holder, "promise", json!({ "what": "pool" }), json!({ "from": holder.id }), &h(&n1), 2);
    let t = w.sign(&payer, "transfer", json!({ "amount": { "value": "40", "unit": "KES" } }), json!({ "for": h(&head), "to_owner": holder.id }));
    w.by_hand(&holder, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&t) }), &h(&head), 3);
    let p = call("pot", json!([head, w.blocks]));
    assert_eq!(p["paid_in"], json!({ "value": "40", "unit": "KES" }), "{p}");
    assert_eq!(p["kind"], json!({ "unit": "KES", "of": null }), "{p}");
}

fn kes(v: &str) -> Value {
    json!({ "value": v, "unit": "KES" })
}
impl World {
    fn deal(&mut self, from: &Person, to: &Person, what: &Value, terms: Value) -> Value {
        let o = self.sign(from, "promise", json!({ "terms": deal_terms(terms, Some(&h(what))) }), json!({ "from": from.id, "to": to.id }));
        let k = to.keys.clone();
        self.sign_at(to, &k, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&o), "for": h(&o) }), None);
        o
    }
    fn pay(&mut self, payer: &Person, payee: &Person, deal: &Value, amount: Value) -> Value {
        self.sign(payer, "transfer", json!({ "amount": amount }), json!({ "to_owner": payee.id, "for": h(deal) }))
    }
    fn stage(&self, first: &Value) -> Value {
        call("promise_stage", json!([first, self.blocks, {}]))
    }
}

// Paid only by the payee's word, or by the very thing named: Harry's own "credit" thing of her kind pays nothing; a part of her issue
// I, drawn to her, lands where it is signed (her own offer M1, which Harry accepted, is her yes) and pays 5.
#[test]
fn paid_by_the_very_thing_named() {
    let mut w = World::new();
    let maria = w.person(2);
    let harry = w.person(1);
    let k = w.sign(&maria, "thing", json!({ "kind": "bread credit" }), json!({}));
    let issue = w.sign(&maria, "thing", json!({ "kind": "bread credit", "pack": { "value": "100", "unit": "credit" } }), json!({ "of": h(&k) }));
    let give = w.sign(&maria, "transfer", json!({ "amount": { "value": "10", "unit": "credit" } }), json!({ "what": h(&issue), "to_owner": harry.id }));
    w.yes(&harry, &give);
    let loaves = w.thing(&maria, "bread", json!({ "value": "5", "unit": "loaf" }));
    let m1 = w.deal(&maria, &harry, &loaves, json!({ "price": { "value": "5", "unit": "credit", "of": h(&issue) } }));
    let own = w.sign(&harry, "thing", json!({ "kind": "bread credit", "pack": { "value": "5", "unit": "credit" } }), json!({ "of": h(&k) }));
    w.sign(&harry, "transfer", json!({ "amount": { "value": "5", "unit": "credit" } }), json!({ "what": h(&own), "to_owner": maria.id, "for": h(&m1) }));
    // with no word of hers about it, a look-alike counts nothing (`paid` null until a block counts; her `accepted` answer to it would be
    // her word, and count at what she said)
    assert_eq!(w.stage(&m1)["paid"], json!(null), "a look-alike pays nothing: {}", w.stage(&m1));
    let h3 = w.sign(&harry, "transfer", json!({ "amount": { "value": "5", "unit": "credit" } }), json!({ "what": h(&issue), "to_owner": maria.id, "for": h(&m1) }));
    w.yes(&maria, &h3);
    assert_eq!(w.stage(&m1)["paid"]["value"], json!("5"), "{}", w.stage(&m1));
}

// Once: Mama's tablet accept and her phone's `received` answering one KSh 20 count 20; two `received` words answering no transfer
// count 40.
#[test]
fn once() {
    let mut w = World::new();
    let mama = w.person(4);
    let leila = w.person(5);
    let flour = w.thing(&mama, "flour", json!({ "value": "1", "unit": "kg" }));
    let e1 = w.deal(&mama, &leila, &flour, json!({ "price": kes("20") }));
    let e2 = w.pay(&leila, &mama, &e1, kes("20"));
    w.yes(&mama, &e2);
    w.sign(&mama, "observe", json!({ "kind": "received", "amount": kes("20") }), json!({ "answers": h(&e2), "for": h(&e1) }));
    assert_eq!(w.stage(&e1)["paid"], kes("20"), "{}", w.stage(&e1));
    let mut w = World::new();
    let mama = w.person(4);
    let leila = w.person(5);
    let flour = w.thing(&mama, "flour", json!({ "value": "1", "unit": "kg" }));
    let e1 = w.deal(&mama, &leila, &flour, json!({ "price": kes("40") }));
    for _ in 0..2 {
        w.sign(&mama, "observe", json!({ "kind": "received", "amount": kes("20") }), json!({ "for": h(&e1) }));
    }
    assert_eq!(w.stage(&e1)["paid"], kes("40"), "{}", w.stage(&e1));
}

// Her order, where it says the goods are in her hand: Mama's 2 kg naming no instance moves 2 kg toward Leila's order.
#[test]
fn her_order_in_hand() {
    let mut w = World::new();
    let mama = w.person(4);
    let leila = w.person(5);
    let e1 = w.sign(&leila, "promise", json!({ "terms": deal_terms(json!({ "quantity": { "value": "2", "unit": "kg" }, "in_hand": true }), None::<&str>) }), json!({ "from": mama.id, "to": leila.id }));
    // the story leaves Mama's yes to the order unsaid: she accepts it, so the deal binds
    w.sign(&mama, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&e1), "for": h(&e1) }));
    w.sign(&mama, "transfer", json!({ "amount": { "value": "2", "unit": "kg" } }), json!({ "to_owner": leila.id, "for": h(&e1) }));
    let s = w.stage(&e1);
    assert_eq!(s["lines"][0]["moved"], json!({ "value": "2", "unit": "kg" }), "{s}");
    // the same order with no such term: the transfer counts nothing toward what came (no one said it came)
    let mut w = World::new();
    let mama = w.person(4);
    let leila = w.person(5);
    let e1 = w.sign(&leila, "promise", json!({ "terms": deal_terms(json!({ "quantity": { "value": "2", "unit": "kg" } }), None::<&str>) }), json!({ "from": mama.id, "to": leila.id }));
    w.sign(&mama, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&e1), "for": h(&e1) }));
    w.sign(&mama, "transfer", json!({ "amount": { "value": "2", "unit": "kg" } }), json!({ "to_owner": leila.id, "for": h(&e1) }));
    let s = w.stage(&e1);
    assert_ne!(s["lines"][0]["moved"], json!({ "value": "2", "unit": "kg" }), "{s}");
    // World B: no term: what came is what Harry says came
    let mut w = World::new();
    let harry = w.person(1);
    let sam = w.person(30);
    let h1 = w.sign(&harry, "promise", json!({ "terms": deal_terms(json!({ "quantity": sack("40") }), None::<&str>) }), json!({ "from": sam.id, "to": harry.id }));
    w.sign(&sam, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&h1), "for": h(&h1) }));
    w.sign(&sam, "transfer", json!({ "amount": sack("40") }), json!({ "to_owner": harry.id, "for": h(&h1) }));
    w.sign(&harry, "observe", json!({ "kind": "received", "amount": sack("36") }), json!({ "for": h(&h1) }));
    let s = w.stage(&h1);
    assert_eq!(s["lines"][0]["moved"], sack("36"), "{s}");
}

// A price is tested by multiplying; a total prints exactly (`n/d`); the pieces paid for are taken only in `per`'s
// unit; `step` rounds the total up to what is payable.
#[test]
fn how_a_price_is_counted() {
    let per = |a: &str, p: &str, unit: &str| json!({ "amount": kes(a), "per": { "value": p, "unit": unit } });
    let q = |v: &str, unit: &str| json!({ "value": v, "unit": unit });
    // 10 per 3, two taken: 20/3
    assert_eq!(call("terms_total", json!([{ "lines": [{ "id": "item", "price": per("10", "3", "piece"), "quantity": q("2", "piece") }] }, null])), kes("20/3"));
    // 3 mandazi for KSh 10, step 1 KES: two come to 7
    assert_eq!(call("terms_total", json!([{ "lines": [{ "id": "item", "price": per("10", "3", "piece"), "quantity": q("2", "piece") }], "step": kes("1") }, null])), kes("7"));
    // Harry's tonne at 285.50, 23.457 t, step 0.01: 6696.98
    assert_eq!(call("terms_total", json!([{ "lines": [{ "id": "item", "price": { "amount": { "value": "285.50", "unit": "GBP" }, "per": q("1", "t") }, "quantity": q("23.457", "t") }], "step": { "value": "0.01", "unit": "GBP" } }, null]))["value"], json!("6696.98"));
    let run = |a: &str, p: &str, took: Value, paid: &str, unit: &str| -> Value {
        let mut w = World::new();
        let mama = w.person(4);
        let leila = w.person(5);
        let m = w.thing(&mama, "mandazi", json!({ "value": "100", "unit": unit }));
        let m1 = w.deal(&mama, &leila, &m, json!({ "price": per(a, p, "piece").as_object().map(|o| { let mut o = o.clone(); o["per"]["unit"] = json!(if unit == "g" { "kg" } else { "piece" }); Value::Object(o) }).unwrap(), "quantity": took }));
        let t = w.pay(&leila, &mama, &m1, kes(paid));
        w.yes(&mama, &t);
        w.stage(&m1)
    };
    // 7 per 3, took 3, paid 5: not paid (15 < 21); `from` 6/7
    let s = run("7", "3", q("3", "piece"), "5", "piece");
    assert_ne!(s["stage"], json!("done"), "{s}");
    assert_eq!(s["total"], kes("7"), "{s}");
    let _ = &s["uncovered"];
    // paid 7: paid
    let s = run("7", "3", q("3", "piece"), "7", "piece");
    assert_eq!(s["paid"], kes("7"), "{s}");
    // the pieces the payments pay for, exact, in `per`'s unit
    let from = |a: &str, p: &str, p_unit: &str, took: Value, paid: &str| -> Value {
        let mut w = World::new();
        let mama = w.person(4);
        let leila = w.person(5);
        let unit = took["unit"].as_str().unwrap().to_string();
        let m = w.thing(&mama, "goods", json!({ "value": "10000", "unit": unit }));
        let m1 = w.deal(&mama, &leila, &m, json!({ "price": per(a, p, p_unit), "quantity": took.clone() }));
        let g = w.sign(&mama, "transfer", json!({ "amount": took }), json!({ "what": h(&m), "to_owner": leila.id, "for": h(&m1) }));
        w.yes(&leila, &g);
        if paid != "0" {
            let t = w.pay(&leila, &mama, &m1, kes(paid));
            w.yes(&mama, &t);
        }
        w.stage(&m1)["uncovered"]["from"].clone()
    };
    assert_eq!(from("7", "3", "piece", q("3", "piece"), "5"), json!([{ "line": "item", "amount": q("6/7", "piece") }]));
    assert_eq!(from("0", "3", "piece", q("3", "piece"), "0"), json!([{ "line": "item", "amount": q("0", "piece") }]));
    assert_eq!(from("120", "1", "kg", q("2500", "g"), "300"), json!([{ "line": "item", "amount": q("2500", "g") }]));
    assert_eq!(from("10", "3", "piece", q("7", "piece"), "24"), json!([{ "line": "item", "amount": q("0", "piece") }]));
}

// Where it came: one account word with a list of places. Soko's `received` naming AW1 and the till counts; one naming no account
// word counts nothing; a thief's later AW2 is the head `account_of` shows.
#[test]
fn one_account_word_with_a_list_of_places() {
    let mut w = World::new();
    let mama = w.person(4);
    let ben = w.person(6);
    let soko = w.person(13);
    let aw1 = w.sign(&mama, "observe", json!({ "kind": "account", "destinations": [{ "destination": "stall", "by": mama.id }, { "destination": "till 123456", "by": soko.id }] }), json!({}));
    let a = call("account_of", json!([mama.id, w.blocks]));
    assert_eq!(a["destinations"].as_array().map(Vec::len), Some(2), "{a}");
    let goods = w.thing(&mama, "maize", sack("10"));
    let deal = w.deal(&mama, &ben, &goods, json!({ "price": kes("600") }));
    w.sign(&soko, "observe", json!({ "kind": "received", "amount": kes("600"), "destination": "till 123456" }), json!({ "for": h(&deal), "derives_from": [h(&aw1)] }));
    assert_eq!(w.stage(&deal)["paid"], kes("600"), "{}", w.stage(&deal));
    // naming no account word: counts nothing
    let mut w2 = World::new();
    let mama = w2.person(4);
    let ben = w2.person(6);
    let soko = w2.person(13);
    w2.sign(&mama, "observe", json!({ "kind": "account", "destinations": [{ "destination": "till 123456", "by": soko.id }] }), json!({}));
    let goods = w2.thing(&mama, "maize", sack("10"));
    let deal = w2.deal(&mama, &ben, &goods, json!({ "price": kes("600") }));
    w2.sign(&soko, "observe", json!({ "kind": "received", "amount": kes("600"), "destination": "till 123456" }), json!({ "for": h(&deal) }));
    assert!(w2.stage(&deal)["paid"].get("value").is_none_or(|v| v == "0"), "{}", w2.stage(&deal));
    // a later head of hers: account_of lists only its places
    w.sign(&mama, "observe", json!({ "kind": "account", "destinations": [{ "destination": "thief", "by": mama.id }] }), json!({}));
    let a = call("account_of", json!([mama.id, w.blocks]));
    assert_eq!(a["destinations"], json!([{ "destination": "thief", "by": mama.id }]), "{a}");
}

// Every door question the oracle's stories of payments ask (spec/oracle/stories/payments, each checked there against the text's answer), asked
// of the core: the same answer, a refusal's `detail` aside. Regenerate: node spec/oracle/stories/export.cjs payments.
fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
#[test]
fn the_oracle_stories_of_payments() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/payments.json")).unwrap();
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
