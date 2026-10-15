"""Between nodes (protocol.md §10, Encoding: Messages): two messages, Pull and Push. Pull asks for the blocks the asker
may see since the responder's arrival number (never a time); `heads: True` returns only the heads among the matches. A
signed pull names the asker, the node it is for, a fresh nonce and `at`. Push sends signed blocks; a node takes those
signed by a live key of their author that pass the write check, holds back (waiting) those whose prev it lacks, lists
the second of two blocks at one seq beside the first (`equivocations`), and refuses the rest, each { hash, code,
detail } with a code from protocol.json's refusals.codes. Every node answer is signed by the node (invariant 18)."""

import hashlib
import os
import re

from . import _js
from .aliases import read_as
from .canonical import canonical_json
from .identity import signed_by_author, key_timeline, signer_of, is_genesis, is_16_genesis, history_counts
from .order import causal_order, index_of
from .grant import add_duration
from .protocol import refusals, ordered
from .sign import sign_message, verify_message
from .spec import VERSION, PROTOCOL, LIMITS, matches as _grammar
from .write import wrap

M = PROTOCOL["messages"]
_URL = re.compile(r"https?://")


def _list(ref):
    return ref if isinstance(ref, list) else [ref] if _js.truthy(ref) else []


def _get(value, *path):
    for key in path:
        value = value.get(key) if isinstance(value, dict) else None
    return value


def _pick(value, keys):
    return {key: value[key] for key in keys if value.get(key) is not None}


# ---- Pull ----
def pull_request(since=0, limit=None, filter=None, heads=None) -> dict:  # noqa: A002 (the protocol's word)
    """A pull: { since (exclusive arrival number, 0 from the start), limit (the asker's wish), filter, heads }."""
    return _pick({"since": since, "limit": limit, "filter": filter, "heads": heads}, M["pull"])


def sign_pull(request, asker, node, private_key, nonce=None, at=None) -> dict:
    """A signed pull: the request, plus asker, node, a fresh nonce and at, signed by one of the asker's keys."""
    request = pull_request(**{k: v for k, v in (request or {}).items() if k in M["pull"]})
    return sign_message({**request, "asker": asker, "node": node, "nonce": nonce or os.urandom(16).hex(), "at": at or _js.now_iso()}, private_key)


# How far a signed message's `at` may be from the node's clock, either way (protocol.json limits.signed_window), in ms.
_EPOCH = "2000-01-01T00:00:00.000Z"
WINDOW = _js.parse_ms(add_duration(_EPOCH, LIMITS["signed_window"])) - _js.parse_ms(_EPOCH)


def message_refusals(message, node=None, now=None, keys=(), seen=None, window=WINDOW, fields=None) -> list:
    """Why a node refuses a signed message (a pull, or a push: `fields` its keys), for the node `node` whose clock reads
    `now`: [{code, detail}] with codes from protocol.json's refusals.codes.message, [] when it may be answered. `keys`
    are the signer's live signing keys; `seen(nonce)` says whether the node has seen this nonce; `window` (ms, default
    limits.signed_window) is how far `at` may be from its own clock."""
    message = message if isinstance(message, dict) else {}
    fields = M["signed_pull"] if fields is None else fields
    now = now or _js.now_iso()
    w = lambda code, detail: {"code": code, "detail": detail}  # noqa: E731
    out = [] if all(key in fields for key in message) else [w("bad_signature", f"a signed message is {{ {', '.join(fields)} }}")]
    out += [] if message.get("node") == node else [w("wrong_node", "the message names another node")]
    if _grammar("nonce", message.get("nonce") or ""):
        out += [w("replay", "this nonce was seen: a replay")] if seen and seen(message["nonce"]) else []
    else:
        out.append(w("replay", "a signed message carries a fresh nonce"))
    at, clock = _js.parse_ms(message.get("at")), _js.parse_ms(now)
    ok = _grammar("time", message.get("at") or "") and at is not None and clock is not None and abs(at - clock) <= window
    out += [] if ok else [w("window", "its at is outside this node's window")]
    out += [] if any(verify_message(message, key) for key in keys) else [w("bad_signature", "it is not signed by its signer")]
    return ordered(out, PROTOCOL["refusals"]["codes"]["message"])


def pull_refusals(message, node=None, now=None, keys=(), seen=None, window=WINDOW) -> list:
    """Why a node refuses a signed pull: [{code, detail}]."""
    return message_refusals(message, node=node, now=now, keys=keys, seen=seen, window=window, fields=M["signed_pull"])


def push_refusals(message, node=None, now=None, keys=(), seen=None, window=WINDOW) -> list:
    """Why a node refuses a signed push: [{code, detail}]."""
    return message_refusals(message, node=node, now=now, keys=keys, seen=seen, window=window, fields=M["signed_push"])


def pull_errors(message, node=None, now=None, keys=(), seen=None, window=WINDOW) -> list:
    """What is wrong with a signed pull, in plain words: [] when it may be answered."""
    return [one["detail"] for one in pull_refusals(message, node=node, now=now, keys=keys, seen=seen, window=window)]


def _record_of(block, held):
    """Every first version a block is a version of (itself, and back through `updates`)."""
    by_hash, out, seen = index_of(held or []), [], set()

    def walk(one):
        if not one or one["hash"] in seen:
            return
        seen.add(one["hash"])
        out.append(one["hash"])
        for h in _list(_get(one, "refs", "updates")):
            walk(by_hash.get(h) or {"hash": h, "refs": {}})

    walk(block)
    return out


def matches(block, filter=None, held=None) -> bool:  # noqa: A002
    """Whether a block matches a pull filter (every key, ANDed; `type` read through aliases). `held` resolves records."""
    if not filter:
        return True
    read = read_as(block)
    if filter.get("type") is not None and read.get("type") != filter["type"]:
        return False
    if filter.get("kind") is not None and _get(read, "state", "kind") != filter["kind"]:
        return False
    if filter.get("author") is not None and _get(block, "refs", "author") != filter["author"]:
        return False
    if filter.get("hash") is not None and block.get("hash") != filter["hash"]:
        return False
    if filter.get("record") is not None and filter["record"] not in _record_of(block, held):
        return False
    return all(h in _list(_get(read, "refs", key)) for key, h in (filter.get("refs") or {}).items())


def heads_of(blocks) -> list:
    """The heads among blocks: those no other among them names by prev or updates."""
    named = set(h for block in blocks for h in [*_list(_get(block, "refs", "prev")), *_list(_get(block, "refs", "updates"))])
    return [block for block in blocks if block["hash"] not in named]


def answer_pull(log, request=None, node=None, private_key=None, asker=None, cap=500, held=None) -> dict:
    """Answer a pull from a node's arrival log [{ n, block, copies?, header?, header_signature? }] (n numbered 1, 2, 3
    as blocks were taken in, never reused; `copies` the sealed copies by recipient id). A public block travels whole; a
    sealed one as its header, or, to a signed pull's asker, the copy sealed to them. Signed by the node: { node,
    request, blocks: [{ n, message }], next, signature }. `cap` is the responder's own limit."""
    request = request or {}
    asker = asker or request.get("asker")
    since = int(_js.number(request.get("since") or 0))
    limit = min(int(_js.number(request.get("limit") or cap)), cap)
    pool = held or [entry["block"] for entry in log]
    found = sorted((entry for entry in log if entry["n"] > since and matches(entry["block"], request.get("filter"), pool)), key=lambda e: e["n"])
    if request.get("heads"):
        tops = set(block["hash"] for block in heads_of([entry["block"] for entry in found]))
        found = [entry for entry in found if entry["block"]["hash"] in tops]
    found = found[:limit]

    def message_of(entry):
        block = entry["block"]
        audience = _get(block, "state", "audience")
        if audience == "public" or not isinstance(audience, list):
            return wrap(block)
        if asker and (entry.get("copies") or {}).get(asker):
            return entry["copies"][asker]
        top = entry.get("header") or {k: v for k, v in {"author": block["refs"].get("author"), "seq": block["state"].get("seq"),
                                                        "prev": block["refs"].get("prev"), "hash": block["hash"]}.items() if v is not None}
        sealed = {"version": VERSION, "header": top}
        if entry.get("header_signature"):
            sealed["header_signature"] = entry["header_signature"]
        return sealed

    answer = {"node": node, "request": hashlib.sha256(canonical_json(request).encode("utf-8")).hexdigest(),
              "blocks": [{"n": entry["n"], "message": message_of(entry)} for entry in found],
              "next": found[-1]["n"] if found else since}
    return sign_message(answer, private_key) if private_key else answer


def answer_signed_by(answer, node_keys) -> bool:
    """Whether a node's answer (pull or push) is signed by one of the node's keys. Two signed answers that differ for one
    arrival number prove a lie."""
    keys = node_keys if isinstance(node_keys, list) else [node_keys]
    return any(verify_message(answer, key) for key in keys)


# ---- Push ----
def push_request(messages, for_whom=None) -> dict:
    return _pick({"messages": messages, "for": for_whom}, M["push"])


def accept(incoming, held=(), arrived_at=None, schemas=None) -> dict:
    """What a node takes of a push: { taken, waiting: [{ hash, needs }], refused: [{ hash, code, detail }],
    equivocations }. A block without seq is taken only as history: an older identity's, while its history is open or
    inside its closed history (a grant or an answer there stands). A 1.6 block passes the write check and is signed by a
    key of its author that speaks for it (`bad_signature` when no key of the author opens it, `void_key` when one does
    but does not speak); one whose key's previous block is not held waits. The second of two blocks from one key at one
    seq is neither taken nor refused: the pair is listed in `equivocations` (sorted), and the node keeps both as proof."""
    incoming, held = list(incoming), list(held or [])
    known = index_of(held + incoming)
    has = set(known)
    taken, refused, waiting, equivocations, slots = [], [], [], [], {}

    def slot(block):
        key = signer_of(block, key_timeline(block["refs"].get("author"), known))
        return f"{block['refs']['author']} {key} {block['state']['seq']}" if key else None

    for block in held:
        if _js.is_int(_get(block, "state", "seq")) and _js.truthy(_get(block, "refs", "author")):
            at = slot(block)
            if at:
                slots[at] = block["hash"]

    def refuse(block, code, detail):
        refused.append({"hash": block["hash"], "code": code, "detail": detail})

    def unsigned(block):
        """Not the author's: no key of the author opens it (bad_signature), or one does but does not speak (void_key)."""
        if is_genesis(block):
            return refuse(block, "bad_genesis", "a genesis is signed by its own key")
        recovery = _get(block, "state", "recovery_key")
        opened = signer_of(block, key_timeline(_get(block, "refs", "author"), known)) \
            or (_js.truthy(recovery) and signer_of(block, [{"key": recovery}]))
        if opened:
            return refuse(block, "void_key", "signed by a key of its author that does not speak for it: void, frozen, or rotated past last_good")
        return refuse(block, "bad_signature", "its signature opens with no key of its author")

    for block in causal_order(incoming):
        if not is_genesis(block) and _get(block, "state", "seq") is None:
            root = known.get(_get(block, "refs", "author")) if isinstance(_get(block, "refs", "author"), str) else None
            if root and is_16_genesis(root):
                refuse(block, "no_history", "a 1.6 identity has no history: a block without seq is refused")
                continue
            if root and not history_counts(block, root["hash"], known):
                refuse(block, "history_closed", "history is closed: it is in neither the first 1.6 block's causal past nor its manifest")
                continue
            if not signed_by_author(block, known, arrived_at):
                unsigned(block)
                continue
            taken.append(block)
            continue
        wrong = refusals(block["type"], block.get("state"), block.get("refs"), schemas=schemas)
        if wrong:
            for one in wrong:
                refuse(block, one["code"], one["detail"])
            continue
        prev = _get(block, "refs", "prev")
        if not is_genesis(block) and _js.truthy(prev) and prev not in has:
            waiting.append({"hash": block["hash"], "needs": [prev]})
            continue
        if not signed_by_author(block, known, arrived_at):
            unsigned(block)
            continue
        state = block.get("state") or {}
        if block["type"] == "grant" and state.get("kind") == "key" and _js.truthy(state.get("replaces")) and not _js.truthy(state.get("recovery_key")) \
                and signer_of(block, key_timeline(block["refs"]["author"], known)) != state["replaces"]:
            refuse(block, "not_own_rotation", "a key is rotated only by itself or by the recovery key")
            continue
        at = slot(block) if _js.is_int(state.get("seq")) else None
        # The second of a pair: neither taken nor refused, listed with the first. The node keeps both and serves them together.
        if at and at in slots and slots[at] != block["hash"]:
            equivocations.append(sorted([slots[at], block["hash"]]))
            continue
        if at:
            slots[at] = block["hash"]
        taken.append(block)
    return {"taken": taken, "waiting": waiting, "refused": refused, "equivocations": equivocations}


def waited_too_long(since, now, ttl) -> bool:
    """Whether a waiting block has waited past the node's own time to live (`ttl` ms since it arrived)."""
    a, b = _js.parse_ms(since), _js.parse_ms(now)
    return a is not None and b is not None and b - a > ttl


def push_answer(result, node, private_key) -> dict:
    """A node's signed answer to a push (signed by a key of its holder, a person or a machine, brought in by a key
    grant): { node, taken, waiting, refused: [{ hash, code, detail }], equivocations: [[hash, hash]], signature }. Every
    key is always there; an empty list is []. Each pair is sorted as text."""
    as_hash = lambda item: item["hash"] if isinstance(item, dict) else item  # noqa: E731
    return sign_message({"node": node, "taken": [as_hash(b) for b in result.get("taken") or []],
                         "waiting": [as_hash(w) for w in result.get("waiting") or []],
                         "refused": [{"hash": r["hash"], "code": r.get("code"), "detail": r.get("detail")} for r in result.get("refused") or []],
                         "equivocations": [sorted(pair) for pair in result.get("equivocations") or []]}, private_key)


# ---- Discovery ----
def well_known(node=None, holds=(), speaks_for=(), admission=None, endpoints=None) -> dict:
    """What a node publishes at `.well-known/foodblock`."""
    endpoints = endpoints or {}
    return {"protocol": "foodblock", "version": VERSION, "node": node, "holds": list(holds), "speaks_for": list(speaks_for),
            "admission": admission, "endpoints": {key: endpoints.get(key) or None for key in M["endpoints"]}}


def announcement(doc) -> dict:
    """A local announcement (mDNS / DNS-SD or a short-range link): { protocol, version, node, endpoints }."""
    return _pick(doc, M["announcement"])


def well_known_errors(doc) -> list:
    """What is wrong with a `.well-known/foodblock` document, in plain words."""
    if not isinstance(doc, dict) or doc.get("protocol") != "foodblock":
        return ['protocol is "foodblock"']
    out = [f"{key} is not part of discovery ({', '.join(M['discovery'])})" for key in doc if key not in M["discovery"]]
    out += [] if isinstance(doc.get("version"), str) else ["version names the rules the node speaks"]
    out += [] if _grammar("hash", doc.get("node") or "") else ["node is the id of the node (an actor)"]
    for key in ("holds", "speaks_for"):
        out += [] if isinstance(doc.get(key), list) and all(_grammar("hash", h) for h in doc[key]) else [f"{key} lists ids (hashes)"]
    admission_null = "admission" in doc and doc["admission"] is None
    out += [] if admission_null or _grammar("hash", doc.get("admission") or "") else ["admission is the hash of the admission block"]
    endpoints = doc.get("endpoints")
    ok = isinstance(endpoints, dict) and _js.truthy(endpoints) and all(key in M["endpoints"] for key in endpoints) and all(
        (key in endpoints and endpoints[key] is None) or (isinstance(endpoints.get(key), str) and _URL.match(endpoints[key])) for key in M["endpoints"])
    out += [] if ok else [f"endpoints: {{ {', '.join(M['endpoints'])} }} are URLs"]
    return out

