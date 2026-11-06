//! `gives`: the one reading of a block for a person (promises.md, What becomes whose). What of the person's becomes whose if the block
//! stands, and whether it can come back, read only from the block's typed terms and refs: the sides, `refs.what`, the price (by
//! `terms_total`, in any kind), `terms.until`. No word of any template, schema or text is read, so no word can claim money or an effect.
use super::promise::terms_total;
use super::read_all;
use crate::js::{get, hash_of, list, rf, rs, st, type_of, Index};
use crate::prelude::*;

/// `{ gives: [line] }`. A line is `{ of, to, back, ... }`: `of` is `money` (`minor`, `currency`), `goods` (`what`, a thing, and `amount`
/// when the terms say how much; or only `amount`, a price paid in a kind of goods), or `use` (`what`, `amount`: goods that come back);
/// `to` is who it becomes the property or use of (null: open, anyone who takes it); `back` is the time it comes back (the deal's
/// `terms.until`), else null: what the terms do not say comes back cannot be counted on to. Lines the person would give to herself are left out.
pub fn gives(block: &Value, person: &str, blocks: &[Value]) -> Value {
    let index = read_all(
        blocks
            .iter()
            .filter(|b| hash_of(b) != hash_of(block))
            .chain([block]),
    );
    gives_in(block, person, &index)
}

/// `gives` for a block already read into `index`: the reading `owed_back` repeats for every transfer.
/// A transfer moves a person's things only if `backed` says she backs it: the same reading, never a second copy of the chain walk.
pub(super) fn gives_in(block: &Value, person: &str, index: &Index) -> Value {
    // a transfer moves the things of whoever's word it is (the top of its chain), and only if that person backs it
    // A block not yet signed (the read-back shown before she signs) has no signature to judge: it is read as its signed form would be, by whose word it says it is.
    let signed = block.get("signature").is_some();
    if type_of(block) == "transfer" && !(super::backed::claimed_by(block, index).as_deref() == Some(person) && (!signed || super::backed_in(block, person, index))) {
        return json!({ "gives": [] });
    }
    lines_in(block, person, index)
}

/// The lines of a block read as if the person backed it, with no judgement of who signed it: `owed_back` asks them of a transfer `backed` refused.
pub(super) fn lines_in(block: &Value, person: &str, index: &Index) -> Value {
    let mut unplaced = Vec::new();
    let lines = match type_of(block) {
        "promise" => of_promise(block, person, index, &mut unplaced),
        "transfer" => of_transfer(block, person, index, &mut unplaced),
        _ => Vec::new(),
    };
    let mut out = json!({ "gives": lines.into_iter().filter(|l| l["to"].as_str() != Some(person)).collect::<Vec<_>>() });
    // what the block names that the record does not hold: not hers (no line), and not nothing either. Only present when there is one.
    unplaced.sort();
    unplaced.dedup();
    if !unplaced.is_empty() {
        out["unplaced"] = json!(unplaced);
    }
    out
}

fn line(of: &str, to: Option<&str>, back: Option<&str>, parts: &[(&str, Option<Value>)]) -> Value {
    let mut m = Map::new();
    m.insert("of".into(), json!(of));
    for (k, v) in parts {
        if let Some(v) = v {
            m.insert((*k).into(), v.clone());
        }
    }
    m.insert("to".into(), json!(to));
    m.insert("back".into(), json!(back));
    Value::Object(m)
}

// Whether a thing is hers to give, read at the block's place in time (its causal past), never by today's owner. A thing the record does not
// hold is not hers, and neither is an instance whose owner there is unknown or someone else: only what the record shows is hers. A held kind is
// a description, which has no owner; promising goods of a kind is her own word, so it stands. A thing the record does not hold at all is also
// put in `unplaced`: it makes no line, but a reader must never take that for "nothing" (it can only raise the bar, never lower it).
fn hers(thing: &str, person: &str, block: &Value, index: &Index, unplaced: &mut Vec<String>) -> bool {
    match index.get(thing) {
        None => {
            unplaced.push(thing.to_string());
            false
        }
        Some(t) if rf(t, "of").is_some() => {
            // a block about to be signed sees everything held; a signed one sees its causal past
            let owner = if block.get("signature").is_some() { super::owner_seen_by(thing, block, index) } else { super::owner_whole(thing, index) };
            owner.as_deref() == Some(person)
        }
        Some(_) => true,
    }
}

fn of_promise(block: &Value, person: &str, index: &Index, unplaced: &mut Vec<String>) -> Vec<Value> {
    // an answer reads the promise it answers, at the quantity it chooses; only `accepted` moves anything
    let (deal, chosen) = match st(block, "status") {
        None => (block, None),
        Some(status) if status.as_str() == Some("accepted") => match rs(block, "answers")
            .and_then(|h| index.get(h))
            .filter(|d| type_of(d) == "promise")
        {
            Some(d) => (d, get(block, "state.terms.quantity")),
            None => return Vec::new(),
        },
        Some(_) => return Vec::new(),
    };
    let (from, to) = (rs(deal, "from"), rs(deal, "to"));
    let terms = get(deal, "state.terms").cloned().unwrap_or(json!({}));
    let until = terms.get("until").and_then(Value::as_str);
    let mut out = Vec::new();
    if from == Some(person) {
        // this of mine becomes yours: each thing it names, with how much the terms say
        let things: Vec<(Option<&str>, Option<&Value>)> = match terms.get("lines") {
            Some(Value::Array(l)) if !l.is_empty() => l
                .iter()
                .map(|l| (l.get("what").and_then(Value::as_str), l.get("quantity")))
                .collect(),
            _ => list(rf(deal, "what"))
                .into_iter()
                .map(|w| (Some(w), chosen.or(terms.get("quantity"))))
                .collect(),
        };
        for (what, quantity) in things {
            let Some(what) = what.filter(|w| hers(w, person, block, index, unplaced)) else {
                continue;
            };
            let amount = quantity
                .filter(|q| q.get("unit").is_some() && q.get("value").is_some())
                .cloned();
            out.push(line(
                if until.is_some() { "use" } else { "goods" },
                to,
                until,
                &[("what", Some(json!(what))), ("amount", amount)],
            ));
        }
    }
    if to == Some(person) {
        // and the price becomes the other side's, whatever kind it is in
        let total = terms_total(&terms, chosen);
        if total.get("minor").is_some() {
            out.push(line(
                "money",
                from,
                None,
                &[
                    ("minor", total.get("minor").cloned()),
                    ("currency", total.get("currency").cloned()),
                ],
            ));
        } else if total.get("unit").is_some() {
            out.push(line("goods", from, None, &[("amount", Some(total))]));
        }
    }
    out
}

fn of_transfer(block: &Value, person: &str, index: &Index, unplaced: &mut Vec<String>) -> Vec<Value> {
    if st(block, "status").is_some() {
        return Vec::new();
    }
    let (owner, holder) = (rs(block, "to_owner"), rs(block, "to_holder"));
    // how long the deal it serves lets the other side keep it
    let until = list(rf(block, "for"))
        .into_iter()
        .filter_map(|d| index.get(d))
        .find_map(|d| get(d, "state.terms.until").and_then(Value::as_str));
    let mut out = Vec::new();
    if let Some(money) = st(block, "money").filter(|m| m.get("minor").is_some()) {
        out.push(line(
            "money",
            owner,
            None,
            &[
                ("minor", money.get("minor").cloned()),
                ("currency", money.get("currency").cloned()),
            ],
        ));
    }
    for what in list(rf(block, "what")) {
        if owner.is_some() && hers(what, person, block, index, unplaced) {
            out.push(line("goods", owner, None, &[("what", Some(json!(what)))]));
        } else if owner.is_none() && holder.is_some() {
            out.push(line("use", holder, until, &[("what", Some(json!(what)))]));
        }
    }
    out
}
