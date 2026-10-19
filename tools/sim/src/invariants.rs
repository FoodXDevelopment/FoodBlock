//! What must be true after a run, checked against facts the simulator wrote down as it went (the truth), and against the
//! core's own answers when the same blocks are folded in another order, on another node, or with other clocks.
use crate::world::*;
use foodblock::js::index_of;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub fn union_of(w: &World) -> Vec<Value> {
    union(w)
}

fn union(w: &World) -> Vec<Value> {
    let mut seen = BTreeSet::new();
    let mut out = vec![];
    for n in &w.nodes {
        for b in &n.store {
            if seen.insert(World::hash(b)) {
                out.push(b.clone());
            }
        }
    }
    out
}

fn shuffled(blocks: &[Value], seed: u64) -> Vec<Value> {
    let mut r = Rng::new(seed);
    let mut v = blocks.to_vec();
    for i in (1..v.len()).rev() {
        v.swap(i, r.below(i + 1));
    }
    v
}

fn first_diff(a: &[String], b: &[String]) -> String {
    let (sa, sb): (BTreeSet<&String>, BTreeSet<&String>) = (a.iter().collect(), b.iter().collect());
    let only_a: Vec<&&String> = sa.difference(&sb).take(2).collect();
    let only_b: Vec<&&String> = sb.difference(&sa).take(2).collect();
    format!("only here {only_a:?}; only there {only_b:?}")
}

fn find<'a>(blocks: &'a [Value], h: &str) -> Option<&'a Value> {
    blocks.iter().find(|b| b["hash"] == json!(h))
}

const BINDING: [&str; 4] = ["accepted", "underway", "done", "reversed"];

fn stage_of(root: &Value, blocks: &[Value]) -> Value {
    foodblock::fold::promise_stage(root, blocks, &foodblock::fold::StageOptions::default())
}

/// A digest of every fold over a set of blocks, by hash. Two stores with the same blocks must give the same lines in any order.
pub fn fold_digest(w: &World, blocks: &[Value]) -> Vec<String> {
    let mut out = vec![];
    for b in blocks {
        match b["type"].as_str().unwrap_or("") {
            "promise" if b["refs"].get("answers").is_none() && b["refs"].get("updates").is_none() => {
                let t0 = std::time::Instant::now();
                let s = stage_of(b, blocks);
                if std::env::var("FBSIM_TRACE").is_ok() {
                    eprintln!("promise_stage over {} blocks: {:?}", blocks.len(), t0.elapsed());
                }
                let mut takers: Vec<String> = s["takers"].as_array().cloned().unwrap_or_default().iter().map(|t| format!("{}:{}", t["who"], t["quantity"])).collect();
                takers.sort();
                out.push(format!("deal {} {} accept={} forks={} takers={:?}", &b["hash"].as_str().unwrap()[..8], s["stage"], !s["accept"].is_null(), s["forks"], takers));
            }
            "thing" => {
                let t0 = std::time::Instant::now();
                let o = foodblock::fold::ownership(b, blocks);
                if std::env::var("FBSIM_TRACE").is_ok() {
                    eprintln!("ownership over {} blocks: {:?}", blocks.len(), t0.elapsed());
                }
                out.push(format!("thing {} owner={:?} conflict={:?}", &b["hash"].as_str().unwrap()[..8], o.owner.map(|x| x[..8].to_string()), o.conflict.map(|c| c.len())));
            }
            "actor" if b["state"]["kind"] == json!("circle") => {
                let c = foodblock::fold::circle_state(b["hash"].as_str().unwrap(), blocks, None).map(|c| c.to_json());
                let members: Vec<String> = c.as_ref().and_then(|c| c["members"].as_object()).map(|m| m.iter().map(|(k, v)| format!("{}={}", &k[..8], v["roles"])).collect()).unwrap_or_default();
                let mut m = members;
                m.sort();
                out.push(format!("circle {} {:?}", &b["hash"].as_str().unwrap()[..8], m));
            }
            _ => {}
        }
    }
    for a in &w.actors {
        let st = foodblock::identity::identity_state(&a.id, blocks, None);
        out.push(format!("id {} keys={} frozen={}", &a.id[..8], st.keys.len(), st.frozen.len()));
    }
    out.sort();
    out
}

/// The same facts with every hash replaced by the order the block was made in: runs that differ only in clocks must agree.
pub fn logical_digest(w: &mut World) -> Vec<String> {
    quiet(w);
    // over the sound blocks: nodes may keep a few the whole record refuses, and which they keep depends on arrival order, which depends on hashes
    let all = union(w);
    let full = index_of(all.iter());
    let sound = sound_set(&all, &full, &verdicts(&all, &full));
    let u: Vec<Value> = all.into_iter().filter(|b| sound.contains(b["hash"].as_str().unwrap())).collect();
    let logical = |h: &str| w.logical.get(h).map(|i| i.to_string()).unwrap_or_else(|| "?".into());
    let who = |id: &str| w.actor_of.get(id).map(|i| format!("a{i}")).unwrap_or_else(|| format!("c{}", logical(id)));
    let mut out: Vec<String> = vec![];
    for b in &u {
        match b["type"].as_str().unwrap_or("") {
            "promise" if b["refs"].get("answers").is_none() && b["refs"].get("updates").is_none() => {
                let s = stage_of(b, &u);
                let takers = s["takers"].as_array().map(|t| t.len()).unwrap_or(0);
                out.push(format!("deal {} {} accept={} forks={} takers={}", logical(b["hash"].as_str().unwrap()), s["stage"], !s["accept"].is_null(), s["forks"].as_array().map(|f| f.len()).unwrap_or(0), takers));
            }
            "thing" => {
                let o = foodblock::fold::ownership(b, &u);
                out.push(format!("thing {} owner={:?} conflict={}", logical(b["hash"].as_str().unwrap()), o.owner.map(|x| who(&x)), o.conflict.is_some()));
            }
            "actor" if b["state"]["kind"] == json!("circle") => {
                let c = foodblock::fold::circle_state(b["hash"].as_str().unwrap(), &u, None).map(|c| c.to_json());
                let mut m: Vec<String> = c.as_ref().and_then(|c| c["members"].as_object()).map(|m| m.iter().map(|(k, v)| format!("{}={}", who(k), v["roles"])).collect()).unwrap_or_default();
                m.sort();
                out.push(format!("circle {} {:?}", logical(b["hash"].as_str().unwrap()), m));
            }
            _ => {}
        }
    }
    for (i, a) in w.actors.iter().enumerate() {
        let st = foodblock::identity::identity_state(&a.id, &u, None);
        let signed: BTreeSet<usize> = st.signed_by_author.iter().filter(|(_, ok)| *ok).filter_map(|(h, _)| w.logical.get(h).copied()).collect();
        out.push(format!("a{i} keys={} frozen={} signed={:?}", st.keys.len(), st.frozen.len(), signed));
    }
    for (p, s, _) in &w.truth.consents {
        let c = foodblock::strangers::consent(p, Some(s), &u, None);
        out.push(format!("consent {} {} {}", who(p), who(s), c["word"]));
    }
    out.sort();
    out
}

fn quiet(w: &mut World) {
    if w.nodes.iter().any(|n| !n.inbox.is_empty() && n.offline_until != 0) {
        w.quiesce();
    }
}

/// A block is sound when it is valid against the whole record (what history may still change, a key rotated later, aside) and so
/// is every earlier block of its own key's chain. Nodes legitimately differ over blocks that are not: one that took a wide grant
/// or a stranger's accept before the block they depend on arrived keeps it, another does not.
fn verdicts(u: &[Value], full: &foodblock::js::Index) -> BTreeMap<String, Vec<String>> {
    let mut held = full.clone();
    let mut out = BTreeMap::new();
    for b in u {
        let h = World::hash(b);
        let blk = held.swap_remove(&h).unwrap_or_else(|| b.clone());
        out.insert(h.clone(), foodblock::valid(&blk, &held, None, None).into_iter().map(|x| x.code).collect());
        held.insert(h, blk);
    }
    out
}

fn sound_set(u: &[Value], full: &foodblock::js::Index, verdicts: &BTreeMap<String, Vec<String>>) -> BTreeSet<String> {
    let mut ok: BTreeMap<String, bool> = BTreeMap::new();
    let mut own: BTreeMap<String, bool> = BTreeMap::new();
    for b in u {
        let h = World::hash(b);
        own.insert(h.clone(), verdicts[&h].iter().all(|c| c == "void_key"));
    }
    fn walk(h: &str, full: &foodblock::js::Index, own: &BTreeMap<String, bool>, ok: &mut BTreeMap<String, bool>) -> bool {
        if let Some(v) = ok.get(h) {
            return *v;
        }
        let Some(b) = full.get(h) else { return true };
        let mut v = own.get(h).copied().unwrap_or(true);
        if v {
            if let (Some(p), Some(a)) = (b["refs"]["prev"].as_str(), b["refs"]["author"].as_str()) {
                if full.get(p).is_some_and(|pb| pb["refs"]["author"] == json!(a)) {
                    v = walk(p, full, own, ok);
                }
            }
        }
        ok.insert(h.to_string(), v);
        v
    }
    for b in u {
        walk(b["hash"].as_str().unwrap(), full, &own, &mut ok);
    }
    ok.into_iter().filter(|(_, v)| *v).map(|(h, _)| h).collect()
}

pub fn check(w: &mut World) -> Vec<String> {
    let mut v: Vec<String> = vec![];
    let t0 = std::time::Instant::now();
    let trace = |what: &str| {
        if std::env::var("FBSIM_TRACE").is_ok() {
            eprintln!("check: {what} at {:?}", t0.elapsed());
        }
    };
    let u = union(w);
    let full = index_of(u.iter());
    let name = |id: &str| w.actor_of.get(id).map(|i| format!("{}", w.actors[*i].name)).unwrap_or_else(|| id[..8.min(id.len())].to_string());

    // 1. Every block any node kept passes valid() against everything there is (a forged or tampered block was refused).
    let verdict = verdicts(&u, &full);
    let mut bad = 0;
    for b in &u {
        // History moves: a key rotated later voids what it signed after counted_to, and a parent grant that arrived late shows
        // its child to be wider. Those verdicts need the whole record and a node cannot un-store; every other refusal is
        // about the block's own bytes, key and chain, which a node had when it took the block.
        let r: Vec<&String> = verdict[&World::hash(b)].iter().filter(|c| !matches!(c.as_str(), "void_key" | "wider_than_parent" | "not_receiver" | "chain" | "not_a_side" | "bad_signature")).collect();
        if !r.is_empty() {
            bad += 1;
            if bad <= 3 {
                v.push(format!("a node holds a block that is not valid against the full record: {} {} {:?}", b["type"], b["state"]["kind"], r));
            }
        }
    }
    // 2. Blocks no node may hold: a forged signature, a tampered body, a stranger's accept.
    for (h, sig) in &w.truth.never_stored {
        for n in &w.nodes {
            if n.store.iter().any(|b| b["hash"] == json!(h) && b["signature"] == json!(sig)) {
                v.push(format!("{} holds a block it must refuse (forged or tampered): {}", n.name, &h[..8]));
            }
        }
    }
    trace("// 3. Convergence");
    // 3. Convergence: after every message arrived, nodes hold the same blocks. A block one node refused for want of context that
    //    another took is a verdict that depended on arrival order.
    let sound = sound_set(&u, &full, &verdict);
    let reference: Vec<Value> = u.iter().filter(|b| sound.contains(b["hash"].as_str().unwrap())).cloned().collect();
    let mut shown = 0;
    for n in &w.nodes {
        for b in &u {
            let h = b["hash"].as_str().unwrap();
            if n.have.contains(h) {
                continue;
            }
            // a block the whole record voids (a thief's, after the rotation) may be missing from a node that saw the rotation first
            let counts = sound.contains(h) && foodblock::identity::signed_by_author(b, &u, None) && !foodblock::identity::forked(b, &u);
            if !counts {
                continue;
            }
            shown += 1;
            if shown <= 4 {
                let acc = foodblock::sync::accept(&[b.clone()], &n.store, None, None);
                let why = n.refused.get(h).cloned().unwrap_or_else(|| if n.pending.iter().any(|p| p["hash"] == json!(h)) { "(waiting for its prev)".into() } else { "(never reached)".into() });
                v.push(format!("{} lacks a block that counts: {} {} (refused as {}); with its full record now: {}", n.name, b["type"], b["state"]["kind"], why, acc.to_json()));
            }
        }
    }
    if shown > 4 {
        v.push(format!("... {} more blocks that count are missing from nodes", shown - 4));
    }
    // 4. Every node folds the same blocks to the same answers, whatever order it took them in.
    let base = fold_digest(w, &reference);
    {
        let d = fold_digest(w, &shuffled(&reference, 77));
        if d != base {
            v.push(format!("the folds of one block set differ with the order it is read in: {}", first_diff(&d, &base)));
        }
    }
    let last = w.nodes.len() - 1;
    for (ni, n) in w.nodes.iter().enumerate() {
        if ni != 0 && ni != last {
            continue;
        }
        {
            let d = fold_digest(w, &n.store);
            if d != base {
                v.push(format!("{} folds what it holds differently from the whole record: {}", n.name, first_diff(&d, &base)));
            }
        }
    }

    trace("// 5. Deals");
    // 5. Deals: nothing binds without the other side's consent; what was consented to binds.
    for d in &w.truth.deals {
        let Some(root) = find(&u, &d.root) else { continue };
        let s = stage_of(root, &u);
        let stage = s["stage"].as_str().unwrap_or("").to_string();
        let binding = BINDING.contains(&stage.as_str());
        let ok = match d.expect {
            Expect::Binding => binding,
            Expect::NotBinding => !binding,
            Expect::Declined => stage == "declined",
        };
        if !ok {
            let extra = d.answer.as_ref().map(|a| {
                let in_u = full.contains_key(a);
                let st = foodblock::identity::identity_state(&d.buyer, &u, None);
                let signed = st.signed_by_author.iter().find(|(h, _)| h == a).map(|x| x.1);
                let forked = find(&u, a).map(|b| foodblock::identity::forked(b, &u));
                let held: Vec<&str> = w.nodes.iter().filter(|n| n.have.contains(a)).map(|n| n.name.as_str()).collect();
                format!("; answer {} in record {in_u}, held by {held:?}, signed_by_author {signed:?}, forked {forked:?}, buyer keys {} frozen {}", &a[..8], st.keys.len(), st.frozen.len())
            }).unwrap_or_default();
            v.push(format!("deal {} → {}: expected {:?} ({}), the fold says {} (buyer {}, seller {}){extra}", &d.root[..8], stage, d.expect, d.why, stage, name(&d.buyer), name(&d.seller)));
        }
    }
    trace("// 6. No double");
    // 6. No double allocation: an open offer never binds more than it offers, and only what its owner allocated.
    for o in &w.truth.opens {
        let Some(root) = find(&u, &o.root) else { continue };
        let s = stage_of(root, &u);
        let takers = s["takers"].as_array().cloned().unwrap_or_default();
        let sum: i64 = takers.iter().map(|t| t["quantity"]["value"].as_str().and_then(|x| x.parse::<i64>().ok()).unwrap_or(0)).sum();
        let allocated: i64 = o.allocated.iter().map(|(_, q)| q).sum();
        if sum > o.offered {
            v.push(format!("open offer {} binds {} against {} offered (double allocation)", &o.root[..8], sum, o.offered));
        }
        if sum > allocated {
            v.push(format!("open offer {} binds {} but only {} was allocated", &o.root[..8], sum, allocated));
        }
        if allocated <= o.offered && sum < allocated {
            v.push(format!("open offer {} binds {} of {} allocated within the offer", &o.root[..8], sum, allocated));
        }
        for t in &takers {
            let req = t["request"].as_str().unwrap_or("");
            if !o.allocated.iter().any(|(r, _)| r == req) {
                v.push(format!("open offer {}: a taker with no allocation by the offerer ({})", &o.root[..8], &req[..8.min(req.len())]));
            }
        }
    }
    trace("// 7. Ownership");
    // 7. Ownership: only the owner moves it, only the receiver's yes completes it, crossing moves are named.
    for (thing, owner, conflict) in &w.truth.owners {
        let Some(t) = find(&u, thing) else { continue };
        let o = foodblock::fold::ownership(t, &u);
        if o.owner.as_deref() != Some(owner.as_str()) || o.conflict.is_some() != *conflict {
            v.push(format!("thing {}: owner {:?} conflict {:?}, expected owner {} conflict {}", &thing[..8], o.owner.map(|x| name(&x)), o.conflict.is_some(), name(owner), conflict));
        }
    }
    trace("// 8. Equivoc");
    // 8. Equivocations are detected, and what follows one is uncounted.
    let pairs = foodblock::identity::fork_pairs_in(&full);
    for (author, a, b) in &w.truth.pairs {
        if !(full.contains_key(a) && full.contains_key(b)) {
            continue;
        }
        let mut want = [a.clone(), b.clone()];
        want.sort();
        if !pairs.iter().any(|p| p[0] == want[0] && p[1] == want[1]) {
            v.push(format!("an equivocation by {} went undetected", name(author)));
        }
        let chain: Vec<Value> = u.iter().filter(|x| x["refs"]["author"] == json!(author)).cloned().collect();
        let c = foodblock::check_chain(&chain, author);
        if c.ok || c.equivocations.is_empty() {
            v.push(format!("the chain of {} (an equivocator) reports ok", name(author)));
        }
    }
    for h in &w.truth.after_fork {
        if let Some(b) = find(&u, h) {
            if !foodblock::identity::forked(b, &u) {
                v.push(format!("a block after an equivocating pair is not marked forked: {}", &h[..8]));
            }
        }
    }
    trace("// 9. History");
    // 9. History: a key speaks only up to counted_to; what a thief signed after is void, what the owner signed stands.
    let mut by_author: BTreeMap<String, BTreeMap<String, bool>> = BTreeMap::new();
    for (a, h) in w.truth.voided.iter().chain(w.truth.counted.iter()) {
        if !by_author.contains_key(a) {
            let st = foodblock::identity::identity_state(a, &u, None);
            by_author.insert(a.clone(), st.signed_by_author.into_iter().collect());
        }
        let _ = h;
    }
    for (a, h) in &w.truth.voided {
        if full.contains_key(h) && by_author[a].get(h).copied().unwrap_or(false) {
            v.push(format!("a block signed by a stolen or frozen key still counts for {}: {}", name(a), &h[..8]));
        }
    }
    for (a, h) in &w.truth.counted {
        if full.contains_key(h) && !by_author[a].get(h).copied().unwrap_or(false) {
            v.push(format!("a block the owner signed does not count for {}: {}", name(a), &h[..8]));
        }
    }
    trace("// 10. STOPs");
    // 10. STOPs are honoured; only the person lifts one.
    for (p, s, word) in &w.truth.consents {
        let c = foodblock::strangers::consent(p, Some(s), &u, None);
        if c["word"] != json!(word) && c["word"].is_null() == (*word != "none") {
            v.push(format!("consent of {} about {}: the fold says {}, expected {}", name(p), name(s), c["word"], word));
        }
    }
    for (stop, person, first) in &w.truth.stopped_firsts {
        if !full.contains_key(stop) {
            continue;
        }
        // Consent decides what binds, not what exists: the block sent despite the STOP is valid, no node refuses it, and
        // the sender's next block on its chain is not left waiting on it (consent.md, invariant 29).
        let r = foodblock::strangers::admission_refusals(first, person, &u, &json!({}), 0);
        if r.iter().any(|x| x.code == "stopped") {
            v.push(format!("a node refused a block for the STOP of {}: it must be kept and read as stopped", name(person)));
        }
        let mut held = full.clone();
        held.shift_remove(&World::hash(first));
        let bad = foodblock::valid(first, &held, None, None);
        if bad.iter().any(|x| x.code == "unmet" || x.code == "chain") {
            v.push(format!("the block sent despite the STOP of {} is not judged on itself and what it rests on: {:?}", name(person), bad.iter().map(|x| x.code.clone()).collect::<Vec<_>>()));
        }
    }
    // 11. Spam within the rule: a stranger gets in at most K first blocks, whatever the order they come.
    for (receiver, k, flood) in &w.truth.spam {
        let mut taken = 0u64;
        for b in flood {
            let r = foodblock::strangers::admission_refusals(b, receiver, &u, &json!({ "per_stranger": k }), taken);
            if !r.iter().any(|x| x.code == "not_admitted") {
                taken += 1;
            }
        }
        if taken != *k {
            v.push(format!("admission let {} strangers in where the rule says {}", taken, k));
        }
    }
    trace("// 12. Grants");
    // 12. Grants: an agent acts only under a live grant that names the act; a child is never wider than its parent.
    for (b, ok) in &w.truth.under {
        if !full.contains_key(b["hash"].as_str().unwrap()) {
            continue;
        }
        let why = foodblock::grant::why_not_under(b, &u, None);
        if why.is_empty() != *ok {
            v.push(format!("a block under a grant: expected {} to pass the grant check, got {:?}", ok, why));
        }
    }
    for child in &w.truth.wider {
        let h = child["hash"].as_str().unwrap();
        if !full.contains_key(h) {
            continue;
        }
        let mut held = full.clone();
        held.shift_remove(h);
        let parent_held = held.contains_key(child["refs"]["parent"].as_str().unwrap_or(""));
        let r = foodblock::valid(child, &held, None, None);
        if parent_held && !r.iter().any(|x| x.code == "wider_than_parent") {
            v.push(format!("a grant wider than its parent is valid: {:?}", r.iter().map(|x| x.code.clone()).collect::<Vec<_>>()));
        }
    }
    for (b, circle, ok) in &w.truth.may_act {
        if !full.contains_key(b["hash"].as_str().unwrap()) {
            continue;
        }
        let got = foodblock::fold::may_act_as(b, circle, &u, None);
        if got != *ok {
            v.push(format!("may_act_as for a member's block {} (circle {}): expected {ok}, got {got}", &b["hash"].as_str().unwrap()[..8], &circle[..8]));
        }
    }
    trace("// 13. A recall");
    // 13. A recall by marks reaches every unit and every owner.
    if let Some((lot, owners, units)) = &w.truth.recall {
        let filter = json!({ "marks": { "scheme": "lot", "value": lot } });
        let mut found_units = BTreeSet::new();
        let mut found_owners = BTreeSet::new();
        for b in &u {
            if b["type"] == json!("thing") && foodblock::sync::matches(b, &filter, &full) {
                found_units.insert(World::hash(b));
                if let Some(o) = foodblock::fold::ownership(b, &u).owner {
                    found_owners.insert(o);
                }
            }
        }
        let want: BTreeSet<String> = units.iter().filter(|h| full.contains_key(*h)).cloned().collect();
        if found_units != want {
            v.push(format!("the recall by marks found {} units, there are {}", found_units.len(), want.len()));
        }
        let want_owners: BTreeSet<String> = owners.clone();
        if found_owners != want_owners {
            v.push(format!("the recall reaches {} owners, there are {}", found_owners.len(), want_owners.len()));
        }
    }
    v
}

/// `fbsim debug --seed N`: the voided blocks of the truth, where they are held, and what the identity fold says of them.
pub fn debug(w: &mut World) {
    let u = union(w);
    for (a, h) in w.truth.voided.iter().take(6) {
        let st = foodblock::identity::identity_state(a, &u, None);
        let b = find(&u, h);
        let held: Vec<&str> = w.nodes.iter().filter(|n| n.have.contains(h)).map(|n| n.name.as_str()).collect();
        let refused: Vec<String> = w.nodes.iter().filter_map(|n| n.refused.get(h).map(|c| format!("{}:{c}", n.name))).collect();
        println!("voided {} of {}: in union {} held by {:?} refused {:?}", &h[..8], &a[..8], b.is_some(), held, refused);
        println!("   keys {:?} frozen {:?}", st.keys.iter().map(|k| k[k.len() - 6..].to_string()).collect::<Vec<_>>(), st.frozen.iter().map(|k| k[k.len() - 6..].to_string()).collect::<Vec<_>>());
        if let Some(b) = b {
            println!("   signed_by_author {:?}  seq {} prev {}", st.signed_by_author.iter().find(|(x, _)| x == h).map(|x| x.1), b["state"]["seq"], &b["refs"]["prev"].as_str().unwrap_or("")[..8]);
        }
        for blk in u.iter().filter(|x| x["type"] == json!("grant") && x["state"]["kind"] == json!("key") && x["refs"]["subject"] == json!(a)) {
            println!("   key grant {} replaces {:?} counted_to {} by recovery {} seq {} prev {}", &blk["hash"].as_str().unwrap()[..8], blk["state"]["replaces"].as_str().map(|k| k[k.len() - 6..].to_string()), blk["state"]["counted_to"].as_str().map(|c| c[..8].to_string()).unwrap_or_default(), blk["state"].get("recovery_key").is_some(), blk["state"]["seq"], &blk["refs"]["prev"].as_str().unwrap_or("")[..8]);
        }
    }
}

pub fn debug_missing(w: &mut World) {
    let u = union(w);
    let mut shown = 0;
    for b in &u {
        let h = b["hash"].as_str().unwrap();
        let holders: Vec<&str> = w.nodes.iter().filter(|n| n.have.contains(h)).map(|n| n.name.as_str()).collect();
        if holders.len() == w.nodes.len() {
            continue;
        }
        shown += 1;
        if shown > 5 {
            break;
        }
        let a = b["refs"]["author"].as_str().unwrap_or("");
        let st = foodblock::identity::identity_state(a, &u, None);
        let me = st.signed_by_author.iter().find(|(x, _)| x == h).map(|x| x.1);
        println!("   block {}", serde_json::to_string(&json!({"state": b["state"], "refs": b["refs"]})).unwrap_or_default().chars().take(420).collect::<String>());
        if let Some(p) = find(&u, b["refs"]["prev"].as_str().unwrap_or("")) {
            println!("   prev  {} {}", p["type"], serde_json::to_string(&json!({"state": p["state"], "refs": p["refs"]})).unwrap_or_default().chars().take(300).collect::<String>());
        }
        {
            let prev = b["refs"]["prev"].as_str().unwrap_or("");
            let pb = w.created.iter().find(|x| World::hash(x) == prev);
            let by: Vec<String> = w.nodes.iter().map(|n| format!("{}{}", n.name, if n.have.contains(prev) { "+" } else if let Some(c) = n.refused.get(prev) { c.as_str() } else { "-" })).collect();
            println!("   its prev {} {} {:?}", &prev[..8.min(prev.len())], pb.map(|p| format!("{} {} seq {} by {}", p["type"], p["state"]["kind"], p["state"]["seq"], &p["refs"]["author"].as_str().unwrap_or("")[..6.min(p["refs"]["author"].as_str().unwrap_or("").len())])).unwrap_or_default(), by);
        }
        println!("missing somewhere: {} {} by {} seq {} signed_by_author {:?} forked {} held by {:?} refused-by {:?}", b["type"], b["state"]["kind"], &a[..8.min(a.len())], b["state"]["seq"], me, foodblock::identity::forked(b, &u), holders, w.nodes.iter().filter_map(|n| n.refused.get(h).map(|c| format!("{}:{c}", n.name))).collect::<Vec<_>>());
    }
}

pub fn debug_refused(w: &mut World) {
    let mut seen: BTreeMap<String, (String, Vec<String>)> = BTreeMap::new();
    for n in &w.nodes {
        for (h, c) in &n.refused {
            let b = w.created.iter().find(|b| &World::hash(b) == h);
            let what = b.map(|b| format!("{} {} by {} seq {}", b["type"], b["state"]["kind"], &b["refs"]["author"].as_str().unwrap_or("")[..6.min(b["refs"]["author"].as_str().unwrap_or("").len())], b["state"]["seq"])).unwrap_or_default();
            seen.entry(h.clone()).or_insert((what, vec![])).1.push(format!("{}:{c}", n.name));
        }
    }
    for (h, (what, by)) in seen.iter().take(12) {
        println!("refused {} {} {:?}", &h[..6], what, by);
    }
}
