"""
Deterministic JSON serialization for FoodBlock hashing.
Aligns with RFC 8785 (JSON Canonicalization Scheme) for number formatting
and key ordering, extended with FoodBlock-specific rules.

Rules (RFC 8785 + FoodBlock):
1. Keys sorted lexicographically at every nesting level (RFC 8785 §3.2.3)
2. No whitespace between tokens (RFC 8785 §3.2.1)
3. Numbers: IEEE 754 shortest representation, no positive sign (RFC 8785 §3.2.2.3)
   -0 normalized to 0. NaN and Infinity are not valid.
4. Strings: Unicode NFC normalization (FoodBlock extension)
5. Arrays in refs: sorted lexicographically — set semantics (FoodBlock extension)
6. Arrays in state: preserve declared order — sequence semantics (FoodBlock extension)
7. Null values: omitted (FoodBlock extension)
8. Boolean values: literal true or false (RFC 8785 §3.2.2)
"""

from typing import Optional
import unicodedata
import math
import json
import decimal


def canonical(type_: str, state: dict, refs: dict) -> str:
    obj = {"type": type_, "state": state, "refs": refs}
    return _stringify(obj, in_refs=False)


def _stringify(value, in_refs=False) -> Optional[str]:
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
    """Format number per ECMAScript Number::toString (RFC 8785 §3.2.2.3).

    Matches JavaScript's String(n) behavior exactly:
    - Integer-valued floats → no decimal point
    - -0 → "0"
    - Decimals with |exponent| ≤ 6 → decimal notation
    - Otherwise → scientific notation matching JS format
    """
    if isinstance(n, float):
        if n == 0.0:
            return "0"
        if n == int(n) and abs(n) < 2**53:
            return str(int(n))

        # Use decimal module for precise control over formatting
        # repr() gives shortest representation, then we reformat per ECMAScript rules
        d = decimal.Decimal(repr(n))
        sign, digits, exponent = d.as_tuple()
        num_digits = len(digits)
        digit_str = ''.join(str(d) for d in digits)
        prefix = '-' if sign else ''

        # n_pos = position of decimal point from left of digit string
        n_pos = num_digits + exponent

        if num_digits <= n_pos <= 21:
            # Integer-like: pad with trailing zeros
            result = digit_str + '0' * (n_pos - num_digits)
        elif 0 < n_pos <= 21:
            # Decimal notation: split at n_pos
            result = digit_str[:n_pos] + '.' + digit_str[n_pos:]
        elif -6 < n_pos <= 0:
            # Small decimal: 0.000...digits
            result = '0.' + '0' * (-n_pos) + digit_str
        else:
            # Scientific notation (matches JS format)
            if num_digits == 1:
                mantissa = digit_str
            else:
                mantissa = digit_str[0] + '.' + digit_str[1:]

            exp = n_pos - 1
            if exp > 0:
                result = mantissa + 'e+' + str(exp)
            else:
                result = mantissa + 'e' + str(exp)

        return prefix + result
    return str(n)
