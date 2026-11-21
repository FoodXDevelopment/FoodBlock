//! Strangers (modules/consent.md): what may pass between people who have never dealt. A human author for a first
//! message to a stranger, consent as a block (the `consent` fold), the receipt code, and a model's reading that is never
//! the person's own claim.
use crate::check::ordered;
use crate::error::Refusal;
use crate::js::{get, hash_of, list, rf, rs, ss, st, type_of, Index};
use crate::order::sees_in;
use crate::prelude::*;

const CROCKFORD: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// The short code of a block (profiles/short-form.md): the first 5 bytes (40 bits) of its id's digest, in Crockford Base32, shown as
/// `XXXX-XXXX`; with `long`, ten characters (50 bits) as `XXXXX-XXXXX`, for a receiver that holds two blocks with one short code. A
/// lookup key, never an id or an authority.
pub fn short_code(id: &str) -> Option<String> {
    let c = crockford(id, 8)?;
    Some(format!("{}-{}", &c[..4], &c[4..]))
}

// The first `chars` Crockford characters of an id's digest, five bits each; None when the id is too short.
fn crockford(id: &str, chars: usize) -> Option<String> {
    let hex_part = id.rsplit(':').next().unwrap_or(id);
    let bits: Vec<u8> = hex_part.chars().map(|c| c.to_digit(16).map(|d| d as u8)).collect::<Option<Vec<_>>>()?.into_iter().flat_map(|d| (0..4).rev().map(move |i| (d >> i) & 1)).collect();
    if chars * 5 > bits.len() {
        return None;
    }
    Some((0..chars).map(|i| CROCKFORD[bits[i * 5..i * 5 + 5].iter().fold(0usize, |acc, b| acc << 1 | *b as usize)] as char).collect())
}

const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
fn b64url(bytes: &[u8]) -> String {
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |acc, (i, b)| acc | (*b as u32) << (16 - 8 * i));
        for i in 0..=chunk.len() {
            out.push(B64URL[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}
fn unb64url(text: &str) -> Option<Vec<u8>> {
    let vals: Vec<u32> = text.bytes().map(|c| B64URL.iter().position(|x| *x == c).map(|p| p as u32)).collect::<Option<_>>()?;
    let mut out = Vec::new();
    for chunk in vals.chunks(4) {
        if chunk.len() == 1 {
            return None;
        }
        let n = chunk.iter().enumerate().fold(0u32, |acc, (i, v)| acc | v << (18 - 6 * i));
        for i in 0..chunk.len() - 1 {
            out.push((n >> (16 - 8 * i)) as u8);
        }
    }
    Some(out)
}

/// The short reply (profiles/short-form.md, way 1): only what the receiver cannot rebuild, as `FB1 ` and base64url with no padding of the
/// signature (64 bytes), the first 5 bytes of the answered block's id, the answer (`01` accepted, `02` declined), `at` (6 bytes, milliseconds
/// since 1970, all zero when a decline carries none) and `seq` (the rest, no leading zero). None for a block that is no such answer.
pub fn short_reply(answer: &Value) -> Option<String> {
    let profile = crate::spec().conventions.pointer("/profiles/short-form/short_reply")?.clone();
    let sig = crate::block::unhex(answer.get("signature")?.as_str()?).filter(|s| s.len() == 64)?;
    let answered = crate::block::unhex(rs(answer, "answers")?.rsplit(':').next()?)?;
    let code = profile.get("answers")?.as_object()?.iter().find(|(_, v)| v.as_str() == ss(answer, "status"))?.0.clone();
    let at: u64 = match ss(answer, "at") {
        Some(t) => crate::time::parse(t)? as u64,
        None if ss(answer, "status") == Some("declined") => 0,
        None => return None,
    };
    let seq = st(answer, "seq")?.as_u64()?;
    let mut bytes = sig;
    bytes.extend_from_slice(answered.get(..5)?);
    bytes.extend(crate::block::unhex(&code)?);
    bytes.extend_from_slice(&at.to_be_bytes()[2..]);
    let seq_bytes = seq.to_be_bytes();
    let first = seq_bytes.iter().position(|b| *b != 0).unwrap_or(7);
    bytes.extend_from_slice(&seq_bytes[first..]);
    Some(format!("{}{}", profile.get("prefix")?.as_str()?, b64url(&bytes)))
}

/// A short reply rebuilt (profiles/short-form.md, way 1): for each held block whose id starts with the 5 bytes, the answer template is
/// filled with the signer's id, the head of each key of hers the receiver holds, `refs.key` from her list (none for her genesis key) and
/// the reply's values; the block whose signature opens is the block. An accept is a `promise` deriving from a `readback` for the block
/// answered; a decline an `observe`. None when none opens: nothing was said.
pub fn short_reply_open(text: &str, signer: &str, blocks: &[Value]) -> Option<Value> {
    let profile = crate::spec().conventions.pointer("/profiles/short-form/short_reply")?.clone();
    let body = text.strip_prefix(profile.get("prefix")?.as_str()?)?;
    let bytes = unb64url(body)?;
    if bytes.len() < 64 + 5 + 1 + 6 + 1 {
        return None;
    }
    // 1.9 3a-10: a short reply opens only from its exact spelling: strict base64url, no padding, `seq` in its fewest bytes (no leading
    // zero). Any other text opens nothing.
    if b64url(&bytes) != body || bytes[76] == 0 || bytes.len() > 76 + 8 {
        return None;
    }
    let (sig, answered, answer, at, seq) = (&bytes[..64], &bytes[64..69], bytes[69], &bytes[70..76], &bytes[76..]);
    let status = profile.get("answers")?.get(crate::block::hex(&[answer]))?.as_str()?.to_string();
    let ms = at.iter().fold(0u64, |acc, b| acc << 8 | *b as u64);
    let seq = seq.iter().fold(0u64, |acc, b| acc << 8 | *b as u64);
    let index = crate::js::held_index(blocks);
    let prefix = crate::block::hex(answered);
    let sig = crate::block::hex(sig);
    for x in index.values().filter(|b| hash_of(b).rsplit(':').next().is_some_and(|h| h.starts_with(&prefix))) {
        let readbacks: Vec<Option<&str>> = if status == "accepted" {
            index.values().filter(|r| type_of(r) == "observe" && ss(r, "kind") == Some("readback") && list(rf(r, "for")).contains(&hash_of(x))).map(|r| Some(hash_of(r))).collect()
        } else {
            vec![None]
        };
        for k in crate::identity::key_timeline_in(signer, &index) {
            let Ok(link) = crate::identity::next_link_for_in(signer, &k.key, &index, false) else { continue };
            for rb in &readbacks {
                let mut state = json!({ "audience": "public", "seq": seq, "status": status });
                if ms != 0 || status == "accepted" {
                    state["at"] = json!(crate::time::iso(ms as i64));
                }
                let mut refs = json!({ "answers": hash_of(x), "author": signer, "for": hash_of(x), "prev": link.prev });
                if let Some(r) = rb {
                    refs["derives_from"] = json!([r]);
                }
                if let Some(key) = crate::identity::key_ref_for(signer, &k.key, &index) {
                    refs["key"] = json!(key);
                }
                let t = if status == "accepted" { "promise" } else { "observe" };
                let Ok(mut b) = crate::block::create_in(&k.suite, t, &state, &refs) else { continue };
                if crate::sign::verify_in(&k.suite, &b, &sig, &k.key) {
                    b["signature"] = json!(sig);
                    return Some(b);
                }
            }
        }
    }
    None
}

/// Does a typed code name this block (profiles/short-form.md)? The code is read the way a person types it: case does
/// not matter, spaces and hyphens are ignored, and the letters Crockford leaves out are read as the digits they look
/// like (`O` as 0, `I` and `L` as 1). Eight characters match the short code, and more characters match more of the id, five
/// bits at a time; fewer match nothing.
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
    // eight characters are the short code; more are more of the id, five bits at a time
    typed.chars().count() >= 8 && crockford(id, typed.chars().count()).is_some_and(|w| w == typed)
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
    if let Some(p) = principal(sender, block, index) {
        if !names.contains(&p) {
            names.push(p);
        }
    }
    names
}

/// Whether a block is the person's own word: backed by them (authority.md, Backed by a person). A build without the folds reads only their own signature.
fn is_hers(block: &Value, person: &str, index: &Index) -> bool {
    #[cfg(feature = "folds")]
    {
        crate::fold::backed_in(block, person, index)
    }
    #[cfg(not(feature = "folds"))]
    {
        let _ = index;
        rs(block, "author") == Some(person)
    }
}

/// The `consent` fold: a person's live word about a sender (consent.md). The person is the block's
/// `refs.from`, else its author. The person's own blocks (backed by them) count for every word and bind every sender. Anyone else may
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
            // Her own word: backed by her (her signature, or a chain of her grants that covers it: a witness a host signs under her grant), for a block that
            // is about her. It counts for every word and binds every sender.
            if is_hers(b, person, &index) && rs(b, "from").is_none_or(|f| f == person) {
                return true;
            }
            if rs(b, "from").or(Some(author)) != Some(person) {
                return false;
            }
            // A recorder's block counts only for the recorder's own side (its own sending, its operator's, and what acts under them): a stop
            // it recorded binds that side alone, and a yes it recorded lifts only a stop the same recorder recorded, in its causal past. Her own
            // stop is lifted by her own block alone: no one else's yes reaches it (consent.md, Only the person lifts a STOP; clean round 1, c1/c2).
            let by_asker = asker_side.iter().any(|a| a == author);
            match ss(b, "word") {
                Some("stop") => by_asker,
                Some("yes") => {
                    by_asker
                        // her own stop is lifted by her own block alone: a recorded yes that has seen it lifts nothing
                        && !index.values().any(|o| {
                            ss(o, "word") == Some("stop") && ss(o, "kind") == Some("consent") && is_hers(o, person, &index) && sees_in(b, hash_of(o), &index)
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
    kind_agent || rf(block, "under").is_some()
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
        ((answers_his && (ss(b, "status") == Some("accepted") || (promise && st(b, "status").is_none())))
            || (promise && rf(b, "answers").is_none() && rf(b, "updates").is_none() && st(b, "status").is_none() && names_him))
            && crate::identity::binds_signer(b, &index)
            && (rs(b, "author") == Some(receiver) || is_hers(b, receiver, &index))
    });
    // a `yes` ends strangerhood only as her own word: a recorder's yes counts only as the lift of a stop it recorded, never as her consent (release 8)
    let word = consent(receiver, Some(sender), blocks, block);
    let yes = word.get("word").and_then(Value::as_str) == Some("yes")
        && word.get("block").and_then(Value::as_str).and_then(|h| index.get(h)).is_some_and(|b| is_hers(b, receiver, &index));
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
    asks_today: u64,
) -> Vec<Refusal> {
    let mut w = Vec::new();
    let index = crate::js::held_index(blocks.iter());
    let sender = rs(block, "author").unwrap_or("");
    let parties: Vec<&str> = list(admission.get("parties"));
    // A listed party is exempt from the count only for a block whose key still speaks for that party (nodes.md, Admission): a block
    // of a key whose end it has seen (identity.md, invariant 8) is counted as anyone else's, so a thief with an old key fills nothing.
    let listed = parties.contains(&sender) && crate::identity::signed_by_author_in(block, &index);
    // `per_stranger` counts asks (nodes.md, Admission): a block that names one of the node's people in a ref. A block's pieces, and the
    // blocks its answer reads, name no one there and are never counted, nor refused by the count.
    let ask = block.get("refs").and_then(Value::as_object).is_some_and(|r| r.iter().any(|(k, v)| k != "author" && list(Some(v)).contains(&receiver)));
    if !listed && ask {
        if let Some(n) = admission.get("per_stranger").and_then(Value::as_u64) {
            if asks_today >= n {
                w.push(Refusal::new("not_admitted", "the node took its per_stranger asks for the day from this sender"));
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
    let index = crate::js::held_index(blocks);
    ss(reading, "kind") == Some("reading")
        && index.values().any(|b| {
            rs(b, "author") == Some(person)
                && list(rf(b, "derives_from")).contains(&hash_of(reading))
                && ["to", "to_owner"]
                    .iter()
                    .any(|k| list(rf(b, k)).iter().any(|x| *x != person))
        })
}
