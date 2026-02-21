package foodblock

// SeedVocabularies generates all vocabulary blocks from built-in definitions.
func SeedVocabularies() []Block {
	var blocks []Block
	for _, def := range Vocabularies {
		fieldsMap := make(map[string]interface{})
		for name, field := range def.Fields {
			entry := map[string]interface{}{"type": field.Type}
			if field.Required {
				entry["required"] = true
			}
			if len(field.Aliases) > 0 {
				aliases := make([]interface{}, len(field.Aliases))
				for i, a := range field.Aliases {
					aliases[i] = a
				}
				entry["aliases"] = aliases
			}
			if len(field.InvertAliases) > 0 {
				invertAliases := make([]interface{}, len(field.InvertAliases))
				for i, a := range field.InvertAliases {
					invertAliases[i] = a
				}
				entry["invert_aliases"] = invertAliases
			}
			if len(field.ValidUnits) > 0 {
				units := make([]interface{}, len(field.ValidUnits))
				for i, u := range field.ValidUnits {
					units[i] = u
				}
				entry["valid_units"] = units
			}
			if len(field.ValidValues) > 0 {
				vals := make([]interface{}, len(field.ValidValues))
				for i, v := range field.ValidValues {
					vals[i] = v
				}
				entry["valid_values"] = vals
			}
			if field.Description != "" {
				entry["description"] = field.Description
			}
			if field.Compound {
				entry["compound"] = true
			}
			fieldsMap[name] = entry
		}

		ft := make([]interface{}, len(def.ForTypes))
		for i, t := range def.ForTypes {
			ft[i] = t
		}

		state := map[string]interface{}{
			"domain":    def.Domain,
			"for_types": ft,
			"fields":    fieldsMap,
		}

		if def.Transitions != nil {
			transMap := make(map[string]interface{})
			for from, toList := range def.Transitions {
				arr := make([]interface{}, len(toList))
				for i, to := range toList {
					arr[i] = to
				}
				transMap[from] = arr
			}
			state["transitions"] = transMap
		}

		blocks = append(blocks, Create("observe.vocabulary", state, nil))
	}
	return blocks
}

// SeedTemplates generates all template blocks from built-in definitions.
func SeedTemplates() []Block {
	var blocks []Block
	for _, def := range Templates {
		stepsSlice := make([]interface{}, len(def.Steps))
		for i, s := range def.Steps {
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
			"name":        def.Name,
			"description": def.Description,
			"steps":       stepsSlice,
		}

		blocks = append(blocks, Create("observe.template", state, nil))
	}
	return blocks
}

// SeedAll generates all seed blocks (vocabularies + templates).
func SeedAll() []Block {
	vocabs := SeedVocabularies()
	templates := SeedTemplates()
	all := make([]Block, 0, len(vocabs)+len(templates))
	all = append(all, vocabs...)
	all = append(all, templates...)
	return all
}
