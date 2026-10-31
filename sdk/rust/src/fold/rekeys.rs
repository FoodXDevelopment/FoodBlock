//! A circle's key, by epoch (§8, the rekeys profile).
use super::circle::may_with_in;
use super::read_all;
use crate::js::{hash_of, int, list, rf, rs, sorted_set, ss, st, type_of};
use crate::prelude::*;

/// A circle's encryption key now: the key grants signed as the circle by a holder of the power rekey, each with state.epoch one higher,
/// naming epoch n-1 in after. Two rekeys in one epoch both open; the next settles. Returns `{ epoch, keys, grants }`.
pub fn circle_key(circle: &str, blocks: &[Value]) -> Value {
    let read = read_all(blocks);
    let Some(root) = read.get(circle) else {
        return json!({ "epoch": 0, "keys": [], "grants": [] });
    };
    let rekeys: Vec<&Value> = read
        .values()
        .filter(|b| {
            type_of(b) == "grant"
                && ss(b, "kind") == Some("key")
                && rs(b, "subject") == Some(circle)
                && rs(b, "as") == Some(circle)
                && int(st(b, "epoch")).is_some()
                && ss(b, "public_key_encrypt").is_some()
                && crate::identity::counts_in(b, &read)
        })
        .filter(|b| may_with_in(b, circle, &read, None, "rekey"))
        .collect();
    let mut epoch = 0i64;
    let mut open: Vec<(String, String)> = vec![(
        hash_of(root).to_string(),
        ss(root, "public_key_encrypt").unwrap_or("").to_string(),
    )];
    for next in 1.. {
        let these: Vec<(String, String)> = rekeys
            .iter()
            .filter(|b| {
                int(st(b, "epoch")) == Some(next as f64)
                    && open
                        .iter()
                        .any(|(h, _)| list(rf(b, "after")).contains(&h.as_str()))
            })
            .map(|b| (hash_of(b).to_string(), ss(b, "public_key_encrypt").unwrap_or("").to_string()))
            .collect();
        if these.is_empty() {
            break;
        }
        epoch = next;
        open = these;
    }
    // a circle that names no key has none to list; at epoch 0 the key is the circle actor's own, and no rekey is counted, so no grant
    let grants: Vec<String> = if epoch == 0 { Vec::new() } else { sorted_set(open.iter().map(|o| &o.0)) };
    json!({ "epoch": epoch, "keys": sorted_set(open.iter().map(|o| &o.1).filter(|k| !k.is_empty())), "grants": grants })
}
