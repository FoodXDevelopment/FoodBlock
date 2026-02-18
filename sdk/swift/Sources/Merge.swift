import Foundation

// MARK: - Types

/// Result of conflict detection between two chain heads.
public struct ConflictResult {
    public let isConflict: Bool
    public let commonAncestor: String?
    public let chainA: [FoodBlock]
    public let chainB: [FoodBlock]
}

/// Errors that can occur during merge operations.
public enum MergeError: Error, CustomStringConvertible {
    case manualMergeRequiresState
    case couldNotResolve(String)
    case unknownStrategy(String)
    case autoMergeConflict(String)
    case unknownFieldStrategy(String, String)

    public var description: String {
        switch self {
        case .manualMergeRequiresState:
            return "FoodBlock: manual merge requires state"
        case .couldNotResolve(let hash):
            return "FoodBlock: could not resolve \(hash)"
        case .unknownStrategy(let strategy):
            return "FoodBlock: unknown merge strategy: \(strategy)"
        case .autoMergeConflict(let field):
            return "FoodBlock: auto-merge conflict on field \"\(field)\" — manual resolution required"
        case .unknownFieldStrategy(let strategy, let field):
            return "FoodBlock: unknown merge strategy \"\(strategy)\" for field \"\(field)\""
        }
    }
}

// MARK: - FoodBlockMerge

/// Fork detection and conflict resolution for forked update chains.
/// Merges turn chains into DAGs.
public enum FoodBlockMerge {

    /// Extract the `updates` ref from a block, handling both String and Array forms.
    private static func updatesRef(from block: FoodBlock) -> String? {
        guard let updates = block.refs["updates"] else { return nil }
        if let str = updates.value as? String {
            return str
        }
        if let arr = updates.value as? [Any], let first = arr.first as? String {
            return first
        }
        return nil
    }

    /// Detect whether two block hashes represent a fork (conflict) in an
    /// update chain by walking both chains backward to find a common ancestor.
    ///
    /// - Parameters:
    ///   - hashA: First chain head hash.
    ///   - hashB: Second chain head hash.
    ///   - resolve: Async function that resolves a hash to a FoodBlock.
    /// - Returns: A `ConflictResult` indicating whether a conflict exists.
    public static func detectConflict(
        hashA: String,
        hashB: String,
        resolve: @escaping (String) async -> FoodBlock?
    ) async -> ConflictResult {
        if hashA == hashB {
            return ConflictResult(isConflict: false, commonAncestor: hashA, chainA: [], chainB: [])
        }

        var chainA: [FoodBlock] = []
        var visitedA = Set<String>()

        // Walk chain A backwards
        var current: String? = hashA
        while let hash = current {
            visitedA.insert(hash)
            guard let block = await resolve(hash) else { break }
            chainA.append(block)
            current = updatesRef(from: block)
        }

        // Walk chain B backwards, looking for intersection with A
        var chainB: [FoodBlock] = []
        var commonAncestor: String? = nil
        current = hashB
        while let hash = current {
            if visitedA.contains(hash) {
                commonAncestor = hash
                break
            }
            guard let block = await resolve(hash) else { break }
            chainB.append(block)
            current = updatesRef(from: block)
        }

        return ConflictResult(
            isConflict: commonAncestor != nil,
            commonAncestor: commonAncestor,
            chainA: chainA,
            chainB: chainB
        )
    }

    /// Create a merge block that resolves a fork between two chain heads.
    ///
    /// - Parameters:
    ///   - hashA: First fork head hash.
    ///   - hashB: Second fork head hash.
    ///   - resolve: Async function that resolves a hash to a FoodBlock.
    ///   - strategy: Merge strategy: "manual", "a_wins", or "b_wins".
    ///   - state: Required when strategy is "manual" — the manually resolved state.
    /// - Returns: An observe.merge FoodBlock.
    /// - Throws: `MergeError` if the strategy is invalid or required data is missing.
    public static func merge(
        hashA: String,
        hashB: String,
        resolve: @escaping (String) async -> FoodBlock?,
        strategy: String = "manual",
        state: [String: Any]? = nil
    ) async throws -> FoodBlock {
        let mergedState: [String: Any]

        switch strategy {
        case "manual":
            guard let manualState = state else {
                throw MergeError.manualMergeRequiresState
            }
            mergedState = manualState

        case "a_wins":
            guard let blockA = await resolve(hashA) else {
                throw MergeError.couldNotResolve("hashA")
            }
            mergedState = blockA.state.mapValues { $0.value }

        case "b_wins":
            guard let blockB = await resolve(hashB) else {
                throw MergeError.couldNotResolve("hashB")
            }
            mergedState = blockB.state.mapValues { $0.value }

        default:
            throw MergeError.unknownStrategy(strategy)
        }

        var finalState: [String: Any] = ["strategy": strategy]
        for (key, value) in mergedState {
            finalState[key] = value
        }

        return FoodBlock.create(
            type: "observe.merge",
            state: finalState,
            refs: ["merges": [hashA, hashB]]
        )
    }

    /// Attempt an automatic merge using vocabulary-defined per-field strategies.
    ///
    /// Supported per-field strategies (from vocabulary fields[key].merge):
    /// - "lww" / "last_writer_wins": prefer value from B (convention: later writer)
    /// - "max": take the greater numeric value
    /// - "min": take the lesser numeric value
    /// - "union": merge arrays, deduplicating values
    /// - "conflict": always raise an error (default when no strategy specified)
    ///
    /// - Parameters:
    ///   - hashA: First fork head hash.
    ///   - hashB: Second fork head hash.
    ///   - resolve: Async function that resolves a hash to a FoodBlock.
    ///   - vocabulary: Optional vocabulary with per-field merge strategies.
    ///                 Expected shape: `["fields": ["fieldName": ["merge": "lww"]]]`
    /// - Returns: An observe.merge FoodBlock with auto-merged state.
    /// - Throws: `MergeError` if a field conflict cannot be resolved.
    public static func autoMerge(
        hashA: String,
        hashB: String,
        resolve: @escaping (String) async -> FoodBlock?,
        vocabulary: [String: Any]? = nil
    ) async throws -> FoodBlock {
        guard let blockA = await resolve(hashA) else {
            throw MergeError.couldNotResolve("hashA")
        }
        guard let blockB = await resolve(hashB) else {
            throw MergeError.couldNotResolve("hashB")
        }

        let stateA = blockA.state.mapValues { $0.value }
        let stateB = blockB.state.mapValues { $0.value }

        // Gather all keys from both states
        let allKeys = Set(Array(stateA.keys) + Array(stateB.keys))
        var mergedState: [String: Any] = [:]

        // Extract fields definition from vocabulary
        let fields: [String: Any]?
        if let vocab = vocabulary {
            if let vocabState = vocab["state"] as? [String: Any],
               let f = vocabState["fields"] as? [String: Any] {
                fields = f
            } else if let f = vocab["fields"] as? [String: Any] {
                fields = f
            } else {
                fields = nil
            }
        } else {
            fields = nil
        }

        for key in allKeys {
            let valA = stateA[key]
            let valB = stateB[key]

            // If values are the same (by canonical JSON comparison), no conflict
            if canonicalEqual(valA, valB) {
                mergedState[key] = valA ?? valB
                continue
            }

            // If only one side has the value, take it
            if valA == nil { mergedState[key] = valB; continue }
            if valB == nil { mergedState[key] = valA; continue }

            // Values differ -- use vocabulary strategy if available
            let fieldDef = (fields?[key] as? [String: Any])
            let mergeStrategy = fieldDef?["merge"] as? String

            guard let strategy = mergeStrategy, strategy != "conflict" else {
                throw MergeError.autoMergeConflict(key)
            }

            switch strategy {
            case "last_writer_wins", "lww":
                // Prefer B (convention: later writer)
                mergedState[key] = valB

            case "max":
                if let numA = asDouble(valA), let numB = asDouble(valB) {
                    mergedState[key] = Swift.max(numA, numB)
                } else {
                    mergedState[key] = valB
                }

            case "min":
                if let numA = asDouble(valA), let numB = asDouble(valB) {
                    mergedState[key] = Swift.min(numA, numB)
                } else {
                    mergedState[key] = valB
                }

            case "union":
                let arrA = asArray(valA)
                let arrB = asArray(valB)
                mergedState[key] = unionArrays(arrA, arrB)

            default:
                throw MergeError.unknownFieldStrategy(strategy, key)
            }
        }

        var finalState: [String: Any] = ["strategy": "auto"]
        for (key, value) in mergedState {
            finalState[key] = value
        }

        return FoodBlock.create(
            type: "observe.merge",
            state: finalState,
            refs: ["merges": [hashA, hashB]]
        )
    }

    // MARK: - Private Helpers

    /// Compare two values for canonical equality using their string representations.
    private static func canonicalEqual(_ a: Any?, _ b: Any?) -> Bool {
        if a == nil && b == nil { return true }
        guard let a = a, let b = b else { return false }
        return canonicalString(a) == canonicalString(b)
    }

    /// Produce a canonical string representation of a value for comparison.
    private static func canonicalString(_ value: Any) -> String {
        if let str = value as? String { return str }
        if let num = value as? Int { return "\(num)" }
        if let num = value as? Double { return "\(num)" }
        if let bool = value as? Bool { return bool ? "true" : "false" }
        if let arr = value as? [Any] {
            let parts = arr.map { canonicalString($0) }
            return "[\(parts.joined(separator: ","))]"
        }
        if let dict = value as? [String: Any] {
            let sorted = dict.keys.sorted().map { key in
                "\(key):\(canonicalString(dict[key]!))"
            }
            return "{\(sorted.joined(separator: ","))}"
        }
        return String(describing: value)
    }

    /// Attempt to extract a Double from any value.
    private static func asDouble(_ value: Any?) -> Double? {
        guard let value = value else { return nil }
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        if let n = value as? NSNumber { return n.doubleValue }
        return nil
    }

    /// Coerce a value into an array. If already an array, return it; otherwise wrap in one.
    private static func asArray(_ value: Any?) -> [Any] {
        guard let value = value else { return [] }
        if let arr = value as? [Any] { return arr }
        return [value]
    }

    /// Union two arrays, deduplicating by canonical string representation.
    private static func unionArrays(_ a: [Any], _ b: [Any]) -> [Any] {
        var seen = Set<String>()
        var result: [Any] = []
        for item in a + b {
            let key = canonicalString(item)
            if !seen.contains(key) {
                seen.insert(key)
                result.append(item)
            }
        }
        return result
    }
}
