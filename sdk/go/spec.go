package foodblock

import "time"

// The protocol's lists and grammars: protocol.json and aliases.json, carried by the Rust core and read through it.
var (
	both = func() map[string]any {
		out, err := ask[map[string]any]("spec")
		if err != nil {
			panic("foodblock: " + err.Error())
		}
		return out
	}()

	// Protocol is spec/protocol.json and Aliases is spec/aliases.json, as plain JSON values.
	Protocol = obj(both["protocol"])
	Aliases  = obj(both["aliases"])

	// Version is the protocol version these rules are ("1.6").
	Version = str(Protocol["version"])
	// Types are the seven 1.6 type names, in protocol.json's order.
	Types = must[[]string]("types")
	// Verbs are the seven verbs.
	Verbs = list(Protocol["verbs"])
	// RefKeys are the shared ref keys every type may use.
	RefKeys = append(append(list(obj(Protocol["refs"])["who_and_where"]), list(obj(Protocol["refs"])["what_and_which"])...), list(obj(Protocol["refs"])["verbs"])...)
	// Fields are each type's base fields, until the base schemas are published (§3).
	Fields = func() map[string][]string {
		out := map[string][]string{}
		for _, t := range Types {
			out[t] = list(obj(Protocol["fields"])[t])
		}
		return out
	}()
	// Profiles are the three sizes of peer (micro, edge, node) and what each does.
	Profiles = func() map[string][]string {
		out := map[string][]string{}
		for name, v := range obj(Protocol["profiles"]) {
			out[name] = list(v)
		}
		return out
	}()
	// RefusalCodes are protocol.json refusals.codes: the groups of codes, in order.
	RefusalCodes = func() map[string][]string {
		out := map[string][]string{}
		for group := range obj(obj(Protocol["refusals"])["codes"]) {
			out[group] = must[[]string]("spec_list", "refusals.codes."+group)
		}
		return out
	}()

	// Alg is the envelope alg written now; AlgRaw (the agreed secret itself sealed the content key) is read forever.
	Alg    = list(obj(Protocol["envelope"])["read"])[0]
	AlgRaw = list(obj(Protocol["envelope"])["read"])[1]
)

const timeLayout = "2006-01-02T15:04:05.000Z"

func formatTime(t time.Time) string { return t.UTC().Format(timeLayout) }
func now() string                   { return formatTime(time.Now()) }

// matchesGrammar is a grammar test by name (protocol.json `grammar`).
func matchesGrammar(name string, v any) bool { return must[bool]("grammar", name, v) }

// messageKeys are the key names of one message in protocol.json `messages` (pull, push, refusal, ...).
func messageKeys(name string) []string { return list(obj(Protocol["messages"])[name]) }
