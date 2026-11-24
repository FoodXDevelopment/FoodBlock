//! Amounts: the one amount shape, the one printed form of a sum, and What is left: every measure drawn on along
//! its owner's line by one rule (folds.md, What is left; things.md; encoding.md, Shapes). Each test is a small world of signed blocks,
//! asked through the door as any SDK asks.
use foodblock::decimal::{Amount, Dec};
use foodblock::door::answer;
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{keypair_from_seed, write, ComposeOptions, Keypair, Readers, WriteOptions};
use serde_json::{json, Value};

struct World {
    blocks: Vec<Value>,
    minute: u32,
}
#[derive(Clone)]
struct Person {
    id: String,
    keys: Keypair,
}

fn call(op: &str, args: Value) -> Value {
    let out = answer(op.as_bytes(), args.to_string().as_bytes());
    out.get("ok").cloned().unwrap_or_else(|| panic!("{op}: {out}"))
}
fn h(b: &Value) -> String {
    b["hash"].as_str().unwrap().to_string()
}
fn kg(v: &str) -> Value {
    json!({ "value": v, "unit": "kg" })
}
fn kind(word: &str) -> String {
    format!("{:0>64}", word.bytes().map(|b| format!("{b:02x}")).collect::<String>())[..64].to_string()
}

impl World {
    fn new() -> World {
        World { blocks: vec![], minute: 0 }
    }
    fn at(&mut self) -> String {
        self.minute += 1;
        format!("2026-11-11T{:02}:{:02}:00.000Z", self.minute / 60, self.minute % 60)
    }
    fn person(&mut self, seed: u8) -> Person {
        let keys = keypair_from_seed(&format!("{seed:02x}").repeat(32)).unwrap();
        let at = self.at();
        let g = genesis(&keys, &GenesisOptions { kind: "person", at, audience: Some(Readers::Public), ..Default::default() }).unwrap();
        self.blocks.push(g.clone());
        Person { id: h(&g), keys }
    }
    fn sign_with(&mut self, p: &Person, key: &Keypair, t: &str, state: Value, refs: Value) -> Value {
        let at = self.at();
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
        self.sign_with(p, &k, t, state, refs)
    }
    /// A thing of hers: an instance of a kind, with a pack when given.
    fn thing(&mut self, p: &Person, word: &str, pack: Option<Value>) -> Value {
        let mut state = json!({ "kind": word });
        if let Some(pk) = pack {
            state["pack"] = pk;
        }
        self.sign(p, "thing", state, json!({ "of": kind(word) }))
    }
    fn give(&mut self, p: &Person, what: &Value, to: &Person, amount: Option<Value>) -> Value {
        let state = amount.map_or(json!({}), |a| json!({ "amount": a }));
        self.sign(p, "transfer", state, json!({ "what": h(what), "to_owner": to.id }))
    }
    fn yes(&mut self, p: &Person, t: &Value, state: Value) -> Value {
        let mut s = json!({ "status": "accepted" });
        for (k, v) in state.as_object().unwrap() {
            s[k] = v.clone();
        }
        self.sign(p, "transfer", s, json!({ "answers": h(t) }))
    }
    fn own(&self, thing: &Value) -> Value {
        call("ownership", json!([thing, self.blocks, null]))
    }
}

fn draw<'a>(o: &'a Value, b: &Value) -> &'a Value {
    o["draws"].as_array().unwrap().iter().find(|d| d["block"] == b["hash"]).unwrap_or_else(|| panic!("no draw {} in {o}", b["hash"]))
}
fn owners(o: &Value) -> Vec<(String, Value)> {
    o["owners"].as_array().unwrap().iter().map(|x| (x["owner"].as_str().unwrap().to_string(), x["amount"]["value"].clone())).collect()
}

#[test]
fn a_sum_is_printed_in_one_form_and_nothing_is_rounded() {
    let d = |t: &str| Dec::parse(t).unwrap();
    assert_eq!(d("0.6").add(&d("0.4")).text(), "1");
    assert_eq!(d("1.50").text(), "1.5");
    assert_eq!(d("0.5").sub(&d("0.5")).text(), "0");
    assert_eq!(Dec::zero().sub(&d("0")).text(), "0");
    assert_eq!(d("0.00000001").mul(&d("3")).text(), "0.00000003");
    assert_eq!(d("93").mul(&d("1")).div(&d("10")).unwrap().text(), "9.3");
    // a quotient that never ends is no decimal: nothing is rounded, it prints as a fraction in lowest terms
    assert_eq!(d("1").div(&d("3")).unwrap().text(), "1/3");
    assert!(d("1").div(&d("0")).is_none());
    // past 2^53, exact
    assert_eq!(d("100000000000000000000").add(&d("1")).text(), "100000000000000000001");
    // two amounts are of one kind when the unit is the same text and the of the same id, or neither has one
    let a = |v: Value| Amount::of(Some(&v)).unwrap();
    assert_eq!(a(json!({ "value": "1", "unit": "GBP" })).kind, a(json!({ "value": "2", "unit": "GBP" })).kind);
    assert_ne!(a(json!({ "value": "1", "unit": "GBP" })).kind, a(json!({ "value": "1", "unit": "gbp" })).kind);
    assert_ne!(a(json!({ "value": "1", "unit": "credit", "of": kind("k") })).kind, a(json!({ "value": "1", "unit": "credit" })).kind);
}

#[test]
fn the_amount_shape_and_what_a_transfer_may_name() {
    let mut w = World::new();
    let harry = w.person(1);
    let maria = w.person(2);
    let sack = w.thing(&harry, "flour", Some(kg("1")));
    let refusals = |t: &str, state: Value, refs: Value| -> Vec<String> {
        foodblock::check::write_refusals(t, &state, &refs, Default::default()).iter().map(|r| r.code.clone()).collect()
    };
    let common = |s: Value| {
        let mut s = s;
        s["seq"] = json!(9);
        s["audience"] = json!("public");
        s["at"] = json!("2026-11-11T00:00:00.000Z");
        s
    };
    let refs = |r: Value| {
        let mut r = r;
        r["author"] = json!(harry.id);
        r["prev"] = json!(harry.id);
        r
    };
    // money is an amount: the old money shape is no shape
    assert!(refusals("transfer", common(json!({ "amount": { "minor": 500, "currency": "GBP" } })), refs(json!({ "to_owner": maria.id }))).contains(&"shape".to_string()));
    assert!(refusals("transfer", common(json!({ "amount": { "value": "5", "unit": "GBP" } })), refs(json!({ "to_owner": maria.id }))).is_empty());
    // a transfer that names no instance names its owner
    assert!(refusals("transfer", common(json!({ "amount": { "value": "5", "unit": "GBP" }, "count": 3 })), refs(json!({}))).contains(&"required".to_string()));
    // an amount moves only title: never to a holder or a place
    assert!(refusals("transfer", common(json!({ "amount": kg("0.5") })), refs(json!({ "what": h(&sack), "to_holder": maria.id }))).contains(&"shape".to_string()));
    // beside refs.what an amount's kind is the instance's own
    assert!(refusals("transfer", common(json!({ "amount": { "value": "0.5", "unit": "kg", "of": kind("flour") } })), refs(json!({ "what": h(&sack), "to_owner": maria.id }))).contains(&"shape".to_string()));
    // a pack carries no of
    assert!(refusals("thing", common(json!({ "kind": "flour", "pack": { "value": "1", "unit": "kg", "of": kind("flour") } })), refs(json!({ "of": kind("flour") }))).contains(&"shape".to_string()));
    // what moves is never below zero
    assert!(refusals("transfer", common(json!({ "amount": { "value": "-1", "unit": "GBP" } })), refs(json!({ "to_owner": maria.id }))).contains(&"shape".to_string()));
    // a promise of an amount of a good names it in terms.quantity: no loan type
    assert!(refusals("promise", common(json!({ "terms": { "lines": [{ "id": "loan", "quantity": { "value": "100", "unit": "GBP" }, "price": { "value": "110", "unit": "GBP" } }] } })), refs(json!({ "from": harry.id, "to": maria.id }))).is_empty());
    // a make's inputs: [{ from, amount }]
    assert!(refusals("transform", common(json!({ "inputs": [{ "from": h(&sack), "amount": kg("0.2") }] })), refs(json!({ "derives_from": [h(&sack)] }))).is_empty());
    // the door's amount builder takes an of
    assert_eq!(call("amount", json!(["1", "credit", kind("k")])), json!({ "value": "1", "unit": "credit", "of": kind("k") }));
}

#[test]
fn draws_on_a_sack_hold_land_and_never_cut_down() {
    let mut w = World::new();
    let harry = w.person(1);
    let maria = w.person(2);
    let amara = w.person(3);
    let sam = w.person(4);
    let sack = w.thing(&harry, "maize", Some(kg("1")));
    let to_maria = w.give(&harry, &sack, &maria, Some(kg("0.6")));
    // it holds at once: no one is shown owning what is held
    let o = w.own(&sack);
    assert_eq!(draw(&o, &to_maria)["state"], json!("held"));
    assert_eq!(owners(&o), vec![(harry.id.clone(), json!("0.4"))]);
    assert_eq!(o["held"]["value"], json!("0.6"));
    w.yes(&maria, &to_maria, json!({}));
    let to_amara = w.give(&harry, &sack, &amara, Some(kg("0.6")));
    let o = w.own(&sack);
    assert_eq!(draw(&o, &to_maria)["state"], json!("landed"));
    // 0.4 is left: the second 0.6 takes nothing, and is never cut down to 0.4
    assert_eq!((draw(&o, &to_amara)["takes"].clone(), draw(&o, &to_amara)["why"].clone()), (json!(false), json!("past")));
    // all he owns of it: 0.4
    let to_sam = w.give(&harry, &sack, &sam, None);
    w.yes(&sam, &to_sam, json!({}));
    let o = w.own(&sack);
    assert_eq!(draw(&o, &to_sam)["takes"], json!(true));
    let got = owners(&o);
    let mut want = vec![(maria.id.clone(), json!("0.6")), (sam.id.clone(), json!("0.4"))];
    want.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(got, want);
    assert_eq!(o["owner"], json!(null));
    // an instance's kind is its pack's unit and its own refs.of
    assert_eq!(o["kind"]["unit"], json!("kg"));
    assert_eq!(o["kind"]["of"], sack["refs"]["of"]);
}

#[test]
fn an_accept_that_states_less_lands_that_much_and_frees_the_rest() {
    let mut w = World::new();
    let harry = w.person(1);
    let maria = w.person(2);
    let lot = w.thing(&harry, "maize", Some(kg("100")));
    let t = w.give(&harry, &lot, &maria, Some(kg("100")));
    w.yes(&maria, &t, json!({ "amount": kg("80") }));
    let o = w.own(&lot);
    let got = owners(&o);
    let mut want = vec![(harry.id.clone(), json!("20")), (maria.id.clone(), json!("80"))];
    want.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(got, want);
    // a transfer of zero is no draw
    let zero = w.give(&harry, &lot, &maria, Some(kg("0")));
    assert!(w.own(&lot)["draws"].as_array().unwrap().iter().all(|d| d["block"] != zero["hash"]));
}

#[test]
fn a_make_takes_from_its_owner_and_its_output_is_hers() {
    let mut w = World::new();
    let maria = w.person(2);
    let harry = w.person(1);
    let bag = w.thing(&maria, "flour", Some(kg("1")));
    let make = w.sign(&maria, "transform", json!({ "inputs": [{ "from": h(&bag), "amount": kg("0.2") }] }), json!({ "derives_from": [h(&bag)] }));
    let loaf = w.sign(&maria, "thing", json!({ "kind": "loaf" }), json!({ "derives_from": [h(&make)] }));
    let o = w.own(&bag);
    assert_eq!(draw(&o, &make)["state"], json!("landed"));
    assert_eq!(owners(&o), vec![(maria.id.clone(), json!("0.8"))]);
    assert_eq!(o["ended"]["value"], json!("0.2"));
    assert_eq!(w.own(&loaf)["owner"], json!(maria.id));
    // in another unit: nothing is converted, nothing taken
    let grams = w.sign(&maria, "transform", json!({ "inputs": [{ "from": h(&bag), "amount": { "value": "200", "unit": "g" } }] }), json!({ "derives_from": [h(&bag)] }));
    assert_eq!(draw(&w.own(&bag), &grams)["why"], json!("unit"));
    // a stranger's make of her flour takes nothing, and its output has no owner
    let theirs = w.sign(&harry, "transform", json!({}), json!({ "derives_from": [h(&bag)] }));
    let bread = w.sign(&harry, "thing", json!({ "kind": "bread" }), json!({ "derives_from": [h(&theirs)] }));
    assert_eq!(draw(&w.own(&bag), &theirs)["why"], json!("not_owner"));
    assert_eq!(w.own(&bread)["owners"], json!([]));
    // made_from: what was made from the bag, along the makes that took from it
    let made = call("made_from", json!([bag, w.blocks]));
    assert_eq!(made, json!([{ "thing": h(&loaf), "from": h(&bag), "make": h(&make), "took": kg("0.2") }]));
}

#[test]
fn a_whole_baked_then_sold_and_a_kind_by_its_own_block() {
    let mut w = World::new();
    let harry = w.person(1);
    let sam = w.person(4);
    let leila = w.person(5);
    let sack = w.thing(&harry, "maize", None);
    // a stranger's thing naming Harry's sack in refs.of says nothing about the sack
    w.sign(&leila, "thing", json!({ "kind": "a sack of harry's" }), json!({ "of": h(&sack) }));
    assert_eq!(w.own(&sack)["owner"], json!(harry.id));
    let bake = w.sign(&harry, "transform", json!({}), json!({ "derives_from": [h(&sack)] }));
    w.sign(&harry, "thing", json!({ "kind": "loaf" }), json!({ "derives_from": [h(&bake)] }));
    let sale = w.give(&harry, &sack, &sam, None);
    let o = w.own(&sack);
    assert_eq!(draw(&o, &sale)["why"], json!("past"));
    // one whole has no kind, so no sum of it is said: the draws show the make took it
    assert_eq!(o["ended"], json!(null));
    assert_eq!(draw(&o, &bake)["state"], json!("landed"));
    assert_eq!(o["owners"], json!([]));
}

#[test]
fn a_silent_receiver_then_another_and_her_late_yes() {
    let mut w = World::new();
    let harry = w.person(1);
    let maria = w.person(2);
    let sam = w.person(4);
    let stone = w.thing(&harry, "millstone", None);
    let to_maria = w.give(&harry, &stone, &maria, None);
    let to_sam = w.give(&harry, &stone, &sam, None);
    let o = w.own(&stone);
    assert_eq!(draw(&o, &to_sam)["why"], json!("past"));
    assert_eq!(o["owner"], json!(null));
    w.yes(&maria, &to_maria, json!({}));
    let o = w.own(&stone);
    assert_eq!(draw(&o, &to_maria)["state"], json!("landed"));
    assert_eq!(o["owner"], json!(maria.id));
}

#[test]
fn a_pair_on_her_line_takes_nothing() {
    let mut w = World::new();
    let harry = w.person(1);
    let maria = w.person(2);
    let sam = w.person(4);
    let sack = w.thing(&harry, "maize", Some(kg("10")));
    let a = w.give(&harry, &sack, &maria, Some(kg("4")));
    // the same place on his line, signed again by hand: a pair of his key
    let mut b = foodblock::create("transfer", &json!({ "amount": kg("4"), "seq": a["state"]["seq"], "at": "2026-11-11T05:00:00.000Z", "audience": "public" }), &json!({ "what": h(&sack), "to_owner": sam.id, "author": harry.id, "prev": a["refs"]["prev"] })).unwrap();
    b["signature"] = json!(foodblock::sign(&b, &harry.keys.private_key).unwrap());
    w.blocks.push(b.clone());
    let o = w.own(&sack);
    // 4 and 4 of 10 fit, so neither is a pair's refusal (unanswered, neither stands yet, and neither changes the other)
    assert_ne!(draw(&o, &a)["why"], json!("pair"));
    assert_ne!(draw(&o, &b)["why"], json!("pair"));
    // one receiver lets go: the other is read as a draw alone
    w.sign(&maria, "observe", json!({ "status": "declined" }), json!({ "answers": h(&a) }));
    w.yes(&sam, &b, json!({}));
    let o = w.own(&sack);
    assert_eq!(draw(&o, &b)["takes"], json!(true));
}

// One start: two accepts apart by two of her keys: the one by her receiving voice (her first voice: her genesis key here) starts
// her line; the tablet's accept is her yes and starts nothing, and a draw by the tablet takes nothing (`not_on_chain`).
#[test]
fn two_accepts_apart_the_receiving_voice_starts_the_line() {
    let mut w = World::new();
    let sam = w.person(4);
    let maria = w.person(2);
    let ben = w.person(6);
    // her tablet: a key grant, signed again
    let tablet = keypair_from_seed(&"aa".repeat(32)).unwrap();
    let grant = w.sign(&maria, "grant", json!({ "kind": "key", "public_key_sign": tablet.public_key_sign }), json!({ "subject": maria.id }));
    let again = w.sign(&maria, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&grant)] }));
    let sacks = w.thing(&sam, "maize", Some(json!({ "value": "10", "unit": "sack" })));
    let t = w.give(&sam, &sacks, &maria, None);
    let _first_voice_yes = w.yes(&maria, &t, json!({}));
    let _tablet_yes = w.sign_with(&maria, &tablet, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&t), "after": [h(&again)] }));
    let sack2 = json!({ "value": "2", "unit": "sack" });
    let first_voice_sale = w.give(&maria, &sacks, &ben, Some(sack2.clone()));
    let tablet_sale = w.sign_with(&maria, &tablet, "transfer", json!({ "amount": sack2 }), json!({ "what": h(&sacks), "to_owner": ben.id, "after": [h(&t)] }));
    let o = w.own(&sacks);
    assert_eq!(draw(&o, &t)["state"], json!("landed"));
    assert_eq!(draw(&o, &first_voice_sale)["takes"], json!(true), "{o}");
    assert_eq!(draw(&o, &tablet_sale)["why"], json!("not_on_chain"), "{o}");
    assert!(o["draws"].as_array().unwrap().iter().all(|d| d["why"] != json!("pair")));
}

#[test]
fn a_line_held_only_as_a_header_is_not_shown() {
    let mut w = World::new();
    let harry = w.person(1);
    let maria = w.person(2);
    let sack = w.thing(&harry, "maize", Some(kg("1")));
    let note = w.sign(&harry, "observe", json!({ "kind": "note" }), json!({}));
    let sale = w.give(&harry, &sack, &maria, Some(kg("0.5")));
    let header = call("header", json!([note]));
    let blocks: Vec<Value> = w.blocks.iter().map(|b| if b["hash"] == note["hash"] { json!({ "header": header, "header_signature": note["signature"] }) } else { b.clone() }).collect();
    let o = call("ownership", json!([sack, blocks, null]));
    assert_eq!(o, json!({ "not_shown": true, "lacks": [h(&note)] }));
    let _ = sale;
}

#[test]
fn a_pot_counts_a_payout_signed_ahead_and_has_one_kind() {
    let mut w = World::new();
    let coop = w.person(7);
    let leila = w.person(5);
    let achieng = w.person(8);
    let gbp = |v: &str| json!({ "value": v, "unit": "GBP" });
    let head = w.sign(&coop, "promise", json!({ "what": "cover", "terms": { "backing": gbp("1000") } }), json!({ "from": coop.id }));
    let first = w.sign(&coop, "transfer", json!({ "amount": gbp("800") }), json!({ "for": h(&head), "to_owner": leila.id }));
    let second = w.sign(&coop, "transfer", json!({ "amount": gbp("800") }), json!({ "for": h(&head), "to_owner": achieng.id }));
    let p = call("pot", json!([head, w.blocks, null]));
    assert_eq!((p["held"]["value"].clone(), p["left"]["value"].clone(), p["kind"].clone()), (json!("800"), json!("200"), json!({ "unit": "GBP", "of": null })));
    let row = |p: &Value, b: &Value| p["payouts"].as_array().unwrap().iter().find(|r| r["block"] == b["hash"]).cloned().unwrap();
    assert_eq!(row(&p, &first)["state"], json!("held"));
    assert_eq!(row(&p, &second)["why"], json!("past"));
    w.yes(&leila, &first, json!({}));
    let p = call("pot", json!([head, w.blocks, null]));
    assert_eq!((p["paid_out"]["value"].clone(), p["held"]["value"].clone()), (json!("800"), json!("0")));
    // with no backing and pay-ins of two kinds, it has no kind and pays nothing out
    let mut w2 = World::new();
    let holder = w2.person(7);
    let a = w2.person(5);
    let b = w2.person(8);
    let head2 = w2.sign(&holder, "promise", json!({ "what": "pool" }), json!({ "from": holder.id }));
    for (who, amount) in [(&a, gbp("10")), (&b, json!({ "value": "500", "unit": "KES" }))] {
        let t = w2.sign(who, "transfer", json!({ "amount": amount }), json!({ "for": h(&head2), "to_owner": holder.id }));
        w2.yes(&holder, &t, json!({}));
    }
    let out = w2.sign(&holder, "transfer", json!({ "amount": gbp("5") }), json!({ "for": h(&head2), "to_owner": a.id }));
    let p = call("pot", json!([head2, w2.blocks, null]));
    assert_eq!(p["kind"], json!(null));
    assert_eq!(row(&p, &out)["why"], json!("unit"));
}

#[test]
fn a_loan_of_pounds_reaches_done_and_sums_are_exact() {
    let mut w = World::new();
    let sam = w.person(4);
    let maria = w.person(2);
    let gbp = |v: &str| json!({ "value": v, "unit": "GBP" });
    let offer = w.sign(&sam, "promise", json!({ "terms": { "lines": [{ "id": "loan", "quantity": gbp("100"), "price": gbp("110") }] } }), json!({ "from": sam.id, "to": maria.id }));
    w.sign(&maria, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&offer), "for": h(&offer) }));
    let stage = |w: &World| call("promise_stage", json!([offer, w.blocks, {}]));
    let s = stage(&w);
    assert_eq!((s["stage"].clone(), s["uncovered"].clone()), (json!("accepted"), json!({ "from": [], "to": null })));
    let lent = w.sign(&sam, "transfer", json!({ "amount": gbp("100") }), json!({ "for": h(&offer), "to_owner": maria.id }));
    assert_eq!(stage(&w)["unanswered"], json!([h(&lent)]));
    w.yes(&maria, &lent, json!({}));
    let s = stage(&w);
    assert_eq!((s["stage"].clone(), s["lines"][0]["moved"]["value"].clone()), (json!("underway"), json!("100")));
    let back = w.sign(&maria, "transfer", json!({ "amount": gbp("110") }), json!({ "for": h(&offer), "to_owner": sam.id }));
    w.yes(&sam, &back, json!({}));
    let s = stage(&w);
    assert_eq!((s["stage"].clone(), s["paid"].clone(), s["total"].clone()), (json!("done"), gbp("110"), gbp("110")));
    // a toll in kind, and a price per unit in bitcoin: exact
    let flour = kind("flour");
    let toll = json!({ "lines": [{ "id": "toll", "price": { "amount": { "value": "1", "unit": "kg", "of": flour }, "per": kg("10") }, "quantity": kg("93") }] });
    assert_eq!(call("terms_total", json!([toll, null])), json!({ "value": "9.3", "unit": "kg", "of": flour }));
    let btc = json!({ "lines": [{ "id": "fee", "price": { "amount": { "value": "0.00000001", "unit": "BTC" }, "per": kg("1") }, "quantity": kg("3") }] });
    assert_eq!(call("terms_total", json!([btc, null])), json!({ "value": "0.00000003", "unit": "BTC" }));
    // lines of two kinds have no total
    let mixed = json!({ "lines": [{ "id": "a", "price": gbp("1") }, { "id": "b", "price": { "value": "2", "unit": "egg" } }] });
    assert_eq!(call("terms_total", json!([mixed, null])), json!(null));
}

#[test]
fn a_basic_phones_received_word_counts_toward_the_price() {
    let mut w = World::new();
    let shop = w.person(9);
    let mama = w.person(10);
    let kes = |v: &str| json!({ "value": v, "unit": "KES" });
    let offer = w.sign(&shop, "promise", json!({ "what": "work", "terms": { "lines": [{ "id": "work", "price": kes("100") }] } }), json!({ "from": mama.id, "to": shop.id }));
    w.sign(&mama, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&offer), "for": h(&offer) }));
    // her own word that this much came: it has no status and accepts nothing
    w.sign(&mama, "observe", json!({ "kind": "received", "amount": kes("100") }), json!({ "for": h(&offer) }));
    let s = call("promise_stage", json!([offer, w.blocks, {}]));
    assert_eq!(s["paid"], kes("100"));
}
