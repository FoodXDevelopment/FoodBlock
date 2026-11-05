//! `act_check`: a deal against the template it names (promises.md, An act is a template of the one shape). Are the sides and terms the
//! template declares the ones the deal has? `{ ok, why }`: `why` is one plain sentence when not (null when it is).
//! A template is a thing of kind `act` whose fields are the protocol's own (`act.fields`); its name and words are pencil and nothing reads them.
use crate::js::{get, hash_of, is_obj, rf, rs, st, type_of};
use crate::prelude::*;

pub fn act_check(deal: &Value, template: &Value) -> Value {
    match reading(deal, template) {
        Ok(()) => json!({ "ok": true, "why": null }),
        Err(why) => json!({ "ok": false, "why": why }),
    }
}

fn keys(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_object)
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}
fn names(items: &[String]) -> String {
    if items.is_empty() {
        "none".into()
    } else {
        items
            .iter()
            .map(|k| format!("`{k}`"))
            .collect::<Vec<_>>()
            .join(", ")
    }
}
fn text(v: Option<&Value>) -> bool {
    v.and_then(Value::as_str).is_some_and(|s| !s.is_empty())
}

/// Whether a value is of a term type: a scalar the protocol grammar names, or exactly one keyed shape (protocol.json `shapes`).
fn fits(ty: &str, v: &Value) -> bool {
    let spec = crate::spec();
    match ty {
        "text" => v.as_str().is_some_and(|s| !s.is_empty()),
        "integer" => crate::js::int(Some(v)).is_some(),
        "bool" => v.is_boolean(),
        "time" => crate::time::is_time(Some(v)),
        "date" => crate::time::is_date(Some(v)),
        "duration" => v
            .as_str()
            .is_some_and(|s| crate::time::parse_duration(s).is_some()),
        "id" => v.as_str().is_some_and(|s| spec.is("id", s)),
        // a priced list: `[{ id, what, quantity, price }]`, each item with only the keys of protocol.json `line`, `id` named
        "lines" => v.as_array().is_some_and(|a| {
            let line = spec.list("line");
            !a.is_empty() && a.iter().all(|l| l.as_object().is_some_and(|m| text(m.get("id")) && m.keys().all(|k| line.contains(k))))
        }),
        // a condition the protocol reads: an object with a key of `condition_shapes`
        "condition" => v.as_object().is_some_and(|m| spec.list("condition_shapes").iter().any(|k| m.contains_key(k))),
        // a named clock: `{ names, needed? }`, names a non-empty list of text
        "keepers" => v.as_object().is_some_and(|m| {
            let keys = spec.list("shapes.keepers");
            m.keys().all(|k| keys.contains(k)) && m.get("names").and_then(Value::as_array).is_some_and(|n| !n.is_empty() && n.iter().all(|x| text(Some(x))))
        }),
        shape => {
            let want = spec.list(&format!("shapes.{shape}"));
            v.as_object()
                .is_some_and(|m| m.len() == want.len() && want.iter().all(|k| m.contains_key(k)))
        }
    }
}

/// The template is whole: a thing of kind `act` that carries only fields the protocol names, each of its declared shape.
fn whole(t: &Value) -> Result<(), String> {
    let spec = crate::spec();
    let bad = |why: &str| Err(format!("the template is not whole: {why}"));
    if type_of(t) != "thing" || st(t, "kind").and_then(Value::as_str) != Some("act") {
        return bad("an act template is a thing of kind `act`");
    }
    let (fields, every) = (spec.list("act.fields"), spec.list("fields.every"));
    let extra: Vec<String> = keys(t.get("state"))
        .into_iter()
        .filter(|k| k != "kind" && !fields.contains(k) && !every.contains(k))
        .collect();
    if let Some(k) = extra.first() {
        return bad(&format!("`{k}` is no field of an act: a template's words claim nothing, so it cannot carry money, an effect or an authority"));
    }
    if !text(st(t, "name")) {
        return bad("`name` is a non-empty text");
    }
    if st(t, "words").is_some_and(|w| !w.is_string()) {
        return bad("`words` is text");
    }
    if st(t, "labels").is_some_and(|l| !is_obj(Some(l))) {
        return bad("`labels` is { language: { name, words } }");
    }
    let sides = st(t, "sides");
    if !is_obj(sides)
        || keys(sides)
            .iter()
            .any(|k| !spec.list("act.sides").contains(k))
        || sides
            .and_then(Value::as_object)
            .is_some_and(|m| m.values().any(|v| !text(Some(v))))
    {
        return bad(&format!(
            "`sides` names each side the deal has ({}), each with its words",
            names(&spec.list("act.sides"))
        ));
    }
    let terms = st(t, "takes");
    let types = spec.list("act.types");
    if !is_obj(terms)
        || terms.and_then(Value::as_object).is_some_and(|m| {
            m.iter().any(|(k, v)| {
                !spec.is("type_name", k)
                    || !v.as_str().is_some_and(|ty| types.iter().any(|x| x == ty))
            })
        })
    {
        return bad(&format!(
            "`takes` names each term with its type, one of {}",
            names(&types)
        ));
    }
    if let Some(needs) = st(t, "needs") {
        let ok = needs.as_array().is_some_and(|a| {
            a.iter().all(|n| {
                n.as_str()
                    .is_some_and(|n| terms.is_some_and(|t| t.get(n).is_some()))
            })
        });
        if !ok {
            return bad("`needs` lists terms the template takes");
        }
    }
    let record = st(t, "record");
    let moves = get(&spec.protocol, "act.moves");
    let move_names: Vec<String> = keys(moves);
    if !is_obj(record)
        || keys(record).is_empty()
        || keys(record).iter().any(|k| !move_names.contains(k))
    {
        return bad(&format!(
            "`record` is how each move the act takes is written down; the moves are {}",
            names(&move_names)
        ));
    }
    let form = spec.list("act.record.keys");
    for (mv, f) in record.and_then(Value::as_object).into_iter().flatten() {
        let ok = is_obj(Some(f))
            && keys(Some(f)).iter().all(|k| form.contains(k))
            && ["type", "tie", "sides"].iter().all(|k| {
                f.get(*k)
                    .and_then(Value::as_str)
                    .is_some_and(|v| spec.list(&format!("act.record.{k}")).iter().any(|x| x == v))
            })
            && ["needs", "words"].iter().all(|k| {
                f.get(*k).is_none_or(|l| {
                    l.as_array()
                        .is_some_and(|a| a.iter().all(|s| text(Some(s))))
                })
            });
        if !ok {
            return bad(&format!(
                "the record for `{mv}` is not a form of the protocol"
            ));
        }
    }
    Ok(())
}

fn reading(deal: &Value, template: &Value) -> Result<(), String> {
    whole(template)?;
    match rs(deal, "act") {
        None => return Err("the deal names no act (`refs.act`)".into()),
        Some(h) if h != hash_of(template) => {
            return Err(format!("the deal names the act {h}, not this template"))
        }
        _ => {}
    }
    let written: Vec<&str> = get(template, "state.record")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|m| m.values())
        .filter_map(|f| f.get("type").and_then(Value::as_str))
        .collect();
    if !written
        .iter()
        .any(|t| *t == type_of(deal) || *t == "as the anchor")
    {
        return Err(format!(
            "no move of the template is written as a `{}`",
            type_of(deal)
        ));
    }
    // a promise that says something new (not a bare answer) has the template's sides and terms
    if type_of(deal) != "promise" || st(deal, "status").is_some() {
        return Ok(());
    }
    let declared = keys(st(template, "sides"));
    let named: Vec<String> = crate::spec()
        .list("act.sides")
        .into_iter()
        .filter(|s| rf(deal, s).is_some())
        .collect();
    if declared.iter().any(|s| !named.contains(s)) || named.iter().any(|s| !declared.contains(s)) {
        let mut declared = declared;
        declared.sort();
        return Err(format!(
            "the template has the sides {}; the deal names {}",
            names(&declared),
            names(&named)
        ));
    }
    let terms = st(template, "takes");
    let had = deal
        .get("state")
        .and_then(|s| s.get("terms"))
        .and_then(Value::as_object);
    for (k, v) in had.into_iter().flatten() {
        let Some(ty) = terms.and_then(|t| t.get(k)).and_then(Value::as_str) else {
            return Err(format!(
                "the deal has the term `{k}`, which the template does not take"
            ));
        };
        if !fits(ty, v) {
            return Err(format!(
                "the term `{k}` is not a {ty}, as the template says"
            ));
        }
    }
    for need in st(template, "needs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
    {
        if !had.is_some_and(|m| m.contains_key(need)) {
            return Err(format!(
                "the template needs the term `{need}`; the deal has none"
            ));
        }
    }
    Ok(())
}
