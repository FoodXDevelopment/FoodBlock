"""Authority (modules/authority.md): thin calls into the Rust core."""

from . import _door as door

operators_of = door.operators_of
why_not_under = door.why_not_under
why_not_live = door.why_not_live
is_live = door.is_live
ancestors = door.ancestors
why_not_live_undo = door.why_not_live_undo  # why an act that cannot be undone is not live: [] when it has a specific accepted ask or a grant that names it with a limit
act_name = door.act_name  # the act a block is, named `type.kind`
limit_fence = door.limit_fence  # the observe of kind limit for a grant, to hand to `write`: sealed to the agent alone; `salt` opens the grant's `scope.limit_commitment`; `each` caps any single act
limit_commitment = door.limit_commitment  # the commitment to a limit and a cap on each act, for the grant's `scope.limit_commitment`
limit_opens = door.limit_opens  # whether the limit observe opens the grant's `scope.limit_commitment`
scope_within = door.scope_within
scope_refusals = door.scope_refusals
compare_durations = door.compare_durations


def within_limit(limit, value, spent) -> bool:
    """Whether one act of `value` (money or an amount) stays inside a limit (the limit observe, its state, or the limit);
    `spent` is what the principal's node has counted in the period: minor units, or the amount's value (a whole number or
    a decimal string), compared exactly."""
    return door.within_limit(limit, value, spent)


def parse_duration(text):
    return door.parse_duration(text if isinstance(text, str) else None)


def add_duration(time, duration, sign=1):
    return door.add_duration(str(time), str(duration), sign)
