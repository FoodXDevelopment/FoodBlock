//! `account_of`: where a person says money to them goes (promises.md, Settling: Where to pay me). Their own signed word, a pair of who and where.
use crate::js::{hash_of, rs, ss, st, type_of};
use crate::order::sees_in;
use crate::prelude::*;

/// The account of `who`: among the `observe` blocks of kind `account` that `who` signed and that speak for no one else (not `as` a circle, not
/// under a grant: an agent's word under a grant is the grant's principal's, and her account is what she signs herself), the head is the one no other of theirs has in its causal past. Returns `{ who, destinations: [{ destination, by }], hash, at }`, or null when they
/// have none, when two heads stand that do not see each other (nothing fills the choice in), or when the head lists no place (it ends the
/// account). The word is read from the blocks alone: no clock is read and no later word is guessed at.
pub fn account_of(who: &str, blocks: &[Value]) -> Value {
    let index = super::read_all(blocks.iter());
    let words: Vec<&Value> = index
        .values()
        .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("account") && st(o, "status").is_none() && signed_for(o, who))
        .filter(|o| crate::forks::counts_in(o, &index) && super::speaker_of(o, &index, None).as_deref() == Some(who))
        .collect();
    let heads: Vec<&&Value> = words.iter().filter(|w| !words.iter().any(|o| hash_of(o) != hash_of(w) && sees_in(o, hash_of(w), &index))).collect();
    let [head] = heads.as_slice() else { return Value::Null };
    // one account word holds a list of her places, `destinations: [{ destination, by }]`
    match places(head) {
        Some(list) if !list.is_empty() => json!({ "who": who, "destinations": list, "hash": hash_of(head), "at": ss(head, "at") }),
        _ => Value::Null,
    }
}

/// The places an account word lists, each `{ destination, by }` (`by` the id that speaks for that place); None when the list is not one.
pub(crate) fn places(word: &Value) -> Option<Vec<Value>> {
    let items = st(word, "destinations")?.as_array()?;
    items
        .iter()
        .map(|d| {
            let o = d.as_object()?;
            let dest = o.get("destination")?.as_str().filter(|t| !t.trim().is_empty())?;
            let by = o.get("by")?.as_str()?;
            (o.len() == 2).then(|| json!({ "destination": dest, "by": by }))
        })
        .collect()
}

/// Whether `word` is `who`'s account head where `at` stands: one of her counted account words, in `at`'s past, that no other of
/// hers in `at`'s past has in its own past (two heads that do not see each other name none).
pub(crate) fn head_where(who: &str, word: &str, at: &Value, index: &crate::js::Index) -> bool {
    let past = index.past_of(at);
    let words: Vec<&Value> = index
        .values()
        .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("account") && st(o, "status").is_none() && signed_for(o, who) && past.contains(hash_of(o)))
        .filter(|o| crate::forks::counts_in(o, index) && super::speaker_of(o, index, None).as_deref() == Some(who))
        .collect();
    let heads: Vec<&&Value> = words.iter().filter(|w| !words.iter().any(|o| hash_of(o) != hash_of(w) && sees_in(o, hash_of(w), index))).collect();
    matches!(heads.as_slice(), [h] if hash_of(h) == word)
}

/// An account word is one `who` signed, or one signed `as` her circle (it counts for the circle where a row whose
/// `scope.types` names `observe.account` holds for it, or every owner signs it: `speaker_of` reads which).
fn signed_for(o: &Value, who: &str) -> bool {
    match rs(o, "as").filter(|c| !c.is_empty()) {
        Some(c) => c == who,
        None => rs(o, "author") == Some(who),
    }
}
