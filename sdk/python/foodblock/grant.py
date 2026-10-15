"""Authority (modules/authority.md): thin calls into the Rust core."""

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


def why_not_live_undo(block, blocks) -> list:
    """Why an act that cannot be undone (its schema says `undo: never`) is not live: [] when it has a specific accepted
    ask or a grant that names it with a limit."""
    return call("why_not_live_undo", block, list(blocks))


def act_name(block) -> str:
    """The act a block is, named `type.kind`."""
    return call("act_name", block)


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


def parse_duration(text):
    return call("parse_duration", text if isinstance(text, str) else None)


def add_duration(time, duration, sign=1):
    return call("add_duration", str(time), str(duration), sign)


def compare_durations(a, b, from_) -> int:
    return call("compare_durations", a, b, from_)
