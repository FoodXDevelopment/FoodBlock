package foodblock

import (
	"encoding/json"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

// Small helpers for reading JSON values the way the JS reference reads them. A value is what encoding/json
// produces (with UseNumber), or what Go code builds: map[string]any, []any or []string, string, bool, a number.

// present is a value that is neither missing nor null ("!== undefined" after nulls are dropped).
func present(m map[string]any, key string) bool { v, ok := m[key]; return ok && v != nil }

// truthy is JavaScript's truthiness.
func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	}
	if n, ok := numOf(v); ok {
		return n != 0 && !math.IsNaN(n)
	}
	return true
}

func str(v any) string { s, _ := v.(string); return s }

func isStr(v any) bool { _, ok := v.(string); return ok }

// obj is v as an object, or nil.
func obj(v any) map[string]any { m, _ := v.(map[string]any); return m }

// arr is v as a list.
func arr(v any) ([]any, bool) {
	switch x := v.(type) {
	case []any:
		return x, true
	case []string:
		out := make([]any, len(x))
		for i, s := range x {
			out[i] = s
		}
		return out, true
	case nil:
		return nil, false
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Slice {
		out := make([]any, rv.Len())
		for i := range out {
			out[i] = rv.Index(i).Interface()
		}
		return out, true
	}
	return nil, false
}

// list is a ref read as a set of hashes: one hash, or the strings of a list.
func list(v any) []string {
	if s, ok := v.(string); ok {
		if s == "" {
			return nil
		}
		return []string{s}
	}
	items, _ := arr(v)
	out := []string{}
	for _, item := range items {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// numOf is a JSON number as a float.
func numOf(v any) (float64, bool) {
	switch x := v.(type) {
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case int32:
		return float64(x), true
	case uint64:
		return float64(x), true
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	}
	return 0, false
}

// intOf is a whole JSON number (Number.isInteger).
func intOf(v any) (int64, bool) {
	switch x := v.(type) {
	case int:
		return int64(x), true
	case int64:
		return x, true
	case json.Number:
		if i, err := x.Int64(); err == nil {
			return i, true
		}
	}
	f, ok := numOf(v)
	if !ok || math.IsNaN(f) || math.IsInf(f, 0) || f != math.Trunc(f) {
		return 0, false
	}
	return int64(f), true
}

func isInt(v any) bool { _, ok := intOf(v); return ok }

// jsNumber is JavaScript's Number(x) for the values blocks hold (decimal strings, numbers).
func jsNumber(v any) float64 {
	if n, ok := numOf(v); ok {
		return n
	}
	switch x := v.(type) {
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return math.NaN()
		}
		return f
	case bool:
		if x {
			return 1
		}
		return 0
	case nil:
		return 0
	}
	return math.NaN()
}

// same is JavaScript's === for the strings refs hold: two equal strings.
func same(a, b any) bool { x, ok := a.(string); y, ok2 := b.(string); return ok && ok2 && x == y }

func contains(items []string, s string) bool {
	for _, item := range items {
		if item == s {
			return true
		}
	}
	return false
}

func uniq(items []string) []string {
	seen, out := map[string]bool{}, []string{}
	for _, item := range items {
		if !seen[item] {
			seen[item] = true
			out = append(out, item)
		}
	}
	return out
}

func sorted(items []string) []string {
	out := append([]string{}, items...)
	sort.Strings(out)
	return out
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// clone is a deep copy of a JSON value (structuredClone).
func clone(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			out[k] = clone(val)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = clone(val)
		}
		return out
	case []string:
		return append([]string{}, x...)
	}
	return v
}

func cloneMap(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return clone(m).(map[string]any)
}

// equalJSON is deep equality of two JSON values, numbers compared by value.
func equalJSON(a, b any) bool {
	x, err1 := json.Marshal(a)
	y, err2 := json.Marshal(b)
	if err1 != nil || err2 != nil {
		return false
	}
	var p, q any
	if json.Unmarshal(x, &p) != nil || json.Unmarshal(y, &q) != nil {
		return false
	}
	return reflect.DeepEqual(p, q)
}

func plural[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}
