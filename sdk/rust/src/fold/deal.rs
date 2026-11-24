//! A deal, read from its first promise (folds.md, A promise's stage, stages 1 and 2): who is on which side, the blocks that belong to
//! the deal, the live offers, and the accept (or the allocations of an open offer) that binds. Settling it is promise.rs.
use super::bench::{bench, receipts_of};
use super::promise::{fits, value_in, amount_dec};
use super::{acting_grant, principal_of, speaker_of, speaks_for, sub_index, StageOptions};
use crate::decimal::Dec;
use crate::js::{get, hash_of, list, rf, rs, sorted_set, ss, st, str_of, type_of, Index};
use crate::order::{causal_order_among, earliest, named, sees_in};
use crate::prelude::*;
use alloc::collections::{BTreeMap, BTreeSet};
use core::cell::RefCell;
use core::cmp::Ordering;

/// An allocation's own deal: the open offer it is made under, the request it allocates, and the taker's entry in the offer's `takers`.
type Allocation = (Value, Value, Value);

pub(super) struct Deal<'a> {
    pub index: &'a Index,
    pub first_hash: String,
    pub first: Value,
    /// The deal's head: the first promise, or, for an allocation, the open offer it is made under.
    pub root: Value,
    pub alloc: Option<Allocation>,
    /// The root's `refs.from` and `refs.to`.
    pub from_ref: Option<String>,
    pub to_ref: Option<String>,
    pub offerer_is_from: bool,
    /// An open offer: one side is left out, so anyone may answer it and each allocation is a deal of its own.
    pub open: bool,
    /// The blocks a side signed (an open side is anyone, until an accept binds), in causal order.
    pub in_deal: Vec<Value>,
    /// Every block of the deal (the first promise too), whoever signed it, in causal order: `forks` and `waiting` read them all.
    pub all: Vec<Value>,
    taker_id: Option<String>,
    /// Who signed, or was named owner by, a transfer that names the deal in `what`: the owners of what is to come answer deliveries and payments in it.
    to_come_owners: BTreeSet<String>,
    owners: RefCell<BTreeMap<(String, String), Option<String>>>,
}

/// What binds in a deal (folds.md, A promise's stage): the accept (or, on an open offer, the first allocation), the takers of an open offer and which
/// of their allocations were stopped onward, the accepts or allocations that prove a lie, and the offers still live.
pub(super) struct Binding<'d> {
    pub accept: Option<&'d Value>,
    pub takers: Vec<Value>,
    pub freed: Vec<String>,
    pub forks: Vec<String>,
    /// Binding accepts that do not see one another cross; each binds, and the deal is read once under each.
    pub crossed: Vec<String>,
    pub live: Vec<&'d Value>,
    /// Her plan (promises.md, Her plan): a first promise whose `from` and `to` both name its signer names no other side. It binds no one and
    /// has no stage.
    pub plan: bool,
    /// Each answer that binds nothing yet, with what of *which*, *whose* and *when* it
    /// leaves open: `[{ block, open }]`, sorted by block.
    pub requests: Vec<Value>,
}

pub(super) fn status(b: &Value, word: &str) -> bool {
    ss(b, "status") == Some(word)
}

impl<'a> Deal<'a> {
    /// The deal of the promise given under `first_hash`; None when it has no stage (no such block, a word of no one's, a head that speaks
    /// for neither side).
    pub(super) fn read(first_hash: &str, index: &'a Index, options: &StageOptions) -> Option<Deal<'a>> {
        // A promise with no id is no block a fold can hold; one that rests on blocks the input lacks is not read yet.
        let first = index.get(first_hash).filter(|_| !first_hash.is_empty())?.clone();
        let alloc = allocation_of(&first, first_hash, index, options);
        let root = alloc.as_ref().map_or_else(|| first.clone(), |(o, _, _)| o.clone());
        // A fork voids what the forker claims, never what they owe (folds.md, A fork is a burden): a block of a fork still counts in a deal
        // where it binds its signer; its stops and declines, which would free its signer by their word alone, count for nothing. A block
        // whose key does not speak for its author (identity.md, invariant 8) is no word of theirs at all. The head too: a first promise whose key does not speak for its author has no stage.
        let owes = |b: &Value| crate::forks::binds_signer(b, index);
        if !owes(&first) {
            return None;
        }
        // The deal: every block naming the first promise in `for`, or answering or updating a block in it (history only where it counts).
        // A promise with no `answers` is not in the deal even if it names P in `for`: it is a new deal that P serves.
        let names = index.names_memo();
        let mut members: Vec<String> = vec![first_hash.to_string()];
        let mut in_set: BTreeSet<String> = members.iter().cloned().collect();
        for h in names.by_for.get(first_hash).into_iter().flatten() {
            let Some(b) = index.get(h) else { continue };
            if owes(b) && h != first_hash && (type_of(b) != "promise" || !list(rf(b, "answers")).is_empty()) && in_set.insert(h.to_string()) {
                members.push(h.to_string());
            }
        }
        let mut todo = members.clone();
        while let Some(h) = todo.pop() {
            for next in names.by_answer.get(h.as_str()).into_iter().flatten() {
                if index.get(next).is_some_and(owes) && in_set.insert(next.to_string()) {
                    members.push(next.to_string());
                    todo.push(next.to_string());
                }
            }
        }
        let mut deal = Deal {
            index,
            first_hash: first_hash.to_string(),
            first,
            from_ref: rs(&root, "from").map(String::from),
            to_ref: rs(&root, "to").map(String::from),
            taker_id: alloc.as_ref().and_then(|(_, _, taker)| taker.get("who").and_then(Value::as_str).map(String::from)),
            root,
            alloc,
            offerer_is_from: false,
            open: false,
            in_deal: Vec::new(),
            all: Vec::new(),
            owners: Default::default(),
            to_come_owners: BTreeSet::new(),
        };
        deal.to_come_owners = names
            .by_what
            .get(first_hash)
            .into_iter()
            .flatten()
            .filter_map(|h| index.get(h))
            .flat_map(|t| speaker_of(t, index, None).into_iter().chain(list(rf(t, "to_owner")).into_iter().map(String::from)))
            .collect();
        deal.offerer_is_from = deal.speaks(&deal.root, deal.side_at("from", &deal.root).as_deref());
        // A first promise that speaks for neither side is nobody's promise: it has no stage.
        if !deal.offerer_is_from && !deal.speaks(&deal.root, deal.side_at("to", &deal.root).as_deref()) {
            return None;
        }
        deal.open = deal.alloc.is_none() && deal.other_ref().is_none_or(str::is_empty);
        // Who counts: only blocks a side signed. An `updates` of a promise is its author's stop (any other is refused: terms are fixed
        // once written): it counts only when it speaks for the one the block it updates speaks for (the other side stops by `answers`).
        let blocks: Vec<&Value> = members.iter().map(|h| &index[h.as_str()]).collect();
        let ordered: Vec<Value> = causal_order_among(&sub_index(&blocks), index)
            .into_iter()
            .filter(|b| {
                let updates = type_of(b) == "promise" && rf(b, "updates").is_some() && rf(b, "answers").is_none();
                !updates
                    || rs(b, "updates").and_then(|h| index.get(h)).is_some_and(|u| speaker_of(b, index, None).is_some_and(|w| speaker_of(u, index, None).as_deref() == Some(w.as_str())))
            })
            .collect();
        let admit = |deal: &Deal, b: &Value| {
            hash_of(b) != first_hash
                && (deal.side_of(b).is_some()
                    || (deal.open && !deal.by_offerer(b))
                    || (type_of(b) == "transfer" && status(b, "accepted") && speaker_of(b, index, None).is_some_and(|w| deal.to_come_owners.contains(&w)))
                    // a `received` by a signer an account word names, naming that word: read by the stage, which counts it only
                    // where the word is the paid side's head and lists that place by that signer
                    || (type_of(b) == "observe" && ss(b, "kind") == Some("received") && !list(rf(b, "derives_from")).is_empty()))
        };
        let in_deal: Vec<Value> = ordered.iter().filter(|b| admit(&deal, b)).cloned().collect();
        deal.in_deal = in_deal;
        deal.all = ordered;
        Some(deal)
    }

    pub(super) fn speaks(&self, b: &Value, side: Option<&str>) -> bool {
        speaks_for(b, side, self.index, None)
    }
    /// The side left out of the offerer's: the other party's ref.
    pub(super) fn other_ref(&self) -> Option<&str> {
        if self.offerer_is_from { self.to_ref.as_deref() } else { self.from_ref.as_deref() }
    }
    pub(super) fn offerer_key(&self) -> &'static str {
        if self.offerer_is_from { "from" } else { "to" }
    }
    pub(super) fn is_thing(&self, r: &str) -> bool {
        self.index.get(r).is_some_and(|t| type_of(t) == "thing")
    }
    /// Who a side is where a block stands (promises.md, Bearer): a side that names a thing is whoever owned the thing there (the ownership
    /// fold of that block's causal past), so an accept binds the holder it was signed by, and a note passed on after it was redeemed binds
    /// no one again. An allocation's open side is the taker who made the request.
    pub(super) fn side_at(&self, key: &str, b: &Value) -> Option<String> {
        let r = if key == "from" { &self.from_ref } else { &self.to_ref };
        match r.as_deref().filter(|r| !r.is_empty()) {
            None => if self.alloc.is_some() { self.taker_id.clone() } else { None },
            Some(r) if self.is_thing(r) => {
                let k = (r.to_string(), hash_of(b).to_string());
                if let Some(o) = self.owners.borrow().get(&k) {
                    return o.clone();
                }
                let o = super::things::owner_seen_by(r, b, self.index);
                self.owners.borrow_mut().insert(k, o.clone());
                o
            }
            Some(r) => Some(r.to_string()),
        }
    }
    /// The side a block speaks for.
    pub(super) fn side_of(&self, b: &Value) -> Option<&'static str> {
        ["from", "to"].into_iter().find(|side| self.speaks(b, self.side_at(side, b).as_deref()))
    }
    pub(super) fn by_offerer(&self, b: &Value) -> bool {
        self.speaks(b, self.side_at(self.offerer_key(), b).as_deref())
    }
    /// The blocks of the deal that answer `h` with `word` (or with none): an answer has the type of the block it answers (promises.md,
    /// Answers), so an observe or a transfer that says `accepted` to a promise is no answer to it. A decline is the one answer that may be an
/// `observe` (a reading, core.md Types); a decline written with the answered block's type before the three moods is read as before.
    pub(super) fn answers_of(&self, h: &str, word: Option<&str>) -> Vec<&Value> {
        let answered = self.index.get(h).map(type_of).unwrap_or("");
        self.in_deal
            .iter()
            .filter(|b| {
                list(rf(b, "answers")).contains(&h)
                    && (type_of(b) == answered
                        || (word == Some("declined") && crate::grant::is_decline_reading(b))
                        // her AI's reading "accepted under rule R" is her accept when R is her live grant that covers it (promises.md, Answers):
                        // `acting_grant` is the door's whole test, so a bare machine word, a dead grant or one that does not cover it counts for nothing
                        || (word == Some("accepted") && crate::grant::is_machine_accept(b, self.index) && acting_grant(b, self.index, None).is_some()))
                    && word.map_or(st(b, "status").is_none(), |w| status(b, w))
            })
            .collect()
    }
    /// A counter keeps the deal's two sides: its own refs.from and refs.to, where it names them, are the first promise's (promises.md,
    /// A counter ends an offer only between those two).
    fn same_sides(&self, c: &Value) -> bool {
        ["from", "to"].iter().all(|k| rf(c, k).is_none_or(|_| rs(c, k).is_some_and(|v| rs(&self.root, k) == Some(v))))
    }
    /// The live offers: the first promise, or the latest counters between the same two sides, among the counters `visible` lets in (every
    /// one given, or those in an accept's causal past: an accept binds the offer that was live where it stands).
    fn live_in(&self, visible: &dyn Fn(&str) -> bool) -> Vec<&Value> {
        let mut live: Vec<&Value> = vec![&self.root];
        if self.open {
            return live;
        }
        loop {
            let next: Vec<&Value> = live
                .iter()
                .flat_map(|offer| {
                    let so = self.side_of(offer);
                    self.answers_of(hash_of(offer), None).into_iter().filter(move |c| {
                        visible(hash_of(c)) && type_of(c) == "promise" && self.same_sides(c) && self.side_of(c).is_some() && self.side_of(c) != so
                            // A counter that has in its causal past an accept of the offer it answers ends nothing: a bound deal
                            // changes only by a stop (promises.md).
                            && !self.answers_of(hash_of(offer), Some("accepted")).iter().any(|a| self.side_of(a).is_some() && self.side_of(a) != so && sees_in(c, hash_of(a), self.index))
                    })
                })
                .collect();
            if next.is_empty() {
                return live;
            }
            live = next;
        }
    }
    /// Whether a promise's type is covered (promises.md, invariant 22): under the grant it acts under (live, and made for its author), it
    /// passes the door's whole authority test. A grant that is not live, or is for someone else, is no grant. One that does not give it the
    /// whole authority makes it a quote request: it binds no one. Under no grant it is its author's own word.
    pub(super) fn names_act(&self, b: &Value) -> bool {
        acting_grant(b, self.index, None).is_none() || super::names_act(b, self.index, None)
    }
    /// An autonomous system's ask is a quote request unless its grant covers its type: no accept of it binds. The principal's own `accepted`
    /// answer to it (itself no quote request), or a grant that lists `promise` in scope.types, makes it bind.
    fn quote_only(&self, offer: &Value) -> bool {
        if self.names_act(offer) {
            return false;
        }
        let principal = acting_grant(offer, self.index, None).and_then(|g| principal_of(g, self.index));
        !self.in_deal.iter().any(|b| {
            status(b, "accepted") && list(rf(b, "answers")).contains(&hash_of(offer)) && self.names_act(b) && principal.as_deref().is_some_and(|p| self.speaks(b, Some(p)))
        })
    }
    // a promise conditioned `{ accepted: <first promise> }` binds on its own accept; what it names is due only once that deal
    // binds (Due reads the condition in the performing block's past), so no condition gates binding here.
    /// A judge named late (promises.md, A new term both sides signed): a side's message for the deal stating `judge`, which the other side
    /// answers accepted. Both signed, so she sits on the bench after the names the grounds give.
    pub(super) fn judges_for(&self, sides: &[String], subject: &str) -> Vec<String> {
        self.judges_given(sides, subject, &[], None)
    }
    /// A judge named after the deal binds (the naming not in the binding accept's causal past) counts on its bench
    /// only where each side, and every holder of what either side has to come (`holders`), named her or answered her `accepted`.
    pub(super) fn judges_given(&self, sides: &[String], subject: &str, holders: &[String], accept: Option<&Value>) -> Vec<String> {
        let index = self.index;
        let speaks = |b: &Value| sides.iter().find(|s| self.speaks(b, Some(s.as_str()))).cloned();
        sorted_set(index
            .values()
            .filter(|g| super::judge_named(g, subject).is_some())
            .filter(|g| crate::forks::counts_in(g, index))
            .filter(|g| {
                let Some(signer) = speaks(g) else { return false };
                let answer = |a: &Value| type_of(a) == "observe" && ss(a, "status") == Some("accepted") && list(rf(a, "answers")).contains(&hash_of(g)) && crate::forks::counts_in(a, index);
                let accepted_by = |who: &str| index.values().any(|a| answer(a) && self.speaks(a, Some(who)));
                let both = index.values().any(|a| answer(a) && speaks(a).is_some_and(|other| other != signer));
                let late = accept.is_some_and(|ac| !sees_in(ac, hash_of(g), index));
                both && (!late || holders.iter().all(|h| self.speaks(g, Some(h.as_str())) || accepted_by(h)))
            })
            .filter_map(|g| super::judge_named(g, subject)))
    }
    /// A side's disputes of a block (its counted defeats of it): a backup judge's turn starts from the receipt of one.
    pub(super) fn disputes(&self, h: &str) -> Vec<String> {
        self.index
            .values()
            .filter(|o| list(rf(o, "defeats")).contains(&h) && crate::forks::counts_in(o, self.index) && self.side_of(o).is_some())
            .map(|o| hash_of(o).to_string())
            .collect()
    }
    /// Whether the deal's judge defeats `b`, judged on a bench between `sides` (with any judge both named for the deal, or for `also`)
    /// that `schema` names: its ruling reaches an accept or an allocation as it reaches any block (promises.md, Disputes).
    fn defeated_on(&self, schema: Option<&Value>, sides: Vec<String>, also: Option<&str>, blocks: &[&Value]) -> bool {
        let mut judges = self.judges_for(&sides, &self.first_hash);
        judges.extend(also.map(|h| self.judges_for(&sides, h)).unwrap_or_default());
        let bench = bench(schema, sides, judges);
        blocks.iter().any(|b| bench.ruling(hash_of(b), &|h| self.disputes(h), self.index) == Some(false))
    }
    /// Whether an onward stop of an allocation ends it: by either side of its deal (its author's `updates`, the other side's `answers`), in
    /// the causal past of `later` when one is given.
    fn stopped_onward(&self, taker: &Value, later: Option<&Value>) -> bool {
        let ah = str_of(taker.get("allocation"));
        let who = taker.get("who").and_then(Value::as_str);
        let by_offerer = self.index.get(ah).is_some_and(|a| self.by_offerer(a));
        self.in_deal.iter().any(|w| {
            type_of(w) == "promise"
                && status(w, "stopped")
                && ss(w, "stop") == Some("onward")
                && (rs(w, "updates") == Some(ah) || (rs(w, "answers") == Some(ah) && if by_offerer { self.speaks(w, who) } else { self.by_offerer(w) }))
                && later.is_none_or(|l| sees_in(l, hash_of(w), self.index))
        })
    }

    /// What binds (folds.md, A promise's stage): an allocation, an accept of the live offers, or the allocations of an open offer.
    /// `only`: read the deal under that one of its crossed accepts.
    pub(super) fn bind(&self, _options: &StageOptions, _visiting: &[String], only: Option<&str>) -> Binding<'_> {
        let live = self.live_in(&|_| true);
        let mut b = Binding { accept: None, takers: Vec::new(), freed: Vec::new(), forks: Vec::new(), crossed: Vec::new(), live, plan: false, requests: Vec::new() };
        let from = self.from_ref.as_deref();
        // Her plan: both refs name its signer (a note held by its own issuer is still a promise to its holder, not her plan).
        b.plan = self.alloc.is_none() && from.is_some_and(|f| !f.is_empty() && !self.is_thing(f)) && from == self.to_ref.as_deref() && speaker_of(&self.first, self.index, None).as_deref() == from;
        if let Some((_, _, taker)) = &self.alloc {
            // The allocation is the binding accept of its own deal, for this taker alone.
            b.accept = Some(&self.first);
            b.takers.push(taker.clone());
        } else if b.plan {
            // a plan binds no one: it has no accept
        } else if !self.open {
            self.bind_accept(&mut b, only);
        } else {
            self.bind_allocations(&mut b);
        }
        b
    }

    // Binding accepts, across every live offer (promises.md, Who may bind). Of binding accepts that see one another, the earliest binds; two
    // that do not see each other cross (`crossed`): each binds, and the deal is read once under each (`only`).
    fn bind_accept<'s>(&'s self, b: &mut Binding<'s>, only: Option<&str>) {
        let index = self.index;
        // An author's stop before acceptance: an accept binds unless that stop is in its causal past (promises.md).
        let before_stops: Vec<&Value> = self
            .in_deal
            .iter()
            .filter(|s| type_of(s) == "promise" && status(s, "stopped") && ss(s, "stop") == Some("before") && (!self.open || self.by_offerer(s)))
            .collect();
        // The offerer acted on an accept not in time when a counted block of the offerer's side in the deal that has it in its causal past
        // says yes to it: their `accepted` answer to it, or a block that performs the deal (a transfer `for` it, or their accepted answer to
        // one). A stop, a decline, or a block that only has it in its past binds them to nothing (blocks.md, Time).
        let root_hash = hash_of(&self.root).to_string();
        let acted_on = |a: &Value, so: Option<&'static str>| {
            let offer = rs(a, "answers").unwrap_or("");
            let for_deal = |t: &Value| type_of(t) == "transfer" && st(t, "status").is_none() && list(rf(t, "for")).iter().any(|f| *f == root_hash || *f == offer);
            self.in_deal.iter().any(|x| {
                hash_of(x) != hash_of(a)
                    && self.side_of(x) == so
                    && sees_in(x, hash_of(a), index)
                    && ((status(x, "accepted") && (list(rf(x, "answers")).contains(&hash_of(a)) || rs(x, "answers").and_then(|h| index.get(h)).is_some_and(for_deal))) || for_deal(x))
            })
        };
        // A timely accept beats a late decline by her receipt: the offerer's node's signed push answer listing the accept as
        // taken, dated no later than the offer's `expires`, so its later decline voids nothing.
        // An offer may name a clock instead (`terms.clocks`, blocks.md, A named clock): the accept is timely when `needed` clocks received it
        // by `expires`, though the offerer's own node never answered.
        let receipted = |a: &Value, offer: &Value| {
            let Some(expires) = get(offer, "state.terms.expires").and_then(Value::as_str) else { return false };
            let by_clock = get(offer, "state.terms.clocks").and_then(crate::tasks::clocks_of).is_some_and(|k| super::clock::received_by(hash_of(a), &k, index, expires));
            let Some(holder) = rs(offer, "author") else { return by_clock };
            let Some(until) = crate::time::parse(expires) else { return by_clock };
            by_clock
                || receipts_of(&[hash_of(a).to_string()], index, |o, node| node == holder && self.side_of(o).is_some() && self.side_of(o) == self.side_of(a))
                    .iter()
                    .any(|(_, at)| crate::time::parse(at).is_some_and(|t| t <= until))
        };
        let own_date_in_time = |a: &Value, offer: &Value| {
            let has_clock = get(offer, "state.terms.clocks").is_some();
            !has_clock
                && get(offer, "state.terms.expires").and_then(Value::as_str).and_then(crate::time::parse).zip(ss(a, "at").and_then(crate::time::parse)).is_some_and(|(end, at)| at < end)
        };
        // A judge's ruling reaches the accept too (promises.md, Disputes): an accept the deal's judge defeats binds nothing.
        let ruled_out = |a: &Value, offer: &Value| {
            let sides: Vec<String> = [self.side_at("from", a), self.side_at("to", a)].into_iter().flatten().collect();
            self.defeated_on(rs(offer, "schema").and_then(|h| index.get(h)), sides, None, &[a])
        };
        // Whether a word does not stand yet and waits on something (blocks.md, Finality): an answer, or the offer it answers, that is
        // waiting leaves *whose* open.
        let waits = |x: &Value| {
            let s = crate::finality::stands(x, index);
            !s.stands && !s.waiting.is_empty()
        };
        let mut candidates: Vec<&Value> = Vec::new();
        let mut requests: Vec<(String, Vec<&str>)> = Vec::new();
        let offers = core::iter::once(&self.root).chain(self.in_deal.iter().filter(|o| type_of(o) == "promise" && st(o, "status").is_none()));
        for offer in offers.filter(|offer| !self.quote_only(offer)) {
            let (so, oh) = (self.side_of(offer), hash_of(offer));
            let expires = get(offer, "state.terms.expires").is_some();
            // a decline ends a standing word for its signer: no later yes of hers to it counts
            let declined_before = |a: &Value| self.answers_of(oh, Some("declined")).iter().any(|d| self.side_of(d).is_some() && self.side_of(d) == self.side_of(a) && sees_in(a, hash_of(d), index));
            for a in self.answers_of(oh, Some("accepted")) {
                if !(self.side_of(a).is_some() && self.side_of(a) != so && self.names_act(a) && fits(a, offer)) || declined_before(a) {
                    continue;
                }
                // a withdrawal of the offer in its causal past: it binds nothing, and asks nothing (it is ended)
                if before_stops.iter().any(|s| crate::grant::ending(s, oh).is_some() && sees_in(a, hash_of(s), index)) {
                    continue;
                }
                // An accept binds the offer it answers when that offer was live where the accept stands (in its causal past): a counter
                // the accepter signs elsewhere, unseen by the accept, takes back nothing it consented to (promises.md, Who may bind).
                let past = index.past_of(a);
                if !self.live_in(&|h| past.contains(h)).iter().any(|o| hash_of(o) == oh) {
                    continue;
                }
                if ruled_out(a, offer) {
                    continue;
                }
                // on an offer that carried `expires`, the offerer's decline ends an accept that is not in time (with no clock, in time
                // only by its own `at` before the end, or by his own later block or a relier's): it is no longer a request. An accept in time
                // binds, and his decline of it takes back nothing (promises.md, Answers)
                let in_time = own_date_in_time(a, offer) || receipted(a, offer) || acted_on(a, so) || relied_on(a, index);
                if expires && !in_time && self.answers_of(hash_of(a), Some("declined")).iter().any(|d| self.side_of(d) == so) {
                    continue;
                }
                // what it leaves open: *when* (with no clock, an accept is in time only by its own `at`, before the offer's end;
                // one at or after it, or with none, binds the offerer only by his own later block), *whose* (it or the offer is waiting)
                let mut open: Vec<&str> = Vec::new();
                if expires && !(own_date_in_time(a, offer) || receipted(a, offer) || acted_on(a, so) || relied_on(a, index)) {
                    open.push("when");
                }
                if waits(a) || waits(offer) {
                    open.push("whose");
                }
                if !open.is_empty() {
                    if !requests.iter().any(|(h, _)| h == hash_of(a)) {
                        open.sort();
                        requests.push((hash_of(a).to_string(), open));
                    }
                    continue;
                }
                if !candidates.iter().any(|c| hash_of(c) == hash_of(a)) {
                    candidates.push(a);
                }
            }
        }
        requests.sort_by(|x, y| crate::js::cmp16(&x.0, &y.0));
        b.requests = requests.into_iter().map(|(a, open)| json!({ "block": a, "open": open })).collect();
        // Each binding accept binds; those that do not see one another cross, and the deal is read once under each.
        let mut firsts = earliest(&candidates, index);
        if let Some(h) = only {
            firsts.retain(|a| hash_of(a) == h);
        }
        b.crossed = if firsts.len() > 1 { sorted_set(firsts.iter().map(|a| hash_of(a).to_string())) } else { Vec::new() };
        b.forks = self.pairs_in_deal();
        b.accept = named(&firsts);
        if b.accept.is_some() || only.is_some() {
            return;
        }
        // A spot exchange (things.md): the seller's transfer `for` the buyer's order, `to_owner` her, naming what it moves, is his yes
        // and his delivery in one block: it binds the order where it is signed (one that has her stop of the order in its past binds nothing)
        let so = self.side_of(&self.root);
        let spots: Vec<&Value> = self
            .in_deal
            .iter()
            .filter(|x| {
                type_of(x) == "transfer"
                    && st(x, "status").is_none()
                    && list(rf(x, "for")).contains(&self.first_hash.as_str())
                    && rf(x, "what").is_some()
                    && self.side_of(x).is_some()
                    && self.side_of(x) != so
                    && rs(&self.root, "author").is_some_and(|buyer| self.side_at(if so == Some("to") { "to" } else { "from" }, x).as_deref().is_some_and(|w| list(rf(x, "to_owner")).contains(&w)) || list(rf(x, "to_owner")).contains(&buyer))
                    && !self.quote_only(&self.root)
                    && !before_stops.iter().any(|s| crate::grant::ending(s, &self.first_hash).is_some() && sees_in(x, hash_of(s), index))
            })
            .collect();
        if self.answers_of(&self.first_hash, Some("accepted")).is_empty() {
            b.accept = named(&earliest(&spots, index));
        }
    }

    // `forks`: the blocks of the deal that are of a pair (one key, one `prev` or one `seq`): a pair never frees its signer. Sorted.
    fn pairs_in_deal(&self) -> Vec<String> {
        let pairs = self.index.stage_memo("fork_pairs", || json!(crate::forks::fork_pairs_in(self.index)));
        let ds: BTreeSet<&str> = self.all.iter().map(hash_of).collect();
        sorted_set(pairs.as_array().into_iter().flatten().flat_map(|p| p.as_array().into_iter().flatten()).filter_map(Value::as_str).filter(|h| ds.contains(h)))
    }

    // An open offer is bound by each allocation, a deal of its own (promises.md, Who may bind). A request is an accept of it by anyone but
    // its offerer, or a counter in a chain on it; an allocation is the accepted answer to a request, by the side that did not sign it, and
    // it binds a deal between the offerer and the taker on the request's own terms, its quantity counting against the offer's. Every
    // allocation the offerer signed binds the offerer: they should form one chain, each seeing the one before, and two that
    // do not prove her lie (`forks`), yet a lie never frees the liar of what she owes: each binds its taker. Allocations that together bind
    // more than she offered are her broken promise, to come to each taker, and every taker is listed.
    fn bind_allocations<'s>(&'s self, b: &mut Binding<'s>) {
        let (index, first) = (self.index, &self.first);
        let is_counter = |r: &Value| st(r, "status").is_none();
        let (offerer_key, open_key) = (self.offerer_key(), if self.offerer_is_from { "to" } else { "from" });
        let binds_open = !self.quote_only(first);
        // A counter keeps the two sides: its own ref on the offerer's side, where it names one, is the offer's, and on the open side, the taker's.
        let keeps_sides = |c: &Value, taker: &Option<String>| {
            rf(c, offerer_key).is_none_or(|_| rs(c, offerer_key) == rs(first, offerer_key))
                && rf(c, open_key).is_none_or(|_| rs(c, open_key).is_some_and(|v| taker.as_deref() == Some(v)))
        };
        // The side that did not sign a counter: the offerer's, or the taker's.
        let answers_for = |c: &Value, taker: &Option<String>, x: &Value| if self.by_offerer(c) { self.speaks(x, taker.as_deref()) } else { self.by_offerer(x) };
        let mut requests: Vec<(&Value, Option<String>)> = self
            .answers_of(&self.first_hash, Some("accepted"))
            .into_iter()
            .filter(|r| !self.by_offerer(r) && binds_open)
            .map(|r| (r, speaker_of(r, index, None)))
            .collect();
        // The counters of a chain: the first by anyone but the offerer, each next by the side that did not sign the one it answers. A counter
        // that has in its causal past an accept of a counter before it ends nothing: a binding deal changes only by a stop.
        let mut chain: Vec<(&Value, Option<String>, Option<usize>)> = Vec::new();
        for c in self.answers_of(&self.first_hash, None) {
            if type_of(c) == "promise" && !self.by_offerer(c) {
                let taker = speaker_of(c, index, None);
                if !self.quote_only(c) && keeps_sides(c, &taker) {
                    chain.push((c, taker, None));
                }
            }
        }
        let mut i = 0;
        while i < chain.len() {
            let (c, taker) = (chain[i].0, chain[i].1.clone());
            for n in self.answers_of(hash_of(c), None) {
                if type_of(n) != "promise" || chain.iter().any(|x| hash_of(x.0) == hash_of(n)) || self.quote_only(n) || !keeps_sides(n, &taker) || !answers_for(c, &taker, n) {
                    continue;
                }
                let (mut at, mut ended) = (Some(i), false);
                while let Some(j) = at {
                    ended |= self.answers_of(hash_of(chain[j].0), Some("accepted")).iter().any(|a| answers_for(chain[j].0, &taker, a) && sees_in(n, hash_of(a), index));
                    at = chain[j].2;
                }
                if !ended {
                    chain.push((n, taker.clone(), Some(i)));
                }
            }
            i += 1;
        }
        requests.extend(chain.iter().map(|(c, t, _)| (*c, t.clone())));
        // The first counter of a request's chain: one chain is allocated once.
        let head = |r: &Value| -> String {
            let mut cur = r;
            while let Some(prev) = rs(cur, "answers").filter(|p| *p != self.first_hash).and_then(|p| index.get(p)) {
                cur = prev;
            }
            hash_of(cur).to_string()
        };
        let allocations: Vec<&Value> = self
            .in_deal
            .iter()
            .filter(|a| {
                status(a, "accepted")
                    && requests.iter().any(|(r, taker)| {
                        list(rf(a, "answers")).contains(&hash_of(r))
                            && if is_counter(r) {
                                // by the side that did not sign it, when no counter of the chain that answers it is in its causal past
                                answers_for(r, taker, a) && !chain.iter().any(|(n, _, p)| p.is_some_and(|p| hash_of(chain[p].0) == hash_of(r)) && sees_in(a, hash_of(n), index))
                            } else {
                                self.by_offerer(a)
                            }
                    })
            })
            .collect();
        let offer_lines: Vec<Value> = crate::js::lines_of(get(first, "state.terms").unwrap_or(&Value::Null)).into_iter().cloned().collect();
        // A taker withdraws her request as an author withdraws an offer: an allocation binds nothing once her withdrawal is in its causal
        // past (promises.md, Who may bind).
        let withdrawn = |request: &Value, allocation: &Value| {
            self.in_deal.iter().any(|w| {
                type_of(w) == "promise" && status(w, "stopped") && ss(w, "stop") == Some("before") && rs(w, "updates") == Some(hash_of(request)) && sees_in(allocation, hash_of(w), index)
            })
        };
        // read causes first (a schedule only: each test below reads the allocation's own causal past)
        let rank = super::draws::causal_rank(index);
        let mut allocations = allocations;
        allocations.sort_by_key(|a| rank.get(hash_of(a)).copied().unwrap_or(usize::MAX));
        for allocation in allocations.into_iter().cloned() {
            let answered = list(rf(&allocation, "answers"));
            let Some((request, taker)) = requests.iter().find(|(r, _)| answered.contains(&hash_of(r))) else { continue };
            let request = *request;
            if withdrawn(request, &allocation) {
                continue;
            }
            // A judge's ruling reaches an allocation as it reaches an accept (one rule for every deal): an allocation, or the
            // request it answers, that the deal's judge defeats binds nothing. The bench is the schema's of the open offer (a counter's deal
            // is read by the counter's own), between its offerer and this taker, with any judge both named for the offer or for this
            // allocation's own deal.
            let sides: Vec<String> = [self.side_at(offerer_key, &allocation), taker.clone()].into_iter().flatten().collect();
            let schema = rs(if is_counter(request) { request } else { first }, "schema").and_then(|h| index.get(h));
            if self.defeated_on(schema, sides, Some(hash_of(&allocation)), &[&allocation, request]) {
                continue;
            }
            // One request, or one chain of counters, is allocated once: a later allocation of it, when an allocation in its causal past
            // already binds it (not stopped in this one's causal past), binds nothing more (promises.md, Who may bind).
            if b.takers.iter().any(|t| t.get("request").and_then(Value::as_str).and_then(|h| index.get(h)).is_some_and(|r| head(r) == head(request)) && sees_in(&allocation, str_of(t.get("allocation")), index) && !self.stopped_onward(t, Some(&allocation))) {
                continue;
            }
            // What the allocation draws on each line (promises.md, Who may bind): the quantity it names for the line, else what its request
            // names, else the whole line; a counter's lines are its own, whole, each drawn on the open offer's line of the same id.
            if is_counter(request) && !fits(&allocation, request) {
                continue;
            }
            let lines_for: Vec<Value> = if is_counter(request) { crate::js::lines_of(get(request, "state.terms").unwrap_or(&Value::Null)).into_iter().cloned().collect() } else { offer_lines.clone() };
            let pick = |terms: &Value, id: Option<&Value>| get(terms, "state.terms.lines").and_then(Value::as_array).and_then(|a| a.iter().find(|c| c.get("id") == id)).and_then(|c| c.get("quantity")).cloned();
            let mut drawn: Vec<Value> = Vec::new();
            let mut binds = true;
            for line in &lines_for {
                let id = line.get("id");
                let asked = pick(request, id).filter(|_| !is_counter(request));
                let quantity = pick(&allocation, id).or_else(|| pick(request, id)).or_else(|| line.get("quantity").filter(|q| q.get("value").is_some()).cloned());
                // an allocation binds a taker to no more than she asked for: no larger than her request names, in its unit
                if let (Some(a), Some(q)) = (asked.as_ref(), quantity.as_ref()) {
                    if amount_dec(Some(q), a.get("unit")).is_none_or(|qa| qa.cmp(&Dec::of(a.get("value")).unwrap_or_else(Dec::zero)) == Ordering::Greater) {
                        binds = false;
                    }
                }
                // on a line with a quantity, what it draws is an amount in the line's unit; on a range, no less than its `min` (a range is what
                // may be chosen, never a choice)
                if let Some(lq) = line.get("quantity").filter(|q| q.is_object()) {
                    let unit = lq.get("unit").or_else(|| lq.get("min").and_then(|m| m.get("unit"))).or_else(|| lq.get("max").and_then(|m| m.get("unit")));
                    match quantity.as_ref().and_then(|q| amount_dec(Some(q), unit)) {
                        None => binds = false,
                        Some(v) => {
                            if lq.get("min").is_some_and(|m| value_in(m, unit).is_some_and(|m| v.cmp(&m) == Ordering::Less)) {
                                binds = false;
                            }
                        }
                    }
                }
                drawn.push(json!({ "id": id, "quantity": quantity }));
            }
            if !binds {
                continue;
            }
            b.takers.push(json!({
                "who": taker, "request": hash_of(request), "allocation": hash_of(&allocation), "lines": drawn,
            }));
        }
        // *which*: a request on an open offer binds only by the offerer's yes, the allocation: until one allocates it (or its chain), it is a
        // request
        let mut open_requests: Vec<String> = Vec::new();
        for (r, _) in &requests {
            if !b.takers.iter().any(|t| t.get("request").and_then(Value::as_str).and_then(|h| index.get(h)).is_some_and(|q| head(q) == head(r))) && !open_requests.iter().any(|h| h == hash_of(r)) {
                open_requests.push(hash_of(r).to_string());
            }
        }
        open_requests.sort_by(|x, y| crate::js::cmp16(x, y));
        b.requests = open_requests.into_iter().map(|h| json!({ "block": h, "open": ["which"] })).collect();
        // Allocations are listed in the order of their `seq` on the offerer's line; a hash only breaks a tie in the listing (a pair) and picks nothing.
        let seq_of = |t: &Value| index.get(str_of(t.get("allocation"))).and_then(|a| st(a, "seq")).and_then(Value::as_i64).unwrap_or(0);
        b.takers.sort_by(|x, y| seq_of(x).cmp(&seq_of(y)).then_with(|| crate::js::cmp16(str_of(x.get("allocation")), str_of(y.get("allocation")))));
        // The allocations stopped onward (by either side of their deal): their quantity is freed, so the offer no longer binds it.
        b.freed = b.takers.iter().filter(|t| self.stopped_onward(t, None)).map(|t| str_of(t.get("allocation")).to_string()).collect();
        // Each allocation is a draw on the open offer's lines (folds.md, What is left): one that does not take still binds the offerer and is
        // shown over-allocated. Allocations the record does not order are counted together, in rounds: each round the allocations with no
        // other left in their causal past; an allocation is counted against another only where the other is in its past (and not freed for
        // it). Where on any line a round comes to more than is left for any of it, none of that round takes. A line with no quantity is one
        // whole, which one allocation takes.
        let offerer_known = speaker_of(first, index, None).is_some();
        let measures: Vec<(Option<Value>, Option<Dec>)> = offer_lines
            .iter()
            .map(|l| {
                let q = l.get("quantity").filter(|q| q.is_object());
                let cap = q.and_then(|q| if q.get("max").is_some() || q.get("min").is_some() { q.get("max") } else { Some(q) });
                (l.get("id").cloned(), match (q, cap) { (None, _) => Some(Dec::parse("1").unwrap_or_else(Dec::zero)), (Some(_), Some(c)) => Dec::of(c.get("value")), (Some(_), None) => None })
            })
            .collect();
        let blocks: Vec<&Value> = b.takers.iter().filter_map(|t| index.get(str_of(t.get("allocation")))).collect();
        let freed_by: Vec<Vec<&Value>> = blocks.iter().map(|a| self.in_deal.iter().filter(|w| type_of(w) == "promise" && status(w, "stopped") && ss(w, "stop") == Some("onward") && (rs(w, "updates") == Some(hash_of(a)) || rs(w, "answers") == Some(hash_of(a)))).collect()).collect();
        // what allocation i draws on line j: its named quantity in the line's unit, the whole of a line with no quantity
        let wants: Vec<Vec<Dec>> = b.takers.iter().map(|t| {
            offer_lines.iter().zip(&measures).map(|(line, (id, _))| {
                let q = t.get("lines").and_then(Value::as_array).and_then(|l| l.iter().find(|x| x.get("id") == id.as_ref())).and_then(|x| x.get("quantity")).filter(|q| q.get("value").is_some());
                let lq = line.get("quantity").filter(|q| q.is_object());
                match (lq, q) {
                    (None, _) => Dec::parse("1").unwrap_or_else(Dec::zero),
                    (Some(lq), Some(q)) => amount_dec(Some(q), lq.get("unit").or_else(|| lq.get("max").and_then(|m| m.get("unit"))).or_else(|| lq.get("min").and_then(|m| m.get("unit")))).unwrap_or_else(Dec::zero),
                    (Some(_), None) => Dec::zero(),
                }
            }).collect()
        }).collect();
        let mut taken: Vec<usize> = Vec::new();
        let mut left_over: Vec<usize> = (0..blocks.len()).collect();
        let mut takes: Vec<bool> = vec![false; blocks.len()];
        while !left_over.is_empty() {
            let mins: Vec<usize> = left_over.iter().copied().filter(|i| !left_over.iter().any(|j| j != i && index.past_of(blocks[*i]).contains(hash_of(blocks[*j])))).collect();
            let avail = |i: usize, j: usize| -> Option<Dec> {
                let past = index.past_of(blocks[i]);
                measures[j].1.as_ref().map(|m| taken.iter().filter(|t| past.contains(hash_of(blocks[**t])) && !freed_by[**t].iter().any(|n| past.contains(hash_of(n)))).fold(m.clone(), |v, t| v.sub(&wants[*t][j])))
            };
            let fits_all = offerer_known
                && (0..offer_lines.len()).all(|j| {
                    let sum = mins.iter().fold(Dec::zero(), |t, i| t.add(&wants[*i][j]));
                    mins.iter().all(|i| avail(*i, j).is_none_or(|a| sum.cmp(&a).is_le()))
                });
            for i in &mins {
                if fits_all && wants[*i].iter().any(Dec::is_pos) {
                    takes[*i] = true;
                    taken.push(*i);
                }
            }
            left_over.retain(|i| !mins.contains(i));
        }
        for (t, took) in b.takers.iter_mut().zip(&takes) {
            t["over_allocated"] = json!(!took);
        }
        // two allocations of one signer that do not see each other prove her lie (`forks`); each still binds
        for x in &blocks {
            for y in &blocks {
                let (bx, by) = (speaker_of(x, index, None), speaker_of(y, index, None));
                if hash_of(x) != hash_of(y) && bx.is_some() && bx == by && !index.past_of(x).contains(hash_of(y)) && !index.past_of(y).contains(hash_of(x)) {
                    b.forks.push(hash_of(x).to_string());
                }
            }
        }
        b.forks = sorted_set(b.forks.iter().map(String::as_str));
        if let Some(t) = b.takers.first() {
            b.accept = index.get(str_of(t.get("allocation")));
        }
    }
}

// An allocation starts its own deal (promises.md, Who may bind): the accepted answer to a request on an open offer, a request being an
// accept of the offer or a counter in a chain on it. The deal is read with the allocation as its head and the offer as its root; an
// allocation the open offer does not bind has none.
fn allocation_of(first: &Value, first_hash: &str, index: &Index, options: &StageOptions) -> Option<Allocation> {
    if type_of(first) != "promise" || ss(first, "status") != Some("accepted") {
        return None;
    }
    let request = list(rf(first, "answers")).iter().find_map(|h| index.get(*h))?;
    if type_of(request) != "promise" || !(ss(request, "status") == Some("accepted") || st(request, "status").is_none()) {
        return None;
    }
    // the offer: what the request answers, through the counters of its chain
    let mut offer = list(rf(request, "answers")).iter().find_map(|h| index.get(*h)).filter(|o| type_of(o) == "promise")?;
    while !list(rf(offer, "answers")).is_empty() {
        offer = list(rf(offer, "answers")).iter().find_map(|h| index.get(*h)).filter(|o| type_of(o) == "promise" && st(o, "status").is_none())?;
    }
    if !(rs(offer, "from").is_none_or(str::is_empty) || rs(offer, "to").is_none_or(str::is_empty)) {
        return None;
    }
    let taker = super::promise::promise_stage_in(hash_of(offer), index, options)
        .get("takers")
        .and_then(Value::as_array)
        .and_then(|ts| ts.iter().find(|t| t.get("allocation").and_then(Value::as_str) == Some(first_hash)).cloned())?;
    Some((offer.clone(), request.clone(), taker))
}

/// An accept that is not in time binds by a relier's block (blocks.md, Relier): a counted block of anyone
/// but its signer that names it (in any ref but `author`, `prev`, `key` and `after`), other than a decline or a stop of it.
pub(super) fn relied_on(a: &Value, index: &Index) -> bool {
    let signer = speaker_of(a, index, None);
    let h = hash_of(a);
    index.values().any(|x| {
        hash_of(x) != h
            && x.get("type").is_some()
            && !(matches!(ss(x, "status"), Some("declined" | "stopped")) && list(rf(x, "answers")).contains(&h))
            && x.get("refs").and_then(Value::as_object).is_some_and(|r| r.iter().any(|(k, v)| !matches!(k.as_str(), "author" | "prev" | "key" | "after") && list(Some(v)).contains(&h)))
            && crate::forks::counts_in(x, index)
            && speaker_of(x, index, None) != signer
    })
}
