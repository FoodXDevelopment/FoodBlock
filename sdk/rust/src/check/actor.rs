//! An actor's own rules (core.md section 7): its kind, and a circle's roles, removal and needed hands.
use super::{f, is_label, s, Checker, W};
use crate::js::{count_stated, is_obj, keys_within};
use crate::prelude::*;

impl Checker<'_> {
    pub(super) fn actor(&self, state: &Value, answering: bool) -> W {
        let g = |k: &str| state.get(k);
        let mut w: W = vec![];
        if !answering && !is_label(g("kind")) {
            w.push(f("required", "state.kind says what it is: a person, an agent, a circle, a contact"));
        }
        // a key, its suite and its custodian are named by a genesis or a key grant, never by any other actor (core.md, sections 2 and 4)
        for key in ["public_key_sign", "recovery_key_hash", "recovery_reach", "recovery_suite", "suite", "custodian"] {
            if g(key).is_some() {
                w.push(f(
                    "undeclared_field",
                    format!("only a genesis names state.{key}; a key comes in by a key grant"),
                ));
            }
        }
        let kind = g("kind").and_then(Value::as_str);
        if kind == Some("contact") && g("public_key_encrypt").is_some() {
            w.push(f("undeclared_field", "a contact has no keys"));
        }
        w.extend(self.roles_shape(g("roles"), kind == Some("circle")));
        if !g("removal").is_none_or(|x| {
            is_obj(Some(x))
                && keys_within(x, &self.list("circle.removal"))
                && count_stated(x.get("needed"), None).is_some()
        }) {
            w.push(f("shape", "state.removal is { needed: N }, how many other holders of remove must agree to remove one who holds admit or remove"));
        }
        let powers = self.list("circle.needed");
        if !g("needed").is_none_or(|x| {
            x.as_object().is_some_and(|m| m.iter().all(|(k, n)| powers.contains(k) && (count_stated(Some(n), None).is_some() || n.as_str() == Some("all") || n.as_object().is_some_and(|o| o.len() == 1 && o.get("of_members").and_then(Value::as_str).and_then(crate::bound::share_of_members).is_some()))))
        }) {
            w.push(f("shape", format!("state.needed is {{ power: N }}, how many holders of {} must sign an act", powers.join(" or "))));
        }
        w.extend(self.hash_shape(g("custodian"), "state.custodian"));
        if g("public_key_encrypt").is_some() {
            w.extend(self.key_checks(&json!({ "public_key_encrypt": g("public_key_encrypt") })));
        }
        w
    }

    // The powers a circle role may hold: the protocol's, and every optional profile's (a node that has never heard of
    // a profile still accepts a block that uses its power).
    pub(super) fn all_powers(&self) -> Vec<String> {
        let mut out = self.spec.powers.clone();
        if let Some(Value::Object(profiles)) = self.spec.protocol.get("optional_profiles") {
            for p in profiles.values() {
                out.extend(crate::spec::strings_pub(p.get("powers")));
            }
        }
        out
    }

    // A circle's roles: [{ name, powers }], the powers from the closed list (and the profiles'); the founder holds
    // the first role, so the list is not empty.
    pub(super) fn roles_shape(&self, roles: Option<&Value>, circle: bool) -> W {
        let allowed = self.all_powers();
        match roles {
            None => {
                if circle {
                    s("bad_roles", "a circle lists its roles: state.roles [{ name, powers }]; the founder holds the first")
                } else {
                    vec![]
                }
            }
            Some(Value::Array(list)) if !list.is_empty() => {
                let mut w = vec![];
                for (i, role) in list.iter().enumerate() {
                    let ok = is_obj(Some(role))
                        && keys_within(role, &["name".to_string(), "powers".to_string()])
                        // a name with `#` could never be named as circle#role; each power is listed once
                        && role.get("name").and_then(Value::as_str).is_some_and(|n| !n.is_empty() && !n.contains('#'))
                        && role.get("powers").and_then(Value::as_array).is_some_and(|p| {
                            p.iter().all(|x| x.as_str().is_some_and(|x| allowed.iter().any(|a| a == x)))
                                && p.iter().enumerate().all(|(i, x)| !p[..i].contains(x))
                        });
                    if !ok {
                        w.push(f(
                            "bad_roles",
                            format!("state.roles[{i}] is {{ name (text, no #), powers (each once, from {}) }}", allowed.join(", ")),
                        ));
                    }
                    // A role is named once: two roles of one name would leave which powers its holders have to a reader.
                    let name = role.get("name");
                    if name.is_some() && list[..i].iter().any(|r| r.get("name") == name) {
                        w.push(f("bad_roles", format!("state.roles[{i}] repeats the name of an earlier role")));
                    }
                }
                w
            }
            Some(_) => s("bad_roles", "state.roles is a list of roles with at least the founder's first role"),
        }
    }
}
