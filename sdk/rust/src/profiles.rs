//! Small optional profiles whose code is only a check or two (spec/profiles): residency (where blocks may be stored)
//! and deposits (a node holds an ask until a deposit is paid; node policy, not protocol).
use crate::error::Refusal;
#[allow(unused_imports)]
use crate::js::{get, hash_of, list, rf, st, type_of};
use crate::prelude::*;

/// Residency (profiles/residency.md): a node's admission rule lists the regions it stores in, `holds_in`; a block may
/// carry `state.stays_in`. A node refuses a push that breaks its own `holds_in` (`residency`): a block that stays in
/// regions its node does not lie inside. `holds_in` and `stays_in` are lists of ISO 3166-1 alpha-2 codes, or `EU`, `EEA`.
pub fn residency_refusals(block: &Value, holds_in: &[String]) -> Vec<Refusal> {
    let stays: Vec<&str> = list(st(block, "stays_in"));
    if stays.is_empty() {
        return vec![];
    }
    // `holds_in` lies inside `stays_in` when every region the node holds in is one the block may stay in.
    let inside = !holds_in.is_empty() && holds_in.iter().all(|r| stays.contains(&r.as_str()));
    if inside {
        vec![]
    } else {
        vec![Refusal::new("residency", "the block stays in regions this node does not hold in")]
    }
}

/// Deposits (profiles/deposits.md): the admission field `deposit`, `{ money, holder }`. The shape only: money and the
/// holder's id.
#[cfg(feature = "deposits")]
pub fn deposit_shape_ok(deposit: &Value) -> bool {
    let spec = crate::spec();
    deposit.as_object().is_some_and(|m| {
        m.keys().all(|k| spec.list("optional_profiles.deposits.shapes.deposit").contains(k))
            && m.get("money").is_some_and(|x| x.get("minor").is_some() && x.get("currency").is_some())
            && m.get("holder").and_then(Value::as_str).is_some_and(|h| spec.is("id", h))
    })
}

/// Whether an ask's deposit is paid: a transfer `for` the ask, of money to the holder, at least the deposit's `minor` in
/// the deposit's currency.
#[cfg(feature = "deposits")]
pub fn deposit_paid(ask: &Value, deposit: &Value, blocks: &[Value]) -> bool {
    let (Some(want), Some(holder)) = (get(deposit, "money.minor").and_then(Value::as_i64), deposit.get("holder").and_then(Value::as_str)) else {
        return false;
    };
    let currency = get(deposit, "money.currency");
    blocks.iter().any(|b| {
        type_of(b) == "transfer"
            && list(rf(b, "for")).contains(&hash_of(ask))
            && list(rf(b, "to_owner")).contains(&holder)
            && get(b, "state.money.currency") == currency
            && get(b, "state.money.minor").and_then(Value::as_i64).is_some_and(|m| m >= want)
    })
}
