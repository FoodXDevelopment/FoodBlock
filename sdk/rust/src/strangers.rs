//! Strangers (modules/strangers.md): what may pass between people who have never dealt. A human author for a first
//! message to a stranger, consent as a block (the `consent` fold), the receipt code, and a model's reading that is never
//! the person's own claim.
use crate::check::ordered;
use crate::error::Refusal;
use crate::js::{get, hash_of, list, rf, rs, ss, st, truthy, type_of, Index};
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

/// The principals a sender acts for under a grant: the author of the grant the block names in `refs.under`, and the circle it
/// was signed as, when that grant is live, is addressed to the sender (or open) and is one others act under (not a key or a
/// member grant). Consent follows the principal: a word about her is a word about her agents acting under her live grant.
fn principals(sender: &str, under: Option<&str>, index: &Index) -> Vec<String> {
    let Some(grant) = under.and_then(|u| index.get(u)) else { return vec![] };
    let acts_under = type_of(grant) == "grant" && !matches!(ss(grant, "kind"), Some("key" | "member"));
    let addressed = !truthy(rf(grant, "to")) || rs(grant, "to") == Some(sender);
    if !(acts_under && addressed && crate::grant::is_live_in(grant, index, None)) {
        return vec![];
    }
    let mut out: Vec<String> = Vec::new();
    for key in ["author", "as"] {
        if let Some(p) = rs(grant, key) {
            if !out.iter().any(|o| o == p) {
                out.push(p.to_string());
            }
        }
    }
    out
}

/// The `consent` fold: a person's live word about a sender (strangers.md, section 2). The person is the block's
/// `refs.from`, else its author. The person's own blocks count for every word and bind every sender. Anyone else may
/// record a `stop`, and it binds only the recorder itself: the sender is the recorder, its operator, or an agent under
/// that operator. Only the person lifts a stop: by her own block, or by a `yes` a recorder outside the asker's side
/// received from her, with the stop in its causal past. The live word is the latest block that names the sender
/// (or the sender's operator), else the latest that names no one, in causal order (a recorder's chain orders its own
/// blocks). A `stop` wins any tie; a tie between other words leaves no live word; a tie that agrees stands, naming the
/// lowest hash. There is no public list: the fold reads only the blocks the caller holds. `{ word, block }`, both null
/// when there is none.
pub fn consent(person: &str, sender: Option<&str>, blocks: &[Value], under: Option<&str>) -> Value {
    let mut index = crate::js::held_index(blocks.iter());
    crate::identity::mark_forks(&mut index);
    let words = crate::spec().list("consent_words");
    let asker_side: Vec<String> = match sender {
        Some(s) => {
            let mut n = vec![s.to_string()];
            n.extend(operators(s, &index));
            n.extend(principals(s, under, &index));
            n
        }
        None => vec![],
    };
    let all: Vec<&Value> = index
        .values()
        .filter(|b| {
            if type_of(b) != "observe" || ss(b, "kind") != Some("consent") || !crate::identity::counts_in(b, &index) {
                return false;
            }
            if !ss(b, "word").is_some_and(|w| words.iter().any(|x| x == w)) {
                return false;
            }
            let author = rs(b, "author").unwrap_or("");
            if rs(b, "from").or(Some(author)) != Some(person) {
                return false;
            }
            if author == person {
                return true;
            }
            // A recorder's block: only a stop, and it binds only the recorder's own sending (its own side).
            let by_asker = asker_side.iter().any(|a| a == author)
                || operators(author, &index).iter().any(|o| asker_side.iter().any(|a| a == o));
            match ss(b, "word") {
                Some("stop") => by_asker,
                // Her fresh yes, received by a recorder the asker does not control: it counts only as the lift of a
                // stop it has in its causal past.
                Some("yes") => {
                    !by_asker
                        && index.values().any(|o| {
                            ss(o, "word") == Some("stop")
                                && ss(o, "kind") == Some("consent")
                                && rs(o, "from").or(rs(o, "author")) == Some(person)
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
        all.iter().copied().filter(|b| !truthy(rf(b, "subject"))).collect()
    } else {
        about
    };
    // The heads: no other candidate has them in its causal past.
    let heads: Vec<&Value> = pool
        .iter()
        .copied()
        .filter(|b| !pool.iter().any(|o| hash_of(o) != hash_of(b) && sees_in(o, hash_of(b), &index)))
        .collect();
    let stop = heads.iter().copied().filter(|b| ss(b, "word") == Some("stop")).min_by_key(|b| hash_of(b).to_string());
    let chosen: Option<&Value> = if let Some(s) = stop {
        Some(s)
    } else if heads.len() == 1 {
        Some(heads[0])
    } else if !heads.is_empty() && heads.iter().all(|b| ss(b, "word") == ss(heads[0], "word")) {
        // Tied blocks that agree: the word stands; the block named is the lowest hash (a name, never an authority).
        heads.iter().copied().min_by_key(|b| hash_of(b).to_string())
    } else {
        None
    };
    match chosen {
        Some(b) => json!({ "word": ss(b, "word"), "block": hash_of(b) }),
        None => json!({ "word": null, "block": null }),
    }
}

/// Whether a block is an agent's: its author is an actor of kind `agent` or `machine`, or it names a grant in
/// `refs.under` (strangers.md, section 1).
pub fn is_agents(block: &Value, index: &Index) -> bool {
    let kind_agent = rs(block, "author")
        .and_then(|a| index.get(a))
        .is_some_and(|g| matches!(ss(g, "kind"), Some("agent" | "machine")));
    kind_agent || truthy(rf(block, "under"))
}

/// A stranger to a sender: someone who has answered none of the sender's blocks and has no live YES for the sender.
pub fn is_stranger(receiver: &str, sender: &str, blocks: &[Value], under: Option<&str>) -> bool {
    let index = crate::js::held_index(blocks.iter());
    let sender_blocks: Vec<&str> = index
        .values()
        .filter(|b| rs(b, "author") == Some(sender))
        .map(|b| hash_of(b))
        .collect();
    let answered = index.values().any(|b| {
        rs(b, "author") == Some(receiver) && list(rf(b, "answers")).iter().any(|a| sender_blocks.contains(a))
    });
    let yes = consent(receiver, Some(sender), blocks, under).get("word").and_then(Value::as_str) == Some("yes");
    !answered && !yes
}

/// The message refusals a node's admission and strangers rules give (protocol.json `refusals.codes.message`):
/// `not_admitted` (the sender is not among the rule's `parties` and the node already took `per_stranger` blocks today
/// from others) and `not_human` (a first block to a stranger an agent signed, outside the receiver's `order_channel`).
/// Not `stopped`: a block sent despite a live STOP is valid and kept, and the fold reads it as stopped (`consent`,
/// `promise_stage`): consent decides what binds, not what exists. `admission` is the
/// admission observe's state `{ parties, per_stranger, order_channel }` (null for none); `receiver` is the person the
/// block is for; `strangers_today` is how many blocks the node took today from non-parties.
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
    if !parties.contains(&sender) {
        if let Some(n) = admission.get("per_stranger").and_then(Value::as_u64) {
            if strangers_today >= n {
                w.push(Refusal::new("not_admitted", "the node's admission rule takes no more from strangers today"));
            }
        }
    }
    let under = rs(block, "under");
    if is_agents(block, &index) && is_stranger(receiver, sender, blocks, under) {
        let t = type_of(block);
        let typed = format!("{}.{}", t, st(block, "kind").and_then(Value::as_str).unwrap_or(""));
        let allowed = get(admission, "order_channel")
            .and_then(Value::as_array)
            .is_some_and(|a| a.iter().any(|x| x.as_str() == Some(t) || x.as_str() == Some(typed.as_str())));
        if !allowed {
            w.push(Refusal::new("not_human", "a first block to a stranger is signed by a person, outside the receiver's order channel"));
        }
    }
    ordered(w, "message")
}

/// A model's reading is not a person's observation (strangers.md, section 4): an `observe` of kind `reading` (an
/// import is one, with `method: import`) signed by an agent's key is that agent's claim. Sharing it claims nothing,
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
