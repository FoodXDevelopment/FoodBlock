//! The shapes strangers use to find, trust and settle with each other (promises.md, Finding, Checks, Clearing, Rulings). Four readings:
//! `listing_check` (a list-keeper's answer against the lookup it answers), `check_reads` (a signed check against the blocks it names),
//! `clearing_applied` (a circle of IOUs cancelled, each promise reduced) and `ruling_releases` (a stake that names a ruling by a named judge).
//! No word of any block is read, only its typed fields and refs; every sentence in `why` is for people.
use super::promise::{kind_json, measure};
use super::{backed_in, binds, promise_stage_in, read_all};
use crate::decimal::Dec;
use crate::js::{get, hash_of, list, rf, rs, sorted_set, ss, st, type_of, Index};
use crate::order::sees_in;
use crate::prelude::*;
use core::cmp::Ordering;

fn is_id(t: &str) -> bool {
    crate::spec().is("id", t)
}
fn first_promise(b: &Value) -> bool {
    type_of(b) == "promise" && rf(b, "answers").is_none() && rf(b, "updates").is_none()
}
fn stage_of(item: &Value, blocks: &[Value]) -> Value {
    super::promise_stage(item, blocks, &super::StageOptions::default())
}

// ---- A list-keeper's answer ----

/// What is wrong with a lookup's own shape: an observe of kind `lookup` that says `offer` or `want` in `state.side`.
fn lookup_shape(lookup: &Value) -> Result<(), String> {
    if type_of(lookup) != "observe" || ss(lookup, "kind") != Some("lookup") {
        return Err("the first block is no lookup (an observe of kind lookup)".into());
    }
    if !matches!(ss(lookup, "side"), Some("offer" | "want")) {
        return Err("a lookup says which side it looks for: `side` is offer or want".into());
    }
    if st(lookup, "terms").is_some_and(|t| !t.is_object()) {
        return Err("a lookup's `terms` is an object of the terms an item must carry".into());
    }
    Ok(())
}

/// Whether the held block `item` is a real signed offer (or want) that the lookup asks for. Err is one plain sentence.
fn item_fits(lookup: &Value, item: &str, index: &Index, blocks: &[Value]) -> Result<(), String> {
    let Some(b) = index.get(item) else { return Err("it is not a block the reader holds".into()) };
    if !first_promise(b) {
        return Err("it is not a first promise: an offer or a want is a promise that answers and updates nothing".into());
    }
    if !crate::identity::counts_in(b, index) {
        return Err("its signer's key does not speak for its author here".into());
    }
    let (from, to) = (rs(b, "from"), rs(b, "to"));
    let (signs, other, word) = match ss(lookup, "side") {
        Some("offer") => (from, to, "offer"),
        _ => (to, from, "want"),
    };
    let Some(signs) = signs else { return Err(format!("a {word} names the side that signs it")) };
    if other.is_some() {
        return Err(format!("a {word} leaves the other side open, and this one names it"));
    }
    if !backed_in(b, signs, index) {
        return Err(format!("it is not backed by {signs}, the side that makes a {word}"));
    }
    let stage = stage_of(b, blocks);
    if !matches!(stage.get("stage").and_then(Value::as_str), Some("offered" | "asked")) {
        return Err(format!("it is no longer open: its stage is {}", stage.get("stage").and_then(Value::as_str).unwrap_or("unknown")));
    }
    let wanted = list(rf(lookup, "what"));
    if !wanted.is_empty() && !list(rf(b, "what")).iter().any(|w| wanted.contains(w)) {
        return Err("it names none of the things the lookup asks for".into());
    }
    if let Some(Value::Object(terms)) = st(lookup, "terms") {
        for (k, v) in terms {
            if get(b, "state.terms").and_then(|t| t.get(k)) != Some(v) {
                return Err(format!("its term `{k}` is not the one the lookup asks for"));
            }
        }
    }
    Ok(())
}

/// `{ ok, why, bad: [{ hash, why }], left_out: [hash] }`. A list-keeper's answer is an observe of kind `listing` that `answers` the lookup and names
/// its items in `derives_from`. It is `ok` when every item is a real signed offer (or want) among `blocks` that the lookup asks for: a keeper can
/// leave one out but never make one up. `left_out` is what the reader holds that fits the lookup and the answer does not name.
pub fn listing_check(lookup: &Value, listing: &Value, blocks: &[Value]) -> Value {
    let index = read_all(blocks.iter());
    let not = |why: String| json!({ "ok": false, "why": why, "bad": [], "left_out": [] });
    if let Err(why) = lookup_shape(lookup) {
        return not(why);
    }
    if type_of(listing) != "observe" || ss(listing, "kind") != Some("listing") {
        return not("the second block is no listing (an observe of kind listing)".into());
    }
    if rs(listing, "answers") != Some(hash_of(lookup)) {
        return not("the listing does not answer this lookup".into());
    }
    let named = sorted_set(list(rf(listing, "derives_from")));
    let bad: Vec<Value> = named.iter().filter_map(|h| item_fits(lookup, h, &index, blocks).err().map(|why| json!({ "hash": h, "why": why }))).collect();
    let left: Vec<String> = sorted_set(index.values().map(hash_of).filter(|h| !named.iter().any(|n| n == h) && item_fits(lookup, h, &index, blocks).is_ok()));
    let why = bad.first().map(|b| format!("{}: {}", b["hash"].as_str().unwrap_or(""), b["why"].as_str().unwrap_or("")));
    json!({ "ok": bad.is_empty(), "why": why, "bad": bad, "left_out": left })
}

// ---- A signed check of someone's record ----

/// `{ ok, why, read: [{ hash, held, concerns, stage }] }`. A check is an observe of kind `check`, `refs.subject` the one whose record it read and
/// `refs.derives_from` the blocks it read. Verified against them: each is held and concerns the subject (they signed it, or are a side of it);
/// and every typed claim it makes holds: `count` is how many it names, `of` the type of each, `stage` the stage of each (a first promise).
/// Whether the signer read well is the signer's word; the signer answers for it.
pub fn check_reads(check: &Value, blocks: &[Value]) -> Value {
    let index = read_all(blocks.iter());
    let no = |why: &str, read: Vec<Value>| json!({ "ok": false, "why": why, "read": read });
    if type_of(check) != "observe" || ss(check, "kind") != Some("check") {
        return no("the block is no check (an observe of kind check)", vec![]);
    }
    let Some(subject) = rs(check, "subject") else { return no("a check names the one whose record it read in `refs.subject`", vec![]) };
    let named = sorted_set(list(rf(check, "derives_from")));
    if named.is_empty() {
        return no("a check names what it read in `refs.derives_from`", vec![]);
    }
    let mut read = Vec::new();
    let mut first_wrong: Option<String> = None;
    let mut wrong = |why: String| {
        first_wrong.get_or_insert(why);
    };
    let (of, claimed) = (ss(check, "of"), ss(check, "stage"));
    for h in &named {
        let b = index.get(h.as_str());
        let held = b.is_some();
        let concerns = b.is_some_and(|b| backed_in(b, subject, &index) || [rs(b, "from"), rs(b, "to")].contains(&Some(subject)));
        let stage = b.filter(|b| first_promise(b)).map(|b| stage_of(b, blocks)).and_then(|s| s.get("stage").and_then(Value::as_str).map(String::from));
        if !held {
            wrong(format!("{h} is not a block the reader holds"));
        } else if !concerns {
            wrong(format!("{h} is not the subject's: they neither signed it nor are a side of it"));
        } else if of.is_some_and(|t| b.is_some_and(|b| type_of(b) != t)) {
            wrong(format!("{h} is not of the type the check says it read"));
        } else if claimed.is_some() && stage.as_deref() != claimed {
            wrong(format!("{h} is not at the stage the check says: {}", claimed.unwrap_or("")));
        }
        read.push(json!({ "hash": h, "held": held, "concerns": concerns, "stage": stage }));
    }
    if let Some(n) = st(check, "count") {
        if crate::js::int(Some(n)) != Some(named.len() as f64) {
            wrong(format!("the check says it read {n}, and names {}", named.len()));
        }
    }
    json!({ "ok": first_wrong.is_none(), "why": first_wrong, "read": read })
}

// ---- A clearing circle ----

fn persons_signed(block: &Value, persons: &[String], index: &Index) -> Vec<String> {
    let hash = hash_of(block);
    persons
        .iter()
        .filter(|p| backed_in(block, p, index) || index.values().any(|c| list(rf(c, "confirms")).contains(&hash) && backed_in(c, p, index)))
        .cloned()
        .collect()
}

struct Sides {
    debtor: Option<String>,
    creditors: Vec<String>,
}
// Who owes the price (the one who answers for the `to` side) and who is owed it (the owner of the claim where it was handed over, else the `from` side).
fn sides_of(stage: &Value) -> Sides {
    let name = |side: &str| stage.get("sides").and_then(|s| s.get(side)).and_then(Value::as_str).map(String::from);
    let debtor = stage.get("answerable").and_then(|a| a.get("to")).and_then(Value::as_str).map(String::from).or_else(|| name("to"));
    let owners: Vec<String> = stage.get("owed").and_then(|o| o.get("from")).and_then(Value::as_array).map_or(vec![], |a| a.iter().filter_map(|l| l.get("owner").and_then(Value::as_str).map(String::from)).collect());
    Sides { debtor, creditors: if owners.is_empty() { name("from").into_iter().collect() } else { sorted_set(owners) } }
}

/// `{ binds, why, who, missing, lines: [{ deal, ok, why, owed, reduce, left }] }`. A clearing is an observe of kind `clearing` whose `state.lines`
/// are `{ deal, reduce, applies?, rate? }`: the amount each IOU is reduced by. It binds only when every person in it (each debtor and each owner
/// of what is owed) has signed it or a block that `confirms` it, backed by them. Each line reduces a deal that binds, by no more than is still
/// owed, in the deal's own kind; a line in another kind names the rate (an observe of kind `rate`, `give` and `get`) that both sides of
/// that deal signed, and `applies` the amount in the deal's kind, which must be exactly the rate's worth of `reduce`.
pub fn clearing_applied(clearing: &Value, blocks: &[Value]) -> Value {
    let index = read_all(blocks.iter().filter(|b| hash_of(b) != hash_of(clearing)).chain([clearing]));
    let stop = |why: &str| json!({ "binds": false, "why": why, "who": [], "missing": [], "lines": [] });
    if type_of(clearing) != "observe" || ss(clearing, "kind") != Some("clearing") {
        return stop("the block is no clearing (an observe of kind clearing)");
    }
    let Some(Value::Array(lines)) = st(clearing, "lines").filter(|l| l.as_array().is_some_and(|l| !l.is_empty())) else { return stop("a clearing lists the promises it reduces in `lines`") };
    let zero = Dec::zero();
    let mut who: Vec<String> = Vec::new();
    let mut out: Vec<Value> = Vec::new();
    for line in lines {
        let deal = line.get("deal").and_then(Value::as_str).unwrap_or("");
        let mut shown = json!({ "deal": deal, "ok": false, "why": null, "owed": null, "reduce": null, "left": null });
        let refuse = |why: String, mut shown: Value| {
            shown["why"] = json!(why);
            shown
        };
        let Some(first) = index.get(deal).filter(|d| first_promise(d)) else {
            out.push(refuse("the deal is not a first promise the reader holds".into(), shown));
            continue;
        };
        let stage = stage_of(first, blocks);
        let sides = sides_of(&stage);
        for p in sides.debtor.iter().chain(sides.creditors.iter()) {
            if !who.contains(p) {
                who.push(p.clone());
            }
        }
        if !super::binds(&stage) {
            out.push(refuse("the deal does not bind: no one has accepted it".into(), shown));
            continue;
        }
        let Some((total, kind)) = stage.get("total").filter(|t| !t.is_null()).and_then(measure) else {
            out.push(refuse("the deal states no price to reduce".into(), shown));
            continue;
        };
        let paid = stage.get("paid").filter(|p| !p.is_null()).and_then(measure).filter(|(_, k)| *k == kind).map_or_else(Dec::zero, |(d, _)| d);
        let owed = total.sub(&paid);
        shown["owed"] = kind_json(&owed, &kind);
        let Some((reduce, reduce_kind)) = line.get("reduce").and_then(measure).filter(|(d, _)| d.cmp(&zero) == Ordering::Greater) else {
            out.push(refuse("`reduce` is an amount of money or goods above nothing".into(), shown));
            continue;
        };
        shown["reduce"] = kind_json(&reduce, &reduce_kind);
        // the amount the deal is reduced by, in its own kind
        let applied = if reduce_kind == kind {
            reduce.clone()
        } else {
            let Some(rate) = line.get("rate").and_then(Value::as_str).and_then(|r| index.get(r)).filter(|r| type_of(r) == "observe" && ss(r, "kind") == Some("rate")) else {
                out.push(refuse("it clears one kind against another and names no rate both sides signed".into(), shown));
                continue;
            };
            let parties: Vec<String> = sides.debtor.iter().chain(sides.creditors.iter()).cloned().collect();
            if persons_signed(rate, &parties, &index).len() != parties.len() {
                out.push(refuse("the rate is not signed by both sides of the deal".into(), shown));
                continue;
            }
            let (Some((give, gk)), Some((get_, tk)), Some((applies, ak))) = (st(rate, "give").and_then(measure), st(rate, "get").and_then(measure), line.get("applies").and_then(measure)) else {
                out.push(refuse("a rate says what is `give`n for what is `get`, and the line says what it `applies`".into(), shown));
                continue;
            };
            // reduce / give = applies / get, kept exact by crossing the products
            if gk != reduce_kind || tk != kind || ak != kind || reduce.mul(&get_).cmp(&applies.mul(&give)) != Ordering::Equal {
                out.push(refuse("the amount applied is not what the rate makes of the amount reduced, in the deal's kind".into(), shown));
                continue;
            }
            applies
        };
        if applied.cmp(&owed) == Ordering::Greater {
            out.push(refuse("it reduces the deal by more than is still owed".into(), shown));
            continue;
        }
        shown["left"] = kind_json(&owed.sub(&applied), &kind);
        shown["ok"] = json!(true);
        out.push(shown);
    }
    let who = sorted_set(who);
    let signed = persons_signed(clearing, &who, &index);
    let missing: Vec<String> = who.iter().filter(|p| !signed.contains(p)).cloned().collect();
    let first = out.iter().find(|l| l["ok"] == json!(false)).map(|l| format!("{}: {}", l["deal"].as_str().unwrap_or(""), l["why"].as_str().unwrap_or("")));
    let why = first.or_else(|| (!missing.is_empty()).then(|| format!("{} of those in it have not signed", missing.len())));
    json!({ "binds": why.is_none(), "why": why, "who": who, "missing": missing, "lines": out })
}

// ---- A ruling by a named judge ----

/// Whether the condition `{ ruled: <deal>, by: <judge>, awards: <person> }` holds: the judge's counted ruling on the deal (an observe of kind `ruling`,
/// `refs.subject` the deal, backed by the judge, dated by `now` when a clock is given) awards something to the person. Of the judge's rulings on a deal the
/// head is the one no other of hers has in its causal past (she changes her ruling by signing another that has seen it); two heads that do not
/// see each other rule nothing. Ok is the ruling's hash and the award line; Err is why it does not hold, or None for a condition of another shape.
pub(crate) fn ruled(condition: &Value, index: &Index, now: Option<&str>) -> Option<Result<(String, Value), String>> {
    let c = condition.as_object()?;
    c.get("ruled")?;
    let id = |k: &str| c.get(k).and_then(Value::as_str).filter(|t| is_id(t));
    let (Some(deal), Some(judge), Some(person)) = (id("ruled"), id("by"), id("awards")) else {
        return Some(Err("a condition `ruled` names the deal, the judge (`by`) and the person it awards to (`awards`), each an id".into()));
    };
    let mine: Vec<&Value> = index
        .values()
        .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("ruling") && rs(o, "subject") == Some(deal))
        .filter(|o| now.is_none_or(|n| ss(o, "at").is_some_and(|at| at <= n)))
        .filter(|o| backed_in(o, judge, index))
        .collect();
    if mine.is_empty() {
        return Some(Err("the judge has made no ruling on the deal".into()));
    }
    let heads: Vec<&&Value> = mine.iter().filter(|w| !mine.iter().any(|o| hash_of(o) != hash_of(w) && sees_in(o, hash_of(w), index))).collect();
    let [head] = heads.as_slice() else { return Some(Err("the judge has two rulings that do not see each other: nothing fills the choice in".into())) };
    let award = st(head, "awards").and_then(Value::as_array).and_then(|a| a.iter().find(|l| l.get("to").and_then(Value::as_str) == Some(person)));
    Some(match award {
        Some(l) => Ok((hash_of(head).to_string(), l.clone())),
        None => Err("the judge's ruling awards nothing to that person".into()),
    })
}

/// `{ releases, to, money, ruling, why }`: whether a ruling releases a stake. A stake is a promise whose `terms.condition` (or a transfer whose
/// `state.condition`) is `{ ruled: <deal>, by: <judge>, awards: <person> }`. It is released when the judge's ruling awards that person something,
/// by the amount the award states in the stake's own kind, capped at the stake (the whole stake when the award states none); nothing is converted.
pub fn ruling_releases(stake: &Value, blocks: &[Value], now: Option<&str>) -> Value {
    let index = read_all(blocks.iter().filter(|b| hash_of(b) != hash_of(stake)).chain([stake]));
    let no = |why: String| json!({ "releases": false, "to": null, "money": null, "ruling": null, "why": why });
    let condition = match type_of(stake) {
        "promise" => get(stake, "state.terms.condition"),
        "transfer" => st(stake, "condition"),
        _ => None,
    };
    // A stake releases only if it binds. A promise binds once its stage says so: the accept consents to the very terms that name the judge, so both
    // sides signed it and both chose her. A transfer is its giver's own signed move, so it binds her and spends no one else; it counts only if its key
    // speaks for her and every deal it is `for` binds (a deal still only offered releases nothing).
    let binding = match type_of(stake) {
        "promise" => binds(&promise_stage_in(hash_of(stake), &index, &super::StageOptions::default())),
        _ => {
            crate::identity::counts_in(stake, &index)
                && list(rf(stake, "for")).into_iter().all(|d| index.get(d).is_some_and(|_| binds(&promise_stage_in(d, &index, &super::StageOptions::default()))))
        }
    };
    let Some(Some(verdict)) = condition.map(|c| ruled(c, &index, now)) else { return no("the stake's condition names no ruling (`ruled`)".into()) };
    let (ruling, award) = match verdict {
        Ok(v) => v,
        Err(why) => return no(why),
    };
    let to = award.get("to").cloned().unwrap_or(Value::Null);
    // read last, so the answer still says which ruling it was: a ruling that reaches a stake no one accepted releases nothing
    if !binding {
        return json!({ "releases": false, "to": to, "money": null, "ruling": ruling, "why": "the stake does not bind: it is not signed by both sides who name this judge, or the deal it serves is not accepted" });
    }
    let staked = match type_of(stake) {
        "promise" => get(stake, "state.terms").map(|t| super::terms_total(t, None)).and_then(|t| measure(&t)),
        _ => st(stake, "money").and_then(measure),
    };
    let awarded = award.get("money").or_else(|| award.get("amount")).and_then(measure);
    let money = match (staked, awarded) {
        (Some((s, sk)), Some((a, ak))) => {
            if sk != ak {
                return no("the award is in another kind than the stake: nothing is converted".into());
            }
            Some(kind_json(if a.cmp(&s) == Ordering::Less { &a } else { &s }, &sk))
        }
        (Some((s, sk)), None) => Some(kind_json(&s, &sk)),
        (None, _) => None,
    };
    json!({ "releases": true, "to": to, "money": money, "ruling": ruling, "why": null })
}

// ---- Whether a judge's ruling is public ----

/// The judge's offer is a first promise of hers under the base schema `judging`, `refs.to` left open. Its head (no other offer of hers has it in
/// its causal past) is the offer she stands on now. Its term `terms.rulings` is `"public"` or absent; absent is private, and nothing else is read.
fn rulings_public_by_offer(judge: &str, index: &Index) -> Option<bool> {
    let offers: Vec<&Value> = index
        .values()
        .filter(|o| first_promise(o) && rs(o, "to").is_none() && backed_in(o, judge, index))
        .filter(|o| rs(o, "schema").and_then(|s| index.get(s)).is_some_and(|s| ss(s, "kind") == Some("schema") && ss(s, "name") == Some("judging")))
        .collect();
    let heads: Vec<&&Value> = offers.iter().filter(|w| !offers.iter().any(|o| hash_of(o) != hash_of(w) && sees_in(o, hash_of(w), index))).collect();
    match heads.as_slice() {
        [head] => Some(get(head, "state.terms.rulings").and_then(Value::as_str) == Some("public")),
        _ => None,
    }
}

/// `{ audience, why }`: whether a judge's ruling is public (promises.md, Rulings). `audience` is `public` or `private`. It is public when the judge's
/// signed offer says `terms.rulings: "public"`; absent means private. Whatever the offer says, it is public when the ruling went unhonoured: an award
/// line with a `due` time at or before the reader's clock `now` and no counted transfers `for` the ruling to the one it awards that add up to its sum (an award with no sum is honoured only by a release) and no release of the ruling signed by her (or by one who speaks for her). A fact, never a verdict.
pub fn ruling_audience(ruling: &Value, blocks: &[Value], now: Option<&str>) -> Value {
    let index = read_all(blocks.iter().filter(|b| hash_of(b) != hash_of(ruling)).chain([ruling]));
    let out = |audience: &str, why: &str| json!({ "audience": audience, "why": why });
    if type_of(ruling) != "observe" || ss(ruling, "kind") != Some("ruling") {
        return out("private", "the block is no ruling (an observe of kind ruling)");
    }
    let Some(judge) = super::speaker_of(ruling, &index, now).filter(|j| crate::identity::counts_in(ruling, &index) && backed_in(ruling, j, &index)) else {
        return out("private", "no judge's key speaks for this ruling");
    };
    let hash = hash_of(ruling);
    let unhonoured = now.is_some_and(|n| {
        st(ruling, "awards").and_then(Value::as_array).into_iter().flatten().filter_map(|l| l.as_object()).any(|l| {
            let due = l.get("due").and_then(Value::as_str).is_some_and(|d| d <= n);
            let to = l.get("to").and_then(Value::as_str);
            // honoured by counted transfers `for` the ruling to her that add up to the award's sum in its own kind (whoever paid: the sum matters, not the
            // payer), or by her own release of the ruling (promises.md, A release): her word that it is settled. An award with no sum (goods, an act) is
            // honoured only by her release: nothing else says what was delivered.
            let owed = l.get("money").or_else(|| l.get("amount")).and_then(measure);
            let paid = owed.is_some_and(|(sum, kind)| {
                let got = index.values().filter(|t| type_of(t) == "transfer" && st(t, "status").is_none() && list(rf(t, "for")).contains(&hash) && rs(t, "to") == to && crate::identity::counts_in(t, &index))
                    .filter_map(|t| st(t, "money").or_else(|| st(t, "amount")).and_then(measure)).filter(|(_, k)| *k == kind)
                    .fold(Dec::zero(), |a, (d, _)| a.add(&d));
                got.cmp(&sum) != Ordering::Less
            });
            let let_go = index.values().any(|r| {
                type_of(r) == "observe" && ss(r, "kind") == Some("release") && st(r, "status").is_none() && rs(r, "subject") == Some(hash)
                    && crate::identity::counts_in(r, &index) && to.is_some() && super::speaker_of(r, &index, now).as_deref() == to
            });
            due && !paid && !let_go
        })
    });
    if unhonoured {
        return out("public", "an award of the ruling is unpaid past its due date");
    }
    if rulings_public_by_offer(&judge, &index) == Some(true) {
        return out("public", "the judge's offer says her rulings are public");
    }
    out("private", "the judge's offer does not say her rulings are public")
}
