package foodblock

import (
	"testing"
	"time"
)

func trustActor(name string) TrustBlock {
	b := Create("actor.producer", map[string]interface{}{"name": name}, nil)
	return TrustBlock{Block: b}
}

func trustCertification(subjectHash, authorityHash, validUntil string) TrustBlock {
	b := Create("observe.certification", map[string]interface{}{
		"instance_id": "cert-" + subjectHash[:8],
		"name":        "Organic",
		"valid_until": validUntil,
	}, map[string]interface{}{"subject": subjectHash, "authority": authorityHash})
	return TrustBlock{Block: b, AuthorHash: authorityHash}
}

func trustReview(subjectHash, authorHash string, rating float64) TrustBlock {
	b := Create("observe.review", map[string]interface{}{
		"instance_id": "rev-" + authorHash[:8],
		"rating":      rating,
	}, map[string]interface{}{"subject": subjectHash, "author": authorHash})
	return TrustBlock{Block: b, AuthorHash: authorHash}
}

func trustOrder(buyerHash, sellerHash string, hasPayment bool) TrustBlock {
	state := map[string]interface{}{
		"instance_id": "ord-" + buyerHash[:8] + "-" + sellerHash[:8],
		"quantity":    10.0,
	}
	if hasPayment {
		state["adapter_ref"] = "stripe_pi_123"
	}
	b := Create("transfer.order", state, map[string]interface{}{
		"buyer": buyerHash, "seller": sellerHash,
	})
	return TrustBlock{Block: b}
}

func TestComputeTrustZeroScore(t *testing.T) {
	result := ComputeTrust("nonexistent", []TrustBlock{}, map[string]interface{}{})
	if result.Score != 0 {
		t.Errorf("expected score 0, got %f", result.Score)
	}
	if !result.MeetsMinimum {
		t.Error("expected meets_minimum true for zero score with no policy")
	}
}

func TestComputeTrustAuthorityCerts(t *testing.T) {
	farm := trustActor("Green Acres")
	authority := trustActor("Soil Association")
	cert := trustCertification(farm.Hash, authority.Hash, "2027-01-01")
	blocks := []TrustBlock{farm, authority, cert}

	result := ComputeTrust(farm.Hash, blocks, map[string]interface{}{})
	if result.Inputs.AuthorityCerts != 1 {
		t.Errorf("expected 1 authority cert, got %d", result.Inputs.AuthorityCerts)
	}
	if result.Score < DefaultWeights["authority_certs"] {
		t.Errorf("score should be >= authority_certs weight, got %f", result.Score)
	}
}

func TestComputeTrustExpiredCerts(t *testing.T) {
	farm := trustActor("Green Acres")
	authority := trustActor("Soil Association")
	cert := trustCertification(farm.Hash, authority.Hash, "2020-01-01")
	blocks := []TrustBlock{farm, authority, cert}

	result := ComputeTrust(farm.Hash, blocks, map[string]interface{}{})
	if result.Inputs.AuthorityCerts != 0 {
		t.Errorf("expected 0 authority certs for expired cert, got %d", result.Inputs.AuthorityCerts)
	}
}

func TestComputeTrustPeerReviews(t *testing.T) {
	shop := trustActor("Bakery")
	reviewer1 := trustActor("Customer A")
	reviewer2 := trustActor("Customer B")
	r1 := trustReview(shop.Hash, reviewer1.Hash, 5)
	r2 := trustReview(shop.Hash, reviewer2.Hash, 4)
	blocks := []TrustBlock{shop, reviewer1, reviewer2, r1, r2}

	result := ComputeTrust(shop.Hash, blocks, map[string]interface{}{})
	if result.Inputs.PeerReviews.Count != 2 {
		t.Errorf("expected 2 peer reviews, got %d", result.Inputs.PeerReviews.Count)
	}
	if result.Inputs.PeerReviews.AvgScore <= 0 {
		t.Error("expected avg_score > 0")
	}
}

func TestComputeTrustVerifiedOrders(t *testing.T) {
	buyer := trustActor("Restaurant")
	seller := trustActor("Supplier")
	ord := trustOrder(buyer.Hash, seller.Hash, true)
	blocks := []TrustBlock{buyer, seller, ord}

	result := ComputeTrust(seller.Hash, blocks, map[string]interface{}{})
	if result.Inputs.VerifiedOrders != 1 {
		t.Errorf("expected 1 verified order, got %d", result.Inputs.VerifiedOrders)
	}
}

func TestComputeTrustUnverifiedOrders(t *testing.T) {
	buyer := trustActor("Restaurant")
	seller := trustActor("Supplier")
	ord := trustOrder(buyer.Hash, seller.Hash, false)
	blocks := []TrustBlock{buyer, seller, ord}

	result := ComputeTrust(seller.Hash, blocks, map[string]interface{}{})
	if result.Inputs.VerifiedOrders != 0 {
		t.Errorf("expected 0 verified orders without payment, got %d", result.Inputs.VerifiedOrders)
	}
}

func TestComputeTrustChainDepth(t *testing.T) {
	farm := trustActor("Farm")
	mill := trustActor("Mill")
	bakery := trustActor("Bakery")
	b1 := TrustBlock{
		Block:      Create("transfer.order", map[string]interface{}{"instance_id": "o1", "quantity": 50.0}, map[string]interface{}{"seller": farm.Hash}),
		AuthorHash: mill.Hash,
	}
	b2 := TrustBlock{
		Block:      Create("transfer.order", map[string]interface{}{"instance_id": "o2", "quantity": 30.0}, map[string]interface{}{"seller": farm.Hash}),
		AuthorHash: bakery.Hash,
	}
	blocks := []TrustBlock{farm, mill, bakery, b1, b2}

	result := ComputeTrust(farm.Hash, blocks, map[string]interface{}{})
	if result.Inputs.ChainDepth != 2 {
		t.Errorf("expected chain depth 2, got %d", result.Inputs.ChainDepth)
	}
}

func TestComputeTrustAccountAgeCapped(t *testing.T) {
	farm := trustActor("Old Farm")
	farm.CreatedAt = time.Now().Add(-400 * 24 * time.Hour).UTC().Format(time.RFC3339)

	result := ComputeTrust(farm.Hash, []TrustBlock{farm}, map[string]interface{}{})
	if result.Inputs.AccountAge > 365 {
		t.Errorf("account age should be capped at 365, got %f", result.Inputs.AccountAge)
	}
	if result.Inputs.AccountAge < 364 {
		t.Errorf("expected account age >= 364, got %f", result.Inputs.AccountAge)
	}
}

func TestComputeTrustCustomWeights(t *testing.T) {
	farm := trustActor("Green Acres")
	authority := trustActor("FSA")
	cert := trustCertification(farm.Hash, authority.Hash, "2027-01-01")
	blocks := []TrustBlock{farm, authority, cert}

	defaultResult := ComputeTrust(farm.Hash, blocks, map[string]interface{}{})
	customResult := ComputeTrust(farm.Hash, blocks, map[string]interface{}{
		"weights": map[string]interface{}{"authority_certs": 10.0},
	})

	if customResult.Score <= defaultResult.Score {
		t.Errorf("custom weight score (%f) should be > default (%f)", customResult.Score, defaultResult.Score)
	}
}

func TestComputeTrustMinScore(t *testing.T) {
	farm := trustActor("New Farm")
	result := ComputeTrust(farm.Hash, []TrustBlock{farm}, map[string]interface{}{
		"min_score": 100.0,
	})
	if result.MeetsMinimum {
		t.Error("expected meets_minimum false when min_score is 100")
	}
}

func TestComputeTrustPanicsOnEmpty(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic on empty actorHash")
		}
	}()
	ComputeTrust("", []TrustBlock{}, map[string]interface{}{})
}

func TestConnectionDensityNoSharedRefs(t *testing.T) {
	a := trustActor("A")
	b := trustActor("B")
	c := trustActor("C")
	d := trustActor("D")
	b1 := TrustBlock{Block: Create("transfer.order", map[string]interface{}{"instance_id": "x1", "q": 1.0}, map[string]interface{}{"buyer": a.Hash, "seller": c.Hash})}
	b2 := TrustBlock{Block: Create("transfer.order", map[string]interface{}{"instance_id": "x2", "q": 1.0}, map[string]interface{}{"buyer": b.Hash, "seller": d.Hash})}

	density := ConnectionDensity(a.Hash, b.Hash, []TrustBlock{b1, b2})
	if density != 0 {
		t.Errorf("expected density 0, got %f", density)
	}
}

func TestConnectionDensitySharedRefs(t *testing.T) {
	a := trustActor("A")
	b := trustActor("B")
	shared := trustActor("Shared Supplier")
	b1 := TrustBlock{Block: Create("transfer.order", map[string]interface{}{"instance_id": "x1", "q": 1.0}, map[string]interface{}{"buyer": a.Hash, "seller": shared.Hash})}
	b2 := TrustBlock{Block: Create("transfer.order", map[string]interface{}{"instance_id": "x2", "q": 1.0}, map[string]interface{}{"buyer": b.Hash, "seller": shared.Hash})}

	density := ConnectionDensity(a.Hash, b.Hash, []TrustBlock{b1, b2})
	if density <= 0 {
		t.Errorf("expected density > 0 for shared refs, got %f", density)
	}
}

func TestConnectionDensityNullActors(t *testing.T) {
	if ConnectionDensity("", "b", nil) != 0 {
		t.Error("expected 0 for empty actorA")
	}
	if ConnectionDensity("a", "", nil) != 0 {
		t.Error("expected 0 for empty actorB")
	}
}

func TestCreateTrustPolicyFull(t *testing.T) {
	policy := CreateTrustPolicy("UK Organic", map[string]interface{}{
		"authority_certs": 5.0,
	}, map[string]interface{}{
		"required_authorities": []interface{}{"fsa_hash"},
		"min_score":            10.0,
	})

	if policy.Type != "observe.trust_policy" {
		t.Errorf("expected observe.trust_policy, got %s", policy.Type)
	}
	if policy.State["name"] != "UK Organic" {
		t.Errorf("expected name 'UK Organic', got %v", policy.State["name"])
	}
	weights, ok := policy.State["weights"].(map[string]interface{})
	if !ok {
		t.Fatal("expected weights map in state")
	}
	if weights["authority_certs"] != 5.0 {
		t.Errorf("expected authority_certs weight 5.0, got %v", weights["authority_certs"])
	}
	if policy.State["min_score"] != 10.0 {
		t.Errorf("expected min_score 10, got %v", policy.State["min_score"])
	}
}

func TestCreateTrustPolicyMinimal(t *testing.T) {
	policy := CreateTrustPolicy("Basic", map[string]interface{}{
		"peer_reviews": 2.0,
	}, nil)

	if policy.Type != "observe.trust_policy" {
		t.Errorf("expected observe.trust_policy, got %s", policy.Type)
	}
	if policy.State["name"] != "Basic" {
		t.Errorf("expected name 'Basic', got %v", policy.State["name"])
	}
	if _, ok := policy.State["required_authorities"]; ok {
		t.Error("minimal policy should not have required_authorities")
	}
}
