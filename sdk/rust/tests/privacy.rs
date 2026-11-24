//! Privacy: who learns what: what stays public, what a signature proves, a deal shown, sealed padding. Each story is a fixed world, asked through the door, with the text's answer.
//! Where the world needs bytes the story does not spell, the test adds them and says so.
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
    fn yes(&mut self, p: &Person, t: &Value) -> Value {
        self.sign(p, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(t) }))
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
    fn sign_key(&mut self, p: &Person, key: &Keypair, t: &str, state: Value, refs: Value) -> Value {
        let at = Some(self.at());
        let blocks = self.blocks.clone();
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at, audience: Some(Readers::Public), ..Default::default() },
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
    /// A sale of a whole instance: her transfer of `what` to `to`.
    fn give(&mut self, p: &Person, what: &Value, to: &Person) -> Value {
        self.sign(p, "transfer", json!({}), json!({ "what": h(what), "to_owner": to.id }))
    }
}
fn header_msg(b: &Value) -> Value {
    json!({ "header": call("header", json!([b])), "header_signature": b["signature"] })
}
fn sans(w: &World, gone: &[&Value]) -> Vec<Value> {
    w.blocks.iter().filter(|b| !gone.iter().any(|g| g["hash"] == b["hash"])).cloned().collect()
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Who learns what
// ---------------------------------------------------------------------------------------------------------------------------------------

// What stays public. Harry's public H0, Amara's public order A1, Harry's sealed H2 (sack Q to Amara `for` A1, sealed to Amara), Harry's
// public H3 (sack R to Sam). A stranger's unsigned pull gets the public blocks, never H2's header. Sam holding H2 only as its header:
// ownership(Q) not shown, lacking H2; ownership(R) Sam. (The world's sealing key S and its key grant K1 are left out: the node's answer and
// the fold turn on the sealed block alone.)
#[test]
fn what_stays_public() {
    let mut w = World::new();
    let harry = w.person(1);
    let amara = w.person(3);
    let sam = w.person(5);
    // Harry's sealing key S: a second voice of his list, which signs his sealed words (here, also the thing it sells: Q is on S's line)
    let sk = keypair_from_seed(&"5b".repeat(32)).unwrap();
    let k1 = w.sign(&harry, "grant", json!({ "kind": "key", "voices": [{ "key": harry.keys.public_key_sign }, { "key": sk.public_key_sign }] }), json!({ "subject": harry.id, "updates": harry.id }));
    let q = w.sign_key(&harry, &sk, "thing", json!({ "kind": "sack", "pack": amt("1", "sack") }), json!({ "of": kind("sack"), "after": [h(&k1)] }));
    let r = w.thing(&harry, "sack", "1");
    let a1 = w.sign(&amara, "promise", json!({ "terms": deal_terms(json!({}), Some(&h(&q))) }), json!({ "to": amara.id, "from": harry.id }));
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

// Not given (deniability). Amara's list [card, phone P]; P signs A1, accepting Harry's offer H1, sealed to Harry; her card's key grant K2
// ends P, counted_to A1; Harry hands A1 to Gita. At Gita: valid(A1) names no fault and stands(A1) is true: wiping a key ends what it can sign
// next, never what it signed.
#[test]
fn not_given_deniability() {
    let mut w = World::new();
    let amara = w.person(3);
    let harry = w.person(1);
    let phone = keypair_from_seed(&"5a".repeat(32)).unwrap();
    let card = amara.keys.public_key_sign.clone();
    let list = w.sign(&amara, "grant", json!({ "kind": "key", "voices": [{ "key": card }, { "key": phone.public_key_sign }] }), json!({ "subject": amara.id, "updates": amara.id }));
    let q = w.thing(&harry, "sack", "1");
    let h1 = w.sign(&harry, "promise", json!({ "terms": deal_terms(json!({}), Some(&h(&q))) }), json!({ "from": harry.id, "to": amara.id }));
    let a1 = w.sign_to(&amara, &phone, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&h1), "for": h(&h1), "after": [h(&list)] }), &[&harry.id, &amara.id]);
    let k2 = w.sign(&amara, "grant", json!({ "kind": "key", "voices": [{ "key": card }], "counted_to": h(&a1) }), json!({ "subject": amara.id, "updates": h(&list) }));
    let _ = k2;
    // Gita, handed A1 and its pieces
    assert_eq!(call("valid", json!([a1, w.blocks])), json!([]));
    let s = call("stands", json!([a1, w.blocks]));
    assert_eq!(s["stands"], json!(true), "{s}");
}

// Showing a deal. Amara shows Harry's accept H2 to Leila: valid(H2) names no fault, with or without a refrain of Amara's in its past.
#[test]
fn showing_a_deal() {
    let mut w = World::new();
    let amara = w.person(3);
    let harry = w.person(1);
    let a1 = w.sign(&amara, "promise", json!({ "terms": deal_terms(json!({ "price": gbp("300") }), Some(&kind("flour"))) }), json!({ "from": harry.id, "to": amara.id }));
    let h2 = w.sign(&harry, "promise", json!({ "status": "accepted" }), json!({ "answers": h(&a1), "for": h(&a1) }));
    assert_eq!(call("valid", json!([h2, w.blocks])), json!([]));
    assert_eq!(call("read", json!([h2, w.blocks])), json!([]));
    // a deal that names `terms.show` carries a field no reader reads
    let shown = w.sign(&amara, "promise", json!({ "terms": deal_terms(json!({ "price": gbp("300") }), Some(&kind("flour"))) }), json!({ "from": harry.id, "to": amara.id }));
    let refused = foodblock::check::write_refusals("promise", &json!({ "terms": { "lines": [{ "id": "item", "price": gbp("300") }], "show": ["from"] }, "seq": 1, "at": "2026-11-12T00:00:00.000Z", "audience": "public" }), &shown["refs"], Default::default());
    assert!(!refused.is_empty(), "terms.show is no term: {refused:?}");
    let stage = call("promise_stage", json!([a1, w.blocks]));
    assert!(stage.get("show").is_none(), "{stage}");
}

// Sealed messages: a sealer that pads pads to the next of 512, 1024, 2048, 4096 bytes, then each 4096. Amara's 600-byte order sealed
// with `pad`: its plaintext is 1024 bytes; `open_copy` gives A1, the same id as unpadded. A 5,000-byte plaintext pads to 8192.
#[test]
fn padding_sizes() {
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
impl World {
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The oracle's stories (spec/oracle/stories/privacy), asked of the core
// ---------------------------------------------------------------------------------------------------------------------------------------

fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
/// Every door question the oracle's privacy stories ask (`node spec/oracle/stories/export.cjs privacy`), asked of the core with the oracle's answer.
/// A question whose answer is random (a key pair, an envelope, a wrap) is not compared; a mount is a fresh random id on each side, so the
/// oracle's id is read as the core's own in every later question.
#[test]
fn the_oracle_stories_of_privacy() {
    let text = std::fs::read_to_string(std::env::var("FB_FIXTURE").unwrap_or(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/privacy.json").into())).unwrap();
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
            // `open_copy` answers the opened block in each engine's own shape (as records.rs): the same block, by its id
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
