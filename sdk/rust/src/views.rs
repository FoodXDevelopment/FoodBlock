//! The views (modules/folds.md): a fold plus one more thing, the reader's clock or when blocks arrived on the reader's
//! node. A view is right for the reader that computes it and says whose clock it used; it may show but never decide what
//! another reader must accept. Each takes the clock or the arrivals as an argument: none reads the system clock.
use crate::identity::{signed_by_author_in, ArrivedAt};
#[allow(unused_imports)]
use crate::js::{get, hash_of, index_of, rs, ss, st, text, truthy, type_of, Index};
#[allow(unused_imports)]
use crate::order::sees_in;
use crate::prelude::*;

/// `live_grant`: the clock is that of the node that relies on the act, read when it takes the block in. True when every
/// grant's `scope.until` is later than the clock (a grant with no `until`, like a key grant, has no end of its own).
pub fn live_grant(grants: &[Value], now: &str) -> bool {
    grants.iter().all(|g| match get(g, "state.scope.until").filter(|u| truthy(Some(u))) {
        Some(until) => text(Some(until)).as_str() > now,
        None => true,
    })
}

/// `withdrawal_seen`: true when the withdrawal is in the causal past of the counterparty's block, or has arrived on the
/// counterparty's node (`arrived`: a lookup of arrivals there).
#[cfg(feature = "folds")]
pub fn withdrawal_seen(withdrawal: &Value, block: &Value, blocks: &[Value], arrived: ArrivedAt) -> bool {
    let index = index_of(blocks.iter().chain([withdrawal, block]));
    sees_in(block, hash_of(withdrawal), &index) || arrived.is_some_and(|f| f(hash_of(withdrawal)).is_some_and(|a| !a.is_empty()))
}

/// `due`: a promise with a relative `when` `{ after, wait }` falls due `wait` after the `after` block arrived on the
/// performer's node, counted on the performer's clock. The instant, or None while the anchor has not arrived.
pub fn due(promise: &Value, arrived: ArrivedAt) -> Option<String> {
    let when = get(promise, "state.when")?;
    let (after, wait) = (when.get("after")?.as_str()?, when.get("wait")?.as_str()?);
    let at = arrived.and_then(|f| f(after)).filter(|a| !a.is_empty())?;
    crate::time::add_duration(&at, wait, 1)
}

/// `recovery_reach`: the blocks a recovery rotation voids in the pure fold but the reach protects on this reader's node
/// (they, or a block of another identity that built on them, arrived before the reach began). Sorted.
pub fn recovery_reach(rotation: &Value, blocks: &[Value], arrived: ArrivedAt) -> Vec<String> {
    let index: Index = index_of(blocks.iter().chain([rotation]));
    let Some(id) = rs(rotation, "author") else { return vec![] };
    let mut out: Vec<String> = index
        .values()
        .filter(|b| rs(b, "author") == Some(id) && hash_of(b) != hash_of(rotation))
        .filter(|b| !signed_by_author_in(b, &index, None) && signed_by_author_in(b, &index, arrived))
        .map(|b| hash_of(b).to_string())
        .collect();
    out.sort();
    out
}

/// Whether a block's type is a promise (the view `promise_view` reads only promises).
#[cfg(feature = "folds")]
pub fn promise_view(first: &Value, blocks: &[Value], now: Option<&str>, confirmers: Vec<String>) -> Value {
    let options = crate::fold::StageOptions { confirmers, ..Default::default() };
    let mut stage = crate::fold::promise_stage(first, blocks, &options);
    // Stage 8 becomes expired once the reader's own clock passes `expires` and nothing binds.
    let st_name = ss_of(&stage, "stage");
    if matches!(st_name.as_str(), "offered" | "asked") {
        let offer = ss_of(&stage, "offer");
        let index = index_of(blocks.iter().chain([first]));
        let expires = index.get(&offer).and_then(|o| get(o, "state.terms.expires")).filter(|v| truthy(Some(v)));
        if matches!((now, expires), (Some(n), Some(e)) if !n.is_empty() && n > text(Some(e)).as_str()) {
            stage["stage"] = json!("expired");
        }
    }
    let _ = (type_of(first), st(first, "x"));
    stage
}

#[cfg(feature = "folds")]
fn ss_of(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or("").to_string()
}
#[allow(dead_code)]
fn _unused(b: &Value) -> Option<&str> {
    ss(b, "x")
}
