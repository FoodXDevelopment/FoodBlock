import Foundation

/// A JSON object: a block `{ hash, type, state, refs, signature }`, a message, or any part of one.
public typealias JSON = [String: Any]

public enum FoodBlockError: Error, CustomStringConvertible {
    case invalid(String)
    /// The write check refused a block: one finding per code (protocol.json refusals.codes.block), in its order.
    case refused([FoodBlock.Finding])
    /// A refusal with a code from protocol.json's refusals.codes (a sealed copy's block over the size limit: size_limit).
    case coded(String, String)
    public var description: String {
        switch self {
        case .invalid(let s): return s
        case .refused(let wrong): return "write: refused: " + wrong.map { "\($0.code): \($0.detail)" }.joined(separator: "; ")
        case .coded(_, let s): return s
        }
    }
    /// The refusal code this error carries, if any (the first, for a write refused on several).
    public var code: String? {
        switch self {
        case .invalid: return nil
        case .refused(let wrong): return wrong.first?.code
        case .coded(let code, _): return code
        }
    }
}

// ---- JSON values, read the way JavaScript reads them ----

func isBool(_ value: Any?) -> Bool {
    guard let value = value else { return false }
    if let n = value as? NSNumber { return CFGetTypeID(n) == CFBooleanGetTypeID() }
    return value is Bool
}
/// Any JSON number (never a boolean), as a Double.
func numberOf(_ value: Any?) -> Double? {
    guard let value = value, !isBool(value), !(value is String) else { return nil }
    if let n = value as? NSNumber { return n.doubleValue }
    return nil
}
/// A whole number (JavaScript's Number.isInteger).
func intOf(_ value: Any?) -> Int? {
    guard let d = numberOf(value), d.isFinite, d == d.rounded(.towardZero) else { return nil }
    return Int(exactly: d)
}
func isInteger(_ value: Any?) -> Bool {
    guard let d = numberOf(value) else { return false }
    return d.isFinite && d == d.rounded(.towardZero)
}
/// Present: neither missing nor null.
func has(_ value: Any?) -> Bool { value != nil && !(value is NSNull) }
func obj(_ value: Any?) -> JSON? { value as? JSON }
func str(_ value: Any?) -> String? { value as? String }
func isObject(_ value: Any?) -> Bool { value is JSON }
/// JavaScript truthiness.
func truthy(_ value: Any?) -> Bool {
    guard let value = value, !(value is NSNull) else { return false }
    if isBool(value) { return (value as? Bool) ?? (value as! NSNumber).boolValue }
    if let d = numberOf(value) { return d != 0 && !d.isNaN }
    if let s = value as? String { return !s.isEmpty }
    return true
}
/// A ref as a list of hashes: a set, one hash, or nothing.
func list(_ ref: Any?) -> [String] {
    if let a = ref as? [Any] { return a.compactMap { $0 as? String } }
    if let s = ref as? String, !s.isEmpty { return [s] }
    return []
}
/// A value at a dotted path (`state.terms.quantity`).
func dig(_ value: Any?, _ path: String) -> Any? {
    var at: Any? = value
    for key in path.split(separator: ".", omittingEmptySubsequences: false) {
        guard let o = at as? JSON else { return nil }
        at = o[String(key)]
    }
    return at is NSNull ? nil : at
}
/// JavaScript's string order (UTF-16 code units).
func jsLess(_ a: String, _ b: String) -> Bool { a.utf16.lexicographicallyPrecedes(b.utf16) }
func sortedJS(_ values: [String]) -> [String] { values.sorted(by: jsLess) }
func unique(_ values: [String]) -> [String] {
    var seen = Set<String>(), out: [String] = []
    for v in values where !seen.contains(v) { seen.insert(v); out.append(v) }
    return out
}
/// Two strings that are both present and equal (JavaScript's `a === b` with nothing ever equal to a missing value).
func same(_ a: String?, _ b: String?) -> Bool { a != nil && a == b }
/// A sort that keeps equal items in their order, as JavaScript's does.
func stableSorted<T>(_ items: [T], by less: (T, T) -> Bool) -> [T] {
    items.enumerated().sorted { a, b in less(a.element, b.element) || (!less(b.element, a.element) && a.offset < b.offset) }.map { $0.element }
}

/// A deterministic text of any JSON value, for deep equality: keys sorted, order of arrays kept, null kept.
public func stableJSON(_ value: Any?) -> String {
    guard let value = value else { return "undefined" }
    if value is NSNull { return "null" }
    if isBool(value) { return truthy(value) ? "true" : "false" }
    if let d = numberOf(value) { return d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : "\(d)" }
    if let s = value as? String { return "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }
    if let a = value as? [Any] { return "[" + a.map { stableJSON($0) }.joined(separator: ",") + "]" }
    if let o = value as? JSON { return "{" + o.keys.sorted(by: jsLess).map { stableJSON($0) + ":" + stableJSON(o[$0]) }.joined(separator: ",") + "}" }
    return "\(value)"
}
/// Deep equality of JSON values (assert.deepEqual).
public func sameJSON(_ a: Any?, _ b: Any?) -> Bool { stableJSON(a) == stableJSON(b) }

/// The reader's own clock, as a time.
public func nowISO() -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: Date())
}

// ---- Blocks held, by hash, in the order they came (JavaScript's Map) ----

/// Blocks by hash, kept in the order first seen; a later block with the same hash replaces the earlier in place.
public struct Index {
    public private(set) var keys: [String] = []
    var map: [String: JSON] = [:]
    public init(_ blocks: [JSON] = []) { for b in blocks { add(b) } }
    public mutating func add(_ block: JSON) {
        let h = block["hash"] as? String ?? ""
        if map[h] == nil { keys.append(h) }
        map[h] = block
    }
    public subscript(hash: String?) -> JSON? { hash.flatMap { map[$0] } }
    public func contains(_ hash: String?) -> Bool { hash.map { map[$0] != nil } ?? false }
    public var values: [JSON] { keys.compactMap { map[$0] } }
    public var count: Int { keys.count }
}

