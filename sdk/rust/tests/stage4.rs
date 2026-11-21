//! FoodBlock 1.9, stage 4: grants (changes-1.9/04-grants.md, section 5). Each rule's story as a fixed world, asked through the door, with
//! the text's answer. Where the world needs bytes the story does not spell (a meter's receipt, a `state.draws`), the test adds them and says
//! so. A story not built in the core keeps its world here, `#[ignore]`d, with the reason.
use foodblock::door::answer;
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{keypair_from_seed, write, ComposeOptions, Keypair, Readers, WriteOptions};
use serde_json::{json, Value};

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
fn amt(v: &str, unit: &str) -> Value {
    json!({ "value": v, "unit": unit })
}
fn gbp(v: &str) -> Value {
    amt(v, "GBP")
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
    /// Signs against `held` (the whole record, or a snapshot to sign a pair on one `prev`).
    fn sign_held(&mut self, p: &Person, t: &str, state: Value, refs: Value, held: &[Value]) -> Value {
        let at = self.at();
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at: Some(at), audience: Some(Readers::Public), ..Default::default() },
            key: Some(&p.keys),
            held,
            schemas: None,
        };
        let b = write(t, &state, &refs, &o).unwrap_or_else(|e| panic!("{t} {state} {refs}: {e:?}"));
        self.blocks.push(b.clone());
        b
    }
    fn sign(&mut self, p: &Person, t: &str, state: Value, refs: Value) -> Value {
        let held = self.blocks.clone();
        self.sign_held(p, t, state, refs, &held)
    }
    fn receipt(&mut self, clock: &Person, of: &[&Value], drawn: Value) -> Value {
        let ids = sorted(of.iter().map(|b| h(b)).collect());
        let mut state = json!({ "kind": "receipt" });
        if !drawn.is_null() {
            state["drawn"] = drawn;
        }
        self.sign(clock, "observe", state, json!({ "derives_from": ids }))
    }
    fn under_ok(&self, b: &Value) -> Value {
        call("under_ok", json!([b, self.blocks]))
    }
    fn under_ok_in(&self, b: &Value, held: &[Value]) -> Value {
        call("under_ok", json!([b, held]))
    }
    /// The first code G1 gives, or "" where the block speaks for the grant's giver.
    fn why(&self, b: &Value) -> String {
        let w = call("why_not_under", json!([b, self.blocks, null]));
        w.as_array().unwrap().first().and_then(|e| e["code"].as_str()).unwrap_or_default().to_string()
    }
    fn backed(&self, b: &Value, who: &Person) -> Value {
        call("backed", json!([b, who.id, self.blocks]))
    }
    fn meter(&self, g: &Value, b: Option<&Value>) -> Value {
        call("meter", json!([g, self.blocks, b]))
    }
    fn own(&self, thing: &Value) -> Value {
        call("ownership", json!([thing, self.blocks, null]))
    }
}

const FRI: &str = "2026-11-20T12:00:00.000Z";
const WED: &str = "2026-11-18T12:00:00.000Z";

/// The base world W, and the people in it.
struct Base {
    w: World,
    amara: Person,
    wanjiru: Person,
    foodx: Person,
    ai: Person,
    harry: Person,
    sam: Person,
    mill: Person,
    a1: Value,
    g: Value,
}
fn flour() -> String {
    kind("flour")
}
/// A1's terms: 10 sacks, price at most £21 a sack, pay 3 days or more after, delivered by Friday 12:00, the price waiting on the goods.
fn a1_terms(quantity: &str) -> Value {
    // "max:N" asks for a range of at most N sacks
    let q = match quantity.strip_prefix("max:") { Some(n) => json!({ "max": amt(n, "sack") }), None => amt(quantity, "sack") };
    json!({ "quantity": q, "price": { "max": per(gbp("21"), "sack") }, "pay_by": { "min": "P3D" }, "deliver_by": FRI, "waits_on": "goods" })
}
/// A counter that keeps to A1: its quantity, a price per sack, `pay_by` P4D.
fn counter_terms(quantity: &str, price: &str) -> Value {
    json!({ "quantity": amt(quantity, "sack"), "price": per(gbp(price), "sack"), "pay_by": "P4D", "deliver_by": FRI, "waits_on": "goods" })
}

/// (1) Amara A0. (2) Wanjiru N0, a clock. (3) Amara A1, her want. (4) Amara A2, grant G to her AI I: types [promise, observe, transfer],
/// on [A1], parties [Harry, Sam, Mill Lane], limit £210, meter N0, clocks [FoodX F0, N0] both needed. `meter_own` names the AI's own line
/// instead; `scope` changes the scope before G is signed.
fn base(meter_own: bool, quantity: &str, scope: impl Fn(&mut Value)) -> Base {
    let mut w = World::new();
    let amara = w.person(1);
    let wanjiru = w.person(2);
    let foodx = w.person(3);
    let ai = w.person(4);
    let harry = w.person(5);
    let sam = w.person(6);
    let mill = w.person(7);
    let a1 = w.sign(&amara, "promise", json!({ "terms": a1_terms(quantity) }), json!({ "what": flour(), "to": amara.id }));
    let mut sc = json!({
        "types": ["observe", "promise", "transfer"], "on": [h(&a1)], "parties": sorted(vec![harry.id.clone(), sam.id.clone(), mill.id.clone()]),
        "limit": gbp("210"), "clocks": { "names": sorted(vec![foodx.id.clone(), wanjiru.id.clone()]), "needed": 2 },
    });
    scope(&mut sc);
    let meter = if meter_own { ai.id.clone() } else { wanjiru.id.clone() };
    let g = w.sign(&amara, "grant", json!({ "kind": "agent", "scope": sc, "depth": 1 }), json!({ "to": ai.id, "meter": meter }));
    Base { w, amara, wanjiru, foodx, ai, harry, sam, mill, a1, g }
}
impl Base {
    fn counter(&mut self, seller: &Person, terms: Value) -> Value {
        let (a1, amara) = (h(&self.a1), self.amara.id.clone());
        self.w.sign(seller, "promise", json!({ "terms": terms }), json!({ "answers": a1, "for": a1, "from": seller.id, "to": amara, "what": flour() }))
    }
    /// The AI's accept of an offer under G, stating its draw on G's line.
    fn accept(&mut self, offer: &Value, draws: Option<&str>) -> Value {
        let ai = self.ai.clone();
        let held = self.w.blocks.clone();
        self.accept_held(&ai, offer, draws, &held)
    }
    fn accept_held(&mut self, by: &Person, offer: &Value, draws: Option<&str>, held: &[Value]) -> Value {
        let mut state = json!({ "status": "accepted" });
        if let Some(d) = draws {
            state["draws"] = json!({ "grant": h(&self.g), "amount": gbp(d) });
        }
        self.w.sign_held(by, "promise", state, json!({ "answers": h(offer), "for": h(&self.a1), "under": h(&self.g) }), held)
    }
    /// The meter's receipt of a draw, stating the running totals (one receipt is enough: A meter she names).
    fn metered(&mut self, b: &Value, total: &str, amount: &str) -> Value {
        let (n, g) = (self.wanjiru.clone(), h(&self.g));
        self.w.receipt(&n, &[b], json!([{ "of": g, "amount": gbp(amount), "total": gbp(total) }]))
    }
}

// G1, one rule (story 1). I1 accepts Harry's H1: speaks for Amara. Ravi is no party: `not_live`. A counter that adds `state.where` keeps to
// nothing: `not_kept`, why `state.where`.
#[test]
fn g1_one_rule() {
    let mut b = base(false, "10", |_| {});
    let h1 = b.counter(&b.harry.clone(), counter_terms("10", "20.50"));
    let i1 = b.accept(&h1, Some("205"));
    // the text's meter is N0: the block fits once N's receipt of it is held
    assert_eq!(b.w.why(&i1), "waiting", "no receipt of the meter yet");
    b.metered(&i1, "205", "205");
    assert_eq!(b.w.under_ok(&i1), json!(true));
    assert_eq!(b.w.backed(&i1, &b.amara)["backed"], json!(true));
    let ravi = b.w.person(9);
    let r1 = b.counter(&ravi, counter_terms("10", "20.50"));
    let i2 = b.accept(&r1, Some("205"));
    assert_eq!(b.w.why(&i2), "not_live");
    let mut t = counter_terms("10", "20.50");
    t["price"] = per(gbp("20"), "sack");
    let (a1, amara) = (h(&b.a1), b.amara.id.clone());
    let h3 = b.w.sign(&b.harry.clone(), "promise", json!({ "terms": t, "where": { "lat": "51.5", "lon": "-0.1" } }), json!({ "answers": a1, "for": a1, "from": b.harry.id, "to": amara, "what": flour() }));
    let i3 = b.accept(&h3, Some("200"));
    assert_eq!(b.w.why(&i3), "not_kept");
    assert_eq!(call("keeps_to", json!([h3, b.a1])), json!({ "keeps": false, "why": "state.where" }));
}

// G1, the bookkeeper (story 2, T2-6). Her bookkeeper's "paid" on D1 (in `on`) speaks for Maria; on D2: `not_kept`, and D2's price is
// still to come to her.
#[test]
fn g1_the_bookkeeper() {
    let mut w = World::new();
    let maria = w.person(1);
    let sam = w.person(2);
    let ben = w.person(3);
    let k = w.person(4);
    let loaf = kind("loaf");
    let d1 = w.sign(&maria, "promise", json!({ "terms": { "quantity": amt("10", "loaf"), "price": gbp("20") } }), json!({ "what": loaf, "from": maria.id, "to": sam.id }));
    w.sign(&sam, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&d1), "for": h(&d1) }));
    let d2 = w.sign(&maria, "promise", json!({ "terms": { "quantity": amt("4", "loaf"), "price": gbp("8") } }), json!({ "what": loaf, "from": maria.id, "to": ben.id }));
    w.sign(&ben, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&d2), "for": h(&d2) }));
    let m3 = w.sign(&maria, "grant", json!({ "kind": "bookkeeper", "scope": { "types": ["observe.paid"], "on": [h(&d1)] } }), json!({ "to": k.id, "meter": k.id }));
    let k1 = w.sign(&k, "observe", json!({ "kind": "paid" }), json!({ "subject": h(&d1), "under": h(&m3) }));
    assert_eq!(w.under_ok(&k1), json!(true));
    assert_eq!(call("speaks_for", json!([k1, w.blocks])), json!(maria.id));
    let k2 = w.sign(&k, "observe", json!({ "kind": "paid" }), json!({ "subject": h(&d2), "under": h(&m3) }));
    assert_eq!(w.why(&k2), "not_kept");
    assert_eq!(call("speaks_for", json!([k2, w.blocks])), json!(k.id), "K's own reading");
    let stage = call("promise_stage", json!([d2, w.blocks, {}]));
    assert_eq!(stage["paid"], Value::Null, "D2's price is still to come to Maria: {stage}");
}

// Keeps to, item 6 and "fully stated" (story 3, T2-4).
#[test]
fn keeps_to_item_6_and_fully_stated() {
    let mut b = base(false, "10", |_| {});
    let harry = b.harry.clone();
    let mut t = counter_terms("10", "20");
    t["price"] = json!({ "min": per(gbp("19"), "sack"), "max": per(gbp("21"), "sack") });
    let h2 = b.counter(&harry, t);
    assert_eq!(call("keeps_to", json!([h2, b.a1])), json!({ "keeps": false, "why": "terms.price" }));
    let i = b.accept(&h2, Some("210"));
    assert_eq!(b.w.why(&i), "not_kept");
    let mut t = counter_terms("10", "20");
    t["pay_by"] = json!("P1D");
    let h3 = b.counter(&harry, t);
    assert_eq!(call("keeps_to", json!([h3, b.a1])), json!({ "keeps": false, "why": "terms.pay_by" }));
    // a want for flour and sugar; Harry offers flour alone (item 5)
    let amara = b.amara.clone();
    let both = sorted(vec![flour(), kind("sugar")]);
    let fs = b.w.sign(&amara, "promise", json!({ "terms": { "quantity": amt("10", "sack") } }), json!({ "what": both, "to": amara.id }));
    let h4 = b.w.sign(&harry, "promise", json!({ "terms": { "quantity": amt("10", "sack") } }), json!({ "answers": h(&fs), "for": h(&fs), "from": harry.id, "to": amara.id, "what": flour() }));
    assert_eq!(call("keeps_to", json!([h4, fs])), json!({ "keeps": false, "why": "refs.what" }));
    // a want with no pay_by; an offer stating one (a seller never writes a date into her silence)
    let np = b.w.sign(&amara, "promise", json!({ "terms": { "quantity": amt("10", "sack") } }), json!({ "what": flour(), "to": amara.id }));
    let h5 = b.w.sign(&harry, "promise", json!({ "terms": { "quantity": amt("10", "sack"), "pay_by": "P4D" } }), json!({ "answers": h(&np), "for": h(&np), "from": harry.id, "to": amara.id, "what": flour() }));
    assert_eq!(call("keeps_to", json!([h5, np])), json!({ "keeps": false, "why": "terms.pay_by" }));
    // and the one that keeps
    let h1 = b.counter(&harry, counter_terms("10", "20.50"));
    assert_eq!(call("keeps_to", json!([h1, b.a1])), json!({ "keeps": true, "why": null }));
}

// G3, overlap (story 4, D6, T2-3).
#[test]
fn g3_two_ranges_meet_in_their_overlap() {
    let mut w = World::new();
    let sam = w.person(1);
    let sa = w.person(2);
    let mama = w.person(3);
    let soko = w.person(4);
    let suk = kind("sukuma");
    let bunch = |n: &str| amt(n, "bunch");
    let kes = |n: &str| amt(n, "KES");
    let s1 = w.sign(&sam, "promise", json!({ "terms": { "quantity": bunch("20"), "price": { "max": per(kes("60"), "bunch") } } }), json!({ "what": suk, "to": sam.id }));
    let gs = w.sign(&sam, "grant", json!({ "kind": "agent", "scope": { "types": ["promise"], "on": [h(&s1)], "limit": kes("1200") } }), json!({ "to": sa.id, "meter": sa.id }));
    let m1 = w.sign(&mama, "promise", json!({ "terms": { "quantity": bunch("20"), "price": { "min": per(kes("45"), "bunch") } } }), json!({ "what": suk, "from": mama.id }));
    let gm = w.sign(&mama, "grant", json!({ "kind": "agent", "scope": { "types": ["promise"], "on": [h(&m1)] } }), json!({ "to": soko.id, "meter": soko.id }));
    let offer = |w: &mut World, price: &str, total: &str| {
        // an offer of Sam's agent to Mama: it names no link (refs.for would have to name S1 or a promise that keeps to it, Keeps to item 3)
        w.sign(&sa, "promise", json!({ "terms": { "quantity": bunch("20"), "price": per(kes(price), "bunch") }, "draws": { "grant": h(&gs), "amount": kes(total) } }), json!({ "from": mama.id, "to": sam.id, "what": suk, "under": h(&gs) }))
    };
    let sa1 = offer(&mut w, "50", "1000");
    assert_eq!(w.under_ok(&sa1), json!(true), "SA1 keeps to S1: Sam's word");
    let y1 = w.sign(&soko, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&sa1), "for": h(&sa1), "under": h(&gm) }));
    assert_eq!(w.under_ok(&y1), json!(true), "Soko's yes keeps to M1: binds Mama");
    let sa2 = offer(&mut w, "40", "800");
    let y2 = w.sign(&soko, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&sa2), "for": h(&sa2), "under": h(&gm) }));
    assert_eq!(w.why(&y2), "not_kept", "40 is under Mama's floor");
    let own = w.sign(&mama, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&sa2), "for": h(&sa2) }));
    assert_eq!(call("speaks_for", json!([own, w.blocks])), json!(mama.id), "her own yes is her own word");
    // Maria's till, floor £3 a loaf; Leila's counter at £2.50; the till's yes keeps to nothing
    let maria = w.person(5);
    let till = w.person(6);
    let leila = w.person(7);
    let loaf = kind("loaf");
    let mo = w.sign(&maria, "promise", json!({ "terms": { "quantity": amt("10", "loaf"), "price": { "min": per(gbp("3"), "loaf") } } }), json!({ "what": loaf, "from": maria.id }));
    let tg = w.sign(&maria, "grant", json!({ "kind": "till", "scope": { "types": ["promise"], "on": [h(&mo)] } }), json!({ "to": till.id, "meter": till.id }));
    let lc = w.sign(&leila, "promise", json!({ "terms": { "quantity": amt("10", "loaf"), "price": per(gbp("2.50"), "loaf") } }), json!({ "answers": h(&mo), "for": h(&mo), "from": maria.id, "to": leila.id, "what": loaf }));
    let ty = w.sign(&till, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&lc), "for": h(&mo), "under": h(&tg) }));
    assert_eq!(w.why(&ty), "not_kept");
}

// G4, one fill for each occurrence (story 5, T2-5).
#[test]
fn g4_one_fill_for_each_occurrence() {
    let mut w = World::new();
    let mama = w.person(1);
    let soko = w.person(2);
    let sam = w.person(3);
    let otieno = w.person(4);
    let crates = kind("crate");
    let kes = |n: &str| amt(n, "KES");
    let when = "2026-11-16T06:00:00.000Z";
    let terms = |price: Value| json!({ "quantity": amt("2", "crate"), "price": price, "repeat": "FREQ=WEEKLY;BYDAY=MO", "zone": "Africa/Nairobi" });
    let m2 = w.sign(&mama, "promise", json!({ "when": when, "terms": terms(json!({ "max": per(kes("700"), "crate") })) }), json!({ "what": crates, "to": mama.id }));
    let g = w.sign(&mama, "grant", json!({ "kind": "agent", "scope": { "types": ["promise"], "on": [h(&m2)], "parties": sorted(vec![sam.id.clone(), otieno.id.clone()]), "limit": kes("10000") } }), json!({ "to": soko.id, "meter": soko.id }));
    let fill = |w: &mut World, seller: &Person, occ: &str| {
        let o = w.sign(seller, "promise", json!({ "when": when, "occurrence": occ, "terms": terms(per(kes("650"), "crate")) }), json!({ "answers": h(&m2), "for": h(&m2), "from": seller.id, "to": mama.id, "what": crates }));
        w.sign(&soko, "promise", json!({ "status": "accepted", "draws": { "grant": h(&g), "amount": kes("1300") } }), json!({ "answers": h(&o), "for": h(&m2), "under": h(&g) }))
    };
    let a = fill(&mut w, &sam, "2026-11-16T06:00:00.000Z");
    assert_eq!(w.under_ok(&a), json!(true));
    let b = fill(&mut w, &otieno, "2026-11-16T06:00:00.000Z");
    assert_eq!(w.why(&b), "not_kept");
    let c = fill(&mut w, &otieno, "2026-11-23T06:00:00.000Z");
    assert_eq!(w.under_ok(&c), json!(true));
}

// Her quantity is the measure (story 6): a second grant naming A1 draws nothing (`past`); an accept under it keeps to nothing.
#[test]
fn her_quantity_is_the_measure() {
    let mut b = base(false, "10", |_| {});
    let (amara, j) = (b.amara.clone(), b.w.person(8));
    let sc = b.g["state"]["scope"].clone();
    let a3 = b.w.sign(&amara, "grant", json!({ "kind": "agent", "scope": sc }), json!({ "to": j.id, "meter": b.wanjiru.id }));
    let m = b.w.meter(&a3, None);
    assert_eq!((m["fits"].clone(), m["why"].clone()), (json!(false), json!("past")), "{m}");
    let h1 = b.counter(&b.harry.clone(), counter_terms("10", "20"));
    let x = b.w.sign(&j, "promise", json!({ "status": "accepted", "draws": { "grant": h(&a3), "amount": gbp("200") } }), json!({ "answers": h(&h1), "for": h(&b.a1), "under": h(&a3) }));
    assert_eq!(b.w.why(&x), "not_kept");
}

// G6, the limit on one line (story 7), the AI's own line as the meter, a weekly limit with `until`.
#[test]
fn g6_the_limit_on_one_line() {
    // her want is for at most 70 sacks: `every` renews only the limit, never her quantity (a part is never renewed)
    let mut b = base(true, "max:70", |sc| {
        sc["every"] = json!("P7D");
        sc["until"] = json!("2026-12-31T00:00:00.000Z");
    });
    let mut answers = vec![];
    for _ in 0..5 {
        let o = b.counter(&b.harry.clone(), counter_terms("10", "21"));
        let i = b.accept(&o, Some("210"));
        answers.push(if b.w.under_ok(&i) == json!(true) { "true".to_string() } else { b.w.why(&i) });
    }
    assert_eq!(answers, ["true", "past", "past", "past", "past"]);
    // a new period: the AI's own cutoff of the week on its line (a span no shorter than `every`), nine days on, then a seventh accept
    let ai = b.ai.clone();
    b.w.minute += 9 * 1440;
    b.w.sign(&ai, "observe", json!({ "kind": "cutoff", "when": "P7D" }), json!({ "subject": h(&b.g) }));
    let o = b.counter(&b.harry.clone(), counter_terms("10", "21"));
    let i = b.accept(&o, Some("210"));
    assert_eq!(b.w.under_ok(&i), json!(true), "{}", b.w.meter(&b.g, Some(&i)));
    assert_eq!(b.w.meter(&b.g, Some(&i))["period"], json!(1));
}

// G6: an accept of a price fixed later with no max takes nothing (`unit`): its total cannot be worked out in the limit's kind.
#[test]
fn g6_a_price_fixed_later_takes_nothing() {
    let mut w = World::new();
    let amara = w.person(1);
    let ai = w.person(2);
    let harry = w.person(3);
    let n = w.person(4);
    let a = w.sign(&amara, "promise", json!({ "terms": { "quantity": amt("10", "sack") } }), json!({ "what": flour(), "to": amara.id }));
    let g = w.sign(&amara, "grant", json!({ "kind": "agent", "scope": { "types": ["promise"], "on": [h(&a)], "limit": gbp("210") } }), json!({ "to": ai.id, "meter": ai.id }));
    let figure = json!({ "figure": "market_price", "by": [n.id], "signers": 1, "deadline": FRI, "clocks": { "names": [n.id] } });
    let o = w.sign(&harry, "promise", json!({ "terms": { "quantity": amt("10", "sack"), "price": figure } }), json!({ "answers": h(&a), "for": h(&a), "from": harry.id, "to": amara.id, "what": flour() }));
    assert_eq!(call("keeps_to", json!([o, a])), json!({ "keeps": true, "why": null }), "item 7: she pays, the other side signs");
    let i = w.sign(&ai, "promise", json!({ "status": "accepted", "draws": { "grant": h(&g), "amount": gbp("210") } }), json!({ "answers": h(&o), "for": h(&a), "under": h(&g) }));
    assert_eq!(w.why(&i), "unit");
}

// G7, a copied key (story 8, T2-2), the AI's own line as the meter.
#[test]
fn g7_a_copied_key_on_her_tools_own_line() {
    let mut b = base(true, "10", |_| {});
    let (harry, sam, mill, ai, amara) = (b.harry.clone(), b.sam.clone(), b.mill.clone(), b.ai.clone(), b.amara.clone());
    let oh = b.counter(&harry, counter_terms("10", "21"));
    let os = b.counter(&sam, counter_terms("10", "21"));
    let om = b.counter(&mill, counter_terms("10", "21"));
    let snapshot = b.w.blocks.clone();
    let i4 = b.accept_held(&ai, &oh, Some("210"), &snapshot);
    let i4b = b.accept_held(&ai, &os, Some("210"), &snapshot);
    let i4c = b.accept_held(&ai, &om, Some("210"), &snapshot);
    assert_eq!(i4["refs"]["prev"], i4b["refs"]["prev"]);
    // Harry holds I4 only: it binds Amara for £210
    let harrys: Vec<Value> = b.w.blocks.iter().filter(|x| x["hash"] != i4b["hash"] && x["hash"] != i4c["hash"]).cloned().collect();
    assert_eq!(b.w.under_ok_in(&i4, &harrys), json!(true));
    // a reader holding all three: the fork answer, at most her measure
    let fork = json!({ "pair": true, "held": sorted(vec![h(&i4), h(&i4b), h(&i4c)]), "at_most": [gbp("210")] });
    assert_eq!(b.w.under_ok(&i4), fork);
    assert_eq!(b.w.backed(&i4b, &amara)["backed"], fork);
    // Harry's delivery under I4 lands on no accept: his flour stays his
    let hf = b.w.sign(&harry, "thing", json!({ "kind": "flour", "pack": amt("10", "sack") }), json!({ "of": flour() }));
    b.w.sign(&harry, "transfer", json!({}), json!({ "what": h(&hf), "to_owner": amara.id, "for": h(&b.a1) }));
    let o = b.w.own(&hf);
    let d = o["draws"].as_array().unwrap().iter().find(|d| d["to"] == json!(amara.id)).cloned().unwrap();
    assert_eq!(d["state"], json!("held"), "lands on no accept: {o}");
    assert_ne!(o["owner"], json!(amara.id));
    assert_eq!(call("worst_case", json!([b.g, b.w.blocks]))["at_most"], json!([gbp("210")]));
}

// G7 with a meter she names (story 8, second half): N receipts I4 at £210, I4' at £420: `past`. A false receipt of I4' at £210 binds
// Wanjiru's name; Amara's at_most stays £210.
#[test]
fn g7_a_copied_key_with_a_meter_she_names() {
    for honest in [true, false] {
        let mut b = base(false, "10", |_| {});
        let (harry, sam, ai) = (b.harry.clone(), b.sam.clone(), b.ai.clone());
        let oh = b.counter(&harry, counter_terms("10", "21"));
        let os = b.counter(&sam, counter_terms("10", "21"));
        let snapshot = b.w.blocks.clone();
        let i4 = b.accept_held(&ai, &oh, Some("210"), &snapshot);
        let i4b = b.accept_held(&ai, &os, Some("210"), &snapshot);
        b.metered(&i4, "210", "210");
        b.metered(&i4b, if honest { "420" } else { "210" }, "210");
        assert_eq!(b.w.under_ok(&i4), json!(true));
        assert_eq!(b.w.why(&i4b), "past", "honest {honest}");
        assert_eq!(call("worst_case", json!([b.g, b.w.blocks]))["at_most"], json!([gbp("210")]));
    }
}

// G8, counted once (story 9).
#[test]
fn g8_counted_once() {
    let mut b = base(false, "10", |_| {});
    let (sam, ai) = (b.sam.clone(), b.ai.clone());
    let o = b.counter(&sam, counter_terms("10", "19.90"));
    let i5 = b.accept(&o, Some("199"));
    b.metered(&i5, "199", "199");
    assert_eq!(b.w.under_ok(&i5), json!(true));
    let sf = b.w.sign(&sam, "thing", json!({ "kind": "flour", "pack": amt("10", "sack") }), json!({ "of": flour() }));
    let d = b.w.sign(&sam, "transfer", json!({}), json!({ "what": h(&sf), "to_owner": b.amara.id, "for": h(&b.a1) }));
    let i6 = b.w.sign(&ai, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&d), "under": h(&b.g) }));
    assert_eq!(b.w.under_ok(&i6), json!(true));
    let i7 = b.w.sign(&ai, "transfer", json!({ "amount": gbp("199") }), json!({ "to_owner": sam.id, "for": h(&b.a1), "under": h(&b.g) }));
    assert_eq!(b.w.under_ok(&i7), json!(true));
    let m = b.w.meter(&b.g, None);
    assert_eq!(m["left"][0], json!({ "of": h(&b.g), "amount": gbp("11") }), "the payment drew nothing more: {m}");
}

// G9, a child grant (story 10).
#[test]
fn g9_a_child_grant() {
    let mut b = base(false, "10", |_| {});
    let (ai, sam) = (b.ai.clone(), b.sam.clone());
    let helper = b.w.person(9);
    let parent_scope = b.g["state"]["scope"].clone();
    let child = |to: Option<&str>, meter: &str, limit: &str| {
        let mut sc = parent_scope.clone();
        sc["limit"] = gbp(limit);
        let mut refs = json!({ "parent": h(&b.g), "meter": meter, "author": ai.id });
        if let Some(t) = to {
            refs["to"] = json!(t);
        }
        json!({ "type": "grant", "state": { "kind": "agent", "scope": sc }, "refs": refs })
    };
    let codes = |r: Value| r.as_array().unwrap().iter().map(|x| x["code"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    assert_eq!(codes(call("scope_refusals", json!([child(Some(&helper.id), &helper.id, "60"), b.g]))), ["wider_than_parent"]);
    assert!(codes(call("scope_refusals", json!([child(None, &b.wanjiru.id, "60"), b.g]))).contains(&"shape".to_string()));
    assert!(codes(call("scope_refusals", json!([child(Some(&helper.id), &b.wanjiru.id, "60"), b.g]))).is_empty());
    // 1.9 stage 4 (decided in building): the story's answers (true, past, true, past) need £110 drawn before: an accept of Sam's £110
    let o = b.counter(&sam, counter_terms("10", "11"));
    let first = b.accept(&o, Some("110"));
    b.metered(&first, "110", "110");
    let mut answers = vec![];
    let mut total = 110;
    for limit in [60, 60, 40] {
        let sc = { let mut s = parent_scope.clone(); s["limit"] = gbp(&limit.to_string()); s };
        let c = b.w.sign(&ai, "grant", json!({ "kind": "agent", "scope": sc }), json!({ "parent": h(&b.g), "to": helper.id, "meter": b.wanjiru.id }));
        let t = if total + limit <= 210 { total + limit } else { total + limit };
        b.metered(&c, &t.to_string(), &limit.to_string());
        let m = b.w.meter(&b.g, Some(&c));
        if m["fits"] == json!(true) {
            total += limit;
            answers.push("true".to_string());
        } else {
            answers.push(m["why"].as_str().unwrap().to_string());
        }
    }
    let one = b.counter(&sam, counter_terms("10", "0.10"));
    let mine = b.accept(&one, Some("1"));
    b.metered(&mine, "211", "1");
    answers.push(if b.w.under_ok(&mine) == json!(true) { "true".into() } else { b.w.why(&mine) });
    assert_eq!(answers, ["true", "past", "true", "past"]);
}

// Blocks that bind, Due (story 11).
#[test]
fn blocks_that_bind_due() {
    let mut b = base(false, "10", |_| {});
    let (sam, ai, amara) = (b.sam.clone(), b.ai.clone(), b.amara.clone());
    let o = b.counter(&sam, counter_terms("10", "19.90"));
    let i5 = b.accept(&o, Some("199"));
    b.metered(&i5, "199", "199");
    let i8 = b.w.sign(&ai, "transfer", json!({ "amount": gbp("199") }), json!({ "to_owner": sam.id, "for": h(&b.a1), "under": h(&b.g) }));
    assert_eq!(b.w.why(&i8), "not_due");
    let back = call("to_come_back", json!([amara.id, b.w.blocks]));
    assert!(back["to_come"].as_array().unwrap().iter().any(|l| l["block"] == i8["hash"]), "{back}");
    let sf = b.w.sign(&sam, "thing", json!({ "kind": "flour", "pack": amt("10", "sack") }), json!({ "of": flour() }));
    let d = b.w.sign(&sam, "transfer", json!({}), json!({ "what": h(&sf), "to_owner": amara.id, "for": h(&b.a1) }));
    let came = b.w.sign(&amara, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&d) }));
    let i8b = b.w.sign(&ai, "transfer", json!({ "amount": gbp("199") }), json!({ "to_owner": sam.id, "for": h(&b.a1), "under": h(&b.g), "after": [h(&came)] }));
    assert_eq!(b.w.why(&i8b), "", "with her accept of the flour in its past");
    // under a grant without transfer
    let mut c = base(false, "10", |sc| sc["types"] = json!(["observe", "promise"]));
    let (sam, ai) = (c.sam.clone(), c.ai.clone());
    let p = c.w.sign(&ai, "transfer", json!({ "amount": gbp("199") }), json!({ "to_owner": sam.id, "for": h(&c.a1), "under": h(&c.g) }));
    assert_eq!(c.w.why(&p), "not_live");
}

// Toll work, coming back (story 12).
#[test]
fn toll_work_and_coming_back() {
    let mut w = World::new();
    let leila = w.person(1);
    let fm = w.person(2);
    let stranger = w.person(3);
    let loaf = kind("loaf");
    let l1 = w.sign(&leila, "promise", json!({ "terms": { "quantity": amt("40", "loaf") } }), json!({ "what": loaf, "to": leila.id }));
    let fl = w.sign(&leila, "thing", json!({ "kind": "flour", "pack": amt("20", "kg") }), json!({ "of": flour() }));
    let l2 = w.sign(&leila, "grant", json!({ "kind": "farm", "scope": { "types": ["transform"], "limit": amt("20", "kg"), "on": [h(&l1)] } }), json!({ "to": fm.id, "what": h(&fl), "meter": fm.id }));
    let make = |w: &mut World, by: &Person, under: bool| {
        let mut refs = json!({ "derives_from": [h(&fl)], "of": loaf });
        if under {
            refs["under"] = json!(h(&l2));
        }
        w.sign(by, "transform", json!({ "inputs": [{ "from": h(&fl), "amount": amt("0.5", "kg") }], "pack": amt("1", "loaf") }), refs)
    };
    let mut ok = 0;
    let mut loaves = vec![];
    for _ in 0..40 {
        let m = make(&mut w, &fm, true);
        if w.under_ok(&m) == json!(true) {
            ok += 1;
        }
        loaves.push(m);
    }
    assert_eq!(ok, 40);
    let m41 = make(&mut w, &fm, true);
    assert_eq!(w.why(&m41), "past");
    // coming back: the holder's transfer `to_owner` her needs no accept and no type in `types`
    let back = w.sign(&fm, "transfer", json!({}), json!({ "what": h(&loaves[0]), "to_owner": leila.id, "under": h(&l2) }));
    assert_eq!(w.under_ok(&back), json!(true));
    let st = make(&mut w, &stranger, false);
    let o = w.own(&fl);
    let row = o["draws"].as_array().unwrap().iter().find(|d| d["block"] == st["hash"]).cloned().unwrap_or(json!(null));
    assert_eq!(row["why"], json!("not_owner"), "{o}");
}

// Each loaf is hers from its make (story 12): a tool's make that binds her is her start for each output.
#[test]
fn toll_work_each_loaf_is_hers() {
    let mut w = World::new();
    let leila = w.person(1);
    let fm = w.person(2);
    let fl = w.sign(&leila, "thing", json!({ "kind": "flour", "pack": amt("20", "kg") }), json!({ "of": flour() }));
    let l2 = w.sign(&leila, "grant", json!({ "kind": "farm", "scope": { "types": ["transform"], "limit": amt("20", "kg") } }), json!({ "to": fm.id, "what": h(&fl), "meter": fm.id }));
    let m = w.sign(&fm, "transform", json!({ "inputs": [{ "from": h(&fl), "amount": amt("0.5", "kg") }] }), json!({ "derives_from": [h(&fl)], "under": h(&l2) }));
    let loaf = w.sign(&fm, "thing", json!({ "kind": "loaf" }), json!({ "of": kind("loaf"), "derives_from": [h(&m)] }));
    assert_eq!(w.own(&loaf)["owners"][0]["owner"], json!(leila.id), "{}", w.own(&loaf));
}

// G13, a pass between her tools (story 13, T2-8).
#[test]
fn g13_a_pass_between_her_tools() {
    for with_transfer in [true, false] {
        let mut w = World::new();
        let leila = w.person(1);
        let rb = w.person(2);
        let st = w.person(3);
        let lt = w.sign(&leila, "thing", json!({ "kind": "lettuce", "pack": amt("40", "lettuce") }), json!({ "of": kind("lettuce") }));
        let types = if with_transfer { json!(["transfer", "transform"]) } else { json!(["transform"]) };
        let l3 = w.sign(&leila, "grant", json!({ "kind": "robot", "scope": { "types": types } }), json!({ "to": rb.id, "what": h(&lt), "meter": rb.id }));
        w.sign(&leila, "grant", json!({ "kind": "stall", "scope": { "types": ["promise", "transfer"] } }), json!({ "to": st.id }));
        let rb1 = w.sign(&rb, "transfer", json!({ "amount": amt("30", "lettuce") }), json!({ "what": h(&lt), "to_owner": st.id, "under": h(&l3) }));
        if with_transfer {
            assert_eq!(w.under_ok(&rb1), json!(true));
        } else {
            assert_eq!(w.why(&rb1), "not_live");
        }
    }
}

// G14, the link (story 14, T2-7).
#[test]
fn g14_the_two_key_link() {
    for linked in [true, false] {
        let mut w = World::new();
        let harry = w.person(1);
        let wk = w.person(2);
        let t = w.person(3);
        if linked {
            let l = w.sign(&wk, "observe", json!({ "kind": "link" }), json!({ "same_as": [t.id] }));
            w.sign(&t, "observe", json!({ "kind": "link" }), json!({ "confirms": [h(&l)], "same_as": [wk.id] }));
        }
        let ho = w.sign(&harry, "promise", json!({ "terms": { "quantity": amt("50", "sack"), "price": per(gbp("20"), "sack") } }), json!({ "what": flour(), "from": harry.id }));
        let hg = w.sign(&harry, "grant", json!({ "kind": "till", "scope": { "types": ["promise"], "on": [h(&ho)] } }), json!({ "to": t.id, "meter": t.id }));
        let order = w.sign(&wk, "promise", json!({ "status": "accepted", "terms": { "quantity": amt("10", "sack") } }), json!({ "answers": h(&ho), "for": h(&ho) }));
        let t1 = w.sign(&t, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&order), "for": h(&ho), "under": h(&hg) }));
        if linked {
            assert_eq!(w.why(&t1), "both_sides");
        } else {
            assert_eq!(w.under_ok(&t1), json!(true));
        }
    }
}

// G15, take the lowest (story 15, T2-12).
#[test]
fn g15_her_deadline_and_the_lowest_offer() {
    let mut b = base(false, "10", |sc| {
        sc["deadline"] = json!(WED);
        sc["fallback"] = json!("lowest");
    });
    let (harry, sam, n, f) = (b.harry.clone(), b.sam.clone(), b.wanjiru.clone(), b.foodx.clone());
    let oh = b.counter(&harry, counter_terms("10", "20.50"));
    let mut st = counter_terms("10", "19.90");
    st["expires"] = json!("2026-11-18T18:00:00.000Z");
    let os = b.counter(&sam, st);
    b.w.receipt(&n, &[&oh], Value::Null);
    b.w.receipt(&n, &[&os], Value::Null);
    let i9 = b.accept(&oh, Some("205"));
    assert_eq!(b.w.why(&i9), "waiting", "the meter's line has not shown it before or after the deadline");
    b.w.receipt(&n, &[&i9], Value::Null);
    assert_eq!(b.w.why(&i9), "not_live", "before the deadline nothing under the grant counts");
    assert_eq!(call("lowest_offer", json!([b.g, b.w.blocks])), json!({ "offer": null, "received": null, "cutoff": null, "why": "pending" }));
    // N3 is signed after the deadline by its own date (a cutoff dated before its `when` closes nothing)
    b.w.minute = 297 * 1440 + 13 * 60;
    let n3 = b.w.sign(&n, "observe", json!({ "kind": "cutoff", "when": WED }), json!({ "subject": h(&b.g) }));
    b.w.receipt(&f, &[&oh], Value::Null);
    let low = call("lowest_offer", json!([b.g, b.w.blocks]));
    assert_eq!((low["offer"].clone(), low["cutoff"].clone()), (json!(h(&os)), json!(h(&n3))));
    let ai = b.ai.clone();
    let i10 = b.w.sign(&ai, "promise", json!({ "status": "accepted", "draws": { "grant": h(&b.g), "amount": gbp("199") } }), json!({ "answers": h(&os), "for": h(&b.a1), "under": h(&b.g), "after": [h(&n3)] }));
    b.metered(&i10, "199", "199");
    assert_eq!(b.w.under_ok(&i10), json!(true), "{}", call("why_not_under", json!([i10, b.w.blocks, null])));
    let i11 = b.w.sign(&ai, "promise", json!({ "status": "accepted", "draws": { "grant": h(&b.g), "amount": gbp("205") } }), json!({ "answers": h(&oh), "for": h(&b.a1), "under": h(&b.g), "after": [h(&n3)] }));
    assert_eq!(b.w.why(&i11), "after_deadline");
}

// G16, the stop (story 16, T2-1, T2-9).
#[test]
fn g16_her_stop_read_on_her_clocks() {
    let mut b = base(false, "10", |_| {});
    let (amara, f, n, harry, ai) = (b.amara.clone(), b.foodx.clone(), b.wanjiru.clone(), b.harry.clone(), b.ai.clone());
    let a4 = b.w.sign(&amara, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": h(&b.g) }));
    b.w.receipt(&f, &[&a4], Value::Null);
    let oh = b.counter(&harry, counter_terms("10", "20"));
    // the thief's accept, which has not seen the stop
    let held: Vec<Value> = b.w.blocks.iter().filter(|x| x["hash"] != a4["hash"]).cloned().collect();
    let i12 = b.accept_held(&ai, &oh, Some("200"), &held);
    b.w.receipt(&f, &[&i12], Value::Null);
    assert_eq!(b.w.why(&i12), "not_live", "one line of two shows the narrowing");
    b.w.receipt(&n, &[&a4], Value::Null);
    let m = b.w.meter(&b.g, None);
    assert_eq!(m["ended"], json!(h(&a4)), "{m}");
    assert_eq!(m["left"][0], json!({ "of": h(&b.g), "amount": gbp("210") }), "what G's line had not drawn comes back");
}

// G16, Leila's pump: her stop alone frees none of the room held for what is still to come (D5).
#[test]
fn g16_her_stop_alone_frees_nothing_held() {
    let mut w = World::new();
    let leila = w.person(1);
    let pump = w.person(2);
    let sam = w.person(3);
    let water = kind("water");
    let want = w.sign(&leila, "promise", json!({ "terms": { "quantity": amt("100", "l"), "price": { "max": per(gbp("0.10"), "l") } } }), json!({ "what": water, "to": leila.id }));
    let g = w.sign(&leila, "grant", json!({ "kind": "pump", "scope": { "types": ["promise"], "on": [h(&want)], "limit": gbp("10") } }), json!({ "to": pump.id, "meter": pump.id }));
    let o = w.sign(&sam, "promise", json!({ "terms": { "quantity": amt("100", "l"), "price": per(gbp("0.10"), "l") } }), json!({ "answers": h(&want), "for": h(&want), "from": sam.id, "to": leila.id, "what": water }));
    let a = w.sign(&pump, "promise", json!({ "status": "accepted", "draws": { "grant": h(&g), "amount": gbp("10") } }), json!({ "answers": h(&o), "for": h(&want), "under": h(&g) }));
    assert_eq!(w.under_ok(&a), json!(true));
    w.sign(&leila, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": h(&g) }));
    let m = w.meter(&g, None);
    assert_eq!(m["left"][0], json!({ "of": h(&g), "amount": gbp("0") }), "the room stays held: {m}");
}

// A stop of one thing (story 17) and a voice's bounds (story 18) are asked through the oracle's stories (the_oracle_stories_of_stage_4).

// G18, the worst case (story 19).
#[test]
fn g18_the_worst_case() {
    let b = base(false, "10", |_| {});
    let wc = call("worst_case", json!([b.g, b.w.blocks]));
    assert_eq!(wc["at_most"], json!([gbp("210")]));
    assert_eq!(wc["can_lose"], json!([]));
    assert_eq!(wc["meter"], json!(b.wanjiru.id));
    assert_eq!(wc["pays"], json!(true));
    assert_eq!(wc["stop"], json!({ "names": sorted(vec![b.foodx.id.clone(), b.wanjiru.id.clone()]), "lines": 1 }));
    let own = base(true, "10", |_| {});
    assert_eq!(call("worst_case", json!([own.g, own.w.blocks]))["meter"], json!("own"));
    // Maria's till: 40 loaves, selling at no less than £3
    let mut w = World::new();
    let maria = w.person(1);
    let till = w.person(2);
    let loaves = w.sign(&maria, "thing", json!({ "kind": "loaf", "pack": amt("40", "loaf") }), json!({ "of": kind("loaf") }));
    let mo = w.sign(&maria, "promise", json!({ "terms": { "quantity": amt("40", "loaf"), "price": { "min": per(gbp("3"), "loaf") } } }), json!({ "what": h(&loaves), "from": maria.id }));
    let tg = w.sign(&maria, "grant", json!({ "kind": "till", "scope": { "types": ["promise", "transfer"], "on": [h(&mo)] } }), json!({ "to": till.id, "what": h(&loaves), "meter": till.id }));
    let wc = call("worst_case", json!([tg, w.blocks]));
    assert_eq!(wc["can_lose"], json!([amt("40", "loaf")]));
    assert_eq!(wc["on"][0]["price"]["min"], per(gbp("3"), "loaf"), "the floor every buyer can read");
    // 1.9 stage 7 (compare): the part and a sell from that instance count once, at the largest of them
    assert_eq!(wc["at_most"], json!([amt("40", "loaf")]), "part 40 loaves and a 40-loaf sell from it: 40, not 80");
    let m60 = w.sign(&maria, "promise", json!({ "terms": { "quantity": amt("60", "loaf"), "price": { "min": per(gbp("3"), "loaf") } } }), json!({ "what": h(&loaves), "from": maria.id }));
    let g60 = w.sign(&maria, "grant", json!({ "kind": "till", "scope": { "types": ["promise", "transfer"], "on": [h(&m60)] } }), json!({ "to": till.id, "what": h(&loaves), "meter": till.id }));
    assert_eq!(call("worst_case", json!([g60, w.blocks]))["at_most"], json!([amt("60", "loaf")]), "a 60-loaf sell from it: 60");
}

// The scope as read (scope_reading) and the shapes stage 4 adds (A2, A range and a list).
#[test]
fn the_scope_and_the_set_shapes() {
    let r = call("scope_reading", json!([{ "types": ["promise"], "deadline": WED, "fallback": "lowest" }]));
    assert_eq!(r, json!({ "types": ["promise"], "parties": [], "on": [], "limit": null, "each": null, "every": null, "until": null, "clocks": null, "deadline": WED, "fallback": "lowest", "junk": [] }));
    let mut w = World::new();
    let a = w.person(1);
    let refuse = |state: Value, refs: Value, t: &str| -> Vec<String> {
        let o = WriteOptions {
            compose: ComposeOptions { author: a.id.clone(), at: Some("2026-02-01T00:00:00.000Z".into()), audience: Some(Readers::Public), ..Default::default() },
            key: Some(&a.keys),
            held: &w.blocks,
            schemas: None,
        };
        match write(t, &state, &refs, &o) {
            Ok(_) => vec![],
            Err(e) => e.refusals.iter().map(|r| r.code.clone()).collect(),
        }
    };
    // a range outside the set places; a range of min not less than max; a list of one; fallback without deadline
    assert!(refuse(json!({ "terms": { "band": { "min": "0.1" } } }), json!({ "what": flour(), "to": a.id }), "promise").contains(&"shape".to_string()));
    assert!(refuse(json!({ "terms": { "quantity": { "min": amt("5", "sack"), "max": amt("5", "sack") } } }), json!({ "what": flour(), "to": a.id }), "promise").contains(&"shape".to_string()));
    assert!(refuse(json!({ "terms": { "price": { "one_of": [gbp("5")] } } }), json!({ "what": flour(), "to": a.id }), "promise").contains(&"shape".to_string()));
    assert!(refuse(json!({ "kind": "agent", "scope": { "types": ["promise"], "fallback": "lowest" } }), json!({ "to": a.id }), "grant").contains(&"shape".to_string()));
    assert!(refuse(json!({ "terms": { "price": { "one_of": [gbp("5"), gbp("6")] }, "pay_by": { "min": "P3D" } } }), json!({ "what": flour(), "to": a.id }), "promise").is_empty());
    // a grant with `on` names its meter
    assert!(refuse(json!({ "kind": "agent", "scope": { "types": ["promise"], "on": [a.id] } }), json!({ "to": a.id }), "grant").contains(&"required".to_string()));
    let _ = w.at();
}


// Every door question the oracle's stories of stage 4 ask (spec/oracle/stage4, each checked there against the text's answer), asked of the
// core: the same answer, a refusal's `detail` aside. Regenerate: node spec/oracle/stage4/export.cjs.
fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
#[test]
fn the_oracle_stories_of_stage_4() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/stage4.json")).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    let mut differ = vec![];
    let qs = all["questions"].as_array().unwrap();
    for q in qs {
        let op = q["op"].as_str().unwrap();
        let out = answer(op.as_bytes(), q["args"].to_string().as_bytes());
        let ok = match q.get("error") {
            Some(_) => out.get("ok").is_none(),
            // `to_come_back`'s `why` is a sentence, never compared (tools/fuzz/diff.cjs reads it the same way)
            None if op == "to_come_back" => {
                let strip = |v: &Value| json!(v["to_come"].as_array().map(|l| l.iter().map(|x| { let mut x = x.clone(); x.as_object_mut().map(|m| m.remove("why")); x }).collect::<Vec<_>>()));
                out.get("ok").map(strip) == Some(strip(&q["answer"]))
            }
            None => out.get("ok").map(without_detail) == Some(without_detail(&q["answer"])),
        };
        if !ok {
            differ.push(format!("{} {op}: core {} | oracle {}", q["story"], out.get("ok").unwrap_or(&out).to_string().chars().take(600).collect::<String>(), q["answer"].to_string().chars().take(600).collect::<String>()));
        }
    }
    assert!(differ.is_empty(), "{} of the stories' {} questions differ:\n{}", differ.len(), qs.len(), differ.join("\n"));
}

// O2 (the owner's decision, 1.9): `scope.ends_on: { witness, said }`, her own ending term. Mama grants Pesa (her tool) `types: [promise]` with
// `ends_on: { witness: Hosti, said: "STOP" }`. Pesa's order under it counts for Mama. Hosti signs a witness `for` the grant saying "STOP":
// Pesa's next order, the witness in its past, counts for nothing (speaks for Pesa alone; not live); one without the witness in its past still
// counts. A witness by another host, or saying "stop please", ends nothing. (The world adds a want in `on` and Harry in `parties`, as stage 4
// asks of any tool that deals.)
#[test]
fn o2_her_own_ending_term() {
    let mut w = World::new();
    let mama = w.person(41);
    let pesa = w.person(42);
    let hosti = w.person(43);
    let other = w.person(44);
    let harry = w.person(45);
    let want = w.sign(&mama, "promise", json!({ "terms": { "quantity": { "max": amt("100", "litre") }, "price": { "max": per(gbp("3"), "litre") } } }), json!({ "what": kind("milk"), "to": mama.id }));
    let scope = json!({ "types": ["promise"], "on": [h(&want)], "parties": [harry.id], "limit": gbp("300"), "ends_on": { "witness": hosti.id, "said": "STOP" } });
    let g = w.sign(&mama, "grant", json!({ "kind": "errands", "scope": scope }), json!({ "to": pesa.id, "meter": pesa.id }));
    let order = |w: &mut World, after: &[&Value]| -> Value {
        let offer = w.sign(&harry, "promise", json!({ "terms": { "quantity": amt("10", "litre"), "price": per(gbp("3"), "litre") } }), json!({ "answers": h(&want), "for": h(&want), "from": harry.id, "to": mama.id, "what": kind("milk") }));
        let mut refs = json!({ "answers": h(&offer), "for": h(&want), "under": h(&g) });
        if !after.is_empty() {
            refs["after"] = json!(sorted(after.iter().map(|b| h(b)).collect()));
        }
        w.sign(&pesa, "promise", json!({ "status": "accepted", "draws": { "grant": h(&g), "amount": gbp("30") } }), refs)
    };
    let first = order(&mut w, &[]);
    assert_eq!(call("speaks_for", json!([first, w.blocks])), json!(mama.id), "Pesa's order counts for Mama");
    // a witness by another host, or saying other words, ends nothing
    let wrong_host = w.sign(&other, "observe", json!({ "kind": "witness", "handle": "pesa-1", "said": "STOP", "readback": kind("pesa stops") }), json!({ "for": h(&g) }));
    let wrong_words = w.sign(&hosti, "observe", json!({ "kind": "witness", "handle": "pesa-1", "said": "stop please", "readback": kind("pesa stops") }), json!({ "for": h(&g) }));
    let still = order(&mut w, &[&wrong_host, &wrong_words]);
    assert_eq!(call("speaks_for", json!([still, w.blocks])), json!(mama.id), "another host, or other words, end nothing");
    let stop = w.sign(&hosti, "observe", json!({ "kind": "witness", "handle": "pesa-1", "said": "STOP", "readback": kind("pesa stops") }), json!({ "for": h(&g) }));
    // an order that does not have the witness in its past still counts
    let apart = order(&mut w, &[]);
    assert_eq!(call("speaks_for", json!([apart, w.blocks])), json!(mama.id), "no witness in its past: it still counts");
    let after = order(&mut w, &[&stop]);
    assert_eq!(call("speaks_for", json!([after, w.blocks])), json!(pesa.id), "the witness in its past: her tool's order counts for nothing of hers");
    assert_eq!(w.why(&after), "not_live");
    // the shape: both keys, witness an id
    let held = w.blocks.clone();
    for (bad, code) in [(json!({ "witness": hosti.id }), "shape"), (json!({ "witness": "Hosti", "said": "STOP" }), "grammar"), (json!({ "witness": hosti.id, "said": 1 }), "shape")] {
        let o = WriteOptions {
            compose: ComposeOptions { author: mama.id.clone(), at: Some(w.at()), audience: Some(Readers::Public), ..Default::default() },
            key: Some(&mama.keys),
            held: &held,
            schemas: None,
        };
        let r = write("grant", &json!({ "kind": "errands", "scope": { "types": ["promise"], "ends_on": bad } }), &json!({ "to": pesa.id }), &o);
        assert!(r.as_ref().is_err_and(|e| format!("{e:?}").contains(code)), "{bad}: {r:?}");
    }
}
