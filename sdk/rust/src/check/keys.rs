//! Keys and suites (core.md, Suites), and the genesis (core.md section 4).
use super::{f, is_label, Checker, W};
use crate::prelude::*;

impl Checker<'_> {
    // ---- Suites and keys (core.md, Suites) ----
    // The suite a block's state names for its key: `state.suite`, else the default. `unknown_suite` when the name is
    // not a row of protocol.json `suites`.
    pub(super) fn suite_named(&self, name_value: Option<&Value>, field: &str, w: &mut W) -> Option<String> {
        match name_value {
            None => Some(self.spec.suite_default.clone()),
            Some(Value::String(n)) if !n.is_empty() && self.spec.suite(n).is_some() => Some(n.clone()),
            Some(other) => {
                w.push(f(
                    "unknown_suite",
                    format!(
                        "state.{field} names {}, which is not a suite this reader knows ({})",
                        other.as_str().map(String::from).unwrap_or_else(|| other.to_string()),
                        self.spec.suites.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(", ")
                    ),
                ));
                None
            }
        }
    }
    // A key against its suite's grammar; a key outside it is `unknown_suite` (protocol.json refusals.codes.block).
    pub(super) fn key_in_suite(&self, key: Option<&Value>, suite: &Option<String>, what: &str, encrypt: bool, w: &mut W) {
        let (Some(key), Some(suite)) = (key, suite) else { return };
        let Some(info) = self.spec.suite(suite) else { return };
        let (rule, re) = if encrypt { (&info.encrypt_key_rule, &info.encrypt_key_re) } else { (&info.sign_key_rule, &info.sign_key_re) };
        let ok = matches!(key, Value::String(k) if re.as_ref().is_some_and(|r| r.test(k)) && (encrypt || crate::sign::key_is_sound(k)));
        if !ok {
            w.push(f(
                "unknown_suite",
                format!("state.{what} is not a key of the suite {suite} ({rule}; an Ed25519 key canonical and not of small order)"),
            ));
        }
    }
    // A signing key of any suite (a key named without its suite beside it: `replaces`, `recovery_key`, `orderer`).
    pub(super) fn any_sign_key(&self, key: Option<&Value>, what: &str, w: &mut W) {
        let Some(key) = key else { return };
        let ok = matches!(key, Value::String(k) if self.spec.suites.iter().any(|s| s.sign_key_re.as_ref().is_some_and(|r| r.test(k))) && crate::sign::key_is_sound(k));
        if !ok {
            w.push(f("unknown_suite", format!("state.{what} is a signing key of one of the suites")));
        }
    }
    // state.suite, public_key_sign, public_key_encrypt, recovery_suite on a genesis or a key grant.
    pub(super) fn key_checks(&self, state: &Value) -> W {
        let mut w: W = vec![];
        let g = |k: &str| state.get(k);
        let suite = self.suite_named(g("suite"), "suite", &mut w);
        self.key_in_suite(g("public_key_sign"), &suite, "public_key_sign", false, &mut w);
        self.key_in_suite(g("public_key_encrypt"), &suite, "public_key_encrypt", true, &mut w);
        if g("recovery_suite").is_some() {
            self.suite_named(g("recovery_suite"), "recovery_suite", &mut w);
        }
        w
    }

    // The genesis (core.md section 4): the one block with no author, prev, after or seq, naming kind, at, audience and its
    // signing key. A suite, an encryption key, a custodian and the recovery pair are optional. Its audience is any block's: public, or
    // a list of commitments with a nonce (decision H10); a reader verifies it once it holds it.
    // What is missing or extra is `bad_genesis`; what is there but malformed is its grammar's code.
    pub(super) fn genesis_errors(&self, state: &Value, refs: &Value) -> W {
        let required = &self.spec.genesis_required;
        let optional = &self.spec.genesis_optional;
        let mut w: W = refs
            .as_object()
            .unwrap()
            .keys()
            .map(|k| f("bad_genesis", format!("a genesis has no refs (refs.{k})")))
            .collect();
        for k in state.as_object().unwrap().keys() {
            if !required.contains(k) && !optional.contains(k) {
                w.push(f(
                    "bad_genesis",
                    format!(
                        "a genesis names only {}, and {} if it has them (state.{k})",
                        required.join(", "),
                        optional.join(", ")
                    ),
                ));
            }
        }
        for k in required {
            if state.get(k).is_none() {
                w.push(f("bad_genesis", format!("a genesis names state.{k}")));
            }
        }
        if state.get("kind").is_some() && !is_label(state.get("kind")) {
            w.push(f("bad_genesis", "state.kind says what they are"));
        }
        w.extend(self.key_checks(state));
        let pair = state.get("recovery_key_hash").is_some() as u8 + state.get("recovery_reach").is_some() as u8;
        if pair == 1 {
            w.push(f(
                "bad_genesis",
                "recovery_key_hash and recovery_reach come together or not at all",
            ));
        }
        if state.get("recovery_suite").is_some() && pair != 2 {
            w.push(f("bad_genesis", "recovery_suite goes with the recovery pair"));
        }
        w.extend(self.hash_shape(state.get("recovery_key_hash"), "state.recovery_key_hash"));
        w.extend(self.duration_shape(state.get("recovery_reach"), "state.recovery_reach"));
        w.extend(self.hash_shape(state.get("custodian"), "state.custodian"));
        w
    }
}
