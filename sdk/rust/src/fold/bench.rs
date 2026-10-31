//! The bench of a deal (promises.md, Disputes): who may rule on it, and what they have said.
use super::holds_then;
use crate::js::{count_stated, get, hash_of, list, quorum, rf, rs, ss, st, type_of};
use crate::order::sees_in;
use crate::prelude::*;

// Who rules a deal (promises.md, Disputes): the confirmers the deal's schema names in its grounds, in order, and a referee both sides named
// for the deal by a grant one signed and the other accepted; less any name that is a side.
pub(super) struct Bench<'b> {
    pub(super) names: Vec<String>,
    // how many names must agree: the schema's `grounds.needed` (a deal naming several confirmers states it, decision E3); one name needs
    // no number. The protocol keeps no default: more than one name and no number stated (a judge named later beside one confirmer) is
    // None, and no ruling counts until both sides sign a number (decision H2)
    pub(super) needed: Option<f64>,
    // with `grounds.wait`, the names are a chain: each one after the first is the backup of the one before, from the signed receipt of
    // the dispute by the name before it (decision E1)
    pub(super) wait: Option<String>,
    pub(super) sides: Vec<String>,
    // the binding accept: what the sides agreed to where the deal bound
    pub(super) bound: Option<&'b Value>,
}

impl Bench<'_> {
    // A side alone never rules, nor confirms (invariant 13): not its own block, whatever name it holds, nor a block that speaks for a side
    // (signed `as` a side's circle, or under a side's grant). A referee both sides signed for counts even when tied to a side (a member of a
    // side's circle, an autonomous system a side runs): the tie is a fact the stage shows (`referee_ties`), for each reader to weigh
    // (decision H9).
    pub(super) fn sided(&self, o: &Value, index: &crate::js::Index) -> bool {
        let Some(author) = rs(o, "author") else { return true };
        self.sides.iter().any(|s| s == author) || super::speaker_of(o, index, None).is_some_and(|w| self.sides.contains(&w))
    }
    // Each name's ties to a side, read from the blocks held (decision H9): a role inside a side's circle (`role`), a member of a side's
    // circle (`member`), an autonomous system a side runs (`operator`: a side's live operator grant naming it). Facts beside the stage.
    pub(super) fn ties(&self, sides: &[(&'static str, Option<String>)], index: &crate::js::Index) -> Vec<Value> {
        let mut out: Vec<(String, &'static str, &'static str)> = Vec::new();
        for n in &self.names {
            for (side, who) in sides {
                let Some(who) = who.as_deref() else { continue };
                if n.split_once('#').is_some_and(|(c, _)| c == who) {
                    out.push((n.clone(), side, "role"));
                    continue;
                }
                if n.contains('#') {
                    continue;
                }
                if super::circle_state_in(who, index, None).is_some_and(|c| c.members.contains_key(n.as_str())) {
                    out.push((n.clone(), side, "member"));
                }
                if crate::identity::operators_in(n, index).iter().any(|op| op == who) {
                    out.push((n.clone(), side, "operator"));
                }
            }
        }
        out.sort_by(|a, b| crate::js::cmp16(&a.0, &b.0).then(a.1.cmp(b.1)).then(a.2.cmp(b.2)));
        out.dedup();
        out.into_iter().map(|(r, side, how)| json!({ "referee": r, "side": side, "how": how })).collect()
    }
    // Whether a counted block speaks for one name: its author is the id, or holds the role where the block stands, by no grant a side
    // signed (in its own name, or `as` a side's circle) that the binding accept had not seen: a side never rules through someone it
    // appointed after the deal bound (decision H9).
    pub(super) fn speaks_for(&self, o: &Value, name: &str, index: &crate::js::Index) -> bool {
        let Some(author) = rs(o, "author") else { return false };
        let holds = holds_then(o, name, index).is_some_and(|ids| ids.iter().any(|h| h == author));
        let appointed = name.split_once('#').is_some_and(|(circle, _)| {
            super::circle_state_in(circle, index, Some(o))
                .and_then(|c| c.members.get(author).map(|m| m.grants.clone()))
                .unwrap_or_default()
                .iter()
                .any(|g| {
                    index.get(g.as_str()).is_some_and(|g| ["author", "as"].iter().any(|k| rs(g, k).is_some_and(|a| self.sides.iter().any(|s| s == a))))
                        && self.bound.is_none_or(|b| !sees_in(b, g, index))
                })
        });
        crate::identity::counts_in(o, index) && holds && !appointed && !self.sided(o, index)
    }
    pub(super) fn named(&self, o: &Value, index: &crate::js::Index) -> bool {
        self.names.iter().any(|n| self.speaks_for(o, n, index))
    }
    // One name's word on a block: false when a defeats of it by the name is not in the causal past of a confirms of it by the same name
    // (it changed its ruling), true when it confirms it, None when it has said nothing.
    pub(super) fn voice(&self, name: &str, h: &str, index: &crate::js::Index) -> Option<bool> {
        self.voice_since(name, h, None, index)
    }
    // The same, counting only the words the name dated (its `at`) at or after `since` (a backup's turn starts there).
    pub(super) fn voice_since(&self, name: &str, h: &str, since: Option<i64>, index: &crate::js::Index) -> Option<bool> {
        let dated = |o: &Value| since.is_none_or(|t| ss(o, "at").and_then(crate::time::parse).is_some_and(|at| at >= t));
        let words = |verb: &str| -> Vec<&Value> { index.values().filter(|o| list(rf(o, verb)).contains(&h) && self.speaks_for(o, name, index) && dated(o)).collect() };
        let (yes, no) = (words("confirms"), words("defeats"));
        if no.iter().any(|d| !yes.iter().any(|c| sees_in(c, hash_of(d), index))) {
            Some(false)
        } else if !yes.is_empty() {
            Some(true)
        } else {
            None
        }
    }
    // A name's own signed receipt of a dispute of a block (decision E1, the D12 receipt): a counted `observe` of kind receipt that
    // `derives_from` the dispute, whose `state.answer` is a push answer from the name's node (its `node` the name, or a holder of the
    // role where the receipt stands), signed by a key that speaks for that node, listing the dispute as taken. Its `at` is when the name
    // was asked, the same on every node: the earliest such time over the block's disputes.
    pub(super) fn asked_at(&self, name: &str, disputes: &[String], index: &crate::js::Index) -> Option<String> {
        receipts_of(disputes, index, |o, node| if name.contains('#') { holds_then(o, name, index).is_some_and(|ids| ids.iter().any(|h| h == node)) } else { node == name })
            .into_iter()
            .filter_map(|(_, at)| Some((crate::time::parse(&at)?, at)))
            .min()
            .map(|(_, text)| text)
    }
    // The names whose word counts on a block, each with the time from which its words count: every name, from any time; with a `wait`,
    // the first, and each backup after it once every name before it has said nothing on the block, counting only its words dated at or
    // after the wait has run from the name before it's own receipt of a side's dispute of the block. Signed times alone: no clock, the
    // same on every node.
    pub(super) fn turn(&self, h: &str, disputes: &dyn Fn(&str) -> Vec<String>, index: &crate::js::Index) -> Vec<(&String, Option<i64>)> {
        let Some(wait) = &self.wait else { return self.names.iter().map(|n| (n, None)).collect() };
        let mut out: Vec<(&String, Option<i64>)> = Vec::new();
        for (i, n) in self.names.iter().enumerate() {
            if i == 0 {
                out.push((n, None));
                continue;
            }
            if out.iter().any(|(m, since)| self.voice_since(m, h, *since, index).is_some()) {
                break;
            }
            let Some(asked) = self.asked_at(&self.names[i - 1], &disputes(h), index) else { break };
            let Some(since) = crate::time::add_duration(&asked, wait, 1).and_then(|t| crate::time::parse(&t)) else { break };
            out.push((n, Some(since)));
        }
        out
    }
    // The ruling on a block: false or true once as many names as are needed say so (a chain: the first name in turn that has spoken),
    // None while they have not.
    pub(super) fn ruling(&self, h: &str, disputes: &dyn Fn(&str) -> Vec<String>, index: &crate::js::Index) -> Option<bool> {
        let voices: Vec<Option<bool>> = self.turn(h, disputes, index).into_iter().map(|(n, since)| self.voice_since(n, h, since, index)).collect();
        if self.wait.is_some() {
            return voices.into_iter().flatten().next();
        }
        let said = |w: bool| quorum(voices.iter().enumerate().filter(|(_, v)| **v == Some(w)).map(|(i, _)| i), self.needed);
        if said(false) {
            Some(false)
        } else if said(true) {
            Some(true)
        } else {
            None
        }
    }
}

// receipt_of(X, node): a node's signed push answer listing X as taken (decision D12, E1): a counted `observe` of kind receipt that
// `derives_from` one of `targets`, whose `state.answer` is from a node `node_ok` accepts (given the receipt), lists that target as taken,
// and is signed by a key that speaks for the node. Each is returned with the answer's `at`, the time the node took it.
pub(super) fn receipts_of<'a>(targets: &[String], index: &'a crate::js::Index, node_ok: impl Fn(&Value, &str) -> bool) -> Vec<(&'a Value, String)> {
    index
        .values()
        .filter(|o| type_of(o) == "observe" && ss(o, "kind") == Some("receipt") && crate::identity::counts_in(o, index))
        .filter_map(|o| {
            let a = st(o, "answer")?;
            let node = a.get("node").and_then(Value::as_str)?;
            let target = list(rf(o, "derives_from")).into_iter().find(|d| targets.iter().any(|x| x == d))?;
            let taken = a.get("taken").and_then(Value::as_array).is_some_and(|t| t.iter().any(|x| x.as_str() == Some(target)));
            let keys: Vec<String> = crate::identity::identity_in(node, index, None).keys.iter().filter(|k| !k.void && !k.frozen).map(|k| k.key.clone()).collect();
            let at = a.get("at").and_then(Value::as_str)?;
            (taken && node_ok(o, node) && crate::sync::answer_signed_by(a, &keys)).then(|| (o, at.to_string()))
        })
        .collect()
}

// The bench of a deal whose bound offer names `schema`, between `sides`, bound at `bound`, with the referees both sides named (`judges`).
pub(super) fn bench<'b>(schema: Option<&Value>, sides: Vec<String>, judges: Vec<String>, bound: Option<&'b Value>) -> Bench<'b> {
    let grounds = schema.and_then(|s| get(s, "state.grounds"));
    // A side is never its own deal's referee: a name that is a side adds nothing. A role inside a side's circle stays, its tie shown
    // (decision H9).
    let not_a_side = |who: &String| !sides.iter().any(|s| s == who);
    let mut names: Vec<String> = Vec::new();
    let listed = grounds.and_then(|g| g.get("confirmers")).and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str).map(String::from);
    for n in listed.chain(judges).filter(|n| not_a_side(n)) {
        if !names.contains(&n) {
            names.push(n);
        }
    }
    // No default in the protocol (decisions E3, H2): the number the schema states; one name needs none (its plain meaning); more than one
    // and no number stated is no number, and nothing they say rules (a judge named later beside one confirmer, until both sides sign one).
    let needed = count_stated(grounds.and_then(|g| g.get("needed")), None).or((names.len() <= 1).then_some(1.0));
    let wait = grounds.and_then(|g| g.get("wait")).and_then(Value::as_str).filter(|w| crate::time::parse_duration(w).is_some()).map(String::from);
    Bench { names, needed, wait, sides, bound }
}

