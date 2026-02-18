package foodblock

import "testing"

// buildForwardIndex builds a map from referenced hash -> []Block for use as resolveForward.
// It scans every block's refs and indexes each referenced hash to the block.
func buildForwardIndex(blocks []Block) func(string) []Block {
	index := make(map[string][]Block)
	for _, b := range blocks {
		for _, ref := range b.Refs {
			switch v := ref.(type) {
			case string:
				index[v] = append(index[v], b)
			case []interface{}:
				for _, item := range v {
					if s, ok := item.(string); ok {
						index[s] = append(index[s], b)
					}
				}
			}
		}
	}
	return func(hash string) []Block {
		return index[hash]
	}
}

func TestForward(t *testing.T) {
	// Create a source block and two blocks that reference it via different roles.
	source := Create("substance.ingredient", map[string]interface{}{"name": "Flour"}, nil)
	refA := Create("transform.baking", map[string]interface{}{"name": "Bake bread"}, map[string]interface{}{
		"input": source.Hash,
	})
	refB := Create("transfer.order", map[string]interface{}{"quantity": 50.0}, map[string]interface{}{
		"item": source.Hash,
	})

	resolveForward := buildForwardIndex([]Block{source, refA, refB})

	result := Forward(source.Hash, resolveForward)

	if result.Count != 2 {
		t.Fatalf("expected 2 referencing blocks, got %d", result.Count)
	}

	roles := map[string]bool{}
	hashes := map[string]bool{}
	for _, r := range result.Referencing {
		roles[r.Role] = true
		hashes[r.Block.Hash] = true
	}

	if !roles["input"] {
		t.Errorf("expected role 'input' in forward results")
	}
	if !roles["item"] {
		t.Errorf("expected role 'item' in forward results")
	}
	if !hashes[refA.Hash] {
		t.Errorf("expected refA hash in forward results")
	}
	if !hashes[refB.Hash] {
		t.Errorf("expected refB hash in forward results")
	}
}

func TestForwardNoRefs(t *testing.T) {
	orphan := Create("substance.product", map[string]interface{}{"name": "Lonely block"}, nil)

	resolveForward := buildForwardIndex([]Block{orphan})

	result := Forward(orphan.Hash, resolveForward)

	if result.Count != 0 {
		t.Errorf("expected 0 referencing blocks, got %d", result.Count)
	}
	if len(result.Referencing) != 0 {
		t.Errorf("expected empty referencing list, got %d items", len(result.Referencing))
	}
}

func TestRecall(t *testing.T) {
	// Build a multi-level chain: ingredient -> transform -> product -> transfer
	ingredient := Create("substance.ingredient", map[string]interface{}{"name": "Contaminated Flour"}, nil)
	transform := Create("transform.baking", map[string]interface{}{"name": "Bake"}, map[string]interface{}{
		"input": ingredient.Hash,
	})
	product := Create("substance.product", map[string]interface{}{"name": "Bread"}, map[string]interface{}{
		"source": transform.Hash,
	})
	transfer := Create("transfer.delivery", map[string]interface{}{"destination": "Store A"}, map[string]interface{}{
		"item": product.Hash,
	})

	resolveForward := buildForwardIndex([]Block{ingredient, transform, product, transfer})

	result := Recall(ingredient.Hash, resolveForward, 50, nil, nil)

	if len(result.Affected) != 3 {
		t.Fatalf("expected 3 affected blocks (transform, product, transfer), got %d", len(result.Affected))
	}
	if result.Depth != 3 {
		t.Errorf("expected depth 3, got %d", result.Depth)
	}

	// Verify paths exist and start with the source hash
	if len(result.Paths) != 3 {
		t.Fatalf("expected 3 paths, got %d", len(result.Paths))
	}
	for i, path := range result.Paths {
		if path[0] != ingredient.Hash {
			t.Errorf("path %d should start with source hash", i)
		}
	}
}

func TestRecallTypeFilter(t *testing.T) {
	// Build: ingredient -> transform -> product
	ingredient := Create("substance.ingredient", map[string]interface{}{"name": "Flour"}, nil)
	transform := Create("transform.baking", map[string]interface{}{"name": "Bake"}, map[string]interface{}{
		"input": ingredient.Hash,
	})
	product := Create("substance.product", map[string]interface{}{"name": "Bread"}, map[string]interface{}{
		"source": transform.Hash,
	})

	resolveForward := buildForwardIndex([]Block{ingredient, transform, product})

	// Filter to only substance.* types with wildcard
	result := Recall(ingredient.Hash, resolveForward, 50, []string{"substance.*"}, nil)

	// The transform block is not substance.*, so it won't be visited;
	// therefore the product (which references transform, not ingredient) won't be reached either.
	// Only blocks directly reachable through matching-type blocks are returned.
	// Since transform is filtered out, BFS can't reach product through transform.
	// Actually: recall only adds matching-type blocks to affected AND to the BFS queue,
	// so non-matching blocks break the chain.
	for _, b := range result.Affected {
		if b.Type != "substance.ingredient" && b.Type != "substance.product" {
			t.Errorf("expected only substance.* types, got %s", b.Type)
		}
	}

	// Now test without filter to confirm we get everything
	allResult := Recall(ingredient.Hash, resolveForward, 50, nil, nil)
	if len(allResult.Affected) < len(result.Affected) {
		t.Errorf("unfiltered recall should return at least as many blocks as filtered")
	}
}

func TestDownstream(t *testing.T) {
	// Build: ingredient -> transform -> product (substance.product matches substance.*)
	ingredient := Create("substance.ingredient", map[string]interface{}{"name": "Flour"}, nil)
	product := Create("substance.product", map[string]interface{}{"name": "Bread"}, map[string]interface{}{
		"input": ingredient.Hash,
	})
	// A non-substance block also references ingredient
	review := Create("observe.review", map[string]interface{}{"rating": 5.0}, map[string]interface{}{
		"subject": ingredient.Hash,
	})

	resolveForward := buildForwardIndex([]Block{ingredient, product, review})

	downstream := Downstream(ingredient.Hash, resolveForward)

	// Should only include substance.* blocks, not the review
	for _, b := range downstream {
		if b.Type != "substance.ingredient" && b.Type != "substance.product" {
			t.Errorf("Downstream should only return substance.* blocks, got %s", b.Type)
		}
	}

	// product should be in results
	found := false
	for _, b := range downstream {
		if b.Hash == product.Hash {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected substance.product in downstream results")
	}

	// review should NOT be in results
	for _, b := range downstream {
		if b.Hash == review.Hash {
			t.Error("observe.review should not be in downstream results")
		}
	}
}
