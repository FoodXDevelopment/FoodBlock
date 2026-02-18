package foodblock

import (
	"strings"
	"testing"
)

func TestToURIFromBlock(t *testing.T) {
	block := Create("substance.product", map[string]interface{}{
		"name": "Bread",
	}, nil)

	uri := ToURI(&block, "")
	expected := "fb:" + block.Hash
	if uri != expected {
		t.Errorf("ToURI(block, \"\") = %q, want %q", uri, expected)
	}
}

func TestToURIWithAlias(t *testing.T) {
	block := Create("substance.product", map[string]interface{}{
		"name": "Bread",
	}, nil)

	uri := ToURI(&block, "bread")
	expected := "fb:substance.product/bread"
	if uri != expected {
		t.Errorf("ToURI(block, 'bread') = %q, want %q", uri, expected)
	}
}

func TestToURIFromHash(t *testing.T) {
	hash := "abc123def456789000000000000000000000000000000000000000000000abcd"
	uri := ToURIFromHash(hash)
	expected := "fb:" + hash
	if uri != expected {
		t.Errorf("ToURIFromHash(%q) = %q, want %q", hash, uri, expected)
	}
}

func TestFromURIHash(t *testing.T) {
	hash := "abc123def456789000000000000000000000000000000000000000000000abcd"
	result, err := FromURI("fb:" + hash)
	if err != nil {
		t.Fatalf("FromURI returned unexpected error: %v", err)
	}
	if result.Hash != hash {
		t.Errorf("result.Hash = %q, want %q", result.Hash, hash)
	}
	if result.Type != "" {
		t.Errorf("result.Type = %q, want empty", result.Type)
	}
	if result.Alias != "" {
		t.Errorf("result.Alias = %q, want empty", result.Alias)
	}
}

func TestFromURITyped(t *testing.T) {
	result, err := FromURI("fb:substance.product/bread")
	if err != nil {
		t.Fatalf("FromURI returned unexpected error: %v", err)
	}
	if result.Type != "substance.product" {
		t.Errorf("result.Type = %q, want %q", result.Type, "substance.product")
	}
	if result.Alias != "bread" {
		t.Errorf("result.Alias = %q, want %q", result.Alias, "bread")
	}
	if result.Hash != "" {
		t.Errorf("result.Hash = %q, want empty", result.Hash)
	}
}

func TestFromURIInvalid(t *testing.T) {
	_, err := FromURI("https://example.com/block/123")
	if err == nil {
		t.Fatalf("FromURI with non-fb: prefix did not return error")
	}
	if !strings.Contains(err.Error(), "fb:") {
		t.Errorf("error = %q, want it to mention 'fb:'", err.Error())
	}
}
