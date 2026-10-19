package foodblock

import (
	"sort"
	"time"
)

// The protocol's lists and grammars: protocol.json, carried by the Rust core and read through it.
var (
	both = func() map[string]any {
		out, err := ask[map[string]any]("spec")
		if err != nil {
			panic("foodblock: " + err.Error())
		}
		return out
	}()

	// Protocol is spec/protocol.json as a plain JSON value. There is no alias table: year zero.
	Protocol = obj(both["protocol"])

	// Version is the protocol version these rules are ("1.6").
	Version = str(Protocol["version"])
	// Types are the seven 1.6 type names, in protocol.json's order.
	Types = must[[]string]("types")
	// Verbs are the seven verbs.
	Verbs = list(Protocol["verbs"])
	// RefKeys are the shared ref keys every type may use.
	RefKeys = append(append(append(list(obj(Protocol["refs"])["who_and_where"]), list(obj(Protocol["refs"])["what_and_which"])...), Verbs...), list(Protocol["causal"])...)
	// Fields are each closed type's base fields (the core's `base_fields`); an open type has none, its fields are the base schemas'.
	Fields = func() map[string][]string {
		out := map[string][]string{}
		for _, t := range Types {
			out[t] = must[[]string]("base_fields", t)
		}
		return out
	}()
	// Peers are the three sizes of peer (micro, edge, node) and what each does.
	Peers = func() map[string][]string {
		out := map[string][]string{}
		for name, v := range obj(Protocol["peers"]) {
			out[name] = list(v)
		}
		return out
	}()
	// Suites are the suites that hash and sign (std, p256, sm).
	Suites = func() []string {
		out := []string{}
		for name, v := range obj(Protocol["suites"]) {
			if s := obj(v); s != nil && s["hash"] != nil {
				out = append(out, name)
			}
		}
		sort.Strings(out)
		return out
	}()
	// Statuses and Powers are the closed lists protocol.json names.
	Statuses = Protocol["statuses"]
	Powers   = Protocol["powers"]
	// RefusalCodes are protocol.json refusals.codes: the groups of codes, in order.
	RefusalCodes = func() map[string][]string {
		out := map[string][]string{}
		for group := range obj(obj(Protocol["refusals"])["codes"]) {
			out[group] = must[[]string]("spec_list", "refusals.codes."+group)
		}
		return out
	}()

	// Alg is the std suite's envelope name.
	Alg = str(obj(obj(Protocol["suites"])["std"])["envelope"])
)

const timeLayout = "2006-01-02T15:04:05.000Z"

func formatTime(t time.Time) string { return t.UTC().Format(timeLayout) }
func now() string                   { return formatTime(time.Now()) }

// matchesGrammar is a grammar test by name (protocol.json `grammar`).
func matchesGrammar(name string, v any) bool { return must[bool]("grammar", name, v) }

// messageKeys are the key names of one message in protocol.json `messages` (pull, push, refusal, ...).
func messageKeys(name string) []string { return list(obj(Protocol["messages"])[name]) }
