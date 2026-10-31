//! Ids and the hashes they name (core.md section 3 and Suites): a hash in the grammar of ids, in a suite this reader knows.
use super::{f, s, Checker, W};
use crate::prelude::*;

impl Checker<'_> {
    // A hash name a reader knows (core.md, Suites): the prefix of the hash of a suite it can use (not `future`). `sha3-256` is in
    // `hashes` for the future suite and is unknown until that suite is fixed in vectors.
    pub(super) fn known_prefix(&self, name: &str) -> bool {
        let p = &self.spec.protocol;
        let want = format!("{name}:");
        p.get("suites").and_then(Value::as_object).is_some_and(|suites| {
            suites.values().any(|su| {
                su.get("hash")
                    .and_then(Value::as_str)
                    .and_then(|h| p.get("hashes").and_then(|hs| hs.get(h)))
                    .and_then(|h| h.get("prefix"))
                    .and_then(Value::as_str)
                    == Some(want.as_str())
            })
        })
    }
    // An id whose hash name this reader does not know (`unknown_suite`), wherever an id is written.
    pub(super) fn unknown_hash(&self, value: Option<&Value>) -> bool {
        self.is("id", value) && value.and_then(Value::as_str).and_then(|t| t.split_once(':')).is_some_and(|(name, _)| !self.known_prefix(name))
    }

    pub(super) fn hash_shape(&self, value: Option<&Value>, name: &str) -> W {
        if self.unknown_hash(value) {
            s("unknown_suite", format!("{name} names a hash this reader does not know"))
        } else if value.is_none() || self.is("id", value) {
            vec![]
        } else {
            s("grammar", format!("{name} is a hash"))
        }
    }
    #[allow(dead_code)]
    pub(super) fn hash_list_shape(&self, value: Option<&Value>, name: &str) -> W {
        let ok = match value {
            None => true,
            Some(Value::Array(a)) => !a.is_empty() && a.iter().all(|i| self.is("id", Some(i))),
            _ => false,
        };
        if !ok {
            s("grammar", format!("{name} is a set of hashes"))
        } else if value.and_then(Value::as_array).is_some_and(|a| a.iter().any(|i| self.unknown_hash(Some(i)))) {
            s("unknown_suite", format!("{name} names a hash this reader does not know"))
        } else {
            vec![]
        }
    }

    // The ids a block names (refs): each a hash or a set of hashes in the grammar of ids; a prefix names a hash.
    pub(super) fn refs_grammar(&self, refs: &Value) -> W {
        let mut w = vec![];
        for (key, value) in refs.as_object().unwrap() {
            let items: Vec<&Value> = match value {
                Value::Array(a) => a.iter().collect(),
                other => vec![other],
            };
            if value.is_array() && self.spec.list("refs_single").iter().any(|k| k == key) {
                w.push(f("grammar", format!("refs.{key} is one id")));
                continue;
            }
            if items.is_empty() || !items.iter().all(|h| self.is("id", Some(h))) {
                w.push(f("grammar", format!("refs.{key} is an id or a set of ids (64 lowercase hex, a hash name and a colon before any hash but SHA-256)")));
                continue;
            }
            for h in items {
                if self.unknown_hash(Some(h)) {
                    w.push(f("unknown_suite", format!("refs.{key} names a hash this reader does not know")));
                }
            }
        }
        w
    }
}
