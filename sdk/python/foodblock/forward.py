"""
FoodBlock Forward Traversal — downstream graph navigation.

While chain() follows refs backwards (provenance), forward() follows
refs forward (impact). Essential for recall operations: "which products
used this contaminated ingredient?"

Usage:
    result = await forward(wheat_hash, resolve_forward)
    # result = {'referencing': [{'block': {...}, 'role': 'inputs'}, ...], 'count': 3}

    result = await recall(contaminated_hash, resolve_forward)
    # result = {'affected': [...], 'depth': 4, 'paths': [[hash1, hash2, ...], ...]}
"""

from typing import Callable, Optional


async def forward(hash_val: str, resolve_forward: Callable) -> dict:
    """
    Find all blocks that reference a given hash in any ref field.

    Args:
        hash_val: hash to search for
        resolve_forward: async function(hash) -> list of blocks that reference this hash

    Returns:
        {'referencing': [{'block': block, 'role': str}, ...], 'count': int}
    """
    children = await resolve_forward(hash_val)
    referencing = []

    for block in children:
        refs = block.get("refs", {})
        for role, ref in refs.items():
            hashes = ref if isinstance(ref, list) else [ref]
            if hash_val in hashes:
                referencing.append({"block": block, "role": role})

    return {"referencing": referencing, "count": len(referencing)}


async def recall(
    source_hash: str,
    resolve_forward: Callable,
    max_depth: int = 50,
    types: Optional[list] = None,
    roles: Optional[list] = None,
) -> dict:
    """
    Trace a contamination/recall path downstream via BFS.

    Args:
        source_hash: the contaminated/recalled block hash
        resolve_forward: async function(hash) -> list of blocks referencing this hash
        max_depth: maximum traversal depth (default 50)
        types: optional list of type prefixes to filter (e.g. ['substance'])
        roles: optional list of ref roles to filter

    Returns:
        {'affected': [blocks], 'depth': int, 'paths': [[hash, ...], ...]}
    """
    visited = set()
    visited.add(source_hash)
    affected = []
    paths = []
    max_depth_seen = 0

    # BFS queue entries: (hash_to_expand, current_depth, path_so_far)
    queue = [(source_hash, 0, [source_hash])]

    while queue:
        current_hash, depth, path = queue.pop(0)

        if depth >= max_depth:
            continue

        children = await resolve_forward(current_hash)

        for block in children:
            block_hash = block.get("hash")
            if not block_hash or block_hash in visited:
                continue

            # Check which ref roles connect back to current_hash
            refs = block.get("refs", {})
            matched = False
            for role, ref in refs.items():
                hashes = ref if isinstance(ref, list) else [ref]
                if current_hash in hashes:
                    if roles and role not in roles:
                        continue
                    matched = True
                    break

            if not matched:
                continue

            visited.add(block_hash)

            # Apply type prefix filter
            block_type = block.get("type", "")
            if types:
                if not any(block_type.startswith(t) for t in types):
                    # Still traverse through non-matching types to find
                    # matching blocks deeper in the graph
                    new_path = path + [block_hash]
                    next_depth = depth + 1
                    queue.append((block_hash, next_depth, new_path))
                    continue

            new_path = path + [block_hash]
            next_depth = depth + 1

            affected.append(block)
            paths.append(new_path)
            if next_depth > max_depth_seen:
                max_depth_seen = next_depth

            queue.append((block_hash, next_depth, new_path))

    return {"affected": affected, "depth": max_depth_seen, "paths": paths}


async def downstream(
    ingredient_hash: str,
    resolve_forward: Callable,
    max_depth: int = 50,
) -> list:
    """
    Find all downstream substance blocks that use a given ingredient.
    Convenience wrapper around recall() filtering for substance.* types.

    Args:
        ingredient_hash: hash of the ingredient block
        resolve_forward: async function(hash) -> list of blocks referencing this hash
        max_depth: max depth to search

    Returns:
        list of substance blocks
    """
    result = await recall(
        ingredient_hash,
        resolve_forward,
        max_depth=max_depth,
        types=["substance"],
    )
    return result["affected"]
