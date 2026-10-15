import Foundation

/// FoodBlock 1.6 (spec/protocol.md, normative) for Swift: a thin layer over the one Rust core (sdk/rust). Every rule,
/// closed list and grammar lives in that core, which carries spec/protocol.json and spec/aliases.json; this package
/// calls it through `Core`.
public enum FoodBlock {
    static let both = try! Core.json("spec")
    /// spec/protocol.json, as data.
    public static let spec = both["protocol"] as! JSON
    /// spec/aliases.json, as data.
    public static let aliases = both["aliases"] as! JSON

    /// The rules a block is written under: protocol.json `version`.
    public static let version = spec["version"] as! String
    /// The seven 1.6 types, in protocol.json's order.
    public static let types: [String] = (try! Core.ask("types")) as! [String]
    public static let verbs = spec["verbs"] as! [String]
    public static let refKeys = ["who_and_where", "what_and_which", "verbs"].flatMap { (spec["refs"] as! JSON)[$0] as! [String] }
    public static let fields: [String: [String]] = Dictionary(uniqueKeysWithValues: types.map { ($0, (spec["fields"] as! JSON)[$0] as! [String]) })
    public static let profiles = spec["profiles"] as! JSON
    /// protocol.json `refusals.codes`: the groups of codes, in order.
    public static let refusalCodes: [String: [String]] = Dictionary(uniqueKeysWithValues: ((spec["refusals"] as! JSON)["codes"] as! JSON).keys.map {
        ($0, (try! Core.ask("spec_list", "refusals.codes." + $0)) as! [String])
    })
    /// How far a signed message's `at` may be from the node's clock, either way, in ms (limits.signed_window).
    public static let signedWindow: Double = (try? Core.ask("signed_window_ms")) as? Double ?? 300_000
    /// The key names of one message in protocol.json `messages` (pull, push, refusal, ...).
    public static func message(_ name: String) -> [String] { (spec["messages"] as! JSON)[name] as! [String] }
    /// Whether a value is a string matching one of protocol.json's grammars (hash, sign_key, time, duration, ...).
    public static func test(_ name: String, _ value: Any?) -> Bool { Core.bool("grammar", name, value) }
}
