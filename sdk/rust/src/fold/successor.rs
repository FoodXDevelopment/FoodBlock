//! A successor's trigger (profiles/successor.md).
use crate::identity::ArrivedAt;
use crate::js::{cmp16, count_stated, hash_of, held_index, list, rf, rs, sorted_set, ss, st, type_of};
use crate::prelude::*;
use core::cmp::Ordering;

/// Where a successor grant's trigger stands: the needed witnesses' trigger observes, less those the person defeats
/// before it fires. It fires `wait` after the needed-th event arrived on this node (`arrived_at`), on the reader's own
/// clock (`now`). Returns `{ events, cancelled, since, fires, fired }`.
pub fn successor_state(
    grant: &Value,
    blocks: &[Value],
    now: Option<&str>,
    arrived_at: ArrivedAt,
) -> Value {
    let index = held_index(blocks);
    let gh = hash_of(grant);
    let person = rs(grant, "author");
    let witnesses = list(st(grant, "witnesses"));
    // `needed` (a whole number of at least 1) and `wait` are the person's own words (profiles/successor.md): with either absent or
    // malformed the fold fills in none, and the trigger never fires
    let needed = count_stated(st(grant, "needed"), None).map(|n| n as usize);
    let wait: Option<&str> = ss(grant, "wait");
    let events: Vec<&Value> = index
        .values()
        .filter(|b| {
            type_of(b) == "observe"
                && ss(b, "kind") == Some("trigger")
                && rs(b, "under") == Some(gh)
                && rs(b, "author").is_some_and(|a| witnesses.contains(&a))
                && rs(grant, "author").is_some_and(|p| list(rf(b, "subject")).contains(&p))
                && crate::identity::counts_in(b, &index)
        })
        .collect();
    let arrived = |b: &Value| arrived_at.and_then(|f| f.at(hash_of(b)));
    // The person's counted defeats of an event (one half of a forked pair cancels nothing).
    let defeats: Vec<&Value> = index
        .values()
        .filter(|b| person.is_some() && rs(b, "author") == person && !list(rf(b, "defeats")).is_empty() && crate::identity::counts_in(b, &index))
        .collect();
    // Arrival order: known arrivals first, by time; an unknown arrival after all of them; equal ones by hash, only to name one.
    let order = |a: &&Value, b: &&Value| match (arrived(a), arrived(b)) {
        (Some(x), Some(y)) => x.cmp(&y),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
    .then_with(|| cmp16(hash_of(a), hash_of(b)));
    // The least reading: start with nothing cancelled; take one event per witness (their earliest standing one), work out
    // `fires`, and cancel every event a defeats names that arrived strictly before `fires` (or at an unknown time, or while
    // nothing fires); repeat until nothing more is cancelled.
    let mut cancelled: Vec<&str> = Vec::new();
    let (standing, since, fires) = loop {
        let mut pool: Vec<&Value> = events.iter().copied().filter(|e| !cancelled.contains(&hash_of(e))).collect();
        pool.sort_by(order);
        let mut standing: Vec<&Value> = Vec::new();
        for e in pool {
            if !standing.iter().any(|o| rs(o, "author") == rs(e, "author")) {
                standing.push(e);
            }
        }
        let since = match needed {
            Some(n) if standing.len() >= n => arrived(standing[n - 1]),
            _ => None,
        };
        let fires = since.as_deref().zip(wait).and_then(|(s, w)| crate::time::add_duration(s, w, 1));
        let before = cancelled.len();
        for e in &events {
            let h = hash_of(e);
            if cancelled.contains(&h) {
                continue;
            }
            let cancels = defeats.iter().any(|d| {
                list(rf(d, "defeats")).contains(&h)
                    && match (arrived(d), fires.as_deref()) {
                        (Some(a), Some(f)) => a.as_str() < f,
                        _ => true,
                    }
            });
            if cancels {
                cancelled.push(h);
            }
        }
        if cancelled.len() == before {
            break (standing, since, fires);
        }
    };
    let fired = matches!((&fires, now), (Some(f), Some(n)) if n >= f.as_str());
    json!({
        "events": sorted_set(standing.iter().map(|e| hash_of(e))),
        "cancelled": sorted_set(cancelled),
        "since": since, "fires": fires, "fired": fired,
    })
}
