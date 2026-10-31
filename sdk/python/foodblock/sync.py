"""The messages between nodes (protocol.md §9, §10): thin calls into the Rust core."""

from . import _door as door

new_challenge = door.new_challenge  # a new challenge value a node hands out at its `challenge` endpoint
push_request = door.push_request  # `for_whom` maps a sealed copy's hash to a list of ids
heads_of = door.heads_of
waited_too_long = door.waited_too_long
announcement = door.announcement
well_known_errors = door.well_known_errors


def _trim(options):
    return {k: v for k, v in options.items() if v is not None}


def _fresh(node, keys, highest, issued):
    """What the core wants to know of a node's memory: the signer's live keys, the highest counter seen from the signer,
    and the challenges issued and not yet used. No clock."""
    return {"node": node, "keys": list(keys or []), "highest": highest, "issued": list(issued or [])}


def pull_request(since=0, limit=None, filter=None, heads=None) -> dict:  # noqa: A002 (the protocol's word)
    return door.pull_request(_trim({"since": since, "limit": limit, "filter": filter, "heads": heads}))


def sign_pull(request, signer=None, node=None, private_key=None, suite=None, counter=None, challenge=None) -> dict:
    """A signed pull: the request, plus signer, node and exactly one of `counter` or `challenge`. No time."""
    return door.sign_pull(request or {}, _trim({"who": signer, "node": node, "private_key": private_key, "suite": suite, "counter": counter, "challenge": challenge}))


def sign_push(push, signer=None, node=None, private_key=None, suite=None, counter=None, challenge=None) -> dict:
    return door.sign_push(push, _trim({"who": signer, "node": node, "private_key": private_key, "suite": suite, "counter": counter, "challenge": challenge}))


def pull_refusals(message, node=None, keys=(), highest=None, issued=()) -> list:
    return door.pull_refusals(message or {}, _fresh(node, keys, highest, issued))


def push_refusals(message, node=None, keys=(), highest=None, issued=()) -> list:
    return door.push_refusals(message or {}, _fresh(node, keys, highest, issued))


def message_refusals(message, fields, node=None, keys=(), highest=None, issued=()) -> list:
    return door.message_refusals(message or {}, fields, _fresh(node, keys, highest, issued))


def matches(block, filter=None, held=None) -> bool:  # noqa: A002
    return door.matches(block, filter, held or [])


def answer_pull(log, request, node, private_key, cap, serves_pairs, signer=None, held=None, suite=None, through=None) -> dict:
    """Answer a pull from a node's arrival log [{ n, block, copies? }]. Signed by the node when `private_key` is given.
    The node states its two choices: `cap` (a whole number, 1 or more) and `serves_pairs` (True: a fork's other half
    travels with its proof). Nothing is filled in."""
    return door.answer_pull(list(log), request, node, private_key, {"cap": cap, "serves_pairs": serves_pairs}, signer, held, suite, through)


def answer_signed_by(answer, node_keys) -> bool:
    return door.answer_signed_by(answer, node_keys if isinstance(node_keys, list) else [node_keys])


def recipients_of(for_whom, hash_) -> list:
    """Who a sealed copy is for: `for` maps its hash to a list of ids."""
    return door.recipients_of(for_whom or {}, hash_)


def accept(incoming, held, takes_pairs, schemas=None) -> dict:
    """What a node takes of a push. Validity reads no arrival (core.md, section 8). `taken` are the blocks, each found by the id the
    core computed: `takes_pairs` is the node's own choice (True: both blocks of a pair arriving together are taken; False: neither, both listed in `equivocations`): in the suite of the key that signed it, found among `held` (core.md, section 2)."""
    held, incoming = list(held or []), list(incoming)
    out = door.accept(incoming, held, {"takes_pairs": takes_pairs}, None if schemas is None else list(schemas.values() if isinstance(schemas, dict) else schemas))
    by_hash = {b.get("hash"): b for b in incoming}
    everything = held + incoming

    def named(h):
        if h in by_hash:
            return by_hash[h]
        for b in incoming:
            if door.id_of(b, everything) == h:
                return {**b, "hash": h}
        return h
    return {**out, "taken": [named(h) for h in out["taken"]]}


def accept_sealed(incoming, held, takes_pairs) -> dict:
    """What a node takes of the sealed blocks of a push: the core checks each public header (a key of its author that speaks for it
    opens its signature; the same key's next seq; no rival) once the block it names in prev is held. `incoming` are sealed
    messages { header, header_signature, ... }; `held` whole blocks, sealed messages or their headers."""
    incoming, held = list(incoming), list(held or [])
    out = door.accept_sealed(incoming, held, {"takes_pairs": takes_pairs})
    by_hash = {m.get("header", {}).get("hash"): m for m in incoming}
    return {**out, "taken": [by_hash.get(h, h) for h in out["taken"]]}


def admission_refusals(block, receiver, blocks, admission, strangers_today) -> list:
    """What a node's admission and consent rules refuse of a block for a person: not_admitted, not_human.
    `admission` is the rule's state or an explicit None (no rule); `strangers_today` a whole number. Both are required."""
    return door.admission_refusals(block, receiver, blocks, admission, strangers_today)


def residency_refusals(block, holds_in=()) -> list:
    return door.residency_refusals(block, list(holds_in or []))


def push_answer(result, node, private_key, suite=None) -> dict:
    return door.push_answer(result, node, private_key, suite)


def well_known(node, holds, speaks_for, admission, endpoints=None) -> dict:
    # `admission` is the hash of the owner's admission block, or None for no rule: stated either way, never filled in
    return door.well_known(node, list(holds), list(speaks_for), admission, endpoints or {})
