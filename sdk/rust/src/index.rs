//! The held index, and the one memo every fold shares: each held block's causal past, computed once (security I: the causal
//! past was walked afresh inside loops, which made ownership, circles, key grants and deals cubic). The memo lives beside the
//! blocks: reading the index never changes an answer, and any change to the blocks starts a fresh memo, so a reader that
//! asks twice gets the same past and a fold reads no arrival order.
use crate::prelude::*;
use alloc::rc::Rc;
use core::cell::RefCell;

/// A held set of blocks by hash, in the order they were first given (a later copy replaces the value, not the place).
pub type Map = indexmap::IndexMap<String, Value, crate::js::BuildHasher>;

/// The blocks held, by hash, with the memo of their causal pasts. It reads as the map (`Deref`); any write to the map
/// (`DerefMut`) starts a fresh memo.
#[derive(Default)]
pub struct Index {
    map: Map,
    memo: RefCell<Rc<RefCell<Memo>>>,
    // the key that signed each held block, read from what it rests on alone (identity::signer_in), by its hash and signature. Unlike the
    // memo it outlives a write: what a held block rests on never changes once it is held (append-only), so a signer once found stays the
    // signer. Only a found signer is kept (a block whose prev was not yet held may find one later). Shared with clones; bounded.
    signers: Rc<RefCell<alloc::collections::BTreeMap<(String, String), crate::identity::Signer>>>,
}

// The most signers kept: past it the store starts again (time, never unbounded memory).
const SIGNERS_MAX: usize = 1 << 20;

// The most the memo keeps, in bytes: past that it starts again, so a large store costs time, never unbounded memory.
const MEMO_BYTES: usize = 64 << 20;

#[derive(Default)]
struct Memo {
    // hashes named but not held, numbered after the held blocks (whose number is their place in the map)
    unheld: indexmap::IndexMap<String, (), crate::js::BuildHasher>,
    // each held block's past, by its place: the bits of the numbers in it
    pasts: Vec<Option<Rc<Vec<u64>>>>,
    bytes: usize,
    // who each held block speaks for, read with no clock (folds.md, Who a block speaks for): a pure answer of the blocks, asked again
    // and again by every fold
    speakers: alloc::collections::BTreeMap<String, Option<String>>,
    // each author's identity fold read with no arrivals: a pure answer of the blocks, asked for every block of theirs
    identities: alloc::collections::BTreeMap<String, Rc<crate::identity::Identity>>,
    // the blocks whose signer was read and none was found, in this state of the blocks (identity::signer_in)
    no_signer: alloc::collections::BTreeSet<String>,
    // which blocks name each hash in `for`, and in `answers` or `updates`
    names: Option<Rc<Names>>,
    // the fork and void marks of every held block, when the blocks carry none (identity::mark_of): (fork, void) by hash
    marks: Option<Rc<alloc::collections::BTreeMap<String, (bool, bool)>>>,
    // a conditioned deal's stage, read while the deals in the key are being read (release 2: a chain of conditions was read twice per level)
    stages: alloc::collections::BTreeMap<String, Value>,
}

/// Which held blocks name each hash: in `for` (`by_for`), and in `answers` or `updates` (`by_answer`), each list in the index's order.
#[derive(Default)]
pub struct Names {
    pub by_for: alloc::collections::BTreeMap<String, Vec<String>>,
    pub by_answer: alloc::collections::BTreeMap<String, Vec<String>>,
    /// the transfers that name each hash in `what` (a claim handed over names its deal there, promises.md, A claim)
    pub by_what: alloc::collections::BTreeMap<String, Vec<String>>,
}

impl Clone for Index {
    fn clone(&self) -> Self {
        // the same blocks have the same pasts: the clone shares the memo until either is written
        Index { map: self.map.clone(), memo: RefCell::new(self.memo.borrow().clone()), signers: self.signers.clone() }
    }
}
impl core::fmt::Debug for Index {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        self.map.fmt(f)
    }
}
impl PartialEq for Index {
    fn eq(&self, other: &Self) -> bool {
        self.map == other.map
    }
}
impl core::ops::Deref for Index {
    type Target = Map;
    fn deref(&self) -> &Map {
        &self.map
    }
}
impl core::ops::DerefMut for Index {
    fn deref_mut(&mut self) -> &mut Map {
        *self.memo.get_mut() = Rc::default();
        &mut self.map
    }
}
impl FromIterator<(String, Value)> for Index {
    fn from_iter<I: IntoIterator<Item = (String, Value)>>(iter: I) -> Self {
        Index { map: iter.into_iter().collect(), memo: RefCell::default(), signers: Rc::default() }
    }
}
impl From<Map> for Index {
    fn from(map: Map) -> Self {
        Index { map, memo: RefCell::default(), signers: Rc::default() }
    }
}
impl IntoIterator for Index {
    type Item = (String, Value);
    type IntoIter = indexmap::map::IntoIter<String, Value>;
    fn into_iter(self) -> Self::IntoIter {
        self.map.into_iter()
    }
}
impl<'a> IntoIterator for &'a Index {
    type Item = (&'a String, &'a Value);
    type IntoIter = indexmap::map::Iter<'a, String, Value>;
    fn into_iter(self) -> Self::IntoIter {
        self.map.iter()
    }
}

/// A block's causal past among the held blocks: every hash reachable from it through its refs (held or not; the block itself only
/// when a cycle names it).
#[derive(Clone)]
pub struct Past<'a> {
    index: &'a Index,
    memo: Rc<RefCell<Memo>>,
    bits: Rc<Vec<u64>>,
}

impl<'a> Past<'a> {
    /// The empty past.
    pub fn empty(index: &'a Index) -> Self {
        Past { index, memo: index.memo.borrow().clone(), bits: Rc::default() }
    }
    fn number(&self, h: &str) -> Option<usize> {
        self.index.map.get_index_of(h).or_else(|| self.memo.borrow().unheld.get_index_of(h).map(|i| i + self.index.map.len()))
    }
    /// Whether the hash is in it.
    pub fn contains(&self, h: &str) -> bool {
        self.number(h).is_some_and(|n| bit(&self.bits, n))
    }
    /// How many hashes are in it.
    pub fn len(&self) -> usize {
        self.bits.iter().map(|w| w.count_ones() as usize).sum()
    }
    pub fn is_empty(&self) -> bool {
        self.bits.iter().all(|w| *w == 0)
    }
    /// The hashes in it, in no order a rule reads.
    pub fn hashes(&self) -> Vec<String> {
        let n = self.index.map.len();
        let memo = self.memo.borrow();
        let mut out = Vec::new();
        for (w, word) in self.bits.iter().enumerate() {
            let mut word = *word;
            while word != 0 {
                let i = w * 64 + word.trailing_zeros() as usize;
                word &= word - 1;
                let name = if i < n { self.index.map.get_index(i).map(|(h, _)| h.clone()) } else { memo.unheld.get_index(i - n).map(|(h, _)| h.clone()) };
                out.extend(name);
            }
        }
        out
    }
}

fn bit(bits: &[u64], n: usize) -> bool {
    bits.get(n / 64).is_some_and(|w| w & (1u64 << (n % 64)) != 0)
}
fn set(bits: &mut Vec<u64>, n: usize) {
    if bits.len() <= n / 64 {
        bits.resize(n / 64 + 1, 0);
    }
    bits[n / 64] |= 1u64 << (n % 64);
}
fn or(bits: &mut Vec<u64>, other: &[u64]) {
    if bits.len() < other.len() {
        bits.resize(other.len(), 0);
    }
    for (a, b) in bits.iter_mut().zip(other) {
        *a |= *b;
    }
}

impl Index {
    /// A deal's stage already read for this key (its first hash, then the deals being read), in this state of the blocks.
    pub fn stage_memo(&self, key: &str, f: impl FnOnce() -> Value) -> Value {
        let memo = self.memo.borrow().clone();
        if let Some(v) = memo.borrow().stages.get(key) {
            return v.clone();
        }
        let v = f();
        memo.borrow_mut().stages.insert(key.to_string(), v.clone());
        v
    }

    /// Who a held block speaks for, read once with no clock: `f` answers it the first time (folds.md, Who a block speaks for). A block
    /// that is not the one held under its hash is answered afresh.
    pub fn speaker_memo(&self, block: &Value, f: impl FnOnce() -> Option<String>) -> Option<String> {
        let h = crate::js::hash_of(block);
        let held = self.map.get(h).is_some_and(|b| core::ptr::eq(b, block) || b == block);
        if !held {
            return f();
        }
        let memo = self.memo.borrow().clone();
        if let Some(s) = memo.borrow().speakers.get(h) {
            return s.clone();
        }
        let s = f();
        memo.borrow_mut().speakers.insert(h.to_string(), s.clone());
        s
    }

    /// The signer of a held block, when it has been read (`identity::signer_in`); None when it has not.
    pub fn signer_memo_get(&self, block: &Value) -> Option<Option<crate::identity::Signer>> {
        let h = crate::js::hash_of(block);
        if !self.map.get(h).is_some_and(|b| core::ptr::eq(b, block) || b == block) {
            return None;
        }
        let sig = block.get("signature").and_then(Value::as_str).unwrap_or("").to_string();
        if let Some(s) = self.signers.borrow().get(&(h.to_string(), sig)) {
            return Some(Some(s.clone()));
        }
        let memo = self.memo.borrow().clone();
        let none = memo.borrow().no_signer.contains(h);
        none.then_some(None)
    }
    /// Remember the signer of a held block.
    pub fn signer_memo_set(&self, block: &Value, signer: Option<crate::identity::Signer>) {
        let h = crate::js::hash_of(block);
        if !self.map.get(h).is_some_and(|b| core::ptr::eq(b, block) || b == block) {
            return;
        }
        match signer {
            Some(s) => {
                let sig = block.get("signature").and_then(Value::as_str).unwrap_or("").to_string();
                let mut all = self.signers.borrow_mut();
                if all.len() >= SIGNERS_MAX {
                    all.clear();
                }
                all.insert((h.to_string(), sig), s);
            }
            None => {
                let memo = self.memo.borrow().clone();
                memo.borrow_mut().no_signer.insert(h.to_string());
            }
        }
    }

    /// The fork and void marks (`_fork`, `_void`) of an index whose blocks carry none, read once for the index: `f` marks a copy of it
    /// (identity::mark_forks) and gives back each block's marks by hash. Without this every `counts_in` on an unmarked index marked a
    /// whole copy again, once per block asked about (a grant chain read through the door took tens of seconds).
    pub fn marks_memo(&self, f: impl FnOnce() -> alloc::collections::BTreeMap<String, (bool, bool)>) -> Rc<alloc::collections::BTreeMap<String, (bool, bool)>> {
        let memo = self.memo.borrow().clone();
        if let Some(m) = memo.borrow().marks.clone() {
            return m;
        }
        let m = Rc::new(f());
        memo.borrow_mut().marks = Some(m.clone());
        m
    }

    /// Which held blocks name each hash (`Names`), read once for the index.
    pub fn names_memo(&self) -> Rc<Names> {
        let memo = self.memo.borrow().clone();
        if let Some(n) = memo.borrow().names.clone() {
            return n;
        }
        let mut names = Names::default();
        for (h, b) in &self.map {
            for f in crate::js::list(crate::js::rf(b, "for")) {
                names.by_for.entry(f.to_string()).or_default().push(h.clone());
            }
            if crate::js::type_of(b) == "transfer" {
                for t in crate::js::list(crate::js::rf(b, "what")) {
                    names.by_what.entry(t.to_string()).or_default().push(h.clone());
                }
            }
            for key in ["answers", "updates"] {
                for t in crate::js::list(crate::js::rf(b, key)) {
                    names.by_answer.entry(t.to_string()).or_default().push(h.clone());
                }
            }
        }
        let n = Rc::new(names);
        memo.borrow_mut().names = Some(n.clone());
        n
    }

    /// An author's identity fold with no arrivals, read once: `f` answers it the first time.
    pub fn identity_memo(&self, id: &str, f: impl FnOnce() -> crate::identity::Identity) -> Rc<crate::identity::Identity> {
        let memo = self.memo.borrow().clone();
        if let Some(s) = memo.borrow().identities.get(id) {
            return s.clone();
        }
        let s = Rc::new(f());
        memo.borrow_mut().identities.insert(id.to_string(), s.clone());
        s
    }

    /// A block's causal past among these blocks (`past_of`).
    pub fn past_of(&self, block: &Value) -> Past<'_> {
        let memo = self.memo.borrow().clone();
        let mut bits: Vec<u64> = Vec::new();
        let causes = crate::order::causes_of(block);
        for c in &causes {
            let Some(n) = self.number_or_name(&memo, c) else { continue };
            set(&mut bits, n);
            if n < self.map.len() {
                match self.held_past(&memo, n) {
                    Some(p) => or(&mut bits, &p),
                    // a cycle (only made-up data has one): the plain walk
                    None => return self.walked(block, memo),
                }
            }
        }
        Past { index: self, memo, bits: Rc::new(bits) }
    }

    fn number_or_name(&self, memo: &Rc<RefCell<Memo>>, h: &str) -> Option<usize> {
        if let Some(i) = self.map.get_index_of(h) {
            return Some(i);
        }
        let mut m = memo.borrow_mut();
        let (i, _) = m.unheld.insert_full(h.to_string(), ());
        Some(i + self.map.len())
    }

    // The past of the held block at place `n`, from the memo or computed once, causes first, without recursion. None when a cycle
    // is met.
    fn held_past(&self, memo: &Rc<RefCell<Memo>>, n: usize) -> Option<Rc<Vec<u64>>> {
        if let Some(Some(p)) = memo.borrow().pasts.get(n) {
            return Some(p.clone());
        }
        let causes_at = |at: usize| -> Vec<usize> { crate::order::causes_of(&self.map[at]).iter().filter_map(|c| self.number_or_name(memo, c)).collect() };
        let done = |c: usize| matches!(memo.borrow().pasts.get(c), Some(Some(_)));
        // a depth-first walk with its path: (place, its causes' numbers, the next cause to visit)
        let mut frames: Vec<(usize, Vec<usize>, usize)> = vec![(n, causes_at(n), 0)];
        let mut path: alloc::collections::BTreeSet<usize> = alloc::collections::BTreeSet::new();
        path.insert(n);
        while let Some(top) = frames.last_mut() {
            if top.2 < top.1.len() {
                let c = top.1[top.2];
                top.2 += 1;
                if c >= self.map.len() || done(c) {
                    continue;
                }
                if path.contains(&c) {
                    return None;
                }
                path.insert(c);
                let causes = causes_at(c);
                frames.push((c, causes, 0));
                continue;
            }
            let Some((at, causes, _)) = frames.pop() else { break };
            path.remove(&at);
            let mut bits: Vec<u64> = Vec::new();
            for c in &causes {
                set(&mut bits, *c);
                if *c < self.map.len() {
                    // a cause the memo let go (past its bound): the caller walks instead
                    let p = memo.borrow().pasts.get(*c).cloned().flatten()?;
                    or(&mut bits, &p);
                }
            }
            let mut m = memo.borrow_mut();
            m.bytes += bits.len() * 8 + 32;
            if m.bytes > MEMO_BYTES {
                m.pasts.clear();
                m.bytes = bits.len() * 8 + 32;
            }
            if m.pasts.len() <= at {
                m.pasts.resize(at + 1, None);
            }
            m.pasts[at] = Some(Rc::new(bits));
        }
        let p = memo.borrow().pasts.get(n).cloned().flatten();
        p
    }

    // The plain walk, for a past a cycle runs through.
    fn walked(&self, block: &Value, memo: Rc<RefCell<Memo>>) -> Past<'_> {
        let mut bits: Vec<u64> = Vec::new();
        let mut todo = crate::order::causes_of(block);
        while let Some(h) = todo.pop() {
            let Some(n) = self.number_or_name(&memo, &h) else { continue };
            if bit(&bits, n) {
                continue;
            }
            set(&mut bits, n);
            if let Some(b) = self.map.get(&h) {
                todo.extend(crate::order::causes_of(b));
            }
        }
        Past { index: self, memo, bits: Rc::new(bits) }
    }
}
