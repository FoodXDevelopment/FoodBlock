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

    private static func canonicalNumber(_ n: Double) -> String {
        if n == 0.0 { return "0" }
        if n == n.rounded(.towardZero) && abs(n) < Double(1 << 53) {
            return "\(Int(n))"
        }
        return "\(n)"
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
