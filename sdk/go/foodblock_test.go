package foodblock

import (
	"encoding/json"
	"os"
	"testing"
)

type TestVector struct {
	Name              string                 `json:"name"`
	Type              string                 `json:"type"`
	State             map[string]interface{} `json:"state"`
	Refs              map[string]interface{} `json:"refs"`
	ExpectedCanonical string                 `json:"expected_canonical"`
	ExpectedHash      string                 `json:"expected_hash"`
}

func loadVectors(t *testing.T) []TestVector {
	data, err := os.ReadFile("../../test/vectors.json")
	if err != nil {
		t.Fatalf("Failed to load test vectors: %v", err)
	}
	var vectors []TestVector
	if err := json.Unmarshal(data, &vectors); err != nil {
		t.Fatalf("Failed to parse test vectors: %v", err)
	}
	return vectors
}

func TestCreate(t *testing.T) {
	block := Create("actor.producer", map[string]interface{}{"name": "Test Farm"}, nil)
	if block.Type != "actor.producer" {
		t.Errorf("expected type actor.producer, got %s", block.Type)
	}
	if len(block.Hash) != 64 {
		t.Errorf("expected 64 char hash, got %d", len(block.Hash))
	}
}

func TestDeterministic(t *testing.T) {
	a := Create("substance.product", map[string]interface{}{"name": "Bread", "price": 4.5}, map[string]interface{}{"seller": "abc"})
	b := Create("substance.product", map[string]interface{}{"name": "Bread", "price": 4.5}, map[string]interface{}{"seller": "abc"})
	if a.Hash != b.Hash {
		t.Errorf("hashes should match: %s != %s", a.Hash, b.Hash)
	}
}

func TestDifferentContent(t *testing.T) {
	a := Create("substance.product", map[string]interface{}{"name": "Bread"}, nil)
	b := Create("substance.product", map[string]interface{}{"name": "Cake"}, nil)
	if a.Hash == b.Hash {
		t.Error("different content should produce different hashes")
	}
}

func TestKeyOrderIndependence(t *testing.T) {
	a := Create("test", map[string]interface{}{"a": float64(1), "b": float64(2)}, nil)
	b := Create("test", map[string]interface{}{"b": float64(2), "a": float64(1)}, nil)
	if a.Hash != b.Hash {
		t.Errorf("key order should not affect hash: %s != %s", a.Hash, b.Hash)
	}
}

func TestRefsArraySorting(t *testing.T) {
	a := Create("transform.process", nil, map[string]interface{}{"inputs": []interface{}{"abc", "def"}})
	b := Create("transform.process", nil, map[string]interface{}{"inputs": []interface{}{"def", "abc"}})
	if a.Hash != b.Hash {
		t.Errorf("refs array order should not affect hash: %s != %s", a.Hash, b.Hash)
	}
}

func TestStateArrayOrderMatters(t *testing.T) {
	a := Create("observe.post", map[string]interface{}{"content_order": []interface{}{"abc", "def"}}, nil)
	b := Create("observe.post", map[string]interface{}{"content_order": []interface{}{"def", "abc"}}, nil)
	if a.Hash == b.Hash {
		t.Error("state array order should affect hash")
	}
}

func TestUpdate(t *testing.T) {
	original := Create("substance.product", map[string]interface{}{"name": "Bread", "price": 4.5}, nil)
	updated := Update(original.Hash, "substance.product", map[string]interface{}{"name": "Bread", "price": 5.0}, nil)

	if updated.Refs["updates"] != original.Hash {
		t.Error("update should ref previous hash")
	}
	if updated.Hash == original.Hash {
		t.Error("update should have different hash")
	}
}

func TestAllBaseTypes(t *testing.T) {
	types := []struct {
		typ   string
		state map[string]interface{}
	}{
		{"actor.producer", map[string]interface{}{"name": "Farm"}},
		{"place.farm", map[string]interface{}{"name": "Field"}},
		{"substance.product", map[string]interface{}{"name": "Bread"}},
		{"transform.process", map[string]interface{}{"name": "Baking"}},
		{"transfer.order", map[string]interface{}{"quantity": float64(2)}},
		{"observe.review", map[string]interface{}{"rating": float64(5)}},
	}

	for _, tt := range types {
		block := Create(tt.typ, tt.state, nil)
		if len(block.Hash) != 64 {
			t.Errorf("type %s: expected 64 char hash, got %d", tt.typ, len(block.Hash))
		}
	}
}

func TestCrossLanguageVectors(t *testing.T) {
	vectors := loadVectors(t)
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) {
			block := Create(v.Type, v.State, v.Refs)
			if block.Hash != v.ExpectedHash {
				t.Errorf("hash mismatch: expected %s, got %s", v.ExpectedHash, block.Hash)
			}

			c := Canonical(v.Type, v.State, v.Refs)
			if c != v.ExpectedCanonical {
				t.Errorf("canonical mismatch:\nexpected: %s\ngot:      %s", v.ExpectedCanonical, c)
			}
		})
	}
}

func TestSignAndVerify(t *testing.T) {
	pub, priv := GenerateKeypair()
	block := Create("substance.product", map[string]interface{}{"name": "Test"}, nil)
	actor := Create("actor.foodie", map[string]interface{}{"name": "User"}, nil)

	signed := Sign(block, actor.Hash, priv)
	if signed.ProtocolVersion != ProtocolVersion {
		t.Errorf("expected version %s, got %s", ProtocolVersion, signed.ProtocolVersion)
	}
	if !Verify(signed, pub) {
		t.Error("signature should be valid")
	}
}

func TestRejectTampered(t *testing.T) {
	pub, priv := GenerateKeypair()
	block := Create("substance.product", map[string]interface{}{"name": "Test"}, nil)
	actor := Create("actor.foodie", map[string]interface{}{"name": "User"}, nil)

	signed := Sign(block, actor.Hash, priv)
	signed.FoodBlock = Create("substance.product", map[string]interface{}{"name": "Tampered"}, nil)
	if Verify(signed, pub) {
		t.Error("tampered signature should be rejected")
	}
}

func TestChain(t *testing.T) {
	v1 := Create("substance.product", map[string]interface{}{"name": "Bread", "price": 4.0}, nil)
	v2 := Update(v1.Hash, "substance.product", map[string]interface{}{"name": "Bread", "price": 4.5}, nil)
	v3 := Update(v2.Hash, "substance.product", map[string]interface{}{"name": "Bread", "price": 5.0}, nil)

	store := map[string]Block{v1.Hash: v1, v2.Hash: v2, v3.Hash: v3}
	resolve := func(h string) *Block {
		if b, ok := store[h]; ok {
			return &b
		}
		return nil
	}

	result := Chain(v3.Hash, resolve, 100)
	if len(result) != 3 {
		t.Errorf("expected 3 blocks, got %d", len(result))
	}
}

func TestTombstone(t *testing.T) {
	block := Create("substance.product", map[string]interface{}{"name": "Test"}, nil)
	ts := Tombstone(block.Hash, "user_hash")
	if ts.Type != "observe.tombstone" {
		t.Errorf("expected observe.tombstone, got %s", ts.Type)
	}
	if ts.Refs["target"] != block.Hash {
		t.Error("tombstone should reference target")
	}
}
