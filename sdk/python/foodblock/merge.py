"""
FoodBlock Merge — conflict resolution for forked update chains.

When two parties independently update the same block, the chain forks.
This module detects forks, finds common ancestors, and creates merge blocks
to reconcile the divergent states.

Usage:
    conflict = detect_conflict(hash_a, hash_b, resolve)
    merged = merge(hash_a, hash_b, resolve, strategy='a_wins')
"""

from .block import create


def detect_conflict(hash_a, hash_b, resolve):
    """
    Walk both update chains to find a common ancestor and determine if
    the two hashes represent a conflict (fork).

    Args:
        hash_a: hash of one chain head
        hash_b: hash of the other chain head
        resolve: callable (hash) -> block dict or None

    Returns:
        {
            'is_conflict': bool,
            'common_ancestor': hash_str or None,
            'chain_a': [block, ...] from hash_a back to ancestor,
            'chain_b': [block, ...] from hash_b back to ancestor,
        }
    """
    if hash_a == hash_b:
        block = resolve(hash_a)
        return {
            'is_conflict': False,
            'common_ancestor': hash_a,
            'chain_a': [block] if block else [],
            'chain_b': [block] if block else [],
        }

    chain_a = _walk_chain(hash_a, resolve)
    chain_b = _walk_chain(hash_b, resolve)

    hashes_a = {b['hash'] for b in chain_a}
    hashes_b = {b['hash'] for b in chain_b}

    # Find common ancestor: first hash in chain_a that also appears in chain_b
    common_ancestor = None
    for block in chain_a:
        if block['hash'] in hashes_b:
            common_ancestor = block['hash']
            break

    # If no common ancestor found searching from a, try from b
    if common_ancestor is None:
        for block in chain_b:
            if block['hash'] in hashes_a:
                common_ancestor = block['hash']
                break

    # Trim chains to stop at common ancestor
    trimmed_a = _trim_to_ancestor(chain_a, common_ancestor)
    trimmed_b = _trim_to_ancestor(chain_b, common_ancestor)

    is_conflict = (common_ancestor is not None and
                   hash_a not in hashes_b and
                   hash_b not in hashes_a)

    return {
        'is_conflict': is_conflict,
        'common_ancestor': common_ancestor,
        'chain_a': trimmed_a,
        'chain_b': trimmed_b,
    }


def merge(hash_a, hash_b, resolve, state=None, strategy='manual'):
    """
    Create an observe.merge block to reconcile two forked chains.

    Args:
        hash_a: hash of chain A head
        hash_b: hash of chain B head
        resolve: callable (hash) -> block dict or None
        state: optional explicit merged state dict
        strategy: 'a_wins', 'b_wins', or 'manual'

    Returns:
        An observe.merge FoodBlock dict
    """
    block_a = resolve(hash_a)
    block_b = resolve(hash_b)

    if state is None:
        if strategy == 'a_wins':
            state = dict(block_a.get('state', {})) if block_a else {}
        elif strategy == 'b_wins':
            state = dict(block_b.get('state', {})) if block_b else {}
        elif strategy == 'manual':
            # For manual merges, combine both states (a takes precedence for conflicts)
            state_b = dict(block_b.get('state', {})) if block_b else {}
            state_a = dict(block_a.get('state', {})) if block_a else {}
            state = {**state_b, **state_a}
        else:
            raise ValueError(f"FoodBlock: unknown merge strategy '{strategy}'")

    conflict = detect_conflict(hash_a, hash_b, resolve)

    merge_state = {
        **state,
        '_merge': {
            'strategy': strategy,
            'is_conflict': conflict['is_conflict'],
            'common_ancestor': conflict['common_ancestor'],
        },
    }

    return create('observe.merge', merge_state, {
        'merge_a': hash_a,
        'merge_b': hash_b,
    })


def auto_merge(hash_a, hash_b, resolve, vocabulary=None):
    """
    Automatically merge two forked chains using field-level resolution.

    If a vocabulary is provided, required fields from chain A take precedence,
    and optional fields are merged. Without a vocabulary, falls back to
    combining both states with A winning on conflicts.

    Args:
        hash_a: hash of chain A head
        hash_b: hash of chain B head
        resolve: callable (hash) -> block dict or None
        vocabulary: optional vocabulary block dict for field-aware merging

    Returns:
        An observe.merge FoodBlock dict
    """
    block_a = resolve(hash_a)
    block_b = resolve(hash_b)

    state_a = dict(block_a.get('state', {})) if block_a else {}
    state_b = dict(block_b.get('state', {})) if block_b else {}

    if vocabulary:
        fields = vocabulary.get('state', vocabulary).get('fields', {})
        merged_state = {}

        # Start with all of B's state
        merged_state.update(state_b)

        # Override with A's state
        merged_state.update(state_a)

        # For fields defined in vocabulary, apply smarter merging
        for field_name, field_def in fields.items():
            a_val = state_a.get(field_name)
            b_val = state_b.get(field_name)

            if a_val is not None and b_val is not None:
                # Both have the field — required fields: A wins; optional: prefer non-empty
                if field_def.get('required'):
                    merged_state[field_name] = a_val
                else:
                    # Prefer the more "complete" value
                    merged_state[field_name] = a_val if a_val else b_val
            elif a_val is not None:
                merged_state[field_name] = a_val
            elif b_val is not None:
                merged_state[field_name] = b_val
    else:
        # No vocabulary — simple merge, A wins on conflicts
        merged_state = {**state_b, **state_a}

    return merge(hash_a, hash_b, resolve, state=merged_state, strategy='manual')


def _walk_chain(start_hash, resolve, max_depth=100):
    """Walk an update chain backwards, returning list of blocks."""
    visited = set()
    result = []
    current = start_hash
    depth = 0

    while current and depth < max_depth:
        if current in visited:
            break
        visited.add(current)

        block = resolve(current)
        if not block:
            break

        result.append(block)

        refs = block.get('refs', {})
        updates = refs.get('updates')
        if isinstance(updates, list):
            current = updates[0] if updates else None
        else:
            current = updates

        depth += 1

    return result


def _trim_to_ancestor(chain_blocks, ancestor_hash):
    """Trim a chain to include blocks up to and including the ancestor."""
    if ancestor_hash is None:
        return list(chain_blocks)

    trimmed = []
    for block in chain_blocks:
        trimmed.append(block)
        if block['hash'] == ancestor_hash:
            break
    return trimmed
