package foodblock

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"golang.org/x/text/unicode/norm"
)

// The write check (protocol.md §1, Refusals): Refusals says what is wrong with a block as every node checks it before
// writing: [{code, detail}], one entry per rule found, in the order of protocol.json's `refusals.codes.block` (none
// when it is a well-formed 1.6 block). The code carries the meaning; the detail is free text for people. Check gives
// the details alone. Every list and grammar it reads comes from protocol.json (spec.go). Older shapes are read, never
// re-checked (aliases.go). Amount, Money, Confidence and Terms build the shapes so callers never hand-write them.

// RRULE is the RFC 5545 recurrence value; RFC 5545 is not a protocol.json list, so it is written here as in the JS.
var rrule = regexp.MustCompile(`^FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,:+-]+)*$`)
var currency = regexp.MustCompile(`^[A-Z]{3}$`)

const timeLayout = "2006-01-02T15:04:05.000Z"

// Finding is one thing wrong: a code from protocol.json (`refusals.codes`) and free text for people.
type Finding struct {
	Code   string `json:"code"`
	Detail string `json:"detail"`
}

// RefusalCodes are protocol.json's refusals.codes: each group (block, fold, message), its codes in order.
var RefusalCodes = func() map[string][]string {
	out := map[string][]string{}
	for _, group := range keysOf(at(protocolDoc, "refusals", "codes")) {
		out[group] = keysOf(at(protocolDoc, "refusals", "codes", group))
	}
	return out
}()

// ordered gives findings as a refusal list: one entry per code, in the order of `codes` (a group of
// refusals.codes), the details of one code joined with "; ".
func ordered(found []Finding, codes []string) []Finding {
	by, seen := map[string][]string{}, []string{}
	for _, f := range found {
		if _, ok := by[f.Code]; !ok {
			seen = append(seen, f.Code)
		}
		if !contains(by[f.Code], f.Detail) {
			by[f.Code] = append(by[f.Code], f.Detail)
		}
	}
	rank := func(code string) int {
		for i, c := range codes {
			if c == code {
				return i
			}
		}
		return -1
	}
	out := []Finding{}
	for _, code := range seen {
		out = append(out, Finding{code, strings.Join(by[code], "; ")})
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && rank(out[j-1].Code) > rank(out[j].Code); j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}

func details(found []Finding) []string {
	out := []string{}
	for _, f := range found {
		out = append(out, f.Detail)
	}
	return out
}

func isTime(v any) bool {
	s, ok := v.(string)
	if !ok || !grammar["time"](s) {
		return false
	}
	_, err := time.Parse(timeLayout, s)
	return err == nil
}

func isDate(v any) bool {
	s, ok := v.(string)
	if !ok || !grammar["date"](s) {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

func isHash(v any) bool { return matchesGrammar("hash", v) }

func keysWithin(m map[string]any, allowed []string) bool {
	for k := range m {
		if !contains(allowed, k) {
			return false
		}
	}
	return true
}

func hasKey(m map[string]any, k string) bool { _, ok := m[k]; return ok }

// errs is a finding with `code` unless cond holds.
func errs(cond bool, code, message string) []Finding {
	if cond {
		return nil
	}
	return []Finding{{code, message}}
}

func join(lists ...[]Finding) []Finding {
	out := []Finding{}
	for _, l := range lists {
		out = append(out, l...)
	}
	return out
}

func sameSet(a []string, b any) bool {
	if b == nil {
		return false
	}
	return equalJSON(sorted(uniq(a)), sorted(uniq(list(b))))
}

// ---- Shapes (protocol.json `shapes`), recognised by their keys wherever they sit in state ----

func amountShape(v any, name string) []Finding {
	if v == nil {
		return nil
	}
	m := obj(v)
	if !(m != nil && keysWithin(m, shape("amount")) && isStr(m["value"]) && strings.TrimSpace(str(m["unit"])) != "") {
		return errs(false, "shape", name+" is an amount: { value (a decimal string), unit (UCUM or a pack) }")
	}
	return errs(matchesGrammar("decimal", m["value"]), "decimal", name+".value is a decimal string (-?(0|[1-9][0-9]*)(.[0-9]+)?)")
}

func moneyShape(v any, name string) []Finding {
	if v == nil {
		return nil
	}
	m := obj(v)
	return errs(m != nil && keysWithin(m, shape("money")) && isInt(m["minor"]) && currency.MatchString(fmt.Sprint(m["currency"])),
		"shape", name+" is money: { minor (whole minor units), currency (ISO 4217) }")
}

// A time or date in the right shape that is not a real calendar instant is `calendar`; any other, `time`.
func calendarShape(v any, name, pattern string, real func(any) bool, words string) []Finding {
	if v == nil || real(v) {
		return nil
	}
	if matchesGrammar(pattern, v) {
		what := "instant"
		if words == "a date" {
			what = "date"
		}
		return errs(false, "calendar", name+" is not a real calendar "+what)
	}
	return errs(false, "time", name+" is "+words)
}

func timeShape(v any, name string) []Finding {
	return calendarShape(v, name, "time", isTime, "a UTC time, exactly YYYY-MM-DDTHH:MM:SS.sssZ")
}

func dateShape(v any, name string) []Finding { return calendarShape(v, name, "date", isDate, "a date") }

func durationShape(v any, name string) []Finding {
	return errs(v == nil || matchesGrammar("duration", v), "time", name+" is an ISO 8601 duration (P30D)")
}

func hashShape(v any, name string) []Finding {
	return errs(v == nil || isHash(v), "grammar", name+" is a hash")
}

func hashListShape(v any, name string) []Finding {
	if v == nil {
		return nil
	}
	items, ok := arr(v)
	good := ok && !isStr(v) && len(items) > 0
	for _, item := range items {
		good = good && isHash(item)
	}
	return errs(good, "grammar", name+" is a set of hashes")
}

func wholeShape(v any, name string, min int64) []Finding {
	if v == nil {
		return nil
	}
	n, ok := intOf(v)
	message := name + " is a whole number"
	if min != 0 {
		message += fmt.Sprintf(" from %d", min)
	}
	return errs(ok && n >= min, "shape", message)
}

func whenShape(v any, name string) []Finding {
	if v == nil || isStr(v) {
		return timeShape(v, name)
	}
	m := obj(v)
	if !(m != nil && keysWithin(m, shape("when")) && m["from"] != nil && m["to"] != nil) {
		return errs(false, "shape", name+" is a time, or { from, to }")
	}
	wrong := join(timeShape(m["from"], name+".from"), timeShape(m["to"], name+".to"))
	if len(wrong) > 0 {
		return wrong
	}
	return errs(str(m["from"]) <= str(m["to"]), "shape", name+".from is after its to")
}

func decimalIn(v any, low, high float64) bool {
	n := jsNumber(v)
	return matchesGrammar("decimal", v) && n >= low && n <= high
}

func whereShape(v any) []Finding {
	if v == nil {
		return nil
	}
	m := obj(v)
	good := m != nil && keysWithin(m, whereArea) && decimalIn(m["lat"], -90, 90) && decimalIn(m["lon"], -180, 180)
	if good && m["radius"] != nil {
		good = len(amountShape(m["radius"], "radius")) == 0 && obj(m["radius"])["unit"] == "m"
	}
	return errs(good, "shape", "state.where is a point { lat, lon } (WGS84 degrees, decimal strings), or an area: a point with radius (an amount in m)")
}

func marksShape(v any, name string) []Finding {
	if v == nil {
		return nil
	}
	items, ok := arr(v)
	for _, item := range items {
		m := obj(item)
		ok = ok && m != nil && keysWithin(m, shape("mark")) && isStr(m["scheme"]) && isStr(m["value"])
	}
	return errs(ok, "shape", name+" lists exact marks: [{ scheme, value }]")
}

// A price is money, money per unit ({ money, per }), or a share of something measured ({ share, of }).
func perUnit(v any) bool { m := obj(v); return m != nil && hasKey(m, "per") }

func priceShape(v any, name string) []Finding {
	m := obj(v)
	if perUnit(v) {
		money := errs(false, "shape", name+".money is the price")
		if m["money"] != nil {
			money = moneyShape(m["money"], name+".money")
		}
		return join(errs(keysWithin(m, shape("price_per")), "shape", name+" per unit is { money, per }"), money, amountShape(m["per"], name+".per"))
	}
	if m != nil && hasKey(m, "share") {
		if !(keysWithin(m, shape("price_share")) && isStr(m["share"]) && isHash(m["of"])) {
			return errs(false, "shape", name+" as a share is { share (a decimal string), of (the schema saying what is measured) }")
		}
		return errs(matchesGrammar("decimal", m["share"]), "decimal", name+".share is a decimal string")
	}
	return moneyShape(v, name)
}

// A quantity is an amount; under a per-unit price it may be a range { min, max } the answer chooses within.
func quantityShape(v, price any, name string) []Finding {
	m := obj(v)
	if !(m != nil && (hasKey(m, "min") || hasKey(m, "max"))) {
		return amountShape(v, name)
	}
	out := join(errs(perUnit(price), "shape", name+" is a range only under a per-unit price"), errs(keysWithin(m, shape("range")), "shape", name+" as a range is { min, max }"),
		amountShape(m["min"], name+".min"), amountShape(m["max"], name+".max"))
	lo, hi := obj(m["min"]), obj(m["max"])
	if lo != nil && hi != nil && same(lo["unit"], hi["unit"]) && jsNumber(lo["value"]) > jsNumber(hi["value"]) {
		out = append(out, Finding{"shape", name + ".min is above its max"})
	}
	return out
}

func stopShape(stop any) []Finding {
	two := stops[:2]
	if s, ok := stop.(string); ok && contains(two, s) {
		return nil
	}
	m := obj(stop)
	good := m != nil && keysWithin(m, []string{"occurrences"})
	items, ok := arr(m["occurrences"])
	good = good && ok
	for _, item := range items {
		good = good && isTime(item)
	}
	return errs(good, "bad_status", "state.stop is "+strings.Join(two, " or ")+", or { occurrences: [start times] }")
}

// numbers: signed content holds integers within protocol.json's bounds, never floats (§13 Numbers); keys are written
// in NFC (canonical.md Rule 4).
func numbers(v any, path string) []Finding {
	if n, ok := numOf(v); ok {
		if _, whole := intOf(v); !whole {
			return errs(false, "float", path+" is a float; write a decimal string, money { minor, currency } or an amount { value, unit }")
		}
		i, _ := intOf(v)
		if n < float64(intMin) || n > float64(intMax) || i < intMin || i > intMax {
			return errs(false, "integer_range", path+" is outside the whole numbers a block may hold (±(2^53 - 1))")
		}
		return nil
	}
	if items, ok := arr(v); ok && !isStr(v) {
		out := []Finding{}
		for i, item := range items {
			out = append(out, numbers(item, fmt.Sprintf("%s[%d]", path, i))...)
		}
		return out
	}
	m := obj(v)
	if m == nil {
		return nil
	}
	out := []Finding{}
	for _, k := range sortedKeys(m) {
		if k != norm.NFC.String(k) {
			quoted, _ := json.Marshal(k)
			out = append(out, Finding{"not_canonical", fmt.Sprintf("%s has a key not written in NFC (%s)", path, quoted)})
		}
	}
	for _, k := range sortedKeys(m) {
		out = append(out, numbers(m[k], path+"."+k)...)
	}
	return out
}

// shapesIn: every amount and money object, wherever it sits in state.
func shapesIn(v any, path string) []Finding {
	if items, ok := arr(v); ok {
		out := []Finding{}
		for i, item := range items {
			out = append(out, shapesIn(item, fmt.Sprintf("%s[%d]", path, i))...)
		}
		return out
	}
	m := obj(v)
	if m == nil {
		return nil
	}
	out := []Finding{}
	if hasKey(m, "unit") && keysWithin(m, shape("amount")) {
		out = append(out, amountShape(m, path)...)
	} else if hasKey(m, "minor") && keysWithin(m, shape("money")) {
		out = append(out, moneyShape(m, path)...)
	}
	for _, k := range sortedKeys(m) {
		out = append(out, shapesIn(m[k], path+"."+k)...)
	}
	return out
}

// timesIn: the time and date fields (protocol.json `time_fields`, `date_fields`) where 1.6 names them: state, its
// terms and lines, its scope.
func timesIn(v any, path string) []Finding {
	m := obj(v)
	out := []Finding{}
	for _, k := range sortedKeys(m) {
		switch {
		case k == "when":
			out = append(out, whenShape(m[k], path+"."+k)...)
		case contains(timeFields, k):
			out = append(out, timeShape(m[k], path+"."+k)...)
		case contains(dateFields, k):
			out = append(out, dateShape(m[k], path+"."+k)...)
		}
	}
	return out
}

func termsShape(t any, refs, state map[string]any) []Finding {
	if t == nil {
		return nil
	}
	terms := obj(t)
	if terms == nil {
		return errs(false, "shape", "state.terms is { price, quantity, lines, ... }")
	}
	out := []Finding{}
	for _, k := range sortedKeys(terms) {
		if !contains(termKeys, k) {
			out = append(out, Finding{"undeclared_field", fmt.Sprintf("terms.%s is not a 1.6 term (%s)", k, strings.Join(termKeys, ", "))})
		}
	}
	if terms["price"] != nil {
		out = append(out, priceShape(terms["price"], "terms.price")...)
	}
	out = append(out, quantityShape(terms["quantity"], terms["price"], "terms.quantity")...)
	out = append(out, timesIn(terms, "terms")...)
	out = append(out, hashShape(terms["text"], "terms.text")...)
	out = append(out, hashShape(terms["settled_by"], "terms.settled_by")...)
	if terms["repeat"] != nil && !(isStr(terms["repeat"]) && rrule.MatchString(str(terms["repeat"]))) {
		out = append(out, Finding{"grammar", "terms.repeat is an RFC 5545 RRULE value (FREQ=WEEKLY;BYDAY=FR)"})
	}
	if terms["repeat"] != nil && state["when"] == nil {
		out = append(out, Finding{"shape", "a repeating promise counts its occurrences from state.when"})
	}
	if needs := terms["needs"]; needs != nil {
		if _, isObj := needs.(map[string]any); !isObj {
			if _, isList := arr(needs); !isList {
				out = append(out, Finding{"shape", "terms.needs is data from a schema, never a name"})
			}
		}
	}
	if terms["lines"] == nil {
		return out
	}
	lines, ok := arr(terms["lines"])
	if !ok || len(lines) == 0 {
		return append(out, Finding{"lines", "terms.lines lists { id, what, quantity, price }"})
	}
	ids, whats := map[string]bool{}, []string{}
	for i, item := range lines {
		line := obj(item)
		name := fmt.Sprintf("terms.lines[%d]", i)
		out = append(out, errs(line != nil && keysWithin(line, lineKeys), "lines", fmt.Sprintf("%s is { %s }", name, strings.Join(lineKeys, ", ")))...)
		out = append(out, errs(str(line["id"]) != "", "lines", name+".id names the line")...)
		out = append(out, errs(isHash(line["what"]), "lines", name+".what is a thing's hash")...)
		out = append(out, timesIn(line, name)...)
		out = append(out, quantityShape(line["quantity"], line["price"], name+".quantity")...)
		if line["price"] != nil {
			out = append(out, priceShape(line["price"], name+".price")...)
		}
		ids[fmt.Sprintf("%#v", line["id"])] = true
		if s, ok := line["what"].(string); ok {
			whats = append(whats, s)
		}
	}
	out = append(out, errs(len(ids) == len(lines), "lines", "each line id is unique in the promise")...)
	out = append(out, errs(terms["price"] == nil && terms["quantity"] == nil, "lines", "with lines, the price and quantity are on each line")...)
	out = append(out, errs(refs["what"] != nil && sameSet(whats, refs["what"]), "lines", "refs.what is the set of every line's what")...)
	return out
}

func scopeShape(v any, kind any) []Finding {
	scope := obj(v)
	if scope == nil {
		return errs(false, "shape", "state.scope is { "+strings.Join(scopeKeys, ", ")+" }")
	}
	out := []Finding{}
	for _, k := range sortedKeys(scope) {
		if !contains(scopeKeys, k) {
			out = append(out, Finding{"undeclared_field", fmt.Sprintf("scope.%s is not part of a 1.6 scope (%s)", k, strings.Join(scopeKeys, ", "))})
		}
	}
	// A grant of its author's own (key, member, successor, operator) carries no until; one others act under does.
	if contains(grantKinds, str(kind)) {
		out = append(out, errs(scope["until"] == nil, "scope_until", "a "+str(kind)+" grant carries no scope.until")...)
	} else {
		out = append(out, errs(scope["until"] != nil, "scope_until", "a grant others act under carries scope.until (a UTC time)")...)
	}
	out = append(out, timesIn(scope, "scope")...)
	if scope["acts"] != nil {
		items, ok := arr(scope["acts"])
		for _, item := range items {
			ok = ok && isStr(item)
		}
		out = append(out, errs(ok, "shape", "scope.acts lists acts")...)
	}
	if scope["parties"] != nil {
		items, ok := arr(scope["parties"])
		for _, item := range items {
			ok = ok && isHash(item)
		}
		out = append(out, errs(ok, "grammar", "scope.parties lists hashes (left out, it is everyone)")...)
	}
	return join(out, moneyShape(scope["limit"], "scope.limit"), durationShape(scope["per"], "scope.per"), durationShape(scope["notice"], "scope.notice"))
}

func audienceShape(state map[string]any) []Finding {
	audience := state["audience"]
	if audience == "public" {
		return nil
	}
	items, ok := arr(audience)
	good := ok && !isStr(audience) && len(items) > 0
	for _, item := range items {
		good = good && isHash(item)
	}
	if !good {
		return errs(false, "audience", `state.audience is "public" or a list of commitments (salted hashes)`)
	}
	ascending := true
	for i := 1; i < len(items); i++ {
		ascending = ascending && str(items[i-1]) < str(items[i])
	}
	return join(errs(ascending, "audience", "state.audience commitments are sorted, each once"),
		errs(matchesGrammar("nonce", state["nonce"]), "audience", "a private block carries state.nonce (16 random bytes, hex)"))
}

// The genesis (§2): the one block with no author, prev, after or seq; public, naming its own keys and its recovery. An
// encryption key is optional (genesis_optional): a micro that only signs leaves it out and adds one by a key grant.
// What is missing or extra is `bad_genesis`; what is there but malformed is its grammar's code.
func genesisErrors(state, refs map[string]any) []Finding {
	out := []Finding{}
	for _, k := range sortedKeys(refs) {
		out = append(out, Finding{"bad_genesis", fmt.Sprintf("a genesis has no refs (refs.%s)", k)})
	}
	for _, k := range sortedKeys(state) {
		if !contains(genesisFields, k) && !contains(genesisOptional, k) {
			out = append(out, Finding{"bad_genesis", fmt.Sprintf("a genesis names only %s, and %s if it has one (state.%s)", strings.Join(genesisFields, ", "), strings.Join(genesisOptional, ", "), k)})
		}
	}
	out = append(out, errs(truthy(state["kind"]), "bad_genesis", "state.kind says what they are")...)
	if state["at"] == nil {
		out = append(out, Finding{"bad_genesis", "state.at is when it was said"})
	} else {
		out = append(out, timeShape(state["at"], "state.at")...)
	}
	out = append(out, errs(state["audience"] == "public", "bad_genesis", "a genesis is public: anyone checks signatures against its key")...)
	if state["public_key_sign"] == nil {
		out = append(out, Finding{"bad_genesis", "state.public_key_sign names its signing key"})
	} else {
		out = append(out, errs(matchesGrammar("sign_key", state["public_key_sign"]), "grammar", "state.public_key_sign is an Ed25519 key, SPKI DER hex")...)
	}
	out = append(out, errs(state["public_key_encrypt"] == nil || matchesGrammar("encrypt_key", state["public_key_encrypt"]), "grammar", "state.public_key_encrypt is an X25519 key, 32 bytes hex")...)
	if state["recovery_key_hash"] == nil {
		out = append(out, Finding{"bad_genesis", "state.recovery_key_hash names the recovery key"})
	} else {
		out = append(out, errs(isHash(state["recovery_key_hash"]), "grammar", "state.recovery_key_hash is the hash of the recovery key")...)
	}
	if state["recovery_reach"] == nil {
		out = append(out, Finding{"bad_genesis", "state.recovery_reach says how far back the recovery key may reach"})
	} else {
		out = append(out, durationShape(state["recovery_reach"], "state.recovery_reach")...)
	}
	return out
}

func isGenesisShape(typ string, state, refs map[string]any) bool {
	return typ == "actor" && !truthy(refs["author"]) && state["seq"] == nil
}

// speaksFor: a side signs for itself, or a member signs as it (refs.as), or an agent under its grant (refs.under).
func speaksFor(refs map[string]any, side any) bool {
	return side != nil && (same(refs["author"], side) || same(refs["as"], side) || truthy(refs["under"]))
}

func statusShape(state, refs map[string]any) []Finding {
	if state["status"] == nil {
		return errs(state["stop"] == nil, "bad_status", "state.stop goes with status stopped")
	}
	out := join(errs(truthy(refs["answers"]) || truthy(refs["updates"]), "status_not_answer", "only an answer (refs.answers) or the author stopping their own (refs.updates) carries a status"),
		errs(contains(answers, str(state["status"])) && isStr(state["status"]), "bad_status", "state.status is one of "+strings.Join(answers, ", ")))
	if state["status"] == "stopped" {
		return append(out, stopShape(state["stop"])...)
	}
	return append(out, errs(state["stop"] == nil, "bad_status", "state.stop goes with status stopped")...)
}

func listOf(v any, each func(any) bool, nonEmpty bool) bool {
	items, ok := arr(v)
	if !ok || isStr(v) || (nonEmpty && len(items) == 0) {
		return false
	}
	for _, item := range items {
		if !each(item) {
			return false
		}
	}
	return true
}

func word(v any) bool { return str(v) != "" }

// rules: what each type needs beyond what every block needs. An answer has the type of what it answers; the type's
// other required fields do not apply to it (§6).
var rules = map[string]func(state, refs map[string]any) []Finding{
	"actor": func(state, refs map[string]any) []Finding {
		out := errs(truthy(state["kind"]), "shape", "state.kind says what it is: a person, an agent, a circle, a contact")
		for _, k := range []string{"public_key_sign", "recovery_key_hash", "recovery_reach"} {
			if state[k] != nil {
				out = append(out, Finding{"undeclared_field", "only a genesis names state." + k + "; a key comes in by a key grant"})
			}
		}
		if state["kind"] == "contact" && state["public_key_encrypt"] != nil {
			out = append(out, Finding{"undeclared_field", "a contact has no keys"})
		}
		out = append(out, errs(state["signers"] == nil || listOf(state["signers"], word, true), "shape", "state.signers lists the roles that may sign as the circle")...)
		removal := obj(state["removal"])
		n, whole := intOf(removal["needed"])
		out = append(out, errs(state["removal"] == nil || (removal != nil && keysWithin(removal, removalKeys) && whole && n >= 1), "shape", "state.removal is { needed: N }, how many other admins must agree to remove an admin")...)
		return append(out, errs(state["public_key_encrypt"] == nil || matchesGrammar("encrypt_key", state["public_key_encrypt"]), "grammar", "state.public_key_encrypt is an X25519 key, 32 bytes hex")...)
	},
	"thing": func(state, refs map[string]any) []Finding {
		out := join(errs(truthy(state["kind"]) || truthy(refs["kind"]), "shape", "a thing is a kind (state.kind) or one of a kind (refs.kind)"),
			marksShape(state["marks"], "state.marks"),
			errs(state["words"] == nil || isStr(state["words"]), "shape", "state.words are the words printed on it, as read"))
		if state["kind"] == "schema" {
			return append(out, schemaShape(state)...)
		}
		for _, k := range schemaKeys {
			if state[k] != nil {
				out = append(out, Finding{"undeclared_field", "state." + k + " belongs to a schema (a thing of kind schema)"})
			}
		}
		return out
	},
	"transform": func(state, refs map[string]any) []Finding {
		inputs := list(refs["derives_from"])
		return errs(state["shares"] == nil || listOf(state["shares"], func(item any) bool {
			m := obj(item)
			return m != nil && keysWithin(m, shape("share")) && contains(inputs, str(m["from"])) && matchesGrammar("decimal", m["share"])
		}, false), "shape", "state.shares lists { from (an input it derives_from), share (a decimal string) }")
	},
	"transfer": func(state, refs map[string]any) []Finding {
		out := join(errs(truthy(refs["answers"]) || truthy(refs["to_owner"]) || truthy(refs["to_holder"]) || truthy(refs["to_place"]) || state["count"] != nil,
			"shape", "a transfer says what changed (refs.to_owner, to_holder, to_place), or how many received (state.count)"),
			wholeShape(state["count"], "state.count", 1), marksShape(state["marks"], "state.marks"))
		if state["split"] == nil {
			return out
		}
		parts, ok := arr(state["split"])
		if !ok || len(parts) == 0 {
			return append(out, Finding{"shape", "state.split lists { for, line, money }"})
		}
		served := list(refs["for"])
		for i, item := range parts {
			part := obj(item)
			out = append(out, errs(part != nil && keysWithin(part, shape("split")) && contains(served, str(part["for"])), "shape", fmt.Sprintf("state.split[%d].for is one of what it is for (refs.for)", i))...)
			out = append(out, errs(part["money"] != nil, "shape", fmt.Sprintf("state.split[%d].money says how much", i))...)
			out = append(out, errs(part["line"] == nil || isStr(part["line"]), "shape", fmt.Sprintf("state.split[%d].line is a line id", i))...)
		}
		return out
	},
	"observe": func(state, refs map[string]any) []Finding {
		dkim := obj(state["dkim"])
		_, pass := dkim["pass"].(bool)
		return join(errs(!((truthy(refs["confirms"]) || truthy(refs["same_as"])) && state["confidence"] == nil), "shape", "a confirm or a same_as carries a confidence"),
			errs(state["dkim"] == nil || (dkim != nil && isStr(dkim["domain"]) && pass), "shape", "state.dkim is { domain, pass }"))
	},
	"promise": func(state, refs map[string]any) []Finding {
		status := state["status"] != nil
		answer, stopping := truthy(refs["answers"]) && status, truthy(refs["updates"]) && status
		asked := speaksFor(refs, refs["to"]) && !speaksFor(refs, refs["from"])
		out := join(statusShape(state, refs),
			errs(answer || stopping || speaksFor(refs, refs["from"]) || speaksFor(refs, refs["to"]), "not_a_side", "a promise is signed by a side: from (an offer) or to (an ask), as it, or under its grant"),
			errs(!(!answer && !stopping && asked && !isTime(obj(state["terms"])["expires"])), "ask_without_expires", "every ask carries terms.expires"),
			errs(!(truthy(refs["answers"]) && !truthy(refs["for"])), "deal_not_named", "an answer or a counter names its deal in refs.for (the first promise)"),
			errs(state["not"] == nil || state["not"] == true, "shape", "state.not is true (a promise not to do the step), or left out"))
		if what := state["what"]; what != nil && !isStr(what) && obj(what) == nil {
			out = append(out, Finding{"shape", "state.what describes time or a job (text, or data under a schema)"})
		}
		return append(out, termsShape(state["terms"], refs, state)...)
	},
	"grant": func(state, refs map[string]any) []Finding {
		ending := (truthy(refs["answers"]) || truthy(refs["updates"])) && state["status"] != nil
		out := join(errs(truthy(state["kind"]), "shape", "state.kind says what authority it gives"), statusShape(state, refs), wholeShape(state["depth"], "state.depth", 0))
		if state["scope"] != nil {
			out = append(out, scopeShape(state["scope"], state["kind"])...)
		}
		if !ending && !truthy(refs["answers"]) {
			switch state["kind"] {
			case "key":
				out = append(out, keyGrantShape(state, refs)...)
			case "member":
				out = append(out, memberShape(state, refs)...)
			case "successor":
				out = append(out, successorShape(state, refs)...)
			case "operator":
				out = append(out, errs(truthy(refs["to"]), "shape", "an operator grant names the agent or machine it answers for (refs.to)")...)
			}
		}
		return append(out, hashShape(state["last_counted"], "state.last_counted")...)
	},
}

func keyGrantShape(state, refs map[string]any) []Finding {
	out := join(errs(truthy(refs["subject"]), "shape", "a key grant names the id it is for (refs.subject)"),
		errs(state["public_key_sign"] != nil || state["public_key_encrypt"] != nil || state["recovery_key_hash"] != nil, "shape", "a key grant names the new key (state.public_key_sign or public_key_encrypt)"),
		errs(state["public_key_sign"] == nil || matchesGrammar("sign_key", state["public_key_sign"]), "grammar", "state.public_key_sign is an Ed25519 key, SPKI DER hex"),
		errs(state["public_key_encrypt"] == nil || matchesGrammar("encrypt_key", state["public_key_encrypt"]), "grammar", "state.public_key_encrypt is an X25519 key, 32 bytes hex"),
		errs((state["replaces"] == nil) == (state["last_good"] == nil), "shape", "a rotation names both the key it replaces and that key's last good block"),
		errs(state["replaces"] == nil || matchesGrammar("sign_key", state["replaces"]), "grammar", "state.replaces is the key it replaces"), hashShape(state["last_good"], "state.last_good"),
		errs(state["recovery_key"] == nil || matchesGrammar("sign_key", state["recovery_key"]), "grammar", "state.recovery_key is the recovery key that signed it"),
		errs((state["recovery_key_hash"] == nil) == (state["recovery_reach"] == nil), "shape", "adding recovery names both recovery_key_hash and recovery_reach"),
		hashShape(state["recovery_key_hash"], "state.recovery_key_hash"), durationShape(state["recovery_reach"], "state.recovery_reach"),
		wholeShape(state["epoch"], "state.epoch", 1))
	if state["epoch"] != nil && !truthy(refs["as"]) {
		out = append(out, Finding{"shape", "a rekey (state.epoch) is signed as the circle (refs.as)"})
	}
	if state["epoch"] != nil && (state["keys"] == nil || !truthy(refs["after"])) {
		out = append(out, Finding{"shape", "a rekey holds the new private key sealed to each member (state.keys) and names epoch n-1 in refs.after"})
	}
	return out
}

func memberShape(state, refs map[string]any) []Finding {
	sameAs := (refs["as"] == nil && refs["subject"] == nil) || same(refs["as"], refs["subject"])
	return join(errs(truthy(refs["subject"]), "shape", "a member grant names the circle (refs.subject)"),
		errs(sameAs, "shape", "a member grant is signed as the circle (refs.as)"),
		errs(state["roles"] == nil || listOf(state["roles"], word, false), "shape", "state.roles lists the roles it gives (words)"))
}

func successorShape(state, refs map[string]any) []Finding {
	witnesses, _ := arr(state["witnesses"])
	needed, whole := intOf(state["needed"])
	out := errs(truthy(refs["to"]), "shape", "a successor grant names the successor (refs.to)")
	if state["witnesses"] == nil {
		out = append(out, Finding{"shape", "state.witnesses names who may record the event"})
	} else {
		out = append(out, hashListShape(state["witnesses"], "state.witnesses")...)
	}
	out = append(out, errs(whole && needed >= 1 && needed <= int64(len(witnesses)), "shape", "state.needed is how many witnesses must record it (1 to their number)")...)
	if state["wait"] == nil {
		out = append(out, Finding{"shape", "state.wait is how long the trigger waits (a duration)"})
	} else {
		out = append(out, durationShape(state["wait"], "state.wait")...)
	}
	return append(out, errs(state["public_key_sign"] == nil, "undeclared_field", "a successor gets decryption keys only, never signing keys")...)
}

func schemaShape(state map[string]any) []Finding {
	target := ""
	if truthy(state["target"]) {
		target = fmt.Sprint(state["target"])
	}
	parts := strings.Split(target, ".")
	typ, kind := parts[0], parts[1:]
	fields := obj(state["fields"])
	fieldsOK := state["fields"] == nil || fields != nil
	for _, f := range fields {
		fieldsOK = fieldsOK && contains(fieldTypes, str(f))
	}
	grounds := obj(state["grounds"])
	return join(errs(contains(Types, typ) && (len(kind) == 0 || strings.Join(kind, ".") != ""), "shape", fmt.Sprintf("a schema names its target: a type (%s) or type.kind", strings.Join(Types, ", "))),
		errs(fieldsOK, "shape", fmt.Sprintf("state.fields maps each field to a field type (%s)", strings.Join(fieldTypes, ", "))),
		errs(state["roles"] == nil || listOf(state["roles"], isStr, false), "shape", "state.roles lists the ref keys it declares"),
		errs(state["grounds"] == nil || (grounds != nil && keysWithin(grounds, groundsKeys)), "shape", fmt.Sprintf("state.grounds is { %s }", strings.Join(groundsKeys, ", "))),
		errs(grounds["confirmers"] == nil || listOf(grounds["confirmers"], func(who any) bool { return isHash(who) || matchesGrammar("role_ref", who) }, false), "grammar", "state.grounds.confirmers lists ids or circle#role"))
}

// CheckOptions: Schemas (hash → schema block) so a named schema's fields and roles count as declared (a schema not
// among them is refused); Held (hash → block) so `at` is checked against what refs.after names and a child grant
// against its parent.
type CheckOptions struct {
	Schemas map[string]Block
	Held    map[string]Block
}

// Refusals is what is wrong with a FoodBlock 1.6 block: one entry per rule found, in the order of protocol.json's
// refusals.codes.block (none when it may be written).
func Refusals(typ string, state, refs map[string]any, options ...CheckOptions) []Finding {
	return ordered(findings(typ, state, refs, options...), RefusalCodes["block"])
}

// Check is what is wrong with a FoodBlock 1.6 block, in plain words (each finding's detail; none when it may be
// written).
func Check(typ string, state, refs map[string]any, options ...CheckOptions) []string {
	return details(findings(typ, state, refs, options...))
}

// findings: every finding, in the order found.
func findings(typ string, state, refs map[string]any, options ...CheckOptions) []Finding {
	var opt CheckOptions
	if len(options) > 0 {
		opt = options[0]
	}
	rule, known := rules[typ]
	if !known || !contains(Types, typ) {
		return errs(false, "unknown_type", fmt.Sprintf("%s is not a FoodBlock 1.6 type (%s)", typ, strings.Join(Types, ", ")))
	}
	if state == nil {
		state = map[string]any{}
	}
	if refs == nil {
		refs = map[string]any{}
	}
	wrong := []Finding{}
	c, err := Canonical(typ, state, refs)
	if err != nil {
		return errs(false, "not_canonical", err.Error())
	}
	if int64(len(c)) > blockBytes {
		wrong = append(wrong, Finding{"size_limit", fmt.Sprintf("a block's canonical body is at most %d bytes; link larger content by its hash", blockBytes)})
	}
	for _, key := range sortedKeys(refs) {
		value := refs[key]
		if key == "prev" {
			if !isHash(value) {
				wrong = append(wrong, Finding{"grammar", "refs.prev is one hash"})
			}
			continue
		}
		items, isList := arr(value)
		if isStr(value) {
			items, isList = []any{value}, true
		}
		good := isList && len(items) > 0
		for _, item := range items {
			good = good && isHash(item)
		}
		if !good {
			wrong = append(wrong, Finding{"grammar", fmt.Sprintf("refs.%s is a hash or a set of hashes (64 lowercase hex)", key)})
		}
	}
	wrong = append(wrong, numbers(state, "state")...)
	wrong = append(wrong, numbers(refs, "refs")...)
	if isGenesisShape(typ, state, refs) {
		return append(wrong, genesisErrors(state, refs)...)
	}
	if !truthy(refs["author"]) {
		wrong = append(wrong, Finding{"chain", "refs.author names who said it"})
	}
	if seq, ok := intOf(state["seq"]); !ok || seq < 1 {
		wrong = append(wrong, Finding{"chain", "state.seq is its place in its signing key's chain (1, 2, 3...)"})
	}
	if !truthy(refs["prev"]) {
		wrong = append(wrong, Finding{"chain", "refs.prev names the key's previous block (or the block that brought the key in)"})
	}
	if state["at"] == nil {
		wrong = append(wrong, Finding{"time", "state.at is when it was said"})
	}
	wrong = append(wrong, timesIn(state, "state")...)
	wrong = append(wrong, audienceShape(state)...)
	wrong = append(wrong, whereShape(state["where"])...)
	wrong = append(wrong, shapesIn(state, "state")...)
	wrong = append(wrong, errs(state["confidence"] == nil || matchesGrammar("confidence", state["confidence"]), "grammar", "state.confidence is a decimal string from 0 to 1")...)
	wrong = append(wrong, errs(state["sequencer"] == nil || matchesGrammar("sign_key", state["sequencer"]), "grammar", "state.sequencer is the signing key that orders the record")...)
	wrong = append(wrong, hashListShape(state["manifest"], "state.manifest")...)
	wrong = append(wrong, hashListShape(state["counted"], "state.counted")...)
	wrong = append(wrong, errs(state["line"] == nil || isStr(state["line"]), "shape", "state.line is a line id")...)
	if refs["after"] != nil && int64(len(list(refs["after"]))) > afterHeads {
		wrong = append(wrong, Finding{"after_limit", fmt.Sprintf("refs.after names at most %d heads", afterHeads)})
	}
	if opt.Held != nil && refs["after"] != nil && isTime(state["at"]) {
		for _, h := range list(refs["after"]) {
			if seen, ok := opt.Held[h]; ok && isTime(seen.State["at"]) && str(seen.State["at"]) > str(state["at"]) {
				wrong = append(wrong, Finding{"at_before_after", fmt.Sprintf("state.at is earlier than %s, which it names as seen", h)})
			}
		}
	}
	if opt.Held != nil && typ == "grant" && truthy(refs["parent"]) {
		if parent, ok := opt.Held[str(refs["parent"])]; ok {
			wrong = append(wrong, ScopeRefusals(Block{Type: typ, State: state, Refs: refs}, parent)...)
		}
	}
	// The fields and roles a block may name: the base, and what its schema declares (when the reader holds it).
	var schema *Block
	if truthy(refs["schema"]) && opt.Schemas != nil {
		if s, ok := opt.Schemas[str(refs["schema"])]; ok {
			schema = &s
		}
	}
	if truthy(refs["schema"]) && schema == nil {
		if opt.Schemas != nil {
			wrong = append(wrong, Finding{"undeclared_ref", "refs.schema names a schema this node does not hold: ask for it"})
		}
	} else {
		fields := append(append([]string{}, everyFields...), Fields[typ]...)
		roles := append([]string{}, RefKeys...)
		if schema != nil {
			for k := range obj(schema.State["fields"]) {
				fields = append(fields, k)
			}
			roles = append(roles, list(schema.State["roles"])...)
		}
		for _, k := range sortedKeys(refs) {
			if !contains(roles, k) {
				wrong = append(wrong, Finding{"undeclared_ref", fmt.Sprintf("refs.%s is not declared (the shared refs, or the schema's roles)", k)})
			}
		}
		for _, k := range sortedKeys(state) {
			if !contains(fields, k) {
				wrong = append(wrong, Finding{"undeclared_field", fmt.Sprintf("state.%s is not declared for %s (its base fields, or the schema's)", k, typ)})
			}
		}
	}
	return append(wrong, rule(state, refs)...)
}

// Amount is an amount: Amount("2.5", "kg"). The value is a decimal string.
func Amount(value, unit string) map[string]any { return map[string]any{"value": value, "unit": unit} }

// Money is money in whole minor units: Money(420, "GBP") is £4.20.
func Money(minor int64, currency string) map[string]any {
	return map[string]any{"minor": minor, "currency": currency}
}

// Confidence is a confidence from 0 to 1, as the decimal string 1.6 signs.
func Confidence(value string) (string, error) {
	if !grammar["confidence"](value) {
		return "", fmt.Errorf("protocol: a confidence is from 0 to 1")
	}
	return value, nil
}

// Terms keeps only the 1.6 terms given.
func Terms(given map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range given {
		if v != nil && contains(termKeys, k) {
			out[k] = v
		}
	}
	return out
}
