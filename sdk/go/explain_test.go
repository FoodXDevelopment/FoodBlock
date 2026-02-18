package foodblock

import (
	"strings"
	"testing"
)

// makeResolver creates an in-memory resolve function from a map of hash -> Block.
func makeResolver(blocks map[string]*Block) func(string) *Block {
	return func(hash string) *Block {
		return blocks[hash]
	}
}

func TestExplainSimpleBlock(t *testing.T) {
	product := Create("substance.product", map[string]interface{}{
		"name":  "Sourdough Bread",
		"price": 4.50,
	}, nil)

	blocks := map[string]*Block{
		product.Hash: &product,
	}

	narrative := Explain(product.Hash, makeResolver(blocks), 10)

	if !strings.Contains(narrative, "Sourdough Bread") {
		t.Errorf("narrative does not contain 'Sourdough Bread', got %q", narrative)
	}
	if !strings.Contains(narrative, "$4.50") {
		t.Errorf("narrative does not contain '$4.50', got %q", narrative)
	}
}

func TestExplainWithSeller(t *testing.T) {
	seller := Create("actor.producer", map[string]interface{}{
		"name": "Downtown Bakery",
	}, nil)

	product := Create("substance.product", map[string]interface{}{
		"name":  "Ciabatta",
		"price": 5.00,
	}, map[string]interface{}{
		"seller": seller.Hash,
	})

	blocks := map[string]*Block{
		seller.Hash:  &seller,
		product.Hash: &product,
	}

	narrative := Explain(product.Hash, makeResolver(blocks), 10)

	if !strings.Contains(narrative, "Ciabatta") {
		t.Errorf("narrative does not contain 'Ciabatta', got %q", narrative)
	}
	if !strings.Contains(narrative, "By Downtown Bakery") {
		t.Errorf("narrative does not contain 'By Downtown Bakery', got %q", narrative)
	}
}

func TestExplainWithInputs(t *testing.T) {
	flour := Create("substance.product", map[string]interface{}{
		"name": "Organic Flour",
	}, nil)

	water := Create("substance.product", map[string]interface{}{
		"name": "Spring Water",
	}, nil)

	bread := Create("substance.product", map[string]interface{}{
		"name": "Bread",
	}, map[string]interface{}{
		"inputs": []interface{}{flour.Hash, water.Hash},
	})

	blocks := map[string]*Block{
		flour.Hash: &flour,
		water.Hash: &water,
		bread.Hash: &bread,
	}

	narrative := Explain(bread.Hash, makeResolver(blocks), 10)

	if !strings.Contains(narrative, "Made from") {
		t.Errorf("narrative does not contain 'Made from', got %q", narrative)
	}
	if !strings.Contains(narrative, "Organic Flour") {
		t.Errorf("narrative does not contain 'Organic Flour', got %q", narrative)
	}
	if !strings.Contains(narrative, "Spring Water") {
		t.Errorf("narrative does not contain 'Spring Water', got %q", narrative)
	}
}

func TestExplainTombstoned(t *testing.T) {
	block := Create("substance.product", map[string]interface{}{
		"name":       "Recalled Product",
		"tombstoned": true,
	}, nil)

	blocks := map[string]*Block{
		block.Hash: &block,
	}

	narrative := Explain(block.Hash, makeResolver(blocks), 10)

	if !strings.Contains(narrative, "erased") {
		t.Errorf("narrative does not contain 'erased', got %q", narrative)
	}
}
