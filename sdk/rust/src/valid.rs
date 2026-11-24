//! A block's two questions before any fold (core.md, section 8).
//!
//! `valid(block, blocks)`: who said these bytes. Checks 1 to 4 read the bytes alone (canonical form and strict writing, values and
//! grammars, the limits, the genesis or the common five); check 5, the block's pieces (its author's genesis, the block its `refs.key`
//! names, and that block's pieces: `unmet` naming each one not given as valid); check 6, the key its pieces name opens its signature over
//! its header and the id is the hash of its bytes in that key's suite. It reads no `prev`, no other link, no schema and no clock. The
//! checks stop at the first that finds anything. `unmet` and `unknown_suite` are waits, not refusals: the block is judged again when what
//! it lacks is given.
//!
//! `read(block, blocks, schemas)`: whether this reader can read a valid block. The body passes check 8 against the schema store, and every
//! block it names for its meaning (protocol.json `needs`) is given, valid and read (`names_missing`, `names_unread`). It gives every code
//! it finds. A block that is valid and not read is kept as its header and counts in no fold (`pool`).
use crate::check::{ordered, CheckOptions};
use crate::error::Refusal;
use crate::identity::{genesis_opens, is_genesis, key_grant_of, named_keys, opens_as, suite_named};
use crate::js::{hash_of, rs, ss, st, type_of, Index};
use crate::prelude::*;
use alloc::collections::{BTreeMap, BTreeSet};
use core::cell::RefCell;

fn f(code: &str, detail: impl Into<String>) -> Refusal {
    Refusal::new(code, detail)
}

/// The check of core.md section 8 a code of the bytes belongs to (protocol.json `refusals.checks`, rows 1 to 3: the size, bytes and
/// header): the first row that lists it. None for a code of no such row: it is a value, `read`'s.
fn bytes_check(code: &str) -> Option<usize> {
    let checks = crate::js::get(&crate::spec().protocol, "refusals.checks").and_then(Value::as_array).cloned().unwrap_or_default();
    checks.iter().take(3).position(|row| row.as_array().is_some_and(|c| c.iter().any(|x| x.as_str() == Some(code)))).map(|i| i + 1)
}

/// What checks 1 to 4 find in a block's bytes, and apart, what check 8 finds in its body (a closed type's own) with these options.
fn staged(block: &Value, options: CheckOptions) -> (Vec<Refusal>, Vec<Refusal>) {
    let (t, state, refs) = (type_of(block), block.get("state").unwrap_or(&Value::Null), block.get("refs").unwrap_or(&Value::Null));
    let (mut found, mut closed) = crate::check::findings_staged(crate::spec(), t, state, refs, options);
    if block.get("type").is_none() {
        found.push(f("not_canonical", "a block is exactly { type, state, refs }: this one has no type"));
    }
    // a finding of no row of the size, the bytes or the header is a value: `read`'s
    // an id or key in the body in a suite or hash this reader does not know is `read`'s `unknown_suite` (the block is
    // not read; "a place this reader cannot read brings in nothing and refuses nothing"); a genesis its own key does not open is
    // `bad_signature`; an author or prev that is not one id is `chain`.
    // the one form has no fraction, so a float is bytes that are not canonical (check 2), never a value
    // and no whole number past 2^53 - 1: a reader that holds numbers as doubles could not hold the value to hash it
    let found: Vec<Refusal> = found.into_iter().map(|r| if r.code == "float" || r.code == "integer_range" { f("not_canonical", r.detail) } else { r }).collect();
    let (bytes, own): (Vec<Refusal>, Vec<Refusal>) = found.into_iter().partition(|r| bytes_check(&r.code).is_some());
    closed.extend(own);
    for check in 1..=3 {
        let at: Vec<Refusal> = bytes.iter().filter(|r| bytes_check(&r.code) == Some(check)).cloned().collect();
        if !at.is_empty() {
            return (ordered(at, "block"), closed);
        }
    }
    (vec![], closed)
}

/// What checks 1 to 4 find, reading the bytes alone: the codes of the first that finds anything (empty when none does). It needs no
/// given block, so it is the answer for text read from the wire before anything is given.
pub fn bytes_findings(block: &Value) -> Vec<Refusal> {
    staged(block, CheckOptions::default()).0
}

/// The schema store (core.md, section 8, The schema store): every `thing` of kind `schema` among the blocks given, once per id.
pub fn schemas_from(blocks: &Index) -> Index {
    blocks.iter()
        .filter(|(h, b)| !h.is_empty() && type_of(b) == "thing" && crate::js::get(b, "state.kind").and_then(Value::as_str) == Some("schema"))
        .map(|(h, b)| (h.clone(), b.clone()))
        .collect()
}

/// A header a reader has message `{ header, header_signature }` (privacy.md, The public header) as the entry a store holds: the header's fields in
/// the places a block has them (`refs.author`, `refs.prev`, `refs.key`, `state.seq`, `state.skip`), its id, and its one
/// signature as `header_signature`. A header with any other key is marked (`bad_header`), so `valid` refuses it (`shape`).
pub fn header_entry(message: &Value) -> Option<Value> {
    let header = message.get("header")?;
    let mut state = Map::new();
    state.insert("seq".into(), header.get("seq")?.clone());
    let mut refs = Map::new();
    refs.insert("author".into(), header.get("author")?.clone());
    refs.insert("prev".into(), header.get("prev")?.clone());
    if let Some(k) = header.get("key") {
        refs.insert("key".into(), k.clone());
    }
    for flag in ["skip"] {
        if let Some(v) = header.get(flag) {
            state.insert(flag.into(), v.clone());
        }
    }
    let mut out = json!({ "hash": header.get("hash")?, "state": state, "refs": refs });
    let (needed, optional) = (crate::spec().list("header"), crate::spec().list("header_optional"));
    if header.as_object().is_some_and(|h| h.keys().any(|k| !needed.contains(k) && !optional.contains(k))) {
        out["bad_header"] = Value::Bool(true);
    }
    if let Some(sig) = message.get("header_signature") {
        out["header_signature"] = sig.clone();
    }
    Some(out)
}

/// A valid block that is not read, as it is kept: its header entry, carrying its one signature (core.md, section 8).
pub fn as_header(block: &Value) -> Value {
    header_entry(&json!({ "header": crate::write::header(block), "header_signature": block.get("signature").cloned().unwrap_or(Value::Null) }))
        .unwrap_or(Value::Null)
}

/// Whether an id names a hash this reader knows: a bare hash is SHA-256; a prefixed one names a suite's hash (protocol.json `hashes`).
fn known_hash_name(id: &str) -> bool {
    let sp = crate::spec();
    id.split_once(':').is_none_or(|(p, _)| sp.suites.iter().any(|s| sp.hash_prefix(&s.hash) == format!("{p}:")))
}

// A header a reader has's own shape (core.md, section 8, A header a reader has): its keys (`shape`), ids, a whole `seq` of at least 1, flags only true,
// and its signature.
fn header_shape(entry: &Value) -> Vec<Refusal> {
    let sp = crate::spec();
    let id = |v: Option<&Value>| v.and_then(Value::as_str).is_some_and(|h| sp.is("id", h));
    let refs = entry.get("refs").unwrap_or(&Value::Null);
    let state = entry.get("state").unwrap_or(&Value::Null);
    // a given header's fault is `chain`; an id in a hash name this reader does not know waits (`unknown_suite`)
    for v in [refs.get("author"), refs.get("prev"), entry.get("hash"), refs.get("key")].into_iter().flatten() {
        if id(Some(v)) && !known_hash_name(v.as_str().unwrap_or("")) {
            return vec![f("unknown_suite", "a header names an id in a hash this reader does not know")];
        }
    }
    let ok = entry.get("bad_header").is_none()
        && id(refs.get("author"))
        && id(refs.get("prev"))
        && id(entry.get("hash"))
        && refs.get("key").is_none_or(|k| id(Some(k)))
        && state.get("seq").and_then(Value::as_i64).is_some_and(|n| (1..=9_007_199_254_740_991).contains(&n))
        && state.get("skip").is_none_or(|v| v == &Value::Bool(true))
        && entry.get("header_signature").is_some_and(Value::is_string);
    if ok {
        vec![]
    } else {
        vec![f("chain", "a held header is { author, seq, prev, hash } with key or skip when the block has them, and its signature")]
    }
}

/// One reader's judgement of the blocks it holds: `valid` and `read`, each found once per given block and remembered, so a store is read
/// once (a block's pieces are judged once, however many blocks name them).
pub struct Judge<'a> {
    blocks: &'a Index,
    schemas: Option<&'a Index>,
    // each given block's `valid`, and the pieces it lacks when that is `unmet`
    valid: RefCell<BTreeMap<String, (Vec<Refusal>, Vec<String>)>>,
    read: RefCell<BTreeMap<String, Vec<Refusal>>>,
    // the blocks being read, so a ring of names (no ring of ids can be written, but a store may claim one) is read as not read
    reading: RefCell<BTreeSet<String>>,
    // the findings of a given block's bytes and body, found once
    found: RefCell<BTreeMap<String, (Vec<Refusal>, Vec<Refusal>)>>,
    // the schema store built once per judge, never once per block judged
    own_schemas: core::cell::OnceCell<Index>,
}

impl<'a> Judge<'a> {
    /// A judge of `blocks`; `schemas` is the schema store `read` reads (core.md, section 8), `schemas_from(blocks)` when None.
    pub fn new(blocks: &'a Index, schemas: Option<&'a Index>) -> Self {
        Judge { blocks, schemas, valid: Default::default(), read: Default::default(), reading: Default::default(), found: Default::default(), own_schemas: Default::default() }
    }

    fn findings(&self, block: &Value) -> (Vec<Refusal>, Vec<Refusal>) {
        let h = hash_of(block);
        let blocks = !h.is_empty() && self.blocks.get(h).is_some_and(|b| core::ptr::eq(b, block) || b == block);
        if blocks {
            if let Some(v) = self.found.borrow().get(h) {
                return v.clone();
            }
        }
        let schemas = match self.schemas {
            Some(s) => s,
            None => self.own_schemas.get_or_init(|| schemas_from(self.blocks)),
        };
        let v = staged(block, CheckOptions { schemas: Some(schemas), blocks: Some(self.blocks) });
        if blocks {
            self.found.borrow_mut().insert(h.to_string(), v.clone());
        }
        v
    }

    /// `valid` of the block given under `h`: None when nothing is given under it.
    pub fn valid_given(&self, h: &str) -> Option<Vec<Refusal>> {
        self.judged(h).map(|v| v.0)
    }
    fn judged(&self, h: &str) -> Option<(Vec<Refusal>, Vec<String>)> {
        let block = self.blocks.get(h)?;
        if let Some(v) = self.valid.borrow().get(h) {
            return Some(v.clone());
        }
        let v = self.judge(block);
        self.valid.borrow_mut().insert(h.to_string(), v.clone());
        Some(v)
    }

    /// The pieces the block given under `h` lacks, when its `valid` is a wait: what a node fetches to judge it.
    pub fn lacks_given(&self, h: &str) -> Vec<String> {
        self.judged(h).map(|v| v.1).unwrap_or_default()
    }

    /// What check 5 finds of one piece (core.md, section 8): the pieces not given, or given only as their header, through it (`unmet`, what a
    /// node fetches); whether it waits on a suite this reader does not know (`unknown_suite`); and, when it is given and refused, its first
    /// code (`bad_piece`: final, for its id is the hash of its bytes).
    fn piece(&self, piece: &str) -> (Vec<String>, bool, Option<String>) {
        if self.blocks.get(piece).is_none_or(|b| b.get("type").is_none()) {
            return (vec![piece.to_string()], false, None);
        }
        match self.judged(piece) {
            Some((v, _)) if v.is_empty() => (vec![], false, None),
            Some((v, lacks)) if v.iter().all(|r| r.code == "unmet" || r.code == "unknown_suite") => (lacks, v.iter().any(|r| r.code == "unknown_suite"), None),
            Some((v, _)) => (vec![], false, Some(v[0].code.clone())),
            None => (vec![piece.to_string()], false, None),
        }
    }

    /// `valid(block, blocks)` (core.md, section 8): the codes of the first of checks 1 to 6 that finds anything; empty when valid. A block given
    /// by its header alone (a header entry, or a header message `{ header, header_signature }`) is checked for its keys, its pieces and its
    /// signature.
    pub fn valid(&self, block: &Value) -> Vec<Refusal> {
        self.judge(block).0
    }

    // `valid`, with the pieces the block lacks when it is `unmet`.
    fn judge(&self, block: &Value) -> (Vec<Refusal>, Vec<String>) {
        let entry;
        // a value with a `header` key is a header message: exactly { header, header_signature } (core.md, section 8, A header a reader has)
        let block = if block.get("header").is_some() && block.get("type").is_none() {
            let exact = block.as_object().is_some_and(|m| m.len() == 2 && m.contains_key("header_signature"));
            entry = header_entry(block).filter(|_| exact).unwrap_or_else(|| json!({ "bad_header": true }));
            &entry
        } else {
            block
        };
        let header = block.get("type").is_none() && (block.get("header_signature").is_some() || block.get("bad_header").is_some());
        if header {
            let shape = header_shape(block);
            if !shape.is_empty() {
                return (shape, vec![]);
            }
        } else {
            let (bytes, _) = self.findings(block);
            if !bytes.is_empty() {
                return (bytes, vec![]);
            }
            if is_genesis(block) {
                return (genesis_findings(block), vec![]);
            }
            // a header id in a hash name this reader does not know brings in nothing and waits (`unknown_suite`)
            if ["author", "prev", "key"].iter().filter_map(|k| rs(block, k)).any(|h| !known_hash_name(h)) {
                return (vec![f("unknown_suite", "a header names an id in a hash this reader does not know")], vec![]);
            }
        }
        // Check 5: the pieces, each given and valid.
        let author = rs(block, "author").unwrap_or("");
        let mut pieces = vec![author.to_string()];
        if let Some(k) = rs(block, "key").filter(|k| *k != author) {
            pieces.push(k.to_string());
        }
        let (mut missing, mut suite, mut refused) = (Vec::new(), Vec::new(), Vec::new());
        for p in &pieces {
            let (lacks, waits, code) = self.piece(p);
            missing.extend(lacks);
            if waits {
                suite.push(p.clone());
            }
            if let Some(c) = code {
                refused.push(format!("{p} ({c})"));
            }
        }
        let missing = crate::js::sorted_set(missing.into_iter());
        let mut w = Vec::new();
        if !missing.is_empty() {
            w.push(f("unmet", format!("its pieces are not all held: {}", missing.join(", "))));
        }
        if !refused.is_empty() {
            refused.sort();
            w.push(f("bad_piece", format!("a piece it rests on is refused: {}", refused.join(", "))));
        }
        if !suite.is_empty() {
            suite.sort();
            w.push(f("unknown_suite", format!("a piece waits on a suite this reader does not know: {}", suite.join(", "))));
        }
        if !w.is_empty() {
            return (ordered(w, "block"), missing);
        }
        // Check 6: the key its pieces name opens its signature over its header, and the id is its bytes' hash in that key's suite.
        (signature_findings(block, self.blocks), vec![])
    }

    /// `read(block, blocks, schemas)` of a valid block (core.md, section 8): every code found, in protocol.json order; empty when read.
    pub fn read(&self, block: &Value) -> Vec<Refusal> {
        if block.get("type").is_none() {
            return vec![f("names_unread", "a block held by its header alone is not read")];
        }
        let mut found: Vec<Refusal> = Vec::new();
        let (mut missing, mut unread): (Vec<String>, Vec<String>) = (vec![], vec![]);
        for n in crate::js::needs_of(block) {
            match self.blocks.get(&n) {
                None => missing.push(n),
                Some(_) if !self.reads_given(&n) => unread.push(n),
                Some(_) => {}
            }
        }
        if !missing.is_empty() {
            found.push(f("names_missing", format!("it names for its meaning blocks not held: {}", missing.join(", "))));
        }
        if !unread.is_empty() {
            found.push(f("names_unread", format!("it names for its meaning blocks held and not valid or not read: {}", unread.join(", "))));
        }
        // check 7 reads only what is read: a check that compares the block with a block it names that is given and not read is not made (as
        // the oracle reads it). The findings are the block's own, found once against what is given; only the codes that
        // turn on such a block are left out: a passed-on grant against its parent (`wider_than_parent`, `not_receiver`), and what a schema
        // could declare (`undeclared_field`, `undeclared_ref`). No other index is built, so a store of many blocks that name blocks not read
        // costs one judgement each (a narrowed index per read once made that cubic: a stranger's push could stall a reader).
        let parent_unread = crate::js::rs(block, "parent").is_some_and(|p| unread.iter().any(|u| u == p));
        let schema_unread = crate::js::rs(block, "schema").is_some_and(|s| unread.iter().any(|u| u == s));
        found.extend(self.findings(block).1.into_iter().filter(|r| {
            !(parent_unread && matches!(r.code.as_str(), "wider_than_parent" | "not_receiver"))
                && !(schema_unread && matches!(r.code.as_str(), "undeclared_field" | "undeclared_ref"))
        }));
        ordered(found, "read")
    }

    /// Whether the block given under `h` is given with its body, valid and read.
    pub fn reads_given(&self, h: &str) -> bool {
        let Some(block) = self.blocks.get(h) else { return false };
        if block.get("type").is_none() || !self.valid_given(h).is_some_and(|v| v.is_empty()) {
            return false;
        }
        if let Some(v) = self.read.borrow().get(h) {
            return v.is_empty();
        }
        if !self.reading.borrow_mut().insert(h.to_string()) {
            return false;
        }
        let v = self.read(block);
        self.reading.borrow_mut().remove(h);
        let ok = v.is_empty();
        self.read.borrow_mut().insert(h.to_string(), v);
        ok
    }

    /// `read` of the block given under `h`, once judged (`reads_given`).
    pub fn read_given(&self, h: &str) -> Option<Vec<Refusal>> {
        self.reads_given(h);
        self.read.borrow().get(h).cloned()
    }
}

// A genesis (core.md, section 8, check 6): its id is the hash of its bytes in its own suite (`bad_hash`), and its own key opens it over
// its own bytes (`bad_signature`), in a suite this reader knows (`unknown_suite`).
fn genesis_findings(block: &Value) -> Vec<Refusal> {
    let (t, state, refs) = crate::block::parts(block);
    let suite = suite_named(block);
    let mut w = Vec::new();
    let h = hash_of(block);
    // a suite this reader does not know waits; else the id is the hash of its bytes in its own suite, and then its own key
    // opens it: the first that finds anything is given, never two
    if !crate::sign::knows_suite(&suite) {
        w.push(f("unknown_suite", format!("the suite {suite} is not one this reader can use")));
    } else if !h.is_empty() && h != crate::block::hash_suite(&suite, t, state, refs) {
        w.push(f("bad_hash", "the id sent with it is not the hash of its canonical bytes in its key's suite"));
    } else if !genesis_opens(Some(block)) {
        // `valid` gives eight codes, and a genesis its own key does not open is `bad_signature` (a p256 key not
        // spelled `04` is no key, so nothing opens it)
        w.push(f("bad_signature", "a genesis is signed by its own key, over its own bytes"));
    }
    ordered(w, "block")
}

// Check 6 for a block that is not a genesis, its pieces given: the block its `refs.key` names is a key grant about its author (else
// `bad_signature`); a key that block brings in (or the genesis key, with no `refs.key`) opens its signature over its header
// (`bad_signature`), in a suite this reader knows (`unknown_suite`); and its id is the hash of its bytes in that key's suite (`bad_hash`).
fn signature_findings(block: &Value, blocks: &Index) -> Vec<Refusal> {
    let author = rs(block, "author").unwrap_or("");
    let header = block.get("type").is_none();
    let mut w = Vec::new();
    // a key grant that shows a key named by hash in her genesis list names that genesis in refs.key (core.md, section 5)
    let shows = !header && type_of(block) == "grant" && ss(block, "kind") == Some("key") && st(block, "shown_key").is_some();
    // the list a key its body shows may be named in: a key grant, or her genesis that states her list
    let holder = rs(block, "key").and_then(|k| blocks.get(k)).filter(|g| key_grant_of(g, author) || (hash_of(g) == author && st(g, "voices").is_some()));
    let hides = holder.and_then(crate::identity::list_of).is_some_and(|l| l.voices.iter().any(|v| matches!(v.who, crate::identity::Who::Hash(_))));
    if let Some(k) = rs(block, "key") {
        if k == author && header && hides {
            // a header naming her genesis may be a key grant whose key is shown only in its body: it cannot be checked from the header
            w.push(f("unmet", format!("pieces not held: {}", hash_of(block))));
            return w;
        }
        if (k == author && !shows) || (k != author && !blocks.get(k).is_some_and(|g| key_grant_of(g, author))) {
            w.push(f("bad_signature", "the block its refs.key names is not a key grant whose refs.subject is its author"));
            return w;
        }
    }
    let keys = named_keys(block, blocks).unwrap_or_default();
    let (t, state, refs) = crate::block::parts(block);
    let h = hash_of(block);
    // a `type` that is not text still has bytes, and so an id: the hash of the bytes as written (identity::id_in reads it so)
    let bytes_id = |suite: &str| match block.get("type").filter(|x| !x.is_string()) {
        Some(ty) => crate::block::hash_in(suite, &crate::canonical::canonical_any_type(ty, state, refs)),
        None => crate::block::hash_suite(suite, t, state, refs),
    };
    let id_in = |suite: &str| header || h.is_empty() || h == bytes_id(suite);
    // the id is the hash of the bytes in the suite of a key its pieces bring in (`bad_hash`), and then that key opens the
    // signature over the header that names the block by that id (`bad_signature`): the first that finds anything is given, never both
    // (a forged block is `bad_hash` alone).
    let known: Vec<&(String, String)> = keys.iter().filter(|(_, s)| crate::sign::knows_suite(s)).collect();
    if !header && !h.is_empty() && !known.is_empty() && known.len() == keys.len() && !known.iter().any(|(_, s)| id_in(s)) {
        w.push(f("bad_hash", "the id sent with it is not the hash of its canonical bytes in the suite of a key its pieces name"));
        return w;
    }
    let sent = if header || h.is_empty() { block.clone() } else { as_header(block) };
    match keys.iter().find(|(k, s)| crate::sign::knows_suite(s) && opens_as(&sent, k, s)) {
        Some((_, suite)) => {
            if !id_in(suite) {
                w.push(f("bad_hash", "the id sent with it is not the hash of its canonical bytes in the suite of the key that signed it"));
            }
        }
        None => {
            // a place this reader cannot read brings in nothing and refuses nothing; `bad_signature` only when every place the
            // pieces offer is one this reader can read
            if header && hides {
                // a header of a key grant whose key is shown only in its body cannot be checked from the header: it waits on its body
                w.push(f("unmet", format!("pieces not held: {}", hash_of(block))));
            } else if keys.is_empty() || keys.iter().all(|(_, s)| crate::sign::knows_suite(s)) {
                w.push(f("bad_signature", "no key its pieces name opens its signature over its header"));
            } else {
                w.push(f("unknown_suite", "a key its pieces name is in a suite this reader cannot use"));
            }
        }
    }
    ordered(w, "block")
}

/// `valid(block, blocks)` (core.md, section 8): who said these bytes. `block` is a full block or a given header `{ header, header_signature }`.
pub fn valid(block: &Value, blocks: &Index) -> Vec<Refusal> {
    Judge::new(blocks, None).valid(block)
}

/// `read(block, blocks, schemas)` (core.md, section 8) of a valid block; `schemas` is the store, `schemas_from(blocks)` when None.
pub fn read(block: &Value, blocks: &Index, schemas: Option<&Index>) -> Vec<Refusal> {
    Judge::new(blocks, schemas).read(block)
}

/// What a fold may read of the blocks given (folds.md, A fold reads only what is valid and read): each block that is valid and read, whole;
/// each that is valid and not read, as its header; nothing of a block that is not valid, or not yet judged. Borrowed when nothing changes
/// (the common case: a node's own store is whole and read).
pub fn pool(index: &Index) -> alloc::borrow::Cow<'_, Index> {
    let judge = Judge::new(index, None);
    let mut out: Vec<(String, Option<Value>)> = Vec::new();
    // "each id in its refs" leaves out the line's own links (author, prev, key, after): its header shows them, and naming the
    // block before it names no measure
    let names_of = |b: &Value| {
        crate::js::sorted_set(b.get("refs").and_then(Value::as_object).into_iter().flat_map(|m| m.iter().filter(|(k, _)| !matches!(k.as_str(), "author" | "prev" | "key" | "after")).map(|(_, v)| v)).flat_map(|v| match v {
            Value::String(s) => vec![s.clone()],
            Value::Array(a) => a.iter().filter_map(Value::as_str).map(String::from).collect(),
            _ => vec![],
        }))
    };
    for (h, b) in index.iter() {
        match judge.valid_given(h) {
            Some(v) if v.is_empty() => {
                if b.get("type").is_some() && !judge.reads_given(h) {
                    // a block given as a body and not read hides each id in its refs; the header it is kept as carries them
                    // (`_names`), so a fold can tell it from a block given only as its header
                    let mut e = as_header(b);
                    e["_names"] = json!(names_of(b));
                    // a key grant that is valid brings its key in whether or not this reader can read it (core.md, section 8, check 6): its
                    // header keeps the keys it brings in (`_brings`), so a block its key signed is still its author's word (07, What
                    // building changed: valid says who said the bytes, whatever read says)
                    if let Some(author) = crate::js::rs(b, "subject") {
                        let keys = crate::identity::brings_in(b, author, index);
                        if !keys.is_empty() {
                            e["_brings"] = json!(keys.iter().map(|(k, s)| json!([k, s])).collect::<Vec<_>>());
                        }
                    }
                    out.push((h.clone(), Some(e)));
                }
            }
            // a block this reader cannot judge (its pieces not all given, or a suite it does not know), given with its body, is
            // on no line and counts in no fold, but hides each thing its refs name (`_unjudged`)
            Some(v) if b.get("type").is_some() && v.iter().all(|r| r.code == "unmet" || r.code == "unknown_suite") => {
                // kept under a key no id can be, so nothing reads it as given at its id: only `hidden` reads it
                out.push((h.clone(), None));
                out.push((format!("~unjudged:{h}"), Some(json!({ "hash": h, "_unjudged": names_of(b) }))));
            }
            _ => out.push((h.clone(), None)),
        }
    }
    if out.is_empty() {
        return alloc::borrow::Cow::Borrowed(index);
    }
    let mut kept = index.clone();
    for (h, entry) in out {
        match entry {
            Some(e) => {
                kept.insert(h, e);
            }
            None => {
                kept.shift_remove(&h);
            }
        }
    }
    alloc::borrow::Cow::Owned(kept)
}

/// Whether a block a fold is asked about, given or not, is valid and read with the blocks given: a block that is not is no word in any fold.
pub fn is_read(block: &Value, index: &Index) -> bool {
    let judge = Judge::new(index, None);
    let h = hash_of(block);
    if index.get(h).is_some_and(|b| b == block) {
        return judge.reads_given(h);
    }
    block.get("type").is_some() && judge.valid(block).is_empty() && judge.read(block).is_empty()
}
