//! The bench of a deal (promises.md, Disputes): who may rule on it, and what they have said.
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
    // 1.9 3d-3: the clocks the grounds name (`grounds.clocks`, read as `terms.clocks` is), else None
    pub(super) clocks: Option<Value>,
    // the binding accept: what the sides agreed to where the deal bound
    #[allow(dead_code)]
    pub(super) bound: Option<&'b Value>,
}

impl Bench<'_> {
    /// The bench as a stage shows it (1.8 P12, `bench`): `{ names, needed, wait, clocks }`, or `"none"` when no name sits on it.
    pub(super) fn json(&self) -> Value {
        if self.names.is_empty() {
            return json!("none");
        }
        json!({ "names": self.names, "needed": self.needed.map(|n| n as u64), "wait": self.wait, "clocks": self.clocks })
    }
    // A side alone never rules, nor confirms (invariant 13): not its own block, whatever name it holds, nor a block that speaks for a side
    // (signed `as` a side's circle, or under a side's grant). A referee both sides signed for counts even when tied to a side (a member of a
    // side's circle, an autonomous system a side runs): the tie is a fact the stage shows (`referee_ties`), for each reader to weigh
    // (decision H9).
    pub(super) fn sided(&self, o: &Value, index: &crate::js::Index) -> bool {
        let Some(author) = rs(o, "author") else { return true };
        self.sides.iter().any(|s| s == author) || super::speaker_of(o, index, None).is_some_and(|w| self.sides.contains(&w))
    }
    // Each name's ties to a side, read from the blocks held (decision H9): a name that owns parts of a side's circle (`member`; folds.md,
    // referee_ties). Facts beside the stage.
    pub(super) fn ties(&self, sides: &[(&'static str, Option<String>)], index: &crate::js::Index) -> Vec<Value> {
        let mut out: Vec<(String, &'static str, &'static str)> = Vec::new();
        for n in &self.names {
            for (side, who) in sides {
                let Some(who) = who.as_deref() else { continue };
                // 1.9 stage 6: roles are gone; a name that owns parts of a side's circle is tied to it as `member`
                if super::circle::owners_then(who, None, index).iter().any(|o| o == n) {
                    out.push((n.clone(), side, "member"));
                }
            }
        }
        // sorted by referee, side, how, in byte order (canonical.md: text sorts by its UTF-8 bytes)
        out.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(b.1)).then(a.2.cmp(b.2)));
        out.dedup();
        out.into_iter().map(|(r, side, how)| json!({ "referee": r, "side": side, "how": how })).collect()
    }
    // Whether a counted block speaks for one name: its author is the id, by no grant a side
    // signed (in its own name, or `as` a side's circle) that the binding accept had not seen: a side never rules through someone it
    // appointed after the deal bound (decision H9).
    pub(super) fn speaks_for(&self, o: &Value, name: &str, index: &crate::js::Index) -> bool {
        let Some(author) = rs(o, "author") else { return false };
        crate::identity::counts_in(o, index) && author == name && !self.sided(o, index)
    }
    pub(super) fn named(&self, o: &Value, index: &crate::js::Index) -> bool {
        self.names.iter().any(|n| self.speaks_for(o, n, index))
    }
    // One name's words on a block: her `confirms` and `defeats` of it that count for her place.
    fn words_of<'i>(&self, name: &str, h: &str, index: &'i crate::js::Index) -> Vec<&'i Value> {
        index.values().filter(|o| (list(rf(o, "confirms")).contains(&h) || list(rf(o, "defeats")).contains(&h)) && self.speaks_for(o, name, index)).collect()
    }
    // A verdict from words on a block: false where a `defeats` has no `confirms` after it (its own name changed its ruling), true where one
    // confirms it, None where none has spoken.
    fn verdict(words: &[&Value], h: &str, index: &crate::js::Index) -> Option<bool> {
        let yes: Vec<&&Value> = words.iter().filter(|o| list(rf(o, "confirms")).contains(&h)).collect();
        let no: Vec<&&Value> = words.iter().filter(|o| list(rf(o, "defeats")).contains(&h)).collect();
        if no.iter().any(|d| !yes.iter().any(|c| sees_in(c, hash_of(d), index))) {
            Some(false)
        } else if !yes.is_empty() {
            Some(true)
        } else {
            None
        }
    }
    // 1.8 P15, kept (stage 5 compare, R-J1): a backup's turn. With `grounds.wait` the names are a chain, each the backup of the one before. A
    // later name's turn begins where `needed` lines of the clocks the grounds name (no side's own line) each hold a cutoff, a span no shorter
    // than the wait, running from that line's receipt of a side's dispute, with no word of an earlier name received before it on that line;
    // or the same on the earlier name's own line. A place, never a date.
    fn turn_starts<'i>(&self, i: usize, h: &str, index: &'i crate::js::Index) -> Vec<Vec<&'i Value>> {
        let Some(wait) = self.wait.as_deref() else { return Vec::new() };
        let disputes: Vec<&str> = index
            .values()
            .filter(|o| !list(rf(o, "defeats")).is_empty() && crate::identity::counts_in(o, index) && super::speaker_of(o, index, None).is_some_and(|w| self.sides.contains(&w)))
            .map(hash_of)
            .collect();
        let all = |_: &str| true;
        let earlier: Vec<&Value> = self.names[..i].iter().flat_map(|e| self.words_of(e, h, index)).collect();
        let line_start = |name: &str| -> Option<&'i Value> {
            let owner = index.get(name).and_then(|b| rs(b, "author")).unwrap_or(name);
            if self.sides.iter().any(|s| s == owner) {
                return None;
            }
            let line = crate::line::line_named(name, index)?;
            let receipts: Vec<&Value> = disputes.iter().flat_map(|d| crate::line::receipts_of(d, &line, index, &all)).collect();
            let long_enough = |w: &str| crate::time::compare_durations(w, wait, "2000-01-01T00:00:00.000Z").is_some_and(|c| c >= 0);
            for r in receipts {
                let cuts = index.values().filter(|c| {
                    type_of(c) == "observe"
                        && ss(c, "kind") == Some("cutoff")
                        && list(rf(c, "derives_from")).contains(&hash_of(r))
                        && ss(c, "when").is_some_and(|w| crate::time::parse_duration(w).is_some() && long_enough(w))
                        && crate::line::on_line(c, &line, index)
                });
                for c in cuts {
                    if !earlier.iter().any(|w| crate::line::receipts_of(hash_of(w), &line, index, &all).iter().any(|x| crate::line::before(x, c, index))) {
                        return Some(c);
                    }
                }
            }
            None
        };
        let mut starts = Vec::new();
        if let Some(k) = self.clocks.as_ref().and_then(crate::tasks::clocks_of) {
            let cs: Vec<&Value> = k.names.iter().filter_map(|n| line_start(n)).collect();
            if cs.len() >= k.needed {
                starts.push(cs);
            }
        }
        if let Some(own) = line_start(&self.names[i - 1]) {
            starts.push(vec![own]);
        }
        starts
    }
    // A name's words that count: the first name's all; a later name's, where the word has a turn's start in its causal past and no word of an
    // earlier name on the block in its past.
    fn valid_words<'i>(&self, i: usize, h: &str, index: &'i crate::js::Index) -> Vec<&'i Value> {
        let words = self.words_of(&self.names[i], h, index);
        if i == 0 {
            return words;
        }
        let earlier: Vec<String> = self.names[..i].iter().flat_map(|e| self.words_of(e, h, index)).map(|w| hash_of(w).to_string()).collect();
        let starts = self.turn_starts(i, h, index);
        words
            .into_iter()
            .filter(|w| {
                let past = index.past_of(w);
                !earlier.iter().any(|e| past.contains(e.as_str())) && starts.iter().any(|set| set.iter().all(|c| past.contains(hash_of(c))))
            })
            .collect()
    }
    // The ruling on a block: false or true once as many names as are needed say so; on a chain, the latest name whose words count and say
    // something (once a backup's word counts, an earlier name's word it had not seen counts for nothing). None while they have not.
    pub(super) fn ruling(&self, h: &str, _disputes: &dyn Fn(&str) -> Vec<String>, index: &crate::js::Index) -> Option<bool> {
        if self.wait.is_some() {
            return (0..self.names.len()).rev().find_map(|i| Self::verdict(&self.valid_words(i, h, index), h, index));
        }
        let voices: Vec<Option<bool>> = self.names.iter().map(|n| Self::verdict(&self.words_of(n, h, index), h, index)).collect();
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
            let keys: Vec<String> = crate::identity::live_keys_in(node, index);
            let at = a.get("at").and_then(Value::as_str)?;
            (taken && node_ok(o, node) && crate::sign::message_signed_by(a, &keys)).then(|| (o, at.to_string()))
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
    let clocks = grounds.and_then(|g| g.get("clocks")).and_then(crate::tasks::clocks_of).map(|k| json!({ "names": k.names, "needed": k.needed }));
    Bench { names, needed, wait, sides, clocks, bound }
}

