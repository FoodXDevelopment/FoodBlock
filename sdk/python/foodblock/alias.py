"""
Alias registry — maps human-readable names to block hashes.
Aliases let non-technical users reference blocks by name instead of hash.

Usage:
    reg = registry()
    farm = reg.create('actor.producer', {'name': 'Green Acres'}, alias='farm')
    wheat = reg.create('substance.ingredient', {'name': 'Wheat'}, {'source': '@farm'})
    # '@farm' resolves to farm['hash']
"""

from .block import create, update


class Registry:
    def __init__(self):
        self._aliases = {}

    def set(self, alias, hash_val):
        """Register an alias for a hash."""
        self._aliases[alias] = hash_val
        return self

    def resolve(self, alias_or_hash):
        """Resolve @alias to hash. Pass-through for raw hashes."""
        if isinstance(alias_or_hash, str) and alias_or_hash.startswith('@'):
            name = alias_or_hash[1:]
            if name not in self._aliases:
                raise ValueError(f'FoodBlock: unresolved alias "@{name}"')
            return self._aliases[name]
        return alias_or_hash

    def resolve_refs(self, refs):
        """Resolve all @aliases in a refs dict."""
        resolved = {}
        for key, value in refs.items():
            if isinstance(value, list):
                resolved[key] = [self.resolve(v) for v in value]
            else:
                resolved[key] = self.resolve(value)
        return resolved

    def create(self, type, state=None, refs=None, alias=None):
        """Create a block, resolving @aliases in refs. Optionally register alias."""
        resolved_refs = self.resolve_refs(refs or {})
        block = create(type, state or {}, resolved_refs)
        if alias:
            self._aliases[alias] = block['hash']
        return block

    def update(self, previous_hash, type, state=None, refs=None, alias=None):
        """Create an update block, resolving @aliases."""
        resolved_prev = self.resolve(previous_hash)
        resolved_refs = self.resolve_refs(refs or {})
        block = update(resolved_prev, type, state or {}, resolved_refs)
        if alias:
            self._aliases[alias] = block['hash']
        return block

    @property
    def aliases(self):
        return dict(self._aliases)

    def has(self, alias):
        return alias in self._aliases

    @property
    def size(self):
        return len(self._aliases)


def registry():
    """Create a new alias registry."""
    return Registry()
