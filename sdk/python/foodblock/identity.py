"""Who someone is (protocol.md §2). Their genesis is the one block with no author: a public `actor` naming its own
signing key, its encryption key, the hash of an offline recovery key and how far back that key may reach, signed by its
own key. Its hash is their id. A key comes in by a `grant` of kind key. A rotation (`replaces` and `last_good`) voids
the old key's blocks after its last good block, and is signed only by that key or by the recovery key (invariant 8). A
key brought in by a void block is void, and so is every key it brought in. Two rotations of one key that do not see
each other freeze the keys they bring in, until the recovery key settles it; two recovery rotations that do not see each
other end the identity. Recovery reach is read from arrival on the reader's node (`arrived_at`), never from `at`
(invariant 6). History is closed (invariant 16): a block without seq counts only in the causal past of an older
identity's first 1.6 block, or in its manifest; history never grants or rotates."""

import hashlib
import json

from . import _js
from .block import create
from .chain import next_link, check_chain
from .grant import add_duration, operators_of
from .order import causal_order, past_of, sees, index_of
from .sign import sign, verify


def _get(value, *path):
    for key in path:
        value = value.get(key) if isinstance(value, dict) else None
    return value


def _signed(block, private_key):
    return {**block, "signature": sign(block, private_key)}


def _opens(block, public_key):
    return bool(block and block.get("signature") and public_key) and verify(block, block["signature"], public_key)


def recovery_key_hash(public_key_hex) -> str:
    """The recovery key's hash, as a genesis names it: SHA-256 of its SPKI hex, as UTF-8 text."""
    return hashlib.sha256(str(public_key_hex).encode("utf-8")).hexdigest()


def genesis(keys, encryption_key=None, recovery_key=None, kind="person", at=None, reach="P30D") -> dict:
    """A new person, agent, machine or signing circle: their genesis, signed. `keys` is { public_key_sign, private_key };
    a 1.6 genesis names the recovery key (only its hash is written) and its reach, and the encryption key (X25519
    public) if the identity will receive sealed blocks: a micro that only signs leaves it out and adds one later by a
    key grant."""
    if not recovery_key:
        raise ValueError("identity: a 1.6 genesis names its recovery key")
    state = {"kind": kind, "at": at or _js.now_iso(), "audience": "public", "public_key_sign": keys["public_key_sign"],
             **({"public_key_encrypt": encryption_key} if encryption_key else {}),
             "recovery_key_hash": recovery_key_hash(recovery_key), "recovery_reach": reach}
    return _signed(create("actor", state, {}), keys["private_key"])


def is_genesis(block) -> bool:
    return bool(block) and block.get("type") == "actor" and isinstance(_get(block, "state", "public_key_sign"), str) \
        and not _js.truthy(_get(block, "refs", "author")) and _get(block, "state", "seq") is None


def is_16_genesis(block) -> bool:
    """A genesis with the recovery fields: a 1.6 genesis, which has no history."""
    return is_genesis(block) and block["state"].get("recovery_key_hash") is not None and block["state"].get("recovery_reach") is not None


def genesis_opens(block) -> bool:
    """A genesis is valid when its own key opens it."""
    return is_genesis(block) and _opens(block, block["state"]["public_key_sign"])


def key_grant(id_, new_public_key, signer, replaces=None, last_good=None, at=None, after=(), encrypt=None, recovery=None) -> dict:
    """A key grant, signed: brings `new_public_key` into the id. `signer` is { private_key, last, brought_in } (a key the
    id holds and its place in that key's chain), or { private_key, recovery_key } for the recovery key, whose chain
    starts at the genesis. A rotation also names the key it `replaces` and that key's `last_good` block. `recovery`
    ({ key, reach }) adds recovery to an older genesis."""
    place = next_link(signer.get("last"), signer.get("brought_in") or id_)
    state = {"seq": place["seq"], "at": at or _js.now_iso(), "audience": "public", "kind": "key"}
    if new_public_key:
        state["public_key_sign"] = new_public_key
    if encrypt:
        state["public_key_encrypt"] = encrypt
    if replaces:
        state["replaces"], state["last_good"] = replaces, last_good
    if signer.get("recovery_key"):
        state["recovery_key"] = signer["recovery_key"]
    if recovery:
        state["recovery_key_hash"], state["recovery_reach"] = recovery_key_hash(recovery["key"]), recovery["reach"]
    seen = sorted(set(after or ()))
    refs = {"author": id_, "subject": id_, "prev": place["prev"], **({"after": seen} if seen else {})}
    return _signed(create("grant", state, refs), signer["private_key"])


# ---- History (§2) ----
def history_counts(block, id_, blocks) -> bool:
    """Whether a block without seq counts as its author's history: never for a 1.6 genesis (it has none); while an older
    identity has written no 1.6 block, its history is open and counts; once it has, only what is in its first 1.6
    block's causal past or manifest counts. What counts, counts in every fold under the rules it was written in, read
    through aliases (an old membership or grant stands). A reader that holds neither the genesis nor a 1.6 block of
    the author has nothing that closes the history, so it reads it as open."""
    if _get(block, "state", "seq") is not None:
        return False
    by_hash = index_of(blocks)
    root = by_hash.get(id_)
    if root and is_16_genesis(root):
        return False
    firsts = [other for other in by_hash.values() if _get(other, "refs", "author") == id_ and _get(other, "state", "seq") == 1
              and not isinstance(_get(other, "state", "seq"), bool) and _get(other, "refs", "prev") == id_]
    # An older identity that has written no 1.6 block yet has not closed its history.
    if not firsts:
        return True
    return any(block["hash"] in past_of(first, by_hash) or block["hash"] in (first["state"].get("manifest") or []) for first in firsts)


# ---- Two blocks at one seq (§2) ----
def _chain_root(block, by_hash):
    """A key's place in its chain, read from the chain alone (no signature): the block that brought the key in, found by
    walking `prev` back to seq 1 (the recovery key's chain, which also starts at the genesis, begins with a block naming
    `recovery_key`). A chain with a gap is named by the first missing link and the seq above it."""
    at = block
    for _ in range(block["state"]["seq"] + 1):
        if at["state"]["seq"] == 1:
            return f"{'recovery ' if _js.truthy(at['state'].get('recovery_key')) else ''}{_js.string(_get(at, 'refs', 'prev'))}"
        prev = by_hash.get(_get(at, "refs", "prev")) if isinstance(_get(at, "refs", "prev"), str) else None
        prev_seq = _get(prev, "state", "seq")
        if not prev or not _js.is_int(prev_seq) or prev_seq != at["state"]["seq"] - 1:
            return f"{_js.string(_get(at, 'refs', 'prev'))}@{at['state']['seq']}"
        at = prev
    return None


_FORKS = {}


def _forks_of(by_hash):
    """Where each key of each author first signed two blocks at one seq: `author root` -> that seq. Read once per set of
    blocks (while it is unchanged)."""
    memo = _FORKS.get(id(by_hash))
    if memo and memo[0] is by_hash and memo[1] == len(by_hash):
        return memo[2]
    by_slot, out = {}, {}
    for block in by_hash.values():
        author, seq = _get(block, "refs", "author"), _get(block, "state", "seq")
        if not _js.truthy(author) or not _js.is_int(seq):
            continue
        by_slot.setdefault(f"{_js.string(author)} {seq}", []).append(block)
    for group in by_slot.values():
        if len(group) < 2:
            continue
        roots = {}
        for block in group:
            key = f"{_js.string(block['refs']['author'])} {_chain_root(block, by_hash)}"
            roots[key] = roots.get(key, 0) + 1
        for key, n in roots.items():
            seq = group[0]["state"]["seq"]
            if n > 1 and (key not in out or out[key] > seq):
                out[key] = seq
    if len(_FORKS) > 64:
        _FORKS.clear()
    _FORKS[id(by_hash)] = (by_hash, len(by_hash), out)
    return out


def forked(block, blocks) -> bool:
    """Whether a block is one of two at one seq of its key, or a later block of that key: proof of a lie, counted for
    nothing in every fold but the identity fold (§2, Two blocks at one seq; §11, Equivocations in folds)."""
    if not block or not _js.truthy(_get(block, "refs", "author")) or not _js.is_int(_get(block, "state", "seq")):
        return False
    by_hash = index_of(blocks)
    forks = _forks_of(by_hash)
    if not forks:
        return False
    seq = forks.get(f"{_js.string(block['refs']['author'])} {_chain_root(block, by_hash)}")
    return seq is not None and block["state"]["seq"] >= seq


def counts(block, by_hash) -> bool:
    """Whether a block counts in a fold other than the identity fold: one with seq unless its key signed two blocks at
    one seq at or before it (its signature is the reader's own check); one without, as history."""
    if is_genesis(block):
        return True
    if _get(block, "state", "seq") is not None:
        return not forked(block, by_hash)
    return history_counts(block, _get(block, "refs", "author"), by_hash)


# ---- Keys ----
def _key_grants_of(id_, blocks):
    return causal_order([block for block in index_of(blocks).values() if block.get("type") == "grant" and _get(block, "state", "kind") == "key"
                         and _get(block, "refs", "author") == id_ and _get(block, "refs", "subject") == id_
                         and _js.is_int(_get(block, "state", "seq")) and _get(block, "state", "status") is None])


def _earliest(group, by_hash):
    """The earliest of a set of blocks: those whose causal past holds no other of them."""
    return [one for one in group if not any(other is not one and sees(one, other, by_hash) for other in group)]


def identity_of(id_, blocks, arrived_at=None) -> dict:
    """What an id's keys are, read from its chain alone: { keys: [{ key, by, signer, void, frozen }], rotations (old key
    -> { by, all, lastGood, recovery, floor }), recovery: [public keys proven], ended }. `arrived_at(hash)` (when a block
    arrived on this node, an ISO time) is for recovery reach."""
    by_hash = index_of(blocks)
    root = by_hash.get(id_)
    if not genesis_opens(root):
        return {"keys": [], "rotations": {}, "recovery": [], "ended": False}
    grants = _key_grants_of(id_, by_hash)
    rotations, result = {}, None
    # Rotations can void grants that came before them in causal order, so read until nothing changes.
    for attempt in range(len(grants) + 2):
        result = _read_keys(id_, root, grants, by_hash, rotations, arrived_at)
        same = _as_json(result["rotations"]) == _as_json(rotations)
        rotations = result["rotations"]
        if same and attempt:
            break
    return result


def _as_json(rotations):
    return json.dumps(list(rotations.items()), separators=(",", ":"))


def _read_keys(id_, root, grants, by_hash, rotations, arrived_at):
    recovery_hashes = [h for h in [root["state"].get("recovery_key_hash")] if _js.truthy(h)]
    keys = [{"key": root["state"]["public_key_sign"], "by": root["hash"], "signer": None, "void": False, "frozen": False}]
    recovery, self_rotations, recovery_rotations, slots = [], {}, {}, {}
    context = {"by_hash": by_hash, "rotations": rotations, "arrived_at": arrived_at, "id": id_}
    for grant in grants:
        state = grant["state"]
        by_recovery = isinstance(state.get("recovery_key"), str) and recovery_key_hash(state["recovery_key"]) in recovery_hashes \
            and _opens(grant, state["recovery_key"])
        signer = None if by_recovery else next((entry for entry in keys if not entry["void"] and not entry["frozen"]
                                                 and _opens(grant, entry["key"]) and _speaks(entry, grant, context)), None)
        if not by_recovery and not signer:
            continue
        if by_recovery and state["recovery_key"] not in recovery:
            recovery.append(state["recovery_key"])
        # An older genesis adds recovery once, by a key grant naming it.
        if _js.truthy(state.get("recovery_key_hash")) and not recovery_hashes:
            recovery_hashes.append(state["recovery_key_hash"])
        if _js.truthy(state.get("replaces")):
            # A key is rotated only by itself or by the recovery key.
            if not by_recovery and signer["key"] != state["replaces"]:
                continue
            group = recovery_rotations if by_recovery else self_rotations
            group.setdefault(state["replaces"], []).append(grant)
        if _js.truthy(state.get("public_key_sign")):
            keys.append({"key": state["public_key_sign"], "by": grant["hash"], "signer": "recovery" if by_recovery else signer["key"],
                         "void": False, "frozen": False})
        if not by_recovery:
            slots.setdefault((signer["key"], state["seq"]), []).append(grant)
    # Each rotated key: the recovery's rotation rules; two that do not see each other freeze (self) or end (recovery).
    following = {}
    crossing = _earliest([grant for group in recovery_rotations.values() for grant in group], by_hash)
    ended = sorted(grant["hash"] for grant in crossing) if len(crossing) > 1 else None
    for old in list(dict.fromkeys([*self_rotations.keys(), *recovery_rotations.keys()])):
        by_recovery = _earliest(recovery_rotations.get(old) or [], by_hash)
        by_self = _earliest(self_rotations.get(old) or [], by_hash)
        if by_recovery:
            rule = causal_order(recovery_rotations[old])[-1]
            for grant in self_rotations.get(old) or []:
                if not sees(rule, grant, by_hash):
                    for entry in keys:
                        if entry["by"] == grant["hash"]:
                            entry["frozen"] = True
            arrived = arrived_at(rule["hash"]) if arrived_at else None
            reach = root["state"].get("recovery_reach") or _recovery_reach_of(id_, by_hash)
            following[old] = {"by": rule["hash"], "all": sorted(g["hash"] for g in (self_rotations.get(old) or []) + recovery_rotations[old]),
                              "lastGood": rule["state"].get("last_good"), "recovery": True,
                              "floor": add_duration(arrived, reach, -1) if arrived else None}
            continue
        if len(by_self) > 1:
            for grant in by_self:
                for entry in keys:
                    if entry["by"] == grant["hash"]:
                        entry["frozen"] = True
        goods = [g for g in (by_hash.get(grant["state"].get("last_good")) for grant in by_self) if g]
        lowest = sorted(goods, key=lambda g: g["state"].get("seq"))[0] if goods else None
        following[old] = {"by": ",".join(sorted(g["hash"] for g in by_self)), "all": sorted(g["hash"] for g in by_self),
                          "lastGood": lowest["hash"] if lowest else by_self[0]["state"].get("last_good"), "recovery": False, "floor": None}
    # Two key grants at one seq of one key (a fork, rotating or not): Conflict applies. The keys they bring in freeze until
    # a recovery rotation of that key settles it; then those in its causal past speak.
    for (signer_key, _seq), pair in slots.items():
        if len(pair) < 2:
            continue
        settle = recovery_rotations.get(signer_key)
        rule = causal_order(settle)[-1] if settle else None
        for grant in pair:
            if not rule or not sees(rule, grant, by_hash):
                for entry in keys:
                    if entry["by"] == grant["hash"]:
                        entry["frozen"] = True
    # A key brought in by a void block is void, and so is every key it brought in.
    for entry in keys[1:]:
        grant = by_hash.get(entry["by"])
        signer = None if entry["signer"] == "recovery" else next((other for other in keys if other["key"] == entry["signer"]), None)
        if signer and (signer["void"] or not _speaks(signer, grant, {**context, "rotations": following})):
            entry["void"] = True
        if signer and signer["frozen"]:
            entry["frozen"] = True
    return {"keys": keys, "rotations": following, "recovery": recovery, "ended": ended}


def _recovery_reach_of(id_, by_hash):
    found = next((block for block in by_hash.values() if block.get("type") == "grant" and _get(block, "refs", "author") == id_
                  and _js.truthy(_get(block, "state", "recovery_reach"))), None)
    return found["state"]["recovery_reach"] if found else None


def _speaks(entry, block, context):
    """Whether a key speaks for a block: never rotated, or the block is at or before its last good block (or is the
    rotation itself), or a recovery rotation cannot reach it."""
    if entry["void"] or entry["frozen"]:
        return False
    by_hash = context["by_hash"]
    if _get(block, "state", "seq") is None:
        return history_counts(block, context["id"], by_hash)
    rotation = context["rotations"].get(entry["key"])
    if not rotation:
        return True
    if block["hash"] in rotation["all"] and (not rotation["recovery"] or rotation["by"] == block["hash"]):
        return not any(other != block["hash"] and sees(block, by_hash.get(other), by_hash) for other in rotation["all"])
    good = by_hash.get(rotation["lastGood"])
    if block["hash"] == rotation["lastGood"]:
        return True
    seq, good_seq = block["state"].get("seq"), _get(good, "state", "seq")
    if good and _js.is_int(good_seq) and _js.is_number(seq) and seq <= good_seq:
        return True
    return rotation["recovery"] and _beyond_reach(block, rotation, by_hash, context["arrived_at"])


def _beyond_reach(block, rotation, by_hash, arrived_at):
    """A recovery rotation cannot void a block that arrived, or that another identity built on and that arrived, before
    its reach began (the rotation's arrival, less recovery_reach). Without arrival times, everything is within reach."""
    if not rotation["floor"] or not arrived_at:
        return False
    author = _get(block, "refs", "author")
    users = [other for other in by_hash.values() if _get(other, "refs", "author") != author and block["hash"] in past_of(other, by_hash)]
    for one in [block, *users]:
        at = arrived_at(one["hash"])
        if at and at < rotation["floor"]:
            return True
    return False


def key_timeline(id_, blocks, arrived_at=None) -> list:
    """The keys an id has held, each { key, by, signer, void, frozen }."""
    return identity_of(id_, blocks, arrived_at)["keys"]


def keys_of(id_, blocks, arrived_at=None) -> list:
    return [entry["key"] for entry in key_timeline(id_, blocks, arrived_at) if not entry["void"]]


def signed_by_author(block, blocks, arrived_at=None) -> bool:
    """Whether a signed block is its author's: its signature opens with one of the id's keys that speaks for it, or it
    is a key grant the recovery key signed. Two recovery rotations that cross end the identity: then only what either
    of them saw still stands."""
    if is_genesis(block):
        return genesis_opens(block)
    by_hash = index_of(blocks)
    everything = by_hash if block["hash"] in by_hash else {**by_hash, block["hash"]: block}
    id_ = _get(block, "refs", "author")
    state = identity_of(id_, everything, arrived_at)
    if state["ended"] and not any(h == block["hash"] or block["hash"] in past_of(everything.get(h), everything) for h in state["ended"]):
        return False
    recovery_key = _get(block, "state", "recovery_key")
    if block.get("type") == "grant" and recovery_key in state["recovery"] and _opens(block, recovery_key):
        return True
    # The recovery key also signs defeats of a successor's trigger.
    if block.get("type") == "observe" and _js.truthy(_get(block, "refs", "defeats")) and any(_opens(block, key) for key in state["recovery"]):
        return True
    context = {"by_hash": everything, "rotations": state["rotations"], "arrived_at": arrived_at, "id": id_}
    return any(_opens(block, entry["key"]) and _speaks(entry, block, context) for entry in state["keys"])


def identity_state(id_, blocks, arrived_at=None) -> dict:
    """The identity fold (§11, What each fold returns): { signed_by_author (hash -> True when the block is the id's, for
    the genesis and every block naming it as author), keys (sorted, non-void), frozen (sorted), operators (sorted),
    history ('none' for a 1.6 genesis, 'open' or 'closed') }."""
    by_hash = index_of(blocks)
    root = by_hash.get(id_)
    timeline = key_timeline(id_, by_hash, arrived_at)
    firsts = any(_get(block, "refs", "author") == id_ and _get(block, "state", "seq") == 1 and not isinstance(_get(block, "state", "seq"), bool)
                 and _get(block, "refs", "prev") == id_ for block in by_hash.values())
    return {
        "signed_by_author": {block["hash"]: signed_by_author(block, by_hash, arrived_at) for block in by_hash.values()
                             if block["hash"] == id_ or _get(block, "refs", "author") == id_},
        "keys": sorted(entry["key"] for entry in timeline if not entry["void"]),
        "frozen": sorted(entry["key"] for entry in timeline if not entry["void"] and entry["frozen"]),
        "operators": operators_of(id_, by_hash),
        "history": "none" if root and is_16_genesis(root) else "closed" if firsts else "open",
    }


def signer_of(block, keys):
    """Which of an id's keys signed a block (its public key), or None."""
    return next((entry["key"] for entry in keys if _opens(block, entry["key"])), None)


def chains_of(id_, blocks) -> list:
    """Each key's chain for an id: [{ key, by, head, length, gaps, equivocations, broken, ok }]. Blocks without seq sit
    in no chain."""
    by_hash = index_of(blocks)
    mine = [block for block in by_hash.values() if _get(block, "refs", "author") == id_ and _js.is_int(_get(block, "state", "seq"))]
    return [{"key": entry["key"], "by": entry["by"], **check_chain([b for b in mine if _opens(b, entry["key"])], entry["by"])}
            for entry in key_timeline(id_, by_hash)]


def next_link_for(id_, public_key, blocks) -> dict:
    """Where an id's next block goes for one of its keys: { seq, prev }."""
    found = next((entry for entry in chains_of(id_, blocks) if entry["key"] == public_key), None)
    if not found:
        raise ValueError("identity: that key is not one of theirs")
    if found["equivocations"]:
        raise ValueError("identity: this key has signed two blocks with one seq")
    return next_link(found["head"], found["by"])
