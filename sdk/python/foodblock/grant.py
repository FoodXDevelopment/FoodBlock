"""Authority (protocol.md §6): thin calls into the Rust core."""

from ._core import call


def operators_of(agent, blocks, now=None) -> list:
    return call("operators_of", agent, list(blocks), now)


def why_not_under(block, blocks, now=None) -> list:
    return call("why_not_under", block, list(blocks), now)


def why_not_live(grant, blocks, now=None) -> list:
    return call("why_not_live", grant, list(blocks), now)


def is_live(grant, blocks, now=None) -> bool:
    return call("is_live", grant, list(blocks), now)


def ancestors(grant, blocks) -> list:
    return call("ancestors", grant, list(blocks))


def limit_fence(grant_hash, agent, limit, per=None) -> dict:
    """The observe of kind limit for a grant, to hand to `write`: sealed to the agent alone (its whole audience)."""
    return call("limit_fence", grant_hash, agent, limit, per)


def within_limit(limit, money, spent=0) -> bool:
    """Whether spending `money` stays inside a limit (the limit observe, its state, or the money); `spent` is what the
    principal's node has counted in the period, in minor units."""
    return call("within_limit", limit, money, spent)


def scope_within(child, parent) -> list:
    return call("scope_within", child, parent)


def scope_refusals(child, parent) -> list:
    return call("scope_refusals", child, parent)
