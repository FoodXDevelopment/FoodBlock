//! Times the folds a node runs most on a record of N signed blocks (stories of: a thing, a sale accepted, a shelf, a move, an offer
//! and its accept). Run: cargo run --release --example fold_timing -- 1000 10000 100000
use foodblock::fold::{backed_all, owed_back, ownership, promise_stage, where_now, StageOptions};
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{create_in, keypair_from_seed, sign, Keypair, Readers};
use serde_json::{json, Value};
use std::time::Instant;

struct Person {
    id: String,
    keys: Keypair,
    seq: i64,
    prev: String,
}

fn post(blocks: &mut Vec<Value>, who: &mut Person, n: usize, ty: &str, mut state: Value, mut refs: Value) -> String {
    who.seq += 1;
    let at = format!("2026-10-15T09:{:02}:{:02}.{:03}Z", (n / 60000) % 60, (n / 1000) % 60, n % 1000);
    state["at"] = json!(at);
    state["audience"] = json!("public");
    state["seq"] = json!(who.seq);
    refs["author"] = json!(who.id);
    refs["prev"] = json!(who.prev);
    let mut b = create_in("std", ty, &state, &refs).unwrap();
    let sig = sign(&b, &who.keys.private_key).unwrap();
    b["signature"] = json!(sig);
    let h = b["hash"].as_str().unwrap().to_string();
    who.prev = h.clone();
    blocks.push(b);
    h
}

fn world(target: usize) -> (Vec<Value>, Vec<(Value, Value)>) {
    let people = (target / 40).clamp(4, 2000);
    let mut blocks = Vec::new();
    let mut ps: Vec<Person> = (0..people)
        .map(|i| {
            let keys = keypair_from_seed(&format!("{:064x}", i + 1)).unwrap();
            let g = genesis(&keys, &GenesisOptions { kind: "person", at: "2026-10-15T08:00:00.000Z".into(), audience: Some(Readers::Public), ..Default::default() }).unwrap();
            let id = g["hash"].as_str().unwrap().to_string();
            blocks.push(g);
            Person { id: id.clone(), keys, seq: 0, prev: id }
        })
        .collect();
    let kind = post(&mut blocks, &mut ps[0], 0, "thing", json!({"kind":"egg","name":"Eggs"}), json!({}));
    let mut probes = Vec::new();
    let mut n = 0;
    let mut story = 0;
    while blocks.len() < target {
        let (s, b) = (story % people, (story * 7 + 1) % people);
        let (s, b) = if s == b { (s, (b + 1) % people) } else { (s, b) };
        story += 1;
        n += 1;
        let mut sp = std::mem::replace(&mut ps[s], Person { id: String::new(), keys: keypair_from_seed(&"01".repeat(32)).unwrap(), seq: 0, prev: String::new() });
        let bid = ps[b].id.clone();
        let sid = sp.id.clone();
        let t = post(&mut blocks, &mut sp, n, "thing", json!({"kind":"egg","lot":format!("L{story}")}), json!({"of": kind}));
        let shelf = post(&mut blocks, &mut sp, n, "thing", json!({"kind":"shelf"}), json!({}));
        let tr = post(&mut blocks, &mut sp, n, "transfer", json!({}), json!({"what": t, "to_owner": bid}));
        let offer = post(&mut blocks, &mut sp, n, "promise", json!({"terms":{"price":{"minor":450,"currency":"GBP"},"expires":"2027-10-20T00:00:00.000Z"}}), json!({"from": sid, "to": bid, "what": t}));
        ps[s] = sp;
        {
            let bp = &mut ps[b];
            post(&mut blocks, bp, n, "transfer", json!({"status":"accepted"}), json!({"answers": tr}));
            post(&mut blocks, bp, n, "transfer", json!({}), json!({"what": t, "to_place": shelf}));
            post(&mut blocks, bp, n, "promise", json!({"status":"accepted"}), json!({"answers": offer, "for": offer, "after": [offer]}));
        }
        if story % (people.max(1) * 3).max(7) == 3 || probes.len() < 3 {
            let t_b = blocks.iter().find(|x| x["hash"] == json!(t)).unwrap().clone();
            let o_b = blocks.iter().find(|x| x["hash"] == json!(offer)).unwrap().clone();
            probes.push((t_b, o_b));
        }
    }
    (blocks, probes)
}

fn time<R>(label: &str, f: impl FnOnce() -> R) -> R {
    let t = Instant::now();
    let r = f();
    println!("  {label:<22} {:>10.1} ms", t.elapsed().as_secs_f64() * 1000.0);
    r
}

fn main() {
    let sizes: Vec<usize> = std::env::args().skip(1).filter_map(|a| a.parse().ok()).collect();
    for n in if sizes.is_empty() { vec![1000, 10000] } else { sizes } {
        let t = Instant::now();
        let (blocks, probes) = world(n);
        println!("{} blocks (built in {:.1} s)", blocks.len(), t.elapsed().as_secs_f64());
        let (thing, offer) = &probes[probes.len() / 2];
        // FT_LOOP=ownership|where_now|promise_stage|owed_back: repeat one op, to sample it
        if let Ok(op) = std::env::var("FT_LOOP") {
            loop {
                match op.as_str() {
                    "ownership" => drop(ownership(thing, &blocks)),
                    "where_now" => drop(where_now(thing, &blocks)),
                    "promise_stage" => drop(promise_stage(offer, &blocks, &StageOptions::default())),
                    _ => drop(owed_back(blocks[0]["hash"].as_str().unwrap(), &blocks)),
                }
            }
        }
        let o = time("ownership", || ownership(thing, &blocks));
        let w = time("where_now", || where_now(thing, &blocks));
        let p = time("promise_stage", || promise_stage(offer, &blocks, &StageOptions::default()));
        let person = blocks[0]["hash"].as_str().unwrap().to_string();
        let ob = time("owed_back", || owed_back(&person, &blocks));
        let ba = time("backed_all", || backed_all(&person, &blocks));
        println!("  checksum owner {:?} where {:?} {} {} {}", o.owner.is_some(), w, p["stage"], ob.to_string().len(), ba.to_string().len());
    }
}
