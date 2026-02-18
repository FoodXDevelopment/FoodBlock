import Foundation

// MARK: - FBResult

/// Result of the fb() natural language entry point.
public struct FBResult {
    public let blocks: [FoodBlock]
    public let primary: FoodBlock
    public let type: String
    public let state: [String: Any]
    public let text: String
}

// MARK: - FoodBlockFB

public enum FoodBlockFB {

    // MARK: - Intent Signals

    private struct Intent {
        let type: String
        let signals: [String]
        let weight: Int
    }

    private static let intents: [Intent] = [
        Intent(type: "actor.agent", signals: [
            "set up an agent", "create an agent", "register an agent", "new agent",
            "agent for", "agent that handles", "agent to handle"
        ], weight: 5),
        Intent(type: "substance.surplus", signals: [
            "left over", "leftover", "surplus", "reduced", "reduced to",
            "selling for", "collect by", "pick up by", "use by today",
            "going spare", "end of day", "waste", "about to expire"
        ], weight: 4),
        Intent(type: "observe.review", signals: [
            "stars", "star", "rated", "rating", "review", "amazing", "terrible", "loved", "hated",
            "best", "worst", "delicious", "disgusting", "fantastic", "awful", "great", "horrible",
            "recommend", "overrated", "underrated", "disappointing", "outstanding", "mediocre",
            "tried", "visited", "went to", "ate at", "dined at"
        ], weight: 2),
        Intent(type: "observe.certification", signals: [
            "certified", "certification", "inspection", "inspected", "passed", "failed",
            "audit", "audited", "compliance", "approved", "accredited", "usda", "fda",
            "haccp", "iso", "organic certified", "grade", "soil association"
        ], weight: 3),
        Intent(type: "observe.reading", signals: [
            "temperature", "temp", "celsius", "fahrenheit", "humidity", "ph",
            "reading", "measured", "sensor", "cooler", "freezer", "thermometer",
            "fridge", "oven", "cold room", "hot hold", "probe"
        ], weight: 3),
        Intent(type: "transfer.order", signals: [
            "ordered", "order", "purchased", "bought", "sold", "invoice",
            "shipped", "delivered", "shipment", "payment", "receipt", "transaction"
        ], weight: 2),
        Intent(type: "transform.process", signals: [
            "baked", "cooked", "fried", "grilled", "roasted", "fermented",
            "brewed", "distilled", "processed", "mixed", "blended", "milled",
            "smoked", "cured", "pickled", "recipe", "preparation",
            "stone-mill", "stone mill", "extraction rate",
            "into", "transform", "converted"
        ], weight: 2),
        Intent(type: "actor.producer", signals: [
            "farm", "ranch", "orchard", "vineyard", "grows", "cultivates", "harvested",
            "harvest", "planted", "acres", "hectares", "acreage", "seasonal",
            "producer", "grower", "farmer", "variety"
        ], weight: 2),
        Intent(type: "actor.venue", signals: [
            "restaurant", "bakery", "cafe", "shop", "store", "market", "bar",
            "deli", "diner", "bistro", "pizzeria", "taqueria", "patisserie",
            "on", "street", "avenue", "located", "downtown", "opens", "closes"
        ], weight: 1),
        Intent(type: "substance.ingredient", signals: [
            "ingredient", "flour", "sugar", "salt", "butter", "milk", "eggs",
            "yeast", "water", "oil", "spice", "herb", "raw material", "grain",
            "wheat", "rice", "corn", "barley", "oats"
        ], weight: 1),
        Intent(type: "substance.product", signals: [
            "bread", "cake", "pizza", "pasta", "cheese", "wine", "beer",
            "chocolate", "coffee", "tea", "juice", "sauce", "jam",
            "product", "item", "sells", "menu", "dish", "$",
            "croissant", "bagel", "muffin", "cookie", "pie", "tart",
            "sourdough", "loaf"
        ], weight: 1),
    ]

    // MARK: - Number Patterns

    private struct NumPattern {
        let pattern: NSRegularExpression
        let field: String
        let unit: String?
        let unitGroup: Int?

        init(_ pattern: String, field: String, unit: String? = nil, unitGroup: Int? = nil) {
            self.pattern = try! NSRegularExpression(pattern: pattern, options: [])
            self.field = field
            self.unit = unit
            self.unitGroup = unitGroup
        }
    }

    private static let numPatterns: [NumPattern] = [
        NumPattern("[$£€]\\s*([\\d,.]+)", field: "price", unit: "USD"),
        NumPattern("([\\d,.]+)\\s*(kg|g|oz|lb|mg|ton)\\b", field: "weight", unitGroup: 2),
        NumPattern("([\\d,.]+)\\s*(ml|l|fl_oz|gal|cup|tbsp|tsp)\\b", field: "volume", unitGroup: 2),
        NumPattern("([\\d,.]+)\\s*°?\\s*(celsius|fahrenheit|kelvin|[CFK])\\b", field: "temperature", unitGroup: 2),
        NumPattern("([\\d,.]+)\\s*(acres?|hectares?)\\b", field: "acreage"),
        NumPattern("([\\d.]+)\\s*(?:/5\\s*)?(?:stars?|star)\\b", field: "rating"),
        NumPattern("\\brated?\\s*([\\d.]+)", field: "rating"),
        NumPattern("\\bscore\\s*([\\d.]+)", field: "score"),
        NumPattern("([\\d,]+)\\s*units?\\b", field: "lot_size"),
    ]

    private static let unitNormalize: [String: String] = [
        "c": "celsius", "f": "fahrenheit", "k": "kelvin",
        "acre": "acres", "hectare": "hectares",
    ]

    // MARK: - fb()

    /// The single natural language entry point to FoodBlock.
    /// Describe food in plain English, get FoodBlocks back.
    ///
    /// - Parameter text: Any food-related natural language text.
    /// - Returns: An FBResult with blocks, primary type, state, and original text.
    public static func fb(_ text: String) -> FBResult {
        let lower = text.lowercased()

        // 1. Score intents
        var scores: [(type: String, score: Int)] = []
        for intent in intents {
            var score = 0
            for signal in intent.signals {
                if lower.contains(signal) {
                    score += intent.weight
                }
            }
            if score > 0 {
                scores.append((intent.type, score))
            }
        }
        scores.sort { $0.score > $1.score }

        let primaryType = scores.first?.type ?? "substance.product"

        // 2. Extract name
        let name = extractName(text, type: primaryType)

        // 3. Extract numbers and quantities
        var quantities: [String: Any] = [:]
        let nsText = text as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)

        for np in numPatterns {
            let matches = np.pattern.matches(in: text, range: fullRange)
            for match in matches {
                guard match.range(at: 1).location != NSNotFound,
                      let r1 = Range(match.range(at: 1), in: text) else { continue }
                let numStr = String(text[r1]).replacingOccurrences(of: ",", with: "")
                guard let value = Double(numStr) else { continue }

                if let unit = np.unit {
                    quantities[np.field] = ["value": value, "unit": unit]
                } else if let ug = np.unitGroup, ug < match.numberOfRanges,
                          match.range(at: ug).location != NSNotFound,
                          let r2 = Range(match.range(at: ug), in: text) {
                    var rawUnit = String(text[r2]).lowercased()
                    if let normalized = unitNormalize[rawUnit] {
                        rawUnit = normalized
                    }
                    quantities[np.field] = ["value": value, "unit": rawUnit]
                } else {
                    quantities[np.field] = value
                }
            }
        }

        // 4. Extract boolean flags from all vocabularies
        var flags: [String: Any] = [:]
        for (_, vocab) in FoodBlockVocabulary.vocabularies {
            for (fieldName, fieldDef) in vocab.fields {
                if fieldDef.type == "boolean" {
                    for alias in fieldDef.aliases {
                        if lower.contains(alias.lowercased()) {
                            flags[fieldName] = true
                        }
                    }
                }
                if fieldDef.type == "compound" {
                    for alias in fieldDef.aliases {
                        if lower.contains(alias.lowercased()) {
                            if flags[fieldName] == nil {
                                flags[fieldName] = [String: Any]()
                            }
                            if var dict = flags[fieldName] as? [String: Any] {
                                dict[alias.lowercased()] = true
                                flags[fieldName] = dict
                            }
                        }
                    }
                }
            }
        }

        // 5. Build state
        var state: [String: Any] = [:]
        if let name = name, !name.isEmpty {
            state["name"] = name
        }
        for (field, val) in quantities {
            state[field] = val
        }
        for (field, val) in flags {
            state[field] = val
        }

        // Type-specific enrichment
        if primaryType == "observe.review" {
            state["text"] = text
        }
        if primaryType == "observe.reading" {
            let locPattern = try? NSRegularExpression(pattern: "(?i)\\b(?:in|at)\\s+(?:the\\s+)?(.+?)(?:\\s*[,.]|$)")
            if let regex = locPattern,
               let match = regex.firstMatch(in: text, range: fullRange),
               match.range(at: 1).location != NSNotFound,
               let r = Range(match.range(at: 1), in: text) {
                let loc = String(text[r]).trimmingCharacters(in: .whitespaces)
                if loc.count > 1 && loc.count < 50 {
                    state["location"] = loc
                }
            }
        }
        if primaryType == "actor.producer" {
            let growsPattern = try? NSRegularExpression(pattern: "(?i)\\b(?:grows?|cultivates?|produces?)\\s+(.+?)(?:\\s*[,.]|\\s+in\\s+|\\s+on\\s+|$)")
            if let regex = growsPattern,
               let match = regex.firstMatch(in: text, range: fullRange),
               match.range(at: 1).location != NSNotFound,
               let r = Range(match.range(at: 1), in: text) {
                state["crop"] = String(text[r]).trimmingCharacters(in: .whitespaces)
            }
            if let acreage = quantities["acreage"] as? [String: Any], let value = acreage["value"] {
                state["acreage"] = value
            }
            let regionPattern = try? NSRegularExpression(pattern: "\\bin\\s+([A-Z][A-Za-z\\s]+?)(?:\\s*[,.]|$)")
            if let regex = regionPattern,
               let match = regex.firstMatch(in: text, range: fullRange),
               match.range(at: 1).location != NSNotFound,
               let r = Range(match.range(at: 1), in: text) {
                state["region"] = String(text[r]).trimmingCharacters(in: .whitespaces)
            }
        }

        // 6. Create primary block
        let refs: [String: Any] = [:]
        let primary = FoodBlock.create(type: primaryType, state: state, refs: refs)
        let blocks = [primary]

        return FBResult(
            blocks: blocks,
            primary: primary,
            type: primaryType,
            state: state,
            text: text
        )
    }

    // MARK: - Private Helpers

    private static func extractName(_ text: String, type: String) -> String? {
        if type == "observe.review" {
            let atPattern = try? NSRegularExpression(pattern: "(?i)\\bat\\s+([A-Z][A-Za-z\\s']+)")
            let nsText = text as NSString
            let range = NSRange(location: 0, length: nsText.length)
            if let regex = atPattern,
               let match = regex.firstMatch(in: text, range: range),
               match.range(at: 1).location != NSNotFound,
               let r = Range(match.range(at: 1), in: text) {
                return String(text[r]).trimmingCharacters(in: CharacterSet(charactersIn: ",. "))
            }
        }

        if type == "observe.reading" {
            return nil
        }

        // Try proper noun phrase
        let properPattern = try? NSRegularExpression(pattern: "([A-Z][A-Za-z']+(?:\\s+[A-Z][A-Za-z']+)*(?:'s)?)")
        let nsText = text as NSString
        let range = NSRange(location: 0, length: nsText.length)
        if let regex = properPattern,
           let match = regex.firstMatch(in: text, range: range),
           match.range(at: 1).location != NSNotFound,
           let r = Range(match.range(at: 1), in: text) {
            let candidate = String(text[r]).trimmingCharacters(in: .whitespaces)
            if candidate.count > 2 {
                return candidate
            }
        }

        // Fall back to first segment
        let parts = text.components(separatedBy: CharacterSet(charactersIn: ",$•-—|"))
        if let first = parts.first {
            let seg = first.trimmingCharacters(in: .whitespaces)
            if seg.count < 80 {
                let articlePattern = try? NSRegularExpression(pattern: "(?i)^(a|an|the|my|our)\\s+")
                if let regex = articlePattern {
                    let nsRange = NSRange(seg.startIndex..., in: seg)
                    return regex.stringByReplacingMatches(in: seg, range: nsRange, withTemplate: "")
                        .trimmingCharacters(in: .whitespaces)
                }
                return seg
            }
        }

        if text.count > 50 {
            return String(text.prefix(50)).trimmingCharacters(in: .whitespaces)
        }
        return text.trimmingCharacters(in: .whitespaces)
    }
}
