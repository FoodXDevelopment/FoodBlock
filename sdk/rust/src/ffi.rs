//! The C ABI (include/foodblock.h): three functions. `fb_call` is the whole library (the one JSON door, src/door.rs: every
//! operation is a name and a JSON array of arguments); `fb_free` frees what it returned; `fb_version` is the protocol version.
//! Every function returns a status (`FB_OK` is 0). On success `*out` holds the answer; on failure the reason in plain words.
//! Either way the caller frees `*out` with `fb_free`. Nothing panics across the boundary.
#![allow(clippy::missing_safety_doc)]
use core::ffi::{c_char, c_int};
use std::ffi::{CStr, CString};

pub const FB_OK: c_int = 0;
/// A pointer was null, or text was not UTF-8.
pub const FB_ERR_ARGUMENT: c_int = 1;
/// A bug: the call stopped before it finished.
pub const FB_ERR_INTERNAL: c_int = 5;

unsafe fn text<'a>(p: *const c_char, what: &str) -> Result<&'a str, String> {
    if p.is_null() {
        return Err(format!("{what} is null"));
    }
    CStr::from_ptr(p).to_str().map_err(|_| format!("{what} is not UTF-8"))
}

fn put(out: *mut *mut c_char, s: String) {
    if !out.is_null() {
        unsafe { *out = CString::new(s.replace('\0', "")).unwrap_or_default().into_raw() };
    }
}

fn run(out: *mut *mut c_char, f: impl FnOnce() -> Result<String, String>) -> c_int {
    if !out.is_null() {
        unsafe { *out = core::ptr::null_mut() };
    }
    let (status, answer) = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(Ok(s)) => (FB_OK, s),
        Ok(Err(m)) => (FB_ERR_ARGUMENT, m),
        Err(_) => (FB_ERR_INTERNAL, "foodblock: an internal error stopped the call".into()),
    };
    put(out, answer);
    status
}

/// Free text this library returned. Null is fine.
#[no_mangle]
pub unsafe extern "C" fn fb_free(s: *mut c_char) {
    if !s.is_null() {
        // an answer may have carried a key or a plaintext: overwritten before it is freed (release 46)
        let mut bytes = CString::from_raw(s).into_bytes_with_nul();
        zeroize::Zeroize::zeroize(&mut bytes);
        drop(bytes);
    }
}

/// The protocol version this library writes (protocol.json `version`).
#[no_mangle]
pub unsafe extern "C" fn fb_version(out: *mut *mut c_char) -> c_int {
    run(out, || Ok(crate::VERSION.to_string()))
}

/// The one JSON door (src/door.rs), the same call Kotlin uses: `op` is an operation name, `args_json` a JSON array of
/// its arguments. `*out` is always the answer, `{ "ok": value }` or `{ "error": kind, "message", "code", "reasons",
/// "refusals" }`, and the status is `FB_OK` whenever an answer was made (the error is in the answer, not the status).
#[no_mangle]
pub unsafe extern "C" fn fb_call(op: *const c_char, args_json: *const c_char, out: *mut *mut c_char) -> c_int {
    run(out, || {
        let (op, args) = (text(op, "op")?, text(args_json, "args")?);
        Ok(crate::door::answer(op.as_bytes(), args.as_bytes()).to_string())
    })
}
