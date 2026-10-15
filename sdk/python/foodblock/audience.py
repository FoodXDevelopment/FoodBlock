"""The commitment (protocol.md §9): the one privacy primitive. A salted hash, SHA-256 of the salt's hex followed by the
value, as UTF-8. The salt (or the salt and the value) travels beside the block only to whoever it is for, in their own
copy (`reveals`). A salt is fresh per block per recipient, never reused. The audience, personal fields, for_whom,
customers in business blocks and secret ballots all use it."""

import hashlib
import os

from . import _js


def new_salt() -> str:
    """16 random bytes, hex: a salt, or a block's nonce."""
    return os.urandom(16).hex()


def salted_hash(salt_hex, value) -> str:
    """The commitment to a value under a salt."""
    return hashlib.sha256((_js.string(salt_hex) + _js.string(value)).encode("utf-8")).hexdigest()


def commit(recipients, salts=None) -> dict:
    """An audience for these recipients (people, circles, `circle#role`): { audience: sorted commitments, salts:
    { recipient: salt } }. Each recipient gets a fresh salt unless one is given (only to reproduce a vector)."""
    who = list(dict.fromkeys(recipients))
    if not who or any(not isinstance(one, str) or not one for one in who):
        raise ValueError("audience: an audience names at least one recipient")
    salts = salts or {}
    given = {one: salts.get(one) or new_salt() for one in who}
    return {"audience": sorted(set(salted_hash(given[one], one) for one in who)), "salts": given}


def finds_self(block, recipient, salt_hex) -> bool:
    """Whether a recipient holding this salt finds itself in a block's audience."""
    audience = ((block or {}).get("state") or {}).get("audience")
    return isinstance(audience, list) and bool(salt_hex) and salted_hash(salt_hex, recipient) in audience


def reveal_for(salts, recipient) -> dict:
    """The reveal a recipient's copy carries for its audience entry: { salt, value } (its own id)."""
    return {"salt": salts.get(recipient), "value": recipient}
