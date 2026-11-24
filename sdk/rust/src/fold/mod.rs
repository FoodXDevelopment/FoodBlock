//! The folds (modules/folds.md): a set of blocks read into one answer, the same on every node from the same blocks.
//! A fold reads no clock and no arrival; the views that do are in views.rs. No step breaks a tie on authority by
//! hash.
use crate::js::{hash_of, index_of, rs, type_of, Index};
use crate::prelude::*;

pub(crate) mod account;
mod backed;
mod bench;
mod gives;
pub(crate) mod grants;
mod market;
mod to_come;
pub(crate) mod circle;
pub(crate) mod clock;
mod deal;
mod draws;
mod invasion;
mod lock;
mod pot;
mod release;
mod promise;
mod settle;
#[cfg(feature = "rekeys")]
mod rekeys;
mod things;
mod uses;

#[cfg(feature = "rekeys")]
pub use rekeys::circle_key;
pub(crate) use circle::{as_drafted, hand_could_count, is_hand_at};
pub use circle::{circle_state, circle_versions, members_then, row_holds, ways_in};
pub(crate) use promise::{promise_stage_in, stopped_onward_by};
pub use crate::js::{lines_of, quantity_of, whats_of};
pub use promise::{promise_stage, terms_total, StageOptions};
pub(crate) use promise::binds;
pub use invasion::{invasion_shown, not_free_shown};
pub use account::account_of;
pub use backed::{backed, backed_all, to_come_back};
pub(crate) use backed::backed_in;
pub use gives::gives;
pub use grants::{keeps_to_door, lowest_offer, meter, worst_case};
pub use market::{check_reads, clearing_applied, fee_back, listing_check, ruling_honoured, ruling_releases};
pub(crate) use market::ruled;
pub use lock::machine_lock;
pub use pot::pot;
pub use release::release_shown;
pub use uses::{shares_on, use_shown};
pub(crate) use things::{owner_seen_by, owner_whole};
pub use things::{made_from, owner_of, ownership, ownership_at, receiver_of, where_now};

/// The blocks given, by hash, with the forks marked once (a pair of one key naming one prev counts for nothing).
/// A message that names a judge (promises.md, A new term both sides signed): an observe of kind message `for` the deal or claim
/// `subject`, stating `judge`, one id. Its judge, else None.
pub(crate) fn judge_named<'a>(g: &'a Value, subject: &str) -> Option<&'a str> {
    if type_of(g) != "observe" || crate::js::ss(g, "kind") != Some("message") || !crate::js::list(crate::js::rf(g, "for")).contains(&subject) {
        return None;
    }
    crate::js::ss(g, "judge").filter(|j| crate::spec().is("id", j))
}

pub(crate) fn read_all<'a>(blocks: impl IntoIterator<Item = &'a Value>) -> Index {
    let mut index = Index::default();
    for b in blocks {
        // a body is the block itself: a header given under the same id never takes its place
        if b.get("type").is_none() && index.get(hash_of(b)).is_some_and(|x| x.get("type").is_some()) {
            continue;
        }
        index.insert(hash_of(b).to_string(), b.clone());
    }
    let mut index = crate::js::closed(index);
    crate::forks::mark_forks(&mut index);
    index
}
fn sub_index(blocks: &[&Value]) -> Index {
    index_of(blocks.iter().copied())
}

// ---- Who a block speaks for ----
/// Who a block speaks for, read among `blocks` (authority.md, Who a block speaks for; the door's `speaks_for`): the one party a fold counts
/// it for, or None when it speaks for no one: signed `as` a circle by an author who does not hold `sign` there (or not with the hands the
/// circle needs), or a block no node would take, which is no word (folds.md, A fold reads only what is whole and valid). The block need not be
/// among `blocks` yet (a first message being checked): it is read with them as if it were. No clock is read: the block's own date tests `expires`.
pub fn who_speaks(block: &Value, blocks: &[Value]) -> Option<String> {
    let read = read_all(blocks.iter().filter(|b| hash_of(b) != hash_of(block)).chain([block]));
    speaker_of(read.get(hash_of(block))?, &read, None)
}
// Who a block speaks for (folds.md, Who a block speaks for): one party. A block that names a circle in `as` speaks for that
// circle's owners where a row holds for it or every owner signs it (circles.md), else for no one (`no_role`: waiting, acting on nothing). Otherwise a block under a live grant, made for its receiver, speaks for the grant's grantor; any other
// block speaks for its author.
pub(crate) fn speaker_of(block: &Value, index: &Index, now: Option<&str>) -> Option<String> {
    match now {
        None => index.speaker_memo(block, || speaker_now(block, index, None)),
        Some(_) => speaker_now(block, index, now),
    }
}
fn speaker_now(block: &Value, index: &Index, now: Option<&str>) -> Option<String> {
    // a block signed `as` a circle speaks for the circle or no one, whatever it acts under
    if rs(block, "as").is_none_or(str::is_empty) {
        if let Some(grant) = acting_grant(block, index, now) {
            return principal_of_chain(grant, index);
        }
    }
    principal_of(block, index)
}
/// The grants a grant stands on: itself, then each grant above it that it was passed on (`refs.parent`), to the first that was not passed on.
/// The one walk: `backed`, `gives` and `speaker_of` all read the top of a chain through it. Whether each link is live is `why_not_under_in`'s question.
pub(crate) fn grant_chain<'a>(grant: &'a Value, index: &'a Index) -> Vec<&'a Value> {
    let mut chain = vec![grant];
    while let Some(above) = rs(chain[chain.len() - 1], "parent").and_then(|h| index.get(h)) {
        chain.push(above);
    }
    chain
}
/// Whose word a grant is at the top of its chain: the principal of the last grant of `grant_chain`.
pub(crate) fn principal_of_chain(grant: &Value, index: &Index) -> Option<String> {
    grant_chain(grant, index).last().and_then(|top| principal_of(top, index))
}
// The grant a block acts under (folds.md, Who a block speaks for): its `refs.under`, when the block passes the same authority test the
// door reports (`why_not_under`: made for its author, live for it, its type covered by exact name, every side it deals with in the
// grant's parties, and a block that moves things or binds backed as rule 23 says). A fold and the door never disagree. One exception: a
// promise with no status (an offer, an ask, a counter) under a live grant made for its author that fails the rest is a quote request:
// it speaks for its principal and binds no one (promises.md). Any other block that fails acts under no grant: it speaks for its author.
pub(crate) fn acting_grant<'a>(block: &Value, index: &'a Index, now: Option<&str>) -> Option<&'a Value> {
    let grant = rs(block, "under").and_then(|h| index.get(h)).filter(|g| type_of(g) == "grant")?;
    // a promise a tool signs under a grant that keeps to no promise the grant names speaks for its signer alone (the quote
    // request that spoke for its principal is gone)
    names_act(block, index, now).then_some(grant)
}
/// Whether a block under a grant has the whole authority the grant gives: the door's test, empty (authority.md).
pub(crate) fn names_act(block: &Value, index: &Index, now: Option<&str>) -> bool {
    crate::grant::why_not_under_in(block, index, now).is_empty()
}
// The principal of a block: the circle it was signed `as` (when its author may sign for it), else its author. The one rule for a block
// and for the grant it acts under (folds.md, Who a block speaks for).
pub(crate) fn principal_of(block: &Value, index: &Index) -> Option<String> {
    match rs(block, "as").filter(|c| !c.is_empty()) {
        // it speaks for the circle's owners where a row holds for it or every owner signs it, else for no one
        Some(circle) => circle::holds_in(block, circle, index).then(|| circle.to_string()),
        None => rs(block, "author").map(String::from),
    }
}
fn speaks_for(block: &Value, side: Option<&str>, index: &Index, now: Option<&str>) -> bool {
    side.filter(|s| !s.is_empty()).is_some_and(|s| speaker_of(block, index, now).as_deref() == Some(s))
}

// ---- A secret ballot (§8) ----
/// Whether a voter's commitment is among those the named counter signed as counted (`state.counted`).
#[cfg(feature = "ballots")]
pub fn counted_in(result: &Value, commitment: &str, counter: &str) -> bool {
    rs(result, "author") == Some(counter) && crate::js::list(crate::js::st(result, "counted")).contains(&commitment)
}
