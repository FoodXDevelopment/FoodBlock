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
        // An encryption key may name its own algorithm (core.md, section 2; protocol.json `encrypt_keys`): an `xwing:` key must match its
        // grammar (`grammar`); a named key whose name this reader does not know is skipped, never refused: the rest of the block stands.
        if encrypt {
            if let Value::String(k) = key {
                let ek = self.spec.protocol.get("encrypt_keys");
                let text = |p: &str| ek.and_then(|e| crate::js::get(e, p)).and_then(Value::as_str);
                let re = |g: Option<&str>| g.and_then(|g| crate::regex::Regex::new(g).ok());
                if let Some(prefix) = text("xwing.prefix").filter(|p| k.starts_with(p)) {
                    if !re(text("xwing.grammar")).is_some_and(|r| r.test(k)) {
                        w.push(f("grammar", format!("state.{what} is an {prefix} key: {prefix} and 2,432 lowercase hex characters (protocol.json encrypt_keys)")));
                    }
                    return;
                }
                if info.encrypt_key_re.as_ref().is_some_and(|r| r.test(k)) || re(text("named")).is_some_and(|r| r.test(k)) {
                    return;
                }
            }
        }
        let (rule, re) = if encrypt { (&info.encrypt_key_rule, &info.encrypt_key_re) } else { (&info.sign_key_rule, &info.sign_key_re) };
        let ok = matches!(key, Value::String(k) if re.as_ref().is_some_and(|r| r.test(k)) && (encrypt || crate::sign::key_is_sound(k)));
        if !ok {
            w.push(f(
                "unknown_suite",
                format!("state.{what} is not a key of the suite {suite} ({rule}; an Ed25519 key canonical and not of small order)"),
            ));
        }
    }
    // A signing key of any suite (a key named without its suite beside it: a key grant's `shown_key`).
    pub(super) fn any_sign_key(&self, key: Option<&Value>, what: &str, w: &mut W) {
        let Some(key) = key else { return };
        let ok = matches!(key, Value::String(k) if self.spec.suites.iter().any(|s| s.sign_key_re.as_ref().is_some_and(|r| r.test(k))) && crate::sign::key_is_sound(k));
        if !ok {
            w.push(f("unknown_suite", format!("state.{what} is a signing key of one of the suites")));
        }
    }
    // state.suite, public_key_sign, public_key_encrypt on a genesis or a key grant.
    pub(super) fn key_checks(&self, state: &Value) -> W {
        let mut w: W = vec![];
        let g = |k: &str| state.get(k);
        let suite = self.suite_named(g("suite"), "suite", &mut w);
        self.key_in_suite(g("public_key_sign"), &suite, "public_key_sign", false, &mut w);
        self.key_in_suite(g("public_key_encrypt"), &suite, "public_key_encrypt", true, &mut w);
        w
    }

    // The genesis (core.md section 4): the one block with no author, prev, after or seq, naming kind, at, audience and its
    // signing key. A suite, an encryption key, a reach and a clock are optional, the clock required with a reach. Its audience is any block's: public, or
    // a list of commitments with a nonce; a reader verifies it once it holds it.
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
        // a genesis that states her list: its own key is the `key` voice of that list that names it; else it is no genesis
        if let Some(vs) = state.get("voices").and_then(Value::as_array) {
            let own = state.get("public_key_sign").and_then(Value::as_str);
            if !vs.iter().any(|v| v.get("key").and_then(Value::as_str).is_some_and(|k| Some(k) == own)) {
                w.push(f("shape", "a genesis whose key is no voice of its own list is no genesis"));
            }
        }
        // her first voice's reach is read on her clock: a genesis with a reach names its clocks (identity.md, Her voices)
        // her first voice's reach is a duration
        w.extend(self.duration_shape(state.get("reach"), "state.reach"));
        if state.get("reach").is_some() && state.get("clocks").is_none() {
            w.push(f("bad_genesis", "a genesis that states a reach states its clocks (blocks.md, A named clock)"));
        }
        w
    }
}
