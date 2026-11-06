//! `backed`: the one reading of "is this hers?" (authority.md, Backed by a person). A block is backed by a person when they signed it, or
//! signed it as a circle they are one of the hands of, or a grantee signed it under a grant whose chain roots in their signature. Every link
//! is judged at the block's own place in time: its causal past, never a clock and never an arrival.
use super::{is_hand_at, may_act_as_in, principal_of};
use crate::js::{hash_of, rs};
use crate::prelude::*;

/// `{ backed, why, chain }`: `why` is one plain sentence when the block is not backed (null when it is), `chain` the hashes from the block down
/// to the block the person signed (a grant, or the block itself); when not backed, the links read before the reading stopped. The block is read
/// with `blocks` as if it were held.
pub fn backed(block: &Value, person: &str, blocks: &[Value]) -> Value {
    let read = super::read_all(blocks.iter().filter(|b| hash_of(b) != hash_of(block)).chain([block]));
    let (backed, why, chain) = match reading(block, person, &read) {
        Ok(chain) => (true, Value::Null, chain),
        Err((why, chain)) => (false, json!(why), chain),
    };
    json!({ "backed": backed, "why": why, "chain": chain })
}

type Chain = Vec<String>;
fn reading(block: &Value, person: &str, read: &crate::js::Index) -> Result<Chain, (String, Chain)> {
    let Some(b) = read.get(hash_of(block)) else {
        return Err(("the block is no word: it is not valid on what it rests on, or rests on a block not held".into(), vec![]));
    };
    let mut chain = vec![hash_of(b).to_string()];
    let refuse = |why: String, chain: &Chain| Err((why, chain.clone()));
    if !crate::identity::counts_in(b, read) {
        return refuse("its signer's key does not speak for its author here (rotated out, frozen or forked: a fork counts for nothing)".into(), &chain);
    }
    let author = rs(b, "author").unwrap_or("");
    // who the block's root stands on: the circle it is signed as, the grant at the top of the chain it acts under, or its signer
    let root = if let Some(circle) = rs(b, "as").filter(|c| !c.is_empty()) {
        if !may_act_as_in(b, circle, read, None) {
            return refuse("it is signed as a circle by one who holds no sign there, or without the hands the circle needs (no_role)".into(), &chain);
        }
        circle.to_string()
    } else if author == person {
        return Ok(chain);
    } else if let Some(grant) = rs(b, "under") {
        let wrong = crate::grant::why_not_under_in(b, read, None);
        if !wrong.is_empty() {
            return refuse(format!("{author} signed it under a grant that does not back it: {}", wrong.join("; ")), &chain);
        }
        // the grant, then each grant above it that it was passed on from, to the first that was not passed on (each live and no wider: why_not_under_in)
        let Some(grant) = read.get(grant) else { return refuse(format!("{author} signed it under a grant that is not held"), &chain) };
        let links = super::grant_chain(grant, read);
        chain.extend(links.iter().map(|g| hash_of(g).to_string()));
        match links.last().and_then(|g| principal_of(g, read)) {
            Some(root) => root,
            None => return refuse("the grant at the top of its chain is signed as a circle by one who may not sign for it".into(), &chain),
        }
    } else {
        return refuse(format!("it is signed by {author}, who is not {person}, and names no grant"), &chain);
    };
    if root == person || is_hand_at(person, &root, b, read) {
        Ok(chain)
    } else {
        refuse(format!("its chain roots in {root}, and {person} is neither {root} nor one of the hands that sign for it"), &chain)
    }
}

/// Whether `block`, read into `index`, is backed by `person`: the one question, for a fold that has its index already (consent, strangers).
pub(crate) fn backed_in(block: &Value, person: &str, index: &crate::js::Index) -> bool {
    reading(block, person, index).is_ok()
}

/// `backed` for a whole set at once: `{ hash: { backed, why } }` for every block of `blocks`, read once together (one index, one set of forks), where
/// asking block by block reads the whole store again each time. The verdict of each is the one `backed` gives it among the same blocks.
pub fn backed_all(person: &str, blocks: &[Value]) -> Value {
    let read = super::read_all(blocks.iter());
    let mut out = Map::new();
    for block in blocks {
        let hash = hash_of(block);
        if hash.is_empty() || out.contains_key(hash) {
            continue;
        }
        let (backed, why) = match reading(block, person, &read) {
            Ok(_) => (true, Value::Null),
            Err((why, _)) => (false, json!(why)),
        };
        out.insert(hash.to_string(), json!({ "backed": backed, "why": why }));
    }
    Value::Object(out)
}

/// Whose word a block says it is, before anyone judges it: the circle it is signed `as`, else the top of the grant chain it names, else its
/// author. The same chain walk as `backed` (`grant_chain`); `owed_back` asks it of a block `backed` refused.
pub(super) fn claimed_by(block: &Value, index: &crate::js::Index) -> Option<String> {
    match rs(block, "under").filter(|_| rs(block, "as").is_none_or(str::is_empty)).and_then(|g| index.get(g)) {
        Some(grant) => super::principal_of_chain(grant, index),
        None => principal_of(block, index),
    }
}

/// `owed_back`: what the person is owed for money moved in their name that they do not back (promises.md, What becomes whose). Every `transfer` among
/// `blocks` whose money is the person's by `gives` (signed by them, as their circle, or under a chain of their grants) and that `backed` says they
/// do not back: `{ owed: [{ block, minor, currency, to, why }] }`. A transfer no node would hold (a forged signature, a missing chain) is
/// not backed either. What the person's own word or a live chain of their grants stands behind is not owed: it is theirs.
pub fn owed_back(person: &str, blocks: &[Value]) -> Value {
    let read = super::read_all(blocks.iter());
    let mut seen = Vec::new();
    let mut owed = Vec::new();
    for block in blocks.iter().filter(|b| crate::js::type_of(b) == "transfer") {
        let hash = hash_of(block);
        if seen.contains(&hash) {
            continue;
        }
        seen.push(hash);
        let alone;
        let index = if read.contains_key(hash) {
            &read
        } else {
            let mut with = read.clone();
            with.insert(hash.to_string(), block.clone());
            alone = with;
            &alone
        };
        let Err((why, _)) = reading(block, person, index) else { continue };
        // only a transfer that claims to be hers (its chain, walked without judging it, tops out at her) is money moved in her name
        if claimed_by(block, index).as_deref() != Some(person) {
            continue;
        }
        for line in super::gives::lines_in(block, person, index)["gives"].as_array().into_iter().flatten().filter(|l| l["of"] == "money") {
            owed.push(json!({ "block": hash, "minor": line["minor"], "currency": line["currency"], "to": line["to"], "why": why }));
        }
    }
    json!({ "owed": owed })
}
