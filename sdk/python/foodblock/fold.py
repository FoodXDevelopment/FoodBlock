"""The folds and views (modules/folds.md): thin calls into the Rust core."""

from . import _door as door
from .identity import _arrived

circle_state = door.circle_state
may_act_as = door.may_act_as
backed = door.backed  # is this block backed by this person (authority.md): {backed, why, chain}; why is a plain sentence when not (None when backed), chain the hashes down to the block the person signed; no clock, no arrival
backed_all = door.backed_all  # backed for a whole set at once: {hash: {backed, why}}, each the verdict backed gives that block among the same blocks, read together
owed_back = door.owed_back  # money moved in this person's name that they do not back (promises.md): {owed: [{block, minor, currency, to, why}]}
listing_check = door.listing_check  # a list-keeper's answer against the lookup it answers (promises.md, Finding): {ok, why, bad, left_out}
check_reads = door.check_reads  # a signed check of someone's record against the blocks it names: {ok, why, read}
clearing_applied = door.clearing_applied  # a circle of IOUs cancelled, each promise reduced: {binds, why, who, missing, lines}
ruling_releases = door.ruling_releases  # whether a judge's ruling releases a stake that names it: {releases, to, money, ruling, why}
gives = door.gives  # what of this person's would become whose if the block stands (promises.md): {gives: [{of: money|goods|use, to, back, ...}]}; read only from typed terms and refs, never from a template's words
act_check = door.act_check  # a deal against the act template it names (promises.md): {ok, why}; why is a plain sentence when not ok (None when ok)
account_of = door.account_of  # where a person says money to them goes (promises.md, Where to pay me): { who, destination, hash, at } from their own newest account word, or None
repeat_occurrences = door.repeat_occurrences  # the UTC start times of a promise's calendar repeat from `from_` to `to`, read in its zone by the pinned IANA database
speaks_for = door.speaks_for  # the one party a fold counts a block for (authority.md): an id, or None when it speaks for no one; the block need not be among the blocks yet; no clock
members_then = door.members_then
where_now = door.where_now
ownership = door.ownership
owner_of = door.owner_of
receiver_of = door.receiver_of
consent = door.consent  # a person's live word about a sender (or none): { word, block }; the 4th argument is the sender's block (or None)
circle_key = door.circle_key


def promise_stage(first_block, blocks) -> dict:
    """A promise's stage, from its first promise and every block in its deal: a function of the blocks alone. No clock."""
    return door.promise_stage(first_block, blocks, {})


def promise_view(first_block, blocks, now=None, arrivals=None, unknown_arrival=None) -> dict:
    """The same answer with stage `expired` once the reader's `now` passes `expires` and nothing binds. `unknown_arrival`
    ("inside" or "outside") is required whenever `arrivals` ({ hash: time }) is given."""
    options = {"now": now, "arrivals": arrivals, "unknown_arrival": unknown_arrival}
    return door.promise_view(first_block, blocks, {k: v for k, v in options.items() if v is not None})


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
