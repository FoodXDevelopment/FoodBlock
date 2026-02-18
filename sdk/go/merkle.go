package foodblock

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
)

// MerkleResult holds the result of merkle-izing a state object.
type MerkleResult struct {
	Root   string            `json:"root"`
	Leaves map[string]string `json:"leaves"`
	Tree   [][]string        `json:"tree"`
}

// DisclosureResult holds a selective disclosure with Merkle proof.
type DisclosureResult struct {
	Disclosed map[string]interface{} `json:"disclosed"`
	Proof     []ProofEntry           `json:"proof"`
	Root      string                 `json:"root"`
}

// ProofEntry is a sibling hash in a Merkle proof.
type ProofEntry struct {
	Hash     string `json:"hash"`
	Position string `json:"position"`
	Layer    int    `json:"layer"`
}

// Sha256Hex computes the SHA-256 hash of a string and returns it as hex.
func Sha256Hex(data string) string {
	h := sha256.Sum256([]byte(data))
	return hex.EncodeToString(h[:])
}

func canonicalMerkleValue(value interface{}) string {
	if value == nil {
		return "null"
	}
	switch v := value.(type) {
	case map[string]interface{}:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		b, _ := json.Marshal(v)
		return string(b)
	default:
		return fmt.Sprintf("%v", v)
	}
}

// Merkleize creates a Merkle tree from a state object.
func Merkleize(state map[string]interface{}) MerkleResult {
	keys := make([]string, 0, len(state))
	for k := range state {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	leaves := make(map[string]string)
	for _, key := range keys {
		leaves[key] = Sha256Hex(key + ":" + canonicalMerkleValue(state[key]))
	}

	layer0 := make([]string, len(keys))
	for i, k := range keys {
		layer0[i] = leaves[k]
	}

	tree := [][]string{layer0}
	currentLayer := layer0

	for len(currentLayer) > 1 {
		var nextLayer []string
		for i := 0; i < len(currentLayer); i += 2 {
			if i+1 < len(currentLayer) {
				pair := []string{currentLayer[i], currentLayer[i+1]}
				sort.Strings(pair)
				nextLayer = append(nextLayer, Sha256Hex(pair[0]+pair[1]))
			} else {
				nextLayer = append(nextLayer, currentLayer[i])
			}
		}
		tree = append(tree, nextLayer)
		currentLayer = nextLayer
	}

	root := ""
	if len(currentLayer) > 0 {
		root = currentLayer[0]
	} else {
		root = Sha256Hex("")
	}

	return MerkleResult{Root: root, Leaves: leaves, Tree: tree}
}

// SelectiveDisclose creates a selective disclosure of specific fields with a Merkle proof.
func SelectiveDisclose(state map[string]interface{}, fieldNames []string) DisclosureResult {
	result := Merkleize(state)

	disclosed := make(map[string]interface{})
	for _, name := range fieldNames {
		if val, ok := state[name]; ok {
			disclosed[name] = val
		}
	}

	sortedKeys := make([]string, 0, len(state))
	for k := range state {
		sortedKeys = append(sortedKeys, k)
	}
	sort.Strings(sortedKeys)

	var proof []ProofEntry
	for _, name := range fieldNames {
		idx := -1
		for i, k := range sortedKeys {
			if k == name {
				idx = i
				break
			}
		}
		if idx == -1 {
			continue
		}

		currentIdx := idx
		for layer := 0; layer < len(result.Tree)-1; layer++ {
			layerNodes := result.Tree[layer]
			var siblingIdx int
			var position string
			if currentIdx%2 == 0 {
				siblingIdx = currentIdx + 1
				position = "right"
			} else {
				siblingIdx = currentIdx - 1
				position = "left"
			}
			if siblingIdx >= 0 && siblingIdx < len(layerNodes) {
				proof = append(proof, ProofEntry{
					Hash:     layerNodes[siblingIdx],
					Position: position,
					Layer:    layer,
				})
			}
			currentIdx = currentIdx / 2
		}
	}

	return DisclosureResult{Disclosed: disclosed, Proof: proof, Root: result.Root}
}

// VerifyProof verifies that disclosed fields and proof reconstruct the given Merkle root.
func VerifyProof(disclosed map[string]interface{}, proof []ProofEntry, root string) bool {
	if disclosed == nil || root == "" {
		return false
	}

	disclosedKeys := make([]string, 0, len(disclosed))
	for k := range disclosed {
		disclosedKeys = append(disclosedKeys, k)
	}
	sort.Strings(disclosedKeys)

	for _, key := range disclosedKeys {
		currentHash := Sha256Hex(key + ":" + canonicalMerkleValue(disclosed[key]))

		maxLayer := -1
		for _, p := range proof {
			if p.Layer > maxLayer {
				maxLayer = p.Layer
			}
		}

		byLayer := make(map[int][]ProofEntry)
		for _, p := range proof {
			byLayer[p.Layer] = append(byLayer[p.Layer], p)
		}

		for layer := 0; layer <= maxLayer; layer++ {
			entries := byLayer[layer]
			if len(entries) == 0 {
				continue
			}
			entry := entries[0]
			byLayer[layer] = entries[1:]

			var pair []string
			if entry.Position == "right" {
				pair = []string{currentHash, entry.Hash}
			} else {
				pair = []string{entry.Hash, currentHash}
			}
			sort.Strings(pair)
			currentHash = Sha256Hex(pair[0] + pair[1])
		}

		if currentHash == root {
			return true
		}
	}

	if len(disclosedKeys) == 0 {
		return len(proof) == 0 && root == Sha256Hex("")
	}
	return false
}
