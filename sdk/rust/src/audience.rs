//! The commitment (modules/privacy.md): the one privacy primitive. A salted hash, in the author's suite hash (written
//! like an id), of the salt's hex followed by the value, as UTF-8. The salt (or the salt and the value) travels beside the block only to whoever it is for, in
//! their own copy (`reveals`). A salt is fresh per block per recipient, never reused.
use crate::block::hex;
use crate::error::{Error, Result};
use crate::js::{cmp16, unique};
use crate::prelude::*;

/// 16 random bytes, hex: a salt, or a block's nonce.
#[cfg(feature = "std")]
pub fn new_salt() -> String {
    hex(&crate::random::bytes::<16>().expect("the operating system gives random bytes"))
}

/// 16 random bytes, hex, or an error on a build without randomness.
pub fn try_new_salt() -> Result<String> {
    Ok(hex(&crate::random::bytes::<16>()?))
}

/// The commitment to a value under a salt, in a suite's hash.
pub fn salted_hash_in(suite: &str, salt: &str, value: &str) -> String {
    let mut text = String::with_capacity(salt.len() + value.len());
    text.push_str(salt);
    text.push_str(value);
    crate::block::hash_in(suite, &text)
}

/// Whether a salt and a value open a commitment: the salt is in its grammar (`grammar.salt`: `salt + value` is one text, so a longer salt
/// could open one commitment to two values) and the salted hash is the commitment. The one opening every reader uses (release 39).
pub fn opens(suite: &str, salt: &str, value: &str, commitment: &str) -> bool {
    crate::spec().is("salt", salt) && salted_hash_in(suite, salt, value) == commitment
}

/// The `std` commitment to a value under a salt.
pub fn salted_hash(salt: &str, value: &str) -> String {
    salted_hash_in(crate::spec::default_suite(), salt, value)
}

/// An audience: the sorted commitments, and each recipient's salt (kept beside the block, never signed).
#[derive(Debug, Clone, PartialEq)]
pub struct Audience {
    pub audience: Vec<String>,
    pub salts: Vec<(String, String)>,
}

impl Audience {
    pub fn salt_of(&self, recipient: &str) -> Option<&str> {
        self.salts
            .iter()
            .find(|(who, _)| who == recipient)
            .map(|(_, s)| s.as_str())
    }
    pub fn salts_json(&self) -> Value {
        Value::Object(
            self.salts
                .iter()
                .map(|(k, v)| (k.clone(), Value::String(v.clone())))
                .collect(),
        )
    }
}

/// An audience for these recipients (people, circles, `circle#role`). Each gets a fresh salt unless one is given in
/// `salts` (only to reproduce a vector, or on a build without randomness).
pub fn commit(recipients: &[&str], salts: &Value) -> Result<Audience> {
    commit_in(crate::spec::default_suite(), recipients, salts)
}

/// `commit` in a suite's hash.
pub fn commit_in(suite: &str, recipients: &[&str], salts: &Value) -> Result<Audience> {
    let who = unique(recipients.iter());
    if who.is_empty() || who.iter().any(|one| one.is_empty()) {
        return Err(Error::new(
            "audience: an audience names at least one recipient",
        ));
    }
    let mut given = Vec::new();
    for one in &who {
        let salt = match salts.get(one.as_str()).and_then(Value::as_str) {
            // a salt is 32 lowercase hex characters (privacy.md, `grammar.salt`): any other opens no commitment, so none is written
            Some(s) if crate::spec().is("salt", s) => s.to_string(),
            Some(s) if !s.is_empty() => return Err(Error::new("audience: a salt is 32 lowercase hex characters (grammar.salt)")),
            _ => try_new_salt()?,
        };
        given.push((one.clone(), salt));
    }
    let mut audience = unique(given.iter().map(|(one, salt)| salted_hash_in(suite, salt, one)));
    audience.sort_by(|a, b| cmp16(a, b));
    Ok(Audience {
        audience,
        salts: given,
    })
}

// The suite a block's commitments are hashed in: its author's, which its own id names (core.md, section 2; privacy.md).
fn commitment_suite(block: &Value) -> String {
    match crate::js::hash_of(block) {
        "" => crate::block::suite_from_block(block),
        id => crate::block::suite_of_id(id),
    }
}

/// Whether a recipient holding this salt finds itself in a block's audience.
pub fn finds_self(block: &Value, recipient: &str, salt: &str) -> bool {
    let Some(Value::Array(audience)) = crate::js::st(block, "audience") else {
        return false;
    };
    // a salt outside the grammar opens no commitment (privacy.md)
    let suite = commitment_suite(block);
    audience.iter().any(|c| c.as_str().is_some_and(|c| opens(&suite, salt, recipient, c)))
}

/// The reveal a recipient's copy carries for its audience entry: `{ salt, value }` (its own id).
pub fn reveal_for(audience: &Audience, recipient: &str) -> Value {
    json!({ "salt": audience.salt_of(recipient), "value": recipient })
}
