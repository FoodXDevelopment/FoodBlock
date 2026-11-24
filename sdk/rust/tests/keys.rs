//! Keys: her list of voices, waits and reaches on her clock, signing twice, keys under a voice, the cut, and
//! `refs.key` (identity.md; blocks.md, Time, A named clock, The cut, Finality). Each test is a small world of signed blocks.
use foodblock::door::answer;
use foodblock::identity::{genesis, key_hash, GenesisOptions};
use foodblock::{keypair_from_seed, write, ComposeOptions, Keypair, Readers, WriteOptions};
use serde_json::{json, Value};

struct World {
    blocks: Vec<Value>,
    minute: u32,
}
struct Person {
    id: String,
    keys: Keypair,
}

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

impl World {
    fn new() -> World {
        World { blocks: vec![], minute: 0 }
    }
    fn at(&mut self) -> String {
        self.minute += 1;
        format!("2026-11-01T{:02}:{:02}:00.000Z", self.minute / 60, self.minute % 60)
    }
    fn key(seed: u8) -> Keypair {
        keypair_from_seed(&format!("{seed:02x}").repeat(32)).unwrap()
    }
    fn person(&mut self, seed: u8) -> Person {
        self.person_with(seed, "", None)
    }
    fn person_with(&mut self, seed: u8, reach: &str, clocks: Option<Value>) -> Person {
        let keys = World::key(seed);
        let at = self.at();
        let g = genesis(&keys, &GenesisOptions { kind: "person", at, audience: Some(Readers::Public), reach, clocks, ..Default::default() }).unwrap();
        self.blocks.push(g.clone());
        Person { id: g["hash"].as_str().unwrap().to_string(), keys }
    }
    /// A block of `author`, signed by `key`, at the next minute (or at `at`).
    fn sign(&mut self, author: &str, key: &Keypair, t: &str, state: Value, refs: Value) -> Value {
        let at = self.at();
        self.sign_at(author, key, t, state, refs, &at)
    }
    fn sign_at(&mut self, author: &str, key: &Keypair, t: &str, state: Value, refs: Value, at: &str) -> Value {
        let o = WriteOptions {
            compose: ComposeOptions { author: author.into(), at: Some(at.into()), audience: Some(Readers::Public), ..Default::default() },
            key: Some(key),
            blocks: &self.blocks,
            schemas: None,
        };
        let b = write(t, &state, &refs, &o).unwrap_or_else(|e| panic!("{t} {state}: {e:?}"));
        self.blocks.push(b.clone());
        b
    }
    fn mine(&mut self, p: &Person, t: &str, state: Value, refs: Value) -> Value {
        let keys = p.keys.clone();
        self.sign(&p.id, &keys, t, state, refs)
    }
    fn confirm(&mut self, author: &str, key: &Keypair, word: &Value, after: &[&Value]) -> Value {
        let mut refs = json!({ "confirms": [word["hash"]] });
        if !after.is_empty() {
            let mut a: Vec<String> = after.iter().map(|b| b["hash"].as_str().unwrap().to_string()).collect();
            a.sort();
            refs["after"] = json!(a);
        }
        self.sign(author, key, "observe", json!({ "kind": "note" }), refs)
    }
    fn receipt(&mut self, clock: &Person, of: &Value) -> Value {
        let keys = clock.keys.clone();
        self.sign(&clock.id, &keys, "observe", json!({ "kind": "receipt" }), json!({ "derives_from": [of["hash"]] }))
    }
    /// A span's cutoff states the span as its `when` and runs from the receipt it names in `refs.derives_from`
    fn span_cutoff(&mut self, clock: &Person, word: &Value, from: &Value, span: &str) -> Value {
        let keys = clock.keys.clone();
        self.sign(&clock.id, &keys, "observe", json!({ "kind": "cutoff", "when": span }), json!({ "subject": word["hash"], "derives_from": [from["hash"]] }))
    }
    fn stands(&self, b: &Value) -> Value {
        call("stands", json!([b, self.blocks]))
    }
    fn signed(&self, b: &Value) -> bool {
        call("signed_by_author", json!([b, self.blocks])) == json!(true)
    }
    fn state(&self, id: &str) -> Value {
        call("identity_state", json!([id, self.blocks]))
    }
}

fn on(s: &Value) -> Vec<String> {
    s["waiting"].as_array().unwrap().iter().map(|w| w["on"].as_str().unwrap().to_string()).collect()
}
fn sorted(mut v: Vec<String>) -> Vec<String> {
    v.sort();
    v
}

#[test]
fn a_genesis_is_a_list_of_one_voice() {
    let mut w = World::new();
    let maria = w.person(1);
    let s = w.state(&maria.id);
    // per voice, whether it states that what it signs passes
    assert_eq!(s["voices"], json!([{ "key": maria.keys.public_key_sign, "passes": false }]));
    assert_eq!(s["clocks"], Value::Null);
    assert_eq!(s["keys"], json!([maria.keys.public_key_sign]));
    // a block of the genesis key names no refs.key
    let note = w.mine(&maria, "observe", json!({ "kind": "note" }), json!({}));
    assert!(note["refs"].get("key").is_none());
    assert!(w.signed(&note));
}

#[test]
fn a_list_is_refused_when_its_shape_is_wrong() {
    let refused = |state: Value, refs: Value| -> Vec<String> {
        // what a writer refuses: checks 1 to 4 (check 2 types a list) and a closed type's own (check 8)
        foodblock::write_refusals("grant", &state, &refs, Default::default()).into_iter().map(|r| r.code).collect()
    };
    let (a, b) = ("a".repeat(64), "b".repeat(64));
    let k = World::key(9).public_key_sign;
    let base = |voices: Value, clocks: Option<Value>| {
        let mut s = json!({ "kind": "key", "voices": voices, "seq": 1, "at": "2026-11-01T00:00:00.000Z", "audience": "public" });
        if let Some(k) = clocks {
            s["clocks"] = k;
        }
        s
    };
    let refs = json!({ "author": a, "prev": a, "subject": a, "updates": a });
    // a reach with no clocks is no list
    assert!(refused(base(json!([{ "key": k, "reach": "P1D" }]), None), refs.clone()).contains(&"shape".to_string()));
    // the first voice is never other people
    assert!(refused(base(json!([{ "names": [a, b], "needed": 2 }, { "key": k }]), None), refs.clone()).contains(&"shape".to_string()));
    // a wait above zero names a clock; with one it is fine
    assert!(refused(base(json!([{ "key": k }, { "names": [a], "wait": "P7D" }]), None), refs.clone()).contains(&"shape".to_string()));
    assert_eq!(refused(base(json!([{ "key": k }, { "names": [a], "wait": "P7D" }]), Some(json!({ "names": [a, b], "needed": 2 }))), refs.clone()), Vec::<String>::new());
    // clocks' names are sorted, each once
    assert!(refused(base(json!([{ "key": k }, { "names": [a], "wait": "P7D" }]), Some(json!({ "names": [b, a], "needed": 2 }))), refs.clone()).contains(&"shape".to_string()));
    // a list names the list it replaces
    let no_updates = json!({ "author": a, "prev": a, "subject": a });
    assert!(refused(base(json!([{ "key": k }]), None), no_updates).contains(&"required".to_string()));
}

// The phone's first voice writes Maria's list: her card by hash first, her mum and brother (both, a week), her phone (a month, a day's
// reach); her clock is the shop, her host and her aunt, any two.
struct Maria {
    w: World,
    maria: Person,
    mum: Person,
    brother: Person,
    shop: Person,
    host: Person,
    card: Keypair,
    list: Value,
    yes: Value,
}
fn maria() -> Maria {
    let mut w = World::new();
    let maria = w.person(1);
    let mum = w.person(2);
    let brother = w.person(3);
    let shop = w.person(4);
    let host = w.person(5);
    let aunt = w.person(6);
    let card = World::key(7);
    let relatives = sorted(vec![mum.id.clone(), brother.id.clone()]);
    let clocks = sorted(vec![shop.id.clone(), host.id.clone(), aunt.id.clone()]);
    let list = w.mine(
        &maria,
        "grant",
        json!({ "kind": "key", "voices": [
            { "key_hash": key_hash(&card.public_key_sign) },
            { "names": relatives, "needed": 2, "wait": "P7D" },
            { "key": maria.keys.public_key_sign, "wait": "P30D", "reach": "P1D" },
        ], "clocks": { "names": clocks, "needed": 2 } }),
        json!({ "subject": maria.id, "updates": maria.id }),
    );
    let list2 = list.clone();
    let mk = maria.keys.clone();
    let id = maria.id.clone();
    // the first voice's wait is zero: it stands when signed (signing twice is her own choice, a wait above zero; her own
    // word stands alone, so it waits on no end); her second signature changes nothing
    assert_eq!(w.stands(&list)["stands"], json!(true));
    let yes = w.confirm(&id, &mk, &list2, &[]);
    assert_eq!(w.stands(&list)["stands"], json!(true));
    Maria { w, maria, mum, brother, shop, host, card, list, yes }
}

#[test]
fn the_first_voice_stands_at_its_second_signature() {
    let m = maria();
    let s = m.w.state(&m.maria.id);
    assert_eq!(s["voices"].as_array().unwrap().len(), 3);
    assert_eq!(s["keys"], json!([m.maria.keys.public_key_sign]));
}

#[test]
fn a_lost_phone_is_put_back_by_her_relatives_after_a_quiet_week() {
    let mut m = maria();
    let phone2 = World::key(8);
    let last = m.w.mine(&m.maria, "observe", json!({ "kind": "note", "text": "last phone block" }), json!({}));
    let mut voices = m.list["state"]["voices"].clone();
    voices[2]["key"] = json!(phone2.public_key_sign);
    let (mum, brother) = (m.mum.keys.clone(), m.brother.keys.clone());
    let g = m.w.sign(&m.mum.id.clone(), &mum, "grant", json!({ "kind": "key", "voices": voices, "clocks": m.list["state"]["clocks"], "counted_to": last["hash"] }), json!({ "subject": m.maria.id, "updates": m.list["hash"] }));
    let b1 = m.w.confirm(&m.brother.id.clone(), &brother, &g, &[]);
    assert!(on(&m.w.stands(&g)).contains(&"wait".to_string()));
    // two clocks receipt it; a week on, their cutoffs close the wait
    let r1 = m.w.receipt(&m.shop, &g);
    let r2 = m.w.receipt(&m.host, &g);
    // signed again before the wait ran: still waiting
    let early = m.w.confirm(&m.mum.id.clone(), &mum, &g, &[&b1]);
    assert_eq!(m.w.stands(&g)["stands"], json!(false));
    let _ = early;
    let c1 = m.w.span_cutoff(&m.shop, &g, &r1, "P7D");
    let c2 = m.w.span_cutoff(&m.host, &g, &r2, "P7D");
    assert!(on(&m.w.stands(&g)).contains(&"confirm".to_string()));
    m.w.confirm(&m.mum.id.clone(), &mum, &g, &[&c1, &c2]);
    m.w.confirm(&m.brother.id.clone(), &brother, &g, &[&c1, &c2, &b1]);
    assert_eq!(m.w.stands(&g)["stands"], json!(true), "{}", m.w.stands(&g));
    let s = m.w.state(&m.maria.id);
    assert_eq!(s["keys"], json!([phone2.public_key_sign]));
    // the new phone names the key grant that brought it in
    let id = m.maria.id.clone();
    let seen: Vec<String> = m.w.blocks.iter().rev().take(2).map(|b| b["hash"].as_str().unwrap().to_string()).collect();
    let n = m.w.sign(&id, &phone2, "observe", json!({ "kind": "note" }), json!({ "after": sorted(seen) }));
    assert_eq!(n["refs"]["key"], g["hash"]);
    assert!(m.w.signed(&n));
    // the old phone's block on the counted line still speaks; one after the cut does not
    assert!(m.w.signed(&last));
    let old = m.maria.keys.clone();
    let after = m.w.sign(&id, &old, "observe", json!({ "kind": "note" }), json!({ "after": [g["hash"]] }));
    assert!(!m.w.signed(&after));
}

#[test]
fn a_no_from_a_voice_above_received_first_sets_a_key_grant_aside_for_good() {
    let mut m = maria();
    let thief = World::key(9);
    // the phone (place 2) puts the thief's key in its own place: it waits thirty days
    let mut voices = m.list["state"]["voices"].clone();
    voices[2]["key"] = json!(thief.public_key_sign);
    let g = m.w.mine(&m.maria, "grant", json!({ "kind": "key", "voices": voices, "clocks": m.list["state"]["clocks"] }), json!({ "subject": m.maria.id, "updates": m.list["hash"] }));
    let r1 = m.w.receipt(&m.shop, &g);
    let r2 = m.w.receipt(&m.host, &g);
    // her card shows itself and says no: it restates the list unchanged
    let card = m.card.clone();
    let id = m.maria.id.clone();
    let no = m.w.sign(&id, &card, "grant", json!({ "kind": "key", "voices": m.list["state"]["voices"], "clocks": m.list["state"]["clocks"], "shown_key": card.public_key_sign }), json!({ "subject": id, "updates": m.list["hash"], "key": m.list["hash"], "after": [m.yes["hash"]] }));
    // a key speaks only under a list standing in its block's own causal past: the card's first block has seen the list's second signature
    assert_eq!(no["refs"]["key"], m.list["hash"]);
    assert_eq!(no["refs"]["prev"], m.list["hash"]);
    assert!(m.w.signed(&no), "a key named by hash speaks by showing itself: {}", call("valid", json!([no, m.w.blocks])));
    m.w.receipt(&m.shop, &no);
    let c1 = m.w.span_cutoff(&m.shop, &g, &r1, "P30D");
    let c2 = m.w.span_cutoff(&m.host, &g, &r2, "P30D");
    let old = m.maria.keys.clone();
    m.w.confirm(&id, &old, &g, &[&c1, &c2]);
    assert_eq!(m.w.stands(&g), json!({ "stands": false, "waiting": [] }), "one clock's line held the no first");
}

#[test]
fn the_planted_grant_never_stands_without_its_second_signature() {
    let mut m = maria();
    let leila = m.w.person(10);
    let g = m.w.mine(&m.maria, "grant", json!({ "kind": "act", "scope": { "types": ["transfer"] } }), json!({ "to": leila.id }));
    assert_eq!(m.w.stands(&g)["stands"], json!(false));
    assert!(on(&m.w.stands(&g)).contains(&"wait".to_string()));
}

#[test]
fn a_voice_never_loosens_its_own_wait() {
    let mut m = maria();
    let mut voices = m.list["state"]["voices"].clone();
    voices[2]["wait"] = json!("PT0S");
    let g = m.w.mine(&m.maria, "grant", json!({ "kind": "key", "voices": voices, "clocks": m.list["state"]["clocks"] }), json!({ "subject": m.maria.id, "updates": m.list["hash"] }));
    assert_eq!(m.w.stands(&g), json!({ "stands": false, "waiting": [] }));
}

#[test]
fn taking_oneself_out_stands_when_signed() {
    let mut m = maria();
    let mut voices = m.list["state"]["voices"].clone();
    voices.as_array_mut().unwrap().remove(2);
    let g = m.w.mine(&m.maria, "grant", json!({ "kind": "key", "voices": voices, "clocks": m.list["state"]["clocks"] }), json!({ "subject": m.maria.id, "updates": m.list["hash"] }));
    assert_eq!(m.w.stands(&g)["stands"], json!(true));
    assert_eq!(m.w.state(&m.maria.id)["keys"], json!([]));
}

#[test]
fn two_key_grants_of_one_voice_that_do_not_see_each_other_are_a_pair() {
    let mut m = maria();
    let (k1, k2) = (World::key(11), World::key(12));
    let mut v1 = m.list["state"]["voices"].clone();
    v1[2]["key"] = json!(k1.public_key_sign);
    let mut v2 = m.list["state"]["voices"].clone();
    v2[2]["key"] = json!(k2.public_key_sign);
    let (mum, brother) = (m.mum.keys.clone(), m.brother.keys.clone());
    let (mid, bid) = (m.mum.id.clone(), m.brother.id.clone());
    let a = m.w.sign(&mid, &mum, "grant", json!({ "kind": "key", "voices": v1, "clocks": m.list["state"]["clocks"] }), json!({ "subject": m.maria.id, "updates": m.list["hash"] }));
    let b = m.w.sign(&bid, &brother, "grant", json!({ "kind": "key", "voices": v2, "clocks": m.list["state"]["clocks"] }), json!({ "subject": m.maria.id, "updates": m.list["hash"] }));
    m.w.confirm(&bid, &brother, &a, &[]);
    m.w.confirm(&mid, &mum, &b, &[]);
    assert_eq!(m.w.stands(&a), json!({ "stands": false, "waiting": [] }));
    assert_eq!(m.w.stands(&b), json!({ "stands": false, "waiting": [] }));
}

#[test]
fn a_key_under_a_voice_speaks_while_its_voice_does_and_a_stop_ends_it() {
    let mut w = World::new();
    let maria = w.person(1);
    let tablet = World::key(20);
    let u = w.mine(&maria, "grant", json!({ "kind": "key", "public_key_sign": tablet.public_key_sign }), json!({ "subject": maria.id }));
    let mk = maria.keys.clone();
    let yes = w.confirm(&maria.id, &mk, &u, &[]);
    assert_eq!(w.stands(&u)["stands"], json!(true));
    let id = maria.id.clone();
    let early = w.sign(&id, &tablet, "observe", json!({ "kind": "note" }), json!({}));
    // the key grant, by her first voice at `PT0S`, stands when signed, so the tablet speaks before her second signature too
    assert!(w.signed(&early), "its key grant stands in its own causal past");
    let t1 = w.sign(&id, &tablet, "observe", json!({ "kind": "note" }), json!({ "after": [yes["hash"]] }));
    assert_eq!(t1["refs"]["key"], u["hash"]);
    assert_eq!(t1["refs"]["prev"], early["hash"]);
    assert!(w.signed(&t1));
    assert_eq!(sorted(w.state(&id)["keys"].as_array().unwrap().iter().map(|k| k.as_str().unwrap().to_string()).collect()), sorted(vec![maria.keys.public_key_sign.clone(), tablet.public_key_sign.clone()]));
    // a key under a voice signs no key grant
    let ug = w.sign(&id, &tablet, "grant", json!({ "kind": "key", "public_key_encrypt": "aa".repeat(32) }), json!({ "subject": id }));
    assert!(!w.signed(&ug));
    // her stop of the grant that added it ends it for what has seen the stop
    let stop = w.mine(&maria, "grant", json!({ "status": "stopped", "stop": "onward" }), json!({ "updates": u["hash"] }));
    let t2 = w.sign(&id, &tablet, "observe", json!({ "kind": "note" }), json!({ "after": [stop["hash"]] }));
    assert!(!w.signed(&t2));
    assert!(w.signed(&t1));
}

#[test]
fn a_reach_waits_on_her_clock_and_a_cut_received_first_sets_it_aside() {
    let mut w = World::new();
    let shop = w.person(4);
    let host = w.person(5);
    let clocks = json!({ "names": sorted(vec![shop.id.clone(), host.id.clone()]), "needed": 2 });
    let maria = w.person_with(1, "P1D", Some(clocks.clone()));
    let sam = w.person(30);
    let oven = w.mine(&maria, "thing", json!({ "kind": "oven" }), json!({}));
    let sale = w.mine(&maria, "transfer", json!({}), json!({ "what": oven["hash"], "to_owner": sam.id }));
    assert!(on(&w.stands(&sale)).contains(&"reach".to_string()));
    let r1 = w.receipt(&shop, &sale);
    let r2 = w.receipt(&host, &sale);
    w.span_cutoff(&shop, &sale, &r1, "P1D");
    w.span_cutoff(&host, &sale, &r2, "P1D");
    assert!(!on(&w.stands(&sale)).contains(&"reach".to_string()), "{}", w.stands(&sale));
    assert_eq!(w.stands(&sale)["stands"], json!(true));
}

#[test]
fn a_key_grant_naming_a_list_already_replaced_is_no_key_grant() {
    let mut m = maria();
    let mut voices = m.list["state"]["voices"].clone();
    voices.as_array_mut().unwrap().remove(1);
    // a list naming her genesis, which her list already replaced
    let g = m.w.mine(&m.maria, "grant", json!({ "kind": "key", "voices": [{ "key": m.maria.keys.public_key_sign }] }), json!({ "subject": m.maria.id, "updates": m.maria.id }));
    assert_eq!(m.w.stands(&g), json!({ "stands": false, "waiting": [] }));
    let _ = voices;
}

#[test]
fn a_short_code_is_forty_bits() {
    assert_eq!(call("short_code", json!(["ff".repeat(32)])), json!("ZZZZ-ZZZZ"));
    assert_eq!(call("key_hash", json!([World::key(1).public_key_sign])).as_str().unwrap().len(), 64);
}

#[test]
fn a_short_reply_carries_only_what_the_receiver_cannot_rebuild() {
    let mut w = World::new();
    let maria = w.person(1);
    let sam = w.person(2);
    let host = w.person(3);
    let oven = w.mine(&sam, "thing", json!({ "kind": "oven" }), json!({}));
    let offer = w.mine(&sam, "promise", json!({ "terms": deal_terms(json!({ "price": { "value": "90", "unit": "KES" } }), Some(&oven["hash"].as_str().unwrap())) }), json!({ "from": sam.id, "to": maria.id }));
    let other = w.mine(&sam, "promise", json!({ "terms": deal_terms(json!({ "price": { "value": "90", "unit": "KES" } }), Some(&oven["hash"].as_str().unwrap())) }), json!({ "from": sam.id, "to": maria.id }));
    let rb = w.mine(&host, "observe", json!({ "kind": "readback", "readback": "ab".repeat(32) }), json!({ "for": [offer["hash"]] }));
    let before = w.blocks.clone();
    let yes = w.mine(&maria, "promise", json!({ "status": "accepted" }), json!({ "answers": offer["hash"], "for": offer["hash"], "derives_from": [rb["hash"]] }));
    let text = call("short_reply", json!([yes]));
    assert!(text.as_str().unwrap().starts_with("FB1 "));
    let rebuilt = call("short_reply_open", json!([text, maria.id, before]));
    assert_eq!(rebuilt["hash"], yes["hash"]);
    assert_eq!(call("valid", json!([rebuilt, before])), json!([]));
    // the same bytes read as an answer to another offer of the same price open nothing: nothing was said
    let without: Vec<Value> = before.iter().filter(|b| b["hash"] != offer["hash"]).cloned().collect();
    assert_eq!(call("short_reply_open", json!([text, maria.id, without])), Value::Null);
    let _ = other;
}
