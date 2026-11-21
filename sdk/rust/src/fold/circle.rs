//! A circle (circles.md, 1.9 stage 6): people who own things together by parts, and the rows by which some of them act for the owners.
//! A circle never signs and holds no key: every block `as` it is a person's word, and speaks for the owners only where one row holds for it
//! (counted in one place, every hand past its ends, no hand of one the move gives to) or where hands that own every part persons own sign it.
//!
//! Parts are read as any amount is (the ownership fold of the founding block, its `pack` the measure). A hand's parts are read in the fold of
//! the hand's own causal past, each block there read as it is among all held (one memo for every reading of one store). A reading that meets
//! an asker of its own still being read (a ring) reads it as holding nothing and is not remembered (`Index::taint`).
use super::read_all;
use crate::decimal::{Amount, Dec};
use crate::js::{get, hash_of, list, rf, rs, sorted_set, ss, st, type_of, Index};
use crate::prelude::*;
use alloc::collections::{BTreeMap, BTreeSet};
use core::cmp::Ordering;

// ---- One memo for the circle's readings, with a busy mark for a ring ----

/// A reading remembered under `key`: `busy` while it is being read (a ring meets it), and not remembered where it met one.
fn memo(index: &Index, key: &str, busy: Value, f: impl FnOnce() -> Value) -> Value {
    if let Some(v) = index.stage_peek(key) {
        return v;
    }
    let mark = format!("busy:{key}");
    if index.stage_peek(&mark).is_some() {
        index.taint_bump();
        busy_hit(key);
        return busy;
    }
    index.stage_put(&mark, Value::Bool(true));
    let t0 = index.taint();
    let v = f();
    index.stage_drop(&mark);
    if index.taint() == t0 {
        index.stage_put(key, v.clone());
    }
    v
}
fn held_here(b: &Value, index: &Index) -> bool {
    index.get(hash_of(b)).is_some_and(|x| core::ptr::eq(x, b) || x == b)
}
fn ids_of(v: Option<&Value>) -> Vec<&str> {
    match v {
        Some(Value::String(x)) => vec![x.as_str()],
        Some(Value::Array(a)) => a.iter().filter_map(Value::as_str).collect(),
        _ => vec![],
    }
}

// ---- The founding block, its parts and its rows ----

/// The founding block of a circle: an `actor` of kind `circle` that updates nothing and is `as` nothing (a version updates one).
pub(crate) fn founding<'a>(circle: &str, index: &'a Index) -> Option<&'a Value> {
    index.get(circle).filter(|r| is_circle_actor(r) && rf(r, "updates").is_none() && rf(r, "as").is_none())
}
fn is_circle_actor(b: &Value) -> bool {
    type_of(b) == "actor" && ss(b, "kind") == Some("circle")
}
fn is_version_of(b: &Value, circle: &str) -> bool {
    is_circle_actor(b) && rs(b, "as") == Some(circle) && rs(b, "updates").is_some()
}

/// A circle's `pack` (C1): whole parts, `unit` `part`, at least 1, no `of`. None where it states none (C3: owners unsaid).
pub(crate) fn pack_of(founding: &Value) -> Option<Dec> {
    let a = Amount::of(st(founding, "pack"))?;
    (a.kind.unit == "part" && a.kind.of.is_none() && whole(&a.value) && a.value.cmp(&Dec::parse("1").unwrap()) != Ordering::Less).then_some(a.value)
}
pub(crate) fn whole(d: &Dec) -> bool {
    crate::check::is_whole_parts(d)
}
fn dec_of_int(v: Option<&Value>) -> Option<u64> {
    v.and_then(Value::as_u64).filter(|n| *n >= 1)
}
fn one() -> Dec {
    Dec::parse("1").unwrap()
}
fn dec_n(n: u64) -> Dec {
    Dec::of(Some(&json!(n))).unwrap()
}

/// How a row counts (C10): parts between its hands, or that many of the ids `to` names (or of the holders of a grant it names).
#[derive(Clone, Debug)]
enum Count {
    Parts(u64),
    Named { to: Vec<String>, needed: u64 },
}
#[derive(Clone, Debug)]
struct Row {
    at: usize,
    count: Count,
    scope: Value,
}
fn rows_in(holder: &Value) -> Vec<Row> {
    st(holder, "rules").and_then(Value::as_array).into_iter().flatten().enumerate().filter_map(|(at, r)| row_of(at, r)).collect()
}
fn row_of(at: usize, r: &Value) -> Option<Row> {
    let o = r.as_object()?;
    let scope = o.get("scope").filter(|s| s.is_object())?.clone();
    if o.len() == 2 {
        return Some(Row { at, count: Count::Parts(dec_of_int(o.get("parts"))?), scope });
    }
    let to: Vec<String> = match o.get("to")? {
        Value::String(s) => vec![s.clone()],
        Value::Array(a) if !a.is_empty() => a.iter().map(|x| x.as_str().map(String::from)).collect::<Option<_>>()?,
        _ => return None,
    };
    Some(Row { at, count: Count::Named { to, needed: dec_of_int(o.get("needed"))? }, scope })
}
fn scope_types(scope: &Value) -> Option<Vec<String>> {
    scope.get("types").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
}
fn names_actor(r: &Row) -> bool {
    scope_types(&r.scope).is_some_and(|t| t.iter().any(|t| t == "actor" || t.starts_with("actor.")))
}

// ---- Versions (C19) ----

/// The versions of a circle held: `actor`s of kind `circle` signed `as` it that update the founding block or an earlier version, counted.
fn versions<'a>(circle: &str, index: &'a Index) -> Vec<&'a Value> {
    let hs = memo(index, &format!("c6vers:{circle}"), json!([]), || {
        let cand: Vec<&Value> = index.values().filter(|b| is_version_of(b, circle) && crate::identity::counts_in(b, index)).collect();
        let mut known: BTreeSet<String> = core::iter::once(circle.to_string()).collect();
        let mut out: Vec<String> = Vec::new();
        loop {
            let more: Vec<&Value> = cand.iter().copied().filter(|b| !known.contains(hash_of(b)) && rs(b, "updates").is_some_and(|u| known.contains(u))).collect();
            if more.is_empty() {
                break;
            }
            for b in more {
                known.insert(hash_of(b).to_string());
                out.push(hash_of(b).to_string());
            }
        }
        json!(out)
    });
    hs.as_array().into_iter().flatten().filter_map(Value::as_str).filter_map(|h| index.get(h)).collect()
}

/// The block whose rows, clocks and meter stand for a block (C19, D15): of the versions that hold in its causal past (all held where `at`
/// is None), the one every other is in the past of; where two are rivals, the latest block (a version or the founding block) both have in
/// their past; with none, the founding block.
fn standing_version<'a>(circle: &str, at: Option<&Value>, index: &'a Index) -> Option<&'a Value> {
    let f = founding(circle, index)?;
    let key = format!("c6now:{circle}:{}", at.map(hash_of).unwrap_or(""));
    let busy = json!(circle);
    let h = memo(index, &key, busy, || {
        let past = at.map(|b| index.past_of(b));
        let seen = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
        let holding: Vec<&Value> = versions(circle, index).into_iter().filter(|v| seen(hash_of(v)) && holds_in(v, circle, index)).collect();
        let sees = |a: &Value, b: &Value| index.past_of(a).contains(hash_of(b));
        let heads: Vec<&Value> = holding.iter().copied().filter(|v| !holding.iter().any(|o| hash_of(o) != hash_of(v) && sees(o, v))).collect();
        let v = match heads.as_slice() {
            [] => f,
            [one] => *one,
            many => {
                let common: Vec<&Value> = holding.iter().copied().filter(|v| many.iter().all(|h| sees(h, v))).collect();
                let latest: Vec<&Value> = common.iter().copied().filter(|v| common.iter().all(|o| hash_of(o) == hash_of(v) || sees(v, o))).collect();
                latest.first().copied().unwrap_or(f)
            }
        };
        json!(hash_of(v))
    });
    h.as_str().and_then(|h| index.get(h)).or(Some(f))
}

/// The rows that stand for a block `as` the circle. For a version (type `actor`), only the founding block's rows whose `scope.types` names
/// `actor` are read (no rule votes itself in); for any other block, rows naming `actor` are never read from a version.
fn rows_for(circle: &str, block: &Value, index: &Index) -> Vec<Row> {
    let Some(f) = founding(circle, index) else { return vec![] };
    if type_of(block) == "actor" {
        return rows_in(f).into_iter().filter(names_actor).collect();
    }
    let v = standing_version(circle, Some(block), index).unwrap_or(f);
    let from_founding = hash_of(v) == hash_of(f);
    rows_in(v).into_iter().filter(|r| from_founding || !names_actor(r)).collect()
}
/// The clock that stands for a block (C20): the standing block's `clocks`.
fn clocks_at(circle: &str, at: Option<&Value>, index: &Index) -> Option<crate::tasks::Clocks> {
    let v = standing_version(circle, at, index)?;
    st(v, "clocks").and_then(crate::tasks::clocks_of)
}
/// The meter that stands (C21, D8): the standing block's `refs.meter`; a version that names none leaves the circle with none.
fn meter_at<'a>(circle: &str, at: Option<&Value>, index: &'a Index) -> Option<&'a str> {
    standing_version(circle, at, index).and_then(|v| rs(v, "meter"))
}
/// The meter of a circle among all held (the circle's line, C21).
pub(crate) fn circle_meter<'a>(circle: &str, index: &'a Index) -> Option<&'a str> {
    founding(circle, index)?;
    meter_at(circle, None, index)
}

// ---- Parts, read in a block's causal past ----

/// Who owns parts of a circle in the causal past of `at` (all held where None): for each owner, the parts she may still draw on (`free`:
/// what she owns less what her draws hold, each draw in `add_back` added back, D1) and her title (`title`: what she owns, held draws
/// included). The circle's own entry is its unissued parts. `None` when the circle has no pack; `Err(lacks)` when not shown to this reader.
type Owners = BTreeMap<String, (Dec, Dec)>;
fn owners_at(circle: &str, at: Option<&Value>, add_back: &[String], index: &Index) -> Option<Result<Owners, Value>> {
    let f = founding(circle, index)?;
    pack_of(f)?;
    let key = format!("c6own:{circle}:{}:{}", at.map(hash_of).unwrap_or(""), add_back.join(","));
    let v = memo(index, &key, Value::Null, || {
        let v = match at {
            None => super::things::own_value(circle, index),
            Some(b) if held_here(b, index) => {
                if !index.past_of(b).contains(circle) {
                    return Value::Null;
                }
                super::things::own_value_vis(circle, index, Some(hash_of(b)))
            }
            // a block not held is read on an index of its past alone
            Some(b) => {
                let past = index.past_of(b);
                let sub = read_all(index.values().filter(|x| past.contains(hash_of(x))));
                if sub.get(circle).is_none() {
                    return Value::Null;
                }
                super::things::own_value(circle, &sub)
            }
        };
        if v.get("not_shown") == Some(&Value::Bool(true)) {
            return json!({ "not_shown": true, "lacks": v["lacks"] });
        }
        let mut out: BTreeMap<String, (Dec, Dec)> = BTreeMap::new();
        for o in v["owners"].as_array().into_iter().flatten() {
            let (Some(who), Some(d)) = (o["owner"].as_str(), o["amount"]["value"].as_str().and_then(Dec::parse)) else { continue };
            let e = out.entry(who.to_string()).or_insert((Dec::zero(), Dec::zero()));
            *e = (e.0.add(&d), e.1.add(&d));
        }
        for d in v["draws"].as_array().into_iter().flatten().filter(|d| d["takes"] == Value::Bool(true) && d["state"] == json!("held")) {
            let (Some(by), Some(a)) = (d["by"].as_str(), d["amount"]["value"].as_str().and_then(Dec::parse)) else { continue };
            let e = out.entry(by.to_string()).or_insert((Dec::zero(), Dec::zero()));
            e.1 = e.1.add(&a);
            // D1: a draw of hers that the move (or a move it confirms) answers is no end of her hand for that move: hers until the yes lands
            if by != circle && d["block"].as_str().is_some_and(|h| add_back.iter().any(|x| x == h)) {
                e.0 = e.0.add(&a);
            }
        }
        Value::Object(out.into_iter().map(|(k, (fr, ti))| (k, json!([fr.text(), ti.text()]))).collect())
    });
    if v.is_null() {
        return Some(Ok(BTreeMap::new()));
    }
    if v.get("not_shown") == Some(&Value::Bool(true)) {
        return Some(Err(v["lacks"].clone()));
    }
    let out = v
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(k, p)| Some((k.clone(), (Dec::parse(p[0].as_str()?)?, Dec::parse(p[1].as_str()?)?))))
        .collect();
    Some(Ok(out))
}

// ---- Who a move gives to (C16, D6) ----

/// The ids a block gives anything to: a transfer's `to_owner` and `to_holder`; a grant's holders; an offer's or order's sides; an accept of
/// a promise, that promise's sides and author. An accept of a transfer gives nothing (it receives). Never the circle itself.
fn gives_to(block: &Value, circle: &str, index: &Index) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let t = type_of(block);
    let status = ss(block, "status");
    if t == "transfer" && st(block, "status").is_none() {
        out.extend(list(rf(block, "to_owner")).into_iter().chain(list(rf(block, "to_holder"))).map(String::from));
    } else if t == "grant" && st(block, "status").is_none() {
        out.extend(list(rf(block, "to")).into_iter().map(String::from));
    } else if t == "promise" && st(block, "status").is_none() && rf(block, "answers").is_none() {
        out.extend(["from", "to"].iter().flat_map(|k| list(rf(block, k))).map(String::from));
    } else if status == Some("accepted") {
        if let Some(p) = rs(block, "answers").and_then(|h| index.get(h)).filter(|p| type_of(p) == "promise") {
            out.extend(["from", "to", "author"].iter().flat_map(|k| list(rf(p, k))).map(String::from));
        }
    }
    sorted_set(out.into_iter().filter(|x| x != circle))
}

/// Whether `r` is `who` or hers for C16: herself, a key linked to hers (a two-key link), a tool of hers (the holder of a counted grant she
/// signed in her own name, in the move's past), or a circle in which her hand could count.
fn is_hers(r: &str, who: &str, block: &Value, index: &Index) -> bool {
    if r == who || super::grants::linked(r, who, index) {
        return true;
    }
    let past = index.past_of(block);
    let tool = index.values().any(|g| {
        type_of(g) == "grant" && st(g, "status").is_none() && rs(g, "author") == Some(who) && rs(g, "as").is_none() && list(rf(g, "to")).contains(&r) && past.contains(hash_of(g)) && crate::identity::counts_in(g, index)
    });
    tool || (founding(r, index).is_some() && r != who && hand_could_count(who, r, Some(block), index))
}
/// Whether a move gives to `who` (C16).
fn gives_to_who(block: &Value, receivers: &[String], who: &str, index: &Index) -> bool {
    receivers.iter().any(|r| is_hers(r, who, block, index))
}

/// Whether `who`'s hand could count in a circle, read in the causal past of `at` (all held where None): she owns parts of it by title, or a
/// row's `to` names her (or names a grant `as` the circle whose holders name her).
pub(crate) fn hand_could_count(who: &str, circle: &str, at: Option<&Value>, index: &Index) -> bool {
    if let Some(Ok(o)) = owners_at(circle, at, &[], index) {
        if o.get(who).is_some_and(|(_, title)| title.is_pos()) && who != circle {
            return true;
        }
    }
    let rows = standing_version(circle, at, index).map(rows_in).unwrap_or_default();
    rows.iter().any(|r| match &r.count {
        Count::Named { to, .. } => named_ids(to, circle, at, index).iter().any(|x| x == who),
        Count::Parts(_) => false,
    })
}

// ---- Seen, on the circle's clock (D11) ----

/// Whether block `x` has seen `e` (an end): `e` is in its causal past, or the circle's clock received `e` before `x` (its `needed` lines).
fn seen_by(x: &Value, e: &str, clocks: Option<&crate::tasks::Clocks>, index: &Index) -> bool {
    e == hash_of(x) || index.past_of(x).contains(e) || clocks.is_some_and(|k| crate::line::end_first(hash_of(x), e, k, index, &|_| true))
}

// ---- A row's `to` (C11, D16) ----

/// The ids a row's `to` names, read in the causal past of `at`: each id, or for an id that is a grant `as` the circle that holds, the
/// holders that grant names as it stands.
fn named_ids(to: &[String], circle: &str, at: Option<&Value>, index: &Index) -> Vec<String> {
    let key = format!("c6named:{circle}:{}:{}", to.join(","), at.map(hash_of).unwrap_or(""));
    let v = memo(index, &key, json!([]), || {
        let mut out: Vec<String> = Vec::new();
        for id in to {
            match index.get(id.as_str()).filter(|g| type_of(g) == "grant" && rs(g, "as") == Some(circle)) {
                Some(g) => out.extend(grant_holders(g, circle, at, index)),
                None => out.push(id.clone()),
            }
        }
        json!(sorted_set(out))
    });
    v.as_array().into_iter().flatten().filter_map(Value::as_str).map(String::from).collect()
}
/// The holders a head-count grant names as it stands in `at`'s past (D16): the newest of its newer words `as` the circle that hold; none
/// where a stop of it that counts is seen (a stop `as` the circle that holds, or its author's while her hand could count there); where two
/// newer words do not see each other, only the ids both name; less each holder who ended her own place. Seen on the circle's clock (D11).
fn grant_holders(g: &Value, circle: &str, at: Option<&Value>, index: &Index) -> Vec<String> {
    let clocks = clocks_at(circle, at, index);
    let seen = |h: &str| match at {
        None => true,
        Some(x) => seen_by(x, h, clocks.as_ref(), index),
    };
    if !at.is_none_or(|x| index.past_of(x).contains(hash_of(g)) || hash_of(x) == hash_of(g)) || !holds_in(g, circle, index) {
        return vec![];
    }
    let gh = hash_of(g);
    let names = index.names_memo();
    let named: Vec<&Value> = names.by_answer.get(gh).into_iter().flatten().filter_map(|n| index.get(n)).filter(|w| seen(hash_of(w)) && crate::identity::counts_in(w, index)).collect();
    if named.iter().any(|w| type_of(w) == "grant" && crate::grant::ending(w, gh) == Some(crate::grant::End::Stop) && stop_counts(w, g, circle, index)) {
        return vec![];
    }
    let newer: Vec<&Value> = named.iter().copied().filter(|w| type_of(w) == "grant" && st(w, "status").is_none() && rs(w, "updates") == Some(gh) && rs(w, "as") == Some(circle) && holds_in(w, circle, index)).collect();
    let heads: Vec<&Value> = newer.iter().copied().filter(|w| !newer.iter().any(|o| hash_of(o) != hash_of(w) && index.past_of(o).contains(hash_of(w)))).collect();
    let ids: Vec<String> = match heads.as_slice() {
        [] => list(rf(g, "to")).into_iter().map(String::from).collect(),
        [one] => list(rf(one, "to")).into_iter().map(String::from).collect(),
        many => {
            let sets: Vec<Vec<&str>> = many.iter().map(|w| list(rf(w, "to"))).collect();
            sets[0].iter().filter(|x| sets.iter().all(|s| s.contains(x))).map(|x| x.to_string()).collect()
        }
    };
    let own_end = |who: &str| named.iter().any(|b| rs(b, "author") == Some(who) && rs(b, "as").is_none() && crate::grant::ending(b, gh).is_some());
    ids.into_iter().filter(|x| !own_end(x) && !crate::identity::closes_of(x, index).iter().any(|c| seen(c))).collect()
}
/// Whether a stop of a grant signed `as` a circle counts (D17): a stop `as` the circle that holds (a row, or every owner), or its author's
/// own stop while her hand could still count there.
pub(crate) fn stop_counts(stop: &Value, grant: &Value, circle: &str, index: &Index) -> bool {
    if rs(stop, "as") == Some(circle) {
        return holds_in(stop, circle, index);
    }
    rs(stop, "as").is_none() && rs(stop, "author") == rs(grant, "author") && hand_could_count(rs(stop, "author").unwrap_or(""), circle, Some(stop), index)
}

// ---- A row's scope, read as a grant's is (C10, C12, C13, C4; D2, D9, D10) ----

fn type_names(block: &Value) -> Vec<String> {
    let t = type_of(block);
    let mut names = vec![t.to_string()];
    if let Some(kind) = ss(block, "kind") {
        names.push(format!("{t}.{kind}"));
    }
    names
}
/// What a block binds the circle to hand over, as one amount in the bound's kind, where it names one (D10; the owner's decision of
/// 2026-11-19, stage 4's rule for a grant's draw): the quantity where the bound is of the quantity's kind, else the deal's total at that
/// quantity. A transfer's amount; a transfer `for` a deal whose amount is of another kind than the bound (a till's loaf under "up to £300
/// a deal") is read as the deal's total at that amount. An offer's or order's total, or its quantity; an accept's, of the promise it
/// accepts. No other block has one.
fn block_amount(block: &Value, index: &Index, bound: Option<&crate::decimal::Kind>) -> Option<Amount> {
    let t = type_of(block);
    if t == "transfer" && st(block, "status").is_none() {
        let a = Amount::of(st(block, "amount"))?;
        if bound.is_none_or(|k| *k == a.kind) {
            return Some(a);
        }
        let Some(deal) = rs(block, "for").and_then(|h| index.get(h)) else { return Some(a) };
        let on = if ss(deal, "status") == Some("accepted") { rs(deal, "answers").and_then(|h| index.get(h)).unwrap_or(deal) } else { deal };
        let terms = get(on, "state.terms")?;
        return Amount::of(Some(&super::terms_total(terms, st(block, "amount"))));
    }
    let on = if t == "promise" && st(block, "status").is_none() && rf(block, "answers").is_none() {
        Some(block)
    } else if ss(block, "status") == Some("accepted") {
        rs(block, "answers").and_then(|h| index.get(h)).filter(|p| type_of(p) == "promise")
    } else {
        None
    }?;
    let terms = get(on, "state.terms")?;
    let quantity = get(block, "state.terms.quantity").or_else(|| terms.get("quantity"));
    if let (Some(k), Some(q)) = (bound, Amount::of(quantity)) {
        if q.kind == *k {
            return Some(q);
        }
    }
    Amount::of(Some(&super::terms_total(terms, quantity)))
}
/// Why a row's scope does not cover a block, or None where it does. A row's scope bounds only what it states (D2).
fn scope_misfit(block: &Value, row: &Row, circle: &str, index: &Index) -> Option<&'static str> {
    let s = &row.scope;
    if let Some(types) = scope_types(s) {
        if !type_names(block).iter().any(|n| types.contains(n)) {
            return Some("types");
        }
    }
    // C4: the circle's own parts move only by a row whose `scope.what` names the circle; a row that names `what` reaches only those
    let named = list(rf(block, "what"));
    match s.get("what") {
        Some(w) => {
            let ok = ids_of(Some(w));
            if named.iter().any(|x| !ok.contains(x)) {
                return Some("what");
            }
        }
        None => {
            if named.contains(&circle) {
                return Some("what");
            }
        }
    }
    if let Some(parties) = s.get("parties").and_then(Value::as_array) {
        let ok: Vec<&str> = parties.iter().filter_map(Value::as_str).collect();
        if gives_to(block, circle, index).iter().any(|r| !ok.contains(&r.as_str())) {
            return Some("parties");
        }
    }
    // a row that names promises covers a payment only `for` one of them, and an answer only answering one (D4)
    if let Some(on) = s.get("on") {
        let ons = ids_of(Some(on));
        let pays = type_of(block) == "transfer" && st(block, "status").is_none();
        if pays && !list(rf(block, "for")).iter().any(|f| ons.contains(f)) {
            return Some("on");
        }
        if rf(block, "answers").is_some() && !list(rf(block, "answers")).iter().any(|f| ons.contains(f)) {
            return Some("on");
        }
    }
    // C13 (D2, D3): a grant from a row is no wider than the row; one that is wider is covered by no row and waits
    if type_of(block) == "grant" && st(block, "status").is_none() && wider_than_row(block, s) {
        return Some("wider_than_parent");
    }
    // C12: bounds. A row that states a bound bounds every kind: an amount of another kind is above it, as under a grant.
    let each = s.get("each").and_then(|v| Amount::of(Some(v)));
    let limit = s.get("limit").and_then(|v| Amount::of(Some(v)));
    if each.is_some() || limit.is_some() {
        let bound = each.as_ref().or(limit.as_ref()).map(|x| x.kind.clone());
        if let Some(a) = block_amount(block, index, bound.as_ref()).filter(|_| !counted_when_bound(block, circle, index)) {
            if let Some(e) = &each {
                if a.kind != e.kind || a.value.cmp(&e.value) == Ordering::Greater {
                    return Some("each");
                }
            }
            if let Some(l) = &limit {
                let a = block_amount(block, index, Some(&l.kind)).unwrap_or(a.clone());
                if a.kind != l.kind {
                    return Some("limit");
                }
                // D9: what this same row held for in the block's causal past, in the same period, each counted once, plus this one
                let past = index.past_of(block);
                let period = row_period(block, s, circle, index);
                let mut used = a.value.clone();
                for b in index.values().filter(|b| past.contains(hash_of(b)) && rs(b, "as") == Some(circle)) {
                    if counted_when_bound(b, circle, index) || row_period(b, s, circle, index) != period {
                        continue;
                    }
                    let j = judge(b, circle, index);
                    if j["holds"] == Value::Bool(true) && j["row"].as_u64() == Some(row.at as u64) {
                        if let Some(x) = block_amount(b, index, Some(&l.kind)).filter(|x| x.kind == l.kind) {
                            used = used.add(&x.value);
                        }
                    }
                }
                if used.cmp(&l.value) == Ordering::Greater {
                    return Some("limit");
                }
            }
        }
    }
    if let Some(until) = s.get("until").and_then(Value::as_str) {
        if ss(block, "at").is_none_or(|at| at >= until) {
            return Some("until");
        }
    }
    None
}
/// Which period of a row's `every` a block is read in (D9): the cutoffs on the circle's meter line whose `refs.subject` is the circle and
/// whose `when` is a span no shorter than `every`, before the block (in its causal past, or before the meter's receipt of it). With no
/// meter, or no `every`, no period turns.
fn row_period(block: &Value, scope: &Value, circle: &str, index: &Index) -> usize {
    let Some(every) = scope.get("every").and_then(Value::as_str) else { return 0 };
    let Some(meter) = meter_at(circle, Some(block), index) else { return 0 };
    let Some(line) = crate::line::line_named(meter, index) else { return 0 };
    let long_enough = |w: &str| crate::time::parse_duration(w).is_some() && crate::grant::cmp_value(&json!(w), &json!(every)).is_some_and(|o| o != Ordering::Less);
    let cuts: Vec<&Value> = index
        .values()
        .filter(|c| type_of(c) == "observe" && ss(c, "kind") == Some("cutoff") && rs(c, "subject") == Some(circle) && ss(c, "when").is_some_and(long_enough) && crate::line::on_line(c, &line, index) && crate::identity::counts_in(c, index))
        .collect();
    let past = index.past_of(block);
    let receipt = crate::line::receipts_of(hash_of(block), &line, index, &|_| true).into_iter().min_by_key(|r| index.past_of(r).len());
    cuts.iter().filter(|c| past.contains(hash_of(c)) || receipt.is_some_and(|r| index.past_of(r).contains(hash_of(c)))).count()
}
/// A block `for` a deal the circle bound, where the binding block `as` the circle holds in its causal past, is counted once, when the deal
/// stood (stage 4's counted-once rule, 05 R7c; C12's kept word): a row's bounds do not count it again.
fn counted_when_bound(block: &Value, circle: &str, index: &Index) -> bool {
    let past = index.past_of(block);
    list(rf(block, "for")).iter().any(|d| {
        let names_deal = |b: &Value| hash_of(b) == *d || list(rf(b, "for")).contains(d) || list(rf(b, "answers")).contains(d);
        index.values().any(|b| {
            past.contains(hash_of(b)) && rs(b, "as") == Some(circle) && type_of(b) == "promise" && names_deal(b) && (st(b, "status").is_none() || ss(b, "status") == Some("accepted")) && holds_in(b, circle, index)
        })
    })
}

/// Whether a grant signed `as` the circle is wider than a row's scope (C13, D2): types not a subset; a bound the row states and the grant does
/// not keep within; `what` beyond the row's. A field the row leaves out bounds nothing.
fn wider_than_row(grant: &Value, row: &Value) -> bool {
    let gs = st(grant, "scope").cloned().unwrap_or(json!({}));
    if let Some(rt) = scope_types(row) {
        // a grant that names no types acts for no type (a key grant, a rekey): it is no wider
        if scope_types(&gs).unwrap_or_default().iter().any(|t| !rt.contains(t)) {
            return true;
        }
    }
    let amt = |v: &Value, k: &str| v.get(k).and_then(|x| Amount::of(Some(x)));
    let within = |g: Option<Amount>, r: &Amount| g.is_some_and(|g| g.kind == r.kind && g.value.cmp(&r.value) != Ordering::Greater);
    if let Some(re) = amt(row, "each") {
        if !(within(amt(&gs, "each"), &re) || (amt(&gs, "each").is_none() && within(amt(&gs, "limit"), &re))) {
            return true;
        }
    }
    if let Some(rl) = amt(row, "limit") {
        if !within(amt(&gs, "limit"), &rl) {
            return true;
        }
    }
    if let Some(w) = row.get("what") {
        let ok = ids_of(Some(w));
        if list(rf(grant, "what")).iter().any(|x| !ok.contains(x)) {
            return true;
        }
    }
    false
}

// ---- Hands, and whether a move holds (C6, C10, C15, C16, C18; invariant 27) ----

struct Hand<'a> {
    block: &'a Value,
    /// whose hand it is: the signer; for a confirm `as` another circle, that circle; for a confirm `as` the very circle, the circle
    who: String,
    /// why it counts for nothing whatever the row: `pair`, `waiting`, `not_voice`
    fixed: Option<&'static str>,
    /// her free parts of the circle in her hand's own causal past (D1's add-back applied); None with no pack
    parts: Option<Dec>,
}

/// The reading of one move: its hands, rows, the meter's word on its unissued parts, read once.
struct Move<'a> {
    block: &'a Value,
    circle: String,
    hands: Vec<Hand<'a>>,
    rows: Vec<Row>,
    receivers: Vec<String>,
    add_back: Vec<String>,
    clocks: Option<crate::tasks::Clocks>,
    candidates: Vec<&'a Value>,
    is_version: bool,
}

/// What a candidate (the move or a confirm of it) shows: the row that holds there, or every owner; each hand's count and why.
struct At {
    row: Option<usize>,
    every: bool,
    counts: Vec<bool>,
    why: Vec<Option<&'static str>>,
}

#[cfg(feature = "std")]
std::thread_local! {
    static DRAFTED: core::cell::RefCell<Option<String>> = const { core::cell::RefCell::new(None) };
}
/// Read `f` with the unsigned draft of id `draft` taken as a hand that counts (the owner's decision of 2026-11-19, for `binds`): a draft
/// signed `as` a circle binds where her row would hold, as if her hand counts. Only the draft's own hand; every other rule is read as it is.
pub(crate) fn as_drafted<T>(draft: &str, f: impl FnOnce() -> T) -> T {
    #[cfg(feature = "std")]
    {
        let before = DRAFTED.with(|d| d.borrow_mut().replace(draft.to_string()));
        let out = f();
        DRAFTED.with(|d| *d.borrow_mut() = before);
        out
    }
    #[cfg(not(feature = "std"))]
    {
        let _ = draft;
        f()
    }
}
fn is_drafted(h: &str) -> bool {
    #[cfg(feature = "std")]
    {
        DRAFTED.with(|d| d.borrow().as_deref() == Some(h))
    }
    #[cfg(not(feature = "std"))]
    {
        let _ = h;
        false
    }
}

impl<'a> Move<'a> {
    fn read(block: &'a Value, circle: &str, index: &'a Index) -> Option<Move<'a>> {
        let f = founding(circle, index)?;
        let bh = hash_of(block);
        // D1: the draws the move, or a move it confirms, answers
        let mut add_back: Vec<String> = list(rf(block, "answers")).into_iter().map(String::from).collect();
        for c in list(rf(block, "confirms")).into_iter().filter_map(|h| index.get(h)) {
            add_back.extend(list(rf(c, "answers")).into_iter().map(String::from));
        }
        let add_back = sorted_set(add_back);
        let pairs: BTreeSet<String> = crate::identity::pair_groups_in(index).into_iter().flatten().collect();
        let names = index.names_memo();
        let mut hand_blocks: Vec<&Value> = vec![index.get(bh).filter(|x| *x == block).unwrap_or(block)];
        hand_blocks.extend(names.by_confirms.get(bh).into_iter().flatten().filter_map(|n| index.get(n)).filter(|c| hash_of(c) != bh && c.get("type").is_some() && rs(c, "author").is_some()));
        let pack = pack_of(f);
        let hands: Vec<Hand> = hand_blocks
            .into_iter()
            .map(|b| {
                let author = rs(b, "author").unwrap_or("").to_string();
                let fork = pairs.contains(hash_of(b));
                let (who, fixed_as): (String, Option<&'static str>) = match rs(b, "as").filter(|c| !c.is_empty() && hash_of(b) != bh) {
                    // a confirm `as` the very circle: a hand on its unissued parts (C4)
                    Some(c) if c == circle => (circle.to_string(), Some("not_voice")),
                    // a confirm `as` another circle: that circle's hand, where a row of it holds for the confirm (C5)
                    Some(c) => (c.to_string(), (!holds_in(b, c, index)).then_some("waiting")),
                    None => (author, None),
                };
                let fixed = if fork {
                    Some("pair")
                } else if is_drafted(hash_of(b)) {
                    None
                } else if !crate::identity::counts_in(b, index) {
                    Some("not_voice")
                } else if fixed_as.is_some() {
                    fixed_as
                } else if !crate::identity::stands_own(b, index).stands {
                    Some("waiting")
                } else {
                    None
                };
                let parts = pack.as_ref().map(|_| match owners_at(circle, Some(b), &add_back, index) {
                    // a hand `as` the very circle shows its unissued parts (C4): they count in no row
                    Some(Ok(o)) => o.get(&who).map(|p| p.0.clone()).unwrap_or_else(Dec::zero),
                    _ => Dec::zero(),
                });
                Hand { block: b, who, fixed, parts }
            })
            .collect();
        let mut candidates: Vec<&Value> = hands.iter().map(|h| h.block).collect();
        candidates.sort_by(|a, b| index.past_of(a).len().cmp(&index.past_of(b).len()).then_with(|| hash_of(a).cmp(hash_of(b))));
        candidates.dedup_by(|a, b| hash_of(a) == hash_of(b));
        Some(Move {
            block,
            circle: circle.to_string(),
            rows: rows_for(circle, block, index),
            receivers: gives_to(block, circle, index),
            clocks: clocks_at(circle, Some(block), index),
            is_version: is_version_of(block, circle),
            hands,
            add_back,
            candidates,
        })
    }

    /// "Every part persons own" for the move read at `x` (C6, D8): the pack where no part is unissued; else the pack less the unissued parts
    /// the meter's receipt of the move states (several held must agree). None where there is no such way.
    fn persons_own(&self, x: &Value, index: &Index) -> Option<Dec> {
        let f = founding(&self.circle, index)?;
        let pack = pack_of(f)?;
        let unissued = match owners_at(&self.circle, Some(x), &self.add_back, index)? {
            Ok(o) => o.get(&self.circle).map(|p| p.1.clone()).unwrap_or_else(Dec::zero),
            Err(_) => return None,
        };
        if !unissued.is_pos() {
            return Some(pack);
        }
        let meter = meter_at(&self.circle, Some(self.block), index)?;
        let line = crate::line::line_named(meter, index)?;
        let stated: Vec<Dec> = crate::line::receipts_of(hash_of(self.block), &line, index, &|_| true)
            .into_iter()
            .filter(|r| crate::identity::counts_in(r, index))
            .filter_map(|r| Amount::of(st(r, "unissued")).filter(|a| a.kind.unit == "part" && a.kind.of.is_none()).map(|a| a.value))
            .collect();
        match stated.as_slice() {
            [] => None,
            many if many.iter().all(|x| x.cmp(&many[0]).is_eq()) => Some(pack.sub(&many[0])),
            _ => None,
        }
    }

    /// Whether a hand's ends (C15, D7) are seen by `x` (in its past, or by the circle's clock, D11): for a parts row (and every owner), any
    /// draw of hers on the circle's parts signed after her hand, bar one the move answers (D1), or her close; for a `to` row, every end of
    /// her place (read by `named_ids` at `x`) and her close.
    fn ended(&self, h: &Hand, x: &Value, parts_way: bool, index: &Index) -> bool {
        let hp = index.past_of(h.block);
        let after = |b: &str| b != hash_of(h.block) && !hp.contains(b) && seen_by(x, b, self.clocks.as_ref(), index);
        if crate::identity::closes_of(&h.who, index).iter().any(|c| after(c)) {
            return true;
        }
        if !parts_way {
            return false;
        }
        let names = index.names_memo();
        // (the cheap tests first: whose transfer it is, then whether it was seen and counts; one conjunction, so no answer changes)
        names.by_what.get(&self.circle).into_iter().flatten().filter_map(|n| index.get(n)).any(|t| {
            type_of(t) == "transfer"
                && st(t, "status").is_none()
                && match rs(t, "as").filter(|c| !c.is_empty()) {
                    None => rs(t, "author") == Some(h.who.as_str()),
                    Some(c) => c == h.who,
                }
                && !self.add_back.iter().any(|a| a == hash_of(t))
                && after(hash_of(t))
                && crate::identity::counts_in(t, index)
        })
    }

    /// Whether a row's (or a grant's) `scope.on` names a promise the move is `for` that names her in `from` or `to` (C16's last clause).
    fn on_names(&self, r: &Row, who: &str, index: &Index) -> bool {
        let ons = ids_of(r.scope.get("on"));
        let fors = list(rf(self.block, "for"));
        ons.iter().filter(|p| fors.contains(p)).filter_map(|p| index.get(*p)).any(|p| ["from", "to"].iter().any(|k| list(rf(p, k)).contains(&who)))
    }

    /// What candidate `present` shows (`x` the block that completes it, None for "every hand held, every end seen by any").
    fn eval(&self, x: Option<&Value>, index: &Index) -> At {
        let n = self.hands.len();
        let present: Vec<usize> = match x {
            Some(x) => {
                let xp = index.past_of(x);
                (0..n).filter(|&i| hash_of(self.hands[i].block) == hash_of(x) || xp.contains(hash_of(self.hands[i].block))).collect()
            }
            None => (0..n).collect(),
        };
        let cache: core::cell::RefCell<BTreeMap<(usize, bool), bool>> = Default::default();
        let ended = |i: usize, parts_way: bool| {
            if let Some(v) = cache.borrow().get(&(i, parts_way)) {
                return *v;
            }
            let v = match x {
                Some(x) => self.ended(&self.hands[i], x, parts_way, index),
                None => self.candidates.iter().any(|c| self.ended(&self.hands[i], c, parts_way, index)),
            };
            cache.borrow_mut().insert((i, parts_way), v);
            v
        };
        let at = x.unwrap_or_else(|| self.candidates.last().copied().unwrap_or(self.block));
        let gives = |who: &str| gives_to_who(self.block, &self.receivers, who, index);
        // a hand's weight in a row: parts, or 1 where `to` names her; None where it adds nothing
        let weight = |i: usize, r: &Row| -> Option<Dec> {
            let h = &self.hands[i];
            if h.fixed.is_some() || h.who == self.circle {
                return None;
            }
            match &r.count {
                Count::Parts(_) => {
                    if ended(i, true) {
                        return None;
                    }
                    h.parts.clone().filter(|d| d.is_pos())
                }
                Count::Named { to, .. } => {
                    let then = named_ids(to, &self.circle, Some(h.block), index);
                    let now = named_ids(to, &self.circle, Some(at), index);
                    (then.contains(&h.who) && (x.is_none() || now.contains(&h.who)) && !ended(i, false)).then(one)
                }
            }
        };
        // each id once (A count counts ids): her hand with the most parts (or place), ties to the lowest block hash
        let tally = |r: Option<&Row>| -> BTreeMap<String, (usize, Dec)> {
            let mut by_who: BTreeMap<String, (usize, Dec)> = BTreeMap::new();
            for &i in &present {
                let h = &self.hands[i];
                let w = match r {
                    Some(r) => {
                        if gives(&h.who) && !self.on_names(r, &h.who, index) {
                            continue;
                        }
                        weight(i, r)
                    }
                    None => (h.fixed.is_none() && h.who != self.circle && !ended(i, true)).then(|| h.parts.clone()).flatten().filter(|p| p.is_pos()),
                };
                let Some(w) = w else { continue };
                match by_who.get(&h.who) {
                    Some((j, e)) if e.cmp(&w).is_gt() || (e.cmp(&w).is_eq() && hash_of(self.hands[*j].block) < hash_of(h.block)) => {}
                    _ => {
                        by_who.insert(h.who.clone(), (i, w));
                    }
                }
            }
            by_who
        };
        let total = |t: &BTreeMap<String, (usize, Dec)>| t.values().fold(Dec::zero(), |s, (_, d)| s.add(d));
        let mut row_held = None;
        let mut first_cover: Option<&Row> = None;
        for r in &self.rows {
            if scope_misfit(self.block, r, &self.circle, index).is_some() {
                continue;
            }
            if first_cover.is_none() {
                first_cover = Some(r);
            }
            let t = tally(Some(r));
            let enough = match &r.count {
                Count::Parts(p) => total(&t).cmp(&dec_n(*p)) != Ordering::Less,
                Count::Named { needed, .. } => t.len() as u64 >= *needed,
            };
            if enough {
                row_held = Some(r.at);
                break;
            }
        }
        // every owner together: hands that own every part persons own
        let mut every = false;
        if row_held.is_none() {
            if let Some(need) = self.persons_own(at, index) {
                every = need.is_pos() && total(&tally(None)).cmp(&need) != Ordering::Less;
            }
        }
        // each hand's count in the way read: the row that holds; else every owner where it holds; else the first row whose scope covers the
        // move; else every owner
        let read: Option<&Row> = match row_held {
            Some(at) => self.rows.iter().find(|r| r.at == at),
            None if every => None,
            None => first_cover,
        };
        let chosen = tally(read);
        let mut counts = vec![false; n];
        for (i, _) in chosen.values() {
            counts[*i] = true;
        }
        let why: Vec<Option<&'static str>> = (0..n).map(|i| if counts[i] { None } else { Some(self.hands[i].fixed.unwrap_or("not_voice")) }).collect();
        At { row: row_held, every, counts, why }
    }

    /// Whether the move holds at candidate `x` (remembered).
    fn holds_at(&self, x: &Value, index: &Index) -> bool {
        let key = format!("c6at:{}:{}", hash_of(self.block), hash_of(x));
        let v = memo(index, &key, json!(false), || {
            let a = self.eval(Some(x), index);
            json!(a.row.is_some() || a.every)
        });
        v == Value::Bool(true) && self.parent_holds(index)
    }
    /// A version holds only where what it updates is the founding block or a version that holds (C19, D15).
    fn parent_holds(&self, index: &Index) -> bool {
        if !self.is_version {
            return true;
        }
        match rs(self.block, "updates") {
            Some(u) if u == self.circle => true,
            Some(u) => index.get(u).is_some_and(|p| is_version_of(p, &self.circle) && holds_in(p, &self.circle, index)),
            None => false,
        }
    }
}

/// Whether a block `as` a circle holds (`row_holds(...).holds`).
pub(crate) fn holds_in(block: &Value, circle: &str, index: &Index) -> bool {
    rs(block, "as") == Some(circle) && judge(block, circle, index)["holds"] == Value::Bool(true)
}
/// Whether a block `as` a circle holds as a relier sees it: at a candidate (the move or a confirm) in the relier's causal past.
pub(crate) fn holds_seen(block: &Value, circle: &str, index: &Index, past: &crate::js::Past) -> bool {
    if rs(block, "as") != Some(circle) || !holds_in(block, circle, index) {
        return false;
    }
    let Some(m) = Move::read(block, circle, index) else { return false };
    m.candidates.iter().filter(|c| past.contains(hash_of(c))).any(|c| m.holds_at(c, index))
}

/// The circle's judgement of a block signed `as` it: `{ circle, holds, row, every_owner, at, hands: [{ id, block, parts, counts, why }],
/// waiting, listed }` (`row_holds`). Remembered for a held block.
pub(crate) fn judge(block: &Value, circle: &str, index: &Index) -> Value {
    let no = json!({ "circle": circle, "holds": false, "row": null, "every_owner": false, "at": null, "hands": [], "waiting": [{ "block": hash_of(block), "on": "hands" }] });
    if !held_here(block, index) {
        return judge_read(block, circle, index);
    }
    // a reading of another index (a fold that reads its own copy of the blocks) can ask about the same move: read once on this thread
    let key = format!("c6row:{circle}:{}", hash_of(block));
    if index.stage_peek(&key).is_none() && judging(&key, true) {
        index.taint_bump();
        busy_hit(&key);
        return no;
    }
    let from = busy_mark();
    let v = memo(index, &key, no, || judge_read(block, circle, index));
    judging(&key, false);
    // a judgement whose only placeholder was itself (the move asked about while it was being read, a ring of one) is what every later
    // reading of it reads too, since that reading meets itself the same way: remember it, so the move is not read again for each of its
    // hands (end pass 2026-11-20: a move that waits for hands was read once per hand; no answer changes)
    if index.stage_peek(&key).is_none() && busy_since(from).iter().all(|k| *k == key) {
        index.stage_put(&key, v.clone());
    }
    v
}
#[cfg(feature = "std")]
std::thread_local! { static BUSY_LOG: core::cell::RefCell<Vec<String>> = const { core::cell::RefCell::new(Vec::new()) }; }
/// A reading met a placeholder for `key` (an asker of its own still being read).
fn busy_hit(key: &str) {
    #[cfg(feature = "std")]
    BUSY_LOG.with(|l| l.borrow_mut().push(key.to_string()));
    #[cfg(not(feature = "std"))]
    let _ = key;
}
fn busy_mark() -> usize {
    #[cfg(feature = "std")]
    {
        BUSY_LOG.with(|l| l.borrow().len())
    }
    #[cfg(not(feature = "std"))]
    {
        usize::MAX
    }
}
/// The placeholders met since `from` (none known without std: then nothing more is remembered than before).
fn busy_since(from: usize) -> Vec<String> {
    #[cfg(feature = "std")]
    {
        BUSY_LOG.with(|l| l.borrow().get(from..).map(<[String]>::to_vec).unwrap_or_default())
    }
    #[cfg(not(feature = "std"))]
    {
        let _ = from;
        vec![String::from("unknown")]
    }
}
#[cfg(feature = "std")]
std::thread_local! { static JUDGING: core::cell::RefCell<BTreeSet<String>> = const { core::cell::RefCell::new(BTreeSet::new()) }; }
/// Whether the move is already being judged on this thread (`enter`: mark it; else unmark it).
#[cfg(feature = "std")]
fn judging(key: &str, enter: bool) -> bool {
    JUDGING.with(|j| if enter { !j.borrow_mut().insert(key.to_string()) } else { j.borrow_mut().remove(key); false })
}
#[cfg(not(feature = "std"))]
fn judging(_key: &str, _enter: bool) -> bool {
    false
}

fn judge_read(block: &Value, circle: &str, index: &Index) -> Value {
    let bh = hash_of(block);
    let no = || json!({ "circle": circle, "holds": false, "row": null, "every_owner": false, "at": null, "hands": [], "waiting": [{ "block": bh, "on": "hands" }] });
    if founding(circle, index).is_none() || rs(block, "as") != Some(circle) {
        return no();
    }
    if !crate::js::needs_missing(block, index).is_empty() || !index.past_of(block).contains(circle) {
        return no();
    }
    let Some(m) = Move::read(block, circle, index) else { return no() };
    let chosen = m.candidates.iter().copied().find(|x| m.holds_at(x, index));
    let holds = chosen.is_some();
    let shown = m.eval(chosen, index);
    let xp = chosen.map(|x| index.past_of(x));
    let mut hands: Vec<Value> = m
        .hands
        .iter()
        .enumerate()
        .filter(|(_, h)| match (&chosen, &xp) {
            (Some(x), Some(p)) => hash_of(h.block) == hash_of(x) || p.contains(hash_of(h.block)),
            _ => true,
        })
        .map(|(i, h)| {
            json!({
                "id": h.who,
                "block": hash_of(h.block),
                "parts": h.parts.as_ref().map(|p| json!({ "value": p.text(), "unit": "part" })),
                "counts": shown.counts[i],
                "why": if shown.counts[i] { Value::Null } else { json!(shown.why[i]) },
            })
        })
        .collect();
    hands.sort_by(|a, b| a["block"].as_str().cmp(&b["block"].as_str()));
    json!({
        "circle": circle,
        "holds": holds,
        "row": if holds { json!(shown.row) } else { Value::Null },
        "every_owner": holds && shown.row.is_none() && shown.every,
        "at": chosen.map(hash_of),
        "hands": hands,
        "waiting": if holds { json!([]) } else { json!([{ "block": bh, "on": "hands" }]) },
    })
}

/// C9b, the listing (a reading, D: door shape 1): where the move gives to an owner (an id owning parts by title, held-for-sale parts
/// included), a tool of hers, or a circle in which her hand could count, the promises signed `as` the circle that hold, are not in the
/// move's causal past, are not the move, and whose stage is not done, stopped or declined; sorted. Else none.
fn listed(m: &Move, index: &Index) -> Vec<String> {
    if m.receivers.is_empty() {
        return vec![];
    }
    let owners: Vec<String> = match owners_at(&m.circle, Some(m.block), &[], index) {
        Some(Ok(o)) => o.iter().filter(|(w, (_, t))| **w != m.circle && t.is_pos()).map(|(w, _)| w.clone()).collect(),
        _ => vec![],
    };
    if !owners.iter().any(|o| gives_to_who(m.block, &m.receivers, o, index)) {
        return vec![];
    }
    let past = index.past_of(m.block);
    let bh = hash_of(m.block);
    sorted_set(
        index
            .values()
            .filter(|w| type_of(w) == "promise" && rs(w, "as") == Some(m.circle.as_str()) && hash_of(w) != bh && !past.contains(hash_of(w)))
            .filter(|w| crate::identity::counts_in(w, index) && holds_in(w, &m.circle, index))
            .filter(|w| {
                let s = super::promise::promise_stage_in(hash_of(w), index, &super::StageOptions::default());
                s.get("stage").and_then(Value::as_str).is_some_and(|st| !matches!(st, "done" | "stopped" | "declined"))
            })
            .map(hash_of),
    )
}

/// `row_holds(block, held)`: the circle's judgement of a block signed `as` it (folds.md, 1.9 stage 6). The circle is the block's `refs.as`.
/// Null where it names no circle held. The block is read with `held` as if it were held.
pub fn row_holds(block: &Value, blocks: &[Value]) -> Value {
    let Some(circle) = rs(block, "as").filter(|c| !c.is_empty()) else { return Value::Null };
    let read = read_all(blocks.iter().filter(|b| hash_of(b) != hash_of(block)).chain([block]));
    if founding(circle, &read).is_none() {
        return Value::Null;
    }
    let b = read.get(hash_of(block)).unwrap_or(block);
    let mut v = judge(b, circle, &read);
    let listed = Move::read(b, circle, &read).map(|m| listed(&m, &read)).unwrap_or_default();
    v["listed"] = json!(listed);
    v
}

/// Whether `person` signed a hand that counted for a block `as` a circle (authority.md, Backed by a person: P signed a hand of the circle it is
/// signed as).
pub(crate) fn is_hand_at(person: &str, circle: &str, block: &Value, read: &Index) -> bool {
    rs(block, "as") == Some(circle)
        && judge(block, circle, read)["hands"].as_array().into_iter().flatten().any(|h| h["counts"] == Value::Bool(true) && h["id"].as_str() == Some(person))
}
/// The signers of a move's hands, and the tools and grant holders of theirs (D13): no one of them is "another person" joined to it.
pub(crate) fn gathered(block: &Value, index: &Index) -> Vec<String> {
    let bh = hash_of(block);
    let names = index.names_memo();
    let mut signers: Vec<String> = rs(block, "author").map(String::from).into_iter().collect();
    signers.extend(names.by_confirms.get(bh).into_iter().flatten().filter_map(|n| index.get(n)).filter_map(|c| rs(c, "author")).map(String::from));
    let signers = sorted_set(signers);
    // a tool of hers, and anyone under a grant she gave: the holders of grants signed in her own name
    let mut out = signers.clone();
    for g in index.values().filter(|g| type_of(g) == "grant" && st(g, "status").is_none() && rs(g, "as").is_none() && rs(g, "author").is_some_and(|a| signers.iter().any(|s| s == a))) {
        out.extend(list(rf(g, "to")).into_iter().map(String::from));
    }
    sorted_set(out)
}

// ---- The readings ----

fn owners_json(circle: &str, o: &Owners, index: &Index) -> Vec<Value> {
    o.iter()
        .filter(|(w, (f, _))| w.as_str() != circle && f.is_pos())
        .map(|(w, (f, _))| json!({ "owner": w, "amount": { "value": f.text(), "unit": "part" }, "no_person": no_person(w, index, &mut vec![circle.to_string()]) }))
        .collect()
}
/// Whether the owners of an owner end in no person (C5): a circle whose owners are all circles whose owners end in no person (a ring).
fn no_person(who: &str, index: &Index, seen: &mut Vec<String>) -> bool {
    if founding(who, index).is_none() {
        return false;
    }
    if seen.iter().any(|s| s == who) {
        return true;
    }
    seen.push(who.to_string());
    let out = match owners_at(who, None, &[], index) {
        Some(Ok(o)) => {
            let others: Vec<&String> = o.iter().filter(|(w, (_, t))| w.as_str() != who && t.is_pos()).map(|(w, _)| w).collect();
            !others.is_empty() && others.iter().all(|w| no_person(w, index, seen))
        }
        _ => false,
    };
    seen.pop();
    out
}

/// `circle_state(circle, held, within)`: `{ founder, pack, owners, unissued, rules, clocks, meter }` (folds.md, Circle fold); `owners`
/// `[{ owner, amount, no_person }]` sorted, or `{ not_said: true }`; `{ not_shown, lacks }` where an owner's line is not read whole. Within a
/// block: as of that block's causal past. Null where the circle is not held there. Rows, clocks and meter from the standing block (D15).
pub fn circle_state(circle: &str, blocks: &[Value], within: Option<&Value>) -> Value {
    let index = read_all(blocks.iter().chain(within));
    circle_state_in(circle, &index, within.and_then(|w| index.get(hash_of(w))))
}
pub(crate) fn circle_state_in(circle: &str, index: &Index, within: Option<&Value>) -> Value {
    let Some(f) = founding(circle, index) else { return Value::Null };
    if within.is_some_and(|w| !index.past_of(w).contains(circle)) {
        return Value::Null;
    }
    let pack = pack_of(f);
    let (owners, unissued) = match owners_at(circle, within, &[], index) {
        None => (json!({ "not_said": true }), Value::Null),
        Some(Err(lacks)) => return json!({ "not_shown": true, "lacks": lacks }),
        Some(Ok(o)) => {
            let un = o.get(circle).map(|x| x.1.clone()).unwrap_or_else(Dec::zero);
            (Value::Array(owners_json(circle, &o, index)), json!({ "value": un.text(), "unit": "part" }))
        }
    };
    let v = standing_version(circle, within, index).unwrap_or(f);
    json!({
        "founder": rs(f, "author"),
        "pack": pack.map(|p| json!({ "value": p.text(), "unit": "part" })),
        "owners": owners,
        "unissued": unissued,
        "rules": st(v, "rules").cloned().unwrap_or(json!([])),
        "clocks": st(v, "clocks").cloned().unwrap_or(Value::Null),
        "meter": rs(v, "meter"),
    })
}

/// The ids that own parts of a circle by title in the causal past of a block (C8): parts held for a sale count for the seller until the
/// receiver's yes. Its own unissued parts name no one.
pub(crate) fn owners_then(circle: &str, block: Option<&Value>, index: &Index) -> Vec<String> {
    match owners_at(circle, block, &[], index) {
        Some(Ok(o)) => sorted_set(o.iter().filter(|(w, (_, t))| w.as_str() != circle && t.is_pos()).map(|(w, _)| w)),
        _ => vec![],
    }
}

/// `circle_versions(circle, held)`: `{ circle, versions: [{ version, updates, author, holds, hands }], now }` (C19): each version held (not
/// the founding block), sorted by version; `hands` the ids whose hands counted; `now` the standing version's id, else the founding block's.
pub fn circle_versions(circle: &str, blocks: &[Value]) -> Value {
    let index = read_all(blocks.iter());
    if founding(circle, &index).is_none() {
        return Value::Null;
    }
    let mut out = vec![];
    for v in versions(circle, &index) {
        let j = judge(v, circle, &index);
        let hands: Vec<String> = sorted_set(j["hands"].as_array().into_iter().flatten().filter(|h| h["counts"] == Value::Bool(true)).filter_map(|h| h["id"].as_str()));
        out.push(json!({ "version": hash_of(v), "updates": rs(v, "updates"), "author": rs(v, "author"), "holds": j["holds"], "hands": hands }));
    }
    out.sort_by(|a, b| a["version"].as_str().cmp(&b["version"].as_str()));
    json!({ "circle": circle, "versions": out, "now": standing_version(circle, None, &index).map(hash_of) })
}

/// `ways_in(circle, held)`, a reading: for each row its `least` (a `to` row its `needed`, null where fewer ids are named; a parts row the
/// fewest owners whose free parts reach `parts`, null where none can), and the every-owner way with `least` the number of ids that own parts
/// (null where there is no such way: no pack, or unissued parts and no meter). No row's `least` is above the every-owner way's.
pub fn ways_in(circle: &str, blocks: &[Value]) -> Value {
    let index = read_all(blocks.iter());
    let Some(f) = founding(circle, &index) else { return Value::Null };
    let owners = match owners_at(circle, None, &[], &index) {
        Some(Err(lacks)) => return json!({ "not_shown": true, "lacks": lacks }),
        Some(Ok(o)) => Some(o),
        None => None,
    };
    let persons: Vec<Dec> = owners.iter().flatten().filter(|(w, (fr, _))| w.as_str() != circle && fr.is_pos()).map(|(_, (fr, _))| fr.clone()).collect();
    let unissued = owners.as_ref().and_then(|o| o.get(circle)).is_some_and(|x| x.1.is_pos());
    let every: Option<u64> = (owners.is_some() && !(unissued && meter_at(circle, None, &index).is_none())).then_some(persons.len() as u64);
    let v = standing_version(circle, None, &index).unwrap_or(f);
    let rows: Vec<Value> = rows_in(v)
        .iter()
        .map(|r| {
            let least: Option<u64> = match &r.count {
                Count::Named { to, needed } => (named_ids(to, circle, None, &index).len() as u64 >= *needed).then_some(*needed),
                Count::Parts(p) => {
                    let mut free = persons.clone();
                    free.sort_by(|a, b| b.cmp(a));
                    let want = dec_n(*p);
                    let mut sum = Dec::zero();
                    free.iter()
                        .position(|d| {
                            sum = sum.add(d);
                            sum.cmp(&want) != Ordering::Less
                        })
                        .map(|i| i as u64 + 1)
                }
            };
            let least = match (least, every) {
                (Some(l), Some(e)) => Some(l.min(e)),
                (l, _) => l,
            };
            json!({ "row": r.at, "least": least })
        })
        .collect();
    json!({ "circle": circle, "rows": rows, "every_owner": every.map(|e| json!({ "least": e })) })
}

/// Who a circle in a block's audience means (C8): the owners of its parts by title in the circle fold of that block's causal past.
pub fn members_then(block: &Value, recipient: &str, blocks: &[Value]) -> Vec<String> {
    let index = crate::js::held_index(blocks);
    if !index.contains_key(recipient) {
        return vec![];
    }
    let read = read_all(index.values());
    if !read.contains_key(hash_of(block)) && !crate::valid::is_read(block, &read) {
        return vec![];
    }
    let b = read.get(hash_of(block)).unwrap_or(block);
    if !read.past_of(b).contains(recipient) {
        return vec![];
    }
    owners_then(recipient, Some(b), &read)
}

