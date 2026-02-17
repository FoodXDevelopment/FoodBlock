"""
FoodBlock Merkle — Merkle-ized state for selective disclosure.

Builds a Merkle tree over block state fields, enabling proofs that specific
fields exist without revealing the entire state.

Usage:
    tree = merkleize({'name': 'Bread', 'price': 4.50, 'organic': True})
    proof = selective_disclose({'name': 'Bread', 'price': 4.50, 'organic': True}, ['name', 'price'])
    assert verify_proof(proof['disclosed'], proof['proof'], proof['root'])
"""

import hashlib
import json
import math

from .canonical import canonical


def merkleize(state):
    """
    Build a Merkle tree over the fields of a state dict.

    Each leaf is the SHA-256 hash of the canonical serialization of
    {field_name: field_value}. The tree is built bottom-up by hashing
    pairs of siblings.

    Args:
        state: dict of field names to values

    Returns:
        {
            'root': hex string of the Merkle root,
            'leaves': {field_name: leaf_hash, ...},
            'tree': [[leaf_hashes], [next_layer], ..., [root]],
        }
    """
    if not state or not isinstance(state, dict):
        empty_hash = hashlib.sha256(b'').hexdigest()
        return {'root': empty_hash, 'leaves': {}, 'tree': [[empty_hash]]}

    # Create sorted leaf hashes (sorted by field name for determinism)
    sorted_fields = sorted(state.keys())
    leaves = {}
    leaf_hashes = []

    for field in sorted_fields:
        # Use canonical serialization for the leaf value
        leaf_data = _canonical_leaf(field, state[field])
        leaf_hash = hashlib.sha256(leaf_data.encode('utf-8')).hexdigest()
        leaves[field] = leaf_hash
        leaf_hashes.append(leaf_hash)

    # Build tree layers
    tree = [list(leaf_hashes)]
    current_layer = leaf_hashes

    while len(current_layer) > 1:
        next_layer = []
        for i in range(0, len(current_layer), 2):
            left = current_layer[i]
            # If odd number of nodes, duplicate the last one
            right = current_layer[i + 1] if i + 1 < len(current_layer) else current_layer[i]
            parent = _hash_pair(left, right)
            next_layer.append(parent)
        tree.append(next_layer)
        current_layer = next_layer

    root = current_layer[0] if current_layer else hashlib.sha256(b'').hexdigest()

    return {'root': root, 'leaves': leaves, 'tree': tree}


def selective_disclose(state, field_names):
    """
    Create a selective disclosure proof for specific fields.

    Reveals only the requested fields while providing a Merkle proof
    that they belong to the full state tree.

    Args:
        state: the full state dict
        field_names: list of field names to disclose

    Returns:
        {
            'disclosed': {field: value for requested fields},
            'proof': [sibling_hashes needed to reconstruct root],
            'root': hex string of Merkle root,
        }
    """
    tree_data = merkleize(state)
    disclosed = {f: state[f] for f in field_names if f in state}

    sorted_fields = sorted(state.keys())
    field_indices = {f: i for i, f in enumerate(sorted_fields)}

    # Collect the sibling hashes needed for the proof
    proof = []
    target_indices = set()
    for f in field_names:
        if f in field_indices:
            target_indices.add(field_indices[f])

    # Walk up the tree collecting sibling hashes
    current_indices = target_indices
    for layer_idx in range(len(tree_data['tree']) - 1):
        layer = tree_data['tree'][layer_idx]
        next_indices = set()

        for idx in sorted(current_indices):
            # Find sibling index
            if idx % 2 == 0:
                sibling_idx = idx + 1
            else:
                sibling_idx = idx - 1

            # Add sibling hash to proof if it's not already a target
            if sibling_idx < len(layer) and sibling_idx not in current_indices:
                proof.append(layer[sibling_idx])
            elif sibling_idx >= len(layer):
                # Odd node duplicated — sibling is itself
                proof.append(layer[idx])

            next_indices.add(idx // 2)

        current_indices = next_indices

    return {
        'disclosed': disclosed,
        'proof': proof,
        'root': tree_data['root'],
    }


def verify_proof(disclosed, proof, root):
    """
    Verify a selective disclosure proof.

    Reconstructs the Merkle root from disclosed fields and sibling hashes,
    then checks if it matches the claimed root.

    Args:
        disclosed: dict of {field: value} that were disclosed
        proof: list of sibling hashes from the proof
        root: the claimed Merkle root hex string

    Returns:
        True if the proof is valid, False otherwise
    """
    if not disclosed:
        return False

    # Hash the disclosed fields
    disclosed_hashes = []
    for field in sorted(disclosed.keys()):
        leaf_data = _canonical_leaf(field, disclosed[field])
        leaf_hash = hashlib.sha256(leaf_data.encode('utf-8')).hexdigest()
        disclosed_hashes.append(leaf_hash)

    # Reconstruct upward using the proof siblings
    current = disclosed_hashes
    proof_idx = 0

    while len(current) > 1 or proof_idx < len(proof):
        next_level = []
        i = 0
        while i < len(current):
            left = current[i]
            if i + 1 < len(current):
                right = current[i + 1]
                i += 2
            elif proof_idx < len(proof):
                right = proof[proof_idx]
                proof_idx += 1
                i += 1
            else:
                # Odd node, duplicate
                right = left
                i += 1
            next_level.append(_hash_pair(left, right))
        current = next_level

        if len(current) == 1 and proof_idx >= len(proof):
            break

    return len(current) == 1 and current[0] == root


def _canonical_leaf(field, value):
    """Serialize a single field for leaf hashing using canonical form."""
    # Use json with sorted keys for deterministic serialization
    return json.dumps({field: value}, sort_keys=True, separators=(',', ':'))


def _hash_pair(left, right):
    """Hash two hex strings together (sorted for commutativity is NOT applied;
    order matters in Merkle trees)."""
    combined = (left + right).encode('utf-8')
    return hashlib.sha256(combined).hexdigest()
