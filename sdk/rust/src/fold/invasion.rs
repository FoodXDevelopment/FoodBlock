//! The signer's word and the claim of invasion (promises.md, Disputes): two readings that show facts beside a block and move nothing.
//! `not_free_shown`: a signer's own word that a block she signed was not her free word. `invasion_shown`: a claim of physical crossing
//! with no deal behind it, the judges named for it, and their rulings.
use super::{owner_seen_by, speaker_of};
use crate::js::{hash_of, list, rf, rs, ss, st, type_of, Index};
use crate::order::sees_in;
use crate::prelude::*;

fn held_with(block: &Value, blocks: &[Value]) -> Index {
    super::read_all(core::iter::once(block).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()))
}

/// The words beside a block (promises.md, The signer's word): an `observe` of kind `not_free` naming the block in `refs.subject`. It counts as
/// hers only when its author is the block's author; anyone else's is their own observe and is listed as counting for nothing. A word has no
/// status, no time limit and no way back: a stop or an `updates` of it is never read here. It is a claim, shown, never a verdict.
/// Returns `{ shown: [{ block, by, reason, threat, at }], nothing: [{ block, why }] }`, each sorted by block.
pub fn not_free_shown(block: &Value, blocks: &[Value]) -> Value {
    let index = held_with(block, blocks);
    let subject = hash_of(block).to_string();
    let author = rs(block, "author");
    let mut words: Vec<&Value> = index
        .values()
        .filter(|b| type_of(b) == "observe" && ss(b, "kind") == Some("not_free") && st(b, "status").is_none() && rs(b, "subject") == Some(subject.as_str()) && crate::identity::counts_in(b, &index))
        .collect();
    words.sort_by_key(|b| hash_of(b).to_string());
    let (mut shown, mut nothing) = (vec![], vec![]);
    for n in words {
        let by = rs(n, "author");
        if by.is_some() && by == author {
            shown.push(json!({ "block": hash_of(n), "by": by, "reason": ss(n, "reason"), "threat": ss(n, "threat"), "at": ss(n, "at") }));
        } else {
            nothing.push(json!({ "block": hash_of(n), "why": "not_signer" }));
        }
    }
    json!({ "shown": shown, "nothing": nothing })
}

/// Who holds a claim now (promises.md, A claim of invasion): the claimant, then each hand-over in turn, a transfer that names the claim in
/// `refs.what`, signed by the holder where it stands and accepted by the new holder. Two hand-overs by one holder that do not see each
/// other are a fork: neither moves it. Returns the holder.
fn holder_of(claim: &Value, claimant: &str, index: &Index) -> String {
    let ch = hash_of(claim);
    let cands: Vec<&Value> = index
        .values()
        .filter(|t| {
            type_of(t) == "transfer"
                && st(t, "status").is_none()
                && st(t, "money").is_none()
                && list(rf(t, "what")).contains(&ch)
                && rf(t, "to_owner").is_some()
                && crate::identity::counts_in(t, index)
                && sees_in(t, ch, index)
                && super::things::accepted_by_receiver(t, index, &|_| true)
        })
        .collect();
    // each hand-over's signer is read once, and the ones already used are a set, so a long chain costs a pass per step, not a fold per step
    let speakers: Vec<Option<String>> = cands.iter().map(|t| speaker_of(t, index, None)).collect();
    let mut cur = claimant.to_string();
    let mut used: alloc::collections::BTreeSet<String> = Default::default();
    loop {
        let mine: Vec<&&Value> = cands.iter().zip(&speakers).filter(|(t, s)| !used.contains(hash_of(t)) && s.as_deref() == Some(cur.as_str())).map(|(t, _)| t).collect();
        if mine.is_empty() {
            return cur;
        }
        if mine.iter().any(|t| mine.iter().any(|u| hash_of(u) != hash_of(t) && !sees_in(t, hash_of(u), index) && !sees_in(u, hash_of(t), index))) {
            return cur;
        }
        let first = mine.iter().min_by(|a, b| index.past_of(a).len().cmp(&index.past_of(b).len()).then_with(|| crate::js::cmp16(hash_of(a), hash_of(b)))).unwrap();
        let Some(new) = list(rf(first, "to_owner")).first().map(|s| s.to_string()) else { return cur };
        used.insert(hash_of(first).to_string());
        cur = new;
    }
}

/// A claim of invasion shown (promises.md, A claim of invasion). The claim is an `observe` of kind `invasion`: the accused in `refs.to`, what was
/// crossed in `refs.subject`, the evidence in `derives_from`. Judges are named by a grant of kind `referee` (`refs.to` the judge, `refs.subject`
/// the claim) by the claimant (or whoever holds her claim) or by an accused. A ruling is a judge's `confirms` or `defeats` of the claim.
/// Nothing moves. Returns null when the block is no claim of invasion, else
/// `{ claimant, holder, standing, crossed, evidence, accused: [{ who, named, accepted }], judges: [{ judge, named_by }],
///    rulings: [{ block, judge, named_by, word, up_to, evidence }], nothing: [{ block, reason }] }`.
pub fn invasion_shown(claim: &Value, blocks: &[Value]) -> Value {
    if type_of(claim) != "observe" || ss(claim, "kind") != Some("invasion") {
        return Value::Null;
    }
    let index = held_with(claim, blocks);
    let ch = hash_of(claim).to_string();
    let claimant = speaker_of(claim, &index, None);
    let accused: Vec<String> = crate::js::sorted_set(list(rf(claim, "to")));
    let crossed = rs(claim, "subject").map(String::from);
    let evidence: Vec<String> = crate::js::sorted_set(list(rf(claim, "derives_from")));
    let holder = claimant.as_deref().map(|c| holder_of(claim, c, &index));
    // standing: the harmed party owns the thing crossed where the claim stands, holds a share of it, or is the person crossed
    let harmed = match (&crossed, &claimant) {
        (Some(x), Some(c)) => match index.get(x.as_str()) {
            Some(t) if type_of(t) == "thing" => {
                owner_seen_by(x, claim, &index).as_deref() == Some(c.as_str()) || {
                    let held: Vec<Value> = index.values().cloned().collect();
                    super::shares_on(t, &held)["standing"].as_array().is_some_and(|a| a.iter().any(|s| s["owner"].as_str() == Some(c.as_str())))
                }
            }
            Some(t) if type_of(t) == "actor" => x == c,
            _ => false,
        },
        _ => false,
    };
    let standing = if !harmed {
        "none"
    } else if holder == claimant {
        "harmed"
    } else {
        "holds"
    };
    let side_of_claim = |who: &str| claimant.as_deref() == Some(who) || holder.as_deref() == Some(who);
    let is_accused = |who: &str| accused.iter().any(|a| a == who);
    let mut nothing: Vec<(String, &str)> = Vec::new();
    // the judges named: (judge, signer of the naming, grant)
    let mut named: Vec<(String, String, String)> = Vec::new();
    for g in index.values().filter(|g| type_of(g) == "grant" && ss(g, "kind") == Some("referee") && st(g, "status").is_none() && rs(g, "subject") == Some(ch.as_str()) && crate::identity::counts_in(g, &index)) {
        let (Some(judge), Some(signer)) = (rs(g, "to"), speaker_of(g, &index, None)) else { continue };
        if !(side_of_claim(&signer) || is_accused(&signer)) {
            continue;
        }
        if side_of_claim(judge) || is_accused(judge) {
            nothing.push((hash_of(g).to_string(), "side"));
            continue;
        }
        named.push((judge.to_string(), signer, hash_of(g).to_string()));
    }
    let mut judges: Vec<(String, String)> = named.iter().map(|(j, s, _)| (j.clone(), s.clone())).collect();
    judges.sort();
    judges.dedup();
    let accepted_by = |who: &str, grant: &str| {
        index.values().any(|a| {
            type_of(a) == "grant" && ss(a, "status") == Some("accepted") && rs(a, "answers") == Some(grant) && crate::identity::counts_in(a, &index) && speaker_of(a, &index, None).as_deref() == Some(who)
        })
    };
    let accused_json: Vec<Value> = accused
        .iter()
        .map(|who| {
            let own: Vec<String> = crate::js::sorted_set(named.iter().filter(|(_, s, _)| s == who).map(|(j, _, _)| j.clone()));
            let accepted: Vec<String> = crate::js::sorted_set(named.iter().filter(|(_, s, g)| side_of_claim(s) && accepted_by(who, g)).map(|(j, _, _)| j.clone()));
            // told: the time this accused's own receipt reached a message `for` the claim (promises.md, A message with a receipt)
            let keeper = super::clock::Keepers { names: vec![who.clone()], needed: 1 };
            let notified = index
                .values()
                .filter(|m| type_of(m) == "observe" && ss(m, "kind") == Some("message") && list(rf(m, "for")).contains(&ch.as_str()) && list(rf(m, "to")).contains(&who.as_str()) && crate::identity::counts_in(m, &index))
                .filter_map(|m| super::clock::received_at(hash_of(m), &keeper, &index))
                .min();
            json!({ "who": who, "named": own, "accepted": accepted, "notified": notified })
        })
        .collect();
    let mut rulings: Vec<(String, &str, Value)> = Vec::new();
    for r in index.values().filter(|r| crate::identity::counts_in(r, &index)) {
        for word in ["confirms", "defeats"] {
            if !list(rf(r, word)).contains(&ch.as_str()) {
                continue;
            }
            let Some(signer) = rs(r, "author") else { continue };
            // the judge is whom the ruling speaks for: a circle named as judge rules by its holders of `sign`, signing `as` it (circles.md)
            let speaks = speaker_of(r, &index, None);
            let author = speaks.as_deref().unwrap_or(signer);
            let sided = side_of_claim(signer) || is_accused(signer) || side_of_claim(author) || is_accused(author);
            if sided {
                nothing.push((hash_of(r).to_string(), "side"));
                continue;
            }
            let by: Vec<String> = crate::js::sorted_set(judges.iter().filter(|(j, _)| j == author).map(|(_, s)| s.clone()));
            if by.is_empty() {
                nothing.push((hash_of(r).to_string(), "not_named"));
                continue;
            }
            rulings.push((
                hash_of(r).to_string(),
                word,
                json!({ "block": hash_of(r), "judge": author, "named_by": by, "word": word, "up_to": if word == "confirms" { st(r, "up_to").cloned().unwrap_or(Value::Null) } else { Value::Null }, "evidence": crate::js::sorted_set(list(rf(r, "derives_from"))) }),
            ));
        }
    }
    rulings.sort_by(|a, b| crate::js::cmp16(&a.0, &b.0).then(a.1.cmp(b.1)));
    nothing.sort_by(|a, b| crate::js::cmp16(&a.0, &b.0).then(a.1.cmp(b.1)));
    nothing.dedup();
    // a signed order among the evidence (promises.md, A claim of invasion): a counted block signed by one accused that names another accused in `refs.to`
    let order = evidence.iter().any(|h| {
        index.get(h.as_str()).is_some_and(|o| {
            crate::identity::counts_in(o, &index)
                && speaker_of(o, &index, None).is_some_and(|w| is_accused(&w) && list(rf(o, "to")).iter().any(|t| *t != w && is_accused(t)))
        })
    });
    json!({
        "commanded": if order { "shown" } else { "none" },
        "claimant": claimant,
        "holder": holder,
        "standing": standing,
        "crossed": crossed,
        "evidence": evidence,
        "accused": accused_json,
        "judges": judges.iter().map(|(j, s)| json!({ "judge": j, "named_by": s })).collect::<Vec<_>>(),
        "rulings": rulings.into_iter().map(|(_, _, v)| v).collect::<Vec<_>>(),
        "nothing": nothing.into_iter().map(|(b, r)| json!({ "block": b, "reason": r })).collect::<Vec<_>>(),
    })
}
