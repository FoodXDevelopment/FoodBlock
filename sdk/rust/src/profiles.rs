//! Small optional profiles whose code is only a check or two (spec/profiles): residency (where blocks may be stored)
//! and earnest (a node holds an ask until a earnest is paid; node policy, not protocol).
use crate::error::Refusal;
#[allow(unused_imports)]
use crate::js::{get, hash_of, list, rf, st, type_of};
use crate::prelude::*;

/// Residency (profiles/residency.md): a node's admission rule may list the regions it promises to store in, `holds_in`; a block
/// may carry `state.stays_in`, the author's request. A receiver that states a `holds_in` refuses a push that breaks it
/// (`residency`): a block whose `stays_in` does not list every region the node holds in. A receiver that states none (an
/// empty list): the protocol refuses nothing. Regions are plain labels, compared exactly; the protocol gives none a meaning.
pub fn residency_refusals(block: &Value, holds_in: &[String]) -> Vec<Refusal> {
    let stays: Vec<&str> = list(st(block, "stays_in"));
    if stays.is_empty() || holds_in.is_empty() {
        return vec![];
    }
    // `holds_in` lies inside `stays_in` when every region the node holds in is one the block may stay in.
    if holds_in.iter().all(|r| stays.contains(&r.as_str())) {
        vec![]
    } else {
        vec![Refusal::new("residency", "the block stays in regions this node does not hold in")]
    }
}

/// Earnest (profiles/earnest.md): the admission field `earnest`, `{ money, holder }`. The shape only: money and the
/// holder's id.
#[cfg(feature = "earnest")]
pub fn earnest_shape_ok(earnest: &Value) -> bool {
    let spec = crate::spec();
    earnest.as_object().is_some_and(|m| {
        m.keys().all(|k| spec.list("optional_profiles.earnest.shapes.earnest").contains(k))
            && m.get("money").is_some_and(|x| x.get("minor").is_some() && x.get("currency").is_some())
            && m.get("holder").and_then(Value::as_str).is_some_and(|h| spec.is("id", h))
    })
}

/// Whether an ask's earnest is paid: a transfer `for` the ask, of money to the holder, at least the earnest's `minor` in
/// the earnest's currency.
#[cfg(feature = "earnest")]
pub fn earnest_paid(ask: &Value, earnest: &Value, blocks: &[Value]) -> bool {
    let (Some(want), Some(holder)) = (get(earnest, "money.minor").and_then(Value::as_i64), earnest.get("holder").and_then(Value::as_str)) else {
        return false;
    };
    let currency = get(earnest, "money.currency");
    blocks.iter().any(|b| {
        type_of(b) == "transfer"
            && list(rf(b, "for")).contains(&hash_of(ask))
            && list(rf(b, "to_owner")).contains(&holder)
            && get(b, "state.money.currency") == currency
            && get(b, "state.money.minor").and_then(Value::as_i64).is_some_and(|m| m >= want)
    })
}
