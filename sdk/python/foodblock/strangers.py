"""Strangers (modules/consent.md) and the small profiles: thin calls into the Rust core."""

from . import _door as door

condition_holds = door.condition_holds  # whether a condition holds on the blocks held at the reader's clock: True, False, or None for a shape the protocol does not read
earnest_shape_ok = door.earnest_shape_ok


def receipt_code(id_) -> str:
    """The short receipt code of a block: the first 5 bytes of its id in Crockford Base32, XXXX-XXXX."""
    return door.receipt_code(str(id_))


def receipt_code_long(id_) -> str:
    """The ten-character form (first 50 bits, XXXXX-XXXXX), for a custodian whose index holds two blocks with one short code."""
    return door.receipt_code(str(id_), True)


def code_matches(text, id_) -> bool:
    """Whether a typed code names this block: case, spaces and hyphens ignored, O read as 0, I and L as 1; 8 characters match the short code, 10 the long one."""
    return door.code_matches(str(text), str(id_))


def reading_is_persons_claim(reading, person, blocks) -> bool:
    return door.reading_is_persons_claim(reading, person, blocks)


def reading_condition_holds(condition, blocks, now) -> bool:
    return door.reading_condition_holds(condition, blocks, now)


def earnest_paid(ask, earnest, blocks) -> bool:
    return door.earnest_paid(ask, earnest, blocks)
