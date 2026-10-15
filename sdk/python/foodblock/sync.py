"""The messages between nodes (protocol.md §9, §10): thin calls into the Rust core."""

from ._core import call
from .identity import _arrived


def _fresh(message, node, now, keys, seen, window):
    """The node's clock and memory, as data: `seen` may be a function (nonce -> bool) or a list of nonces."""
    nonce = message.get("nonce") if isinstance(message, dict) else None
    if callable(seen):
        seen = [nonce] if nonce and seen(nonce) else []
    return {"node": node, "now": now, "keys": list(keys or []), "seen": list(seen or []), "window_ms": window}


def _trim(options):
    return {k: v for k, v in options.items() if v is not None}


def pull_request(since=0, limit=None, filter=None, heads=None) -> dict:  # noqa: A002 (the protocol's word)
    return call("pull_request", _trim({"since": since, "limit": limit, "filter": filter, "heads": heads}))


def sign_pull(request, asker, node, private_key, nonce=None, at=None) -> dict:
    return call("sign_pull", request or {}, _trim({"who": asker, "node": node, "private_key": private_key, "nonce": nonce, "at": at}))


def pull_refusals(message, node=None, now=None, keys=(), seen=None, window=None) -> list:
    return call("pull_refusals", message, _trim(_fresh(message, node, now, keys, seen, window)))


def push_refusals(message, node=None, now=None, keys=(), seen=None, window=None) -> list:
    return call("push_refusals", message, _trim(_fresh(message, node, now, keys, seen, window)))


def pull_errors(message, node=None, now=None, keys=(), seen=None, window=None) -> list:
    return call("pull_errors", message, _trim(_fresh(message, node, now, keys, seen, window)))


def push_errors(message, node=None, now=None, keys=(), seen=None, window=None) -> list:
    return call("push_errors", message, _trim(_fresh(message, node, now, keys, seen, window)))


def matches(block, filter=None, held=None) -> bool:  # noqa: A002
    return call("matches", block, filter, list(held or []))


def heads_of(blocks) -> list:
    return call("heads_of", list(blocks))


def answer_pull(log, request=None, node=None, private_key=None, asker=None, cap=500, held=None) -> dict:
    """Answer a pull from a node's arrival log [{ n, block, copies?, header?, header_signature? }]."""
    request = {**(request or {}), **({"asker": asker} if asker else {})}
    return call("answer_pull", list(log), request, node, private_key, cap)


def answer_signed_by(answer, node_keys) -> bool:
    return call("answer_signed_by", answer, node_keys if isinstance(node_keys, list) else [node_keys])


def recipients_of(for_whom, hash_) -> list:
    """Who a sealed copy is for: `for` maps its hash to a list of ids; an older single id reads as a list of one."""
    return call("recipients_of", for_whom or {}, hash_)


def push_request(messages, for_whom=None) -> dict:
    """`for_whom` maps a sealed copy's hash to a list of ids (a single id is read as a list of one)."""
    return call("push_request", list(messages), for_whom)


def accept(incoming, held=(), arrived_at=None, schemas=None) -> dict:
    held, incoming = list(held or []), list(incoming)
    out = call("accept", incoming, held, _arrived(arrived_at, held), None if schemas is None else list(schemas.values() if isinstance(schemas, dict) else schemas))
    by_hash = {b.get("hash"): b for b in incoming}
    return {**out, "taken": [by_hash.get(h, h) for h in out["taken"]]}  # the core names what it took; here, the blocks


def waited_too_long(since, now, ttl) -> bool:
    return call("waited_too_long", since, now, ttl)


def push_answer(result, node, private_key) -> dict:
    return call("push_answer", result, node, private_key)


def well_known(node=None, holds=(), speaks_for=(), admission=None, endpoints=None) -> dict:
    return call("well_known", node, list(holds), list(speaks_for), admission, endpoints or {})


def announcement(doc) -> dict:
    return call("announcement", doc)


def well_known_errors(doc) -> list:
    return call("well_known_errors", doc)
