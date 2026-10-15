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
    if let d = numberOf(value) { return (try? FoodBlock.numberString(d)) ?? "\(d)" }
    if let s = value as? String { return "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }
    if let a = value as? [Any] { return "[" + a.map { stableJSON($0) }.joined(separator: ",") + "]" }
    if let o = value as? JSON { return "{" + o.keys.sorted(by: jsLess).map { stableJSON($0) + ":" + stableJSON(o[$0]) }.joined(separator: ",") + "}" }
    return "\(value)"
}
/// Deep equality of JSON values (assert.deepEqual).
public func sameJSON(_ a: Any?, _ b: Any?) -> Bool { stableJSON(a) == stableJSON(b) }

/// A deep copy with every null dropped.
func omitNulls(_ value: Any) -> Any {
    if let o = value as? JSON {
        var out = JSON()
        for (k, v) in o where !(v is NSNull) { out[k] = omitNulls(v) }
        return out
    }
    if let a = value as? [Any] { return a.filter { !($0 is NSNull) }.map(omitNulls) }
    return value
}

// ---- Bytes ----

extension Data {
    init?(hex: String) {
        guard hex.count % 2 == 0 else { return nil }
        var data = Data(capacity: hex.count / 2)
        var i = hex.startIndex
        while i < hex.endIndex {
            let j = hex.index(i, offsetBy: 2)
            guard let byte = UInt8(hex[i..<j], radix: 16) else { return nil }
            data.append(byte)
            i = j
        }
        self = data
    }
    var hex: String { map { String(format: "%02x", $0) }.joined() }
}

func randomHex(_ count: Int) -> String {
    var bytes = [UInt8](repeating: 0, count: count)
    precondition(SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess)
    return Data(bytes).hex
}

// ---- Times (UTC ISO 8601), read as JavaScript's Date reads them ----

func daysFromCivil(_ y0: Int, _ m: Int, _ d: Int) -> Int {
    let y = m <= 2 ? y0 - 1 : y0
    let era = (y >= 0 ? y : y - 399) / 400
    let yoe = y - era * 400
    let doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146097 + doe - 719468
}
func civilFromDays(_ z0: Int) -> (Int, Int, Int) {
    let z = z0 + 719468
    let era = (z >= 0 ? z : z - 146096) / 146097
    let doe = z - era * 146097
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
    let y = yoe + era * 400
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153
    let d = doy - (153 * mp + 2) / 5 + 1
    let m = mp + (mp < 10 ? 3 : -9)
    return (m <= 2 ? y + 1 : y, m, d)
}
/// Milliseconds since 1970 for `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SS(.sss)Z`; nil where Date.parse gives NaN.
func parseTime(_ text: Any?) -> Double? {
    guard let s = text as? String else { return nil }
    let pattern = "^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\\.([0-9]{1,9}))?)?Z)?$"
    guard let re = try? NSRegularExpression(pattern: pattern),
          let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
    func part(_ i: Int) -> String? { let r = m.range(at: i); return r.location == NSNotFound ? nil : (s as NSString).substring(with: r) }
    let y = Int(part(1)!)!, mo = Int(part(2)!)!, d = Int(part(3)!)!
    let h = Int(part(4) ?? "0")!, mi = Int(part(5) ?? "0")!, sec = Int(part(6) ?? "0")!
    let frac = part(7).map { Int(($0 + "000").prefix(3))! } ?? 0
    guard (1...12).contains(mo), (1...31).contains(d), h <= 24, mi <= 59, sec <= 59 else { return nil }
    if h == 24 && (mi > 0 || sec > 0 || frac > 0) { return nil }
    let days = daysFromCivil(y, mo, d)
    return Double(days) * 86_400_000 + Double(((h * 60 + mi) * 60 + sec) * 1000 + frac)
}
/// A time as `YYYY-MM-DDTHH:MM:SS.sssZ` (Date.prototype.toISOString).
func isoString(_ ms: Double) -> String {
    let total = Int(ms.rounded(.down))
    var days = total / 86_400_000, rest = total % 86_400_000
    if rest < 0 { rest += 86_400_000; days -= 1 }
    let (y, m, d) = civilFromDays(days)
    return String(format: "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ", y, m, d, rest / 3_600_000, rest / 60_000 % 60, rest / 1000 % 60, rest % 1000)
}
/// The reader's own clock, as a time.
public func nowISO() -> String { isoString((Date().timeIntervalSince1970 * 1000).rounded(.down)) }

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

// ---- A JSON reader that keeps the order of keys (spec files: the order of `stop` and of alias rules is meaning) ----

/// A JSON object as written, its keys in order.
final class Ordered {
    var pairs: [(String, Any)] = []
    subscript(key: String) -> Any? { pairs.first { $0.0 == key }?.1 }
    var keys: [String] { pairs.map { $0.0 } }
}
/// The plain value of an ordered one (objects become dictionaries).
func plain(_ value: Any?) -> Any? {
    guard let value = value else { return nil }
    if let o = value as? Ordered { var out = JSON(); for (k, v) in o.pairs { out[k] = plain(v) }; return out }
    if let a = value as? [Any] { return a.map { plain($0)! } }
    return value
}

struct OrderedReader {
    let s: [UInt16]
    var i = 0
    init(_ data: Data) { s = Array(String(decoding: data, as: UTF8.self).utf16) }
    static func read(_ data: Data) throws -> Any {
        var r = OrderedReader(data)
        let v = try r.value()
        return v
    }
    mutating func ws() { while i < s.count, [9, 10, 13, 32].contains(s[i]) { i += 1 } }
    mutating func value() throws -> Any {
        ws()
        guard i < s.count else { throw FoodBlockError.invalid("json: unexpected end") }
        switch s[i] {
        case 123: // {
            i += 1
            let o = Ordered()
            ws()
            if s[i] == 125 { i += 1; return o }
            while true {
                ws()
                let k = try string()
                ws(); i += 1 // :
                o.pairs.append((k, try value()))
                ws()
                if s[i] == 44 { i += 1; continue }
                i += 1 // }
                return o
            }
        case 91: // [
            i += 1
            var a: [Any] = []
            ws()
            if s[i] == 93 { i += 1; return a }
            while true {
                a.append(try value())
                ws()
                if s[i] == 44 { i += 1; continue }
                i += 1
                return a
            }
        case 34: return try string()
        case 116: i += 4; return true
        case 102: i += 5; return false
        case 110: i += 4; return NSNull()
        default:
            let start = i
            while i < s.count, let c = Unicode.Scalar(s[i]), "+-0123456789.eE".unicodeScalars.contains(c) { i += 1 }
            let text = String(decoding: s[start..<i], as: UTF16.self)
            if let n = Int(text) { return NSNumber(value: n) }
            guard let d = Double(text) else { throw FoodBlockError.invalid("json: bad number \(text)") }
            return NSNumber(value: d)
        }
    }
    mutating func string() throws -> String {
        i += 1
        var out: [UInt16] = []
        while s[i] != 34 {
            if s[i] == 92 {
                i += 1
                switch s[i] {
                case 110: out.append(10)
                case 116: out.append(9)
                case 114: out.append(13)
                case 98: out.append(8)
                case 102: out.append(12)
                case 117:
                    let hex = String(decoding: s[(i + 1)...(i + 4)], as: UTF16.self)
                    out.append(UInt16(hex, radix: 16)!)
                    i += 4
                default: out.append(s[i])
                }
                i += 1
            } else { out.append(s[i]); i += 1 }
        }
        i += 1
        return String(decoding: out, as: UTF16.self)
    }
}
