//! Finality (blocks.md, Finality): whether a word stands, read with no clock and no arrival.
use crate::js::{hash_of, list, rf, rs, ss, st, type_of, Index};
use crate::line::{received_first, wait_run, Run};
use crate::prelude::*;
use crate::identity::*;

/// Whether a word stands among the blocks given (blocks.md, Finality), read with no clock and no arrival: `stands`, and while it does not,
/// what it waits on (`wait`, `reach`, `confirm`, `end`, `named`, `condition`), each once; empty when it can never stand.
#[derive(Clone, Debug, PartialEq)]
pub struct Stood {
    pub stands: bool,
    pub waiting: Vec<&'static str>,
}
impl Stood {
    pub fn to_json(&self, block: &str) -> Value {
        json!({ "stands": self.stands, "waiting": self.waiting.iter().map(|on| json!({ "block": block, "on": on })).collect::<Vec<_>>() })
    }
}

/// `stands(block, blocks)` (blocks.md, Finality): every block it names for its meaning stands; it has passed every end of its key (The cut);
/// a promise, transfer or grant of a key whose voice states a reach has been held by her clock that long, or a voice above confirmed it;
/// a word that lets another act or spend for her is signed twice; and a condition it carries has held.
pub fn stands(block: &Value, index: &Index) -> Stood {
    #[cfg(feature = "folds")]
    let mut s = stands_own(block, index);
    #[cfg(not(feature = "folds"))]
    let s = stands_own(block, index);
    // (blocks.md, Finality; circles.md) a block `as` a circle stands only where a row of it holds for it or every
    // owner signed it; until then it waits `on: hands`
    #[cfg(feature = "folds")]
    if let Some(circle) = rs(block, "as").filter(|c| !c.is_empty()) {
        if (s.stands || !s.waiting.is_empty()) && !crate::fold::circle::holds_in(block, circle, index) {
            s.stands = false;
            let at = s.waiting.iter().position(|w| *w == "condition").unwrap_or(s.waiting.len());
            s.waiting.insert(at, "hands");
        }
    }
    s
}

/// `stands` without the rows of the circle the block is `as` (the circle's own reading of a hand asks this).
pub(crate) fn stands_own(block: &Value, index: &Index) -> Stood {
    let key = format!("stands:{}", hash_of(block));
    let blocks = index.get(hash_of(block)).is_some_and(|b| b == block);
    let read = || {
        let s = stands_read(block, index);
        json!({ "stands": s.stands, "waiting": s.waiting })
    };
    let v = if blocks { guarded(index, &key, json!({ "stands": false, "waiting": ["end"] }), read) } else { read() };
    Stood {
        stands: v["stands"] == Value::Bool(true),
        waiting: v["waiting"].as_array().into_iter().flatten().filter_map(Value::as_str).map(|w| Standing::of(w).code()).collect(),
    }
}

pub(crate) fn stands_read(block: &Value, blocks: &Index) -> Stood {
    let never = Stood { stands: false, waiting: vec![] };
    if is_genesis(block) {
        return Stood { stands: genesis_opens(Some(block)), waiting: vec![] };
    }
    if !signed_by_author_in(block, blocks) {
        return never;
    }
    let (Some(id), Some(s)) = (rs(block, "author"), key_of(block, blocks)) else { return never };
    let Some(list) = standing_list(id, blocks, Some(block)) else { return never };
    let Some(place) = place_in(block, id, &list, blocks) else { return never };
    let mut on: Vec<&'static str> = Vec::new();
    let wait = |w: &'static str, on: &mut Vec<&'static str>| {
        if !on.contains(&w) {
            on.push(w);
        }
    };
    // every block it names for its meaning stands
    // no reading of a clock reaches outside the causal past of the block that relies on it: a key grant it names for its meaning
    // stands as read in that past (its reach and wait read only the clocks' blocks this block holds)
    let names = named_for_meaning(block);
    let past_only = names.iter().any(|n| blocks.get(n).is_some_and(|b| type_of(b) == "grant" && ss(b, "kind") == Some("key")));
    let sub = past_only.then(|| {
        let past = blocks.past_of(block);
        crate::js::index_of(blocks.values().filter(|x| past.contains(hash_of(x)) || hash_of(x) == hash_of(block)))
    });
    for n in names {
        let kg = blocks.get(&n).is_some_and(|b| type_of(b) == "grant" && ss(b, "kind") == Some("key"));
        let within = if kg { sub.as_ref().unwrap_or(blocks) } else { blocks };
        if !within.get(&n).is_some_and(|b| stands(b, within).stands) {
            wait("named", &mut on);
        }
    }
    // a rekey (profiles/rekeys.md, `epoch`) is her circle's encryption key, not a voice of any list: it stands as any word of its signer does
    let key_grant = type_of(block) == "grant" && ss(block, "kind") == Some("key") && st(block, "epoch").is_none();
    let mut free = false;
    if key_grant {
        let Some(subject) = rs(block, "subject") else { return never };
        match grant_standing(block, subject, blocks, None) {
            Standing::Stands => {}
            Standing::Waits(w) => wait(w, &mut on),
            Standing::Never => return never,
        }
        // an encryption key, or taking oneself out, waits on nothing (identity.md)
        free = standing_list(subject, blocks, Some(block)).is_some_and(|old| place_in(block, subject, &old, blocks).is_some_and(|p| free_key_grant(block, list_of(block).as_ref(), &old, p)));
    }
    if !free {
        // the cut: every end of its key it has not seen, it must pass
        let under = match place {
            Place::Under(_) => rs(block, "key").and_then(|u| blocks.get(u)),
            _ => None,
        };
        let clock = clock_of_key(&list, place);
        let ends = ends_of(id, &s.key, under, blocks);
        if ends.iter().any(|e| seen(block, e, clock.as_ref(), blocks)) {
            return never;
        }
        // passed: inside the end's cut; her own later counted block names it; where the key names a clock, `needed` lines received it before
        // any received the end; where it names none, another person's block joined to it that has not seen the end (a relier's
        // counted block uses it, or the block names another's block, her yes, that has not seen the end)
        // her own word stands alone: a block joined to no other person's block stands against her own voices' ends when signed;
        // only a key grant of a voice above with `counted_to` before it, or a pair at its place, puts it off her line (read elsewhere)
        // question 5's second exception: a key grant by her voice above this key that names in `counted_to` the last block of it that
        // counts puts every later block of that key off her line, toward every block that does not have it in its past; for one whose block
        // already built on it, it takes back nothing
        // (only a block joined to no other person's block; a joined block is read by the rest of The cut)
        let joiners = joiners_of(block, blocks);
        for e in &ends {
            let Some(ct) = ss(e, "counted_to") else { continue };
            let after_point = ct != hash_of(block) && blocks.get(ct).is_some_and(|c| !blocks.past_of(c).contains(hash_of(block)));
            if after_point && joiners.is_empty() {
                return never;
            }
        }
        // it passes an end where the end has it in its past; where it is joined to no other person's block (her own word
        // stands alone); or where another person's block is joined to it and has not seen the end (where the key names a clock: the clocks'
        // receipts of it, given in that block's past, state that no end is before it, `needed` of them)
        let passed = |e: Option<&Value>| -> bool {
            e.is_some_and(|e| hash_of(e) == hash_of(block) || blocks.past_of(e).contains(hash_of(block)))
                || joiners.is_empty()
                || joiners.iter().any(|o| {
                    let op = blocks.past_of(o);
                    match &clock {
                        Some(k) => received_first(hash_of(block), &e.map(hash_of).into_iter().collect::<Vec<_>>(), k, blocks, &|h| op.contains(h)),
                        None => e.is_none_or(|e| !op.contains(hash_of(e))),
                    }
                })
        };
        if ends.is_empty() && !passed(None) || ends.iter().any(|e| !passed(Some(e))) {
            wait("end", &mut on);
        }
        // reach: her promises, transfers and grants, her key grants of her own list among them (a key grant she signs in another's list
        // waits on nothing of hers)
        let reach = place.index().and_then(|i| list.voices.get(i)).and_then(|v| v.reach.clone());
        let reached = matches!(type_of(block), "promise" | "transfer" | "grant") && (!key_grant || rs(block, "subject") == Some(id));
        if let Some(reach) = reach.filter(|_| reached) {
            let vis = |_: &str| true;
            if !confirmed_above(block, id, &list, place, blocks, &vis) {
                // a key grant that leaves the key out sets the reach aside; a key grant is never its own end
                let leaves = |b: &Value| hash_of(b) != hash_of(block) && (key_grant_of(b, id) && ends.iter().any(|e| hash_of(e) == hash_of(b)) || leaves_out(b, id, &s.key, blocks));
                match list.clock().map(|k| wait_run(block, &reach, &k, blocks, &vis, &leaves)) {
                    Some(Run::Ran) => {}
                    Some(Run::Blocked) => return never,
                    _ => wait("reach", &mut on),
                }
            }
        }
        // a voice's bounds (identity.md, A voice's bounds): a word of a capped key that moves an amount of hers is counted on that key's
        // line; one that does not fit stands only when a voice above that key has said it
        if !bounds_fit(block, id, &s.key, &list, place, blocks, 0) {
            let vis = |_: &str| true;
            if !confirmed_above(block, id, &list, place, blocks, &vis) {
                wait("confirm", &mut on);
            }
        }
        // a word that lets another act or spend for her is signed twice
        if !key_grant && gives_power(block, blocks) {
            match power_standing(block, id, &list, place, blocks, None, false) {
                Standing::Stands => {}
                Standing::Waits(w) => wait(w, &mut on),
                Standing::Never => return never,
            }
        }
    }
    if st(block, "condition").is_some() {
        wait("condition", &mut on);
    }
    // in the order `stands` lists them (protocol.json door.ops.stands)
    const ORDER: [&str; 6] = ["wait", "reach", "confirm", "end", "named", "condition"];
    on.sort_by_key(|w| ORDER.iter().position(|o| o == w));
    Stood { stands: on.is_empty(), waiting: on }
}

/// the blocks of another person a block is joined to by naming them (any ref but its line's own links): her yes it is made on.
/// Naming a person by her id (her genesis) is no join: a genesis is no word; a block of another signer the block names
/// in any ref but `author`, `prev`, `key`, `after` and `confirms` is.
pub(crate) fn joins_out<'a>(block: &Value, blocks: &'a Index) -> Vec<&'a Value> {
    let me = rs(block, "author").unwrap_or("");
    let Some(refs) = block.get("refs").and_then(Value::as_object) else { return Vec::new() };
    refs.iter()
        .filter(|(k, _)| !matches!(k.as_str(), "author" | "prev" | "key" | "after" | "confirms"))
        .flat_map(|(_, v)| list(Some(v)))
        .filter_map(|h| blocks.get(h))
        .filter(|o| o.get("type").is_some() && !is_genesis(o) && rs(o, "author").is_some_and(|a| a != me))
        .collect()
}

/// the blocks of other persons joined to a block: those it names (her yes it is made on) and those that name it, by any ref but
/// `author`, `prev`, `key` and `after`; a clock's receipt or cutoff is the clock's reading, no block joined to the word.
pub(crate) fn joiners_of<'a>(block: &Value, blocks: &'a Index) -> Vec<&'a Value> {
    let me = rs(block, "author").unwrap_or("");
    let h = hash_of(block);
    let mut out = joins_out(block, blocks);
    let names = blocks.names_memo();
    for o in names.by_use.get(h).into_iter().flatten().filter_map(|n| blocks.get(n)) {
        let names_it = o.get("refs").and_then(Value::as_object).is_some_and(|r| r.iter().any(|(k, v)| !matches!(k.as_str(), "author" | "prev" | "key" | "after") && list(Some(v)).contains(&h)));
        let clock_word = type_of(o) == "observe" && matches!(ss(o, "kind"), Some("receipt" | "cutoff"));
        if names_it && !clock_word && hash_of(o) != h && rs(o, "author").is_some_and(|a| a != me) && signed_by_author_in(o, blocks) && !out.iter().any(|x| hash_of(x) == hash_of(o)) {
            out.push(o);
        }
    }
    out.retain(|o| !(type_of(o) == "observe" && matches!(ss(o, "kind"), Some("receipt" | "cutoff"))));
    // for a gathered move (a block `as` a circle), no signer of one of its hands, no tool of hers and no one under
    // a grant she gave is another person joined to it
    #[cfg(feature = "folds")]
    if rs(block, "as").is_some_and(|c| !c.is_empty()) {
        let ours = crate::fold::circle::gathered(block, blocks);
        out.retain(|o| rs(o, "author").is_none_or(|a| !ours.iter().any(|x| x == a)));
    }
    out
}

// Whether a key grant leaves a key of hers out of the list it replaces (the receipt of which, before the cutoffs, sets a reach aside).
pub(crate) fn leaves_out(g: &Value, id: &str, key: &str, blocks: &Index) -> bool {
    let (Some(new), Some(old)) = (list_of(g), rs(g, "updates").and_then(|u| blocks.get(u)).and_then(list_of)) else { return false };
    key_grant_of(g, id) && place_of_key(key, &old).is_some() && place_of_key(key, &new).is_none()
}

// The blocks a block names for its meaning (blocks.md, Read in the past of the block that relies on it): `refs.under`, `answers`, `updates`, `for`, `parent` and
// `schema` on every type, `state.counted_to`, and a grant's `scope.on`. (protocol.json `needs` is this list.)
pub(crate) fn named_for_meaning(block: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for k in ["under", "answers", "updates", "for", "parent", "schema"] {
        out.extend(list(rf(block, k)).into_iter().map(String::from));
    }
    out.extend(ss(block, "counted_to").map(String::from));
    if type_of(block) == "grant" {
        out.extend(list(crate::js::get(block, "state.scope.on")).into_iter().map(String::from));
    }
    out.sort();
    out.dedup();
    out
}

/// What a word of a key moves of hers, for a voice's line (identity.md, A voice's bounds): a transfer, its `state.amount`; a key grant that
/// adds a key under a voice and passes it a part, that part (`state.limit`). None for any other word.
pub(crate) fn bound_amount(block: &Value, id: &str) -> Option<crate::decimal::Amount> {
    match type_of(block) {
        "transfer" if st(block, "status").is_none() => crate::decimal::Amount::of(st(block, "amount")),
        "grant" if ss(block, "kind") == Some("key") && st(block, "voices").is_none() && rs(block, "subject") == Some(id) => crate::decimal::Amount::of(st(block, "limit")),
        _ => None,
    }
}

/// Whether a word fits on its key's line (identity.md, A voice's bounds): its place's `each` and `limit` (a voice's own, or the part the
/// key grant of a key under a voice passed it), with `every` the line's period turning at the cutoffs of her list's clocks whose
/// `refs.subject` is the block that brought the key in and whose span is no shorter than `every`. The words before it on that line that
/// fit are counted; a word a voice above said instead holds nothing on it.
pub(crate) fn bounds_fit(block: &Value, id: &str, key: &str, list: &List, place: Place, blocks: &Index, depth: usize) -> bool {
    let Some(a) = bound_amount(block, id) else { return true };
    let bounds: Option<&Value> = match place {
        Place::At(i) => list.voices.get(i).map(|v| &v.raw),
        Place::Under(_) => rs(block, "key").and_then(|u| blocks.get(u)).and_then(|u| u.get("state")),
    };
    let Some(bounds) = bounds else { return true };
    let amount = |k: &str| crate::decimal::Amount::of(bounds.get(k));
    let (each, limit) = (amount("each"), amount("limit"));
    if each.is_none() && limit.is_none() {
        return true;
    }
    if each.as_ref().is_some_and(|e| e.kind != a.kind || a.value.cmp(&e.value) == core::cmp::Ordering::Greater) {
        return false;
    }
    let Some(limit) = limit else { return true };
    if limit.kind != a.kind || depth > 64 {
        return false;
    }
    let brought = rs(block, "key").unwrap_or(id);
    let every = bounds.get("every").and_then(Value::as_str);
    let period = |b: &Value| -> usize {
        let (Some(every), Some(clocks)) = (every, list.clock()) else { return 0 };
        let past = blocks.past_of(b);
        let lines: Vec<crate::line::Line> = clocks.names.iter().filter_map(|n| crate::line::line_named(n, blocks)).collect();
        blocks.values()
            .filter(|c| {
                type_of(c) == "observe"
                    && ss(c, "kind") == Some("cutoff")
                    && rs(c, "subject") == Some(brought)
                    && ss(c, "when").is_some_and(|w| crate::time::parse_duration(w).is_some() && crate::grant::cmp_value(&json!(w), &json!(every)).is_some_and(|o| o != core::cmp::Ordering::Less))
                    && past.contains(hash_of(c))
                    && lines.iter().any(|l| crate::line::on_line(c, l, blocks))
            })
            .count()
    };
    let mine = period(block);
    let past = blocks.past_of(block);
    let used = blocks
        .values()
        .filter(|x| hash_of(x) != hash_of(block) && past.contains(hash_of(x)) && rs(x, "author") == Some(id) && rs(x, "key") == rs(block, "key"))
        .filter(|x| key_of(x, blocks).is_some_and(|k| k.key == key))
        .filter(|x| bound_amount(x, id).is_some_and(|b| b.kind == limit.kind) && period(x) == mine && bounds_fit(x, id, key, list, place, blocks, depth + 1))
        .filter_map(|x| bound_amount(x, id))
        .fold(crate::decimal::Dec::zero(), |t, b| t.add(&b.value));
    used.add(&a.value).cmp(&limit.value) != core::cmp::Ordering::Greater
}

// A word that lets another act or spend for her (blocks.md, Finality, Signed twice): a grant (not an answer; a kind protocol.json does not
// declare is a label and changes nothing), an
// account word, a hand-over of a claim (a transfer that names in `refs.what` any block that is not a thing).
pub(crate) fn gives_power(block: &Value, blocks: &Index) -> bool {
    match type_of(block) {
        "grant" => st(block, "status").is_none() && rf(block, "answers").is_none(),
        // an account word; and her lift of a stop of one thing (`resumed`), which gives her tools their power back
        "observe" => (ss(block, "kind") == Some("account") && st(block, "status").is_none()) || (ss(block, "status") == Some("resumed") && rf(block, "updates").is_some()),
        // a hand-over of a claim (a receiving place, a claim) is a transfer that names in `refs.what` any block that is not a `thing`
        "transfer" => st(block, "status").is_none() && list(rf(block, "what")).iter().any(|w| blocks.get(*w).is_some_and(|d| type_of(d) != "thing")),
        _ => false,
    }
}

