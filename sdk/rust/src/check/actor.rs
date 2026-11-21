//! An actor's own rules (core.md section 7): its kind, and a circle's parts, rows and clock (circles.md).
use super::{f, is_label, Checker, W};
use crate::prelude::*;

impl Checker<'_> {
    pub(super) fn actor(&self, state: &Value, answering: bool) -> W {
        let g = |k: &str| state.get(k);
        let mut w: W = vec![];
        if !answering && !is_label(g("kind")) {
            w.push(f("required", "state.kind says what it is: a person, an agent, a circle, a contact"));
        }
        // a key, its suite and her voices are named by a genesis or a key grant, never by any other actor (core.md, section 7)
        for key in ["public_key_sign", "suite", "reach", "clocks", "voices", "shown_key"] {
            // a circle names its clock (C20)
            if g(key).is_some() && !(key == "clocks" && kind_is_circle(state)) {
                w.push(f(
                    "undeclared_field",
                    format!("only a genesis or a key grant names state.{key}; a key comes in by a key grant"),
                ));
            }
        }
        let kind = g("kind").and_then(Value::as_str);
        if kind == Some("contact") && g("public_key_encrypt").is_some() {
            w.push(f("undeclared_field", "a contact has no keys"));
        }
        // 1.9 stage 6 (circles.md, C1, C3, C10, C20): a circle states `pack` (whole parts), `rules` (rows) and `clocks`, each optional
        if kind == Some("circle") {
            w.extend(self.circle_shape(state));
        } else {
            for key in ["pack", "rules"] {
                if g(key).is_some() {
                    w.push(f("undeclared_field", format!("only a circle states state.{key}")));
                }
            }
        }
        if g("public_key_encrypt").is_some() {
            w.extend(self.key_checks(&json!({ "public_key_encrypt": g("public_key_encrypt") })));
        }
        w
    }

    // A circle's founding block or version (circles.md): `pack` an amount of whole parts (`unit` `part`, at least 1, no `of`); `rules` a
    // non-empty list of rows, each `{ parts, scope }` or `{ to, needed, scope }`, numbers whole and at least 1, `scope` a grant's scope; a
    // parts row only where the circle states a pack.
    fn circle_shape(&self, state: &Value) -> W {
        let mut w = vec![];
        let pack = state.get("pack");
        if let Some(p) = pack {
            let ok = crate::decimal::Amount::of(Some(p)).is_some_and(|a| {
                a.kind.unit == "part" && a.kind.of.is_none() && super::is_whole_parts(&a.value) && a.value.is_pos()
            });
            if !ok {
                w.push(f("shape", "state.pack is a circle's parts: { value: a whole number of at least 1, unit: \"part\" }, with no of"));
            }
        }
        if let Some(rules) = state.get("rules") {
            let is_id = |x: &str| self.spec.is("id", x);
            match rules.as_array() {
                Some(rows) if !rows.is_empty() => {
                    for (i, r) in rows.iter().enumerate() {
                        if !row_shape_ok(r, pack.is_some(), &is_id) {
                            w.push(f("shape", format!("state.rules[{i}] is {{ parts, scope }} (on a circle with a pack) or {{ to, needed, scope }}: numbers whole and at least 1, never all and never a share")));
                        } else if let Some(scope) = r.get("scope") {
                            // a row's scope may name the circle's things in `what` (C4): a row has no refs of its own
                            let mut plain = scope.clone();
                            let what = plain.as_object_mut().and_then(|m| m.remove("what"));
                            let what_ok = what.as_ref().is_none_or(|x| match x {
                                Value::String(t) => is_id(t),
                                Value::Array(a) => !a.is_empty() && a.iter().all(|t| t.as_str().is_some_and(is_id)),
                                _ => false,
                            });
                            if !what_ok {
                                w.push(f("shape", format!("state.rules[{i}].scope.what is one id or a list of ids")));
                            }
                            // C12: a row's `every` needs no `until` (a grant's states it with `limit` and `until`, stage 4 A2)
                            w.extend(self.scope_shape(&plain).into_iter().filter(|x| !x.detail.starts_with("scope.every goes with")));
                        }
                    }
                }
                _ => w.push(f("shape", "state.rules is a non-empty list of rows")),
            }
        }
        w
    }
}

fn kind_is_circle(state: &Value) -> bool {
    state.get("kind").and_then(Value::as_str) == Some("circle")
}

/// The shape of a row (C10, `shapes.row`): exactly `{ parts, scope }` or `{ to, needed, scope }`, every number whole and at least 1, never
/// `all` and never a share; `to` one id or a non-empty list of ids. A parts row on a circle with no `pack` is out of shape (C3).
fn row_shape_ok(r: &Value, has_pack: bool, is_id: &dyn Fn(&str) -> bool) -> bool {
    let Some(o) = r.as_object() else { return false };
    let mut keys: Vec<&str> = o.keys().map(String::as_str).collect();
    keys.sort_unstable();
    let count = |k: &str| o.get(k).and_then(Value::as_u64).is_some_and(|n| n >= 1);
    if !o.get("scope").is_some_and(Value::is_object) {
        return false;
    }
    match keys.as_slice() {
        ["parts", "scope"] => has_pack && count("parts"),
        ["needed", "scope", "to"] => {
            let to_ok = match o.get("to") {
                Some(Value::String(s)) => is_id(s),
                Some(Value::Array(a)) => !a.is_empty() && a.iter().all(|x| x.as_str().is_some_and(is_id)) && a.iter().enumerate().all(|(i, x)| !a[..i].contains(x)),
                _ => false,
            };
            to_ok && count("needed")
        }
        _ => false,
    }
}
