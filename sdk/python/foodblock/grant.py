"""Authority (modules/authority.md): a grant gives authority within a scope; a child is a subset of its parent; a grant is live
only while every ancestor is. Thin calls into the Rust core."""

from . import _door as door
from .fold import keeps_to, meter, worst_case, lowest_offer

why_not_under = door.why_not_under
why_not_live = door.why_not_live
is_live = door.is_live
ancestors = door.ancestors
why_not_live_undo = door.why_not_live_undo  # why an act that cannot be undone is not live: [] when it has a specific accepted ask or a grant that names it with a limit
scope_within = door.scope_within
scope_refusals = door.scope_refusals
compare_durations = door.compare_durations
terms_total = door.terms_total  # what a promise's terms come to at a chosen quantity (an amount), or None when it cannot be computed


def scope_reading(scope=None) -> dict:
    """The one reading of a grant's state.scope (authority.md): every default of the spec, and `junk` (sorted names) for the fields that are there but cannot be read: hold such a grant to no word."""
    return door.scope_reading(scope)


def fence_reading(fence, at, readings=None, heard=None) -> dict:
    """Is the machine inside the fence of its grant (authority.md, A machine's fence): { within, why, alone, alone_until }."""
    return door.fence_reading(fence, at, readings, heard)


def parse_duration(text):
    return door.parse_duration(text if isinstance(text, str) else None)


def add_duration(time, duration, sign=1):
    return door.add_duration(str(time), str(duration), sign)
