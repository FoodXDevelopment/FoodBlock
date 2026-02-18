package foodblock

import (
	"strings"
	"testing"
)

func TestParseSimple(t *testing.T) {
	parsed, err := ParseNotation(`actor.producer { name: "Farm" }`)
	if err != nil {
		t.Fatalf("ParseNotation returned error: %v", err)
	}
	if parsed == nil {
		t.Fatalf("ParseNotation returned nil")
	}
	if parsed.Type != "actor.producer" {
		t.Errorf("Type = %q, want %q", parsed.Type, "actor.producer")
	}
	name, ok := parsed.State["name"].(string)
	if !ok {
		t.Fatalf("State[name] is not a string")
	}
	if name != "Farm" {
		t.Errorf("State[name] = %q, want %q", name, "Farm")
	}
	if parsed.Alias != "" {
		t.Errorf("Alias = %q, want empty", parsed.Alias)
	}
}

func TestParseWithAlias(t *testing.T) {
	parsed, err := ParseNotation(`@farm = actor.producer { name: "Farm" }`)
	if err != nil {
		t.Fatalf("ParseNotation returned error: %v", err)
	}
	if parsed == nil {
		t.Fatalf("ParseNotation returned nil")
	}
	if parsed.Alias != "farm" {
		t.Errorf("Alias = %q, want %q", parsed.Alias, "farm")
	}
	if parsed.Type != "actor.producer" {
		t.Errorf("Type = %q, want %q", parsed.Type, "actor.producer")
	}
	name, ok := parsed.State["name"].(string)
	if !ok {
		t.Fatalf("State[name] is not a string")
	}
	if name != "Farm" {
		t.Errorf("State[name] = %q, want %q", name, "Farm")
	}
}

func TestParseWithRefs(t *testing.T) {
	parsed, err := ParseNotation(`substance.product { name: "Bread" } -> seller: @bakery`)
	if err != nil {
		t.Fatalf("ParseNotation returned error: %v", err)
	}
	if parsed == nil {
		t.Fatalf("ParseNotation returned nil")
	}
	if parsed.Type != "substance.product" {
		t.Errorf("Type = %q, want %q", parsed.Type, "substance.product")
	}

	seller, ok := parsed.Refs["seller"].(string)
	if !ok {
		t.Fatalf("Refs[seller] is not a string, got %T", parsed.Refs["seller"])
	}
	if seller != "@bakery" {
		t.Errorf("Refs[seller] = %q, want %q", seller, "@bakery")
	}

	name, ok := parsed.State["name"].(string)
	if !ok {
		t.Fatalf("State[name] is not a string")
	}
	if name != "Bread" {
		t.Errorf("State[name] = %q, want %q", name, "Bread")
	}
}

func TestParseComment(t *testing.T) {
	// Lines starting with # should return nil
	parsed, err := ParseNotation("# this is a comment")
	if err != nil {
		t.Fatalf("ParseNotation(#comment) returned error: %v", err)
	}
	if parsed != nil {
		t.Errorf("ParseNotation(#comment) = %v, want nil", parsed)
	}

	// Lines starting with // should return nil
	parsed, err = ParseNotation("// this is also a comment")
	if err != nil {
		t.Fatalf("ParseNotation(//comment) returned error: %v", err)
	}
	if parsed != nil {
		t.Errorf("ParseNotation(//comment) = %v, want nil", parsed)
	}

	// Empty lines should return nil
	parsed, err = ParseNotation("")
	if err != nil {
		t.Fatalf("ParseNotation(empty) returned error: %v", err)
	}
	if parsed != nil {
		t.Errorf("ParseNotation(empty) = %v, want nil", parsed)
	}
}

func TestParseAll(t *testing.T) {
	text := `# comment line
@farm = actor.producer { name: "Farm" }
@bread = substance.product { name: "Bread" }
// another comment
`
	results, err := ParseAllNotation(text)
	if err != nil {
		t.Fatalf("ParseAllNotation returned error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("len(results) = %d, want 2", len(results))
	}

	if results[0].Alias != "farm" {
		t.Errorf("results[0].Alias = %q, want %q", results[0].Alias, "farm")
	}
	if results[0].Type != "actor.producer" {
		t.Errorf("results[0].Type = %q, want %q", results[0].Type, "actor.producer")
	}

	if results[1].Alias != "bread" {
		t.Errorf("results[1].Alias = %q, want %q", results[1].Alias, "bread")
	}
	if results[1].Type != "substance.product" {
		t.Errorf("results[1].Type = %q, want %q", results[1].Type, "substance.product")
	}
}

func TestFormatNotation(t *testing.T) {
	block := Create("substance.product", map[string]interface{}{
		"name": "Bread",
	}, nil)

	aliasMap := map[string]string{}
	formatted := FormatNotation(block, "bread", aliasMap)

	if !strings.HasPrefix(formatted, "@bread = substance.product") {
		t.Errorf("formatted does not start with '@bread = substance.product', got %q", formatted)
	}
	if !strings.Contains(formatted, "name") {
		t.Errorf("formatted does not contain 'name', got %q", formatted)
	}
	if !strings.Contains(formatted, "Bread") {
		t.Errorf("formatted does not contain 'Bread', got %q", formatted)
	}

	// Roundtrip: parse the formatted output back
	parsed, err := ParseNotation(formatted)
	if err != nil {
		t.Fatalf("ParseNotation(roundtrip) returned error: %v", err)
	}
	if parsed == nil {
		t.Fatalf("ParseNotation(roundtrip) returned nil")
	}
	if parsed.Alias != "bread" {
		t.Errorf("roundtrip Alias = %q, want %q", parsed.Alias, "bread")
	}
	if parsed.Type != "substance.product" {
		t.Errorf("roundtrip Type = %q, want %q", parsed.Type, "substance.product")
	}
	parsedName, ok := parsed.State["name"].(string)
	if !ok {
		t.Fatalf("roundtrip State[name] is not a string")
	}
	if parsedName != "Bread" {
		t.Errorf("roundtrip State[name] = %q, want %q", parsedName, "Bread")
	}
}
