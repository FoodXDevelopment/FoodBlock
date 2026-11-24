//! The checks of a block's bytes and body (core.md, section 8): checks 1 to 4, which `valid` runs, and check 8, a closed type's own, which
//! `read` runs (valid.rs). `write_refusals` is what a writer refuses to sign. Each finding is `{ code, detail }`, in the order of
//! protocol.json's `refusals.codes.block`; the code carries the meaning, the detail is free text for people. Every list and grammar it
//! reads comes from protocol.json; none is written here. There is no earlier version to read: year zero.
use crate::canonical::canonical;
pub use crate::error::Refusal;
use crate::js::{cmp16, get, int, is_obj, keys_within, str_of, type_of, Index};
use crate::prelude::*;
use crate::spec::Spec;
use crate::time::is_time;
use time::time_places;
pub(crate) use grant::{amount_ok, fence_ok, scope_junk};

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
/// declared (a schema not among them is refused); `blocks` (hash → block) so a child grant is checked against its parent,
/// a deal block against the block it answers, and a promise's ask against the grant it acts under.
#[derive(Default, Clone, Copy)]
pub struct CheckOptions<'a> {
    pub schemas: Option<&'a Index>,
    pub blocks: Option<&'a Index>,
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
        // A pause ends by its own signer's `updates` of it, never by an answer (promises.md, Answers).
        if status.as_str() == Some("resumed") && (refs.get("updates").is_none() || refs.get("answers").is_some()) {
            w.push(f("bad_status", "resumed is the author's own updates of their pause (refs.updates), never an answer"));
        }
        if status.as_str() == Some("stopped") {
            w.extend(self.stop_shape(state.get("stop")));
        } else if state.get("stop").is_some() {
            w.push(f("bad_status", "state.stop goes with status stopped"));
        }
        w
    }


    fn rules(&self, type_name: &str, state: &Value, refs: &Value, blocks: Option<&Index>) -> W {
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
            "transfer" => w.extend(self.transfer(state, refs, blocks, answering)),
            "promise" => w.extend(self.promise(state, refs, blocks, answering)),
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
        // a schema named and not in the store is `read`'s `names_missing` (it is named for its meaning), and the fields it might declare are
        // not judged until it is held (core.md, section 8, The schema store); with no store (a writer's own check) they are not judged either
        let named = refs.get("schema");
        let schemas = match (named, schemas) {
            (Some(_), None) => return None,
            (Some(n), Some(store)) if !n.as_str().is_some_and(|h| store.contains_key(h)) => return None,
            (_, s) => s,
        };
        let schema = named.and_then(Value::as_str).and_then(|h| schemas.and_then(|store| store.get(h)));
        // Only a schema declares: a thing of kind schema (core.md, section 8). Any other block named there widens nothing.
        let schema = schema.filter(|s| type_of(s) == "thing" && get(s, "state.kind").and_then(Value::as_str) == Some("schema"));
        let mut fields = self.spec.every.clone();
        // (blocks.md, A chain goes on) `state.counted_to` is causal state (protocol.json `causal_state`), which any block may
        // carry: a take-up `as` a circle names in it the last block of the line it goes on from
        fields.extend(crate::spec().list("causal_state"));
        fields.extend(self.spec.fields(type_name));
        // A profile adds no field: its fields are declared by its schema, named by the block, as anyone's are 
        fields.extend(schema.map(schema_field_specs).unwrap_or_default().into_iter().map(|(name, _)| name));
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
        // Fields that hold an id, wherever they are written (core.md section 3, grammar): the block counted to, and the parties of an admission.
        w.extend(self.hash_shape(g("counted_to"), "state.counted_to"));
        // `state.rule_set`, a field of every type, read by every reader. This core runs no rule set but the core itself, so a
        // block that states one is not read (`unknown_rules`) and hides what it could name.
        // the core runs no set at all, so every stated id is `unknown_rules`; a value that is not an id is `grammar`.
        if let Some(r) = g("rule_set") {
            // unless the reader runs that set (`read`'s `runs`); a set it runs is read by these rules.
            if self.is("id", Some(r)) {
                if !r.as_str().is_some_and(crate::rules::runs) {
                    w.push(f("unknown_rules", "state.rule_set names rules this reader does not run"));
                }
            } else {
                w.push(f("grammar", "state.rule_set is an id: the hash of the rules it is read under"));
            }
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
        if !g("nonce").is_none_or(|n| self.is("nonce", Some(n))) {
            w.push(f("grammar", "state.nonce is 16 random bytes, hex"));
        }
        for flag in ["skip"] {
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
        // A conditioned transfer (things.md, Transfers) carries its condition whole; a wrapper without its deadline or clocks is refused.
        if let Some(m) = g("condition").and_then(crate::tasks::condition_malformed) {
            w.push(f("shape", format!("state.condition: {m}")));
        }
        if !g("channel").is_none_or(Value::is_string) {
            w.push(f("shape", "state.channel is an open label (sms, ussd, voice, letter, meeting)"));
        }
        if !g("handle").is_none_or(Value::is_string) {
            w.push(f("shape", "state.handle is text: who spoke on a channel (sms:+447700900123)"));
        }
        w
    }
    // A schema's typed fields (things.md, Schemas): each `name:shape`, the shape a word of `field_shape` and `grammar` (`text`, `hash`,
    // `id`, `time`, `date`, `duration`, `decimal`, `amount`, `count`) or `in:` and a comma list, a trailing `!` asking for the field. A field
    // there in another shape is `shape`; one asked for and left out `required`. Any other value is a hint for people and checks nothing.
    fn schema_fields(&self, state: &Value, schema: &Value) -> W {
        let mut w: W = vec![];
        for (name, spec) in schema_field_specs(schema) {
            let (shape, asked) = spec.strip_suffix('!').map_or((spec.as_str(), false), |s| (s, true));
            if !matches!(shape, "text" | "hash" | "id" | "time" | "date" | "duration" | "decimal" | "amount" | "count") && !shape.starts_with("in:") {
                continue;
            }
            let Some(v) = get(state, &name) else {
                if asked {
                    w.push(f("required", format!("state.{name} is asked for by the schema it names")));
                }
                continue;
            };
            let ok = match shape {
                "text" => v.is_string(),
                "hash" => self.is("hash", Some(v)),
                "id" => self.is("id", Some(v)),
                "time" => crate::time::is_time(Some(v)),
                "date" => crate::time::is_date(Some(v)),
                "duration" => v.is_string() && self.is("duration", Some(v)),
                "decimal" => v.is_string() && self.is("decimal", Some(v)),
                "amount" => self.amount_shape(Some(v), &name).is_empty(),
                "count" => v.as_u64().is_some_and(|n| n >= 1) || v.as_f64().is_some_and(|n| n >= 1.0 && n % 1.0 == 0.0),
                other => v.as_str().is_some_and(|t| other[3..].split(',').any(|x| x == t)),
            };
            if !ok {
                w.push(f("shape", format!("state.{name} is not {shape}, as the schema it names says")));
            }
        }
        w
    }
    // The typed fields of a kind (protocol.json `kind_fields`, one rule for every kind): each line is `field:shape`, the field a path in
    // the block's state (`terms.reveal_by`), the shape `text`, `hash`, `id`, `time`, `count` (a whole number of at least 1) or `in:<list>` (a closed list of protocol.json).
    // A shape ending in `!` is asked for. A field left out is not asked for otherwise; a field that is there must have its shape.
    fn kind_fields(&self, type_name: &str, state: &Value) -> W {
        let Some(kind) = state.get("kind").and_then(Value::as_str) else {
            return vec![];
        };
        let mut w: W = vec![];
        for line in self.list(&format!("kind_fields.{type_name}.{kind}")) {
            let Some((field, shape)) = line.split_once(':') else { continue };
            // a shape ending in `!` is asked for: a kind that states it is no kind without it
            let (shape, asked) = shape.strip_suffix('!').map_or((shape, false), |s| (s, true));
            let Some(v) = crate::js::get(state, field) else {
                if asked {
                    w.push(f("required", format!("state.{field} is stated: a {kind} states it")));
                }
                continue;
            };
            let name = format!("state.{field}");
            match shape {
                "count" if crate::js::count_stated(Some(v), None).is_none() => {
                    w.push(f("shape", format!("{name} is a whole number of at least 1")))
                }
                "text" if !v.is_string() => w.push(f("shape", format!("{name} is text"))),
                "hash" if !self.is("hash", Some(v)) => w.push(f("grammar", format!("{name} is a SHA-256 digest in hex"))),
                "id" if !self.is("id", Some(v)) => w.push(f("grammar", format!("{name} is an id"))),
                "time" => w.extend(self.time_shape(Some(v), &name)),
                // a cutoff's `when` is the word's own text for that time: an instant, or for a span the span itself
                "time_or_duration" if v.as_str().is_some_and(|d| crate::time::parse_duration(d).is_some()) => {}
                "time_or_duration" => w.extend(self.time_shape(Some(v), &name)),
                other => {
                    if let Some(list) = other.strip_prefix("in:") {
                        if !v.as_str().is_some_and(|t| self.list(list).iter().any(|x| x == t)) {
                            w.push(f("shape", format!("{name} is one of {}", self.list(list).join(", "))));
                        }
                    }
                }
            }
        }
        w
    }
    fn numbers_only_shapes(&self, state: &Value, _refs: &Value, genesis: bool) -> W {
        // Times, dates and durations are read where the protocol checks them (`time_fields_checked_in`): the state, its terms and
        // scope, and each line of its terms.
        let mut w: W = vec![];
        for (path, place) in time_places(state) {
            // a clock's cutoff of a span states the span itself as its `when` (the word's own text for that time), running from the
            // receipt it names in `refs.derives_from`
            // read by the cutoff's `kind` alone; a duration is the only other text a cutoff's `when` may be.
            if path == "state" && place.get("kind").and_then(Value::as_str) == Some("cutoff") && place.get("when").and_then(Value::as_str).is_some_and(|d| crate::time::parse_duration(d).is_some()) {
                let mut rest = place.clone();
                rest.as_object_mut().map(|m| m.remove("when"));
                w.extend(self.times_in(Some(&rest), &path));
                w.extend(self.durations_in(Some(place), &path));
                continue;
            }
            w.extend(self.times_in(Some(place), &path));
            w.extend(self.durations_in(Some(place), &path));
        }
        // a genesis's audience is read as any block's: public, or a sorted list of commitments with a nonce
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
            // the header: it has the common five, or is a genesis (its own key, no author, no seq). Neither is `chain`;
            // every other fault of a genesis is a value, `read`'s `bad_genesis`.
            // one rule with `is_genesis`: a key that is not text names no key, so the actor is no genesis
            let genesis = g("public_key_sign").is_some_and(Value::is_string) && refs.get("author").is_none() && g("seq").is_none();
            if !genesis && (refs.get("author").is_none() || refs.get("prev").is_none() || !int(g("seq")).is_some_and(|n| n >= 1.0) || g("audience").is_none()) {
                w.push(f("chain", "a block has the common five (author, seq, prev, audience), or is a genesis"));
            }
            w.extend(self.genesis_errors(state, refs));
            w.extend(self.values(state, refs, true));
            return (w, vec![]);
        }
        // Any other block: the common five (core.md, section 5).
        // the header's links are one id each, in the id grammar: an author, prev or key that is not names no place (`chain`)
        if !self.is("id", refs.get("author")) {
            w.push(f("chain", "refs.author names who said it"));
        }
        if !int(g("seq")).is_some_and(|n| n >= 1.0) {
            w.push(f("chain", "state.seq is its place in its signing key's chain (1, 2, 3...)"));
        }
        if !self.is("id", refs.get("prev")) {
            w.push(f("chain", "refs.prev names the key's previous block (or the block that brought the key in)"));
        }
        if refs.get("key").is_some() && !self.is("id", refs.get("key")) {
            w.push(f("chain", "refs.key names the key grant that brought its key in"));
        }
        if g("audience").is_none() {
            w.push(f("chain", "state.audience is public, or a sorted list of commitments"));
        }
        // any block may leave its `at` out (a block that states none is not in time against any end; Time)
        // her stop of one thing (authority.md, A stop of one thing) is an observe with status stopped, stop onward and one refs.what, naming
        // no refs.updates and no refs.answers; any other stopped observe that answers and updates nothing is a status that answers nothing
        if type_name == "observe"
            && g("status").and_then(Value::as_str) == Some("stopped")
            && refs.get("updates").is_none()
            && refs.get("answers").is_none()
            && (g("stop").and_then(Value::as_str) != Some("onward") || crate::js::list(refs.get("what")).len() != 1)
        {
            w.push(f("status_not_answer", "a status on a block that neither answers nor updates its author's own, bar her stop of one thing"));
        }
        w.extend(self.values(state, refs, false));
        if type_name == "grant" {
            w.extend(self.key_list_shape(state));
        }
        w.extend(self.kind_fields(type_name, state));
        if matches!(type_name, "promise" | "transfer" | "transform") {
            w.extend(self.amounts_below_zero(state, "state"));
        }
        // a thing's pack is its measure: its kind is the thing's own (refs.of), so it carries no of (encoding.md, Shapes)
        if type_name == "thing" && g("pack").is_some_and(|p| p.get("of").is_some()) {
            w.push(f("shape", "state.pack carries no of: a thing's measure is of its own kind"));
        }
        let mut c: W = vec![];
        // A stop or an answer restating refs.parent is not a grant: the child-and-parent rule reads grants only (authority.md).
        let grant_block = !(refs.get("answers").is_some() || (refs.get("updates").is_some() && g("status").is_some()));
        if let (Some(given), "grant", true, true) = (options.blocks, type_name, refs.get("parent").is_some(), grant_block) {
            // refs.parent names one grant: a parent that is not one id names none (authority.md, as refs.to)
            if let Some(parent) = refs.get("parent").and_then(Value::as_str).and_then(|h| given.get(h)) {
                c.extend(crate::grant::scope_refusals(&json!({ "state": state, "refs": refs }), parent));
            }
        }
        // (things.md, Schemas) a block of any type that names a schema the reader holds is read
        // against the shapes that schema gives its fields. Only a reader with a schema store reads them (`read`), never `valid` or a writer.
        if let (Some(store), Some(h)) = (options.schemas, refs.get("schema").and_then(Value::as_str)) {
            if let Some(schema) = store.get(h).filter(|s| type_of(s) == "thing" && get(s, "state.kind").and_then(Value::as_str) == Some("schema")) {
                c.extend(self.schema_fields(state, schema));
            }
        }
        // A closed type: its fields are fixed (core.md, Open types, closed authority). An open type stops here.
        if !self.spec.is_closed(type_name) {
            return (w, c);
        }
        match self.declared(type_name, refs, options.schemas) {
            None => {}
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
        c.extend(self.rules(type_name, state, refs, options.blocks));
        (w, c)
    }
}

/// Findings as a refusal list: one entry per code, in the order of `group` (a group of protocol.json's
/// `refusals.codes`: block, fold or message), the details of one code joined with "; " (each once).
pub fn ordered_with(spec: &Spec, found: Vec<Refusal>, group: &str) -> Vec<Refusal> {
    // protocol.json lists a block's codes in the order of the checks in core.md section 8; `read` gives its codes in the order of `refusals.read`.
    let order = if group == "read" { spec.list("refusals.read") } else { spec.list(&format!("refusals.codes.{group}")) };
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

/// What a strict writer never writes (canonical.md): a null, an unsorted set, a float, a number out of range. `create` refuses a block with any.
pub fn strict_findings(type_name: &str, state: &Value, refs: &Value) -> Vec<Refusal> {
    let _ = type_name;
    if !state.is_object() || !refs.is_object() {
        return vec![];
    }
    Checker { spec: crate::spec() }.strict_all(state, refs)
}

/// The findings of the bytes (checks 1 to 4 of core.md section 8) and, apart, a closed type's own (check 8).
pub fn findings_staged(spec: &Spec, type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> (Vec<Refusal>, Vec<Refusal>) {
    Checker { spec }.findings(type_name, state, refs, options)
}

/// What a writer refuses to sign, under the given protocol.json (write.rs: compose, check, sign): the codes of the first of checks 1 to 4
/// that finds anything, else a closed type's own (check 8), one per code, in the order of protocol.json's `refusals.codes.block`. A writer
/// never repairs: it refuses, and the author writes again.
pub fn write_refusals_with(
    spec: &Spec,
    type_name: &str,
    state: &Value,
    refs: &Value,
    options: CheckOptions,
) -> Vec<Refusal> {
    let (w, closed) = Checker { spec }.findings(type_name, state, refs, options);
    let check_of = |code: &str| -> usize {
        // a float or an out-of-range whole number in a value handed to a writer is its bytes' finding (protocol.json refusals.codes.block:
        // the writer's form of `not_canonical`), so it is read with the bytes, before the header
        if code == "float" || code == "integer_range" {
            return 2;
        }
        let checks = get(&spec.protocol, "refusals.checks").and_then(Value::as_array).cloned().unwrap_or_default();
        checks.iter().take(3).position(|c| c.as_array().is_some_and(|c| c.iter().any(|x| x.as_str() == Some(code)))).map_or(4, |i| i + 1)
    };
    // the size, the bytes and the header read the bytes alone; a writer signs only what its own `read` reads, so every
    // value finding after them refuses too
    for check in 1..=3 {
        let found: Vec<Refusal> = w.iter().filter(|r| check_of(&r.code) == check).cloned().collect();
        if !found.is_empty() {
            return ordered_with(spec, found, "block");
        }
    }
    let rest: Vec<Refusal> = w.into_iter().chain(closed).collect();
    // what is left are read's findings, given in read's order (protocol.json refusals.read)
    ordered_with(spec, rest, "read")
}

/// What a writer refuses to sign, under the built-in protocol.json (see [`write_refusals_with`]).
pub fn write_refusals(type_name: &str, state: &Value, refs: &Value, options: CheckOptions) -> Vec<Refusal> {
    write_refusals_with(crate::spec(), type_name, state, refs, options)
}

/// An amount: `amount("2.5", "kg", None)`, or `amount("1", "credit", Some(kind))` for an amount of a kind (encoding.md, Shapes). The value
/// is a decimal string; money is an amount like any other.
pub fn amount(value: &str, unit: &str, of: Option<&str>) -> Value {
    match of {
        Some(k) => json!({ "value": value, "unit": unit, "of": k }),
        None => json!({ "value": value, "unit": unit }),
    }
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

/// How deep a value nests: a scalar 0, an object or array 1 more than its deepest item.
pub(crate) fn depth_of(v: &Value) -> usize {
    match v {
        Value::Object(m) => 1 + m.values().map(depth_of).max().unwrap_or(0),
        Value::Array(a) => 1 + a.iter().map(depth_of).max().unwrap_or(0),
        _ => 0,
    }
}

/// Whether a figure is a whole number of parts, zero or above (a fraction of a part is another kind).
pub(crate) fn is_whole_parts(d: &crate::decimal::Dec) -> bool {
    let t = d.text();
    !t.contains('.') && !t.contains('/') && !t.starts_with('-')
}

/// The fields a schema declares, as (name, spec): `fields` is an object `{ name: spec }` or a list of `name:spec` lines (things.md, Schemas).
fn schema_field_specs(schema: &Value) -> Vec<(String, String)> {
    match get(schema, "state.fields") {
        Some(Value::Object(m)) => m.iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string())).collect(),
        Some(Value::Array(a)) => a.iter().filter_map(Value::as_str).map(|l| match l.split_once(':') {
            Some((n, sp)) => (n.to_string(), sp.to_string()),
            None => (l.to_string(), String::new()),
        }).collect(),
        _ => vec![],
    }
}
