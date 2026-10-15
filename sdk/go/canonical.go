// Package foodblock is FoodBlock 1.6 (spec/protocol.md) for Go: the reference SDK's protocol, module for module.
package foodblock

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

// Canonical is the canonical form (spec/canonical.md): the bytes a block's hash and signature cover. Floats are still
// formatted (as JavaScript writes them) so old blocks keep their hashes; the write check refuses them.
func Canonical(typ string, state, refs map[string]any) (string, error) {
	if state == nil {
		state = map[string]any{}
	}
	if refs == nil {
		refs = map[string]any{}
	}
	return CanonicalJSON(map[string]any{"type": typ, "state": state, "refs": refs})
}

// CanonicalJSON is any value by the same rules: how a signed message part is signed (protocol.md, Messages).
func CanonicalJSON(value any) (string, error) {
	var b strings.Builder
	err := write(&b, value, false)
	return b.String(), err
}

func write(b *strings.Builder, value any, inRefs bool) error {
	switch v := value.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if v {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case string:
		writeString(b, v)
	case json.Number:
		f, err := v.Float64()
		if err != nil {
			return fmt.Errorf("FoodBlock: bad number %s", v)
		}
		return writeNumber(b, f)
	case float64:
		return writeNumber(b, v)
	case float32:
		return writeNumber(b, float64(v))
	case int:
		b.WriteString(strconv.FormatInt(int64(v), 10))
	case int64:
		b.WriteString(strconv.FormatInt(v, 10))
	case int32:
		b.WriteString(strconv.FormatInt(int64(v), 10))
	case uint64:
		b.WriteString(strconv.FormatUint(v, 10))
	case []string:
		items := make([]any, len(v))
		for i, s := range v {
			items[i] = s
		}
		return write(b, items, inRefs)
	case []any:
		items := v
		if inRefs && allStrings(v) {
			items = append([]any(nil), v...)
			sort.Slice(items, func(i, j int) bool { return utf16Less(items[i].(string), items[j].(string)) })
		}
		b.WriteByte('[')
		first := true
		for _, item := range items {
			if item == nil {
				continue
			}
			if !first {
				b.WriteByte(',')
			}
			first = false
			if err := write(b, item, inRefs); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(v))
		for k, val := range v {
			if val != nil {
				keys = append(keys, k)
			}
		}
		sort.Slice(keys, func(i, j int) bool { return utf16Less(keys[i], keys[j]) })
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			writeString(b, k)
			b.WriteByte(':')
			if err := write(b, v[k], inRefs || k == "refs"); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	case map[string]string:
		m := make(map[string]any, len(v))
		for k, val := range v {
			m[k] = val
		}
		return write(b, m, inRefs)
	default:
		// Anything else (a struct, a typed slice) is written as its JSON.
		data, err := json.Marshal(value)
		if err != nil {
			return fmt.Errorf("FoodBlock: unsupported value %T", value)
		}
		dec := json.NewDecoder(strings.NewReader(string(data)))
		dec.UseNumber()
		var generic any
		if err := dec.Decode(&generic); err != nil {
			return err
		}
		return write(b, generic, inRefs)
	}
	return nil
}

// utf16Less is Rule 1's order: UTF-16 code units, as JavaScript sorts.
func utf16Less(a, b string) bool {
	x, y := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(x) && i < len(y); i++ {
		if x[i] != y[i] {
			return x[i] < y[i]
		}
	}
	return len(x) < len(y)
}

func nfc(s string) string { return norm.NFC.String(s) }

func allStrings(v []any) bool {
	for _, item := range v {
		if _, ok := item.(string); !ok {
			return false
		}
	}
	return true
}

// writeNumber formats as ECMAScript Number::toString (RFC 8785 §3.2.2.3).
func writeNumber(b *strings.Builder, n float64) error {
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return fmt.Errorf("FoodBlock: Infinity and NaN are not allowed")
	}
	if n == 0 {
		b.WriteString("0")
		return nil
	}
	if n < 0 {
		b.WriteByte('-')
		n = -n
	}
	e := strconv.FormatFloat(n, 'e', -1, 64) // d.ddde±XX, the shortest round-trip digits
	mant, expPart, _ := strings.Cut(e, "e")
	digits := strings.Replace(mant, ".", "", 1)
	exp, _ := strconv.Atoi(expPart)
	k, point := len(digits), exp+1
	switch {
	case k <= point && point <= 21:
		b.WriteString(digits + strings.Repeat("0", point-k))
	case 0 < point && point <= 21:
		b.WriteString(digits[:point] + "." + digits[point:])
	case -6 < point && point <= 0:
		b.WriteString("0." + strings.Repeat("0", -point) + digits)
	default:
		m := digits[:1]
		if k > 1 {
			m += "." + digits[1:]
		}
		sign := "+"
		if point-1 < 0 {
			sign = "-"
		}
		b.WriteString(m + "e" + sign + strconv.Itoa(abs(point-1)))
	}
	return nil
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// writeString is JSON.stringify of an NFC string: UTF-8 kept, only quotes, backslashes and controls escaped.
func writeString(b *strings.Builder, s string) {
	s = nfc(s)
	b.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(b, `\u%04x`, r)
			} else {
				b.WriteString(s[i : i+size])
			}
		}
		i += size
	}
	b.WriteByte('"')
}
