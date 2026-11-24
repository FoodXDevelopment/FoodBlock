//! Settling a deal that binds (folds.md, A promise's stage, stages 2 to 4): what was delivered, paid, refunded and worked toward its lines,
//! whether that is done, and the stop that may end it. Reading which accept binds is deal.rs.
use super::bench::{bench, Bench};
use super::to_come::ToCome;
use super::deal::{Binding, Deal};
use super::promise::{amount_dec, disputes_shown, kind_json, kind_of, measure, total_of};
use crate::js::{lines_of, quantity_of};
use crate::decimal::Dec;
use crate::js::{get, hash_of, list, rf, rs, sorted_set, ss, st, type_of};
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

/// What counted toward the deal: goods delivered, payments and refunds of price, work accepted, and the lines they are measured by.
struct Deeds<'v> {
    goods: Vec<&'v Value>,
    pays: Vec<&'v Value>,
    refunds: Vec<&'v Value>,
    accepted_work: Vec<&'v Value>,
    lines: Vec<Value>,
    line_state: Vec<LineState>,
    /// What the price comes to, in its kind; None when nothing is priced, a price cannot be computed, or lines are priced in two kinds.
    total: Option<(Dec, Value)>,
    /// False when a price has no total (a per-unit price with no quantity in `per`'s unit, or a `per` of zero): it is never paid, the
    /// promise is never done, and its total is null (folds.md, A promise's stage).
    computable: bool,
    /// The receivers' own words that this much came (folds.md, What is left, The other side): the `to` side's toward a line, the payee's
    /// toward the price.
    received: Vec<&'v Value>,
}

/// What was paid toward the price, exactly, in its kind (folds.md, What is left, The other side): a plain sum of what the payee accepted.
struct Price {
    /// The kind it is counted in: the price's, else the one kind every counted payment covers; null with several.
    kind: Value,
    paid: Dec,
    back: Dec,
    /// Paid in full: the view reads this, never the floats the fold reports.
    paid_up: bool,
    /// Part of the price handed to the one who is to pay it (promises.md, Handing on a receiving place): paid, with nothing moved.
    setoff: Dec,
    /// What moved toward the price, with nothing a payee's word raised: what is to come back to a payer is read from it (folds.md, `uncovered`).
    sent: Dec,
}

pub(super) struct Settling<'s> {
    d: &'s Deal<'s>,
    b: &'s Binding<'s>,
    offer: &'s Value,
    accept_block: &'s Value,
    /// The deal's bench: the judges its schema names in its `grounds.bench`, which both sides signed, and any judge both named after
    ///. It has the last word on a block in the deal (promises.md, Disputes): a block as many of its names as are needed defeat
    /// counts for nothing, unless each changed its ruling; a block they confirm counts whatever a side says of it.
    bench: Bench,
    /// Terms that are not an object name nothing (every read of them is by key).
    terms: &'s Value,
    /// What is to come to each side, and the hand-overs of it (promises.md, Handing on a receiving place).
    to_come: ToCome<'s>,
}

impl<'s> Settling<'s> {
    pub(super) fn new(d: &'s Deal<'s>, b: &'s Binding<'s>, offer: &'s Value, accept_block: &'s Value) -> Self {
        let terms = get(offer, "state.terms").unwrap_or(&Value::Null);
        let noun = |side: &str| d.side_at(side, accept_block).filter(|_| !d.open).filter(|w| !d.is_thing(if side == "to" { d.to_ref.as_deref().unwrap_or("") } else { d.from_ref.as_deref().unwrap_or("") }) && !w.is_empty());
        let to_come = ToCome::new(d.index, &d.first_hash, hash_of(accept_block), noun("to"), noun("from"), None, Value::Null);
        let mut s = Settling { d, b, offer, accept_block, terms, bench: bench(None, Vec::new(), Vec::new()), to_come };
        // the price that what is to come of the price is a part of: what the terms come to for the lines chosen
        let price = super::promise::terms_total(terms, s.chosen().as_ref());
        // the price in its own kind: price, or a count of goods (promises.md, Handing on a receiving place)
        let (total, kind) = match super::promise::measure(&price) {
            Some((d, k)) => (Some(d), k),
            None => (None, Value::Null),
        };
        s.to_come = ToCome::new(d.index, &d.first_hash, hash_of(accept_block), noun("to"), noun("from"), total, kind);
        // The deal's schema is the bound offer's own (promises.md: once a counter binds, the deal's terms are the counter's own, whole): a
        // schema a counter left out names no judge. A side of the deal is never its judge (invariant
        // 13): such a name adds nothing, and no block of a side's, or that speaks for a side, confirms or rules. A name both sides signed that
        // is tied to a side (a member of a side's circle) still counts, its tie shown in `judge_ties` (folds.md, Defeated blocks).
        let schema = rs(offer, "schema").and_then(|h| d.index.get(h));
        let sides: Vec<String> = [s.receiver("from", accept_block), s.receiver("to", accept_block)].into_iter().flatten().collect();
        // every holder of what either side has to come (a receiving place handed on) must have named a late judge too
        let given_now = s.to_come.latest();
        let holders: Vec<String> = sorted_set(given_now.noun.iter().cloned().chain(given_now.price.iter().map(|(w, _)| w.clone())));
        s.bench = bench(schema, sides.clone(), d.judges_given(&sides, &d.first_hash, &holders, Some(accept_block)));
        s
    }

    /// Whether `x` is the word of a side (of that side, where one is named).
    fn speaks_for_part(&self, x: &Value, side: Option<&str>) -> bool {
        self.d.side_of(x).is_some_and(|s| side.is_none_or(|w| w == s))
    }

    fn result(&self, stage: &str, mut more: Value) -> Value {
        more["bench"] = self.bench.json();
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
    /// Who may answer `x` for the right of a side (promises.md, Handing on a receiving place): once a claim has been handed over, the owner of that right where
    /// `x` stands (the `to` side's is what moves, the `from` side's the price), whoever signed the deal; else the side as `receiver` reads it.
    fn receivers(&self, side: &str, x: &Value, a: &Value, rights: bool) -> Vec<String> {
        if rights && self.to_come.active() {
            let o = self.to_come.seen_by(x);
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
    /// Only the deal's judge changes what counts (folds.md, Defeated blocks): a block it defeats counts for nothing, unless a confirms of
    /// its own has every such defeats in its causal past. A side's defeats erases nothing: it is a fact the stage reports (`disputed`).
    fn defeated(&self, x: &Value) -> bool {
        self.ruling(x) == Some(false)
    }
    /// A block whose accepted answers the bench all defeats: what they counted counts for nothing.
    fn answers_defeated(&self, x: &Value) -> bool {
        let answers = self.d.answers_of(hash_of(x), Some("accepted"));
        !answers.is_empty() && answers.iter().all(|a| self.defeated(a))
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
        index.values().filter(|o| list(rf(o, "confirms")).contains(&hash_of(x)) && crate::forks::counts_in(o, index) && self.bench.named(o, index)).collect()
    }
    /// A `work` or `done` is its doer's word. It counts toward what moves where the job's terms name whose word counts it
    /// (`terms.condition`, a `signal` of its kind `by` those named: a word of one of them); where the job names no one, where the side the
    /// work goes to answers it `accepted` (or a named judge confirms it).
    fn work_counted(&self, x: &Value, receiver: &Option<String>) -> bool {
        let named = self.terms.get("condition").filter(|c| c.get("signal").and_then(Value::as_str).is_some_and(|k| Some(k) == ss(x, "kind")));
        match named.and_then(|c| c.get("by")).and_then(|b| b.get("names")).and_then(Value::as_array) {
            Some(by) => {
                let speaker = super::speaker_of(x, self.d.index, None);
                by.iter().filter_map(Value::as_str).any(|n| speaker.as_deref() == Some(n))
            }
            None => self.counted(x, receiver),
        }
    }
    fn counted(&self, x: &Value, receiver: &Option<String>) -> bool {
        !self.standing_answers(x, &|a| if self.to_come.active() { self.receivers("to", x, a, true) } else { receiver.iter().cloned().collect() }, false).is_empty() || !self.confirmed(x).is_empty()
    }
    /// Whether a block names this side as the owner of what it moves.
    fn to_owner_is(x: &Value, who: &Option<String>) -> bool {
        who.as_deref().is_some_and(|w| list(rf(x, "to_owner")).contains(&w))
    }
    /// A transfer to a side counts once that side answers it accepted, the side read where its answer stands (a bearer note's holder then),
    /// or a named judge confirms it: either way its `to_owner` is that side.
    fn counted_to(&self, x: &Value, side: &str, rights: bool) -> bool {
        !self.standing_answers(x, &|a| self.receivers(side, x, a, rights), true).is_empty()
            || (self.receivers(side, x, x, rights).iter().any(|w| list(rf(x, "to_owner")).contains(&w.as_str())) && !self.confirmed(x).is_empty())
    }
    /// Whether any line of the deal names what moves (promises.md, What moves).
    fn what_moves(&self) -> bool {
        lines_of(self.terms).iter().any(|l| l.get("what").is_some_and(|w| !w.is_null()))
    }
    /// A job (promises.md, Settling): its lines name no `what`, and its `state.what` says what is done.
    fn is_job(&self) -> bool {
        !self.what_moves() && st(self.offer, "what").or_else(|| st(&self.d.root, "what")).is_some()
    }
    /// The lines an answer chooses (promises.md, Answers): the binding accept's `terms.lines`, else what the allocation draws.
    fn chosen(&self) -> Option<Value> {
        get(self.accept_block, "state.terms.lines").filter(|l| l.is_array()).cloned().or_else(|| self.b.takers.first().and_then(|t| t.get("lines")).filter(|l| l.is_array()).cloned())
    }
    /// A line's quantity chosen (folds.md, A promise's stage): what the accept names for it, else what the allocation draws on it, else the line's own.
    /// A range is what may be chosen, not a choice.
    fn quantity_chosen(&self, line: &Value) -> Option<Value> {
        quantity_of(line, self.chosen().as_ref()).cloned()
    }

    /// A price fixed later (promises.md, Terms, `price`): None when the price is a plain number. Otherwise Some(None) while it is unfixed,
    /// Some(amount) once fixed. The price names a figure: an `observe` of kind `figure` made `for` the deal, with `state.amount`, signed by one
    /// of the readers the panel `by` names, received by `deadline` on the named clock `clocks`, and inside `min` and `max` when it names them. It is
    /// fixed when `by.needed` different readers each signed the same figure and no other figure reached that many; a reader who signed two
    /// different figures counts for neither. The price is the figure, or `fraction` of it, exact. Nothing is
    /// filled in: with no such figure it stays unfixed (the fold reads no clock, so a late figure never counts).
    fn fixing(&self, line: &Value) -> Option<Option<Value>> {
        let p = line.get("price").filter(|p| p.is_object() && p.get("figure").is_some())?;
        let id = line.get("id");
        let index = self.d.index;
        let fixed = (|| -> Option<Value> {
            let kind = p.get("figure")?.as_str()?;
            let (names, signers) = crate::tasks::panel_of(p.get("by")?)?;
            let deadline = p.get("deadline")?.as_str()?;
            let clocks = crate::tasks::clocks_of(p.get("clocks")?)?;
            let by = crate::tasks::Clocks { names, needed: 1 };
            let bound = |k: &str, m: &Value, want: Ordering| -> bool {
                p.get(k).is_none_or(|b| match (measure(m), measure(b)) {
                    (Some((v, mk)), Some((w, bk))) => mk == bk && v.cmp(&w) != want,
                    _ => false,
                })
            };
            // (reader, the figure as canonical text, the figure)
            let mut votes: Vec<(String, String, &Value)> = Vec::new();
            for o in index.values().filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some(kind) && st(o, "line") == id && self.made_for(o) && crate::forks::counts_in(o, index)) {
                let Some(reader) = super::clock::clock_voice(o, &by, index) else { continue };
                let Some(m) = st(o, "amount").filter(|m| measure(m).is_some_and(|(v, _)| !v.cmp(&Dec::zero()).is_lt())) else { continue };
                if super::clock::received_by(hash_of(o), &clocks, index, deadline) && bound("min", m, Ordering::Less) && bound("max", m, Ordering::Greater) {
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
            let (value, kind) = measure(figure)?;
            let total = match p.get("fraction") {
                Some(f) => value.mul(&Dec::of(Some(f))?),
                None => value,
            };
            Some(kind_json(&total, &kind))
        })();
        Some(fixed)
    }
    /// The price a line is read by: its plain price, or a price fixed later once it is fixed (else the method itself, which has no total).
    fn price_now(&self, line: &Value) -> Option<Value> {
        match self.fixing(line) {
            Some(Some(fixed)) => Some(fixed),
            _ => line.get("price").cloned(),
        }
    }
    /// Whether every line priced by a figure is fixed: None where no line is (promises.md, A price fixed later).
    fn price_fixed(&self) -> Option<bool> {
        let figured: Vec<Option<Value>> = lines_of(self.terms).into_iter().filter_map(|l| self.fixing(l)).collect();
        (!figured.is_empty()).then(|| figured.iter().all(Option::is_some))
    }

    /// What counted toward the deal, each half counted one way (folds.md, What is left, The other side): a transfer that names an
    /// instance counts toward a line only as a draw on it that lands; one that names none counts in its kind on the receiver's accept.
    fn deeds(&self) -> Deeds<'_> {
        let (d, terms) = (self.d, self.terms);
        let index = d.index;
        // A payment `for` several promises pays each only by its split: with none, it pays none of them (things.md, Transfers).
        let transfers: Vec<&Value> = d
            .in_deal
            .iter()
            .filter(|x| type_of(x) == "transfer" && st(x, "status").is_none() && self.made_for(x) && !self.defeated(x))
            .filter(|x| !(names_none(x, index) && list(rf(x, "for")).len() > 1 && !matches!(st(x, "split"), Some(Value::Array(_)))))
            .collect();
        // Each line is covered when what counted moved at least its quantity chosen to the `to` side. A line that names no `what` moves its
        // quantity, an amount (a loan of price).
        let lines: Vec<Value> = lines_of(terms)
            .into_iter()
            .map(|l| json!({ "id": l.get("id"), "what": l.get("what"), "quantity": self.quantity_chosen(l), "price": self.price_now(l) }))
            .collect();
        // A transfer that names an instance delivers only as a draw on an instance of a line's `what` that lands.
        let delivers = |x: &Value| list(rf(x, "what")).into_iter().any(|h| lines.iter().any(|l| of_line(index, h, l.get("what"))) && super::things::landed_draw(h, hash_of(x), index).is_some());
        // A transfer that names none counts toward a line in that line's kind, on the receiver's accept.
        let of_amount_line = |x: &Value| names_none(x, index) && lines.iter().any(|l| line_kind(l).is_some_and(|k| st(x, "amount").and_then(kind_of).as_ref() == Some(&k)));
        let open_receiver = d.to_ref.as_deref().is_none_or(str::is_empty);
        // Goods are the giver's (the from side's) transfers: to the to side's ownership, which it accepted or a named judge confirmed;
        // or, to an open receiver (an allocation's deal: state.count, no to_owner), on the offerer's word alone, never a forked block's
        // (folds.md, A fork is a burden). What is handed to hold moves no ownership and settles no sale.
        let goods: Vec<&Value> = transfers
            .iter()
            .copied()
            .filter(|x| {
                d.side_of(x) == Some("from")
                    && (delivers(x) || of_amount_line(x))
                    && super::things::condition_stands(x, index)
                    // one that names an instance counts as a draw that lands to the other side (landing already read her yes); one that names
                    // none, on her accepted answer to it (The other side)
                    // the bench changes what counts, never who owns: a delivery whose accepted answers the bench all defeats counts for nothing,
                    // though it landed
                    && !self.answers_defeated(x)
                    && ((delivers(x) && self.receivers("to", x, x, true).iter().any(|w| list(rf(x, "to_owner")).contains(&w.as_str())))
                        || self.counted_to(x, "to", true)
                        || (names_none(x, index) && self.in_hand_order(x))
                        || (st(x, "count").is_some()
                            && rf(x, "to_owner").is_none()
                            && open_receiver
                            && d.by_offerer(x)
                            && d.offerer_is_from
                            && crate::forks::counts_in(x, index)))
            })
            .collect();
        // A payment counts only when it speaks for the paying side (the to side) and goes to the from side; a transfer back only when it
        // speaks for the from side and goes back to the to side (promises.md, Settling): no one pays, or refunds, by another's hand. One that
        // names an instance pays only as a draw on it that lands.
        let pays: Vec<&Value> = transfers
            .iter()
            .copied()
            .filter(|x| {
                d.side_of(x) == Some("to")
                    && super::things::condition_stands(x, index)
                    && if names_none(x, index) {
                        // her `received` that answers the transfer is her word about it, as her accept is
                        self.counted_to(x, "from", true) || self.received_of(x, "from").next().is_some()
                    } else {
                        // one that names an instance counts by the very thing named (a draw on the price's `of` instance, where
                        // it lands) or by her word about it (her accepted answer, her `received`, a named judge); a draw on any
                        // other instance counts nothing by landing
                        self.counted_to(x, "from", true)
                            || self.received_of(x, "from").next().is_some()
                            || self.price_of().iter().any(|of| list(rf(x, "what")).contains(&of.as_str()) && matches!(super::things::landed_draw(of, hash_of(x), index), Some(Some(_))))
                    }
            })
            .collect();
        let refunds: Vec<&Value> = transfers.iter().copied().filter(|x| names_none(x, index) && !of_amount_line(x) && d.side_of(x) == Some("from") && self.counted_to(x, "to", false)).collect();
        // A receiver with nothing to answer says what came by her own `received` word, for the deal: her word against herself.
        let received: Vec<&Value> = d
            .in_deal
            .iter()
            // Her word about what came binds her, a block of a fork of her line too
            .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("received") && st(o, "status").is_none() && self.made_for(o) && st(o, "amount").is_some() && (crate::forks::counts_in(o, index) || crate::forks::fork_burden(o, index)) && (d.side_of(o).is_some() || self.named_till(o)))
            .collect();
        let to_side = self.receiver("to", self.accept_block);
        let accepted_work: Vec<&Value> = d
            .in_deal
            .iter()
            .filter(|x| {
                (type_of(x) == "transform" || (type_of(x) == "observe" && ss(x, "kind") == Some("work")))
                    && self.speaks_for_part(x, None)
                    && st(x, "status").is_none()
                    && self.made_for(x)
                    && !self.defeated(x)
            })
            .filter(|x| self.work_counted(x, &to_side))
            .collect();
        // Catch weight (promises.md, Terms): under a per-unit price, `terms.band` is how far what is delivered may fall from the quantity
        // chosen, either way, as a fraction of it. What the receiver accepted inside the band covers the line and is what is priced; outside
        // it, the quantity chosen is priced, and less than the band's bottom does not cover the line.
        let band = terms.get("band").and_then(|b| Dec::of(Some(b)));
        let line_state: Vec<LineState> = lines
            .iter()
            .map(|line| {
                let needed = line.get("quantity").filter(|q| !q.is_null()).map(|q| Dec::of(q.get("value")).unwrap_or_else(Dec::zero));
                let heard: Vec<&Value> = received.iter().copied().filter(|o| d.side_of(o) == Some("to")).collect();
                // what her order in hand counts, for no more than the order states for this line, in all (promises.md, Terms: `in_hand`)
                let hand_only = |x: &Value| self.in_hand_order(x) && !self.counted_to(x, "to", true);
                let hand_cap = core::iter::once(&self.d.root)
                    .chain(self.d.in_deal.iter())
                    .find(|o| type_of(o) == "promise" && get(o, "state.terms.in_hand") == Some(&Value::Bool(true)) && st(o, "status").is_none() && rf(o, "answers").is_none() && self.d.side_of(o) == Some("to"))
                    .and_then(|o| super::lines_of(get(o, "state.terms").unwrap_or(&Value::Null)).into_iter().find(|l| l.get("id").is_some() && l.get("id") == line.get("id")))
                    .and_then(|l| l.get("quantity").and_then(measure).filter(|(_, k)| Some(k) == line_kind(line).as_ref()).map(|(d, _)| d))
                    .unwrap_or_else(Dec::zero);
                let moved = moved_toward(index, line, &lines, &goods, &heard, &|x: &Value| self.said_of(x, "to"), &hand_only, &hand_cap);
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
        // amounts of two kinds are never added: lines priced in two kinds have no total
        let total = if priced.is_empty() || !computable || priced.iter().any(|p| p.1 != priced[0].1) {
            None
        } else {
            super::promise::stepped(Some((priced.iter().fold(Dec::zero(), |t, p| t.add(&p.0)), priced[0].1.clone())), terms.get("step"))
        };
        Deeds { goods, pays, refunds, accepted_work, lines, line_state, total, computable, received }
    }

    /// A `received` by a signer the paid side's account word names in `by` counts toward her price only where it names that account
    /// word (`refs.derives_from`), her head where it is signed, and one place it lists (`state.destination`) whose `by` is its signer.
    fn named_till(&self, o: &Value) -> bool {
        let index = self.d.index;
        let Some(payee) = self.receiver("from", o) else { return false };
        let Some(dest) = ss(o, "destination") else { return false };
        let by = super::speaker_of(o, index, None);
        list(rf(o, "derives_from")).into_iter().filter_map(|h| index.get(h)).any(|aw| {
            super::account::head_where(&payee, hash_of(aw), o, index)
                && super::account::places(aw).is_some_and(|ps| ps.iter().any(|p| p["destination"] == json!(dest) && by.as_deref().is_some_and(|b| p["by"] == json!(b))))
        })
    }
    /// Her order, in the block's causal past, stating that the goods are in her hand (`terms.in_hand: true`), counts the block
    /// toward what moves to her. No order counts toward a price.
    /// "For no more than it states" is not read here: the block counts at its own amount (the line's quantity bounds
    /// what covers it) (the text does not say; read so).
    fn in_hand_order(&self, x: &Value) -> bool {
        let index = self.d.index;
        let past = index.past_of(x);
        core::iter::once(&self.d.root).chain(self.d.in_deal.iter()).any(|o| {
            type_of(o) == "promise" && get(o, "state.terms.in_hand") == Some(&Value::Bool(true)) && past.contains(hash_of(o)) && self.d.side_of(o) == Some("to") && crate::forks::counts_in(o, index)
        })
    }
    /// A spot exchange (things.md): what the payee's own transfers `for` the deal say, by their `covers`, came toward the price, in its kind.
    fn spot_covers(&self, deeds: &Deeds, kind: &Value) -> Dec {
        deeds.goods.iter().filter(|x| self.d.side_of(x) == Some("from")).filter_map(|x| st(x, "covers").and_then(measure)).filter(|(_, k)| k == kind).fold(Dec::zero(), |t, (v, _)| t.add(&v))
    }
    /// The parts of a payment's split for this deal, each an amount.
    fn split_parts<'x>(&self, x: &'x Value) -> Option<Vec<&'x Value>> {
        match st(x, "split") {
            Some(Value::Array(parts)) => Some(parts.iter().filter(|p| p.get("for").and_then(Value::as_str) == Some(&self.d.first_hash)).collect()),
            Some(_) => Some(Vec::new()),
            None => None,
        }
    }
    /// What a transfer moved toward a price of `kind`, before any word of the payee's (folds.md, What is left, The other side): one that names
    /// none, its amount in that kind; one that names an instance, only where the price states an `of` and the instance's `refs.of` is that
    /// id (beside `refs.what` an amount's kind is the instance's own).
    fn own_toward(&self, x: &Value, side: &str, kind: &Value) -> Dec {
        let index = self.d.index;
        // The very thing named: a draw on the instance the price's `of` names (where that block is an instance) counts toward the
        // price where it lands, at what landed. Where the reader does not hold the block the `of` names, the stage is not shown (`settle`).
        if !names_none(x, index) {
            if let Some(of) = kind.get("of").and_then(Value::as_str) {
                if list(rf(x, "what")).contains(&of) && index.get(of).is_some_and(|t| type_of(t) == "thing" && super::things::is_instance(t)) {
                    if let Some(Some(landed)) = super::things::landed_draw(of, hash_of(x), index) {
                        if landed.is_pos() {
                            return landed;
                        }
                    }
                }
            }
        }
        // her word: what the side the half goes to said of it, in that half's unit (no fold compares `of`)
        self.said_in(x, side, kind)
    }
    /// What the side a half goes to said of a block, in that half's unit: each of her accepted answers says the block's
    /// amount, or the `state.amount` she states in that unit (no more than the block's where it states one); her `received` that answers it
    /// says what it states; the most any says. With no word of hers (a signer she named counted it, or her order in hand), the block's own
    /// amount in that unit.
    fn said_in(&self, x: &Value, side: &str, kind: &Value) -> Dec {
        let unit_ok = |a: &Value| a.get("unit").is_some() && a.get("unit") == kind.get("unit");
        let own = st(x, "amount").filter(|a| unit_ok(a)).and_then(measure).map(|(d, _)| d);
        let words = self.standing_answers(x, &|a| self.receivers(side, x, a, true), true);
        let received: Vec<&Value> = self.received_of(x, side).collect();
        if words.is_empty() && received.is_empty() {
            return own.unwrap_or_else(Dec::zero);
        }
        let mut best = Dec::zero();
        for a in &words {
            let stated = st(a, "amount").filter(|v| unit_ok(v)).and_then(measure).map(|(d, _)| d);
            let said = match (stated, &own) {
                (Some(s), Some(o)) if s.cmp(o) != Ordering::Greater => s,
                (Some(s), None) => s,
                _ => own.clone().unwrap_or_else(Dec::zero),
            };
            if said.cmp(&best) == Ordering::Greater {
                best = said;
            }
        }
        for r in received {
            if let Some((v, _)) = st(r, "amount").filter(|v| unit_ok(v)).and_then(measure) {
                if v.cmp(&best) == Ordering::Greater {
                    best = v;
                }
            }
        }
        best
    }
    /// The `of` of each line's price: the instance a price may name (folds.md, What is left, The other side).
    fn price_of(&self) -> Vec<String> {
        lines_of(self.terms)
            .into_iter()
            .filter_map(|l| l.get("price"))
            .filter_map(|p| p.get("of").or_else(|| p.get("amount").and_then(|a| a.get("of"))).and_then(Value::as_str).map(String::from))
            .collect()
    }
    /// One payment counts once, at the most its receiving side has said of it (folds.md, What is left, The other side): of her counted
    /// accepted answers to a transfer that names no instance, each says the transfer's amount, or the `state.amount` it states in that kind
    /// (no more than the transfer's); the one that says most counts. With none (a signer she named counted it), the transfer's own amount.
    fn said_of(&self, x: &Value, side: &str) -> Option<(Dec, Value)> {
        let (d, k) = st(x, "amount").and_then(measure)?;
        let answers = self.standing_answers(x, &|a| self.receivers(side, x, a, true), true);
        // The words of one side about one block count once, at the most any says: her accepts, and her `received` that answers it
        let received: Vec<Dec> = self.received_of(x, side).filter_map(|o| st(o, "amount").and_then(measure)).filter(|(_, rk)| *rk == k).map(|(r, _)| if r.cmp(&d) == Ordering::Greater { d.clone() } else { r }).collect();
        if answers.is_empty() && received.is_empty() {
            return Some((d, k));
        }
        let said = answers
            .iter()
            .map(|a| match st(a, "amount").and_then(measure) {
                Some((s, sk)) if sk == k && s.cmp(&d) != Ordering::Greater => s,
                _ => d.clone(),
            })
            .chain(received)
            .max_by(|a, b| a.cmp(b))
            .unwrap_or(d);
        Some((said, k))
    }
    /// The counted `received` words of a side that answer a block (`refs.answers`), made for the deal.
    fn received_of<'x>(&'x self, x: &'x Value, side: &'x str) -> impl Iterator<Item = &'x Value> + 'x {
        let index = self.d.index;
        self.d.in_deal.iter().filter(move |o| {
            type_of(o) == "observe" && ss(o, "kind") == Some("received") && st(o, "status").is_none() && list(rf(o, "answers")).contains(&hash_of(x)) && (crate::forks::counts_in(o, index) || crate::forks::fork_burden(o, index)) && (self.d.side_of(o) == Some(side) || (side == "from" && self.named_till(o)))
        })
    }
    /// What the payee's accepted answers to a transfer say it covers (`state.covers`): of several, the one that says most counts (folds.md,
    /// What is left, The other side: each is her word against herself, and binding only grows).
    fn covered(&self, x: &Value, side: &str) -> Vec<Value> {
        self.standing_answers(x, &|a| self.receivers(side, x, a, side == "from"), true).into_iter().filter_map(|a| st(a, "covers").cloned()).collect()
    }
    /// What a payment counts toward the price, in its kind: what moved, raised to what the payee's accepted answer says it covers where that is
    /// more; in a split, only the parts for this deal. Nothing is converted.
    fn toward(&self, x: &Value, side: &str, kind: &Value) -> Dec {
        match self.split_parts(x) {
            Some(parts) => parts.iter().filter_map(|p| p.get("amount").and_then(measure)).filter(|(_, k)| k == kind).fold(Dec::zero(), |t, (d, _)| t.add(&d)),
            None => self
                .covered(x, side)
                .iter()
                .filter_map(measure)
                .filter(|(_, k)| k == kind)
                .map(|(d, _)| d)
                .chain(core::iter::once(self.own_toward(x, side, kind)))
                .max_by(|a, b| a.cmp(b))
                .unwrap_or_else(Dec::zero),
        }
    }
    /// The occurrences of this deal a payment names: a lone `state.occurrence`, or in a split the `occurrence` of each part for this deal
    /// (a part with none reads the payment's own), so "£40 on the 1st for four Saturday boxes" pays four occurrences (things.md, Transfers).
    fn occurrences_of(&self, x: &Value) -> Vec<String> {
        match self.split_parts(x) {
            Some(parts) => parts.iter().filter_map(|p| p.get("occurrence").and_then(Value::as_str).or(ss(x, "occurrence")).map(String::from)).collect(),
            None => ss(x, "occurrence").map(String::from).into_iter().collect(),
        }
    }
    /// What a payment puts toward one named occurrence: in a split only the parts that name it; otherwise as `toward`.
    fn toward_occurrence(&self, x: &Value, name: &str, kind: &Value) -> Dec {
        match self.split_parts(x) {
            Some(parts) => parts
                .iter()
                .filter(|p| p.get("occurrence").and_then(Value::as_str).or(ss(x, "occurrence")) == Some(name))
                .filter_map(|p| p.get("amount").and_then(measure))
                .filter(|(_, k)| k == kind)
                .fold(Dec::zero(), |t, (d, _)| t.add(&d)),
            None => self.toward(x, "from", kind),
        }
    }
    /// What a payment sent toward this deal in the price's kind, whatever the payee's word says it covers.
    fn sent_for(&self, x: &Value, kind: &Value) -> Dec {
        match self.split_parts(x) {
            Some(parts) => parts.iter().filter_map(|p| p.get("amount").and_then(measure)).filter(|(_, k)| k == kind).fold(Dec::zero(), |t, (d, _)| t.add(&d)),
            None => self.own_toward(x, "from", kind),
        }
    }
    fn price(&self, deeds: &Deeds) -> Price {
        // The kind the price is paid in: the price's; with no price, the one kind every counted payment covers (several: none).
        let mut kinds: Vec<Value> = Vec::new();
        for x in &deeds.pays {
            let mine: Vec<Value> = match self.split_parts(x) {
                Some(parts) => parts.iter().filter_map(|p| p.get("amount").and_then(kind_of)).collect(),
                None => self.covered(x, "from").iter().chain(st(x, "amount")).filter_map(kind_of).take(1).collect(),
            };
            for k in mine {
                if !kinds.contains(&k) {
                    kinds.push(k);
                }
            }
        }
        let kind = match deeds.total.as_ref().map(|(_, c)| c.clone()) {
            Some(c) => c,
            None if kinds.len() == 1 => kinds[0].clone(),
            None => Value::Null,
        };
        let sent = deeds.pays.iter().fold(Dec::zero(), |t, x| t.add(&self.sent_for(x, &kind)));
        // a part of the price handed to the one who is to pay it is paid
        let setoff = match (self.to_come.active(), self.receiver("to", self.accept_block)) {
            (true, Some(payer)) => self.to_come.latest().price.iter().find(|(w, _)| *w == payer).map(|(_, d)| d.clone()).unwrap_or_else(Dec::zero),
            _ => Dec::zero(),
        };
        // the payee's own `received` word adds what came toward the price, as an accepted transfer does
        // A `received` that answers a transfer is a word about that transfer, counted with it once; one that answers none is
        // a payment of its own
        let heard = deeds
            .received
            .iter()
            .filter(|o| (self.d.side_of(o) == Some("from") || self.named_till(o)) && !list(rf(o, "answers")).iter().any(|a| self.d.index.get(*a).is_some_and(|t| type_of(t) == "transfer")))
            .filter_map(|o| st(o, "amount").and_then(measure))
            .filter(|(_, k)| *k == kind)
            .fold(Dec::zero(), |t, (d, _)| t.add(&d));
        // the payee's own `covers` on her transfer `for` the deal (a spot exchange) is her word of what came toward the price
        let spot = self.spot_covers(deeds, &kind);
        let paid = deeds.pays.iter().fold(Dec::zero(), |t, x| t.add(&self.toward(x, "from", &kind))).add(&setoff).add(&heard).add(&spot);
        let sent = sent.add(&heard);
        let back = deeds.refunds.iter().fold(Dec::zero(), |t, x| t.add(&self.toward(x, "to", &kind)));
        let paid_up = deeds.computable && deeds.total.as_ref().is_none_or(|t| paid.cmp(&t.0) != Ordering::Less);
        Price { kind, paid, back, paid_up, setoff, sent }
    }
    /// When a payment was counted: the first of the dates the paid side gave its counting answers (or a named judge its confirms).
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
    /// The same, with the parts of the price handed to the one who is to pay it (dated by the owner's accept of the hand-over).
    fn latest_paid(&self, pays: &[&Value], price: &Price) -> Value {
        // a part of the price handed to the one who is to pay it is dated by the owner's accept of the hand-over
        let handed: Vec<String> = if price.setoff.cmp(&Dec::zero()) == Ordering::Greater {
            let payer = self.receiver("to", self.accept_block);
            self.to_come.latest().moves.iter().filter(|m| Some(&m.2) == payer.as_ref()).filter_map(|m| self.move_date(&m.0)).collect()
        } else {
            Vec::new()
        };
        pays.iter().filter_map(|x| self.counted_at(x)).chain(handed).max().map_or(Value::Null, Value::String)
    }
    /// When a hand-over of what is to come was accepted: the first date among its owner's accepting answers.
    fn move_date(&self, t: &str) -> Option<String> {
        let index = self.d.index;
        index.values().filter(|a| type_of(a) == "transfer" && ss(a, "status") == Some("accepted") && list(rf(a, "answers")).contains(&t)).filter_map(|a| ss(a, "at").map(String::from)).min()
    }

    /// A standing promise is due and paid occurrence by occurrence: its one `pay_by` and one occurrence's price are never
    /// read as the whole, so the stage reports no `due` and no `paid_at`, and `paid` is all that was paid in the deal. A payment names the
    /// occurrence it pays (`state.occurrence`: its start time, or the hash of the observe that started it), and `occurrences` reports each
    /// one a payment names or an event started: when it fell due (a start time is its own due; an event's is its observe's `at` plus the
    /// repeat's `wait`), what was paid for it, and, once that covers one occurrence's price, the latest date among its payments.
    fn occurrences(&self, repeat: &Value, deeds: &Deeds, price: &Price) -> Vec<Value> {
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
                .filter(|o| type_of(o) == "observe" && ss(o, "kind") == kind && self.made_for(o) && crate::forks::counts_in(o, index))
                .filter(|o| {
                    if holder_only {
                        return self.d.side_of(o) == Some("to");
                    }
                    // The side that charges cannot start a charge alone (promises.md, Terms: repeat): a payer who signed "each crossing the
                    // gate sensor records" consented to that count, not to the payee's own word. When `by` is given only the names in it start
                    // occurrences (a side counts only if it names itself); with no `by`, nothing starts one (nothing fills the sides' silence).
                    let named = rs(o, "author").is_some_and(|a| by.iter().any(|n| *n == a))
                        || rs(o, "as").is_some_and(|c| by.contains(&c));
                    named
                })
                .collect()
        } else {
            Vec::new()
        };
        // The wait runs from the clock's receipt of the event, never from the event's own `at` (blocks.md, A named clock): the promise's
        // `clocks`, and no one else: with none named there is no clock (nothing fills the sides' silence). With no receipt the wait has not begun:
        // the occurrence is named, due null.
        let clocks = self.terms.get("clocks").and_then(crate::tasks::clocks_of);
        // An occurrence kept with no price: the doer's own `done` made for the deal, naming it (promises.md, Settling). The doer is the `from`
        // side (or whoever it passed the part to); the other side's defeats of it is a dispute, and only the judge changes what counts.
        let dones: Vec<&Value> = index
            .values()
            .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("done") && ss(o, "occurrence").is_some() && self.made_for(o) && self.speaks_for_part(o, Some("from")) && crate::forks::counts_in(o, index) && !self.defeated(o))
            .collect();
        let names = sorted_set(deeds.pays.iter().flat_map(|x| self.occurrences_of(x)).chain(events.iter().map(|o| hash_of(o).to_string())).chain(dones.iter().filter_map(|o| ss(o, "occurrence").map(String::from))));
        names
            .iter()
            .map(|name| {
                let due: Value = match events.iter().find(|o| hash_of(o) == name.as_str()) {
                    Some(o) => match (clocks.as_ref().and_then(|k| super::clock::receipt_at(hash_of(o), k, index)), wait) {
                        (Some(at), Some(w)) => crate::time::add_duration(&at, w, 1).map_or(Value::Null, Value::String),
                        (Some(at), None) => json!(at),
                        _ => Value::Null,
                    },
                    None if crate::time::is_time(Some(&Value::String(name.clone()))) => json!(name),
                    None => Value::Null,
                };
                let mine: Vec<&Value> = deeds.pays.iter().copied().filter(|x| self.occurrences_of(x).contains(name)).collect();
                let sum = mine.iter().fold(Dec::zero(), |t, x| t.add(&self.toward_occurrence(x, name, &price.kind)));
                let paid = if mine.is_empty() || (deeds.total.is_none() && price.kind.is_null()) { Value::Null } else { kind_json(&sum, &price.kind) };
                let covered = deeds.total.as_ref().is_some_and(|t| sum.cmp(&t.0) != Ordering::Less) && sum.cmp(&Dec::zero()) == Ordering::Greater;
                let done_at = dones.iter().filter(|o| ss(o, "occurrence") == Some(name.as_str())).filter_map(|o| ss(o, "at").map(String::from)).min();
                json!({ "occurrence": name, "due": due, "paid": paid, "paid_at": if covered { self.latest_counted(&mine) } else { Value::Null }, "done_at": done_at })
            })
            .collect()
    }

    /// The occurrences the deal's pauses leave stopped: each time an occurrence a pause names, less the ones its own signer resumed
    /// (promises.md, Answers, `resumed`): an `updates` of the pause with `status: resumed`, counted only for the pause's signer (the deal
    /// reads no other), ends it from its own `at`: the named times at or after that are no longer stopped.
    fn paused(&self, stops: &[&Value]) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for s in stops {
            let Some(named) = get(s, "state.stop.occurrences").and_then(Value::as_array) else { continue };
            let resumed_at: Vec<i64> = self
                .d
                .in_deal
                .iter()
                .filter(|r| type_of(r) == "promise" && ss(r, "status") == Some("resumed") && rs(r, "updates") == Some(hash_of(s)) && rf(r, "answers").is_none())
                .filter_map(|r| ss(r, "at").and_then(crate::time::parse))
                .collect();
            for name in named.iter().filter_map(Value::as_str) {
                let at = crate::time::parse(name);
                let back = at.is_some_and(|t| resumed_at.iter().any(|r| *r <= t));
                if !back {
                    out.push(name.to_string());
                }
            }
        }
        sorted_set(out.into_iter())
    }
    /// The settled deal's stage: reversed, done, stopped onward, underway or accepted.
    pub(super) fn settle(&self, stops: &[&Value]) -> Value {
        let (d, terms, offer) = (self.d, self.terms, self.offer);
        let index = d.index;
        // Read whole (folds.md): where what a transfer `for` the deal moved turns on who owns a thing it names, and that is not shown to this
        // reader, the stage is not shown either (the price's `of`, where it is not given, is lacking too)
        for x in d.in_deal.iter().filter(|x| type_of(x) == "transfer" && st(x, "status").is_none() && self.made_for(x) && !self.defeated(x)) {
            for h in list(rf(x, "what")) {
                if index.get(h).is_some_and(|t| type_of(t) == "thing") {
                    if let Some(lacks) = super::things::lacks_of(h, index) {
                        return json!({ "not_shown": true, "lacks": lacks });
                    }
                } else if index.get(h).is_none() && self.price_of().iter().any(|of| of == h) {
                    return json!({ "not_shown": true, "lacks": [h] });
                }
            }
        }
        let deeds = self.deeds();
        let price = self.price(&deeds);
        let zero = Dec::zero();
        let job = self.is_job();
        // a line that names no `what` moves its quantity, an amount (a loan of price): it is covered by transfers that name no instance, of
        // its kind; a job's lines are covered by the work that counted
        let goods_done = job
            || deeds.lines.iter().zip(&deeds.line_state).all(|(_, ls)| match (&ls.least, &ls.moved) {
                (_, None) => true,
                (None, Some(m)) => m.cmp(&zero) == Ordering::Greater,
                (Some(n), Some(m)) => m.cmp(n) != Ordering::Less,
            });
        // A job is done when the work that counted covers each line's quantity chosen (not the offer's range); one accepted work block is
        // enough for a line that chose none (folds.md, A promise's stage).
        let work_on = |line: &Value| -> Dec { self.worked(&deeds, &price, line.get("quantity").and_then(|q| q.get("unit")).or_else(|| get(line, "price.per.unit"))) };
        let work_done = if job && !deeds.lines.is_empty() {
            deeds.lines.iter().all(|line| match line.get("quantity").filter(|q| q.get("value").is_some()) {
                Some(q) => work_on(line).cmp(&Dec::of(q.get("value")).unwrap_or_default()) != Ordering::Less,
                None => !deeds.accepted_work.is_empty(),
            })
        } else {
            !deeds.accepted_work.is_empty()
        };
        // a promise not to do names no `what`, and moves nothing: the fold never reads it as done (its `until` passing is the view's
        // `elapsed`, binding no one); what stands behind it is a stake on `ruled`. A standing promise (a repeat) is done occurrence by
        // occurrence, never as a whole: it stays underway until a stop ends it (folds.md, A promise's stage).
        // A repeat, or a `when` that follows an event (promises.md, Relative time), has its occurrences. A relative `when` that names a block is
        // read by the `due` view, never here.
        let repeat = terms.get("repeat");
        let event_when = get(offer, "state.when").filter(|w| w.get("after").and_then(Value::as_str).is_some_and(|a| !crate::spec().is("id", a)) && w.get("wait").is_some());
        let done = repeat.is_none() && goods_done && price.paid_up && (if job || deeds.lines.is_empty() { work_done } else { true });
        let stopped_occurrences = self.paused(stops);
        // `paid` is null until a payment is counted, and when, with no price, the payments cover more than one kind; it is in the price's
        // kind, else the one kind the payments cover.
        let set_off = price.setoff.cmp(&zero) == Ordering::Greater;
        let heard = deeds.received.iter().any(|o| d.side_of(o) == Some("from") || self.named_till(o)) || deeds.goods.iter().any(|x| st(x, "covers").is_some());
        let paid_json = if (!deeds.pays.is_empty() || set_off || heard) && !price.kind.is_null() { kind_json(&price.paid, &price.kind) } else { Value::Null };
        let occurrences = repeat.or(event_when).map_or(Vec::new(), |r| self.occurrences(r, &deeds, &price));
        // When the price was paid in full: the latest of the dates the paid side gave its counting answers, each payment dated by the first.
        // A fact, as `due` is (`terms.pay_by`): lateness is each reader's judgement.
        let paid_at = if repeat.is_none() && price.paid_up && deeds.total.is_some() && (!deeds.pays.is_empty() || set_off) && price.paid.cmp(&zero) == Ordering::Greater { self.latest_paid(&deeds.pays, &price) } else { Value::Null };
        let heads_of_deal = [d.first_hash.as_str(), hash_of(&d.root), hash_of(offer)];
        let disputed = disputes_shown(index, &d.in_deal, &heads_of_deal, &|x| d.side_of(x));
        let mut more = json!({
            "total": deeds.total.as_ref().map(|(m, c)| kind_json(m, c)),
            "paid": paid_json,
            // Each line, its sums exact text: `needed` and `moved` are amounts in the line's kind, null where the line states no quantity. A
            // job's line is the work that counted, in the unit of its quantity chosen, else of its price per unit (promises.md, Settling).
            "lines": deeds.lines.iter().zip(&deeds.line_state).map(|(line, l)| {
                if job {
                    let unit = line.get("quantity").and_then(|q| q.get("unit")).or_else(|| get(line, "price.per.unit"));
                    let needed = line.get("quantity").filter(|q| q.get("value").is_some()).cloned().unwrap_or(Value::Null);
                    let moved = unit.map_or(Value::Null, |u| json!({ "value": work_on(line).text(), "unit": u }));
                    return json!({ "id": l.id, "needed": needed, "moved": moved });
                }
                let kind = line_kind(line);
                let as_amount = |d: &Dec| kind.as_ref().map_or(Value::Null, |k| kind_json(d, k));
                json!({
                    "id": l.id, "needed": l.needed.as_ref().map_or(Value::Null, as_amount),
                    "moved": match (&l.moved, &l.needed) {
                        (_, None) => Value::Null,
                        // capped at what is needed when a whole instance covers the line
                        (None, Some(n)) => as_amount(n),
                        (Some(m), Some(_)) => as_amount(m),
                    },
                })
            }).collect::<Vec<_>>(),
            "stopped": stopped_occurrences,
            "disputed": disputed,
            "due": if repeat.is_some() { Value::Null } else { terms.get("pay_by").cloned().unwrap_or(Value::Null) },
            "paid_at": paid_at,
            "occurrences": occurrences,
            "judge_ties": self.bench.ties(&[("from", self.receiver("from", self.accept_block)), ("to", self.receiver("to", self.accept_block))], index),
            "paid_up": price.paid_up,
        });
        let over = d.alloc.is_some() && self.b.takers.first().and_then(|t| t.get("over_allocated")).and_then(Value::as_bool) == Some(true);
        more["over_allocated"] = json!(over);
        more["to_come"] = self.to_come_json(&price);
        more["unanswered"] = json!(self.unanswered());
        more["price_fixed"] = self.price_fixed().map_or(Value::Null, Value::Bool);
        more["to_come_on"] = Value::Array(self.to_come_on(&deeds));
        more["received_at"] = Value::Array(self.received_at_json());
        more["moved"] = Value::Array(self.moved_json());
        // `forfeit` stays with the payee only where an onward stop that speaks for the paying side (`to`) is among the first
        // onward stops of the deal and none that speaks for the payee (`from`) is; in every other ending it is the payer's still
        let firsts_onward = earliest(&stops.iter().copied().filter(|s| ss(s, "stop") == Some("onward")).collect::<Vec<_>>(), index);
        let forfeit_kept = firsts_onward.iter().any(|f| d.side_of(f) == Some("to")) && !firsts_onward.iter().any(|f| d.side_of(f) == Some("from"));
        let uncovered = self.uncovered(&deeds, &price, forfeit_kept);
        // each side's claim, shown at every stage (folds.md, What each fold returns)
        more["uncovered"] = uncovered;
        let paid_back = price.paid.cmp(&zero) == Ordering::Greater && price.back.cmp(&price.paid) != Ordering::Less;
        // Reversed: a done promise with counted transfers back for it covering what was paid.
        if done && paid_back {
            return self.result("reversed", more);
        }
        if done {
            return self.result("done", more);
        }
        // 4. Stopped onward, from that block: the first onward stop in causal order (of several that do not see each other, the lowest
        // hash, only to name one). When the first stops that do not see each other speak for both sides, `by` is both: no hash decides it.
        let onward: Vec<&Value> = stops.iter().copied().filter(|s| ss(s, "stop") == Some("onward")).collect();
        let firsts = earliest(&onward, index);
        if let Some(first) = named(&firsts) {
            let crossing = ["from", "to"].iter().all(|sd| firsts.iter().any(|f| d.side_of(f) == Some(*sd)));
            more["stop"] = json!("onward");
            more["from"] = json!(hash_of(first));
            more["by"] = if crossing { json!("both") } else { json!(self.ended_by(first)) };
            return self.result("stopped", more);
        }
        self.result(if !deeds.goods.is_empty() || !deeds.pays.is_empty() || !deeds.accepted_work.is_empty() { "underway" } else { "accepted" }, more)
    }

    /// A new term both sides signed (promises.md, Terms: pay_by): a side's `observe` of kind `message` `for` the deal with a `pay_by`, answered
    /// `accepted` by an observe of the other side. The agreed dates in the order the answers stand in causal order (ties by hash, only to name
    /// one); the first promise's own `pay_by` stays, and a date only one side signed moves nothing: `[{ pay_by, proposal, answer }]`.
    fn moved_json(&self) -> Vec<Value> {
        let index = self.d.index;
        let mut out: Vec<(usize, String, Value)> = Vec::new();
        for p in index.values().filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("message") && self.made_for(o) && crate::time::is_time(st(o, "pay_by")) && crate::forks::counts_in(o, index)) {
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
    /// named clock received it: the promise's `clocks`, and no one else's receipt. Null while there is no clock or no receipt. A message that
    /// reached the other side is what "knowing" rests on, read from the receipt alone.
    fn received_at_json(&self) -> Vec<Value> {
        let index = self.d.index;
        let named = self.terms.get("clocks").and_then(crate::tasks::clocks_of);
        let mut out: Vec<(String, Value)> = Vec::new();
        for o in index.values().filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("message") && self.made_for(o) && crate::forks::counts_in(o, index)) {
            let Some(side) = self.d.side_of(o) else { continue };
            let at = named.as_ref().and_then(|k| super::clock::receipt_at(hash_of(o), k, index));
            out.push((hash_of(o).to_string(), json!({ "message": hash_of(o), "side": side, "at": at })));
        }
        out.sort_by(|a, b| crate::js::cmp16(&a.0, &b.0));
        out.into_iter().map(|(_, v)| v).collect()
    }

    /// What is to come (promises.md, Handing on a receiving place; folds.md, What each fold returns): null until a hand-over of what is to come is given; then `{ to, from,
    /// draws }`: the owners of what moves and of the price, each `[{ owner, amount }]` (amount null for a side that is one whole), and the
    /// hand-overs as draws on what is to come to each side.
    fn to_come_json(&self, price: &Price) -> Value {
        if !self.to_come.active() {
            return Value::Null;
        }
        let o = self.to_come.latest();
        // what moves is to come whole to its one owner: one whole, its amount null
        let to: Vec<Value> = o.noun.iter().map(|w| json!({ "owner": w, "amount": null })).collect();
        let from: Vec<Value> = o.price.iter().map(|(w, d)| json!({ "owner": w, "amount": kind_json(d, &price.kind) })).collect();
        json!({ "to": to, "from": from, "draws": o.draws })
    }
    /// A payment made to an owner who had already handed that part of what is to come on, without seeing it, counts; the old owner holds that
    /// amount for the new one (promises.md, Handing on a receiving place): `[{ from, to, amount, payment }]`.
    fn to_come_on(&self, deeds: &Deeds) -> Vec<Value> {
        if !self.to_come.active() {
            return Vec::new();
        }
        let index = self.d.index;
        let o = self.to_come.latest();
        let mut out: Vec<(String, String, Value)> = Vec::new();
        for x in &deeds.pays {
            let owners = self.to_come.seen_by(x).price;
            let Some(owner) = list(rf(x, "to_owner")).into_iter().find(|w| owners.iter().any(|(p, _)| p == w)) else { continue };
            let Some(kind) = st(x, "amount").and_then(kind_of) else { continue };
            let mut left = self.sent_for(x, &kind);
            for (th, from, to, amount) in &o.moves {
                if from != owner || index.get(th).is_some_and(|t| sees_in(x, hash_of(t), index)) {
                    continue;
                }
                let held = if left.cmp(amount) == Ordering::Less { left.clone() } else { amount.clone() };
                if held.is_pos() {
                    out.push((hash_of(x).to_string(), to.clone(), json!({ "from": owner, "to": to, "amount": kind_json(&held, &kind), "payment": hash_of(x) })));
                    left = left.sub(&held);
                }
            }
        }
        out.sort_by(|a, b| crate::js::cmp16(&a.0, &b.0).then_with(|| a.1.cmp(&b.1)));
        out.into_iter().map(|(_, _, v)| v).collect()
    }
    /// The transfers of either side that name no instance and that the other side has not accepted (folds.md, What each fold returns,
    /// `uncovered`): each its signer's own word, never counted. Sorted.
    fn unanswered(&self) -> Vec<String> {
        let d = self.d;
        let out = d.in_deal.iter().filter(|x| {
            type_of(x) == "transfer"
                && st(x, "status").is_none()
                && names_none(x, d.index)
                && self.made_for(x)
                && match d.side_of(x) {
                    // her `received` that answers it is her word about it, and her order in hand counts it
                    Some("to") => !self.counted_to(x, "from", true) && self.received_of(x, "from").next().is_none(),
                    Some("from") => !self.counted_to(x, "to", true) && self.received_of(x, "to").next().is_none() && !self.in_hand_order(x),
                    _ => false,
                }
        });
        sorted_set(out.map(|x| hash_of(x)))
    }
    /// The work counted on a job, in `unit`: the work blocks that count (its doer's word where the job names whose word counts,
    /// else the receiving side's `accepted`), and, at a price per unit, the work its doer stated in a payment's causal past, oldest first, up to
    /// what the payments pay for at the price per unit (her payment is her word that so much of it came).
    fn worked(&self, deeds: &Deeds, price: &Price, unit: Option<&Value>) -> Dec {
        let counted: Vec<&Value> = deeds.accepted_work.iter().copied().filter(|x| type_of(x) == "observe").collect();
        let mut worked = counted.iter().filter_map(|x| amount_dec(st(x, "amount"), unit)).fold(Dec::zero(), |t, a| t.add(&a));
        let Some(per_unit) = lines_of(self.terms).into_iter().filter_map(|l| l.get("price")).find(|p| get(p, "per").is_some_and(|p| p.get("unit") == unit)) else { return worked };
        if let (Some((each, k)), Some(per)) = (per_unit.get("amount").and_then(measure), per_unit.get("per").and_then(|x| Dec::of(x.get("value")))) {
            if k == price.kind && each.is_pos() {
                let index = self.d.index;
                let stated: Vec<&Value> = self.d.in_deal.iter().filter(|x| type_of(x) == "observe" && ss(x, "kind") == Some("work") && st(x, "status").is_none() && self.made_for(x) && self.speaks_for_part(x, Some("from")) && !self.defeated(x) && !counted.iter().any(|c| hash_of(c) == hash_of(x))).collect();
                let seen: Vec<&Value> = stated.into_iter().filter(|w| deeds.pays.iter().any(|p| index.past_of(p).contains(hash_of(w)))).collect();
                let by_pay = seen.iter().filter_map(|x| amount_dec(st(x, "amount"), unit)).fold(Dec::zero(), |t, a| t.add(&a));
                // what the payments pay for, in pieces, less what is already counted
                let pieces = price.paid.mul(&per).div(&each).unwrap_or_else(|| by_pay.clone());
                let room = pieces.sub(&worked);
                let add = if !room.is_pos() { Dec::zero() } else if by_pay.cmp(&room) == Ordering::Greater { room } else { by_pay };
                worked = worked.add(&add);
            }
        }
        worked
    }

    /// `uncovered` (folds.md, What each fold returns): `{ from, to }`, each side's claim shown as a fact, at every stage. `to`, the paying
    /// side: what she sent that counted, less transfers back, less the price of what moved to her, less `terms.forfeit` where it is kept; an
    /// amount in the price's kind, null when she sent nothing. `from`, the delivering side: `[{ line, amount }]`, for each line something moved
    /// toward, what moved less what the payments covered, in the line's kind; `[]` when she sent nothing. Never below zero.
    fn uncovered(&self, deeds: &Deeds, price: &Price, forfeit_kept: bool) -> Value {
        json!({ "from": self.uncovered_from(deeds, price), "to": self.uncovered_to(deeds, price, forfeit_kept) })
    }
    fn uncovered_from(&self, deeds: &Deeds, price: &Price) -> Vec<Value> {
        let mut out = Vec::new();
        // a job moves no thing: its delivering side has sent nothing toward a line
        if self.is_job() {
            return out;
        }
        for (line, ls) in deeds.lines.iter().zip(&deeds.line_state) {
            // a whole instance that covered the line moved what the line needs
            let moved_v = ls.moved.clone().or_else(|| ls.needed.clone());
            let (Some(moved), Some(kind)) = (moved_v.as_ref().filter(|m| m.is_pos()), line_kind(line)) else { continue };
            // what the payments covered of it: under a per-unit price, what was paid over the price per unit; on a flat price, all of it once
            // the whole moved and the price is paid in full, else nothing (no price was struck for a part)
            let whole_moved = ls.least.as_ref().is_none_or(|n| moved.cmp(n) != Ordering::Less);
            let covered = match line.get("price").and_then(|p| p.get("per").and(Some(p))) {
                Some(p) => match (p.get("amount").and_then(measure), p.get("per").and_then(|x| Dec::of(x.get("value")))) {
                    // the pieces the payments pay for are P times p over a, exact, in `per`'s unit, taken only from what moved in that
                    // same unit; under a price of zero, all that moved is paid for
                    (Some((each, k)), Some(per)) if k == price.kind => {
                        let same_unit = p.get("per").and_then(|x| x.get("unit")) == kind.get("unit");
                        match price.paid.mul(&per).div(&each) {
                            Some(pieces) if same_unit => pieces,
                            Some(_) => Dec::zero(),
                            None => moved.clone(),
                        }
                    }
                    _ => Dec::zero(),
                },
                None if price.paid_up && deeds.total.is_some() && whole_moved => moved.clone(),
                None => Dec::zero(),
            };
            let left = moved.sub(&covered);
            let left = if left.is_pos() { left } else { Dec::zero() };
            out.push(json!({ "line": line.get("id").cloned().unwrap_or(Value::Null), "amount": kind_json(&left, &kind) }));
        }
        out
    }
    fn uncovered_to(&self, deeds: &Deeds, price: &Price, forfeit_kept: bool) -> Value {
        let zero = Dec::zero();
        if price.kind.is_null() || !price.sent.is_pos() {
            return Value::Null;
        }
        // accepted work of the observe kind `work` only: enough of each line's quantity chosen, else any
        let works: Vec<&&Value> = deeds.accepted_work.iter().filter(|x| type_of(x) == "observe").collect();
        let work_met = |line: &Value| match line.get("quantity").filter(|q| q.get("value").is_some()) {
            Some(q) => works.iter().filter_map(|x| amount_dec(st(x, "amount"), q.get("unit"))).fold(Dec::zero(), |t, a| t.add(&a)).cmp(&Dec::of(q.get("value")).unwrap_or_default()) != Ordering::Less,
            None => !works.is_empty(),
        };
        let mut value = Dec::zero();
        {
            if self.is_job() {
                // a job: each line at a price per unit is worth the counted work, in that unit; a flat line, its price once its work is met
                for line in &deeds.lines {
                    let Some(p) = line.get("price") else { continue };
                    value = value.add(&if get(p, "per").is_some() {
                        let unit = get(p, "per.unit");
                        let q = json!({ "value": self.worked(deeds, price, unit).text(), "unit": unit });
                        total_of(Some(p), Some(&q)).filter(|(_, c)| c == &price.kind).map_or_else(Dec::zero, |(d, _)| d)
                    } else if work_met(line) {
                        total_of(Some(p), None).filter(|(_, c)| c == &price.kind).map_or_else(Dec::zero, |(d, _)| d)
                    } else {
                        Dec::zero()
                    });
                }
            } else {
                for (line, ls) in deeds.lines.iter().zip(&deeds.line_state) {
                    let Some((full, cur)) = ls.total.as_ref() else { continue };
                    if *cur != price.kind {
                        continue;
                    }
                    let per_unit = get(line, "price.per").is_some();
                    value = value.add(&match (&ls.least, &ls.moved) {
                        (_, None) => full.clone(),
                        (None, Some(m)) => if m.is_pos() { full.clone() } else { Dec::zero() },
                        (Some(n), Some(m)) if m.cmp(n) != Ordering::Less => full.clone(),
                        (Some(_), Some(m)) if per_unit => {
                            let q = json!({ "value": m.text(), "unit": get(line, "quantity.unit") });
                            total_of(line.get("price"), Some(&q)).filter(|(_, c)| c == &price.kind).map_or_else(Dec::zero, |(d, _)| d)
                        }
                        // A flat price for a whole: nothing is covered until the whole moves, except what the payer's own accepted answer to a
                        // delivery says it covers (promises.md, Settling): her word lowers only what is to come back to her, never what is to come to the payee.
                        _ => {
                            let said = self.stated_cover(&deeds.goods, line, &deeds.lines, &price.kind);
                            if said.cmp(full) == Ordering::Greater { full.clone() } else { said }
                        }
                    });
                }
            }
        }
        let kept = get(self.terms, "forfeit").filter(|_| forfeit_kept).and_then(measure).filter(|(_, k)| *k == price.kind).map_or_else(Dec::zero, |(d, _)| d);
        let left = price.sent.sub(&price.back).sub(&value).sub(&kept);
        kind_json(if left.cmp(&zero) == Ordering::Greater { &left } else { &zero }, &price.kind)
    }

    /// What the payer's accepted answers to the deliveries toward this line say they cover of a flat price, in the price's kind (`covers`).
    fn stated_cover(&self, goods: &[&Value], line: &Value, lines: &[Value], kind: &Value) -> Dec {
        let index = self.d.index;
        let mut sum = Dec::zero();
        for x in goods.iter().filter(|x| for_line(index, x, line, lines)) {
            if !names_none(x, index) && !list(rf(x, "what")).into_iter().any(|h| of_line(index, h, line.get("what")) && super::things::landed_draw(h, hash_of(x), index).is_some()) {
                continue;
            }
            let said = self.covered(x, "to").iter().filter_map(measure).filter(|(_, k)| k == kind).map(|(d, _)| d).max_by(|a, b| a.cmp(b));
            if let Some(d) = said {
                sum = sum.add(&d);
            }
        }
        sum
    }

    /// Which side ended it (folds.md, A promise's stage): the side the stop speaks for, or "both" when a counted block of the other side confirms the
    /// stop. Only an explicit confirm agrees: a later stop of their own is not agreement.
    fn ended_by(&self, stop: &Value) -> Option<&'static str> {
        let index = self.d.index;
        self.d.side_of(stop).map(|side| {
            let other = if side == "from" { "to" } else { "from" };
            let agreed = index.values().any(|c| list(rf(c, "confirms")).contains(&hash_of(stop)) && crate::forks::counts_in(c, index) && self.d.side_of(c) == Some(other));
            if agreed { "both" } else { side }
        })
    }

}

// A transfer that names no instance (things.md, Transfers): it moves an amount of a good the record does not hold. One that draws an amount
// on a thing that states no `pack` takes nothing of it (`no_measure`) and is read the same way (folds.md, What is left, One whole).
fn names_none(x: &Value, index: &crate::js::Index) -> bool {
    st(x, "amount").is_some() && list(rf(x, "what")).iter().all(|h| index.get(*h).is_some_and(|t| type_of(t) == "thing" && st(t, "pack").is_none()))
}
// Whether a block for the deal counts toward a line (promises.md, Terms): it names the line in `state.line`; or it names none and fits this
// line alone: an instance of the line's `what`, or an amount in the line's kind.
fn for_line(index: &crate::js::Index, x: &Value, line: &Value, lines: &[Value]) -> bool {
    match ss(x, "line") {
        Some(named) => line.get("id").and_then(Value::as_str) == Some(named),
        None => {
            let fits = |l: &Value| {
                let kind = line_kind(l);
                list(rf(x, "what")).into_iter().any(|h| of_line(index, h, l.get("what")))
                    || (names_none(x, index) && st(x, "amount").and_then(kind_of).is_some_and(|k| Some(&k) == kind.as_ref() || (kind.is_none() && k.get("unit") == get(l, "quantity.unit"))))
            };
            fits(line) && lines.iter().filter(|l| fits(l)).count() == 1
        }
    }
}
// A line's kind: its quantity's (`{ unit, of }`); None when it states no amount.
fn line_kind(line: &Value) -> Option<Value> {
    line.get("quantity").filter(|q| q.get("value").is_some()).and_then(kind_of)
}

// A transfer that names an instance moves it toward a line only when the instance is of the line's `what` (the thing itself, or one whose
// `refs.of` names it) and the transfer lands as a draw on it (folds.md, What is left).
fn of_line(index: &crate::js::Index, h: &str, what: Option<&Value>) -> bool {
    let whats = list(what);
    index.get(h).is_some_and(|t| type_of(t) == "thing" && (whats.contains(&h) || list(rf(t, "of")).iter().any(|k| whats.contains(k))))
}
// How much of a line counted transfers moved, exactly, in the line's kind (folds.md, What is left, The other side): what each transfer that
// names an instance of the line landed as a draw on it (all of a thing with no amount: its pack, or the whole), each transfer that names none
// in the line's kind, and the receiver's own `received` word for the line. None when a whole instance covers it, or when the line has no
// quantity and a counted transfer of it exists. Another kind moves nothing.
fn moved_toward(index: &crate::js::Index, line: &Value, lines: &[Value], goods: &[&Value], heard: &[&Value], said: &dyn Fn(&Value) -> Option<(Dec, Value)>, hand_only: &dyn Fn(&Value) -> bool, hand_cap: &Dec) -> Option<Dec> {
    let unit = get(line, "quantity.unit");
    let kind = line_kind(line);
    let mut sum = Dec::zero();
    let mut by_hand = Dec::zero();
    let (mut whole, mut any) = (false, false);
    for x in goods.iter().filter(|x| for_line(index, x, line, lines)) {
        if names_none(x, index) {
            if let Some((d, k)) = said(x) {
                if Some(&k) == kind.as_ref() {
                    any = true;
                    if hand_only(x) {
                        by_hand = by_hand.add(&d);
                    } else {
                        sum = sum.add(&d);
                    }
                }
            }
            continue;
        }
        for h in list(rf(x, "what")).into_iter().filter(|h| of_line(index, h, line.get("what"))) {
            let Some(landed) = super::things::landed_draw(h, hash_of(x), index) else { continue };
            any = true;
            match (landed, index.get(h).and_then(|t| st(t, "pack"))) {
                (Some(d), Some(p)) if same_unit(p, unit) => sum = sum.add(&d),
                (Some(_), _) => {}
                (None, Some(p)) => {
                    if let Some(a) = amount_dec(Some(p), unit) {
                        sum = sum.add(&a);
                    }
                }
                (None, None) => whole = true,
            }
        }
    }
    for o in heard.iter().filter(|o| for_line(index, o, line, lines)) {
        if let Some((d, k)) = st(o, "amount").and_then(measure) {
            if Some(&k) == kind.as_ref() || (kind.is_none() && unit.is_some() && k.get("unit") == unit) {
                any = true;
                sum = sum.add(&d);
            }
        }
    }
    sum = sum.add(if by_hand.cmp(hand_cap) == core::cmp::Ordering::Greater { hand_cap } else { &by_hand });
    if whole || (any && line.get("quantity").is_none_or(Value::is_null)) { None } else { Some(sum) }
}
fn same_unit(a: &Value, unit: Option<&Value>) -> bool {
    a.get("unit").is_some() && a.get("unit") == unit
}
