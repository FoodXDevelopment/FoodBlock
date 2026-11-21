//! A grant's own rules (authority.md): its kind and scope, and the key and operator grants.
use super::{f, is_label, s, Checker, W};
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
        // a key, its suite and her voices are named by a key grant alone (core.md, section 7: no other block names a suite); a block
        // with a status is a stop or an answer, never a key grant (authority.md)
        if g("kind").and_then(Value::as_str) != Some("key") || g("status").is_some() {
            for key in ["public_key_sign", "public_key_encrypt", "suite", "voices", "clocks", "shown_key"] {
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
                Some("operator") => {
                    if r("to").is_none() {
                        w.push(f("required", "an operator grant names the agent or machine it answers for (refs.to)"));
                    }
                }
                _ => {}
            }
        }
        w.extend(self.hash_shape(g("counted_to"), "state.counted_to"));
        // 1.9 stage 4 (A4): a grant with `on` or `refs.what` names the line it is counted on
        if !answering && (g("scope").and_then(|sc| sc.get("on")).is_some() || r("what").is_some()) && r("meter").is_none() && g("kind").and_then(Value::as_str) != Some("key") {
            w.push(f("required", "a grant with scope.on or refs.what names refs.meter: the line every block under it is counted on"));
        }
        w
    }

    /// `scope.types` is a list of text (a name that is no type covers nothing: matched exactly, never checked).
    fn types_ok(&self, types: &Value) -> bool {
        types.as_array().is_some_and(|a| a.iter().all(Value::is_string))
    }

    /// `scope.parties` is a list of ids (the ids its blocks may deal with).
    fn parties_listed(&self, parties: &Value) -> bool {
        parties.as_array().is_some_and(|a| a.iter().all(|p| self.is("id", Some(p))))
    }

    /// The fields of a scope that are present but not readable, sorted: every field the write check refuses in
    /// `state.scope` (`scope_shape`, the times and the durations), by the same rules, and a name that is no scope field. Nothing
    /// is read as a default here: a caller that finds one holds the grant to no word (authority.md, `state.scope`).
    pub(super) fn scope_junk(&self, scope: &Value) -> Vec<String> {
        let Some(map) = scope.as_object() else { return vec!["scope".into()] };
        let mut junk: Vec<String> = map
            .iter()
            .filter(|(k, v)| {
                let (k, v) = (k.as_str(), Some(*v));
                match k {
                    "types" => !v.is_some_and(|a| self.types_ok(a)),
                    "parties" | "on" => !v.is_some_and(|p| self.parties_listed(p) && !p.as_array().is_some_and(|a| a.iter().any(|x| self.unknown_hash(Some(x))))),
                    "limit" | "each" => !self.limit_shape(v, k).is_empty(),
                    "every" => !self.duration_shape(v, k).is_empty(),
                    "until" | "deadline" => !self.time_shape(v, k).is_empty(),
                    "clocks" => v.is_none_or(|c| crate::tasks::clocks_of(c).is_none()),
                    "fallback" => !v.and_then(Value::as_str).is_some_and(|f| self.list("fallbacks").iter().any(|x| x == f)),
                    "ends_on" => v.is_none_or(|e| !self.ends_on_shape(e).is_empty()),
                    _ => true,
                }
            })
            .map(|(k, _)| k.clone())
            .collect();
        // sorted as canonical JSON sorts keys, so the same scope gives the same answer whatever order its text was written in
        junk.sort_by(|a, b| crate::js::cmp16(a, b));
        junk
    }

    /// `scope.ends_on` (protocol.json `shapes.ends_on`): both keys, `witness` an id (`grammar`), `said` text; anything else `shape`.
    fn ends_on_shape(&self, e: &Value) -> W {
        let want = self.list("shapes.ends_on");
        let Some(o) = e.as_object().filter(|o| o.len() == want.len() && want.iter().all(|k| o.contains_key(k.as_str()))) else {
            return s("shape", "scope.ends_on is { witness, said }");
        };
        if !o.get("said").is_some_and(Value::is_string) {
            return s("shape", "scope.ends_on.said is text");
        }
        if !self.is("id", o.get("witness")) {
            return s("grammar", "scope.ends_on.witness is an id");
        }
        vec![]
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
            .map(|k| f("undeclared_field", format!("scope.{k} is not part of a 1.9 scope ({})", all.join(", "))))
            .collect();
        if !scope.get("types").is_none_or(|a| self.types_ok(a)) {
            w.push(f("shape", "scope.types lists types"));
        }
        for k in ["parties", "on"] {
            if !scope.get(k).is_none_or(|a| self.parties_listed(a)) {
                w.push(f("grammar", format!("scope.{k} lists ids")));
            } else if scope.get(k).and_then(Value::as_array).is_some_and(|a| a.iter().any(|p| self.unknown_hash(Some(p)))) {
                w.push(f("unknown_suite", format!("scope.{k} names a hash this reader does not know")));
            }
        }
        w.extend(self.limit_shape(scope.get("limit"), "scope.limit"));
        w.extend(self.limit_shape(scope.get("each"), "scope.each"));
        w.extend(self.duration_shape(scope.get("every"), "scope.every"));
        // 1.9 stage 4 (A2): `every` is stated only with `limit` and `until` (`shape`, `required`): with no limit it is no shape of a renewing
        // limit (`shape`); with no until the end it needs is missing (`required`), as the oracle reads the pair (end pass 2026-11-20)
        if scope.get("every").is_some() && scope.get("limit").is_none() {
            w.push(f("shape", "scope.every goes with scope.limit"));
        }
        if scope.get("every").is_some() && scope.get("until").is_none() {
            w.push(f("required", "scope.every goes with scope.until"));
        }
        if let Some(c) = scope.get("clocks") {
            if crate::tasks::clocks_of(c).is_none() {
                w.push(f("shape", "scope.clocks is { names, needed }"));
            }
        }
        // 1.9 (O2): her own ending term, `{ witness, said }`
        if let Some(e) = scope.get("ends_on") {
            w.extend(self.ends_on_shape(e));
        }
        // G15: `fallback` is a closed list of one, stated only with `deadline`
        if let Some(fb) = scope.get("fallback") {
            if !fb.as_str().is_some_and(|x| self.list("fallbacks").iter().any(|y| y == x)) {
                w.push(f("shape", "scope.fallback is one of protocol.json fallbacks (lowest)"));
            }
            if scope.get("deadline").is_none() {
                w.push(f("shape", "scope.fallback is stated only with scope.deadline"));
            }
        }
        w
    }

    /// A machine's fence (patterns/machines.md, A machine's fence): `{ ranges, hours, safe_state, work_alone }`, each optional.
    pub(super) fn fence_shape(&self, env: &Value) -> W {
        let Some(o) = env.as_object() else { return s("shape", "state.fence is { ranges, hours, safe_state, work_alone }") };
        let mut w: W = vec![];
        for k in o.keys().filter(|k| !["ranges", "hours", "safe_state", "work_alone"].contains(&k.as_str())) {
            w.push(f("undeclared_field", format!("fence.{k} is not part of a fence")));
        }
        if let Some(rs) = o.get("ranges") {
            let mut seen: Vec<&str> = vec![];
            match rs.as_array().filter(|a| !a.is_empty()) {
                None => w.push(f("shape", "fence.ranges lists { of, min, max }, at least one")),
                Some(list) => {
                    for r in list {
                        let ok = r.as_object().is_some_and(|m| {
                            m.keys().all(|k| ["of", "min", "max"].contains(&k.as_str()))
                                && m.get("of").and_then(Value::as_str).is_some_and(|n| !n.is_empty() && !seen.contains(&n))
                                && (m.contains_key("min") || m.contains_key("max"))
                                && ["min", "max"].iter().all(|k| m.get(*k).is_none_or(amount_ok))
                                && match (m.get("min"), m.get("max")) {
                                    (Some(a), Some(b)) => {
                                        a.get("unit") == b.get("unit") && crate::decimal::compare(a.get("value"), b.get("value")).is_some_and(|o| o.is_le())
                                    }
                                    _ => true,
                                }
                        });
                        if !ok {
                            w.push(f("shape", "fence.ranges item is { of (a name, once), min and or max (amounts in one unit, min no more than max) }"));
                        } else if let Some(n) = r.get("of").and_then(Value::as_str) {
                            seen.push(n);
                        }
                    }
                }
            }
        }
        if let Some(h) = o.get("hours") {
            match h.as_array().filter(|a| !a.is_empty()) {
                None => w.push(f("shape", "fence.hours lists { from, to }, at least one")),
                Some(list) => {
                    for e in list {
                        let texts = e.as_object().filter(|m| m.len() == 2).and_then(|m| Some((m.get("from")?.as_str()?, m.get("to")?.as_str()?)));
                        match texts {
                            None => w.push(f("shape", "fence.hours item is { from, to }")),
                            Some((a, b)) if !self.spec.is("hour", a) || !self.spec.is("hour", b) => {
                                w.push(f("grammar", "fence.hours from and to are HH:MM with Z or +HH:MM / -HH:MM"))
                            }
                            Some(_) if crate::grant_fence::hours_minutes(&json!([e])).is_none() => {
                                w.push(f("shape", "fence.hours item starts and ends at different minutes"))
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
        if !o.get("safe_state").is_none_or(|v| v.as_str().is_some_and(|t| !t.is_empty())) {
            w.push(f("shape", "fence.safe_state is the name of a safe state (text)"));
        }
        w.extend(self.duration_shape(o.get("work_alone"), "fence.work_alone"));
        w
    }

    // A key grant's list as written, a value check 2 reads (core.md, section 8; identity.md, Her voices): `voices` and a key under a voice
    // (`public_key_sign`) never both, `clocks` only with `voices`, and `clocks` with any `reach` or `wait` above zero (`shape`).
    pub(super) fn key_list_shape(&self, state: &Value) -> W {
        let g = |k: &str| state.get(k);
        let mut w = vec![];
        if g("voices").is_some() && g("public_key_sign").is_some() {
            w.push(f("shape", "a key grant states her list or adds one key under a voice, never both"));
        }
        if g("kind").and_then(Value::as_str) == Some("key") && g("clocks").is_some() && g("voices").is_none() {
            w.push(f("shape", "state.clocks is her list's clock: it goes with state.voices"));
        }
        // a list that states a wait above zero, or any reach, states her clock (identity.md, Her voices)
        let timed = g("voices").and_then(Value::as_array).is_some_and(|vs| {
            vs.iter().any(|v| v.get("reach").is_some() || v.get("wait").and_then(Value::as_str).and_then(crate::time::parse_duration).is_some_and(|d| d.years + d.months + d.days + d.ms > 0))
        });
        if timed && g("clocks").is_none() {
            w.push(f("shape", "a list that states a wait above zero or a reach states its clock (state.clocks)"));
        }
        w
    }

    // A key grant (identity.md, Her voices): about her (`refs.subject`); it states her whole list (`voices`, naming in `refs.updates` the
    // list it replaces, with its clock), or adds one key under its signer's voice (`public_key_sign`), or an encryption key alone; a key
    // named by hash shows itself in `shown_key`. Never both a list and a key under a voice; a reach is a voice's, never the grant's.
    pub(super) fn key_grant_shape(&self, state: &Value, refs: &Value) -> W {
        let g = |k: &str| state.get(k);
        let mut w = vec![];
        if refs.get("subject").is_none() {
            w.push(f("required", "a key grant names the id it is for (refs.subject)"));
        }
        if g("voices").is_none() && g("public_key_sign").is_none() && g("public_key_encrypt").is_none() {
            w.push(f("required", "a key grant states her list (state.voices), a key under a voice (public_key_sign) or an encryption key"));
        }
        if g("voices").is_some() && refs.get("updates").is_none() {
            w.push(f("required", "a key grant that states her list names the list it replaces (refs.updates)"));
        }
        if g("reach").is_some() {
            w.push(f("undeclared_field", "a reach is a voice's (state.voices[].reach) or a genesis's, never a key grant's"));
        }
        w.extend(self.key_checks(state));
        self.any_sign_key(g("shown_key"), "shown_key", &mut w);
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
}

/// The fields of a scope that are present but not readable (see `Checker::scope_junk`); a scope that is no object is itself unreadable.
pub(crate) fn scope_junk(scope: &Value) -> Vec<String> {
    Checker { spec: crate::spec() }.scope_junk(scope)
}

/// Whether a grant's `state.fence` is readable (the write check finds nothing in it).
pub(crate) fn fence_ok(env: &Value) -> bool {
    Checker { spec: crate::spec() }.fence_shape(env).is_empty()
}
/// An amount `{ value, unit }` (a decimal string and text): any sign.
pub(crate) fn amount_ok(v: &Value) -> bool {
    Checker { spec: crate::spec() }.amount_shape(Some(v), "amount").is_empty()
}

