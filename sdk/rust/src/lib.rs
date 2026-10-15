//! # FoodBlock 1.6 for Rust, C and C++
//!
//! A block is `{ type, state, refs }`, signed by its author's key; its id is the hash of its canonical form (RFC 8785),
//! in the hash of the suite of the signing key (core.md). This crate speaks the protocol of `spec/core.md` and
//! `spec/modules/` (normative). Every closed list and grammar is read from `spec/protocol.json`: loaded at runtime from
//! bytes the caller gives ([`Spec::from_json`]), with the repository's copy built in as the default ([`spec`]). There
//! is no earlier version in the protocol: year zero. Old data enters once, through the converter (`legacy` feature).
//!
//! Blocks are plain JSON values (`serde_json::Value`): `{ hash, type, state, refs, signature }` (and `suite` when it
//! is not `std`), the same shape on every SDK and on the wire.
//!
//! ## Peers and profiles
//! - **micro** (always built): canonical form, the hash, signing (suite `std`), `valid`, its own chain, the grant
//!   check. `no_std` + `alloc` when built without the `std` feature.
//! - **edge** (`edge` feature): adds the folds (`folds`) and Pull, Push and discovery (`sync`).
//! - **node** (`node` feature, the default): adds envelopes (`envelope`).
//! - **suites** (`suites` feature): `p256` and `sm` beside `std`.
//! - **profiles**: `successor`, `ballots`, `rekeys`, `deposits` (spec/profiles).
//! - **legacy**: the one-time converter for pre-1.6 data (spec/legacy/converter.md).
//!
//! The names follow the JavaScript reference SDK: `sign` signs, `seal` encrypts, `open` opens.
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
pub mod regex;
pub mod sign;
pub mod spec;
pub mod time;
pub mod valid;
pub mod views;
pub mod strangers;
pub mod profiles;
pub mod tasks;
pub mod write;
#[cfg(feature = "legacy")]
pub mod legacy;

#[cfg(feature = "envelope")]
pub mod envelope;
#[cfg(feature = "door")]
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

/// The peers this build supports, from smallest to largest (protocol.json `peers`).
pub fn peers() -> &'static [&'static str] {
    if cfg!(all(
        feature = "folds",
        feature = "sync",
        feature = "envelope"
    )) {
        &["micro", "micro_acts", "edge", "node"]
    } else if cfg!(all(feature = "folds", feature = "sync")) {
        &["micro", "micro_acts", "edge"]
    } else {
        &["micro", "micro_acts"]
    }
}

// A block: its canonical form and its id.
pub use block::{create, create_in, hash, hash_hex, hash_in, hash_suite};
pub use canonical::{canonical, canonical_json};
// Signing (Ed25519).
#[cfg(feature = "std")]
pub use sign::generate_keypair;
pub use sign::{keypair_from_seed, keypair_from_seed_in, sign, sign_in, sign_message, verify, verify_in, verify_message, Keypair};
// The commitment.
#[cfg(feature = "std")]
pub use audience::new_salt;
pub use audience::{commit, commit_in, finds_self, reveal_for, salted_hash, salted_hash_in};
// Writing and the wire.
pub use check::{amount, check, confidence, money, refusals, terms, CheckOptions};
#[cfg(all(feature = "envelope", feature = "std"))]
pub use envelope::generate_encryption_keypair;
#[cfg(feature = "envelope")]
pub use envelope::{encryption_key_of, open, seal, ALG};
pub use write::{
    compose, header, header_signed_by, unwrap, wrap, write, ComposeOptions, WriteOptions, PUBLIC,
};
#[cfg(feature = "envelope")]
pub use write::{open_copy, seal_copy};
// Chains and causal order.
pub use chain::{check_chain, next_link, Chain, Link};
pub use order::{causal_order, past_of, sees};
// The folds.
#[cfg(feature = "folds")]
pub use fold::{circle_state, members_then, owner_of, promise_stage, where_now};
pub use identity::identity_state;
pub use valid::valid;
