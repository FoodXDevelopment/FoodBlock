//! FoodBlock 1.9, stage 5: deals (changes-1.9/05-deals.md). Each rule's story as a fixed world, asked through the door, with the text's
//! answer. Where the world needs bytes the story does not spell (an accept's `for`, a clock's receipt), the test adds them and says so.
//! Where the text was silent and this build chose, the test names the item of `changes-1.9/stage5-rust-silent.md` it pins.
use foodblock::door::answer;
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{keypair_from_seed, write, ComposeOptions, Keypair, Readers, WriteOptions};
use serde_json::{json, Value};

fn call(op: &str, args: Value) -> Value {
    let out = answer(op.as_bytes(), args.to_string().as_bytes());
    record(std::thread::current().name().unwrap_or("main"), op, &args, &out);
    out.get("ok").cloned().unwrap_or_else(|| panic!("{op}: {out}"))
}
/// With `FB_RECORD` set to a directory, every door question a story asks is written there (one file per test), so the oracle is asked the
/// same questions (spec/oracle/stage5/rust-stories.cjs).
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
fn kes(v: &str) -> Value {
    amt(v, "KES")
}
fn sack(n: &str) -> Value {
    amt(n, "sack")
}
fn per(price: Value, unit: &str) -> Value {
    json!({ "amount": price, "per": amt("1", unit) })
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
    /// Signs with `key` as `p`, at `at` (None: the next minute; Some(None): no `at` at all), against `held`.
    fn sign_full(&mut self, p: &Person, key: &Keypair, t: &str, state: Value, refs: Value, at: Option<Option<String>>, held: Option<Vec<Value>>) -> Value {
        let at = match at {
            None => Some(self.at()),
            Some(a) => a,
        };
        let clockless = at.is_none();
        let held = held.unwrap_or_else(|| self.blocks.clone());
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at, clockless, audience: Some(Readers::Public), ..Default::default() },
            key: Some(key),
            held: &held,
            schemas: None,
        };
        let b = write(t, &state, &refs, &o).unwrap_or_else(|e| panic!("{t} {state} {refs}: {e:?}"));
        self.blocks.push(b.clone());
        b
    }
    fn sign(&mut self, p: &Person, t: &str, state: Value, refs: Value) -> Value {
        let k = p.keys.clone();
        self.sign_full(p, &k, t, state, refs, None, None)
    }
    fn sign_at(&mut self, p: &Person, t: &str, state: Value, refs: Value, at: &str) -> Value {
        let k = p.keys.clone();
        self.sign_full(p, &k, t, state, refs, Some(Some(at.to_string())), None)
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
    fn receipt(&mut self, clock: &Person, of: &[&Value]) -> Value {
        let ids = sorted(of.iter().map(|b| h(b)).collect());
        self.sign(clock, "observe", json!({ "kind": "receipt" }), json!({ "derives_from": ids }))
    }
    /// An offer of `what` (an instance, or a kind's id) from `from` to `to`.
    fn offer(&mut self, from: &Person, what: &str, to: &Person, terms: Value) -> Value {
        self.sign(from, "promise", json!({ "terms": terms }), json!({ "what": what, "from": from.id, "to": to.id }))
    }
    fn accept(&mut self, p: &Person, offer: &Value) -> Value {
        self.sign(p, "promise", json!({ "status": "accepted" }), json!({ "answers": h(offer), "for": h(offer) }))
    }
    fn accept_at(&mut self, p: &Person, offer: &Value, at: Option<&str>) -> Value {
        let k = p.keys.clone();
        self.sign_full(p, &k, "promise", json!({ "status": "accepted" }), json!({ "answers": h(offer), "for": h(offer) }), Some(at.map(String::from)), None)
    }
    fn stop_onward(&mut self, p: &Person, first: &Value) -> Value {
        self.sign(p, "promise", json!({ "status": "stopped", "stop": "onward" }), json!({ "answers": h(first), "for": h(first) }))
    }
    fn stop_own(&mut self, p: &Person, first: &Value, stop: &str) -> Value {
        self.sign(p, "promise", json!({ "status": "stopped", "stop": stop }), json!({ "updates": h(first) }))
    }
    fn pay(&mut self, payer: &Person, payee: &Person, deal: &Value, amount: Value) -> Value {
        self.sign(payer, "transfer", json!({ "amount": amount }), json!({ "to_owner": payee.id, "for": h(deal) }))
    }
    fn deliver(&mut self, from: &Person, thing: &Value, to: &Person, deal: &Value, amount: Option<Value>) -> Value {
        let state = amount.map_or(json!({}), |a| json!({ "amount": a }));
        self.sign(from, "transfer", state, json!({ "what": h(thing), "to_owner": to.id, "for": h(deal) }))
    }
    /// A judge's ruling on a deal awarding to a person (`awards: [{ to }]`), or nothing.
    fn ruling(&mut self, judge: &Person, deal: &Value, to: Option<&Person>, after: &[&Value]) -> Value {
        let awards = to.map_or(json!([]), |p| json!([{ "to": p.id }]));
        let mut refs = json!({ "subject": h(deal) });
        if !after.is_empty() {
            refs["after"] = json!(sorted(after.iter().map(|b| h(b)).collect()));
        }
        self.sign(judge, "observe", json!({ "kind": "ruling", "awards": awards }), refs)
    }
    fn own(&self, thing: &Value) -> Value {
        call("ownership", json!([thing, self.blocks, null]))
    }
    fn stage(&self, first: &Value) -> Value {
        call("promise_stage", json!([first, self.blocks, {}]))
    }
    fn view(&self, first: &Value, now: &str) -> Value {
        call("promise_view", json!([first, self.blocks, { "now": now }]))
    }
    fn stands(&self, b: &Value) -> Value {
        call("stands", json!([b, self.blocks]))
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
fn owns(o: &Value, p: &Person) -> Option<Value> {
    o["owners"].as_array().and_then(|a| a.iter().find(|x| x["owner"] == json!(p.id)).map(|x| x["amount"].clone()))
}

const TUE: &str = "2026-11-17T09:00:00.000Z";
const THU: &str = "2026-11-19T12:00:00.000Z";
const FRI: &str = "2026-11-20T12:00:00.000Z";

// ---------------------------------------------------------------------------------------------------------------------------------------
// 1. Amara's flour (the 1.8 story, retold)
// ---------------------------------------------------------------------------------------------------------------------------------------

// (1) Sam offers Amara 50 kg flour F at £60, `expires` Friday, `clocks` the market's clock K. (2) Amara accepts; K receipts it before any
// cutoff: accepted. (3) PayLink `received` £60, naming Sam's account word and its place. (4) Sam delivers F; Amara accepts: done. (5) Amara
// sells 20 kg to Leila. (6) PayLink `defeats` its own word. Expect done; 20 kg Leila's, 30 kg Amara's.
#[test]
fn s1_amaras_flour() {
    let mut w = World::new();
    let sam = w.person(30);
    let amara = w.person(3);
    let k = w.person(20);
    let paylink = w.person(21);
    let leila = w.person(5);
    let aw = w.sign(&sam, "observe", json!({ "kind": "account", "destinations": [{ "destination": "paylink 4471", "by": paylink.id }] }), json!({}));
    let f = w.thing(&sam, "flour", amt("50", "kg"));
    let s1 = w.offer(&sam, &h(&f), &amara, json!({ "price": gbp("60"), "expires": FRI, "clocks": clocks(&[&k], 1) }));
    let a1 = w.accept_at(&amara, &s1, Some(TUE));
    w.receipt(&k, &[&a1]);
    assert_eq!(w.stage(&s1)["stage"], json!("accepted"), "{}", w.stage(&s1));
    let p1 = w.sign(&paylink, "observe", json!({ "kind": "received", "amount": gbp("60"), "destination": "paylink 4471" }), json!({ "for": h(&s1), "derives_from": [h(&aw)] }));
    let s2 = w.deliver(&sam, &f, &amara, &s1, None);
    w.yes(&amara, &s2);
    assert_eq!(w.stage(&s1)["stage"], json!("done"), "{}", w.stage(&s1));
    let a4 = w.sign(&amara, "transfer", json!({ "amount": amt("20", "kg") }), json!({ "what": h(&f), "to_owner": leila.id }));
    w.yes(&leila, &a4);
    w.sign(&paylink, "observe", json!({ "kind": "note" }), json!({ "defeats": [h(&p1)] }));
    assert_eq!(w.stage(&s1)["stage"], json!("done"), "{}", w.stage(&s1));
    let o = w.own(&f);
    assert_eq!(owns(&o, &leila), Some(amt("20", "kg")), "{o}");
    assert_eq!(owns(&o, &amara), Some(amt("30", "kg")), "{o}");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 2. What a promise is
// ---------------------------------------------------------------------------------------------------------------------------------------

// T1. An offer that names an instance holds it (`gives`: L7 to Amara, held); one that names only a kind holds nothing.
#[test]
fn t1_what_a_promise_is() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let bob = w.person(6);
    let l7 = w.thing(&harry, "maize", sack("10"));
    let h1 = w.offer(&harry, &h(&l7), &amara, json!({ "price": gbp("60") }));
    let g = call("gives", json!([h1, harry.id, w.blocks]));
    assert_eq!(g["gives"], json!([{ "what": h(&l7), "to": amara.id, "back": null, "held": true }]), "{g}");
    let h2 = w.offer(&harry, &kind("maize"), &bob, json!({ "quantity": sack("10"), "price": gbp("60") }));
    let g = call("gives", json!([h2, harry.id, w.blocks]));
    assert!(g["gives"].as_array().unwrap().iter().all(|l| l["held"] == json!(false)), "nothing held: {g}");
}

// T2. Title passes where the owner's draw lands: Harry's sack X to Amara `for` her order on `{ paid: deal }` (a named reading the core does
// not run) is held, Harry's draw; Amara is not its owner. SILENT 4 (a named reading with no rule set).
#[test]
fn t2_when_title_passes() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let x = w.thing(&harry, "sack", sack("1"));
    let order = w.sign(&amara, "promise", json!({ "terms": { "price": gbp("60") } }), json!({ "what": h(&x), "from": harry.id, "to": amara.id }));
    w.accept(&harry, &order);
    let t = w.sign(&harry, "transfer", json!({ "condition": { "paid": h(&order) } }), json!({ "what": h(&x), "to_owner": amara.id, "for": h(&order) }));
    w.yes(&amara, &t);
    let o = w.own(&x);
    assert_eq!(draw_of(&o, &t)["state"], json!("held"), "{o}");
    assert_ne!(o["owner"], json!(amara.id), "{o}");
}

// T4. A ruling, and finality: Ruth, a judge both sides named, defeats the delivery Maria accepted, a year later: the deal's stage falls;
// F stays Leila's (a ruling reaches a draw only where it stands in that draw's causal past). SILENT 10 (the stage it falls to).
#[test]
fn t4_a_ruling_and_finality() {
    let mut w = World::new();
    let sam = w.person(30);
    let maria = w.person(2);
    let leila = w.person(5);
    let ruth = w.person(22);
    let f = w.thing(&sam, "flour", amt("10", "kg"));
    let deal = w.offer(&sam, &h(&f), &maria, json!({ "price": gbp("60") }));
    w.accept(&maria, &deal);
    let named = w.sign(&sam, "grant", json!({ "kind": "referee" }), json!({ "to": ruth.id, "subject": h(&deal) }));
    w.sign(&maria, "grant", json!({ "status": "accepted" }), json!({ "answers": h(&named) }));
    let d = w.deliver(&sam, &f, &maria, &deal, None);
    w.yes(&maria, &d);
    let p = w.pay(&maria, &sam, &deal, gbp("60"));
    w.yes(&sam, &p);
    assert_eq!(w.stage(&deal)["stage"], json!("done"));
    let sale = w.sign(&maria, "transfer", json!({}), json!({ "what": h(&f), "to_owner": leila.id }));
    w.yes(&leila, &sale);
    w.sign(&ruth, "observe", json!({ "kind": "ruling" }), json!({ "defeats": [h(&d)] }));
    let s = w.stage(&deal);
    assert_eq!(s["stage"], json!("underway"), "the delivery no longer counts; the payment still does: {s}");
    assert_eq!(w.own(&f)["owner"], json!(leila.id));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 3. Holds, and their release
// ---------------------------------------------------------------------------------------------------------------------------------------

// R-H1. A promise naming a thing he owns holds it from his own word: H2 (offer of L7 to Amara) held; H3 (L7 to Bob) past.
#[test]
fn r_h1_an_offer_holds_from_his_word() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let bob = w.person(6);
    let l7 = w.thing(&harry, "maize", sack("10"));
    let h2 = w.offer(&harry, &h(&l7), &amara, json!({ "price": gbp("60") }));
    let b1 = w.sign(&bob, "promise", json!({ "terms": { "price": gbp("60") } }), json!({ "what": h(&l7), "from": harry.id, "to": bob.id }));
    // his transfer `for` Bob's order is his yes and his delivery in one block: it states `covers` (R-P5)
    let h3 = w.sign(&harry, "transfer", json!({ "covers": gbp("0") }), json!({ "what": h(&l7), "to_owner": bob.id, "for": h(&b1) }));
    w.yes(&bob, &h3);
    let o = w.own(&l7);
    assert_eq!(draw_of(&o, &h2)["state"], json!("held"), "{o}");
    assert_eq!(draw_of(&o, &h3)["why"], json!("past"), "{o}");
}

// R-H2. It lands or frees by the rule that says whether her yes binds: an accept dated after `expires` (no clock) leaves the deal offered,
// with that accept a request open on *when*; L7 stays held; Harry's decline of it frees L7. SILENT 7 (the request's spelling).
#[test]
fn r_h2_lands_or_frees_as_her_yes_binds() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let l7 = w.thing(&harry, "maize", sack("10"));
    let h2 = w.offer(&harry, &h(&l7), &amara, json!({ "price": gbp("60"), "expires": THU }));
    let a1 = w.accept_at(&amara, &h2, Some(FRI));
    let s = w.stage(&h2);
    assert_eq!(s["stage"], json!("offered"), "{s}");
    assert_eq!(s["requests"], json!([{ "block": h(&a1), "open": ["when"] }]), "{s}");
    let o = w.own(&l7);
    assert_eq!(draw_of(&o, &h2)["state"], json!("held"), "{o}");
    w.sign(&harry, "promise", json!({ "status": "declined" }), json!({ "answers": h(&a1), "for": h(&h2) }));
    let o = w.own(&l7);
    assert_eq!(draw_of(&o, &h2)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(harry.id));
    let s = w.stage(&h2);
    assert!(!matches!(s["stage"].as_str(), Some("accepted" | "underway" | "done")), "no deal beside freed: {s}");
}

// R-H3. Her "no" frees what is kept for her, until it is hers: Joe's stop after her yes frees nothing; her decline frees X.
#[test]
fn r_h3_her_no_frees() {
    let mut w = World::new();
    let joe = w.person(11);
    let amara = w.person(3);
    let wanjiru = w.person(8);
    let leila = w.person(5);
    let x = w.thing(&joe, "box", amt("1", "box"));
    let cond = json!({ "without": { "signal": "arrived", "by": [joe.id] }, "deadline": "2026-11-20T07:00:00.000Z", "clocks": clocks(&[&wanjiru, &leila], 2) });
    let j1 = w.sign(&joe, "transfer", json!({ "condition": cond }), json!({ "what": h(&x), "to_owner": amara.id }));
    w.yes(&amara, &j1);
    w.sign(&joe, "transfer", json!({ "status": "stopped", "stop": "before" }), json!({ "updates": h(&j1) }));
    assert_eq!(draw_of(&w.own(&x), &j1)["state"], json!("held"), "his end, her yes in its past: {}", w.own(&x));
    w.no(&amara, &j1);
    let o = w.own(&x);
    assert_eq!(draw_of(&o, &j1)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(joe.id));

    // World B, the clock path (stage 5 compare): Harry's offer names a clock K; Amara accepts; Harry stops the offer, not having seen her yes.
    // K receipts his stop, then her yes: the line that reads no holds the end with no yes before it: freed. K receipting her yes first: held.
    for end_first in [true, false] {
        let mut w = World::new();
        let harry = w.person(1);
        let amara = w.person(3);
        let k = w.person(20);
        let l7 = w.thing(&harry, "maize", sack("10"));
        let h2 = w.offer(&harry, &h(&l7), &amara, json!({ "price": gbp("60"), "clocks": clocks(&[&k], 1) }));
        let a1 = w.accept(&amara, &h2);
        let s = w.stop_own(&harry, &h2, "before");
        let (first, second) = if end_first { (&s, &a1) } else { (&a1, &s) };
        let r1 = w.receipt(&k, &[first]);
        w.sign(&k, "observe", json!({ "kind": "receipt" }), json!({ "derives_from": [h(second)], "after": [h(&r1)] }));
        let o = w.own(&l7);
        assert_eq!(draw_of(&o, &h2)["state"], json!(if end_first { "freed" } else { "held" }), "{o}");
    }
}

// R-H4. A cash quote accepted and never paid: his end frees L7; World B, a payment he accepted before his end keeps L7 held for Bob.
#[test]
fn r_h4_a_cash_quote() {
    for paid in [false, true] {
        let mut w = World::new();
        let harry = w.person(1);
        let bob = w.person(6);
        let l7 = w.thing(&harry, "maize", sack("10"));
        let h2 = w.offer(&harry, &h(&l7), &bob, json!({ "price": gbp("60"), "waits_on": "price" }));
        let b1 = w.accept(&bob, &h2);
        let mut after = vec![h(&b1)];
        if paid {
            let b2 = w.pay(&bob, &harry, &h2, gbp("20"));
            let h2b = w.yes(&harry, &b2);
            after = vec![h(&h2b)];
        }
        w.sign(&harry, "promise", json!({ "status": "stopped", "stop": "before" }), json!({ "updates": h(&h2), "after": after }));
        let o = w.own(&l7);
        if paid {
            assert_eq!(draw_of(&o, &h2)["state"], json!("held"), "{o}");
        } else {
            assert_eq!(draw_of(&o, &h2)["state"], json!("freed"), "{o}");
            assert_eq!(o["owner"], json!(harry.id));
        }
    }
}

// R-H5. A dead condition frees what it held: a bonus sack on a bare `reading` is never held; Harry's from his word.
#[test]
fn r_h5_a_dead_condition() {
    let mut w = World::new();
    let harry = w.person(1);
    let leila = w.person(5);
    let silo = w.thing(&harry, "silo", amt("1", "silo"));
    let s = w.thing(&harry, "sack", sack("1"));
    let cond = json!({ "reading": h(&silo), "kind": "humidity", "op": "lt", "value": amt("14", "pct"), "over": "PT1H" });
    let h1 = w.sign(&harry, "transfer", json!({ "condition": cond }), json!({ "what": h(&s), "to_owner": leila.id }));
    w.yes(&leila, &h1);
    let o = w.own(&s);
    assert_ne!(draw_of(&o, &h1)["state"], json!("held"), "{o}");
    assert_eq!(o["owner"], json!(harry.id), "{o}");
}

/// R-H6's world: Leila's grant G to her tool T (on O, limit £210, parties Harry, her tool's own meter); Harry's offer O to Leila of 10 sacks at
/// £21 (`deliver_by` Friday on Wanjiru's clock W); T accepts O under G; Harry delivers 6; T accepts; T pays £126; Harry accepts.
struct Rest {
    w: World,
    leila: Person,
    harry: Person,
    wanjiru: Person,
    offer: Value,
    g: Value,
}
fn rest_of_a_deal(deliver_by: bool) -> Rest {
    let mut w = World::new();
    let leila = w.person(5);
    let tool = w.person(23);
    let harry = w.person(1);
    let wanjiru = w.person(8);
    let maize = kind("maize");
    let mut terms = json!({ "quantity": sack("10"), "price": per(gbp("21"), "sack") });
    if deliver_by {
        terms["deliver_by"] = json!(FRI);
        terms["clocks"] = clocks(&[&wanjiru], 1);
    }
    let offer = w.sign(&harry, "promise", json!({ "terms": terms }), json!({ "from": harry.id, "to": leila.id, "what": maize }));
    let g = w.sign(&leila, "grant", json!({ "kind": "agent", "scope": { "types": ["observe", "promise", "transfer"], "on": [h(&offer)], "parties": [harry.id], "limit": gbp("210") } }), json!({ "to": tool.id, "meter": tool.id }));
    let a = w.sign(&tool, "promise", json!({ "status": "accepted", "draws": { "grant": h(&g), "amount": gbp("210") } }), json!({ "answers": h(&offer), "for": h(&offer), "under": h(&g) }));
    assert_eq!(call("under_ok", json!([a, w.blocks])), json!(true), "{}", call("why_not_under", json!([a, w.blocks, null])));
    let d = w.sign(&harry, "transfer", json!({ "amount": sack("6") }), json!({ "to_owner": leila.id, "for": h(&offer), "after": [h(&a)] }));
    w.sign(&tool, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&d), "under": h(&g) }));
    let p = w.sign(&tool, "transfer", json!({ "amount": gbp("126") }), json!({ "to_owner": harry.id, "for": h(&offer), "under": h(&g), "after": [h(&d)] }));
    w.yes(&harry, &p);
    Rest { w, leila, harry, wanjiru, offer, g }
}

// R-H6. A deal that stops short: her stop alone ends none of the rest (£84 still held on G's line); the end of `deliver_by` on the deal's
// clock does (£84 back). World B: no `deliver_by`; the payee's signal that the price is paid ends the rest.
#[test]
fn r_h6_a_deal_that_stops_short() {
    let money_left = |r: &Rest| -> Value {
        let m = call("meter", json!([r.g, r.w.blocks, null]));
        m["left"].as_array().unwrap().iter().find(|l| l["of"] == r.g["hash"]).map(|l| l["amount"].clone()).unwrap_or_else(|| panic!("{m}"))
    };
    let mut r = rest_of_a_deal(true);
    let (leila, offer) = (r.leila.clone(), r.offer.clone());
    r.w.stop_onward(&leila, &offer);
    let s = r.w.stage(&r.offer);
    assert_eq!((s["stage"].clone(), s["stop"].clone(), s["by"].clone()), (json!("stopped"), json!("onward"), json!("to")), "{s}");
    assert_eq!(money_left(&r), gbp("0"), "her stop alone frees none of the £84 still held");
    let wj = r.wanjiru.clone();
    r.w.sign_at(&wj, "observe", json!({ "kind": "cutoff", "when": FRI }), json!({ "subject": h(&offer) }), "2026-11-21T00:00:00.000Z");
    assert_eq!(money_left(&r), gbp("84"), "the rest can no longer fall due: £84 back");

    let mut r = rest_of_a_deal(false);
    let (harry, offer) = (r.harry.clone(), r.offer.clone());
    assert_eq!(money_left(&r), gbp("0"));
    r.w.sign(&harry, "observe", json!({ "kind": "paid" }), json!({ "subject": h(&offer) }));
    assert_eq!(money_left(&r), gbp("84"), "£84 back at Harry's signal");
}

// R-H7. A will: Harry's mill to Leila on `{ closed: Harry }` holds nothing in life (her accept is a request); his later sale to Sam goes
// through; at his close the will takes nothing. World B: no sale: at the close the will takes, Leila's. World C: he ends the will before
// the close: it takes nothing; the mill stays shown his.
#[test]
fn r_h7_a_will() {
    let mut w = World::new();
    let harry = w.person(1);
    let leila = w.person(5);
    let sam = w.person(30);
    let x = w.thing(&harry, "mill", amt("1", "mill"));
    let h1 = w.sign(&harry, "transfer", json!({ "condition": { "closed": harry.id } }), json!({ "what": h(&x), "to_owner": leila.id }));
    w.yes(&leila, &h1);
    let o = w.own(&x);
    assert_eq!(o["owner"], json!(harry.id), "a will holds nothing while he can sign: {o}");
    assert!(o["draws"].as_array().unwrap().iter().all(|d| d["block"] != h1["hash"]), "{o}");
    let h2 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&x), "to_owner": sam.id }));
    let sam_yes = w.yes(&sam, &h2);
    assert_eq!(w.own(&x)["owner"], json!(sam.id));
    // his close has Sam's yes in its past: what another had already accepted stands as signed (3d-15)
    w.close(&harry, &[&sam_yes]);
    let o = w.own(&x);
    assert_eq!(o["owner"], json!(sam.id), "{o}");
    assert_ne!(draw_of(&o, &h1)["state"], json!("landed"), "the will whose thing is gone takes nothing: {o}");

    // World B
    let mut w = World::new();
    let harry = w.person(1);
    let leila = w.person(5);
    let x = w.thing(&harry, "mill", amt("1", "mill"));
    let h1 = w.sign(&harry, "transfer", json!({ "condition": { "closed": harry.id } }), json!({ "what": h(&x), "to_owner": leila.id }));
    w.yes(&leila, &h1);
    let close = w.close(&harry, &[]);
    let o = w.own(&x);
    assert_eq!(o["owner"], json!(leila.id), "at the close her will takes: {o}");
    assert_eq!(call("condition_holds", json!([{ "closed": harry.id }, w.blocks, close])), json!(false), "read in the close's own past");
    assert_eq!(call("condition_holds", json!([{ "closed": harry.id }, w.blocks, null])), json!(true));

    // World C
    let mut w = World::new();
    let harry = w.person(1);
    let leila = w.person(5);
    let x = w.thing(&harry, "mill", amt("1", "mill"));
    let h1 = w.sign(&harry, "transfer", json!({ "condition": { "closed": harry.id } }), json!({ "what": h(&x), "to_owner": leila.id }));
    w.yes(&leila, &h1);
    w.sign(&harry, "transfer", json!({ "status": "stopped", "stop": "before" }), json!({ "updates": h(&h1) }));
    w.close(&harry, &[]);
    assert_eq!(w.own(&x)["owner"], json!(harry.id), "what she willed to no one stays shown hers: {}", w.own(&x));
}

/// R-H8's world: Ben's promise not to do (B1), Leila's accept, and his stake E on `{ ruled: B1, by: Jo, awards: Leila }` (B2), which Leila
/// accepts. `within`: the condition wrapped in a deadline on Wanjiru's clock.
fn bens_stake(w: &mut World, within: Option<&Person>) -> (Person, Person, Person, Value, Value, Value) {
    let ben = w.person(24);
    let leila = w.person(5);
    let jo = w.person(25);
    let b1 = w.sign(&ben, "promise", json!({ "what": "no work for a rival café", "terms": { "until": "2027-06-30T00:00:00.000Z" } }), json!({ "from": ben.id, "to": leila.id }));
    w.accept(&leila, &b1);
    let e = w.thing(&ben, "envelope", gbp("500"));
    let ruled = json!({ "ruled": h(&b1), "by": jo.id, "awards": leila.id });
    let cond = match within {
        Some(c) => json!({ "within": ruled, "deadline": "2027-08-31T00:00:00.000Z", "clocks": clocks(&[c], 1) }),
        None => ruled,
    };
    let b2 = w.sign(&ben, "transfer", json!({ "condition": cond }), json!({ "what": h(&e), "to_owner": leila.id, "for": h(&b1) }));
    w.yes(&leila, &b2);
    (ben, leila, jo, b1, e, b2)
}

// R-H8. A promise not to do, and its stake: Ben stops B1 onward on day 2; Jo rules for Leila: E lands with her, whatever stop came
// before. World B: Jo never rules: E held; Leila's decline of B2 frees it.
#[test]
fn r_h8_a_promise_not_to_do_and_its_stake() {
    let mut w = World::new();
    let (ben, leila, jo, b1, e, b2) = bens_stake(&mut w, None);
    w.stop_own(&ben, &b1, "onward");
    assert_eq!(w.stage(&b1)["stage"], json!("stopped"), "{}", w.stage(&b1));
    assert_eq!(draw_of(&w.own(&e), &b2)["state"], json!("held"));
    w.ruling(&jo, &b1, Some(&leila), &[]);
    let o = w.own(&e);
    assert_eq!(o["owner"], json!(leila.id), "{o}");

    let mut w = World::new();
    let (ben, leila, _, _, e, b2) = bens_stake(&mut w, None);
    assert_eq!(draw_of(&w.own(&e), &b2)["state"], json!("held"));
    w.no(&leila, &b2);
    let o = w.own(&e);
    assert_eq!(draw_of(&o, &b2)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(ben.id));
}

// R-H9. `ruled`, and its end: Jo's later ruling that has seen J1 ends J1 only for blocks that had not used it: Leila's hand-over to Sam
// used J1, so E is Sam's. World B: J2 before any block uses J1: E held. World C: `within` 31 August on Wanjiru's clock: her cutoff with no
// ruling frees E, Ben's. SILENT 5.
#[test]
fn r_h9_ruled_and_its_end() {
    let mut w = World::new();
    let (_, leila, jo, b1, e, _) = bens_stake(&mut w, None);
    let sam = w.person(30);
    let j1 = w.ruling(&jo, &b1, Some(&leila), &[]);
    let l5 = w.sign(&leila, "transfer", json!({}), json!({ "what": h(&e), "to_owner": sam.id, "after": [h(&j1)] }));
    w.yes(&sam, &l5);
    w.ruling(&jo, &b1, None, &[&j1]);
    assert_eq!(w.own(&e)["owner"], json!(sam.id), "{}", w.own(&e));

    let mut w = World::new();
    let (_, leila, jo, b1, e, b2) = bens_stake(&mut w, None);
    let j1 = w.ruling(&jo, &b1, Some(&leila), &[]);
    w.ruling(&jo, &b1, None, &[&j1]);
    assert_eq!(draw_of(&w.own(&e), &b2)["state"], json!("held"), "{}", w.own(&e));

    let mut w = World::new();
    let wanjiru = w.person(8);
    let (ben, _, _, _, e, b2) = bens_stake(&mut w, Some(&wanjiru));
    w.sign_at(&wanjiru, "observe", json!({ "kind": "cutoff", "when": "2027-08-31T00:00:00.000Z" }), json!({ "subject": h(&b2) }), "2027-09-01T00:00:00.000Z");
    let o = w.own(&e);
    assert_eq!(draw_of(&o, &b2)["state"], json!("freed"), "{o}");
    assert_eq!(o["owner"], json!(ben.id));
}

// R-H10. `elapsed`: Mo accepts the café's door rule (`until` 18:00): the view at 19:00 says elapsed; the stage is accepted.
#[test]
fn r_h10_elapsed() {
    let mut w = World::new();
    let cafe = w.person(26);
    let mo = w.person(27);
    let rule = w.sign(&cafe, "promise", json!({ "what": "no phones in the prep room until you leave", "terms": { "until": "2026-11-20T18:00:00.000Z" } }), json!({ "from": mo.id, "to": cafe.id }));
    w.accept(&mo, &rule);
    assert_eq!(w.stage(&rule)["stage"], json!("accepted"));
    assert_eq!(w.view(&rule, "2026-11-20T19:00:00.000Z")["stage"], json!("elapsed"));
    assert_eq!(w.view(&rule, "2026-11-20T17:00:00.000Z")["stage"], json!("accepted"));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 4. Answers and binding
// ---------------------------------------------------------------------------------------------------------------------------------------

// R-B1. *When*: an accept with no `at` after an `expires` with no clock is no yes: offered, a request open on *when*; F held; her end frees F.
#[test]
fn r_b1_when() {
    let mut w = World::new();
    let maria = w.person(2);
    let harry = w.person(1);
    let f = w.thing(&maria, "flour", amt("10", "kg"));
    let m1 = w.offer(&maria, &h(&f), &harry, json!({ "price": gbp("60"), "expires": "2026-06-12T00:00:00.000Z" }));
    let h1 = w.accept_at(&harry, &m1, None);
    let s = w.stage(&m1);
    assert_eq!(s["stage"], json!("offered"), "{s}");
    assert_eq!(s["requests"], json!([{ "block": h(&h1), "open": ["when"] }]), "{s}");
    assert_eq!(draw_of(&w.own(&f), &m1)["state"], json!("held"));
    w.stop_own(&maria, &m1, "before");
    let o = w.own(&f);
    assert_eq!(draw_of(&o, &m1)["state"], json!("freed"), "{o}");
}

// R-B2. One request is allocated once; an allocation is a draw: Ben's open offer of 2 trays, three allocations: the third is `past`,
// binds Ben and is over-allocated; its taker paid and nothing moved: `uncovered.to` is hers.
#[test]
fn r_b2_an_allocation_is_a_draw() {
    let mut w = World::new();
    let ben = w.person(24);
    let trays = w.thing(&ben, "tray", amt("2", "tray"));
    let open = w.sign(&ben, "promise", json!({ "terms": { "quantity": amt("2", "tray"), "price": per(gbp("5"), "tray") } }), json!({ "what": h(&trays), "from": ben.id }));
    let mut allocations = vec![];
    let mut takers = vec![];
    for seed in [40u8, 41, 42] {
        let t = w.person(seed);
        let r = w.sign(&t, "promise", json!({ "status": "accepted", "terms": { "quantity": amt("1", "tray") } }), json!({ "answers": h(&open), "for": h(&open) }));
        let a = w.sign(&ben, "promise", json!({ "status": "accepted", "terms": { "quantity": amt("1", "tray") } }), json!({ "answers": h(&r), "for": h(&open) }));
        allocations.push(a);
        takers.push(t);
    }
    let third = allocations[2].clone();
    let p = w.pay(&takers[2], &ben, &third, gbp("5"));
    w.yes(&ben, &p);
    let s = w.stage(&third);
    assert_eq!(s["over_allocated"], json!(true), "{s}");
    assert!(matches!(s["stage"].as_str(), Some("accepted" | "underway")), "it binds Ben: {s}");
    assert_eq!(s["uncovered"]["to"], gbp("5"), "{s}");
    assert_eq!(w.stage(&allocations[0])["over_allocated"], json!(false));
}

// R-B3. A decline ends a standing word for its signer: her later accept, with the decline in its past, binds nothing.
#[test]
fn r_b3_a_decline_ends_it_for_her() {
    let mut w = World::new();
    let harry = w.person(1);
    let maria = w.person(2);
    let l7 = w.thing(&harry, "maize", sack("10"));
    let h1 = w.offer(&harry, &h(&l7), &maria, json!({ "price": gbp("60") }));
    let d = w.sign(&maria, "promise", json!({ "status": "declined" }), json!({ "answers": h(&h1), "for": h(&h1) }));
    w.sign(&maria, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&h1), "for": h(&h1), "after": [h(&d)] }));
    assert_eq!(w.stage(&h1)["stage"], json!("declined"), "{}", w.stage(&h1));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 5. Paying
// ---------------------------------------------------------------------------------------------------------------------------------------

// R-P1. Paid only by the payee's word, or by the very thing named: Harry's own "credit" pays nothing; a part of Maria's issue he holds pays 5.
#[test]
fn r_p1_paid_by_her_word_or_the_very_thing() {
    let mut w = World::new();
    let maria = w.person(2);
    let harry = w.person(1);
    let k = w.sign(&maria, "thing", json!({ "kind": "bread credit" }), json!({}));
    let issue = w.sign(&maria, "thing", json!({ "kind": "bread credit", "pack": amt("100", "credit") }), json!({ "of": h(&k) }));
    let give = w.sign(&maria, "transfer", json!({ "amount": amt("10", "credit") }), json!({ "what": h(&issue), "to_owner": harry.id }));
    w.yes(&harry, &give);
    let loaves = w.thing(&maria, "loaf", amt("5", "loaf"));
    let m1 = w.sign(&maria, "promise", json!({ "terms": { "price": { "value": "5", "unit": "credit", "of": h(&issue) } } }), json!({ "what": h(&loaves), "from": maria.id, "to": harry.id }));
    w.accept(&harry, &m1);
    let mine = w.sign(&harry, "thing", json!({ "kind": "bread credit", "pack": amt("5", "credit") }), json!({ "of": h(&k) }));
    w.sign(&harry, "transfer", json!({ "amount": amt("5", "credit") }), json!({ "what": h(&mine), "to_owner": maria.id, "for": h(&m1) }));
    assert_eq!(w.stage(&m1)["paid"], Value::Null, "{}", w.stage(&m1));
    w.sign(&harry, "transfer", json!({ "amount": amt("5", "credit") }), json!({ "what": h(&issue), "to_owner": maria.id, "for": h(&m1) }));
    assert_eq!(w.stage(&m1)["paid"]["value"], json!("5"), "{}", w.stage(&m1));
}

// R-P2. One payment counted once: Mama's tablet accepts L2 and her phone's `received` answers it: paid 20.
#[test]
fn r_p2_one_payment_once() {
    let mut w = World::new();
    let leila = w.person(5);
    let mama = w.person(4);
    let goods = w.thing(&mama, "mandazi", amt("10", "piece"));
    let e1 = w.sign(&leila, "promise", json!({ "terms": { "price": kes("20") } }), json!({ "what": h(&goods), "from": mama.id, "to": leila.id }));
    w.accept(&mama, &e1);
    let l2 = w.pay(&leila, &mama, &e1, kes("20"));
    w.yes(&mama, &l2);
    w.sign(&mama, "observe", json!({ "kind": "received", "amount": kes("20") }), json!({ "for": h(&e1), "answers": h(&l2) }));
    assert_eq!(w.stage(&e1)["paid"], kes("20"), "{}", w.stage(&e1));
}

// R-P3. Multiply, never divide; the seller's `step`: 3 mandazi for KSh 10, step 1: two come to 7, paid with 7. World B: no step: 20/3,
// not paid by 7 until her word.
#[test]
fn r_p3_step() {
    for step in [true, false] {
        let mut w = World::new();
        let mama = w.person(4);
        let leila = w.person(5);
        let m = w.thing(&mama, "mandazi", amt("30", "piece"));
        let mut terms = json!({ "price": { "amount": kes("10"), "per": amt("3", "piece") }, "quantity": amt("2", "piece") });
        if step {
            terms["step"] = kes("1");
        }
        let m1 = w.offer(&mama, &h(&m), &leila, terms);
        w.accept(&leila, &m1);
        let p = w.pay(&leila, &mama, &m1, kes("7"));
        w.yes(&mama, &p);
        let s = w.stage(&m1);
        if step {
            assert_eq!(s["total"], kes("7"), "{s}");
        } else {
            assert_eq!(s["total"], kes("20/3"), "{s}");
            assert_ne!(s["stage"], json!("done"), "{s}");
        }
    }
}

// R-P4. The heap: an order `in_hand` counts Mama's 2 kg toward what moved; World B, with no term, what came is what Harry says came.
#[test]
fn r_p4_in_hand() {
    let mut w = World::new();
    let mama = w.person(4);
    let leila = w.person(5);
    let e1 = w.sign(&leila, "promise", json!({ "terms": { "quantity": amt("2", "kg"), "in_hand": true } }), json!({ "from": mama.id, "to": leila.id }));
    w.accept(&mama, &e1);
    w.sign(&mama, "transfer", json!({ "amount": amt("2", "kg") }), json!({ "to_owner": leila.id, "for": h(&e1) }));
    assert_eq!(w.stage(&e1)["lines"][0]["moved"], amt("2", "kg"), "{}", w.stage(&e1));
    let mut w = World::new();
    let harry = w.person(1);
    let sam = w.person(30);
    let h1 = w.sign(&harry, "promise", json!({ "terms": { "quantity": sack("40") } }), json!({ "from": sam.id, "to": harry.id }));
    w.accept(&sam, &h1);
    w.sign(&sam, "transfer", json!({ "amount": sack("40") }), json!({ "to_owner": harry.id, "for": h(&h1) }));
    w.sign(&harry, "observe", json!({ "kind": "received", "amount": sack("36") }), json!({ "for": h(&h1) }));
    assert_eq!(w.stage(&h1)["lines"][0]["moved"], sack("36"), "{}", w.stage(&h1));
}

// R-P5. A spot exchange: the buyer's order, then the seller's transfer `for` it with `covers` the whole price: done at his block; X Leila's.
// World B: `covers` 0: accepted, the price to come.
#[test]
fn r_p5_a_spot_exchange() {
    for covers in ["50", "0"] {
        let mut w = World::new();
        let leila = w.person(5);
        let mama = w.person(4);
        let x = w.thing(&mama, "loaf", amt("1", "loaf"));
        let e1 = w.sign(&leila, "promise", json!({ "terms": { "price": kes("50") } }), json!({ "what": h(&x), "from": mama.id, "to": leila.id }));
        w.sign(&mama, "transfer", json!({ "covers": kes(covers) }), json!({ "what": h(&x), "to_owner": leila.id, "for": h(&e1) }));
        let s = w.stage(&e1);
        assert_eq!(w.own(&x)["owner"], json!(leila.id), "{}", w.own(&x));
        if covers == "50" {
            assert_eq!(s["stage"], json!("done"), "{s}");
        } else {
            assert!(matches!(s["stage"].as_str(), Some("accepted" | "underway")), "{s}");
            assert_ne!(s["stage"], json!("done"), "{s}");
        }
    }
}

// R-P6. `waits_on: price`: Sam's till delivers with no signal of his in its past: not due; after his signal `paid`, due.
#[test]
fn r_p6_waits_on_and_due() {
    let mut w = World::new();
    let sam = w.person(30);
    let amara = w.person(3);
    let till = w.person(28);
    let f = w.thing(&sam, "flour", amt("50", "kg"));
    let offer = w.offer(&sam, &h(&f), &amara, json!({ "price": gbp("60"), "waits_on": "price" }));
    let g = w.sign(&sam, "grant", json!({ "kind": "till", "scope": { "types": ["transfer"], "on": [h(&offer)] } }), json!({ "to": till.id, "what": h(&f), "meter": till.id }));
    let a1 = w.accept(&amara, &offer);
    let t1 = w.sign(&till, "transfer", json!({}), json!({ "what": h(&f), "to_owner": amara.id, "for": h(&offer), "under": h(&g), "after": [h(&a1)] }));
    let why = call("why_not_under", json!([t1, w.blocks, null]));
    assert_eq!(why[0]["code"], json!("not_due"), "{why}");
    let s5 = w.sign(&sam, "observe", json!({ "kind": "paid" }), json!({ "subject": h(&offer) }));
    let t2 = w.sign(&till, "transfer", json!({}), json!({ "what": h(&f), "to_owner": amara.id, "for": h(&offer), "under": h(&g), "after": sorted(vec![h(&s5), h(&a1)]) }));
    let why = call("why_not_under", json!([t2, w.blocks, null]));
    assert!(why.as_array().unwrap().iter().all(|e| e["code"] != json!("not_due")), "{why}");
}

/// R-P7's job: Amara's job J at £12 an hour, its condition naming Ben's `work` signal (or no one); Ben accepts; Ben's work 40 h; Amara pays
/// £480; Ben accepts the payment.
fn job(named: bool) -> (World, Person, Value) {
    let mut w = World::new();
    let amara = w.person(3);
    let ben = w.person(24);
    let mut terms = json!({ "price": per(gbp("12"), "h") });
    if named {
        terms["condition"] = json!({ "signal": "work", "by": [ben.id], "subject": "" });
    }
    // the condition's subject is the job itself: the job is signed first, so the subject is left out (it names the signer alone)
    if let Some(c) = terms.get_mut("condition") {
        c.as_object_mut().unwrap().remove("subject");
    }
    let j = w.sign(&amara, "promise", json!({ "what": "picking", "terms": terms }), json!({ "from": ben.id, "to": amara.id }));
    w.accept(&ben, &j);
    let work = w.sign(&ben, "observe", json!({ "kind": "work", "amount": amt("40", "h") }), json!({ "for": h(&j) }));
    // her payment has his work in its causal past
    let p = w.sign(&amara, "transfer", json!({ "amount": gbp("480") }), json!({ "to_owner": ben.id, "for": h(&j), "after": [h(&work)] }));
    w.yes(&ben, &p);
    (w, ben, j)
}

// R-P7. Work, counted by whom the job names: Ben's own work counts where the job names his signal: paid 480, nothing uncovered. World B:
// the job names no one: her payment counts the work in its past; Ben's stop after it leaves nothing uncovered. SILENT 8.
#[test]
fn r_p7_work() {
    let (w, _, j) = job(true);
    let s = w.stage(&j);
    assert_eq!(s["paid"], gbp("480"), "{s}");
    assert_eq!(s["uncovered"]["to"], gbp("0"), "{s}");
    let (mut w, ben, j) = job(false);
    w.stop_onward(&ben, &j);
    let s = w.stage(&j);
    assert_eq!(s["stage"], json!("stopped"), "{s}");
    assert_eq!(s["uncovered"]["to"], gbp("0"), "{s}");
}

// R-P8. Paid for, never delivered: Amara pays £300 in full; nothing comes: underway, `uncovered.to` £300 at once.
#[test]
fn r_p8_paid_for_never_delivered() {
    let mut w = World::new();
    let amara = w.person(3);
    let sam = w.person(30);
    let f = w.thing(&sam, "flour", amt("50", "kg"));
    let o = w.offer(&sam, &h(&f), &amara, json!({ "price": gbp("300") }));
    w.accept(&amara, &o);
    let p = w.pay(&amara, &sam, &o, gbp("300"));
    w.yes(&sam, &p);
    let s = w.stage(&o);
    assert_eq!(s["stage"], json!("underway"), "{s}");
    assert_eq!(s["uncovered"]["to"], gbp("300"), "{s}");
}

// R-P9. The lost deposit stays inside one deal: Leila's own stop first: £20 the café's; the café's stop first: Leila's; one stop each,
// apart: not kept.
#[test]
fn r_p9_forfeit() {
    for world in ["leila", "cafe", "both"] {
        let mut w = World::new();
        let cafe = w.person(26);
        let leila = w.person(5);
        let c1 = w.sign(&cafe, "promise", json!({ "what": "a table, Friday 19:30", "terms": { "price": gbp("60"), "forfeit": gbp("20") } }), json!({ "from": cafe.id, "to": leila.id }));
        let a = w.accept(&leila, &c1);
        let p = w.pay(&leila, &cafe, &c1, gbp("20"));
        let y = w.yes(&cafe, &p);
        match world {
            "leila" => {
                w.stop_onward(&leila, &c1);
            }
            "cafe" => {
                w.stop_own(&cafe, &c1, "onward");
            }
            _ => {
                let held = w.blocks.clone();
                let k = leila.keys.clone();
                w.sign_full(&leila, &k, "promise", json!({ "status": "stopped", "stop": "onward" }), json!({ "answers": h(&c1), "for": h(&c1), "after": sorted(vec![h(&a), h(&y)]) }), None, Some(held.clone()));
                let k = cafe.keys.clone();
                w.sign_full(&cafe, &k, "promise", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": h(&c1) }), None, Some(held));
            }
        }
        let s = w.stage(&c1);
        let want = if world == "leila" { gbp("0") } else { gbp("20") };
        assert_eq!(s["uncovered"]["to"], want, "{world}: {s}");
    }
}

// R-P10. A receiving place handed on: Mama pays Harry after he handed his place to Wanjiru: paid 2,000, Harry shown keeping it for
// Wanjiru. World B: his second hand-over of the same place is `past`.
#[test]
fn r_p10_a_receiving_place_handed_on() {
    let mut w = World::new();
    let mama = w.person(4);
    let harry = w.person(1);
    let wanjiru = w.person(8);
    let sam = w.person(30);
    let flour = w.thing(&harry, "flour", amt("10", "kg"));
    let m1 = w.sign(&mama, "promise", json!({ "terms": { "price": kes("2000") } }), json!({ "what": h(&flour), "from": harry.id, "to": mama.id }));
    w.accept(&harry, &m1);
    let h2 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&m1), "to_owner": wanjiru.id, "for": h(&m1) }));
    w.yes(&wanjiru, &h2);
    let m2 = w.pay(&mama, &harry, &m1, kes("2000"));
    w.yes(&harry, &m2);
    let s = w.stage(&m1);
    assert_eq!(s["paid"], kes("2000"), "{s}");
    assert_eq!(s["to_come_on"], json!([{ "from": harry.id, "to": wanjiru.id, "amount": kes("2000"), "payment": h(&m2) }]), "{s}");
    let h3 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&m1), "to_owner": sam.id, "for": h(&m1) }));
    w.yes(&sam, &h3);
    let s = w.stage(&m1);
    let row = s["to_come"]["draws"].as_array().unwrap().iter().find(|d| d["block"] == h3["hash"]).cloned().unwrap_or_else(|| panic!("{s}"));
    assert_eq!(row["why"], json!("past"), "{s}");
    // the deleted outputs are gone
    for k in ["passed", "answerable", "owing", "owed", "owed_on"] {
        assert!(s.get(k).is_none(), "{k}: {s}");
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 6. Conditions
// ---------------------------------------------------------------------------------------------------------------------------------------

// R-C1. Read in the past of the block that relies on it: Joe's bond, no cutoff: X held at every reader, whatever its clock.
#[test]
fn r_c1_no_readers_clock() {
    let mut w = World::new();
    let joe = w.person(11);
    let amara = w.person(3);
    let wanjiru = w.person(8);
    let leila = w.person(5);
    let x = w.thing(&joe, "box", amt("1", "box"));
    let cond = json!({ "without": { "signal": "arrived", "by": [joe.id] }, "deadline": "2026-11-20T07:00:00.000Z", "clocks": clocks(&[&wanjiru, &leila], 2) });
    let j1 = w.sign(&joe, "transfer", json!({ "condition": cond }), json!({ "what": h(&x), "to_owner": amara.id }));
    w.yes(&amara, &j1);
    for now in [json!(null), json!("2027-01-01T00:00:00.000Z")] {
        let o = call("ownership", json!([x, w.blocks, now]));
        assert_eq!(draw_of(&o, &j1)["state"], json!("held"), "{now}: {o}");
    }
    assert_eq!(call("condition_holds", json!([cond, w.blocks, null])), json!(false));
}

// R-C2. `accepted`: Wanjiru's promise Y conditioned `{ accepted: X }` binds on Amara's accept, though X does not bind; nothing of Y is due
// until X binds. And the new shapes `stopped` and `closed` are read.
#[test]
fn r_c2_the_shapes() {
    let mut w = World::new();
    let wanjiru = w.person(8);
    let amara = w.person(3);
    let sam = w.person(30);
    let f = w.thing(&sam, "flour", amt("10", "kg"));
    let x = w.offer(&sam, &h(&f), &amara, json!({ "price": gbp("60") }));
    let eggs = w.thing(&wanjiru, "eggs", amt("12", "egg"));
    let y = w.offer(&wanjiru, &h(&eggs), &amara, json!({ "price": gbp("3"), "condition": { "accepted": h(&x) } }));
    w.accept(&amara, &y);
    assert_eq!(w.stage(&y)["stage"], json!("accepted"), "{}", w.stage(&y));
    assert_eq!(call("condition_holds", json!([{ "accepted": h(&x) }, w.blocks, null])), json!(false));
    // `{ stopped: X, side }`
    w.accept(&amara, &x);
    assert_eq!(call("condition_holds", json!([{ "stopped": h(&x), "side": "to" }, w.blocks, null])), json!(false));
    let stop = w.stop_onward(&amara, &x);
    assert_eq!(call("condition_holds", json!([{ "stopped": h(&x), "side": "to" }, w.blocks, null])), json!(true));
    assert_eq!(call("condition_holds", json!([{ "stopped": h(&x), "side": "from" }, w.blocks, null])), json!(false));
    assert_eq!(call("condition_holds", json!([{ "stopped": h(&x), "side": "to" }, w.blocks, h(&stop)])), json!(false), "read in the stop's own past");
}

// R-C3. Named readings: `{ paid: deal }` with no rule set is read by the core alone, which runs no named reading: never read, X held. World
// B: written on Sam's signal: X lands once Sam signs `paid`. SILENT 4.
#[test]
fn r_c3_named_readings() {
    let mut w = World::new();
    let sam = w.person(30);
    let amara = w.person(3);
    let x = w.thing(&sam, "sack", sack("1"));
    let deal = w.offer(&sam, &h(&x), &amara, json!({ "price": gbp("60") }));
    w.accept(&amara, &deal);
    assert_eq!(call("condition_holds", json!([{ "paid": h(&deal) }, w.blocks, null])), Value::Null, "not read");
    let signal = json!({ "signal": "paid", "by": [sam.id], "subject": h(&deal) });
    let t = w.sign(&sam, "transfer", json!({ "condition": signal }), json!({ "what": h(&x), "to_owner": amara.id, "for": h(&deal) }));
    w.yes(&amara, &t);
    assert_eq!(draw_of(&w.own(&x), &t)["state"], json!("held"));
    w.sign(&sam, "observe", json!({ "kind": "paid" }), json!({ "subject": h(&deal) }));
    assert_eq!(w.own(&x)["owner"], json!(amara.id), "{}", w.own(&x));
}

// R-C4. A sum is a signal; what a condition moved stays moved: Leila's later "120" does not undo the "520" Maria's pledge was accepted on.
#[test]
fn r_c4_a_sum_is_a_signal() {
    let mut w = World::new();
    let leila = w.person(5);
    let maria = w.person(2);
    let project = w.person(29);
    w.sign(&leila, "observe", json!({ "kind": "pledged", "amount": gbp("520") }), json!({}));
    let cond = json!({ "signal": "pledged", "by": [leila.id], "op": "ge", "value": gbp("500") });
    let pledge = w.sign(&maria, "promise", json!({ "what": "a pledge", "terms": { "price": gbp("50"), "condition": cond } }), json!({ "from": project.id, "to": maria.id }));
    w.accept(&project, &pledge);
    w.sign(&leila, "observe", json!({ "kind": "pledged", "amount": gbp("120") }), json!({}));
    assert_eq!(w.stage(&pledge)["stage"], json!("accepted"));
    assert_eq!(call("condition_holds", json!([cond, w.blocks, null])), json!(true));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 7. The bench, and judges
// ---------------------------------------------------------------------------------------------------------------------------------------

// R-J1. The bench (kept from 1.8 P15): a side alone never judges its own deal: Sam's `defeats` of Amara's accept changes nothing (shown
// as disputed); a judge both named does. The backup chain's clocks (`grounds.wait`) are unchanged by this stage and not re-asked here.
#[test]
fn r_j1_the_bench() {
    let mut w = World::new();
    let sam = w.person(30);
    let amara = w.person(3);
    let ade = w.person(31);
    let f = w.thing(&sam, "flour", amt("10", "kg"));
    let deal = w.offer(&sam, &h(&f), &amara, json!({ "price": gbp("60") }));
    w.accept(&amara, &deal);
    let named = w.sign(&sam, "grant", json!({ "kind": "referee" }), json!({ "to": ade.id, "subject": h(&deal) }));
    w.sign(&amara, "grant", json!({ "status": "accepted" }), json!({ "answers": h(&named) }));
    let d = w.deliver(&sam, &f, &amara, &deal, None);
    let yes = w.yes(&amara, &d);
    w.sign(&sam, "observe", json!({ "kind": "note" }), json!({ "defeats": [h(&yes)] }));
    let s = w.stage(&deal);
    assert_eq!(s["stage"], json!("underway"), "a side alone never judges: {s}");
    assert_eq!(s["disputed"].as_array().map(Vec::len), Some(1), "{s}");
    w.sign(&ade, "observe", json!({ "kind": "ruling" }), json!({ "defeats": [h(&d)] }));
    assert_eq!(w.stage(&deal)["stage"], json!("accepted"), "{}", w.stage(&deal));
}

// R-J2. A judge named late: Sam handed his place (the £60 to come) to Leila; Sam and Amara name Zed: Zed is not on the bench, the stage
// stays done, £60 to come to Leila. World B: Leila also answers Zed `accepted`: his ruling counts.
#[test]
fn r_j2_a_judge_named_late() {
    for leila_too in [false, true] {
        let mut w = World::new();
        let sam = w.person(30);
        let amara = w.person(3);
        let leila = w.person(5);
        let zed = w.person(32);
        let sack1 = w.thing(&sam, "sack", sack("1"));
        let deal = w.offer(&sam, &h(&sack1), &amara, json!({ "price": gbp("60") }));
        let a = w.accept(&amara, &deal);
        let d = w.deliver(&sam, &sack1, &amara, &deal, None);
        w.yes(&amara, &d);
        let place = w.sign(&sam, "transfer", json!({}), json!({ "what": h(&deal), "to_owner": leila.id, "for": h(&deal), "after": [h(&a)] }));
        w.yes(&leila, &place);
        let named = w.sign(&sam, "grant", json!({ "kind": "referee" }), json!({ "to": zed.id, "subject": h(&deal) }));
        w.sign(&amara, "grant", json!({ "status": "accepted" }), json!({ "answers": h(&named) }));
        if leila_too {
            w.sign(&leila, "grant", json!({ "status": "accepted" }), json!({ "answers": h(&named) }));
        }
        w.sign(&zed, "observe", json!({ "kind": "ruling" }), json!({ "defeats": [h(&d)] }));
        let s = w.stage(&deal);
        if leila_too {
            assert_eq!(s["stage"], json!("accepted"), "{s}");
        } else {
            assert_ne!(s["stage"], json!("accepted"), "Zed is not on the bench: {s}");
            assert_eq!(s["to_come"]["from"], json!([{ "owner": leila.id, "amount": gbp("60") }]), "{s}");
        }
    }
}

// R-J5. A claim, and its hand-over: a thief with Maria's phone key (reach P1D on Wanjiru's clock) hands her claim to Pia: the hand-over
// waits on `reach`; her card ends the phone inside the day: it counts for nothing.
#[test]
fn r_j5_a_claims_hand_over_waits_on_reach() {
    let mut w = World::new();
    let maria = w.person(2);
    let ned = w.person(33);
    let pia = w.person(34);
    let wanjiru = w.person(8);
    let phone = keypair_from_seed(&"7a".repeat(32)).unwrap();
    let card = maria.keys.public_key_sign.clone();
    let k1 = w.sign(&maria, "grant", json!({ "kind": "key", "voices": [{ "key": card }, { "key": phone.public_key_sign, "reach": "P1D", "wait": "PT0S" }], "clocks": clocks(&[&wanjiru], 1) }), json!({ "subject": maria.id, "updates": maria.id }));
    let bed = w.thing(&maria, "carrot bed", amt("1", "bed"));
    let m1 = w.sign(&maria, "observe", json!({ "kind": "claim", "said": "Ned sprayed my carrot bed" }), json!({ "subject": h(&bed), "to": ned.id }));
    let theft = w.sign_full(&maria, &phone, "transfer", json!({}), json!({ "what": h(&m1), "to_owner": pia.id }), None, None);
    let s = w.stands(&theft);
    assert!(s["waiting"].as_array().unwrap().iter().any(|x| x["on"] == json!("reach")), "{s}");
    w.sign(&maria, "grant", json!({ "kind": "key", "voices": [{ "key": card }], "clocks": clocks(&[&wanjiru], 1) }), json!({ "subject": maria.id, "updates": h(&k1) }));
    assert_eq!(w.stands(&theft)["stands"], json!(false), "{}", w.stands(&theft));
    // a claim shown has no `standing`, `crossed`, `commanded`, `accused` or `nothing` (1.9 §10)
    let inv = w.sign(&maria, "observe", json!({ "kind": "invasion" }), json!({ "subject": h(&bed), "to": ned.id }));
    let shown = call("invasion_shown", json!([inv, w.blocks]));
    for k in ["standing", "crossed", "commanded", "accused", "nothing"] {
        assert!(shown.get(k).is_none(), "{k}: {shown}");
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The cases that came out of earlier stages
// ---------------------------------------------------------------------------------------------------------------------------------------

// A deposit held that names a thing: Leila's voucher V for the café's table, conditioned `{ stopped: C1, side: "to" }` (a stake on her
// own stop, in place of `terms.notice`): held while the deal stands; it lands with the café at her onward stop. World B: the café stops
// first: still held; the café's own no frees it back to Leila.
#[test]
fn a_deposit_held_that_names_a_thing() {
    for her_stop in [true, false] {
        let mut w = World::new();
        let cafe = w.person(26);
        let leila = w.person(5);
        let v = w.thing(&leila, "voucher", gbp("20"));
        let c1 = w.sign(&cafe, "promise", json!({ "what": "a table, Friday 19:30", "terms": { "price": gbp("60") } }), json!({ "from": cafe.id, "to": leila.id }));
        w.accept(&leila, &c1);
        let dep = w.sign(&leila, "transfer", json!({ "condition": { "stopped": h(&c1), "side": "to" } }), json!({ "what": h(&v), "to_owner": cafe.id, "for": h(&c1) }));
        w.yes(&cafe, &dep);
        assert_eq!(draw_of(&w.own(&v), &dep)["state"], json!("held"));
        if her_stop {
            w.stop_onward(&leila, &c1);
            assert_eq!(w.own(&v)["owner"], json!(cafe.id), "{}", w.own(&v));
        } else {
            w.stop_own(&cafe, &c1, "onward");
            assert_eq!(draw_of(&w.own(&v), &dep)["state"], json!("held"));
            w.no(&cafe, &dep);
            assert_eq!(w.own(&v)["owner"], json!(leila.id), "{}", w.own(&v));
        }
    }
}

// A successor gets what was hers only by her own transfer on the condition of her close: a grant of kind `successor` is no profile and no
// power; her will to him is the way, and it takes at her close.
#[test]
fn a_successor_only_by_her_own_will() {
    let mut w = World::new();
    let harry = w.person(1);
    let nephew = w.person(35);
    let mill = w.thing(&harry, "mill", amt("1", "mill"));
    let g = w.sign(&harry, "grant", json!({ "kind": "successor", "scope": { "types": ["transfer"] } }), json!({ "to": nephew.id }));
    w.sign(&harry, "observe", json!({ "kind": "close" }), json!({ "subject": harry.id }));
    // the nephew's sale under the old successor grant moves nothing of Harry's
    let t = w.sign(&nephew, "transfer", json!({}), json!({ "what": h(&mill), "to_owner": nephew.id, "under": h(&g), "as": harry.id }));
    let _ = t;
    assert_eq!(w.own(&mill)["owner"], json!(harry.id), "{}", w.own(&mill));
    let will = w.sign(&harry, "transfer", json!({ "condition": { "closed": harry.id } }), json!({ "what": h(&mill), "to_owner": nephew.id }));
    w.yes(&nephew, &will);
    assert_eq!(w.own(&mill)["owner"], json!(harry.id));
    w.close(&harry, &[]);
    assert_eq!(w.own(&mill)["owner"], json!(nephew.id), "{}", w.own(&mill));
}

// A machine identity handed over to her key: the maker's key list for the oven is replaced by a key grant putting her key first; what her key
// signs as the oven counts, and the maker's old key speaks for it no more.
#[test]
fn a_machine_identity_handed_over_to_her_key() {
    let mut w = World::new();
    let maker = keypair_from_seed(&"60".repeat(32)).unwrap();
    let at = w.at();
    let g = genesis(&maker, &GenesisOptions { kind: "machine", at, audience: Some(Readers::Public), ..Default::default() }).unwrap();
    w.blocks.push(g.clone());
    let oven = Person { id: h(&g), keys: maker.clone() };
    let maria = w.person(2);
    let her = maria.keys.public_key_sign.clone();
    w.sign(&oven, "grant", json!({ "kind": "key", "voices": [{ "key": her }] }), json!({ "subject": oven.id, "updates": oven.id }));
    let k = maria.keys.clone();
    let mine = w.sign_full(&oven, &k, "observe", json!({ "kind": "note", "said": "baked" }), json!({}), None, None);
    assert_eq!(call("signed_by_author", json!([mine, w.blocks])), json!(true));
    let old = w.sign(&oven, "observe", json!({ "kind": "note", "said": "maker" }), json!({}));
    assert_eq!(call("signed_by_author", json!([old, w.blocks])), json!(false));
}

// Every door question the oracle's stories of stage 5 ask (spec/oracle/stage5, each checked there against the text's answer), asked of the
// core: the same answer, a refusal's `detail` aside. Regenerate: node spec/oracle/stage5/export.cjs.
fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
#[test]
fn the_oracle_stories_of_stage_5() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/stage5.json")).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    let mut differ = vec![];
    let qs = all["questions"].as_array().unwrap();
    for q in qs {
        let op = q["op"].as_str().unwrap();
        if matches!(op, "keypair" | "seal") {
            continue;
        }
        let out = answer(op.as_bytes(), q["args"].to_string().as_bytes());
        record(&format!("oracle {}", q["story"].as_str().unwrap()), op, &q["args"], &out);
        let ok = match q.get("error") {
            Some(_) => out.get("ok").is_none(),
            None => out.get("ok").map(without_detail) == Some(without_detail(&q["answer"])),
        };
        if !ok {
            differ.push(format!("{} {op}: core {} | oracle {}", q["story"], out.get("ok").unwrap_or(&out).to_string().chars().take(900).collect::<String>(), q["answer"].to_string().chars().take(900).collect::<String>()));
        }
    }
    assert!(differ.is_empty(), "{} of the stories' {} questions differ:\n{}", differ.len(), qs.len(), differ.join("\n"));
}
