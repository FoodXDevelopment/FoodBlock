package foodblock

import (
	"reflect"
	"strings"
)

// Reading older blocks (protocol.md: strict writing, generous reading; Encoding: Aliases). Every earlier shape is read
// as its 1.6 form through the one table, spec/aliases.json, in the order protocol.json gives: type names, then the
// shape rules for the block's type.kind, its type and `*`, then the shared ref renames, then `outside`. It applies to
// every block, with or without seq, and reads every row (the `draft: true` rows too). Reading never changes a block or
// its hash: what ReadAs adds beside the content (ReadFrom, Settles, Outside, Retired) is a reader's mark, never signed.

var isType = func() map[string]bool {
	out := map[string]bool{}
	for _, t := range Types {
		out[t] = true
	}
	return out
}()

// get reads `type`, `state.x.y` or `refs.x` from a block as read so far.
func getPath(read map[string]any, path string) any {
	var v any = read
	for _, key := range strings.Split(path, ".") {
		m := obj(v)
		if m == nil {
			return nil
		}
		v = m[key]
	}
	return v
}

func putPath(read map[string]any, path string, value any, force bool) {
	keys := strings.Split(path, ".")
	parent := read
	for _, key := range keys[:len(keys)-1] {
		child := obj(parent[key])
		if child == nil {
			child = map[string]any{}
			parent[key] = child
		}
		parent = child
	}
	last := keys[len(keys)-1]
	if force || parent[last] == nil {
		parent[last] = value
	}
}

func removePath(read map[string]any, path string) {
	keys := strings.Split(path, ".")
	var v any = read
	for _, key := range keys[:len(keys)-1] {
		v = obj(v)[key]
	}
	if parent := obj(v); parent != nil {
		delete(parent, keys[len(keys)-1])
	}
}

// equalScalar is JavaScript's === between a block's value and a rule's: equal strings, booleans or numbers.
func equalScalar(a, b any) bool {
	if x, ok := numOf(a); ok {
		y, ok := numOf(b)
		return ok && x == y
	}
	switch a.(type) {
	case string, bool:
		return a == b
	}
	return false
}

func holds(read map[string]any, when any) bool {
	o, _ := when.(*omap)
	if o == nil {
		return true
	}
	for _, path := range o.keys {
		want, got := o.m[path], getPath(read, path)
		switch {
		case want == "*":
			if got == nil {
				return false
			}
		case want == nil:
			if got != nil {
				return false
			}
		default:
			if !equalScalar(got, want) {
				return false
			}
		}
	}
	return true
}

type typeAlias struct {
	typ, kind string
	ordered   *omap
}

// typeOf is the 1.6 type and kind an old type name reads as. Any other old `base.kind` reads as its base's type, with
// that kind.
func typeOf(name string) *typeAlias {
	if isType[name] {
		return &typeAlias{typ: name}
	}
	if o, ok := at(aliasesDoc, "types", name).(*omap); ok {
		return &typeAlias{typ: str(o.m["type"]), ordered: o}
	}
	parts := strings.SplitN(name, ".", 2)
	if len(parts) == 2 {
		if isType[parts[0]] {
			return &typeAlias{typ: parts[0], kind: parts[1]}
		}
		if o, ok := at(aliasesDoc, "types", parts[0]).(*omap); ok && o.m["retired"] != true {
			return &typeAlias{typ: str(o.m["type"]), kind: parts[1], ordered: o}
		}
	}
	// A type the shapes still read (the draft name `schema`).
	if name != "*" && at(aliasesDoc, "shapes", name) != nil {
		return &typeAlias{typ: name}
	}
	return nil
}

type marks struct {
	settles any
	outside map[string]string
}

// apply is one shape rule on a block as read so far (a copy, changed in place).
func apply(read map[string]any, rule *omap, mk *marks) {
	force := rule.m["force"] == true
	refs := obj(read["refs"])
	if r, ok := rule.m["refs"].(*omap); ok {
		for _, from := range r.keys {
			if value, ok := refs[from]; ok && value != nil {
				delete(refs, from)
				putPath(read, "refs."+str(r.m[from]), value, force)
			}
		}
	}
	if r, ok := rule.m["move"].(*omap); ok {
		for _, from := range r.keys {
			if value := getPath(read, from); value != nil {
				removePath(read, from)
				putPath(read, str(r.m[from]), value, force)
			}
		}
	}
	if r, ok := rule.m["copy"].(*omap); ok {
		for _, to := range r.keys {
			if value := getPath(read, str(r.m[to])); value != nil {
				putPath(read, to, clone(value), force)
			}
		}
	}
	if r, ok := rule.m["join"].(*omap); ok {
		for _, to := range r.keys {
			parts := []string{}
			for _, path := range strs(r.m[to]) {
				if part := getPath(read, path); part != nil {
					parts = append(parts, toText(part))
				}
			}
			if len(parts) > 0 {
				putPath(read, to, strings.Join(parts, "."), true)
			}
		}
	}
	for _, path := range strs(rule.m["drop"]) {
		removePath(read, path)
	}
	if r, ok := rule.m["set"].(*omap); ok {
		for _, path := range r.keys {
			putPath(read, path, plain(r.m[path]), force)
		}
	}
	if t := str(rule.m["type"]); t != "" {
		read["type"] = t
	}
	if k := str(rule.m["kind"]); k != "" {
		obj(read["state"])["kind"] = k
	}
	if s := str(rule.m["settles"]); s != "" {
		mk.settles = obj(read["refs"])[s]
	}
}

func toText(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	c, _ := CanonicalJSON(v)
	return c
}

// shapesOf: per-type rows (type.kind, then type), then the every-type rows (`*`).
func shapesOf(read map[string]any) []*omap {
	typ, kind := str(read["type"]), kindText(obj(read["state"])["kind"])
	out := []*omap{}
	for _, name := range []string{typ + "." + kind, typ, "*"} {
		rows, _ := at(aliasesDoc, "shapes", name).([]any)
		for _, row := range rows {
			if o, ok := row.(*omap); ok {
				out = append(out, o)
			}
		}
	}
	return out
}

// kindText is how JavaScript writes a kind inside a template string (undefined when there is none).
func kindText(v any) string {
	if v == nil {
		return "undefined"
	}
	return toText(v)
}

// ReadAs reads a block of any earlier shape as FoodBlock 1.6; a block that needs no reading comes back as itself.
func ReadAs(b Block) Block {
	alias := typeOf(b.Type)
	if alias == nil {
		return b
	}
	if alias.ordered != nil && alias.ordered.m["retired"] == true {
		b.Retired = true
		return b
	}
	state := cloneMap(b.State)
	defaults := map[string]any{}
	if alias.ordered != nil {
		if renamed, ok := alias.ordered.m["fields"].(*omap); ok {
			for _, from := range renamed.keys {
				if value, ok := state[from]; ok {
					state[str(renamed.m[from])] = value
					delete(state, from)
				}
			}
		}
		for _, k := range alias.ordered.keys {
			if k != "type" && k != "fields" && k != "retired" && k != "outside" {
				defaults[k] = plain(alias.ordered.m[k])
			}
		}
	}
	if alias.kind != "" {
		defaults["kind"] = alias.kind
	}
	for k, v := range state {
		defaults[k] = v
	}
	read := map[string]any{"type": alias.typ, "state": defaults, "refs": cloneMap(b.Refs)}
	mk := &marks{}
	for seen := map[string]bool{}; ; {
		key := str(read["type"]) + "." + kindText(obj(read["state"])["kind"])
		if seen[key] {
			break
		}
		seen[key] = true
		for _, rule := range shapesOf(read) {
			if holds(read, rule.m["when"]) {
				apply(read, rule, mk)
			}
		}
	}
	refs := map[string]any{}
	prefix := str(at(aliasesDoc, "outside"))
	renames, _ := at(aliasesDoc, "refs").(*omap)
	for _, old := range sortedKeys(obj(read["refs"])) {
		value := obj(read["refs"])[old]
		role := old
		if renames != nil && str(renames.m[old]) != "" {
			role = str(renames.m[old])
		}
		// A ref naming someone with no record (`outside:Plenish`) is an open side: the name is kept beside, never as a ref.
		if s, ok := value.(string); ok && prefix != "" && strings.HasPrefix(s, prefix) {
			if mk.outside == nil {
				mk.outside = map[string]string{}
			}
			mk.outside[role] = s[len(prefix):]
		} else {
			refs[role] = value
		}
	}
	out := b
	out.Type, out.State, out.Refs = str(read["type"]), obj(read["state"]), refs
	if out.Type == b.Type && reflect.DeepEqual(out.State, b.State) && reflect.DeepEqual(out.Refs, b.Refs) && mk.settles == nil && mk.outside == nil {
		return b
	}
	out.Settles, out.Outside, out.ReadFrom = mk.settles, mk.outside, b.Type
	return out
}

// IsA is whether a block, old or new, is of this 1.6 type (and kind, when not ""): the one test every reader uses.
func IsA(b Block, typ, kind string) bool {
	read := ReadAs(b)
	return !read.Retired && read.Type == typ && (kind == "" || same(read.State["kind"], kind))
}
