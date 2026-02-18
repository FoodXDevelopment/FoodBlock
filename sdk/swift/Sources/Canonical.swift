import Foundation

/// Produces deterministic JSON for FoodBlock hashing.
public enum Canonical {

    /// Generate canonical JSON string from type, state, and refs.
    public static func canonical(type: String, state: [String: Any], refs: [String: Any]) -> String {
        let obj: [String: Any] = ["type": type, "state": state, "refs": refs]
        return stringify(obj, inRefs: false)
    }

    private static func stringify(_ value: Any, inRefs: Bool) -> String {
        if value is NSNull { return "" }

        if let bool = value as? Bool {
            return bool ? "true" : "false"
        }

        if let num = value as? NSNumber {
            // Check if it's actually a boolean (NSNumber wraps bools)
            if CFBooleanGetTypeID() == CFGetTypeID(num) {
                return num.boolValue ? "true" : "false"
            }
            return canonicalNumber(num.doubleValue)
        }

        if let int = value as? Int {
            return "\(int)"
        }

        if let double = value as? Double {
            return canonicalNumber(double)
        }

        if let str = value as? String {
            let normalized = str.precomposedStringWithCanonicalMapping // NFC
            return escapeJSON(normalized)
        }

        if let arr = value as? [Any] {
            var items: [Any]
            if inRefs, let strArr = arr as? [String] {
                items = strArr.sorted()
            } else {
                items = arr
            }
            let parts = items.compactMap { item -> String? in
                let s = stringify(item, inRefs: inRefs)
                return s.isEmpty ? nil : s
            }
            return "[" + parts.joined(separator: ",") + "]"
        }

        if let dict = value as? [String: Any] {
            let keys = dict.keys.sorted()
            var parts: [String] = []
            for key in keys {
                guard let val = dict[key] else { continue }
                if val is NSNull { continue }
                let childInRefs = inRefs || key == "refs"
                let valStr = stringify(val, inRefs: childInRefs)
                if !valStr.isEmpty {
                    let normalizedKey = key.precomposedStringWithCanonicalMapping
                    parts.append(escapeJSON(normalizedKey) + ":" + valStr)
                }
            }
            return "{" + parts.joined(separator: ",") + "}"
        }

        return ""
    }

    /// Format number per ECMAScript Number::toString (RFC 8785 §3.2.2.3).
    /// Matches JavaScript's String(n) behavior exactly.
    private static func canonicalNumber(_ n: Double) -> String {
        if n == 0.0 { return "0" }
        if n == n.rounded(.towardZero) && abs(n) < Double(1 << 53) {
            return "\(Int(n))"
        }

        // Use repr-like shortest representation via %g, then reformat per ECMAScript rules.
        // Swift's "\(n)" uses scientific notation for small numbers; we must avoid that.
        let repr = "\(n)" // e.g. "1e-06" or "0.123"
        let (sign, absRepr): (String, String) = n < 0
            ? ("-", String(repr.dropFirst()))
            : ("", repr)

        // Parse digits and exponent from the repr
        let digits: String
        let exponent: Int

        if let eIdx = absRepr.lowercased().range(of: "e") {
            // Scientific notation from Swift: e.g. "1e-06", "1.5e+20"
            let mantissa = String(absRepr[absRepr.startIndex..<eIdx.lowerBound])
            let expPart = String(absRepr[eIdx.upperBound...])
            let exp = Int(expPart) ?? 0
            let cleaned = mantissa.replacingOccurrences(of: ".", with: "")
            let dotPos = mantissa.contains(".")
                ? mantissa.distance(from: mantissa.startIndex, to: mantissa.firstIndex(of: ".")!)
                : mantissa.count
            digits = cleaned
            exponent = exp - (cleaned.count - dotPos)
        } else if absRepr.contains(".") {
            // Plain decimal: e.g. "0.123"
            let cleaned = absRepr.replacingOccurrences(of: ".", with: "")
            let dotPos = absRepr.distance(from: absRepr.startIndex, to: absRepr.firstIndex(of: ".")!)
            digits = cleaned
            exponent = -(cleaned.count - dotPos)
        } else {
            digits = absRepr
            exponent = 0
        }

        // Strip leading zeros from digits
        let stripped = String(digits.drop(while: { $0 == "0" }))
        guard !stripped.isEmpty else { return "0" }

        let numDigits = stripped.count
        let nPos = numDigits + exponent  // position of decimal point from left of digit string

        let result: String
        if numDigits <= nPos && nPos <= 21 {
            // Integer-like: pad with trailing zeros
            result = stripped + String(repeating: "0", count: nPos - numDigits)
        } else if 0 < nPos && nPos <= 21 {
            // Decimal notation: split at nPos
            let idx = stripped.index(stripped.startIndex, offsetBy: nPos)
            result = String(stripped[stripped.startIndex..<idx]) + "." + String(stripped[idx...])
        } else if -6 < nPos && nPos <= 0 {
            // Small decimal: 0.000...digits
            result = "0." + String(repeating: "0", count: -nPos) + stripped
        } else {
            // Scientific notation (matches JS format)
            let mantissa: String
            if numDigits == 1 {
                mantissa = stripped
            } else {
                let idx = stripped.index(stripped.startIndex, offsetBy: 1)
                mantissa = String(stripped[stripped.startIndex..<idx]) + "." + String(stripped[idx...])
            }
            let e = nPos - 1
            result = mantissa + (e > 0 ? "e+\(e)" : "e\(e)")
        }

        return sign + result
    }

    private static func escapeJSON(_ str: String) -> String {
        var result = "\""
        for char in str {
            switch char {
            case "\"": result += "\\\""
            case "\\": result += "\\\\"
            case "\n": result += "\\n"
            case "\r": result += "\\r"
            case "\t": result += "\\t"
            default:
                if char.asciiValue != nil || char > "\u{1F}" {
                    result.append(char)
                } else {
                    let scalars = char.unicodeScalars
                    for scalar in scalars {
                        result += String(format: "\\u%04x", scalar.value)
                    }
                }
            }
        }
        result += "\""
        return result
    }
}
