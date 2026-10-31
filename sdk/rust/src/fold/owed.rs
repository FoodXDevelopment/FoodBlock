//! What is owed (promises.md, Owed): what a side of a deal is owed, handed over by a signed transfer that names the deal in `refs.what`.
//! The `to` side is owed what moves (the noun), the `from` side the price. The owner of each is read where a block stands: the fold of the
//! hand-overs in its causal past.
use super::speaker_of;
use crate::decimal::Dec;
use crate::js::{hash_of, list, rf, st, Index};
use crate::order::sees_in;
use crate::prelude::*;
use alloc::collections::BTreeMap;
use core::cell::RefCell;
use core::cmp::Ordering;

/// Who is owed what, at one place in the record.
#[derive(Clone, Default)]
pub(super) struct Owing {
    /// Who is owed what moves (None: the side names a thing, which Bearer reads, or nobody).
    pub noun: Option<String>,
    /// Who is owed how much of the price (minor units), sorted by id; zero parts are left out.
    pub price: Vec<(String, Dec)>,
    /// The hand-overs that counted, in causal order: (hash, from, to, price moved).
    pub moves: Vec<(String, String, String, Dec)>,
    /// Every hand-over that counted (of what moves, or of the price), in causal order.
    pub applied: Vec<String>,
    /// Hand-overs that did not count because one owner signed two that do not see each other.
    pub forked: Vec<String>,
}

pub(super) struct Owed<'a> {
    index: &'a Index,
    deal: String,
    accept: String,
    noun0: Option<String>,
    price0: Option<String>,
    total: Option<Dec>,
    currency: Value,
    cands: Vec<&'a Value>,
    memo: RefCell<BTreeMap<String, Owing>>,
}

impl<'a> Owed<'a> {
    /// What is owed on the deal read from its binding accept. `personal` (the bound offer's term) says it cannot be handed on: no hand-over
    /// counts. A side that names a thing is Bearer's, never read here.
    pub(super) fn new(index: &'a Index, deal: &str, accept: &str, noun0: Option<String>, price0: Option<String>, total: Option<Dec>, currency: Value, personal: bool) -> Self {
        let names = index.names_memo();
        let cands: Vec<&Value> = if personal {
            Vec::new()
        } else {
            names
                .by_what
                .get(deal)
                .into_iter()
                .flatten()
                .filter_map(|h| index.get(h))
                .filter(|t| st(t, "status").is_none() && rf(t, "to_owner").is_some() && st(t, "amount").is_none() && crate::identity::counts_in(t, index) && crate::order::sees_in(t, accept, index))
                .collect()
        };
        Owed { index, deal: deal.to_string(), accept: accept.to_string(), noun0, price0, total, currency, cands, memo: Default::default() }
    }

    /// Whether any hand-over could count: with none the deal reads exactly as it did.
    pub(super) fn active(&self) -> bool {
        !self.cands.is_empty()
    }

    fn initial(&self) -> Owing {
        let price = match (&self.price0, &self.total) {
            (Some(p), Some(t)) if t.cmp(&Dec::zero()) == Ordering::Greater => vec![(p.clone(), t.clone())],
            _ => Vec::new(),
        };
        Owing { noun: self.noun0.clone(), price, moves: Vec::new(), applied: Vec::new(), forked: Vec::new() }
    }

    fn portion(o: &Owing, who: &str) -> Dec {
        o.price.iter().find(|(w, _)| w == who).map(|(_, d)| d.clone()).unwrap_or_else(Dec::zero)
    }

    fn money_of(&self, t: &Value) -> Option<Dec> {
        let m = st(t, "money")?;
        if m.get("currency") != Some(&self.currency) {
            return Some(Dec::zero());
        }
        Dec::of(m.get("minor"))
    }

    /// What is owed as a block sees it: the hand-overs in its causal past.
    pub(super) fn seen_by(&self, b: &Value) -> Owing {
        let past = self.index.past_of(b);
        let vis = |h: &str| past.contains(h);
        self.read(&vis, &vis, &format!("seen {}", hash_of(b)))
    }

    /// What is owed once every hand-over held is read.
    pub(super) fn latest(&self) -> Owing {
        self.read(&|_| true, &|_| true, "latest")
    }

    /// The hand-overs `vis` lets in, each counting when its new owner's accept is in what `accepted_in` lets in: an owner who handed the
    /// what is owed and signs another sees it gone once the first is accepted, as the ownership fold reads a chain of transfers.
    fn read(&self, vis: &dyn Fn(&str) -> bool, accepted_in: &dyn Fn(&str) -> bool, key: &str) -> Owing {
        if !self.active() {
            return self.initial();
        }
        if let Some(o) = self.memo.borrow().get(key) {
            return o.clone();
        }
        let index = self.index;
        // a hand-over counts when the new owner accepted it and its signer was owed something where it stands
        let mut valid: Vec<(&Value, String, Owing)> = Vec::new();
        for t in self.cands.iter().copied().filter(|t| vis(hash_of(t))) {
            if !super::things::accepted_by_receiver(t, index, accepted_in) {
                continue;
            }
            if st(t, "condition").is_some_and(|c| !(super::things::condition_holds_in(t, c, index, &|x| vis(hash_of(x)), "") && !super::things::let_go(t, c, index, vis))) {
                continue;
            }
            let Some(signer) = speaker_of(t, index, None) else { continue };
            let before = self.before(t, accepted_in, key);
            let holds = if st(t, "money").is_some() { Self::portion(&before, &signer).cmp(&Dec::zero()) == Ordering::Greater } else { before.noun.as_deref() == Some(signer.as_str()) || Self::portion(&before, &signer).cmp(&Dec::zero()) == Ordering::Greater };
            if holds {
                valid.push((t, signer, before));
            }
        }
        // two by one owner that do not see each other are a fork: neither moves it
        let forked: Vec<String> = valid
            .iter()
            .filter(|(t, s, _)| valid.iter().any(|(u, w, _)| hash_of(u) != hash_of(t) && w == s && !sees_in(t, hash_of(u), index) && !sees_in(u, hash_of(t), index)))
            .map(|(t, _, _)| hash_of(t).to_string())
            .collect();
        let mut sorted: Vec<&(&Value, String, Owing)> = valid.iter().filter(|(t, _, _)| !forked.iter().any(|f| f == hash_of(t))).collect();
        sorted.sort_by(|a, b| index.past_of(a.0).len().cmp(&index.past_of(b.0).len()).then_with(|| crate::js::cmp16(hash_of(a.0), hash_of(b.0))));
        let mut out = self.initial();
        for (t, signer, before) in sorted {
            let Some(new) = list(rf(t, "to_owner")).first().map(|s| s.to_string()) else { continue };
            out.applied.push(hash_of(t).to_string());
            let amount = match self.money_of(t) {
                Some(m) => {
                    let have = Self::portion(before, signer);
                    if m.cmp(&have) == Ordering::Less { m } else { have }
                }
                None => {
                    if before.noun.as_deref() == Some(signer.as_str()) {
                        out.noun = Some(new.clone());
                    }
                    Self::portion(before, signer)
                }
            };
            if amount.cmp(&Dec::zero()) == Ordering::Greater && new != *signer {
                add(&mut out.price, signer, &Dec::zero().sub(&amount));
                add(&mut out.price, &new, &amount);
                out.moves.push((hash_of(t).to_string(), signer.clone(), new, amount));
            }
        }
        out.price.retain(|(_, d)| d.cmp(&Dec::zero()) == Ordering::Greater);
        out.price.sort_by(|a, b| a.0.cmp(&b.0));
        out.forked = forked;
        self.memo.borrow_mut().insert(key.to_string(), out.clone());
        out
    }

    /// What was owed where a hand-over stands: its causal past without it.
    fn before(&self, t: &Value, accepted_in: &dyn Fn(&str) -> bool, key: &str) -> Owing {
        let past = self.index.past_of(t);
        self.read(&|h| past.contains(h) && h != hash_of(t), accepted_in, &format!("{key} before {}", hash_of(t)))
    }

    pub(super) fn deal(&self) -> &str {
        &self.deal
    }
}

fn add(parts: &mut Vec<(String, Dec)>, who: &str, d: &Dec) {
    match parts.iter_mut().find(|(w, _)| w == who) {
        Some((_, x)) => *x = x.add(d),
        None => parts.push((who.to_string(), d.clone())),
    }
}
