package foodblock

import (
	"strings"
	"testing"
)

func TestValidateValidBlock(t *testing.T) {
	block := Block{
		Type: "substance.product",
		State: map[string]interface{}{
			"$schema": "foodblock:substance.product@1.0",
			"name":    "Sourdough Bread",
			"price":   4.50,
			"unit":    "loaf",
		},
		Refs: map[string]interface{}{
			"seller": "abc123",
		},
	}

	errs := Validate(block, nil)
	if len(errs) != 0 {
		t.Errorf("expected no validation errors, got %v", errs)
	}
}

func TestValidateMissingRequiredField(t *testing.T) {
	block := Block{
		Type: "substance.product",
		State: map[string]interface{}{
			"$schema": "foodblock:substance.product@1.0",
			"price":   4.50,
			// "name" is missing - it is required
		},
		Refs: map[string]interface{}{
			"seller": "abc123",
		},
	}

	errs := Validate(block, nil)
	if len(errs) == 0 {
		t.Fatalf("expected validation errors for missing name, got none")
	}

	found := false
	for _, e := range errs {
		if strings.Contains(e, "name") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected an error mentioning 'name', got %v", errs)
	}
}

func TestValidateNoSchema(t *testing.T) {
	block := Block{
		Type: "substance.product",
		State: map[string]interface{}{
			"name": "Bread",
		},
		Refs: map[string]interface{}{},
	}

	// No $schema field and no schema argument => should return empty errors (valid)
	errs := Validate(block, nil)
	if len(errs) != 0 {
		t.Errorf("block without $schema should return empty errors, got %v", errs)
	}
}

func TestValidateTypeMismatch(t *testing.T) {
	// Block type does not match the schema's target type
	block := Block{
		Type: "actor.producer",
		State: map[string]interface{}{
			"$schema": "foodblock:substance.product@1.0",
			"name":    "Some Farm",
		},
		Refs: map[string]interface{}{},
	}

	errs := Validate(block, nil)
	if len(errs) == 0 {
		t.Fatalf("expected validation errors for type mismatch, got none")
	}

	found := false
	for _, e := range errs {
		if strings.Contains(e, "Type mismatch") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected a 'Type mismatch' error, got %v", errs)
	}
}

func TestValidateExpectedRefs(t *testing.T) {
	block := Block{
		Type: "transfer.order",
		State: map[string]interface{}{
			"$schema":     "foodblock:transfer.order@1.0",
			"instance_id": "order-001",
			"quantity":    10.0,
		},
		Refs: map[string]interface{}{
			// Missing both "buyer" and "seller" refs
		},
	}

	errs := Validate(block, nil)
	if len(errs) == 0 {
		t.Fatalf("expected validation errors for missing refs, got none")
	}

	hasBuyer := false
	hasSeller := false
	for _, e := range errs {
		if strings.Contains(e, "buyer") {
			hasBuyer = true
		}
		if strings.Contains(e, "seller") {
			hasSeller = true
		}
	}
	if !hasBuyer {
		t.Errorf("expected error mentioning missing 'buyer' ref, got %v", errs)
	}
	if !hasSeller {
		t.Errorf("expected error mentioning missing 'seller' ref, got %v", errs)
	}
}

func TestCoreSchemas(t *testing.T) {
	expectedSchemas := []string{
		"foodblock:substance.product@1.0",
		"foodblock:transfer.order@1.0",
		"foodblock:observe.review@1.0",
		"foodblock:actor.producer@1.0",
		"foodblock:observe.certification@1.0",
	}

	if len(CoreSchemas) != 5 {
		t.Errorf("expected 5 core schemas, got %d", len(CoreSchemas))
	}

	for _, key := range expectedSchemas {
		if _, ok := CoreSchemas[key]; !ok {
			t.Errorf("missing core schema: %s", key)
		}
	}
}
