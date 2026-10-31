//! The named clock (blocks.md, A named clock): the parties name `keepers`, and a block is dated by what they signed of it. A block's
//! own `at` never dates it for anyone else. Every rule that says "by T" on a clock (a condition `without`, an offer's `expires`, an
//! event `when`, an event repeat) reads this one primitive.
use super::{holds_then, speaker_of};
use crate::js::{list, rf, rs, ss, st, type_of, Index};
pub(crate) use crate::tasks::Keepers;
use crate::prelude::*;

/// The keeper a signed block speaks as: its author for a name that is an id (or the circle it signs `as`), any holder of the role for
/// a `circle#role`. Returns the author's id, the voice that counts once.
pub(crate) fn keeper_voice(o: &Value, k: &Keepers, index: &Index) -> Option<String> {
    let author = rs(o, "author")?;
    k.names.iter().any(|name| match name.contains('#') {
        true => holds_then(o, name, index).is_some_and(|ids| ids.iter().any(|h| h == author)),
        false => name == author || speaker_of(o, index, None).as_deref() == Some(name.as_str()),
    })
    .then(|| author.to_string())
}

/// The needed-th time in a list of (voice, time), earliest first (`latest` reads from the other end): None until `needed` different
/// voices have each signed one.
fn kth(mut voices: Vec<(String, String)>, needed: usize, latest: bool) -> Option<String> {
    // one voice counts once: its earliest time (or, for a cutoff, its latest)
    voices.sort_by(|a, b| a.0.cmp(&b.0).then(if latest { b.1.cmp(&a.1) } else { a.1.cmp(&b.1) }));
    voices.dedup_by(|b, a| a.0 == b.0);
    voices.sort_by(|a, b| if latest { b.1.cmp(&a.1) } else { a.1.cmp(&b.1) });
    voices.get(needed.checked_sub(1)?).map(|v| v.1.clone())
}

/// When `needed` keepers had each received the block: the needed-th earliest of their counted receipts (an `observe` of kind `receipt`,
/// `derives_from` the block, signed by the keeper, `state.at` the time it received it). None while fewer have.
pub(crate) fn received_at(target: &str, k: &Keepers, index: &Index) -> Option<String> {
    let voices: Vec<(String, String)> = index
        .values()
        .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("receipt") && list(rf(o, "derives_from")).contains(&target) && crate::identity::counts_in(o, index))
        .filter_map(|o| Some((keeper_voice(o, k, index)?, ss(o, "at")?.to_string())))
        .collect();
    kth(voices, k.needed, false)
}

/// Whether `needed` keepers had received the block by `t`.
pub(crate) fn received_by(target: &str, k: &Keepers, index: &Index, t: &str) -> bool {
    received_at(target, k, index).is_some_and(|at| at.as_str() <= t)
}

/// The time `needed` keepers have each signed "closed" through: an `observe` of kind `cutoff`, `state.when` an instant, meaning no receipt
/// of theirs dated up to then is still to come. The needed-th latest of their counted cutoffs.
pub(crate) fn closed_through(k: &Keepers, index: &Index) -> Option<String> {
    let voices: Vec<(String, String)> = index
        .values()
        .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("cutoff") && crate::identity::counts_in(o, index))
        .filter_map(|o| Some((keeper_voice(o, k, index)?, st(o, "when").and_then(Value::as_str).filter(|w| crate::time::is_time(Some(&Value::String((*w).into()))))?.to_string())))
        .collect();
    kth(voices, k.needed, true)
}
