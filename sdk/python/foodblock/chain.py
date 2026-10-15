"""A key's own chain (protocol.md §1). Every block but a genesis sits in its signing key's chain: `state.seq` its
number, `refs.prev` the key's previous block. A key's first block has seq 1 and its prev is the block that brought the
key in (the genesis, or the key grant). Gaps show what is missing; two blocks with the same seq prove a lie
(invariant 3)."""

from . import _js


def next_link(last, brought_in=None) -> dict:
    """Where the next block for a key goes: { seq, prev }. `last` is the key's latest block; with none, the key's first
    block follows `brought_in` (the hash of the genesis or key grant that brought the key in)."""
    if last:
        seq = (last.get("state") or {}).get("seq")
        if not _js.is_int(seq):
            raise ValueError("chain: the last block has no seq; a key whose blocks have no seq starts again from the block that brought it in")
        return {"seq": int(seq) + 1, "prev": last["hash"]}
    if not brought_in:
        raise ValueError("chain: a key's first block follows the block that brought the key in")
    return {"seq": 1, "prev": brought_in}


def check_chain(blocks, brought_in) -> dict:
    """Check one key's chain: blocks it signed (in any order) and the block that brought it in. Returns { head, length,
    gaps, equivocations, broken, ok }: `gaps` the missing seq numbers, `equivocations` the sets of hashes sharing a seq,
    `broken` the blocks whose prev is not the block before them."""
    by_seq = {}
    for block in blocks:
        seq = (block.get("state") or {}).get("seq")
        if not _js.is_int(seq) or seq < 1:
            continue
        here = by_seq.setdefault(int(seq), [])
        if block["hash"] not in here:
            here.append(block["hash"])
    block_of = {block["hash"]: block for block in blocks}
    length = max(by_seq) if by_seq else 0
    gaps, equivocations, broken = [], [], []
    for seq in range(1, length + 1):
        here = by_seq.get(seq)
        if not here:
            gaps.append(seq)
            continue
        if len(here) > 1:
            equivocations.append(sorted(here))
        before = [brought_in] if seq == 1 else by_seq.get(seq - 1)
        if before and len(before) == 1:
            for h in here:
                if (block_of[h].get("refs") or {}).get("prev") != before[0]:
                    broken.append(h)
    top = by_seq.get(length)
    head = block_of[top[0]] if top and len(top) == 1 else None
    return {"head": head, "length": length, "gaps": gaps, "equivocations": equivocations, "broken": broken,
            "ok": not gaps and not equivocations and not broken}
