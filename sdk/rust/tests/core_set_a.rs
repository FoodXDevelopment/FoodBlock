//! FoodBlock 1.9, the one set, layers 3a (bytes) and 3b (place and order): each CORE-SET entry's fixed world, story by story, with the
//! answer the text gives (changes-1.9/CORE-SET.md). Each world is asked through the door, as any SDK asks.
use foodblock::door::answer;
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{keypair_from_seed, write, ComposeOptions, Keypair, Readers, WriteOptions};
use serde_json::{json, Value};

fn call(op: &str, args: Value) -> Value {
    let out = answer(op.as_bytes(), args.to_string().as_bytes());
    out.get("ok").cloned().unwrap_or_else(|| panic!("{op}: {out}"))
}
fn fails(op: &str, args: Value) -> Value {
    let out = answer(op.as_bytes(), args.to_string().as_bytes());
    assert!(out.get("ok").is_none(), "{op} answered {out}");
    out
}
fn codes(v: &Value) -> Vec<String> {
    v.as_array().unwrap().iter().map(|r| r["code"].as_str().unwrap().to_string()).collect()
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
    fn sign_with(&mut self, p: &Person, key: &Keypair, t: &str, state: Value, refs: Value) -> Value {
        let at = self.at();
        let o = WriteOptions {
            compose: ComposeOptions { author: p.id.clone(), at: Some(at), audience: Some(Readers::Public), ..Default::default() },
            key: Some(key),
            held: &self.blocks,
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
    fn thing(&mut self, p: &Person, word: &str, pack: Value) -> Value {
        self.sign(p, "thing", json!({ "kind": word, "pack": pack }), json!({ "of": kind(word) }))
    }
    fn order(&mut self, p: &Person, what: &Value) -> Value {
        self.sign(p, "promise", json!({ "kind": "order" }), json!({ "what": h(what) }))
    }
    /// A block signed by hand at a place the caller names (what a writer would refuse): its body as given, signed over its header with
    /// `sign_message`, which signs any message part. Not added to the world.
    fn by_hand(&mut self, author: &str, key: &Keypair, t: &str, state: Value, refs: Value, prev: &str, seq: i64, key_ref: Option<&str>) -> Value {
        let mut s = state;
        if s.get("at").is_none() {
            s["at"] = json!(self.at());
        }
        s["audience"] = json!("public");
        s["seq"] = json!(seq);
        let mut r = refs;
        r["author"] = json!(author);
        r["prev"] = json!(prev);
        if let Some(k) = key_ref {
            r["key"] = json!(k);
        }
        let mut b = call("create", json!([t, s, r]));
        let header = call("header", json!([b]));
        b["signature"] = call("sign_message", json!([header, key.private_key]))["signature"].clone();
        b
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 3a. Bytes
// ---------------------------------------------------------------------------------------------------------------------------------------

// 3a-1. `valid` reads five things: the size, the bytes, the header, the pieces, the signature. A value is `read`'s.
#[test]
fn a3_01_valid_reads_five_things() {
    let mut w = World::new();
    let harry = w.person(1);
    let k = harry.keys.clone();
    // (2) Harry, H1, seq 1, a thing L7 pack 1 sack, `at` with seven fraction digits
    let h1 = w.by_hand(&harry.id, &k, "thing", json!({ "kind": "lentils", "pack": sack("1"), "at": "2026-11-12T10:00:00.0000001Z" }), json!({ "of": kind("lentils") }), &harry.id, 1, None);
    w.blocks.push(h1.clone());
    assert!(codes(&call("valid", json!([h1, w.blocks]))).is_empty(), "valid: which key said these bytes");
    assert_eq!(codes(&call("read", json!([h1, w.blocks]))), ["time"], "the value is read's");
    // the five, each with its code
    let header_less = w.by_hand(&harry.id, &k, "observe", json!({ "kind": "note" }), json!({}), &harry.id, 2, None);
    let mut no_prev = header_less.clone();
    no_prev["refs"].as_object_mut().unwrap().remove("prev");
    no_prev["hash"] = call("hash", json!([no_prev["type"], no_prev["state"], no_prev["refs"]]));
    assert_eq!(codes(&call("valid", json!([no_prev, w.blocks]))), ["chain"]);
    let mut forged = header_less.clone();
    forged["signature"] = h1["signature"].clone();
    assert_eq!(codes(&call("valid", json!([forged, w.blocks]))), ["bad_signature"]);
    let mut mutated = header_less.clone();
    mutated["state"]["kind"] = json!("other");
    assert_eq!(codes(&call("valid", json!([mutated, w.blocks]))), ["bad_hash"], "a forged id: bad_hash alone");
    // a value of no grammar, a type name, a float handed in: valid, and `read` refuses each
    let typed = w.by_hand(&harry.id, &k, "Observe", json!({ "kind": "note" }), json!({}), &harry.id, 3, None);
    assert!(codes(&call("valid", json!([typed, w.blocks]))).is_empty());
    assert!(codes(&call("read", json!([typed, w.blocks]))).contains(&"type_name".to_string()));
}

// 3a-2. A refused body is held as its header: the twin with a bad value still makes a pair, and Harry's line is not read whole there.
#[test]
fn a3_02_a_refused_body_is_held_as_its_header() {
    let mut w = World::new();
    let harry = w.person(1);
    let k = harry.keys.clone();
    let l7 = w.thing(&harry, "lentils", sack("1"));
    let sam = w.person(2);
    let s1 = w.order(&sam, &l7);
    let h2 = w.by_hand(&harry.id, &k, "transfer", json!({ "at": "2026-11-12T10:00:00.0000001Z" }), json!({ "what": h(&l7), "to_owner": sam.id, "for": h(&s1) }), &h(&l7), 2, None);
    w.blocks.push(h2.clone());
    let amara = w.person(3);
    let a1 = w.order(&amara, &l7);
    let h2b = w.by_hand(&harry.id, &k, "transfer", json!({}), json!({ "what": h(&l7), "to_owner": amara.id, "for": h(&a1) }), &h(&l7), 2, None);
    w.blocks.push(h2b.clone());
    assert!(codes(&call("valid", json!([h2, w.blocks]))).is_empty(), "the bad twin is valid: its key said it");
    let line: Vec<&Value> = w.blocks.iter().filter(|b| b["refs"]["author"] == json!(harry.id)).collect();
    let chain = call("check_chain", json!([line, harry.id]));
    let mut pair = vec![h(&h2), h(&h2b)];
    pair.sort();
    assert_eq!(chain["equivocations"], json!([pair]));
    let o = call("ownership", json!([l7, w.blocks, null]));
    assert_eq!(o["not_shown"], json!(true), "{o}");
    assert_eq!(o["lacks"], json!([h(&h2)]), "{o}");
}

// 3a-3. A writer signs only what its own `read` reads.
#[test]
fn a3_03_a_writer_signs_only_what_its_read_reads() {
    let mut w = World::new();
    let mama = w.person(4);
    let m1 = w.sign(&mama, "observe", json!({ "kind": "note" }), json!({}));
    let m2 = call("create", json!(["observe", { "kind": "note", "at": "2026-11-12T10:00:00.0000001Z", "audience": "public", "seq": 2 }, { "author": mama.id, "prev": h(&m1) }]));
    let refused = fails("sign", json!([m2, mama.keys.private_key]));
    assert!(refused.to_string().contains("time"), "{refused}");
    // nothing is signed: her next block is seq 2
    let next = w.sign(&mama, "observe", json!({ "kind": "note" }), json!({}));
    assert_eq!(next["state"]["seq"], json!(2));
}

// 3a-6. One byte form: keys in ascending order of their UTF-8 bytes.
#[test]
fn a3_06_one_byte_form() {
    // (a) keys `"` and `#`
    assert_eq!(call("canonical_json", json!([{ "#": 2, "\"": 1 }])), json!("{\"\\\"\":1,\"#\":2}"));
    // (b) keys U+0001 and `A`: \u0001 first
    assert_eq!(call("canonical_json", json!([{ "A": 2, "\u{1}": 1 }])), json!("{\"\\u0001\":1,\"A\":2}"));
    // (c) a refs key inside state keeps its written order, and is canonical as written
    let mut w = World::new();
    let maria = w.person(2);
    let c = w.sign(&maria, "observe", json!({ "kind": "batch", "batch": { "refs": { "flours": ["spelt", "rye"] } } }), json!({}));
    assert_eq!(c["state"]["batch"]["refs"]["flours"], json!(["spelt", "rye"]));
    let text = call("canonical", json!([c["type"], c["state"], c["refs"]])).as_str().unwrap().to_string();
    assert!(codes(&call("strict_text", json!([text]))).is_empty());
    // (d) keys "😀" and "～": `～` first (byte order; UTF-16 put the emoji first)
    let d = call("canonical_json", json!([{ "😀": 1, "～": 2 }]));
    assert_eq!(d, json!("{\"～\":2,\"😀\":1}"));
    // (e) a block with an Adlam key and `ｱ`: taken, with its id
    let e = w.sign(&maria, "observe", json!({ "kind": "note", "𞤀": "a", "ｱ": "b" }), json!({}));
    let text = call("canonical", json!([e["type"], e["state"], e["refs"]])).as_str().unwrap().to_string();
    assert!(text.find("ｱ").unwrap() < text.find("𞤀").unwrap(), "{text}");
    assert!(codes(&call("strict_text", json!([text]))).is_empty());
    assert_eq!(call("hash", json!([e["type"], e["state"], e["refs"]])), e["hash"]);
    assert!(codes(&call("valid", json!([e, w.blocks]))).is_empty());
}

// 3a-7. Sorted sets, and the empty set: canonical, and `read` refuses it as `grammar`.
#[test]
fn a3_07_the_empty_set() {
    let mut w = World::new();
    let sam = w.person(2);
    let k = sam.keys.clone();
    let s1 = w.by_hand(&sam.id, &k, "observe", json!({ "kind": "note" }), json!({ "sees": [] }), &sam.id, 1, None);
    assert!(codes(&call("valid", json!([s1, w.blocks]))).is_empty());
    assert_eq!(codes(&call("read", json!([s1, w.blocks]))), ["grammar"]);
    // a set's strings in byte order: "Z" < "a" < "ｱ"
    assert!(codes(&call("strict_text", json!([call("canonical", json!(["observe", { "kind": "x" }, { "tags": ["Z", "a", "ｱ"] }]))]))).iter().all(|c| c != "not_canonical"));
}

// 3a-13. `state.rule_set` on every block, read by every reader.
#[test]
fn a3_13_a_rule_set_this_reader_does_not_run() {
    let mut w = World::new();
    let sam = w.person(2);
    let ben = w.person(3);
    let c1 = w.thing(&sam, "crate", json!({ "value": "1", "unit": "crate" }));
    let c2 = w.thing(&sam, "crate", json!({ "value": "1", "unit": "crate" }));
    let k = sam.keys.clone();
    let s1 = w.by_hand(&sam.id, &k, "transfer", json!({ "rule_set": "ab".repeat(32) }), json!({ "what": h(&c1), "to_owner": ben.id }), &h(&c2), 3, None);
    w.blocks.push(s1.clone());
    assert!(codes(&call("valid", json!([s1, w.blocks]))).is_empty());
    assert_eq!(codes(&call("read", json!([s1, w.blocks]))), ["unknown_rules"]);
    let o = call("ownership", json!([c1, w.blocks, null]));
    assert_eq!(o["not_shown"], json!(true), "{o}");
    assert_eq!(o["lacks"], json!([h(&s1)]), "{o}");
    // folds on Sam's other things unchanged
    let o2 = call("ownership", json!([c2, w.blocks, null]));
    assert_eq!(o2["owners"][0]["owner"], json!(sam.id), "{o2}");
}

// 3a-5. A node shows a body only to an audience it can read: a relay holding only the header and a sealed copy passes on the header, and
// the copy to the one it was pushed for.
#[test]
fn a3_05_a_relay_passes_on_a_header() {
    let mut w = World::new();
    let amara = w.person(3);
    let maria = w.person(2);
    let sam = w.person(5);
    let order = w.sign(&amara, "observe", json!({ "kind": "note" }), json!({ "subject": maria.id }));
    let header = call("header", json!([order]));
    // the relay holds the header, its signature and a copy pushed for Maria; it holds no body, so it reads no audience
    let log = json!([{ "n": 1, "block": header, "header": header, "header_signature": order["signature"], "copies": { (maria.id.clone()): { "header": header, "header_signature": order["signature"], "envelope": { "sealed": "x" } } } }]);
    // Sam, for whom nothing was pushed, gets nothing of it (1.9 stage 7, A2: not even the header); Maria gets her copy as it came (a copy
    // shows no body)
    let got = call("answer_pull", json!([log, { "since": 0 }, "relay", null, { "cap": 10, "serves_pairs": false }, sam.id, null]));
    assert_eq!(got["blocks"], json!([]), "{got}");
    let got = call("answer_pull", json!([log, { "since": 0 }, "relay", null, { "cap": 10, "serves_pairs": false }, maria.id, null]));
    assert_eq!(got["blocks"][0]["message"]["envelope"], json!({ "sealed": "x" }), "{got}");
}

// 3a-8. One reader for every message; 3a-9. the answer of `strict_push`.
#[test]
fn a3_08_09_one_reader_for_every_push() {
    let mut w = World::new();
    let sam = w.person(2);
    let s1 = w.sign(&sam, "observe", json!({ "kind": "sale" }), json!({}));
    let msg = call("wrap", json!([s1]));
    let push = |m: Value, f: Value| call("canonical_json", json!([{ "messages": m, "for": f }])).as_str().unwrap().to_string();
    // a float in `for`: refused whole
    let float = format!("{{\"for\":1.5,\"messages\":[{}]}}", call("canonical_json", json!([msg])).as_str().unwrap());
    let got = call("strict_push", json!([float]));
    assert_eq!(got["refused"]["code"], json!("not_canonical"), "{got}");
    assert_eq!(got["messages"], json!([]));
    assert_eq!(got["refused"]["hash"], call("hash_hex", json!([float])));
    // 2^53 in `for`: refused whole
    let big = format!("{{\"for\":9007199254740992,\"messages\":[]}}");
    assert_eq!(call("strict_push", json!([big]))["refused"]["code"], json!("not_canonical"));
    // an extra top key: refused whole (today an argument error)
    let extra = call("canonical_json", json!([{ "messages": [], "for": "x", "more": 1 }])).as_str().unwrap().to_string();
    assert_eq!(call("strict_push", json!([extra]))["refused"]["code"], json!("not_canonical"));
    // a carrier 65 levels deep: refused whole, before any block is read
    let deep = format!("{{\"for\":{}1{},\"messages\":[]}}", "[".repeat(65), "]".repeat(65));
    assert!(call("strict_push", json!([deep]))["refused"].is_object());
    // a push that is not canonical whole (3a-9's world)
    let spaced = format!("{{ \"for\":\"x\",\"messages\":[]}}");
    let got = call("strict_push", json!([spaced]));
    assert_eq!(got, json!({ "refused": { "code": "not_canonical", "hash": call("hash_hex", json!([spaced])), "detail": got["refused"]["detail"] }, "messages": [] }));
    // a good push: one list per message
    let good = call("strict_push", json!([push(json!([msg]), json!("x"))]));
    assert_eq!(good, json!({ "messages": [[]] }));
    // one hash twice, S1' with a bad signature, in either order: S1 taken both times
    let mut bad = s1.clone();
    bad["signature"] = json!("00".repeat(64));
    let held: Vec<Value> = w.blocks.iter().filter(|b| b["hash"] != s1["hash"]).cloned().collect();
    for pair in [json!([s1, bad]), json!([bad, s1])] {
        let got = call("accept", json!([pair, held, { "takes_pairs": false }, null]));
        assert_eq!(got["taken"], json!([h(&s1)]), "{got}");
    }
}

// 3a-10. Key, reply and message spellings.
#[test]
fn a3_10_one_spelling() {
    // Amara's genesis written with her p256 key spelled 06…: refused (no key opens it)
    let k = call("keypair", json!(["a1".repeat(32), "p256"]));
    let key = k["public_key_sign"].as_str().unwrap().to_string();
    let suite = call("spec", json!([]))["suites"]["p256"].clone();
    let at = key.rfind("04").filter(|i| key.len() - i == 130).expect("an uncompressed point");
    let hybrid = format!("{}06{}", &key[..at], &key[at + 2..]);
    let _ = suite;
    let state = json!({ "kind": "person", "at": "2026-11-12T10:00:00.000Z", "audience": "public", "public_key_sign": hybrid, "suite": "p256" });
    let mut g = call("create", json!(["actor", state, {}, "p256"]));
    g["signature"] = call("sign_message", json!([{ "type": g["type"], "state": g["state"], "refs": g["refs"] }, k["private_key"], "p256"]))["signature"].clone();
    assert_eq!(codes(&call("valid", json!([g, []]))), ["bad_signature"]);
    // the same genesis spelled 04 opens
    let state = json!({ "kind": "person", "at": "2026-11-12T10:00:00.000Z", "audience": "public", "public_key_sign": key, "suite": "p256" });
    let mut g = call("create", json!(["actor", state, {}, "p256"]));
    g["signature"] = call("sign_message", json!([{ "type": g["type"], "state": g["state"], "refs": g["refs"] }, k["private_key"], "p256"]))["signature"].clone();
    assert!(codes(&call("valid", json!([g, []]))).is_empty());
    // a short reply opens only from its exact spelling
    let mut w = World::new();
    let maria = w.person(1);
    let sam = w.person(2);
    let host = w.person(3);
    let oven = w.sign(&sam, "thing", json!({ "kind": "oven" }), json!({}));
    let offer = w.sign(&sam, "promise", json!({ "terms": { "price": { "value": "90", "unit": "KES" } } }), json!({ "from": sam.id, "to": maria.id, "what": oven["hash"] }));
    let rb = w.sign(&host, "observe", json!({ "kind": "readback", "readback": "ab".repeat(32) }), json!({ "for": [offer["hash"]] }));
    let before = w.blocks.clone();
    let yes = w.sign(&maria, "promise", json!({ "status": "accepted" }), json!({ "answers": offer["hash"], "for": offer["hash"], "derives_from": [rb["hash"]] }));
    let text = call("short_reply", json!([yes])).as_str().unwrap().to_string();
    assert_eq!(call("short_reply_open", json!([text, maria.id, before]))["hash"], yes["hash"]);
    for wrong in [format!("{text}="), text.replace('-', "+").replace('_', "/"), format!("{text} ")] {
        if wrong != text {
            assert_eq!(call("short_reply_open", json!([wrong, maria.id, before])), Value::Null, "{wrong}");
        }
    }
    // `seq` with a leading zero byte: opens nothing
    let body = text.strip_prefix("FB1 ").unwrap();
    let b64 = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let dec: Vec<u8> = {
        let vals: Vec<u32> = body.bytes().map(|c| b64.iter().position(|x| *x == c).unwrap() as u32).collect();
        let mut out = vec![];
        for ch in vals.chunks(4) {
            let n = ch.iter().enumerate().fold(0u32, |a, (i, v)| a | v << (18 - 6 * i));
            for i in 0..ch.len() - 1 {
                out.push((n >> (16 - 8 * i)) as u8);
            }
        }
        out
    };
    let mut padded = dec[..76].to_vec();
    padded.push(0);
    padded.extend_from_slice(&dec[76..]);
    let enc: String = padded.chunks(3).flat_map(|c| {
        let n = c.iter().enumerate().fold(0u32, |a, (i, b)| a | (*b as u32) << (16 - 8 * i));
        (0..=c.len()).map(move |i| b64[((n >> (18 - 6 * i)) & 63) as usize] as char).collect::<Vec<_>>()
    }).collect();
    assert_eq!(call("short_reply_open", json!([format!("FB1 {enc}"), maria.id, before])), Value::Null);
    // verify_message of a header or a genesis: false
    let header = call("header", json!([yes]));
    let mut part = header.clone();
    part["signature"] = yes["signature"].clone();
    assert_eq!(call("verify_message", json!([part, maria.keys.public_key_sign])), json!(false));
    let g = &w.blocks[0];
    let gpart = json!({ "type": g["type"], "state": g["state"], "refs": g["refs"], "signature": g["signature"] });
    assert_eq!(call("verify_message", json!([gpart, maria.keys.public_key_sign])), json!(false));
}

// 3a-11. `pad` in a sealed plaintext: a padded copy opens to the same block, same id.
#[test]
fn a3_11_a_padded_plaintext() {
    let mut w = World::new();
    let amara = w.person(3);
    let maria = w.person(2);
    let enc = call("encryption_keypair", json!([]));
    let a1 = w.sign(&amara, "observe", json!({ "kind": "order" }), json!({ "subject": maria.id }));
    let plain = call("seal_copy", json!([a1, [enc["public_key_encrypt"]], null]));
    let opened = call("open_copy", json!([plain, enc["x25519_private"]]));
    assert_eq!(opened["hash"], a1["hash"]);
    let inner = json!({ "block": { "type": a1["type"], "state": a1["state"], "refs": a1["refs"] }, "reveals": [] });
    let size = call("canonical_json", json!([inner])).as_str().unwrap().len();
    let mut padded_plain = inner.clone();
    padded_plain["pad"] = json!(" ".repeat(1024usize.saturating_sub(size + 10)));
    let envelope = call("seal", json!([padded_plain, [enc["public_key_encrypt"]]]));
    let padded = json!({ "header": plain["header"], "header_signature": plain["header_signature"], "envelope": envelope });
    let opened2 = call("open_copy", json!([padded, enc["x25519_private"]]));
    assert_eq!(opened2["hash"], a1["hash"]);
}

// 3a-12. No answer depends on the machine: a chain of makes deeper than a call stack is walked, never an abort.
#[test]
fn a3_12_a_long_chain_of_makes() {
    let mut w = World::new();
    let maria = w.person(2);
    let amara = w.person(3);
    let depth: usize = std::env::var("FB_MAKES").ok().and_then(|n| n.parse().ok()).unwrap_or(6000);
    // (1) Maria M0, a starter thing; (2) to (6001) Maria, 6,000 makes, each from the last: signed by hand along her line (a writer's own
    // checks against the whole store would make the world slow to build, not the fold)
    let mut prev = maria.id.clone();
    let mut seq = 0i64;
    let mut next = |w: &mut World, t: &str, state: Value, refs: Value| -> Value {
        seq += 1;
        let mut s = state;
        s["at"] = json!("2026-11-12T10:00:00.000Z");
        s["audience"] = json!("public");
        s["seq"] = json!(seq);
        let mut r = refs;
        r["author"] = json!(maria.id);
        r["prev"] = json!(prev);
        let mut b = foodblock::create(t, &s, &r).unwrap();
        b["signature"] = json!(foodblock::sign(&b, &maria.keys.private_key).unwrap());
        prev = h(&b);
        w.blocks.push(b.clone());
        b
    };
    let mut last = next(&mut w, "thing", json!({ "kind": "starter" }), json!({ "of": kind("starter") }));
    for _ in 0..depth {
        let make = next(&mut w, "transform", json!({}), json!({ "derives_from": [h(&last)] }));
        last = next(&mut w, "thing", json!({ "kind": "starter" }), json!({ "derives_from": [h(&make)] }));
    }
    let a1 = w.order(&amara, &last);
    let jar = next(&mut w, "transfer", json!({}), json!({ "what": h(&last), "to_owner": amara.id, "for": h(&a1) }));
    w.sign(&amara, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(&jar) }));
    let o = call("ownership", json!([last, w.blocks, null]));
    // this reader walks it: Amara (a reader that stops answers not_shown; this one has no bound, SILENT 9)
    assert_eq!(o["owner"], json!(amara.id), "{o}");
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 3b. Place and order. Where CORE-SET's world reads an order `for` the deal as the receiver's yes (3e-3, not in this half), her accept is
// signed in its place, so the answer the text gives can be read here.
// ---------------------------------------------------------------------------------------------------------------------------------------

impl World {
    fn yes(&mut self, p: &Person, t: &Value) -> Value {
        self.sign(p, "transfer", json!({ "status": "accepted" }), json!({ "answers": h(t) }))
    }
    fn own(&self, thing: &Value) -> Value {
        call("ownership", json!([thing, self.blocks, null]))
    }
}
fn draw_of<'a>(o: &'a Value, b: &Value) -> &'a Value {
    o["draws"].as_array().unwrap().iter().find(|d| d["block"] == b["hash"]).unwrap_or_else(|| panic!("no draw {} in {o}", b["hash"]))
}
fn line_of(w: &World, p: &Person) -> Vec<Value> {
    w.blocks.iter().filter(|b| b["refs"]["author"] == json!(p.id) && b["refs"]["key"].is_null()).cloned().collect()
}

// 3b-1. In its place, World A: a block of lower seq after its prev takes nothing (`out_of_place`) and is listed as broken.
#[test]
fn b3_01_in_its_place() {
    let mut w = World::new();
    let harry = w.person(1);
    let k = harry.keys.clone();
    let l7 = w.thing(&harry, "lentils", sack("1"));
    let amara = w.person(3);
    let a1 = w.order(&amara, &l7);
    let h2 = w.by_hand(&harry.id, &k, "transfer", json!({}), json!({ "what": h(&l7), "to_owner": amara.id, "for": h(&a1) }), &h(&l7), 10, None);
    w.blocks.push(h2.clone());
    w.yes(&amara, &h2);
    let leila = w.person(5);
    let e1 = w.order(&leila, &l7);
    let h3 = w.by_hand(&harry.id, &k, "transfer", json!({}), json!({ "what": h(&l7), "to_owner": leila.id, "for": h(&e1) }), &h(&h2), 7, None);
    w.blocks.push(h3.clone());
    w.yes(&leila, &h3);
    let o = w.own(&l7);
    assert_eq!(o["owner"], json!(amara.id), "{o}");
    assert_eq!(draw_of(&o, &h3)["takes"], json!(false));
    assert_eq!(draw_of(&o, &h3)["why"], json!("out_of_place"));
    let chain = call("check_chain", json!([line_of(&w, &harry), harry.id]));
    assert_eq!(chain["broken"], json!([h(&h3)]), "{chain}");
}

// 3b-2. The taint of a fork: a later block of that key that draws on a measure no draw of the pair names is read as any draw.
#[test]
fn b3_02_the_taint_of_a_fork() {
    let mut w = World::new();
    let maria = w.person(2);
    let k = maria.keys.clone();
    let x = w.thing(&maria, "sack", sack("1"));
    let y = w.thing(&maria, "sack", sack("1"));
    let (leila, ben, amara) = (w.person(5), w.person(6), w.person(3));
    let m3 = w.by_hand(&maria.id, &k, "transfer", json!({}), json!({ "what": h(&x), "to_owner": leila.id }), &h(&y), 3, None);
    let m3b = w.by_hand(&maria.id, &k, "transfer", json!({}), json!({ "what": h(&x), "to_owner": ben.id }), &h(&y), 3, None);
    w.blocks.extend([m3.clone(), m3b.clone()]);
    w.yes(&leila, &m3);
    w.yes(&ben, &m3b);
    let m4 = w.by_hand(&maria.id, &k, "transfer", json!({}), json!({ "what": h(&y), "to_owner": amara.id }), &h(&m3), 4, None);
    w.blocks.push(m4.clone());
    w.yes(&amara, &m4);
    let oy = w.own(&y);
    assert_eq!(oy["owner"], json!(amara.id), "{oy}");
    assert_eq!(draw_of(&oy, &m4)["state"], json!("landed"));
    let ox = w.own(&x);
    assert_eq!(ox["owners"], json!([]), "X held on a pair: {ox}");
}

// 3b-3. Neither came first: the same answer in every order the blocks are read in.
#[test]
fn b3_03_the_same_answer_in_every_order() {
    let mut w = World::new();
    let harry = w.person(1);
    let k = harry.keys.clone();
    let l7 = w.thing(&harry, "lentils", sack("1"));
    let (amara, leila) = (w.person(3), w.person(5));
    let a1 = w.order(&amara, &l7);
    let e1 = w.order(&leila, &l7);
    let h2 = w.by_hand(&harry.id, &k, "transfer", json!({}), json!({ "what": h(&l7), "to_owner": amara.id, "for": h(&a1) }), &h(&l7), 2, None);
    let h2b = w.by_hand(&harry.id, &k, "transfer", json!({}), json!({ "what": h(&l7), "to_owner": leila.id, "for": h(&e1) }), &h(&l7), 2, None);
    w.blocks.extend([h2.clone(), h2b.clone()]);
    w.yes(&amara, &h2);
    w.yes(&leila, &h2b);
    let first = w.own(&l7);
    assert_eq!(first["owners"], json!([]), "L7 held on a pair: {first}");
    let n = w.blocks.len();
    for shift in 1..n {
        let mut b = w.blocks.clone();
        b.rotate_left(shift);
        if shift % 2 == 1 {
            b.reverse();
        }
        assert_eq!(call("ownership", json!([l7, b, null])), first, "order {shift}");
    }
}

// 3b-7. Read whole, narrow, and what a header hides.
#[test]
fn b3_07_read_whole_and_what_a_header_hides() {
    let mut w = World::new();
    let harry = w.person(1);
    let k = harry.keys.clone();
    let q = w.thing(&harry, "sack", sack("1"));
    let r = w.thing(&harry, "sack", json!({ "value": "500", "unit": "sack" }));
    let buyer = w.person(7);
    let mut h50 = Value::Null;
    for n in 3..=202 {
        if n == 50 {
            let prev = h(w.blocks.iter().rev().find(|b| b["refs"]["author"] == json!(harry.id)).unwrap());
            h50 = w.by_hand(&harry.id, &k, "transfer", json!({ "amount": sack("1") }), json!({ "what": h(&r), "to_owner": buyer.id, "for": "d0".repeat(32) }), &prev, 50, None);
            w.blocks.push(h50.clone());
        } else {
            w.sign(&harry, "transfer", json!({ "amount": sack("1") }), json!({ "what": h(&r), "to_owner": buyer.id }));
        }
    }
    let wanjiru = w.person(8);
    let w1 = w.order(&wanjiru, &q);
    let h203 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&q), "to_owner": wanjiru.id, "for": h(&w1) }));
    w.yes(&wanjiru, &h203);
    // World A: H50 names a deal she lacks; it names nothing of Q: Q is shown
    let o = w.own(&q);
    assert_eq!(o["owner"], json!(wanjiru.id), "{o}");
    // World B: she holds H50 only as its header: it could name each measure Harry's line held at its place: Q is not shown
    let header = json!({ "header": call("header", json!([h50])), "header_signature": h50["signature"] });
    let held: Vec<Value> = w.blocks.iter().map(|b| if b["hash"] == h50["hash"] { header.clone() } else { b.clone() }).collect();
    let o = call("ownership", json!([q, held, null]));
    assert_eq!(o, json!({ "not_shown": true, "lacks": [h(&h50)] }));
}

// 3b-9. An answer never says "nobody": a resale with one unrelated block of Amara's missing is not shown.
#[test]
fn b3_09_never_nobody() {
    let mut w = World::new();
    let harry = w.person(1);
    let q = w.thing(&harry, "sack", sack("1"));
    let amara = w.person(3);
    let a1 = w.order(&amara, &q);
    let h2 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&q), "to_owner": amara.id, "for": h(&a1) }));
    w.yes(&amara, &h2);
    let a2 = w.sign(&amara, "observe", json!({ "kind": "note" }), json!({}));
    let leila = w.person(5);
    let e1 = w.order(&leila, &q);
    let a3 = w.sign(&amara, "transfer", json!({}), json!({ "what": h(&q), "to_owner": leila.id, "for": h(&e1) }));
    w.yes(&leila, &a3);
    let all = w.own(&q);
    assert_eq!(all["owner"], json!(leila.id), "{all}");
    assert!(all["read"].as_array().unwrap().contains(&json!(h(&a3))), "{all}");
    let held: Vec<Value> = w.blocks.iter().filter(|b| b["hash"] != a2["hash"]).cloned().collect();
    assert_eq!(call("ownership", json!([q, held, null])), json!({ "not_shown": true, "lacks": [h(&a2)] }));
}

// 3b-10. Words shown with a thing: "not me" by Harry's card is listed in `named_by`; no owner changes.
#[test]
fn b3_10_words_shown_with_a_thing() {
    let mut w = World::new();
    let harry = w.person(1);
    let q = w.thing(&harry, "sack", sack("1"));
    let amara = w.person(3);
    let h5 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&q), "to_owner": amara.id }));
    w.yes(&amara, &h5);
    let h6 = w.sign(&harry, "observe", json!({ "kind": "not_me" }), json!({ "subject": h(&h5) }));
    let o = w.own(&q);
    assert_eq!(o["owner"], json!(amara.id), "{o}");
    assert!(o.get("standing").is_none());
    assert_eq!(o["named_by"], json!([{ "block": h(&h6), "by": harry.id, "own": true, "pair": false, "ref": "subject" }]), "{o}");
}

// 3b-5. A thing drawn twice (Rule B).
#[test]
fn b3_05_a_thing_drawn_twice() {
    // World A: an unanswered twin does not wipe Amara's sacks; the puppet's yes makes a pair; its decline ends it
    let mut w = World::new();
    let harry = w.person(1);
    let k = harry.keys.clone();
    let l7 = w.thing(&harry, "lentils", sack("10"));
    let amara = w.person(3);
    let a1 = w.order(&amara, &l7);
    let h2 = w.sign(&harry, "transfer", json!({}), json!({ "what": h(&l7), "to_owner": amara.id, "for": h(&a1) }));
    w.yes(&amara, &h2);
    let owners = |o: &Value| o["owners"].as_array().unwrap().iter().map(|x| (x["owner"].as_str().unwrap().to_string(), x["amount"]["value"].as_str().unwrap().to_string())).collect::<Vec<_>>();
    assert_eq!(owners(&w.own(&l7)), [(amara.id.clone(), "10".to_string())]);
    let puppet = w.person(9);
    let h2b = w.by_hand(&harry.id, &k, "transfer", json!({}), json!({ "what": h(&l7), "to_owner": puppet.id }), &h(&l7), 2, None);
    w.blocks.push(h2b.clone());
    let o = w.own(&l7);
    assert_eq!(owners(&o), [(amara.id.clone(), "10".to_string())], "the twin does not stand: {o}");
    let yes = w.yes(&puppet, &h2b);
    let o = w.own(&l7);
    assert_eq!(o["owners"], json!([]), "{o}");
    assert_eq!(draw_of(&o, &h2)["why"], json!("pair"));
    let _ = yes;
    w.sign(&puppet, "transfer", json!({ "status": "declined" }), json!({ "answers": h(&h2b) }));
    assert_eq!(owners(&w.own(&l7)), [(amara.id.clone(), "10".to_string())], "her decline ends the pair");

    // World B: fitting twins each take; twins `for` one deal count once
    let mut w = World::new();
    let maria = w.person(2);
    let k = maria.keys.clone();
    let f = w.thing(&maria, "flour", json!({ "value": "10", "unit": "kg" }));
    let (leila, ben, amara) = (w.person(5), w.person(6), w.person(3));
    let e1 = w.order(&leila, &f);
    let b1 = w.order(&ben, &f);
    let m2 = w.by_hand(&maria.id, &k, "transfer", json!({ "amount": { "value": "4", "unit": "kg" } }), json!({ "what": h(&f), "to_owner": leila.id, "for": h(&e1) }), &h(&f), 2, None);
    let m2b = w.by_hand(&maria.id, &k, "transfer", json!({ "amount": { "value": "3", "unit": "kg" } }), json!({ "what": h(&f), "to_owner": ben.id, "for": h(&b1) }), &h(&f), 2, None);
    w.blocks.extend([m2.clone(), m2b.clone()]);
    w.yes(&leila, &m2);
    w.yes(&ben, &m2b);
    let o = w.own(&f);
    let mut want = vec![(leila.id.clone(), "4".to_string()), (ben.id.clone(), "3".to_string()), (maria.id.clone(), "3".to_string())];
    want.sort();
    assert_eq!(owners(&o), want, "{o}");
    let a1 = w.order(&amara, &f);
    let m3 = w.by_hand(&maria.id, &k, "transfer", json!({ "amount": { "value": "2", "unit": "kg" } }), json!({ "what": h(&f), "to_owner": amara.id, "for": h(&a1) }), &h(&m2), 3, None);
    let m3b = w.by_hand(&maria.id, &k, "transfer", json!({ "amount": { "value": "2", "unit": "kg" } }), json!({ "what": h(&f), "to_owner": amara.id, "for": h(&a1) }), &h(&m2), 3, None);
    w.blocks.extend([m3.clone(), m3b.clone()]);
    w.yes(&amara, &m3);
    w.yes(&amara, &m3b);
    let o = w.own(&f);
    let got = owners(&o);
    assert!(got.contains(&(amara.id.clone(), "2".to_string())), "Amara 2, once: {o}");
}

// 3b-11. What a key hands on (D11): `passes: true` on a voice; identity_state lists, per voice, whether it states it. The fold counts the
// same under either (Amara's sack is hers both ways).
#[test]
fn b3_11_what_a_key_hands_on() {
    for passes in [false, true] {
        let mut w = World::new();
        let harry = w.person(1);
        let phone = keypair_from_seed(&"5a".repeat(32)).unwrap();
        let mut p_voice = json!({ "key": phone.public_key_sign });
        if passes {
            p_voice["passes"] = json!(true);
        }
        let list = w.sign(&harry, "grant", json!({ "kind": "key", "voices": [{ "key": harry.keys.public_key_sign }, p_voice] }), json!({ "subject": harry.id, "updates": harry.id }));
        let again = w.sign(&harry, "observe", json!({ "kind": "note" }), json!({ "confirms": [h(&list)] }));
        // Q is on P's line (P made it), so P's sale is on the line that holds it
        let q = w.sign_with(&harry, &phone, "thing", json!({ "kind": "sack", "pack": sack("1") }), json!({ "of": kind("sack"), "after": [h(&again)] }));
        let amara = w.person(3);
        // a thief with P signs H5: Q to Amara; Amara accepts
        let h5 = w.sign_with(&harry, &phone, "transfer", json!({}), json!({ "what": h(&q), "to_owner": amara.id }));
        w.yes(&amara, &h5);
        let s = call("identity_state", json!([harry.id, w.blocks]));
        let pv = s["voices"].as_array().unwrap().iter().find(|v| v["key"] == json!(phone.public_key_sign)).cloned().unwrap();
        // per voice, whether it states that what it signs passes
        assert_eq!(pv.get("passes").cloned(), Some(json!(passes)), "{s}");
        let o = w.own(&q);
        assert_eq!(o["owner"], json!(amara.id), "counted, whatever the voice states: {o}");
    }
    // `passes` is `true` or left out; `receives` on one voice at most
    let refused = |voices: Value| -> Vec<String> {
        foodblock::check::write_refusals("grant", &json!({ "kind": "key", "voices": voices, "seq": 1, "at": "2026-11-12T00:00:00.000Z", "audience": "public" }), &json!({ "author": "ab".repeat(32), "prev": "ab".repeat(32), "subject": "ab".repeat(32) }), Default::default()).iter().map(|r| r.code.clone()).collect()
    };
    let (a, b) = (keypair_from_seed(&"5b".repeat(32)).unwrap(), keypair_from_seed(&"5c".repeat(32)).unwrap());
    assert!(refused(json!([{ "key": a.public_key_sign, "passes": false }])).contains(&"shape".to_string()));
    assert!(refused(json!([{ "key": a.public_key_sign, "receives": true }, { "key": b.public_key_sign, "receives": true }])).contains(&"shape".to_string()));
    assert!(!refused(json!([{ "key": a.public_key_sign }, { "key": b.public_key_sign, "receives": true, "passes": true }])).contains(&"shape".to_string()));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Every door question the oracle's stories of 3a and 3b ask (spec/oracle/core-set-a, each checked there against the text's answer), asked of
// the core: the same answer, a refusal's `detail` aside. 3a-4, 3b-1 World B, 3b-4, 3b-6, 3b-8 and 3b-9's `pair` are read here.
// Regenerate: node spec/oracle/core-set-a/export.cjs.
fn without_detail(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().filter(|(k, _)| k.as_str() != "detail").map(|(k, x)| (k.clone(), without_detail(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(without_detail).collect()),
        _ => v.clone(),
    }
}
#[test]
fn the_oracle_stories_of_3a_and_3b() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/core-set-a.json")).unwrap();
    let all: Value = serde_json::from_str(&text).unwrap();
    let mut differ = vec![];
    for q in all["questions"].as_array().unwrap() {
        let op = q["op"].as_str().unwrap();
        // a fresh key pair and a sealed copy are new each time they are made
        if matches!(op, "keypair" | "seal") {
            continue;
        }
        let out = answer(op.as_bytes(), q["args"].to_string().as_bytes());
        let ok = match q.get("error") {
            Some(_) => out.get("ok").is_none(),
            // `open_copy` answers the opened block in each engine's own shape (not of this set): the same block, by its id
            None if op == "open_copy" => out["ok"]["hash"] == q["answer"]["hash"],
            None => out.get("ok").map(without_detail) == Some(without_detail(&q["answer"])),
        };
        if !ok {
            differ.push(format!("{} {op}: core {} | oracle {}", q["story"], out.to_string().chars().take(400).collect::<String>(), q["answer"].to_string().chars().take(400).collect::<String>()));
        }
    }
    assert!(differ.is_empty(), "{} of the stories' questions differ:\n{}", differ.len(), differ.join("\n"));
}
