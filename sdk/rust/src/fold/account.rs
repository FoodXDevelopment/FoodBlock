//! `account_of`: where a person says money to them goes (promises.md, Settling: Where to pay me). Their own signed word, a pair of who and where.
use crate::js::{hash_of, rs, ss, st, type_of};
use crate::order::sees_in;
use crate::prelude::*;

/// The account of `who`: among the `observe` blocks of kind `account` that `who` signed and that speak for no one else (not `as` a circle, not
/// under a grant: an agent's word under a grant is the grant's principal's, and her account is what she signs herself), the head is the one no other of theirs has in its causal past. Returns `{ who, destination, hash, at }`, or null when they
/// have none, when two heads stand that do not see each other (nothing fills the choice in), or when the head states no `destination` (it ends the
/// account). The word is read from the blocks alone: no clock is read and no later word is guessed at.
pub fn account_of(who: &str, blocks: &[Value]) -> Value {
    let index = super::read_all(blocks.iter());
    let words: Vec<&Value> = index
        .values()
        .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("account") && st(o, "status").is_none() && rs(o, "author") == Some(who))
        .filter(|o| crate::identity::counts_in(o, &index) && super::speaker_of(o, &index, None).as_deref() == Some(who))
        .collect();
    let heads: Vec<&&Value> = words.iter().filter(|w| !words.iter().any(|o| hash_of(o) != hash_of(w) && sees_in(o, hash_of(w), &index))).collect();
    let [head] = heads.as_slice() else { return Value::Null };
    match ss(head, "destination").filter(|d| !d.trim().is_empty()) {
        Some(destination) => json!({ "who": who, "destination": destination, "hash": hash_of(head), "at": ss(head, "at") }),
        None => Value::Null,
    }
}
