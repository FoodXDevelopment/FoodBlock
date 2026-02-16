package foodblock

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

// Block represents a FoodBlock.
type Block struct {
	Hash  string                 `json:"hash"`
	Type  string                 `json:"type"`
	State map[string]interface{} `json:"state"`
	Refs  map[string]interface{} `json:"refs"`
}

// Create makes a new FoodBlock.
func Create(typ string, state, refs map[string]interface{}) Block {
	if state == nil {
		state = map[string]interface{}{}
	}
	if refs == nil {
		refs = map[string]interface{}{}
	}

	cleanState := omitNulls(state)
	cleanRefs := omitNulls(refs)
	h := Hash(typ, cleanState, cleanRefs)

	return Block{Hash: h, Type: typ, State: cleanState, Refs: cleanRefs}
}

// Update creates a block that supersedes a previous block.
func Update(previousHash, typ string, state, refs map[string]interface{}) Block {
	if refs == nil {
		refs = map[string]interface{}{}
	}
	merged := make(map[string]interface{})
	for k, v := range refs {
		merged[k] = v
	}
	merged["updates"] = previousHash
	return Create(typ, state, merged)
}

// Hash computes the SHA-256 hash of a FoodBlock's canonical form.
func Hash(typ string, state, refs map[string]interface{}) string {
	c := Canonical(typ, state, refs)
	sum := sha256.Sum256([]byte(c))
	return hex.EncodeToString(sum[:])
}

// Canonical produces deterministic JSON for hashing.
func Canonical(typ string, state, refs map[string]interface{}) string {
	obj := map[string]interface{}{
		"type":  typ,
		"state": state,
		"refs":  refs,
	}
	return stringify(obj, false)
}

func stringify(value interface{}, inRefs bool) string {
	if value == nil {
		return ""
	}

	switch v := value.(type) {
	case bool:
		if v {
			return "true"
		}
		return "false"

	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return canonicalNumber(v)

	case string:
		normalized := norm.NFC.String(v)
		return escapeJSON(normalized)

	case []interface{}:
		if inRefs {
			// Sort string arrays for refs (set semantics)
			if isStringSlice(v) {
				sorted := make([]string, len(v))
				for i, item := range v {
					sorted[i] = item.(string)
				}
				sort.Strings(sorted)
				parts := make([]string, 0, len(sorted))
				for _, s := range sorted {
					parts = append(parts, stringify(s, inRefs))
				}
				return "[" + strings.Join(parts, ",") + "]"
			}
		}
		parts := make([]string, 0, len(v))
		for _, item := range v {
			s := stringify(item, inRefs)
			if s != "" {
				parts = append(parts, s)
			}
		}
		return "[" + strings.Join(parts, ",") + "]"

	case map[string]interface{}:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			val := v[k]
			if val == nil {
				continue
			}
			childInRefs := inRefs || k == "refs"
			valStr := stringify(val, childInRefs)
			if valStr != "" {
				normalizedKey := norm.NFC.String(k)
				parts = append(parts, escapeJSON(normalizedKey)+":"+valStr)
			}
		}
		return "{" + strings.Join(parts, ",") + "}"
	}

	return ""
}

func canonicalNumber(n float64) string {
	if n == 0 {
		return "0"
	}
	if n == math.Trunc(n) && math.Abs(n) < (1<<53) {
		return strconv.FormatInt(int64(n), 10)
	}
	return strconv.FormatFloat(n, 'f', -1, 64)
}

func escapeJSON(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		switch r {
		case '"':
			b.WriteString("\\\"")
		case '\\':
			b.WriteString("\\\\")
		case '\n':
			b.WriteString("\\n")
		case '\r':
			b.WriteString("\\r")
		case '\t':
			b.WriteString("\\t")
		default:
			if r < 0x20 {
				b.WriteString(fmt.Sprintf("\\u%04x", r))
			} else {
				b.WriteRune(r)
			}
		}
		i += size
	}
	b.WriteByte('"')
	return b.String()
}

func isStringSlice(v []interface{}) bool {
	for _, item := range v {
		if _, ok := item.(string); !ok {
			return false
		}
	}
	return true
}

func omitNulls(m map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for k, v := range m {
		if v == nil {
			continue
		}
		if nested, ok := v.(map[string]interface{}); ok {
			result[k] = omitNulls(nested)
		} else {
			result[k] = v
		}
	}
	return result
}
