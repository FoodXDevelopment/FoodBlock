//! The write check (core.md section 8, the checks that read a block's bytes): `refusals(type, state, refs)` says what is wrong with a block as every
//! node checks it before writing: `[{ code, detail }]`, one entry per rule found, in the order of protocol.json's
//! `refusals.codes.block` (empty when it is a well-formed block). The code carries the meaning; the detail is free
//! text for people. `check` gives the details alone. Every list and grammar it reads comes from protocol.json; none is
//! written here. There is no earlier version to read: year zero.
use crate::canonical::canonical;
pub use crate::error::Refusal;
use crate::js::{cmp16, get, int, is_obj, keys_within, str_of, type_of, Index};
use crate::prelude::*;
use crate::spec::Spec;
use crate::time::is_time;
use time::time_places;

mod actor;
mod grant;
mod ids;
mod keys;
mod promise;
mod shapes;
mod strict;
mod time;
mod transfer;

/// What the check may look up: `schemas` (hash → schema block) so a named schema's fields and roles count as
/// declared (a schema not among them is refused); `held` (hash → block) so a child grant is checked against its parent,
/// a deal block against the block it answers, and a promise's ask against the grant it acts under.
#[derive(Default, Clone, Copy)]
pub struct CheckOptions<'a> {
    pub schemas: Option<&'a Index>,
    pub held: Option<&'a Index>,
}

type W = Vec<Refusal>;

/// A label (core.md section 7: `state.kind`, "a label"): a non-empty string. Not JavaScript truthiness, which lets `true`, `1`, an array or an object through.
fn is_label(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::String(s)) if !s.is_empty())
}

struct Checker<'a> {
    spec: &'a Spec,
}

/// One finding: a code from protocol.json (`refusals.codes`) and free text for people.
fn f(code: &str, detail: impl Into<String>) -> Refusal {
    Refusal::new(code, detail)
}
fn s(code: &str, detail: impl Into<String>) -> W {
    vec![f(code, detail)]
}

impl<'a> Checker<'a> {
    fn is(&self, rule: &str, v: Option<&Value>) -> bool {
        matches!(v, Some(Value::String(t)) if self.spec.is(rule, t))
    }
    fn list(&self, path: &str) -> Vec<String> {
        self.spec.list(path)
    }

    fn stop_shape(&self, stop: Option<&Value>) -> W {
        let stops = &self.spec.stops;
        let two: Vec<&String> = stops.iter().take(2).collect();
        let ok = matches!(stop, Some(Value::String(x)) if two.contains(&x))
            || (is_obj(stop)
                && keys_within(stop.unwrap(), &["occurrences".to_string()])
                && stop
                    .unwrap()
                    .get("occurrences")
                    .and_then(Value::as_array)
                    .is_some_and(|a| a.iter().all(|t| is_time(Some(t)) || self.is("hash", Some(t)))));
        if ok {
            vec![]
        } else {
            s(
                "bad_status",
                format!(
                    "state.stop is {}, or {{ occurrences: [start times, or the hashes that started them] }}",
                    two.iter()
                        .map(|x| x.as_str())
                        .collect::<Vec<_>>()
                        .join(" or ")
                ),
            )
        }
    }

    fn audience_shape(&self, state: &Value) -> W {
        let audience = state.get("audience");
        if audience.and_then(Value::as_str) == Some("public") {
            return vec![];
        }
        let Some(list) = audience
            .and_then(Value::as_array)
            .filter(|a| !a.is_empty() && a.iter().all(|w| self.is("id", Some(w))))
        else {
            return s(
                "audience",
                "state.audience is \"public\" or a list of commitments (salted hashes)",
            );
        };
        let mut w = vec![];
        let sorted = list
            .windows(2)
            .all(|p| cmp16(str_of(Some(&p[0])), str_of(Some(&p[1]))).is_lt());
        if !sorted {
            w.push(f(
                "audience",
                "state.audience commitments are sorted, each once",
            ));
        }
        if list.iter().any(|c| self.unknown_hash(Some(c))) {
            w.push(f("unknown_suite", "state.audience names a commitment whose hash this reader does not know"));
        }
        if !self.is("nonce", state.get("nonce")) {
            w.push(f(
                "audience",
                "a private block carries state.nonce (16 random bytes, hex)",
            ));
        }
        w
    }

    fn status_shape(&self, state: &Value, refs: &Value) -> W {
        let Some(status) = state.get("status") else {
            return if state.get("stop").is_none() {
                vec![]
            } else {
                s("bad_status", "state.stop goes with status stopped")
            };
        };
        let mut w = vec![];
        if refs.get("answers").is_none() && refs.get("updates").is_none() {
            w.push(f("status_not_answer", "only an answer (refs.answers) or the author stopping their own (refs.updates) carries a status"));
        }
        if !status
            .as_str()
            .is_some_and(|x| self.spec.statuses.iter().any(|a| a == x))
        {
            w.push(f(
                "bad_status",
                format!("state.status is one of {}", self.spec.statuses.join(", ")),
            ));
        }
        if status.as_str() == Some("stopped") {
            w.extend(self.stop_shape(state.get("stop")));
        } else if state.get("stop").is_some() {
            w.push(f("bad_status", "state.stop goes with status stopped"));
        }
        w
    }

    // Every field, over all optional profiles, that a profile adds to `where_` (`every`, `grant`...).
    fn profile_fields(&self, where_: &str) -> Vec<String> {
        let mut out = Vec::new();
        if let Some(Value::Object(profiles)) = self.spec.protocol.get("optional_profiles") {
            for p in profiles.values() {
                out.extend(crate::spec::strings_pub(p.get("fields").and_then(|x| x.get(where_))));
            }
        }
        out
    }

    fn rules(&self, type_name: &str, state: &Value, refs: &Value, held: Option<&Index>) -> W {
        let g = |k: &str| state.get(k);
        let r = |k: &str| refs.get(k);
        let mut w: W = vec![];
        // An answer (refs.answers) or the author stopping their own (updates with a status) is exempt from the
        // type's required fields (core.md, section 7).
        let answering = r("answers").is_some() || (r("updates").is_some() && g("status").is_some());
        // An answer carries a status (core.md section 7); the one exception is a counter-offer, a promise that answers with no status.
        if r("answers").is_some() && g("status").is_none() && type_name != "promise" {
            w.push(f("required", "an answer carries state.status"));
        }
        match type_name {
            "actor" => w.extend(self.actor(state, answering)),
            "transfer" => w.extend(self.transfer(state, refs, answering)),
            "promise" => w.extend(self.promise(state, refs, held, answering)),
            "grant" => w.extend(self.grant(state, refs, answering)),
            _ => {}
        }
        w
    }

    // The fields and ref keys a closed block may name: the base, the profiles', and what its schema declares (when
    // the reader holds it).
    fn declared(
        &self,
        type_name: &str,
        refs: &Value,
        schemas: Option<&Index>,
    ) -> Option<(Vec<String>, Vec<String>, Vec<String>)> {
        let named = refs.get("schema");
        let schema = match (named, schemas) {
            (Some(h), Some(store)) => h.as_str().and_then(|h| store.get(h)),
            _ => None,
        };
        if named.is_some() && schema.is_none() {
            return None;
        }
        // Only a schema declares: a thing of kind schema (core.md, section 8). Any other block named there widens nothing.
        let schema = schema.filter(|s| type_of(s) == "thing" && get(s, "state.kind").and_then(Value::as_str) == Some("schema"));
        let mut fields = self.spec.every.clone();
        fields.extend(self.spec.fields(type_name));
        fields.extend(self.profile_fields("every"));
        fields.extend(self.profile_fields(type_name));
        if let Some(Value::Object(f)) = schema.and_then(|s| get(s, "state.fields")) {
            fields.extend(f.keys().cloned());
        }
        let mut roles = self.spec.ref_keys.clone();
        if let Some(Value::Array(r)) = schema.and_then(|s| get(s, "state.roles")) {
            roles.extend(r.iter().filter_map(Value::as_str).map(String::from));
        }
        // A promise's terms: the protocol's, and those its schema declares (`state.terms`, promises.md, Terms): a fold reads only the
        // terms it knows, so a term a schema adds binds no one and is data for the schema's readers.
        let mut terms = self.spec.terms.clone();
        if let Some(Value::Object(t)) = schema.and_then(|s| get(s, "state.terms")) {
            terms.extend(t.keys().cloned());
        }
        Some((fields, roles, terms))
    }

    // The field-level value rules that hold for every block, whatever its type (core.md, section 3).
    fn values(&self, state: &Value, refs: &Value, genesis: bool) -> W {
        let g = |k: &str| state.get(k);
        let mut w: W = vec![];
        w.extend(self.numbers_only_shapes(state, refs, genesis));
        // Marks are read the same way on every type, open or closed (things.md): exact { scheme, value } pairs.
        w.extend(self.marks_shape(g("marks"), "state.marks"));
        // Fields that hold an id, wherever they are written (core.md section 3, grammar): the block counted to, a custodian, a recovery
        // hash, who assisted, and the parties of an admission.
        for key in ["counted_to", "custodian", "recovery_key_hash", "assisted_by"] {
            w.extend(self.hash_shape(g(key), &format!("state.{key}")));
        }
        if let Some(p) = g("parties") {
            let items: Vec<&Value> = match p {
                Value::Array(a) => a.iter().collect(),
                other => vec![other],
            };
            for id in items {
                w.extend(self.hash_shape(Some(id), "state.parties"));
            }
        }
        // Keys and suites, wherever they are written (core.md, Suites): a key outside its suite's grammar, or a suite not known.
        w.extend(self.key_checks(state));
        for key in ["replaces", "recovery_key"] {
            self.any_sign_key(g(key), key, &mut w);
        }
        if !g("nonce").is_none_or(|n| self.is("nonce", Some(n))) {
            w.push(f("grammar", "state.nonce is 16 random bytes, hex"));
        }
        for flag in ["skip", "withheld"] {
            if !g(flag).is_none_or(|v| v == &Value::Bool(true)) {
                w.push(f("shape", format!("state.{flag} is true, or left out")));
            }
        }
        if !g("line").is_none_or(Value::is_string) {
            w.push(f("shape", "state.line is a line id"));
        }
        // An opening (privacy.md, A commitment) is { salt, value }, the salt in its grammar: a condition `opened` reads it.
        if let Some(o) = g("opening") {
            let ok = is_obj(Some(o)) && keys_within(o, &self.list("shapes.reveal")) && self.is("salt", o.get("salt")) && o.get("value").is_some();
            if !ok {
                w.push(f("shape", "state.opening is { salt, value }: the salt 16 bytes as 32 hex characters (privacy.md, A commitment)"));
            }
        }
        // A conditioned transfer (things.md, Transfers) carries its condition whole; a wrapper without its deadline or keepers is refused.
        if let Some(m) = g("condition").and_then(crate::tasks::condition_malformed) {
            w.push(f("shape", format!("state.condition: {m}")));
        }
        // a ruling's up_to is the harm it finds: money, or an amount of a thing (promises.md, A claim of invasion)
        if let Some(u) = g("up_to") {
            if !matches!(self.shape_of(u), Some("money" | "amount")) {
                w.push(f("shape", "state.up_to is money or an amount: the harm a ruling finds"));
            }
        }
        if !g("channel").is_none_or(Value::is_string) {
            w.push(f("shape", "state.channel is an open label (sms, ussd, voice, letter, meeting)"));
        }
        w
    }
    fn numbers_only_shapes(&self, state: &Value, _refs: &Value, genesis: bool) -> W {
        // Times, dates and durations are read where the protocol checks them (`time_fields_checked_in`): the state, its terms and
        // scope, and each line of its terms.
        let mut w: W = vec![];
        for (path, place) in time_places(state) {
            w.extend(self.times_in(Some(place), &path));
            w.extend(self.durations_in(Some(place), &path));
        }
        // a genesis's audience is read as any block's (decision H10): public, or a sorted list of commitments with a nonce
        let _ = genesis;
        if state.get("audience").is_some() {
            w.extend(self.audience_shape(state));
        }
        w.extend(self.where_shape(state.get("where")));
        w.extend(self.shapes_in(state, "state"));
        w
    }

    // The content checks of a block: the checks of core.md section 8 that look at its bytes alone. The block's context,
    // signature and key, and chain (checks 5, 6 and 7) need the context: `valid`.
    fn findings(&self, type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> (W, W) {
        let mut w = vec![];
        if !self.spec.is("type_name", type_name) {
            w.push(f("type_name", format!("{type_name} is not a type name (a lowercase word: letters, digits, underscore)")));
        }
        if !state.is_object() || !refs.is_object() {
            w.push(f("not_canonical", "a block is exactly { type, state, refs }, state and refs objects"));
            return (w, vec![]);
        }
        w.extend(self.strict_all(state, refs));
        w.extend(self.refs_grammar(refs));
        if canonical(type_name, state, refs).len() > self.spec.block_bytes {
            w.push(f(
                "size_limit",
                format!(
                    "a block's canonical body is at most {} bytes; link larger content by its hash",
                    self.spec.block_bytes
                ),
            ));
        }
        // a block nests at most limits.depth deep: the block is 1, its state and refs 2, each object or array inside one more
        if 1 + depth_of(state).max(depth_of(refs)) > self.spec.depth {
            w.push(f("size_limit", format!("a block nests at most {} deep (the block is 1, each object or array inside it one more)", self.spec.depth)));
        }
        if let Some(a) = refs.get("after") {
            let n = a.as_array().map(|x| x.len()).unwrap_or(1);
            if n > self.spec.after_heads {
                w.push(f(
                    "after_limit",
                    format!("refs.after names at most {} heads", self.spec.after_heads),
                ));
            }
        }
        let g = |k: &str| state.get(k);
        // A genesis names its own signing key. (Only a genesis does; core.md section 4.)
        // core.md section 4: a genesis is the one actor with no author. An actor with no author and no key is a malformed genesis.
        if type_name == "actor" && (g("public_key_sign").is_some() || refs.get("author").is_none()) {
            w.extend(self.genesis_errors(state, refs));
            w.extend(self.values(state, refs, true));
            return (w, vec![]);
        }
        // Any other block: the common five (core.md, section 5).
        let clockless_ok = matches!(type_name, "observe" | "transform" | "transfer");
        if refs.get("author").is_none() {
            w.push(f("chain", "refs.author names who said it"));
        }
        if !int(g("seq")).is_some_and(|n| n >= 1.0) {
            w.push(f("chain", "state.seq is its place in its signing key's chain (1, 2, 3...)"));
        }
        if refs.get("prev").is_none() {
            w.push(f("chain", "refs.prev names the key's previous block (or the block that brought the key in)"));
        }
        if g("audience").is_none() {
            w.push(f("chain", "state.audience is public, or a sorted list of commitments"));
        }
        if g("at").is_none() && !clockless_ok {
            w.push(f("at_missing", "state.at is when it was said (only an observe, transform or transfer may leave it out, with no clock)"));
        }
        // A consent `yes` widens what reaches her, so it names whom it is about; a word without a subject may only narrow (consent.md)
        if type_name == "observe" && g("kind").and_then(Value::as_str) == Some("consent") && g("word").and_then(Value::as_str) == Some("yes") && refs.get("subject").is_none() {
            w.push(f("required", "a consent yes names whom it is about in refs.subject: only stop, keep and move may leave it out"));
        }
        w.extend(self.values(state, refs, false));
        if matches!(type_name, "promise" | "transfer") {
            w.extend(self.amounts_below_zero(state, "state"));
        }
        let mut c: W = vec![];
        // A stop or an answer restating refs.parent is not a grant: the child-and-parent rule reads grants only (authority.md).
        let grant_block = !(refs.get("answers").is_some() || (refs.get("updates").is_some() && g("status").is_some()));
        if let (Some(held), "grant", true, true) = (options.held, type_name, refs.get("parent").is_some(), grant_block) {
            // refs.parent names one grant: a parent that is not one id names none (authority.md, as refs.to)
            if let Some(parent) = refs.get("parent").and_then(Value::as_str).and_then(|h| held.get(h)) {
                c.extend(crate::grant::scope_refusals(&json!({ "state": state, "refs": refs }), parent));
            }
        }
        // A closed type: its fields are fixed (core.md, Open types, closed authority). An open type stops here.
        if !self.spec.is_closed(type_name) {
            return (w, c);
        }
        match self.declared(type_name, refs, options.schemas) {
            None => {
                if options.schemas.is_some() {
                    c.push(f(
                        "undeclared_ref",
                        "refs.schema names a schema this node does not hold: ask for it",
                    ));
                }
            }
            Some((fields, roles, terms)) => {
                if type_name == "promise" {
                    if let Some(Value::Object(t)) = state.get("terms") {
                        for k in t.keys().filter(|k| !terms.contains(k)) {
                            c.push(f("undeclared_field", format!("terms.{k} is neither a term of the protocol ({}) nor one the promise's schema declares", self.spec.terms.join(", "))));
                        }
                    }
                }
                for key in refs.as_object().unwrap().keys() {
                    if !roles.contains(key) {
                        c.push(f(
                            "undeclared_ref",
                            format!("refs.{key} is not declared (the shared refs, or the schema's roles)"),
                        ));
                    }
                }
                for key in state.as_object().unwrap().keys() {
                    if !fields.contains(key) {
                        c.push(f("undeclared_field", format!("state.{key} is not declared for {type_name} (its base fields, or the schema's)")));
                    }
                }
            }
        }
        c.extend(self.rules(type_name, state, refs, options.held));
        (w, c)
    }
}

/// Findings as a refusal list: one entry per code, in the order of `group` (a group of protocol.json's
/// `refusals.codes`: block, fold or message), the details of one code joined with "; " (each once).
pub fn ordered_with(spec: &Spec, found: Vec<Refusal>, group: &str) -> Vec<Refusal> {
    // protocol.json lists a block's codes in the order of the checks in core.md section 8.
    let order = spec.list(&format!("refusals.codes.{group}"));
    let mut by: Vec<(String, Vec<String>)> = Vec::new();
    for one in found {
        match by.iter_mut().find(|(c, _)| *c == one.code) {
            Some((_, details)) => {
                if !details.contains(&one.detail) {
                    details.push(one.detail)
                }
            }
            None => by.push((one.code, vec![one.detail])),
        }
    }
    // A code outside the group sorts first, as JavaScript's indexOf -1 does; the sort is stable.
    let place = |code: &str| {
        order
            .iter()
            .position(|c| c == code)
            .map_or(-1, |i| i as i64)
    };
    by.sort_by_key(|(code, _)| place(code));
    by.into_iter()
        .map(|(code, details)| Refusal {
            code,
            detail: details.join("; "),
        })
        .collect()
}

/// Findings as a refusal list under the built-in protocol.json (see [`ordered_with`]).
pub fn ordered(found: Vec<Refusal>, group: &str) -> Vec<Refusal> {
    ordered_with(crate::spec(), found, group)
}

/// The codes of protocol.json's `refusals.codes` (every group), for checking that a refusal names a known one.
pub fn is_code(code: &str) -> bool {
    let p = &crate::spec().protocol;
    get(p, "refusals.codes")
        .and_then(Value::as_object)
        .is_some_and(|groups| groups.values().any(|g| g.get(code).is_some()))
}

/// What a strict writer never writes (canonical.md): a null, an unsorted set, text outside NFC, a float, a number out
/// of range. `create` refuses a block with any.
pub fn strict_findings(type_name: &str, state: &Value, refs: &Value) -> Vec<Refusal> {
    let _ = type_name;
    if !state.is_object() || !refs.is_object() {
        return vec![];
    }
    Checker { spec: crate::spec() }.strict_all(state, refs)
}

/// Every finding of the content checks, unordered (the caller orders the whole list once).
pub fn findings_with(spec: &Spec, type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> Vec<Refusal> {
    let (mut bytes, closed) = Checker { spec }.findings(type_name, state, refs, options);
    bytes.extend(closed);
    bytes
}

/// The findings of the bytes (checks 1 to 4 of core.md section 8) and, apart, a closed type's own (check 8).
pub fn findings_staged(spec: &Spec, type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> (Vec<Refusal>, Vec<Refusal>) {
    Checker { spec }.findings(type_name, state, refs, options)
}

/// What is wrong with a FoodBlock block under the given protocol.json: `[{ code, detail }]`, the codes of the first check that
/// finds anything (core.md, section 8: the checks stop at the first), one per code, in the order of protocol.json's
/// `refusals.codes.block` (empty when it is well-formed). Checks 1 to 4 read the bytes; what is left is the closed type's own.
pub fn refusals_with(
    spec: &Spec,
    type_name: &str,
    state: &Value,
    refs: &Value,
    options: CheckOptions,
) -> Vec<Refusal> {
    let (w, closed) = Checker { spec }.findings(type_name, state, refs, options);
    let check_of = |code: &str| -> usize {
        let checks = get(&spec.protocol, "refusals.checks").and_then(Value::as_array).cloned().unwrap_or_default();
        checks.iter().take(4).position(|c| c.as_array().is_some_and(|c| c.iter().any(|x| x.as_str() == Some(code)))).map_or(5, |i| i + 1)
    };
    for check in 1..=4 {
        let found: Vec<Refusal> = w.iter().filter(|r| check_of(&r.code) == check).cloned().collect();
        if !found.is_empty() {
            return ordered_with(spec, found, "block");
        }
    }
    let rest: Vec<Refusal> = w.into_iter().chain(closed).collect();
    ordered_with(spec, rest, "block")
}

/// What is wrong with a FoodBlock block: `[{ code, detail }]`, one entry per rule found, in the order of
/// protocol.json's `refusals.codes.block` (empty when it is well-formed). Options: `schemas` (hash → schema block) so a
/// named schema's fields and roles count as declared (a schema not among them is refused); `held` (hash → block) so a
/// child grant is checked against its parent, a deal block against the block it answers, and an ask against its grant.
pub fn refusals(
    type_name: &str,
    state: &Value,
    refs: &Value,
    options: CheckOptions,
) -> Vec<Refusal> {
    refusals_with(crate::spec(), type_name, state, refs, options)
}

/// What is wrong with a FoodBlock block, in plain words (each finding's detail), under the given protocol.json
/// (empty when it is well-formed). Strict: only the protocol's words.
pub fn check_with(
    spec: &Spec,
    type_name: &str,
    state: &Value,
    refs: &Value,
    options: CheckOptions,
) -> Vec<String> {
    findings_with(spec, type_name, state, refs, options)
        .into_iter()
        .map(|one| one.detail)
        .collect()
}

/// What is wrong with a FoodBlock block, in plain words (empty when it is well-formed). Strict: only the protocol's words.
pub fn check(type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> Vec<String> {
    check_with(crate::spec(), type_name, state, refs, options)
}

/// An amount: `amount("2.5", "kg")`. The value is a decimal string.
pub fn amount(value: &str, unit: &str) -> Value {
    json!({ "value": value, "unit": unit })
}
/// Money in whole minor units: `money(420, "GBP")` is £4.20.
pub fn money(minor: i64, currency: &str) -> Value {
    json!({ "minor": minor, "currency": currency })
}
/// Terms on a promise; only the terms the protocol lists are kept.
pub fn terms(given: &Value) -> Value {
    let all = &crate::spec().terms;
    Value::Object(
        given
            .as_object()
            .map(|m| {
                m.iter()
                    .filter(|(k, v)| !v.is_null() && all.contains(k))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect()
            })
            .unwrap_or_default(),
    )
}

/// The state fields and ref keys the protocol itself declares for a type, before any schema (the base of a closed
/// type). The one-time converter reads it to know what a schema must declare (spec/legacy/converter.md).
pub fn base_declared(type_name: &str) -> (Vec<String>, Vec<String>) {
    let c = Checker { spec: crate::spec() };
    c.declared(type_name, &json!({}), None).map(|(f, r, _)| (f, r)).unwrap_or_default()
}

/// How deep a value nests: a scalar 0, an object or array 1 more than its deepest item.
pub(crate) fn depth_of(v: &Value) -> usize {
    match v {
        Value::Object(m) => 1 + m.values().map(depth_of).max().unwrap_or(0),
        Value::Array(a) => 1 + a.iter().map(depth_of).max().unwrap_or(0),
        _ => 0,
    }
}
