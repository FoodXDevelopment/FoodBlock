//! The stories the world tells: each is a few blocks by a few actors, sent into the network, with the simulator's own note
//! of what they mean (the truth the invariants check against).
use crate::world::*;
use foodblock::chain::Link;
use serde_json::{json, Value};

fn money(minor: i64) -> Value {
    json!({ "minor": minor, "currency": "GBP" })
}
fn eggs(n: i64) -> Value {
    json!({ "value": n.to_string(), "unit": "{egg}" })
}

impl World {
    fn count(&mut self, name: &'static str) {
        *self.stats.episodes.entry(name).or_default() += 1;
    }

    pub fn episode(&mut self) {
        match self.rng.below(100) {
            0..=27 => self.sale(),
            28..=37 => self.open_offer(),
            38..=43 => self.crossing_sale(),
            44..=49 => self.equivocation(),
            50..=60 => self.attack(),
            61..=66 => self.theft_and_recovery(),
            67..=70 => self.sim_swap(),
            71..=77 => self.stop_and_spam(),
            78..=84 => self.machine(),
            85..=90 => self.recall_batch(),
            91..=95 => self.membership(),
            _ => self.second_device(),
        }
    }

    /// The seller side of a sale: a person, or a business whose member signs `as` the circle.
    fn seller_side(&mut self, s: usize) -> (String, Value) {
        if self.rng.chance(35) {
            if let Some(b) = self.businesses.iter().find(|b| b.members.contains(&s)) {
                return (b.circle.clone(), json!({ "as": b.circle }));
            }
        }
        (self.id(s), json!({}))
    }

    /// A one-to-one sale: a thing, an offer, the buyer's answer, money, goods, the receiver's accept.
    pub fn sale(&mut self) {
        self.count("sale");
        let (s, b) = self.two_persons();
        let (side, extra) = self.seller_side(s);
        let thing = self.make(s, "thing", json!({ "kind": "eggs", "name": "A tray of eggs" }), json!({}));
        let mut refs = json!({ "from": side, "to": self.id(b), "what": Self::hash(&thing) });
        for (k, v) in extra.as_object().cloned().unwrap_or_default() {
            refs[k] = v;
        }
        let expires = iso(BASE_MS_PUB + 3 * 86_400_000);
        let price = 450 + self.rng.below(500) as i64;
        let offer = self.make(s, "promise", json!({ "terms": { "price": money(price), "quantity": eggs(12), "expires": expires } }), refs);
        let oh = Self::hash(&offer);
        self.send(s, &thing);
        self.send(s, &offer);
        let fate = self.rng.below(10);
        if fate == 0 {
            self.truth.deals.push(Deal { root: oh, buyer: self.id(b), seller: side, expect: Expect::NotBinding, why: "never answered", answer: None });
            return;
        }
        if fate == 1 {
            let d = self.make(b, "promise", json!({ "status": "declined" }), json!({ "answers": oh, "for": oh, "after": [oh] }));
            self.send(b, &d);
            self.truth.deals.push(Deal { root: oh, buyer: self.id(b), seller: side, expect: Expect::Declined, why: "declined by the buyer", answer: Some(Self::hash(&d)) });
            return;
        }
        let acc = self.make(b, "promise", json!({ "status": "accepted" }), json!({ "answers": oh, "for": oh, "after": [oh] }));
        self.send(b, &acc);
        self.truth.deals.push(Deal { root: oh.clone(), buyer: self.id(b), seller: side.clone(), expect: Expect::Binding, why: "accepted by the buyer", answer: Some(Self::hash(&acc)) });
        // pay, deliver, receive
        let pay = self.make(b, "transfer", json!({ "money": money(500) }), json!({ "to_owner": side, "for": oh, "after": [Self::hash(&acc)] }));
        self.send(b, &pay);
        let give = self.make(s, "transfer", json!({}), json!({ "to_owner": self.id(b), "what": Self::hash(&thing), "for": oh, "after": [Self::hash(&acc)] }));
        self.send(s, &give);
        if self.rng.chance(85) {
            let got = self.make(b, "transfer", json!({ "status": "accepted" }), json!({ "answers": Self::hash(&give), "after": [Self::hash(&give)], "for": oh }));
            self.send(b, &got);
            self.truth.owners.push((Self::hash(&thing), self.id(b), false));
        } else {
            self.truth.owners.push((Self::hash(&thing), self.id(s), false));
        }
    }

    /// An offer open to anyone with a quantity limit; buyers ask, the offerer allocates, sometimes beyond what it has.
    pub fn open_offer(&mut self) {
        self.count("open_offer");
        let s = self.pick(Role::Person);
        let thing = self.make(s, "thing", json!({ "kind": "eggs", "name": "Eggs in bulk" }), json!({}));
        let limit = 120;
        let expires = iso(BASE_MS_PUB + 3 * 86_400_000);
        let offer = self.make(
            s,
            "promise",
            json!({ "terms": { "price": { "money": money(300), "per": eggs(12) }, "quantity": { "min": eggs(12), "max": eggs(limit) }, "expires": expires } }),
            json!({ "from": self.id(s), "what": Self::hash(&thing) }),
        );
        let oh = Self::hash(&offer);
        self.send(s, &thing);
        self.send(s, &offer);
        let mut open = OpenDeal { root: oh.clone(), offered: limit, requests: vec![], allocated: vec![] };
        let buyers = 3 + self.rng.below(3);
        let mut last_alloc: Option<String> = None;
        for _ in 0..buyers {
            let b = self.pick(Role::Person);
            if b == s {
                continue;
            }
            let q = 12 * (1 + self.rng.below(4)) as i64;
            let req = self.make(b, "promise", json!({ "status": "accepted", "terms": { "quantity": eggs(q) } }), json!({ "answers": oh, "for": oh, "after": [oh] }));
            self.send(b, &req);
            open.requests.push((self.id(b), Self::hash(&req), q));
            // the offerer allocates: its own accepted answer to the request, each seeing the last (one chain of allocations)
            if self.rng.chance(85) {
                let mut after = vec![Self::hash(&req)];
                if let Some(l) = &last_alloc {
                    after.push(l.clone());
                }
                after.sort();
                let alloc = self.make(s, "promise", json!({ "status": "accepted", "terms": { "quantity": eggs(q) } }), json!({ "answers": Self::hash(&req), "for": oh, "after": after }));
                self.send(s, &alloc);
                last_alloc = Some(Self::hash(&alloc));
                open.allocated.push((Self::hash(&req), q));
            }
        }
        self.truth.opens.push(open);
    }

    /// Two moves of one thing that do not see each other, from two devices of its owner. Both are the owner's, so it is a
    /// lie the fold must name (a conflict), not a choice it may make.
    pub fn crossing_sale(&mut self) {
        self.count("crossing_sale");
        let s = self.pick(Role::Person);
        let (b, c) = self.two_persons();
        if b == s || c == s {
            return;
        }
        let thing = self.make(s, "thing", json!({ "kind": "truck", "name": "A van" }), json!({}));
        self.send(s, &thing);
        // a second device: a key grant, then the second key signs one of the transfers
        let seed = self.rng.hex(32);
        let k2 = Key::from_seed("std", &seed);
        let grant = self.make(s, "grant", json!({ "kind": "key", "public_key_sign": k2.public }), json!({ "subject": self.id(s) }));
        self.send(s, &grant);
        let t1 = self.make(s, "transfer", json!({}), json!({ "to_owner": self.id(b), "what": Self::hash(&thing), "after": [Self::hash(&thing)] }));
        // the second device's first block names the grant as prev, seq 1, and does not see t1
        let t2 = self.make_with(
            s,
            "transfer",
            json!({}),
            json!({ "to_owner": self.id(c), "what": Self::hash(&thing), "after": [Self::hash(&thing)] }),
            Opts { prev: Some(Self::hash(&grant)), seq: Some(1), key: Some(k2), advance: false, at_shift: 0 },
        );
        self.send(s, &t1);
        self.send(s, &t2);
        let a1 = self.make(b, "transfer", json!({ "status": "accepted" }), json!({ "answers": Self::hash(&t1), "after": [Self::hash(&t1)] }));
        let a2 = self.make(c, "transfer", json!({ "status": "accepted" }), json!({ "answers": Self::hash(&t2), "after": [Self::hash(&t2)] }));
        self.send(b, &a1);
        self.send(c, &a2);
        self.truth.owners.push((Self::hash(&thing), self.id(s), true));
    }

    /// An equivocation: two blocks of one key naming one prev. The accept that is one of them binds nobody.
    pub fn equivocation(&mut self) {
        self.count("equivocation");
        let (s, b) = self.two_persons();
        let thing = self.make(s, "thing", json!({ "kind": "milk", "name": "Milk" }), json!({}));
        let offer = self.make(
            s,
            "promise",
            json!({ "terms": { "price": money(200), "quantity": eggs(6), "expires": iso(BASE_MS_PUB + 2 * 86_400_000) } }),
            json!({ "from": self.id(s), "to": self.id(b), "what": Self::hash(&thing) }),
        );
        let oh = Self::hash(&offer);
        self.send(s, &thing);
        self.send(s, &offer);
        let (prev, seq) = (self.actors[b].head.clone(), self.actors[b].seq + 1);
        let acc = self.make_with(b, "promise", json!({ "status": "accepted" }), json!({ "answers": oh, "for": oh, "after": [oh] }), Opts { prev: Some(prev.clone()), seq: Some(seq), ..Default::default() });
        let twin = self.make_with(b, "observe", json!({ "kind": "note", "text": "the other branch" }), json!({}), Opts { prev: Some(prev), seq: Some(seq), advance: false, ..Default::default() });
        self.send(b, &acc);
        self.send(b, &twin);
        let (ha, ht) = (Self::hash(&acc), Self::hash(&twin));
        self.truth.pairs.push((self.id(b), ha.clone(), ht));
        self.stats.pairs += 1;
        self.actors[b].forked = true;
        // a later block of the same key follows the pair; it counts for nothing too (folds.md, Equivocations)
        let later = self.make(b, "observe", json!({ "kind": "note", "text": "after the fork" }), json!({}));
        self.send(b, &later);
        self.truth.after_fork.push(Self::hash(&later));
        self.truth.deals.push(Deal { root: oh, buyer: self.id(b), seller: self.id(s), expect: Expect::NotBinding, why: "the accept is one of an equivocating pair", answer: None });
    }

    /// Blocks an attacker sends that no node may take or that bind nobody.
    pub fn attack(&mut self) {
        self.count("attack");
        let x = self.pick(Role::Attacker);
        let (s, v) = self.two_persons();
        let thing = self.make(s, "thing", json!({ "kind": "eggs", "name": "Target" }), json!({}));
        let offer = self.make(
            s,
            "promise",
            json!({ "terms": { "price": money(100), "quantity": eggs(6), "expires": iso(BASE_MS_PUB + 2 * 86_400_000) } }),
            json!({ "from": self.id(s), "to": self.id(v), "what": Self::hash(&thing) }),
        );
        let oh = Self::hash(&offer);
        self.send(s, &thing);
        self.send(s, &offer);
        let mode = self.rng.below(6);
        match mode {
            0 => {
                // an accept by someone who is not a side
                let acc = self.make(x, "promise", json!({ "status": "accepted" }), json!({ "answers": oh, "for": oh, "after": [oh] }));
                self.send(x, &acc);
                // not "never stored": a node that has not yet received the offer cannot tell whose side the accept is on, so it
                // keeps it; every fold ignores it (the stranger is no side of the deal)
                self.truth.deals.push(Deal { root: oh, buyer: self.id(v), seller: self.id(s), expect: Expect::NotBinding, why: "accepted only by a stranger", answer: None });
            }
            1 => {
                // the victim's accept with a forged signature
                let mut acc = self.make_with(v, "promise", json!({ "status": "accepted" }), json!({ "answers": oh, "for": oh, "after": [oh] }), Opts { advance: false, ..Default::default() });
                acc["signature"] = json!(self.rng.hex(64));
                self.send(x, &acc);
                self.truth.never_stored.push((Self::hash(&acc), acc["signature"].as_str().unwrap().to_string()));
                self.truth.deals.push(Deal { root: oh, buyer: self.id(v), seller: self.id(s), expect: Expect::NotBinding, why: "the accept's signature is forged", answer: None });
            }
            2 => {
                // the victim's accept signed by the attacker's key, claiming the victim's name
                let ak = self.actors[x].key.clone();
                let acc = self.make_with(v, "promise", json!({ "status": "accepted" }), json!({ "answers": oh, "for": oh, "after": [oh] }), Opts { key: Some(ak), advance: false, ..Default::default() });
                self.send(x, &acc);
                self.truth.never_stored.push((Self::hash(&acc), acc["signature"].as_str().unwrap().to_string()));
                self.truth.deals.push(Deal { root: oh, buyer: self.id(v), seller: self.id(s), expect: Expect::NotBinding, why: "the accept is signed with another key", answer: None });
            }
            3 => {
                // a real accept, tampered after signing (its terms changed, the signature and hash kept)
                let acc = self.make_with(v, "promise", json!({ "status": "accepted" }), json!({ "answers": oh, "for": oh, "after": [oh] }), Opts { advance: false, ..Default::default() });
                let mut t = acc.clone();
                t["state"]["terms"] = json!({ "quantity": eggs(600) });
                self.send(x, &t);
                self.truth.never_stored.push((Self::hash(&t), t["signature"].as_str().unwrap().to_string()));
                self.truth.deals.push(Deal { root: oh, buyer: self.id(v), seller: self.id(s), expect: Expect::NotBinding, why: "a tampered accept", answer: None });
            }
            4 => {
                // a stolen-looking transfer of someone else's thing to the attacker
                let t = self.make(x, "transfer", json!({}), json!({ "to_owner": self.id(x), "what": Self::hash(&thing) }));
                self.send(x, &t);
                self.truth.owners.push((Self::hash(&thing), self.id(s), false));
                self.truth.deals.push(Deal { root: oh, buyer: self.id(v), seller: self.id(s), expect: Expect::NotBinding, why: "never answered", answer: None });
            }
            _ => {
                // a replay of old blocks: every created block sent again to a random node, later
                let n = self.sent.len();
                for _ in 0..6 {
                    let b = self.sent[self.rng.below(n)].clone();
                    let node = self.rng.below(self.nodes.len());
                    let delay = 5 + self.rng.below(60) as u64;
                    self.send_to(node, &b, delay);
                }
                self.truth.deals.push(Deal { root: oh, buyer: self.id(v), seller: self.id(s), expect: Expect::NotBinding, why: "never answered", answer: None });
            }
        }
    }

    /// A stolen device key signs; the owner rotates with the recovery key and counts only what came before.
    pub fn theft_and_recovery(&mut self) {
        self.count("theft_and_recovery");
        let cands: Vec<usize> = (0..self.actors.len()).filter(|&i| self.actors[i].role == Role::Person && self.actors[i].recovery.is_some() && self.actors[i].custodian.is_none() && self.actors[i].seq < 1000).collect();
        if cands.is_empty() {
            return;
        }
        let v = cands[self.rng.below(cands.len())];
        let x = self.pick(Role::Attacker);
        let good = self.make(v, "observe", json!({ "kind": "note", "text": "last good block" }), json!({}));
        self.send(v, &good);
        let thing = self.make(v, "thing", json!({ "kind": "eggs", "name": "Stock" }), json!({}));
        self.send(v, &thing);
        let counted_to = Self::hash(&thing);
        self.truth.counted.push((self.id(v), Self::hash(&good)));
        self.truth.counted.push((self.id(v), counted_to.clone()));
        // the thief, holding the key, signs a transfer of the stock to himself and a note
        let fraud = self.make(v, "transfer", json!({}), json!({ "to_owner": self.id(x), "what": counted_to }));
        let fraud2 = self.make(v, "observe", json!({ "kind": "note", "text": "sold it all" }), json!({}));
        self.send(x, &fraud);
        self.send(x, &fraud2);
        self.truth.voided.push((self.id(v), Self::hash(&fraud)));
        self.truth.voided.push((self.id(v), Self::hash(&fraud2)));
        // recovery: a new key, brought in by the recovery key, replacing the old one up to counted_to
        let old = self.actors[v].key.clone();
        let seed = self.rng.hex(32);
        let nk = Key::from_seed("std", &seed);
        let rec = self.actors[v].recovery.clone().unwrap();
        let id = self.id(v);
        let at = iso(self.now_ms(v));
        let rot = rotation(&id, &nk, &rec, &Link { seq: 1, prev: id.clone() }, &at, &old.public, &counted_to, Some(&rec.public));
        self.register(rot.clone());
        self.send(v, &rot);
        // the owner goes on with the new key: its first block names the rotation
        self.actors[v].key = nk;
        self.actors[v].head = Self::hash(&rot);
        self.actors[v].seq = 0;
        // a careful client names what it had seen on the old key (`after`), so the old chain stays in the new key's causal past
        let after = self.make(v, "observe", json!({ "kind": "note", "text": "back, with a new key" }), json!({ "after": [counted_to.clone()] }));
        self.send(v, &after);
        self.truth.counted.push((id.clone(), Self::hash(&after)));
        self.truth.owners.push((counted_to_thing(&self.truth, &fraud), id, false));
        self.actors[v].recovery = None;
    }

    /// A SIM swap: the custodian, fooled by a voice that is not hers, signs a rotation to the thief's key. The person
    /// recovers with her recovery key, which does not see the thief's rotation; the thief's key stays frozen.
    pub fn sim_swap(&mut self) {
        self.count("sim_swap");
        let cands: Vec<usize> = (0..self.actors.len()).filter(|&i| self.actors[i].role == Role::Person && self.actors[i].recovery.is_some() && self.actors[i].custodian.is_some() && self.actors[i].seq < 1000).collect();
        if cands.is_empty() {
            return;
        }
        let h = cands[self.rng.below(cands.len())];
        let x = self.pick(Role::Attacker);
        let note = self.make(h, "observe", json!({ "kind": "note", "text": "ordered by SMS", "channel": "sms" }), json!({}));
        self.send(h, &note);
        self.truth.counted.push((self.id(h), Self::hash(&note)));
        let counted_to = Self::hash(&note);
        let old = self.actors[h].key.clone();
        let id = self.id(h);
        // the thief's key, brought in by the custodian's (that is, her own, held) key
        let seed = self.rng.hex(32);
        let tk = Key::from_seed("std", &seed);
        let at = iso(self.now_ms(h));
        let link = Link { seq: self.actors[h].seq + 1, prev: self.actors[h].head.clone() };
        let steal = rotation(&id, &tk, &old, &link, &at, &old.public, &counted_to, None);
        self.register(steal.clone());
        self.actors[h].head = Self::hash(&steal);
        self.actors[h].seq += 1;
        self.send(h, &steal);
        // the thief writes as her
        let fraud = self.make_with(h, "observe", json!({ "kind": "note", "text": "send everything to this number" }), json!({}), Opts { prev: Some(Self::hash(&steal)), seq: Some(1), key: Some(tk), advance: false, at_shift: 0 });
        self.send(x, &fraud);
        self.truth.voided.push((id.clone(), Self::hash(&fraud)));
        // her recovery key rotates the held key out, counting up to the note, and does not see the thief's rotation
        let rec = self.actors[h].recovery.clone().unwrap();
        let seed2 = self.rng.hex(32);
        let nk = Key::from_seed("std", &seed2);
        let at2 = iso(self.now_ms(h) + 1000);
        let rot = rotation(&id, &nk, &rec, &Link { seq: 1, prev: id.clone() }, &at2, &old.public, &counted_to, Some(&rec.public));
        self.register(rot.clone());
        self.send(h, &rot);
        self.actors[h].key = nk;
        self.actors[h].head = Self::hash(&rot);
        self.actors[h].seq = 0;
        let back = self.make(h, "observe", json!({ "kind": "note", "text": "recovered; custody ended" }), json!({ "after": [counted_to.clone()] }));
        self.send(h, &back);
        self.truth.counted.push((id, Self::hash(&back)));
        self.actors[h].recovery = None;
    }

    /// A person's STOP, a sender who tries again, a yes from the asker's own app that must not lift it, and a flood of
    /// first messages against a node's per-stranger rule.
    pub fn stop_and_spam(&mut self) {
        self.count("stop_and_spam");
        let (p, s) = self.two_persons();
        if !self.used_pairs.insert((p, s)) {
            return;
        }
        let stop = self.make(p, "observe", json!({ "kind": "consent", "word": "stop" }), json!({ "subject": self.id(s) }));
        self.send(p, &stop);
        let first = self.make(s, "observe", json!({ "kind": "message", "text": "buy our bread" }), json!({ "to": self.id(p) }));
        self.send(s, &first);
        self.truth.stopped_firsts.push((Self::hash(&stop), self.id(p), first));
        if self.rng.chance(50) {
            // the asker's own app records a "yes" for her: it never lifts a stop
            let yes = self.make(s, "observe", json!({ "kind": "consent", "word": "yes" }), json!({ "subject": self.id(s), "from": self.id(p), "after": [Self::hash(&stop)] }));
            self.send(s, &yes);
            self.truth.consents.push((self.id(p), self.id(s), "stop"));
        } else if self.rng.chance(50) {
            // her own yes, after she knew of the stop, lifts it
            let yes = self.make(p, "observe", json!({ "kind": "consent", "word": "yes" }), json!({ "subject": self.id(s), "after": [Self::hash(&stop)] }));
            self.send(p, &yes);
            self.truth.consents.push((self.id(p), self.id(s), "yes"));
            self.truth.stopped_firsts.pop();
        } else {
            self.truth.consents.push((self.id(p), self.id(s), "stop"));
        }
        // spam within the rule: a stranger sends many first blocks to a receiver whose node admits at most K
        let x = self.pick(Role::Attacker);
        let k = 3 + self.rng.below(4) as u64;
        let mut flood = vec![];
        for i in 0..(k as usize + 6) {
            let b = self.make(x, "observe", json!({ "kind": "message", "text": format!("offer {i}") }), json!({ "to": self.id(p) }));
            self.send(x, &b);
            flood.push(b);
        }
        self.truth.spam.push((self.id(p), k, flood));
    }

    /// An operator, a machine and a grant: in scope, out of scope, and a child grant wider than its parent.
    pub fn machine(&mut self) {
        self.count("machine");
        let m = self.pick(Role::Machine);
        let o = self.pick(Role::Person);
        let mid = self.id(m);
        let op = self.make(o, "grant", json!({ "kind": "operator" }), json!({ "to": mid }));
        let scope = json!({ "acts": ["observe.note", "promise"], "limit": money(5000), "per": "P7D", "until": "2027-06-30T00:00:00.000Z" });
        let g = self.make(o, "grant", json!({ "kind": "shop", "scope": scope.clone() }), json!({ "to": mid }));
        self.send(o, &op);
        self.send(o, &g);
        let gh = Self::hash(&g);
        let inside = self.make(m, "observe", json!({ "kind": "note", "text": "restock flour" }), json!({ "under": gh }));
        let outside = self.make(m, "transfer", json!({}), json!({ "to_owner": mid, "under": gh, "what": gh }));
        self.send(m, &inside);
        self.send(m, &outside);
        self.truth.under.push((inside, true));
        self.truth.under.push((outside, false));
        // passed on wider than received: more acts, a later end. The receiver of a grant is the one who passes it on, so the
        // attacker is given one too and signs the wide child on its own chain (a refused block would stall a chain it sat in).
        let x = self.fresh_actor(Role::Attacker);
        let (p2, _) = self.two_persons();
        let g2 = self.make(o, "grant", json!({ "kind": "shop", "scope": scope.clone() }), json!({ "to": self.id(x) }));
        self.send(o, &g2);
        let wide = json!({ "acts": ["observe.note", "promise", "transfer"], "limit": money(9000), "per": "P7D", "until": "2028-01-01T00:00:00.000Z" });
        let child = self.make(x, "grant", json!({ "kind": "shop", "scope": wide }), json!({ "to": self.id(p2), "parent": Self::hash(&g2) }));
        self.send(x, &child);
        self.truth.wider.push(child);
        // and one inside: a narrower scope passes on fine
        let narrow = json!({ "acts": ["observe.note"], "limit": money(1000), "per": "P7D", "until": "2027-01-01T00:00:00.000Z" });
        let ok_child = self.make(m, "grant", json!({ "kind": "shop", "scope": narrow }), json!({ "to": self.id(p2), "parent": gh }));
        self.send(m, &ok_child);
    }

    /// A lot, units from it sold to buyers who accept, then a recall by the lot's marks. The recall must reach every owner.
    pub fn recall_batch(&mut self) {
        self.count("recall");
        if self.truth.recall.is_some() {
            return;
        }
        let p = self.pick(Role::Person);
        let lot = format!("L{}", self.rng.below(10_000));
        let marks = json!([{ "scheme": "lot", "value": lot }]);
        let mut owners = std::collections::BTreeSet::new();
        let mut units = vec![];
        for _ in 0..(3 + self.rng.below(4)) {
            let u = self.make(p, "thing", json!({ "kind": "jar", "name": "Jam", "marks": marks.clone() }), json!({}));
            self.send(p, &u);
            let b = self.pick(Role::Person);
            if b == p {
                owners.insert(self.id(p));
                units.push(Self::hash(&u));
                continue;
            }
            let t = self.make(p, "transfer", json!({}), json!({ "to_owner": self.id(b), "what": Self::hash(&u) }));
            let a = self.make(b, "transfer", json!({ "status": "accepted" }), json!({ "answers": Self::hash(&t), "after": [Self::hash(&t)] }));
            self.send(p, &t);
            self.send(b, &a);
            owners.insert(self.id(b));
            units.push(Self::hash(&u));
        }
        let recall = self.make(p, "observe", json!({ "kind": "recall", "text": "possible listeria", "marks": marks }), json!({}));
        self.send(p, &recall);
        self.truth.recall = Some((lot, owners, units));
    }

    /// A member signs for the business; later the founder ends the membership counting up to a block; what the member signs
    /// after that does not speak for the business.
    pub fn membership(&mut self) {
        self.count("membership");
        if self.businesses.is_empty() {
            return;
        }
        let bi = self.rng.below(self.businesses.len());
        let (circle, founder, members) = (self.businesses[bi].circle.clone(), self.businesses[bi].founder, self.businesses[bi].members.clone());
        let others: Vec<usize> = members.into_iter().filter(|&m| m != founder).collect();
        if others.is_empty() {
            return;
        }
        let m = others[self.rng.below(others.len())];
        if self.actors[founder].forked || self.actors[m].forked {
            return; // what a forked key signs counts for nothing, so the story would prove nothing
        }
        let before = self.make(m, "observe", json!({ "kind": "note", "text": "flour ordered" }), json!({ "as": circle }));
        self.send(m, &before);
        // the invitation the founder gave this member
        let inv = self.created.iter().find(|b| b["type"] == "grant" && b["state"]["kind"] == "member" && b["refs"]["to"] == json!(self.id(m)) && b["refs"]["subject"] == json!(circle) && b["state"].get("status").is_none()).cloned();
        let Some(inv) = inv else { return };
        let end = self.make(founder, "grant", json!({ "kind": "member", "status": "stopped", "stop": "onward", "counted_to": Self::hash(&before) }), json!({ "updates": Self::hash(&inv), "subject": circle, "as": circle, "after": [Self::hash(&inv)] }));
        self.send(founder, &end);
        // the member has seen the removal (it is in the block's causal past) and still signs for the business
        let after = self.make(m, "observe", json!({ "kind": "note", "text": "still ordering" }), json!({ "as": circle, "after": [Self::hash(&end)] }));
        self.send(m, &after);
        self.truth.may_act.push((before, circle.clone(), true));
        self.truth.may_act.push((after, circle, false));
        self.businesses[bi].members.retain(|&x| x != m);
    }

    /// A second device is brought in by a key grant and writes on its own chain.
    pub fn second_device(&mut self) {
        self.count("second_device");
        let p = self.pick(Role::Person);
        if self.actors[p].seq > 900 || self.actors[p].custodian.is_some() {
            return;
        }
        let seed = self.rng.hex(32);
        let k2 = Key::from_seed("std", &seed);
        let grant = self.make(p, "grant", json!({ "kind": "key", "public_key_sign": k2.public }), json!({ "subject": self.id(p) }));
        self.send(p, &grant);
        let note = self.make_with(p, "observe", json!({ "kind": "note", "text": "from my tablet" }), json!({}), Opts { prev: Some(Self::hash(&grant)), seq: Some(1), key: Some(k2), advance: false, at_shift: 0 });
        self.send(p, &note);
        self.truth.counted.push((self.id(p), Self::hash(&note)));
    }

    pub fn finish_episodes(&mut self) {}
}

pub const BASE_MS_PUB: i64 = 1_792_054_800_000;

/// The thing a stolen transfer tried to move (its `refs.what`).
fn counted_to_thing(_t: &Truth, fraud: &Value) -> String {
    fraud["refs"]["what"].as_str().unwrap_or("").to_string()
}

/// A rotation: `signer` (the old key, or the recovery key when `recovery` names it) brings `new` in and replaces `old`, counting up to `counted_to`.
fn rotation(id: &str, new: &Key, signer: &Key, place: &Link, at: &str, old: &str, counted_to: &str, recovery: Option<&str>) -> Value {
    let suite = signer.suite().to_string();
    let extras = foodblock::identity::KeyGrantExtras {
        replaces: Some(old),
        counted_to: Some(counted_to),
        signer_suite: Some(&suite),
        suite: if new.suite() == "std" { None } else { Some(new.suite()) },
        ..Default::default()
    };
    foodblock::identity::key_grant_with(id, Some(&new.public), &signer.private, place, at, recovery, &extras).expect("a rotation")
}
