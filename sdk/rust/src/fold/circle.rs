//! A circle (circles.md): its members and roles, folded from its member grants.
use super::read_all;
use crate::grant::{ending, End};
use crate::js::{cmp16, count_stated, get, hash_of, int, list, quorum, rf, rs, sorted_set, ss, st, type_of, unique, Index, Past};
use crate::prelude::*;
use alloc::collections::{BTreeMap, BTreeSet};
use core::cell::RefCell;

/// One member of a circle: the roles they hold and the grant that made them a member (with several current grants that do not
/// see each other, the roles of all of them, and the grant with the lowest hash, to name one).
#[derive(Debug, Clone, PartialEq)]
pub struct Member {
    pub roles: Vec<String>,
    pub grant: Option<String>,
    /// Every current grant (the heads that have not ended).
    pub grants: Vec<String>,
}

/// A circle's members and roles: `{ founder, members: { id: { roles, grant, counted_to } }, removed: { id: null } }` (a circle
/// reads no `counted_to`: a stop always cuts at itself, so both are null).
#[derive(Debug, Clone, PartialEq)]
pub struct CircleState {
    pub founder: String,
    pub members: indexmap::IndexMap<String, Member, crate::js::BuildHasher>,
    pub removed: indexmap::IndexMap<String, Option<String>, crate::js::BuildHasher>,
    /// For each grant that ended: who held it, the grant, and the cut of every stop that ended it (the stop itself).
    pub cuts: Vec<(String, String, String)>,
    /// The blocks signed as the circle by a member after the cut of a grant that ended: they carry no authority for the circle.
    pub void: alloc::collections::BTreeSet<String>,
    /// The stops the cut never sets aside: a member's own leaving (their word, not the circle's).
    pub kept: alloc::collections::BTreeSet<String>,
    /// A removal in a crossing (a pair or a ring), with the cut it is kept from: only the cut of the stop in the crossing that removes
    /// its own author (the crossing rule judges them). Any other cut sets it aside like any block of theirs.
    pub crossing: alloc::collections::BTreeSet<(String, String)>,
}

impl CircleState {
    pub fn to_json(&self) -> Value {
        json!({
            "founder": self.founder,
            "members": Value::Object(self.members.iter().map(|(k, m)| (k.clone(), json!({ "roles": m.roles, "grant": m.grant, "counted_to": null }))).collect()),
            "removed": Value::Object(self.removed.iter().map(|(k, v)| (k.clone(), json!(v))).collect()),
        })
    }
}

/// A circle's roles from its actor: `[(name, powers)]`, the founder holding the first.
fn roles_table(root: &Value) -> Vec<(String, Vec<String>)> {
    match get(root, "state.roles") {
        Some(Value::Array(list)) => list
            .iter()
            .map(|r| {
                (
                    r.get("name").and_then(Value::as_str).unwrap_or("").to_string(),
                    r.get("powers").and_then(Value::as_array).map(|p| p.iter().filter_map(Value::as_str).map(String::from).collect()).unwrap_or_default(),
                )
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// Whether any of these role names carries a power, in a circle's roles.
fn holds_power(table: &[(String, Vec<String>)], roles: &[String], power: &str) -> bool {
    table.iter().any(|(name, powers)| roles.contains(name) && powers.iter().any(|p| p == power))
}

struct Circle<'a> {
    index: &'a Index,
    id: String,
    founder: String,
    /// The circle's roles: `[(name, powers)]`, the founder holding the first.
    roles: Vec<(String, Vec<String>)>,
    // the circle's stated `removal.needed` (a whole number of at least 1); with none stated, or malformed, no removal-like act stands
    removal_needed: Option<f64>,
    related: Vec<Value>,
    /// The folds already made, by the set read (a fold being made reads as empty, so a cycle ends).
    memo: RefCell<BTreeMap<String, CircleState>>,
    /// The folds of a held block's causal past, by its hash (its past is fixed, so its fold is too).
    at: RefCell<BTreeMap<String, CircleState>>,
    closes: core::cell::OnceCell<Vec<String>>,
}

/// A stop of a member grant: its block, its signer, whether it is the member's own leaving (else a removal by a holder of
/// `remove`), and whether it stands on its own (step 5; a stop not judged stands).
struct Stop<'b> {
    block: &'b Value,
    by: String,
    leave: bool,
    stands: bool,
}

/// One member's joining by one invitation: their first acceptances (two from two devices that do not see each other are both
/// first), the roles it gives them, and every stop of it.
struct Joining<'b> {
    inv: &'b Value,
    who: String,
    accepts: Vec<&'b Value>,
    roles: Vec<String>,
    stops: Vec<Stop<'b>>,
}

// A stop's cut (circles.md, The cut), with who held the grant and the grant: the stop itself. A circle reads no `counted_to`.
fn cut(j: &Joining, s: &Stop) -> (String, String, String) {
    (j.who.clone(), hash_of(j.inv).to_string(), hash_of(s.block).to_string())
}
fn author_of(b: &Value) -> String {
    rs(b, "author").unwrap_or("").to_string()
}
fn no_answers(b: &Value) -> bool {
    list(rf(b, "answers")).is_empty()
}
fn roles_of(b: &Value) -> Vec<String> {
    match st(b, "roles") {
        Some(Value::Array(r)) => unique(r.iter().filter_map(Value::as_str)),
        _ => vec![],
    }
}

// The roles a member holds for a block (decision H11): a member grant with `scope.until` gives its roles to no block it cuts
// (`ran_out`). Holding through several grants, the member keeps the roles of those still running. None when no grant of theirs runs.
fn roles_at(member: &Member, block: &Value, index: &Index) -> Option<Vec<String>> {
    let ended = |g: &str| index.get(g).is_some_and(|g| crate::grant::ran_out(g, block));
    let running: Vec<&String> = member.grants.iter().filter(|g| !ended(g)).collect();
    if running.len() == member.grants.len() {
        return Some(member.roles.clone());
    }
    if running.is_empty() {
        return None;
    }
    // the founding block gives the founder's roles; a member grant, the roles it names
    let given: Vec<String> = running.iter().flat_map(|g| index.get(g.as_str()).map(|b| if type_of(b) == "actor" { member.roles.clone() } else { roles_of(b) }).unwrap_or_default()).collect();
    Some(member.roles.iter().filter(|r| given.contains(r)).cloned().collect())
}

impl<'a> Circle<'a> {
    fn new(root: &Value, index: &'a Index, related: Vec<Value>) -> Self {
        Circle {
            index,
            id: hash_of(root).to_string(),
            founder: rs(root, "author").unwrap_or("").to_string(),
            roles: roles_table(root),
            // the fold fills in no number (folds.md, Counts): a circle that states none removes no holder of admit or remove
            removal_needed: count_stated(get(root, "state.removal.needed"), None),
            related,
            memo: Default::default(),
            at: Default::default(),
            closes: Default::default(),
        }
    }
    fn empty(&self) -> CircleState {
        let mut members = indexmap::IndexMap::default();
        members.insert(
            self.founder.clone(),
            Member {
                roles: self.roles.first().map(|(n, _)| vec![n.clone()]).unwrap_or_default(),
                grant: Some(self.id.clone()),
                grants: vec![self.id.clone()],
            },
        );
        CircleState {
            founder: self.founder.clone(),
            members,
            removed: Default::default(),
            cuts: Vec::new(),
            void: Default::default(),
            kept: Default::default(),
            crossing: Default::default(),
        }
    }
    fn past_fold(&self, block: &Value) -> CircleState {
        let h = hash_of(block);
        let held = self.index.get(h).is_some_and(|b| core::ptr::eq(b, block) || b == block);
        if held {
            if let Some(s) = self.at.borrow().get(h) {
                return s.clone();
            }
        }
        let state = self.fold_within(&self.index.past_of(block));
        if held {
            self.at.borrow_mut().insert(h.to_string(), state.clone());
        }
        state
    }
    // The fold of the blocks in a causal past. A past that does not hold the circle has no members (the circle is not yet).
    fn fold_within(&self, past: &Past) -> CircleState {
        if !past.contains(&self.id) {
            let mut none = self.empty();
            none.members.clear();
            return none;
        }
        let set: Vec<Value> = self.related.iter().filter(|b| past.contains(hash_of(b))).cloned().collect();
        self.fold_scoped(&set, Some(past))
    }
    fn fold_all(&self) -> CircleState {
        self.fold_scoped(&self.related, None)
    }
    // The blocks beside the member grants that the fold also reads: the closes (a death), within `scope`.
    fn beside(&self, scope: Option<&Past>) -> Vec<String> {
        // every close held, found once per circle (sorted), then cut to the scope
        let all = self.closes.get_or_init(|| {
            let mut out: Vec<String> = self
                .index
                .values()
                .filter(|b| type_of(b) == "observe" && ss(b, "kind") == Some("close"))
                .map(|b| hash_of(b).to_string())
                .collect();
            out.sort();
            out
        });
        all.iter().filter(|h| scope.is_none_or(|s| s.contains(*h))).cloned().collect()
    }
    fn fold_scoped(&self, set: &[Value], scope: Option<&Past>) -> CircleState {
        let mut hashes: Vec<&str> = set.iter().map(hash_of).collect();
        hashes.sort();
        let beside = self.beside(scope);
        let key = format!("{}|{}", hashes.join(","), beside.join(","));
        if let Some(s) = self.memo.borrow().get(&key) {
            return s.clone();
        }
        self.memo.borrow_mut().insert(key.clone(), self.empty());
        let state = self.fold_now(set, &beside);
        self.memo.borrow_mut().insert(key, state.clone());
        state
    }
    // The fold reads the whole set at once, never in an order a reader met the blocks in nor by a hash (folds are pure):
    // 1. the invitations; 2. each invitation's versions, joiners and the roles each holds by it; 3. its stops, and which stand on their
    // own (the quorum); 4. a standing stop that came before the answer; 5. the crossing rule (pairs and rings); 6. an answer after a
    // removal to an invitation from before it counts for nothing; 7. the heads, their roles, who is out, the cuts.
    fn fold_now(&self, set: &[Value], beside: &[String]) -> CircleState {
        let f = Fold {
            circle: self,
            set,
            pasts: set.iter().map(|b| (hash_of(b), self.index.past_of(b))).collect(),
            powers: crate::spec().list("powers"),
            answering: naming(set, "answers"),
            updating: naming(set, "updates"),
        };
        let invitations = f.invitations();
        let (joined, early) = f.joinings(&invitations);
        // The rivals a removal may cross: every early removal and every removal that stands on its own, by the member it removes.
        let rivals: Vec<(&str, &Stop)> =
            early.iter().chain(&joined).flat_map(|j| j.stops.iter().filter(|s| !s.leave && s.stands).map(move |s| (j.who.as_str(), s))).collect();
        // Each standing stop of a joining that never was is a cut. The cut never sets aside a leaving; a removal in a crossing is kept
        // only from the cut of the stop in it that removes its own author (circles.md, The cut).
        let mut cuts: Vec<(String, String, String)> = early.iter().flat_map(|j| j.stops.iter().filter(|s| s.stands).map(move |s| cut(j, s))).collect();
        let mut kept: BTreeSet<String> = early.iter().flat_map(|j| &j.stops).filter(|s| s.leave).map(|s| hash_of(s.block).to_string()).collect();
        let mut crossing: BTreeSet<(String, String)> = BTreeSet::new();
        let mut ended: Vec<(&Joining, Vec<&Stop>)> = Vec::new();
        for j in &joined {
            let mut ends = Vec::new();
            for s in &j.stops {
                if s.leave {
                    kept.insert(hash_of(s.block).to_string());
                }
                let rings = f.rings(&rivals, j, s);
                // each stop of a ring is kept from the cut of the one before it (the stop that removes its author)
                for ring in &rings {
                    for (i, x) in ring.iter().enumerate() {
                        let before = ring[(i + ring.len() - 1) % ring.len()];
                        crossing.insert((hash_of(x.block).to_string(), hash_of(before.block).to_string()));
                    }
                }
                if f.ends(s) {
                    ends.push(s);
                }
            }
            ended.push((j, ends));
        }
        // 6. An answer counts only if the invitation came after the removal: a joining whose first acceptances all come after (or beside)
        // a removal that ended another of the member's grants, by an invitation that has not seen that removal, never was.
        // Voiding a joining that gives admit or remove this way is a removal-like act: it needs a removal that `removal.needed` different
        // removers made (clean round 1, circles/a6: one steward stopped a member's old plain grant and so wiped the steward grant beside it).
        let needed = f.circle.removal_needed;
        let removals: Vec<(&str, &str, bool)> = ended
            .iter()
            .flat_map(|(j, ends)| {
                let quorum = quorum(ends.iter().filter(|s| !s.leave).map(|s| s.by.as_str()), needed);
                ends.iter().filter(|s| !s.leave).map(move |s| (j.who.as_str(), hash_of(s.block), quorum))
            })
            .collect();
        ended.retain(|(j, _)| {
            let guarded = j.roles.iter().any(|r| f.guarded(r));
            !removals.iter().any(|(who, r, quorum)| {
                *who == j.who && (*quorum || !guarded) && !f.sees(hash_of(j.inv), r) && !j.accepts.iter().any(|a| f.sees(r, hash_of(a)))
            })
        });
        // 7. Each member, by name: their cuts, then what they hold, or out. No one is in but by a joining (the founder by the founding block).
        let mut state = self.empty();
        state.members.clear();
        for who in sorted_set(ended.iter().map(|(j, _)| j.who.as_str())) {
            let who = who.as_str();
            let mine: Vec<&(&Joining, Vec<&Stop>)> = ended.iter().filter(|(j, _)| j.who == who).collect();
            cuts.extend(mine.iter().flat_map(|(j, ends)| ends.iter().map(|s| cut(j, s))));
            f.place(&mut state, who, &mine);
        }
        cuts.extend(self.remove_deaths(&mut state, beside));
        state.cuts = cuts;
        state.kept = kept;
        state.crossing = crossing;
        state
    }
    // A member's roles and grants from their live heads, sorted when more than one grant gives them (the founder's first grant is the
    // founding block itself, read like any other).
    fn member(&self, _who: &str, mut live: Vec<&Joining>) -> Member {
        live.sort_by(|a, b| cmp16(hash_of(a.inv), hash_of(b.inv)));
        let mut roles: Vec<String> = unique(live.iter().flat_map(|j| j.roles.iter()));
        let mut grants: Vec<String> = live.iter().map(|j| hash_of(j.inv).to_string()).collect();
        if live.len() > 1 {
            roles.sort_by(|a, b| cmp16(a, b));
        }
        grants.sort_by(|a, b| cmp16(a, b));
        Member { roles, grant: grants.first().cloned(), grants }
    }
    // A member who has died is out from the close (profiles/successor.md), unless it carries their membership on.
    // A death puts a member out from the close, and the close cuts like a removal (decision d2): each of their grants keeps the close
    // as its cut.
    fn remove_deaths(&self, state: &mut CircleState, beside: &[String]) -> Vec<(String, String, String)> {
        let visible = |h: &str| beside.iter().any(|b| b == h);
        let members: Vec<(String, Vec<String>)> = state.members.iter().map(|(k, m)| (k.clone(), m.grants.clone())).collect();
        let mut cuts = Vec::new();
        for (who, grants) in members {
            let keep: Vec<&str> = core::iter::once(self.id.as_str()).chain(grants.iter().map(String::as_str)).collect();
            if let Some(close) = crate::grant::closed_by(&who, &keep, self.index, &visible) {
                state.members.shift_remove(&who);
                state.removed.insert(who.clone(), None);
                cuts.extend(grants.iter().map(|g| (who.clone(), g.clone(), close.clone())));
            }
        }
        cuts
    }
    // The cut (circles.md): a block by a member whose grant ended that is neither the cut nor in the cut's causal past carries no
    // authority from the circle, whether or not it saw the stop: signed as the circle, a confirm that would add a hand, an act under a
    // grant to a role, a signal from a holder of circle#role, a removal (one in a crossing is kept only from the cut of the stop in it
    // that removes its author). Their own answers to grants are theirs, not the circle's, and are never set aside, nor is a block someone
    // outside the circle built on before the stop.
    fn void(&self, state: &CircleState) -> BTreeSet<String> {
        let read = self.index;
        let past = |h: &str| -> Past { read.get(h).map(|x| read.past_of(x)).unwrap_or_else(|| Past::empty(read)) };
        // cut: a stop cuts where it was signed. A block is beyond a cut when it is neither the stop nor in the stop's causal past (each cut's past is read once).
        let cut_pasts: BTreeMap<&str, Past> = state.cuts.iter().map(|(_, _, cut)| (cut.as_str(), past(cut))).collect();
        let beyond = |h: &str, cut: &str| h != cut && !cut_pasts[cut].contains(h);
        // What others built on stands (decision C6): a counted block by another, no member of the circle in the fold of its causal past,
        // that names the block itself (by any ref but its own `prev`: an accept of a deal, an `after` that saw it), or whose own act the
        // block accepts (the circle's yes to the outsider's transfer: a payment taken, a delivery received), and that has none of the
        // member's cuts in its causal past (it had not seen the removal). Then no cut sets the block aside: the circle is bound by what it
        // let them sign.
        let relied_on = |b: &Value, author: &str| {
            read.values().any(|o| {
                let Some(by) = rs(o, "author").filter(|a| *a != author) else { return false };
                let ho = hash_of(o);
                crate::identity::relied_on(o, b)
                    && !state.cuts.iter().any(|(m, _, cut)| m == author && (cut == ho || past(ho).contains(cut)))
                    && crate::identity::counts_in(o, read)
                    && !self.past_fold(o).members.contains_key(by)
            })
        };
        read.values()
            .filter(|b| {
                let Some(author) = rs(b, "author").filter(|a| state.cuts.iter().any(|(m, _, _)| m == a)) else { return false };
                let h = hash_of(b);
                if (type_of(b) == "grant" && !no_answers(b)) || state.kept.contains(h) {
                    return false;
                }
                let at = self.past_fold(b);
                let Some(member) = at.members.get(author) else { return false };
                state.cuts.iter().any(|(m, g, cut)| {
                    m == author && member.grants.contains(g) && beyond(h, cut) && !state.crossing.contains(&(h.to_string(), cut.clone()))
                }) && !relied_on(b, author)
            })
            .map(|b| hash_of(b).to_string())
            .collect()
    }
}

/// One fold of a set of a circle's blocks, with the causal past of each (every block it is asked about is in the set).
struct Fold<'b> {
    circle: &'b Circle<'b>,
    set: &'b [Value],
    pasts: BTreeMap<&'b str, Past<'b>>,
    powers: Vec<String>,
    /// The blocks of the set that name a hash in `answers`, and in `updates`, by their place in the set (read once, so no step
    /// scans the set for each grant).
    answering: BTreeMap<&'b str, Vec<usize>>,
    updating: BTreeMap<&'b str, Vec<usize>>,
}

// The blocks of a set that name each hash under a ref, by their place in the set.
fn naming<'b>(set: &'b [Value], key: &str) -> BTreeMap<&'b str, Vec<usize>> {
    let mut out: BTreeMap<&'b str, Vec<usize>> = BTreeMap::new();
    for (i, b) in set.iter().enumerate() {
        for h in list(rf(b, key)) {
            let at = out.entry(h).or_default();
            if at.last() != Some(&i) {
                at.push(i);
            }
        }
    }
    out
}

impl<'b> Fold<'b> {
    // The blocks of the set that name any of these hashes under `answers` (or `updates`), in the set's order.
    fn named_by(&self, hashes: &[&str], updates: bool) -> Vec<&'b Value> {
        self.named_in(hashes, &[if updates { &self.updating } else { &self.answering }])
    }
    fn named_in(&self, hashes: &[&str], maps: &[&BTreeMap<&'b str, Vec<usize>>]) -> Vec<&'b Value> {
        let mut at: Vec<usize> = maps.iter().flat_map(|map| hashes.iter().filter_map(|h| map.get(h)).flatten().copied()).collect();
        at.sort_unstable();
        at.dedup();
        at.into_iter().map(|i| &self.set[i]).collect()
    }
    fn sees(&self, later: &str, earlier: &str) -> bool {
        self.pasts.get(later).is_some_and(|p| p.contains(earlier))
    }
    // Whether a member holds a power in the fold of a block's causal past.
    fn holds(&self, who: &str, power: &str, at: &Value) -> bool {
        let c = self.circle;
        c.past_fold(at).members.get(who).and_then(|m| roles_at(m, at, c.index)).is_some_and(|roles| holds_power(&c.roles, &roles, power))
    }
    // Of these blocks, those no other sees (the last).
    fn latest<'v>(&self, among: &[&'v Value]) -> Vec<&'v Value> {
        among.iter().copied().filter(|v| !among.iter().any(|o| hash_of(o) != hash_of(v) && self.sees(hash_of(o), hash_of(v)))).collect()
    }
    // An open member grant (no refs.to) carries no power: one that names a role with sign, admit or remove counts for nothing, and so
    // does a change of it that does (circles.md, Membership).
    fn powerless(&self, open: bool, b: &Value) -> bool {
        !open || !self.powers.iter().any(|p| holds_power(&self.circle.roles, &roles_of(b), p))
    }
    // The founding block: the founder's first member grant, accepted by being written (circles.md, The founder).
    fn founding(&self, b: &Value) -> bool {
        hash_of(b) == self.circle.id
    }
    // A grant open to anyone who accepts it: no refs.to (the founding block names its one member, the founder).
    fn open(&self, inv: &Value) -> bool {
        rf(inv, "to").is_none() && !self.founding(inv)
    }
    // The role names a version lists: the founding block gives the first role.
    fn listed(&self, v: &Value) -> Vec<String> {
        if self.founding(v) {
            return self.circle.roles.first().map(|(n, _)| vec![n.clone()]).unwrap_or_default();
        }
        roles_of(v)
    }
    // Powers narrow as they pass: a block gives a role only when its signer holds, in the fold of its causal past, every power the role
    // carries (circles.md, Membership). The founding block gives the first role by the circle itself.
    fn may_give(&self, v: &Value, role: &str) -> bool {
        self.founding(v)
            || self.circle.roles.iter().filter(|(n, _)| n == role).all(|(_, p)| p.iter().all(|x| self.holds(&author_of(v), x, v)))
    }
    // 1. The invitations: the founding block, and member grants signed as the circle by a holder of `admit` in the fold of their causal
    // past.
    fn invitations(&self) -> Vec<&'b Value> {
        let id = self.circle.id.as_str();
        self.set.iter()
            .filter(|b| no_answers(b) && list(rf(b, "updates")).is_empty() && st(b, "status").is_none())
            .filter(|b| self.founding(b) || (rs(b, "as") == Some(id) && self.powerless(self.open(b), b) && self.holds(&author_of(b), "admit", b)))
            .collect()
    }
    // 2. An invitation's versions: a change updates the grant or an earlier change of it, signed as the circle by a holder of admit;
    // all are the same grant (circles.md). The base first; the changes are a set, read by causal order alone.
    fn versions(&self, inv: &'b Value) -> Vec<&'b Value> {
        let (id, open) = (self.circle.id.as_str(), self.open(inv));
        let mut chain = vec![inv];
        loop {
            let known = |h: &str| chain.iter().any(|v| hash_of(v) == h);
            let hashes: Vec<&str> = chain.iter().map(|v| hash_of(v)).collect();
            let next: Vec<&Value> = self.named_by(&hashes, true).into_iter()
                .filter(|u| !known(hash_of(u)) && st(u, "status").is_none() && no_answers(u))
                .filter(|u| matches!(st(u, "roles"), Some(Value::Array(_))) && self.powerless(open, u))
                .filter(|u| list(rf(u, "updates")).iter().any(|h| known(h)))
                .filter(|u| rs(u, "as") == Some(id) && self.holds(&author_of(u), "admit", u))
                .collect();
            if next.is_empty() {
                return chain;
            }
            chain.extend(next);
        }
    }
    // A member's acceptances of a version. The founder accepted the founding block by writing it.
    fn accepts(&self, v: &Value, who: &str) -> Vec<&'b Value> {
        if self.founding(v) {
            return if who == self.circle.founder { self.set.iter().filter(|b| self.founding(b)).collect() } else { vec![] };
        }
        self.named_by(&[hash_of(v)], false).into_iter().filter(|a| ss(a, "status") == Some("accepted") && rs(a, "author") == Some(who)).collect()
    }
    // Who joined by an invitation: the one it names, or, for an open grant (no refs.to), everyone who accepts it. A `to` that
    // names a set of ids names no one (authority.md).
    fn joiners(&self, inv: &Value) -> Vec<String> {
        if self.founding(inv) {
            return vec![self.circle.founder.clone()];
        }
        match rf(inv, "to") {
            Some(to) => to.as_str().filter(|t| !self.accepts(inv, t).is_empty()).map(String::from).into_iter().collect(),
            None => {
                sorted_set(self.named_by(&[hash_of(inv)], false).into_iter().filter(|a| ss(a, "status") == Some("accepted")).map(author_of))
            }
        }
    }
    // 2-4. Each member's joining by each invitation, and the joinings that never were: a standing stop that saw none of the member's
    // accepts comes before the answer, whichever a reader meets first, and the member never joined by that grant (its removals still
    // cross). A stop that does not stand on its own (step 3) changes nothing.
    fn joinings(&self, invitations: &[&'b Value]) -> (Vec<Joining<'b>>, Vec<Joining<'b>>) {
        let (mut joined, mut early) = (Vec::new(), Vec::new());
        for &inv in invitations {
            let chain = self.versions(inv);
            let joiners = self.joiners(inv);
            for who in &joiners {
                let mine = self.accepts(inv, who);
                let stops = self.judge(inv, &chain, who, &mine, self.stops(inv, &chain, &joiners, who));
                if stops.iter().any(|s| s.stands && !self.saw_any(s, &mine)) {
                    early.push(Joining { inv, who: who.clone(), accepts: vec![], roles: vec![], stops });
                } else if !mine.is_empty() {
                    joined.push(Joining { inv, who: who.clone(), accepts: crate::order::earliest(&mine, self.circle.index), roles: self.roles(inv, &chain, who, false), stops });
                }
            }
        }
        (joined, early)
    }
    fn saw_any(&self, s: &Stop, accepts: &[&Value]) -> bool {
        accepts.iter().any(|a| self.sees(hash_of(s.block), hash_of(a)))
    }
    // 3. Every stop of a version that names this member: their own (an answer that stops or declines, or a stop they sign: leaving,
    // whatever they hold: no power, no quorum, no crossing), or a removal signed as the circle by a holder of `remove` (an open grant's
    // joiner who stops it ends it for themselves alone, whatever they hold).
    fn stops(&self, inv: &Value, chain: &[&Value], joiners: &[String], who: &str) -> Vec<Stop<'b>> {
        let open_joiner = |by: &str| self.open(inv) && joiners.iter().any(|j| j == by);
        // A remover's stop of an open grant (decision H12): with no `refs.to` it ends only the joins it has not seen (no one joins by it
        // after), and every member who joined by it stays; naming a joiner in `refs.to`, it removes that joiner, by the circle's removal
        // rule. A `refs.to` that is not one id names no one.
        let mine = self.accepts(inv, who);
        let reaches = |b: &Value| {
            !self.open(inv)
                || match rf(b, "to") {
                    None => !mine.iter().any(|a| self.sees(hash_of(b), hash_of(a))),
                    Some(t) => t.as_str() == Some(who),
                }
        };
        let hashes: Vec<&str> = chain.iter().map(|v| hash_of(v)).collect();
        self.named_in(&hashes, &[&self.answering, &self.updating]).into_iter()
            .filter_map(|b| {
                let by = author_of(b);
                let ended = chain.iter().filter_map(|v| ending(b, hash_of(v))).collect::<Vec<_>>();
                let updates = ended.contains(&End::Stop);
                let leave = by == who && !ended.is_empty();
                let removal = updates && by != who && rs(b, "as") == Some(self.circle.id.as_str()) && !open_joiner(&by) && reaches(b) && self.holds(&by, "remove", b);
                (leave || removal).then_some(Stop { block: b, by, leave, stands: true })
            })
            .collect()
    }
    // Whether a role carries admit or remove: taking it away is like a removal (circles.md, The removal rule).
    fn guarded(&self, role: &str) -> bool {
        self.circle.roles.iter().any(|(n, p)| n == role && p.iter().any(|x| x == "admit" || x == "remove"))
    }
    // The roles a member holds by an invitation: roles taken away count at once; a role added counts once the member accepts that
    // change (`assume`: as if they accepted every change). A change starts from the roles held at the changes it saw (those that no
    // other it saw follows), and keeps a role only where every one of them holds it; the member holds what every last change holds.
    // A role that carries admit or remove is taken away only once `removal.needed` different holders of remove have each made a change
    // that drops it (one that lists it not, having seen a version that lists it). No order of changes that do not see each other is
    // read.
    fn roles(&self, inv: &Value, chain: &[&'b Value], who: &str, assume: bool) -> Vec<String> {
        let meet = |held: &[(&str, Vec<String>)], at: &[&Value]| -> Vec<String> {
            let sets: Vec<&Vec<String>> = held.iter().filter(|(h, _)| at.iter().any(|v| hash_of(v) == *h)).map(|(_, r)| r).collect();
            sets.first().map(|f| f.iter().filter(|r| sets.iter().all(|s| s.contains(r))).cloned().collect()).unwrap_or_default()
        };
        let dropped = |role: &str| -> bool {
            let by = chain
                .iter()
                .filter(|v| hash_of(v) != hash_of(inv) && !self.listed(v).iter().any(|r| r == role))
                .filter(|v| chain.iter().any(|u| hash_of(u) != hash_of(v) && self.sees(hash_of(v), hash_of(u)) && self.listed(u).iter().any(|r| r == role)))
                .filter(|v| self.holds(&author_of(v), "remove", v))
                .map(|v| author_of(v));
            quorum(by, self.circle.removal_needed)
        };
        let mut held: Vec<(&str, Vec<String>)> = Vec::new();
        let mut order = chain.to_vec();
        order.sort_by_key(|v| self.pasts[hash_of(v)].len());
        for v in order {
            let roles = if hash_of(v) == hash_of(inv) {
                self.listed(inv).into_iter().filter(|r| self.may_give(inv, r)).collect()
            } else {
                let seen: Vec<&Value> = chain.iter().copied().filter(|u| hash_of(u) != hash_of(v) && self.sees(hash_of(v), hash_of(u))).collect();
                let before = meet(&held, &self.latest(&seen));
                let ack = assume || !self.accepts(v, who).is_empty();
                let listed = self.listed(v);
                // a role kept is not given; a role added counts once accepted, and only if its changer holds every power it carries
                let mut roles: Vec<String> = listed.iter().filter(|r| before.contains(r) || (ack && self.may_give(v, r))).cloned().collect();
                roles.extend(before.iter().filter(|r| !listed.contains(r) && self.guarded(r) && !dropped(r)).cloned());
                roles
            };
            held.push((hash_of(v), roles));
        }
        let last = self.latest(chain);
        let mut roles = meet(&held, &last);
        if last.len() > 1 {
            roles.sort_by(|a, b| cmp16(a, b));
        }
        roles
    }
    // 3. Which stops stand on their own. A removal of a holder of admit or remove stands with `removal.needed` different holders of
    // remove stopping that same grant (whether they hold it is read in the fold of the stop's causal past), and so does a stop that saw
    // none of the member's accepts of a grant that gives admit or remove (as if they had accepted every version the stop has seen). A
    // leaving always stands.
    fn judge(&self, inv: &Value, chain: &[&'b Value], who: &str, mine: &[&Value], mut stops: Vec<Stop<'b>>) -> Vec<Stop<'b>> {
        let quorum = quorum(stops.iter().filter(|s| !s.leave).map(|s| s.by.as_str()), self.circle.removal_needed);
        for s in &mut stops {
            let gives = || {
                let seen: Vec<&Value> = chain.iter().copied().filter(|v| self.sees(hash_of(s.block), hash_of(v))).collect();
                !seen.is_empty() && self.roles(inv, &seen, who, true).iter().any(|r| self.guarded(r))
            };
            s.stands = s.leave || quorum || !(self.holds(who, "admit", s.block) || self.holds(who, "remove", s.block) || (!self.saw_any(s, mine) && gives()));
        }
        stops
    }
    // The crossings a standing removal is in: rings of standing removals, each removing the author of the next, that come back to its
    // own author, no stop of a ring seeing another (two removers each removing the other is a ring of two). Each ring lists its stops,
    // this one first.
    fn rings<'r>(&self, rivals: &[(&'r str, &'r Stop<'b>)], j: &'r Joining<'b>, s: &'r Stop<'b>) -> Vec<Vec<&'r Stop<'b>>> {
        let mut out = Vec::new();
        if s.stands && !s.leave {
            self.walk(rivals, &j.who, &s.by, &mut vec![s], &mut vec![s.by.as_str(), j.who.as_str()], &mut out);
        }
        out
    }
    fn walk<'r>(&self, rivals: &[(&'r str, &'r Stop<'b>)], at: &str, home: &str, path: &mut Vec<&'r Stop<'b>>, nodes: &mut Vec<&'r str>, out: &mut Vec<Vec<&'r Stop<'b>>>) {
        let apart = |x: &Stop, y: &Stop| !self.sees(hash_of(x.block), hash_of(y.block)) && !self.sees(hash_of(y.block), hash_of(x.block));
        for &(m, x) in rivals {
            if x.by != at || path.iter().any(|p| hash_of(p.block) == hash_of(x.block) || !apart(p, x)) {
                continue;
            }
            if m == home {
                let mut ring = path.clone();
                ring.push(x);
                out.push(ring);
            } else if !nodes.contains(&m) {
                path.push(x);
                nodes.push(m);
                self.walk(rivals, m, home, path, nodes, out);
                path.pop();
                nodes.pop();
            }
        }
    }
    // Whether a stop ends its grant: it stands (decision D13: every removal in a ring stands, so no crossing comes after a removal and no
    // member, the founder included, is immune; the ring only keeps each of its stops from the cut of the one before).
    fn ends(&self, s: &Stop) -> bool {
        s.stands
    }
    // 6. One member: what their heads give them, or the stop that put them out. A grant is superseded once the member accepted
    // another having seen any acceptance of it (a second acceptance of a grant they hold makes nothing new): no acceptance is chosen
    // by its hash.
    fn place(&self, state: &mut CircleState, who: &str, mine: &[&(&Joining, Vec<&Stop>)]) {
        let superseded = |j: &Joining| {
            mine.iter().any(|(o, _)| hash_of(o.inv) != hash_of(j.inv) && o.accepts.iter().any(|ao| j.accepts.iter().any(|ai| self.sees(hash_of(ao), hash_of(ai)))))
        };
        let heads: Vec<&&(&Joining, Vec<&Stop>)> = mine.iter().filter(|(j, _)| !superseded(j)).collect();
        let live: Vec<&Joining> = heads.iter().filter(|(_, ends)| ends.is_empty()).map(|(j, _)| *j).collect();
        if !live.is_empty() {
            state.members.insert(who.to_string(), self.circle.member(who, live));
            return;
        }
        // Out (a circle reads no counted_to, so removed names none).
        if !heads.is_empty() {
            state.removed.insert(who.to_string(), None);
        }
    }
}

/// A circle's member grants that count (with seq, or as their author's history), and every grant that answers or updates one of
/// them (an acceptance, a leaving, a stop): it need carry no `kind` or `subject` of its own.
fn member_grants(root: &Value, read: &Index) -> Vec<Value> {
    let id = hash_of(root);
    // The founding block is the founder's first member grant (circles.md, The founder): it is read with the member grants, and every
    // grant that answers or updates it is a change, a leaving or a stop of the founder's membership.
    let mut related: Vec<Value> = core::iter::once(root.clone())
        .chain(read.values().filter(|b| {
            type_of(b) == "grant" && ss(b, "kind") == Some("member") && list(rf(b, "subject")).contains(&id) && crate::identity::counts_in(b, read)
        }).cloned())
        .collect();
    loop {
        let known: Vec<String> = related.iter().map(|b| hash_of(b).to_string()).collect();
        let more: Vec<Value> = read
            .values()
            .filter(|b| {
                type_of(b) == "grant"
                    && !known.iter().any(|k| k == hash_of(b))
                    && list(rf(b, "answers")).iter().chain(list(rf(b, "updates")).iter()).any(|h| known.iter().any(|k| k == h))
                    && crate::identity::counts_in(b, read)
            })
            .cloned()
            .collect();
        if more.is_empty() {
            return related;
        }
        related.extend(more);
    }
}

/// A circle's members and roles from its member grants (already read), optionally only within a block's causal past.
pub fn circle_state_in(circle: &str, read: &Index, within: Option<&Value>) -> Option<CircleState> {
    // A circle is an actor of kind circle (circles.md): any other block has no circle state.
    let root = read.get(circle).filter(|r| type_of(r) == "actor" && ss(r, "kind") == Some("circle"))?;
    // Within a block whose causal past does not hold the circle, there is no circle yet (folds.md).
    let within = within.map(|w| read.get(hash_of(w)).unwrap_or(w));
    // a block no node would take on what it rests on is in no circle's time: there is none within it (folds.md: a fold reads only valid blocks)
    if within.is_some_and(|w| !read.contains_key(hash_of(w)) && !crate::js::readable(w, read)) {
        return None;
    }
    if within.is_some_and(|w| !read.past_of(w).contains(circle)) {
        return None;
    }
    let related = member_grants(root, read);
    // The fold reads the stops, sets aside the blocks outside a cut (Circle::void), and reads the grants again, until what it sets
    // aside no longer changes (a removal set aside gives its member back their blocks).
    let mut void: BTreeSet<String> = Default::default();
    let mut circle = Circle::new(root, read, related.clone());
    let mut state = circle.fold_all();
    let mut tried: Vec<BTreeSet<String>> = Vec::new();
    loop {
        let next = circle.void(&state);
        if next == void || tried.contains(&next) {
            break;
        }
        tried.push(core::mem::replace(&mut void, next));
        circle = Circle::new(root, read, related.iter().filter(|b| !void.contains(hash_of(b))).cloned().collect());
        state = circle.fold_all();
    }
    let mut out = within.map_or(state, |w| circle.past_fold(w));
    out.void = void;
    Some(out)
}

/// A circle's members and roles (protocol.md §8, §11). A member grant counts if signed as the circle by someone holding
/// admin in the fold of its own causal past; a member holds its roles once their own answer accepts it; roles taken
/// away count at once, roles added once answered. `within`: fold only that block's causal past.
pub fn circle_state(circle: &str, blocks: &[Value], within: Option<&Value>) -> Option<CircleState> {
    circle_state_in(circle, &read_all(blocks), within)
}

/// The holders of a role in a circle (the members holding it), sorted.
pub fn holders_of(state: Option<&CircleState>, role: &str) -> Vec<String> {
    let Some(state) = state else { return vec![] };
    sorted_set(state.members.iter().filter(|(_, m)| m.roles.iter().any(|r| r == role)).map(|(k, _)| k))
}

pub(crate) fn may_act_as_in(block: &Value, circle: &str, read: &Index, role: Option<&str>) -> bool {
    may_with_in(block, circle, read, role, "sign")
}

// Whether the block's author, in the circle's fold of the block's causal past, holds `role` if one is named (a grant to a
// role), else, for a block signed `as` the circle, a role with the power. A block outside a cut of its author's ended grant
// holds nothing (circles.md, The cut).
pub(super) fn may_with_in(block: &Value, circle: &str, read: &Index, role: Option<&str>, power: &str) -> bool {
    // a block that rests on blocks not held is not read yet
    if !crate::js::unmet_in(block, read).is_empty() {
        return false;
    }
    if role.is_none() && rs(block, "as") != Some(circle) {
        return false;
    }
    let Some(roles) = roles_then(block, circle, read) else { return false };
    match role {
        Some(r) => roles.iter().any(|x| x == r),
        None => {
            let root = &read[circle];
            if !holds_power(&roles_table(root), &roles, power) {
                return false;
            }
            // Where the circle needs N holders of sign, N different holders sign the block: its author, and holders who confirm
            // it, each holding the power in the fold of their own block's past (`needed` is for sign alone).
            let stated = get(root, "state.needed.sign");
            // `needed.sign: "all"` (folds.md, Counts): every current holder of sign, counted in the fold of the block's causal past
            let needed = if power != "sign" {
                1.0
            } else if stated.and_then(Value::as_str) == Some("all") {
                circle_state_in(circle, read, Some(block))
                    .map(|st| st.members.values().filter(|m| roles_at(m, block, read).is_some_and(|r| holds_power(&roles_table(root), &r, power))).count() as f64)
                    .unwrap_or(1.0)
            } else if let Some((p, q)) = stated.and_then(|x| x.get("of_members")).and_then(Value::as_str).and_then(crate::bound::share_of_members) {
                // `needed.sign: { of_members: "2/3" }` (folds.md, Counts): that share of the members in the fold of the block's causal past, rounded up
                let members = circle_state_in(circle, read, Some(block)).map(|st| st.members.values().filter(|m| roles_at(m, block, read).is_some()).count() as u64).unwrap_or(0);
                ((members * p).div_ceil(q)).max(1) as f64
            } else {
                int(stated).unwrap_or(1.0)
            };
            let own = core::iter::once(rs(block, "author").unwrap_or(""));
            let confirmers = read.values().filter(|c| list(rf(c, "confirms")).contains(&hash_of(block))).filter_map(|c| {
                // each confirmer holds the power in the fold of their confirm's past, with no quorum of its own
                (crate::identity::counts_in(c, read) && roles_then(c, circle, read).is_some_and(|r| holds_power(&roles_table(root), &r, power))).then(|| rs(c, "author")).flatten()
            });
            quorum(own.chain(confirmers), Some(needed))
        }
    }
}

// The roles a block's author holds in the circle's fold of the block's causal past: None when they are no member then, or the
// block is outside a cut of theirs (circles.md, The cut).
fn roles_then(block: &Value, circle: &str, read: &Index) -> Option<Vec<String>> {
    let mut state = circle_state_in(circle, read, Some(block))?;
    if state.void.contains(hash_of(block)) {
        return None;
    }
    state.members.shift_remove(rs(block, "author")?).and_then(|m| roles_at(&m, block, read))
}

/// Whether a block may be signed as a circle: its author holds, in the fold of its causal past, `role` if one is
/// named, else a role with the power `sign`.
pub fn may_act_as(block: &Value, circle: &str, blocks: &[Value], role: Option<&str>) -> bool {
    may_act_as_in(block, circle, &read_all(blocks), role)
}

/// Who a circle (or `circle#role`) in a block's audience means: the members (or holders) in the fold of the circle's
/// grants within that block's causal past. A name with more than one `#`, or an empty part, means no one.
pub fn members_then(block: &Value, recipient: &str, blocks: &[Value]) -> Vec<String> {
    let circle = recipient.split_once('#').map_or(recipient, |(c, _)| c);
    let index = crate::js::held_index(blocks);
    if !index.contains_key(circle) {
        return vec![];
    }
    let read = read_all(index.values());
    if !read.contains_key(hash_of(block)) && !crate::js::readable(block, &read) {
        return vec![];
    }
    if recipient.contains('#') {
        return holds_then(block, recipient, &read).unwrap_or_default();
    }
    let Some(state) = circle_state_in(circle, &read, Some(block)) else { return vec![] };
    let void_author = rs(block, "author").filter(|_| state.void.contains(hash_of(block)));
    sorted_set(state.members.iter().filter(|(k, m)| Some(k.as_str()) != void_author && roles_at(m, block, &read).is_some()).map(|(k, _)| k))
}

/// Who a name means at a block: an id is itself; `circle#role` (one `#`, neither part empty) is the holders of the role in the
/// circle's fold of the block's causal past, less the block's author when the block is outside a cut of theirs (circles.md, The
/// cut). Any other name means no one (None).
pub(crate) fn holds_then(block: &Value, name: &str, read: &Index) -> Option<Vec<String>> {
    match name.split_once('#') {
        None => Some(vec![name.to_string()]),
        Some((circle, role)) if !circle.is_empty() && !role.is_empty() && !role.contains('#') => {
            let state = circle_state_in(circle, read, Some(block))?;
            let mut out = holders_of(Some(&state), role);
            if state.void.contains(hash_of(block)) {
                out.retain(|h| Some(h.as_str()) != rs(block, "author"));
            }
            // a holder whose grant giving the role ended at or before the block's date holds it no more there (decision H11)
            out.retain(|h| state.members.get(h).and_then(|m| roles_at(m, block, read)).is_some_and(|r| r.iter().any(|x| x == role)));
            Some(out)
        }
        _ => None,
    }
}
