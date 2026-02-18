import Foundation

// MARK: - FoodBlockNotation

/// FoodBlock Notation (FBN) — a human-readable text format for FoodBlocks.
///
/// Format: @alias = type { key: value, ... } -> refRole: @target, refRole: @target
///
/// Examples:
///   @farm = actor.producer { name: "Green Acres Farm" }
///   @wheat = substance.ingredient { name: "Organic Wheat" } -> source: @farm
///   @bread = substance.product { name: "Sourdough", price: 4.50 } -> seller: @bakery, inputs: [@flour, @water]
public enum FoodBlockNotation {

    // MARK: - Types

    /// Result of parsing a single FBN line.
    public struct ParsedNotation {
        public let alias: String?
        public let type: String
        public let state: [String: Any]
        public let refs: [String: Any]

        public init(alias: String?, type: String, state: [String: Any], refs: [String: Any]) {
            self.alias = alias
            self.type = type
            self.state = state
            self.refs = refs
        }
    }

    // MARK: - Parse

    /// Parse a single line of FBN into a ParsedNotation.
    /// Returns nil for empty lines and comments (lines starting with # or //).
    /// Refs may contain @alias strings (not yet resolved to hashes).
    ///
    /// - Parameter line: A single line of FBN text.
    /// - Returns: A ParsedNotation, or nil if the line is empty or a comment.
    public static func parse(_ line: String) -> ParsedNotation? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty || trimmed.hasPrefix("#") || trimmed.hasPrefix("//") {
            return nil
        }

        var rest = trimmed
        var alias: String? = nil

        // Extract alias: @name = ...
        let aliasPattern = try! NSRegularExpression(pattern: "^@(\\w+)\\s*=\\s*")
        let aliasRange = NSRange(rest.startIndex..., in: rest)
        if let match = aliasPattern.firstMatch(in: rest, range: aliasRange),
           let nameRange = Range(match.range(at: 1), in: rest) {
            alias = String(rest[nameRange])
            let fullMatchEnd = rest.index(rest.startIndex, offsetBy: match.range.length)
            rest = String(rest[fullMatchEnd...])
        }

        // Extract type: word.word or just word
        let typePattern = try! NSRegularExpression(pattern: "^([\\w.]+)\\s*")
        let typeRange = NSRange(rest.startIndex..., in: rest)
        guard let typeMatch = typePattern.firstMatch(in: rest, range: typeRange),
              let tRange = Range(typeMatch.range(at: 1), in: rest) else {
            return nil
        }
        let type = String(rest[tRange])
        let typeMatchEnd = rest.index(rest.startIndex, offsetBy: typeMatch.range.length)
        rest = String(rest[typeMatchEnd...])

        // Extract state: { ... }
        var state: [String: Any] = [:]
        if rest.hasPrefix("{") {
            if let braceEnd = findClosingBrace(rest, start: 0) {
                let endIdx = rest.index(rest.startIndex, offsetBy: braceEnd + 1)
                let stateStr = String(rest[rest.startIndex..<endIdx])
                state = parseState(stateStr)
                rest = String(rest[endIdx...]).trimmingCharacters(in: .whitespaces)
            }
        }

        // Extract refs: -> key: value, key: value
        var refs: [String: Any] = [:]
        if rest.hasPrefix("->") {
            let arrowEnd = rest.index(rest.startIndex, offsetBy: 2)
            rest = String(rest[arrowEnd...]).trimmingCharacters(in: .whitespaces)
            refs = parseRefs(rest)
        }

        return ParsedNotation(alias: alias, type: type, state: state, refs: refs)
    }

    /// Parse multiple lines of FBN text.
    /// Skips empty lines and comments.
    ///
    /// - Parameter text: Multi-line FBN text.
    /// - Returns: Array of parsed notations.
    public static func parseAll(_ text: String) -> [ParsedNotation] {
        return text.components(separatedBy: "\n")
            .compactMap { parse($0) }
    }

    // MARK: - Format

    /// Format a block as a single line of FBN.
    /// If aliasMap is provided, hashes in refs are replaced with @aliases.
    ///
    /// - Parameters:
    ///   - block: The FoodBlock to format.
    ///   - alias: Optional alias to prepend (e.g. "@farm = ...").
    ///   - aliasMap: Map of alias name to hash, used to reverse-lookup hashes in refs.
    /// - Returns: A single FBN line.
    public static func format(_ block: FoodBlock, alias: String? = nil, aliasMap: [String: String] = [:]) -> String {
        // Build reverse lookup: hash -> alias name
        var hashToAlias: [String: String] = [:]
        for (name, hash) in aliasMap {
            hashToAlias[hash] = name
        }

        var line = ""
        if let alias = alias {
            line += "@\(alias) = "
        }
        line += block.type

        // State
        let stateDict = block.state.mapValues { $0.value }
        if !stateDict.isEmpty {
            line += " " + formatState(stateDict)
        }

        // Refs
        let refsDict = block.refs.mapValues { $0.value }
        if !refsDict.isEmpty {
            var refParts: [String] = []
            for (key, value) in refsDict {
                if let arr = value as? [Any] {
                    let items = arr.map { item -> String in
                        if let s = item as? String, let aliasName = hashToAlias[s] {
                            return "@\(aliasName)"
                        } else if let s = item as? String {
                            return s
                        }
                        return String(describing: item)
                    }
                    refParts.append("\(key): [\(items.joined(separator: ", "))]")
                } else if let s = value as? String {
                    let display = hashToAlias[s].map { "@\($0)" } ?? s
                    refParts.append("\(key): \(display)")
                } else {
                    refParts.append("\(key): \(value)")
                }
            }
            line += " -> " + refParts.joined(separator: ", ")
        }

        return line
    }

    // MARK: - Internal Helpers

    /// Find the index of the closing brace matching the opening brace at `start`.
    private static func findClosingBrace(_ str: String, start: Int) -> Int? {
        var depth = 0
        var inString = false
        var escape = false
        let chars = Array(str)

        for i in start..<chars.count {
            let ch = chars[i]
            if escape { escape = false; continue }
            if ch == "\\" { escape = true; continue }
            if ch == "\"" { inString = !inString; continue }
            if inString { continue }
            if ch == "{" { depth += 1 }
            if ch == "}" {
                depth -= 1
                if depth == 0 { return i }
            }
        }
        return nil
    }

    /// Parse a state string like `{ name: "Green Acres", price: 4.50 }` into a dictionary.
    /// Handles unquoted keys by normalizing to valid JSON.
    private static func parseState(_ str: String) -> [String: Any] {
        // Normalize to valid JSON: add quotes around unquoted keys
        let keyPattern = try! NSRegularExpression(pattern: "(\\{|,)\\s*(\\w+)\\s*:")
        let nsStr = str as NSString
        let range = NSRange(location: 0, length: nsStr.length)
        var json = keyPattern.stringByReplacingMatches(in: str, range: range, withTemplate: "$1\"$2\":")

        // Handle trailing commas
        let trailingComma = try! NSRegularExpression(pattern: ",[ \\t\\n\\r]*\\}")
        let jsonNS = json as NSString
        let jsonRange = NSRange(location: 0, length: jsonNS.length)
        json = trailingComma.stringByReplacingMatches(in: json, range: jsonRange, withTemplate: "}")

        if let data = json.data(using: .utf8),
           let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return result
        }

        // Fallback: try original string as-is (already valid JSON)
        if let data = str.data(using: .utf8),
           let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return result
        }

        return [:]
    }

    /// Parse a refs string like `seller: @bakery, inputs: [@flour, @water]` into a dictionary.
    private static func parseRefs(_ str: String) -> [String: Any] {
        var refs: [String: Any] = [:]
        let parts = splitRefParts(str)

        for part in parts {
            guard let colonIdx = part.firstIndex(of: ":") else { continue }
            let key = String(part[part.startIndex..<colonIdx]).trimmingCharacters(in: .whitespaces)
            var value = String(part[part.index(after: colonIdx)...]).trimmingCharacters(in: .whitespaces)

            if value.hasPrefix("[") {
                // Array ref: strip brackets and split by comma
                value = String(value.dropFirst().dropLast()).trimmingCharacters(in: .whitespaces)
                refs[key] = value.components(separatedBy: ",").map {
                    $0.trimmingCharacters(in: .whitespaces)
                }
            } else {
                refs[key] = value
            }
        }
        return refs
    }

    /// Split ref parts by commas, but not inside brackets.
    private static func splitRefParts(_ str: String) -> [String] {
        var parts: [String] = []
        var current = ""
        var inBracket = false

        for ch in str {
            if ch == "[" { inBracket = true }
            if ch == "]" { inBracket = false }
            if ch == "," && !inBracket {
                parts.append(current)
                current = ""
            } else {
                current.append(ch)
            }
        }
        let trimmed = current.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty {
            parts.append(current)
        }
        return parts
    }

    /// Format a state dictionary as an FBN state string like `{ name: "Green Acres", price: 4.5 }`.
    private static func formatState(_ state: [String: Any]) -> String {
        var parts: [String] = []
        for (key, value) in state {
            parts.append("\(key): \(formatValue(value))")
        }
        return "{ " + parts.joined(separator: ", ") + " }"
    }

    /// Format a single value for FBN output.
    private static func formatValue(_ value: Any) -> String {
        switch value {
        case let s as String:
            // Escape quotes inside strings
            let escaped = s.replacingOccurrences(of: "\"", with: "\\\"")
            return "\"\(escaped)\""
        case let n as Int:
            return String(n)
        case let n as Double:
            // Omit trailing .0 for whole numbers
            if n == n.rounded() && !n.isInfinite && !n.isNaN {
                return String(format: "%.0f", n)
            }
            return String(n)
        case let b as Bool:
            return b ? "true" : "false"
        case let arr as [Any]:
            let items = arr.map { formatValue($0) }
            return "[\(items.joined(separator: ", "))]"
        case let dict as [String: Any]:
            return formatState(dict)
        default:
            return String(describing: value)
        }
    }
}
