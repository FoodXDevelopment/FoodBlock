"""The messages between nodes (protocol.md §9, §10): thin calls into the Rust core."""

from ._core import call
from .identity import _arrived


def _trim(options):
    return {k: v for k, v in options.items() if v is not None}


def _fresh(node, keys, highest, issued):
    """What the core wants to know of a node's memory: the signer's live keys, the highest counter seen from the signer,
    and the challenges issued and not yet used. No clock."""
    return {"node": node, "keys": list(keys or []), "highest": highest, "issued": list(issued or [])}


def pull_request(since=0, limit=None, filter=None, heads=None) -> dict:  # noqa: A002 (the protocol's word)
    return call("pull_request", _trim({"since": since, "limit": limit, "filter": filter, "heads": heads}))


def sign_pull(request, signer=None, node=None, private_key=None, suite=None, counter=None, challenge=None) -> dict:
    """A signed pull: the request, plus signer, node and exactly one of `counter` or `challenge`. No time."""
    return call("sign_pull", request or {}, _trim({"who": signer, "node": node, "private_key": private_key, "suite": suite, "counter": counter, "challenge": challenge}))


def sign_push(push, signer=None, node=None, private_key=None, suite=None, counter=None, challenge=None) -> dict:
    return call("sign_push", push, _trim({"who": signer, "node": node, "private_key": private_key, "suite": suite, "counter": counter, "challenge": challenge}))


def new_challenge() -> str:
    """A new challenge value a node hands out at its `challenge` endpoint."""
    return call("new_challenge")


def pull_refusals(message, node=None, keys=(), highest=None, issued=()) -> list:
    return call("pull_refusals", message or {}, _fresh(node, keys, highest, issued))


def push_refusals(message, node=None, keys=(), highest=None, issued=()) -> list:
    return call("push_refusals", message or {}, _fresh(node, keys, highest, issued))


def pull_errors(message, node=None, keys=(), highest=None, issued=()) -> list:
    return call("pull_errors", message or {}, _fresh(node, keys, highest, issued))


def push_errors(message, node=None, keys=(), highest=None, issued=()) -> list:
    return call("push_errors", message or {}, _fresh(node, keys, highest, issued))


def message_refusals(message, fields, node=None, keys=(), highest=None, issued=()) -> list:
    return call("message_refusals", message or {}, fields, _fresh(node, keys, highest, issued))


def matches(block, filter=None, held=None) -> bool:  # noqa: A002
    return call("matches", block, filter, list(held or []))


def heads_of(blocks) -> list:
    return call("heads_of", list(blocks))


def answer_pull(log, request=None, node=None, private_key=None, cap=500, signer=None, held=None, suite="std") -> dict:
    """Answer a pull from a node's arrival log [{ n, block, copies? }]. Signed by the node when `private_key` is given."""
    return call("answer_pull", list(log), request or {}, node, private_key, cap, signer, None if held is None else list(held), suite)


def answer_signed_by(answer, node_keys) -> bool:
    return call("answer_signed_by", answer, node_keys if isinstance(node_keys, list) else [node_keys])


def recipients_of(for_whom, hash_) -> list:
    """Who a sealed copy is for: `for` maps its hash to a list of ids."""
    return call("recipients_of", for_whom or {}, hash_)


def push_request(messages, for_whom=None) -> dict:
    """`for_whom` maps a sealed copy's hash to a list of ids."""
    return call("push_request", list(messages), for_whom)


def accept(incoming, held=(), arrived_at=None, schemas=None) -> dict:
    held, incoming = list(held or []), list(incoming)
    out = call("accept", incoming, held, _arrived(arrived_at, incoming + held), None if schemas is None else list(schemas.values() if isinstance(schemas, dict) else schemas))
    by_hash = {b.get("hash"): b for b in incoming}
    return {**out, "taken": [by_hash.get(h, h) for h in out["taken"]]}  # the core names what it took; here, the blocks


def accept_sealed(incoming, held=(), arrived_at=None) -> dict:
    """What a node takes of the sealed blocks of a push: the core checks each public header (a key of its author that speaks for it
    opens its signature; the same key's next seq; no rival) once the block it names in prev is held. `incoming` are sealed
    messages { header, header_signature, ... }; `held` whole blocks, sealed messages or their headers."""
    incoming, held = list(incoming), list(held or [])
    out = call("accept_sealed", incoming, held, _arrived(arrived_at, []))
    by_hash = {m.get("header", {}).get("hash"): m for m in incoming}
    return {**out, "taken": [by_hash.get(h, h) for h in out["taken"]]}


def waited_too_long(since, now, ttl) -> bool:
    return call("waited_too_long", since, now, ttl)


def admission_refusals(block, receiver, blocks, admission=None, strangers_today=0) -> list:
    """What a node's admission and strangers rules refuse of a block for a person: not_admitted, not_human."""
    return call("admission_refusals", block, receiver, list(blocks), admission or {}, strangers_today)


def residency_refusals(block, holds_in=()) -> list:
    return call("residency_refusals", block, list(holds_in or []))


def push_answer(result, node, private_key, suite="std") -> dict:
    return call("push_answer", result, node, private_key, suite)


def well_known(node=None, holds=(), speaks_for=(), admission=None, endpoints=None) -> dict:
    return call("well_known", node, list(holds), list(speaks_for), admission, endpoints or {})


def announcement(doc) -> dict:
    return call("announcement", doc)


def well_known_errors(doc) -> list:
    return call("well_known_errors", doc)
