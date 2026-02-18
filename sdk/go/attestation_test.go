package foodblock

import "testing"

func TestAttest(t *testing.T) {
	target := Create("substance.product", map[string]interface{}{"name": "Organic Bread", "organic": true}, nil)
	attestor := Create("actor.certifier", map[string]interface{}{"name": "USDA Organic"}, nil)

	attestation, err := Attest(target.Hash, attestor.Hash, "verified", "lab_test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if attestation.Type != "observe.attestation" {
		t.Errorf("expected type observe.attestation, got %s", attestation.Type)
	}

	// Check state
	if attestation.State["confidence"] != "verified" {
		t.Errorf("expected confidence 'verified', got %v", attestation.State["confidence"])
	}
	if attestation.State["method"] != "lab_test" {
		t.Errorf("expected method 'lab_test', got %v", attestation.State["method"])
	}

	// Check refs
	if attestation.Refs["confirms"] != target.Hash {
		t.Errorf("expected confirms ref to be target hash, got %v", attestation.Refs["confirms"])
	}
	if attestation.Refs["attestor"] != attestor.Hash {
		t.Errorf("expected attestor ref to be attestor hash, got %v", attestation.Refs["attestor"])
	}

	// Hash should be valid
	if len(attestation.Hash) != 64 {
		t.Errorf("expected 64-char hash, got %d chars", len(attestation.Hash))
	}
}

func TestDispute(t *testing.T) {
	target := Create("substance.product", map[string]interface{}{"name": "Organic Bread", "organic": true}, nil)
	disputor := Create("actor.inspector", map[string]interface{}{"name": "Food Inspector"}, nil)

	dispute, err := Dispute(target.Hash, disputor.Hash, "Failed pesticide residue test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if dispute.Type != "observe.dispute" {
		t.Errorf("expected type observe.dispute, got %s", dispute.Type)
	}

	// Check state
	if dispute.State["reason"] != "Failed pesticide residue test" {
		t.Errorf("expected reason 'Failed pesticide residue test', got %v", dispute.State["reason"])
	}

	// Check refs
	if dispute.Refs["challenges"] != target.Hash {
		t.Errorf("expected challenges ref to be target hash, got %v", dispute.Refs["challenges"])
	}
	if dispute.Refs["disputor"] != disputor.Hash {
		t.Errorf("expected disputor ref to be disputor hash, got %v", dispute.Refs["disputor"])
	}

	// Hash should be valid
	if len(dispute.Hash) != 64 {
		t.Errorf("expected 64-char hash, got %d chars", len(dispute.Hash))
	}
}

func TestTraceAttestations(t *testing.T) {
	target := Create("substance.product", map[string]interface{}{"name": "Organic Bread"}, nil)
	attestor1 := Create("actor.certifier", map[string]interface{}{"name": "USDA"}, nil)
	attestor2 := Create("actor.certifier", map[string]interface{}{"name": "EU Organic"}, nil)
	disputor := Create("actor.inspector", map[string]interface{}{"name": "Inspector"}, nil)

	att1, _ := Attest(target.Hash, attestor1.Hash, "verified", "")
	att2, _ := Attest(target.Hash, attestor2.Hash, "verified", "visual_inspection")
	disp1, _ := Dispute(target.Hash, disputor.Hash, "questionable sourcing")

	// An unrelated attestation that references a different target
	other := Create("substance.product", map[string]interface{}{"name": "Cake"}, nil)
	unrelated, _ := Attest(other.Hash, attestor1.Hash, "verified", "")

	allBlocks := []Block{target, attestor1, attestor2, disputor, att1, att2, disp1, other, unrelated}

	trace := TraceAttestations(target.Hash, allBlocks)

	if len(trace.Attestations) != 2 {
		t.Errorf("expected 2 attestations, got %d", len(trace.Attestations))
	}
	if len(trace.Disputes) != 1 {
		t.Errorf("expected 1 dispute, got %d", len(trace.Disputes))
	}

	// Verify the attestation hashes
	attHashes := map[string]bool{}
	for _, a := range trace.Attestations {
		attHashes[a.Hash] = true
	}
	if !attHashes[att1.Hash] {
		t.Error("expected att1 in attestations")
	}
	if !attHashes[att2.Hash] {
		t.Error("expected att2 in attestations")
	}

	// Verify the dispute hash
	if len(trace.Disputes) > 0 && trace.Disputes[0].Hash != disp1.Hash {
		t.Errorf("expected dispute hash %s, got %s", disp1.Hash, trace.Disputes[0].Hash)
	}

	// The unrelated attestation should not appear
	if attHashes[unrelated.Hash] {
		t.Error("unrelated attestation should not be in trace")
	}

	// Net score should be attestations - disputes = 2 - 1 = 1
	if trace.Score != 1 {
		t.Errorf("expected score 1, got %d", trace.Score)
	}
}

func TestTrustScore(t *testing.T) {
	target := Create("substance.product", map[string]interface{}{"name": "Bread"}, nil)
	attestor := Create("actor.certifier", map[string]interface{}{"name": "Certifier"}, nil)
	disputor := Create("actor.inspector", map[string]interface{}{"name": "Inspector"}, nil)

	att1, _ := Attest(target.Hash, attestor.Hash, "verified", "")
	att2, _ := Attest(target.Hash, attestor.Hash, "verified", "lab_test")
	att3, _ := Attest(target.Hash, attestor.Hash, "verified", "visual")
	disp1, _ := Dispute(target.Hash, disputor.Hash, "reason 1")

	allBlocks := []Block{target, attestor, disputor, att1, att2, att3, disp1}

	score := TrustScore(target.Hash, allBlocks)

	// 3 attestations - 1 dispute = 2
	if score != 2 {
		t.Errorf("expected trust score 2, got %d", score)
	}

	// Test with no attestations and no disputes
	lonely := Create("substance.product", map[string]interface{}{"name": "Lonely"}, nil)
	score2 := TrustScore(lonely.Hash, allBlocks)
	if score2 != 0 {
		t.Errorf("expected trust score 0 for block with no attestations, got %d", score2)
	}

	// Test with only disputes
	disp2, _ := Dispute(target.Hash, disputor.Hash, "reason 2")
	disp3, _ := Dispute(target.Hash, disputor.Hash, "reason 3")
	allWithMoreDisputes := append(allBlocks, disp2, disp3)
	score3 := TrustScore(target.Hash, allWithMoreDisputes)
	// 3 attestations - 3 disputes = 0
	if score3 != 0 {
		t.Errorf("expected trust score 0, got %d", score3)
	}
}
