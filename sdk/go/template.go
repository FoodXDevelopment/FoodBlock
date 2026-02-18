package foodblock

// TemplateStep defines a single step in a template.
type TemplateStep struct {
	Type         string            `json:"type"`
	Alias        string            `json:"alias,omitempty"`
	Refs         map[string]string `json:"refs,omitempty"`
	Required     []string          `json:"required,omitempty"`
	DefaultState map[string]interface{} `json:"default_state,omitempty"`
}

// TemplateDef defines a reusable block creation pattern.
type TemplateDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Steps       []TemplateStep `json:"steps"`
}

// StepOverrides provides state and ref overrides for template instantiation.
type StepOverrides struct {
	State map[string]interface{}
	Refs  map[string]string
}

// Templates is the set of built-in template definitions.
var Templates = map[string]TemplateDef{
	"supply-chain": {
		Name:        "Farm-to-Table Supply Chain",
		Description: "A complete provenance chain from primary producer to retail",
		Steps: []TemplateStep{
			{Type: "actor.producer", Alias: "farm", Required: []string{"name"}},
			{Type: "substance.ingredient", Alias: "crop", Refs: map[string]string{"source": "@farm"}, Required: []string{"name"}},
			{Type: "transform.process", Alias: "processing", Refs: map[string]string{"input": "@crop"}, Required: []string{"name"}},
			{Type: "substance.product", Alias: "product", Refs: map[string]string{"origin": "@processing"}, Required: []string{"name"}},
			{Type: "transfer.order", Alias: "sale", Refs: map[string]string{"item": "@product"}},
		},
	},
	"review": {
		Name:        "Product Review",
		Description: "A consumer review of a food product",
		Steps: []TemplateStep{
			{Type: "actor.venue", Alias: "venue", Required: []string{"name"}},
			{Type: "substance.product", Alias: "product", Refs: map[string]string{"seller": "@venue"}, Required: []string{"name"}},
			{Type: "observe.review", Alias: "review", Refs: map[string]string{"subject": "@product"}, Required: []string{"rating"}},
		},
	},
	"certification": {
		Name:        "Product Certification",
		Description: "An authority certifying a producer or product",
		Steps: []TemplateStep{
			{Type: "actor.authority", Alias: "authority", Required: []string{"name"}},
			{Type: "actor.producer", Alias: "producer", Required: []string{"name"}},
			{Type: "observe.certification", Alias: "cert", Refs: map[string]string{"authority": "@authority", "subject": "@producer"}, Required: []string{"name"}},
		},
	},
	"surplus-rescue": {
		Name:        "Surplus Rescue",
		Description: "Food business posts surplus, sustainer collects, donation recorded",
		Steps: []TemplateStep{
			{Type: "actor.venue", Alias: "donor", DefaultState: map[string]interface{}{"name": "Food Business"}},
			{Type: "substance.surplus", Alias: "surplus", Refs: map[string]string{"seller": "@donor"}, DefaultState: map[string]interface{}{"name": "Surplus Food", "status": "available"}},
			{Type: "transfer.donation", Alias: "donation", Refs: map[string]string{"source": "@donor", "item": "@surplus"}, DefaultState: map[string]interface{}{"status": "collected"}},
		},
	},
	"agent-reorder": {
		Name:        "Agent Reorder",
		Description: "Inventory check → low stock → draft order → approve → order placed",
		Steps: []TemplateStep{
			{Type: "actor.venue", Alias: "business", DefaultState: map[string]interface{}{"name": "Business"}},
			{Type: "observe.reading", Alias: "inventory-check", Refs: map[string]string{"subject": "@business"}, DefaultState: map[string]interface{}{"name": "Inventory Check", "reading_type": "stock_level"}},
			{Type: "actor.agent", Alias: "agent", Refs: map[string]string{"operator": "@business"}, DefaultState: map[string]interface{}{"name": "Reorder Agent", "capabilities": []interface{}{"ordering"}}},
			{Type: "transfer.order", Alias: "draft-order", Refs: map[string]string{"buyer": "@business", "agent": "@agent"}, DefaultState: map[string]interface{}{"status": "draft", "draft": true}},
			{Type: "transfer.order", Alias: "confirmed-order", Refs: map[string]string{"buyer": "@business", "updates": "@draft-order"}, DefaultState: map[string]interface{}{"status": "confirmed"}},
		},
	},
	"restaurant-sourcing": {
		Name:        "Restaurant Sourcing",
		Description: "Restaurant needs ingredient → discovery → supplier offer → accept → order → delivery",
		Steps: []TemplateStep{
			{Type: "actor.venue", Alias: "restaurant", DefaultState: map[string]interface{}{"name": "Restaurant"}},
			{Type: "substance.ingredient", Alias: "needed", Refs: map[string]string{}, DefaultState: map[string]interface{}{"name": "Ingredient Needed"}},
			{Type: "actor.producer", Alias: "supplier", DefaultState: map[string]interface{}{"name": "Supplier"}},
			{Type: "transfer.offer", Alias: "offer", Refs: map[string]string{"seller": "@supplier", "item": "@needed", "buyer": "@restaurant"}, DefaultState: map[string]interface{}{"status": "offered"}},
			{Type: "transfer.order", Alias: "order", Refs: map[string]string{"buyer": "@restaurant", "seller": "@supplier", "item": "@needed"}, DefaultState: map[string]interface{}{"status": "confirmed"}},
			{Type: "transfer.delivery", Alias: "delivery", Refs: map[string]string{"order": "@order", "seller": "@supplier", "buyer": "@restaurant"}, DefaultState: map[string]interface{}{"status": "delivered"}},
		},
	},
	"food-safety-audit": {
		Name:        "Food Safety Audit",
		Description: "Inspector visits → readings taken → report → certification → attestation",
		Steps: []TemplateStep{
			{Type: "actor.venue", Alias: "premises", DefaultState: map[string]interface{}{"name": "Food Premises"}},
			{Type: "actor.producer", Alias: "inspector", DefaultState: map[string]interface{}{"name": "Food Safety Inspector"}},
			{Type: "observe.reading", Alias: "readings", Refs: map[string]string{"subject": "@premises", "author": "@inspector"}, DefaultState: map[string]interface{}{"name": "Safety Readings"}},
			{Type: "observe.certification", Alias: "certificate", Refs: map[string]string{"subject": "@premises", "authority": "@inspector"}, DefaultState: map[string]interface{}{"name": "Food Safety Certificate"}},
			{Type: "observe.attestation", Alias: "attestation", Refs: map[string]string{"confirms": "@certificate", "attestor": "@inspector"}, DefaultState: map[string]interface{}{"confidence": "verified"}},
		},
	},
	"market-day": {
		Name:        "Market Day",
		Description: "Producer brings stock → stall setup → sales → end-of-day surplus → donation",
		Steps: []TemplateStep{
			{Type: "actor.producer", Alias: "producer", DefaultState: map[string]interface{}{"name": "Market Producer"}},
			{Type: "place.market", Alias: "market", DefaultState: map[string]interface{}{"name": "Farmers Market"}},
			{Type: "substance.product", Alias: "stock", Refs: map[string]string{"seller": "@producer"}, DefaultState: map[string]interface{}{"name": "Market Stock"}},
			{Type: "transfer.order", Alias: "sales", Refs: map[string]string{"seller": "@producer", "item": "@stock"}, DefaultState: map[string]interface{}{"status": "completed"}},
			{Type: "substance.surplus", Alias: "leftover", Refs: map[string]string{"seller": "@producer", "source": "@stock"}, DefaultState: map[string]interface{}{"name": "End of Day Surplus", "status": "available"}},
		},
	},
	"cold-chain": {
		Name:        "Cold Chain",
		Description: "Shipment departs → temperature readings → delivery → chain verified",
		Steps: []TemplateStep{
			{Type: "actor.distributor", Alias: "carrier", DefaultState: map[string]interface{}{"name": "Cold Chain Carrier"}},
			{Type: "transfer.delivery", Alias: "shipment", Refs: map[string]string{"carrier": "@carrier"}, DefaultState: map[string]interface{}{"status": "in_transit"}},
			{Type: "observe.reading", Alias: "temp-log", Refs: map[string]string{"subject": "@shipment"}, DefaultState: map[string]interface{}{"name": "Temperature Log", "reading_type": "temperature"}},
			{Type: "observe.attestation", Alias: "chain-verified", Refs: map[string]string{"confirms": "@shipment", "attestor": "@carrier"}, DefaultState: map[string]interface{}{"confidence": "verified", "method": "continuous_monitoring"}},
		},
	},
}

// CreateTemplate creates an observe.template FoodBlock.
func CreateTemplate(name, description string, steps []TemplateStep, authorHash string) Block {
	stepsSlice := make([]interface{}, len(steps))
	for i, s := range steps {
		step := map[string]interface{}{"type": s.Type}
		if s.Alias != "" {
			step["alias"] = s.Alias
		}
		if len(s.Refs) > 0 {
			refs := make(map[string]interface{})
			for k, v := range s.Refs {
				refs[k] = v
			}
			step["refs"] = refs
		}
		if len(s.Required) > 0 {
			req := make([]interface{}, len(s.Required))
			for j, r := range s.Required {
				req[j] = r
			}
			step["required"] = req
		}
		if len(s.DefaultState) > 0 {
			step["default_state"] = s.DefaultState
		}
		stepsSlice[i] = step
	}

	state := map[string]interface{}{
		"name":        name,
		"description": description,
		"steps":       stepsSlice,
	}
	refs := map[string]interface{}{}
	if authorHash != "" {
		refs["author"] = authorHash
	}
	return Create("observe.template", state, refs)
}

// FromTemplate instantiates a template — creates real blocks from a template pattern.
// values maps step alias to StepOverrides. @alias refs are resolved to previously created block hashes.
func FromTemplate(tmpl TemplateDef, values map[string]StepOverrides) []Block {
	aliases := make(map[string]string)
	var blocks []Block

	for _, step := range tmpl.Steps {
		alias := step.Alias
		if alias == "" {
			alias = step.Type
		}

		overrides := values[alias]

		// Build state from step defaults + overrides
		blockState := make(map[string]interface{})
		for k, v := range step.DefaultState {
			blockState[k] = v
		}
		if overrides.State != nil {
			for k, v := range overrides.State {
				blockState[k] = v
			}
		}

		// Build refs, resolving @aliases
		blockRefs := make(map[string]interface{})
		for role, target := range step.Refs {
			if len(target) > 0 && target[0] == '@' {
				refAlias := target[1:]
				if hash, ok := aliases[refAlias]; ok {
					blockRefs[role] = hash
				}
			} else {
				blockRefs[role] = target
			}
		}
		// Override refs from values
		if overrides.Refs != nil {
			for role, target := range overrides.Refs {
				if len(target) > 0 && target[0] == '@' {
					refAlias := target[1:]
					if hash, ok := aliases[refAlias]; ok {
						blockRefs[role] = hash
					}
				} else {
					blockRefs[role] = target
				}
			}
		}

		block := Create(step.Type, blockState, blockRefs)
		aliases[alias] = block.Hash
		blocks = append(blocks, block)
	}

	return blocks
}
