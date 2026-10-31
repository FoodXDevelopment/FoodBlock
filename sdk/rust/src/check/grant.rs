//! A grant's own rules (authority.md): its kind and scope, and the key, member, operator and successor grants.
use super::{f, is_label, s, Checker, W};
use crate::js::int;
use crate::prelude::*;

impl Checker<'_> {
    pub(super) fn grant(&self, state: &Value, refs: &Value, answering: bool) -> W {
        let g = |k: &str| state.get(k);
        let r = |k: &str| refs.get(k);
        let mut w: W = vec![];
        if !answering && !is_label(g("kind")) {
            w.push(f("required", "state.kind says what authority it gives"));
        }
        w.extend(self.status_shape(state, refs));
        // a key, its suite and its custodian are named by a key grant alone (core.md, section 2: no other block names a suite); a block
        // with a status is a stop or an answer, never a key grant (authority.md)
        if g("kind").and_then(Value::as_str) != Some("key") || g("status").is_some() {
            for key in ["public_key_sign", "public_key_encrypt", "suite", "custodian"] {
                if g(key).is_some() {
                    w.push(f("undeclared_field", format!("only a key grant names state.{key}")));
                }
            }
        }
        w.extend(self.whole_shape(g("depth"), "state.depth", 0.0));
        // A stop or an answer is never a grant, whatever scope it restates (authority.md): no grant rule reads it.
        // A grant may carry `scope.until` or not, whatever its kind (decision H11): with one it ends then, with none it lasts until its
        // author stops it. The protocol says what the word means, never whether someone may sign it.
        if let (Some(scope), false) = (g("scope"), answering) {
            w.extend(self.scope_shape(scope));
        }
        if !(answering || r("answers").is_some()) {
            match g("kind").and_then(Value::as_str) {
                Some("key") => w.extend(self.key_grant_shape(state, refs)),
                Some("member") => w.extend(self.member_shape(state, refs)),
                Some("operator") => {
                    if r("to").is_none() {
                        w.push(f("required", "an operator grant names the agent or machine it answers for (refs.to)"));
                    }
                }
                #[cfg(feature = "successor")]
                Some("successor") => w.extend(self.successor_shape(state, refs)),
                _ => {}
            }
        }
        w.extend(self.hash_shape(g("counted_to"), "state.counted_to"));
        // A grant to whoever holds a role of a circle (refs.to the circle, state.to_role the role's name).
        if let Some(role) = g("to_role") {
            if !role.as_str().is_some_and(|r| !r.is_empty()) {
                w.push(f("shape", "state.to_role is a role's name"));
            }
            if r("to").is_none() {
                w.push(f("required", "a grant to a role names the circle in refs.to"));
            }
            // Only a grant others act under goes to a role: a key, member, operator or successor grant is read by refs.to alone.
            if matches!(g("kind").and_then(Value::as_str), Some("key" | "member" | "operator" | "successor")) {
                w.push(f("shape", "a key, member, operator or successor grant is never to a role"));
            }
            // Whoever holds the role acts under it; it is not passed on (authority.md, To a role).
            if int(g("depth")).is_some_and(|d| d >= 1.0) {
                w.push(f("shape", "a grant to a role is not passed on: it carries no state.depth"));
            }
        }
        w
    }

    pub(super) fn scope_shape(&self, scope: &Value) -> W {
        let all = &self.spec.scope;
        if !scope.is_object() {
            return s("shape", format!("state.scope is {{ {} }}", all.join(", ")));
        }
        let mut w: W = scope
            .as_object()
            .unwrap()
            .keys()
            .filter(|k| !all.contains(k))
            .map(|k| {
                f(
                    "undeclared_field",
                    format!("scope.{k} is not part of a 1.7 scope ({})", all.join(", ")),
                )
            })
            .collect();
        if !scope
            .get("acts")
            .is_none_or(|a| a.as_array().is_some_and(|a| a.iter().all(Value::is_string)))
        {
            w.push(f("shape", "scope.acts lists acts"));
        }
        if !scope.get("parties").is_none_or(|a| {
            a.as_array()
                .is_some_and(|a| a.iter().all(|p| self.is("id", Some(p))))
        }) {
            w.push(f(
                "grammar",
                "scope.parties lists hashes (left out, it names no one beyond the principal)",
            ));
        } else if scope.get("parties").and_then(Value::as_array).is_some_and(|a| a.iter().any(|p| self.unknown_hash(Some(p)))) {
            w.push(f("unknown_suite", "scope.parties names a hash this reader does not know"));
        }
        w.extend(self.limit_shape(scope.get("limit"), "scope.limit"));
        w.extend(self.limit_shape(scope.get("each"), "scope.each"));
        if let Some(c) = scope.get("limit_commitment") {
            if scope.get("each").is_some() {
                w.push(f("shape", "a sealed limit keeps scope.each inside its commitment, never beside it"));
            }
            if !self.is("id", Some(c)) {
                w.push(f(
                    "grammar",
                    "scope.limit_commitment is a commitment (a salted hash, written like an id)",
                ));
            } else if self.unknown_hash(Some(c)) {
                w.push(f("unknown_suite", "scope.limit_commitment names a hash this reader does not know"));
            }
            if scope.get("limit").is_some() {
                w.push(f(
                    "shape",
                    "a scope carries a visible limit or a limit_commitment, never both",
                ));
            }
        }
        w.extend(self.duration_shape(scope.get("every"), "scope.every"));
        w.extend(self.duration_shape(scope.get("notice"), "scope.notice"));
        w
    }

    pub(super) fn key_grant_shape(&self, state: &Value, refs: &Value) -> W {
        let g = |k: &str| state.get(k);
        let mut w = vec![];
        if refs.get("subject").is_none() {
            w.push(f("required", "a key grant names the id it is for (refs.subject)"));
        }
        // The recovery pair is named only in the genesis (identity.md): a key grant that names it is refused (undeclared_field).
        if g("public_key_sign").is_none() && g("public_key_encrypt").is_none() {
            w.push(f("required", "a key grant names the new key (state.public_key_sign or public_key_encrypt)"));
        }
        w.extend(self.key_checks(state));
        if g("replaces").is_none() != g("counted_to").is_none() {
            w.push(f("required", "a rotation names both the key it replaces and that key's counted_to block"));
        }
        self.any_sign_key(g("replaces"), "replaces", &mut w);
        w.extend(self.hash_shape(g("counted_to"), "state.counted_to"));
        w.extend(self.hash_shape(g("custodian"), "state.custodian"));
        self.any_sign_key(g("recovery_key"), "recovery_key", &mut w);
        #[cfg(feature = "rekeys")]
        if g("epoch").is_some() {
            w.extend(self.whole_shape(g("epoch"), "state.epoch", 1.0));
            if refs.get("as").is_none() {
                w.push(f("required", "a rekey (state.epoch) is signed as the circle (refs.as)"));
            }
            if g("keys").is_none() || refs.get("after").is_none() {
                w.push(f("required", "a rekey holds the new private key sealed to each member (state.keys) and names epoch n-1 in refs.after"));
            }
        }
        w
    }

    pub(super) fn member_shape(&self, state: &Value, refs: &Value) -> W {
        let mut w = vec![];
        if refs.get("subject").is_none() {
            w.push(f("required", "a member grant names the circle (refs.subject)"));
        }
        // the same one circle, or neither (that a member grant names its circle is a finding of its own)
        let same_circle = match (refs.get("as"), refs.get("subject")) {
            (None, None) => true,
            (Some(Value::String(a)), Some(Value::String(c))) => a == c,
            _ => false,
        };
        if !same_circle {
            w.push(f("required", "a member grant is signed as the circle (refs.as)"));
        }
        if !state.get("roles").is_none_or(|x| {
            x.as_array()
                .is_some_and(|a| a.iter().all(|r| r.as_str().is_some_and(|r| !r.is_empty())))
        }) {
            w.push(f("shape", "state.roles lists the role names it gives (text)"));
        }
        w
    }

    #[cfg(feature = "successor")]
    pub(super) fn successor_shape(&self, state: &Value, refs: &Value) -> W {
        let g = |k: &str| state.get(k);
        let mut w = vec![];
        if refs.get("to").is_none() {
            w.push(f("required", "a successor grant names the successor (refs.to)"));
        }
        if g("witnesses").is_none() {
            w.push(f("required", "state.witnesses names who may record the event"));
        } else {
            w.extend(self.hash_list_shape(g("witnesses"), "state.witnesses"));
        }
        // A set names each witness once: a repeated one could never make `needed` (profiles/successor.md). The successor is never a
        // witness: no one records the event that gives them power.
        if let Some(ws) = g("witnesses").and_then(Value::as_array) {
            if (1..ws.len()).any(|i| ws[..i].contains(&ws[i])) {
                w.push(f("shape", "state.witnesses names each witness once"));
            }
            if refs.get("to").is_some_and(|to| ws.contains(to)) {
                w.push(f("shape", "the successor is not one of the witnesses"));
            }
        }
        let count = g("witnesses").and_then(Value::as_array).map_or(0, |a| a.len());
        // a number that is stated is a whole number from 1 to the witnesses; one that is left out means nothing holds (folds.md, Counts)
        if g("needed").is_some() && crate::js::count_stated(g("needed"), Some(count)).is_none() {
            w.push(f("shape", "state.needed is how many witnesses must record it (1 to their number)"));
        }
        if g("wait").is_none() {
            w.push(f("required", "state.wait is how long the trigger waits (a duration)"));
        } else {
            w.extend(self.duration_shape(g("wait"), "state.wait"));
        }
        if g("public_key_sign").is_some() {
            w.push(f("undeclared_field", "a successor gets decryption keys only, never signing keys"));
        }
        w
    }
}
