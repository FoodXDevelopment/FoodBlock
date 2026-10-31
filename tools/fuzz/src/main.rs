//! `fbfuzz serve`: read `{"op":..,"args":[..]}` lines on stdin, write the core's door answer per line (the differential
//! driver compares them with the spec-only oracle). `fbfuzz run <seed> <seconds>`: mutate the conformance vectors and
//! hit the core with them, checking: no panic (the door reports one as `internal`), no hang (a watchdog aborts and
//! prints the case), canonical(parse(x)) round-trips, CBOR decode/encode round-trips.
use foodblock::door::answer;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        if n == 0 { 0 } else { (self.next() % n as u64) as usize }
    }
    fn coin(&mut self, n: usize) -> bool {
        self.below(n) == 0
    }
}

const STRINGS: &[&str] = &[
    "", " ", "public", "e\u{301}", "\u{e9}", "\u{0}", "\u{feff}", "\u{1f355}", "\u{d7ff}", "\u{10ffff}", "a\u{300}\u{301}", "Z",
    "2026-02-30T00:00:00.000Z", "2026-10-15T12:00:60.000Z", "2026-10-15T12:00:00Z", "2026-10-15T12:00:00.000Z", "9999-12-31T23:59:59.999Z",
    "0000-01-01T00:00:00.000Z", "P1Y", "PT0S", "P", "PT", "P99999999999Y", "-0", "01", "1.", "-1.5", "0.80", "1e5",
    "stopped", "yes", "no", "accepted", "declined", "withdrawn", "key", "limit", "scope", "circle", "person", "agent", "schema",
    "__proto__", "constructor", "sm3:", "sm", "p256", "ml-dsa", "Hello World", "UPPER", "a b", "ab-cd",
];
fn long(r: &mut Rng) -> String {
    let n = [100, 1000, 70_000, 300_000][r.below(4)];
    let c = ["a", "\u{e9}", "\u{1f355}", "0"][r.below(4)];
    c.repeat(n)
}
fn hex64(r: &mut Rng) -> String {
    (0..64).map(|_| b"0123456789abcdef"[r.below(16)] as char).collect()
}
fn junk_number(r: &mut Rng) -> Value {
    match r.below(14) {
        0 => json!(0), 1 => json!(-1), 2 => json!(9007199254740991i64), 3 => json!(9007199254740992i64), 4 => json!(-9007199254740991i64),
        5 => json!(-9007199254740992i64), 6 => json!(i64::MAX), 7 => json!(u64::MAX), 8 => json!(1.5), 9 => json!(1e300),
        10 => Value::from(-0.0f64), 11 => json!(1e21), 12 => json!(2), _ => json!(r.below(100) as i64),
    }
}
fn junk_leaf(r: &mut Rng) -> Value {
    match r.below(9) {
        0 => Value::Null,
        1 => json!(r.coin(2)),
        2 | 3 => junk_number(r),
        4 => json!(hex64(r)),
        5 if r.coin(6) => json!(long(r)),
        _ => json!(STRINGS[r.below(STRINGS.len())]),
    }
}
fn deep(r: &mut Rng) -> Value {
    let n = [20, 100, 126, 140, 400][r.below(5)];
    let mut v = json!(1);
    for _ in 0..n {
        v = if r.coin(2) { json!([v]) } else { json!({ "a": v }) };
    }
    v
}

/// Count the nodes, then edit the nth.
fn count(v: &Value) -> usize {
    1 + match v {
        Value::Array(a) => a.iter().map(count).sum(),
        Value::Object(o) => o.values().map(count).sum(),
        _ => 0,
    }
}
fn edit(v: &mut Value, n: &mut usize, r: &mut Rng, donor: &Value) {
    if *n == 0 {
        *n = usize::MAX;
        mutate_node(v, r, donor);
        return;
    }
    *n -= 1;
    match v {
        Value::Array(a) => {
            for x in a.iter_mut() {
                if *n == usize::MAX { return; }
                edit(x, n, r, donor);
            }
        }
        Value::Object(o) => {
            for (_, x) in o.iter_mut() {
                if *n == usize::MAX { return; }
                edit(x, n, r, donor);
            }
        }
        _ => {}
    }
}
fn sub_of(v: &Value, r: &mut Rng) -> Value {
    let n = count(v);
    let mut k = r.below(n);
    fn get(v: &Value, k: &mut usize) -> Option<Value> {
        if *k == 0 { return Some(v.clone()); }
        *k -= 1;
        match v {
            Value::Array(a) => a.iter().find_map(|x| get(x, k)),
            Value::Object(o) => o.values().find_map(|x| get(x, k)),
            _ => None,
        }
    }
    get(v, &mut k).unwrap_or(Value::Null)
}
fn mutate_node(v: &mut Value, r: &mut Rng, donor: &Value) {
    match r.below(12) {
        0 => *v = junk_leaf(r),
        1 => *v = sub_of(donor, r),
        2 => *v = deep(r),
        3 => *v = Value::Array(vec![v.clone(), v.clone()]),
        4 => *v = json!({ "x": v.clone() }),
        _ => match v {
            Value::Object(o) => match r.below(5) {
                0 if !o.is_empty() => { let k = o.keys().nth(r.below(o.len())).unwrap().clone(); o.shift_remove(&k); }
                1 => { let k = STRINGS[r.below(STRINGS.len())].to_string(); o.insert(k, junk_leaf(r)); }
                2 if !o.is_empty() => { let k = o.keys().nth(r.below(o.len())).unwrap().clone(); let x = o.shift_remove(&k).unwrap(); o.insert(format!("{k}\u{301}"), x); }
                3 => { let k = ["author", "prev", "after", "answers", "updates", "for", "what", "to_owner", "under", "of"][r.below(10)]; o.insert(k.into(), if r.coin(2) { json!(hex64(r)) } else { Value::Array((0..r.below(4)).map(|_| json!(hex64(r))).collect()) }); }
                _ => { let (k, x) = (STRINGS[r.below(STRINGS.len())].to_string(), sub_of(donor, r)); o.insert(k, x); }
            },
            Value::Array(a) => match r.below(4) {
                0 if !a.is_empty() => { a.remove(r.below(a.len())); }
                1 => a.reverse(),
                2 if !a.is_empty() => { let x = a[r.below(a.len())].clone(); a.push(x); }
                _ => a.push(junk_leaf(r)),
            },
            Value::String(s) => match r.below(4) {
                0 => { let mut c: Vec<char> = s.chars().collect(); if !c.is_empty() { let i = r.below(c.len()); c[i] = if c[i] == '0' { '1' } else { '0' }; } *s = c.into_iter().collect(); }
                1 => s.push_str("\u{301}"),
                2 => { let n = s.chars().count(); *s = s.chars().take(n.saturating_sub(1)).collect(); }
                _ => *v = junk_leaf(r),
            },
            Value::Number(_) => *v = junk_number(r),
            _ => *v = junk_leaf(r),
        },
    }
}
pub fn mutate(v: &Value, r: &mut Rng, donor: &Value) -> Value {
    let mut out = v.clone();
    for _ in 0..1 + r.below(3) {
        let mut n = r.below(count(&out));
        edit(&mut out, &mut n, r, donor);
    }
    out
}

fn vectors() -> Value {
    let p = concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/vectors.json");
    serde_json::from_str(&std::fs::read_to_string(p).expect("spec/vectors.json")).unwrap()
}
fn canonical_vectors() -> Value {
    let p = concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/canonical-vectors.json");
    serde_json::from_str(&std::fs::read_to_string(p).expect("canonical-vectors.json")).unwrap()
}

fn serve() {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        // A request that is not JSON still gets one answer line, so the driver never loses count.
        let Ok(req) = serde_json::from_str::<Value>(&line) else {
            writeln!(out, "{}", json!({ "error": "json", "message": "request is not JSON" })).unwrap();
            out.flush().unwrap();
            continue;
        };
        let op = req["op"].as_str().unwrap_or("");
        let args = req["args"].to_string();
        let a = answer(op.as_bytes(), args.as_bytes());
        writeln!(out, "{}", a).unwrap();
        out.flush().unwrap();
    }
}

struct Stats {
    calls: u64,
    per_op: BTreeMap<String, u64>,
    ok: u64,
    refused: u64,
    errors: BTreeMap<String, u64>,
    codes: BTreeMap<String, u64>,
    failures: Vec<String>,
    rt: u64,
}

fn note_codes(v: &Value, s: &mut Stats) {
    match v {
        Value::Array(a) => a.iter().for_each(|x| note_codes(x, s)),
        Value::Object(o) => {
            if let Some(c) = o.get("code").and_then(Value::as_str) { *s.codes.entry(c.into()).or_default() += 1; }
            o.values().for_each(|x| note_codes(x, s));
        }
        _ => {}
    }
}

fn run(seed: u64, secs: u64) {
    let v = vectors();
    let cv = canonical_vectors();
    let mut cases: Vec<(String, Vec<Value>)> = v["door"].as_array().unwrap().iter().map(|d| (d["op"].as_str().unwrap().to_string(), d["args"].as_array().unwrap().clone())).collect();
    // The blocks of every story give mutation donors and block-shaped arguments.
    let mut blocks: Vec<Value> = vec![];
    fn walk(v: &Value, out: &mut Vec<Value>) {
        match v {
            Value::Object(o) => { if o.contains_key("type") && o.contains_key("state") && o.contains_key("refs") { out.push(v.clone()); } o.values().for_each(|x| walk(x, out)); }
            Value::Array(a) => a.iter().for_each(|x| walk(x, out)),
            _ => {}
        }
    }
    walk(&v, &mut blocks);
    walk(&cv, &mut blocks);
    let held: Vec<Value> = blocks.iter().filter(|b| b.get("hash").is_some() && b.get("signature").is_some()).cloned().collect();
    let cbor_hex: Vec<String> = cases.iter().filter(|c| c.0 == "cbor_decode").filter_map(|c| c.1[0].as_str().map(String::from)).collect();
    for op in ["valid", "refusals", "promise_stage", "circle_state", "ownership", "where_now", "accept", "may_act_as", "consent", "successor_state", "check_chain", "chains_of", "causal_order", "write", "cbor_encode", "canonical_json", "unwrap", "strict_text", "hash"] {
        for b in blocks.iter().take(40) {
            let a = match op {
                "valid" => vec![b.clone(), Value::Array(held.clone())],
                "refusals" => vec![b["type"].clone(), b["state"].clone(), b["refs"].clone(), json!({})],
                "promise_stage" | "ownership" | "where_now" | "successor_state" => vec![b.clone(), Value::Array(held.clone())],
                "circle_state" => vec![b["hash"].clone(), Value::Array(held.clone())],
                "accept" => vec![json!([b]), Value::Array(held.clone()), json!({ "takes_pairs": b["hash"].as_str().map_or(false, |h| h.as_bytes()[0] % 2 == 0) })],
                "may_act_as" => vec![b.clone(), b["hash"].clone(), Value::Array(held.clone())],
                "consent" => vec![b["hash"].clone(), b["hash"].clone(), Value::Array(held.clone()), Value::Null],
                "check_chain" => vec![Value::Array(held.clone()), b["hash"].clone()],
                "chains_of" | "causal_order" => vec![Value::Array(held.clone())],
                "strict_text" => vec![json!(foodblock::canonical_json(b))],
                "unwrap" => vec![json!({"block": b, "signature": b["signature"]})],
                "hash" => vec![b["type"].clone(), b["state"].clone(), b["refs"].clone()],
                "canonical_json" => vec![b.clone()],
                "cbor_encode" => vec![b.clone()],
                _ => vec![b.clone()],
            };
            cases.push((op.to_string(), a));
        }
    }
    let ops: Vec<String> = { let mut o: Vec<String> = cases.iter().map(|c| c.0.clone()).collect(); o.sort(); o.dedup(); o };

    let mut r = Rng(seed.wrapping_mul(0x9E3779B97F4A7C15) | 1);
    let stats = Arc::new(Mutex::new(Stats { calls: 0, per_op: BTreeMap::new(), ok: 0, refused: 0, errors: BTreeMap::new(), codes: BTreeMap::new(), failures: vec![], rt: 0 }));
    let current = Arc::new(Mutex::new(String::new()));
    let started = Arc::new(AtomicU64::new(0));
    let t0 = Instant::now();
    {
        let (current, started) = (current.clone(), started.clone());
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(500));
            let s = started.load(Ordering::Relaxed);
            if s != 0 && (t0.elapsed().as_millis() as u64).saturating_sub(s) > 20_000 {
                let c = current.lock().unwrap().clone();
                eprintln!("HANG (>20s). Case: {}", &c[..c.len().min(4000)]);
                std::process::exit(3);
            }
        });
    }
    let mut keep_going = true;
    while keep_going && t0.elapsed() < Duration::from_secs(secs) {
        let (op, args) = &cases[r.below(cases.len())];
        let mut op = op.clone();
        let mut args = Value::Array(args.clone());
        let donor = Value::Array(blocks.iter().take(30).cloned().collect());
        if r.coin(25) { op = ops[r.below(ops.len())].clone(); }
        if !r.coin(8) { args = mutate(&args, &mut r, &donor); }
        if !args.is_array() { args = json!([args]); }
        let case = json!({ "op": op, "args": args }).to_string();
        *current.lock().unwrap() = case.clone();
        // a crash that aborts (memory, stack) cannot print: the case is on disk first
        if let Ok(path) = std::env::var("FBFUZZ_LAST") {
            let _ = std::fs::write(path, &case);
        }
        started.store(t0.elapsed().as_millis() as u64 + 1, Ordering::Relaxed);
        let t = Instant::now();
        let a = answer(op.as_bytes(), args.to_string().as_bytes());
        let took = t.elapsed();
        started.store(0, Ordering::Relaxed);
        let mut s = stats.lock().unwrap();
        s.calls += 1;
        *s.per_op.entry(op.clone()).or_default() += 1;
        if let Some(ok) = a.get("ok") { s.ok += 1; note_codes(ok, &mut s); } else {
            let k = a["error"].as_str().unwrap_or("?").to_string();
            if k == "refused" { s.refused += 1; }
            if k == "internal" { let m = format!("PANIC {}: {}", a["message"], &case[..case.len().min(3000)]); s.failures.push(m); }
            if let Some(c) = a.get("code").and_then(Value::as_str) { *s.codes.entry(c.into()).or_default() += 1; }
            *s.errors.entry(k).or_default() += 1;
        }
        if took > Duration::from_secs(5) { let m = format!("SLOW {:?}: {}", took, &case[..case.len().min(3000)]); s.failures.push(m); }
        // canonical round trip, on any block-shaped value and on the text of the mutated argument
        let texts: Vec<String> = { let mut t = vec![args.to_string()]; if let Some(f) = args.get(0) { t.push(f.to_string()); } if let Some(x) = args.get(0).and_then(Value::as_str) { t.push(x.to_string()); } t };
        for text in texts {
            if let Ok(parsed) = foodblock::canonical::parse_strict(&text) {
                let c = foodblock::canonical_json(&parsed);
                match foodblock::canonical::parse_strict(&c) {
                    Ok(again) => { let c2 = foodblock::canonical_json(&again); s.rt += 1; if c2 != c { s.failures.push(format!("ROUNDTRIP not idempotent: {}", &text[..text.len().min(2000)])); } }
                    Err(e) => s.failures.push(format!("ROUNDTRIP canonical output not strict ({e}): {}", &text[..text.len().min(2000)])),
                }
            }
        }
        // the bytes of a block, bent: strict parsing may refuse, never panic, and what it accepts round-trips
        if r.coin(6) && !blocks.is_empty() {
            let b = &blocks[r.below(blocks.len())];
            let mut bytes = foodblock::canonical_json(b).into_bytes();
            for _ in 0..1 + r.below(4) {
                if bytes.is_empty() {
                    break;
                }
                let i = r.below(bytes.len());
                match r.below(4) {
                    0 => bytes[i] = r.next() as u8,
                    1 => { bytes.remove(i); }
                    2 => bytes.insert(i, b"{}[]\",:\"\\0eE.-+"[r.below(15)]),
                    _ => bytes.truncate(i),
                }
            }
            let text = String::from_utf8_lossy(&bytes).to_string();
            if let Ok(parsed) = foodblock::canonical::parse_strict(&text) {
                let c = foodblock::canonical_json(&parsed);
                if foodblock::canonical::parse_strict(&c).map(|a| foodblock::canonical_json(&a)) != Ok(c.clone()) {
                    s.failures.push(format!("ROUNDTRIP (bent bytes) {}", &text[..text.len().min(1000)]));
                }
                s.rt += 1;
            }
            let _ = answer(b"strict_text", json!([text]).to_string().as_bytes());
        }
        // CBOR
        if op == "cbor_decode" || r.coin(30) {
            let hex = if let Some(h) = args.get(0).and_then(Value::as_str) { h.to_string() } else { cbor_hex.get(r.below(cbor_hex.len().max(1))).cloned().unwrap_or_default() };
            let mut bytes: Vec<u8> = (0..hex.len() / 2).filter_map(|i| u8::from_str_radix(hex.get(2 * i..2 * i + 2)?, 16).ok()).collect();
            for _ in 0..r.below(3) { if !bytes.is_empty() { let i = r.below(bytes.len()); bytes[i] = r.next() as u8; } if r.coin(4) && !bytes.is_empty() { bytes.truncate(r.below(bytes.len())); } }
            let h: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
            if let Ok(path) = std::env::var("FBFUZZ_LAST") {
                let _ = std::fs::write(path, json!({ "op": "cbor_decode", "args": [h] }).to_string());
            }
            let d = answer(b"cbor_decode", json!([h]).to_string().as_bytes());
            if d["error"] == "internal" { s.failures.push(format!("PANIC cbor_decode {h}")); }
            if let Some(block) = d.get("ok") {
                for short in [false, true] {
                    let e = answer(b"cbor_encode", json!([block, short]).to_string().as_bytes());
                    if let Some(eh) = e.get("ok") {
                        let back = answer(b"cbor_decode", json!([eh]).to_string().as_bytes());
                        if back.get("ok") != Some(block) { s.failures.push(format!("CBOR roundtrip differs: {h} short={short}")); }
                    }
                }
            }
        }
        if s.failures.len() > 20 { keep_going = false; }
    }
    let s = stats.lock().unwrap();
    println!("fbfuzz seed={seed} calls={} ok={} refused={} errors={:?} canonical_roundtrips={}", s.calls, s.ok, s.refused, s.errors, s.rt);
    println!("ops hit: {} of {} corpus ops", s.per_op.len(), ops.len());
    println!("distinct refusal codes seen: {} {:?}", s.codes.len(), s.codes.keys().collect::<Vec<_>>());
    for f in s.failures.iter().take(20) { println!("FAILURE {f}"); }
    if !s.failures.is_empty() { std::process::exit(1); }
    let _ = Map::new();
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("serve") => serve(),
        Some("run") => run(args.get(2).and_then(|s| s.parse().ok()).unwrap_or(1), args.get(3).and_then(|s| s.parse().ok()).unwrap_or(10)),
        _ => eprintln!("usage: fbfuzz serve | fbfuzz run <seed> <seconds>"),
    }
}
