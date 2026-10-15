import Foundation

/// FoodBlock 1.6 (spec/protocol.md, normative) for Swift. Every closed list and grammar is read from
/// spec/protocol.json and every older shape from spec/aliases.json, carried in this package as exact copies
/// (Sources/spec). No list is copied into code.
public enum FoodBlock {
    static func specURL(_ name: String) -> URL? { Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "spec") }
    static func load(_ name: String) -> Any {
        guard let url = specURL(name),
              let data = try? Data(contentsOf: url), let value = try? OrderedReader.read(data) else {
            fatalError("FoodBlock: the package is missing spec/\(name).json")
        }
        return value
    }
    static let protocolOrdered = load("protocol") as! Ordered
    static let aliasesOrdered = load("aliases") as! Ordered

    /// spec/protocol.json, as data.
    public static let spec = plain(protocolOrdered) as! JSON
    /// spec/aliases.json, as data.
    public static let aliases = plain(aliasesOrdered) as! JSON

    /// The rules a block is written under: protocol.json `version`.
    public static let version = spec["version"] as! String
    /// The seven 1.6 types, in protocol.json's order.
    public static let types = (protocolOrdered["types"] as! Ordered).keys
    public static let verbs = spec["verbs"] as! [String]
    /// The shared ref keys every type may use: who and where, what and which, the verbs.
    public static let refKeys = ["who_and_where", "what_and_which", "verbs"].flatMap { (spec["refs"] as! JSON)[$0] as! [String] }
    /// The base fields of each type, until the base schemas are published (§3).
    public static let fields: [String: [String]] = Dictionary(uniqueKeysWithValues: types.map { ($0, (spec["fields"] as! JSON)[$0] as! [String]) })
    public static let profiles = spec["profiles"] as! JSON

    static let answers = spec["answers"] as! [String]
    static let stops = (protocolOrdered["stop"] as! Ordered).keys
    static let grantKinds = spec["grant_kinds"] as! [String]
    static let genesisFields = spec["genesis"] as! [String]
    static let genesisOptional = spec["genesis_optional"] as! [String]
    static let termKeys = spec["terms"] as! [String]
    static let scopeKeys = spec["scope"] as! [String]
    static let lineKeys = spec["line"] as! [String]
    static let schemaKeys = spec["schema"] as! [String]
    static let groundsKeys = spec["grounds"] as! [String]
    static let fieldTypes = spec["field_types"] as! [String]
    static let everyFields = (spec["fields"] as! JSON)["every"] as! [String]
    static let shapes = spec["shapes"] as! JSON
    static func shape(_ name: String) -> [String] { shapes[name] as! [String] }
    static let timeFields = Set(spec["time_fields"] as! [String])
    static let dateFields = Set(spec["date_fields"] as! [String])
    /// protocol.json `refusals.codes`: each group's codes (block, fold, message), in protocol.json's order.
    public static let refusalCodes: [String: [String]] = {
        let codes = (protocolOrdered["refusals"] as! Ordered)["codes"] as! Ordered
        return Dictionary(uniqueKeysWithValues: codes.pairs.map { ($0.0, ($0.1 as! Ordered).keys) })
    }()
    static let limits = spec["limits"] as! JSON
    static let blockBytes = limits["block_bytes"] as! Int
    static let afterHeads = limits["after_heads"] as! Int
    /// How far a signed message's `at` may be from a node's clock, either way (limits.signed_window), in ms.
    public static let signedWindow: Double = parseTime(Grant.addDuration("2000-01-01T00:00:00.000Z", limits["signed_window"]))! - parseTime("2000-01-01T00:00:00.000Z")!
    static let integerMin = numberOf((spec["integers"] as! JSON)["min"])!
    static let integerMax = numberOf((spec["integers"] as! JSON)["max"])!
    static let circleRules = spec["circle"] as! JSON
    static let messages = spec["messages"] as! JSON
    static func message(_ name: String) -> [String] { messages[name] as! [String] }

    static let grammar: [String: NSRegularExpression] = (spec["grammar"] as! JSON).mapValues { try! NSRegularExpression(pattern: $0 as! String) }
    /// Whether a value is a string matching one of protocol.json's grammars (hash, sign_key, time, duration, ...).
    public static func test(_ name: String, _ value: Any?) -> Bool {
        guard let s = value as? String, let re = grammar[name] else { return false }
        return re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }
    static func matches(_ pattern: String, _ value: Any?) -> Bool {
        guard let s = value as? String else { return false }
        return s.range(of: pattern, options: .regularExpression) != nil
    }
}
