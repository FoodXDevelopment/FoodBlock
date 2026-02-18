import Foundation
import CryptoKit

// MARK: - Types

/// Result of merkle-izing a state object.
public struct MerkleResult {
    /// The Merkle root hash (64-char lowercase hex).
    public let root: String
    /// Mapping from field name to its leaf hash.
    public let leaves: [String: String]
    /// Tree layers from leaves (layer 0) to root (last layer).
    public let tree: [[String]]
}

/// A single entry in a Merkle proof, identifying a sibling hash needed
/// to reconstruct the path from a leaf to the root.
public struct ProofEntry {
    /// The sibling hash at this layer.
    public let hash: String
    /// Position of the sibling relative to the node being verified: "left" or "right".
    public let position: String
    /// The tree layer index (0 = leaf layer).
    public let layer: Int
}

/// Result of selective disclosure: disclosed fields, their Merkle proof, and the root.
public struct DisclosureResult {
    /// The disclosed field key-value pairs.
    public let disclosed: [String: Any]
    /// Merkle proof entries (sibling hashes per layer).
    public let proof: [ProofEntry]
    /// The Merkle root hash for verification.
    public let root: String
}

// MARK: - FoodBlockMerkle

/// Merkle-ized state for selective disclosure.
/// Each state field becomes a leaf in a Merkle tree, enabling zero-knowledge
/// proofs of individual fields without revealing the full state.
public enum FoodBlockMerkle {

    /// Compute the SHA-256 hex digest of a UTF-8 string.
    ///
    /// - Parameter data: The input string.
    /// - Returns: A 64-character lowercase hexadecimal hash string.
    public static func sha256Hex(_ data: String) -> String {
        let digest = SHA256.hash(data: Data(data.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// Produce a canonical string representation of a value for hashing.
    /// Objects are serialized with sorted keys; primitives use their string form.
    ///
    /// - Parameter value: Any value to canonicalize.
    /// - Returns: A deterministic string representation.
    public static func canonicalValue(_ value: Any) -> String {
        if value is NSNull { return "null" }
        if let dict = value as? [String: Any] {
            let sortedKeys = dict.keys.sorted()
            var parts: [String] = []
            for key in sortedKeys {
                let valStr: String
                if let v = dict[key] {
                    valStr = canonicalValue(v)
                } else {
                    valStr = "null"
                }
                parts.append("\"\(escapeJSONString(key))\":\(valStr)")
            }
            return "{\(parts.joined(separator: ","))}"
        }
        if let arr = value as? [Any] {
            let parts = arr.map { canonicalValue($0) }
            return "[\(parts.joined(separator: ","))]"
        }
        if let str = value as? String {
            return "\"\(escapeJSONString(str))\""
        }
        if let bool = value as? Bool {
            return bool ? "true" : "false"
        }
        if let num = value as? Int {
            return "\(num)"
        }
        if let num = value as? Double {
            if num == num.rounded(.towardZero) && abs(num) < Double(1 << 53) {
                return "\(Int(num))"
            }
            return "\(num)"
        }
        if let num = value as? NSNumber {
            if CFBooleanGetTypeID() == CFGetTypeID(num) {
                return num.boolValue ? "true" : "false"
            }
            return "\(num)"
        }
        return "null"
    }

    /// Create a Merkle tree from a state object.
    /// Each key-value pair becomes a leaf: SHA-256(key + ":" + canonical(value)).
    /// Keys are sorted alphabetically. Paired nodes are sorted for determinism.
    /// Odd nodes are promoted to the next layer.
    ///
    /// - Parameter state: The state object to merkle-ize.
    /// - Returns: A `MerkleResult` with root hash, leaf hashes, and all tree layers.
    public static func merkleize(_ state: [String: Any]) -> MerkleResult {
        let keys = state.keys.sorted()
        var leaves: [String: String] = [:]

        for key in keys {
            let value = state[key]!
            leaves[key] = sha256Hex(key + ":" + canonicalValue(value))
        }

        // Build tree layers
        let layer0 = keys.map { leaves[$0]! }
        var tree: [[String]] = [layer0]

        var currentLayer = layer0
        while currentLayer.count > 1 {
            var nextLayer: [String] = []
            var i = 0
            while i < currentLayer.count {
                if i + 1 < currentLayer.count {
                    // Pair two nodes -- sort for deterministic ordering
                    let pair = [currentLayer[i], currentLayer[i + 1]].sorted()
                    nextLayer.append(sha256Hex(pair[0] + pair[1]))
                } else {
                    // Odd node -- promote to next layer
                    nextLayer.append(currentLayer[i])
                }
                i += 2
            }
            tree.append(nextLayer)
            currentLayer = nextLayer
        }

        let root = currentLayer.isEmpty ? sha256Hex("") : currentLayer[0]

        return MerkleResult(root: root, leaves: leaves, tree: tree)
    }

    /// Create a selective disclosure of specific fields with a Merkle proof.
    /// Returns the disclosed field values along with sibling hashes needed
    /// to reconstruct the path from each disclosed leaf to the Merkle root.
    ///
    /// - Parameters:
    ///   - state: The full state object.
    ///   - fieldNames: Names of fields to disclose.
    /// - Returns: A `DisclosureResult` with disclosed values, proof entries, and root.
    public static func selectiveDisclose(state: [String: Any], fieldNames: [String]) -> DisclosureResult {
        let merkle = merkleize(state)

        var disclosed: [String: Any] = [:]
        for name in fieldNames {
            if let value = state[name] {
                disclosed[name] = value
            }
        }

        // Collect proof: sibling hashes needed to reconstruct the root
        let sortedKeys = state.keys.sorted()
        var proof: [ProofEntry] = []

        for name in fieldNames {
            guard let idx = sortedKeys.firstIndex(of: name) else { continue }

            // Walk up the tree collecting sibling nodes
            var currentIdx = idx
            for layer in 0..<(merkle.tree.count - 1) {
                let layerNodes = merkle.tree[layer]
                let siblingIdx = (currentIdx % 2 == 0) ? currentIdx + 1 : currentIdx - 1

                if siblingIdx >= 0 && siblingIdx < layerNodes.count {
                    proof.append(ProofEntry(
                        hash: layerNodes[siblingIdx],
                        position: currentIdx % 2 == 0 ? "right" : "left",
                        layer: layer
                    ))
                }
                // Move to parent index
                currentIdx = currentIdx / 2
            }
        }

        return DisclosureResult(disclosed: disclosed, proof: proof, root: merkle.root)
    }

    /// Verify that disclosed fields and proof reconstruct the given Merkle root.
    /// Recomputes each disclosed field's leaf hash, then walks up the tree
    /// using the proof siblings to check if the result matches the expected root.
    ///
    /// - Parameters:
    ///   - disclosed: Object with disclosed field key-value pairs.
    ///   - proof: Array of `ProofEntry` elements (sibling hashes per layer).
    ///   - root: Expected Merkle root hash.
    /// - Returns: `true` if at least one disclosed field's proof path matches the root.
    public static func verifyProof(disclosed: [String: Any], proof: [ProofEntry], root: String) -> Bool {
        if disclosed.isEmpty {
            return proof.isEmpty && root == sha256Hex("")
        }

        // Recompute leaf hashes for each disclosed field
        let disclosedKeys = disclosed.keys.sorted()

        // Group proof entries by layer
        var byLayer: [Int: [ProofEntry]] = [:]
        for p in proof {
            byLayer[p.layer, default: []].append(p)
        }

        let maxLayer = proof.map { $0.layer }.max() ?? -1

        for key in disclosedKeys {
            var currentHash = sha256Hex(key + ":" + canonicalValue(disclosed[key]!))

            // Make a mutable copy of byLayer for this key's walk
            var layerProofs: [Int: [ProofEntry]] = [:]
            for (layer, entries) in byLayer {
                layerProofs[layer] = entries
            }

            // Walk up layers
            for layer in 0...Swift.max(maxLayer, 0) {
                guard var entries = layerProofs[layer], !entries.isEmpty else { continue }

                let proofEntry = entries.removeFirst()
                layerProofs[layer] = entries

                let pair: [String]
                if proofEntry.position == "right" {
                    pair = [currentHash, proofEntry.hash]
                } else {
                    pair = [proofEntry.hash, currentHash]
                }

                let sorted = pair.sorted()
                currentHash = sha256Hex(sorted[0] + sorted[1])
            }

            if currentHash == root {
                return true
            }
        }

        return false
    }

    // MARK: - Private Helpers

    /// Escape special characters in a JSON string value.
    private static func escapeJSONString(_ str: String) -> String {
        var result = ""
        for char in str {
            switch char {
            case "\"": result += "\\\""
            case "\\": result += "\\\\"
            case "\n": result += "\\n"
            case "\r": result += "\\r"
            case "\t": result += "\\t"
            default: result.append(char)
            }
        }
        return result
    }
}
