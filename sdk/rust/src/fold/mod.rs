//! The folds (modules/folds.md): a set of blocks read into one answer, the same on every node from the same blocks.
//! A fold reads no clock and no arrival; the views that do are in views.rs. No step breaks a tie on authority by
//! hash.
use crate::js::{hash_of, index_of, rs, type_of, Index};
use crate::prelude::*;

mod bench;
mod owed;
mod circle;
pub(crate) mod clock;
mod deal;
mod invasion;
mod pot;
mod release;
mod promise;
mod settle;
#[cfg(feature = "rekeys")]
mod rekeys;
#[cfg(feature = "successor")]
mod successor;
mod things;
mod uses;

#[cfg(feature = "rekeys")]
pub use rekeys::circle_key;
pub(crate) use circle::{holds_then, may_act_as_in};
pub use circle::{circle_state, circle_state_in, holders_of, may_act_as, members_then, CircleState, Member};
pub(crate) use promise::promise_stage_in;
pub use promise::{promise_stage, terms_total, StageOptions};
pub(crate) use promise::binds;
#[cfg(feature = "successor")]
pub use successor::successor_state;
pub use invasion::{invasion_shown, not_free_shown};
pub use pot::pot;
pub use release::{bids_shown, release_shown};
pub use uses::{shares_on, use_shown};
pub(crate) use things::{owner_seen_by, owner_whole};
pub use things::{owner_of, ownership, ownership_at, ownership_view, receiver_of, where_now, Ownership};

/// The blocks held, by hash, with the forks marked once (a pair of one key naming one prev counts for nothing).
pub(crate) fn read_all<'a>(blocks: impl IntoIterator<Item = &'a Value>) -> Index {
    read_all_at(blocks, None)
}
/// The blocks read for a view that applies the reader's arrivals (the recovery reach): a block the reach protects counts (decision c9).
pub(crate) fn read_all_at<'a>(blocks: impl IntoIterator<Item = &'a Value>, arrived_at: crate::identity::ArrivedAt) -> Index {
    let mut index = Index::default();
    for b in blocks {
        index.insert(hash_of(b).to_string(), b.clone());
    }
    let mut index = crate::js::closed(index);
    crate::identity::mark_forks_at(&mut index, arrived_at);
    index
}
fn sub_index(blocks: &[&Value]) -> Index {
    index_of(blocks.iter().copied())
}

// ---- Who a block speaks for ----
// Who a block speaks for (folds.md, Who a block speaks for): one party. A block that names a circle in `as` speaks for that
// circle when its author may sign for it (the `sign` power in the circle's fold of the block's causal past), else for
// no one (`no_role`). Otherwise a block under a live grant, made for its receiver, speaks for the grant's grantor; any other
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
            return principal_of(grant, index);
        }
    }
    principal_of(block, index)
}
// The grant a block acts under (folds.md, Who a block speaks for): its `refs.under`, when the block passes the same authority test the
// door reports (`why_not_under`: made for its author, live for it, its act covered by exact name, every side it deals with in the
// grant's parties, and an act that moves things or binds backed as rule 23 says). A fold and the door never disagree. One exception: a
// promise with no status (an offer, an ask, a counter) under a live grant made for its author that fails the rest is a quote request:
// it speaks for its principal and binds no one (promises.md). Any other block that fails acts under no grant: it speaks for its author.
pub(crate) fn acting_grant<'a>(block: &Value, index: &'a Index, now: Option<&str>) -> Option<&'a Value> {
    let grant = rs(block, "under").and_then(|h| index.get(h)).filter(|g| type_of(g) == "grant")?;
    let made_for = crate::grant::receives(grant, block, index) && crate::grant::why_not_live_for(Some(grant), index, now, block).is_empty();
    let quote = type_of(block) == "promise" && crate::js::st(block, "status").is_none();
    (made_for && (quote || names_act(block, index, now))).then_some(grant)
}
/// Whether a block under a grant has the whole authority the grant gives: the door's test, empty (authority.md).
pub(crate) fn names_act(block: &Value, index: &Index, now: Option<&str>) -> bool {
    crate::grant::why_not_under_in(block, index, now).is_empty()
}
// The principal of a block: the circle it was signed `as` (when its author may sign for it), else its author. The one rule for a block
// and for the grant it acts under (folds.md, Who a block speaks for).
pub(crate) fn principal_of(block: &Value, index: &Index) -> Option<String> {
    match rs(block, "as").filter(|c| !c.is_empty()) {
        Some(circle) => may_act_as_in(block, circle, index, None).then(|| circle.to_string()),
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
