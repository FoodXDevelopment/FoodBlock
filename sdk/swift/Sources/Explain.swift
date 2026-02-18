import Foundation

// MARK: - FoodBlockExplain

/// Generate human-readable narratives from FoodBlock graphs.
/// Walks the provenance tree and renders a plain-English explanation.
///
/// Usage:
///   let story = await FoodBlockExplain.explain(hash: breadHash, resolve: myResolver)
///   // "Sourdough ($4.50). By Green Acres Bakery. Made from Organic Flour (Stone Mill)."
public enum FoodBlockExplain {

    /// Async resolver: given a hash, returns the FoodBlock or nil.
    public typealias Resolver = (String) async -> FoodBlock?

    // MARK: - Type Labels

    private static let observeLabels: [String: String] = [
        "observe.review": "review",
        "observe.certification": "certified by",
        "observe.inspection": "inspected by",
        "observe.reading": "reading from",
        "observe.scan": "scanned by",
    ]

    // MARK: - Explain

    /// Generate a narrative for a block and its provenance.
    ///
    /// Walks the block's refs (actors, inputs, certifications, update chain)
    /// and produces a plain-English summary of the block's story.
    ///
    /// - Parameters:
    ///   - hash: Hash of the block to explain.
    ///   - resolve: Async function that retrieves a FoodBlock by hash.
    ///   - maxDepth: Maximum depth to traverse (default 10).
    /// - Returns: Human-readable narrative string.
    public static func explain(
        hash: String,
        resolve: @escaping Resolver,
        maxDepth: Int = 10
    ) async -> String {
        guard let block = await resolve(hash) else {
            return "Block not found: \(hash)"
        }

        var parts: [String] = []
        var visited = Set<String>()

        await buildNarrative(
            block: block,
            resolve: resolve,
            parts: &parts,
            visited: &visited,
            depth: 0,
            maxDepth: maxDepth
        )

        return parts.joined(separator: " ")
    }

    // MARK: - Private

    private static func buildNarrative(
        block: FoodBlock,
        resolve: @escaping Resolver,
        parts: inout [String],
        visited: inout Set<String>,
        depth: Int,
        maxDepth: Int
    ) async {
        if visited.contains(block.hash) || depth > maxDepth { return }
        visited.insert(block.hash)

        let name = stateString(block, key: "name")
            ?? stateString(block, key: "title")
            ?? block.type

        // Describe the block itself (only at root depth)
        if depth == 0 {
            var desc = name
            if let price = stateNumber(block, key: "price") {
                desc += " ($\(formatNumber(price)))"
            }
            if let rating = stateNumber(block, key: "rating") {
                desc += " (\(formatNumber(rating))/5)"
            }
            parts.append(desc + ".")
        }

        // Follow key refs to build the story
        let refs = block.refs

        // Actor refs (seller, buyer, author, operator, producer)
        let actorRoles = ["seller", "buyer", "author", "operator", "producer"]
        for role in actorRoles {
            if let refValue = refs[role]?.value as? String {
                if let actor = await resolve(refValue),
                   let actorName = stateString(actor, key: "name"),
                   !visited.contains(actor.hash) {
                    visited.insert(actor.hash)
                    if depth == 0 {
                        parts.append("By \(actorName).")
                    }
                }
            }
        }

        // Input/source refs (provenance)
        let inputRoles = ["inputs", "source", "origin", "input"]
        for role in inputRoles {
            guard let refVal = refs[role]?.value else { continue }
            let refHashes: [String]
            if let s = refVal as? String {
                refHashes = [s]
            } else if let arr = refVal as? [Any] {
                refHashes = arr.compactMap { $0 as? String }
            } else {
                continue
            }

            var names: [String] = []
            for h in refHashes {
                guard let dep = await resolve(h),
                      let depName = stateString(dep, key: "name") else { continue }

                var depDesc = depName

                // Check for source actor on the dependency
                let sourceRoles = ["seller", "source", "producer"]
                for sr in sourceRoles {
                    if let sourceHash = dep.refs[sr]?.value as? String {
                        if let sourceActor = await resolve(sourceHash),
                           let sourceName = stateString(sourceActor, key: "name") {
                            depDesc += " (\(sourceName))"
                            break
                        }
                    }
                }

                names.append(depDesc)
            }

            if !names.isEmpty {
                parts.append("Made from \(names.joined(separator: ", ")).")
            }
        }

        // Certifications
        if let certVal = refs["certifications"]?.value {
            let certHashes: [String]
            if let s = certVal as? String {
                certHashes = [s]
            } else if let arr = certVal as? [Any] {
                certHashes = arr.compactMap { $0 as? String }
            } else {
                certHashes = []
            }

            for h in certHashes {
                guard let cert = await resolve(h),
                      let certName = stateString(cert, key: "name") else { continue }
                var certDesc = "Certified: \(certName)"
                if let validUntil = stateString(cert, key: "valid_until") {
                    certDesc += " (expires \(validUntil))"
                }
                parts.append(certDesc + ".")
            }
        }

        // Update chain — detect price changes
        if let updatesHash = refs["updates"]?.value as? String, !visited.contains(updatesHash) {
            if let prev = await resolve(updatesHash) {
                let prevPrice = stateNumber(prev, key: "price")
                let currPrice = stateNumber(block, key: "price")
                if let pp = prevPrice, let cp = currPrice, pp != cp {
                    parts.append("Updated from $\(formatNumber(pp)).")
                }
            }
        }

        // Tombstone
        if let tombstoned = block.state["tombstoned"]?.value as? Bool, tombstoned {
            parts.append("This block has been erased.")
        }
    }

    // MARK: - Helpers

    /// Extract a string value from block state.
    private static func stateString(_ block: FoodBlock, key: String) -> String? {
        return block.state[key]?.value as? String
    }

    /// Extract a numeric value from block state (handles Int and Double).
    private static func stateNumber(_ block: FoodBlock, key: String) -> Double? {
        let val = block.state[key]?.value
        if let d = val as? Double { return d }
        if let i = val as? Int { return Double(i) }
        return nil
    }

    /// Format a number for display: omit ".0" for whole numbers.
    private static func formatNumber(_ n: Double) -> String {
        if n == n.rounded() && !n.isInfinite && !n.isNaN {
            return String(format: "%.0f", n)
        }
        return String(n)
    }
}
