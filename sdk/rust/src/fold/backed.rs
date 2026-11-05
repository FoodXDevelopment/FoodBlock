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
        let mut top = read.get(grant);
        while let Some(g) = top {
            chain.push(hash_of(g).to_string());
            match rs(g, "parent").and_then(|h| read.get(h)) {
                Some(above) => top = Some(above),
                None => break,
            }
        }
        match top.and_then(|g| principal_of(g, read)) {
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
