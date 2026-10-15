package foodblock

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// The one source (spec/protocol.md, "One source for lists"): every closed list and grammar is read from
// spec/protocol.json, and every older shape from spec/aliases.json. The package carries exact copies of both in
// spec/ (test/sync-spec.cjs makes them; the tests check them byte for byte). No list is copied into code.

//go:embed spec/protocol.json spec/aliases.json
var specFiles embed.FS

// omap is a JSON object that keeps its keys in the order written, where order is meaning (the alias rules, the
// type list).
type omap struct {
	keys []string
	m    map[string]any
}

func decodeOrdered(data []byte) any {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	v, err := readOrdered(dec)
	if err != nil {
		panic("foodblock: the embedded spec is not JSON: " + err.Error())
	}
	return v
}

func readOrdered(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		if t == '{' {
			o := &omap{m: map[string]any{}}
			for dec.More() {
				k, err := dec.Token()
				if err != nil {
					return nil, err
				}
				v, err := readOrdered(dec)
				if err != nil {
					return nil, err
				}
				o.keys = append(o.keys, k.(string))
				o.m[k.(string)] = v
			}
			_, err := dec.Token()
			return o, err
		}
		items := []any{}
		for dec.More() {
			v, err := readOrdered(dec)
			if err != nil {
				return nil, err
			}
			items = append(items, v)
		}
		_, err := dec.Token()
		return items, err
	}
	return tok, nil
}

// plain turns ordered objects into ordinary maps.
func plain(v any) any {
	switch x := v.(type) {
	case *omap:
		out := make(map[string]any, len(x.keys))
		for _, k := range x.keys {
			out[k] = plain(x.m[k])
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = plain(item)
		}
		return out
	}
	return v
}

// at walks an ordered document by keys.
func at(v any, path ...string) any {
	for _, key := range path {
		o, ok := v.(*omap)
		if !ok {
			return nil
		}
		v = o.m[key]
	}
	return v
}

func keysOf(v any) []string {
	if o, ok := v.(*omap); ok {
		return append([]string{}, o.keys...)
	}
	return nil
}

func strs(v any) []string {
	items, _ := v.([]any)
	out := []string{}
	for _, item := range items {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func readSpec(name string) any {
	data, err := specFiles.ReadFile("spec/" + name)
	if err != nil {
		panic("foodblock: " + err.Error())
	}
	return decodeOrdered(data)
}

var (
	protocolDoc = readSpec("protocol.json")
	aliasesDoc  = readSpec("aliases.json")

	// Protocol is spec/protocol.json and Aliases is spec/aliases.json, as plain JSON values.
	Protocol = plain(protocolDoc).(map[string]any)
	Aliases  = plain(aliasesDoc).(map[string]any)

	// Version is the protocol version these rules are ("1.6").
	Version = str(at(protocolDoc, "version"))
	// Types are the seven 1.6 type names, in protocol.json's order.
	Types = keysOf(at(protocolDoc, "types"))
	// Verbs are the seven verbs.
	Verbs = strs(at(protocolDoc, "verbs"))
	// RefKeys are the shared ref keys every type may use.
	RefKeys = append(append(strs(at(protocolDoc, "refs", "who_and_where")), strs(at(protocolDoc, "refs", "what_and_which"))...), strs(at(protocolDoc, "refs", "verbs"))...)
	// Fields are each type's base fields, until the base schemas are published (§3).
	Fields = func() map[string][]string {
		out := map[string][]string{}
		for _, t := range Types {
			out[t] = strs(at(protocolDoc, "fields", t))
		}
		return out
	}()
	// Profiles are the three sizes of peer (micro, edge, node) and what each does.
	Profiles = func() map[string][]string {
		out := map[string][]string{}
		for _, name := range keysOf(at(protocolDoc, "profiles")) {
			out[name] = strs(at(protocolDoc, "profiles", name))
		}
		return out
	}()

	answers          = strs(at(protocolDoc, "answers"))
	stops            = keysOf(at(protocolDoc, "stop"))
	grantKinds       = strs(at(protocolDoc, "grant_kinds"))
	genesisFields    = strs(at(protocolDoc, "genesis"))
	genesisOptional  = strs(at(protocolDoc, "genesis_optional"))
	termKeys         = strs(at(protocolDoc, "terms"))
	lineKeys         = strs(at(protocolDoc, "line"))
	scopeKeys        = strs(at(protocolDoc, "scope"))
	schemaKeys       = strs(at(protocolDoc, "schema"))
	groundsKeys      = strs(at(protocolDoc, "grounds"))
	fieldTypes       = strs(at(protocolDoc, "field_types"))
	everyFields      = strs(at(protocolDoc, "fields", "every"))
	timeFields       = strs(at(protocolDoc, "time_fields"))
	dateFields       = strs(at(protocolDoc, "date_fields"))
	shape            = func(name string) []string { return strs(at(protocolDoc, "shapes", name)) }
	whereArea        = strs(at(protocolDoc, "shapes", "where", "area"))
	intMin, _        = intOf(at(protocolDoc, "integers", "min"))
	intMax, _        = intOf(at(protocolDoc, "integers", "max"))
	blockBytes, _    = intOf(at(protocolDoc, "limits", "block_bytes"))
	afterHeads, _    = intOf(at(protocolDoc, "limits", "after_heads"))
	removalKeys      = strs(at(protocolDoc, "circle", "removal"))
	removalNeeded, _ = intOf(at(protocolDoc, "circle", "removal_default", "needed"))
	signersDefault   = strs(at(protocolDoc, "circle", "signers_default"))
	messageKeys      = func(name string) []string { return strs(at(protocolDoc, "messages", name)) }

	// Alg is the envelope alg written now; AlgRaw (the agreed secret itself sealed the content key) is read forever.
	Alg      = strs(at(protocolDoc, "envelope", "read"))[0]
	AlgRaw   = strs(at(protocolDoc, "envelope", "read"))[1]
	hkdfInfo = str(at(protocolDoc, "envelope", "hkdf_info"))

	grammar = func() map[string]func(string) bool {
		out := map[string]func(string) bool{}
		for _, name := range keysOf(at(protocolDoc, "grammar")) {
			out[name] = compileGrammar(str(at(protocolDoc, "grammar", name)))
		}
		return out
	}()
)

func init() {
	if str(at(protocolDoc, "envelope", "write")) != Alg {
		panic("foodblock: protocol.json writes the first alg it reads")
	}
	if strings.Join(strs(at(protocolDoc, "aliases", "order")), ",") != "types,shapes,refs,outside" {
		panic("foodblock: this reader follows the alias order types, shapes, refs, outside")
	}
}

// matches is a grammar test by name (protocol.json `grammar`).
func matchesGrammar(name string, v any) bool {
	s, ok := v.(string)
	return ok && grammar[name](s)
}

// compileGrammar compiles a protocol.json pattern. Go's regexp (RE2) has no lookahead, so a pattern that uses one
// is translated mechanically: each `(?=X)` right after a literal character c is removed from the pattern, and becomes
// the check that every c in the text is followed by X. That is exact for protocol.json's grammar (the duration: `P`
// and `T` each appear at most once, and each must be followed by what its lookahead names).
func compileGrammar(pattern string) func(string) bool {
	if re, err := regexp.Compile(pattern); err == nil {
		return re.MatchString
	}
	type ahead struct {
		after byte
		next  *regexp.Regexp
	}
	var aheads []ahead
	var b strings.Builder
	for i := 0; i < len(pattern); i++ {
		if strings.HasPrefix(pattern[i:], "(?=") {
			depth, j := 0, i
			for ; j < len(pattern); j++ {
				if pattern[j] == '\\' {
					j++
					continue
				}
				if pattern[j] == '(' {
					depth++
				} else if pattern[j] == ')' {
					depth--
					if depth == 0 {
						break
					}
				}
			}
			if i == 0 {
				panic("foodblock: a lookahead must follow a literal character: " + pattern)
			}
			aheads = append(aheads, ahead{pattern[i-1], regexp.MustCompile("^(?:" + pattern[i+3:j] + ")")})
			i = j
			continue
		}
		b.WriteByte(pattern[i])
	}
	re, err := regexp.Compile(b.String())
	if err != nil {
		panic(fmt.Sprintf("foodblock: cannot read the grammar %q: %v", pattern, err))
	}
	return func(s string) bool {
		if !re.MatchString(s) {
			return false
		}
		for _, a := range aheads {
			for i := 0; i < len(s); i++ {
				if s[i] == a.after && !a.next.MatchString(s[i+1:]) {
					return false
				}
			}
		}
		return true
	}
}
