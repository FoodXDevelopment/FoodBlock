import Foundation

// MARK: - FoodBlockAlias

/// Alias registry — maps human-readable names to block hashes.
/// Aliases let non-technical users reference blocks by name instead of hash.
///
/// Usage:
///   let reg = FoodBlockAlias.registry()
///   let farm = reg.create(type: "actor.producer", state: ["name": "Green Acres"], alias: "farm")
///   let wheat = reg.create(type: "substance.ingredient", state: ["name": "Wheat"], refs: ["source": "@farm"])
///   // "@farm" is resolved to farm.hash before block creation
public enum FoodBlockAlias {

    /// Create a new alias registry.
    public static func registry() -> Registry {
        return Registry()
    }

    // MARK: - Registry

    /// A mutable registry that maps alias names to block hashes.
    /// Supports creating and updating blocks with automatic alias resolution in refs.
    public class Registry {
        private var _aliases: [String: String] = [:]

        public init() {}

        /// Register an alias for a hash.
        @discardableResult
        public func set(alias: String, hash: String) -> Registry {
            _aliases[alias] = hash
            return self
        }

        /// Resolve an alias to a hash.
        /// If the string starts with "@", looks up the alias name (without the "@" prefix).
        /// Throws if an @alias is not found. Passes through raw hashes unchanged.
        public func resolve(_ aliasOrHash: String) -> String {
            if aliasOrHash.hasPrefix("@") {
                let name = String(aliasOrHash.dropFirst())
                guard let hash = _aliases[name] else {
                    fatalError("FoodBlock: unresolved alias \"@\(name)\"")
                }
                return hash
            }
            return aliasOrHash
        }

        /// Resolve all @aliases in a refs dictionary.
        /// Supports both single string values and arrays of strings.
        public func resolveRefs(_ refs: [String: Any]) -> [String: Any] {
            var resolved: [String: Any] = [:]
            for (key, value) in refs {
                if let arr = value as? [String] {
                    resolved[key] = arr.map { resolve($0) }
                } else if let arr = value as? [Any] {
                    resolved[key] = arr.map { item -> Any in
                        if let s = item as? String { return resolve(s) }
                        return item
                    }
                } else if let s = value as? String {
                    resolved[key] = resolve(s)
                } else {
                    resolved[key] = value
                }
            }
            return resolved
        }

        /// Create a block, resolving any @aliases in refs.
        /// Optionally register an alias for the new block.
        ///
        /// - Parameters:
        ///   - type: Block type (e.g. "actor.producer", "substance.product").
        ///   - state: Block state dictionary.
        ///   - refs: Block refs dictionary. Values starting with "@" are resolved to hashes.
        ///   - alias: Optional alias name to register for the new block.
        /// - Returns: The created FoodBlock.
        public func create(
            type: String,
            state: [String: Any] = [:],
            refs: [String: Any] = [:],
            alias: String? = nil
        ) -> FoodBlock {
            let resolvedRefs = resolveRefs(refs)
            let block = FoodBlock.create(type: type, state: state, refs: resolvedRefs)
            if let alias = alias {
                _aliases[alias] = block.hash
            }
            return block
        }

        /// Create an update block, resolving @aliases in both previousHash and refs.
        /// Optionally register an alias for the new block.
        ///
        /// - Parameters:
        ///   - previousHash: Hash or @alias of the block to update.
        ///   - type: Block type.
        ///   - state: New block state (full replacement).
        ///   - refs: Block refs dictionary. Values starting with "@" are resolved.
        ///   - alias: Optional alias name to register for the new block.
        /// - Returns: The created update FoodBlock.
        public func updateBlock(
            previousHash: String,
            type: String,
            state: [String: Any] = [:],
            refs: [String: Any] = [:],
            alias: String? = nil
        ) -> FoodBlock {
            let resolvedPrev = resolve(previousHash)
            let resolvedRefs = resolveRefs(refs)
            let block = FoodBlock.update(previousHash: resolvedPrev, type: type, state: state, refs: resolvedRefs)
            if let alias = alias {
                _aliases[alias] = block.hash
            }
            return block
        }

        /// Get all registered aliases as a dictionary mapping alias name to hash.
        public var aliases: [String: String] {
            return _aliases
        }

        /// Check if an alias exists in the registry.
        public func has(_ alias: String) -> Bool {
            return _aliases[alias] != nil
        }

        /// Get the number of registered aliases.
        public var size: Int {
            return _aliases.count
        }
    }
}
