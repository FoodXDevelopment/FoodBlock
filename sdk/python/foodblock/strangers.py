"""Strangers (modules/consent.md) and the small profiles: thin calls into the Rust core."""

from ._core import call


def receipt_code(id_) -> str:
    """The short receipt code of a block: the first 5 bytes of its id in Crockford Base32, XXXX-XXXX."""
    return call("receipt_code", str(id_))


def receipt_code_long(id_) -> str:
    """The ten-character form (first 50 bits, XXXXX-XXXXX), for a custodian whose index holds two blocks with one short code."""
    return call("receipt_code", str(id_), True)


def code_matches(text, id_) -> bool:
    """Whether a typed code names this block: case, spaces and hyphens ignored, O read as 0, I and L as 1; 8 characters match the short code, 10 the long one."""
    return call("code_matches", str(text), str(id_))


def reading_is_persons_claim(reading, person, blocks) -> bool:
    return call("reading_is_persons_claim", reading, person, list(blocks))


def reading_condition_holds(condition, blocks, now) -> bool:
    return call("reading_condition_holds", condition, list(blocks), now)


def deposit_shape_ok(deposit) -> bool:
    return call("deposit_shape_ok", deposit)


def deposit_paid(ask, deposit, blocks) -> bool:
    return call("deposit_paid", ask, deposit, list(blocks))
