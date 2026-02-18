package foodblock

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// ParsedNotation holds a parsed FBN line.
type ParsedNotation struct {
	Alias string
	Type  string
	State map[string]interface{}
	Refs  map[string]interface{}
}

var aliasRe = regexp.MustCompile(`^@(\w+)\s*=\s*`)
var typeRe = regexp.MustCompile(`^([\w.]+)\s*`)

// ParseNotation parses a single line of FBN into a ParsedNotation.
func ParseNotation(line string) (*ParsedNotation, error) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
		return nil, nil
	}

	result := &ParsedNotation{
		State: map[string]interface{}{},
		Refs:  map[string]interface{}{},
	}
	rest := line

	// Extract alias
	if m := aliasRe.FindStringSubmatch(rest); m != nil {
		result.Alias = m[1]
		rest = rest[len(m[0]):]
	}

	// Extract type
	if m := typeRe.FindStringSubmatch(rest); m != nil {
		result.Type = m[1]
		rest = rest[len(m[0]):]
	} else {
		return nil, fmt.Errorf("FBN: expected type in \"%s\"", line)
	}

	rest = strings.TrimSpace(rest)

	// Extract state: { ... }
	if strings.HasPrefix(rest, "{") {
		end := findClosingBraceGo(rest, 0)
		if end == -1 {
			return nil, fmt.Errorf("FBN: unmatched brace")
		}
		stateStr := rest[:end+1]
		// Normalize to valid JSON
		jsonStr := regexp.MustCompile(`([{,])\s*(\w+)\s*:`).ReplaceAllString(stateStr, `$1"$2":`)
		jsonStr = regexp.MustCompile(`,\s*}`).ReplaceAllString(jsonStr, `}`)

		if err := json.Unmarshal([]byte(jsonStr), &result.State); err != nil {
			if err2 := json.Unmarshal([]byte(stateStr), &result.State); err2 != nil {
				return nil, fmt.Errorf("FBN: could not parse state: %v", err)
			}
		}
		rest = strings.TrimSpace(rest[end+1:])
	}

	// Extract refs: -> key: value, ...
	if strings.HasPrefix(rest, "->") {
		rest = strings.TrimSpace(rest[2:])
		refs, err := parseRefsGo(rest)
		if err != nil {
			return nil, err
		}
		result.Refs = refs
	}

	return result, nil
}

// ParseAllNotation parses multiple lines of FBN.
func ParseAllNotation(text string) ([]*ParsedNotation, error) {
	var results []*ParsedNotation
	for _, line := range strings.Split(text, "\n") {
		parsed, err := ParseNotation(line)
		if err != nil {
			return nil, err
		}
		if parsed != nil {
			results = append(results, parsed)
		}
	}
	return results, nil
}

// FormatNotation formats a block as a single line of FBN.
func FormatNotation(block Block, alias string, aliasMap map[string]string) string {
	hashToAlias := make(map[string]string)
	for name, hash := range aliasMap {
		hashToAlias[hash] = name
	}

	var line string
	if alias != "" {
		line = "@" + alias + " = "
	}
	line += block.Type

	if len(block.State) > 0 {
		parts := make([]string, 0, len(block.State))
		for key, value := range block.State {
			b, _ := json.Marshal(value)
			parts = append(parts, fmt.Sprintf("%s: %s", key, string(b)))
		}
		line += " { " + strings.Join(parts, ", ") + " }"
	}

	if len(block.Refs) > 0 {
		refParts := make([]string, 0, len(block.Refs))
		for key, value := range block.Refs {
			switch v := value.(type) {
			case []interface{}:
				items := make([]string, len(v))
				for i, item := range v {
					s := fmt.Sprint(item)
					if a, ok := hashToAlias[s]; ok {
						items[i] = "@" + a
					} else {
						items[i] = s
					}
				}
				refParts = append(refParts, fmt.Sprintf("%s: [%s]", key, strings.Join(items, ", ")))
			default:
				s := fmt.Sprint(value)
				if a, ok := hashToAlias[s]; ok {
					s = "@" + a
				}
				refParts = append(refParts, fmt.Sprintf("%s: %s", key, s))
			}
		}
		line += " -> " + strings.Join(refParts, ", ")
	}

	return line
}

func findClosingBraceGo(str string, start int) int {
	depth := 0
	inString := false
	escape := false
	for i := start; i < len(str); i++ {
		ch := str[i]
		if escape {
			escape = false
			continue
		}
		if ch == '\\' {
			escape = true
			continue
		}
		if ch == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		if ch == '{' {
			depth++
		}
		if ch == '}' {
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}

func parseRefsGo(str string) (map[string]interface{}, error) {
	refs := make(map[string]interface{})
	parts := splitRefPartsGo(str)
	for _, part := range parts {
		colonIdx := strings.Index(part, ":")
		if colonIdx == -1 {
			continue
		}
		key := strings.TrimSpace(part[:colonIdx])
		value := strings.TrimSpace(part[colonIdx+1:])

		if strings.HasPrefix(value, "[") {
			value = strings.TrimPrefix(value, "[")
			value = strings.TrimSuffix(value, "]")
			value = strings.TrimSpace(value)
			items := strings.Split(value, ",")
			arr := make([]interface{}, len(items))
			for i, item := range items {
				arr[i] = strings.TrimSpace(item)
			}
			refs[key] = arr
		} else {
			refs[key] = value
		}
	}
	return refs, nil
}

func splitRefPartsGo(str string) []string {
	var parts []string
	var current strings.Builder
	inBracket := false
	for _, ch := range str {
		if ch == '[' {
			inBracket = true
		}
		if ch == ']' {
			inBracket = false
		}
		if ch == ',' && !inBracket {
			parts = append(parts, current.String())
			current.Reset()
		} else {
			current.WriteRune(ch)
		}
	}
	if s := strings.TrimSpace(current.String()); s != "" {
		parts = append(parts, current.String())
	}
	return parts
}
