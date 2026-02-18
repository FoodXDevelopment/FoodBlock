package foodblock

import "testing"

func TestSha256Hex(t *testing.T) {
	// Known SHA-256 of "hello"
	expected := "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
	result := Sha256Hex("hello")

	if result != expected {
		t.Errorf("Sha256Hex(\"hello\") = %s, expected %s", result, expected)
	}

	if len(result) != 64 {
		t.Errorf("expected 64-character hex string, got %d characters", len(result))
	}
}

func TestMerkleize(t *testing.T) {
	state := map[string]interface{}{
		"name":  "Sourdough",
		"price": 4.5,
	}

	result := Merkleize(state)

	if result.Root == "" {
		t.Fatal("root should not be empty")
	}
	if len(result.Root) != 64 {
		t.Errorf("root should be 64-char hex, got %d chars", len(result.Root))
	}

	// Should have a leaf for each key
	if len(result.Leaves) != 2 {
		t.Errorf("expected 2 leaves, got %d", len(result.Leaves))
	}
	if _, ok := result.Leaves["name"]; !ok {
		t.Error("expected leaf for 'name'")
	}
	if _, ok := result.Leaves["price"]; !ok {
		t.Error("expected leaf for 'price'")
	}

	// Tree should have at least 1 layer (the leaves layer)
	if len(result.Tree) < 1 {
		t.Error("tree should have at least 1 layer")
	}

	// First layer should have 2 entries (one per field)
	if len(result.Tree[0]) != 2 {
		t.Errorf("expected 2 entries in first tree layer, got %d", len(result.Tree[0]))
	}
}

func TestMerkleizeConsistency(t *testing.T) {
	state := map[string]interface{}{
		"name":    "Bread",
		"price":   4.5,
		"organic": true,
	}

	result1 := Merkleize(state)
	result2 := Merkleize(state)

	if result1.Root != result2.Root {
		t.Errorf("same state should produce same root: %s != %s", result1.Root, result2.Root)
	}

	// Leaves should also match
	for key, leaf1 := range result1.Leaves {
		leaf2, ok := result2.Leaves[key]
		if !ok {
			t.Errorf("leaf for key %q missing in second result", key)
			continue
		}
		if leaf1 != leaf2 {
			t.Errorf("leaf mismatch for key %q: %s != %s", key, leaf1, leaf2)
		}
	}
}

func TestSelectiveDisclose(t *testing.T) {
	state := map[string]interface{}{
		"name":    "Sourdough",
		"price":   4.5,
		"organic": true,
		"origin":  "Oregon",
	}

	disclosure := SelectiveDisclose(state, []string{"name", "organic"})

	// Should only disclose requested fields
	if len(disclosure.Disclosed) != 2 {
		t.Fatalf("expected 2 disclosed fields, got %d", len(disclosure.Disclosed))
	}
	if disclosure.Disclosed["name"] != "Sourdough" {
		t.Errorf("expected disclosed name 'Sourdough', got %v", disclosure.Disclosed["name"])
	}
	if disclosure.Disclosed["organic"] != true {
		t.Errorf("expected disclosed organic true, got %v", disclosure.Disclosed["organic"])
	}

	// Should not include non-requested fields
	if _, ok := disclosure.Disclosed["price"]; ok {
		t.Error("price should not be disclosed")
	}
	if _, ok := disclosure.Disclosed["origin"]; ok {
		t.Error("origin should not be disclosed")
	}

	// Should have proof entries
	if len(disclosure.Proof) == 0 {
		t.Error("expected non-empty proof")
	}

	// Root should be set
	if disclosure.Root == "" {
		t.Error("expected root to be set")
	}
	if len(disclosure.Root) != 64 {
		t.Errorf("expected 64-char root, got %d chars", len(disclosure.Root))
	}

	// Each proof entry should have hash, position, and layer
	for i, entry := range disclosure.Proof {
		if entry.Hash == "" {
			t.Errorf("proof entry %d has empty hash", i)
		}
		if entry.Position != "left" && entry.Position != "right" {
			t.Errorf("proof entry %d has invalid position: %s", i, entry.Position)
		}
		if entry.Layer < 0 {
			t.Errorf("proof entry %d has negative layer: %d", i, entry.Layer)
		}
	}
}

func TestVerifyProof(t *testing.T) {
	state := map[string]interface{}{
		"name":    "Sourdough",
		"price":   4.5,
		"organic": true,
	}

	disclosure := SelectiveDisclose(state, []string{"name"})

	valid := VerifyProof(disclosure.Disclosed, disclosure.Proof, disclosure.Root)
	if !valid {
		t.Error("valid selective disclosure should verify against root")
	}
}

func TestVerifyProofInvalid(t *testing.T) {
	state := map[string]interface{}{
		"name":    "Sourdough",
		"price":   4.5,
		"organic": true,
	}

	disclosure := SelectiveDisclose(state, []string{"name"})

	// Tamper with the disclosed data
	tampered := map[string]interface{}{
		"name": "Rye Bread",
	}

	valid := VerifyProof(tampered, disclosure.Proof, disclosure.Root)
	if valid {
		t.Error("tampered disclosed data should fail verification")
	}
}
