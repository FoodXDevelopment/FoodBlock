"""The folds and views (modules/folds.md): thin calls into the Rust core."""

from . import _door as door
from .identity import _arrived

circle_state = door.circle_state
may_act_as = door.may_act_as
members_then = door.members_then
where_now = door.where_now
ownership = door.ownership
owner_of = door.owner_of
receiver_of = door.receiver_of
consent = door.consent  # a person's live word about a sender (or none): { word, block }; the 4th argument is the sender's block (or None)
live_grant = door.live_grant
circle_key = door.circle_key


def promise_stage(first_block, blocks) -> dict:
    """A promise's stage, from its first promise and every block in its deal: a function of the blocks alone. No clock."""
    return door.promise_stage(first_block, blocks, {})


def promise_view(first_block, blocks, now=None, arrivals=None, unknown_arrival=None) -> dict:
    """The same answer with stage `expired` once the reader's `now` passes `expires` and nothing binds. `unknown_arrival`
    ("inside" or "outside") is required whenever `arrivals` ({ hash: time }) is given."""
    options = {"now": now, "arrivals": arrivals, "unknown_arrival": unknown_arrival}
    return door.promise_view(first_block, blocks, {k: v for k, v in options.items() if v is not None})


def withdrawal_seen(withdrawal, block, blocks, arrived_at=None):
    return door.withdrawal_seen(withdrawal, block, blocks, _arrived(arrived_at, list(blocks) + [withdrawal, block]))


def due(promise, arrived_at=None):
    """`arrived_at` is { hash: time } data, or a function over the blocks it needs (the promise)."""
    return door.due(promise, _arrived(arrived_at, [promise]))


def recovery_reach(rotation, blocks, arrived_at=None, unknown_arrival=None):
    return door.recovery_reach(rotation, blocks, _arrived(arrived_at, list(blocks) + [rotation]), unknown_arrival)


def ownership_view(instance, blocks, arrived_at=None, unknown_arrival=None):
    return door.ownership_view(instance, blocks, _arrived(arrived_at, blocks), unknown_arrival)


def successor_view(grant, blocks, now=None, arrived_at=None) -> dict:
    return door.successor_view(grant, blocks, now, _arrived(arrived_at, blocks))


def counted_in(result, commitment, counter) -> bool:
    return door.counted_in(result, str(commitment), str(counter))
