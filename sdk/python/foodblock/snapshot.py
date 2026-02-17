"""
FoodBlock Snapshot — subgraph summarization.

Creates observe.snapshot blocks that capture a Merkle root over a set of
block hashes, enabling efficient verification that a collection of blocks
existed at a point in time.

Usage:
    blocks = [block_a, block_b, block_c]
    snap = create_snapshot(blocks, summary='Weekly bakery batch')
    result = verify_snapshot(snap, blocks)
    assert result['valid']
"""

from datetime import datetime, timezone

from .block import create
from .merkle import merkleize


def create_snapshot(blocks, summary=None, date_range=None):
    """
    Create an observe.snapshot block summarizing a collection of blocks.

    Computes a Merkle root over all block hashes for tamper-evident summarization.

    Args:
        blocks: list of block dicts (each must have 'hash')
        summary: optional human-readable summary string
        date_range: optional dict {'start': iso_str, 'end': iso_str}

    Returns:
        An observe.snapshot FoodBlock dict
    """
    if not blocks or not isinstance(blocks, list):
        raise ValueError("FoodBlock: blocks is required and must be a non-empty list")

    block_hashes = [b['hash'] for b in blocks if b.get('hash')]
    if not block_hashes:
        raise ValueError("FoodBlock: blocks must contain at least one block with a hash")

    # Build a merkle tree over the block hashes
    hash_state = {h: h for h in block_hashes}
    tree = merkleize(hash_state)

    stats = summarize(blocks)

    state = {
        'merkle_root': tree['root'],
        'block_count': len(block_hashes),
        'block_hashes': sorted(block_hashes),
        'by_type': stats['by_type'],
        'created_at': datetime.now(timezone.utc).isoformat(),
    }

    if summary:
        state['summary'] = summary
    if date_range:
        state['date_range'] = date_range

    refs = {'blocks': sorted(block_hashes)}

    return create('observe.snapshot', state, refs)


def verify_snapshot(snapshot, blocks):
    """
    Verify that a snapshot matches a set of blocks.

    Checks that all block hashes listed in the snapshot are present in the
    provided blocks, and that the Merkle root matches.

    Args:
        snapshot: an observe.snapshot block dict
        blocks: list of block dicts to verify against

    Returns:
        {
            'valid': bool,
            'missing': [hashes not found in blocks],
        }
    """
    state = snapshot.get('state', {})
    expected_hashes = set(state.get('block_hashes', []))
    provided_hashes = {b['hash'] for b in blocks if b.get('hash')}

    missing = sorted(expected_hashes - provided_hashes)

    # Recompute merkle root from the provided blocks that match
    matching_blocks = [b for b in blocks if b.get('hash') in expected_hashes]
    if matching_blocks and not missing:
        matching_hashes = [b['hash'] for b in matching_blocks]
        hash_state = {h: h for h in matching_hashes}
        tree = merkleize(hash_state)
        root_matches = tree['root'] == state.get('merkle_root')
    else:
        root_matches = False

    return {
        'valid': len(missing) == 0 and root_matches,
        'missing': missing,
    }


def summarize(blocks):
    """
    Summarize a collection of blocks by type.

    Args:
        blocks: list of block dicts

    Returns:
        {
            'total': int,
            'by_type': {'substance.product': count, ...},
        }
    """
    by_type = {}
    for block in blocks:
        block_type = block.get('type', 'unknown')
        by_type[block_type] = by_type.get(block_type, 0) + 1

    return {
        'total': len(blocks),
        'by_type': by_type,
    }
