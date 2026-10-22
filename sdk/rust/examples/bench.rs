use std::time::Instant;
fn main() {
    let path = std::env::args().nth(1).unwrap();
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let a = v.as_array().unwrap();
    let op = a[0].as_str().unwrap().to_string();
    let args = serde_json::to_vec(&a[1..]).unwrap();
    for _ in 0..(std::env::var("REP").ok().and_then(|x| x.parse().ok()).unwrap_or(1)) { let t = Instant::now();
    let r = foodblock::door::answer(op.as_bytes(), &args);
    println!("{op}: {:?} -> {}", t.elapsed(), r.to_string().chars().take(60).collect::<String>()); }
}
