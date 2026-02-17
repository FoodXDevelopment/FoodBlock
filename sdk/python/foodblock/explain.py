"""
Generate human-readable narratives from FoodBlock graphs.

Usage:
    story = await explain(bread_hash, resolve)
    # "Sourdough ($4.50). By Green Acres Bakery. Made from Flour, Water."
"""

import asyncio


async def explain(hash_val, resolve, max_depth=10):
    """
    Generate a narrative for a block and its provenance.

    Args:
        hash_val: Hash of the block to explain
        resolve: async (hash) -> block or None
        max_depth: Maximum traversal depth

    Returns:
        Human-readable string
    """
    block = await resolve(hash_val)
    if not block:
        return f'Block not found: {hash_val}'

    parts = []
    visited = set()
    await _build_narrative(block, resolve, parts, visited, 0, max_depth)
    return ' '.join(parts)


async def _build_narrative(block, resolve, parts, visited, depth, max_depth):
    if not block or depth > max_depth:
        return
    block_hash = block.get('hash', '')
    if block_hash in visited:
        return
    visited.add(block_hash)

    state = block.get('state', {})
    refs = block.get('refs', {})
    name = state.get('name') or state.get('title') or block.get('type', 'Unknown')

    # Describe the block
    if depth == 0:
        desc = name
        if 'price' in state:
            desc += f' (${state["price"]})'
        if 'rating' in state:
            desc += f' ({state["rating"]}/5)'
        parts.append(desc + '.')

    # Actor refs
    for role in ['seller', 'buyer', 'author', 'operator', 'producer']:
        ref_hash = refs.get(role)
        if ref_hash and ref_hash not in visited:
            actor = await resolve(ref_hash)
            if actor and actor.get('state', {}).get('name'):
                visited.add(ref_hash)
                if depth == 0:
                    parts.append(f'By {actor["state"]["name"]}.')

    # Input/source refs
    for role in ['inputs', 'source', 'origin', 'input']:
        if role not in refs:
            continue
        ref_val = refs[role]
        ref_hashes = ref_val if isinstance(ref_val, list) else [ref_val]
        names = []
        for h in ref_hashes:
            dep = await resolve(h)
            if dep and dep.get('state', {}).get('name'):
                dep_desc = dep['state']['name']
                dep_source = (dep.get('refs') or {}).get('seller') or (dep.get('refs') or {}).get('source')
                if dep_source:
                    source_actor = await resolve(dep_source)
                    if source_actor and source_actor.get('state', {}).get('name'):
                        dep_desc += f' ({source_actor["state"]["name"]})'
                names.append(dep_desc)
        if names:
            parts.append(f'Made from {", ".join(names)}.')

    # Certifications
    cert_refs = refs.get('certifications')
    if cert_refs:
        cert_hashes = cert_refs if isinstance(cert_refs, list) else [cert_refs]
        for h in cert_hashes:
            cert = await resolve(h)
            if cert and cert.get('state', {}).get('name'):
                cert_desc = f'Certified: {cert["state"]["name"]}'
                if cert.get('state', {}).get('valid_until'):
                    cert_desc += f' (expires {cert["state"]["valid_until"]})'
                parts.append(cert_desc + '.')

    # Tombstone
    if state.get('tombstoned'):
        parts.append('This block has been erased.')
