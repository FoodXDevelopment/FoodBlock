"""Core FoodBlock creation and hashing."""

import hashlib
import uuid
from .canonical import canonical

# Event types that get auto-injected instance_id (Section 2.1)
_EVENT_PREFIXES = ('transfer.', 'transform.', 'observe.')
# Definitional observe.* subtypes excluded from auto-injection
_DEFINITIONAL = frozenset(['observe.vocabulary', 'observe.template', 'observe.schema', 'observe.trust_policy', 'observe.protocol'])


def create(type_: str, state: dict = None, refs: dict = None) -> dict:
    """Create a new FoodBlock. Returns { hash, type, state, refs }."""
    if not type_ or not isinstance(type_, str):
        raise ValueError("FoodBlock: type is required and must be a string")

    raw_state = state or {}

    # Auto-inject instance_id for event types (Section 2.1)
    is_event = any(type_.startswith(p) for p in _EVENT_PREFIXES) and type_ not in _DEFINITIONAL
    if is_event and 'instance_id' not in raw_state:
        raw_state = {'instance_id': str(uuid.uuid4()), **raw_state}

    state = _omit_nulls(raw_state)
    refs = _omit_nulls(refs or {})

    # Validate ref values are strings or lists of strings
    for key, value in refs.items():
        if isinstance(value, str):
            continue
        if isinstance(value, list) and all(isinstance(v, str) for v in value):
            continue
        raise ValueError(f"FoodBlock: refs.{key} must be a string or list of strings")

    h = compute_hash(type_, state, refs)
    return {"hash": h, "type": type_, "state": state, "refs": refs}


def update(previous_hash: str, type_: str, state: dict = None, refs: dict = None) -> dict:
    """Create an update block that supersedes a previous block.

    Note: state is a FULL REPLACEMENT, not a merge with previous state.
    Use merge_update() if you want to merge changes into previous state.
    """
    if not previous_hash or not isinstance(previous_hash, str):
        raise ValueError("FoodBlock: previous_hash is required")

    merged_refs = dict(refs or {})
    merged_refs["updates"] = previous_hash
    return create(type_, state, merged_refs)


def merge_update(previous_block: dict, state_changes: dict = None, additional_refs: dict = None) -> dict:
    """Create an update by merging changes into the previous block's state.

    Shallow-merges state_changes into previous_block['state'].

    Args:
        previous_block: The block to update (must have 'hash', 'type', 'state')
        state_changes: Fields to merge into previous state
        additional_refs: Extra refs (updates ref is added automatically)
    """
    if not previous_block or not previous_block.get("hash"):
        raise ValueError("FoodBlock: previous_block with hash is required")
    merged_state = {**previous_block["state"], **(state_changes or {})}
    return update(previous_block["hash"], previous_block["type"], merged_state, additional_refs)


def compute_hash(type_: str, state: dict = None, refs: dict = None) -> str:
    """Compute the SHA-256 hash of a FoodBlock's canonical form."""
    c = canonical(type_, state or {}, refs or {})
    return hashlib.sha256(c.encode("utf-8")).hexdigest()


def _omit_nulls(obj):
    """Recursively remove None values from an object."""
    if not isinstance(obj, dict):
        return obj
    result = {}
    for key, value in obj.items():
        if value is None:
            continue
        if isinstance(value, dict):
            result[key] = _omit_nulls(value)
        elif isinstance(value, list):
            result[key] = [_omit_nulls(v) for v in value if v is not None]
        else:
            result[key] = value
    return result
