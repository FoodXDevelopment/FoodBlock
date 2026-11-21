//! FoodBlock 1.9, stage 6: circles (changes-1.9/06-circles.md). Each rule's story as a fixed world, asked through the door, with the text's
//! answer. Where the world needs bytes the story does not spell (who confirms, a meter's receipt), the test adds them and says so. Where the
//! text was silent and this build chose, the test names the item of `changes-1.9/stage6-rust-silent.md` it pins.
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
impl Cafe {
    /// Joe's errand grant G `as` F under r1, and the café's want it names in `scope.on` (stage 4: a tool's yes keeps to a promise its
    /// grant names): milk, at most £30, from anyone G admits (Harry). Its line is Joe's own (`meter` Joe), so no receipt is needed.
    fn joes_grant(&mut self, joe: &Person, clocks: Option<Value>) -> (Value, Value) {
        let fid = h(&self.f);
        let want = self.w.sign(&self.amara, "promise", json!({ "terms": { "quantity": amt("10", "litre"), "price": { "max": gbp("30") } } }), json!({ "as": fid, "what": kind("milk"), "to": fid }));
        let mut scope = json!({ "types": ["promise", "transfer"], "on": [h(&want)], "each": gbp("100"), "limit": gbp("300"), "parties": [self.harry.id] });
        if let Some(k) = clocks {
            scope["clocks"] = k;
        }
        let g = self.w.sign(&self.amara, "grant", json!({ "kind": "errands", "scope": scope }), json!({ "as": fid, "to": joe.id, "meter": joe.id }));
        (want, g)
    }
    /// Harry's offer of milk to the café's want, and Joe's yes to it under G, having seen `after`.
    fn joe_buys_milk(&mut self, joe: &Person, want: &Value, g: &Value, after: &[&Value]) -> Value {
        let fid = h(&self.f);
        let harry = self.harry.clone();
        let offer = self.w.sign(&harry, "promise", json!({ "terms": { "quantity": amt("10", "litre"), "price": gbp("30") } }), json!({ "answers": h(want), "for": h(want), "from": harry.id, "to": fid, "what": kind("milk") }));
        let mut refs = json!({ "answers": h(&offer), "for": h(want), "under": h(g) });
        if !after.is_empty() {
            refs["after"] = json!(sorted(after.iter().map(|b| h(b)).collect()));
        }
        self.w.sign(joe, "promise", json!({ "status": "accepted", "draws": { "grant": h(g), "amount": gbp("30") } }), refs)
    }
}

fn holds(r: &Value) -> bool {
    r["holds"] == json!(true)
}
fn owners(s: &Value) -> Vec<(String, String)> {
    s["owners"].as_array().unwrap_or_else(|| panic!("owners: {s}")).iter().map(|o| (o["owner"].as_str().unwrap().to_string(), o["amount"]["value"].as_str().unwrap().to_string())).collect()
}
fn owner_amount(s: &Value, p: &str) -> Option<String> {
    owners(s).into_iter().find(|(o, _)| o == p).map(|x| x.1)
}
fn hand<'a>(r: &'a Value, b: &Value) -> &'a Value {
    r["hands"].as_array().unwrap().iter().find(|x| x["block"] == b["hash"]).unwrap_or_else(|| panic!("no hand {} in {r}", b["hash"]))
}
fn r1() -> Value {
    json!({ "parts": 1, "scope": { "types": ["promise", "transfer", "transform", "observe", "thing", "grant"], "each": gbp("300") } })
}

/// The test world (section 2): F, the café, signed by Amara: pack 100, a clock N, the till T as its meter, and row r1. P1 (50 part to Leila)
/// and P2 (her yes): Amara 50, Leila 50.
struct Cafe {
    w: World,
    amara: Person,
    leila: Person,
    harry: Person,
    till: Person,
    n: Person,
    f: Value,
    /// Leila's yes to P1 (P2): a block of Amara's sees Leila as an owner only where P2 is in its causal past
    p2: Value,
}
fn cafe() -> Cafe {
    cafe_with(true)
}
/// The café with no meter named (C21's second story).
fn cafe_no_meter() -> Cafe {
    cafe_with(false)
}
fn cafe_with(meter: bool) -> Cafe {
    let mut w = World::new();
    let amara = w.person(3);
    let leila = w.person(5);
    let harry = w.person(1);
    let till = w.person(20);
    let n = w.person(21);
    let refs = if meter { json!({ "meter": till.id }) } else { json!({}) };
    let f = w.circle(&amara, json!({ "pack": part("100"), "clocks": { "names": [n.id] }, "rules": [r1()] }), refs);
    let p1 = w.parts_to(&amara, &f, "50", &leila.id, None);
    let p2 = w.yes(&leila, &p1);
    Cafe { w, amara, leila, harry, till, n, f, p2 }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------------------------------------------------------------------

// C0. Amara signs B1 `as` F, a £120 order of milk: it is her word, and speaks for the café's owners because r1 holds for it.
#[test]
fn c0_what_a_circle_is() {
    let mut c = cafe();
    let b1 = c.w.order_as(&c.amara, &c.f, &c.harry, "milk", "120");
    let r = c.w.rows(&b1);
    assert!(holds(&r), "{r}");
    assert_eq!(r["row"], json!(0), "{r}");
    assert_eq!(r["every_owner"], json!(false), "{r}");
    assert_eq!(hand(&r, &b1)["id"], json!(c.amara.id), "{r}");
    assert_eq!(c.w.speaks(&b1), json!(h(&c.f)));
    assert_eq!(b1["refs"]["author"], json!(c.amara.id), "F itself never signs");
}

// C1. F; P1: Amara 50, 50 held. P2: Amara 50, Leila 50. Amara's transfer of 2.5 part to Maria takes nothing (`unit`).
#[test]
fn c1_parts() {
    let mut w = World::new();
    let amara = w.person(3);
    let leila = w.person(5);
    let maria = w.person(9);
    let f = w.circle(&amara, json!({ "pack": part("100"), "rules": [r1()] }), json!({}));
    let p1 = w.parts_to(&amara, &f, "50", &leila.id, None);
    let o = w.own(&f);
    assert_eq!(o["owners"], json!([{ "owner": amara.id, "amount": part("50") }]), "{o}");
    assert_eq!(o["held"], part("50"), "{o}");
    w.yes(&leila, &p1);
    let s = w.state(&f);
    assert_eq!(owner_amount(&s, &amara.id), Some("50".into()), "{s}");
    assert_eq!(owner_amount(&s, &leila.id), Some("50".into()), "{s}");
    assert_eq!(s["pack"], part("100"), "{s}");
    let half = w.parts_to(&amara, &f, "2.5", &maria.id, None);
    let o = w.own(&f);
    let d = o["draws"].as_array().unwrap().iter().find(|d| d["block"] == half["hash"]).unwrap();
    assert_eq!((d["takes"].clone(), d["why"].clone()), (json!(false), json!("unit")), "{o}");
}

// C2. The café holds 1,000 sacks (a thing signed `as` F under r1). Leila's own key, not `as` F, transfers 10 of them to her stall: takes
// nothing (`not_owner`).
#[test]
fn c2_whose_the_circles_things_are() {
    let mut c = cafe();
    let stall = c.w.person(40);
    let sacks = c.w.sign(&c.amara, "thing", json!({ "kind": "sack", "pack": amt("1000", "sack") }), json!({ "as": h(&c.f), "of": kind("sack") }));
    assert!(holds(&c.w.rows(&sacks)));
    let t = c.w.sign(&c.leila, "transfer", json!({ "amount": amt("10", "sack") }), json!({ "what": h(&sacks), "to_owner": stall.id }));
    let o = c.w.own(&sacks);
    assert_eq!(o["owner"], json!(h(&c.f)), "{o}");
    let d = o["draws"].as_array().unwrap().iter().find(|d| d["block"] == t["hash"]).unwrap();
    assert_eq!((d["takes"].clone(), d["why"].clone()), (json!(false), json!("not_owner")), "{o}");
}

// C3. The Wanjiku family founds W with no pack and a parts row: refused (`shape`). With a `to` row instead: valid; owners not said.
#[test]
fn c3_owners_unsaid() {
    let mut w = World::new();
    let wanjiku = w.person(30);
    let otieno = w.person(31);
    let scope = json!({ "types": ["promise", "observe", "transfer"] });
    let refused = w.try_sign(&wanjiku, "actor", json!({ "kind": "circle", "rules": [{ "parts": 1, "scope": scope }] }), json!({}));
    assert!(refused.as_ref().is_err_and(|e| e.contains("shape")), "{refused:?}");
    let fam = w.circle(&wanjiku, json!({ "rules": [{ "to": [wanjiku.id, otieno.id], "needed": 1, "scope": scope }] }), json!({}));
    let s = w.state(&fam);
    assert_eq!(s["owners"], json!({ "not_said": true }), "{s}");
    assert_eq!(s["pack"], Value::Null, "{s}");
    // its rows still act: Otieno, named by the row's `to`
    let o = w.sign(&otieno, "observe", json!({ "kind": "note" }), json!({ "as": h(&fam) }));
    assert!(holds(&w.rows(&o)), "{}", w.rows(&o));
    // no every-owner way (C6): a block no row's scope names waits
    let t = w.sign(&otieno, "grant", json!({ "kind": "errands", "scope": { "types": ["observe"] } }), json!({ "as": h(&fam), "to": wanjiku.id }));
    let r = w.rows(&t);
    assert!(!holds(&r), "{r}");
    let ways = call("ways_in", json!([h(&fam), w.blocks]));
    assert_eq!(ways["every_owner"], Value::Null, "{ways}");
}

// C4 (D5). Kofi founds L, pack 1000, meter T, no row naming L. While he owns every part he signs a version adding the row
// `{ parts: 1, scope: { types: [transfer], what: L } }` (a row naming L comes by a version): every owner, Kofi 1000. He transfers 999 part to L
// and accepts it `as` L (his 1000 with the add-back of D1). Unissued 999, Kofi 1. He signs `as` L a transfer of 1 part to Joseph under the
// version's row; Joseph accepts: Joseph 1, unissued 998. The 998 count in no row.
#[test]
fn c4_unissued_parts() {
    let mut w = World::new();
    let kofi = w.person(11);
    let joseph = w.person(12);
    let meter = w.person(13);
    let observe = json!({ "parts": 1, "scope": { "types": ["observe"] } });
    let l = w.circle(&kofi, json!({ "pack": part("1000"), "rules": [observe] }), json!({ "meter": meter.id }));
    let lid = h(&l);
    let v = w.sign(&kofi, "actor", json!({ "kind": "circle", "pack": part("1000"), "rules": [observe, { "parts": 1, "scope": { "types": ["transfer"], "what": lid } }] }), json!({ "as": lid, "updates": lid, "meter": meter.id }));
    let r = w.rows(&v);
    assert!(holds(&r) && r["every_owner"] == json!(true), "Kofi owns every part: {r}");
    assert_eq!(hand(&r, &v)["parts"], part("1000"), "{r}");
    let to_l = w.parts_to(&kofi, &l, "999", &lid, None);
    let yes = w.sign(&kofi, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&to_l), "as": lid }));
    let r = w.rows(&yes);
    assert!(holds(&r), "{r}");
    assert_eq!(hand(&r, &yes)["parts"], part("1000"), "D1: the 999 his own accept takes are added back: {r}");
    let s = w.state(&l);
    assert_eq!(s["unissued"], part("999"), "{s}");
    assert_eq!(owners(&s), vec![(kofi.id.clone(), "1".to_string())], "{s}");
    let t = w.parts_to(&kofi, &l, "1", &joseph.id, Some(&l));
    let r = w.rows(&t);
    assert!(holds(&r) && r["row"] == json!(1), "{r}");
    w.yes(&joseph, &t);
    let s = w.state(&l);
    assert_eq!(s["unissued"], part("998"), "{s}");
    assert_eq!(owner_amount(&s, &joseph.id), Some("1".into()), "{s}");
    // the 998 count in no row: a hand `as` L on its own parts is not_voice, its id the circle
    let o = w.sign(&kofi, "promise", json!({ "terms": { "price": gbp("10") } }), json!({ "as": lid, "what": kind("maize"), "from": lid, "to": joseph.id }));
    let c = w.sign(&kofi, "observe", json!({ "kind": "confirm" }), json!({ "confirms": [h(&o)], "as": lid }));
    let r = w.rows(&o);
    assert!(!holds(&r), "{r}");
    assert_eq!((hand(&r, &c)["id"].clone(), hand(&r, &c)["why"].clone()), (json!(lid), json!("not_voice")), "{r}");
    // a transfer of a circle's own parts by a row that does not name it in scope.what holds by no row
    let l2 = w.circle(&kofi, json!({ "pack": part("10"), "rules": [{ "parts": 1, "scope": { "types": ["transfer"] } }] }), json!({}));
    let own = w.sign(&kofi, "transfer", json!({ "amount": part("1") }), json!({ "as": h(&l2), "what": h(&l2), "to_owner": joseph.id }));
    let r = w.rows(&own);
    assert!(r["row"].is_null(), "{r}");
}

// C5 (D1). Kofi, sole owner of A and of B, transfers all of A's parts to B and all of B's to A; each is accepted `as` the receiving circle.
// The ring closes: Kofi's confirm `as` B of A's yes counts his 10 parts of B (added back: the move it confirms answers his draw), B's row
// holds for it, and A's yes holds by B's hand. Both take; `owners` shows no_person for each. Nothing is refused.
#[test]
fn c5_a_circle_as_owner() {
    let mut w = World::new();
    let kofi = w.person(11);
    let a = w.circle(&kofi, json!({ "pack": part("10"), "rules": [r1()] }), json!({}));
    let b = w.circle(&kofi, json!({ "pack": part("10"), "rules": [r1()] }), json!({}));
    let ab = w.parts_to(&kofi, &a, "10", &h(&b), None);
    let ya = w.sign(&kofi, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&ab), "as": h(&b) }));
    assert!(holds(&w.rows(&ya)), "{}", w.rows(&ya));
    let sa = w.state(&a);
    assert_eq!(sa["owners"], json!([{ "owner": h(&b), "amount": part("10"), "no_person": false }]), "A's owner is B, whose owner is Kofi: {sa}");
    // A's owner B acts by a block `as` B for which a row of B's holds: Kofi's confirm `as` B of a move `as` A
    let move_a = w.order_as(&kofi, &a, &kofi, "flour", "50");
    let r = w.rows(&move_a);
    assert!(!holds(&r), "Kofi owns no part of A: {r}");
    let cb = w.sign(&kofi, "observe", json!({ "kind": "confirm" }), json!({ "confirms": [h(&move_a)], "as": h(&b) }));
    let r = w.rows(&move_a);
    assert!(holds(&r), "{r}");
    assert_eq!(hand(&r, &cb)["id"], json!(h(&b)), "{r}");
    // the ring's last link: B's parts to A, accepted `as` A by B's hand
    let ba = w.parts_to(&kofi, &b, "10", &h(&a), None);
    let yb = w.sign(&kofi, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&ba), "as": h(&a) }));
    let cb2 = w.sign(&kofi, "observe", json!({ "kind": "confirm" }), json!({ "confirms": [h(&yb)], "as": h(&b) }));
    let r2 = w.rows(&cb2);
    assert!(holds(&r2), "Kofi's 10 parts of B are added back for the confirm of the yes that takes them: {r2}");
    assert_eq!(hand(&r2, &cb2)["parts"], part("10"), "{r2}");
    let r = w.rows(&yb);
    assert!(holds(&r), "{r}");
    assert_eq!((hand(&r, &cb2)["id"].clone(), hand(&r, &cb2)["counts"].clone()), (json!(h(&b)), json!(true)), "{r}");
    assert_eq!(w.state(&a)["owners"], json!([{ "owner": h(&b), "amount": part("10"), "no_person": true }]));
    assert_eq!(w.state(&b)["owners"], json!([{ "owner": h(&a), "amount": part("10"), "no_person": true }]));
}

// C6. Every owner together. Story 1: Amara signs `as` F £2,000 to herself; Leila confirms: holds (100 of 100), above r1's each and giving to
// Amara. Story 2: Amara and Leila stop grant G `as` F: G ends; Harry's deal under G before the stop stands. Story 3: in L (unissued 998),
// Kofi and Joseph sign a sale; the meter's receipt states 998 unissued: holds. With no meter: no every-owner way.
#[test]
fn c6_every_owner_together() {
    let mut c = cafe();
    let t = c.w.pay_as(&c.amara, &c.f, &c.amara.id.clone(), "2000");
    assert!(!holds(&c.w.rows(&t)), "{}", c.w.rows(&t));
    c.w.confirm(&c.leila, &t);
    let r = c.w.rows(&t);
    assert!(holds(&r) && r["every_owner"] == json!(true) && r["row"].is_null(), "{r}");

    // Story 2
    let joe = c.w.person(8);
    let (want, g) = c.joes_grant(&joe, None);
    assert!(holds(&c.w.rows(&g)), "{}", c.w.rows(&g));
    let deal = c.joe_buys_milk(&joe, &want, &g, &[]);
    assert_eq!(c.w.speaks(&deal), json!(h(&c.f)), "Joe's order speaks for the café's owners");
    let stop = c.w.sign(&c.amara, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": h(&g), "as": h(&c.f) }));
    c.w.confirm(&c.leila, &stop);
    assert!(holds(&c.w.rows(&stop)), "{}", c.w.rows(&stop));
    assert_eq!(c.w.speaks(&deal), json!(h(&c.f)), "what stands stays");
    let after = c.joe_buys_milk(&joe, &want, &g, &[&stop]);
    assert_ne!(c.w.speaks(&after), json!(h(&c.f)), "G ended");

    // Story 3
    let mut w = World::new();
    let kofi = w.person(11);
    let joseph = w.person(12);
    let meter = w.person(13);
    let store = w.person(14);
    let l = w.circle(&kofi, json!({ "pack": part("1000"), "rules": [{ "parts": 1, "scope": { "types": ["observe"] } }] }), json!({ "meter": meter.id }));
    let lid = h(&l);
    let to_l = w.parts_to(&kofi, &l, "998", &lid, None);
    w.sign(&kofi, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&to_l), "as": lid }));
    let tj = w.parts_to(&kofi, &l, "1", &joseph.id, None);
    w.yes(&joseph, &tj);
    let sale = w.sign(&kofi, "promise", json!({ "terms": { "price": gbp("5000") } }), json!({ "as": lid, "what": kind("store"), "from": lid, "to": store.id }));
    w.confirm(&joseph, &sale);
    assert!(!holds(&w.rows(&sale)), "no receipt yet: {}", w.rows(&sale));
    w.receipt(&meter, &[&sale], json!({ "unissued": part("998") }));
    let r = w.rows(&sale);
    assert!(holds(&r) && r["every_owner"] == json!(true), "{r}");
    // the same with no meter named: no every-owner way, and no row: waits
    let mut w = World::new();
    let kofi = w.person(11);
    let joseph = w.person(12);
    let store = w.person(14);
    let l = w.circle(&kofi, json!({ "pack": part("1000"), "rules": [{ "parts": 1, "scope": { "types": ["observe"] } }] }), json!({}));
    let lid = h(&l);
    let to_l = w.parts_to(&kofi, &l, "998", &lid, None);
    w.sign(&kofi, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&to_l), "as": lid }));
    let tj = w.parts_to(&kofi, &l, "1", &joseph.id, None);
    w.yes(&joseph, &tj);
    let sale = w.sign(&kofi, "promise", json!({ "terms": { "price": gbp("5000") } }), json!({ "as": lid, "what": kind("store"), "from": lid, "to": store.id }));
    w.confirm(&joseph, &sale);
    let r = w.rows(&sale);
    assert!(!holds(&r), "{r}");
    assert_eq!(r["waiting"], json!([{ "block": h(&sale), "on": "hands" }]), "{r}");
}

// C7. Leila's will (her 50 part to Kwame on the condition that her list closes), then her close; Kwame accepts: Kwame 50. Without a will: her
// 50 stay hers; r1 still holds for Amara's blocks; the every-owner way needs Leila's hand and is shut for good.
#[test]
fn c7_joining_leaving_a_close() {
    let mut c = cafe();
    let kwame = c.w.person(50);
    let will = c.w.sign(&c.leila, "transfer", json!({ "amount": part("50"), "condition": { "closed": c.leila.id } }), json!({ "what": h(&c.f), "to_owner": kwame.id }));
    c.w.close(&c.leila, &[&will]);
    c.w.yes(&kwame, &will);
    let s = c.w.state(&c.f);
    assert_eq!(owner_amount(&s, &kwame.id), Some("50".into()), "{s}");
    assert_eq!(owner_amount(&s, &c.leila.id), None, "{s}");

    let mut c = cafe();
    let close = c.w.close(&c.leila, &[]);
    let s = c.w.state(&c.f);
    assert_eq!(owner_amount(&s, &c.leila.id), Some("50".into()), "her parts stay hers: {s}");
    let b = c.w.order_as(&c.amara, &c.f, &c.harry, "milk", "80");
    assert!(holds(&c.w.rows(&b)), "{}", c.w.rows(&b));
    let big = c.w.order_as(&c.amara, &c.f, &c.harry, "oven", "900");
    let r = c.w.rows(&big);
    assert!(!holds(&r), "{r}");
    let _ = close;
}

// C8. Block S, sealed to audience F, is signed; then Leila transfers her 50 to Rex, who accepts: S's audience is Amara and Leila; Rex is not
// in it. (Whether Rex may claim to see S: SILENT 1.)
#[test]
fn c8_a_buyer_of_parts_and_blocks_sealed_before() {
    let mut c = cafe();
    let rex = c.w.person(10);
    let s_block = c.w.sign(&c.amara, "observe", json!({ "kind": "note" }), json!({ "after": [h(&c.p2)] }));
    let t = c.w.parts_to(&c.leila, &c.f, "50", &rex.id, None);
    let y = c.w.yes(&rex, &t);
    let m = call("members_then", json!([s_block, h(&c.f), c.w.blocks]));
    assert_eq!(m, json!(sorted(vec![c.amara.id.clone(), c.leila.id.clone()])), "{m}");
    let m = call("members_then", json!([y, h(&c.f), c.w.blocks]));
    assert!(!m.as_array().unwrap().contains(&json!(rex.id)), "Rex's own yes is not in its own past: {m}");
    let later = c.w.sign(&rex, "observe", json!({ "kind": "note" }), json!({ "after": [h(&y)] }));
    let m = call("members_then", json!([later, h(&c.f), c.w.blocks]));
    assert_eq!(m, json!(sorted(vec![c.amara.id.clone(), rex.id.clone()])), "{m}");
    // a role names no one
    assert_eq!(call("members_then", json!([later, format!("{}#sign", h(&c.f)), c.w.blocks])), json!([]));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// What a circle's word names
// ---------------------------------------------------------------------------------------------------------------------------------------

// C9. Amara signs `as` F under r1 an order of 10 sacks from Harry, £205. Then Amara and Leila move every pound of the café to themselves:
// Harry's deal stands and names only the café's things. Harry's delivery said "mine until you say paid": the owners' draw on his sacks takes
// nothing (`not_owner`).
#[test]
fn c9_what_a_circles_word_names() {
    let mut c = cafe();
    let order = c.w.order_as(&c.amara, &c.f, &c.harry, "sack", "205");
    assert!(holds(&c.w.rows(&order)));
    let accept = c.w.sign(&c.harry, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&order), "for": h(&order) }));
    let sacks = c.w.sign(&c.harry, "thing", json!({ "kind": "sack", "pack": amt("10", "sack") }), json!({ "of": kind("sack") }));
    let paid = c.w.sign(&c.harry, "observe", json!({ "kind": "paid" }), json!({ "subject": h(&order) }));
    let _ = paid;
    let delivery = c.w.sign(&c.harry, "transfer", json!({ "condition": { "signal": "paid", "by": [c.harry.id], "subject": h(&order) } }), json!({ "what": h(&sacks), "to_owner": h(&c.f), "for": h(&order), "after": [h(&accept)] }));
    let _ = delivery;
    let empty = c.w.pay_as(&c.amara, &c.f, &c.amara.id.clone(), "5000");
    c.w.confirm(&c.leila, &empty);
    assert!(holds(&c.w.rows(&empty)));
    let draw = c.w.sign(&c.amara, "transfer", json!({ "amount": amt("10", "sack") }), json!({ "as": h(&c.f), "what": h(&sacks), "to_owner": c.amara.id }));
    c.w.confirm(&c.leila, &draw);
    let o = c.w.own(&sacks);
    let d = o["draws"].as_array().unwrap().iter().find(|d| d["block"] == draw["hash"]).unwrap_or_else(|| panic!("{o}"));
    assert_eq!(d["takes"], json!(false), "{o}");
    assert_eq!(c.w.speaks(&order), json!(h(&c.f)), "Harry's deal stands");
}

// C9a. Amara signs `as` F an account word: r1 names observe, so it holds; it is the café's account. Joe, under G (promise, transfer), signs one
// `as` F: no row holds; it acts on nothing.
#[test]
fn c9a_a_circles_account_word() {
    let mut c = cafe();
    let paylink = c.w.person(22);
    c.w.sign(&c.amara, "observe", json!({ "kind": "account", "destinations": [{ "destination": "PayLink 55", "by": paylink.id }] }), json!({ "as": h(&c.f) }));
    let a = call("account_of", json!([h(&c.f), c.w.blocks]));
    assert_eq!(a["destinations"], json!([{ "destination": "PayLink 55", "by": paylink.id }]), "{a}");
    let joe = c.w.person(8);
    let g = c.w.sign(&c.amara, "grant", json!({ "kind": "errands", "scope": { "types": ["promise", "transfer"], "each": gbp("100") } }), json!({ "as": h(&c.f), "to": joe.id }));
    let theirs = c.w.sign(&joe, "observe", json!({ "kind": "account", "destinations": [{ "destination": "Joe's tin", "by": joe.id }] }), json!({ "as": h(&c.f), "under": h(&g) }));
    assert!(!holds(&c.w.rows(&theirs)));
    assert_eq!(c.w.speaks(&theirs), Value::Null);
    let a = call("account_of", json!([h(&c.f), c.w.blocks]));
    assert_eq!(a["destinations"], json!([{ "destination": "PayLink 55", "by": paylink.id }]), "Joe's word is no head: {a}");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------------------------------------------

// C10. B1, Amara's £120 order `as` F: r1 holds (one hand, 50 part, at least 1; promise in its types; under £300). A row `{ parts: "all" }`:
// refused (`shape`).
#[test]
fn c10_a_row() {
    let mut c = cafe();
    let b1 = c.w.order_as(&c.amara, &c.f, &c.harry, "milk", "120");
    let r = c.w.rows(&b1);
    assert_eq!(hand(&r, &b1)["parts"], part("50"), "{r}");
    assert!(holds(&r), "{r}");
    let amara = c.amara.clone();
    let all = c.w.try_sign(&amara, "actor", json!({ "kind": "circle", "pack": part("100"), "rules": [{ "parts": "all", "scope": { "types": ["promise"] } }] }), json!({}));
    assert!(all.as_ref().is_err_and(|e| e.contains("shape")), "{all:?}");
    for bad in [json!({ "parts": 0, "scope": {} }), json!({ "to": [c.amara.id], "needed": { "of_members": "1/2" }, "scope": {} }), json!({ "parts": 1, "needed": 1, "scope": {} })] {
        let r = c.w.try_sign(&amara, "actor", json!({ "kind": "circle", "pack": part("100"), "rules": [bad] }), json!({}));
        assert!(r.as_ref().is_err_and(|e| e.contains("shape")), "{bad}: {r:?}");
    }
    let pack = c.w.try_sign(&amara, "actor", json!({ "kind": "circle", "pack": part("2.5") }), json!({}));
    assert!(pack.as_ref().is_err_and(|e| e.contains("shape")), "{pack:?}");
}

// C11. Grant M `as` L names 200 members (here 3, needed 2: the same count by ids). A version adds a row on M. Joseph buys parts; he and one
// friend... (scaled: Joseph alone, needed 2) does not hold: one id counted once. A newer word for M naming a new member, signed under a row that
// names grant: from there the row counts the new holder.
#[test]
fn c11_head_counts() {
    let mut w = World::new();
    let kofi = w.person(11);
    let joseph = w.person(12);
    let ama = w.person(15);
    let nia = w.person(16);
    let l = w.circle(&kofi, json!({ "pack": part("1000"), "rules": [{ "parts": 1, "scope": { "types": ["grant", "observe"] } }] }), json!({}));
    let lid = h(&l);
    let m = w.sign(&kofi, "grant", json!({ "kind": "members", "scope": { "types": ["observe"] } }), json!({ "as": lid, "to": sorted(vec![joseph.id.clone(), ama.id.clone()]) }));
    assert!(holds(&w.rows(&m)), "{}", w.rows(&m));
    let v = w.sign(&kofi, "actor", json!({ "kind": "circle", "pack": part("1000"), "rules": [{ "parts": 1, "scope": { "types": ["grant", "observe"] } }, { "to": h(&m), "needed": 2, "scope": { "types": ["transfer"], "each": amt("50000", "KES") } }] }), json!({ "as": lid, "updates": lid }));
    assert!(holds(&w.rows(&v)), "{}", w.rows(&v));
    // the rows that stand for a block are those of the version in its causal past (C19): Joseph's sale names it in `after`
    let sale = w.sign(&joseph, "transfer", json!({ "amount": amt("100", "KES") }), json!({ "as": lid, "to_owner": kofi.id, "after": [h(&v)] }));
    w.confirm(&joseph, &sale);
    let r = w.rows(&sale);
    assert!(!holds(&r), "one id counts once: {r}");
    // Nia joins: a newer word for M naming her, signed under the row that names grant
    let m2 = w.sign(&kofi, "grant", json!({ "kind": "members", "scope": { "types": ["observe"] } }), json!({ "as": lid, "updates": h(&m), "to": sorted(vec![joseph.id.clone(), ama.id.clone(), nia.id.clone()]) }));
    assert!(holds(&w.rows(&m2)), "{}", w.rows(&m2));
    let sale2 = w.sign(&joseph, "transfer", json!({ "amount": amt("100", "KES") }), json!({ "as": lid, "to_owner": kofi.id, "after": [h(&m2)] }));
    let c = w.confirm(&nia, &sale2);
    let r = w.rows(&sale2);
    assert!(holds(&r) && r["row"] == json!(1) && r["at"] == json!(h(&c)), "{r}");
}

// C12. Amara signs `as` F a £900 oven order: r1 does not hold (above each); it waits (`on: hands`). Leila confirms: holds by every owner. Kept
// word: Amara and Leila signed `as` F a £2,200 loan from Harry; Leila closes with no will; Amara signs, under r1, the £2,200 repayment `for` it:
// holds (counted when the loan stood).
#[test]
fn c12_bounds() {
    let mut c = cafe();
    let oven = c.w.order_as(&c.amara, &c.f, &c.harry, "oven", "900");
    let r = c.w.rows(&oven);
    assert!(!holds(&r), "{r}");
    let st = c.w.stands(&oven);
    assert_eq!(st["waiting"], json!([{ "block": h(&oven), "on": "hands" }]), "{st}");
    c.w.confirm(&c.leila, &oven);
    let r = c.w.rows(&oven);
    assert!(holds(&r) && r["every_owner"] == json!(true), "{r}");
    assert_eq!(c.w.stands(&oven)["stands"], json!(true));

    let mut c = cafe();
    let loan = c.w.sign(&c.amara, "promise", json!({ "terms": { "price": gbp("2200") } }), json!({ "as": h(&c.f), "what": kind("loan"), "from": c.harry.id, "to": h(&c.f) }));
    c.w.confirm(&c.leila, &loan);
    assert!(holds(&c.w.rows(&loan)));
    c.w.sign(&c.harry, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&loan), "for": h(&loan) }));
    c.w.close(&c.leila, &[]);
    let repay = c.w.sign(&c.amara, "transfer", json!({ "amount": gbp("2200") }), json!({ "as": h(&c.f), "to_owner": c.harry.id, "for": h(&loan) }));
    let r = c.w.rows(&repay);
    assert!(holds(&r) && r["row"] == json!(0), "{r}");
}

// C13 (D2, D3). Leila signs `as` F, under r1, a grant to her cousin's AI with each £5,000: wider than its row, so r1 does not cover it; it
// waits (`on: hands`), like any move outside every row, and no read finding names it. Amara's confirm: every owner together signs it. The
// same with each £100: holds by r1. A grant may name `on`, `parties`, `clocks` freely under a row that names none.
#[test]
fn c13_a_grant_from_a_row() {
    let mut c = cafe();
    let ai = c.w.person(60);
    let wide = c.w.sign(&c.leila, "grant", json!({ "kind": "errands", "scope": { "types": ["promise"], "each": gbp("5000") } }), json!({ "as": h(&c.f), "to": ai.id }));
    let r = c.w.rows(&wide);
    assert!(!holds(&r), "{r}");
    assert_eq!(r["waiting"], json!([{ "block": h(&wide), "on": "hands" }]), "{r}");
    let read = call("read", json!([wide, c.w.blocks]));
    assert!(!read.to_string().contains("wider_than_parent"), "{read}");
    c.w.confirm(&c.amara, &wide);
    let r = c.w.rows(&wide);
    assert!(holds(&r) && r["every_owner"] == json!(true), "{r}");
    let narrow = c.w.sign(&c.leila, "grant", json!({ "kind": "errands", "scope": { "types": ["promise"], "each": gbp("100"), "parties": [c.harry.id], "clocks": { "names": [c.n.id] } } }), json!({ "as": h(&c.f), "to": ai.id }));
    let r = c.w.rows(&narrow);
    assert!(holds(&r) && r["row"] == json!(0), "{r}");
    // a type the row does not name is wider too
    let types = c.w.sign(&c.leila, "grant", json!({ "kind": "errands", "scope": { "types": ["actor"], "each": gbp("100") } }), json!({ "as": h(&c.f), "to": ai.id }));
    assert!(!holds(&c.w.rows(&types)));
}

// C14. Amara signs `as` F, under r1, grant G to Joe (promise, transfer, each £100, meter T). Joe orders milk under G: speaks for the café's
// owners. Amara stops G `as` F under r1: holds; Joe's later blocks under G count for nothing. Joe's own stop of G holds alone.
#[test]
fn c14_anyone_who_owns_no_part() {
    let mut c = cafe();
    let joe = c.w.person(8);
    let (want, g) = c.joes_grant(&joe, None);
    let milk = c.joe_buys_milk(&joe, &want, &g, &[]);
    assert_eq!(c.w.speaks(&milk), json!(h(&c.f)));
    let stop = c.w.sign(&c.amara, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": h(&g), "as": h(&c.f) }));
    assert!(holds(&c.w.rows(&stop)), "{}", c.w.rows(&stop));
    let later = c.joe_buys_milk(&joe, &want, &g, &[&stop]);
    assert_ne!(c.w.speaks(&later), json!(h(&c.f)), "counts for nothing for the café");
    // a stop `as` F by one for whom no row holds ends nothing
    let mut c = cafe();
    let joe = c.w.person(8);
    let rex = c.w.person(10);
    let (want, g) = c.joes_grant(&joe, None);
    let no_stop = c.w.sign(&rex, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": h(&g), "as": h(&c.f) }));
    assert!(!holds(&c.w.rows(&no_stop)));
    let still = c.joe_buys_milk(&joe, &want, &g, &[&no_stop]);
    assert_eq!(c.w.speaks(&still), json!(h(&c.f)), "Rex's stop ends nothing");
    // Joe's own end of his place holds alone
    let mut c = cafe();
    let joe = c.w.person(8);
    let (want, g) = c.joes_grant(&joe, None);
    let own_stop = c.w.sign(&joe, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "answers": h(&g) }));
    let later = c.joe_buys_milk(&joe, &want, &g, &[&own_stop]);
    assert_ne!(c.w.speaks(&later), json!(h(&c.f)), "his own end of his place holds alone");
}

// C15. Amara signs the £900 order. Leila transfers her 50 part to Maria; then Leila confirms, the transfer in her confirm's past: her hand counts
// 0; 50 of 100; waits. Maria (having accepted) confirms: holds.
#[test]
fn c15_hands() {
    let mut c = cafe();
    let maria = c.w.person(9);
    let oven = c.w.order_as(&c.amara, &c.f, &c.harry, "oven", "900");
    let t = c.w.parts_to(&c.leila, &c.f, "50", &maria.id, None);
    let lc = c.w.sign(&c.leila, "observe", json!({ "kind": "confirm" }), json!({ "confirms": [h(&oven)], "after": [h(&t)] }));
    let r = c.w.rows(&oven);
    assert!(!holds(&r), "{r}");
    assert_eq!(hand(&r, &lc)["parts"], part("0"), "{r}");
    assert_eq!(hand(&r, &lc)["counts"], json!(false), "{r}");
    let y = c.w.yes(&maria, &t);
    c.w.sign(&maria, "observe", json!({ "kind": "confirm" }), json!({ "confirms": [h(&oven)], "after": [h(&y)] }));
    let r = c.w.rows(&oven);
    assert!(holds(&r) && r["every_owner"] == json!(true), "{r}");
    // a hand whose end the completing block has seen adds nothing: Amara's later sale of her parts, seen by Maria's confirm
    let mut c = cafe();
    let rex = c.w.person(10);
    let oven = c.w.order_as(&c.amara, &c.f, &c.harry, "oven", "900");
    let sold = c.w.parts_to(&c.amara, &c.f, "50", &rex.id, None);
    let ry = c.w.yes(&rex, &sold);
    let late = c.w.sign(&c.leila, "observe", json!({ "kind": "confirm" }), json!({ "confirms": [h(&oven)], "after": [h(&ry)] }));
    let r = c.w.rows(&oven);
    assert!(!holds(&r), "Amara's hand ended at her sale: {r}");
    let _ = late;
}

// C16. Story 1: Amara signs `as` F, under r1, £200 to herself: her hand counts for nothing; it acts on nothing. Leila confirms: holds. Story 2:
// Leila signs `as` F a hand-over of three open deals to her own stall (a circle she owns): waits until Amara signs. Story 3, three owners
// (Amara 40, Leila 40, Maria 20): Leila signs `as` F £300 to Amara: holds.
#[test]
fn c16_no_one_is_both_sides() {
    let mut c = cafe();
    let t = c.w.pay_as(&c.amara, &c.f, &c.amara.id.clone(), "200");
    let r = c.w.rows(&t);
    assert!(!holds(&r), "{r}");
    assert_eq!(hand(&r, &t)["why"], json!("not_voice"), "the hand of one the move gives to (C15, C16): {r}");
    assert_eq!(c.w.speaks(&t), Value::Null);
    c.w.confirm(&c.leila, &t);
    let r = c.w.rows(&t);
    assert!(holds(&r) && r["row"] == json!(0), "{r}");

    // Story 2
    let stall = c.w.circle(&c.leila, json!({ "pack": part("1"), "rules": [r1()] }), json!({}));
    let deals: Vec<Value> = (0..3).map(|i| c.w.order_as(&c.amara, &c.f, &c.harry, &format!("deal{i}"), "10")).collect();
    let ids = sorted(deals.iter().map(h).collect());
    let hand_over = c.w.sign(&c.leila, "transfer", json!({}), json!({ "as": h(&c.f), "what": ids, "to_owner": h(&stall) }));
    let r = c.w.rows(&hand_over);
    assert!(!holds(&r), "{r}");
    c.w.confirm(&c.amara, &hand_over);
    assert!(holds(&c.w.rows(&hand_over)), "{}", c.w.rows(&hand_over));

    // Story 3
    let mut w = World::new();
    let amara = w.person(3);
    let leila = w.person(5);
    let maria = w.person(9);
    let f = w.circle(&amara, json!({ "pack": part("100"), "rules": [r1()] }), json!({}));
    let tl = w.parts_to(&amara, &f, "40", &leila.id, None);
    w.yes(&leila, &tl);
    let tm = w.parts_to(&amara, &f, "20", &maria.id, None);
    w.yes(&maria, &tm);
    let pay = w.pay_as(&leila, &f, &amara.id.clone(), "300");
    let r = w.rows(&pay);
    assert!(holds(&r) && r["row"] == json!(0), "{r}");
}

// C17 (D4). A promise names one side: one standing promise to each owner, SP-A to Amara and SP-L to Leila, signed `as` F by every owner
// together (Amara signs, Leila confirms), no price (its terms say the rule in prose). The till pays under a row, not a grant: a version of F
// (every owner) adds `{ to: [T], needed: 1, scope: { types: [transfer], on: [SP-A, SP-L] } }`. Sunday the till signs `as` F £153.37 to Amara
// `for` SP-A and £153.38 to Leila `for` SP-L: each holds by that row (the till's place in `to`; it owns no part, so no one is both sides).
// A tool under a grant pays only what a deal names (stage 4, Due): `for` a promise stating no amount, a transfer under a grant is not_due.
#[test]
fn c17_a_payout_by_parts() {
    let mut c = cafe();
    let fid = h(&c.f);
    let rule = "each Sunday, the till's takings by parts, step 1p, Leila takes what is left";
    let sp_a = c.w.sign(&c.amara, "promise", json!({ "what": rule }), json!({ "as": fid, "from": fid, "to": c.amara.id }));
    c.w.confirm(&c.leila, &sp_a);
    let sp_l = c.w.sign(&c.amara, "promise", json!({ "what": rule }), json!({ "as": fid, "from": fid, "to": c.leila.id }));
    c.w.confirm(&c.leila, &sp_l);
    assert!(holds(&c.w.rows(&sp_a)) && holds(&c.w.rows(&sp_l)), "{}", c.w.rows(&sp_a));
    let row = json!({ "to": [c.till.id], "needed": 1, "scope": { "types": ["transfer"], "on": sorted(vec![h(&sp_a), h(&sp_l)]) } });
    let v = c.w.sign(&c.amara, "actor", json!({ "kind": "circle", "pack": part("100"), "rules": [r1(), row], "clocks": { "names": [c.n.id] } }), json!({ "as": fid, "updates": fid, "meter": c.till.id }));
    c.w.confirm(&c.leila, &v);
    assert!(holds(&c.w.rows(&v)), "{}", c.w.rows(&v));
    let till = c.till.clone();
    let pa = c.w.sign(&till, "transfer", json!({ "amount": gbp("153.37") }), json!({ "as": fid, "to_owner": c.amara.id, "for": h(&sp_a), "after": [h(&v)] }));
    let pl = c.w.sign(&till, "transfer", json!({ "amount": gbp("153.38") }), json!({ "as": fid, "to_owner": c.leila.id, "for": h(&sp_l), "after": [h(&v)] }));
    for p in [&pa, &pl] {
        let r = c.w.rows(p);
        assert!(holds(&r) && r["row"] == json!(1), "{r}");
        assert_eq!(hand(&r, p)["id"], json!(till.id), "{r}");
    }
    // a row's scope.on covers a transfer only `for` one of its promises
    let other = c.w.sign(&till, "transfer", json!({ "amount": gbp("5") }), json!({ "as": fid, "to_owner": c.amara.id, "after": [h(&v)] }));
    assert!(!holds(&c.w.rows(&other)), "{}", c.w.rows(&other));
    // under a grant instead: not due, the promise stating no amount
    let tg = c.w.sign(&c.amara, "grant", json!({ "kind": "payout", "scope": { "types": ["transfer"], "on": [h(&sp_a)], "limit": gbp("306.75") } }), json!({ "as": fid, "to": till.id, "meter": till.id }));
    let ctg = c.w.confirm(&c.leila, &tg);
    let under = c.w.sign(&till, "transfer", json!({ "amount": gbp("153.37") }), json!({ "under": h(&tg), "to_owner": c.amara.id, "for": h(&sp_a), "after": [h(&ctg)] }));
    let g = call("why_not_under", json!([under, c.w.blocks]));
    assert!(g.to_string().contains("not_due"), "{g}");
}

// C18. After G's stop, Joe signs `as` F an order of milk: waiting; acts on nothing; Joe's name is bound to its truth, his things are not.
#[test]
fn c18_one_answer_for_a_block_with_no_row() {
    let mut c = cafe();
    let joe = c.w.person(8);
    let order = c.w.order_as(&joe, &c.f, &c.harry, "milk", "30");
    let r = c.w.rows(&order);
    assert!(!holds(&r), "{r}");
    assert_eq!(r["waiting"], json!([{ "block": h(&order), "on": "hands" }]), "{r}");
    assert_eq!(c.w.speaks(&order), Value::Null, "it acts on nothing of anyone's, his own included");
    let b = call("backed", json!([order, joe.id, c.w.blocks]));
    assert_eq!(b["backed"], json!(false), "{b}");
}

// C19. Amara alone signs a version of F adding a row: F names no actor row; waits. Leila confirms: holds. A version that adds
// `{ parts: 1, scope: { types: [actor] } }`: that row is never read.
#[test]
fn c19_versions() {
    let mut c = cafe();
    let fid = h(&c.f);
    let extra = json!({ "parts": 60, "scope": { "types": ["promise"], "each": gbp("2000") } });
    let v1 = c.w.sign(&c.amara, "actor", json!({ "kind": "circle", "pack": part("100"), "rules": [r1(), extra], "clocks": { "names": [c.n.id] } }), json!({ "as": fid, "updates": fid }));
    assert!(!holds(&c.w.rows(&v1)), "{}", c.w.rows(&v1));
    let before = c.w.order_as(&c.amara, &c.f, &c.harry, "oven", "900");
    assert!(!holds(&c.w.rows(&before)));
    c.w.confirm(&c.leila, &v1);
    assert!(holds(&c.w.rows(&v1)), "{}", c.w.rows(&v1));
    let vs = call("circle_versions", json!([fid, c.w.blocks]));
    assert_eq!(vs["now"], json!(h(&v1)), "{vs}");
    assert_eq!(vs["versions"].as_array().unwrap().len(), 1, "versions only, not the founding block: {vs}");
    assert_eq!(vs["versions"][0]["hands"], json!(sorted(vec![c.amara.id.clone(), c.leila.id.clone()])), "{vs}");
    assert_eq!(c.w.state(&c.f)["meter"], Value::Null, "a version that names no meter leaves the circle with none (D8): {vs}");
    // a block made after the version, with it in its past, is read under its rows: 60 parts are Amara's 50 and Leila's 50
    let oven = c.w.sign(&c.amara, "promise", json!({ "terms": { "price": gbp("900") } }), json!({ "as": fid, "what": kind("oven"), "from": c.harry.id, "to": fid, "after": [h(&v1)] }));
    c.w.confirm(&c.leila, &oven);
    let r = c.w.rows(&oven);
    assert!(holds(&r) && r["row"] == json!(1), "{r}");
    // a version that adds an actor row: never read; a later version by Amara alone still waits
    let v2 = c.w.sign(&c.amara, "actor", json!({ "kind": "circle", "pack": part("100"), "rules": [r1(), { "parts": 1, "scope": { "types": ["actor"] } }] }), json!({ "as": fid, "updates": h(&v1) }));
    c.w.confirm(&c.leila, &v2);
    let v3 = c.w.sign(&c.amara, "actor", json!({ "kind": "circle", "pack": part("100"), "rules": [r1()] }), json!({ "as": fid, "updates": h(&v2) }));
    assert!(!holds(&c.w.rows(&v3)), "{}", c.w.rows(&v3));
}

// C20. Amara stops G under r1, received on N; then Joe's order `as` F under G, received on N after: counts for nothing. (The grant names the
// circle's clock N.) D11: every hand is read on the clock too: Leila confirms the £900 oven order, then sells her 50 parts to Maria; N receives
// the sale before her confirm, so her confirm has seen her end and adds nothing: the order waits. Without N's receipts it holds.
#[test]
fn c20_a_circles_clock() {
    let mut c = cafe();
    let joe = c.w.person(8);
    let n = c.n.clone();
    let (want, g) = c.joes_grant(&joe, Some(json!({ "names": [n.id] })));
    let stop = c.w.sign(&c.amara, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": h(&g), "as": h(&c.f) }));
    let rs = c.w.receipt(&n, &[&stop], json!({}));
    let order = c.joe_buys_milk(&joe, &want, &g, &[]);
    c.w.sign(&n, "observe", json!({ "kind": "receipt" }), json!({ "derives_from": [h(&order)], "after": [h(&rs)] }));
    assert_ne!(c.w.speaks(&order), json!(h(&c.f)), "counts for nothing");
    let s = c.w.state(&c.f);
    assert_eq!(s["clocks"], json!({ "names": [n.id] }), "{s}");

    for received in [true, false] {
        let mut c = cafe();
        let maria = c.w.person(9);
        let n = c.n.clone();
        let oven = c.w.order_as(&c.amara, &c.f, &c.harry, "oven", "900");
        let lc = c.w.confirm(&c.leila, &oven);
        // her sale, signed after her confirm, not in its past
        let p2 = c.p2.clone();
        let sale = c.w.sign(&c.leila, "transfer", json!({ "amount": part("50") }), json!({ "what": h(&c.f), "to_owner": maria.id, "after": [h(&p2)] }));
        if received {
            let r1 = c.w.receipt(&n, &[&sale], json!({}));
            c.w.sign(&n, "observe", json!({ "kind": "receipt" }), json!({ "derives_from": sorted(vec![h(&lc), h(&oven)]), "after": [h(&r1)] }));
        }
        let r = c.w.rows(&oven);
        assert_eq!(holds(&r), !received, "received {received}: {r}");
        if received {
            assert_eq!(hand(&r, &lc)["why"], json!("not_voice"), "{r}");
        }
    }
}

// C21 (D12). T named. Two tills each sell the last loaf `as` F; T's receipts order them on the circle's one line: the one T receipted first
// takes the loaf, the other takes nothing (`past`). (The world's row names transfers with no bound: r1's `each` is in GBP, and a bound bounds
// every kind, so r1 would not cover a loaf.) No meter: Leila signs 100 sacks `as` F; she then transfers all her parts away and holds no grant.
// Amara's transfer `as` F of 20 sacks to Bo, Leila's last block in its past and named in `state.counted_to`, Maria confirming: it takes on
// Leila's line, now Amara's (held). Bo accepts: the café 80, Bo 20. Leila's own key then signs 10 of them away: `not_owner`.
#[test]
fn c21_a_circles_line() {
    let mut w = World::new();
    let amara = w.person(3);
    let leila = w.person(5);
    let till = w.person(20);
    let bo = w.person(22);
    let cy = w.person(23);
    let f = w.circle(&amara, json!({ "pack": part("100"), "rules": [{ "parts": 1, "scope": { "types": ["transfer", "thing"] } }] }), json!({ "meter": till.id }));
    let fid = h(&f);
    let p1 = w.parts_to(&amara, &f, "50", &leila.id, None);
    w.yes(&leila, &p1);
    assert_eq!(w.state(&f)["meter"], json!(till.id));
    let loaf = w.sign(&amara, "thing", json!({ "kind": "bread", "pack": amt("1", "loaf") }), json!({ "as": fid, "of": kind("bread") }));
    let s1 = w.sign(&amara, "transfer", json!({ "amount": amt("1", "loaf") }), json!({ "as": fid, "what": h(&loaf), "to_owner": bo.id }));
    let s2 = w.sign(&leila, "transfer", json!({ "amount": amt("1", "loaf") }), json!({ "as": fid, "what": h(&loaf), "to_owner": cy.id, "after": [h(&loaf)] }));
    assert!(holds(&w.rows(&s1)) && holds(&w.rows(&s2)));
    w.receipt(&till, &[&s2], json!({}));
    w.receipt(&till, &[&s1], json!({}));
    let o = w.own(&loaf);
    let row = |b: &Value| o["draws"].as_array().unwrap().iter().find(|d| d["block"] == b["hash"]).cloned().unwrap_or_else(|| panic!("{o}"));
    assert_eq!((row(&s2)["takes"].clone(), row(&s1)["takes"].clone(), row(&s1)["why"].clone()), (json!(true), json!(false), json!("past")), "{o}");

    let mut c = cafe_no_meter();
    let maria = c.w.person(9);
    let bo = c.w.person(22);
    let fid = h(&c.f);
    let sacks = c.w.sign(&c.leila, "thing", json!({ "kind": "flour", "pack": amt("100", "sack") }), json!({ "as": fid, "of": kind("flour") }));
    let away = c.w.parts_to(&c.leila, &c.f, "50", &maria.id, None);
    c.w.yes(&maria, &away);
    let last = c.w.sign(&c.leila, "observe", json!({ "kind": "note" }), json!({ "derives_from": [h(&sacks)] }));
    let take = c.w.sign(&c.amara, "transfer", json!({ "amount": amt("20", "sack"), "counted_to": h(&last) }), json!({ "as": fid, "what": h(&sacks), "to_owner": bo.id, "after": [h(&last)] }));
    c.w.confirm(&maria, &take);
    let o = c.w.own(&sacks);
    let d = o["draws"].as_array().unwrap().iter().find(|d| d["block"] == take["hash"]).cloned().unwrap_or_else(|| panic!("{o}"));
    assert_eq!((d["takes"].clone(), d["state"].clone()), (json!(true), json!("held")), "{o}");
    c.w.yes(&bo, &take);
    let o = c.w.own(&sacks);
    let owners: Vec<(String, String)> = o["owners"].as_array().unwrap().iter().map(|x| (x["owner"].as_str().unwrap().to_string(), x["amount"]["value"].as_str().unwrap().to_string())).collect();
    assert_eq!(owners, { let mut v = vec![(fid.clone(), "80".to_string()), (bo.id.clone(), "20".to_string())]; v.sort(); v }, "{o}");
    let own = c.w.sign(&c.leila, "transfer", json!({ "amount": amt("10", "sack") }), json!({ "what": h(&sacks), "to_owner": maria.id }));
    let o = c.w.own(&sacks);
    let d = o["draws"].as_array().unwrap().iter().find(|d| d["block"] == own["hash"]).cloned().unwrap();
    assert_eq!((d["takes"].clone(), d["why"].clone()), (json!(false), json!("not_owner")), "{o}");
}

// C22. The till signs one transfer of £306.75 `to_owner [Amara, Leila]`: refused (`grammar`).
#[test]
fn c22_one_id_where_one_id_is_wanted() {
    let mut c = cafe();
    let till = c.till.clone();
    let r = c.w.try_sign(&till, "transfer", json!({ "amount": gbp("306.75") }), json!({ "to_owner": sorted(vec![c.amara.id.clone(), c.leila.id.clone()]) }));
    assert!(r.as_ref().is_err_and(|e| e.contains("grammar")), "{r:?}");
}

// C23. Amara signs `as` F under r1 job J to Ben, £12 an hour. Ben signs in his own name `work` 40 hours `for` J: his word. The same block
// signed `as` F: Ben owns no part and holds no grant naming it; acts on nothing.
#[test]
fn c23_work() {
    let mut c = cafe();
    let ben = c.w.person(7);
    let job = c.w.sign(&c.amara, "promise", json!({ "terms": { "price": { "amount": gbp("12"), "per": amt("1", "hour") }, "quantity": amt("40", "hour") } }), json!({ "as": h(&c.f), "what": kind("work"), "from": ben.id, "to": h(&c.f) }));
    let _ = job;
    let mine = c.w.sign(&ben, "observe", json!({ "kind": "work", "amount": amt("40", "hour") }), json!({ "for": h(&job) }));
    assert_eq!(c.w.speaks(&mine), json!(ben.id));
    let as_f = c.w.sign(&ben, "observe", json!({ "kind": "work", "amount": amt("40", "hour") }), json!({ "for": h(&job), "as": h(&c.f) }));
    assert_eq!(c.w.speaks(&as_f), Value::Null);
    assert!(!holds(&c.w.rows(&as_f)));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Readings and counts
// ---------------------------------------------------------------------------------------------------------------------------------------

// ways_in (07 R16), a reading: r1's least is 1 (either owner); the every-owner way's least is 2. count_of: a whole number only.
#[test]
fn ways_in_and_counts() {
    let c = cafe();
    let ways = call("ways_in", json!([h(&c.f), c.w.blocks]));
    assert_eq!(ways["rows"], json!([{ "row": 0, "least": 1 }]), "{ways}");
    assert_eq!(ways["every_owner"], json!({ "least": 2 }), "{ways}");
    assert_eq!(call("count_of", json!([2, 3])), json!(2));
    assert_eq!(call("count_of", json!(["all", 3])), Value::Null);
    assert_eq!(call("count_of", json!([{ "of_members": "2/3" }, 3])), Value::Null);
    assert_eq!(call("count_of", json!([4, 3])), Value::Null);
}

// Invariant 27 and `backed`: a block `as` a circle speaks for its owners only where a row holds; a hand of P's among those its row counted
// backs it for P (authority.md, Backed by a person).
#[test]
fn invariant_27_and_backed() {
    let mut c = cafe();
    let b1 = c.w.order_as(&c.amara, &c.f, &c.harry, "milk", "120");
    let b = call("backed", json!([b1, c.amara.id, c.w.blocks]));
    assert_eq!(b["backed"], json!(true), "{b}");
    let b = call("backed", json!([b1, c.leila.id, c.w.blocks]));
    assert_eq!(b["backed"], json!(false), "Leila signed no hand of it: {b}");
    let b = call("backed", json!([b1, h(&c.f), c.w.blocks]));
    assert_eq!(b["backed"], json!(true), "{b}");
    // a 1.8 founding block with roles is refused: roles are no field
    let draft = json!({ "type": "actor", "state": { "kind": "circle", "roles": [{ "name": "owner", "powers": ["sign"] }] }, "refs": {} });
    let codes = call("write_refusals", json!([draft, c.w.blocks]));
    assert!(!codes.as_array().unwrap().is_empty(), "{codes}");
}

// C9b, the listing (a reading). Harry's order `as` F stands and is not done; the owners then move £5,000 to Amara (C6), not having Harry's
// deal in its past: listed beside it. A sale of the oven to Amara's cousin for £1 gives to no owner and is not listed.
#[test]
fn c9b_the_listing() {
    let mut c = cafe();
    let cousin = c.w.person(61);
    let order = c.w.order_as(&c.amara, &c.f, &c.harry, "sack", "205");
    c.w.sign(&c.harry, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&order), "for": h(&order) }));
    let p2 = c.p2.clone();
    let empty = c.w.sign(&c.leila, "transfer", json!({ "amount": gbp("5000") }), json!({ "as": h(&c.f), "to_owner": c.amara.id, "after": [h(&p2)] }));
    let r = c.w.rows(&empty);
    assert_eq!(r["listed"], json!([h(&order)]), "{r}");
    let oven = c.w.sign(&c.leila, "promise", json!({ "terms": { "price": gbp("1") } }), json!({ "as": h(&c.f), "what": kind("oven"), "from": h(&c.f), "to": cousin.id, "after": [h(&p2)] }));
    assert_eq!(c.w.rows(&oven)["listed"], json!([]), "{}", c.w.rows(&oven));
}

// O1. `binds(draft, held)`: an accept binds; a draft that gives something of the one whose word it is (`as` where signed as a circle, else
// its author) binds; a note gives nothing and binds no one.
#[test]
fn o1_binds() {
    let c = cafe();
    let fid = h(&c.f);
    let accept = json!({ "type": "promise", "state": { "status": "accepted" }, "refs": { "author": c.harry.id, "answers": fid } });
    assert_eq!(call("binds", json!([accept, c.w.blocks])), json!(true));
    let pay = json!({ "type": "transfer", "state": { "amount": gbp("10") }, "refs": { "author": c.amara.id, "to_owner": c.harry.id } });
    assert_eq!(call("binds", json!([pay, c.w.blocks])), json!(true));
    let note = json!({ "type": "observe", "state": { "kind": "note" }, "refs": { "author": c.amara.id } });
    assert_eq!(call("binds", json!([note, c.w.blocks])), json!(false));
}

// C12, D9: a row's `limit` counts what the same row held for in the block's causal past, plus this one. Under a row `{ parts: 1, scope:
// { types: [transfer], limit: £100 } }`, £60 holds; a second £60, the first in its past, is above the limit: it waits.
#[test]
fn c12_a_rows_limit() {
    let mut w = World::new();
    let amara = w.person(3);
    let harry = w.person(1);
    let f = w.circle(&amara, json!({ "pack": part("10"), "rules": [{ "parts": 1, "scope": { "types": ["transfer"], "limit": gbp("100") } }] }), json!({}));
    // (Amara owns every part, so every owner holds what the row does not: the row's answer is `row`)
    let a = w.pay_as(&amara, &f, &harry.id.clone(), "60");
    assert_eq!(w.rows(&a)["row"], json!(0), "{}", w.rows(&a));
    let b = w.pay_as(&amara, &f, &harry.id.clone(), "60");
    assert_eq!(w.rows(&b)["row"], Value::Null, "{}", w.rows(&b));
    let small = w.pay_as(&amara, &f, &harry.id.clone(), "30");
    assert_eq!(w.rows(&small)["row"], json!(0), "60 and 30 (the second 60 held by every owner, not by this row): {}", w.rows(&small));
    let over = w.pay_as(&amara, &f, &harry.id.clone(), "20");
    assert_eq!(w.rows(&over)["row"], Value::Null, "60, 30 and 20: {}", w.rows(&over));
}

// D19. Rekeys: a key grant `as` the circle, `refs.subject` the circle, for which a row holds, chained by epoch. A stranger's rekey: no row
// holds, still epoch 0.
#[test]
fn rekeys() {
    let mut w = World::new();
    let amara = w.person(3);
    let stranger = w.person(9);
    let k = |s: &str| kind(s);
    let f = w.circle(&amara, json!({ "pack": part("100"), "rules": [{ "parts": 50, "scope": { "types": ["grant"] } }], "public_key_encrypt": k("epoch0") }), json!({}));
    let fid = h(&f);
    // a rekey's `epoch` and `keys` are declared by the profile's schema, named by the block (1.9 stage 7: a profile adds no field)
    let schema = w.sign(&amara, "thing", json!({ "kind": "schema", "name": "rekey", "target": "grant.key", "fields": { "epoch": "a whole number", "keys": "the encryption keys, sealed" } }), json!({}));
    let sid = h(&schema);
    assert!(w.try_sign(&amara, "grant", json!({ "kind": "key", "epoch": 1, "public_key_encrypt": k("epoch1"), "keys": [k("sealed-1")] }), json!({ "as": fid, "subject": fid, "after": [fid] })).unwrap_err().contains("undeclared_field"));
    let bad = w.sign(&stranger, "grant", json!({ "kind": "key", "epoch": 1, "public_key_encrypt": k("evil"), "keys": [k("sealed-evil")] }), json!({ "as": fid, "subject": fid, "schema": sid, "after": [fid] }));
    assert_eq!(call("circle_key", json!([fid, w.blocks]))["epoch"], json!(0));
    let _ = bad;
    w.sign(&amara, "grant", json!({ "kind": "key", "epoch": 1, "public_key_encrypt": k("epoch1"), "keys": [k("sealed-1")] }), json!({ "as": fid, "subject": fid, "schema": sid, "after": [fid] }));
    let key = call("circle_key", json!([fid, w.blocks]));
    assert_eq!((key["epoch"].clone(), key["keys"].clone()), (json!(1), json!([k("epoch1")])), "{key}");
}

// The oracle's stories of this stage (spec/oracle/stage6, exported to tests/fixtures/stage6.json with the oracle's answers), asked of the
// core: the same answer, a refusal's `detail` aside. Regenerate: node spec/oracle/stage6/export.cjs.
fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
#[test]
fn the_oracle_stories_of_stage_6() {
    let text = std::fs::read_to_string(std::env::var("FB_FIXTURE").unwrap_or(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/stage6.json").into())).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    let mut differ = vec![];
    let qs = all["questions"].as_array().unwrap();
    let skip = std::env::var("FB_SKIP").unwrap_or_default();
    for (i, q) in qs.iter().enumerate() {
        let op = q["op"].as_str().unwrap();
        if matches!(op, "keypair" | "seal") || skip.split(',').any(|s| s == i.to_string()) {
            continue;
        }
        if std::env::var("FB_TRACE").is_ok() {
            eprintln!("question {i} {} {op}", q["story"]);
        }
        let out = answer(op.as_bytes(), q["args"].to_string().as_bytes());
        record(&format!("oracle {}", q["story"].as_str().unwrap()), op, &q["args"], &out);
        let ok = match q.get("error") {
            Some(_) => out.get("ok").is_none(),
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
