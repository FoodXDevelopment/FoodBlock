package foodblock

import "testing"

func TestCreateSnapshot(t *testing.T) {
	blocks := []Block{
		Create("substance.product", map[string]interface{}{"name": "Bread"}, nil),
		Create("substance.product", map[string]interface{}{"name": "Cake"}, nil),
		Create("actor.producer", map[string]interface{}{"name": "Bakery"}, nil),
	}

	snapshot := CreateSnapshot(blocks, "weekly summary", []string{"2026-02-01", "2026-02-07"})

	if snapshot.Type != "observe.snapshot" {
		t.Errorf("expected type observe.snapshot, got %s", snapshot.Type)
	}

	// block_count should be stored as an int but comes back as interface{}
	blockCount, ok := snapshot.State["block_count"]
	if !ok {
		t.Fatal("expected block_count in state")
	}
	if blockCount != 3 {
		t.Errorf("expected block_count 3, got %v", blockCount)
	}

	merkleRoot, ok := snapshot.State["merkle_root"].(string)
	if !ok {
		t.Fatal("expected merkle_root to be a string")
	}
	if len(merkleRoot) != 64 {
		t.Errorf("expected 64-char merkle_root, got %d chars", len(merkleRoot))
	}

	summary, ok := snapshot.State["summary"].(string)
	if !ok || summary != "weekly summary" {
		t.Errorf("expected summary 'weekly summary', got %v", snapshot.State["summary"])
	}

	if snapshot.Hash == "" {
		t.Error("snapshot should have a hash")
	}
	if len(snapshot.Hash) != 64 {
		t.Errorf("expected 64-char hash, got %d chars", len(snapshot.Hash))
	}
}

func TestVerifySnapshot(t *testing.T) {
	blocks := []Block{
		Create("substance.product", map[string]interface{}{"name": "Bread"}, nil),
		Create("substance.product", map[string]interface{}{"name": "Cake"}, nil),
		Create("actor.producer", map[string]interface{}{"name": "Bakery"}, nil),
	}

	snapshot := CreateSnapshot(blocks, "", nil)

	// VerifySnapshot expects block_count as float64 since that's how JSON unmarshaling works.
	// But Create stores it as int. We need to simulate how the snapshot would look after
	// a JSON round-trip. Manually set block_count as float64 to match the VerifySnapshot code.
	snapshot.State["block_count"] = float64(len(blocks))

	valid, _ := VerifySnapshot(snapshot, blocks)
	if !valid {
		t.Error("snapshot should verify against the same blocks")
	}
}

func TestVerifySnapshotInvalid(t *testing.T) {
	blocks := []Block{
		Create("substance.product", map[string]interface{}{"name": "Bread"}, nil),
		Create("substance.product", map[string]interface{}{"name": "Cake"}, nil),
	}

	snapshot := CreateSnapshot(blocks, "", nil)
	// Simulate JSON round-trip for block_count
	snapshot.State["block_count"] = float64(len(blocks))

	// Provide different blocks for verification
	wrongBlocks := []Block{
		Create("substance.product", map[string]interface{}{"name": "Pizza"}, nil),
		Create("actor.producer", map[string]interface{}{"name": "Restaurant"}, nil),
	}

	valid, _ := VerifySnapshot(snapshot, wrongBlocks)
	if valid {
		t.Error("snapshot should not verify against different blocks")
	}

	// Also test with a different number of blocks
	fewerBlocks := []Block{
		Create("substance.product", map[string]interface{}{"name": "Bread"}, nil),
	}
	valid2, _ := VerifySnapshot(snapshot, fewerBlocks)
	if valid2 {
		t.Error("snapshot should not verify against fewer blocks")
	}
}

func TestSummarize(t *testing.T) {
	blocks := []Block{
		Create("substance.product", map[string]interface{}{"name": "Bread"}, nil),
		Create("substance.product", map[string]interface{}{"name": "Cake"}, nil),
		Create("actor.producer", map[string]interface{}{"name": "Bakery"}, nil),
		Create("transfer.order", map[string]interface{}{"quantity": 10.0}, nil),
		Create("actor.producer", map[string]interface{}{"name": "Farm"}, nil),
	}

	summary := Summarize(blocks)

	if summary.Total != 5 {
		t.Errorf("expected total 5, got %d", summary.Total)
	}

	if summary.ByType["substance.product"] != 2 {
		t.Errorf("expected 2 substance.product, got %d", summary.ByType["substance.product"])
	}
	if summary.ByType["actor.producer"] != 2 {
		t.Errorf("expected 2 actor.producer, got %d", summary.ByType["actor.producer"])
	}
	if summary.ByType["transfer.order"] != 1 {
		t.Errorf("expected 1 transfer.order, got %d", summary.ByType["transfer.order"])
	}

	// Types not present should be 0 (zero value for int in map)
	if summary.ByType["observe.review"] != 0 {
		t.Errorf("expected 0 observe.review, got %d", summary.ByType["observe.review"])
	}
}
