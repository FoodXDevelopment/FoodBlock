"""The folds (protocol.md §11): thin calls into the Rust core."""

from ._core import call
from .identity import _arrived


def promise_stage(first_block, blocks, now=None, confirmers=()) -> dict:
    return call("promise_stage", first_block, list(blocks), {"now": now, "confirmers": list(confirmers or [])})


def circle_state(circle, blocks, within=None):
    return call("circle_state", circle, list(blocks), within)


def may_act_as(block, circle, blocks, role=None) -> bool:
    return call("may_act_as", block, circle, list(blocks), role)


def members_then(block, recipient, blocks) -> list:
    return call("members_then", block, recipient, list(blocks))


def where_now(thing, blocks) -> list:
    return call("where_now", thing, list(blocks))


def ownership(instance, blocks) -> dict:
    return call("ownership", instance, list(blocks))


def owner_of(instance, blocks):
    return call("owner_of", instance, list(blocks))


def successor_state(grant, blocks, now=None, arrived_at=None) -> dict:
    return call("successor_state", grant, list(blocks), now, _arrived(arrived_at, blocks))


def circle_key(circle, blocks) -> dict:
    return call("circle_key", circle, list(blocks))


def counted_in(result, commitment, counter) -> bool:
    return call("counted_in", result, commitment, counter)
