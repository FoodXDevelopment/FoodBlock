package foodblock

import (
	"testing"
)

func TestOfflineQueueCreate(t *testing.T) {
	q := NewOfflineQueue()

	b1 := q.Create("actor.producer", map[string]interface{}{
		"name": "Green Acres Farm",
	}, nil)
	b2 := q.Create("substance.product", map[string]interface{}{
		"name":  "Organic Wheat",
		"price": 3.25,
	}, nil)

	if q.Len() != 2 {
		t.Fatalf("queue length = %d, want 2", q.Len())
	}

	blocks := q.Blocks()
	if len(blocks) != 2 {
		t.Fatalf("len(Blocks()) = %d, want 2", len(blocks))
	}
	if blocks[0].Hash != b1.Hash {
		t.Errorf("blocks[0].Hash = %q, want %q", blocks[0].Hash, b1.Hash)
	}
	if blocks[1].Hash != b2.Hash {
		t.Errorf("blocks[1].Hash = %q, want %q", blocks[1].Hash, b2.Hash)
	}

	// Verify block content
	if blocks[0].Type != "actor.producer" {
		t.Errorf("blocks[0].Type = %q, want %q", blocks[0].Type, "actor.producer")
	}
	if blocks[0].State["name"] != "Green Acres Farm" {
		t.Errorf("blocks[0].State[\"name\"] = %v, want %q", blocks[0].State["name"], "Green Acres Farm")
	}
}

func TestOfflineQueueUpdate(t *testing.T) {
	q := NewOfflineQueue()

	original := q.Create("substance.product", map[string]interface{}{
		"name":  "Bread",
		"price": 4.00,
	}, nil)

	updated := q.Update(original.Hash, "substance.product", map[string]interface{}{
		"name":  "Bread",
		"price": 4.50,
	}, nil)

	if q.Len() != 2 {
		t.Fatalf("queue length = %d, want 2", q.Len())
	}

	// The update block should have refs.updates pointing to the original
	if updated.Refs["updates"] != original.Hash {
		t.Errorf("updated.Refs[\"updates\"] = %v, want %q", updated.Refs["updates"], original.Hash)
	}

	// The update block hash should differ from the original
	if updated.Hash == original.Hash {
		t.Errorf("updated hash should differ from original hash")
	}
}

func TestOfflineQueueClear(t *testing.T) {
	q := NewOfflineQueue()

	q.Create("actor.producer", map[string]interface{}{"name": "Farm"}, nil)
	q.Create("substance.product", map[string]interface{}{"name": "Wheat"}, nil)

	if q.Len() != 2 {
		t.Fatalf("queue length before clear = %d, want 2", q.Len())
	}

	q.Clear()

	if q.Len() != 0 {
		t.Errorf("queue length after clear = %d, want 0", q.Len())
	}

	blocks := q.Blocks()
	if len(blocks) != 0 {
		t.Errorf("len(Blocks()) after clear = %d, want 0", len(blocks))
	}
}

func TestOfflineQueueSorted(t *testing.T) {
	q := NewOfflineQueue()

	// Create a block that will be referenced by another
	farm := q.Create("actor.producer", map[string]interface{}{
		"name": "Green Acres",
	}, nil)

	// Create a product that references the farm
	product := q.Create("substance.product", map[string]interface{}{
		"name": "Organic Wheat",
	}, map[string]interface{}{
		"seller": farm.Hash,
	})

	sorted := q.Sorted()
	if len(sorted) != 2 {
		t.Fatalf("len(Sorted()) = %d, want 2", len(sorted))
	}

	// The farm (dependency) must come before the product (dependent)
	farmIdx := -1
	productIdx := -1
	for i, b := range sorted {
		if b.Hash == farm.Hash {
			farmIdx = i
		}
		if b.Hash == product.Hash {
			productIdx = i
		}
	}

	if farmIdx == -1 {
		t.Fatalf("farm block not found in sorted output")
	}
	if productIdx == -1 {
		t.Fatalf("product block not found in sorted output")
	}
	if farmIdx >= productIdx {
		t.Errorf("farm (index %d) should come before product (index %d) in dependency order", farmIdx, productIdx)
	}
}

func TestOfflineQueueLen(t *testing.T) {
	q := NewOfflineQueue()

	if q.Len() != 0 {
		t.Errorf("empty queue Len() = %d, want 0", q.Len())
	}

	q.Create("actor.producer", map[string]interface{}{"name": "A"}, nil)
	if q.Len() != 1 {
		t.Errorf("queue Len() after 1 create = %d, want 1", q.Len())
	}

	q.Create("actor.producer", map[string]interface{}{"name": "B"}, nil)
	if q.Len() != 2 {
		t.Errorf("queue Len() after 2 creates = %d, want 2", q.Len())
	}

	q.Create("substance.product", map[string]interface{}{"name": "C"}, nil)
	if q.Len() != 3 {
		t.Errorf("queue Len() after 3 creates = %d, want 3", q.Len())
	}
}
