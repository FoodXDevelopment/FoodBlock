//! A deal, read from its first promise (folds.md, A promise's stage, stages 1 and 2): who is on which side, the blocks that belong to
//! the deal, the live offers, and the accept (or the allocations of an open offer) that binds. Settling it is promise.rs.
use super::bench::{bench, receipts_of};
use super::promise::{binds, fits, promise_stage_at, value_in, amount_dec};
use super::{acting_grant, principal_of, speaker_of, speaks_for, sub_index, StageOptions};
use crate::decimal::Dec;
use crate::js::{get, hash_of, list, rf, rs, same_str, sorted_set, ss, st, str_of, type_of, Index};
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
    taker_id: Option<String>,
    /// Who signed, or was named owner by, a transfer that names the deal in `what`: the owners of what is owed answer deliveries and payments in it.
    owed_owners: BTreeSet<String>,
    owners: RefCell<BTreeMap<(String, String), Option<String>>>,
}

/// What binds in a deal (stage 2): the accept (or, on an open offer, the first allocation), the takers of an open offer and which
/// of their allocations were stopped onward, the accepts or allocations that prove a lie, and the offers still live.
pub(super) struct Binding<'d> {
    pub accept: Option<&'d Value>,
    pub takers: Vec<Value>,
    pub freed: Vec<String>,
    pub forks: Vec<String>,
    pub live: Vec<&'d Value>,
    /// To yourself: a promise whose `from` and `to` both name its author, accepted when made.
    pub to_self: bool,
}

pub(super) fn status(b: &Value, word: &str) -> bool {
    ss(b, "status") == Some(word)
}

impl<'a> Deal<'a> {
    /// The deal of the promise held under `first_hash`; None when it has no stage (no such block, a word of no one's, a head that speaks
    /// for neither side).
    pub(super) fn read(first_hash: &str, index: &'a Index, options: &StageOptions) -> Option<Deal<'a>> {
        // A promise with no id is no block a fold can hold; one that rests on blocks the input lacks is not read yet.
        let first = index.get(first_hash).filter(|_| !first_hash.is_empty())?.clone();
        let alloc = allocation_of(&first, first_hash, index, options);
        let root = alloc.as_ref().map_or_else(|| first.clone(), |(o, _, _)| o.clone());
        // A fork voids what the forker claims, never what they owe (folds.md, A fork is a burden): a block of a fork still counts in a deal
        // where it binds its signer; its stops and declines, which would free its signer by their word alone, count for nothing. A block
        // a rotation voided is no word of theirs at all. The head too: a first promise whose key does not speak for its author has no stage.
        let owes = |b: &Value| crate::identity::binds_signer(b, index);
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
            owners: Default::default(),
            owed_owners: BTreeSet::new(),
        };
        deal.owed_owners = names
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
        let in_deal: Vec<Value> = causal_order_among(&sub_index(&blocks), index)
            .into_iter()
            .filter(|b| {
                let updates = type_of(b) == "promise" && rf(b, "updates").is_some() && rf(b, "answers").is_none();
                !updates
                    || rs(b, "updates").and_then(|h| index.get(h)).is_some_and(|u| speaker_of(b, index, None).is_some_and(|w| speaker_of(u, index, None).as_deref() == Some(w.as_str())))
            })
            .filter(|b| {
                hash_of(b) != first_hash
                    && (deal.side_of(b).is_some()
                        || (deal.open && !deal.by_offerer(b))
                        || (type_of(b) == "transfer" && status(b, "accepted") && speaker_of(b, index, None).is_some_and(|w| deal.owed_owners.contains(&w))))
            })
            .collect();
        deal.in_deal = in_deal;
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
    /// Answers), so an observe or a transfer that says `accepted` to a promise is no answer to it.
    pub(super) fn answers_of(&self, h: &str, word: Option<&str>) -> Vec<&Value> {
        let answered = self.index.get(h).map(type_of).unwrap_or("");
        self.in_deal
            .iter()
            .filter(|b| list(rf(b, "answers")).contains(&h) && type_of(b) == answered && word.map_or(st(b, "status").is_none(), |w| status(b, w)))
            .collect()
    }
    /// A counter keeps the deal's two sides: its own refs.from and refs.to, where it names them, are the first promise's (promises.md,
    /// A counter ends an offer only between those two).
    fn same_sides(&self, c: &Value) -> bool {
        ["from", "to"].iter().all(|k| rf(c, k).is_none_or(|_| rs(c, k).is_some_and(|v| rs(&self.root, k) == Some(v))))
    }
    /// The live offers: the first promise, or the latest counters between the same two sides, among the counters `visible` lets in (every
    /// one held, or those in an accept's causal past: an accept binds the offer that was live where it stands).
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
    /// Whether a promise names its act (promises.md, invariant 22): under the grant it acts under (live, and made for its author), it
    /// passes the door's whole authority test. A grant that is not live, or is for someone else, is no grant. One that does not give it the
    /// whole authority makes it a quote request: it binds no one. Under no grant it is its author's own word.
    pub(super) fn names_act(&self, b: &Value) -> bool {
        acting_grant(b, self.index, None).is_none() || super::names_act(b, self.index, None)
    }
    /// An autonomous system's ask is a quote request unless its grant names the act: no accept of it binds. The principal's own `accepted`
    /// answer to it (itself no quote request), or a grant that lists `promise` in scope.acts, makes it bind.
    fn quote_only(&self, offer: &Value) -> bool {
        if self.names_act(offer) {
            return false;
        }
        let principal = acting_grant(offer, self.index, None).and_then(|g| principal_of(g, self.index));
        !self.in_deal.iter().any(|b| {
            status(b, "accepted") && list(rf(b, "answers")).contains(&hash_of(offer)) && self.names_act(b) && principal.as_deref().is_some_and(|p| self.speaks(b, Some(p)))
        })
    }
    /// A deal conditioned on another deal binding (`terms.condition: { accepted: <first promise> }`, decision H17) binds only once that
    /// deal binds, read from its own stage in the same blocks (no clock: a fold). One that names nothing held, or leads back to a deal being
    /// read (`visiting`), holds for nothing.
    fn condition_binds(&self, offer: &Value, options: &StageOptions, visiting: &[String]) -> bool {
        let Some(c) = get(offer, "state.terms.condition").filter(|c| c.get("accepted").is_some()) else { return true };
        let Some(h) = c.get("accepted").and_then(Value::as_str) else { return false };
        if h == self.first_hash || visiting.iter().any(|v| v == h) {
            return false;
        }
        let mut seen: Vec<String> = visiting.to_vec();
        seen.push(self.first_hash.clone());
        binds(&promise_stage_at(h, self.index, options, &seen))
    }
    /// A referee named after the quarrel (promises.md, Disputes): a grant of kind referee one side signs naming her (`refs.to`) for the deal
    /// (`refs.subject`), which the other side answers accepted. Both signed, so she counts as a confirmer the grounds name.
    pub(super) fn judges_for(&self, sides: &[String], subject: &str) -> Vec<String> {
        let index = self.index;
        let speaks = |b: &Value| sides.iter().find(|s| self.speaks(b, Some(s.as_str()))).cloned();
        sorted_set(index
            .values()
            .filter(|g| type_of(g) == "grant" && ss(g, "kind") == Some("referee") && st(g, "status").is_none() && rs(g, "subject") == Some(subject))
            .filter(|g| crate::identity::counts_in(g, index))
            .filter(|g| {
                let Some(signer) = speaks(g) else { return false };
                index.values().any(|a| {
                    type_of(a) == "grant" && ss(a, "status") == Some("accepted") && rs(a, "answers") == Some(hash_of(g)) && crate::identity::counts_in(a, index) && speaks(a).is_some_and(|other| other != signer)
                })
            })
            .filter_map(|g| rs(g, "to")))
    }
    /// A side's disputes of a block (its counted defeats of it): a backup referee's turn starts from the receipt of one (decision E1).
    pub(super) fn disputes(&self, h: &str) -> Vec<String> {
        self.index
            .values()
            .filter(|o| list(rf(o, "defeats")).contains(&h) && crate::identity::counts_in(o, self.index) && self.side_of(o).is_some())
            .map(|o| hash_of(o).to_string())
            .collect()
    }
    /// Whether the deal's referee defeats `b`, judged on a bench between `sides` (with any referee both named for the deal, or for `also`)
    /// that `schema` names: its ruling reaches an accept or an allocation as it reaches any block (promises.md, Disputes).
    fn defeated_on(&self, schema: Option<&Value>, sides: Vec<String>, bound: &Value, also: Option<&str>, blocks: &[&Value]) -> bool {
        let mut judges = self.judges_for(&sides, &self.first_hash);
        judges.extend(also.map(|h| self.judges_for(&sides, h)).unwrap_or_default());
        let bench = bench(schema, sides, judges, Some(bound));
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

    /// What binds (stage 2): to yourself, an allocation, an accept of the live offers, or the allocations of an open offer.
    pub(super) fn bind(&self, options: &StageOptions, visiting: &[String]) -> Binding<'_> {
        let live = self.live_in(&|_| true);
        let mut b = Binding { accept: None, takers: Vec::new(), freed: Vec::new(), forks: Vec::new(), live, to_self: false };
        let from = self.from_ref.as_deref();
        // To yourself (both refs name its author: a note held by its own issuer is still a promise to its holder, not to yourself).
        b.to_self = self.alloc.is_none() && from.is_some_and(|f| !f.is_empty() && !self.is_thing(f)) && from == self.to_ref.as_deref() && speaker_of(&self.first, self.index, None).as_deref() == from;
        if let Some((_, _, taker)) = &self.alloc {
            // The allocation is the binding accept of its own deal, for this taker alone.
            b.accept = Some(&self.first);
            b.takers.push(taker.clone());
        } else if b.to_self {
            b.accept = Some(&self.first);
        } else if !self.open {
            self.bind_accept(&mut b, options, visiting);
        } else {
            self.bind_allocations(&mut b, options, visiting);
        }
        b
    }

    // Binding accepts, across every live offer. The earliest in causal order binds; two that do not see each other prove the accepter's
    // lie: neither binds, and both are listed in `forks`.
    fn bind_accept<'s>(&'s self, b: &mut Binding<'s>, options: &StageOptions, visiting: &[String]) {
        let index = self.index;
        // An author's stop before acceptance: an accept binds unless that stop is in its causal past (promises.md).
        let before_stops: Vec<&Value> = self
            .in_deal
            .iter()
            .filter(|s| type_of(s) == "promise" && status(s, "stopped") && ss(s, "stop") == Some("before") && (!self.open || self.by_offerer(s)))
            .collect();
        // The offerer acted on an accept when a counted block of the offerer's side in the deal (a delivery, an acknowledged payment, any
        // answer but a decline of it) has the accept in its causal past: then the accept did not reach them late, and their decline of it
        // voids nothing (clean round 1, promises/t6: a seller voided a paid, delivered deal months later).
        let acted_on = |a: &Value, so: Option<&'static str>| {
            self.in_deal.iter().any(|x| {
                hash_of(x) != hash_of(a) && self.side_of(x) == so && !(status(x, "declined") && list(rf(x, "answers")).contains(&hash_of(a))) && sees_in(x, hash_of(a), index)
            })
        };
        // A timely accept beats a late decline by her receipt (decision D12): the offerer's node's signed push answer listing the accept as
        // taken, dated no later than the offer's `expires`, so its later decline voids nothing.
        // An offer may name a clock instead (`terms.keepers`, blocks.md, A named clock): the accept is timely when `needed` keepers received it
        // by `expires`, though the offerer's own node never answered.
        let receipted = |a: &Value, offer: &Value| {
            let Some(expires) = get(offer, "state.terms.expires").and_then(Value::as_str) else { return false };
            let by_clock = get(offer, "state.terms.keepers").and_then(crate::tasks::keepers_of).is_some_and(|k| super::clock::received_by(hash_of(a), &k, index, expires));
            let Some(holder) = rs(offer, "author") else { return by_clock };
            let Some(until) = crate::time::parse(expires) else { return by_clock };
            by_clock
                || receipts_of(&[hash_of(a).to_string()], index, |o, node| node == holder && self.side_of(o).is_some() && self.side_of(o) == self.side_of(a))
                    .iter()
                    .any(|(_, at)| crate::time::parse(at).is_some_and(|t| t <= until))
        };
        // A referee's ruling reaches the accept too (promises.md, Disputes): an accept the deal's referee defeats binds nothing.
        let ruled_out = |a: &Value, offer: &Value| {
            let sides: Vec<String> = [self.side_at("from", a), self.side_at("to", a)].into_iter().flatten().collect();
            self.defeated_on(rs(offer, "schema").and_then(|h| index.get(h)), sides, a, None, &[a])
        };
        let mut candidates: Vec<&Value> = Vec::new();
        let offers = core::iter::once(&self.root).chain(self.in_deal.iter().filter(|o| type_of(o) == "promise" && st(o, "status").is_none()));
        for offer in offers.filter(|offer| !self.quote_only(offer)) {
            let (so, oh) = (self.side_of(offer), hash_of(offer));
            let expires = get(offer, "state.terms.expires").is_some();
            // the offer's condition does not depend on the accept: read it once per offer, when an accept first needs it (release 2: it was read per accept)
            let cond = core::cell::OnceCell::new();
            for a in self.answers_of(oh, Some("accepted")) {
                // An accept binds the offer it answers when that offer was live where the accept stands (in its causal past): a counter
                // the accepter signs elsewhere, unseen by the accept, takes back nothing it consented to (promises.md, Who may bind).
                let past = index.past_of(a);
                if !self.live_in(&|h| past.contains(h)).iter().any(|o| hash_of(o) == oh) {
                    continue;
                }
                // It binds unless it saw the author's withdrawal of that offer, or, on an offer that carried `expires`, the offerer declined
                // it (an accept that reached them late): an offer with no `expires` is firm (promises.md, Who may bind).
                if self.side_of(a).is_some()
                    && self.side_of(a) != so
                    && self.names_act(a)
                    && fits(a, offer)
                    && *cond.get_or_init(|| self.condition_binds(offer, options, visiting))
                    && !(expires && self.answers_of(hash_of(a), Some("declined")).iter().any(|d| self.side_of(d) == so) && !acted_on(a, so) && !receipted(a, offer))
                    && !before_stops.iter().any(|s| crate::grant::ending(s, oh).is_some() && sees_in(a, hash_of(s), index))
                    && !candidates.iter().any(|c| hash_of(c) == hash_of(a))
                    && !ruled_out(a, offer)
                {
                    candidates.push(a);
                }
            }
        }
        let firsts = earliest(&candidates, index);
        // Two binding accepts that do not see each other prove the accepter's lie, and a lie never frees its signer of what they owe: when
        // they consent to the same thing (one offer, one quantity), it binds, the lowest hash naming the accept only to name one; when they
        // consent to different terms, neither binds (folds.md, A promise's stage).
        let quantity_of = |a: &Value| get(a, "state.terms.quantity").map(|q| (q.get("unit").cloned(), Dec::of(q.get("value"))));
        let same_terms = firsts.windows(2).all(|w| {
            rs(w[0], "answers") == rs(w[1], "answers")
                && match (quantity_of(w[0]), quantity_of(w[1])) {
                    (None, None) => true,
                    (Some((u, Some(p))), Some((v, Some(q)))) => u == v && p.cmp(&q) == Ordering::Equal,
                    _ => false,
                }
        });
        if firsts.len() > 1 {
            b.forks = sorted_set(firsts.iter().map(|a| hash_of(a).to_string()));
        }
        // Of crossing accepts on different terms, the one the other side's act names binds (decisions D11, E2: a lie never frees the liar,
        // and the other side's own signed act says which word it took up): a counted block of the other side's in the deal, but a decline
        // of it, that names it among its refs (a delivery's `after`, any ref). Named by none, or several named, neither binds.
        let named_by_other = |a: &Value| {
            let other = match self.side_of(a) {
                Some("from") => Some("to"),
                Some("to") => Some("from"),
                _ => None,
            };
            self.in_deal.iter().any(|x| {
                hash_of(x) != hash_of(a)
                    && self.side_of(x) == other
                    && !(status(x, "declined") && list(rf(x, "answers")).contains(&hash_of(a)))
                    && x.get("refs").and_then(Value::as_object).is_some_and(|r| r.iter().any(|(k, v)| k != "author" && list(Some(v)).contains(&hash_of(a))))
            })
        };
        let acted: Vec<&Value> = firsts.iter().copied().filter(|a| named_by_other(a)).collect();
        if firsts.len() == 1 || same_terms {
            b.accept = named(&firsts);
        } else if acted.len() == 1 {
            b.accept = Some(acted[0]);
        }
    }

    // An open offer is bound by each allocation, a deal of its own (promises.md, Who may bind). A request is an accept of it by anyone but
    // its offerer, or a counter in a chain on it; an allocation is the accepted answer to a request, by the side that did not sign it, and
    // it binds a deal between the offerer and the taker on the request's own terms, its quantity counting against the offer's. Every
    // allocation the offerer signed binds the offerer (decision C2): they should form one chain, each seeing the one before, and two that
    // do not prove her lie (`forks`), yet a lie never frees the liar of what she owes: each binds its taker. Allocations that together bind
    // more than she offered are her broken promise, owed to each taker, and every taker is listed.
    fn bind_allocations<'s>(&'s self, b: &mut Binding<'s>, options: &StageOptions, visiting: &[String]) {
        let (index, first) = (self.index, &self.first);
        let is_counter = |r: &Value| st(r, "status").is_none();
        let (offerer_key, open_key) = (self.offerer_key(), if self.offerer_is_from { "to" } else { "from" });
        let condition = self.condition_binds(first, options, visiting);
        let binds_open = !self.quote_only(first) && condition;
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
                if !self.quote_only(c) && condition && keeps_sides(c, &taker) {
                    chain.push((c, taker, None));
                }
            }
        }
        let mut i = 0;
        while i < chain.len() {
            let (c, taker) = (chain[i].0, chain[i].1.clone());
            for n in self.answers_of(hash_of(c), None) {
                if type_of(n) != "promise" || chain.iter().any(|x| hash_of(x.0) == hash_of(n)) || self.quote_only(n) || !condition || !keeps_sides(n, &taker) || !answers_for(c, &taker, n) {
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
        let cap = get(first, "state.terms.quantity.max").or(get(first, "state.terms.quantity"));
        let floor = get(first, "state.terms.quantity.min");
        // A taker withdraws her request as an author withdraws an offer: an allocation binds nothing once her withdrawal is in its causal
        // past (promises.md, Who may bind).
        let withdrawn = |request: &Value, allocation: &Value| {
            self.in_deal.iter().any(|w| {
                type_of(w) == "promise" && status(w, "stopped") && ss(w, "stop") == Some("before") && rs(w, "updates") == Some(hash_of(request)) && sees_in(allocation, hash_of(w), index)
            })
        };
        // Two allocations of one side that do not see each other prove that side's lie.
        let signed_by_offerer = |h: &str| index.get(h).is_some_and(|x| self.by_offerer(x));
        for allocation in causal_order_among(&sub_index(&allocations), index) {
            let mine = self.by_offerer(&allocation);
            for t in b.takers.iter().filter(|t| signed_by_offerer(str_of(t.get("allocation"))) == mine && !sees_in(&allocation, str_of(t.get("allocation")), index)) {
                b.forks.push(str_of(t.get("allocation")).to_string());
                b.forks.push(hash_of(&allocation).to_string());
            }
            let answered = list(rf(&allocation, "answers"));
            let Some((request, taker)) = requests.iter().find(|(r, _)| answered.contains(&hash_of(r))) else { continue };
            let request = *request;
            if withdrawn(request, &allocation) {
                continue;
            }
            // A referee's ruling reaches an allocation as it reaches an accept (decision E5, one rule for every deal): an allocation, or the
            // request it answers, that the deal's referee defeats binds nothing. The bench is the schema's of the open offer (a counter's deal
            // is read by the counter's own), between its offerer and this taker, with any referee both named for the offer or for this
            // allocation's own deal.
            let sides: Vec<String> = [self.side_at(offerer_key, &allocation), taker.clone()].into_iter().flatten().collect();
            let schema = rs(if is_counter(request) { request } else { first }, "schema").and_then(|h| index.get(h));
            if self.defeated_on(schema, sides, &allocation, Some(hash_of(&allocation)), &[&allocation, request]) {
                continue;
            }
            // One request, or one chain of counters, is allocated once: a later allocation of it, when an allocation already binds it (not
            // stopped in this one's causal past), binds nothing more (promises.md, Who may bind).
            if b.takers.iter().any(|t| t.get("request").and_then(Value::as_str).and_then(|h| index.get(h)).is_some_and(|r| head(r) == head(request)) && !self.stopped_onward(t, Some(&allocation))) {
                continue;
            }
            let asked = get(request, "state.terms.quantity");
            let quantity = get(&allocation, "state.terms.quantity").or(asked).cloned();
            // An accept of a counter keeps to the counter, as any accept keeps to the offer it answers (invariant 15), and binds
            // an amount: a range is what may be chosen, never a choice.
            if is_counter(request) && !(fits(&allocation, request) && quantity.as_ref().is_none_or(|q| q.get("value").is_some())) {
                continue;
            }
            // An allocation binds a taker to no more than she asked for: where her request names a quantity, the allocation names none,
            // or one in its unit and no larger (promises.md, Who may bind).
            if let (Some(a), Some(q)) = (asked.filter(|_| !is_counter(request)), quantity.as_ref()) {
                let Some(qa) = amount_dec(Some(q), a.get("unit")) else { continue };
                if qa.cmp(&Dec::of(a.get("value")).unwrap_or_else(Dec::zero)) == Ordering::Greater {
                    continue;
                }
            }
            // On a limited offer an allocation (or its request) names a quantity in the offer's unit, or it binds nothing; on a range, no
            // less than its `min` (promises.md, Who may bind): what the offer offers is measured in its unit.
            if let Some(c) = cap {
                let Some(q) = quantity.as_ref().and_then(|q| amount_dec(Some(q), c.get("unit"))) else { continue };
                if floor.is_some_and(|m| value_in(m, c.get("unit")).is_some_and(|m| q.cmp(&m) == Ordering::Less)) {
                    continue;
                }
            }
            b.takers.push(json!({
                "who": taker, "request": hash_of(request), "allocation": hash_of(&allocation),
                "quantity": quantity.unwrap_or(Value::Null),
            }));
        }
        b.forks = sorted_set(b.forks.iter().map(String::as_str));
        // The allocations stopped onward (by either side of their deal): their quantity is freed, so the offer no longer binds it.
        b.freed = b.takers.iter().filter(|t| self.stopped_onward(t, None)).map(|t| str_of(t.get("allocation")).to_string()).collect();
        // Allocations that pass what the offer offered (taken in causal order, the stopped ones left out) are over-allocated: the offerer's
        // broken promise to those takers. An offer with lines offers each line once, whole: every allocation after the first is over.
        let lines = get(first, "state.terms.lines").is_some();
        let mut running = Dec::zero();
        let mut seen_one = false;
        let freed = b.freed.clone();
        for t in b.takers.iter_mut() {
            let over = if freed.iter().any(|f| f.as_str() == str_of(t.get("allocation"))) {
                false
            } else if lines {
                let o = seen_one;
                seen_one = true;
                o
            } else if let Some(c) = cap {
                let q = t.get("quantity").and_then(|q| amount_dec(Some(q), c.get("unit")));
                match (q, Dec::of(c.get("value"))) {
                    (Some(q), Some(limit)) => {
                        let next = running.add(&q);
                        if next.cmp(&limit) == Ordering::Greater { true } else { running = next; false }
                    }
                    _ => false,
                }
            } else {
                false
            };
            t["over_allocated"] = json!(over);
        }
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

#[allow(unused_imports)]
use same_str as _;
