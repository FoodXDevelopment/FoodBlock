//! Rule sets by hash, and the mount (1.9 stage 7, Job B and Job F).
//!
//! A rule set is named by its hash: the SHA-256, in lowercase hex, of the canonical bytes of its manifest `{ files: { path: SHA-256 of
//! the file's bytes } }` (core.md, section 11). A reader runs the rule sets it chooses; this core runs none of its own naming, so a block
//! that states one is `unknown_rules` unless the caller of `read` says it runs that set (`runs`). Nothing here changes an answer: the name
//! is a fact anyone computes, and a mount is a caller's handle on the door's memory.
use crate::prelude::*;

/// `rule_set(files)`: `{ id, manifest }` over exactly the files given (path to the file's bytes, as text).
pub fn rule_set(files: &Map<String, Value>) -> Option<Value> {
    let mut m = Map::new();
    for (path, bytes) in files {
        m.insert(path.clone(), Value::String(crate::block::hash_hex(bytes.as_str()?)));
    }
    let manifest = json!({ "files": Value::Object(m) });
    Some(json!({ "id": crate::block::hash_hex(&crate::canonical::canonical_json(&manifest)), "manifest": manifest }))
}

/// The id of the rule set this build is made from, where the build was given its manifest. This build was given none (the repository
/// publishes no `spec/rule-set.json` yet), so it names none and reads every stated set as one it does not run.
pub const BUILT_FROM: Option<&str> = None;

#[cfg(feature = "std")]
std::thread_local! {
    static RUNS: core::cell::RefCell<Vec<String>> = const { core::cell::RefCell::new(Vec::new()) };
}

/// Whether this reader runs the rule set `id` for the `read` being asked (B5: `read` takes `runs?`; default the one it is built from).
pub(crate) fn runs(id: &str) -> bool {
    if BUILT_FROM == Some(id) {
        return true;
    }
    #[cfg(feature = "std")]
    {
        RUNS.with(|r| r.borrow().iter().any(|x| x == id))
    }
    #[cfg(not(feature = "std"))]
    {
        false
    }
}

/// Run `f` as a reader that runs the rule sets `ids` besides the one it is built from.
pub fn running<T>(ids: &[String], f: impl FnOnce() -> T) -> T {
    #[cfg(feature = "std")]
    {
        let before = RUNS.with(|r| core::mem::replace(&mut *r.borrow_mut(), ids.to_vec()));
        let out = f();
        RUNS.with(|r| *r.borrow_mut() = before);
        out
    }
    #[cfg(not(feature = "std"))]
    {
        let _ = ids;
        f()
    }
}

/// The mounts of this door (core.md, section 12): each a set of blocks given so far, named by 32 lowercase hex characters. Nothing is ever
/// taken out of a mount's set; a block given twice is one.
#[cfg(feature = "std")]
static MOUNTS: std::sync::Mutex<alloc::collections::BTreeMap<String, Vec<Value>>> = std::sync::Mutex::new(alloc::collections::BTreeMap::new());

/// `mount(blocks, into?)`: the mount, new or `into`. None where `into` names no mount of this door.
#[cfg(feature = "std")]
pub fn mount(blocks: &[Value], into: Option<&str>) -> Result<String, String> {
    let mut all = MOUNTS.lock().map_err(|_| "the door's mounts are poisoned".to_string())?;
    let name = match into {
        Some(m) if all.contains_key(m) => m.to_string(),
        Some(m) => return Err(format!("unknown_mount: {m} is no mount of this door")),
        None => loop {
            let b: [u8; 16] = crate::random::bytes().map_err(|e| e.message)?;
            let n = crate::block::hex(&b);
            if !all.contains_key(&n) {
                break n;
            }
        },
    };
    let set = all.entry(name.clone()).or_default();
    for b in blocks {
        if !set.iter().any(|x| x == b) {
            set.push(b.clone());
        }
    }
    Ok(name)
}

/// `unmount(mount)`: forget it. False where it names no mount of this door.
#[cfg(feature = "std")]
pub fn unmount(name: &str) -> bool {
    MOUNTS.lock().map(|mut all| all.remove(name).is_some()).unwrap_or(false)
}

/// The set of blocks a mount names, or None where it names none.
#[cfg(feature = "std")]
pub fn mounted(name: &str) -> Option<Vec<Value>> {
    MOUNTS.lock().ok()?.get(name).cloned()
}
