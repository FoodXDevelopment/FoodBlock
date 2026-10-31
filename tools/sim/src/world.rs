//! The world: actors, nodes, the network and the episodes. All randomness is `Rng`, seeded.
use crate::Config;
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::sign::Keypair;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub struct Rng(pub u64);
impl Rng {
    pub fn new(seed: u64) -> Self {
        let mut r = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ 0xD1B5_4A32_D192_ED03);
        for _ in 0..4 {
            r.next();
        }
        r
    }
    pub fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    pub fn below(&mut self, n: usize) -> usize {
        if n == 0 { 0 } else { (self.next() % n as u64) as usize }
    }
    /// True `percent` times in a hundred.
    pub fn chance(&mut self, percent: usize) -> bool {
        self.below(100) < percent
    }
    pub fn hex(&mut self, bytes: usize) -> String {
        (0..bytes).map(|_| format!("{:02x}", self.next() as u8)).collect()
    }
}

#[derive(Default, Clone)]
pub struct Stats {
    pub blocks: u64,
    pub delivered: u64,
    pub lost: u64,
    pub duplicated: u64,
    pub offline_spells: u64,
    pub episodes: BTreeMap<&'static str, u64>,
    pub refused: BTreeMap<String, u64>,
    pub pairs: u64,
    pub peers: u64,
    pub store: u64,
    pub owed_past_offer: i64, // what open offerers bound past their offer: their own debt, reported, not a violation
}
impl Stats {
    pub fn add(&mut self, o: &Stats) {
        self.blocks += o.blocks;
        self.delivered += o.delivered;
        self.lost += o.lost;
        self.duplicated += o.duplicated;
        self.offline_spells += o.offline_spells;
        self.pairs += o.pairs;
        self.peers += o.peers;
        self.store += o.store;
        self.owed_past_offer += o.owed_past_offer;
        for (k, v) in &o.episodes {
            *self.episodes.entry(k).or_default() += v;
        }
        for (k, v) in &o.refused {
            *self.refused.entry(k.clone()).or_default() += v;
        }
    }
    pub fn line(&self) -> String {
        format!(
            "peers {} blocks {} delivered {} lost {} dup {} offline {} pairs {} owed-past-offer {} episodes {:?} refused {:?}",
            self.peers, self.blocks, self.delivered, self.lost, self.duplicated, self.offline_spells, self.pairs, self.owed_past_offer, self.episodes, self.refused
        )
    }
}

#[derive(Clone)]
pub struct Key {
    pub suite: String,
    pub public: String,
    pub private: String,
}
impl Key {
    pub fn suite(&self) -> &str {
        if self.suite.is_empty() { "std" } else { &self.suite }
    }
    pub fn from(k: Keypair) -> Key {
        Key { suite: k.suite, public: k.public_key_sign, private: k.private_key }
    }
    pub fn from_seed(suite: &str, seed: &str) -> Key {
        Key::from(foodblock::sign::keypair_from_seed_in(suite, seed).expect("a key"))
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Role {
    Person,
    Custodian,
    Machine,
    Attacker,
}

pub struct Actor {
    pub name: String,
    pub role: Role,
    pub id: String,
    pub key: Key,
    pub head: String,
    pub seq: i64,
    pub recovery: Option<Key>,
    pub home: usize,
    pub skew_ms: i64,
    pub custodian: Option<usize>,
    /// Signed two blocks naming one prev: nothing it signs after counts (until a rotation), so the cast leaves it out.
    pub forked: bool,
}

pub struct Business {
    pub circle: String,
    pub founder: usize,
    pub members: Vec<usize>,
}

#[derive(Default)]
pub struct Node {
    pub name: String,
    pub index: bool,
    /// The node's own choice (nodes.md, Push): it takes the blocks of a forked pair or not. Half the nodes each way.
    pub takes_pairs: bool,
    pub store: Vec<Value>,
    pub have: BTreeSet<String>,
    pub pending: Vec<Value>,
    pub inbox: Vec<(u64, Value)>,
    pub offline_until: u64,
    pub refused: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Expect {
    Binding,
    NotBinding,
    Declined,
}

pub struct Deal {
    pub root: String,
    pub buyer: String,
    pub seller: String,
    pub expect: Expect,
    pub why: &'static str,
    /// The block the buyer answered with, if any.
    pub answer: Option<String>,
}

pub struct OpenDeal {
    pub root: String,
    pub offered: i64,
    pub requests: Vec<(String, String, i64)>, // buyer id, request block, quantity
    pub allocated: Vec<(String, i64)>,        // request block, quantity
}

#[derive(Default)]
pub struct Truth {
    pub deals: Vec<Deal>,
    pub opens: Vec<OpenDeal>,
    /// Blocks no node may ever hold: forged signatures, tampered bodies, and the like (by exact bytes: hash + signature).
    pub never_stored: Vec<(String, String)>,
    /// (author id, hash a, hash b): two blocks of one key naming one prev.
    pub pairs: Vec<(String, String, String)>,
    /// Blocks that must not count in the author's identity fold.
    pub voided: Vec<(String, String)>,
    /// A block that follows an equivocating pair of its key: uncounted in every fold but the identity fold.
    pub after_fork: Vec<String>,
    /// Blocks that must count in the author's identity fold.
    pub counted: Vec<(String, String)>,
    /// (thing, expected owner id or None for "no owner but the maker", expect conflict)
    pub owners: Vec<(String, String, bool)>,
    /// (person, sender, expected live word)
    pub consents: Vec<(String, String, &'static str)>,
    /// (stop block, a block from the stopped sender to the person) that every node holding the stop must refuse
    pub stopped_firsts: Vec<(String, String, Value)>,
    /// Blocks signed under grants: (block, must the grant check pass)
    pub under: Vec<(Value, bool)>,
    /// A grant wider than its parent: must be refused by valid().
    pub wider: Vec<Value>,
    /// (block, circle, may act)
    pub may_act: Vec<(Value, String, bool)>,
    /// Recall: the lot marks, and the owners of every unit made from it.
    pub recall: Option<(String, BTreeSet<String>, Vec<String>)>,
    /// Spam: (receiver, admission rule per_stranger, how many blocks were sent, expected admitted at most)
    pub spam: Vec<(String, u64, Vec<Value>)>,
}

pub struct World {
    pub cfg: Config,
    pub rng: Rng,
    pub clock: Rng,
    pub tick: u64,
    pub nodes: Vec<Node>,
    pub actors: Vec<Actor>,
    pub businesses: Vec<Business>,
    pub created: Vec<Value>,
    pub logical: BTreeMap<String, usize>,
    pub actor_of: BTreeMap<String, usize>,
    pub truth: Truth,
    pub stats: Stats,
    pub log: Vec<String>,
    pub lossy: bool,
    /// (person, sender) pairs a STOP episode has used: one story each, so a later word never overturns an earlier one.
    pub used_pairs: BTreeSet<(usize, usize)>,
    /// Every block that was ever handed to the network (a replay draws from these, never from blocks nobody sent).
    pub sent: Vec<Value>,
}

const BASE_MS: i64 = 1_792_054_800_000; // 2026-10-15T09:00:00Z

pub fn iso(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let rem = ms.rem_euclid(86_400_000);
    // civil from days (Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z", y, m, d, rem / 3_600_000, rem / 60_000 % 60, rem / 1000 % 60, rem % 1000)
}

pub struct Opts {
    pub prev: Option<String>,
    pub seq: Option<i64>,
    pub key: Option<Key>,
    pub advance: bool,
    pub at_shift: i64,
}
impl Default for Opts {
    fn default() -> Self {
        Opts { prev: None, seq: None, key: None, advance: true, at_shift: 0 }
    }
}

impl World {
    pub fn new(seed: u64, cfg: Config) -> World {
        let mut w = World {
            rng: Rng::new(seed),
            clock: Rng::new(seed ^ 0xC10C),
            tick: 0,
            nodes: vec![],
            actors: vec![],
            businesses: vec![],
            created: vec![],
            logical: BTreeMap::new(),
            actor_of: BTreeMap::new(),
            truth: Truth::default(),
            stats: Stats::default(),
            log: vec![],
            lossy: true,
            used_pairs: BTreeSet::new(),
            sent: vec![],
            cfg,
        };
        w.setup();
        w
    }

    pub fn note(&mut self, s: impl Into<String>) {
        if self.cfg.verbose {
            let line = format!("t{:<4} {}", self.tick, s.into());
            self.log.push(line);
        }
    }

    fn setup(&mut self) {
        for i in 0..self.cfg.nodes {
            self.nodes.push(Node { name: format!("node{i}"), index: i < 2, takes_pairs: i % 2 == 1, ..Default::default() });
        }
        let n = self.cfg.peers;
        let custodians = (n / 20).max(1);
        let machines = (n / 12).max(1);
        let attackers = (n / 12).max(2);
        let mut plan: Vec<Role> = vec![];
        plan.extend(std::iter::repeat(Role::Custodian).take(custodians));
        plan.extend(std::iter::repeat(Role::Machine).take(machines));
        plan.extend(std::iter::repeat(Role::Attacker).take(attackers));
        while plan.len() < n {
            plan.push(Role::Person);
        }
        for (i, role) in plan.into_iter().enumerate() {
            self.new_actor(role, i);
        }
        // Everyone's genesis is public: every node starts from the same public record of who exists.
        let genesis: Vec<Value> = self.created.clone();
        for n in 0..self.nodes.len() {
            self.deliver(n, genesis.clone());
        }
        // Businesses: a circle each, a founder and members who accept.
        let persons: Vec<usize> = (0..self.actors.len()).filter(|&i| self.actors[i].role == Role::Person).collect();
        for b in 0..(n / 10).max(1) {
            if persons.len() < 4 {
                break;
            }
            let founder = persons[self.rng.below(persons.len())];
            self.new_business(b, founder, &persons);
        }
        self.stats.peers = self.actors.len() as u64;
    }

    /// A new identity, its genesis sent into the network: a throwaway for something that must not sit in anyone's chain.
    pub fn fresh_actor(&mut self, role: Role) -> usize {
        let i = self.actors.len();
        let a = self.new_actor(role, i);
        let g = self.created.last().cloned().unwrap();
        self.send(a, &g);
        self.stats.peers += 1;
        a
    }

    fn new_actor(&mut self, role: Role, i: usize) -> usize {
        let suites = ["std", "std", "std", "std", "std", "std", "std", "p256", "sm", "std"];
        let suite = if role == Role::Person { suites[self.rng.below(suites.len())] } else { "std" };
        let seed = self.rng.hex(32);
        let keys = Key::from(foodblock::sign::keypair_from_seed_in(suite, &seed).expect("a key"));
        let recovery = if role == Role::Person && self.rng.chance(60) {
            // the recovery key is in the identity's suite unless the genesis names another (identity.md)
            let s = self.rng.hex(32);
            Some(Key::from(foodblock::sign::keypair_from_seed_in(suite, &s).expect("a recovery key")))
        } else {
            None
        };
        let custodian = if role == Role::Person && i % 7 == 3 { Some(0) } else { None };
        let at = iso(BASE_MS - 3_600_000 + i as i64);
        let kind = match role {
            Role::Machine => "machine",
            _ => "person",
        };
        let kp = Keypair { suite: keys.suite.clone(), public_key_sign: keys.public.clone(), private_key: keys.private.clone() };
        let rpub = recovery.as_ref().map(|r| r.public.clone()).unwrap_or_default();
        let cust_id = custodian.map(|c: usize| self.actors.get(c).map(|a| a.id.clone()).unwrap_or_default()).unwrap_or_default();
        let g = genesis(
            &kp,
            &GenesisOptions { kind, at, audience: Some(foodblock::write::Readers::Public), recovery_key: &rpub, reach: if rpub.is_empty() { "" } else { "P30D" }, custodian: &cust_id, ..Default::default() },
        )
        .expect("a genesis");
        let id = g["hash"].as_str().unwrap().to_string();
        let home = self.rng.below(self.nodes.len());
        let skew_ms = match self.clock.below(6) {
            0 => 0,
            1 => 3_600_000 * (1 + self.clock.below(20) as i64),
            2 => -3_600_000 * (1 + self.clock.below(20) as i64),
            3 => 86_400_000 * (1 + self.clock.below(400) as i64),
            4 => -86_400_000 * (1 + self.clock.below(400) as i64),
            _ => 0,
        };
        let idx = self.actors.len();
        self.actor_of.insert(id.clone(), idx);
        self.actors.push(Actor { name: format!("{:?}{i}", role), role, id: id.clone(), key: keys, head: id, seq: 0, recovery, home, skew_ms, custodian, forked: false });
        self.register(g);
        idx
    }

    pub fn register(&mut self, b: Value) {
        let h = b["hash"].as_str().unwrap().to_string();
        self.logical.insert(h, self.created.len());
        self.created.push(b);
        self.stats.blocks += 1;
    }

    pub fn id(&self, a: usize) -> String {
        self.actors[a].id.clone()
    }
    pub fn now_ms(&self, a: usize) -> i64 {
        BASE_MS + self.tick as i64 * 1000 + if self.cfg.skew { self.actors[a].skew_ms } else { 0 }
    }

    /// A signed block by actor `a` at the next place in its chain.
    pub fn make(&mut self, a: usize, typ: &str, state: Value, refs: Value) -> Value {
        self.make_with(a, typ, state, refs, Opts::default())
    }
    pub fn make_with(&mut self, a: usize, typ: &str, state: Value, refs: Value, o: Opts) -> Value {
        let (id, head, seq0, key0) = {
            let x = &self.actors[a];
            (x.id.clone(), x.head.clone(), x.seq, x.key.clone())
        };
        let key = o.key.unwrap_or(key0);
        let seq = o.seq.unwrap_or(seq0 + 1);
        let prev = o.prev.unwrap_or(head);
        let mut st = json!({ "at": iso(self.now_ms(a) + o.at_shift), "audience": "public", "seq": seq });
        for (k, v) in state.as_object().cloned().unwrap_or_default() {
            st[k] = v;
        }
        let mut rf = json!({ "author": id, "prev": prev });
        for (k, v) in refs.as_object().cloned().unwrap_or_default() {
            rf[k] = v;
        }
        // A thing is owned only once its own record shows it is an instance (things.md): the sim's things name their kind.
        if typ == "thing" && ["of", "derives_from", "subject", "place"].iter().all(|k| rf.get(*k).is_none()) {
            if let Some(kind) = st.get("kind").and_then(|k| k.as_str()) {
                rf["of"] = json!(foodblock::block::hash_hex(&format!("kind: {kind}")));
            }
        }
        let suite = key.suite().to_string();
        let mut block = foodblock::create_in(&suite, typ, &st, &rf).unwrap_or_else(|e| panic!("sim built a bad {typ}: {e:?} {st} {rf}"));
        let sig = foodblock::sign_in(&suite, &block, &key.private).expect("sign");
        block["signature"] = json!(sig);
        if o.advance {
            let x = &mut self.actors[a];
            x.head = block["hash"].as_str().unwrap().to_string();
            x.seq = seq;
        }
        self.register(block.clone());
        block
    }

    pub fn hash(b: &Value) -> String {
        b["hash"].as_str().unwrap_or("").to_string()
    }

    // ------------------------------------------------------------ the network

    /// Hand a block to the network from `origin`'s device: its home node first, then others, with loss, delay and copies.
    pub fn send(&mut self, origin: usize, b: &Value) {
        let home = self.actors[origin].home;
        self.send_from(home, b);
    }
    pub fn send_from(&mut self, home: usize, b: &Value) {
        self.sent.push(b.clone());
        let d = self.rng.below(3) as u64;
        self.nodes[home].inbox.push((self.tick + d, b.clone()));
        for n in 0..self.nodes.len() {
            if n == home || !self.rng.chance(55) {
                continue;
            }
            if self.lossy && self.rng.chance(12) {
                self.stats.lost += 1;
                continue;
            }
            let d = 1 + self.rng.below(25) as u64;
            self.nodes[n].inbox.push((self.tick + d, b.clone()));
            if self.lossy && self.rng.chance(10) {
                self.stats.duplicated += 1;
                let d2 = 1 + self.rng.below(40) as u64;
                self.nodes[n].inbox.push((self.tick + d2, b.clone()));
            }
        }
    }
    /// Send a block to one specific node only (an attacker's message).
    pub fn send_to(&mut self, n: usize, b: &Value, delay: u64) {
        self.nodes[n].inbox.push((self.tick + delay, b.clone()));
    }

    pub fn deliver(&mut self, n: usize, blocks: Vec<Value>) {
        let node = &mut self.nodes[n];
        let mut incoming: Vec<Value> = std::mem::take(&mut node.pending);
        let mut seen: BTreeSet<String> = incoming.iter().map(Self::hash).collect();
        for b in blocks {
            let h = Self::hash(&b);
            if !node.have.contains(&h) && seen.insert(h) {
                incoming.push(b);
            }
        }
        if incoming.is_empty() {
            return;
        }
        self.stats.delivered += incoming.len() as u64;
        let t0 = std::time::Instant::now();
        let acc = foodblock::sync::accept(&incoming, &node.store, node.takes_pairs, None);
        if std::env::var("FBSIM_TRACE").is_ok() {
            eprintln!("accept node{n} incoming {} held {} -> {:?}", incoming.len(), node.store.len(), t0.elapsed());
        }
        for b in &acc.taken {
            node.have.insert(Self::hash(b));
            node.store.push(b.clone());
        }
        for pair in &acc.equivocations {
            for h in pair {
                if !node.have.contains(h) {
                    if let Some(b) = incoming.iter().find(|b| &Self::hash(b) == h) {
                        node.have.insert(h.clone());
                        node.store.push(b.clone());
                    }
                }
            }
        }
        let waiting: BTreeSet<&String> = acc.waiting.iter().map(|(h, _)| h).collect();
        node.pending = incoming.iter().filter(|b| waiting.contains(&Self::hash(b))).cloned().collect();
        for r in &acc.refused {
            node.refused.insert(r.hash.clone(), r.code.clone());
            *self.stats.refused.entry(r.code.clone()).or_default() += 1;
        }
    }

    pub fn step(&mut self) {
        self.tick += 1;
        let t = self.tick;
        for n in 0..self.nodes.len() {
            if self.nodes[n].offline_until > t {
                continue;
            }
            let odds = if self.nodes[n].index { 1 } else { 3 };
            if self.rng.chance(odds) && t > 5 {
                self.nodes[n].offline_until = t + 4 + self.rng.below(40) as u64;
                self.stats.offline_spells += 1;
                continue;
            }
            let (due, rest): (Vec<_>, Vec<_>) = std::mem::take(&mut self.nodes[n].inbox).into_iter().partition(|(d, _)| *d <= t);
            self.nodes[n].inbox = rest;
            if !due.is_empty() {
                let blocks: Vec<Value> = due.into_iter().map(|(_, b)| b).collect();
                self.deliver(n, blocks);
            }
            // anti-entropy: now and then, pull what an index holds and this node lacks
            if t % 9 == (n as u64 % 9) {
                self.pull(n);
            }
        }
    }

    pub fn pull(&mut self, n: usize) {
        let idx: Vec<usize> = (0..self.nodes.len()).filter(|&j| j != n && self.nodes[j].index && self.nodes[j].offline_until <= self.tick).collect();
        if idx.is_empty() {
            return;
        }
        let j = idx[self.rng.below(idx.len())];
        let missing: Vec<Value> = self.nodes[j].store.iter().filter(|b| !self.nodes[n].have.contains(&Self::hash(b))).take(60).cloned().collect();
        self.deliver(n, missing);
    }

    /// Everything arrives, no loss: every node pulls from every other until nothing moves.
    pub fn quiesce(&mut self) {
        self.lossy = false;
        for n in &mut self.nodes {
            n.offline_until = 0;
        }
        for _ in 0..80 {
            let before: usize = self.nodes.iter().map(|n| n.have.len()).sum();
            for n in 0..self.nodes.len() {
                let inbox = std::mem::take(&mut self.nodes[n].inbox);
                let mut blocks: Vec<Value> = inbox.into_iter().map(|(_, b)| b).collect();
                let mut seen: BTreeSet<String> = blocks.iter().map(Self::hash).collect();
                for m in 0..self.nodes.len() {
                    if m == n {
                        continue;
                    }
                    for b in &self.nodes[m].store {
                        let h = Self::hash(b);
                        if !self.nodes[n].have.contains(&h) && seen.insert(h) {
                            blocks.push(b.clone());
                        }
                    }
                }
                if !blocks.is_empty() || !self.nodes[n].pending.is_empty() {
                    self.deliver(n, blocks);
                }
            }
            let after: usize = self.nodes.iter().map(|n| n.have.len()).sum();
            if after == before {
                break;
            }
        }
        self.stats.store = self.nodes.iter().map(|n| n.store.len() as u64).max().unwrap_or(0);
    }

    pub fn run(&mut self) {
        for _ in 0..self.cfg.steps {
            let k = 1 + self.rng.below(3);
            for _ in 0..k {
                self.episode();
            }
            self.step();
        }
        self.finish_episodes();
        // let the network settle for a while under loss, then without it
        for _ in 0..60 {
            self.step();
        }
        self.quiesce();
    }

    // ------------------------------------------------------------ cast

    pub fn pick(&mut self, role: Role) -> usize {
        let mut v: Vec<usize> = (0..self.actors.len()).filter(|&i| self.actors[i].role == role && !self.actors[i].forked).collect();
        if v.is_empty() {
            // every one of the role has forked: a fresh one joins (a world of attackers that all equivocated still has attackers)
            let n = self.fresh_actor(role);
            v.push(n);
        }
        v[self.rng.below(v.len())]
    }
    pub fn two_persons(&mut self) -> (usize, usize) {
        let a = self.pick(Role::Person);
        let mut b = self.pick(Role::Person);
        let mut guard = 0;
        while b == a && guard < 50 {
            b = self.pick(Role::Person);
            guard += 1;
        }
        if b == a {
            // too few people left who have not forked: a new person joins (a deal with oneself is accepted when made, which is another story)
            b = self.fresh_actor(Role::Person);
        }
        (a, b)
    }

    fn new_business(&mut self, b: usize, founder: usize, persons: &[usize]) {
        let roles = json!([{ "name": "admin", "powers": ["sign", "admit", "remove"] }, { "name": "orders", "powers": ["sign"] }, { "name": "speak", "powers": [] }]);
        let c = self.make(founder, "actor", json!({ "kind": "circle", "name": format!("Bakery {b}"), "roles": roles, "removal": { "needed": 1 } }), json!({}));
        self.send(founder, &c);
        let circle = Self::hash(&c);
        let mut members = vec![founder];
        for _ in 0..2 {
            let m = persons[self.rng.below(persons.len())];
            if members.contains(&m) {
                continue;
            }
            let inv = self.make(founder, "grant", json!({ "kind": "member", "roles": ["orders"] }), json!({ "subject": circle, "as": circle, "to": self.id(m) }));
            let ans = self.make(m, "grant", json!({ "kind": "member", "status": "accepted" }), json!({ "answers": Self::hash(&inv), "subject": circle, "after": [Self::hash(&inv)] }));
            self.send(founder, &inv);
            self.send(m, &ans);
            members.push(m);
        }
        self.businesses.push(Business { circle, founder, members });
    }
}
