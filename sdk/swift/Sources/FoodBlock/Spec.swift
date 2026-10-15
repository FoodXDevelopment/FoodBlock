import Foundation

/// FoodBlock 1.6 (spec/protocol.md, normative) for Swift: a thin layer over the one Rust core (sdk/rust). Every rule,
/// closed list and grammar lives in that core, which carries spec/protocol.json; this package calls it through `Core`.
/// There is no alias table and no reading of an older shape: year zero.
public enum FoodBlock {
    static let both = try! Core.json("spec")
    /// spec/protocol.json, as data.
    public static let spec = both["protocol"] as! JSON

    /// The rules a block is written under: protocol.json `version`.
    public static let version = spec["version"] as! String
    /// The seven 1.6 types, in protocol.json's order.
    public static let types: [String] = (try! Core.ask("types")) as! [String]
    public static let verbs = spec["verbs"] as! [String]
    /// The closed ref names: who_and_where, what_and_which, the verbs and the causal refs.
    public static let refKeys: [String] = ["who_and_where", "what_and_which"].flatMap { (spec["refs"] as! JSON)[$0] as! [String] } + verbs + (spec["causal"] as! [String])
    /// The suites this build knows (core.md, Suites): std, p256, sm.
    public static let suites: [String] = ((spec["suites"] as! JSON).filter { ($0.value as? JSON)?["hash"] != nil }.map { $0.key }).sorted()
    public static let fields: [String: [String]] = Dictionary(uniqueKeysWithValues: types.map { ($0, (spec["fields"] as! JSON)[$0] as! [String]) })
    /// protocol.json `peers`: the sizes of peer (micro, edge, node).
    public static let peers = spec["peers"] as! JSON
    /// protocol.json `refusals.codes`: the groups of codes, in order.
    public static let refusalCodes: [String: [String]] = Dictionary(uniqueKeysWithValues: ((spec["refusals"] as! JSON)["codes"] as! JSON).keys.map {
        ($0, (try! Core.ask("spec_list", "refusals.codes." + $0)) as! [String])
    })
    /// The key names of one message in protocol.json `messages` (pull, push, refusal, ...).
    public static func message(_ name: String) -> [String] { (spec["messages"] as! JSON)[name] as! [String] }
    /// Whether a value is a string matching one of protocol.json's grammars (hash, sign_key, time, duration, ...).
    public static func test(_ name: String, _ value: Any?) -> Bool { Core.bool("grammar", name, value) }
}
