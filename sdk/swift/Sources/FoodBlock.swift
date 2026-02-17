import Foundation
import CryptoKit

public let PROTOCOL_VERSION = "0.3.0"

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

    /// Create a tombstone block for content erasure (Section 5.4).
    public static func tombstone(targetHash: String, requestedBy: String, reason: String = "erasure_request") -> FoodBlock {
        return create(
            type: "observe.tombstone",
            state: [
                "reason": reason,
                "requested_by": requestedBy,
                "instance_id": UUID().uuidString.lowercased()
            ],
            refs: [
                "target": targetHash,
                "updates": targetHash
            ]
        )
    }

    /// Create an update by merging changes into previous block's state.
    public static func mergeUpdate(previousBlock: FoodBlock, stateChanges: [String: Any] = [:], additionalRefs: [String: Any] = [:]) -> FoodBlock {
        var merged: [String: Any] = [:]
        for (k, v) in previousBlock.state { merged[k] = v.value }
        for (k, v) in stateChanges { merged[k] = v }
        return update(previousHash: previousBlock.hash, type: previousBlock.type, state: merged, refs: additionalRefs)
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
            } else if let arr = value as? [Any] {
                result[key] = omitNullsArray(arr)
            } else {
                result[key] = value
            }
        }
        return result
    }

    private static func omitNullsArray(_ arr: [Any]) -> [Any] {
        return arr.compactMap { item -> Any? in
            if item is NSNull { return nil }
            if let nested = item as? [String: Any] { return omitNulls(nested) }
            if let nested = item as? [Any] { return omitNullsArray(nested) }
            return item
        }
    }
}

/// Authentication wrapper (Rule 7).
public struct SignedBlock: Codable {
    public let foodblock: FoodBlock
    public let author_hash: String
    public let signature: String
    public let protocol_version: String
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
