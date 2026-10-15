"""The folds and views (modules/folds.md): thin calls into the Rust core."""

from ._core import call
from .identity import _arrived


def promise_stage(first_block, blocks, confirmers=()) -> dict:
    """A promise's stage, from its first promise and every block in its deal. No clock."""
    return call("promise_stage", first_block, list(blocks), {"confirmers": list(confirmers or [])})


def promise_view(first_block, blocks, now=None, confirmers=()) -> dict:
    """The same answer with stage `expired` once the reader's `now` passes `expires` and nothing binds."""
    return call("promise_view", first_block, list(blocks), {"now": now, "confirmers": list(confirmers or [])})


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


def receiver_of(promise, blocks):
    return call("receiver_of", promise, list(blocks))


def orderer_of(record):
    return call("orderer_of", record)


def consent(person, sender, blocks) -> dict:
    """A person's live word about a sender (or none): { word, block }."""
    return call("consent", person, sender, list(blocks))


def live_grant(act, grants, now):
    return call("live_grant", act, list(grants), now)


def withdrawal_seen(withdrawal, block, blocks, arrived_at=None):
    return call("withdrawal_seen", withdrawal, block, list(blocks), _arrived(arrived_at, list(blocks) + [withdrawal, block]))


def due(promise, arrived_at=None):
    """`arrived_at` is { hash: time } data, or a function over the blocks it needs (the promise)."""
    return call("due", promise, _arrived(arrived_at, [promise]))


def recovery_reach(rotation, blocks, arrived_at=None):
    return call("recovery_reach", rotation, list(blocks), _arrived(arrived_at, list(blocks) + [rotation]))


def successor_view(grant, blocks, now=None, arrived_at=None) -> dict:
    return call("successor_view", grant, list(blocks), now, _arrived(arrived_at, blocks))


def circle_key(circle, blocks) -> dict:
    return call("circle_key", circle, list(blocks))


def counted_in(result, commitment, counter) -> bool:
    return call("counted_in", result, str(commitment), str(counter))
