import Foundation

// MARK: - Types

/// A single step in a template definition.
public struct TemplateStep {
    public let type: String
    public let alias: String
    public var refs: [String: String]
    public var required: [String]
    public var defaultState: [String: Any]

    public init(
        type: String,
        alias: String? = nil,
        refs: [String: String] = [:],
        required: [String] = [],
        defaultState: [String: Any] = [:]
    ) {
        self.type = type
        self.alias = alias ?? type
        self.refs = refs
        self.required = required
        self.defaultState = defaultState
    }
}

/// A reusable block creation pattern.
public struct TemplateDef {
    public let name: String
    public let description: String
    public let steps: [TemplateStep]

    public init(name: String, description: String, steps: [TemplateStep]) {
        self.name = name
        self.description = description
        self.steps = steps
    }
}

/// State and ref overrides for template instantiation.
public struct StepOverrides {
    public var state: [String: Any]
    public var refs: [String: String]

    public init(state: [String: Any] = [:], refs: [String: String] = [:]) {
        self.state = state
        self.refs = refs
    }
}

// MARK: - FoodBlockTemplate

public enum FoodBlockTemplate {

    // MARK: - Built-in Templates

    public static let templates: [String: TemplateDef] = [
        "supply-chain": TemplateDef(
            name: "Farm-to-Table Supply Chain",
            description: "A complete provenance chain from primary producer to retail",
            steps: [
                TemplateStep(type: "actor.producer", alias: "farm", required: ["name"]),
                TemplateStep(type: "substance.ingredient", alias: "crop", refs: ["source": "@farm"], required: ["name"]),
                TemplateStep(type: "transform.process", alias: "processing", refs: ["input": "@crop"], required: ["name"]),
                TemplateStep(type: "substance.product", alias: "product", refs: ["origin": "@processing"], required: ["name"]),
                TemplateStep(type: "transfer.order", alias: "sale", refs: ["item": "@product"]),
            ]
        ),
        "review": TemplateDef(
            name: "Product Review",
            description: "A consumer review of a food product",
            steps: [
                TemplateStep(type: "actor.venue", alias: "venue", required: ["name"]),
                TemplateStep(type: "substance.product", alias: "product", refs: ["seller": "@venue"], required: ["name"]),
                TemplateStep(type: "observe.review", alias: "review", refs: ["subject": "@product"], required: ["rating"]),
            ]
        ),
        "certification": TemplateDef(
            name: "Product Certification",
            description: "An authority certifying a producer or product",
            steps: [
                TemplateStep(type: "actor.authority", alias: "authority", required: ["name"]),
                TemplateStep(type: "actor.producer", alias: "producer", required: ["name"]),
                TemplateStep(type: "observe.certification", alias: "cert", refs: ["authority": "@authority", "subject": "@producer"], required: ["name"]),
            ]
        ),
        "surplus-rescue": TemplateDef(
            name: "Surplus Rescue",
            description: "Food business posts surplus, sustainer collects, donation recorded",
            steps: [
                TemplateStep(type: "actor.venue", alias: "donor", defaultState: ["name": "Food Business"]),
                TemplateStep(type: "substance.surplus", alias: "surplus", refs: ["seller": "@donor"], defaultState: ["name": "Surplus Food", "status": "available"]),
                TemplateStep(type: "transfer.donation", alias: "donation", refs: ["source": "@donor", "item": "@surplus"], defaultState: ["status": "collected"]),
            ]
        ),
        "agent-reorder": TemplateDef(
            name: "Agent Reorder",
            description: "Inventory check \u{2192} low stock \u{2192} draft order \u{2192} approve \u{2192} order placed",
            steps: [
                TemplateStep(type: "actor.venue", alias: "business", defaultState: ["name": "Business"]),
                TemplateStep(type: "observe.reading", alias: "inventory-check", refs: ["subject": "@business"], defaultState: ["name": "Inventory Check", "reading_type": "stock_level"]),
                TemplateStep(type: "actor.agent", alias: "agent", refs: ["operator": "@business"], defaultState: ["name": "Reorder Agent", "capabilities": ["ordering"] as [Any]]),
                TemplateStep(type: "transfer.order", alias: "draft-order", refs: ["buyer": "@business", "agent": "@agent"], defaultState: ["status": "draft", "draft": true as Any]),
                TemplateStep(type: "transfer.order", alias: "confirmed-order", refs: ["buyer": "@business", "updates": "@draft-order"], defaultState: ["status": "confirmed"]),
            ]
        ),
        "restaurant-sourcing": TemplateDef(
            name: "Restaurant Sourcing",
            description: "Restaurant needs ingredient \u{2192} discovery \u{2192} supplier offer \u{2192} accept \u{2192} order \u{2192} delivery",
            steps: [
                TemplateStep(type: "actor.venue", alias: "restaurant", defaultState: ["name": "Restaurant"]),
                TemplateStep(type: "substance.ingredient", alias: "needed", refs: [:], defaultState: ["name": "Ingredient Needed"]),
                TemplateStep(type: "actor.producer", alias: "supplier", defaultState: ["name": "Supplier"]),
                TemplateStep(type: "transfer.offer", alias: "offer", refs: ["seller": "@supplier", "item": "@needed", "buyer": "@restaurant"], defaultState: ["status": "offered"]),
                TemplateStep(type: "transfer.order", alias: "order", refs: ["buyer": "@restaurant", "seller": "@supplier", "item": "@needed"], defaultState: ["status": "confirmed"]),
                TemplateStep(type: "transfer.delivery", alias: "delivery", refs: ["order": "@order", "seller": "@supplier", "buyer": "@restaurant"], defaultState: ["status": "delivered"]),
            ]
        ),
        "food-safety-audit": TemplateDef(
            name: "Food Safety Audit",
            description: "Inspector visits \u{2192} readings taken \u{2192} report \u{2192} certification \u{2192} attestation",
            steps: [
                TemplateStep(type: "actor.venue", alias: "premises", defaultState: ["name": "Food Premises"]),
                TemplateStep(type: "actor.producer", alias: "inspector", defaultState: ["name": "Food Safety Inspector"]),
                TemplateStep(type: "observe.reading", alias: "readings", refs: ["subject": "@premises", "author": "@inspector"], defaultState: ["name": "Safety Readings"]),
                TemplateStep(type: "observe.certification", alias: "certificate", refs: ["subject": "@premises", "authority": "@inspector"], defaultState: ["name": "Food Safety Certificate"]),
                TemplateStep(type: "observe.attestation", alias: "attestation", refs: ["confirms": "@certificate", "attestor": "@inspector"], defaultState: ["confidence": "verified"]),
            ]
        ),
        "market-day": TemplateDef(
            name: "Market Day",
            description: "Producer brings stock \u{2192} stall setup \u{2192} sales \u{2192} end-of-day surplus \u{2192} donation",
            steps: [
                TemplateStep(type: "actor.producer", alias: "producer", defaultState: ["name": "Market Producer"]),
                TemplateStep(type: "place.market", alias: "market", defaultState: ["name": "Farmers Market"]),
                TemplateStep(type: "substance.product", alias: "stock", refs: ["seller": "@producer"], defaultState: ["name": "Market Stock"]),
                TemplateStep(type: "transfer.order", alias: "sales", refs: ["seller": "@producer", "item": "@stock"], defaultState: ["status": "completed"]),
                TemplateStep(type: "substance.surplus", alias: "leftover", refs: ["seller": "@producer", "source": "@stock"], defaultState: ["name": "End of Day Surplus", "status": "available"]),
            ]
        ),
        "cold-chain": TemplateDef(
            name: "Cold Chain",
            description: "Shipment departs \u{2192} temperature readings \u{2192} delivery \u{2192} chain verified",
            steps: [
                TemplateStep(type: "actor.distributor", alias: "carrier", defaultState: ["name": "Cold Chain Carrier"]),
                TemplateStep(type: "transfer.delivery", alias: "shipment", refs: ["carrier": "@carrier"], defaultState: ["status": "in_transit"]),
                TemplateStep(type: "observe.reading", alias: "temp-log", refs: ["subject": "@shipment"], defaultState: ["name": "Temperature Log", "reading_type": "temperature"]),
                TemplateStep(type: "observe.attestation", alias: "chain-verified", refs: ["confirms": "@shipment", "attestor": "@carrier"], defaultState: ["confidence": "verified", "method": "continuous_monitoring"]),
            ]
        ),
    ]

    // MARK: - Create Template Block

    /// Create an observe.template FoodBlock.
    ///
    /// - Parameters:
    ///   - name: Template name.
    ///   - description: What the template models.
    ///   - steps: Array of step definitions.
    ///   - author: Optional author hash.
    /// - Returns: A FoodBlock of type "observe.template".
    public static func createTemplate(
        name: String,
        description: String,
        steps: [TemplateStep],
        author: String? = nil
    ) -> FoodBlock {
        let stepsArray: [[String: Any]] = steps.map { step in
            var entry: [String: Any] = ["type": step.type]
            if step.alias != step.type {
                entry["alias"] = step.alias
            }
            if !step.refs.isEmpty {
                entry["refs"] = step.refs
            }
            if !step.required.isEmpty {
                entry["required"] = step.required
            }
            if !step.defaultState.isEmpty {
                entry["default_state"] = step.defaultState
            }
            return entry
        }

        let state: [String: Any] = [
            "name": name,
            "description": description,
            "steps": stepsArray,
        ]

        var refs: [String: Any] = [:]
        if let author = author { refs["author"] = author }

        return FoodBlock.create(type: "observe.template", state: state, refs: refs)
    }

    // MARK: - Instantiate Template

    /// Instantiate a template — create real blocks from a template pattern.
    /// @alias refs in step definitions are resolved to previously created block hashes.
    ///
    /// - Parameters:
    ///   - template: A template definition.
    ///   - values: Map of step alias to overrides.
    /// - Returns: Array of created blocks, in dependency order.
    public static func fromTemplate(
        _ template: TemplateDef,
        values: [String: StepOverrides] = [:]
    ) -> [FoodBlock] {
        var aliases: [String: String] = [:]
        var blocks: [FoodBlock] = []

        for step in template.steps {
            let alias = step.alias
            let overrides = values[alias] ?? StepOverrides()

            // Build state from step defaults + overrides
            var blockState: [String: Any] = step.defaultState
            for (k, v) in overrides.state {
                blockState[k] = v
            }

            // Build refs, resolving @aliases
            var blockRefs: [String: Any] = [:]
            for (role, target) in step.refs {
                if target.hasPrefix("@") {
                    let refAlias = String(target.dropFirst())
                    if let hash = aliases[refAlias] {
                        blockRefs[role] = hash
                    }
                } else {
                    blockRefs[role] = target
                }
            }
            // Override refs from values
            for (role, target) in overrides.refs {
                if target.hasPrefix("@") {
                    let refAlias = String(target.dropFirst())
                    if let hash = aliases[refAlias] {
                        blockRefs[role] = hash
                    }
                } else {
                    blockRefs[role] = target
                }
            }

            let block = FoodBlock.create(type: step.type, state: blockState, refs: blockRefs)
            aliases[alias] = block.hash
            blocks.append(block)
        }

        return blocks
    }
}
