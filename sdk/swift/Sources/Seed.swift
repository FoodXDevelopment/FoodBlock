import Foundation

// MARK: - FoodBlockSeed

public enum FoodBlockSeed {

    /// Generate all vocabulary blocks from built-in definitions.
    public static func seedVocabularies() -> [FoodBlock] {
        return FoodBlockVocabulary.vocabularies.map { (_, def) in
            var state: [String: Any] = [
                "domain": def.domain,
                "for_types": def.forTypes,
                "fields": serializeFields(def.fields)
            ]
            if let transitions = def.transitions {
                state["transitions"] = transitions
            }
            return FoodBlock.create(type: "observe.vocabulary", state: state)
        }
    }

    /// Generate all template blocks from built-in definitions.
    public static func seedTemplates() -> [FoodBlock] {
        return FoodBlockTemplate.templates.map { (_, def) in
            let stepsArray: [[String: Any]] = def.steps.map { step in
                var entry: [String: Any] = ["type": step.type]
                if step.alias != step.type { entry["alias"] = step.alias }
                if !step.refs.isEmpty { entry["refs"] = step.refs }
                if !step.required.isEmpty { entry["required"] = step.required }
                if !step.defaultState.isEmpty { entry["default_state"] = step.defaultState }
                return entry
            }
            return FoodBlock.create(type: "observe.template", state: [
                "name": def.name,
                "description": def.description,
                "steps": stepsArray
            ])
        }
    }

    /// Generate all seed blocks (vocabularies + templates).
    public static func seedAll() -> [FoodBlock] {
        return seedVocabularies() + seedTemplates()
    }

    // MARK: - Private

    private static func serializeFields(_ fields: [String: FieldDef]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (name, def) in fields {
            var entry: [String: Any] = ["type": def.type]
            if def.required { entry["required"] = true }
            if !def.aliases.isEmpty { entry["aliases"] = def.aliases }
            if !def.invertAliases.isEmpty { entry["invert_aliases"] = def.invertAliases }
            if let units = def.validUnits { entry["valid_units"] = units }
            if let vals = def.validValues { entry["valid_values"] = vals }
            if !def.description.isEmpty { entry["description"] = def.description }
            if def.compound { entry["compound"] = true }
            result[name] = entry
        }
        return result
    }
}
