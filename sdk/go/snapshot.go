package foodblock

import "sort"

// SnapshotSummary holds a summary of a block collection.
type SnapshotSummary struct {
	Total  int            `json:"total"`
	ByType map[string]int `json:"by_type"`
}

func computeMerkleRoot(hashes []string) string {
	if len(hashes) == 0 {
		return Sha256Hex("")
	}
	if len(hashes) == 1 {
		return hashes[0]
	}

	layer := make([]string, len(hashes))
	copy(layer, hashes)
	sort.Strings(layer)

	for len(layer) > 1 {
		var next []string
		for i := 0; i < len(layer); i += 2 {
			if i+1 < len(layer) {
				pair := []string{layer[i], layer[i+1]}
				sort.Strings(pair)
				next = append(next, Sha256Hex(pair[0]+pair[1]))
			} else {
				next = append(next, layer[i])
			}
		}
		layer = next
	}
	return layer[0]
}

// CreateSnapshot creates a snapshot block summarizing a collection of blocks.
func CreateSnapshot(blocks []Block, summary string, dateRange []string) Block {
	hashes := make([]string, len(blocks))
	for i, b := range blocks {
		hashes[i] = b.Hash
	}
	merkleRoot := computeMerkleRoot(hashes)

	state := map[string]interface{}{
		"block_count": len(blocks),
		"merkle_root": merkleRoot,
	}
	if summary != "" {
		state["summary"] = summary
	}
	if len(dateRange) > 0 {
		state["date_range"] = dateRange
	}

	return Create("observe.snapshot", state, nil)
}

// VerifySnapshot verifies that a set of blocks matches a snapshot's Merkle root.
func VerifySnapshot(snapshot Block, blocks []Block) (bool, []string) {
	expectedRoot, _ := snapshot.State["merkle_root"].(string)
	expectedCount, _ := snapshot.State["block_count"].(float64)

	if expectedRoot == "" {
		return false, nil
	}

	hashes := make([]string, 0, len(blocks))
	for _, b := range blocks {
		if b.Hash != "" {
			hashes = append(hashes, b.Hash)
		}
	}

	actualRoot := computeMerkleRoot(hashes)
	valid := actualRoot == expectedRoot && len(hashes) == int(expectedCount)

	return valid, nil
}

// Summarize produces a summary of a block collection.
func Summarize(blocks []Block) SnapshotSummary {
	byType := make(map[string]int)
	for _, block := range blocks {
		t := block.Type
		if t == "" {
			t = "unknown"
		}
		byType[t]++
	}
	return SnapshotSummary{Total: len(blocks), ByType: byType}
}
