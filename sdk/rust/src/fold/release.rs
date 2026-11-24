//! A release and sealed bids (promises.md, A release; profiles/bids.md): two readings that show facts and move nothing.
//! `release_shown`: whose claims on a deal or a thing a signer has let go of, and which debts a general release names as still open.
use super::speaker_of;
use crate::js::{cmp16, hash_of, list, rf, rs, ss, st, type_of};
use crate::order::sees_in;
use crate::prelude::*;

fn held_with(block: &Value, blocks: &[Value]) -> crate::js::Index {
    super::read_all(core::iter::once(block).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()))
}

/// A release is an `observe` of kind `release`, signed by the one who lets go. It binds only its signer and lets go only of her own claims.
/// With `refs.subject` it lets go of her claims on that deal or thing. Without, it lets go of her claims on every deal with `refs.to`
/// (the other side) whose first promise it has in its causal past, except the deals `state.except` lists, which stay open. Only a side of
/// a deal lets go of its claims. Returns `{ subject, released: [{ block, by, side, to }], kept_open: [{ block, by, side }] }`, each sorted by
/// block: `side` is `from` or `to` for a deal (the price is to come to `from`, what moves to `to`), null for a thing.
pub fn release_shown(subject: &Value, blocks: &[Value]) -> Value {
    let index = held_with(subject, blocks);
    let sh = hash_of(subject).to_string();
    let deal = type_of(subject) == "promise" && list(rf(subject, "answers")).is_empty();
    let side_of = |id: &str| -> Option<&'static str> {
        if !deal {
            None
        } else if rs(subject, "from") == Some(id) {
            Some("from")
        } else if rs(subject, "to") == Some(id) {
            Some("to")
        } else {
            None
        }
    };
    let (mut released, mut kept): (Vec<(String, Value)>, Vec<(String, Value)>) = (vec![], vec![]);
    for o in index.values().filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("release") && st(o, "status").is_none() && crate::forks::counts_in(o, &index)) {
        let Some(by) = speaker_of(o, &index, None) else { continue };
        let side = side_of(&by);
        if deal && side.is_none() {
            continue;
        }
        let entry = json!({ "block": hash_of(o), "by": by, "side": side, "to": rs(o, "to") });
        match rs(o, "subject") {
            Some(s) if s == sh => released.push((hash_of(o).to_string(), entry)),
            Some(_) => {}
            None => {
                let other = if side == Some("from") { rs(subject, "to") } else { rs(subject, "from") };
                if !deal || other.is_none() || rs(o, "to") != other || !sees_in(o, &sh, &index) {
                    continue;
                }
                if list(st(o, "except")).contains(&sh.as_str()) {
                    kept.push((hash_of(o).to_string(), json!({ "block": hash_of(o), "by": by, "side": side })));
                } else {
                    released.push((hash_of(o).to_string(), entry));
                }
            }
        }
    }
    let sorted = |mut v: Vec<(String, Value)>| -> Vec<Value> {
        v.sort_by(|a, b| cmp16(&a.0, &b.0));
        v.into_iter().map(|x| x.1).collect()
    };
    json!({ "subject": sh, "released": sorted(released), "kept_open": sorted(kept) })
}
