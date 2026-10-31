//! Shares and uses of a thing or a place (things.md, Shares; Uses of a place): which shares stand against a thing's later owners, and
//! what use of a place the record shows.
use super::{clock, owner_seen_by, owner_whole, speaker_of};
use crate::js::{hash_of, rf, rs, sorted_set, ss, st, type_of};
use crate::prelude::*;
use crate::bound::{ring_of, P};
use alloc::collections::BTreeMap;

/// The shares that stand on an instance or a place (things.md, Shares). A share is a thing of kind `share` that names the one instance
/// or place it is a part of in `refs.subject`. It stands when its maker owned that thing where the share stands, so it limits whoever
/// owns the thing later: a later owner passes on only what is left. It counts for nothing when its subject is not a thing, is a kind
/// (some thing names it in `refs.of`), or was not its maker's to share. A share never reaches copies, offspring or things made by the
/// same method: it names one thing, and nothing made from it is that thing.
/// Returns `{ standing: [{ share, owner }], nothing: [{ share, reason }] }`, each sorted by share.
pub fn shares_on(thing: &Value, blocks: &[Value]) -> Value {
    let index = super::read_all(core::iter::once(thing).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()));
    let subject = hash_of(thing).to_string();
    let is_kind = index.values().any(|b| rs(b, "of") == Some(subject.as_str()));
    let mut shares: Vec<&Value> = index
        .values()
        .filter(|b| type_of(b) == "thing" && ss(b, "kind") == Some("share") && rs(b, "subject") == Some(subject.as_str()) && crate::identity::counts_in(b, &index))
        .collect();
    shares.sort_by_key(|b| hash_of(b).to_string());
    let (mut standing, mut nothing) = (vec![], vec![]);
    for s in shares {
        let h = hash_of(s);
        let reason = if type_of(index.get(&subject).unwrap_or(thing)) != "thing" {
            Some("not_a_thing")
        } else if is_kind {
            Some("kind")
        } else {
            let maker = speaker_of(s, &index, None);
            (maker.is_none() || maker != owner_seen_by(&subject, s, &index)).then_some("not_owner")
        };
        match reason {
            Some(r) => nothing.push(json!({ "share": h, "reason": r })),
            None => standing.push(json!({ "share": h, "owner": owner_whole(h, &index) })),
        }
    }
    json!({ "standing": standing, "nothing": nothing })
}

// ---- A bound is a polygon: GeoJSON-shaped, positions [lon, lat] as decimal strings of at most nine places ----

fn cross(o: P, a: P, b: P) -> i128 {
    (a.0 - o.0) * (b.1 - o.1) - (a.1 - o.1) * (b.0 - o.0)
}
fn sign(x: i128) -> i32 {
    x.signum() as i32
}
/// Whether two edges cross at a point inside both (not at an end, not along each other).
fn proper(a: P, b: P, c: P, d: P) -> bool {
    let (d1, d2, d3, d4) = (sign(cross(a, b, c)), sign(cross(a, b, d)), sign(cross(c, d, a)), sign(cross(c, d, b)));
    d1 * d2 < 0 && d3 * d4 < 0
}
fn on_edge(p: P, a: P, b: P) -> bool {
    cross(a, b, p) == 0 && p.0 >= a.0.min(b.0) && p.0 <= a.0.max(b.0) && p.1 >= a.1.min(b.1) && p.1 <= a.1.max(b.1)
}
/// Strictly inside a ring (not on its border), by the crossing-number rule.
fn inside(p: P, ring: &[P]) -> bool {
    let mut c = false;
    for w in ring.windows(2) {
        let (a, b) = (w[0], w[1]);
        if on_edge(p, a, b) {
            return false;
        }
        if (a.1 > p.1) != (b.1 > p.1) {
            // the edge's x at height p.1, compared without division
            let lhs = (p.0 - a.0) * (b.1 - a.1);
            let rhs = (b.0 - a.0) * (p.1 - a.1);
            if (b.1 > a.1 && lhs < rhs) || (b.1 < a.1 && lhs > rhs) {
                c = !c;
            }
        }
    }
    c
}
/// Whether two bounds share area, not only a border.
fn overlap(a: &[P], b: &[P]) -> bool {
    // two bounds whose boxes do not meet share no area and no border: nothing below can hold, so the edge tests are skipped
    let boxed = |r: &[P]| (r.iter().map(|p| p.0).min(), r.iter().map(|p| p.0).max(), r.iter().map(|p| p.1).min(), r.iter().map(|p| p.1).max());
    let ((ax0, ax1, ay0, ay1), (bx0, bx1, by0, by1)) = (boxed(a), boxed(b));
    if ax1 < bx0 || bx1 < ax0 || ay1 < by0 || by1 < ay0 {
        return false;
    }
    let double = |r: &[P]| r.iter().map(|p| (p.0 * 2, p.1 * 2)).collect::<Vec<P>>();
    let (a2, b2) = (double(a), double(b));
    let mids = |r: &[P]| r.windows(2).map(|w| (w[0].0 + w[1].0, w[0].1 + w[1].1)).collect::<Vec<P>>();
    for wa in a2.windows(2) {
        for wb in b2.windows(2) {
            if proper(wa[0], wa[1], wb[0], wb[1]) {
                return true;
            }
        }
    }
    a2.iter().any(|p| inside(*p, &b2))
        || b2.iter().any(|p| inside(*p, &a2))
        || mids(a).iter().any(|p| inside(*p, &b2))
        || mids(b).iter().any(|p| inside(*p, &a2))
        || {
            let (mut x, mut y) = (a.to_vec(), b.to_vec());
            x.sort();
            x.dedup();
            y.sort();
            y.dedup();
            x == y
        }
}

/// What use of a place the record shows (things.md, Uses of a place). A use is a counted `transform` that makes nothing from anything
/// (no `derives_from`), names the place in `refs.subject`, and says in `state.use` what was done (cleared, planted, drew water, fenced,
/// built, kept): an act. A block that only claims or grants is not a use. The dated record is evidence a referee reads, never title.
/// With the clock `keepers` (blocks.md, A named clock) a use is dated by the time `needed` keepers received it, and a use they have not
/// received is not dated; with none it is dated by its author's own `at`, which only that author says.
/// Returns `{ clock, users: [{ user, acts, count, first, last, seasons, bounds, resting, overlaps }] }`, sorted by user; no users is
/// "none shown" (in what this reader holds, never "empty land").
pub fn use_shown(place: &Value, blocks: &[Value], keepers: Option<&Value>) -> Value {
    let index = super::read_all(core::iter::once(place).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()));
    let ks = keepers.and_then(crate::tasks::keepers_of);
    let target = hash_of(place);
    struct U {
        acts: Vec<String>,
        dates: Vec<String>,
        bounds: Vec<(String, Vec<P>)>,
        resting: Option<String>,
        unreceived: usize,
        layers: Vec<String>,
    }
    let mut users: BTreeMap<String, U> = BTreeMap::new();
    // every use record with its user and date, for the disputes below
    let mut records: Vec<(String, String, Option<String>)> = Vec::new();
    for b in index.values() {
        if type_of(b) != "transform" || rf(b, "derives_from").is_some() || rs(b, "subject") != Some(target) || !crate::identity::counts_in(b, &index) {
            continue;
        }
        let Some(act) = ss(b, "use") else { continue };
        let Some(user) = speaker_of(b, &index, None) else { continue };
        let date = match &ks {
            Some(k) => clock::received_at(hash_of(b), k, &index),
            None => ss(b, "at").map(String::from),
        };
        records.push((hash_of(b).to_string(), user.clone(), date.clone()));
        let u = users.entry(user).or_insert(U { acts: vec![], dates: vec![], bounds: vec![], resting: None, unreceived: 0, layers: vec![] });
        u.acts.push(act.to_string());
        if let Some(l) = ss(b, "layer") {
            u.layers.push(l.to_string());
        }
        match date {
            Some(d) => u.dates.push(d),
            None => u.unreceived += 1,
        }
        if let Some(bound) = st(b, "bound") {
            if let Some(ring) = ring_of(bound) {
                let key = bound.get("coordinates").map(|c| c.to_string()).unwrap_or_default();
                if !u.bounds.iter().any(|(k, _)| *k == key) {
                    u.bounds.push((key, ring));
                }
            }
        }
        if let Some(r) = ss(b, "resting") {
            if u.resting.as_deref().is_none_or(|x| x < r) {
                u.resting = Some(r.to_string());
            }
        }
    }
    let names: Vec<String> = users.keys().cloned().collect();
    let out: Vec<Value> = names
        .iter()
        .map(|name| {
            let u = &users[name];
            let mut dates = u.dates.clone();
            dates.sort();
            let mut seasons: Vec<&str> = dates.iter().map(|d| &d[..4]).collect();
            seasons.dedup();
            let mut bounds: Vec<&(String, Vec<P>)> = u.bounds.iter().collect();
            bounds.sort_by(|a, b| a.0.cmp(&b.0));
            let with: Vec<&String> = names
                .iter()
                .filter(|o| *o != name && users[*o].bounds.iter().any(|(_, rb)| u.bounds.iter().any(|(_, ra)| overlap(ra, rb))))
                .collect();
            json!({
                "user": name,
                "acts": sorted_set(u.acts.iter()),
                "count": dates.len(),
                "unreceived": u.unreceived,
                "first": dates.first(),
                "last": dates.last(),
                "seasons": seasons.len(),
                "bounds": bounds.iter().map(|(k, _)| json!({ "type": "Polygon", "coordinates": serde_json::from_str::<Value>(k).unwrap_or(Value::Null) })).collect::<Vec<_>>(),
                "resting": u.resting,
                "overlaps": with,
                "layers": sorted_set(u.layers.iter()),
                // the overlap lists both uses and says whether they are the same act, deciding nothing (things.md, Uses of a place)
                "overlap_acts": with.iter().map(|o| {
                    let same = users[*o].acts.iter().any(|a| u.acts.contains(a));
                    json!({ "with": o, "act": if same { "same" } else { "different" } })
                }).collect::<Vec<_>>(),
                "leave": leave_of(name, target, &index),
            })
        })
        .collect();
    // A dispute of a first-use record (things.md, Uses of a place): a counted `defeats` of a use record beside which the fold shows its
    // `standing`: it names an earlier use of the same place by its own author, names a title held by its author, or shows none.
    let mut disputes: Vec<Value> = Vec::new();
    for d in index.values().filter(|d| crate::identity::counts_in(d, &index)) {
        let Some(defender) = speaker_of(d, &index, None) else { continue };
        for (rec, user, date) in &records {
            if !crate::js::list(rf(d, "defeats")).contains(&rec.as_str()) {
                continue;
            }
            let cited = crate::js::list(rf(d, "derives_from"));
            let earlier = records.iter().any(|(h, u, when)| {
                cited.contains(&h.as_str()) && *u == defender && h != rec && matches!((when, date), (Some(a), Some(b)) if a < b)
            });
            let title = cited.iter().any(|h| {
                index.get(*h).is_some_and(|t| {
                    type_of(t) == "transfer" && crate::js::list(rf(t, "what")).contains(&target) && crate::js::list(rf(t, "to_owner")).contains(&defender.as_str()) && crate::identity::counts_in(t, &index)
                })
            });
            let standing = if earlier { "earlier_use" } else if title { "title" } else { "none" };
            disputes.push(json!({ "defeats": hash_of(d), "by": defender, "of": rec, "user": user, "standing": standing }));
        }
    }
    disputes.sort_by(|a, b| crate::js::cmp16(a["defeats"].as_str().unwrap_or(""), b["defeats"].as_str().unwrap_or("")).then_with(|| crate::js::cmp16(a["of"].as_str().unwrap_or(""), b["of"].as_str().unwrap_or(""))));
    json!({ "clock": if ks.is_some() { "keepers" } else { "author" }, "users": out, "disputes": disputes })
}

/// A use by leave (things.md, Uses of a place): the owner's `grant` of kind `leave`, `refs.to` the user, `refs.subject` the place, signed by
/// whoever owned the place where the grant stands and not stopped by its author. Use by leave never ripens: it is shown as "by leave of X
/// since D", never as a use that stands against X. Returns `{ of, since, until }` for the earliest such grant, else null.
fn leave_of(user: &str, place: &str, index: &crate::js::Index) -> Value {
    let mut found: Vec<&Value> = index
        .values()
        .filter(|g| {
            type_of(g) == "grant"
                && ss(g, "kind") == Some("leave")
                && st(g, "status").is_none()
                && rs(g, "to") == Some(user)
                && rs(g, "subject") == Some(place)
                && crate::identity::counts_in(g, index)
                && speaker_of(g, index, None).is_some_and(|who| owner_seen_by(place, g, index).as_deref() == Some(who.as_str()))
                && crate::grant::why_not_live_in(Some(g), index, None).is_empty()
        })
        .collect();
    found.sort_by(|a, b| (ss(a, "at"), hash_of(a)).cmp(&(ss(b, "at"), hash_of(b))));
    match found.first() {
        Some(g) => json!({ "of": speaker_of(g, index, None), "since": ss(g, "at"), "until": crate::js::get(g, "state.scope.until") }),
        None => Value::Null,
    }
}
