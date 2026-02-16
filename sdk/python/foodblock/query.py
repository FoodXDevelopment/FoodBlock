"""
FoodBlock Query Builder

Fluent interface for building queries against a FoodBlock server or resolver.
"""


class Query:
    """
    Fluent query builder for FoodBlock data.

    Usage:
        results = await query(resolver).type('substance.product').where_eq('name', 'Bread').exec()
    """

    def __init__(self, resolve):
        self._resolve = resolve
        self._type = None
        self._refs = {}
        self._state_filters = []
        self._limit_val = 50
        self._offset_val = 0
        self._heads_only = False

    def type(self, t):
        """Filter by block type (exact match or prefix)."""
        self._type = t
        return self

    def by_ref(self, role, hash_):
        """Filter by ref value."""
        self._refs[role] = hash_
        return self

    def where_eq(self, field, value):
        """Filter by state field (equality)."""
        self._state_filters.append({'field': field, 'op': 'eq', 'value': value})
        return self

    def where_lt(self, field, value):
        """Filter by state field (less than)."""
        self._state_filters.append({'field': field, 'op': 'lt', 'value': value})
        return self

    def where_gt(self, field, value):
        """Filter by state field (greater than)."""
        self._state_filters.append({'field': field, 'op': 'gt', 'value': value})
        return self

    def latest(self):
        """Only return head blocks (latest version in each update chain)."""
        self._heads_only = True
        return self

    def limit(self, n):
        """Limit number of results."""
        self._limit_val = n
        return self

    def offset(self, n):
        """Offset results (for pagination)."""
        self._offset_val = n
        return self

    async def exec(self):
        """Execute the query and return results."""
        return await self._resolve({
            'type': self._type,
            'refs': self._refs,
            'state_filters': self._state_filters,
            'limit': self._limit_val,
            'offset': self._offset_val,
            'heads_only': self._heads_only,
        })


def query(resolve):
    """
    Create a new query builder.

    Args:
        resolve: async callable that takes a query dict and returns results

    Returns:
        Query instance with fluent interface
    """
    return Query(resolve)
