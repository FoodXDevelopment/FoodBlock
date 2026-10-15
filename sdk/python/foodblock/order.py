"""Causal order (protocol.md §1, §11). A block's causal past is every block reachable from it through its refs:
whatever a block names comes before it. Blocks with no causal link are listed by lowest hash only so every reader lists
them the same way; no rule of authority reads that order (invariant 7), and nobody's clock is read (invariant 6)."""

from .spec import matches


def _list(ref):
    return ref if isinstance(ref, list) else [ref] if isinstance(ref, str) else []


def causes_of(block) -> list:
    """The hashes a block names, through every ref."""
    out = []
    for value in ((block or {}).get("refs") or {}).values():
        for h in _list(value):
            if matches("hash", h) and h not in out:
                out.append(h)
    return out


def index_of(blocks) -> dict:
    """A lookup by hash: a dict as given, or one built from a list of blocks."""
    if isinstance(blocks, dict):
        return blocks
    return {block["hash"]: block for block in (blocks or [])}


def past_of(block, blocks) -> set:
    """Every held block in a block's causal past (a set of hashes; the block itself is not in it)."""
    by_hash, past, todo = index_of(blocks), set(), list(causes_of(block))
    while todo:
        h = todo.pop()
        if h in past:
            continue
        past.add(h)
        if h in by_hash:
            todo.extend(causes_of(by_hash[h]))
    return past


def sees(later, earlier, blocks) -> bool:
    """Whether `later` has `earlier` in its causal past."""
    if not later or not earlier:
        return False
    return (earlier.get("hash") if isinstance(earlier, dict) else earlier) in past_of(later, blocks)


def heads_among(blocks) -> list:
    """The blocks no other block among them has in its causal past."""
    named = set()
    for block in blocks:
        named |= past_of(block, blocks)
    return [block for block in blocks if block["hash"] not in named]


def causal_order(blocks) -> list:
    """Causes first; each step places, of the blocks whose held causes are all placed, the one with the lowest hash."""
    by_hash = index_of(blocks)
    waits, after = {}, {}
    for block in by_hash.values():
        causes = [c for c in causes_of(block) if c != block["hash"] and c in by_hash]
        waits[block["hash"]] = len(causes)
        for cause in causes:
            after.setdefault(cause, []).append(block["hash"])
    ready = sorted(h for h, n in waits.items() if n == 0)
    placed = []
    while len(placed) < len(by_hash):
        # A cycle (only made-up data can have one) is broken at its lowest hash.
        h = ready.pop(0) if ready else sorted(x for x, n in waits.items() if n > 0)[0]
        waits[h] = -1
        placed.append(by_hash[h])
        for later in after.get(h, []):
            if waits[later] > 0:
                waits[later] -= 1
                if waits[later] == 0:
                    at = next((i for i, other in enumerate(ready) if other > later), len(ready))
                    ready.insert(at, later)
    return placed
