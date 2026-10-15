//! # FoodBlock 1.6 for Rust, C and C++
//!
//! A block is `{ type, state, refs }`, signed by its author's Ed25519 key; its id is the SHA-256 of its canonical form.
//! This crate speaks the protocol of `spec/protocol.md` (normative). Every closed list and grammar is read from
//! `spec/protocol.json`, every older shape from `spec/aliases.json`: both are loaded at runtime from bytes the caller
//! gives ([`Spec::from_json`]), with the repository's copies built in as the default ([`spec`]).
//!
//! Blocks are plain JSON values (`serde_json::Value`): `{ hash, type, state, refs, signature }`, the same shape on
//! every SDK and on the wire.
//!
//! ## Profiles (protocol.json `profiles`)
//! - **micro** (always built): canonical form, SHA-256, Ed25519, the write check, its own chain, the grant check,
//!   reading older shapes. `no_std` + `alloc` when built without the `std` feature.
//! - **edge** (`edge` feature): adds the folds (`folds`) and Pull, Push and discovery (`sync`).
//! - **node** (`node` feature, the default): adds envelopes (`envelope`).
//!
//! The names follow the JavaScript reference SDK: `sign` signs, `seal` encrypts, `open` opens, `read_as` reads any
//! earlier shape as 1.6.
#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::too_many_arguments, clippy::type_complexity)]

extern crate alloc;

mod prelude {
    pub use alloc::boxed::Box;
    pub use alloc::format;
    pub use alloc::string::{String, ToString};
    pub use alloc::vec;
    pub use alloc::vec::Vec;
    pub use serde_json::{json, Map, Value};
}

pub mod audience;
pub mod block;
pub mod canonical;
pub mod cbor;
pub mod chain;
pub mod check;
pub mod error;
pub mod grant;
pub mod identity;
pub mod js;
pub mod order;
pub mod random;
pub mod read;
pub mod regex;
pub mod sign;
pub mod spec;
pub mod time;
pub mod write;

#[cfg(feature = "envelope")]
pub mod envelope;
#[cfg(any(feature = "ffi", feature = "jni", feature = "wasm"))]
pub mod door;
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
pub mod wasm;
#[cfg(feature = "ffi")]
pub mod ffi;
#[cfg(feature = "jni")]
pub mod jni;
#[cfg(feature = "folds")]
pub mod fold;
#[cfg(feature = "sync")]
pub mod sync;

pub use error::{Error, Refusal};
pub use serde_json::Value;
pub use spec::{spec, Spec};

/// The protocol version this crate writes. A test checks it against `spec/protocol.json`.
pub const VERSION: &str = "1.6";

/// The profiles this build supports, from smallest to largest (protocol.json `profiles`).
pub fn profiles() -> &'static [&'static str] {
    if cfg!(all(
        feature = "folds",
        feature = "sync",
        feature = "envelope"
    )) {
        &["micro", "micro_acting", "edge", "node"]
    } else if cfg!(all(feature = "folds", feature = "sync")) {
        &["micro", "micro_acting", "edge"]
    } else {
        &["micro", "micro_acting"]
    }
}

// A block: its canonical form and its id.
pub use block::{create, hash, hash_hex};
pub use canonical::{canonical, canonical_json};
// Signing (Ed25519).
#[cfg(feature = "std")]
pub use sign::generate_keypair;
pub use sign::{keypair_from_seed, sign, sign_message, verify, verify_message, Keypair};
// The commitment.
#[cfg(feature = "std")]
pub use audience::new_salt;
pub use audience::{commit, finds_self, reveal_for, salted_hash};
// Writing and the wire.
pub use check::{amount, check, confidence, money, refusals, terms, CheckOptions};
#[cfg(all(feature = "envelope", feature = "std"))]
pub use envelope::generate_encryption_keypair;
#[cfg(feature = "envelope")]
pub use envelope::{encryption_key_of, open, seal, ALG, ALG_RAW};
pub use write::{
    compose, header, header_signed_by, unwrap, wrap, write, ComposeOptions, WriteOptions, PUBLIC,
};
#[cfg(feature = "envelope")]
pub use write::{open_copy, seal_copy};
// Reading every earlier shape as 1.6.
pub use read::{is_a, read_as};
// Chains and causal order.
pub use chain::{check_chain, next_link, Chain, Link};
pub use order::{causal_order, past_of, sees};
// The folds.
#[cfg(feature = "folds")]
pub use fold::{circle_state, members_then, owner_of, promise_stage, where_now};
pub use identity::identity_state;
