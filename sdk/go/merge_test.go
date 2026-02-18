package foodblock

import "testing"

// buildResolve creates a resolve function from a map of blocks.
func buildResolve(blocks []Block) func(string) *Block {
	store := make(map[string]Block)
	for _, b := range blocks {
		store[b.Hash] = b
	}
	return func(hash string) *Block {
		if b, ok := store[hash]; ok {
			return &b
		}
		return nil
	}
}

func TestDetectConflict(t *testing.T) {
	// Create a common ancestor and two forks from it.
	ancestor := Create("substance.product", map[string]interface{}{"name": "Bread", "price": 4.0}, nil)
	forkA := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Bread", "price": 4.5}, nil)
	forkB := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Bread", "price": 5.0}, nil)

	resolve := buildResolve([]Block{ancestor, forkA, forkB})

	result := DetectConflict(forkA.Hash, forkB.Hash, resolve)

	if !result.IsConflict {
		t.Fatal("expected conflict to be detected")
	}
	if result.CommonAncestor != ancestor.Hash {
		t.Errorf("expected common ancestor %s, got %s", ancestor.Hash, result.CommonAncestor)
	}
	if len(result.ChainA) == 0 {
		t.Error("expected chainA to be non-empty")
	}
	if len(result.ChainB) == 0 {
		t.Error("expected chainB to be non-empty")
	}
}

func TestDetectConflictNoFork(t *testing.T) {
	block := Create("substance.product", map[string]interface{}{"name": "Bread"}, nil)

	resolve := buildResolve([]Block{block})

	result := DetectConflict(block.Hash, block.Hash, resolve)

	if result.IsConflict {
		t.Error("same hash should not be a conflict")
	}
	if result.CommonAncestor != block.Hash {
		t.Errorf("expected common ancestor to be the block's own hash, got %s", result.CommonAncestor)
	}
}

func TestMergeManual(t *testing.T) {
	ancestor := Create("substance.product", map[string]interface{}{"name": "Bread", "price": 4.0}, nil)
	forkA := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Bread", "price": 4.5}, nil)
	forkB := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Bread", "price": 5.0}, nil)

	resolve := buildResolve([]Block{ancestor, forkA, forkB})

	manualState := map[string]interface{}{"name": "Bread", "price": 4.75}
	merged, err := Merge(forkA.Hash, forkB.Hash, resolve, "manual", manualState)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if merged.Type != "observe.merge" {
		t.Errorf("expected type observe.merge, got %s", merged.Type)
	}

	// State should contain manual values plus strategy
	if merged.State["strategy"] != "manual" {
		t.Errorf("expected strategy 'manual', got %v", merged.State["strategy"])
	}
	if merged.State["name"] != "Bread" {
		t.Errorf("expected name 'Bread', got %v", merged.State["name"])
	}
	if merged.State["price"] != 4.75 {
		t.Errorf("expected price 4.75, got %v", merged.State["price"])
	}

	// Refs should have merges array with both hashes
	merges, ok := merged.Refs["merges"].([]interface{})
	if !ok {
		t.Fatalf("expected refs.merges to be an array")
	}
	if len(merges) != 2 {
		t.Fatalf("expected 2 entries in merges, got %d", len(merges))
	}
	hashSet := map[string]bool{}
	for _, m := range merges {
		if s, ok := m.(string); ok {
			hashSet[s] = true
		}
	}
	if !hashSet[forkA.Hash] || !hashSet[forkB.Hash] {
		t.Error("refs.merges should contain both fork hashes")
	}
}

func TestMergeAWins(t *testing.T) {
	ancestor := Create("substance.product", map[string]interface{}{"name": "Bread", "price": 4.0}, nil)
	forkA := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Sourdough", "price": 4.5}, nil)
	forkB := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Rye", "price": 5.0}, nil)

	resolve := buildResolve([]Block{ancestor, forkA, forkB})

	merged, err := Merge(forkA.Hash, forkB.Hash, resolve, "a_wins", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if merged.State["strategy"] != "a_wins" {
		t.Errorf("expected strategy 'a_wins', got %v", merged.State["strategy"])
	}
	if merged.State["name"] != "Sourdough" {
		t.Errorf("expected name from forkA 'Sourdough', got %v", merged.State["name"])
	}
	if merged.State["price"] != 4.5 {
		t.Errorf("expected price from forkA 4.5, got %v", merged.State["price"])
	}
}

func TestMergeBWins(t *testing.T) {
	ancestor := Create("substance.product", map[string]interface{}{"name": "Bread", "price": 4.0}, nil)
	forkA := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Sourdough", "price": 4.5}, nil)
	forkB := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Rye", "price": 5.0}, nil)

	resolve := buildResolve([]Block{ancestor, forkA, forkB})

	merged, err := Merge(forkA.Hash, forkB.Hash, resolve, "b_wins", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if merged.State["strategy"] != "b_wins" {
		t.Errorf("expected strategy 'b_wins', got %v", merged.State["strategy"])
	}
	if merged.State["name"] != "Rye" {
		t.Errorf("expected name from forkB 'Rye', got %v", merged.State["name"])
	}
	if merged.State["price"] != 5.0 {
		t.Errorf("expected price from forkB 5.0, got %v", merged.State["price"])
	}
}

func TestAutoMerge(t *testing.T) {
	ancestor := Create("substance.product", map[string]interface{}{"name": "Bread", "price": 4.0}, nil)
	forkA := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Sourdough", "price": 4.5}, nil)
	forkB := Update(ancestor.Hash, "substance.product", map[string]interface{}{"name": "Rye", "price": 5.0}, nil)

	resolve := buildResolve([]Block{ancestor, forkA, forkB})

	// Use lww for both conflicting fields: B wins for each
	fieldStrategies := map[string]string{
		"name":  "lww",
		"price": "lww",
	}

	merged, err := AutoMerge(forkA.Hash, forkB.Hash, resolve, fieldStrategies)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if merged.Type != "observe.merge" {
		t.Errorf("expected type observe.merge, got %s", merged.Type)
	}
	if merged.State["strategy"] != "auto" {
		t.Errorf("expected strategy 'auto', got %v", merged.State["strategy"])
	}
	// lww picks B's value for conflicting fields
	if merged.State["name"] != "Rye" {
		t.Errorf("expected name 'Rye' (B wins with lww), got %v", merged.State["name"])
	}
	if merged.State["price"] != 5.0 {
		t.Errorf("expected price 5.0 (B wins with lww), got %v", merged.State["price"])
	}

	// Verify merges ref
	merges, ok := merged.Refs["merges"].([]interface{})
	if !ok {
		t.Fatalf("expected refs.merges to be an array")
	}
	if len(merges) != 2 {
		t.Fatalf("expected 2 entries in refs.merges, got %d", len(merges))
	}
}
