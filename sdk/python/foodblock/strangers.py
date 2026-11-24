"""Strangers (modules/consent.md) and the small profiles: thin calls into the Rust core."""

from . import _door as door

condition_holds = door.condition_holds  # whether a condition holds on the blocks given, read for the block `at` (only its causal past counts): True, False, or None for a shape the protocol does not read
reading_is_persons_claim = door.reading_is_persons_claim  # a model's reading is the person's claim only once the person's own block confirms it
reading_condition_holds = door.reading_condition_holds  # tasks profile: whether a reading_condition holds on the readings in the past of `at`
short_reply = door.short_reply  # the short reply (profiles/short-form.md): `FB1 ` and what the receiver cannot rebuild of her signed answer
short_reply_open = door.short_reply_open  # the answer rebuilt from a short reply among the blocks given (None: nothing was said)


def is_stranger(receiver, sender, blocks, block=None) -> bool:
    """Whether `receiver` is a stranger to `sender` among `blocks` (consent.md): True unless her accept, her counter-offer, a deal she opened
    naming him or her own live yes makes him no stranger (her declined or stopped answer, any other reply and a recorder's yes do not).
    `block` is the sender's own block (or None): it names whom the sender speaks for, so one who answered the principal is no stranger to its agent."""
    return door.is_stranger(receiver, sender, blocks, block)


def short_code(id_) -> str:
    """The short code of a block (profiles/short-form.md): the first 5 bytes of its id in Crockford Base32, XXXX-XXXX."""
    return door.short_code(str(id_))


def code_matches(text, id_) -> bool:
    """Whether a typed code names this block: case, spaces and hyphens ignored, O read as 0, I and L as 1; 8 characters match the short code, 10 the long one."""
    return door.code_matches(str(text), str(id_))
