package foodblock

import "fmt"

// SchemaField defines a field in a schema.
type SchemaField struct {
	Type     string
	Required bool
}

// Schema defines validation rules for a block type.
type Schema struct {
	TargetType        string
	Version           string
	Fields            map[string]SchemaField
	ExpectedRefs      []string
	OptionalRefs      []string
	RequiresInstanceID bool
}

// CoreSchemas are the bundled core schemas.
var CoreSchemas = map[string]Schema{
	"foodblock:substance.product@1.0": {
		TargetType: "substance.product",
		Version:    "1.0",
		Fields: map[string]SchemaField{
			"name":  {Type: "string", Required: true},
			"price": {Type: "number"},
			"unit":  {Type: "string"},
		},
		ExpectedRefs:      []string{"seller"},
		OptionalRefs:      []string{"origin", "inputs", "certifications"},
		RequiresInstanceID: false,
	},
	"foodblock:transfer.order@1.0": {
		TargetType: "transfer.order",
		Version:    "1.0",
		Fields: map[string]SchemaField{
			"instance_id": {Type: "string", Required: true},
			"quantity":    {Type: "number"},
			"unit":        {Type: "string"},
			"total":       {Type: "number"},
		},
		ExpectedRefs:      []string{"buyer", "seller"},
		OptionalRefs:      []string{"product", "agent"},
		RequiresInstanceID: true,
	},
	"foodblock:observe.review@1.0": {
		TargetType: "observe.review",
		Version:    "1.0",
		Fields: map[string]SchemaField{
			"instance_id": {Type: "string", Required: true},
			"rating":      {Type: "number", Required: true},
			"text":        {Type: "string"},
		},
		ExpectedRefs:      []string{"subject", "author"},
		RequiresInstanceID: true,
	},
	"foodblock:actor.producer@1.0": {
		TargetType: "actor.producer",
		Version:    "1.0",
		Fields: map[string]SchemaField{
			"name": {Type: "string", Required: true},
		},
		RequiresInstanceID: false,
	},
	"foodblock:observe.certification@1.0": {
		TargetType: "observe.certification",
		Version:    "1.0",
		Fields: map[string]SchemaField{
			"instance_id": {Type: "string", Required: true},
			"name":        {Type: "string", Required: true},
			"valid_until": {Type: "string"},
			"standard":    {Type: "string"},
		},
		ExpectedRefs:      []string{"subject", "authority"},
		RequiresInstanceID: true,
	},
}

// Validate validates a block against a schema. Returns a list of error messages (empty = valid).
func Validate(block Block, schema *Schema) []string {
	var errs []string

	if block.Type == "" {
		errs = append(errs, "Block must have type and state")
		return errs
	}

	// Resolve schema from block's $schema field if not provided
	schemaDef := schema
	if schemaDef == nil {
		if schemaRef, ok := block.State["$schema"].(string); ok {
			if s, exists := CoreSchemas[schemaRef]; exists {
				schemaDef = &s
			} else {
				errs = append(errs, fmt.Sprintf("Unknown schema: %s", schemaRef))
				return errs
			}
		}
	}

	if schemaDef == nil {
		return errs
	}

	// Check type match
	if schemaDef.TargetType != "" && block.Type != schemaDef.TargetType {
		errs = append(errs, fmt.Sprintf("Type mismatch: block is %s, schema is for %s", block.Type, schemaDef.TargetType))
	}

	// Check required fields
	for field, def := range schemaDef.Fields {
		if def.Required {
			if _, ok := block.State[field]; !ok {
				errs = append(errs, fmt.Sprintf("Missing required field: state.%s", field))
			}
		}
		if val, ok := block.State[field]; ok && def.Type != "" {
			actualType := goTypeToSchemaType(val)
			if actualType != def.Type {
				errs = append(errs, fmt.Sprintf("Field state.%s should be %s, got %s", field, def.Type, actualType))
			}
		}
	}

	// Check required refs
	for _, ref := range schemaDef.ExpectedRefs {
		if _, ok := block.Refs[ref]; !ok {
			errs = append(errs, fmt.Sprintf("Missing expected ref: refs.%s", ref))
		}
	}

	// Check instance_id requirement
	if schemaDef.RequiresInstanceID {
		if _, ok := block.State["instance_id"]; !ok {
			errs = append(errs, "Missing required field: state.instance_id")
		}
	}

	return errs
}

func goTypeToSchemaType(v interface{}) string {
	switch v.(type) {
	case string:
		return "string"
	case float64, int, int64:
		return "number"
	case bool:
		return "boolean"
	case map[string]interface{}:
		return "object"
	case []interface{}:
		return "array"
	default:
		return "unknown"
	}
}
