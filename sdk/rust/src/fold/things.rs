//! Things (folds.md, Ownership, Where a thing is now): who owns an instance, read by What is left; what was made from it; where it is now.
use super::draws::{answers, draws_on, Draw, In, Start, To};
use super::{read_all, speaker_of};
use crate::decimal::{Amount, Dec, Kind};
use crate::grant::{ending, End};
use crate::js::{hash_of, index_of, list, rf, rs, sorted_set, ss, st, type_of, unique, Index};
use crate::order::{earliest, sees_in};
use crate::prelude::*;
use alloc::collections::BTreeMap;

/// The ownership fold of an instance (folds.md, What each fold returns): `{ kind, stated, owners, owner, held, ended, let_go, draws,
/// waiting }`, or `{ not_shown: true, lacks }` when a line it reads is not read whole. Its measure is the thing's `pack`, or one whole; who
/// owns it first is said where the measure is stated; every draw on it is read by What is left.
pub fn ownership(instance: &Value, blocks: &[Value]) -> Value {
    ownership_at(instance, blocks, "")
}

/// The ownership fold at the reader's clock `now` (folds.md, Views): a transfer that carries a condition lands only where its condition has
/// given, so a condition that reads the clock makes this a view. No clock (the empty text) reads every condition that needs none, and none
/// that does.
pub fn ownership_at(instance: &Value, blocks: &[Value], now: &str) -> Value {
    let index = read_all(core::iter::once(instance).chain(index_of(blocks).values().collect::<Vec<_>>()));
    // a fold asked about a block that is not read gives no answer
    if index.get(hash_of(instance)).is_none_or(|b| b.get("type").is_none()) {
        return Value::Null;
    }
    let mut v = own(hash_of(instance), &index, None, now);
    if let Value::Object(m) = &mut v {
        m.remove("_took");
        m.remove("_landed");
    }
    v
}

/// Whether a thing is an instance by its own block (things.md, Things): it names its kind (`refs.of`), what it is part of or where it is
/// (`refs.subject`, `refs.place`), or a make it came from (`refs.derives_from`). Otherwise it is a kind. No other block changes which.
pub(super) fn is_instance(thing: &Value) -> bool {
    ["of", "derives_from", "subject", "place"].iter().any(|k| !list(rf(thing, k)).is_empty())
}

/// Whether a block landed as a draw on a thing (folds.md, What is left: a transfer that names a measure counts toward a line only when it
/// lands as a draw): Some(what landed, None for all of a whole or of a part not said), else None.
/// Read whole (folds.md): the `lacks` of a thing whose ownership is not shown to this reader, else None (a fold whose answer turns on who owns
/// it is not shown either).
/// The ownership fold of a given thing (or a circle's parts) among every block given, as `ownership` answers it. Read on an index of its own
/// (a block's causal past): the reading stack of the index that asks is set aside meanwhile, since a smaller past is never the
/// same question.
pub(super) fn own_value(thing: &str, index: &Index) -> Value {
    own_value_vis(thing, index, None)
}
/// The same, among the causal past of a given block `vis` (each block read as it is among all given): a circle's parts at a hand.
pub(super) fn own_value_vis(thing: &str, index: &Index, vis: Option<&str>) -> Value {
    let outer = reading_stack(core::mem::take);
    let mut v = own(thing, index, vis, "");
    reading_stack(|r| *r = outer);
    if let Value::Object(m) = &mut v {
        m.remove("_took");
        m.remove("_landed");
    }
    v
}

pub(super) fn lacks_of(thing: &str, index: &Index) -> Option<Value> {
    let read = own(thing, index, None, "");
    (read.get("not_shown") == Some(&Value::Bool(true))).then(|| read["lacks"].clone())
}

pub(super) fn landed_draw(thing: &str, block: &str, index: &Index) -> Option<Option<Dec>> {
    let read = own(thing, index, None, "");
    read.get("_landed")?.get(block).map(|v| v.as_str().and_then(Dec::parse))
}

/// Whether a receiver's `accepted` answer to a transfer still counts (things.md, Transfers): a transfer to a named receiver is read like an
/// offer, so it is no free option. The giver's withdrawal (their own `updates` of it, `stopped` with `before`) voids an accept that has the
/// withdrawal in its causal past; on a transfer that carried `expires`, the giver's `declined` answer to the accept voids it.
pub(super) fn answer_stands(transfer: &Value, answer: &Value, index: &Index) -> bool {
    let giver = speaker_of(transfer, index, None);
    let expires = st(transfer, "expires").is_some();
    // only a block that names the transfer (its withdrawal) or the answer (a decline of it) can void the accept: found by name, not by a pass over every block
    let names = index.names_memo();
    let named = |h: &str| names.by_answer.get(h).into_iter().flatten().filter_map(|n| index.get(n));
    !named(hash_of(transfer)).chain(named(hash_of(answer))).any(|w| {
        (type_of(w) == "transfer" || crate::grant::is_decline_reading(w))
            && crate::forks::counts_in(w, index)
            && giver.is_some()
            && speaker_of(w, index, None) == giver
            && ((type_of(w) == "transfer" && ending(w, hash_of(transfer)) == Some(End::Stop) && ss(w, "stop") == Some("before") && sees_in(answer, hash_of(w), index))
                || (expires && ss(w, "status") == Some("declined") && ending(w, hash_of(answer)) == Some(End::Decline)))
    })
}

// The transfers whose conditions are being read, so a condition that leads back to the transfer carrying it (a deal whose goods count only if
// its giver owned them) holds for nothing instead of looping. One rule in every build: a transfer already on the stack is a real repeat and
// holds for nothing; any other is read, however long the chain of honest conditional transfers. Only where the stack is kept differs: a thread
// on `std`; the one thread of a micro without it.
#[cfg(feature = "std")]
std::thread_local! { static READING: core::cell::RefCell<Vec<String>> = const { core::cell::RefCell::new(Vec::new()) }; }
#[cfg(not(feature = "std"))]
struct Reading(core::cell::UnsafeCell<Vec<String>>);
// SAFETY: the no-std build is the micro profile, which runs on one thread; nothing reads the stack from two at once.
#[cfg(not(feature = "std"))]
unsafe impl Sync for Reading {}
#[cfg(not(feature = "std"))]
static READING: Reading = Reading(core::cell::UnsafeCell::new(Vec::new()));

fn reading_stack<R>(f: impl FnOnce(&mut Vec<String>) -> R) -> R {
    #[cfg(feature = "std")]
    {
        READING.with(|r| f(&mut r.borrow_mut()))
    }
    #[cfg(not(feature = "std"))]
    {
        // SAFETY: see `Reading`; the borrow ends with `f`, and `f` never reads the stack.
        f(unsafe { &mut *READING.0.get() })
    }
}

fn while_reading<R>(transfer: &str, f: impl FnOnce() -> R) -> Option<R> {
    if reading_stack(|r| r.iter().any(|h| h == transfer)) {
        return None;
    }
    reading_stack(|r| r.push(transfer.to_string()));
    let out = f();
    reading_stack(|r| r.pop());
    Some(out)
}

/// Whether a transfer's condition holds on the blocks `keep` lets in, at `now`. A condition the protocol does not read holds for nothing.
pub(super) fn condition_holds_in(transfer: &Value, cond: &Value, index: &Index, keep: &dyn Fn(&Value) -> bool, _now: &str) -> bool {
    while_reading(hash_of(transfer), || {
        let blocks: Vec<Value> = index.values().filter(|b| keep(b)).cloned().collect();
        crate::tasks::condition_holds(cond, &blocks, None) == Some(true)
    })
    .unwrap_or(false)
}

/// Whether a transfer's condition can no longer hold, on the blocks `keep` lets in: the blocks that show it (empty: from its
/// signing), or None while it may yet hold.
pub(super) fn condition_dead_in(transfer: &Value, cond: &Value, index: &Index, keep: &dyn Fn(&Value) -> bool) -> Option<Vec<String>> {
    while_reading(&format!("dead:{}", hash_of(transfer)), || {
        let blocks: Vec<Value> = index.values().filter(|b| keep(b)).cloned().collect();
        crate::tasks::condition_dead(cond, &blocks)
    })
    .flatten()
}

/// Whether a transfer's own condition holds with no clock, on everything given (the stage reads no clock): a goods transfer that carries
/// a condition counts toward a deal's delivery only once it does.
pub(super) fn condition_stands(transfer: &Value, index: &Index) -> bool {
    st(transfer, "condition").is_none_or(|c| condition_holds_in(transfer, c, index, &|_| true, "") && !let_go(transfer, c, index, &|_| true))
}

/// A conditioned transfer its receiver let go: her own counted `stopped` or `declined` answer to it (authority.md, Ending), signed before
/// the condition held (read on what that answer saw, at its own date: it binds only her). After the condition held, the title is hers
/// and she hands it on by a transfer of her own.
pub(super) fn let_go(transfer: &Value, cond: &Value, index: &Index, visible: &dyn Fn(&str) -> bool) -> bool {
    let names = index.names_memo();
    names.by_answer.get(hash_of(transfer)).into_iter().flatten().filter_map(|n| index.get(n)).any(|a| {
        ((type_of(a) == "transfer" && matches!(ss(a, "status"), Some("stopped" | "declined"))) || crate::grant::is_decline_reading(a))
            && visible(hash_of(a))
            && list(rf(a, "answers")).contains(&hash_of(transfer))
            && crate::forks::counts_in(a, index)
            && speaker_of(a, index, None).is_some_and(|who| list(rf(transfer, "to_owner")).contains(&who.as_str()))
            && {
                let past = index.past_of(a);
                !condition_holds_in(transfer, cond, index, &|b| past.contains(hash_of(b)) && visible(hash_of(b)), ss(a, "at").unwrap_or(""))
            }
    })
}

/// Whether a transfer to a named receiver was accepted by the receiver, in an answer `visible` lets in.
pub(super) fn accepted_by_receiver(transfer: &Value, index: &Index, visible: &dyn Fn(&str) -> bool) -> bool {
    let names = index.names_memo();
    names.by_answer.get(hash_of(transfer)).into_iter().flatten().filter_map(|n| index.get(n)).any(|b| {
        type_of(b) == "transfer"
            && ss(b, "status") == Some("accepted")
            && visible(hash_of(b))
            // Her accept of money binds her as her word, a block of a fork of her line too (a pair binds its signer)
            && (crate::forks::counts_in(b, index) || crate::forks::fork_burden(b, index))
            && list(rf(b, "answers")).contains(&hash_of(transfer))
            && speaker_of(b, index, None).is_some_and(|a| list(rf(transfer, "to_owner")).contains(&a.as_str()))
            && answer_stands(transfer, b, index)
    })
}

// The ownership fold of a thing among the blocks `vis` lets in (None: every block given; Some(b): the causal past of `b`, as `b` saw it),
// with the internal `_took` beside the answer: what each draw took, by block (null for all of a whole or of a part not said). Read once
// for each view (the index's memo).
fn own(thing_hash: &str, index: &Index, vis: Option<&str>, now: &str) -> Value {
    let key = format!("own:{thing_hash}:{}:{now}", vis.unwrap_or(""));
    if let Some(v) = index.stage_peek(&key) {
        return v;
    }
    // what it was made from is read first, deepest first, with no call stack: every fold below is then remembered
    warm(thing_hash, index, vis, now);
    // a make chain that leads back to the thing it starts from reads as no owner, never as a loop
    let t0 = index.taint();
    let v = while_reading(&format!("own:{thing_hash}"), || own_read(thing_hash, index, vis, now)).unwrap_or_else(|| nobody(None, None, Vec::new()));
    if index.taint() == t0 {
        index.stage_put(&key, v.clone());
    }
    v
}

// The folds a thing's first owners read (first_owners): each input of its makes in the same view, or the thing one keep keeps, in the
// view of that keep. The same guards as own_read and first_owners, so exactly the folds they would ask for, in the order they ask.
fn reads_first(thing_hash: &str, index: &Index, vis: Option<&str>) -> Vec<(String, Option<String>)> {
    let past = vis.and_then(|b| index.get(b)).map(|b| index.past_of(b));
    let seen = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    let Some(thing) = index.get(thing_hash).filter(|t| t.get("type").is_some() && seen(thing_hash)) else { return Vec::new() };
    if type_of(thing) == "actor" || !is_instance(thing) {
        return Vec::new();
    }
    let counted = |b: &Value| seen(hash_of(b)) && b.get("type").is_some() && crate::forks::counts_in(b, index);
    let made_by: Vec<&Value> = list(rf(thing, "derives_from")).into_iter().filter_map(|h| index.get(h)).filter(|m| type_of(m) == "transform" && counted(m)).collect();
    // an output's makes are those written by its own author: a thing another writes that names her make makes her no owner of it (things.md, A make)
    let makes: Vec<&Value> = made_by.iter().copied().filter(|m| rf(m, "derives_from").is_some() && rs(m, "author") == rs(thing, "author")).collect();
    if !makes.is_empty() {
        let vis = vis.map(String::from);
        return makes.iter().flat_map(|m| list(rf(m, "derives_from"))).map(|i| (i.to_string(), vis.clone())).collect();
    }
    let keeps: Vec<&Value> = made_by.iter().copied().filter(|m| rf(m, "derives_from").is_none() && rs(m, "subject").is_some()).collect();
    match keeps.as_slice() {
        [keep] => rs(keep, "subject").filter(|k| index.get(*k).is_some_and(|t| type_of(t) == "thing")).map(|k| vec![(k.to_string(), Some(hash_of(keep).to_string()))]).unwrap_or_default(),
        _ => Vec::new(),
    }
}

// Read the folds beneath a thing's own as the recursion of own would, deepest first, on a stack of our own instead of the call stack: each
// thing being read is on the reading stack exactly while it would be, so a loop reads as it did, and each answer is remembered under the
// key own gives it. The thing itself is left to own. How deep a chain of makes is changes no answer (a long history is no loop).
fn warm(thing_hash: &str, index: &Index, vis: Option<&str>, now: &str) {
    let key = |t: &str, v: Option<&str>| format!("own:{t}:{}:{now}", v.unwrap_or(""));
    let mut frames: Vec<(String, Option<String>, Vec<(String, Option<String>)>, usize)> = Vec::new();
    let deps = reads_first(thing_hash, index, vis);
    if deps.iter().all(|(t, v)| index.stage_peek(&key(t, v.as_deref())).is_some()) {
        return;
    }
    let mark = |t: &str| format!("own:{t}");
    if reading_stack(|r| r.iter().any(|h| *h == mark(thing_hash))) {
        return;
    }
    reading_stack(|r| r.push(mark(thing_hash)));
    frames.push((thing_hash.to_string(), vis.map(String::from), deps, 0));
    while let Some(top) = frames.last_mut() {
        if top.3 < top.2.len() {
            let (t, v) = top.2[top.3].clone();
            top.3 += 1;
            if index.stage_peek(&key(&t, v.as_deref())).is_some() || reading_stack(|r| r.iter().any(|h| *h == mark(&t))) {
                continue;
            }
            reading_stack(|r| r.push(mark(&t)));
            let deps = reads_first(&t, index, v.as_deref());
            frames.push((t, v, deps, 0));
            continue;
        }
        let (t, v, _, _) = frames.pop().expect("a frame");
        if frames.is_empty() {
            reading_stack(|r| r.pop());
            break;
        }
        let out = own_read(&t, index, v.as_deref(), now);
        reading_stack(|r| r.pop());
        index.stage_put(&key(&t, v.as_deref()), out);
    }
}

// The answer of a thing no one owns: a kind, an actor, or an output no make took anything for.
fn nobody(kind: Option<&Kind>, stated: Option<&Amount>, draws: Vec<Value>) -> Value {
    json!({ "kind": kind.map(Kind::json), "stated": stated.map(Amount::json), "owners": [], "owner": null, "held": null, "ended": null, "let_go": null, "draws": draws, "waiting": [], "pair": [], "named_by": [], "read": [], "_took": {}, "_landed": {} })
}

fn own_read(thing_hash: &str, index: &Index, vis: Option<&str>, now: &str) -> Value {
    let past = vis.and_then(|b| index.get(b)).map(|b| index.past_of(b));
    let seen = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    let Some(thing) = index.get(thing_hash).filter(|t| t.get("type").is_some() && seen(thing_hash)) else { return nobody(None, None, Vec::new()) };
    let pack = Amount::of(st(thing, "pack"));
    let kind = pack.as_ref().map(|p| p.kind.clone());
    // Nothing reaches a person: no word makes an actor property (things.md). A circle's parts are the one measure an actor states (circles.md,
    // Owners): its founding block's `pack`, whole parts, its founder's first.
    let parts = type_of(thing) == "actor" && super::circle::founding(thing_hash, index).is_some_and(|f| super::circle::pack_of(f).is_some());
    if type_of(thing) == "actor" && !parts {
        return nobody(None, None, Vec::new());
    }
    // A kind is a kind by its own block (things.md, Things): a thing is an instance when it names its kind, what it is part of or where it
    // is, or a make it came from; otherwise it has no owner and a draw on it moves nothing. No other block changes which.
    if !parts && !is_instance(thing) {
        return nobody(None, None, Vec::new());
    }
    let counted = |b: &Value| seen(hash_of(b)) && b.get("type").is_some() && crate::forks::counts_in(b, index);
    // who owns an output turns on who owned what its makes took: where that is not shown, neither is this
    for (t, v) in reads_first(thing_hash, index, vis) {
        let a = own(&t, index, v.as_deref(), now);
        if a.get("not_shown") == Some(&Value::Bool(true)) {
            return json!({ "not_shown": true, "lacks": a["lacks"].clone() });
        }
    }
    let starts = first_owners(thing, pack.as_ref(), index, vis, now, &counted);
    let draws = draws_of(thing_hash, index, vis, now);
    let zero = |_: &Value, _: &str| Dec::zero();
    let mut drawn = draws_on(In::of(kind.as_ref()), starts.clone(), draws, &zero, index);
    // Letting go with no receiver: what a let-go took is no one's until a first use takes it, and its speaker is its first owner (things.md,
    // Transfers). A first taker is no draw: it keeps its own rule, read here, and the draws are read again with her start.
    let takers = first_takers(thing_hash, &drawn, index, &counted);
    if !takers.is_empty() {
        let mut more = starts;
        more.extend(takers.iter().cloned());
        let again = draws_of(thing_hash, index, vis, now);
        drawn = draws_on(In::of(kind.as_ref()), more, again, &zero, index);
    }
    // a block given and not read hides each thing it could name; a question whose answer could turn on it is not shown
    let hides = super::draws::hidden(thing_hash, &drawn.starts, index, &seen);
    if !hides.is_empty() {
        let mut lacks: Vec<Value> = drawn.lacks.clone();
        lacks.extend(hides.into_iter().map(Value::String).filter(|h| !drawn.lacks.contains(h)));
        lacks.sort_by(|a, b| match (a.as_str(), b.as_str()) {
            (Some(x), Some(y)) => x.cmp(y),
            (Some(_), None) => core::cmp::Ordering::Less,
            (None, Some(_)) => core::cmp::Ordering::Greater,
            (None, None) => a.to_string().cmp(&b.to_string()),
        });
        return json!({ "not_shown": true, "lacks": lacks });
    }
    if let Some(not) = drawn.not_shown() {
        return not;
    }
    // every sum is an amount in the measure's kind; one whole has no kind, so no sum of it is said (null): its draws say where it is
    let as_sum = |d: Dec| kind.as_ref().map_or(Value::Null, |k| k.amount(&d));
    let owners = drawn.owners();
    let held_rows = drawn.rows.iter().any(|r| r.takes && r.state == Some("held"));
    // what a make took is ended; what a let-go took is no one's until a first use takes it
    let ended_rows = drawn.rows.iter().filter(|r| r.takes && r.state == Some("landed") && r.to == To::Nobody);
    let ended = as_sum(ended_rows.filter(|r| !r.unsaid).filter_map(|r| r.landed.clone()).fold(Dec::zero(), |t, d| t.add(&d)));
    let let_go_rows: Vec<&super::draws::Row> = drawn.rows.iter().filter(|r| r.takes && r.state == Some("landed") && r.to == To::Open && !takers.iter().any(|t| t.seen_from_let_go(&r.block))).collect();
    let let_go = as_sum(let_go_rows.iter().filter(|r| !r.unsaid).filter_map(|r| r.landed.clone()).fold(Dec::zero(), |t, d| t.add(&d)));
    // the one owner: the only one shown, while nothing is held and nothing let go waits for a first use
    let owner = match owners.as_slice() {
        [(o, _)] if !held_rows && let_go_rows.is_empty() && drawn.pair.is_empty() => Some(o.clone()),
        _ => None,
    };
    let took: Map<String, Value> = drawn.rows.iter().filter(|r| r.takes).map(|r| (r.block.clone(), r.took.as_ref().filter(|_| !r.unsaid).map_or(Value::Null, |d| json!(d.text())))).collect();
    let landed: Map<String, Value> = drawn.rows.iter().filter(|r| r.takes && r.state == Some("landed")).map(|r| (r.block.clone(), r.landed.as_ref().filter(|_| !r.unsaid).map_or(Value::Null, |d| json!(d.text())))).collect();
    let owners_json: Vec<Value> = owners.iter().map(|(o, a)| json!({ "owner": o, "amount": a.as_ref().zip(kind.as_ref()).map_or(Value::Null, |(a, k)| k.amount(a)) })).collect();
    let held = as_sum(drawn.sum("held", None).0);
    // the kind of an instance's measure is its pack's unit and, for an instance, its own `refs.of` (encoding.md, Shapes)
    let kind_out = kind.as_ref().map(|k| json!({ "unit": k.unit, "of": list(rf(thing, "of")).first().copied() }));
    // every ownership answer names the blocks it read (`read`, sorted ids).
    // The blocks read: the thing, the block that starts each owner's line for it, each draw listed, and each yes that landed one (the
    // blocks a line was walked through are not named: a line is read whole or the answer is not shown).
    // a grant that names this instance in `refs.what` is a draw on it: it passes the part (`scope.limit` where it is of the thing's kind,
    // else all she owns) to the grant's line, where her tool's blocks draw on it; the part stays hers, held there and never landing (Toll
    // work; folds.md, A part passed). Listed beside the draws; what her tool drew is counted by its own blocks.
    let mut draw_rows = drawn.rows_json(kind.as_ref());
    let names = index.names_memo();
    for g in names.by_use.get(thing_hash).into_iter().flatten().filter_map(|h| index.get(h)).filter(|g| {
        type_of(g) == "grant" && st(g, "status").is_none() && rf(g, "answers").is_none() && list(rf(g, "what")).contains(&thing_hash) && rs(g, "to").is_some() && seen(hash_of(g)) && crate::forks::counts_in(g, index)
    }) {
        let Some(by) = speaker_of(g, index, None) else { continue };
        let part = crate::js::get(g, "state.scope.limit").and_then(|l| Amount::of(Some(l))).filter(|l| kind.as_ref() == Some(&l.kind));
        draw_rows.push(json!({ "block": hash_of(g), "by": by, "to": rs(g, "to"), "amount": part.map(|p| p.json()), "takes": true, "why": null, "state": "held" }));
    }
    draw_rows.sort_by(|x, y| x["block"].as_str().cmp(&y["block"].as_str()));
    // a pass between her tools is shown going to the tool it is handed to (it stays hers: authority.md, A pass between her own tools)
    for r in draw_rows.iter_mut() {
        let to_owner = r["block"].as_str().and_then(|h| index.get(h)).and_then(|t| rs(t, "to_owner")).map(String::from);
        if r["to"] == r["by"] && to_owner.as_deref().is_some_and(|x| Some(x) != r["by"].as_str()) {
            r["to"] = json!(to_owner);
        }
    }
    let passes_part = draw_rows.iter().any(|r| r["block"].as_str().and_then(|h| index.get(h)).is_some_and(|g| type_of(g) == "grant"));
    let owner = if passes_part { None } else { owner };
    let mut read_ids: Vec<String> = vec![thing_hash.to_string()];
    read_ids.extend(draw_rows.iter().filter_map(|r| r["block"].as_str().map(String::from)));
    read_ids.extend(drawn.starts.iter().flat_map(|s| s.at.iter().cloned().chain(core::iter::once(s.seen.clone()))));
    read_ids.extend(drawn.rows.iter().map(|r| r.block.clone()));
    read_ids.extend(drawn.read.iter().cloned());
    let read_ids = sorted_set(read_ids.iter().filter(|h| index.get(h.as_str()).is_some()));
    // the words shown with a thing (`named_by`): each block the reader holds that names this thing, or a draw this answer
    // lists, by any ref, other than the draws and yeses it already lists. Showing it moves nothing and frees no one.
    // `own` is whether it speaks for whom the named draw spoke for (naming the thing itself: its maker); the yeses left out are each
    // receiver's own `accepted` answer to a listed draw (the answer reports them in `state` and `pair`), and each yes that landed one (her
    // order a draw is `for`, listed in `read`); one entry per block, `ref` the
    // first ref key, in byte order, that names it; `pair` whether the block is one of a pair (not a later block of a fork).
    let draw_by: BTreeMap<&str, Option<&str>> = drawn.rows.iter().map(|r| (r.block.as_str(), r.by.as_deref())).collect();
    let draw_to: BTreeMap<&str, Option<&str>> = drawn.rows.iter().map(|r| (r.block.as_str(), match &r.to { super::draws::To::Owner(o) => Some(o.as_str()), _ => None })).collect();
    let in_pair: alloc::collections::BTreeSet<String> = crate::forks::pair_groups_in(index).into_iter().flatten().collect();
    let maker = speaker_of(thing, index, None);
    let mut named_by: Vec<Value> = Vec::new();
    let grant_rows: alloc::collections::BTreeSet<&str> = draw_rows.iter().filter_map(|r| r["block"].as_str()).collect();
    for (h, b) in index.iter().filter(|(h, b)| b.get("type").is_some() && h.as_str() != thing_hash && !draw_by.contains_key(h.as_str()) && !grant_rows.contains(h.as_str()) && !drawn.read.contains(h.as_str()) && seen(h)) {
        let Some(refs) = b.get("refs").and_then(Value::as_object) else { continue };
        let mut keys: Vec<&String> = refs.keys().filter(|k| !matches!(k.as_str(), "author" | "prev" | "key" | "after")).collect();
        keys.sort();
        let hit = keys.iter().find_map(|k| {
            list(refs.get(k.as_str())).into_iter().find(|n| *n == thing_hash || draw_by.contains_key(n)).map(|n| (k.to_string(), n.to_string()))
        });
        let Some((key, target)) = hit else { continue };
        let by = speaker_of(b, index, None);
        if key == "answers" && ss(b, "status") == Some("accepted") && by.is_some() && draw_to.get(target.as_str()).copied().flatten() == by.as_deref() {
            continue;
        }
        let whose = if target == thing_hash { maker.clone() } else { draw_by.get(target.as_str()).copied().flatten().map(String::from) };
        let own = by.is_some() && by == whose;
        named_by.push(json!({ "block": h, "by": by, "own": own, "pair": in_pair.contains(h.as_str()), "ref": key }));
    }
    named_by.sort_by(|a, b| a["block"].as_str().cmp(&b["block"].as_str()));
    json!({
        "pair": drawn.pair,
        "named_by": named_by,
        "read": read_ids,
        "kind": kind_out, "stated": pack.as_ref().map(Amount::json), "owners": owners_json, "owner": owner,
        "held": held, "ended": ended, "let_go": let_go, "draws": draw_rows, "waiting": drawn.waiting_json(), "_took": took, "_landed": landed,
    })
}

// The draws on a thing (folds.md, What is left, A draw): a transfer `to_owner`, a let-go to an open receiver, a make naming it among its
// inputs; a fork's draw is read too, for it binds its signer (A fork is a burden). A transfer of zero is no draw; one handed to hold or
// placed moves no title.
fn draws_of<'a>(thing_hash: &str, index: &'a Index, vis: Option<&str>, now: &str) -> Vec<Draw<'a>> {
    let past = vis.and_then(|b| index.get(b)).map(|b| index.past_of(b));
    let seen = |h: &str| past.as_ref().is_none_or(|p| p.contains(h));
    let names = index.names_memo();
    let mut out: Vec<Draw> = Vec::new();
    let mut seen_draw: alloc::collections::BTreeSet<String> = Default::default();
    for t in names.by_what.get(thing_hash).into_iter().flatten().filter_map(|n| index.get(n)) {
        let binds = seen(hash_of(t)) && (crate::forks::counts_in(t, index) || crate::forks::fork_burden(t, index));
        if type_of(t) != "transfer" || st(t, "status").is_some() || !binds || !seen_draw.insert(hash_of(t).to_string()) {
            continue;
        }
        // A pass between her own tools (authority.md): her tool's transfer of a part its grant passed, to another tool of hers (the holder of a live grant of hers), passes that
        // part: it gives nothing away, and starts on that tool's line at its accept
        let principal = super::draws::passed_grant(t, index).and_then(|g| super::principal_of_chain(g, index));
        let pass_to = list(rf(t, "to_owner")).first().copied().filter(|x| {
            principal.as_deref().is_some_and(|p| p != *x && index.values().any(|g| type_of(g) == "grant" && rs(g, "author") == Some(p) && rs(g, "to") == Some(x) && st(g, "status").is_none() && rf(g, "parent").is_none() && crate::forks::counts_in(g, index)))
        });
        if let (Some(x), Some(p)) = (pass_to, principal.clone()) {
            let yes: Vec<&Value> = index.values().filter(|a| ss(a, "status") == Some("accepted") && rs(a, "answers") == Some(hash_of(t)) && rs(a, "author") == Some(x) && crate::forks::counts_in(a, index) && seen(hash_of(a))).collect();
            out.push(Draw { block: t, by: Some(p.clone()), stays: true, to: To::Owner(p), amount: Amount::of(st(t, "amount")), yes, no: Vec::new(), ends: Vec::new(), condition: None, dead: None, fixed: None, offer: None });
            continue;
        }
        let to = match list(rf(t, "to_owner")).first() {
            Some(o) => To::Owner(o.to_string()),
            None if rf(t, "to_holder").is_none() && rf(t, "to_place").is_none() => To::Open,
            None => continue,
        };
        let amount = Amount::of(st(t, "amount"));
        if amount.as_ref().is_some_and(|a| a.value.is_zero()) {
            continue;
        }
        // a fraction of a part is another kind, so a draw of one takes nothing (`unit`)
        let fraction = type_of(index.get(thing_hash).unwrap_or(t)) == "actor" && amount.as_ref().is_some_and(|a| a.kind.unit == "part" && !super::circle::whole(&a.value));
        // A will (her own transfer on `{ closed: <her id> }`) holds nothing while she can sign: it is no draw until her close
        // is read, and her stop of it before the close ends it. At the close it is read where the close is (draws_on), so it takes only what
        // is still hers there, in the order of her line.
        if is_will(t) && will_close(t, index, &seen).is_none() {
            continue;
        }
        let (yes, no, ends) = match &to {
            To::Owner(o) => answers(t, o, index),
            _ => (Vec::new(), Vec::new(), Vec::new()),
        };
        let keep = |v: Vec<&'a Value>| v.into_iter().filter(|b| seen(hash_of(b))).collect::<Vec<_>>();
        // a condition is read in the past of the block that relies on it: where it does not hold on all that is seen, it
        // holds for the draw where it holds in the past of a counted draw on this thing by its receiver that has the transfer in its past (a
        // later ruling of the judge, or a later `defeats`, ends it only for blocks that had not used it)
        let relied = |c: &Value| -> bool {
            let To::Owner(o) = &to else { return false };
            names.by_what.get(thing_hash).into_iter().flatten().filter_map(|n| index.get(n)).any(|r| {
                hash_of(r) != hash_of(t)
                    && seen(hash_of(r))
                    && speaker_of(r, index, None).as_deref() == Some(o.as_str())
                    && crate::forks::counts_in(r, index)
                    && index.past_of(r).contains(hash_of(t))
                    && {
                        let past = index.past_of(r);
                        condition_holds_in(t, c, index, &|x| seen(hash_of(x)) && past.contains(hash_of(x)), now)
                    }
            })
        };
        let condition = st(t, "condition").map(|c| (condition_holds_in(t, c, index, &|x| seen(hash_of(x)), now) || relied(c)) && !let_go(t, c, index, &|h| seen(h)));
        let dead = st(t, "condition").and_then(|c| condition_dead_in(t, c, index, &|x| seen(hash_of(x))));
        // Coming back (authority.md): her tool's transfer `to_owner` her of a part its grant passed moves nothing of hers; in the thing's
        // fold it is its signer's word, and takes only what the signer owns
        let back = super::draws::passed_grant(t, index).is_some_and(|g| super::principal_of_chain(g, index).is_some_and(|p| list(rf(t, "to_owner")) == [p.as_str()]));
        let by = if back { rs(t, "author").map(String::from) } else { speaker_of(t, index, None) };
        out.push(Draw { block: t, by, stays: to != To::Open, to, amount, yes: keep(yes), no: keep(no), ends: keep(ends), condition, dead, fixed: fraction.then_some("unit"), offer: None });
    }
    // an offer that names an instance of its signer's and a receiver is a draw on that instance: it holds from where it is signed
    for p in names.by_use.get(thing_hash).into_iter().flatten().filter_map(|n| index.get(n)) {
        if let Some(d) = offer_draw(p, thing_hash, index, &seen) {
            if seen_draw.insert(hash_of(p).to_string()) {
                out.push(d);
            }
        }
    }
    for m in names.by_derives.get(thing_hash).into_iter().flatten().filter_map(|n| index.get(n)) {
        // a make of a fork binds its signer as any draw does: it is read, and takes where it fits
        if type_of(m) != "transform" || !seen(hash_of(m)) || !(crate::forks::counts_in(m, index) || crate::forks::fork_burden(m, index)) || !seen_draw.insert(hash_of(m).to_string()) {
            continue;
        }
        let amount = st(m, "inputs").and_then(Value::as_array).and_then(|items| items.iter().find(|i| i.get("from").and_then(Value::as_str) == Some(thing_hash))).and_then(|i| Amount::of(i.get("amount")));
        if amount.as_ref().is_some_and(|a| a.value.is_zero()) {
            continue;
        }
        // a make by a tool under her grant that passes a part of this thing draws for her on the grant's line (Toll work), whether or not it fits
        let by = super::draws::passed_grant(m, index).filter(|g| list(rf(g, "what")).contains(&thing_hash)).and_then(|g| super::principal_of(super::grant_chain(g, index).last().copied().unwrap_or(g), index)).or_else(|| speaker_of(m, index, None));
        out.push(Draw { block: m, by, to: To::Nobody, amount, yes: Vec::new(), no: Vec::new(), ends: Vec::new(), condition: None, dead: None, fixed: None, stays: false, offer: None });
    }
    out
}

/// A will: a transfer conditioned `{ closed: <id> }` signed by that id.
pub(super) fn is_will(t: &Value) -> bool {
    type_of(t) == "transfer" && crate::js::get(t, "state.condition.closed").and_then(Value::as_str).is_some_and(|id| rs(t, "author") == Some(id))
}
/// The close a will takes at: the first of her closes among the blocks `seen` lets in (the one no other has in its past), where no stop of
/// the will by her is in that close's causal past (she may end it until the close). None while she can sign, or once she ended it.
pub(super) fn will_close(t: &Value, index: &Index, seen: &dyn Fn(&str) -> bool) -> Option<String> {
    let id = rs(t, "author")?;
    let closes: Vec<String> = crate::identity::closes_of(id, index).into_iter().filter(|c| seen(c)).collect();
    let first = closes.iter().find(|c| !closes.iter().any(|o| o != *c && index.get(c.as_str()).is_some_and(|cb| index.past_of(cb).contains(o.as_str()))))?;
    let close = index.get(first.as_str())?;
    let past = index.past_of(close);
    let names = index.names_memo();
    // her stop counts once it is in the close's causal past, or one of her clocks received it before the cutoffs that closed the close's
    // wait: a line of the clock the list her close replaces states holds a receipt of it placed before a cutoff of that close
    let clocks = rs(close, "updates").and_then(|u| index.get(u)).and_then(|u| st(u, "clocks")).and_then(crate::tasks::clocks_of);
    let received_before_wait = |b: &Value| -> bool {
        let Some(k) = &clocks else { return false };
        let all = |_: &str| true;
        k.names.iter().any(|n| {
            let Some(line) = crate::line::line_named(n, index) else { return false };
            let cuts: Vec<&Value> = crate::line::observes_on("cutoff", &line, index, &all).filter(|c| list(rf(c, "subject")).contains(&first.as_str())).collect();
            crate::line::receipts_of(hash_of(b), &line, index, &all).iter().any(|r| cuts.iter().any(|c| crate::line::before(r, c, index)))
        })
    };
    let ended = names.by_answer.get(hash_of(t)).into_iter().flatten().filter_map(|n| index.get(n)).any(|b| {
        (past.contains(hash_of(b)) || received_before_wait(b)) && rs(b, "author") == Some(id) && ending(b, hash_of(t)) == Some(End::Stop) && crate::forks::binds_signer(b, index)
    });
    (!ended).then(|| first.clone())
}

/// An offer of an instance as a draw. A promise with no status that answers nothing, names the instance in a line's `what`,
/// speaks for its `from` side (the instance's owner) and names a person in `to`. Her yes is her `accepted` answer to it in time: where it
/// states `expires` and no clock, her accept's own date is before it (a block that states no date, or one at or after the end, is no
/// yes; it waits on his next word). Her no: her `declined` or `stopped` answer, or her counter (a promise answering it with no status).
/// Its ends: his stop of it, or his decline of an accept of it. What performs it: his counted transfers `for` it to her, on the instance.
/// With `terms.clocks` the accept is in time where `needed` clocks show it before `expires` (by place; the text does not say; read so).
/// The amount it holds is the quantity of the line that names the instance, where that is in the instance's unit; otherwise all of it.
fn offer_draw<'a>(p: &'a Value, thing: &str, index: &'a Index, seen: &dyn Fn(&str) -> bool) -> Option<Draw<'a>> {
    if type_of(p) != "promise" || st(p, "status").is_some() || !list(rf(p, "answers")).is_empty() || rf(p, "updates").is_some() || !seen(hash_of(p)) || !(crate::forks::counts_in(p, index) || crate::forks::fork_burden(p, index)) {
        return None;
    }
    if !crate::js::whats_of(p).contains(&thing) {
        return None;
    }
    let by = speaker_of(p, index, None)?;
    if rs(p, "from") != Some(by.as_str()) {
        return None;
    }
    // a receiver other than its giver (her plan names no receiver)
    let to = rs(p, "to").filter(|t| *t != rs(p, "from").unwrap_or("") && index.get(*t).is_none_or(crate::identity::is_genesis))?.to_string();
    let names = index.names_memo();
    let named: Vec<&Value> = names.by_answer.get(hash_of(p)).into_iter().flatten().filter_map(|n| index.get(n)).filter(|b| seen(hash_of(b)) && crate::forks::counts_in(b, index)).collect();
    let hers = |b: &Value| speaker_of(b, index, None).as_deref() == Some(to.as_str());
    let his = |b: &Value| speaker_of(b, index, None).as_deref() == Some(by.as_str());
    let expires = crate::js::get(p, "state.terms.expires").and_then(Value::as_str);
    let clock = crate::js::get(p, "state.terms.clocks").and_then(crate::tasks::clocks_of);
    let in_time = |a: &Value| match (expires, &clock) {
        (None, _) => true,
        (Some(t), Some(k)) => super::clock::received_by(hash_of(a), k, index, t),
        (Some(t), None) => ss(a, "at").and_then(crate::time::parse).zip(crate::time::parse(t)).is_some_and(|(at, end)| at < end),
    };
    let accepts: Vec<&Value> = named.iter().copied().filter(|b| type_of(b) == "promise" && ss(b, "status") == Some("accepted") && list(rf(b, "answers")).contains(&hash_of(p)) && hers(b)).collect();
    // an accept not in time is a yes once the giver's own later block says yes to it (her accepted answer to it, or a block that performs
    // the deal: a transfer `for` it, or her accepted answer to one), or a relier's names it; a stop, a decline, or a block that only has it
    // in its past binds her to nothing (blocks.md, Time; the stage reads the same)
    let deal_ids: Vec<&str> = core::iter::once(hash_of(p)).chain(list(rf(p, "for"))).collect();
    let for_deal = |t: &Value| type_of(t) == "transfer" && st(t, "status").is_none() && list(rf(t, "for")).iter().any(|f| deal_ids.contains(f));
    let acted = |a: &Value| {
        index.values().any(|x| {
            seen(hash_of(x))
                && his(x)
                && hash_of(x) != hash_of(a)
                && index.past_of(x).contains(hash_of(a))
                && ((ss(x, "status") == Some("accepted") && (list(rf(x, "answers")).contains(&hash_of(a)) || rs(x, "answers").and_then(|h| index.get(h)).is_some_and(for_deal))) || for_deal(x))
                && crate::forks::counts_in(x, index)
        })
    };
    let yes: Vec<&Value> = accepts.iter().copied().filter(|a| in_time(a) || acted(a) || super::deal::relied_on(a, index)).collect();
    let no: Vec<&Value> = named
        .iter()
        .copied()
        .filter(|b| hers(b) && list(rf(b, "answers")).contains(&hash_of(p)) && (matches!(ss(b, "status"), Some("declined" | "stopped")) || (type_of(b) == "promise" && st(b, "status").is_none())))
        .collect();
    let mut ends: Vec<&Value> = named.iter().copied().filter(|b| his(b) && ending(b, hash_of(p)) == Some(End::Stop)).collect();
    // her close is an end by its giver, read as any end of hers
    ends.extend(super::draws::closes_of_giver(&by, index).into_iter().filter(|c| seen(hash_of(c))));
    // an offer that is a draw is freed exactly where the accept that answers it does not bind: its giver's decline of that accept frees it
    // (folds.md, Freed)
    let mut no = no;
    for a in &accepts {
        for d in names.by_answer.get(hash_of(a)).into_iter().flatten().filter_map(|n| index.get(n)) {
            if seen(hash_of(d)) && his(d) && ss(d, "status") == Some("declined") && list(rf(d, "answers")).contains(&hash_of(a)) && crate::forks::counts_in(d, index) {
                no.push(d);
            }
        }
    }
    let performed: Vec<String> = names
        .by_for
        .get(hash_of(p))
        .into_iter()
        .flatten()
        .filter_map(|n| index.get(n))
        .filter(|t| type_of(t) == "transfer" && st(t, "status").is_none() && seen(hash_of(t)) && list(rf(t, "what")).contains(&thing) && list(rf(t, "to_owner")).contains(&to.as_str()) && his(t) && (crate::forks::counts_in(t, index) || crate::forks::fork_burden(t, index)))
        .map(|t| hash_of(t).to_string())
        .collect();
    let pack_unit = index.get(thing).and_then(|t| Amount::of(st(t, "pack"))).map(|a| a.kind);
    let line = crate::js::lines_of(crate::js::get(p, "state.terms").unwrap_or(&Value::Null)).into_iter().find(|l| l.get("what").and_then(Value::as_str) == Some(thing));
    let amount = Amount::of(line.and_then(|l| l.get("quantity"))).filter(|q| pack_unit.as_ref().is_some_and(|k| *k == q.kind));
    let condition = st(p, "condition").map(|c| condition_holds_in(p, c, index, &|x| seen(hash_of(x)), ""));
    let dead = st(p, "condition").and_then(|c| condition_dead_in(p, c, index, &|x| seen(hash_of(x))));
    Some(Draw { block: p, by: Some(by), to: To::Owner(to), amount, yes, no, ends, condition, dead, fixed: None, stays: true, offer: Some(performed) })
}

trait FromLetGo {
    fn seen_from_let_go(&self, let_go: &str) -> bool;
}
impl FromLetGo for Start {
    // a first taker's start is seen from the let-go it took up
    fn seen_from_let_go(&self, let_go: &str) -> bool {
        self.seen == let_go
    }
}

// The first owners of what each let-go took (things.md, Transfers): a counted `transform` with no inputs that names the thing in
// `refs.subject` and has the let-go in its causal past takes it; two that do not see each other are a conflict with no owner, unless the
// let-go names a clock, and then the first the clock received is the first owner. Each start is seen from the let-go (it counts only for a
// draw that has the let-go in its past) and starts on the taker's own line.
fn first_takers(thing_hash: &str, drawn: &super::draws::Drawn, index: &Index, counted: &dyn Fn(&Value) -> bool) -> Vec<Start> {
    let names = index.names_memo();
    let mut out = Vec::new();
    for r in drawn.rows.iter().filter(|r| r.takes && r.state == Some("landed") && r.to == To::Open) {
        let Some(n) = index.get(&r.block) else { continue };
        let takers: Vec<&Value> = names
            .by_subject
            .get(thing_hash)
            .into_iter()
            .flatten()
            .filter_map(|h| index.get(h))
            .filter(|b| type_of(b) == "transform" && rf(b, "derives_from").is_none() && rs(b, "subject") == Some(thing_hash) && counted(b) && sees_in(b, &r.block, index))
            .collect();
        // with a clock, the first taker is the one that came first on it (receipts by their place, never dates); two that did
        // not come one first: neither takes
        let by_clock: Option<Vec<&Value>> = st(n, "clocks").and_then(crate::tasks::clocks_of).map(|k| {
            takers.iter().copied().filter(|x| !takers.iter().any(|y| hash_of(y) != hash_of(x) && super::clock::came_first(hash_of(y), hash_of(x), &k, index))).collect()
        });
        let firsts = by_clock.unwrap_or_else(|| earliest(&takers, index));
        if let [one] = firsts.as_slice() {
            if let Some(owner) = speaker_of(one, index, None) {
                out.push(Start { owner, amount: if r.unsaid { None } else { r.landed.clone() }, at: Some(hash_of(one).to_string()), seen: r.block.clone() });
            }
        }
    }
    out
}

// Who owns a thing first (folds.md, What is left, Who owns it first; things.md, A make, Produce of a thing): for an output, the owners of
// what its makes took, each from her start; for the produce of a thing kept, its owners where the keep stands; else whom the thing's own
// block speaks for, from that block.
fn first_owners(thing: &Value, pack: Option<&Amount>, index: &Index, vis: Option<&str>, now: &str, counted: &dyn Fn(&Value) -> bool) -> Vec<Start> {
    let th = hash_of(thing);
    let made_by: Vec<&Value> = list(rf(thing, "derives_from")).into_iter().filter_map(|h| index.get(h)).filter(|m| type_of(m) == "transform" && counted(m)).collect();
    // an output's makes are those written by its own author: a thing another writes that names her make makes her no owner of it (things.md, A make)
    let makes: Vec<&Value> = made_by.iter().copied().filter(|m| rf(m, "derives_from").is_some() && rs(m, "author") == rs(thing, "author")).collect();
    let keeps: Vec<&Value> = made_by.iter().copied().filter(|m| rf(m, "derives_from").is_none() && rs(m, "subject").is_some()).collect();
    if !makes.is_empty() {
        // what each make took, and from whom: the take of each of its inputs, read by that input's own fold
        let mut took: Vec<(String, Option<Amount>, &Value)> = Vec::new();
        for m in &makes {
            for input in list(rf(m, "derives_from")) {
                let read = own(input, index, vis, now);
                let Some(row) = read["draws"].as_array().into_iter().flatten().find(|r| r["block"].as_str() == Some(hash_of(m)) && r["takes"] == Value::Bool(true)) else { continue };
                let Some(by) = row["by"].as_str() else { continue };
                let amount = read["_took"].get(hash_of(m)).and_then(Value::as_str).and_then(Dec::parse).zip(read["kind"].as_object().and_then(|k| k.get("unit")).and_then(Value::as_str)).map(|(value, unit)| Amount {
                    value,
                    // what was taken is in the input's measure, compared by unit with the output's pack (a pack carries no `of`)
                    kind: Kind { unit: unit.to_string(), of: None },
                });
                took.push((by.to_string(), amount, m));
            }
        }
        let mut owners: Vec<String> = took.iter().map(|t| t.0.clone()).collect();
        owners.sort();
        owners.dedup();
        // one owner: all of it; several, each the amount taken from her where the pack is their sum in one kind (a mix); else each is named with
        // no amount and hands on only all she owns
        let parts: Vec<(String, Option<Dec>)> = match owners.as_slice() {
            [] => Vec::new(),
            [one] => vec![(one.clone(), pack.map(|p| p.value.clone()))],
            many => {
                let in_kind = pack.is_some_and(|p| took.iter().all(|t| t.1.as_ref().is_some_and(|a| a.kind == p.kind)));
                let total = took.iter().filter_map(|t| t.1.as_ref()).fold(Dec::zero(), |s, a| s.add(&a.value));
                if in_kind && pack.is_some_and(|p| p.value.cmp(&total).is_eq()) {
                    many.iter().map(|o| (o.clone(), Some(took.iter().filter(|t| &t.0 == o).filter_map(|t| t.1.as_ref()).fold(Dec::zero(), |s, a| s.add(&a.value))))).collect()
                } else {
                    many.iter().map(|o| (o.clone(), None)).collect()
                }
            }
        };
        return parts
            .into_iter()
            .filter_map(|(owner, amount)| {
                let mine: Vec<&Value> = took.iter().filter(|t| t.0 == owner).map(|t| t.2).collect();
                let (at, seen) = output_start(thing, &owner, &mine, index, counted)?;
                Some(Start { owner, amount, seen, at })
            })
            .collect();
    }
    if let [keep] = keeps.as_slice() {
        // Produce of a thing: the owners of the thing kept, where the keep stands; where several own it, each with no amount
        let Some(kept) = rs(keep, "subject").filter(|k| index.get(*k).is_some_and(|t| type_of(t) == "thing")) else { return Vec::new() };
        let read = own(kept, index, Some(hash_of(keep)), now);
        let owners: Vec<String> = read["owners"].as_array().into_iter().flatten().filter_map(|o| o["owner"].as_str().map(String::from)).collect();
        let one = owners.len() == 1;
        return owners
            .into_iter()
            .filter_map(|owner| {
                let (at, seen) = output_start(thing, &owner, &[*keep], index, counted)?;
                Some(Start { amount: if one { pack.map(|p| p.value.clone()) } else { None }, owner, seen, at })
            })
            .collect();
    }
    // made it, or first use: whom the thing's own block speaks for, from that block; an output of a make with no inputs (a mint) by the
    // same signer starts her line at that make, as any make of hers does
    let mint = made_by.iter().copied().find(|m| rf(m, "derives_from").is_none() && rs(m, "subject").is_none() && rs(m, "author") == rs(thing, "author"));
    match speaker_of(thing, index, None) {
        Some(owner) => {
            let at = mint.filter(|m| speaker_of(m, index, None).as_deref() == Some(owner.as_str())).map_or(th.to_string(), |m| hash_of(m).to_string());
            vec![Start { owner, amount: pack.map(|p| p.value.clone()), at: Some(at.clone()), seen: at }]
        }
        None => Vec::new(),
    }
}

// Her start for an output (folds.md, What is left, Her start): a make (or keep) that speaks for her, signed by a key of hers or by a tool of
// hers, is her start, its outputs hers from that block; one signed by anyone else for her (toll work) starts her line only at her own
// `accepted` answer to the output (or to the make), or her tool's; with none, no one is shown owning it.
// Returns (the start, on her line; None when it is on no line) and the block a draw must see to count her amount at all.
fn output_start(thing: &Value, owner: &str, makes: &[&Value], index: &Index, counted: &dyn Fn(&Value) -> bool) -> Option<(Option<String>, String)> {
    // a make that speaks for her: her own, or her tool's under her grant (Toll work: a tool's make that binds her is her start)
    let mut own_makes: Vec<&&Value> = makes.iter().filter(|m| speaker_of(m, index, None).as_deref() == Some(owner)).collect();
    own_makes.sort_by(|a, b| crate::js::cmp16(hash_of(a), hash_of(b)));
    // one make that took from several of her lots is one make
    own_makes.dedup_by(|a, b| hash_of(a) == hash_of(b));
    // of several makes of hers, the one that sees the others is her start; apart, the output is hers on no line (One start)
    let latest: Vec<&&&Value> = own_makes.iter().filter(|m| !own_makes.iter().any(|o| hash_of(o) != hash_of(m) && index.past_of(o).contains(hash_of(m)))).collect();
    match latest.as_slice() {
        [m] => return Some((Some(hash_of(m).to_string()), hash_of(m).to_string())),
        [m, ..] => return Some((None, hash_of(m).to_string())),
        [] => {}
    }
    let names = index.names_memo();
    let targets: Vec<&str> = core::iter::once(hash_of(thing)).chain(makes.iter().map(|m| hash_of(m))).collect();
    let mut yes: Vec<&Value> = targets
        .iter()
        .flat_map(|t| names.by_answer.get(*t).into_iter().flatten())
        .filter_map(|h| index.get(h))
        .filter(|a| ss(a, "status") == Some("accepted") && list(rf(a, "answers")).iter().any(|x| targets.contains(x)) && counted(a) && speaker_of(a, index, None).as_deref() == Some(owner))
        .collect();
    yes.sort_by(|a, b| crate::js::cmp16(hash_of(a), hash_of(b)));
    yes.dedup_by(|a, b| hash_of(a) == hash_of(b));
    // her accepts start her line as One start says (folds.md, One start): on her receiving voice's line, else on no line
    if yes.is_empty() {
        return None;
    }
    match super::draws::one_start(&yes, owner, false, index) {
        (Some(at), _) => Some((Some(at.clone()), at)),
        (None, _) => Some((None, hash_of(thing).to_string())),
    }
}

/// `made_from(instance, blocks)` (folds.md, What each fold returns): each thing written as an output of a counted make that took from it (`from`
/// the instance it took from, `took` the amount, null for all), and so on along the makes, sorted by thing then make. A reading of what the
/// reader holds: a recall names instances and reaches what was made from them.
pub fn made_from(instance: &Value, blocks: &[Value]) -> Value {
    let index = read_all(core::iter::once(instance).chain(index_of(blocks).values().collect::<Vec<_>>()));
    // a fold asked about a block that is not read gives no answer
    if index.get(hash_of(instance)).is_none_or(|b| b.get("type").is_none()) {
        return Value::Null;
    }
    match made_from_walk(hash_of(instance), &index) {
        Ok(list) => Value::Array(list),
        Err(not_shown) => not_shown,
    }
}

pub(crate) fn made_from_in(start: &str, index: &Index) -> Vec<Value> {
    made_from_walk(start, index).unwrap_or_default()
}

/// What was made from an instance, output by output; where the ownership of one along the way is not shown, the answer turns on a block
/// not given and is not shown itself (folds.md, An answer never says "nobody").
fn made_from_walk(start: &str, index: &Index) -> core::result::Result<Vec<Value>, Value> {
    let names = index.names_memo();
    let mut out: Vec<Value> = Vec::new();
    let mut todo: Vec<String> = vec![start.to_string()];
    let mut done: alloc::collections::BTreeSet<String> = Default::default();
    while let Some(x) = todo.pop() {
        if !done.insert(x.clone()) {
            continue;
        }
        let read = own(&x, index, None, "");
        if read.get("not_shown") == Some(&Value::Bool(true)) {
            return Err(json!({ "not_shown": true, "lacks": read["lacks"].clone() }));
        }
        for row in read["draws"].as_array().into_iter().flatten().filter(|r| r["takes"] == Value::Bool(true) && r["to"].is_null()) {
            let Some(m) = row["block"].as_str().and_then(|h| index.get(h)).filter(|m| type_of(m) == "transform") else { continue };
            let took = row["amount"].clone();
            for t in names.by_derives.get(hash_of(m)).into_iter().flatten().filter_map(|h| index.get(h)) {
                if type_of(t) != "thing" || !crate::forks::counts_in(t, index) {
                    continue;
                }
                out.push(json!({ "thing": hash_of(t), "from": x, "make": hash_of(m), "took": took }));
                todo.push(hash_of(t).to_string());
            }
        }
    }
    out.sort_by(|a, b| crate::js::cmp16(a["thing"].as_str().unwrap_or(""), b["thing"].as_str().unwrap_or("")).then_with(|| crate::js::cmp16(a["make"].as_str().unwrap_or(""), b["make"].as_str().unwrap_or(""))));
    out.dedup();
    Ok(out)
}

/// Who owned a thing as a block saw it: the one owner the ownership fold of the block's causal past shows (promises.md, Bearer: a side that
/// names a thing is its owner where each block of the deal stands, never "now"). None when several own parts of it, or it is held.
pub(crate) fn owner_seen_by(thing: &str, block: &Value, index: &Index) -> Option<String> {
    if index.get(hash_of(block)).is_none() {
        return None;
    }
    own(thing, index, Some(hash_of(block)), "")["owner"].as_str().map(String::from)
}

/// Who owns a thing among the blocks read (no clock): its one owner, or None.
pub(crate) fn owner_whole(thing: &str, index: &Index) -> Option<String> {
    own(thing, index, None, "")["owner"].as_str().map(String::from)
}

/// Who owns an instance now: its one owner, or None (several own parts of it, it is held, or no one does).
pub fn owner_of(instance: &Value, blocks: &[Value]) -> Option<String> {
    ownership(instance, blocks)["owner"].as_str().map(String::from)
}

/// Who receives a bearer promise (refs.to names a thing): whoever owns it now; otherwise refs.to itself.
pub fn receiver_of(promise: &Value, blocks: &[Value]) -> Option<String> {
    let index = crate::js::blocks_index(blocks);
    let to = rs(promise, "to")?;
    match index.get(to) {
        Some(t) if type_of(t) == "thing" => owner_of(t, blocks),
        _ => Some(to.to_string()),
    }
}

/// Where a thing is now: the `to_place` of its latest counted move (by whoever owned it where that move stands, or a holder such an
/// owner named), else
/// its own refs.place; a place that is a thing is wherever that thing is (stopping at a repeat). Two moves that do not
/// see each other give both places. A sorted list of hashes.
pub fn where_now(thing: &Value, blocks: &[Value]) -> Vec<String> {
    // the blocks given, closed once and the forks marked once: every level below reads this one index
    let mut read = crate::js::blocks_index(blocks);
    crate::forks::mark_forks(&mut read);
    where_now_in(thing, &read, &mut Vec::new())
}

fn where_now_in(thing: &Value, read: &Index, seen: &mut Vec<String>) -> Vec<String> {
    let me = read.get(hash_of(thing)).unwrap_or(thing).clone();
    let h = hash_of(&me).to_string();
    if seen.contains(&h) {
        return vec![h];
    }
    // a place inside a place nests only as deep as a reader reads (canonical::read_depth): past it the chain stops at the place reached
    if seen.len() >= crate::canonical::read_depth() {
        return vec![h];
    }
    seen.push(h.clone());
    // the blocks read, with the thing itself among them: built only when the thing is not already there, never once per level
    let extended;
    let with_me: &Index = if read.contains_key(&h) {
        read
    } else {
        let mut one = read.clone();
        one.insert(h.clone(), me.clone());
        extended = one;
        &extended
    };
    // a move counts when its signer owned the thing where that move stands (the ownership fold of its causal past), or holds it for
    // one who did: a thing sold does not jump back to where it was made, nor away from where its last owner put it.
    // Each transfer that names the thing is asked once: who signed it, and whether that signer owned the thing where it stands.
    let names = read.names_memo();
    let mut all: Vec<&Value> = names
        .by_what
        .get(h.as_str())
        .into_iter()
        .flatten()
        .filter_map(|n| read.get(n))
        .filter(|b| type_of(b) == "transfer" && st(b, "status").is_none() && list(rf(b, "what")).contains(&h.as_str()) && crate::forks::counts_in(b, read))
        .collect();
    all.dedup_by(|a, b| hash_of(a) == hash_of(b));
    // Whether a transfer's signer owned the thing where it stands is asked only where it is read (a transfer naming a
    // holder, or a move), and a move is not asked at all once a counted move has it in its past (it cannot be a head)
    let owns = |b: &Value| {
        let signer = speaker_of(b, read, None);
        signer.is_some() && signer == owner_seen_by(&h, b, with_me)
    };
    let holders: alloc::collections::BTreeSet<&str> = all.iter().filter(|b| rf(b, "to_holder").is_some() && owns(b)).flat_map(|b| list(rf(b, "to_holder"))).collect();
    let candidates: Vec<&Value> = all.iter().copied().filter(|b| rf(b, "to_place").is_some()).collect();
    let pasts: Vec<_> = candidates.iter().map(|m| read.past_of(m)).collect();
    let mut order: Vec<usize> = (0..candidates.len()).collect();
    order.sort_by(|a, b| pasts[*b].len().cmp(&pasts[*a].len()));
    let mut counted = vec![false; candidates.len()];
    let mut asked: Vec<usize> = Vec::new();
    for i in order {
        let b = candidates[i];
        if asked.iter().any(|j| counted[*j] && pasts[*j].contains(hash_of(b))) {
            continue;
        }
        asked.push(i);
        counted[i] = owns(b) || speaker_of(b, read, None).is_some_and(|s| holders.contains(s.as_str()));
    }
    let moves: Vec<usize> = (0..candidates.len()).filter(|i| counted[*i]).collect();
    let places: Vec<String> = if !moves.is_empty() {
        // two moves see each other through every block given, not only through other moves (folds.md: seeing is the causal past)
        let heads: Vec<&Value> = moves.iter().filter(|i| !moves.iter().any(|j| pasts[*j].contains(hash_of(candidates[**i])))).map(|i| candidates[*i]).collect();
        unique(heads.iter().flat_map(|b| {
            list(rf(b, "to_place"))
                .into_iter()
                .map(String::from)
                .collect::<Vec<_>>()
        }))
    } else {
        list(rf(&me, "place"))
            .into_iter()
            .map(String::from)
            .collect()
    };
    let mut out: Vec<String> = Vec::new();
    for place in places {
        match read.get(&place) {
            Some(at) if type_of(at) == "thing" => {
                let further = where_now_in(at, read, seen);
                if further.is_empty() {
                    out.push(place);
                } else {
                    out.extend(further);
                }
            }
            _ => out.push(place),
        }
    }
    sorted_set(out)
}
