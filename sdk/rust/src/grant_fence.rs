//! A machine's fence (patterns/machines.md, A machine's fence): the typed fence in a grant's `state.fence` that its signer set
//! round the machine, `{ ranges, hours, safe_state, work_alone }`. The shape is checked in `check/grant.rs`; here are its three
//! readings: the hours as minutes of the UTC day, whether a child's fence is no wider than its parent's, and whether a
//! machine is inside its fence at a time the caller names. The protocol reads no clock and no time zone database.
use crate::decimal::compare;
use crate::prelude::*;
use crate::time::{add_duration, compare_durations, parse};
use core::cmp::Ordering;

const DAY: i64 = 1440;

/// One end of an hours entry as a minute of the UTC day (0 to 1439): `HH:MM` and its offset (`Z` or `+HH:MM` / `-HH:MM`, grammar.hour);
/// the offset is taken off so entries written in different offsets compare. None when the text is outside the grammar.
fn minute_of(text: &str) -> Option<i64> {
    if !crate::spec().is("hour", text) {
        return None;
    }
    let n = |a: usize| text[a..a + 2].parse::<i64>().ok();
    let local = n(0)? * 60 + n(3)?;
    let off = match text.as_bytes().get(5) {
        Some(b'Z') => 0,
        Some(b'+') => n(6)? * 60 + n(9)?,
        Some(b'-') => -(n(6)? * 60 + n(9)?),
        _ => return None,
    };
    Some((local - off).rem_euclid(DAY))
}

/// The minutes of the UTC day one hours entry covers: from its `from` up to, not including, its `to`, round midnight when `to` is
/// earlier. None when it is not `{ from, to }` of two hours, or both ends are the same minute (a whole day is no entry: leave `hours` out).
fn entry_minutes(entry: &Value) -> Option<Vec<bool>> {
    let o = entry.as_object().filter(|o| o.len() == 2)?;
    let (s, e) = (minute_of(o.get("from")?.as_str()?)?, minute_of(o.get("to")?.as_str()?)?);
    if s == e {
        return None;
    }
    Some((0..DAY).map(|m| if s < e { s <= m && m < e } else { m >= s || m < e }).collect())
}

/// The minutes of the UTC day a non-empty `hours` list covers, or None when the list or an entry is not readable.
pub(crate) fn hours_minutes(hours: &Value) -> Option<Vec<bool>> {
    let list = hours.as_array().filter(|a| !a.is_empty())?;
    let mut all = vec![false; DAY as usize];
    for entry in list {
        for (i, on) in entry_minutes(entry)?.into_iter().enumerate() {
            all[i] |= on;
        }
    }
    Some(all)
}

fn ord(a: Option<&Value>, b: Option<&Value>) -> Option<Ordering> {
    compare(a, b)
}

/// What makes a child's fence wider than its parent's, in plain words (empty when it is no wider). `child` and `parent` are the
/// grants' `state` objects; `from` is the parent's `at`, from which durations are compared (authority.md, Scope subset).
pub(crate) fn fence_wider(child: &Value, parent: &Value, from: Option<&str>) -> Vec<String> {
    let none = Value::Null;
    let c = child.get("fence").unwrap_or(&none);
    let p = parent.get("fence").unwrap_or(&none);
    let mut wrong: Vec<String> = Vec::new();
    // ranges: every range the parent states is stated by the child, in the same unit, no wider at either end
    if let Some(prs) = p.get("ranges").and_then(Value::as_array) {
        let crs = c.get("ranges").and_then(Value::as_array);
        for pr in prs {
            let name = pr.get("of");
            let cr = crs.and_then(|l| l.iter().find(|x| x.get("of") == name));
            let unit_of = |r: &Value, end: &str| r.get(end).and_then(|a| a.get("unit")).cloned();
            let ok = cr.is_some_and(|cr| {
                ["min", "max"].iter().all(|end| match pr.get(end) {
                    None => true,
                    Some(pv) => cr.get(end).is_some_and(|cv| {
                        unit_of(cr, end) == unit_of(pr, end)
                            && ord(cv.get("value"), pv.get("value")).is_some_and(|o| if *end == "min" { o.is_ge() } else { o.is_le() })
                    }),
                })
            });
            if !ok {
                wrong.push(format!("fence.ranges keeps inside the parent's range for {}", name.and_then(Value::as_str).unwrap_or("")));
            }
        }
    }
    // hours: every minute the child covers the parent covers
    if let Some(ph) = p.get("hours") {
        let inside = match (c.get("hours").and_then(hours_minutes), hours_minutes(ph)) {
            (Some(cm), Some(pm)) => cm.iter().zip(pm.iter()).all(|(a, b)| !*a || *b),
            _ => false,
        };
        if !inside {
            wrong.push("fence.hours is inside the parent's hours".into());
        }
    }
    // safe state: kept as the parent's
    if let Some(ps) = p.get("safe_state") {
        if c.get("safe_state") != Some(ps) {
            wrong.push("fence.safe_state is the parent's".into());
        }
    }
    // work alone: no longer than the parent's; a parent that states none lets none (zero). 1.9: two spans are compared by what each adds
    // to one fixed instant, never added to a date (authority.md, A range and a list; blocks.md, Time)
    let _ = from;
    if let Some(cw) = c.get("work_alone").and_then(Value::as_str) {
        const FIXED: &str = "2000-01-01T00:00:00.000Z";
        let pw = p.get("work_alone").and_then(Value::as_str).unwrap_or("PT0S");
        let longer = compare_durations(cw, pw, FIXED).is_none_or(|s| s > 0);
        if longer {
            wrong.push("fence.work_alone is no longer than the parent's".into());
        }
    }
    wrong
}

/// patterns/machines.md, A machine's fence: is the machine inside its fence at `at`, and may it still work alone? `fence` is a grant's
/// `state.fence` (null: it fences nothing and lets no time alone), `at` the time the caller names (the protocol reads no clock),
/// `readings` null or `{ name: amount }` (what the machine's sensors last signed), `heard` the time of the newest block the machine has
/// heard from its node, or null. `{ within, why: [{ code, of }], alone, alone_until }`.
pub fn fence_reading(fence: &Value, at: &str, readings: &Value, heard: Option<&str>) -> Value {
    let mut why: Vec<Value> = Vec::new();
    let junk = !fence.is_null() && !crate::check::fence_ok(fence);
    let at_ms = parse(at);
    if junk || at_ms.is_none() {
        return json!({ "within": false, "why": [{ "code": "junk", "of": Value::Null }], "alone": false, "alone_until": Value::Null });
    }
    let at_ms = at_ms.unwrap();
    let none = Value::Null;
    let env = if fence.is_null() { &none } else { fence };
    if let Some(minutes) = env.get("hours").and_then(hours_minutes) {
        if !minutes[at_ms.div_euclid(60_000).rem_euclid(DAY) as usize] {
            why.push(json!({ "code": "outside_hours", "of": Value::Null }));
        }
    }
    for r in env.get("ranges").and_then(Value::as_array).into_iter().flatten() {
        let name = r.get("of").and_then(Value::as_str).unwrap_or("");
        let said = readings.get(name);
        // a reading that is no amount, or is in another unit, cannot be shown inside: silence only narrows
        let amount = said.filter(|a| crate::check::amount_ok(a));
        let unit = |v: Option<&Value>| v.and_then(|a| a.get("unit")).cloned();
        let want = r.get("min").or(r.get("max"));
        match amount.filter(|a| unit(Some(a)) == unit(want)) {
            None => why.push(json!({ "code": "unread", "of": name })),
            Some(a) => {
                let below = r.get("min").is_some_and(|m| ord(a.get("value"), m.get("value")).is_some_and(|o| o.is_lt()));
                let above = r.get("max").is_some_and(|m| ord(a.get("value"), m.get("value")).is_some_and(|o| o.is_gt()));
                if below || above {
                    why.push(json!({ "code": "out_of_range", "of": name }));
                }
            }
        }
    }
    let until = heard.and_then(|h| add_duration(h, env.get("work_alone").and_then(Value::as_str).unwrap_or("PT0S"), 1));
    let alone = until.as_deref().and_then(parse).is_some_and(|u| at_ms <= u);
    json!({ "within": why.is_empty(), "why": why, "alone": alone, "alone_until": until })
}
