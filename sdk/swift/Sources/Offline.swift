import Foundation

/// Offline queue for creating FoodBlocks without network connectivity.
/// Blocks are stored locally and synced when connectivity is restored.
/// See Section 5.5 of the whitepaper.
public class OfflineQueue {

    private var _blocks: [FoodBlock] = []

    public init() {}

    // MARK: - Block Creation

    /// Create a block and add it to the offline queue.
    ///
    /// - Parameters:
    ///   - type: The block type (e.g. "substance.product")
    ///   - state: The block's state dictionary
    ///   - refs: The block's refs dictionary
    /// - Returns: The created FoodBlock
    @discardableResult
    public func create(type: String, state: [String: Any] = [:], refs: [String: Any] = [:]) -> FoodBlock {
        let block = FoodBlock.create(type: type, state: state, refs: refs)
        _blocks.append(block)
        return block
    }

    /// Create an update block and add it to the offline queue.
    ///
    /// - Parameters:
    ///   - previousHash: The hash of the block being updated
    ///   - type: The block type
    ///   - state: The new state (full replacement)
    ///   - refs: Additional refs (updates ref is added automatically)
    /// - Returns: The created FoodBlock
    @discardableResult
    public func update(previousHash: String, type: String, state: [String: Any] = [:], refs: [String: Any] = [:]) -> FoodBlock {
        let block = FoodBlock.update(previousHash: previousHash, type: type, state: state, refs: refs)
        _blocks.append(block)
        return block
    }

    // MARK: - Queue Access

    /// Get all queued blocks (returns a copy).
    public var blocks: [FoodBlock] {
        return _blocks
    }

    /// Number of queued blocks.
    public var count: Int {
        return _blocks.count
    }

    // MARK: - Queue Management

    /// Clear the queue (e.g. after successful sync).
    public func clear() {
        _blocks = []
    }

    // MARK: - Topological Sort

    /// Sort blocks in dependency order for sync.
    ///
    /// Blocks that reference other blocks in the queue are placed after their dependencies.
    /// Uses a depth-first topological sort: if block B references block A (via any ref),
    /// then A will appear before B in the result.
    ///
    /// - Returns: Array of FoodBlocks sorted so dependencies come first
    public func sorted() -> [FoodBlock] {
        // Collect all hashes in the queue for fast lookup
        let queueHashes = Set(_blocks.map { $0.hash })

        // Build dependency graph: block hash -> [dependency hashes within the queue]
        var graph: [String: [String]] = [:]
        for block in _blocks {
            var deps: [String] = []
            for (_, refValue) in block.refs {
                let refHashes = extractHashes(from: refValue.value)
                for h in refHashes {
                    if queueHashes.contains(h) {
                        deps.append(h)
                    }
                }
            }
            graph[block.hash] = deps
        }

        // Topological sort via DFS
        var visited = Set<String>()
        var result: [FoodBlock] = []

        // Index blocks by hash for fast lookup
        let blocksByHash: [String: FoodBlock] = Dictionary(
            _blocks.map { ($0.hash, $0) },
            uniquingKeysWith: { first, _ in first }
        )

        func visit(_ hash: String) {
            if visited.contains(hash) { return }
            visited.insert(hash)

            // Visit all dependencies first
            for dep in (graph[hash] ?? []) {
                visit(dep)
            }

            // Add this block after its dependencies
            if let block = blocksByHash[hash] {
                result.append(block)
            }
        }

        // Visit all blocks (order of insertion as tiebreaker)
        for block in _blocks {
            visit(block.hash)
        }

        return result
    }

    // MARK: - Helpers

    /// Extract block hashes from a ref value.
    /// Handles both single string refs and array refs.
    private func extractHashes(from value: Any) -> [String] {
        if let str = value as? String {
            return [str]
        }
        if let arr = value as? [String] {
            return arr
        }
        if let arr = value as? [Any] {
            return arr.compactMap { $0 as? String }
        }
        return []
    }
}
