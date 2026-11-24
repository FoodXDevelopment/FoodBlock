//! Rule sets by hash, and the mount.
//!
//! A rule set is named by its hash: the SHA-256, in lowercase hex, of the canonical bytes of its manifest `{ files: { path: SHA-256 of
//! the file's bytes } }` (core.md, section 11). A build runs the one set its manifest names; a block that states another is
//! `unknown_rules`. Nothing here changes an answer: the name is a fact anyone computes, and a mount is a caller's handle on the door's memory.
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

/// The id of the rule set this build is made from (core.md, section 11): a block that leaves `state.rule_set` out names the genesis rule set. This
/// build was given no manifest, so it names no id, and a block that states any id is `unknown_rules`.
pub const BUILT_FROM: Option<&str> = None;

/// Whether this build is made from the rule set `id`.
pub(crate) fn runs(id: &str) -> bool {
    BUILT_FROM == Some(id)
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
