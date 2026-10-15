"""Authority (protocol.md §7). A grant gives authority to `refs.to` (left out, to anyone), within `state.scope`. A child
grant (`refs.parent`) is a subset of its parent on every field (invariant 10), and a grant is live only while every
ancestor is (invariant 9). A grant carries no status: its author ends it by an `updates` with stopped; the receiver
declines or leaves by an `answers`. Durations count calendar months and years in UTC."""

import math
import re

from . import _js
from .order import index_of
from .spec import matches

_DURATION = re.compile(r"P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?")


def _get(value, *path):
    for key in path:
        value = value.get(key) if isinstance(value, dict) else None
    return value


# ---- Durations (ISO 8601) ----
def parse_duration(text):
    """{ years, months, days, ms } of an ISO 8601 duration, or None."""
    if not matches("duration", text):
        return None
    y, mo, w, d, _t, h, mi, s = _DURATION.fullmatch(text).groups()
    n = lambda part: int(part) if part else 0  # noqa: E731
    return {"years": n(y), "months": n(mo), "days": n(w) * 7 + n(d), "ms": (n(h) * 3600 + n(mi) * 60 + n(s)) * 1000}


def add_duration(time, duration, sign=1):
    """A time moved by a duration (sign -1 goes back), months and years by the UTC calendar; None if either is not one."""
    found, at = parse_duration(duration), _js.parse_ms(time)
    if not found or at is None:
        return None
    year, month, day, rest = _js.parts(at)
    moved = _js.make_ms(year + sign * found["years"], month + sign * found["months"], day + sign * found["days"], rest)
    return _js.iso(moved + sign * found["ms"])


def compare_durations(a, b, start):
    """Two durations compared by adding both to one instant, the parent grant's `at` (§7): -1, 0 or 1 (NaN if either is
    not a duration). Arithmetic only."""
    x, y = _js.parse_ms(add_duration(start, a)), _js.parse_ms(add_duration(start, b))
    if x is None or y is None:
        return math.nan
    return (x > y) - (x < y)


# ---- A child's scope within its parent's ----
def _contains(outer, inner):
    if inner is None:
        return True
    if isinstance(inner, list):
        return isinstance(outer, list) and all(any(_contains(other, item) and _contains(item, other) for other in outer) for item in inner)
    if isinstance(inner, dict):
        return _js.truthy(outer) and isinstance(outer, (dict, list)) and all(_contains(_get(outer, key), inner[key]) for key in inner)
    return _js.strict_eq(outer, inner)


def scope_refusals(child, parent) -> list:
    """What makes a child grant wider than its parent: [{code, detail}] (`wider_than_parent`, `not_receiver`); [] when it
    is within it."""
    c, p = _get(child, "state", "scope") or {}, _get(parent, "state", "scope") or {}
    wrong, start = [], _get(parent, "state", "at") or "2000-01-01T00:00:00.000Z"
    for name in ("acts", "parties"):
        if p.get(name) is None:
            continue
        if c.get(name) is None or not all(item in p[name] for item in c[name]):
            wrong.append({"code": "wider_than_parent", "detail": f"scope.{name} is a subset of the parent's"})
    if _js.truthy(p.get("limit")):
        cl, pl = c.get("limit"), p["limit"]
        ok = _js.truthy(cl) and isinstance(cl, dict) and _js.strict_eq(cl.get("currency"), _get(pl, "currency")) \
            and _js.is_number(cl.get("minor")) and _js.is_number(_get(pl, "minor")) and cl["minor"] <= pl["minor"]
        if not ok:
            wrong.append({"code": "wider_than_parent", "detail": "scope.limit is no larger than the parent's"})
    if _js.truthy(p.get("per")) and not (_js.truthy(c.get("per")) and compare_durations(c["per"], p["per"], start) <= 0):
        wrong.append({"code": "wider_than_parent", "detail": "scope.per is no longer than the parent's"})
    if _js.truthy(p.get("until")) and not (_js.truthy(c.get("until")) and isinstance(c["until"], str) and isinstance(p["until"], str) and c["until"] <= p["until"]):
        wrong.append({"code": "wider_than_parent", "detail": "scope.until is no later than the parent's"})
    if _js.truthy(p.get("notice")) and not (_js.truthy(c.get("notice")) and compare_durations(c["notice"], p["notice"], start) >= 0):
        wrong.append({"code": "wider_than_parent", "detail": "scope.notice is no shorter than the parent's"})
    if p.get("condition") is not None and not _contains(c.get("condition"), p["condition"]):
        wrong.append({"code": "wider_than_parent", "detail": "scope.condition keeps every condition of the parent's"})
    depth = _get(parent, "state", "depth")
    depth = 0 if depth is None else depth
    mine = _get(child, "state", "depth")
    mine = 0 if mine is None else mine
    if not (_js.is_number(depth) and depth >= 1 and _js.is_number(mine) and mine <= depth - 1):
        wrong.append({"code": "wider_than_parent", "detail": "state.depth is smaller than the parent's by at least one (a grant with no depth is not passed on)"})
    if _js.truthy(_get(parent, "refs", "to")) and _get(child, "refs", "author") != parent["refs"]["to"]:
        wrong.append({"code": "not_receiver", "detail": "a grant is passed on by the one who received it"})
    return wrong


def scope_within(child, parent) -> list:
    """What makes a child grant wider than its parent, in plain words ([] when it is within it)."""
    return [one["detail"] for one in scope_refusals(child, parent)]


# ---- Liveness ----
def _hashes(ref):
    return ref if isinstance(ref, list) else [ref] if _js.truthy(ref) else []


def why_not_live(grant, blocks, now=None, _seen=None) -> list:
    """Why a grant is not live among these blocks (its own end, the receiver's, its `until` on the reader's clock, an
    ancestor's): [] when live."""
    by_hash = index_of(blocks)
    seen = _seen if _seen is not None else set()
    if not grant:
        return ["the grant is not held"]
    if grant["hash"] in seen:
        return ["its parents form a cycle"]
    seen.add(grant["hash"])
    wrong = []
    refs = grant.get("refs") or {}
    for block in by_hash.values():
        status = _get(block, "state", "status")
        if block.get("type") != "grant" or status is None:
            continue
        ends = status in ("stopped", "declined")
        b_refs = block.get("refs") or {}
        if ends and grant["hash"] in _hashes(b_refs.get("updates")) and (
                _js.strict_eq(b_refs.get("author"), refs.get("author")) or (_js.truthy(refs.get("as")) and b_refs.get("as") == refs["as"])):
            wrong.append("its author stopped it")
        if ends and grant["hash"] in _hashes(b_refs.get("answers")) and _js.truthy(refs.get("to")) and b_refs.get("author") == refs["to"]:
            wrong.append("its receiver ended it")
    until = _get(grant, "state", "scope", "until")
    if now and _js.truthy(until) and isinstance(until, str) and until <= now:
        wrong.append("its scope.until has passed")
    if _js.truthy(refs.get("parent")):
        parent = by_hash.get(refs["parent"])
        above = why_not_live(parent, by_hash, now=now, _seen=seen)
        if above:
            wrong.append(f"its parent is not live ({'; '.join(above)})")
        else:
            wrong.extend(scope_within(grant, parent))
    return wrong


def is_live(grant, blocks, now=None) -> bool:
    return not why_not_live(grant, blocks, now=now)


def ancestors(grant, blocks) -> list:
    """The grants above this one, nearest first."""
    by_hash, out, seen = index_of(blocks), [], set()
    at = by_hash.get(_get(grant, "refs", "parent"))
    while at and at["hash"] not in seen:
        seen.add(at["hash"])
        out.append(at)
        at = by_hash.get(_get(at, "refs", "parent"))
    return out


def why_not_under(block, blocks, now=None) -> list:
    """Whether a block signed under a grant (refs.under) speaks for its grantor: [] or why not. `scope.acts` lists the
    block types or type.kind names it covers."""
    found = index_of(blocks).get(_get(block, "refs", "under"))
    if not found or found.get("type") != "grant":
        return ["refs.under names no grant this reader holds"]
    acts = _get(found, "state", "scope", "acts")
    kind = _get(block, "state", "kind")
    wrong = []
    to = _get(found, "refs", "to")
    if _js.truthy(to) and to != _get(block, "refs", "author"):
        wrong.append("the grant is for someone else")
    if _js.truthy(acts) and block["type"] not in acts and f"{block['type']}.{_js.string(kind)}" not in acts:
        wrong.append(f"the grant's acts do not cover a {block['type']}{'.' + _js.string(kind) if _js.truthy(kind) else ''}")
    return wrong + why_not_live(found, blocks, now=now)


def operators_of(agent, blocks, now=None) -> list:
    """Who answers for an agent or machine: the authors of its live grants of kind operator, naming it in refs.to (§2)."""
    by_hash = index_of(blocks)
    return sorted(set(block["refs"]["author"] for block in by_hash.values()
                      if block.get("type") == "grant" and _get(block, "state", "kind") == "operator" and _get(block, "refs", "to") == agent
                      and _get(block, "state", "status") is None and is_live(block, blocks, now=now)))
