//! What is to come (promises.md, Handing on a receiving place): what is to come to each side of a binding deal, handed on by a transfer that
//! names the deal in `refs.what`. What is to come to a side is a measure (folds.md, What is left): to the `to` side what moves (one whole), to
//! the `from` side the price (an amount). A hand-over is a draw on what is to come to its signer, read by the one rule: it lands on the new
//! owner's yes, and one past what is to come to her takes nothing (it is never cut down).
use super::draws::{answers, draws_on, Draw, Drawn, In, Row, Start, To};
use super::speaker_of;
use crate::decimal::{Amount, Dec, Kind};
use crate::js::{hash_of, list, rf, st, Index};
use crate::prelude::*;
use alloc::collections::BTreeMap;
use core::cell::RefCell;

/// What is to come to whom, at one place in the record.
#[derive(Clone, Default)]
pub(super) struct ToComeAt {
    /// Whom what moves is to come to (None: the side names a thing, which Bearer reads, or several, or nobody).
    pub noun: Option<String>,
    /// How much of the price is to come to whom, sorted by id; zero parts left out.
    pub price: Vec<(String, Dec)>,
    /// The hand-overs of the price that landed: (hash, from, to, amount).
    pub moves: Vec<(String, String, String, Dec)>,
    /// Every hand-over that landed (of what moves, or of the price).
    pub applied: Vec<String>,
    /// Every hand-over, as a draw on what is to come to its signer: `{ block, by, to, amount, takes, why, state }`.
    pub draws: Vec<Value>,
}

pub(super) struct ToCome<'a> {
    index: &'a Index,
    deal: String,
    accept: String,
    noun0: Option<String>,
    price0: Option<String>,
    total: Option<Dec>,
    kind: Option<Kind>,
    cands: Vec<&'a Value>,
    memo: RefCell<BTreeMap<String, ToComeAt>>,
}

impl<'a> ToCome<'a> {
    /// What is to come on the deal read from its binding accept. `kind` is the price's (`{ unit, of }`), null when nothing is priced.
    pub(super) fn new(index: &'a Index, deal: &str, accept: &str, noun0: Option<String>, price0: Option<String>, total: Option<Dec>, kind: Value) -> Self {
        let names = index.names_memo();
        let cands: Vec<&Value> = names
            .by_what
            .get(deal)
            .into_iter()
            .flatten()
            .filter_map(|h| index.get(h))
            .filter(|t| st(t, "status").is_none() && rf(t, "to_owner").is_some() && (crate::forks::counts_in(t, index) || crate::forks::fork_burden(t, index)) && crate::order::sees_in(t, accept, index))
            .collect();
        let kind = kind.get("unit").and_then(Value::as_str).map(|u| Kind { unit: u.to_string(), of: kind.get("of").and_then(Value::as_str).map(String::from) });
        ToCome { index, deal: deal.to_string(), accept: accept.to_string(), noun0, price0, total, kind, cands, memo: Default::default() }
    }

    /// Whether any hand-over could count: with none the deal reads exactly as it did.
    pub(super) fn active(&self) -> bool {
        !self.cands.is_empty()
    }

    /// What is to come as a block sees it: the hand-overs and answers in its causal past.
    pub(super) fn seen_by(&self, b: &Value) -> ToComeAt {
        let h = hash_of(b).to_string();
        let past = self.index.past_of(b);
        self.read(&format!("seen {h}"), &|x| past.contains(x))
    }

    /// What is to come once every hand-over given is read.
    pub(super) fn latest(&self) -> ToComeAt {
        self.read("latest", &|_| true)
    }

    // A side's start: the block of the deal that speaks for her (her offer, or her accept).
    fn start_of(&self, who: &str) -> String {
        [self.accept.as_str(), self.deal.as_str()]
            .into_iter()
            .find(|h| self.index.get(*h).is_some_and(|b| speaker_of(b, self.index, None).as_deref() == Some(who)))
            .unwrap_or(self.accept.as_str())
            .to_string()
    }

    fn read(&self, key: &str, seen: &dyn Fn(&str) -> bool) -> ToComeAt {
        if let Some(o) = self.memo.borrow().get(key) {
            return o.clone();
        }
        let index = self.index;
        let draws = |price: bool| -> Vec<Draw<'a>> {
            self.cands
                .iter()
                .copied()
                .filter(|t| seen(hash_of(t)))
                .filter(|t| price || st(t, "amount").is_none())
                .filter_map(|t| {
                    let to = list(rf(t, "to_owner")).first()?.to_string();
                    let (yes, no, ends) = answers(t, &to, index);
                    let keep = |v: Vec<&'a Value>| v.into_iter().filter(|b| seen(hash_of(b))).collect::<Vec<_>>();
                    let condition = st(t, "condition").map(|c| super::things::condition_holds_in(t, c, index, &|x| seen(hash_of(x)), "") && !super::things::let_go(t, c, index, seen));
                    Some(Draw { block: t, by: speaker_of(t, index, None), to: To::Owner(to), amount: if price { Amount::of(st(t, "amount")) } else { None }, yes: keep(yes), no: keep(no), ends: keep(ends), dead: st(t, "condition").and_then(|c| super::things::condition_dead_in(t, c, index, &|x| seen(hash_of(x)))), condition, fixed: None, stays: true, offer: None })
                })
                .collect()
        };
        let zero = |_: &Value, _: &str| Dec::zero();
        // what moves: one whole, to come to the `to` side
        let noun: Option<Drawn> = self.noun0.as_ref().map(|n| {
            let at = self.start_of(n);
            draws_on(In::Whole, vec![Start { owner: n.clone(), amount: None, at: Some(at.clone()), seen: at }], draws(false), &zero, index)
        });
        // the price: an amount, to come to the `from` side
        let price: Option<Drawn> = match (&self.price0, &self.total, &self.kind) {
            (Some(p), Some(t), Some(k)) if t.is_pos() => {
                let at = self.start_of(p);
                Some(draws_on(In::Kind(k), vec![Start { owner: p.clone(), amount: Some(t.clone()), at: Some(at.clone()), seen: at }], draws(true), &zero, index))
            }
            _ => None,
        };
        let mut out = ToComeAt::default();
        if let Some(n) = &noun {
            out.noun = match n.owners().as_slice() {
                [(o, _)] => Some(o.clone()),
                _ => None,
            };
        }
        if let Some(p) = &price {
            out.price = p.owners().into_iter().filter_map(|(o, a)| a.map(|a| (o, a))).collect();
            for r in p.rows.iter().filter(|r| r.state == Some("landed")) {
                if let (Some(by), To::Owner(to), Some(l)) = (&r.by, &r.to, &r.landed) {
                    out.moves.push((r.block.clone(), by.clone(), to.clone(), l.clone()));
                }
            }
        }
        // each hand-over once: the row of the measure it took from, else its reason on the price (or on what moves, with no price)
        let mut rows: BTreeMap<String, Row> = BTreeMap::new();
        for r in noun.iter().chain(price.iter()).flat_map(|d| d.rows.iter()) {
            match rows.get(&r.block) {
                Some(have) if have.takes => {}
                _ => {
                    rows.insert(r.block.clone(), r.clone());
                }
            }
        }
        let mut rows: Vec<Row> = rows.into_values().collect();
        rows.sort_by(|a, b| crate::js::cmp16(&a.block, &b.block));
        out.applied = rows.iter().filter(|r| r.state == Some("landed")).map(|r| r.block.clone()).collect();
        out.draws = rows.iter().map(|r| r.json(self.kind.as_ref())).collect();
        self.memo.borrow_mut().insert(key.to_string(), out.clone());
        out
    }
}
