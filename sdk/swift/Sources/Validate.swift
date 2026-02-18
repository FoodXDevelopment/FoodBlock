import Foundation

/// Schema validation for FoodBlocks (Section 8).
/// Validates a block's state against a schema definition.
/// Validation is always optional -- a block without a $schema reference is valid.
public enum FoodBlockValidate {

    // MARK: - Schema Types

    /// Defines a single field in a schema.
    public struct SchemaField {
        public let type: String
        public let required: Bool

        public init(type: String, required: Bool = false) {
            self.type = type
            self.required = required
        }
    }

    /// Defines a schema for validating FoodBlocks.
    public struct Schema {
        public let targetType: String
        public let version: String
        public let fields: [String: SchemaField]
        public let expectedRefs: [String]
        public let optionalRefs: [String]
        public let requiresInstanceId: Bool

        public init(
            targetType: String,
            version: String,
            fields: [String: SchemaField],
            expectedRefs: [String] = [],
            optionalRefs: [String] = [],
            requiresInstanceId: Bool = false
        ) {
            self.targetType = targetType
            self.version = version
            self.fields = fields
            self.expectedRefs = expectedRefs
            self.optionalRefs = optionalRefs
            self.requiresInstanceId = requiresInstanceId
        }
    }

    // MARK: - Core Schemas

    /// Bundled core schemas matching the JavaScript SDK's CORE_SCHEMAS.
    /// Keys follow the format "foodblock:<type>@<version>".
    public static let coreSchemas: [String: Schema] = [
        "foodblock:substance.product@1.0": Schema(
            targetType: "substance.product",
            version: "1.0",
            fields: [
                "name": SchemaField(type: "string", required: true),
                "price": SchemaField(type: "number"),
                "unit": SchemaField(type: "string"),
                "weight": SchemaField(type: "object"),
                "allergens": SchemaField(type: "object"),
                "gtin": SchemaField(type: "string")
            ],
            expectedRefs: ["seller"],
            optionalRefs: ["origin", "inputs", "certifications"],
            requiresInstanceId: false
        ),
        "foodblock:transfer.order@1.0": Schema(
            targetType: "transfer.order",
            version: "1.0",
            fields: [
                "instance_id": SchemaField(type: "string", required: true),
                "quantity": SchemaField(type: "number"),
                "unit": SchemaField(type: "string"),
                "total": SchemaField(type: "number"),
                "payment_ref": SchemaField(type: "string")
            ],
            expectedRefs: ["buyer", "seller"],
            optionalRefs: ["product", "agent"],
            requiresInstanceId: true
        ),
        "foodblock:observe.review@1.0": Schema(
            targetType: "observe.review",
            version: "1.0",
            fields: [
                "instance_id": SchemaField(type: "string", required: true),
                "rating": SchemaField(type: "number", required: true),
                "text": SchemaField(type: "string")
            ],
            expectedRefs: ["subject", "author"],
            optionalRefs: [],
            requiresInstanceId: true
        ),
        "foodblock:actor.producer@1.0": Schema(
            targetType: "actor.producer",
            version: "1.0",
            fields: [
                "name": SchemaField(type: "string", required: true),
                "public_key_sign": SchemaField(type: "string"),
                "public_key_encrypt": SchemaField(type: "string"),
                "gln": SchemaField(type: "string")
            ],
            expectedRefs: [],
            optionalRefs: [],
            requiresInstanceId: false
        ),
        "foodblock:observe.certification@1.0": Schema(
            targetType: "observe.certification",
            version: "1.0",
            fields: [
                "instance_id": SchemaField(type: "string", required: true),
                "name": SchemaField(type: "string", required: true),
                "valid_until": SchemaField(type: "string"),
                "standard": SchemaField(type: "string")
            ],
            expectedRefs: ["subject", "authority"],
            optionalRefs: [],
            requiresInstanceId: true
        )
    ]

    // MARK: - Validation

    /// Validate a FoodBlock against a schema.
    ///
    /// If no schema is provided, attempts to resolve from the block's `$schema` state field
    /// using the core schema registry. A block with no schema reference is considered valid.
    ///
    /// - Parameters:
    ///   - block: The FoodBlock to validate
    ///   - schema: Optional schema to validate against. If nil, uses block's $schema field.
    ///   - registry: Optional custom schema registry. Defaults to coreSchemas.
    /// - Returns: Array of error strings. Empty array means the block is valid.
    public static func validate(
        block: FoodBlock,
        schema: Schema? = nil,
        registry: [String: Schema]? = nil
    ) -> [String] {
        var errors: [String] = []

        // Basic structure check
        guard !block.type.isEmpty else {
            errors.append("Block must have type and state")
            return errors
        }

        // Resolve schema
        var schemaDef = schema

        if schemaDef == nil {
            // Check if block's state has a $schema field
            if let schemaRef = block.state["$schema"]?.value as? String {
                let reg = registry ?? coreSchemas
                if let resolved = reg[schemaRef] {
                    schemaDef = resolved
                } else {
                    errors.append("Unknown schema: \(schemaRef)")
                    return errors
                }
            }
        }

        // No schema to validate against -- block is valid
        guard let schema = schemaDef else {
            return errors
        }

        // Check type match
        if !schema.targetType.isEmpty && block.type != schema.targetType {
            errors.append("Type mismatch: block is \(block.type), schema is for \(schema.targetType)")
        }

        // Check required fields and type constraints
        for (field, def) in schema.fields {
            let stateValue = block.state[field]?.value

            // Check required fields
            if def.required && stateValue == nil {
                errors.append("Missing required field: state.\(field)")
                continue
            }

            // Check type if value is present
            if let value = stateValue {
                let typeError = checkType(value: value, expectedType: def.type, field: "state.\(field)")
                if let err = typeError {
                    errors.append(err)
                }
            }
        }

        // Check expected refs
        for ref in schema.expectedRefs {
            if block.refs[ref] == nil {
                errors.append("Missing expected ref: refs.\(ref)")
            }
        }

        // Check instance_id requirement
        if schema.requiresInstanceId {
            if block.state["instance_id"]?.value == nil {
                // Only add if not already caught by required field check
                let alreadyReported = errors.contains("Missing required field: state.instance_id")
                if !alreadyReported {
                    errors.append("Missing required field: state.instance_id")
                }
            }
        }

        return errors
    }

    // MARK: - Type Checking

    /// Check if a value matches the expected schema type.
    /// Returns an error string if there's a mismatch, nil if valid.
    private static func checkType(value: Any, expectedType: String, field: String) -> String? {
        switch expectedType {
        case "string":
            if !(value is String) {
                return "Field \(field) should be string, got \(swiftTypeLabel(value))"
            }
        case "number":
            if !isNumber(value) {
                return "Field \(field) should be number, got \(swiftTypeLabel(value))"
            }
        case "object":
            // Must be a dictionary (not an array)
            if value is [Any] {
                return "Field \(field) should be object, got array"
            }
            if !(value is [String: Any]) {
                return "Field \(field) should be object, got \(swiftTypeLabel(value))"
            }
        default:
            break
        }
        return nil
    }

    /// Check if a value is a numeric type.
    private static func isNumber(_ value: Any) -> Bool {
        if value is Int || value is Double || value is Float {
            return true
        }
        // NSNumber check (but exclude booleans which bridge to NSNumber)
        if let num = value as? NSNumber {
            return CFBooleanGetTypeID() != CFGetTypeID(num)
        }
        return false
    }

    /// Get a human-readable type label for a value, matching JS's typeof output.
    private static func swiftTypeLabel(_ value: Any) -> String {
        if value is String { return "string" }
        if value is Bool { return "boolean" }
        if isNumber(value) { return "number" }
        if value is [Any] { return "object" }
        if value is [String: Any] { return "object" }
        return "undefined"
    }
}
