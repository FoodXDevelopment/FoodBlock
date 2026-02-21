package foodblock

import (
	"math"
	"strings"
	"time"
)

// DefaultWeights are the default trust computation weights (Section 6.3).
var DefaultWeights = map[string]float64{
	"authority_certs": 3.0,
	"peer_reviews":    1.0,
	"chain_depth":     2.0,
	"verified_orders": 1.5,
	"account_age":     0.5,
}

// PeerReviewResult holds the peer review sub-score.
type PeerReviewResult struct {
	Count         int     `json:"count"`
	AvgScore      float64 `json:"avg_score"`
	WeightedScore float64 `json:"weighted_score"`
}

// TrustInputs holds the five raw trust inputs.
type TrustInputs struct {
	AuthorityCerts int              `json:"authority_certs"`
	PeerReviews    PeerReviewResult `json:"peer_reviews"`
	ChainDepth     int              `json:"chain_depth"`
	VerifiedOrders int              `json:"verified_orders"`
	AccountAge     float64          `json:"account_age"`
}

// TrustResult is the output of ComputeTrust.
type TrustResult struct {
	Score        float64     `json:"score"`
	Inputs       TrustInputs `json:"inputs"`
	MeetsMinimum bool        `json:"meets_minimum"`
}

// TrustBlock extends Block with optional metadata used by trust computation.
type TrustBlock struct {
	Block
	AuthorHash string `json:"author_hash,omitempty"`
	CreatedAt  string `json:"created_at,omitempty"`
}

// ComputeTrust computes a trust score for an actor from five inputs
// derived from the FoodBlock graph. Supports custom trust policies.
func ComputeTrust(actorHash string, blocks []TrustBlock, policy map[string]interface{}) TrustResult {
	if actorHash == "" {
		panic("FoodBlock: actorHash is required")
	}

	weights := mergeWeights(policy)
	now := time.Now()

	var requiredAuthorities []string
	if ra, ok := policy["required_authorities"]; ok {
		if arr, ok := ra.([]string); ok {
			requiredAuthorities = arr
		}
	}

	inputs := TrustInputs{
		AuthorityCerts: countAuthorityCerts(actorHash, blocks, requiredAuthorities),
		PeerReviews:    computePeerReviews(actorHash, blocks),
		ChainDepth:     computeChainDepth(actorHash, blocks),
		VerifiedOrders: countVerifiedOrders(actorHash, blocks),
		AccountAge:     computeAccountAge(actorHash, blocks, now),
	}

	score :=
		float64(inputs.AuthorityCerts)*weights["authority_certs"] +
			inputs.PeerReviews.WeightedScore*weights["peer_reviews"] +
			float64(inputs.ChainDepth)*weights["chain_depth"] +
			float64(inputs.VerifiedOrders)*weights["verified_orders"] +
			inputs.AccountAge*weights["account_age"]

	minScore := 0.0
	if ms, ok := policy["min_score"]; ok {
		switch v := ms.(type) {
		case float64:
			minScore = v
		case int:
			minScore = float64(v)
		}
	}

	return TrustResult{
		Score:        score,
		Inputs:       inputs,
		MeetsMinimum: score >= minScore,
	}
}

// ConnectionDensity measures connection density between two actors (Section 6.3 sybil resistance).
// Returns 0..1 where 0 = no shared refs, 1 = fully connected.
func ConnectionDensity(actorA, actorB string, blocks []TrustBlock) float64 {
	if actorA == "" || actorB == "" {
		return 0
	}

	refsA := make(map[string]bool)
	refsB := make(map[string]bool)

	for _, b := range blocks {
		if b.Refs == nil {
			continue
		}
		vals := flattenRefValues(b.Refs)
		containsA := containsStr(vals, actorA)
		containsB := containsStr(vals, actorB)

		if containsA {
			for _, v := range vals {
				if v != actorA {
					refsA[v] = true
				}
			}
		}
		if containsB {
			for _, v := range vals {
				if v != actorB {
					refsB[v] = true
				}
			}
		}
	}

	if len(refsA) == 0 || len(refsB) == 0 {
		return 0
	}

	shared := 0
	for ref := range refsA {
		if refsB[ref] {
			shared++
		}
	}

	union := make(map[string]bool)
	for ref := range refsA {
		union[ref] = true
	}
	for ref := range refsB {
		union[ref] = true
	}

	if len(union) == 0 {
		return 0
	}
	return float64(shared) / float64(len(union))
}

// CreateTrustPolicy creates a trust policy block.
func CreateTrustPolicy(name string, weights map[string]interface{}, opts map[string]interface{}) Block {
	state := map[string]interface{}{
		"name":    name,
		"weights": weights,
	}
	if opts != nil {
		if ra, ok := opts["required_authorities"]; ok {
			state["required_authorities"] = ra
		}
		if ms, ok := opts["min_score"]; ok {
			state["min_score"] = ms
		}
	}

	refs := map[string]interface{}{}
	if opts != nil {
		if author, ok := opts["author"]; ok {
			if s, ok := author.(string); ok {
				refs["author"] = s
			}
		}
	}

	return Create("observe.trust_policy", state, refs)
}

func mergeWeights(policy map[string]interface{}) map[string]float64 {
	result := make(map[string]float64)
	for k, v := range DefaultWeights {
		result[k] = v
	}
	if policy == nil {
		return result
	}
	if pw, ok := policy["weights"]; ok {
		switch w := pw.(type) {
		case map[string]interface{}:
			for k, v := range w {
				switch n := v.(type) {
				case float64:
					result[k] = n
				case int:
					result[k] = float64(n)
				}
			}
		case map[string]float64:
			for k, v := range w {
				result[k] = v
			}
		}
	}
	return result
}

func countAuthorityCerts(actorHash string, blocks []TrustBlock, requiredAuthorities []string) int {
	count := 0
	for _, b := range blocks {
		if b.Type != "observe.certification" {
			continue
		}
		if b.Refs == nil {
			continue
		}
		subject, _ := b.Refs["subject"].(string)
		if subject != actorHash {
			continue
		}
		if vu, ok := b.State["valid_until"].(string); ok {
			t, err := time.Parse(time.RFC3339, vu)
			if err != nil {
				t, err = time.Parse("2006-01-02", vu)
			}
			if err == nil && t.Before(time.Now()) {
				continue
			}
		}
		count++
	}
	return count
}

func computePeerReviews(actorHash string, blocks []TrustBlock) PeerReviewResult {
	var reviews []TrustBlock
	for _, b := range blocks {
		if b.Type != "observe.review" {
			continue
		}
		if b.Refs == nil {
			continue
		}
		subject, _ := b.Refs["subject"].(string)
		if subject != actorHash {
			continue
		}
		if _, ok := b.State["rating"]; !ok {
			continue
		}
		reviews = append(reviews, b)
	}

	if len(reviews) == 0 {
		return PeerReviewResult{}
	}

	totalWeighted := 0.0
	totalWeight := 0.0

	for _, review := range reviews {
		reviewerHash := ""
		if ah, ok := review.Refs["author"].(string); ok {
			reviewerHash = ah
		} else {
			reviewerHash = review.AuthorHash
		}
		density := ConnectionDensity(reviewerHash, actorHash, blocks)
		weight := 1 - density
		rating := toFloat64(review.State["rating"])
		totalWeighted += (rating / 5.0) * weight
		totalWeight += weight
	}

	sum := 0.0
	for _, r := range reviews {
		sum += toFloat64(r.State["rating"])
	}
	avgScore := sum / float64(len(reviews))

	weightedScore := 0.0
	if totalWeight > 0 {
		weightedScore = totalWeighted / totalWeight * float64(len(reviews))
	}

	return PeerReviewResult{
		Count:         len(reviews),
		AvgScore:      avgScore,
		WeightedScore: weightedScore,
	}
}

func computeChainDepth(actorHash string, blocks []TrustBlock) int {
	authors := make(map[string]bool)
	for _, b := range blocks {
		if b.Refs == nil {
			continue
		}
		refsActor := false
		for _, v := range b.Refs {
			switch val := v.(type) {
			case string:
				if val == actorHash {
					refsActor = true
				}
			case []interface{}:
				for _, item := range val {
					if s, ok := item.(string); ok && s == actorHash {
						refsActor = true
					}
				}
			}
		}
		if refsActor && b.AuthorHash != "" {
			authors[b.AuthorHash] = true
		}
	}
	return len(authors)
}

func countVerifiedOrders(actorHash string, blocks []TrustBlock) int {
	count := 0
	for _, b := range blocks {
		if !strings.HasPrefix(b.Type, "transfer.order") {
			continue
		}
		if b.Refs == nil {
			continue
		}
		buyer, _ := b.Refs["buyer"].(string)
		seller, _ := b.Refs["seller"].(string)
		if buyer != actorHash && seller != actorHash {
			continue
		}
		_, hasAdapterRef := b.State["adapter_ref"]
		_, hasPaymentRef := b.State["payment_ref"]
		if hasAdapterRef || hasPaymentRef {
			count++
		}
	}
	return count
}

func computeAccountAge(actorHash string, blocks []TrustBlock, now time.Time) float64 {
	for _, b := range blocks {
		if b.Hash == actorHash && b.CreatedAt != "" {
			t, err := time.Parse(time.RFC3339, b.CreatedAt)
			if err != nil {
				t, err = time.Parse("2006-01-02T15:04:05.000Z", b.CreatedAt)
			}
			if err != nil {
				continue
			}
			days := now.Sub(t).Hours() / 24
			return math.Min(days, 365)
		}
	}
	return 0
}

func flattenRefValues(refs map[string]interface{}) []string {
	var result []string
	for _, v := range refs {
		switch val := v.(type) {
		case string:
			result = append(result, val)
		case []interface{}:
			for _, item := range val {
				if s, ok := item.(string); ok {
					result = append(result, s)
				}
			}
		}
	}
	return result
}

func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func toFloat64(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	}
	return 0
}
