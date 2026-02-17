import Foundation

public enum FoodBlockChain {

    public typealias Resolver = (String) async -> FoodBlock?
    public typealias ForwardResolver = (String) async -> [FoodBlock]

    /// Follow the update chain backwards from a block.
    public static func chain(startHash: String, resolve: Resolver, maxDepth: Int = 100) async -> [FoodBlock] {
        var visited = Set<String>()
        var result: [FoodBlock] = []
        var current: String? = startHash
        var depth = 0

        while let hash = current, depth < maxDepth {
            if visited.contains(hash) { break }
            visited.insert(hash)

            guard let block = await resolve(hash) else { break }
            result.append(block)

            if let updates = block.refs["updates"]?.value as? String {
                current = updates
            } else if let updates = block.refs["updates"]?.value as? [Any], let first = updates.first as? String {
                current = first
            } else {
                current = nil
            }
            depth += 1
        }
        return result
    }

    /// Follow ALL refs recursively to build the full provenance tree.
    public static func tree(startHash: String, resolve: Resolver, maxDepth: Int = 20) async -> [String: Any]? {
        var visited = Set<String>()

        func build(_ hash: String, depth: Int) async -> [String: Any]? {
            if depth >= maxDepth || visited.contains(hash) { return nil }
            visited.insert(hash)

            guard let block = await resolve(hash) else { return nil }

            var ancestors: [String: Any] = [:]
            for (role, ref) in block.refs {
                let hashes: [String]
                if let s = ref.value as? String { hashes = [s] }
                else if let arr = ref.value as? [String] { hashes = arr }
                else { continue }

                var subtrees: [[String: Any]] = []
                for h in hashes {
                    if let subtree = await build(h, depth: depth + 1) {
                        subtrees.append(subtree)
                    }
                }
                if subtrees.count == 1 { ancestors[role] = subtrees[0] }
                else if subtrees.count > 1 { ancestors[role] = subtrees }
            }

            return ["block": block, "ancestors": ancestors]
        }

        return await build(startHash, depth: 0)
    }

    /// Find the head (latest version) of an update chain.
    public static func head(startHash: String, resolveForward: ForwardResolver, maxDepth: Int = 1000) async -> String {
        var visited = Set<String>()
        var current = startHash
        var depth = 0

        while depth < maxDepth {
            if visited.contains(current) { break }
            visited.insert(current)

            let children = await resolveForward(current)
            var found = false
            for child in children {
                if let updates = child.refs["updates"]?.value as? String, updates == current {
                    current = child.hash
                    found = true
                    break
                }
            }
            if !found { break }
            depth += 1
        }
        return current
    }
}
