//! The signer's word and the claim of invasion (promises.md, Disputes): two readings that show facts beside a block and move nothing.
//! `not_free_shown`: a signer's own word that a block she signed was not her free word. `invasion_shown`: a claim of physical crossing
//! with no deal behind it, the judges named for it, and their rulings.
use super::draws::{answers, draws_on, Draw, In, Start, To};
use super::speaker_of;
use crate::js::{hash_of, list, rf, rs, ss, st, type_of, Index};
use crate::order::sees_in;
use crate::prelude::*;

fn held_with(block: &Value, blocks: &[Value]) -> Index {
    super::read_all(core::iter::once(block).chain(crate::js::index_of(blocks).values().collect::<Vec<_>>()))
}

/// The words beside a block (promises.md, The signer's word): an `observe` of kind `not_free` naming the block in `refs.subject`. It counts as
/// hers only when the block's author backs it (`backed`: she signed it, or a grant of hers did); anyone else's is their own observe and is listed as counting for nothing. A word has no
/// status, no time limit and no way back: a stop or an `updates` of it is never read here. It is a claim, shown, never a verdict.
/// Returns `{ shown: [{ block, by, reason, threat, at }], nothing: [{ block, why }] }`, each sorted by block.
pub fn not_free_shown(block: &Value, blocks: &[Value]) -> Value {
    let index = held_with(block, blocks);
    let subject = hash_of(block).to_string();
    let author = rs(block, "author").unwrap_or("");
    let mut words: Vec<&Value> = index
        .values()
        .filter(|b| type_of(b) == "observe" && ss(b, "kind") == Some("not_free") && st(b, "status").is_none() && rs(b, "subject") == Some(subject.as_str()) && crate::identity::counts_in(b, &index))
        .collect();
    words.sort_by_key(|b| hash_of(b).to_string());
    let (mut shown, mut nothing) = (vec![], vec![]);
    for n in words {
        let by = rs(n, "author");
        if !author.is_empty() && super::backed_in(n, author, &index) {
            shown.push(json!({ "block": hash_of(n), "by": by, "reason": ss(n, "reason"), "threat": ss(n, "threat"), "at": ss(n, "at") }));
        } else {
            nothing.push(json!({ "block": hash_of(n), "why": "not_signer" }));
        }
    }
    json!({ "shown": shown, "nothing": nothing })
}

/// Who holds a claim now (promises.md, A claim of invasion): the claim is one whole, the claimant's from her claim; each hand-over (a
/// transfer that names the claim in `refs.what`, `to_owner` the new holder) is a draw on it, read by What is left: it lands on the new
/// holder's yes, and a second by one who no longer holds it takes nothing. The holder is its one owner; while a hand-over holds it, or
/// a pair of the holder's took nothing, the last who held it.
fn holder_of(claim: &Value, claimant: &str, index: &Index) -> String {
    let ch = hash_of(claim);
    let names = index.names_memo();
    let draws: Vec<Draw> = names
        .by_what
        .get(ch)
        .into_iter()
        .flatten()
        .filter_map(|h| index.get(h))
        .filter(|t| type_of(t) == "transfer" && st(t, "status").is_none() && (crate::identity::counts_in(t, index) || crate::identity::fork_burden(t, index)) && sees_in(t, ch, index))
        .filter_map(|t| {
            let to = list(rf(t, "to_owner")).first()?.to_string();
            let (yes, no, ends) = answers(t, &to, index);
            Some(Draw { block: t, by: speaker_of(t, index, None), to: To::Owner(to), amount: crate::decimal::Amount::of(st(t, "amount")), yes, no, ends, condition: None, dead: None, fixed: None, stays: true, offer: None })
        })
        .collect();
    let start = Start { owner: claimant.to_string(), amount: None, at: Some(ch.to_string()), seen: ch.to_string() };
    let drawn = draws_on(In::Whole, vec![start], draws, &|_, _| crate::decimal::Dec::zero(), index);
    match drawn.owners().as_slice() {
        [(o, _)] => o.clone(),
        _ => drawn.rows.iter().filter(|r| r.takes && r.state == Some("held")).find_map(|r| r.by.clone()).unwrap_or_else(|| claimant.to_string()),
    }
}

/// A claim of invasion shown (promises.md, A claim of invasion). The claim is an `observe` of kind `invasion`: the accused in `refs.to`, what was
/// crossed in `refs.subject`, the evidence in `derives_from`. Judges are named by a grant of kind `referee` (`refs.to` the judge, `refs.subject`
/// the claim) by the claimant (or whoever holds her claim) or by an accused. A ruling is a judge's `confirms` or `defeats` of the claim.
/// Nothing moves. Returns null when the block is no claim of invasion, else
/// `{ claimant, holder, evidence, judges: [{ judge, named_by }], rulings: [{ block, judge, named_by, word, evidence }] }` (1.9 §10: `standing`,
/// `crossed`, `commanded`, `accused`, `nothing` and `up_to` are gone; a ruling or naming by a side, or by a judge no one named, is not listed).
pub fn invasion_shown(claim: &Value, blocks: &[Value]) -> Value {
    if type_of(claim) != "observe" || ss(claim, "kind") != Some("invasion") {
        return Value::Null;
    }
    let index = held_with(claim, blocks);
    let ch = hash_of(claim).to_string();
    let claimant = speaker_of(claim, &index, None);
    let accused: Vec<String> = crate::js::sorted_set(list(rf(claim, "to")));
    let evidence: Vec<String> = crate::js::sorted_set(list(rf(claim, "derives_from")));
    let holder = claimant.as_deref().map(|c| holder_of(claim, c, &index));
    let side_of_claim = |who: &str| claimant.as_deref() == Some(who) || holder.as_deref() == Some(who);
    let is_accused = |who: &str| accused.iter().any(|a| a == who);
    // the judges named: (judge, signer of the naming, grant)
    let mut named: Vec<(String, String, String)> = Vec::new();
    for g in index.values().filter(|g| type_of(g) == "grant" && ss(g, "kind") == Some("referee") && st(g, "status").is_none() && rs(g, "subject") == Some(ch.as_str()) && crate::identity::counts_in(g, &index)) {
        let (Some(judge), Some(signer)) = (rs(g, "to"), speaker_of(g, &index, None)) else { continue };
        if !(side_of_claim(&signer) || is_accused(&signer)) {
            continue;
        }
        if side_of_claim(judge) || is_accused(judge) {
            continue;
        }
        named.push((judge.to_string(), signer, hash_of(g).to_string()));
    }
    let mut judges: Vec<(String, String)> = named.iter().map(|(j, s, _)| (j.clone(), s.clone())).collect();
    judges.sort();
    judges.dedup();
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
                continue;
            }
            let by: Vec<String> = crate::js::sorted_set(judges.iter().filter(|(j, _)| j == author).map(|(_, s)| s.clone()));
            if by.is_empty() {
                continue;
            }
            rulings.push((
                hash_of(r).to_string(),
                word,
                json!({ "block": hash_of(r), "judge": author, "named_by": by, "word": word, "evidence": crate::js::sorted_set(list(rf(r, "derives_from"))) }),
            ));
        }
    }
    rulings.sort_by(|a, b| crate::js::cmp16(&a.0, &b.0).then(a.1.cmp(b.1)));
    json!({
        "claimant": claimant,
        "holder": holder,
        "evidence": evidence,
        "judges": judges.iter().map(|(j, s)| json!({ "judge": j, "named_by": s })).collect::<Vec<_>>(),
        "rulings": rulings.into_iter().map(|(_, _, v)| v).collect::<Vec<_>>(),
    })
}
