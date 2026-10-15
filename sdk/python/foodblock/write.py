"""Writing a block and carrying it (protocol.md §1, §9, Encoding: Messages). `compose` stamps an author's words with
what every block carries (who, when, its place in the signing key's chain, what was seen, who may see it); `write` is
the one path every writer shares: compose, check, sign, chain. On the wire a public block is
{ version, block, signature }; a sealed one is { version, header, header_signature, envelope }, its public header
{ author, seq, prev, hash } signed by the key that signed the block, its body sealed to the audience."""

from . import _js
from .audience import commit, new_salt
from .block import create, hash
from .canonical import canonical
from .envelope import seal, open as open_envelope
from .protocol import refusals
from .sign import sign, sign_message, verify_message
from .spec import VERSION, LIMITS, PROTOCOL

PUBLIC = "public"


class Refused(ValueError):
    """The write check refused a block; `refused` lists every finding ({code, detail}), `wrong` their details."""

    def __init__(self, refused):
        super().__init__("write: refused: " + "; ".join(f"{one['code']}: {one['detail']}" for one in refused))
        self.refused = refused
        self.wrong = [one["detail"] for one in refused]


class TooLarge(ValueError):
    """A block over limits.block_bytes (a sealed copy's block, once opened): `code` is size_limit."""

    code = "size_limit"


def compose(type_, state=None, refs=None, author=None, audience=PUBLIC, after=(), at=None, link=None, salts=None) -> dict:
    """A block as its author says it: `link` ({ seq, prev }, from next_link or identity.next_link_for), `audience`
    ('public', or recipients: people, circles, `circle#role`, written as commitments with a nonce), `after` (heads
    seen), `at`. A private block comes back with its salts beside it (`salts`), never signed."""
    state, refs = dict(state or {}), dict(refs or {})
    if not author:
        raise ValueError("write: a block names its author")
    at = at or _js.now_iso()
    if _js.parse_ms(at) is None:
        raise ValueError("write: at is a time")
    seen = sorted(set(after or ()))
    if audience == PUBLIC:
        written, given = PUBLIC, None
    else:
        made = commit(audience if isinstance(audience, list) else [], salts)
        written, given = made["audience"], made["salts"]
    extra = {"seq": link["seq"]} if link else {}
    if given and not state.get("nonce"):
        extra["nonce"] = new_salt()
    block = create(type_, {**state, "at": at, "audience": written, **extra},
                   {**refs, "author": author, **({"prev": link["prev"]} if link else {}), **({"after": seen} if seen else {})})
    return {**block, "salts": given} if given else block


def write(type_, state=None, refs=None, author=None, key=None, held=(), schemas=None, link=None, **options) -> dict:
    """The one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next place
    in that key's chain among `held` (the author's genesis, key grants and blocks). `key`: { public_key_sign,
    private_key }. Returns the signed block ({ hash, type, state, refs, signature }, and `salts` for a private one);
    raises Refused with every finding when the check refuses."""
    from .identity import next_link_for
    held = list(held or [])
    block = compose(type_, state, refs, author=author, link=link or next_link_for(author, key["public_key_sign"], held), **options)
    refused = refusals(block["type"], block["state"], block["refs"], schemas=schemas, held={one["hash"]: one for one in held})
    if refused:
        raise Refused(refused)
    return {**block, "signature": sign(block, key["private_key"])}


# ---- Messages ----
def wrap(signed, version=VERSION) -> dict:
    """A signed public block as it travels: { version, block, signature }. Never the hash: readers recompute it."""
    return {"version": version, "block": {"type": signed["type"], "state": signed.get("state") or {}, "refs": signed.get("refs") or {}},
            "signature": signed["signature"]}


def unwrap(message) -> dict:
    """A block off the wire: its hash recomputed from its content, its signature and version kept beside."""
    inner = (message or {}).get("block") if isinstance(message, dict) else None
    inner = inner if isinstance(inner, dict) else {}
    type_, state, refs = inner.get("type"), inner.get("state") or {}, inner.get("refs") or {}
    if not isinstance(type_, str) or not isinstance(message.get("signature"), str):
        raise ValueError("write: a message is { version, block, signature }")
    if len(canonical(type_, state, refs).encode("utf-8")) > LIMITS["block_bytes"]:
        raise TooLarge(f"write: a block is at most {LIMITS['block_bytes']} bytes")
    out = {"hash": hash(type_, state, refs), "type": type_, "state": state, "refs": refs,
           "signature": message["signature"], "version": message.get("version")}
    if message.get("reveals"):
        out["reveals"] = message["reveals"]
    return out


def header(block) -> dict:
    """A block's public header: { author, seq, prev, hash }."""
    state, refs = block.get("state") or {}, block.get("refs") or {}
    top = {"author": refs.get("author"), "seq": state.get("seq"), "prev": refs.get("prev"),
           "hash": block.get("hash") or hash(block["type"], state, refs)}
    return {k: v for k, v in top.items() if v is not None}


def seal_copy(signed, keys, reveals=(), private_key=None, alg=None, fixed=None) -> dict:
    """A sealed copy: { version, header, header_signature, envelope }. The plaintext { version, block, signature,
    reveals } is sealed to `keys` (encryption keys). A copy with reveals goes to one recipient, or to several who share
    every reveal (the members of one circle). `private_key` is the key that signed the block."""
    top = header(signed)
    options = {**({"alg": alg} if alg else {}), **({"fixed": fixed} if fixed else {})}
    return {"version": VERSION, "header": top, "header_signature": sign_message(top, private_key)["signature"],
            "envelope": seal({**wrap(signed), "reveals": list(reveals)}, keys, **options)}


def header_signed_by(message, public_key) -> bool:
    """Whether a sealed copy's header is signed by this key (the key that signed the block)."""
    return verify_message({**(message.get("header") or {}), "signature": message.get("header_signature")}, public_key)


def open_copy(message, x25519_private) -> dict:
    """Open a sealed copy with a recipient's X25519 private key: the block, its signature and its reveals. The header
    must name it."""
    plaintext = open_envelope(message["envelope"], x25519_private)
    if not isinstance(plaintext, dict) or not all(key == "reveals" or key in plaintext for key in PROTOCOL["messages"]["plaintext"]):
        raise ValueError("write: a plaintext is { version, block, signature, reveals }")
    inside = unwrap(plaintext)
    if message.get("header") and message["header"].get("hash") != inside["hash"]:
        raise ValueError("write: the header names another block")
    return {**inside, "reveals": plaintext.get("reveals") or []}
