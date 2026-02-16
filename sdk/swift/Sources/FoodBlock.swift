import Foundation
import CryptoKit

/// A FoodBlock: the universal food data primitive.
public struct FoodBlock: Codable, Equatable {
    public let hash: String
    public let type: String
    public let state: [String: AnyCodable]
    public let refs: [String: AnyCodable]

    /// Create a new FoodBlock.
    public static func create(
        type: String,
        state: [String: Any] = [:],
        refs: [String: Any] = [:]
    ) -> FoodBlock {
        let cleanState = omitNulls(state)
        let cleanRefs = omitNulls(refs)
        let h = computeHash(type: type, state: cleanState, refs: cleanRefs)

        return FoodBlock(
            hash: h,
            type: type,
            state: cleanState.mapValues { AnyCodable($0) },
            refs: cleanRefs.mapValues { AnyCodable($0) }
        )
    }

    /// Create an update block that supersedes a previous block.
    public static func update(
        previousHash: String,
        type: String,
        state: [String: Any] = [:],
        refs: [String: Any] = [:]
    ) -> FoodBlock {
        var mergedRefs = refs
        mergedRefs["updates"] = previousHash
        return create(type: type, state: state, refs: mergedRefs)
    }

    /// Compute the SHA-256 hash of a FoodBlock's canonical form.
    public static func computeHash(
        type: String,
        state: [String: Any] = [:],
        refs: [String: Any] = [:]
    ) -> String {
        let c = Canonical.canonical(type: type, state: state, refs: refs)
        let data = Data(c.utf8)
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private static func omitNulls(_ dict: [String: Any]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in dict {
            if value is NSNull { continue }
            if let nested = value as? [String: Any] {
                result[key] = omitNulls(nested)
            } else {
                result[key] = value
            }
        }
        return result
    }
}

/// Type-erased Codable wrapper for heterogeneous dictionaries.
public struct AnyCodable: Codable, Equatable {
    public let value: Any

    public init(_ value: Any) {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) { value = str }
        else if let int = try? container.decode(Int.self) { value = int }
        else if let double = try? container.decode(Double.self) { value = double }
        else if let bool = try? container.decode(Bool.self) { value = bool }
        else if let arr = try? container.decode([AnyCodable].self) { value = arr.map(\.value) }
        else if let dict = try? container.decode([String: AnyCodable].self) { value = dict.mapValues(\.value) }
        else { value = NSNull() }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let str as String: try container.encode(str)
        case let int as Int: try container.encode(int)
        case let double as Double: try container.encode(double)
        case let bool as Bool: try container.encode(bool)
        case let arr as [Any]: try container.encode(arr.map { AnyCodable($0) })
        case let dict as [String: Any]: try container.encode(dict.mapValues { AnyCodable($0) })
        default: try container.encodeNil()
        }
    }

    public static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        String(describing: lhs.value) == String(describing: rhs.value)
    }
}
