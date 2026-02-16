"""
Deterministic JSON serialization for FoodBlock hashing.

Rules:
1. Keys sorted lexicographically at every nesting level
2. No whitespace
3. Numbers: no trailing zeros, no leading zeros, no positive sign
4. Strings: Unicode NFC normalization
5. Arrays in refs: sorted lexicographically (set semantics)
6. Arrays in state: preserve declared order (sequence semantics)
7. Null values: omitted
"""

import unicodedata
import math
import json


def canonical(type_: str, state: dict, refs: dict) -> str:
    obj = {"type": type_, "state": state, "refs": refs}
    return _stringify(obj, in_refs=False)


def _stringify(value, in_refs=False) -> str | None:
    if value is None:
        return None

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isinf(value) or math.isnan(value)):
            raise ValueError("FoodBlock: Infinity and NaN are not allowed")
        return _canonical_number(value)

    if isinstance(value, str):
        normalized = unicodedata.normalize("NFC", value)
        return json.dumps(normalized, ensure_ascii=False)

    if isinstance(value, list):
        if in_refs:
            items = sorted(value) if all(isinstance(v, str) for v in value) else value
            parts = [_stringify(v, in_refs) for v in items]
        else:
            parts = [_stringify(v, in_refs) for v in value]
        filtered = [p for p in parts if p is not None]
        return "[" + ",".join(filtered) + "]"

    if isinstance(value, dict):
        keys = sorted(value.keys())
        parts = []
        for key in keys:
            child_in_refs = in_refs or key == "refs"
            val = _stringify(value[key], child_in_refs)
            if val is not None:
                normalized_key = unicodedata.normalize("NFC", key)
                parts.append(json.dumps(normalized_key, ensure_ascii=False) + ":" + val)
        return "{" + ",".join(parts) + "}"

    raise TypeError(f"FoodBlock: unsupported type {type(value)}")


def _canonical_number(n) -> str:
    if isinstance(n, float):
        if n == 0.0:
            return "0"
        if n == int(n) and abs(n) < 2**53:
            return str(int(n))
        return repr(n)
    return str(n)
