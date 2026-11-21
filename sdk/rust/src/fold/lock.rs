//! `machine_lock`: a reading (patterns/machines.md; 1.9 stage 7, D6 as 1.8 C6). A machine lock is a stop of a machine: a grant of kind
//! `stop` whose `refs.subject` is the machine. It is the owner's word when it is backed by the machine's owner as the ownership fold reads
//! him in the lock's causal past: his own block, or one signed under a grant of his. It ends as anything ends: by its author's stop. Any
//! other signer's stop of a machine is that signer's reading: shown (`claimed`), and locking nothing. The lock names no safe state.
use super::{backed_in, owner_seen_by};
use crate::js::{hash_of, rs, ss, type_of};
use crate::prelude::*;

/// `{ locked, locks, claimed }` for a machine (a thing) among the blocks held: `locks` the standing stops backed by the owner, `claimed`
/// the other standing stops of it, each sorted by id. `now` is the reader's clock for a stop's `scope.until` (a reading may read one).
pub fn machine_lock(machine: &Value, blocks: &[Value], now: Option<&str>) -> Value {
    let index = crate::js::held_index(blocks.iter().filter(|b| hash_of(b) != hash_of(machine)).chain([machine]));
    let m = hash_of(machine);
    let mut stops: Vec<&Value> = index
        .values()
        .filter(|b| {
            type_of(b) == "grant"
                && ss(b, "kind") == Some("stop")
                && ss(b, "status").is_none()
                && rs(b, "answers").is_none()
                && rs(b, "subject") == Some(m)
                && crate::identity::counts_in(b, &index)
                && crate::grant::why_not_live_in(Some(b), &index, now).is_empty()
        })
        .collect();
    stops.sort_by(|a, b| hash_of(a).cmp(hash_of(b)));
    let (mut locks, mut claimed) = (vec![], vec![]);
    for s in stops {
        let owners = owner_seen_by(m, s, &index).is_some_and(|o| backed_in(s, &o, &index));
        if owners { locks.push(json!(hash_of(s))) } else { claimed.push(json!(hash_of(s))) }
    }
    json!({ "locked": !locks.is_empty(), "locks": locks, "claimed": claimed })
}
