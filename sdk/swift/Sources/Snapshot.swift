import Foundation
import CryptoKit

// MARK: - Types

/// Summary of a block collection, counting blocks by type.
public struct SnapshotSummary {
    /// Total number of blocks.
    public let total: Int
    /// Count of blocks grouped by type.
    public let byType: [String: Int]
}

// MARK: - FoodBlockSnapshot

/// Subgraph summarization for scalability.
/// Creates compact summaries (snapshots) of block collections using Merkle roots.
public enum FoodBlockSnapshot {

    /// Compute SHA-256 hex digest of a UTF-8 string.
    private static func sha256Hex(_ data: String) -> String {
        let digest = SHA256.hash(data: Data(data.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// Compute the Merkle root of an array of block hashes.
    /// Hashes are sorted for deterministic ordering. Pairs are sorted before combining.
    /// Odd nodes are promoted to the next layer.
    ///
    /// - Parameter hashes: Array of hex hash strings.
    /// - Returns: The Merkle root hash.
    private static func computeMerkleRoot(_ hashes: [String]) -> String {
        if hashes.isEmpty { return sha256Hex("") }
        if hashes.count == 1 { return hashes[0] }

        var layer = hashes.sorted()
        while layer.count > 1 {
            var next: [String] = []
            var i = 0
            while i < layer.count {
                if i + 1 < layer.count {
                    let pair = [layer[i], layer[i + 1]].sorted()
                    next.append(sha256Hex(pair[0] + pair[1]))
                } else {
                    next.append(layer[i])
                }
                i += 2
            }
            layer = next
        }
        return layer[0]
    }

    /// Create a snapshot block that summarizes a collection of blocks.
    /// The snapshot contains a Merkle root computed from all block hashes
    /// and the total block count, enabling later verification.
    ///
    /// - Parameters:
    ///   - blocks: Array of FoodBlocks to snapshot (must be non-empty).
    ///   - summary: Optional human-readable summary string.
    ///   - dateRange: Optional date range as [start, end] ISO 8601 strings.
    /// - Returns: An observe.snapshot FoodBlock.
    public static func createSnapshot(
        blocks: [FoodBlock],
        summary: String? = nil,
        dateRange: [String]? = nil
    ) -> FoodBlock {
        precondition(!blocks.isEmpty, "FoodBlock: blocks must be a non-empty array")

        let hashes = blocks.map { $0.hash }
        let merkleRoot = computeMerkleRoot(hashes)

        var state: [String: Any] = [
            "block_count": blocks.count,
            "merkle_root": merkleRoot
        ]

        if let dateRange = dateRange {
            state["date_range"] = dateRange
        }
        if let summary = summary {
            state["summary"] = summary
        }

        return FoodBlock.create(type: "observe.snapshot", state: state, refs: [:])
    }

    /// Verify that a set of blocks matches a snapshot's Merkle root.
    /// Recomputes the Merkle root from the provided blocks and compares
    /// it against the snapshot's stored root and block count.
    ///
    /// - Parameters:
    ///   - snapshot: A snapshot FoodBlock (observe.snapshot).
    ///   - blocks: Array of FoodBlocks to verify against the snapshot.
    /// - Returns: A tuple of (valid: Bool, missing: [String]).
    ///   `valid` is true if the recomputed Merkle root matches and block counts agree.
    ///   `missing` is reserved for identifying missing block hashes (currently empty).
    public static func verifySnapshot(
        snapshot: FoodBlock,
        blocks: [FoodBlock]
    ) -> (valid: Bool, missing: [String]) {
        let expectedRoot = snapshot.state["merkle_root"]?.value as? String
        let expectedCount: Int?
        if let count = snapshot.state["block_count"]?.value as? Int {
            expectedCount = count
        } else if let count = snapshot.state["block_count"]?.value as? Double {
            expectedCount = Int(count)
        } else {
            expectedCount = nil
        }

        guard let root = expectedRoot else {
            return (valid: false, missing: [])
        }

        let hashes = blocks.compactMap { block -> String? in
            block.hash.isEmpty ? nil : block.hash
        }
        let actualRoot = computeMerkleRoot(hashes)

        let valid = actualRoot == root && hashes.count == (expectedCount ?? -1)

        return (valid: valid, missing: [])
    }

    /// Produce a summary of a block collection, counting blocks by type.
    ///
    /// - Parameter blocks: Array of FoodBlocks to summarize.
    /// - Returns: A `SnapshotSummary` with total count and per-type breakdown.
    public static func summarize(blocks: [FoodBlock]) -> SnapshotSummary {
        var byType: [String: Int] = [:]
        for block in blocks {
            let type = block.type.isEmpty ? "unknown" : block.type
            byType[type, default: 0] += 1
        }
        return SnapshotSummary(total: blocks.count, byType: byType)
    }
}
