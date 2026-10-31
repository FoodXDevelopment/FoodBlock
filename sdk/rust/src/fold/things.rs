//! Things (folds.md, Things): who owns an instance, and where it is now.
use super::{read_all, speaker_of};
use crate::grant::{ending, End};
use crate::js::{hash_of, index_of, list, rf, rs, sorted_set, ss, st, type_of, unique, Index};
use crate::order::{earliest, sees_in};
use crate::prelude::*;

/// Who owns an instance, the transfers that moved it, and a conflict (two that do not see each other prove a lie).
#[derive(Debug, Clone, PartialEq)]
pub struct Ownership {
    pub owner: Option<String>,
    pub transfers: Vec<String>,
    pub conflict: Option<Vec<String>>,
}

/// Who owns an instance: the `to_owner` of its last counted ownership transfer, else its maker. A transfer of
/// ownership counts only if signed by the owner the previous counted transfer named (or the maker, for the first),
/// with that transfer in its causal past; to a named receiver, once the receiver answers it accepted.
pub fn ownership(instance: &Value, blocks: &[Value]) -> Ownership {
    ownership_at(instance, blocks, "")
}

/// The ownership view at the reader's clock `now` (folds.md, Views): a transfer that carries a condition (`state.condition`, things.md,
/// Transfers) counts once the condition holds, so a condition that reads the clock makes this a view. No clock (the empty text) reads
/// every condition that needs none, and none that does.
pub fn ownership_at(instance: &Value, blocks: &[Value], now: &str) -> Ownership {
    let index =
        read_all(core::iter::once(instance).chain(index_of(blocks).values().collect::<Vec<_>>()));
    ownership_within(hash_of(instance), &index, &|_| true, now)
}

/// The ownership view (folds.md, Views): the ownership fold read with the reader's arrivals, so a sale the recovery reach protects
/// stands for that reader (decision c9). The fold stays the word.
pub fn ownership_view(instance: &Value, blocks: &[Value], arrived_at: crate::identity::ArrivedAt, now: &str) -> Ownership {
    let index = super::read_all_at(core::iter::once(instance).chain(index_of(blocks).values().collect::<Vec<_>>()), arrived_at);
    ownership_within(hash_of(instance), &index, &|_| true, now)
}

/// Whether a receiver's `accepted` answer to a transfer still counts (things.md, Transfers): a transfer to a named receiver is read like an
/// offer, so it is no free option. The giver's withdrawal (their own `updates` of it, `stopped` with `before`) voids an accept that has the
/// withdrawal in its causal past; on a transfer that carried `expires`, the giver's `declined` answer to the accept voids it.
pub(super) fn answer_stands(transfer: &Value, answer: &Value, index: &Index) -> bool {
    let giver = speaker_of(transfer, index, None);
    let expires = st(transfer, "expires").is_some();
    !index.values().any(|w| {
        type_of(w) == "transfer"
            && crate::identity::counts_in(w, index)
            && giver.is_some()
            && speaker_of(w, index, None) == giver
            && ((ending(w, hash_of(transfer)) == Some(End::Stop) && ss(w, "stop") == Some("before") && sees_in(answer, hash_of(w), index))
                || (expires && ss(w, "status") == Some("declined") && ending(w, hash_of(answer)) == Some(End::Decline)))
    })
}

// The conditions being read, so a condition that leads back to the transfer carrying it (a deal whose goods count only if its giver owned
// them) holds for nothing instead of looping.
#[cfg(feature = "std")]
std::thread_local! { static READING: core::cell::RefCell<Vec<String>> = const { core::cell::RefCell::new(Vec::new()) }; }
#[cfg(not(feature = "std"))]
static READING: core::sync::atomic::AtomicUsize = core::sync::atomic::AtomicUsize::new(0);

fn while_reading<R>(transfer: &str, f: impl FnOnce() -> R) -> Option<R> {
    #[cfg(feature = "std")]
    {
        if READING.with(|r| r.borrow().iter().any(|h| h == transfer)) {
            return None;
        }
        READING.with(|r| r.borrow_mut().push(transfer.to_string()));
        let out = f();
        READING.with(|r| r.borrow_mut().pop());
        Some(out)
    }
    #[cfg(not(feature = "std"))]
    {
        let _ = transfer;
        use core::sync::atomic::Ordering::SeqCst;
        if READING.load(SeqCst) >= 2 {
            return None;
        }
        READING.fetch_add(1, SeqCst);
        let out = f();
        READING.fetch_sub(1, SeqCst);
        Some(out)
    }
}

/// Whether a transfer's condition holds on the blocks `keep` lets in, at `now`. A condition the protocol does not read holds for nothing.
pub(super) fn condition_holds_in(transfer: &Value, cond: &Value, index: &Index, keep: &dyn Fn(&Value) -> bool, now: &str) -> bool {
    while_reading(hash_of(transfer), || {
        let blocks: Vec<Value> = index.values().filter(|b| keep(b)).cloned().collect();
        crate::tasks::condition_holds(cond, &blocks, now) == Some(true)
    })
    .unwrap_or(false)
}

/// Whether a transfer's own condition holds with no clock, on everything held (the stage reads no clock): a goods transfer that carries
/// a condition counts toward a deal's delivery only once it does.
pub(super) fn condition_stands(transfer: &Value, index: &Index) -> bool {
    st(transfer, "condition").is_none_or(|c| condition_holds_in(transfer, c, index, &|_| true, "") && !let_go(transfer, c, index, &|_| true))
}

/// A conditioned transfer its receiver let go: her own counted `stopped` or `declined` answer to it (authority.md, Ending), signed before
/// the condition held (read on what that answer saw, at its own date: it binds only her). After the condition held, the title is hers
/// and she hands it on by a transfer of her own.
pub(super) fn let_go(transfer: &Value, cond: &Value, index: &Index, visible: &dyn Fn(&str) -> bool) -> bool {
    index.values().any(|a| {
        type_of(a) == "transfer"
            && matches!(ss(a, "status"), Some("stopped" | "declined"))
            && visible(hash_of(a))
            && list(rf(a, "answers")).contains(&hash_of(transfer))
            && crate::identity::counts_in(a, index)
            && speaker_of(a, index, None).is_some_and(|who| list(rf(transfer, "to_owner")).contains(&who.as_str()))
            && {
                let past = index.past_of(a);
                !condition_holds_in(transfer, cond, index, &|b| past.contains(hash_of(b)) && visible(hash_of(b)), ss(a, "at").unwrap_or(""))
            }
    })
}

/// Whether a transfer to a named receiver was accepted by the receiver, in an answer `visible` lets in.
pub(super) fn accepted_by_receiver(transfer: &Value, index: &Index, visible: &dyn Fn(&str) -> bool) -> bool {
    index.values().any(|b| {
        type_of(b) == "transfer"
            && ss(b, "status") == Some("accepted")
            && visible(hash_of(b))
            && crate::identity::counts_in(b, index)
            && list(rf(b, "answers")).contains(&hash_of(transfer))
            && speaker_of(b, index, None).is_some_and(|a| list(rf(transfer, "to_owner")).contains(&a.as_str()))
            && answer_stands(transfer, b, index)
    })
}

/// The same fold over the transfers and answers `visible` lets in (a block's causal past): each block read as it is among all held.
fn ownership_within(thing_hash: &str, index: &Index, visible: &dyn Fn(&str) -> bool, now: &str) -> Ownership {
    let Some(thing) = index.get(thing_hash).filter(|_| visible(thing_hash)) else {
        return Ownership {
            owner: None,
            transfers: vec![],
            conflict: None,
        };
    };
    // Nothing reaches a person: no word makes an actor property, so a share, a hold or a pawn that names one counts for nothing (core.md, section 11).
    if type_of(thing) == "actor" {
        return Ownership { owner: None, transfers: vec![], conflict: None };
    }
    // A kind has no owner (things.md, Things): a thing that some counted thing names in `refs.of` is a description; its instances have owners.
    if index.values().any(|b| visible(hash_of(b)) && list(rf(b, "of")).contains(&thing_hash) && crate::identity::counts_in(b, index)) {
        return Ownership { owner: None, transfers: vec![], conflict: None };
    }
    // An idea is not property, and the record cannot tell a recipe from a tray: a thing is owned only once its own record shows it is an instance
    // (things.md, Things). It names its kind (`refs.of`), or it was made (`refs.derives_from`), or it names what it is part of or where it is
    // (`refs.subject`: a share, a use; `refs.place`). A bare thing is a description until then, with no owner and nothing to sell.
    let shows_instance = ["of", "derives_from", "subject", "place"].iter().any(|k| !list(rf(thing, k)).is_empty());
    if !shows_instance {
        return Ownership { owner: None, transfers: vec![], conflict: None };
    }
    // The maker is who the thing's block speaks for: a thing made `as` a circle is the circle's.
    let mut owner: Option<String> = speaker_of(thing, index, None);
    // Produce of a thing (things.md, Transforms and keeps): what a keep makes belongs first to the owner of the thing kept, where the keep stands.
    if let Some(produce) = produce_owner(thing, index, visible) {
        owner = Some(produce);
    }
    let mut last: Option<&Value> = None;
    let accepted = |transfer: &Value| accepted_by_receiver(transfer, index, visible);
    // A fork voids what the forker claims, never what they owe (folds.md, A fork is a burden): a giver's transfer to a named receiver that the
    // receiver accepted is owed, and stands though the giver later forked; goods moved to an open receiver on the giver's word alone do not.
    let owed = |b: &Value| rf(b, "to_owner").is_some() && crate::identity::fork_burden(b, index);
    let candidates: Vec<&Value> = index
        .values()
        .filter(|b| {
            type_of(b) == "transfer"
                && visible(hash_of(b))
                && (crate::identity::counts_in(b, index) || owed(b))
                && st(b, "status").is_none()
                && list(rf(b, "what")).contains(&thing_hash)
                && st(b, "amount").is_none()
                && (rf(b, "to_owner").is_some() || st(b, "count").is_some())
        })
        .collect();
    // The costly tests (the receiver's accept, the condition) run last, and only on a transfer the current owner signed: a stranger's transfer
    // that names the thing is never read, so it costs the reader nothing.
    let stands = |b: &Value| {
        (if rf(b, "to_owner").is_some() { accepted(b) } else { st(b, "count").is_some() })
            && st(b, "condition").is_none_or(|c| condition_holds_in(b, c, index, &|x| visible(hash_of(x)), now) && !let_go(b, c, index, visible))
    };
    let mut transfers: Vec<String> = Vec::new();
    loop {
        let o = owner.as_deref();
        let open: Vec<&Value> = candidates
            .iter()
            .copied()
            .filter(|b| {
                !transfers.iter().any(|t| t == hash_of(b))
                    && o.is_some()
                    && speaker_of(b, index, None).as_deref() == o
                    && last.is_none_or(|l| sees_in(b, hash_of(l), index))
                    && stands(b)
            })
            .collect();
        let mut next = earliest(&open, index);
        // After a death recorded under her own successor grant, the person's own gift that crosses what her successor gave under that
        // grant moves nothing (decision E7): her gift has a trigger under the grant in its causal past (she saw her death recorded), and
        // her successor's transfer counts as hers (her own grant and the witnesses she chose put it there). Giving away what her own word
        // may already have passed on is her broken promise to her receiver, never a cloud on the buyer's title. A gift that saw no
        // trigger still crosses.
        if next.len() > 1 {
            let kept: Vec<&Value> = next.iter().copied().filter(|b| !yields_to_successor(b, &next, index)).collect();
            if !kept.is_empty() {
                next = kept;
            }
        }
        if next.len() > 1 {
            return Ownership {
                owner,
                transfers,
                conflict: Some(sorted_set(next.iter().map(|b| hash_of(b)))),
            };
        }
        let Some(n) = next.first() else {
            return Ownership {
                owner,
                transfers,
                conflict: None,
            };
        };
        last = Some(n);
        transfers.push(hash_of(n).to_string());
        owner = list(rf(n, "to_owner")).first().map(|s| s.to_string());
        if owner.is_none() {
            // Letting go with no receiver (things.md, Transfers): the title ended. Whoever next takes the thing by first use, seeing the let-go,
            // is its first owner in the record, as with wild food; two who do not see each other are a conflict.
            let takers: Vec<&Value> = index
                .values()
                .filter(|b| {
                    type_of(b) == "transform"
                        && visible(hash_of(b))
                        && rf(b, "derives_from").is_none()
                        && rs(b, "subject") == Some(thing_hash)
                        && crate::identity::counts_in(b, index)
                        && sees_in(b, hash_of(n), index)
                })
                .collect();
            // Whoever lets go may name a clock (`keepers` on the hand-over): then the first taker that clock received is the first owner, and two the
            // clock received at one moment are a conflict. With none named, or none received, the takers are read in causal order, as with wild food.
            let by_clock: Option<Vec<&Value>> = st(n, "keepers").and_then(crate::tasks::keepers_of).and_then(|k| {
                let mut got: Vec<(String, &Value)> = takers.iter().filter_map(|t| super::clock::received_at(hash_of(t), &k, index).map(|at| (at, *t))).collect();
                got.sort_by(|a, b| a.0.cmp(&b.0));
                let first = got.first()?.0.clone();
                Some(got.into_iter().filter(|(at, _)| *at == first).map(|(_, t)| t).collect())
            });
            let firsts = by_clock.unwrap_or_else(|| earliest(&takers, index));
            match firsts.len() {
                0 => return Ownership { owner, transfers, conflict: None },
                1 => {
                    owner = speaker_of(firsts[0], index, None);
                    last = Some(firsts[0]);
                    if owner.is_none() {
                        return Ownership { owner, transfers, conflict: None };
                    }
                }
                _ => return Ownership { owner: None, transfers, conflict: Some(sorted_set(firsts.iter().map(|b| hash_of(b)))) },
            }
        }
    }
}

/// Produce of a thing (things.md): the first owner of an output of a keep (a counted `transform` that names a thing in `refs.subject` and
/// consumes nothing) is the owner of the thing kept where the keep stands. Only when exactly one such keep is among the output's `derives_from`.
fn produce_owner(thing: &Value, index: &Index, visible: &dyn Fn(&str) -> bool) -> Option<String> {
    if type_of(thing) != "thing" {
        return None;
    }
    let keeps: Vec<&Value> = list(rf(thing, "derives_from"))
        .into_iter()
        .filter_map(|h| index.get(h))
        .filter(|k| type_of(k) == "transform" && visible(hash_of(k)) && rf(k, "derives_from").is_none() && rs(k, "subject").is_some() && crate::identity::counts_in(k, index))
        .collect();
    let [keep] = keeps.as_slice() else { return None };
    let means = rs(keep, "subject")?;
    if !index.get(means).is_some_and(|m| type_of(m) == "thing") {
        return None;
    }
    let past = index.past_of(keep);
    ownership_within(means, index, &|h| visible(h) && past.contains(h), "").owner
}

// Whether a transfer the person signed in her own name (no grant) yields to a crossing transfer her successor made under her successor
// grant: her transfer's causal past holds a trigger under that grant (decision E7).
fn yields_to_successor(b: &Value, crossing: &[&Value], index: &Index) -> bool {
    let Some(person) = rs(b, "author").filter(|_| rf(b, "under").is_none() && rf(b, "as").is_none()) else { return false };
    let past = index.past_of(b);
    crossing.iter().any(|x| {
        hash_of(x) != hash_of(b)
            && rs(x, "under").and_then(|h| index.get(h)).is_some_and(|g| {
                type_of(g) == "grant"
                    && ss(g, "kind") == Some("successor")
                    && rs(g, "author") == Some(person)
                    && rs(g, "to") == rs(x, "author")
                    && index.values().any(|o| type_of(o) == "observe" && ss(o, "kind") == Some("trigger") && rs(o, "under") == Some(hash_of(g)) && past.contains(hash_of(o)))
            })
    })
}

/// Who owned a thing as a block saw it: the ownership fold of the block's causal past (promises.md, Bearer: a side that names a thing is
/// its owner where each block of the deal stands, never "now", so a note passed on after it was redeemed carries nothing back).
pub(crate) fn owner_seen_by(thing: &str, block: &Value, index: &Index) -> Option<String> {
    let past = index.past_of(block);
    ownership_within(thing, index, &|h| past.contains(h), "").owner
}

/// Who owns a thing among the blocks read (no clock).
pub(crate) fn owner_whole(thing: &str, index: &Index) -> Option<String> {
    ownership_within(thing, index, &|_| true, "").owner
}

/// Who owns an instance now.
pub fn owner_of(instance: &Value, blocks: &[Value]) -> Option<String> {
    ownership(instance, blocks).owner
}

/// Who receives a bearer promise (refs.to names a thing): whoever owns it now; otherwise refs.to itself.
pub fn receiver_of(promise: &Value, blocks: &[Value]) -> Option<String> {
    let index = crate::js::held_index(blocks);
    let to = rs(promise, "to")?;
    match index.get(to) {
        Some(t) if type_of(t) == "thing" => owner_of(t, blocks),
        _ => Some(to.to_string()),
    }
}

/// Where a thing is now: the `to_place` of its latest counted move (by whoever owned it where that move stands, or a holder such an
/// owner named), else
/// its own refs.place; a place that is a thing is wherever that thing is (stopping at a repeat). Two moves that do not
/// see each other give both places. A sorted list of hashes.
pub fn where_now(thing: &Value, blocks: &[Value]) -> Vec<String> {
    let index = crate::js::held_index(blocks);
    let read = read_all(index.values());
    where_now_in(thing, &index, &read, &mut Vec::new())
}

fn where_now_in(thing: &Value, index: &Index, read: &Index, seen: &mut Vec<String>) -> Vec<String> {
    let me = index.get(hash_of(thing)).unwrap_or(thing).clone();
    let h = hash_of(&me).to_string();
    if seen.contains(&h) {
        return vec![h];
    }
    // a place inside a place nests only so deep (limits.depth_read): past it the chain stops at the place reached
    if seen.len() >= crate::spec().depth_read {
        return vec![h];
    }
    seen.push(h.clone());
    // the blocks read, with the thing itself among them: built only when the thing is not already there, never once per level (release 17)
    let extended;
    let with_me: &Index = if read.contains_key(&h) {
        read
    } else {
        let mut one = read.clone();
        one.insert(h.clone(), me.clone());
        extended = one;
        &extended
    };
    // a move counts when its signer owned the thing where that move stands (the ownership fold of its causal past), or holds it for
    // one who did: a thing sold does not jump back to where it was made, nor away from where its last owner put it (decision F7)
    let owned_by_signer = |b: &Value| {
        let signer = speaker_of(b, read, None);
        signer.is_some() && signer == owner_seen_by(&h, b, with_me)
    };
    let all: Vec<&Value> = read
        .values()
        .filter(|b| {
            type_of(b) == "transfer"
                && st(b, "status").is_none()
                && list(rf(b, "what")).contains(&h.as_str())
                && crate::identity::counts_in(b, read)
        })
        .collect();
    let mut holders: Vec<Option<String>> = vec![];
    for b in &all {
        if owned_by_signer(b) {
            holders.extend(
                list(rf(b, "to_holder"))
                    .into_iter()
                    .map(|x| Some(x.to_string())),
            );
        }
    }
    let moves: Vec<Value> = all
        .iter()
        .filter(|b| {
            rf(b, "to_place").is_some() && (owned_by_signer(b) || holders.contains(&speaker_of(b, read, None)))
        })
        .map(|b| (*b).clone())
        .collect();
    let places: Vec<String> = if !moves.is_empty() {
        // two moves see each other through every block held, not only through other moves (folds.md: seeing is the causal past)
        let seen: Vec<_> = moves.iter().map(|m| read.past_of(m)).collect();
        let heads: Vec<&Value> = moves.iter().filter(|b| !seen.iter().any(|p| p.hashes().iter().any(|h| h == hash_of(b)))).collect();
        unique(heads.iter().flat_map(|b| {
            list(rf(b, "to_place"))
                .into_iter()
                .map(String::from)
                .collect::<Vec<_>>()
        }))
    } else {
        list(rf(&me, "place"))
            .into_iter()
            .map(String::from)
            .collect()
    };
    let mut out: Vec<String> = Vec::new();
    for place in places {
        match index.get(&place) {
            Some(at) if type_of(at) == "thing" => {
                let further = where_now_in(at, index, read, seen);
                if further.is_empty() {
                    out.push(place);
                } else {
                    out.extend(further);
                }
            }
            _ => out.push(place),
        }
    }
    sorted_set(out)
}
