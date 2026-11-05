//! `gives`: the one reading of a block for a person (promises.md, What becomes whose). What of the person's becomes whose if the block
//! stands, and whether it can come back, read only from the block's typed terms and refs: the sides, `refs.what`, the price (by
//! `terms_total`, in any kind), `terms.until`. No word of any template, schema or text is read, so no word can claim money or an effect.
use super::promise::terms_total;
use super::{principal_of, read_all};
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
    gives_in(block, person, &index, blocks)
}

/// `gives` for a block already read into `index` (with the blocks held in `blocks`): the reading `owed_back` repeats for every transfer.
pub(super) fn gives_in(block: &Value, person: &str, index: &Index, blocks: &[Value]) -> Value {
    let lines = match type_of(block) {
        "promise" => of_promise(block, person, index, blocks),
        "transfer" if principal(block, index).as_deref() == Some(person) => {
            of_transfer(block, person, index, blocks)
        }
        _ => Vec::new(),
    };
    json!({ "gives": lines.into_iter().filter(|l| l["to"].as_str() != Some(person)).collect::<Vec<_>>() })
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

// A thing someone else is known to own is not hers to give. A thing not held, or a kind, is read as hers: only what the record shows is subtracted.
fn hers(thing: &str, person: &str, index: &Index, blocks: &[Value]) -> bool {
    match index.get(thing) {
        Some(t) if rf(t, "of").is_some() => {
            super::owner_of(t, blocks).is_none_or(|owner| owner == person)
        }
        _ => true,
    }
}

// Whose word a block is: the circle it is signed `as`, else, for a block under a grant, the one at the top of the grant's chain (`refs.parent` up to the first
// grant not passed on), else its author. Whether each grant is live is `backed`'s question, not this reading's.
fn principal(block: &Value, index: &Index) -> Option<String> {
    let Some(mut top) = rs(block, "under")
        .filter(|_| rs(block, "as").is_none_or(str::is_empty))
        .map(|g| index.get(g))
    else {
        return principal_of(block, index);
    };
    while let Some(g) = top {
        match rs(g, "parent").and_then(|h| index.get(h)) {
            Some(above) => top = Some(above),
            None => break,
        }
    }
    top.and_then(|g| principal_of(g, index))
}

fn of_promise(block: &Value, person: &str, index: &Index, blocks: &[Value]) -> Vec<Value> {
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
            let Some(what) = what.filter(|w| hers(w, person, index, blocks)) else {
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

fn of_transfer(block: &Value, person: &str, index: &Index, blocks: &[Value]) -> Vec<Value> {
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
        if owner.is_some() && hers(what, person, index, blocks) {
            out.push(line("goods", owner, None, &[("what", Some(json!(what)))]));
        } else if owner.is_none() && holder.is_some() {
            out.push(line("use", holder, until, &[("what", Some(json!(what)))]));
        }
    }
    out
}
