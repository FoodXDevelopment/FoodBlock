//! The JNI door, for Kotlin on the JVM and on Android (sdk/kotlin): one native function over the shared JSON door
//! (`door.rs`).
//!
//! ```text
//! world.foodx.foodblock.Native.call(op: ByteArray, args: ByteArray): ByteArray
//! ```
//!
//! Bytes, not Java strings, so text crosses exactly as UTF-8.
use crate::door::answer;
use ::jni::objects::{JByteArray, JClass};
use ::jni::sys::jbyteArray;
use ::jni::JNIEnv;

/// `world.foodx.foodblock.Native.call(op, args)`. Never throws into the JVM: every failure is an answer.
#[no_mangle]
pub extern "system" fn Java_world_foodx_foodblock_Native_call<'l>(
    env: JNIEnv<'l>,
    _class: JClass<'l>,
    op: JByteArray<'l>,
    args: JByteArray<'l>,
) -> jbyteArray {
    let op = env.convert_byte_array(&op).unwrap_or_default();
    let args = env.convert_byte_array(&args).unwrap_or_default();
    let out = answer(&op, &args).to_string();
    match env.byte_array_from_slice(out.as_bytes()) {
        Ok(a) => a.into_raw(),
        Err(_) => core::ptr::null_mut(),
    }
}
