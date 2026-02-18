package foodblock

import "errors"

// AttestationTrace holds attestations and disputes for a block.
type AttestationTrace struct {
	Attestations []Block
	Disputes     []Block
	Score        int
}

// Attest creates an attestation block confirming a claim.
func Attest(targetHash, attestorHash string, confidence, method string) (Block, error) {
	if targetHash == "" {
		return Block{}, errors.New("FoodBlock: targetHash is required")
	}
	if attestorHash == "" {
		return Block{}, errors.New("FoodBlock: attestorHash is required")
	}
	if confidence == "" {
		confidence = "verified"
	}

	state := map[string]interface{}{"confidence": confidence}
	if method != "" {
		state["method"] = method
	}

	return Create("observe.attestation", state, map[string]interface{}{
		"confirms": targetHash,
		"attestor": attestorHash,
	}), nil
}

// Dispute creates a dispute block challenging a claim.
func Dispute(targetHash, disputerHash, reason string) (Block, error) {
	if targetHash == "" {
		return Block{}, errors.New("FoodBlock: targetHash is required")
	}
	if disputerHash == "" {
		return Block{}, errors.New("FoodBlock: disputerHash is required")
	}
	if reason == "" {
		return Block{}, errors.New("FoodBlock: reason is required")
	}

	return Create("observe.dispute", map[string]interface{}{
		"reason": reason,
	}, map[string]interface{}{
		"challenges": targetHash,
		"disputor":   disputerHash,
	}), nil
}

// TraceAttestations finds all attestation and dispute blocks referencing a given hash.
func TraceAttestations(hash string, allBlocks []Block) AttestationTrace {
	var attestations, disputes []Block

	for _, block := range allBlocks {
		if block.Refs == nil {
			continue
		}
		if confirms, ok := block.Refs["confirms"].(string); ok && confirms == hash {
			attestations = append(attestations, block)
		}
		if challenges, ok := block.Refs["challenges"].(string); ok && challenges == hash {
			disputes = append(disputes, block)
		}
	}

	return AttestationTrace{
		Attestations: attestations,
		Disputes:     disputes,
		Score:        len(attestations) - len(disputes),
	}
}

// TrustScore returns just the numeric trust score for a block.
func TrustScore(hash string, allBlocks []Block) int {
	return TraceAttestations(hash, allBlocks).Score
}
