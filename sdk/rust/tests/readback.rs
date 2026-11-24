//! The read-back: the read-back that can be redone, the reading and its renderers, a pair, the sealed read-back, and the published cases the core must pass.
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
}
// ---------------------------------------------------------------------------------------------------------------------------------------
// Readings, renderers and the read-back
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
    let h2 = w.sign(&harry, "promise", json!({ "terms": deal_terms(json!({ "price": gbp("300") }), Some(&h(&l7))) }), json!({ "from": harry.id, "to": amara.id }));
    Lot { w, harry, amara, foodx, l7, h2 }
}
/// FoodX's read-back RB for a block, as its own `observe`: the state `readback` gives (reading, renderer, read, digits, the digest),
/// with the digest given (an honest host's, or a lie), `refs.for` the block and `refs.to` the person it is read back to.
fn sign_readback(w: &mut World, foodx: &Person, rb: &Value, digest: &str, to: &str) -> Value {
    let mut state = rb["state"].clone();
    state["readback"] = json!(digest);
    w.sign(foodx, "observe", state, json!({ "for": rb["answer"]["for"]["id"], "to": to }))
}

// Worlds A to C, and the door op `readback` (one of three ops of class `reading`). A: FoodX's read-back for H2, read to
// Amara, is redone by Wanjiru's kiosk, which holds the blocks it read: the same digest. B: FoodX's text says "no price": the kiosk's digest
// differs. C: the kiosk lacks H1: it names H1 and makes no digest. A reading or renderer this build does not run is `not_run`.
#[test]
fn the_read_back_redone() {
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

// The reading's answer: read to Amara (`to`, the readback's `refs.to`), she is the viewer and
// her own name is never read; Harry is named by his code (he signed no name); the line naming L7 gives the draw the ownership fold gives H2
// (`held`) and whose word frees it (hers); amounts per side, both ends, units as signed. The renderers copy each answer field.
#[test]
fn the_reading_and_its_renderers() {
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
    // Harry signed no name and L7 none, so the line names each by its code: "Unnamed id CODE"
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
    let odd = w.by_hand(&l.harry, "promise", json!({ "terms": deal_terms(json!({ "price": gbp("300") }), Some(&h(&l.l7))), "rule_set": x }), json!({ "from": l.harry.id, "to": l.amara.id }));
    let a = call("readback", json!([odd, w.blocks, l.amara.id]))["answer"].clone();
    assert_eq!(a["not_read"], json!({ "fields": 0, "rule_set": true, "codes": ["unknown_rules"] }), "{a}");
    assert!(a.get("things").is_none());
    assert!(call("render", json!([a, "en"])).as_str().unwrap().ends_with("Nothing was guessed."));
}

// World D. Harry's H2 and H2', a pair, L7 to Amara and to Leila; Amara accepted: the answer gives both draws `{ draw, to, yes }`, and
// the line says Harry signed it twice, whatever the fold reads Amara's draw as.
#[test]
fn a_pair() {
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

// A host's convention (no op checks it): the honest host seals the readback observe to Amara, she
// opens her copy, and redo over it gives `same: true`.
#[test]
fn the_sealed_read_back() {
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

// This core runs the published reading and renderers because it passes their cases (spec/readings/readback.cases.json,
// spec/renderers/en.cases.json, en-sms.cases.json, exported from the oracle's stories), and answers the oracle's door questions of the
// read-back alike (tests/fixtures/readback.json: node spec/oracle/stories/readback/export.cjs).
#[test]
fn the_published_cases_of_the_read_back() {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/spec/");
    let load = |p: &str| -> Value { serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap() };
    let mut differ = vec![];
    let cases = load(&format!("{root}readings/readback.cases.json"));
    let blocks = cases["blocks"].as_array().unwrap();
    let at = |i: &Value| blocks[i.as_u64().unwrap() as usize].clone();
    for (i, c) in cases["cases"].as_array().unwrap().iter().enumerate() {
        let blocks: Vec<Value> = c["held"].as_array().unwrap().iter().map(at).collect();
        let out = call("readback", json!([at(&c["block"]), blocks, c["to"]]));
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
    let fx = load(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/readback.json"));
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
