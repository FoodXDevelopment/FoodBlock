package foodblock

import "testing"

func TestWellKnown(t *testing.T) {
	doc := WellKnown(WellKnownInfo{
		Version: "0.4.0",
		Name:    "My Bakery Server",
		Types:   []string{"substance.product", "actor.producer"},
		Count:   42,
	})

	if doc.Protocol != "foodblock" {
		t.Errorf("Protocol = %q, want %q", doc.Protocol, "foodblock")
	}
	if doc.Version != "0.4.0" {
		t.Errorf("Version = %q, want %q", doc.Version, "0.4.0")
	}
	if doc.Name != "My Bakery Server" {
		t.Errorf("Name = %q, want %q", doc.Name, "My Bakery Server")
	}
	if doc.Count != 42 {
		t.Errorf("Count = %d, want %d", doc.Count, 42)
	}
	if len(doc.Types) != 2 {
		t.Fatalf("len(Types) = %d, want 2", len(doc.Types))
	}
	if doc.Types[0] != "substance.product" {
		t.Errorf("Types[0] = %q, want %q", doc.Types[0], "substance.product")
	}
	if doc.Types[1] != "actor.producer" {
		t.Errorf("Types[1] = %q, want %q", doc.Types[1], "actor.producer")
	}
}

func TestWellKnownDefaults(t *testing.T) {
	doc := WellKnown(WellKnownInfo{})

	if doc.Protocol != "foodblock" {
		t.Errorf("Protocol = %q, want %q", doc.Protocol, "foodblock")
	}
	if doc.Version != "0.4.0" {
		t.Errorf("Version = %q, want %q (default)", doc.Version, "0.4.0")
	}
	if doc.Name != "FoodBlock Server" {
		t.Errorf("Name = %q, want %q (default)", doc.Name, "FoodBlock Server")
	}
	if doc.Count != 0 {
		t.Errorf("Count = %d, want 0 (default)", doc.Count)
	}
	// Nil slices should be replaced with empty slices
	if doc.Types == nil {
		t.Errorf("Types is nil, want empty slice")
	}
	if len(doc.Types) != 0 {
		t.Errorf("len(Types) = %d, want 0", len(doc.Types))
	}
	if doc.Schemas == nil {
		t.Errorf("Schemas is nil, want empty slice")
	}
	if doc.Templates == nil {
		t.Errorf("Templates is nil, want empty slice")
	}
	if doc.Peers == nil {
		t.Errorf("Peers is nil, want empty slice")
	}
}

func TestWellKnownEndpoints(t *testing.T) {
	doc := WellKnown(WellKnownInfo{})

	if doc.Endpoints.Blocks != "/blocks" {
		t.Errorf("Endpoints.Blocks = %q, want %q", doc.Endpoints.Blocks, "/blocks")
	}
	if doc.Endpoints.Batch != "/blocks/batch" {
		t.Errorf("Endpoints.Batch = %q, want %q", doc.Endpoints.Batch, "/blocks/batch")
	}
	if doc.Endpoints.Chain != "/chain" {
		t.Errorf("Endpoints.Chain = %q, want %q", doc.Endpoints.Chain, "/chain")
	}
	if doc.Endpoints.Heads != "/heads" {
		t.Errorf("Endpoints.Heads = %q, want %q", doc.Endpoints.Heads, "/heads")
	}
}
