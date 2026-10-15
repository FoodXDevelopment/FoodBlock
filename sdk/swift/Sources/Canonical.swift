import Foundation
import CryptoKit

// The canonical form (spec/canonical.md): the bytes a block's hash and signature cover. Keys sorted by UTF-16 code
// units at every level, no whitespace, numbers as JavaScript writes them, strings in NFC, string arrays inside any
// `refs` object sorted (set semantics), nulls omitted (inside arrays too).
extension FoodBlock {
    /// The canonical UTF-8 string of `{ type, state, refs }`.
    public static func canonical(_ type: String, _ state: JSON, _ refs: JSON) throws -> String {
        try canonicalJSON(["type": type, "state": state, "refs": refs])
    }

    /// A signed message part's canonical JSON, by the same rules.
    public static func canonicalJSON(_ value: Any) throws -> String {
        var out = ""
        try write(value, inRefs: false, into: &out)
        return out
    }

    static func sha256Hex(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    static func sha256Hex(_ text: String) -> String { sha256Hex(Data(text.utf8)) }

    private static func write(_ value: Any, inRefs: Bool, into out: inout String) throws {
        if value is NSNull { out += "null"; return }
        if isBool(value) { out += truthy(value) ? "true" : "false"; return }
        if let n = numberOf(value) { out += try numberString(n); return }
        if let s = value as? String { writeString(s, into: &out); return }
        if let arr = value as? [Any] {
            var items = arr
            if inRefs, let strings = arr as? [String] { items = strings.sorted(by: jsLess) }
            out += "["
            var first = true
            for item in items where !(item is NSNull) {
                if !first { out += "," }
                first = false
                try write(item, inRefs: inRefs, into: &out)
            }
            out += "]"
            return
        }
        if let dict = value as? JSON {
            out += "{"
            var first = true
            for key in dict.keys.sorted(by: jsLess) {
                guard let v = dict[key], !(v is NSNull) else { continue }
                if !first { out += "," }
                first = false
                writeString(key, into: &out)
                out += ":"
                try write(v, inRefs: inRefs || key == "refs", into: &out)
            }
            out += "}"
            return
        }
        throw FoodBlockError.invalid("FoodBlock: unsupported value \(type(of: value))")
    }

    /// ECMAScript Number::toString.
    static func numberString(_ n: Double) throws -> String {
        guard n.isFinite else { throw FoodBlockError.invalid("FoodBlock: Infinity and NaN are not allowed") }
        if n == 0 { return "0" }
        let sign = n < 0 ? "-" : ""
        // Swift's description is the shortest round-trip form: "0.0001", "1e-07", "1e+20", "100.0".
        let text = "\(abs(n))"
        let parts = text.split(separator: "e", maxSplits: 1).map(String.init)
        var exp = parts.count > 1 ? Int(parts[1].replacingOccurrences(of: "+", with: ""))! : 0
        let mant = parts[0].split(separator: ".", maxSplits: 1).map(String.init)
        let intPart = mant[0], frac = mant.count > 1 ? mant[1] : ""
        exp += intPart.count
        var digits = Array(intPart + frac)
        while digits.first == "0" { digits.removeFirst(); exp -= 1 }
        while digits.last == "0" { digits.removeLast() }
        let s = String(digits), k = digits.count, point = exp
        if k <= point && point <= 21 { return sign + s + String(repeating: "0", count: point - k) }
        if 0 < point && point <= 21 { return sign + String(digits[..<point]) + "." + String(digits[point...]) }
        if -6 < point && point <= 0 { return sign + "0." + String(repeating: "0", count: -point) + s }
        let e = point - 1
        return sign + String(digits[0]) + (k > 1 ? "." + String(digits[1...]) : "") + "e" + (e < 0 ? "-" : "+") + String(abs(e))
    }

    /// JSON.stringify of the NFC string: UTF-8 kept, only quotes, backslashes and controls escaped.
    private static func writeString(_ s: String, into out: inout String) {
        out += "\""
        for scalar in s.precomposedStringWithCanonicalMapping.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 { out += String(format: "\\u%04x", scalar.value) } else { out.unicodeScalars.append(scalar) }
            }
        }
        out += "\""
    }

    // ---- A block and its id ----

    /// A block with its hash: `{ hash, type, state, refs }`, nulls dropped. Refs are hashes or lists of hashes.
    public static func create(_ type: String, _ state: JSON = [:], _ refs: JSON = [:]) throws -> JSON {
        let s = omitNulls(state) as! JSON, r = omitNulls(refs) as! JSON
        for (key, value) in r where !(value is String) && !((value as? [Any])?.allSatisfy { $0 is String } ?? false) {
            throw FoodBlockError.invalid("FoodBlock: refs.\(key) must be a string or array of strings")
        }
        return ["hash": try hash(type, s, r), "type": type, "state": s, "refs": r]
    }

    /// The block's id: SHA-256 of its canonical form, 64 lowercase hex.
    public static func hash(_ type: String, _ state: JSON = [:], _ refs: JSON = [:]) throws -> String {
        sha256Hex(try canonical(type, state, refs))
    }
    /// The id of a block given as `{ type, state, refs }`.
    public static func hash(of block: JSON) throws -> String {
        try hash(block["type"] as? String ?? "", obj(block["state"]) ?? [:], obj(block["refs"]) ?? [:])
    }
}
