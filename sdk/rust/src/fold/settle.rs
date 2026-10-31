//! Settling a deal that binds (folds.md, A promise's stage, stages 2 to 4): what was delivered, paid, refunded and worked toward its lines,
//! whether that is done, and the breach or stop that may end it. Reading which accept binds is deal.rs.
use super::bench::{bench, Bench};
use super::owed::Owed;
use super::deal::{Binding, Deal};
use super::promise::{amount_dec, disputes_shown, kind_json, measure, total_of};
use super::{holds_then, speaker_of};
use crate::decimal::Dec;
use crate::js::{get, hash_of, int, list, num, quorum, rf, rs, sorted_set, ss, st, type_of};
use crate::order::{earliest, named, sees_in};
use crate::prelude::*;
use core::cmp::Ordering;

/// One line of a deal (or the whole): what it needs, what counted transfers moved toward it, and what it comes to.
struct LineState {
    id: Value,
    needed: Option<Dec>,
    /// The least that covers the line: what is needed, or the bottom of the band.
    least: Option<Dec>,
    moved: Option<Dec>,
    total: Option<(Dec, Value)>,
}

/// What counted toward the deal: goods delivered, payments and refunds of money, work accepted, and the lines they are measured by.
struct Deeds<'v> {
    goods: Vec<&'v Value>,
    pays: Vec<&'v Value>,
    refunds: Vec<&'v Value>,
    accepted_work: Vec<&'v Value>,
    lines: Vec<Value>,
    line_state: Vec<LineState>,
    /// The price, in the first line's currency; None when nothing is priced or a price cannot be computed.
    total: Option<(Dec, Value)>,
    /// False when a price has no total (money per unit with no quantity in its unit, or a `per` of zero): it is never paid, the promise
    /// is never done, and its total is null (folds.md, stage 2).
    computable: bool,
}

/// The money that moved, exactly (core.md section 3: a float is only what a fold reports).
struct Money {
    currency: Value,
    paid: Dec,
    back: Dec,
    /// Paid in full: the view reads this, never the floats the fold reports.
    paid_up: bool,
    /// Part of the price handed to the one who owes it (promises.md, Owed): paid, with no money moved.
    setoff: Dec,
    /// Money that moved toward the price, with nothing a payee's word raised: what a payer is owed back from (folds.md, uncovered).
    sent: Dec,
}

pub(super) struct Settling<'s> {
    d: &'s Deal<'s>,
    b: &'s Binding<'s>,
    offer: &'s Value,
    accept_block: &'s Value,
    /// The deal's bench: the confirmers its schema names in its grounds, which both sides signed, and any referee both named after
    /// (decision C8). It has the last word on a block in the deal (promises.md, Disputes): a block as many of its names as are needed defeat
    /// counts for nothing, unless each changed its ruling; a block they confirm counts whatever a side says of it.
    bench: Bench<'s>,
    /// Terms that are not an object name nothing (every read of them is by key).
    terms: &'s Value,
    /// What each side is owed, and the hand-overs of it (promises.md, Owed).
    owed: Owed<'s>,
}

impl<'s> Settling<'s> {
    pub(super) fn new(d: &'s Deal<'s>, b: &'s Binding<'s>, offer: &'s Value, accept_block: &'s Value) -> Self {
        let terms = get(offer, "state.terms").unwrap_or(&Value::Null);
        let noun = |side: &str| d.side_at(side, accept_block).filter(|_| !b.to_self && !d.open).filter(|w| !d.is_thing(if side == "to" { d.to_ref.as_deref().unwrap_or("") } else { d.from_ref.as_deref().unwrap_or("") }) && !w.is_empty());
        let personal = terms.get("personal") == Some(&Value::Bool(true)) || b.to_self;
        let owed = Owed::new(d.index, &d.first_hash, hash_of(accept_block), noun("to"), noun("from"), None, Value::Null, personal);
        let mut s = Settling { d, b, offer, accept_block, terms, bench: bench(None, Vec::new(), Vec::new(), None), owed };
        // the price what is owed of the price is a part of: what the terms come to for the quantity chosen
        let price = super::promise::terms_total(terms, s.chosen().as_ref());
        let total = price.get("minor").and_then(|m| Dec::of(Some(m)));
        s.owed = Owed::new(d.index, &d.first_hash, hash_of(accept_block), noun("to"), noun("from"), total, price.get("currency").cloned().unwrap_or(Value::Null), personal);
        // The deal's schema is the bound offer's own (promises.md: once a counter binds, the deal's terms are the counter's own, whole): a
        // schema a counter left out names no confirmer and no referee. A side of the deal is never its confirmer or its referee (invariant
        // 13; clean round 1, r2: a mill named itself referee in its own schema): such a name adds nothing, and no block of a side's, or that
        // speaks for a side, confirms or rules. A name both sides signed that is tied to a side (a member of a side's circle, a role inside
        // it, an autonomous system a side runs) still counts, its tie shown in `referee_ties` (decision H9).
        let schema = rs(offer, "schema").and_then(|h| d.index.get(h));
        let sides: Vec<String> = [s.receiver("from", accept_block), s.receiver("to", accept_block)].into_iter().flatten().collect();
        s.bench = bench(schema, sides.clone(), d.judges_for(&sides, &d.first_hash), Some(accept_block));
        s
    }

    fn result(&self, stage: &str, more: Value) -> Value {
        self.d.result(self.b, self.offer, stage, more)
    }
    /// Who a side is where a block stands (a bearer note's holder then, promises.md, Bearer); an open side is the taker, or the accepter.
    fn receiver(&self, side: &str, x: &Value) -> Option<String> {
        if let Some(r) = self.d.side_at(side, x) {
            return Some(r);
        }
        let other_side = if self.d.offerer_is_from { "to" } else { "from" };
        (side == other_side)
            .then(|| self.b.takers.first().and_then(|t| t.get("who")).and_then(Value::as_str).filter(|s| !s.is_empty()).or(rs(self.accept_block, "author")).map(String::from))
            .flatten()
    }
    /// Who may answer `x` for the right of a side (promises.md, Owed): once a claim has been handed over, the owner of that right where
    /// `x` stands (the `to` side's is what moves, the `from` side's the price), whoever signed the deal; else the side as `receiver` reads it.
    fn receivers(&self, side: &str, x: &Value, a: &Value, rights: bool) -> Vec<String> {
        if rights && self.owed.active() {
            let o = self.owed.seen_by(x);
            if side == "to" {
                if let Some(n) = o.noun {
                    return vec![n];
                }
            } else if !o.price.is_empty() {
                return o.price.iter().map(|(w, _)| w.clone()).collect();
            }
        }
        self.receiver(side, a).into_iter().collect()
    }
    fn ruling(&self, x: &Value) -> Option<bool> {
        self.bench.ruling(hash_of(x), &|h| self.d.disputes(h), self.d.index)
    }
    /// Only the deal's referee changes what counts (folds.md, Defeated blocks): a block it defeats counts for nothing, unless a confirms of
    /// its own has every such defeats in its causal past. A side's defeats erases nothing: it is a fact the stage reports (`disputed`).
    fn defeated(&self, x: &Value) -> bool {
        self.ruling(x) == Some(false)
    }
    /// What settles is made `for` the deal's first promise (promises.md, Settling): a block that joined the deal another way settles nothing.
    fn made_for(&self, x: &Value) -> bool {
        list(rf(x, "for")).contains(&self.d.first_hash.as_str())
    }
    /// standing_answer(b, side): the accepted answers to a block that stand, from the side that `who` reads at each answer: the side speaks
    /// in it, the giver has not withdrawn the transfer (answer_stands), and no ruling of the bench defeats it. With `to_owner`, the block
    /// names that side as the one who owns what it moves.
    fn standing_answers(&self, x: &Value, who: &dyn Fn(&Value) -> Vec<String>, to_owner: bool) -> Vec<&Value> {
        self.d
            .answers_of(hash_of(x), Some("accepted"))
            .into_iter()
            .filter(|a| {
                who(a).iter().any(|w| self.d.speaks(a, Some(w.as_str())) && (!to_owner || list(rf(x, "to_owner")).contains(&w.as_str())))
                    && (type_of(x) != "transfer" || super::things::answer_stands(x, a, self.d.index))
                    && self.ruling(a) != Some(false)
            })
            .collect()
    }
    /// The counted confirms of a block by a name the bench names: it counts whatever a side says of it.
    fn confirmed(&self, x: &Value) -> Vec<&Value> {
        let index = self.d.index;
        index.values().filter(|o| list(rf(o, "confirms")).contains(&hash_of(x)) && crate::identity::counts_in(o, index) && self.bench.named(o, index)).collect()
    }
    fn counted(&self, x: &Value, receiver: &Option<String>) -> bool {
        !self.standing_answers(x, &|a| if self.owed.active() { self.receivers("to", x, a, true) } else { receiver.iter().cloned().collect() }, false).is_empty() || !self.confirmed(x).is_empty()
    }
    /// Whether a block names this side as the owner of what it moves.
    fn to_owner_is(x: &Value, who: &Option<String>) -> bool {
        who.as_deref().is_some_and(|w| list(rf(x, "to_owner")).contains(&w))
    }
    /// A transfer to a side counts once that side answers it accepted, the side read where its answer stands (a bearer note's holder then),
    /// or a named confirmer confirms it: either way its `to_owner` is that side.
    fn counted_to(&self, x: &Value, side: &str, rights: bool) -> bool {
        !self.standing_answers(x, &|a| self.receivers(side, x, a, rights), true).is_empty()
            || (self.receivers(side, x, x, rights).iter().any(|w| list(rf(x, "to_owner")).contains(&w.as_str())) && !self.confirmed(x).is_empty())
    }
    /// What moves (promises.md): the offer's own `refs.what`, else the first promise's (a counter need not name it again).
    fn what_moves(&self) -> Option<&Value> {
        rf(self.offer, "what").or(rf(&self.d.root, "what"))
    }
    /// The quantity chosen is an amount: the accept's, else the allocation's, else the terms'. A range is what may be chosen, not a choice:
    /// an offer to yourself with a range has chosen nothing (promises.md, Who may bind).
    fn chosen(&self) -> Option<Value> {
        let amount = |v: &&Value| v.get("value").is_some();
        get(self.accept_block, "state.terms.quantity")
            .filter(amount)
            .cloned()
            .or_else(|| self.b.takers.first().and_then(|t| t.get("quantity")).filter(amount).cloned())
            .or_else(|| self.terms.get("quantity").filter(amount).cloned())
    }

    /// A price fixed later (promises.md, Terms, `price`): None when the price is a plain number. Otherwise Some(None) while it is unfixed,
    /// Some(money) once fixed. The price names a figure: an `observe` of kind `figure` made `for` the deal, with `state.money`, signed by one
    /// of the readers `by` names, received by `deadline` on the named clock `keepers`, and inside `min` and `max` when it names them. It is
    /// fixed when `signers` different readers each signed the same figure and no other figure reached that many; a reader who signed two
    /// different figures counts for neither. The price is the figure, or `fraction` of it, rounded as a per-unit price is. Nothing is
    /// filled in: with no such figure it stays unfixed (the fold reads no clock, so a late figure never counts).
    fn fixing(&self) -> Option<Option<Value>> {
        let p = self.terms.get("price").filter(|p| p.is_object() && p.get("figure").is_some())?;
        let index = self.d.index;
        let fixed = (|| -> Option<Value> {
            let kind = p.get("figure")?.as_str()?;
            let names: Vec<String> = p.get("by")?.as_array()?.iter().filter_map(|x| x.as_str().map(String::from)).collect();
            let signers = crate::js::int(p.get("signers")).filter(|n| *n >= 1.0)? as usize;
            let deadline = p.get("deadline")?.as_str()?;
            let keepers = crate::tasks::keepers_of(p.get("keepers")?)?;
            let by = crate::tasks::Keepers { names, needed: 1 };
            let bound = |k: &str, m: &Value, want: Ordering| -> bool {
                p.get(k).is_none_or(|b| b.get("currency") == m.get("currency") && minor(m.get("minor")).cmp(&minor(b.get("minor"))) != want)
            };
            // (reader, the figure as canonical text, the figure)
            let mut votes: Vec<(String, String, &Value)> = Vec::new();
            for o in index.values().filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some(kind) && self.made_for(o) && crate::identity::counts_in(o, index)) {
                let Some(reader) = super::clock::keeper_voice(o, &by, index) else { continue };
                let Some(m) = st(o, "money").filter(|m| int(m.get("minor")).is_some_and(|n| n >= 0.0) && m.get("currency").is_some()) else { continue };
                if super::clock::received_by(hash_of(o), &keepers, index, deadline) && bound("min", m, Ordering::Less) && bound("max", m, Ordering::Greater) {
                    votes.push((reader, crate::canonical::canonical_json(m), m));
                }
            }
            votes.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
            votes.dedup_by(|b, a| a.0 == b.0 && a.1 == b.1);
            let once: Vec<&(String, String, &Value)> = votes.iter().filter(|v| votes.iter().filter(|w| w.0 == v.0).count() == 1).collect();
            let mut reached: Vec<&Value> = Vec::new();
            for v in &once {
                if once.iter().filter(|w| w.1 == v.1).count() >= signers && !reached.iter().any(|r| crate::canonical::canonical_json(r) == v.1) {
                    reached.push(v.2);
                }
            }
            let [figure] = reached.as_slice() else { return None };
            let total = match p.get("fraction") {
                Some(f) => {
                    let (f, one) = (Dec::of(Some(f))?, Dec::parse("1")?);
                    crate::decimal::per_unit(&minor(figure.get("minor")), &f, &one)?
                }
                None => minor(figure.get("minor")),
            };
            Some(json!({ "minor": total.minor_json(), "currency": figure.get("currency") }))
        })();
        Some(fixed)
    }
    /// The price the deal is read by: the plain price, or a price fixed later once it is fixed (else the method itself, which has no total).
    fn price_now(&self) -> Option<Value> {
        match self.fixing() {
            Some(Some(fixed)) => Some(fixed),
            _ => self.terms.get("price").cloned(),
        }
    }

    /// What counted toward the deal (stage 2).
    fn deeds(&self) -> Deeds<'_> {
        let (d, terms) = (self.d, self.terms);
        let index = d.index;
        // A payment `for` several promises pays each only by its split: with none, it pays none of them (things.md, Transfers).
        let transfers: Vec<&Value> = d
            .in_deal
            .iter()
            .filter(|x| type_of(x) == "transfer" && st(x, "status").is_none() && self.made_for(x) && !self.defeated(x))
            .filter(|x| !(st(x, "money").is_some() && list(rf(x, "for")).len() > 1 && !matches!(st(x, "split"), Some(Value::Array(_)))))
            .collect();
        // Each line (or the whole) is covered when counted transfers move at least its quantity of `what` to the `to` side.
        let lines: Vec<Value> = match terms.get("lines") {
            Some(Value::Array(l)) => l.clone(),
            _ => vec![json!({ "id": null, "what": self.what_moves(), "quantity": self.chosen(), "price": self.price_now() })],
        };
        // A transfer that moves no instance of any line's `what` that its giver owned is no delivery at all.
        let delivers = |x: &Value| list(rf(x, "what")).into_iter().any(|h| lines.iter().any(|l| of_line(index, h, l.get("what"))) && moved_by(index, h, x));
        let open_receiver = d.to_ref.as_deref().is_none_or(str::is_empty);
        // Goods are the giver's (the from side's) transfers: to the to side's ownership, which it accepted or a named confirmer confirmed;
        // or, to an open receiver (an allocation's deal: state.count, no to_owner), on the offerer's word alone, never a forked block's
        // (folds.md, A fork is a burden). A loan (to_holder) moves no ownership and settles no sale.
        let goods: Vec<&Value> = transfers
            .iter()
            .copied()
            .filter(|x| {
                st(x, "money").is_none()
                    && d.side_of(x) == Some("from")
                    && delivers(x)
                    && super::things::condition_stands(x, index)
                    && (self.counted_to(x, "to", true)
                        || (st(x, "count").is_some()
                            && rf(x, "to_owner").is_none()
                            && open_receiver
                            && d.by_offerer(x)
                            && d.offerer_is_from
                            && crate::identity::counts_in(x, index)))
            })
            .collect();
        // A payment counts only when it speaks for the paying side (the to side) and goes to the from side; a refund only when it speaks for
        // the from side and goes back to the to side (promises.md, Settling): no one pays, or refunds, by another's hand.
        let mut pays: Vec<&Value> = transfers.iter().copied().filter(|x| st(x, "money").is_some() && d.side_of(x) == Some("to") && self.counted_to(x, "from", true)).collect();
        // A payment in goods (promises.md, Settling): the paying side's transfer of goods it owned, `for` this deal alone, with an `amount`,
        // to the side that is paid, who accepted it. It counts toward a price of that kind, or at what the payee's accepted answer says it
        // covers (`covers`); with no such word it covers nothing of a price in another kind.
        pays.extend(transfers.iter().copied().filter(|x| {
            st(x, "money").is_none()
                && d.side_of(x) == Some("to")
                && list(rf(x, "for")).len() == 1
                && st(x, "amount").is_some()
                && !list(rf(x, "what")).is_empty()
                && list(rf(x, "what")).iter().all(|h| moved_by(index, h, x))
                && super::things::condition_stands(x, index)
                && self.counted_to(x, "from", true)
        }));
        let refunds: Vec<&Value> = transfers.iter().copied().filter(|x| st(x, "money").is_some() && d.side_of(x) == Some("from") && self.counted_to(x, "to", false)).collect();
        let to_side = self.receiver("to", self.accept_block);
        let accepted_work: Vec<&Value> = d
            .in_deal
            .iter()
            .filter(|x| {
                (type_of(x) == "transform" || (type_of(x) == "observe" && ss(x, "kind") == Some("work")))
                    && d.side_of(x).is_some()
                    && st(x, "status").is_none()
                    && self.made_for(x)
                    && !self.defeated(x)
            })
            .filter(|x| self.counted(x, &to_side))
            .collect();
        // Catch weight (promises.md, Terms): under a per-unit price, `terms.band` is how far what is delivered may fall from the quantity
        // chosen, either way, as a fraction of it. What the receiver accepted inside the band covers the line and is what is priced; outside
        // it, the quantity chosen is priced, and less than the band's bottom does not cover the line.
        let band = terms.get("band").and_then(|b| Dec::of(Some(b)));
        let line_state: Vec<LineState> = lines
            .iter()
            .map(|line| {
                let needed = line.get("quantity").filter(|q| !q.is_null()).map(|q| Dec::of(q.get("value")).unwrap_or_else(Dec::zero));
                let moved = moved_toward(index, line, &goods);
                let per_unit = get(line, "price.per").is_some() && line.get("what").is_some_and(|w| !w.is_null());
                let (least, priced) = match (&band, &needed, &moved) {
                    (Some(b), Some(n), Some(m)) if per_unit => {
                        let one = Dec::parse("1").unwrap_or_else(Dec::zero);
                        let (lo, hi) = (n.mul(&one.sub(b)), n.mul(&one.add(b)));
                        let inside = m.cmp(&lo) != Ordering::Less && m.cmp(&hi) != Ordering::Greater;
                        (Some(lo), if inside { Some(m.clone()) } else { None })
                    }
                    _ => (needed.clone(), None),
                };
                let quantity = match (&priced, line.get("quantity")) {
                    (Some(m), Some(q)) => Some(json!({ "value": m.text(), "unit": q.get("unit") })),
                    (_, q) => q.cloned(),
                };
                LineState { id: line.get("id").cloned().unwrap_or(Value::Null), needed, least, moved, total: total_of(line.get("price"), quantity.as_ref()) }
            })
            .collect();
        let computable = lines.iter().zip(&line_state).all(|(l, ls)| l.get("price").is_none_or(Value::is_null) || ls.total.is_some());
        let priced: Vec<&(Dec, Value)> = line_state.iter().filter_map(|l| l.total.as_ref()).collect();
        let total = if priced.is_empty() || !computable {
            None
        } else {
            // Money in different currencies is never added: the price's own currency is the first line's.
            let own = &priced[0].1;
            Some((priced.iter().filter(|p| &p.1 == own).fold(Dec::zero(), |t, p| t.add(&p.0)), own.clone()))
        };
        Deeds { goods, pays, refunds, accepted_work, lines, line_state, total, computable }
    }

    /// The currency a payment is made in: the price's, else the first payment's. Only that currency is counted.
    fn currency_of(&self, x: &Value) -> Value {
        match st(x, "split") {
            Some(Value::Array(parts)) => parts
                .iter()
                .find(|p| p.get("for").and_then(Value::as_str) == Some(&self.d.first_hash))
                .and_then(|p| get(p, "money.currency").cloned())
                .unwrap_or(Value::Null),
            _ => get(x, "state.money.currency").cloned().unwrap_or(Value::Null),
        }
    }
    /// What a payment with no split covers, by the word of the side it is paid to (promises.md, Settling): each of that side's accepted
    /// answers that counts it says so in `state.covers`, else it covers its own money; a payment a named confirmer counted covers its own
    /// money. Of several, her latest word in causal order counts (one that every other has in its causal past); several that do not see
    /// each other are two words of hers at once, so none says what it covers: the payment covers its own money. Never less than the money.
    fn covered(&self, x: &Value, side: &str) -> Vec<Value> {
        let answers = self.standing_answers(x, &|a| self.receivers(side, x, a, side == "from"), true);
        let own = st(x, "money").or(st(x, "amount")).cloned().unwrap_or(Value::Null);
        let latest: Vec<&&Value> = answers.iter().filter(|a| !answers.iter().any(|o| !core::ptr::eq(*o, **a) && sees_in(o, hash_of(a), self.d.index))).collect();
        match latest.as_slice() {
            [one] => vec![st(one, "covers").cloned().unwrap_or(own)],
            _ => vec![own],
        }
    }
    /// Only what is in the price's own kind counts, as paid or as paid back: money in its currency, or goods in its unit. A payment
    /// counts for what moved, and for more where the payee's accepted answer says so (`covers`, money or an amount); never in another kind
    /// unless that word says what it covers (promises.md, Settling). Nothing is converted.
    fn money_for(&self, x: &Value, side: &str, currency: &Value) -> Dec {
        match st(x, "split") {
            Some(Value::Array(parts)) => parts
                .iter()
                .filter(|p| p.get("for").and_then(Value::as_str) == Some(&self.d.first_hash))
                .filter(|p| get(p, "money.currency").unwrap_or(&Value::Null) == currency)
                .fold(Dec::zero(), |t, p| t.add(&minor(get(p, "money.minor")))),
            Some(_) => Dec::zero(),
            // Her word only raises it: what moved counts in full in its own kind, whatever `covers` says.
            None => core::iter::once(st(x, "money").or(st(x, "amount")).cloned().unwrap_or(Value::Null))
                .chain(self.covered(x, side))
                .filter_map(|m| measure(&m))
                .filter(|(_, k)| k == currency)
                .map(|(d, _)| d)
                .max_by(|a, b| a.cmp(b))
                .unwrap_or_else(Dec::zero),
        }
    }
    /// The occurrences of this deal a payment names: a lone `state.occurrence`, or in a split the `occurrence` of each part for this deal
    /// (a part with none reads the payment's own), so "£40 on the 1st for four Saturday boxes" pays four occurrences (things.md, Transfers).
    fn occurrences_of(&self, x: &Value) -> Vec<String> {
        match st(x, "split") {
            Some(Value::Array(parts)) => parts
                .iter()
                .filter(|p| p.get("for").and_then(Value::as_str) == Some(&self.d.first_hash))
                .filter_map(|p| p.get("occurrence").and_then(Value::as_str).or(ss(x, "occurrence")).map(String::from))
                .collect(),
            _ => ss(x, "occurrence").map(String::from).into_iter().collect(),
        }
    }
    /// What a payment puts toward one named occurrence: in a split only the parts that name it; otherwise as `money_for`.
    fn money_for_occurrence(&self, x: &Value, name: &str, currency: &Value) -> Dec {
        match st(x, "split") {
            Some(Value::Array(parts)) => parts
                .iter()
                .filter(|p| p.get("for").and_then(Value::as_str) == Some(&self.d.first_hash))
                .filter(|p| p.get("occurrence").and_then(Value::as_str).or(ss(x, "occurrence")) == Some(name))
                .filter(|p| get(p, "money.currency").unwrap_or(&Value::Null) == currency)
                .fold(Dec::zero(), |t, p| t.add(&minor(get(p, "money.minor")))),
            _ => self.money_for(x, "from", currency),
        }
    }
    /// What a payment sent toward this deal in the price's kind, whatever the payee's word says it covers.
    fn sent_for(&self, x: &Value, currency: &Value) -> Dec {
        match st(x, "split") {
            Some(Value::Array(parts)) => parts
                .iter()
                .filter(|p| p.get("for").and_then(Value::as_str) == Some(&self.d.first_hash))
                .filter(|p| get(p, "money.currency").unwrap_or(&Value::Null) == currency)
                .fold(Dec::zero(), |t, p| t.add(&minor(get(p, "money.minor")))),
            Some(_) => Dec::zero(),
            None => st(x, "money").or(st(x, "amount")).and_then(measure).filter(|(_, k)| k == currency).map_or_else(Dec::zero, |(d, _)| d),
        }
    }
    fn money(&self, deeds: &Deeds) -> Money {
        // The currency the promise is paid in: the price's; with no price, the one currency every counted payment covers (several: none).
        let mut paid_currencies: Vec<Value> = Vec::new();
        for x in &deeds.pays {
            let mine: Vec<Value> = match st(x, "split") {
                Some(Value::Array(_)) => vec![self.currency_of(x)],
                _ => self.covered(x, "from").iter().map(|m| measure(m).map_or(Value::Null, |(_, k)| k)).collect(),
            };
            for c in mine {
                if !paid_currencies.contains(&c) {
                    paid_currencies.push(c);
                }
            }
        }
        let currency = match deeds.total.as_ref().map(|(_, c)| c.clone()).filter(|c| !c.is_null()) {
            Some(c) => c,
            None if paid_currencies.len() == 1 => paid_currencies[0].clone(),
            None => Value::Null,
        };
        let sent = deeds.pays.iter().fold(Dec::zero(), |t, x| t.add(&self.sent_for(x, &currency)));
        // a part of the price handed to the one who owes it is paid
        let setoff = match (self.owed.active(), self.receiver("to", self.accept_block)) {
            (true, Some(payer)) => self.owed.latest().price.iter().find(|(w, _)| *w == payer).map(|(_, d)| d.clone()).unwrap_or_else(Dec::zero),
            _ => Dec::zero(),
        };
        let paid = deeds.pays.iter().fold(Dec::zero(), |t, x| t.add(&self.money_for(x, "from", &currency))).add(&setoff);
        let back = deeds.refunds.iter().fold(Dec::zero(), |t, x| t.add(&self.money_for(x, "to", &currency)));
        let paid_up = deeds.computable && deeds.total.as_ref().is_none_or(|t| paid.cmp(&t.0) != Ordering::Less);
        Money { currency, paid, back, paid_up, setoff, sent }
    }
    /// When a payment was counted: the first of the dates the paid side gave its counting answers (or a named confirmer its confirms).
    fn counted_at(&self, x: &Value) -> Option<String> {
        let r = self.receivers("from", x, x, true);
        let confirms = self.confirmed(x).into_iter().filter(|_| r.iter().any(|w| Self::to_owner_is(x, &Some(w.clone()))));
        let mut dates: Vec<String> = self.standing_answers(x, &|a| self.receivers("from", x, a, true), true).into_iter().chain(confirms).filter_map(|o| ss(o, "at").map(String::from)).collect();
        dates.sort();
        dates.into_iter().next()
    }
    /// The latest date any of these payments was counted.
    fn latest_counted(&self, pays: &[&Value]) -> Value {
        pays.iter().filter_map(|x| self.counted_at(x)).max().map_or(Value::Null, Value::String)
    }
    /// The same, with the parts of the price handed to the one who owes it (dated by the owner's accept of the hand-over).
    fn latest_paid(&self, pays: &[&Value], money: &Money) -> Value {
        // a part of the price handed to the one who owes it is dated by the owner's accept of the hand-over
        let handed: Vec<String> = if money.setoff.cmp(&Dec::zero()) == Ordering::Greater {
            let payer = self.receiver("to", self.accept_block);
            self.owed.latest().moves.iter().filter(|m| Some(&m.2) == payer.as_ref()).filter_map(|m| self.move_date(&m.0)).collect()
        } else {
            Vec::new()
        };
        pays.iter().filter_map(|x| self.counted_at(x)).chain(handed).max().map_or(Value::Null, Value::String)
    }
    /// When a hand-over of what is owed was accepted: the first date among its owner's accepting answers.
    fn move_date(&self, t: &str) -> Option<String> {
        let index = self.d.index;
        index.values().filter(|a| type_of(a) == "transfer" && ss(a, "status") == Some("accepted") && list(rf(a, "answers")).contains(&t)).filter_map(|a| ss(a, "at").map(String::from)).min()
    }

    /// A standing promise is due and paid occurrence by occurrence (decisions D16, E4): its one `pay_by` and one occurrence's price are never
    /// read as the whole, so the stage reports no `due` and no `paid_at`, and `paid` is all that was paid in the deal. A payment names the
    /// occurrence it pays (`state.occurrence`: its start time, or the hash of the observe that started it), and `occurrences` reports each
    /// one a payment names or an event started: when it fell due (a start time is its own due; an event's is its observe's `at` plus the
    /// repeat's `wait`), what was paid for it, and, once that covers one occurrence's price, the latest date among its payments.
    fn occurrences(&self, repeat: &Value, deeds: &Deeds, money: &Money) -> Vec<Value> {
        let index = self.d.index;
        let wait = repeat.get("wait").and_then(Value::as_str);
        let kind = repeat.get("after").and_then(Value::as_str);
        // an event `when` (promises.md, Relative time) has no `by`: only the receiving side's ask counts, the holder as Bearer reads it
        let by: Vec<&str> = repeat.get("by").and_then(Value::as_array).map(|b| b.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
        let holder_only = repeat.get("by").is_none() && get(self.offer, "state.when").is_some_and(|w| w == repeat);
        // an event occurrence: a counted observe of the kind the repeat's `after` names, made for the promise, by a side or a signer the
        // repeat's `by` names
        let events: Vec<&Value> = if kind.is_some() {
            index
                .values()
                .filter(|o| type_of(o) == "observe" && ss(o, "kind") == kind && self.made_for(o) && crate::identity::counts_in(o, index))
                .filter(|o| {
                    if holder_only {
                        return self.d.side_of(o) == Some("to");
                    }
                    // The side that charges cannot start a charge alone (promises.md, Terms: repeat): a payer who signed "each crossing the
                    // gate sensor records" consented to that count, not to the payee's own word. When `by` is given only the names in it start
                    // occurrences (a side counts only if it names itself); with no `by`, nothing starts one (nothing fills the sides' silence).
                    let named = rs(o, "author").is_some_and(|a| by.iter().any(|n| *n == a || (n.contains('#') && holds_then(o, n, index).is_some_and(|ids| ids.iter().any(|h| h == a)))))
                        || rs(o, "as").is_some_and(|c| by.contains(&c));
                    named
                })
                .collect()
        } else {
            Vec::new()
        };
        // The wait runs from the clock's receipt of the event, never from the event's own `at` (blocks.md, A named clock): the promise's
        // `keepers`, and no one else: with none named there is no clock (nothing fills the sides' silence). With no receipt the wait has not begun:
        // the occurrence is named, due null.
        let keepers = self.terms.get("keepers").and_then(crate::tasks::keepers_of);
        let names = sorted_set(deeds.pays.iter().flat_map(|x| self.occurrences_of(x)).chain(events.iter().map(|o| hash_of(o).to_string())));
        names
            .iter()
            .map(|name| {
                let due: Value = match events.iter().find(|o| hash_of(o) == name.as_str()) {
                    Some(o) => match (keepers.as_ref().and_then(|k| super::clock::received_at(hash_of(o), k, index)), wait) {
                        (Some(at), Some(w)) => crate::time::add_duration(&at, w, 1).map_or(Value::Null, Value::String),
                        (Some(at), None) => json!(at),
                        _ => Value::Null,
                    },
                    None if crate::time::is_time(Some(&Value::String(name.clone()))) => json!(name),
                    None => Value::Null,
                };
                let mine: Vec<&Value> = deeds.pays.iter().copied().filter(|x| self.occurrences_of(x).contains(name)).collect();
                let sum = mine.iter().fold(Dec::zero(), |t, x| t.add(&self.money_for_occurrence(x, name, &money.currency)));
                let paid = if mine.is_empty() || (deeds.total.is_none() && money.currency.is_null()) { Value::Null } else { kind_json(&sum, &money.currency) };
                let covered = deeds.total.as_ref().is_some_and(|t| sum.cmp(&t.0) != Ordering::Less) && sum.cmp(&Dec::zero()) == Ordering::Greater;
                json!({ "occurrence": name, "due": due, "paid": paid, "paid_at": if covered { self.latest_counted(&mine) } else { Value::Null } })
            })
            .collect()
    }

    /// The settled deal's stage: reversed, done, breached, stopped onward, underway or accepted.
    pub(super) fn settle(&self, stops: &[&Value]) -> Value {
        let (d, terms, offer) = (self.d, self.terms, self.offer);
        let index = d.index;
        let deeds = self.deeds();
        let money = self.money(&deeds);
        let zero = Dec::zero();
        let chosen = self.chosen();
        let offer_what = self.what_moves().is_some();
        let goods_done = deeds.lines.iter().zip(&deeds.line_state).all(|(line, ls)| {
            line.get("what").is_none_or(Value::is_null)
                || match (&ls.least, &ls.moved) {
                    (_, None) => true,
                    (None, Some(m)) => m.cmp(&zero) == Ordering::Greater,
                    (Some(n), Some(m)) => m.cmp(n) != Ordering::Less,
                }
        });
        // A job or time promise is done when accepted work covers the quantity accepted (not the offer's range); one accepted work block
        // is enough when none was chosen (folds.md, stage 2).
        let work_done = if let Some(q) = chosen.as_ref().filter(|_| !offer_what) {
            deeds.accepted_work.iter().filter_map(|x| amount_dec(st(x, "amount"), q.get("unit"))).fold(Dec::zero(), |t, a| t.add(&a)).cmp(&minor(q.get("value"))) != Ordering::Less
        } else {
            !deeds.accepted_work.is_empty()
        };
        // A promise not to do something moves nothing: the fold never reads it as done (its until passing is the view's), and a counted
        // defeats of it, by the side it was made to or a confirmer the schema names, breaks it (promises.md, Refrain). A standing promise
        // (a repeat) is done occurrence by occurrence, never as a whole: it stays underway until a stop or a close ends it (folds.md, stage 2).
        let refrain = terms.get("refrain") == Some(&Value::Bool(true));
        // A repeat, or a `when` that follows an event (promises.md, Relative time), has its occurrences. A relative `when` that names a block is
        // read by the `due` view, never here.
        let repeat = terms.get("repeat");
        let event_when = get(offer, "state.when").filter(|w| w.get("after").and_then(Value::as_str).is_some_and(|a| !crate::spec().is("id", a)) && w.get("wait").is_some());
        let done = !refrain && repeat.is_none() && goods_done && money.paid_up && (offer_what || terms.get("lines").is_some() || work_done);
        let stopped_occurrences = sorted_set(stops.iter().filter_map(|s| get(s, "state.stop.occurrences")).filter_map(Value::as_array).flatten().filter_map(Value::as_str).map(String::from));
        // `paid` is null until a payment is counted, and when, with no price, the payments cover more than one currency; it carries the
        // price's currency, else the one the payments cover.
        let set_off = money.setoff.cmp(&zero) == Ordering::Greater;
        let paid_json = if (!deeds.pays.is_empty() || set_off) && (deeds.total.is_some() || !money.currency.is_null()) { kind_json(&money.paid, &money.currency) } else { Value::Null };
        let occurrences = repeat.or(event_when).map_or(Vec::new(), |r| self.occurrences(r, &deeds, &money));
        // When the price was paid in full: the latest of the dates the paid side gave its counting answers, each payment dated by the first.
        // A fact, as `due` is (`terms.pay_by`): lateness is each reader's judgement.
        let paid_at = if repeat.is_none() && money.paid_up && deeds.total.is_some() && (!deeds.pays.is_empty() || set_off) && money.paid.cmp(&zero) == Ordering::Greater { self.latest_paid(&deeds.pays, &money) } else { Value::Null };
        let heads_of_deal = [d.first_hash.as_str(), hash_of(&d.root), hash_of(offer)];
        let disputed = disputes_shown(index, &d.in_deal, &heads_of_deal, &|x| d.side_of(x));
        let mut more = json!({
            "quantity": chosen,
            "total": deeds.total.as_ref().map(|(m, c)| kind_json(m, c)),
            "paid": paid_json,
            // A promise that moves nothing (a job, time, money alone: no `what`, no `lines`) has no line to report.
            "lines": if offer_what || terms.get("lines").is_some() { deeds.line_state.iter().map(|l| json!({
                "id": l.id, "needed": l.needed.as_ref().map(|n| num(n.to_f64())),
                "moved": match (&l.moved, &l.needed) {
                    // capped at what is needed when a whole instance covers the line
                    (None, n) => n.as_ref().map(|n| num(n.to_f64())).unwrap_or(Value::Null),
                    (Some(m), _) => num(m.to_f64()),
                },
            })).collect::<Vec<_>>() } else { Vec::new() },
            "stopped": stopped_occurrences,
            "disputed": disputed,
            "due": if repeat.is_some() { Value::Null } else { terms.get("pay_by").cloned().unwrap_or(Value::Null) },
            "paid_at": paid_at,
            "occurrences": occurrences,
            "referee_ties": self.bench.ties(&[("from", self.receiver("from", self.accept_block)), ("to", self.receiver("to", self.accept_block))], index),
            "paid_up": money.paid_up,
        });
        let over = d.alloc.is_some() && self.b.takers.first().and_then(|t| t.get("over_allocated")).and_then(Value::as_bool) == Some(true);
        more["over_allocated"] = json!(over);
        more["owed"] = self.owed_json(&money);
        more["price_fixed"] = self.fixing().map_or(Value::Null, |f| json!(f.is_some()));
        more["owed_on"] = Value::Array(self.owed_on(&deeds));
        more["received_at"] = Value::Array(self.received_at_json());
        more["moved"] = Value::Array(self.moved_json());
        let uncovered = self.uncovered(&deeds, &money);
        let paid_back = money.paid.cmp(&zero) == Ordering::Greater && money.back.cmp(&money.paid) != Ordering::Less;
        // Reversed: a done promise with counted transfers back for it covering what was paid.
        if done && paid_back {
            return self.result("reversed", more);
        }
        if done {
            return self.result("done", more);
        }
        if refrain {
            if let Some(breach) = self.breach(terms) {
                if let Some(from) = breach {
                    more["from"] = json!(from);
                }
                more["uncovered"] = uncovered;
                return self.result("breached", more);
            }
            // A refrain not breached whose price is paid and paid back is reversed: neither kept nor broken (folds.md, stage 3).
            if paid_back {
                return self.result("reversed", more);
            }
        }
        // 4. Stopped onward, from that block: the first onward stop in causal order (of several that do not see each other, the lowest
        // hash, only to name one). When the first stops that do not see each other speak for both sides, `by` is both: no hash decides it.
        // A death ends no promise (profiles/successor.md): only a stop does.
        let onward: Vec<&Value> = stops.iter().copied().filter(|s| ss(s, "stop") == Some("onward")).collect();
        let firsts = earliest(&onward, index);
        if let Some(first) = named(&firsts) {
            let crossing = ["from", "to"].iter().all(|sd| firsts.iter().any(|f| d.side_of(f) == Some(*sd)));
            more["stop"] = json!("onward");
            more["from"] = json!(hash_of(first));
            more["by"] = if crossing { json!("both") } else { json!(self.ended_by(first)) };
            more["uncovered"] = uncovered;
            return self.result("stopped", more);
        }
        if over {
            more["uncovered"] = uncovered;
        }
        self.result(if !deeds.goods.is_empty() || !deeds.pays.is_empty() || !deeds.accepted_work.is_empty() { "underway" } else { "accepted" }, more)
    }

    /// A new date both sides signed (promises.md, Terms: pay_by): a side's `observe` of kind `message` `for` the deal with a `pay_by`, answered
    /// `accepted` by an observe of the other side. The agreed dates in the order the answers stand in causal order (ties by hash, only to name
    /// one); the first promise's own `pay_by` stays, and a date only one side signed moves nothing: `[{ pay_by, proposal, answer }]`.
    fn moved_json(&self) -> Vec<Value> {
        let index = self.d.index;
        let mut out: Vec<(usize, String, Value)> = Vec::new();
        for p in index.values().filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("message") && self.made_for(o) && crate::time::is_time(st(o, "pay_by")) && crate::identity::counts_in(o, index)) {
            let Some(side) = self.d.side_of(p) else { continue };
            for a in self.d.answers_of(hash_of(p), Some("accepted")) {
                if self.d.side_of(a).is_some_and(|s| s != side) {
                    out.push((index.past_of(a).len(), hash_of(a).to_string(), json!({ "pay_by": st(p, "pay_by"), "proposal": hash_of(p), "answer": hash_of(a) })));
                }
            }
        }
        out.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| crate::js::cmp16(&a.1, &b.1)));
        out.into_iter().map(|(_, _, v)| v).collect()
    }

    /// A message with a receipt (promises.md, Settling): each counted `observe` of kind `message` a side wrote `for` the deal, with the time the
    /// named clock received it: the promise's `keepers`, and no one else's receipt. Null while there is no clock or no receipt. A message that
    /// reached the other side is what "knowing" rests on, read from the receipt alone.
    fn received_at_json(&self) -> Vec<Value> {
        let index = self.d.index;
        let named = self.terms.get("keepers").and_then(crate::tasks::keepers_of);
        let mut out: Vec<(String, Value)> = Vec::new();
        for o in index.values().filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("message") && self.made_for(o) && crate::identity::counts_in(o, index)) {
            let Some(side) = self.d.side_of(o) else { continue };
            let at = named.as_ref().and_then(|k| super::clock::received_at(hash_of(o), k, index));
            out.push((hash_of(o).to_string(), json!({ "message": hash_of(o), "side": side, "at": at })));
        }
        out.sort_by(|a, b| crate::js::cmp16(&a.0, &b.0));
        out.into_iter().map(|(_, v)| v).collect()
    }

    /// What is owed, and by the hand-overs of it (promises.md, Owed): null until one counted.
    fn owed_json(&self, money: &Money) -> Value {
        if !self.owed.active() {
            return Value::Null;
        }
        let o = self.owed.latest();
        if o.applied.is_empty() && o.forked.is_empty() {
            return Value::Null;
        }
        let from: Vec<Value> = o.price.iter().map(|(w, d)| json!({ "owner": w, "money": { "minor": d.minor_json(), "currency": money.currency } })).collect();
        let mut forked = o.forked.clone();
        forked.sort();
        json!({ "to": o.noun, "from": from, "forked": forked })
    }
    /// A payment made to an owner who had already handed that part of what is owed on, without seeing it, counts; the old owner holds that
    /// amount for the new one (promises.md, Owed): `[{ from, to, money, payment }]`.
    fn owed_on(&self, deeds: &Deeds) -> Vec<Value> {
        if !self.owed.active() {
            return Vec::new();
        }
        let index = self.d.index;
        let o = self.owed.latest();
        let mut out: Vec<(String, String, Value)> = Vec::new();
        for x in &deeds.pays {
            let owners = self.owed.seen_by(x).price;
            let Some(owner) = list(rf(x, "to_owner")).into_iter().find(|w| owners.iter().any(|(p, _)| p == w)) else { continue };
            let currency = get(x, "state.money.currency").cloned().unwrap_or(Value::Null);
            let mut left = self.sent_for(x, &currency);
            for (th, from, to, amount) in &o.moves {
                if from != owner || index.get(th).is_some_and(|t| sees_in(x, hash_of(t), index)) {
                    continue;
                }
                let held = if left.cmp(amount) == Ordering::Less { left.clone() } else { amount.clone() };
                if held.cmp(&Dec::zero()) == Ordering::Greater {
                    out.push((hash_of(x).to_string(), to.clone(), json!({ "from": owner, "to": to, "money": { "minor": held.minor_json(), "currency": currency }, "payment": hash_of(x) })));
                    left = left.sub(&held);
                }
            }
        }
        out.sort_by(|a, b| crate::js::cmp16(&a.0, &b.0).then_with(|| a.1.cmp(&b.1)));
        out.into_iter().map(|(_, _, v)| v).collect()
    }
    /// What was paid for the deal and never covered by what moved (folds.md, Uncovered): the money sent, less what was paid back, less the
    /// price of what moved, less what the terms say is kept (`forfeit`). A claim of the payer's, shown as a fact; null when nothing was sent.
    /// The price of what moved is prorated only by a signed per-unit price or a line's price; on a flat price for a whole, nothing is
    /// covered until the whole moves.
    fn uncovered(&self, deeds: &Deeds, money: &Money) -> Value {
        let zero = Dec::zero();
        if money.currency.is_null() || money.sent.cmp(&zero) != Ordering::Greater {
            return Value::Null;
        }
        let refrain = self.terms.get("refrain") == Some(&Value::Bool(true));
        // accepted work of the observe kind `work` only (the oracle's `works`): enough of what was chosen, else any
        let works: Vec<&&Value> = deeds.accepted_work.iter().filter(|x| type_of(x) == "observe").collect();
        let work_done_u = match self.chosen() {
            Some(q) => works.iter().filter_map(|x| amount_dec(st(x, "amount"), q.get("unit"))).fold(Dec::zero(), |t, a| t.add(&a)).cmp(&minor(q.get("value"))) != Ordering::Less,
            None => !works.is_empty(),
        };
        let mut value = Dec::zero();
        if !refrain {
            if self.what_moves().is_some() || self.terms.get("lines").is_some() {
                for (line, ls) in deeds.lines.iter().zip(&deeds.line_state) {
                    let Some((full, cur)) = ls.total.as_ref() else { continue };
                    if *cur != money.currency || line.get("what").is_none_or(Value::is_null) {
                        continue;
                    }
                    let per_unit = get(line, "price.per").is_some();
                    value = value.add(&match (&ls.least, &ls.moved) {
                        (_, None) => full.clone(),
                        (None, Some(m)) => if m.cmp(&zero) == Ordering::Greater { full.clone() } else { Dec::zero() },
                        (Some(n), Some(m)) if m.cmp(n) != Ordering::Less => full.clone(),
                        (Some(_), Some(m)) if per_unit => {
                            let q = json!({ "value": m.text(), "unit": get(line, "quantity.unit") });
                            total_of(line.get("price"), Some(&q)).filter(|(_, c)| c == &money.currency).map_or_else(Dec::zero, |(d, _)| d)
                        }
                        // A flat price for a whole: nothing is covered until the whole moves, except what the payer's own accepted answer to a
                        // delivery says it covers (promises.md, Settling): her word lowers only what she is owed back, never what the payee is owed.
                        _ => {
                            let said = self.stated_cover(&deeds.goods, line, &money.currency);
                            if said.cmp(full) == Ordering::Greater { full.clone() } else { said }
                        }
                    });
                }
            } else if let Some(price) = self.terms.get("price").filter(|_| get(self.terms, "price.per").is_some()) {
                // a job or time promise at a price per unit: the accepted work, in that unit
                let unit = get(price, "per.unit");
                let worked = deeds.accepted_work.iter().filter(|x| type_of(x) == "observe").filter_map(|x| amount_dec(st(x, "amount"), unit)).fold(Dec::zero(), |t, a| t.add(&a));
                let q = json!({ "value": worked.text(), "unit": unit });
                value = total_of(Some(price), Some(&q)).filter(|(_, c)| c == &money.currency).map_or_else(Dec::zero, |(d, _)| d);
            } else if work_done_u {
                value = deeds.total.as_ref().filter(|(_, c)| *c == money.currency).map_or_else(Dec::zero, |(d, _)| d.clone());
            }
        }
        let kept = get(self.terms, "forfeit").filter(|m| m.get("currency") == Some(&money.currency)).map_or_else(Dec::zero, |m| minor(m.get("minor")));
        let mut left = money.sent.sub(&money.back).sub(&value).sub(&kept);
        if left.cmp(&zero) != Ordering::Greater {
            left = Dec::zero();
        }
        kind_json(&left, &money.currency)
    }

    /// What the payer's accepted answers to the deliveries toward this line say they cover of a flat price, in the price's kind (`covers`, money).
    fn stated_cover(&self, goods: &[&Value], line: &Value, currency: &Value) -> Dec {
        let (index, id) = (self.d.index, line.get("id").and_then(Value::as_str));
        let mut sum = Dec::zero();
        for x in goods.iter().filter(|x| id.is_none_or(|i| ss(x, "line") == Some(i))) {
            if !list(rf(x, "what")).into_iter().any(|h| of_line(index, h, line.get("what")) && moved_by(index, h, x)) {
                continue;
            }
            let said = self.covered(x, "to").iter().filter_map(measure).filter(|(_, k)| k == currency).map(|(d, _)| d).max_by(|a, b| a.cmp(b));
            if let Some(d) = said {
                sum = sum.add(&d);
            }
        }
        sum
    }

    /// Which side ended it (folds.md, stage 4): the side the stop speaks for, or "both" when a counted block of the other side confirms the
    /// stop. Only an explicit confirm agrees: a later stop of their own is not agreement.
    fn ended_by(&self, stop: &Value) -> Option<&'static str> {
        let index = self.d.index;
        self.d.side_of(stop).map(|side| {
            let other = if side == "from" { "to" } else { "from" };
            let agreed = index.values().any(|c| list(rf(c, "confirms")).contains(&hash_of(stop)) && crate::identity::counts_in(c, index) && self.d.side_of(c) == Some(other));
            if agreed { "both" } else { side }
        })
    }

    /// Breached: a refrain the deal's referee (a confirmer its schema names) says was broken within its term: a counted defeats of the deal's
    /// head (its first promise, or the offer accepted) saying it happened (its `when`, else its `at`) at or before `until`, and not taken
    /// back by the referee (it defeats that defeats). Or its own condition, a signal, holds at its `until`: the signers it names say so. The
    /// side it was made to only disputes (promises.md, Refrain). Some(Some(hash)) names the lowest-hash breach; Some(None) is a signal.
    fn breach(&self, terms: &Value) -> Option<Option<String>> {
        let (d, bench, index) = (self.d, &self.bench, self.d.index);
        let until = terms.get("until").and_then(Value::as_str);
        let heads = [d.first_hash.as_str(), hash_of(self.offer)];
        let happened = |o: &Value| -> Option<String> {
            match st(o, "when") {
                Some(Value::String(t)) => Some(t.clone()),
                Some(Value::Object(m)) if m.get("from").is_some_and(Value::is_string) => m.get("from").and_then(Value::as_str).map(String::from),
                _ => ss(o, "at").map(String::from),
            }
        };
        // Each name's breaches: its defeats of the head within the term that it has not taken back itself. As many names as are needed breach
        // it (a chain: the first name in turn that has).
        let breaches_by = |n: &String, since: Option<i64>| -> Vec<String> {
            index
                .values()
                .filter(|o| {
                    list(rf(o, "defeats")).iter().any(|h| heads.contains(h))
                        && bench.speaks_for(o, n, index)
                        && since.is_none_or(|t| ss(o, "at").and_then(crate::time::parse).is_some_and(|at| at >= t))
                        && matches!((happened(o), until), (Some(at), Some(u)) if at.as_str() <= u)
                        && bench.voice(n, hash_of(o), index) != Some(false)
                })
                .map(|o| hash_of(o).to_string())
                .collect()
        };
        let head_disputes = |_: &str| -> Vec<String> { heads.iter().flat_map(|h| d.disputes(h)).collect() };
        let by_name: Vec<Vec<String>> = bench.turn(&d.first_hash, &head_disputes, index).into_iter().map(|(n, since)| breaches_by(n, since)).filter(|b| !b.is_empty()).collect();
        let enough = if bench.wait.is_some() { !by_name.is_empty() } else { quorum(0..by_name.len(), bench.needed) };
        let mut breaches: Vec<String> = if enough { by_name.into_iter().flatten().collect() } else { Vec::new() };
        breaches.sort();
        if let Some(b) = breaches.into_iter().next() {
            return Some(Some(b));
        }
        let signalled = terms.get("condition").filter(|c| c.get("signal").is_some()).zip(until).is_some_and(|(c, u)| {
            let held: Vec<Value> = index.values().cloned().collect();
            crate::tasks::condition_holds(c, &held, u) == Some(true)
        });
        signalled.then_some(None)
    }
}

fn minor(v: Option<&Value>) -> Dec {
    Dec::of(v).unwrap_or_else(Dec::zero)
}

// A goods transfer moves an instance toward a line only when the instance is of the line's `what` (the thing itself, or one whose `refs.of`
// names it) and its giver owned it where the transfer stands (the ownership fold of the transfer's causal past: no one settles a deal with
// what is not theirs to give). Each whole instance counts once toward a line (things.md, Transfers).
fn of_line(index: &crate::js::Index, h: &str, what: Option<&Value>) -> bool {
    let whats = list(what);
    index.get(h).is_some_and(|t| type_of(t) == "thing" && (whats.contains(&h) || list(rf(t, "of")).iter().any(|k| whats.contains(k))))
}
fn moved_by(index: &crate::js::Index, h: &str, x: &Value) -> bool {
    speaker_of(x, index, None).is_some_and(|giver| super::things::owner_seen_by(h, x, index).as_deref() == Some(giver.as_str()))
}
// How much of a line counted transfers moved, exactly, in the line's unit; None when a whole instance (a transfer with no amount and no pack)
// covers it, or when the line has no quantity and a counted transfer of it exists. An amount or a pack in another unit moves nothing
// (folds.md, stage 2).
fn moved_toward(index: &crate::js::Index, line: &Value, goods: &[&Value]) -> Option<Dec> {
    let id = line.get("id").and_then(Value::as_str);
    let unit = get(line, "quantity.unit");
    let mut sum = Dec::zero();
    let (mut whole, mut any) = (false, false);
    let mut counted_once: alloc::collections::BTreeSet<&str> = Default::default();
    for x in goods.iter().filter(|x| id.is_none_or(|i| ss(x, "line") == Some(i))) {
        let instances: Vec<&str> = list(rf(x, "what")).into_iter().filter(|h| of_line(index, h, line.get("what")) && moved_by(index, h, x)).collect();
        if instances.is_empty() {
            continue;
        }
        if st(x, "amount").is_some() {
            any = true;
            if let Some(a) = amount_dec(st(x, "amount"), unit) {
                sum = sum.add(&a);
            }
            continue;
        }
        let fresh: Vec<&str> = instances.into_iter().filter(|h| counted_once.insert(h)).collect();
        if fresh.is_empty() {
            continue;
        }
        any = true;
        let packs: Vec<&Value> = fresh.iter().filter_map(|h| index.get(*h).and_then(|t| st(t, "pack"))).collect();
        if packs.is_empty() {
            whole = true;
        }
        for p in packs {
            if let Some(a) = amount_dec(Some(p), unit) {
                sum = sum.add(&a);
            }
        }
    }
    if whole || (any && line.get("quantity").is_none_or(Value::is_null)) { None } else { Some(sum) }
}
