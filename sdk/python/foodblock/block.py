"""A block is { type, state, refs }; its identity is the SHA-256 of its canonical form (protocol.md §1)."""

import hashlib

from .canonical import canonical


def hash(type_: str, state: dict = None, refs: dict = None) -> str:  # noqa: A001 (the protocol's word)
    """The block's id: SHA-256 of its canonical form, 64 lowercase hex characters."""
    return hashlib.sha256(canonical(type_, state or {}, refs or {}).encode("utf-8")).hexdigest()


def create(type_: str, state: dict = None, refs: dict = None) -> dict:
    """A block with its hash: { hash, type, state, refs }. Nulls are dropped. Nothing is checked here: a block is
    checked when it is written (write, check), and read generously (read_as)."""
    if not isinstance(type_, str) or not type_:
        raise ValueError("FoodBlock: type is required and must be a string")
    state, refs = state if state is not None else {}, refs if refs is not None else {}
    if not isinstance(state, dict):
        raise ValueError("FoodBlock: state must be an object")
    if not isinstance(refs, dict):
        raise ValueError("FoodBlock: refs must be an object")
    state, refs = _omit_nulls(state), _omit_nulls(refs)
    for key, value in refs.items():
        if isinstance(value, str) or (isinstance(value, list) and all(isinstance(v, str) for v in value)):
            continue
        raise ValueError(f"FoodBlock: refs.{key} must be a string or array of strings")
    return {"hash": hash(type_, state, refs), "type": type_, "state": state, "refs": refs}


def _omit_nulls(value):
    """As the reference does: nulls leave objects (at any depth); an array inside an object is kept as written (the
    canonical form drops its nulls anyway)."""
    if isinstance(value, list):
        return [_omit_nulls(v) for v in value if v is not None]
    if not isinstance(value, dict):
        return value
    return {k: (_omit_nulls(v) if isinstance(v, dict) else v) for k, v in value.items() if v is not None}
