import Foundation

// MARK: - Types

/// Definition of a single field within a vocabulary.
public struct FieldDef {
    public let type: String
    public var required: Bool
    public var aliases: [String]
    public var invertAliases: [String]
    public var validUnits: [String]?
    public var validValues: [String]?
    public var description: String
    public var compound: Bool

    public init(
        type: String,
        required: Bool = false,
        aliases: [String] = [],
        invertAliases: [String] = [],
        validUnits: [String]? = nil,
        validValues: [String]? = nil,
        description: String = "",
        compound: Bool = false
    ) {
        self.type = type
        self.required = required
        self.aliases = aliases
        self.invertAliases = invertAliases
        self.validUnits = validUnits
        self.validValues = validValues
        self.description = description
        self.compound = compound
    }
}

/// A vocabulary definition containing domain, applicable types, field definitions,
/// and optional workflow transitions.
public struct VocabularyDef {
    public let domain: String
    public let forTypes: [String]
    public let fields: [String: FieldDef]
    public var transitions: [String: [String]]?

    public init(
        domain: String,
        forTypes: [String],
        fields: [String: FieldDef],
        transitions: [String: [String]]? = nil
    ) {
        self.domain = domain
        self.forTypes = forTypes
        self.fields = fields
        self.transitions = transitions
    }
}

/// Result of mapping natural language text against a vocabulary.
public struct MapFieldsResult {
    public let matched: [String: Any]
    public let unmatched: [String]
}

// MARK: - FoodBlockVocabulary

public enum FoodBlockVocabulary {

    // MARK: - Built-in Vocabularies

    public static let vocabularies: [String: VocabularyDef] = {
        var vocabs: [String: VocabularyDef] = [:]

        vocabs["bakery"] = VocabularyDef(
            domain: "bakery",
            forTypes: ["substance.product", "substance.ingredient", "transform.process"],
            fields: [
                "price": FieldDef(
                    type: "number",
                    aliases: ["price", "cost", "sells for", "costs"],
                    description: "Price of the baked good"
                ),
                "weight": FieldDef(
                    type: "number",
                    aliases: ["weight", "weighs", "grams", "kg"],
                    description: "Weight of the product"
                ),
                "allergens": FieldDef(
                    type: "compound",
                    aliases: ["gluten", "nuts", "dairy", "eggs", "soy", "wheat"],
                    description: "Allergens present in the product",
                    compound: true
                ),
                "name": FieldDef(
                    type: "string",
                    required: true,
                    aliases: ["name", "called", "named"],
                    description: "Product name"
                ),
                "organic": FieldDef(
                    type: "boolean",
                    aliases: ["organic", "bio"],
                    description: "Whether the product is organic"
                )
            ]
        )

        vocabs["restaurant"] = VocabularyDef(
            domain: "restaurant",
            forTypes: ["actor.venue", "substance.product", "observe.review"],
            fields: [
                "cuisine": FieldDef(
                    type: "string",
                    aliases: ["cuisine", "style", "serves"],
                    description: "Type of cuisine served"
                ),
                "rating": FieldDef(
                    type: "number",
                    aliases: ["rating", "rated", "stars", "score"],
                    description: "Rating score"
                ),
                "price_range": FieldDef(
                    type: "string",
                    aliases: ["price range", "budget", "expensive", "cheap", "moderate"],
                    description: "Price range category"
                ),
                "halal": FieldDef(
                    type: "boolean",
                    aliases: ["halal"],
                    description: "Whether food is halal"
                ),
                "kosher": FieldDef(
                    type: "boolean",
                    aliases: ["kosher"],
                    description: "Whether food is kosher"
                ),
                "vegan": FieldDef(
                    type: "boolean",
                    aliases: ["vegan", "plant-based"],
                    description: "Whether food is vegan"
                )
            ]
        )

        vocabs["farm"] = VocabularyDef(
            domain: "farm",
            forTypes: ["actor.producer", "substance.ingredient", "observe.certification"],
            fields: [
                "crop": FieldDef(
                    type: "string",
                    aliases: ["crop", "grows", "produces", "cultivates"],
                    description: "Primary crop or product"
                ),
                "acreage": FieldDef(
                    type: "number",
                    aliases: ["acreage", "acres", "hectares", "area"],
                    description: "Farm size"
                ),
                "organic": FieldDef(
                    type: "boolean",
                    aliases: ["organic", "bio", "chemical-free"],
                    description: "Whether the farm is organic"
                ),
                "region": FieldDef(
                    type: "string",
                    aliases: ["region", "location", "from", "based in"],
                    description: "Geographic region"
                ),
                "seasonal": FieldDef(
                    type: "boolean",
                    aliases: ["seasonal"],
                    description: "Whether production is seasonal"
                )
            ]
        )

        vocabs["retail"] = VocabularyDef(
            domain: "retail",
            forTypes: ["actor.venue", "substance.product", "transfer.order"],
            fields: [
                "price": FieldDef(
                    type: "number",
                    aliases: ["price", "cost", "sells for", "priced at"],
                    description: "Retail price"
                ),
                "sku": FieldDef(
                    type: "string",
                    aliases: ["sku", "product code", "item number"],
                    description: "Stock keeping unit"
                ),
                "quantity": FieldDef(
                    type: "number",
                    aliases: ["quantity", "qty", "count", "units"],
                    description: "Available quantity"
                ),
                "category": FieldDef(
                    type: "string",
                    aliases: ["category", "department", "section", "aisle"],
                    description: "Product category"
                ),
                "on_sale": FieldDef(
                    type: "boolean",
                    aliases: ["on sale", "discounted", "clearance"],
                    description: "Whether the item is on sale"
                )
            ]
        )

        vocabs["lot"] = VocabularyDef(
            domain: "lot",
            forTypes: ["substance.product", "substance.ingredient", "transform.process"],
            fields: [
                "lot_id": FieldDef(
                    type: "string",
                    required: true,
                    aliases: ["lot", "lot number", "lot id", "batch"],
                    description: "Lot or batch identifier"
                ),
                "batch_id": FieldDef(
                    type: "string",
                    aliases: ["batch", "batch number", "batch id"],
                    description: "Batch identifier (alias for lot_id in some systems)"
                ),
                "production_date": FieldDef(
                    type: "string",
                    aliases: ["produced", "manufactured", "made on", "production date"],
                    description: "Date of production (ISO 8601)"
                ),
                "expiry_date": FieldDef(
                    type: "string",
                    aliases: ["expires", "expiry", "best before", "use by", "sell by"],
                    description: "Expiry or best-before date (ISO 8601)"
                ),
                "lot_size": FieldDef(
                    type: "number",
                    aliases: ["lot size", "batch size", "quantity produced"],
                    description: "Number of units in the lot"
                ),
                "facility": FieldDef(
                    type: "string",
                    aliases: ["facility", "plant", "factory", "site"],
                    description: "Production facility identifier"
                )
            ]
        )

        vocabs["units"] = VocabularyDef(
            domain: "units",
            forTypes: ["substance.product", "substance.ingredient", "transfer.order", "observe.reading"],
            fields: [
                "weight": FieldDef(
                    type: "quantity",
                    aliases: ["weight", "weighs", "mass"],
                    validUnits: ["g", "kg", "oz", "lb", "ton", "mg"],
                    description: "Weight/mass measurement"
                ),
                "volume": FieldDef(
                    type: "quantity",
                    aliases: ["volume", "capacity", "amount"],
                    validUnits: ["ml", "l", "fl_oz", "gal", "cup", "tbsp", "tsp"],
                    description: "Volume measurement"
                ),
                "temperature": FieldDef(
                    type: "quantity",
                    aliases: ["temperature", "temp", "degrees"],
                    validUnits: ["celsius", "fahrenheit", "kelvin"],
                    description: "Temperature reading"
                ),
                "length": FieldDef(
                    type: "quantity",
                    aliases: ["length", "height", "width", "depth", "distance"],
                    validUnits: ["mm", "cm", "m", "km", "in", "ft"],
                    description: "Length/distance measurement"
                ),
                "currency": FieldDef(
                    type: "quantity",
                    aliases: ["price", "cost", "total", "amount"],
                    validUnits: ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"],
                    description: "Monetary amount"
                )
            ]
        )

        vocabs["workflow"] = VocabularyDef(
            domain: "workflow",
            forTypes: ["transfer.order", "transfer.shipment", "transfer.booking"],
            fields: [
                "status": FieldDef(
                    type: "string",
                    required: true,
                    aliases: ["status", "state", "stage"],
                    description: "Current workflow status"
                ),
                "previous_status": FieldDef(
                    type: "string",
                    aliases: ["was", "previously", "changed from"],
                    description: "Previous status before transition"
                ),
                "reason": FieldDef(
                    type: "string",
                    aliases: ["reason", "because", "note"],
                    description: "Reason for status change"
                )
            ],
            transitions: [
                "draft": ["quote", "order", "cancelled"],
                "quote": ["order", "cancelled"],
                "order": ["confirmed", "cancelled"],
                "confirmed": ["processing", "cancelled"],
                "processing": ["shipped", "cancelled"],
                "shipped": ["delivered", "returned"],
                "delivered": ["paid", "returned"],
                "paid": [],
                "cancelled": [],
                "returned": ["order"]
            ]
        )

        vocabs["distributor"] = VocabularyDef(
            domain: "distributor",
            forTypes: ["actor.distributor", "transfer.delivery"],
            fields: [
                "vehicle_type": FieldDef(
                    type: "string",
                    aliases: ["van", "truck", "lorry", "reefer", "refrigerated"],
                    description: "Type of delivery vehicle"
                ),
                "temperature_range": FieldDef(
                    type: "object",
                    aliases: ["chilled", "frozen", "ambient", "cold chain"],
                    description: "Required temperature range for transport"
                ),
                "delivery_zone": FieldDef(
                    type: "string",
                    aliases: ["zone", "area", "region", "route", "coverage"],
                    description: "Delivery coverage zone or route"
                ),
                "fleet_size": FieldDef(
                    type: "number",
                    aliases: ["fleet", "vehicles"],
                    description: "Number of vehicles in the fleet"
                ),
                "cold_chain_certified": FieldDef(
                    type: "boolean",
                    aliases: ["cold chain certified", "temperature controlled", "cold chain"],
                    description: "Whether the distributor is cold chain certified"
                ),
                "transit_time": FieldDef(
                    type: "object",
                    aliases: ["transit", "delivery time", "lead time"],
                    description: "Expected transit or delivery time"
                )
            ]
        )

        vocabs["processor"] = VocabularyDef(
            domain: "processor",
            forTypes: ["transform.process", "actor.processor"],
            fields: [
                "process_type": FieldDef(
                    type: "string",
                    aliases: ["milling", "pressing", "extraction", "refining", "pasteurizing", "fermenting", "smoking", "curing"],
                    description: "Type of processing operation"
                ),
                "extraction_rate": FieldDef(
                    type: "number",
                    aliases: ["extraction rate", "yield", "recovery"],
                    description: "Extraction or yield rate"
                ),
                "batch_size": FieldDef(
                    type: "number",
                    aliases: ["batch", "batch size", "run size"],
                    description: "Size of a processing batch"
                ),
                "equipment": FieldDef(
                    type: "string",
                    aliases: ["mill", "press", "vat", "oven", "kiln", "smoker", "pasteurizer"],
                    description: "Processing equipment used"
                ),
                "quality_grade": FieldDef(
                    type: "string",
                    aliases: ["grade", "quality", "grade a", "grade b", "premium", "standard"],
                    description: "Quality grade of the output"
                ),
                "shelf_life": FieldDef(
                    type: "object",
                    aliases: ["shelf life", "best before", "use by", "expiry"],
                    description: "Expected shelf life of the product"
                )
            ]
        )

        vocabs["market"] = VocabularyDef(
            domain: "market",
            forTypes: ["place.market", "actor.vendor"],
            fields: [
                "stall_number": FieldDef(
                    type: "string",
                    aliases: ["stall", "pitch", "stand", "booth"],
                    description: "Stall or pitch number"
                ),
                "market_day": FieldDef(
                    type: "string",
                    aliases: ["saturday", "sunday", "weekday", "daily", "weekly"],
                    description: "Day or frequency the market operates"
                ),
                "seasonal": FieldDef(
                    type: "boolean",
                    aliases: ["seasonal", "summer only", "winter market"],
                    description: "Whether the market is seasonal"
                ),
                "pitch_fee": FieldDef(
                    type: "number",
                    aliases: ["pitch fee", "stall fee", "rent"],
                    description: "Fee for a market pitch or stall"
                ),
                "market_name": FieldDef(
                    type: "string",
                    aliases: ["market", "farmers market", "street market", "food market"],
                    description: "Name or type of the market"
                )
            ]
        )

        vocabs["catering"] = VocabularyDef(
            domain: "catering",
            forTypes: ["transfer.catering", "actor.caterer"],
            fields: [
                "event_type": FieldDef(
                    type: "string",
                    aliases: ["wedding", "corporate", "party", "banquet", "conference", "reception", "private event"],
                    description: "Type of event being catered"
                ),
                "covers": FieldDef(
                    type: "number",
                    aliases: ["covers", "guests", "people", "servings", "portions", "pax"],
                    description: "Number of covers or guests"
                ),
                "dietary_options": FieldDef(
                    type: "compound",
                    aliases: ["vegan", "vegetarian", "gluten-free", "halal", "kosher", "nut-free", "dairy-free"],
                    description: "Available dietary options",
                    compound: true
                ),
                "service_style": FieldDef(
                    type: "string",
                    aliases: ["buffet", "plated", "canape", "family style", "food truck"],
                    description: "Style of catering service"
                ),
                "per_head_price": FieldDef(
                    type: "number",
                    aliases: ["per head", "per person", "per cover", "pp"],
                    description: "Price per person"
                )
            ]
        )

        vocabs["fishery"] = VocabularyDef(
            domain: "fishery",
            forTypes: ["substance.seafood", "actor.fishery"],
            fields: [
                "catch_method": FieldDef(
                    type: "string",
                    aliases: ["line caught", "net", "trawl", "pot", "dredge", "longline", "hand dive", "rod and line"],
                    description: "Method used to catch fish"
                ),
                "vessel": FieldDef(
                    type: "string",
                    aliases: ["vessel", "boat", "trawler", "seiner"],
                    description: "Fishing vessel name or type"
                ),
                "landing_port": FieldDef(
                    type: "string",
                    aliases: ["landed", "landing port", "port", "harbour"],
                    description: "Port where the catch was landed"
                ),
                "species": FieldDef(
                    type: "string",
                    aliases: ["cod", "salmon", "haddock", "mackerel", "tuna", "sea bass", "crab", "lobster", "prawns", "oyster", "mussels"],
                    description: "Fish or seafood species"
                ),
                "msc_certified": FieldDef(
                    type: "boolean",
                    aliases: ["msc", "msc certified", "marine stewardship", "sustainable"],
                    description: "Whether the fishery is MSC certified"
                ),
                "catch_date": FieldDef(
                    type: "string",
                    aliases: ["caught", "landed", "catch date"],
                    description: "Date the catch was made"
                ),
                "fishing_zone": FieldDef(
                    type: "string",
                    aliases: ["zone", "area", "ices area", "fao area", "fishing ground"],
                    description: "Fishing zone or area designation"
                )
            ]
        )

        vocabs["dairy"] = VocabularyDef(
            domain: "dairy",
            forTypes: ["substance.dairy", "actor.dairy"],
            fields: [
                "milk_type": FieldDef(
                    type: "string",
                    aliases: ["cow", "goat", "sheep", "buffalo", "oat", "almond", "soy"],
                    description: "Type of milk used"
                ),
                "pasteurized": FieldDef(
                    type: "boolean",
                    aliases: ["pasteurized", "pasteurised", "raw", "unpasteurized"],
                    invertAliases: ["raw", "unpasteurized"],
                    description: "Whether the product is pasteurized (raw/unpasteurized = false)"
                ),
                "fat_content": FieldDef(
                    type: "number",
                    aliases: ["fat", "fat content", "butterfat", "cream"],
                    description: "Fat content percentage"
                ),
                "culture": FieldDef(
                    type: "string",
                    aliases: ["culture", "starter", "rennet", "aged", "cave aged"],
                    description: "Culture or aging method used"
                ),
                "aging_days": FieldDef(
                    type: "number",
                    aliases: ["aged", "matured", "days", "months"],
                    description: "Number of days the product has been aged"
                ),
                "animal_breed": FieldDef(
                    type: "string",
                    aliases: ["jersey", "holstein", "friesian", "guernsey", "brown swiss", "saanen"],
                    description: "Breed of the dairy animal"
                )
            ]
        )

        vocabs["butcher"] = VocabularyDef(
            domain: "butcher",
            forTypes: ["substance.meat", "actor.butcher"],
            fields: [
                "cut": FieldDef(
                    type: "string",
                    aliases: ["sirloin", "ribeye", "fillet", "rump", "brisket", "chuck", "loin", "shoulder", "leg", "rack", "chop", "mince"],
                    description: "Cut of meat"
                ),
                "animal": FieldDef(
                    type: "string",
                    aliases: ["beef", "pork", "lamb", "chicken", "duck", "venison", "rabbit", "turkey", "goose"],
                    description: "Type of animal"
                ),
                "breed": FieldDef(
                    type: "string",
                    aliases: ["angus", "hereford", "wagyu", "berkshire", "duroc", "suffolk", "texel"],
                    description: "Breed of the animal"
                ),
                "hanging_days": FieldDef(
                    type: "number",
                    aliases: ["hung", "dry aged", "aged", "hanging days", "matured"],
                    description: "Number of days the meat has been hung"
                ),
                "slaughter_method": FieldDef(
                    type: "string",
                    aliases: ["slaughter", "abattoir"],
                    description: "Method of slaughter"
                ),
                "halal": FieldDef(
                    type: "boolean",
                    aliases: ["halal", "halal certified"],
                    description: "Whether the meat is halal"
                ),
                "kosher": FieldDef(
                    type: "boolean",
                    aliases: ["kosher", "kosher certified", "glatt"],
                    description: "Whether the meat is kosher"
                )
            ]
        )

        return vocabs
    }()

    // MARK: - Create Vocabulary Block

    /// Create an observe.vocabulary block from a domain, applicable types, and field definitions.
    ///
    /// - Parameters:
    ///   - domain: Domain name like "bakery", "dairy", "restaurant".
    ///   - forTypes: Block types this vocabulary applies to.
    ///   - fields: Map of field name to field definition.
    ///   - author: Optional author hash to include in refs.
    /// - Returns: A FoodBlock of type "observe.vocabulary".
    public static func createVocabulary(
        domain: String,
        forTypes: [String],
        fields: [String: FieldDef],
        author: String? = nil
    ) -> FoodBlock {
        var fieldsDict: [String: Any] = [:]
        for (name, def) in fields {
            var entry: [String: Any] = ["type": def.type]
            if def.required { entry["required"] = true }
            if !def.aliases.isEmpty { entry["aliases"] = def.aliases }
            if !def.invertAliases.isEmpty { entry["invert_aliases"] = def.invertAliases }
            if let units = def.validUnits { entry["valid_units"] = units }
            if let vals = def.validValues { entry["valid_values"] = vals }
            if !def.description.isEmpty { entry["description"] = def.description }
            if def.compound { entry["compound"] = true }
            fieldsDict[name] = entry
        }

        let state: [String: Any] = [
            "domain": domain,
            "for_types": forTypes,
            "fields": fieldsDict
        ]

        var refs: [String: Any] = [:]
        if let author = author { refs["author"] = author }

        return FoodBlock.create(type: "observe.vocabulary", state: state, refs: refs)
    }

    // MARK: - Map Fields

    /// Given natural language text and a vocabulary block (or its state), extract field values
    /// using simple keyword/pattern matching on field aliases.
    ///
    /// - Parameters:
    ///   - text: Natural language text to parse.
    ///   - vocabulary: A VocabularyDef, or a FoodBlock whose state contains `fields`.
    /// - Returns: A `MapFieldsResult` with matched fields and unmatched tokens.
    public static func mapFields(text: String, vocabulary: VocabularyDef) -> MapFieldsResult {
        let fields = vocabulary.fields
        if fields.isEmpty {
            return MapFieldsResult(matched: [:], unmatched: [text])
        }

        var matched: [String: Any] = [:]
        let words = text.lowercased()
        let tokens = words.components(separatedBy: CharacterSet(charactersIn: " ,;\t\n"))
            .filter { !$0.isEmpty }
        var usedTokenIndices = Set<Int>()

        for (fieldName, fieldDef) in fields {
            let aliases = fieldDef.aliases.isEmpty ? [fieldName] : fieldDef.aliases
            let fieldType = fieldDef.type

            for alias in aliases {
                let aliasLower = alias.lowercased()

                if fieldType == "boolean" || fieldType == "flag" {
                    // Boolean fields: if alias appears in text, set to true
                    // Support invertAliases: aliases that set the boolean to false
                    if words.contains(aliasLower) {
                        let boolValue = !fieldDef.invertAliases.contains(where: { $0.lowercased() == aliasLower })
                        if let existing = matched[fieldName] as? [String: Any] {
                            var dict = existing
                            dict[aliasLower] = boolValue
                            matched[fieldName] = dict
                        } else if matched[fieldName] == nil && fieldDef.compound {
                            matched[fieldName] = [aliasLower: boolValue]
                        } else {
                            matched[fieldName] = boolValue
                        }
                        for (i, token) in tokens.enumerated() {
                            if token == aliasLower { usedTokenIndices.insert(i) }
                        }
                    }
                } else if fieldType == "number" {
                    // Number fields: find alias then extract adjacent number
                    if let aliasIdx = tokens.firstIndex(of: aliasLower) {
                        usedTokenIndices.insert(aliasIdx)
                        for offset in [-2, -1, 1, 2] {
                            let idx = aliasIdx + offset
                            if idx >= 0 && idx < tokens.count {
                                if let num = Double(tokens[idx]) {
                                    matched[fieldName] = num
                                    usedTokenIndices.insert(idx)
                                    break
                                }
                            }
                        }
                    } else {
                        // Try regex pattern: "alias ... number" or "number ... alias"
                        let escaped = NSRegularExpression.escapedPattern(for: aliasLower)
                        let pattern = "(?:\(escaped))\\s+(?:for\\s+)?([\\d.]+)|([\\d.]+)\\s+(?:\(escaped))"
                        if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                            let range = NSRange(text.startIndex..., in: text)
                            if let match = regex.firstMatch(in: text, range: range) {
                                let group1 = match.range(at: 1)
                                let group2 = match.range(at: 2)
                                var numStr: String?
                                if group1.location != NSNotFound, let r = Range(group1, in: text) {
                                    numStr = String(text[r])
                                } else if group2.location != NSNotFound, let r = Range(group2, in: text) {
                                    numStr = String(text[r])
                                }
                                if let str = numStr, let num = Double(str) {
                                    matched[fieldName] = num
                                }
                            }
                        }
                    }
                } else if fieldType == "compound" {
                    // Compound fields: collect aliases as keys in a dictionary
                    if words.contains(aliasLower) {
                        if matched[fieldName] == nil { matched[fieldName] = [String: Any]() }
                        if var dict = matched[fieldName] as? [String: Any] {
                            dict[aliasLower] = true
                            matched[fieldName] = dict
                        }
                        for (i, token) in tokens.enumerated() {
                            if token == aliasLower { usedTokenIndices.insert(i) }
                        }
                    }
                } else {
                    // String fields: find alias then extract adjacent word
                    if let aliasIdx = tokens.firstIndex(of: aliasLower) {
                        usedTokenIndices.insert(aliasIdx)
                        if aliasIdx + 1 < tokens.count {
                            matched[fieldName] = tokens[aliasIdx + 1]
                            usedTokenIndices.insert(aliasIdx + 1)
                        }
                    }
                }
            }
        }

        // Collect unmatched tokens
        var unmatched: [String] = []
        for (i, token) in tokens.enumerated() {
            if !usedTokenIndices.contains(i) {
                unmatched.append(token)
            }
        }

        return MapFieldsResult(matched: matched, unmatched: unmatched)
    }

    // MARK: - Quantity

    /// Create a quantity object with value and unit.
    /// Convention: all measurable values should use `{ "value": ..., "unit": ... }` format.
    ///
    /// - Parameters:
    ///   - value: The numeric value.
    ///   - unit: The unit of measurement.
    ///   - type: Optional measurement type for validation (e.g. "weight", "volume").
    /// - Throws: `FoodBlockError.invalidKey` if the value or unit is invalid, or if the unit
    ///           does not belong to the specified measurement type.
    /// - Returns: A dictionary with "value" and "unit" keys.
    public static func quantity(value: Double, unit: String, type: String? = nil) throws -> [String: Any] {
        guard !value.isNaN else {
            throw FoodBlockError.invalidKey("FoodBlock: quantity value must be a number")
        }
        guard !unit.isEmpty else {
            throw FoodBlockError.invalidKey("FoodBlock: quantity unit is required")
        }

        if let type = type, let unitsDef = vocabularies["units"]?.fields[type] {
            if let validUnits = unitsDef.validUnits, !validUnits.contains(unit) {
                throw FoodBlockError.invalidKey(
                    "FoodBlock: invalid unit '\(unit)' for \(type). Valid: \(validUnits.joined(separator: ", "))"
                )
            }
        }

        return ["value": value, "unit": unit]
    }

    // MARK: - Workflow Transitions

    /// Validate a workflow state transition.
    ///
    /// - Parameters:
    ///   - from: Current status.
    ///   - to: Target status.
    /// - Returns: Whether the transition is valid according to the workflow vocabulary.
    public static func transition(from: String, to: String) -> Bool {
        guard let transitions = vocabularies["workflow"]?.transitions else { return false }
        guard let allowed = transitions[from] else { return false }
        return allowed.contains(to)
    }

    /// Get valid next statuses for a given workflow status.
    ///
    /// - Parameter status: Current status.
    /// - Returns: Array of valid next statuses, or empty array if none.
    public static func nextStatuses(_ status: String) -> [String] {
        guard let transitions = vocabularies["workflow"]?.transitions else { return [] }
        return transitions[status] ?? []
    }

    // MARK: - Localize

    /// Localize a block's state fields, extracting values for a specific locale.
    /// Convention: multilingual fields use nested dictionaries `{ "en": "...", "fr": "...", ... }`.
    ///
    /// - Parameters:
    ///   - block: A FoodBlock to localize.
    ///   - locale: Locale code (e.g. "en", "fr", "de").
    ///   - fallback: Fallback locale if requested locale not found. Defaults to "en".
    /// - Returns: A new FoodBlock with localized state values.
    public static func localize(block: FoodBlock, locale: String, fallback: String = "en") -> FoodBlock {
        let localePattern = try? NSRegularExpression(pattern: "^[a-z]{2}(-[A-Z]{2})?$")

        var localizedState: [String: Any] = [:]

        for (key, codable) in block.state {
            let value = codable.value
            if let dict = value as? [String: Any], !dict.isEmpty {
                let keys = Array(dict.keys)
                let allLocale = keys.allSatisfy { k in
                    guard let regex = localePattern else { return false }
                    let range = NSRange(k.startIndex..., in: k)
                    return regex.firstMatch(in: k, range: range) != nil
                }
                if allLocale {
                    if let localized = dict[locale] {
                        localizedState[key] = localized
                    } else if let fallbackVal = dict[fallback] {
                        localizedState[key] = fallbackVal
                    } else if let first = keys.first, let firstVal = dict[first] {
                        localizedState[key] = firstVal
                    } else {
                        localizedState[key] = value
                    }
                } else {
                    localizedState[key] = value
                }
            } else {
                localizedState[key] = value
            }
        }

        return FoodBlock.create(type: block.type, state: localizedState, refs: block.refs.mapValues { $0.value })
    }
}
