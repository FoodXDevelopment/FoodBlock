//! The named clock (blocks.md, A named clock): the parties name `clocks`, and a block is placed by where their receipts sit on their lines.
//! A block's own `at` never dates it for anyone else, and no date orders two receipts (blocks.md, A named clock): a receipt is before
//! another where the other has it in its causal past, and a time a word states is shown only by its clocks' cutoffs, by their place. Every
//! rule that says "by T" on a clock (a condition `within` or `without`, an offer's `expires`, a bid's deadline) reads these primitives.
use super::speaker_of;
use crate::js::{rs, Index};
use crate::line::{before_time, line_named, receipts_of};
pub(crate) use crate::tasks::Clocks;
use crate::prelude::*;

/// The clock a signed block speaks as: its author for a name that is an id (or the circle it signs `as`). Returns the author's id, the
/// voice that counts once.
pub(crate) fn clock_voice(o: &Value, k: &Clocks, index: &Index) -> Option<String> {
    let author = rs(o, "author")?;
    k.names.iter().any(|name| name == author || speaker_of(o, index, None).as_deref() == Some(name.as_str()))
    .then(|| author.to_string())
}

/// Of two blocks, `x` came first on a clock where `needed` of its lines each hold a receipt of `x` before any receipt of `y`.
/// A receipt's place on its clock's line is its time; its `at` orders nothing. A line that holds a receipt of `x` and none of `y` shows
/// `x` first.
pub(crate) fn came_first(x: &str, y: &str, k: &Clocks, index: &Index) -> bool {
    let all = |_: &str| true;
    let n = k
        .names
        .iter()
        .filter_map(|name| line_named(name, index))
        .filter(|line| {
            let (rx, ry) = (receipts_of(x, line, index, &all), receipts_of(y, line, index, &all));
            !rx.is_empty() && (ry.is_empty() || rx.iter().any(|a| ry.iter().all(|b| crate::line::before(a, b, index))))
        })
        .count();
    n >= k.needed
}

/// How many of a clock's lines show a block before the time `t` (the word's own text for it), and how many show it after: (before, after).
/// A line that shows neither yet counts in neither.
pub(crate) fn by_time(target: &str, t: &str, subject: Option<&str>, k: &Clocks, index: &Index, vis: &dyn Fn(&str) -> bool) -> (usize, usize) {
    let (mut yes, mut no) = (0, 0);
    for line in k.names.iter().filter_map(|name| line_named(name, index)) {
        match before_time(target, t, subject, &line, index, vis) {
            Some(true) => yes += 1,
            Some(false) => no += 1,
            None => {}
        }
    }
    (yes, no)
}

/// Whether `needed` clocks show a block received before the time `t`: the reading that moves a thing out of its signer's hand or widens
/// what a word allows (Which reading needs `needed`).
pub(crate) fn received_by(target: &str, k: &Clocks, index: &Index, t: &str) -> bool {
    by_time(target, t, None, k, index, &|_| true).0 >= k.needed
}

/// A reading, binding no one: the date a clock's own receipt of a block states, for a view to print (a deal's `due`, a
/// message's `received_at`, a claim's `notified`, a use's date). The first receipt on each line by place; the `needed`-th of the lines'
/// dates as their signers wrote them. No rule reads it.
/// The views that print a clock's date print what the receipts themselves say (the text does not say; read so); no rule reads it.
pub(crate) fn receipt_at(target: &str, k: &Clocks, index: &Index) -> Option<String> {
    let all = |_: &str| true;
    let mut dates: Vec<String> = k
        .names
        .iter()
        .filter_map(|name| line_named(name, index))
        .filter_map(|line| {
            let rx = receipts_of(target, &line, index, &all);
            let first = rx.iter().find(|r| !rx.iter().any(|o| crate::line::before(o, r, index)))?;
            crate::js::ss(first, "at").map(String::from)
        })
        .collect();
    dates.sort();
    dates.get(k.needed.checked_sub(1)?).cloned()
}
