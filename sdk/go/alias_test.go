package foodblock

import (
	"strings"
	"testing"
)

func TestRegistrySetResolve(t *testing.T) {
	r := NewRegistry()
	r.Set("farm", "abc123def456")

	got, err := r.Resolve("@farm")
	if err != nil {
		t.Fatalf("Resolve returned unexpected error: %v", err)
	}
	if got != "abc123def456" {
		t.Errorf("Resolve(@farm) = %q, want %q", got, "abc123def456")
	}
}

func TestRegistryResolveAtPrefix(t *testing.T) {
	r := NewRegistry()
	r.Set("farm", "hash_of_farm")

	// @farm should resolve to the registered hash
	got, err := r.Resolve("@farm")
	if err != nil {
		t.Fatalf("Resolve(@farm) returned unexpected error: %v", err)
	}
	if got != "hash_of_farm" {
		t.Errorf("Resolve(@farm) = %q, want %q", got, "hash_of_farm")
	}

	// A raw hash (no @ prefix) should pass through unchanged
	raw := "deadbeef1234567890abcdef"
	got, err = r.Resolve(raw)
	if err != nil {
		t.Fatalf("Resolve(raw hash) returned unexpected error: %v", err)
	}
	if got != raw {
		t.Errorf("Resolve(raw) = %q, want %q", got, raw)
	}
}

func TestRegistryResolveRefs(t *testing.T) {
	r := NewRegistry()
	r.Set("bakery", "hash_bakery")
	r.Set("flour", "hash_flour")

	refs := map[string]interface{}{
		"seller": "@bakery",
		"inputs": []interface{}{"@flour", "raw_hash_water"},
	}

	resolved, err := r.ResolveRefs(refs)
	if err != nil {
		t.Fatalf("ResolveRefs returned unexpected error: %v", err)
	}

	if resolved["seller"] != "hash_bakery" {
		t.Errorf("resolved[seller] = %q, want %q", resolved["seller"], "hash_bakery")
	}

	inputs, ok := resolved["inputs"].([]interface{})
	if !ok {
		t.Fatalf("resolved[inputs] is not []interface{}")
	}
	if len(inputs) != 2 {
		t.Fatalf("len(inputs) = %d, want 2", len(inputs))
	}
	if inputs[0] != "hash_flour" {
		t.Errorf("inputs[0] = %q, want %q", inputs[0], "hash_flour")
	}
	if inputs[1] != "raw_hash_water" {
		t.Errorf("inputs[1] = %q, want %q", inputs[1], "raw_hash_water")
	}
}

func TestRegistryCreate(t *testing.T) {
	r := NewRegistry()

	state := map[string]interface{}{"name": "Green Acres Farm"}
	refs := map[string]interface{}{}

	block, err := r.Create("actor.producer", state, refs, "farm")
	if err != nil {
		t.Fatalf("Registry.Create returned unexpected error: %v", err)
	}

	if block.Type != "actor.producer" {
		t.Errorf("block.Type = %q, want %q", block.Type, "actor.producer")
	}
	if block.Hash == "" {
		t.Errorf("block.Hash is empty")
	}

	// The alias should be automatically registered
	if !r.Has("farm") {
		t.Errorf("Registry does not have alias 'farm' after Create")
	}

	got, err := r.Resolve("@farm")
	if err != nil {
		t.Fatalf("Resolve(@farm) after Create returned error: %v", err)
	}
	if got != block.Hash {
		t.Errorf("Resolve(@farm) = %q, want block.Hash %q", got, block.Hash)
	}
}

func TestRegistryHasSize(t *testing.T) {
	r := NewRegistry()

	if r.Size() != 0 {
		t.Errorf("Size() = %d, want 0 for empty registry", r.Size())
	}
	if r.Has("anything") {
		t.Errorf("Has('anything') = true, want false for empty registry")
	}

	r.Set("farm", "hash1")
	r.Set("bakery", "hash2")

	if r.Size() != 2 {
		t.Errorf("Size() = %d, want 2", r.Size())
	}
	if !r.Has("farm") {
		t.Errorf("Has('farm') = false, want true")
	}
	if !r.Has("bakery") {
		t.Errorf("Has('bakery') = false, want true")
	}
	if r.Has("nonexistent") {
		t.Errorf("Has('nonexistent') = true, want false")
	}
}

func TestRegistryUnresolved(t *testing.T) {
	r := NewRegistry()

	_, err := r.Resolve("@unknown")
	if err == nil {
		t.Fatalf("Resolve(@unknown) did not return error")
	}
	if !strings.Contains(err.Error(), "unresolved alias") {
		t.Errorf("error = %q, want it to contain 'unresolved alias'", err.Error())
	}
	if !strings.Contains(err.Error(), "@unknown") {
		t.Errorf("error = %q, want it to contain '@unknown'", err.Error())
	}
}
