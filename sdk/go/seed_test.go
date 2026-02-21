package foodblock

import "testing"

func TestSeedVocabulariesCount(t *testing.T) {
	vocabs := SeedVocabularies()
	expected := len(Vocabularies)
	if len(vocabs) != expected {
		t.Errorf("expected %d vocabulary blocks, got %d", expected, len(vocabs))
	}
}

func TestSeedVocabulariesType(t *testing.T) {
	vocabs := SeedVocabularies()
	for _, v := range vocabs {
		if v.Type != "observe.vocabulary" {
			t.Errorf("expected type observe.vocabulary, got %s", v.Type)
		}
	}
}

func TestSeedVocabulariesHaveRequiredFields(t *testing.T) {
	vocabs := SeedVocabularies()
	for _, v := range vocabs {
		if v.Hash == "" {
			t.Error("vocabulary block missing hash")
		}
		if v.State["domain"] == nil {
			t.Error("vocabulary block missing domain")
		}
		if v.State["for_types"] == nil {
			t.Error("vocabulary block missing for_types")
		}
		if v.State["fields"] == nil {
			t.Error("vocabulary block missing fields")
		}
	}
}

func TestSeedVocabulariesBakeryPresent(t *testing.T) {
	vocabs := SeedVocabularies()
	found := false
	for _, v := range vocabs {
		if v.State["domain"] == "bakery" {
			found = true
			fields, ok := v.State["fields"].(map[string]interface{})
			if !ok {
				t.Fatal("bakery fields should be a map")
			}
			if fields["price"] == nil {
				t.Error("bakery vocabulary should have price field")
			}
			if fields["allergens"] == nil {
				t.Error("bakery vocabulary should have allergens field")
			}
			break
		}
	}
	if !found {
		t.Error("bakery vocabulary should be present in seed data")
	}
}

func TestSeedVocabulariesWorkflowTransitions(t *testing.T) {
	vocabs := SeedVocabularies()
	for _, v := range vocabs {
		if v.State["domain"] == "workflow" {
			transitions, ok := v.State["transitions"].(map[string]interface{})
			if !ok {
				t.Fatal("workflow vocabulary should have transitions map")
			}
			if transitions["draft"] == nil {
				t.Error("workflow transitions should include draft")
			}
			return
		}
	}
	t.Error("workflow vocabulary not found")
}

func TestSeedVocabulariesDeterministic(t *testing.T) {
	vocabs1 := SeedVocabularies()
	vocabs2 := SeedVocabularies()
	if len(vocabs1) != len(vocabs2) {
		t.Fatal("two runs should produce same number of blocks")
	}
	// Build domain->hash maps for comparison (order is not guaranteed with map iteration)
	hashes1 := make(map[string]string)
	hashes2 := make(map[string]string)
	for _, v := range vocabs1 {
		domain, _ := v.State["domain"].(string)
		hashes1[domain] = v.Hash
	}
	for _, v := range vocabs2 {
		domain, _ := v.State["domain"].(string)
		hashes2[domain] = v.Hash
	}
	for domain, hash := range hashes1 {
		if hashes2[domain] != hash {
			t.Errorf("vocabulary %s hash not deterministic: %s vs %s", domain, hash, hashes2[domain])
		}
	}
}

func TestSeedTemplatesCount(t *testing.T) {
	templates := SeedTemplates()
	expected := len(Templates)
	if len(templates) != expected {
		t.Errorf("expected %d template blocks, got %d", expected, len(templates))
	}
}

func TestSeedTemplatesType(t *testing.T) {
	templates := SeedTemplates()
	for _, tmpl := range templates {
		if tmpl.Type != "observe.template" {
			t.Errorf("expected type observe.template, got %s", tmpl.Type)
		}
	}
}

func TestSeedTemplatesHaveRequiredFields(t *testing.T) {
	templates := SeedTemplates()
	for _, tmpl := range templates {
		if tmpl.Hash == "" {
			t.Error("template block missing hash")
		}
		if tmpl.State["name"] == nil {
			t.Error("template block missing name")
		}
		if tmpl.State["description"] == nil {
			t.Error("template block missing description")
		}
		steps, ok := tmpl.State["steps"].([]interface{})
		if !ok || len(steps) == 0 {
			t.Errorf("template %v should have non-empty steps", tmpl.State["name"])
		}
	}
}

func TestSeedTemplatesSupplyChainPresent(t *testing.T) {
	templates := SeedTemplates()
	for _, tmpl := range templates {
		if tmpl.State["name"] == "Farm-to-Table Supply Chain" {
			steps, ok := tmpl.State["steps"].([]interface{})
			if !ok {
				t.Fatal("supply-chain steps should be an array")
			}
			if len(steps) < 4 {
				t.Errorf("supply-chain template should have >= 4 steps, got %d", len(steps))
			}
			return
		}
	}
	t.Error("supply-chain template should be present")
}

func TestSeedTemplatesDeterministic(t *testing.T) {
	templates1 := SeedTemplates()
	templates2 := SeedTemplates()
	if len(templates1) != len(templates2) {
		t.Fatal("two runs should produce same number of template blocks")
	}
	hashes1 := make(map[string]string)
	hashes2 := make(map[string]string)
	for _, tmpl := range templates1 {
		name, _ := tmpl.State["name"].(string)
		hashes1[name] = tmpl.Hash
	}
	for _, tmpl := range templates2 {
		name, _ := tmpl.State["name"].(string)
		hashes2[name] = tmpl.Hash
	}
	for name, hash := range hashes1 {
		if hashes2[name] != hash {
			t.Errorf("template %s hash not deterministic: %s vs %s", name, hash, hashes2[name])
		}
	}
}

func TestSeedAllCombined(t *testing.T) {
	all := SeedAll()
	expectedCount := len(Vocabularies) + len(Templates)
	if len(all) != expectedCount {
		t.Errorf("expected %d total seed blocks, got %d", expectedCount, len(all))
	}
}

func TestSeedAllUniqueHashes(t *testing.T) {
	all := SeedAll()
	seen := make(map[string]bool)
	for _, b := range all {
		if seen[b.Hash] {
			t.Errorf("duplicate hash in seed data: %s", b.Hash)
		}
		seen[b.Hash] = true
	}
}
