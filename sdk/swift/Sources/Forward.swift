import Foundation

/// FoodBlock Forward Traversal — downstream graph navigation.
///
/// While `FoodBlockChain.chain()` follows refs backwards (provenance),
/// `FoodBlockForward.forward()` follows refs forward (impact). Essential for
/// recall operations: "which products used this contaminated ingredient?"

public enum FoodBlockForward {

    // MARK: - Result Types

    /// A block that references the searched hash, paired with the ref role used.
    public struct ReferencingEntry {
        public let block: FoodBlock
        public let role: String
    }

    /// Result of a forward lookup: all blocks referencing a given hash.
    public struct ForwardResult {
        public let referencing: [ReferencingEntry]
        public let count: Int
    }

    /// Result of a recall traversal: all affected blocks downstream of a source.
    public struct RecallResult {
        public let affected: [FoodBlock]
        public let depth: Int
        public let paths: [[String]]
    }

    // MARK: - Forward

    /// Find all blocks that reference a given hash in any ref field.
    ///
    /// - Parameters:
    ///   - hash: The 64-character hex hash to search for.
    ///   - resolveForward: Async function that returns all blocks referencing a given hash.
    /// - Returns: A `ForwardResult` with referencing blocks and count.
    public static func forward(
        hash: String,
        resolveForward: @escaping (String) async -> [FoodBlock]
    ) async -> ForwardResult {
        let blocks = await resolveForward(hash)

        var referencing: [ReferencingEntry] = []

        for block in blocks {
            for (role, ref) in block.refs {
                let hashes: [String]
                if let s = ref.value as? String {
                    hashes = [s]
                } else if let arr = ref.value as? [Any] {
                    hashes = arr.compactMap { $0 as? String }
                } else {
                    continue
                }

                if hashes.contains(hash) {
                    referencing.append(ReferencingEntry(block: block, role: role))
                }
            }
        }

        return ForwardResult(referencing: referencing, count: referencing.count)
    }

    // MARK: - Recall

    /// Trace a contamination/recall path downstream.
    ///
    /// Starting from a source block (e.g., contaminated ingredient), follow all
    /// forward references recursively using BFS to find every affected block.
    ///
    /// - Parameters:
    ///   - sourceHash: The contaminated/recalled block hash.
    ///   - resolveForward: Async function that returns blocks referencing a given hash.
    ///   - maxDepth: Maximum traversal depth (default 50).
    ///   - types: Optional type filter. Supports wildcards: "substance.*" matches "substance.product".
    ///   - roles: Optional ref role filter. Only follow connections through these roles.
    /// - Returns: A `RecallResult` with affected blocks, max depth reached, and traversal paths.
    public static func recall(
        sourceHash: String,
        resolveForward: @escaping (String) async -> [FoodBlock],
        maxDepth: Int = 50,
        types: [String]? = nil,
        roles: [String]? = nil
    ) async -> RecallResult {
        var visited = Set<String>()
        var affected: [FoodBlock] = []
        var maxDepthReached = 0
        var paths: [[String]] = []

        // BFS queue entries
        struct QueueEntry {
            let hash: String
            let depth: Int
            let path: [String]
        }

        var queue: [QueueEntry] = [QueueEntry(hash: sourceHash, depth: 0, path: [sourceHash])]
        visited.insert(sourceHash)

        while !queue.isEmpty {
            let entry = queue.removeFirst()

            if entry.depth >= maxDepth { continue }

            let blocks = await resolveForward(entry.hash)

            for block in blocks {
                if block.hash.isEmpty { continue }
                if visited.contains(block.hash) { continue }

                // Determine which ref roles connect this block to the current hash
                var matchingRoles: [String] = []
                for (role, ref) in block.refs {
                    let hashes: [String]
                    if let s = ref.value as? String {
                        hashes = [s]
                    } else if let arr = ref.value as? [Any] {
                        hashes = arr.compactMap { $0 as? String }
                    } else {
                        continue
                    }
                    if hashes.contains(entry.hash) {
                        matchingRoles.append(role)
                    }
                }

                // Filter by roles if specified
                if let roles = roles, !matchingRoles.isEmpty {
                    let hasMatchingRole = matchingRoles.contains { r in roles.contains(r) }
                    if !hasMatchingRole { continue }
                }

                // Filter by types if specified (supports wildcards like "substance.*")
                if let types = types {
                    let matchesType = types.contains { t in
                        if t.hasSuffix(".*") {
                            let prefix = String(t.dropLast(1)) // drop the "*", keep the "."
                            return block.type.hasPrefix(prefix)
                        }
                        return block.type == t
                    }
                    if !matchesType { continue }
                }

                visited.insert(block.hash)

                let blockPath = entry.path + [block.hash]
                let currentDepth = entry.depth + 1

                if currentDepth > maxDepthReached {
                    maxDepthReached = currentDepth
                }

                affected.append(block)
                paths.append(blockPath)

                queue.append(QueueEntry(hash: block.hash, depth: currentDepth, path: blockPath))
            }
        }

        return RecallResult(affected: affected, depth: maxDepthReached, paths: paths)
    }

    // MARK: - Downstream

    /// Find all downstream products of a given input.
    ///
    /// Convenience wrapper around `recall()` that filters for substance.* types by default.
    ///
    /// - Parameters:
    ///   - ingredientHash: Hash of the ingredient to trace downstream.
    ///   - resolveForward: Async function that returns blocks referencing a given hash.
    ///   - types: Block types to include. Defaults to `["substance.*"]`.
    /// - Returns: Array of substance blocks that use this ingredient (directly or indirectly).
    public static func downstream(
        ingredientHash: String,
        resolveForward: @escaping (String) async -> [FoodBlock],
        types: [String]? = nil
    ) async -> [FoodBlock] {
        let result = await recall(
            sourceHash: ingredientHash,
            resolveForward: resolveForward,
            types: types ?? ["substance.*"]
        )
        return result.affected
    }
}
