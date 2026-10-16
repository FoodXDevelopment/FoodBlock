//! fbsim: a deterministic world simulator for the FoodBlock core.
//!
//!   fbsim run   --seeds 1-100 [--peers 60] [--nodes 6] [--steps 250]   many small worlds; prints a failing seed
//!   fbsim one   --seed 42 [--peers N ...] [-v]                         replay one seed, with a log
//!
//! Everything random comes from the seed (one xorshift stream for the world, one for clocks), so a failing seed replays
//! exactly. The world: people, businesses (circles), custodians, machines and attackers; nodes that go offline and
//! come back; a lossy, reordering, duplicating network; clock skew; episodes (a market day, a recall, key theft and
//! recovery, a SIM swap, double selling, equivocation, forged and replayed blocks, spam, STOPs). After a run, the
//! invariants of the spec are asserted from facts the simulator knows independently of the core (its own record of who
//! meant what), never from the core's own output alone.
mod episodes;
mod invariants;
mod world;

use std::time::Instant;

pub fn arg(args: &[String], key: &str) -> Option<String> {
    args.iter().position(|a| a == key).and_then(|i| args.get(i + 1)).cloned()
}

#[derive(Clone, Debug)]
pub struct Config {
    pub peers: usize,
    pub nodes: usize,
    pub steps: usize,
    pub skew: bool,
    pub verbose: bool,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let cfg = |skew: bool| Config {
        peers: arg(&args, "--peers").and_then(|s| s.parse().ok()).unwrap_or(48),
        nodes: arg(&args, "--nodes").and_then(|s| s.parse().ok()).unwrap_or(6),
        steps: arg(&args, "--steps").and_then(|s| s.parse().ok()).unwrap_or(220),
        skew,
        verbose: args.iter().any(|a| a == "-v"),
    };
    match args.get(1).map(String::as_str) {
        Some("one") => {
            let seed: u64 = arg(&args, "--seed").and_then(|s| s.parse().ok()).unwrap_or(1);
            let report = run_seed(seed, &cfg);
            print_report(seed, &report);
            if !report.violations.is_empty() {
                std::process::exit(1);
            }
        }
        Some("debug") => {
            let seed: u64 = arg(&args, "--seed").and_then(|s| s.parse().ok()).unwrap_or(1);
            let mut w = world::World::new(seed, cfg(false));
            w.run();
            invariants::debug(&mut w);
            invariants::debug_missing(&mut w);
            invariants::debug_refused(&mut w);
        }
        Some("dump") => {
            // fbsim dump --seed N --out file.json: the union of every node's blocks, for the oracle cross-check (oracle-check.cjs)
            let seed: u64 = arg(&args, "--seed").and_then(|s| s.parse().ok()).unwrap_or(1);
            let mut w = world::World::new(seed, cfg(args.iter().any(|a| a == "--skew")));
            w.run();
            let blocks = if args.iter().any(|a| a == "--all") { w.created.clone() } else { invariants::union_of(&w) };
            let out = arg(&args, "--out").unwrap_or_else(|| "world.json".into());
            std::fs::write(&out, serde_json::to_string(&blocks).unwrap()).expect("write");
            println!("{} blocks to {out}", blocks.len());
        }
        Some("run") => {
            let range = arg(&args, "--seeds").unwrap_or_else(|| "1-20".into());
            let (a, b) = match range.split_once('-') {
                Some((a, b)) => (a.parse().unwrap_or(1), b.parse().unwrap_or(1)),
                None => (range.parse().unwrap_or(1), range.parse().unwrap_or(1)),
            };
            let started = Instant::now();
            let jobs: usize = arg(&args, "--jobs").and_then(|s| s.parse().ok()).unwrap_or(1).max(1);
            let (peers, nodes, steps) = (cfg(false).peers, cfg(false).nodes, cfg(false).steps);
            let verbose = args.iter().any(|a| a == "-v");
            let seeds: Vec<u64> = (a..=b).collect();
            let mut reports: Vec<(u64, Report)> = vec![];
            std::thread::scope(|s| {
                let handles: Vec<_> = (0..jobs)
                    .map(|j| {
                        let mine: Vec<u64> = seeds.iter().copied().skip(j).step_by(jobs).collect();
                        s.spawn(move || {
                            let c = move |skew: bool| Config { peers, nodes, steps, skew, verbose };
                            mine.into_iter().map(|seed| (seed, run_seed(seed, &c))).collect::<Vec<_>>()
                        })
                    })
                    .collect();
                for h in handles {
                    reports.extend(h.join().expect("a worker"));
                }
            });
            reports.sort_by_key(|(s, _)| *s);
            let mut failed = vec![];
            let mut totals = world::Stats::default();
            for (seed, report) in &reports {
                totals.add(&report.stats);
                if !report.violations.is_empty() {
                    print_report(*seed, report);
                    failed.push(*seed);
                }
            }
            println!(
                "{} seeds ({}..{}) in {:.1}s: {} failed {:?}\n{}",
                b - a + 1,
                a,
                b,
                started.elapsed().as_secs_f64(),
                failed.len(),
                failed,
                totals.line()
            );
            if !failed.is_empty() {
                println!("replay one: fbsim one --seed {} (same --peers/--nodes/--steps)", failed[0]);
                std::process::exit(1);
            }
        }
        _ => eprintln!("usage: fbsim run --seeds A-B | fbsim one --seed N  [--peers N] [--nodes N] [--steps N] [-v]"),
    }
}

pub struct Report {
    pub violations: Vec<String>,
    pub stats: world::Stats,
    pub log: Vec<String>,
}

/// One seed: the world is run twice, once with every author's clock right and once with clocks skewed by days and
/// years. No fold may read another author's clock, so the two runs must give the same answers.
fn run_seed(seed: u64, cfg: &dyn Fn(bool) -> Config) -> Report {
    let run = |skew: bool| {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let t0 = Instant::now();
            let mut w = world::World::new(seed, cfg(skew));
            w.run();
            let t1 = t0.elapsed();
            let violations = invariants::check(&mut w);
            let t2 = t0.elapsed();
            let digest = invariants::logical_digest(&mut w);
            if std::env::var("FBSIM_TRACE").is_ok() {
                eprintln!("world {:?}, check +{:?}, digest +{:?}", t1, t2 - t1, t0.elapsed() - t2);
            }
            (violations, digest, w.stats.clone(), w.log.clone())
        }))
    };
    let (a, b) = (run(false), run(true));
    match (a, b) {
        (Ok((mut v, d1, stats, log)), Ok((v2, d2, _, _))) => {
            for x in v2 {
                v.push(format!("[skewed clocks] {x}"));
            }
            if d1 != d2 {
                let first = d1.iter().zip(d2.iter()).find(|(x, y)| x != y).map(|(x, y)| format!("{x}  <>  {y}")).unwrap_or_else(|| format!("{} lines against {}", d1.len(), d2.len()));
                v.push(format!("a fold read another author's clock: the same world with skewed clocks folds differently: {first}"));
            }
            Report { violations: v, stats, log }
        }
        (Err(e), _) | (_, Err(e)) => {
            let msg = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
            Report { violations: vec![format!("PANIC in the core or the simulator: {msg}")], stats: Default::default(), log: vec![] }
        }
    }
}

fn print_report(seed: u64, r: &Report) {
    if r.violations.is_empty() {
        println!("seed {seed}: ok  {}", r.stats.line());
    } else {
        println!("seed {seed}: FAILED");
        for v in r.violations.iter().take(10) {
            println!("  - {}", v.chars().take(260).collect::<String>());
        }
        if r.violations.len() > 10 {
            println!("  ... {} more", r.violations.len() - 10);
        }
    }
    for l in r.log.iter().take(400) {
        println!("    {l}");
    }
}
