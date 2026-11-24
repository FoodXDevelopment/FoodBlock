//! The store: `valid` says who said these bytes, `read` whether this reader can read them, and a fold answers only
//! from a line it holds whole (core.md, sections 2, 6, 8, 9; canonical.md, On the wire; folds.md, A chain; nodes.md, The arrival log). Each
//! test is a small world of signed blocks, asked through the door.
use foodblock::door::answer;
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{keypair_from_seed, keypair_from_seed_in, write, ComposeOptions, Keypair, Readers, WriteOptions};
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
fn fails(op: &str, args: Value) -> Value {
    let out = answer(op.as_bytes(), args.to_string().as_bytes());
    assert!(out.get("ok").is_none(), "{op} answered {out}");
    out
}
fn codes(v: &Value) -> Vec<String> {
    v.as_array().unwrap().iter().map(|r| r["code"].as_str().unwrap().to_string()).collect()
}

struct World {
    blocks: Vec<Value>,
    minute: u32,
}
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
        format!("2026-11-11T{:02}:{:02}:00.000Z", self.minute / 60, self.minute % 60)
    }
    fn person(&mut self, seed: u8) -> Person {
        let keys = keypair_from_seed(&format!("{seed:02x}").repeat(32)).unwrap();
        let at = self.at();
        let g = genesis(&keys, &GenesisOptions { kind: "person", at, audience: Some(Readers::Public), ..Default::default() }).unwrap();
        self.blocks.push(g.clone());
        Person { id: g["hash"].as_str().unwrap().to_string(), keys }
    }
    fn write(&mut self, author: &str, key: &Keypair, t: &str, state: Value, refs: Value) -> Value {
        let at = self.at();
        let o = WriteOptions {
            compose: ComposeOptions { author: author.into(), at: Some(at), audience: Some(Readers::Public), ..Default::default() },
            key: Some(key),
            blocks: &self.blocks,
            schemas: None,
        };
        let b = write(t, &state, &refs, &o).unwrap_or_else(|e| panic!("{t} {state}: {e:?}"));
        self.blocks.push(b.clone());
        b
    }
    fn mine(&mut self, p: &Person, t: &str, state: Value, refs: Value) -> Value {
        let k = p.keys.clone();
        self.write(&p.id, &k, t, state, refs)
    }
    /// A block signed by hand at a place the caller names, `key_ref` the key grant that brought `key` in: what a writer would refuse.
    fn signed(&mut self, author: &str, key: &Keypair, t: &str, state: Value, refs: Value, prev: &str, seq: i64, key_ref: Option<&str>) -> Value {
        let at = self.at();
        let mut s = state;
        s["at"] = json!(at);
        s["audience"] = json!("public");
        s["seq"] = json!(seq);
        let mut r = refs;
        r["author"] = json!(author);
        r["prev"] = json!(prev);
        if let Some(k) = key_ref {
            r["key"] = json!(k);
        }
        let mut b = call("create", json!([t, s, r]));
        // `sign` refuses what its own `read` refuses; a block signed by hand is signed over its header as a message part
        let header = call("header", json!([b]));
        b["signature"] = call("sign_message", json!([header, key.private_key]))["signature"].clone();
        b
    }
}
fn hash(b: &Value) -> &str {
    b["hash"].as_str().unwrap()
}
fn without(blocks: &[Value], gone: &[&Value]) -> Vec<Value> {
    blocks.iter().filter(|b| !gone.iter().any(|g| g["hash"] == b["hash"])).cloned().collect()
}

// Every block but a genesis is signed over its header, and over nothing else; a genesis over its own bytes.
#[test]
fn a_block_is_signed_over_its_header() {
    let mut w = World::new();
    let maria = w.person(1);
    let note = w.mine(&maria, "observe", json!({ "kind": "note" }), json!({}));
    let header = call("header", json!([note]));
    let over_header = call("sign_message", json!([header, maria.keys.private_key]));
    assert_eq!(over_header["signature"], note["signature"], "the signature is the header's");
    assert_eq!(call("verify", json!([note, note["signature"], maria.keys.public_key_sign])), json!(true));
    let g = &w.blocks[0];
    assert_eq!(codes(&call("valid", json!([g, []]))), Vec::<String>::new(), "a genesis opens over its own bytes");
    assert_eq!(call("passkey_challenge", json!([note])), call("passkey_challenge", json!([header])), "the challenge is the header's");
}

// valid reads only the pieces; read reads the body and the blocks it names; a valid block that is not read is taken and kept as its header.
#[test]
fn a_block_an_older_reader_cannot_read_is_valid_and_not_read() {
    let mut w = World::new();
    let maria = w.person(1);
    let (g, k) = (maria.id.clone(), maria.keys.clone());
    let b41 = w.signed(&g, &k, "promise", json!({ "what": "loaves", "sparkle": "new" }), json!({}), &g, 1, None);
    w.blocks.push(b41.clone());
    let b42 = w.mine(&maria, "thing", json!({ "kind": "loaf" }), json!({}));
    let blocks = json!(w.blocks);
    assert!(codes(&call("valid", json!([b41, blocks]))).is_empty());
    assert_eq!(codes(&call("read", json!([b41, blocks]))), ["undeclared_field"]);
    assert!(codes(&call("valid", json!([b42, blocks]))).is_empty());
    assert!(codes(&call("read", json!([b42, blocks]))).is_empty());
    let got = call("accept", json!([[b41, b42], [w.blocks[0]], { "takes_pairs": false }, null]));
    let mut both = vec![hash(&b41).to_string(), hash(&b42).to_string()];
    both.sort();
    assert_eq!(got["taken"], json!(both));
    assert_eq!(got["unread"], json!([{ "hash": hash(&b41), "codes": ["undeclared_field"] }]));
    assert_eq!(call("read_whole", json!([hash(&b42), g, blocks])), json!({ "whole": false, "lacks": [hash(&b41)] }));
    // read is asked only of a valid body
    let other = w.person(2).keys;
    let forged = w.signed(&g, &other, "observe", json!({ "kind": "x" }), json!({}), &g, 9, None);
    assert_eq!(fails("read", json!([forged, w.blocks]))["error"], "argument");
}

// A block names its key grant in refs.key; until that piece is given it waits (`unmet`), and is unjudged in a push.
#[test]
fn a_block_before_its_key_grant_waits() {
    let mut w = World::new();
    let maria = w.person(1);
    let tablet = keypair_from_seed(&"77".repeat(32)).unwrap();
    let grant = w.mine(&maria, "grant", json!({ "kind": "key", "public_key_sign": tablet.public_key_sign }), json!({ "subject": maria.id }));
    let id = maria.id.clone();
    let first = w.write(&id, &tablet, "observe", json!({ "kind": "note" }), json!({}));
    assert_eq!(first["refs"]["key"], grant["hash"]);
    let before = without(&w.blocks, &[&grant, &first]);
    let found = call("valid", json!([first, before]));
    assert_eq!(codes(&found), ["unmet"]);
    assert!(found[0]["detail"].as_str().unwrap().contains(hash(&grant)));
    assert!(codes(&call("valid", json!([first, w.blocks]))).is_empty());
    let got = call("accept", json!([[first], before, { "takes_pairs": false }, null]));
    assert_eq!(got["unjudged"], json!([{ "hash": hash(&first), "needs": [hash(&grant)] }]));
    // a key grant that is not about its author brings no key in
    let sam = w.person(3);
    let other = w.signed(&id, &tablet, "observe", json!({ "kind": "note" }), json!({}), hash(&first), 2, Some(&sam.id));
    assert_eq!(codes(&call("valid", json!([other, w.blocks]))), ["bad_signature"]);
    // a key grant signed by the key it brings in is refused; a block that rests on it can never be valid: `bad_piece`, final
    let forger = keypair_from_seed(&"78".repeat(32)).unwrap();
    let forged = w.signed(&id, &forger, "grant", json!({ "kind": "key", "public_key_sign": forger.public_key_sign }), json!({ "subject": id }), &id, 9, None);
    assert_eq!(codes(&call("valid", json!([forged, w.blocks]))), ["bad_signature"]);
    let on = w.signed(&id, &forger, "observe", json!({ "kind": "note" }), json!({}), hash(&forged), 1, Some(hash(&forged)));
    let mut blocks = w.blocks.clone();
    blocks.push(forged.clone());
    let found = call("valid", json!([on, blocks]));
    assert_eq!(codes(&found), ["bad_piece"]);
    assert!(found[0]["detail"].as_str().unwrap().contains(hash(&forged)));
    assert_eq!(call("accept", json!([[on], blocks, { "takes_pairs": false }, null]))["refused"][0]["code"], "bad_piece");
}

// No block waits for its prev: a lost block leaves the later ones valid, and the line not whole.
#[test]
fn a_lost_block_leaves_the_line_not_whole() {
    let mut w = World::new();
    let maria = w.person(1);
    let b: Vec<Value> = (1..=5).map(|n| w.mine(&maria, "observe", json!({ "kind": "note", "n": n }), json!({}))).collect();
    let blocks = without(&w.blocks, &[&b[2]]);
    assert!(codes(&call("valid", json!([b[3], blocks]))).is_empty());
    assert_eq!(call("read_whole", json!([hash(&b[3]), hash(&b[0]), blocks])), json!({ "whole": false, "lacks": [hash(&b[2])] }));
    let held2 = without(&w.blocks, &[&b[2], &b[3]]);
    assert_eq!(call("read_whole", json!([hash(&b[4]), hash(&b[0]), held2])), json!({ "whole": false, "lacks": [hash(&b[3]), { "author": maria.id, "key": null, "seq": 3 }] }));
    assert_eq!(call("read_whole", json!([hash(&b[4]), hash(&b[0]), w.blocks])), json!({ "whole": true, "lacks": [] }));
    assert_eq!(fails("read_whole", json!([hash(&b[4]), "e".repeat(64), w.blocks]))["error"], "argument");
    let chain = call("check_chain", json!([blocks, maria.id]));
    assert_eq!(chain["gaps"], json!([3]));
}

// A pair: two blocks of one key on one prev, or at one seq, from bodies or headers.
#[test]
fn a_pair_is_one_prev_or_one_seq() {
    let mut w = World::new();
    let maria = w.person(1);
    let (g, k) = (maria.id.clone(), maria.keys.clone());
    let six = w.mine(&maria, "observe", json!({ "kind": "note" }), json!({}));
    let a = w.signed(&g, &k, "observe", json!({ "kind": "a" }), json!({}), hash(&six), 2, None);
    let b = w.signed(&g, &k, "observe", json!({ "kind": "b" }), json!({}), hash(&six), 2, None);
    let c = w.signed(&g, &k, "observe", json!({ "kind": "c" }), json!({}), &"cd".repeat(32), 2, None);
    let pair = |x: &Value, y: &Value| {
        let mut p = vec![hash(x).to_string(), hash(y).to_string()];
        p.sort();
        json!([p])
    };
    let mut blocks = w.blocks.clone();
    blocks.extend([a.clone(), b.clone()]);
    assert_eq!(call("fork_pairs", json!([blocks])), pair(&a, &b));
    let mut blocks = w.blocks.clone();
    blocks.extend([a.clone(), c.clone()]);
    assert_eq!(call("fork_pairs", json!([blocks])), pair(&a, &c), "one seq, a made-up prev");
    let headers: Vec<Value> = [&a, &b].iter().map(|x| json!({ "header": call("header", json!([x])), "header_signature": x["signature"] })).collect();
    assert_eq!(call("fork_pairs", json!([[w.blocks[0], headers[0], headers[1]]])), pair(&a, &b), "two headers are the whole proof");
    let got = call("accept", json!([[a, c], [w.blocks[0]], { "takes_pairs": false }, null]));
    assert_eq!((got["taken"].clone(), got["equivocations"].clone()), (json!([]), pair(&a, &c)));
    let chain = call("check_chain", json!([[six, a, c], g]));
    assert_eq!(chain["equivocations"], pair(&a, &c));
}

// A header a reader has is valid on its pieces and its signature; one that is not the signed header is not.
#[test]
fn a_held_header_is_judged_by_its_signature() {
    let mut w = World::new();
    let maria = w.person(1);
    let note = w.mine(&maria, "observe", json!({ "kind": "note" }), json!({}));
    let message = json!({ "header": call("header", json!([note])), "header_signature": note["signature"] });
    assert!(codes(&call("valid", json!([message, w.blocks]))).is_empty());
    let mut moved = message.clone();
    moved["header"]["seq"] = json!(7);
    assert_eq!(codes(&call("valid", json!([moved, w.blocks]))), ["bad_signature"]);
    let mut extra = message.clone();
    extra["header"]["at"] = json!("2026-11-11T00:00:00.000Z");
    // a header given alone's wrong keys are its header's fault (`chain`): `valid` gives one of eight codes
    assert_eq!(codes(&call("valid", json!([extra, w.blocks]))), ["chain"]);
    assert_eq!(fails("read", json!([message, w.blocks]))["error"], "argument");
}

// The wire: a message is canonical JSON whole; a refusal names the bytes it refuses. Text is compared byte for byte.
#[test]
fn the_wire_has_one_spelling_and_text_no_table() {
    let mut w = World::new();
    let maria = w.person(1);
    let loaf = w.mine(&maria, "thing", json!({ "kind": "loaf", "count": 450 }), json!({}));
    let text = call("canonical", json!([loaf["type"], loaf["state"], loaf["refs"]])).as_str().unwrap().to_string();
    assert_eq!(call("strict_text", json!([text])), json!([]));
    let reordered = serde_json::to_string(&json!({ "type": loaf["type"], "state": loaf["state"], "refs": loaf["refs"] })).unwrap();
    for bad in [text.replace("450", "450.0"), text.replace("{\"refs\"", "{ \"refs\""), reordered, text.replace("450", "4.5e2")] {
        let r = call("strict_text", json!([bad]));
        assert_eq!(codes(&r), ["not_canonical"], "{bad}");
        assert_eq!(r[0]["hash"], call("hash_hex", json!([bad])));
    }
    // a push is exactly { messages, for }
    let push = |block: &str| format!("{{\"for\":\"x\",\"messages\":[{{\"block\":{block},\"signature\":\"{}\"}}]}}", loaf["signature"].as_str().unwrap());
    // one list per message, plus one field for a refusal of the whole push
    assert_eq!(call("strict_push", json!([push(&text)])), json!({ "messages": [[]] }));
    let respelled = push(&text.replace("450", "450.0"));
    let whole = call("strict_push", json!([respelled]));
    assert_eq!(whole["refused"]["code"], "not_canonical");
    assert_eq!(whole["refused"]["hash"], call("hash_hex", json!([respelled])));
    let float = push(&text.replace("450", "1.5"));
    assert_eq!(call("strict_push", json!([float]))["refused"]["code"], "not_canonical", "a float inside one block refuses the whole push");
    // two Unicode spellings of one word are two texts
    let nfc = w.mine(&maria, "thing", json!({ "kind": "caf\u{e9}" }), json!({}));
    let nfd = w.mine(&maria, "thing", json!({ "kind": "cafe\u{301}" }), json!({}));
    assert_ne!(nfc["hash"], nfd["hash"]);
    let got = call("accept", json!([[nfc, nfd], [w.blocks[0]], { "takes_pairs": false }, null]));
    assert_eq!(got["taken"].as_array().unwrap().len(), 2);
    assert_eq!(fails("unwrap", json!([{ "block": { "type": "thing", "state": {}, "refs": {} }, "signature": "00", "suite": "std" }]))["code"], "shape");
}

// A passkey signs the challenge of the header in a 91-byte frame; at most limits.signature_bytes.
#[test]
fn a_passkey_signature_is_framed_and_capped() {
    use p256::ecdsa::signature::Signer;
    use sha2::Digest;
    let mut w = World::new();
    let keys = keypair_from_seed_in("p256", &"21".repeat(32)).unwrap();
    let at = w.at();
    let g = genesis(&keys, &GenesisOptions { kind: "person", at, audience: Some(Readers::Public), ..Default::default() }).unwrap();
    w.blocks.push(g.clone());
    let at = w.at();
    let block = call("create", json!(["observe", { "kind": "note", "at": at, "audience": "public", "seq": 1 }, { "author": g["hash"], "prev": g["hash"] }]));
    let challenge = call("passkey_challenge", json!([block])).as_str().unwrap().to_string();
    let signer = p256::ecdsa::SigningKey::from_slice(&[0x21; 32]).unwrap();
    let mut auth = vec![7u8; 32];
    // user present and user verified (passkey flags)
    auth.extend([5, 0, 0, 0, 0]);
    let sign = |cdj: &[u8]| {
        let mut m = auth.clone();
        m.extend(sha2::Sha256::digest(cdj));
        let sig: p256::ecdsa::Signature = signer.sign(&m);
        let hex = |b: &[u8]| b.iter().map(|x| format!("{x:02x}")).collect::<String>();
        call("passkey_signature", json!([hex(&auth), hex(cdj), hex(&sig.to_bytes())])).as_str().unwrap().to_string()
    };
    let framed = |total: usize| {
        let mut cdj = format!("{{\"type\":\"webauthn.get\",\"challenge\":\"{challenge}\",\"origin\":\"https://example.org\"}}").into_bytes();
        cdj.resize(total - 103, b' ');
        sign(&cdj)
    };
    let with = |sig: String| {
        let mut b = block.clone();
        b["signature"] = json!(sig);
        codes(&call("valid", json!([b, w.blocks])))
    };
    assert!(with(framed(8192)).is_empty(), "8,192 bytes");
    assert_eq!(with(framed(8193)), ["bad_signature"], "8,193 bytes");
    let reordered = format!("{{\"challenge\":\"{challenge}\",\"type\":\"webauthn.get\",\"origin\":\"https://example.org\"}}");
    assert_eq!(with(sign(reordered.as_bytes())), ["bad_signature"], "the frame is read as bytes, never as JSON");
}

// A stranger's first push carries its pieces; per_stranger counts asks, never pieces.
#[test]
fn a_stranger_brings_his_pieces_and_only_asks_are_counted() {
    let mut w = World::new();
    let maria = w.person(1);
    let node = w.blocks.clone();
    let harry = w.person(2);
    let ask = w.mine(&harry, "observe", json!({ "kind": "note" }), json!({ "to": maria.id }));
    let got = call("accept", json!([[w.blocks[1], ask], node, { "takes_pairs": false }, null]));
    let mut both = vec![harry.id.clone(), hash(&ask).to_string()];
    both.sort();
    assert_eq!(got["taken"], json!(both));
    let rule = json!({ "per_stranger": 20 });
    assert!(codes(&call("admission_refusals", json!([w.blocks[1], maria.id, w.blocks, rule, 60]))).is_empty(), "a piece is never counted");
    assert!(codes(&call("admission_refusals", json!([ask, maria.id, w.blocks, rule, 0]))).is_empty());
    assert_eq!(codes(&call("admission_refusals", json!([ask, maria.id, w.blocks, rule, 20]))), ["not_admitted"]);
}

// The push answer: unjudged and unread, every key but receipt and had always there.
#[test]
fn a_push_answer_lists_unjudged_and_unread() {
    let mut w = World::new();
    let maria = w.person(1);
    let node = w.person(2);
    let tablet = keypair_from_seed(&"77".repeat(32)).unwrap();
    let grant = w.mine(&maria, "grant", json!({ "kind": "key", "public_key_sign": tablet.public_key_sign }), json!({ "subject": maria.id }));
    let id = maria.id.clone();
    let early = w.write(&id, &tablet, "observe", json!({ "kind": "note" }), json!({}));
    let odd = w.signed(&id, &maria.keys, "promise", json!({ "what": "x", "sparkle": 1 }), json!({}), hash(&grant), 2, None);
    let got = call("accept", json!([[early, odd], [w.blocks[0], w.blocks[1]], { "takes_pairs": false }, null]));
    assert_eq!(got["unjudged"], json!([{ "hash": hash(&early), "needs": [hash(&grant)] }]));
    assert_eq!(got["unread"], json!([{ "hash": hash(&odd), "codes": ["undeclared_field"] }]));
    let signed = call("push_answer", json!([got, node.id, node.keys.private_key]));
    let mut keys: Vec<&String> = signed.as_object().unwrap().keys().collect();
    keys.sort();
    assert_eq!(keys, ["equivocations", "node", "refused", "signature", "taken", "unjudged", "unread"]);
}

// A door log: receipts on a key of the node's own, a dropped, and what a pull answer's signed words show; an export, whole or not.
#[test]
fn a_door_log_shows_what_was_left_out_and_an_export_is_whole() {
    let mut w = World::new();
    let maria = w.person(1);
    let harry = w.person(2);
    let node = w.person(3);
    let door = keypair_from_seed(&"99".repeat(32)).unwrap();
    let log = w.mine(&node, "grant", json!({ "kind": "key", "public_key_sign": door.public_key_sign }), json!({ "subject": node.id }));
    let again = w.mine(&node, "observe", json!({ "kind": "note" }), json!({ "confirms": [log["hash"]] }));
    let offer = w.mine(&maria, "promise", json!({ "terms": deal_terms(json!({ "quantity": { "value": "1", "unit": "loaf" } }), Some(&maria.id)) }), json!({ "from": maria.id }));
    let accept = w.mine(&harry, "promise", json!({ "status": "accepted" }), json!({ "answers": offer["hash"], "for": offer["hash"] }));
    let note = w.mine(&harry, "observe", json!({ "kind": "note" }), json!({ "to": maria.id }));
    let nid = node.id.clone();
    let receipt = |w: &mut World, of: &Value, kind: &str| {
        let at = w.at();
        let o = WriteOptions {
            compose: ComposeOptions { author: nid.clone(), at: Some(at), audience: Some(Readers::To(vec![maria.id.clone(), harry.id.clone()])), after: vec![again["hash"].as_str().unwrap().into()], ..Default::default() },
            key: Some(&door),
            blocks: &w.blocks,
            schemas: None,
        };
        let b = write("observe", &json!({ "kind": kind }), &json!({ "derives_from": [of["hash"]], "subject": maria.id }), &o).unwrap();
        w.blocks.push(b.clone());
        b
    };
    let r1 = receipt(&mut w, &offer, "receipt");
    let r2 = receipt(&mut w, &accept, "receipt");
    let r3 = receipt(&mut w, &note, "receipt");
    let request = call("sign_pull", json!([{ "since": 1, "log": log["hash"], "seen": r3["hash"] }, { "who": maria.id, "node": node.id, "private_key": maria.keys.private_key, "counter": 1 }]));
    let answer = |shown: Value, next: i64| call("answer_pull", json!([shown, request, node.id, node.keys.private_key, { "cap": 10, "serves_pairs": false }, maria.id, null, null, next]));
    let only_note = json!([{ "n": r3["state"]["seq"], "block": note }]);
    let a = answer(only_note.clone(), 3);
    assert_eq!(a["log"], log["hash"]);
    assert_eq!(call("log_shown", json!([[r1, r2, r3], request, a, w.blocks])), json!({ "left_out": [accept["hash"]], "stopped_short": false }));
    let dropped = receipt(&mut w, &accept, "dropped");
    let a = answer(only_note, 4);
    assert_eq!(call("log_shown", json!([[r1, r2, r3, dropped], request, a, w.blocks]))["left_out"], json!([]));
    assert_eq!(call("log_shown", json!([[r1, r2, r3], request, answer(json!([]), 1), w.blocks]))["stopped_short"], json!(true));
    let wrap = |b: &Value| call("wrap", json!([b]));
    let all: Vec<Value> = w.blocks.iter().map(wrap).collect();
    let doc = |messages: Vec<Value>| json!({ "format": "application/foodblock+json", "messages": messages });
    assert_eq!(call("export_whole", json!([doc(all.clone()), log["hash"], dropped["hash"]])), json!({ "whole": true, "lacks": [] }));
    let cut: Vec<Value> = w.blocks.iter().filter(|b| b["hash"] != note["hash"]).map(wrap).collect();
    assert_eq!(call("export_whole", json!([doc(cut), log["hash"], dropped["hash"]])), json!({ "whole": false, "lacks": [note["hash"]] }));
}
