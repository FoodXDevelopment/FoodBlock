//! The WebAssembly door: the same JSON door (src/door.rs) as plain exports, for the JavaScript SDK in Node and
//! browsers. No glue generator: the host calls `fb_alloc`, writes the op name and the JSON arguments into memory,
//! calls `fb_call`, and reads the answer (`fb_call` returns a pointer, `fb_out_len` its length) before `fb_dealloc`.
//! The host gives two imports (module `env`): `fb_random(ptr, len)` fills memory with random bytes and `fb_now_ms()`
//! is the clock in milliseconds since 1970.
use crate::prelude::*;

extern "C" {
    fn fb_random(ptr: *mut u8, len: usize);
    fn fb_now_ms() -> f64;
}

/// The host's randomness, as `getrandom`'s one source on this target.
fn host_random(buf: &mut [u8]) -> core::result::Result<(), getrandom::Error> {
    unsafe { fb_random(buf.as_mut_ptr(), buf.len()) };
    Ok(())
}
getrandom::register_custom_getrandom!(host_random);

/// The host's clock, in ms since 1970.
pub fn now_ms() -> i64 {
    unsafe { fb_now_ms() as i64 }
}

static mut OUT_LEN: usize = 0;

#[no_mangle]
pub extern "C" fn fb_alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}

/// # Safety
/// `ptr` and `len` come from `fb_alloc`.
#[no_mangle]
pub unsafe extern "C" fn fb_dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
}

/// The length of the answer the last `fb_call` returned.
#[no_mangle]
pub extern "C" fn fb_out_len() -> usize {
    unsafe { OUT_LEN }
}

/// Run one op. The answer is JSON text, `{ "ok": ... }` or `{ "error": ... }`, in a buffer the host frees with
/// `fb_dealloc(ptr, fb_out_len())`.
///
/// # Safety
/// Both ranges are inside this module's memory (from `fb_alloc`).
#[no_mangle]
pub unsafe extern "C" fn fb_call(op: *const u8, op_len: usize, args: *const u8, args_len: usize) -> *mut u8 {
    let (op, args) = (core::slice::from_raw_parts(op, op_len), core::slice::from_raw_parts(args, args_len));
    let text = crate::door::answer(op, args).to_string().into_bytes();
    let mut boxed = text.into_boxed_slice();
    OUT_LEN = boxed.len();
    let p = boxed.as_mut_ptr();
    core::mem::forget(boxed);
    p
}
