import Foundation

// MARK: - FoodBlockURI

/// FoodBlock URI scheme: `fb:<hash>` or `fb:<type>/<alias>`
///
/// Usage:
///   FoodBlockURI.toURI(block)                     // "fb:a1b2c3..."
///   FoodBlockURI.toURI(block, alias: "sourdough") // "fb:substance.product/sourdough"
///   FoodBlockURI.toURI(hash: "a1b2c3...")         // "fb:a1b2c3..."
///   try FoodBlockURI.fromURI("fb:a1b2c3...")      // URIResult(hash: "a1b2c3...", type: nil, alias: nil)
///   try FoodBlockURI.fromURI("fb:substance.product/sourdough")
///     // URIResult(hash: nil, type: "substance.product", alias: "sourdough")
public enum FoodBlockURI {

    /// The URI scheme prefix.
    public static let prefix = "fb:"

    // MARK: - Types

    /// Result of parsing a FoodBlock URI.
    public struct URIResult {
        /// Block hash (present for hash-based URIs).
        public let hash: String?
        /// Block type (present for named URIs like `fb:substance.product/sourdough`).
        public let type: String?
        /// Alias name (present for named URIs).
        public let alias: String?

        public init(hash: String? = nil, type: String? = nil, alias: String? = nil) {
            self.hash = hash
            self.type = type
            self.alias = alias
        }
    }

    /// Errors that can occur during URI parsing.
    public enum URIError: Error, LocalizedError {
        case invalidURI(String)

        public var errorDescription: String? {
            switch self {
            case .invalidURI(let message):
                return message
            }
        }
    }

    // MARK: - toURI

    /// Convert a FoodBlock to a FoodBlock URI.
    /// If an alias is provided and the block has a type, produces a named URI (`fb:type/alias`).
    /// Otherwise produces a hash URI (`fb:<hash>`).
    ///
    /// - Parameters:
    ///   - block: The FoodBlock to convert.
    ///   - alias: Optional alias for a named URI.
    /// - Returns: A `fb:` URI string.
    public static func toURI(_ block: FoodBlock, alias: String? = nil) -> String {
        if let alias = alias {
            return "\(prefix)\(block.type)/\(alias)"
        }
        return "\(prefix)\(block.hash)"
    }

    /// Convert a raw hash to a FoodBlock URI.
    ///
    /// - Parameter hash: A 64-character lowercase hex hash string.
    /// - Returns: A `fb:` URI string.
    public static func toURI(hash: String) -> String {
        return "\(prefix)\(hash)"
    }

    // MARK: - fromURI

    /// Parse a FoodBlock URI string.
    ///
    /// Supports two formats:
    /// - Hash URI: `fb:<64-char-hex-hash>` produces a URIResult with `hash` set.
    /// - Named URI: `fb:<type>/<alias>` produces a URIResult with `type` and `alias` set.
    ///
    /// A named URI is detected when the body contains a "/" after a "." (indicating a dotted type).
    ///
    /// - Parameter uri: A `fb:` URI string.
    /// - Throws: `URIError.invalidURI` if the string does not start with `fb:`.
    /// - Returns: A URIResult with the parsed components.
    public static func fromURI(_ uri: String) throws -> URIResult {
        guard uri.hasPrefix(prefix) else {
            throw URIError.invalidURI("FoodBlock: invalid URI, must start with \"\(prefix)\"")
        }

        let body = String(uri.dropFirst(prefix.count))

        // Check if it's a named URI: type/alias
        // A named URI has a "/" and a "." appears before the "/"
        if let slashIdx = body.firstIndex(of: "/"),
           let dotIdx = body.firstIndex(of: "."),
           dotIdx < slashIdx {
            let type = String(body[body.startIndex..<slashIdx])
            let alias = String(body[body.index(after: slashIdx)...])
            return URIResult(type: type, alias: alias)
        }

        // Hash URI
        return URIResult(hash: body)
    }
}
