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


def matches(block, filter=None, blocks=None) -> bool:  # noqa: A002
    return door.matches(block, filter, blocks or [])


def answer_pull(log, request, node, private_key, cap, serves_pairs, signer=None, blocks=None, suite=None, through=None) -> dict:
    """Answer a pull from a node's arrival log [{ n, block, copies? }]. Signed by the node when `private_key` is given.
    The node states its two choices: `cap` (a whole number, 1 or more) and `serves_pairs` (True: a fork's other half
    travels with its proof). Nothing is filled in."""
    return door.answer_pull(list(log), request, node, private_key, {"cap": cap, "serves_pairs": serves_pairs}, signer, blocks, suite, through)


def answer_signed_by(answer, node_keys) -> bool:
    return door.answer_signed_by(answer, node_keys if isinstance(node_keys, list) else [node_keys])


def recipients_of(for_whom, hash_) -> list:
    """Who a sealed copy is for: `for` maps its hash to a list of ids."""
    return door.recipients_of(for_whom or {}, hash_)


def accept(incoming, blocks, takes_pairs, schemas=None) -> dict:
    """What a node takes of a push (nodes.md, Push): { taken, unjudged, refused, unread, equivocations, false_headers }. `incoming` are blocks
    and sealed header messages { header, header_signature, envelope? }. `takes_pairs` is the node's own stated choice, required (True:
    the blocks of a forked pair are taken as well as listed; False: neither). Validity reads no arrival (core.md, section 8).
    `taken` are the blocks, each found by the id the core computed in the suite of the key that signed it (a sealed message by its header's hash)."""
    blocks, incoming = list(blocks or []), list(incoming)
    out = door.accept(incoming, blocks, {"takes_pairs": takes_pairs}, None if schemas is None else list(schemas.values() if isinstance(schemas, dict) else schemas))
    by_hash = {b.get("hash", (b.get("header") or {}).get("hash")): b for b in incoming}
    everything = blocks + incoming

    def named(h):
        if h in by_hash:
            return by_hash[h]
        for b in incoming:
            if b.get("type") and door.id_of(b, everything) == h:
                return {**b, "hash": h}
        return h
    return {**out, "taken": [named(h) for h in out["taken"]]}


def admission_refusals(block, receiver, blocks, admission, asks_today) -> list:
    """What a node's admission and consent rules refuse of a block for a person: not_admitted, not_human. `admission` is the rule's
    state or an explicit None (no rule); `asks_today` a whole number (the asks it took today from this sender). Both are required."""
    return door.admission_refusals(block, receiver, blocks, admission, asks_today)


def strict_push(text) -> dict:
    """A push read from its text (nodes.md, Push): { refused, messages }."""
    return door.strict_push(str(text))


def log_shown(receipts, request, answer, blocks=()) -> dict:
    """What a door log's signed words show (nodes.md, The arrival log): { left_out, stopped_short }."""
    return door.log_shown(list(receipts), request, answer, list(blocks or []))


def export_whole(document, log, last) -> dict:
    """Whether her export is whole (nodes.md, A host): { whole, lacks }."""
    return door.export_whole(document, str(log), str(last))


def residency_refusals(block, holds_in=()) -> list:
    return door.residency_refusals(block, list(holds_in or []))


def push_answer(result, node, private_key, suite=None) -> dict:
    return door.push_answer(result, node, private_key, suite)


def well_known(node, reads, admission, endpoints=None, log=None) -> dict:
    """The discovery document. `admission` is the hash of the owner's admission block, or None for no rule: stated either way, never filled in.
    `reads`: the rule sets the node runs (core.md, section 11), listed only where it runs a build made from that set's files."""
    return door.well_known(node, list(reads or []), admission, endpoints or {}, log)
