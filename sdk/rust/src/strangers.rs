//! Strangers (modules/strangers.md): what may pass between people who have never dealt. A human author for a first
//! message to a stranger, consent as a block (the `consent` fold), the receipt code, and a model's reading that is never
//! the person's own claim.
use crate::check::ordered;
use crate::error::Refusal;
use crate::js::{get, hash_of, index_of, list, rf, rs, ss, st, truthy, type_of, Index};
use crate::order::sees_in;
use crate::prelude::*;

const CROCKFORD: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// The short receipt code of a block (profiles/short-form.md): the first 5 bytes (40 bits) of its id, in Crockford
/// Base32, shown as `XXXX-XXXX`. A lookup key inside one custodian, not an id and not an authority.
pub fn receipt_code(id: &str) -> Option<String> {
    let hex_part = id.rsplit(':').next().unwrap_or(id);
    let bytes = crate::block::unhex(hex_part.get(..10)?)?;
    let n = bytes.iter().fold(0u64, |acc, b| acc << 8 | *b as u64);
    let mut out = String::new();
    for i in 0..8 {
        out.push(CROCKFORD[((n >> (35 - 5 * i)) & 31) as usize] as char);
        if i == 3 {
            out.push('-');
        }
    }
    Some(out)
}

/// The live operators of an actor: the authors of its live `operator` grants naming it in `refs.to`, sorted.
fn operators(agent: &str, index: &Index) -> Vec<String> {
    let blocks: Vec<Value> = index.values().cloned().collect();
    crate::grant::operators_of(agent, &blocks, None)
}

/// The `consent` fold: a person's live word about a sender (strangers.md, section 2). Their latest consent block that
/// names the sender (or the sender's operator), else the latest that names no one. Ordered by causal order; a `stop`
/// wins any tie; a tie between other words leaves no live word. `{ word, block }`, both null when there is none.
pub fn consent(person: &str, sender: Option<&str>, blocks: &[Value]) -> Value {
    let mut index = index_of(blocks.iter());
    crate::identity::mark_forks(&mut index);
    let words = crate::spec().list("consent_words");
    let all: Vec<&Value> = index
        .values()
        .filter(|b| {
            type_of(b) == "observe"
                && ss(b, "kind") == Some("consent")
                && rs(b, "author") == Some(person)
                && ss(b, "word").is_some_and(|w| words.iter().any(|x| x == w))
                && crate::identity::counts_in(b, &index)
        })
        .collect();
    let named: Vec<String> = match sender {
        Some(s) => {
            let mut n = vec![s.to_string()];
            n.extend(operators(s, &index));
            n
        }
        None => vec![],
    };
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
    let stops: Vec<&&Value> = heads.iter().filter(|b| ss(b, "word") == Some("stop")).collect();
    let chosen: Option<&Value> = if let Some(s) = stops.first() {
        Some(**s)
    } else if heads.len() == 1 {
        Some(heads[0])
    } else if !heads.is_empty() && heads.iter().all(|b| ss(b, "word") == ss(heads[0], "word")) {
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
pub fn is_stranger(receiver: &str, sender: &str, blocks: &[Value]) -> bool {
    let index = index_of(blocks.iter());
    let sender_blocks: Vec<&str> = index
        .values()
        .filter(|b| rs(b, "author") == Some(sender))
        .map(|b| hash_of(b))
        .collect();
    let answered = index.values().any(|b| {
        rs(b, "author") == Some(receiver) && list(rf(b, "answers")).iter().any(|a| sender_blocks.contains(a))
    });
    let yes = consent(receiver, Some(sender), blocks).get("word").and_then(Value::as_str) == Some("yes");
    !answered && !yes
}

/// The message refusals a node's admission and strangers rules give (protocol.json `refusals.codes.message`):
/// `not_admitted` (the sender is not among the rule's `parties` and the node already took `per_stranger` blocks today
/// from others), `not_human` (a first block to a stranger an agent signed, outside the receiver's `order_channel`) and
/// `stopped` (a live STOP naming the sender, its operator, or any agent under that operator). `admission` is the
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
    let index = index_of(blocks.iter());
    let sender = rs(block, "author").unwrap_or("");
    let parties: Vec<&str> = list(admission.get("parties"));
    if !parties.contains(&sender) {
        if let Some(n) = admission.get("per_stranger").and_then(Value::as_u64) {
            if strangers_today >= n {
                w.push(Refusal::new("not_admitted", "the node's admission rule takes no more from strangers today"));
            }
        }
    }
    if consent(receiver, Some(sender), blocks).get("word").and_then(Value::as_str) == Some("stop") {
        w.push(Refusal::new("stopped", "the person has a live STOP naming this sender or its operator"));
    }
    if is_agents(block, &index) && is_stranger(receiver, sender, blocks) {
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

/// A model's reading is not a person's observation (strangers.md, section 4): an `observe` of kind `reading` (and an
/// `import`, which is one) signed by an agent's key is that agent's claim. It is the person's own claim only when the
/// person's own block `confirms` it. True when `person` has confirmed `reading` among these blocks.
pub fn reading_is_persons_claim(reading: &Value, person: &str, blocks: &[Value]) -> bool {
    let kind_ok = matches!(ss(reading, "kind"), Some("reading" | "import"));
    kind_ok
        && blocks.iter().any(|b| {
            rs(b, "author") == Some(person) && list(rf(b, "confirms")).contains(&hash_of(reading))
        })
}
