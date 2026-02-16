"""Core FoodBlock creation and hashing."""

import hashlib
from .canonical import canonical


def create(type_: str, state: dict = None, refs: dict = None) -> dict:
    """Create a new FoodBlock. Returns { hash, type, state, refs }."""
    if not type_ or not isinstance(type_, str):
        raise ValueError("FoodBlock: type is required and must be a string")

    state = _omit_nulls(state or {})
    refs = _omit_nulls(refs or {})

    h = compute_hash(type_, state, refs)
    return {"hash": h, "type": type_, "state": state, "refs": refs}


def update(previous_hash: str, type_: str, state: dict = None, refs: dict = None) -> dict:
    """Create an update block that supersedes a previous block."""
    if not previous_hash or not isinstance(previous_hash, str):
        raise ValueError("FoodBlock: previous_hash is required")

    merged_refs = dict(refs or {})
    merged_refs["updates"] = previous_hash
    return create(type_, state, merged_refs)


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
