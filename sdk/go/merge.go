package foodblock

import (
	"encoding/json"
	"errors"
)

// ConflictResult holds the result of a conflict detection.
type ConflictResult struct {
	IsConflict     bool
	CommonAncestor string
	ChainA         []Block
	ChainB         []Block
}

// DetectConflict detects whether two hashes represent a fork in an update chain.
func DetectConflict(hashA, hashB string, resolve func(string) *Block) ConflictResult {
	if hashA == hashB {
		return ConflictResult{IsConflict: false, CommonAncestor: hashA}
	}

	var chainA []Block
	visitedA := make(map[string]bool)

	// Walk chain A
	current := hashA
	for current != "" {
		visitedA[current] = true
		block := resolve(current)
		if block == nil {
			break
		}
		chainA = append(chainA, *block)
		if updates, ok := block.Refs["updates"]; ok {
			if s, ok := updates.(string); ok {
				current = s
			} else {
				current = ""
			}
		} else {
			current = ""
		}
	}

	// Walk chain B, looking for intersection with A
	var chainB []Block
	commonAncestor := ""
	current = hashB
	for current != "" {
		if visitedA[current] {
			commonAncestor = current
			break
		}
		block := resolve(current)
		if block == nil {
			break
		}
		chainB = append(chainB, *block)
		if updates, ok := block.Refs["updates"]; ok {
			if s, ok := updates.(string); ok {
				current = s
			} else {
				current = ""
			}
		} else {
			current = ""
		}
	}

	return ConflictResult{
		IsConflict:     commonAncestor != "",
		CommonAncestor: commonAncestor,
		ChainA:         chainA,
		ChainB:         chainB,
	}
}

// Merge creates a merge block that resolves a fork between two chain heads.
// strategy can be "manual", "a_wins", or "b_wins".
func Merge(hashA, hashB string, resolve func(string) *Block, strategy string, manualState map[string]interface{}) (Block, error) {
	if strategy == "" {
		strategy = "manual"
	}

	var mergedState map[string]interface{}

	switch strategy {
	case "manual":
		if manualState == nil {
			return Block{}, errors.New("FoodBlock: manual merge requires state")
		}
		mergedState = manualState
	case "a_wins":
		blockA := resolve(hashA)
		if blockA == nil {
			return Block{}, errors.New("FoodBlock: could not resolve hashA")
		}
		mergedState = blockA.State
	case "b_wins":
		blockB := resolve(hashB)
		if blockB == nil {
			return Block{}, errors.New("FoodBlock: could not resolve hashB")
		}
		mergedState = blockB.State
	default:
		return Block{}, errors.New("FoodBlock: unknown merge strategy: " + strategy)
	}

	state := map[string]interface{}{"strategy": strategy}
	for k, v := range mergedState {
		state[k] = v
	}

	return Create("observe.merge", state, map[string]interface{}{
		"merges": []interface{}{hashA, hashB},
	}), nil
}

// AutoMerge attempts automatic merge using per-field strategies from a vocabulary.
func AutoMerge(hashA, hashB string, resolve func(string) *Block, fieldStrategies map[string]string) (Block, error) {
	blockA := resolve(hashA)
	blockB := resolve(hashB)
	if blockA == nil {
		return Block{}, errors.New("FoodBlock: could not resolve hashA")
	}
	if blockB == nil {
		return Block{}, errors.New("FoodBlock: could not resolve hashB")
	}

	stateA := blockA.State
	stateB := blockB.State
	if stateA == nil {
		stateA = map[string]interface{}{}
	}
	if stateB == nil {
		stateB = map[string]interface{}{}
	}

	allKeys := make(map[string]bool)
	for k := range stateA {
		allKeys[k] = true
	}
	for k := range stateB {
		allKeys[k] = true
	}

	mergedState := map[string]interface{}{}
	for key := range allKeys {
		valA := stateA[key]
		valB := stateB[key]

		// If values are the same, no conflict
		jsonA, _ := json.Marshal(valA)
		jsonB, _ := json.Marshal(valB)
		if string(jsonA) == string(jsonB) {
			if valA != nil {
				mergedState[key] = valA
			} else {
				mergedState[key] = valB
			}
			continue
		}

		if valA == nil {
			mergedState[key] = valB
			continue
		}
		if valB == nil {
			mergedState[key] = valA
			continue
		}

		// Values differ — use strategy
		strategy := ""
		if fieldStrategies != nil {
			strategy = fieldStrategies[key]
		}

		switch strategy {
		case "last_writer_wins", "lww":
			mergedState[key] = valB
		case "max":
			fA, okA := toFloat64(valA)
			fB, okB := toFloat64(valB)
			if okA && okB {
				if fA > fB {
					mergedState[key] = valA
				} else {
					mergedState[key] = valB
				}
			} else {
				mergedState[key] = valB
			}
		case "min":
			fA, okA := toFloat64(valA)
			fB, okB := toFloat64(valB)
			if okA && okB {
				if fA < fB {
					mergedState[key] = valA
				} else {
					mergedState[key] = valB
				}
			} else {
				mergedState[key] = valB
			}
		default:
			return Block{}, errors.New("FoodBlock: auto-merge conflict on field \"" + key + "\" — manual resolution required")
		}
	}

	state := map[string]interface{}{"strategy": "auto"}
	for k, v := range mergedState {
		state[k] = v
	}

	return Create("observe.merge", state, map[string]interface{}{
		"merges": []interface{}{hashA, hashB},
	}), nil
}

func toFloat64(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	default:
		return 0, false
	}
}
