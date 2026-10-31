//! Strangers (modules/consent.md): what may pass between people who have never dealt. A human author for a first
//! message to a stranger, consent as a block (the `consent` fold), the receipt code, and a model's reading that is never
//! the person's own claim.
use crate::check::ordered;
use crate::error::Refusal;
use crate::js::{get, hash_of, list, rf, rs, ss, st, type_of, Index};
use crate::order::sees_in;
use crate::prelude::*;

const CROCKFORD: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// The short receipt code of a block (profiles/short-form.md): the first 5 bytes (40 bits) of its id, in Crockford
/// Base32, shown as `XXXX-XXXX`. A lookup key inside one custodian, not an id and not an authority.
pub fn receipt_code(id: &str) -> Option<String> {
    code_of(id, 8)
}

/// The long form, for the rare custodian whose own index holds two blocks with the same short code: the first 50 bits
/// of the id, ten characters, shown as `XXXXX-XXXXX`.
pub fn receipt_code_long(id: &str) -> Option<String> {
    code_of(id, 10)
}

fn code_of(id: &str, chars: usize) -> Option<String> {
    let hex_part = id.rsplit(':').next().unwrap_or(id);
    let bytes = crate::block::unhex(hex_part.get(..14)?)?;
    let n = bytes.iter().fold(0u64, |acc, b| acc << 8 | *b as u64);   // 56 bits
    let mut out = String::new();
    for i in 0..chars {
        out.push(CROCKFORD[((n >> (51 - 5 * i)) & 31) as usize] as char);
        if i + 1 == chars / 2 {
            out.push('-');
        }
    }
    Some(out)
}

/// Does a typed code name this block (profiles/short-form.md)? The code is read the way a person types it: case does
/// not matter, spaces and hyphens are ignored, and the letters Crockford leaves out are read as the digits they look
/// like (`O` as 0, `I` and `L` as 1). Eight characters match the short code, ten the long one; any other length
/// matches nothing.
pub fn code_matches(text: &str, id: &str) -> bool {
    let typed: String = text
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| match c.to_ascii_uppercase() {
            'O' => '0',
            'I' | 'L' => '1',
            other => other,
        })
        .collect();
    let want = match typed.chars().count() {
        8 => receipt_code(id),
        10 => receipt_code_long(id),
        _ => None,
    };
    want.map_or(false, |w| w.replace('-', "") == typed)
}

/// The live operators of an actor: the authors of its live `operator` grants naming it in `refs.to`, sorted.
fn operators(agent: &str, index: &Index) -> Vec<String> {
    let blocks: Vec<Value> = index.values().cloned().collect();
    crate::grant::operators_of(agent, &blocks, None)
}

/// The party a sender's block speaks for (authority.md, Who a block speaks for): the one `speaks_for` definition, scope test and
/// all, read in the blocks held. Without a block, or one whose author is not the sender, no one beyond the sender. A micro has no
/// circle fold: it knows only the author.
fn principal(sender: &str, block: Option<&Value>, index: &Index) -> Option<String> {
    let block = block.filter(|b| rs(b, "author") == Some(sender))?;
    #[cfg(feature = "folds")]
    {
        // the block may not be held yet (a first message being checked): read it as if it were
        let added = !index.contains_key(hash_of(block));
        let mut read;
        let index = if added {
            read = index.clone();
            read.insert(hash_of(block).to_string(), block.clone());
            &read
        } else {
            index
        };
        crate::fold::speaker_of(block, index, None)
    }
    #[cfg(not(feature = "folds"))]
    {
        let _ = index;
        rs(block, "as").is_none_or(str::is_empty).then(|| sender.to_string())
    }
}

/// namesOf(sender): everyone a sender is named by (consent.md): itself, its operators, and whom its block speaks for.
/// Consent follows the principal, so a word about any of them is a word about the sender.
fn names_of(sender: &str, block: Option<&Value>, index: &Index) -> Vec<String> {
    let mut names = vec![sender.to_string()];
    names.extend(operators(sender, index));
    if let Some(p) = principal(sender, block, index) {
        if !names.contains(&p) {
            names.push(p);
        }
    }
    names
}

/// The `consent` fold: a person's live word about a sender (consent.md). The person is the block's
/// `refs.from`, else its author. The person's own blocks count for every word and bind every sender. Anyone else may
/// record a `stop`, and it binds only the recorder itself: the sender is the recorder, its operator, or an autonomous system under
/// that operator. Only the person lifts a stop: by her own block, or by a `yes` a recorder outside the asker's side
/// received from her, with the stop in its causal past. The live word is the latest block that names the sender
/// (or the sender's operator), else the latest that names no one, in causal order (a recorder's chain orders its own
/// blocks). A `stop` wins any tie; a tie between other words leaves no live word; a tie that agrees stands, naming the
/// lowest hash. There is no public list: the fold reads only the blocks the caller holds. `{ word, block }`, both null
/// when there is none.
pub fn consent(person: &str, sender: Option<&str>, blocks: &[Value], block: Option<&Value>) -> Value {
    let mut index = crate::js::held_index(blocks.iter());
    crate::identity::mark_forks(&mut index);
    let words = crate::spec().list("folds.consent.word_values");
    let asker_side: Vec<String> = sender.map_or(vec![], |s| names_of(s, block, &index));
    let all: Vec<&Value> = index
        .values()
        .filter(|b| {
            if type_of(b) != "observe" || ss(b, "kind") != Some("consent") || !crate::identity::counts_in(b, &index) {
                return false;
            }
            if !ss(b, "word").is_some_and(|w| words.iter().any(|x| x == w)) {
                return false;
            }
            // a `yes` widens what reaches her, so it names whom it is about; one that names no one counts for nothing (consent.md)
            if ss(b, "word") == Some("yes") && list(rf(b, "subject")).is_empty() {
                return false;
            }
            let author = rs(b, "author").unwrap_or("");
            if rs(b, "from").or(Some(author)) != Some(person) {
                return false;
            }
            if author == person {
                return true;
            }
            // A recorder's block counts only for the recorder's own side (its own sending, its operator's, and what acts under them): a stop
            // it recorded binds that side alone, and a yes it recorded lifts only a stop the same recorder recorded, in its causal past. Her own
            // stop is lifted by her own block alone: no one else's yes reaches it (consent.md, Only the person lifts a STOP; clean round 1, c1/c2).
            let by_asker = asker_side.iter().any(|a| a == author)
                || operators(author, &index).iter().any(|o| asker_side.iter().any(|a| a == o));
            match ss(b, "word") {
                Some("stop") => by_asker,
                Some("yes") => {
                    by_asker
                        // her own stop is lifted by her own block alone: a recorded yes that has seen it lifts nothing
                        && !index.values().any(|o| {
                            ss(o, "word") == Some("stop") && ss(o, "kind") == Some("consent") && rs(o, "author") == Some(person) && sees_in(b, hash_of(o), &index)
                        })
                        && index.values().any(|o| {
                            ss(o, "word") == Some("stop")
                                && ss(o, "kind") == Some("consent")
                                && rs(o, "author") == Some(author)
                                && rs(o, "from") == Some(person)
                                && sees_in(b, hash_of(o), &index)
                        })
                }
                _ => false,
            }
        })
        .collect();
    let named = asker_side;
    let about: Vec<&Value> = all
        .iter()
        .copied()
        .filter(|b| list(rf(b, "subject")).iter().any(|s| named.iter().any(|n| n == s)))
        .collect();
    let pool: Vec<&Value> = if about.is_empty() {
        all.iter().copied().filter(|b| rf(b, "subject").is_none()).collect()
    } else {
        about
    };
    // The heads: no other candidate has them in its causal past.
    let heads: Vec<&Value> = pool
        .iter()
        .copied()
        .filter(|b| !pool.iter().any(|o| hash_of(o) != hash_of(b) && sees_in(o, hash_of(b), &index)))
        .collect();
    let stop = crate::order::named(&heads.iter().copied().filter(|b| ss(b, "word") == Some("stop")).collect::<Vec<_>>());
    let chosen: Option<&Value> = if let Some(s) = stop {
        Some(s)
    } else if heads.len() == 1 {
        Some(heads[0])
    } else if !heads.is_empty() && heads.iter().all(|b| ss(b, "word") == ss(heads[0], "word")) {
        // Tied blocks that agree: the word stands; the block named is the lowest hash (a name, never an authority).
        crate::order::named(&heads)
    } else {
        None
    };
    match chosen {
        Some(b) => json!({ "word": ss(b, "word"), "block": hash_of(b) }),
        None => json!({ "word": null, "block": null }),
    }
}

/// Whether a block is an autonomous system's: its author is an actor of kind `agent` or `machine`, or one an operator answers for
/// (identity.md), or it names a grant in `refs.under` (consent.md).
pub fn is_agents(block: &Value, index: &Index) -> bool {
    let author = rs(block, "author");
    let kind_agent = author.and_then(|a| index.get(a)).is_some_and(crate::identity::autonomous);
    // an author someone answers for as a machine (a live operator grant it accepted, identity.md) is an autonomous system, whatever kind its
    // genesis gives itself: the one place the protocol says so (clean round 1, r7)
    let operated = author.is_some_and(|a| !crate::identity::operators_in(a, index).is_empty());
    kind_agent || operated || rf(block, "under").is_some()
}

/// A stranger to a sender: someone who has accepted none of the sender's blocks, countered none, opened no deal with the sender (decision
/// H13), and has no live YES for the sender.
pub fn is_stranger(receiver: &str, sender: &str, blocks: &[Value], block: Option<&Value>) -> bool {
    let mut index = crate::js::held_index(blocks.iter());
    // a forked answer binds no one (core.md, invariant 3): only an answer that counts makes the sender no stranger
    crate::identity::mark_forks(&mut index);
    // consent follows the principal (consent.md): the sender is named by itself, its operators, and the grantor of the live grant it
    // acts under, so one who answered the principal is no stranger to the principal's hands
    let names = names_of(sender, block, &index);
    let sender_blocks: Vec<&str> = index
        .values()
        .filter(|b| rs(b, "author").is_some_and(|a| names.iter().any(|n| n == a)))
        .map(|b| hash_of(b))
        .collect();
    // Only her accept, her counter-offer or a deal she opened with him makes a sender no stranger (decision H13): a counted block of the
    // receiver's that answers one of the sender's blocks `accepted`, or answers it as a counter (a promise with no status), or a promise of
    // hers, no answer and no stop, that names the sender as a side. A declined or stopped answer, or any other answer, keeps him a stranger.
    let dealt = index.values().any(|b| {
        let promise = type_of(b) == "promise";
        let answers_his = list(rf(b, "answers")).iter().any(|a| sender_blocks.contains(a));
        let names_him = ["from", "to"].iter().any(|k| rs(b, k).is_some_and(|v| names.iter().any(|n| n == v)));
        rs(b, "author") == Some(receiver)
            && crate::identity::binds_signer(b, &index)
            && ((answers_his && (ss(b, "status") == Some("accepted") || (promise && st(b, "status").is_none())))
                || (promise && rf(b, "answers").is_none() && rf(b, "updates").is_none() && st(b, "status").is_none() && names_him))
    });
    // a `yes` ends strangerhood only as her own word: a recorder's yes counts only as the lift of a stop it recorded, never as her consent (release 8)
    let word = consent(receiver, Some(sender), blocks, block);
    let yes = word.get("word").and_then(Value::as_str) == Some("yes")
        && word.get("block").and_then(Value::as_str).and_then(|h| index.get(h)).is_some_and(|b| rs(b, "author") == Some(receiver));
    !dealt && !yes
}

/// The message refusals a node's admission and consent rules give (protocol.json `refusals.codes.message`):
/// `not_admitted` (the sender is not among the rule's `parties` and the node already took `per_stranger` blocks today
/// from that sender: each sender is counted alone, so one spammer never closes the door to others) and `not_human` (a first block to a stranger an autonomous system signed, outside the `order_channel` the receiver's rule states;
/// with no `order_channel`, nothing: what the node does then is its own software's choice).
/// Not `stopped`: a block sent despite a live STOP is valid and kept, and the fold reads it as stopped (`consent`,
/// `promise_stage`): consent decides what binds, not what exists. `admission` is the
/// admission observe's state `{ parties, per_stranger, order_channel }` (null for none); `receiver` is the person the
/// block is for; `strangers_today` is how many blocks the node took today from this block's sender.
pub fn admission_refusals(
    block: &Value,
    receiver: &str,
    blocks: &[Value],
    admission: &Value,
    strangers_today: u64,
) -> Vec<Refusal> {
    let mut w = Vec::new();
    let index = crate::js::held_index(blocks.iter());
    let sender = rs(block, "author").unwrap_or("");
    let parties: Vec<&str> = list(admission.get("parties"));
    // A listed party is exempt from the count only for a block whose key still speaks for that party (nodes.md, Admission): a block
    // of a key rotated out past its counted line, frozen or void is counted as anyone else's, so a thief with an old key fills nothing.
    let listed = parties.contains(&sender) && crate::identity::signed_by_author_in(block, &index, None);
    if !listed {
        if let Some(n) = admission.get("per_stranger").and_then(Value::as_u64) {
            if strangers_today >= n {
                w.push(Refusal::new("not_admitted", "the node took its per_stranger blocks for the day"));
            }
        }
    }
    // Only a rule that states an order channel refuses an autonomous system's first block: with none, what the node does is
    // its own software's choice, never the protocol's (decision F1, as E8 for per_stranger).
    let channel = get(admission, "order_channel");
    if let Some(channel) = channel.filter(|_| is_agents(block, &index) && is_stranger(receiver, sender, blocks, Some(block))) {
        let t = type_of(block);
        let typed = format!("{}.{}", t, st(block, "kind").and_then(Value::as_str).unwrap_or(""));
        let allowed = channel
            .as_array()
            .is_some_and(|a| a.iter().any(|x| x.as_str() == Some(t) || x.as_str() == Some(typed.as_str())));
        if !allowed {
            w.push(Refusal::new("not_human", "a first block to a stranger that an autonomous system signed, outside the receiver's order channel"));
        }
    }
    ordered(w, "message")
}

/// A model's reading is not a person's observation (things.md, Truth): an `observe` of kind `reading` (an
/// import is one, with `method: import`) signed by an autonomous system's key is that autonomous system's claim. Sharing it claims nothing,
/// and neither does her private `confirms`. It is the person's own claim only when she puts that fact to someone else
/// in her own step: a block of hers with the reading in `derives_from` that names someone other than herself in
/// `refs.to` or `refs.to_owner`. True when `person` has done so among these blocks.
pub fn reading_is_persons_claim(reading: &Value, person: &str, blocks: &[Value]) -> bool {
    ss(reading, "kind") == Some("reading")
        && blocks.iter().any(|b| {
            rs(b, "author") == Some(person)
                && list(rf(b, "derives_from")).contains(&hash_of(reading))
                && ["to", "to_owner"]
                    .iter()
                    .any(|k| list(rf(b, k)).iter().any(|x| *x != person))
        })
}
