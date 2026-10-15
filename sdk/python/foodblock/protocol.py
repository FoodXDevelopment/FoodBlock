"""FoodBlock 1.6 (spec/protocol.md), as thin calls into the Rust core: canonical form, ids, signatures, the write check,
chains, commitments, envelopes, the wire and reading older shapes. No rule lives here."""

from ._core import call, Refused, FoodBlockError
from .spec import PROTOCOL, VERSION

PUBLIC = "public"
ALG, ALG_RAW = PROTOCOL["envelope"]["read"][0], PROTOCOL["envelope"]["read"][1]


def _blocks(held):
    """Blocks as a list, from a list or a hash -> block dict (or None)."""
    if held is None:
        return None
    return list(held.values()) if isinstance(held, dict) else list(held)


# ---- A block ----
def canonical(type_, state=None, refs=None) -> str:
    return call("canonical", type_, state or {}, refs or {})


def canonical_json(value) -> str:
    return call("canonical_json", value)


def hash(type_, state=None, refs=None) -> str:  # noqa: A001 (the protocol's word)
    return call("hash", type_, state or {}, refs or {})


def create(type_, state=None, refs=None) -> dict:
    return call("create", type_, state or {}, refs or {})


# ---- Signing ----
def generate_keypair() -> dict:
    return call("keypair", None)


def keypair_from_seed(seed_hex) -> dict:
    return call("keypair", seed_hex)


def sign(block, private_key_hex) -> str:
    return call("sign", block, private_key_hex)


def verify(block, signature_hex, public_key_sign) -> bool:
    return call("verify", block, signature_hex, public_key_sign)


def sign_message(part, private_key_hex) -> dict:
    return call("sign_message", part, private_key_hex)


def verify_message(part, public_key_hex) -> bool:
    return call("verify_message", part, public_key_hex)


# ---- Envelopes ----
def generate_encryption_keypair() -> dict:
    return call("encryption_keypair")


def encryption_key_of(private_hex) -> str:
    return call("encryption_key_of", private_hex)


def seal(value, recipient_keys, alg=ALG) -> dict:
    return call("seal", value, list(recipient_keys), alg)


def open(envelope, private_hex):  # noqa: A001 (the protocol's word)
    return call("open", envelope, private_hex)


# ---- The commitment ----
def new_salt() -> str:
    return call("new_salt")


def salted_hash(salt_hex, value) -> str:
    return call("salted_hash", salt_hex, value)


def commit(recipients, salts=None) -> dict:
    return call("commit", list(recipients), salts or {})


def finds_self(block, recipient, salt_hex) -> bool:
    return call("finds_self", block, recipient, salt_hex or "")


def reveal_for(salts, recipient) -> dict:
    return call("reveal_for", salts, recipient)


# ---- The write check and the words it asks for ----
def _check_args(type_, state, refs, schemas, held):
    return [type_, {} if state is None else state, {} if refs is None else refs, _blocks(held) or [], _blocks(schemas)]


def refusals(type_, state=None, refs=None, schemas=None, held=None) -> list:
    return call("refusals", *_check_args(type_, state, refs, schemas, held))


def check(type_, state=None, refs=None, schemas=None, held=None) -> list:
    return call("check", *_check_args(type_, state, refs, schemas, held))


def amount(value, unit) -> dict:
    return call("amount", value, unit)


def money(minor, currency) -> dict:
    return call("money", minor, currency)


def confidence(value) -> str:
    return call("confidence", value)


def terms(given=None, **more) -> dict:
    return call("terms", {**(given or {}), **more})


# ---- Reading older shapes ----
def read_as(block) -> dict:
    return call("read_as", block)


def is_a(block, type_, kind=None) -> bool:
    return call("is_a", block, type_, kind)


# ---- Chains and causal order ----
def next_link(last, brought_in=None) -> dict:
    return call("next_link", last, brought_in)


def check_chain(blocks, brought_in) -> dict:
    return call("check_chain", list(blocks), brought_in)


def causal_order(blocks) -> list:
    return call("causal_order", list(blocks))


def sees(later, earlier, blocks) -> bool:
    return call("sees", later, earlier, list(blocks))


# ---- Writing and the wire ----
def compose(type_, state=None, refs=None, author=None, audience=PUBLIC, after=(), at=None, link=None, salts=None) -> dict:
    return call("compose", type_, state or {}, refs or {}, _options(author=author, audience=audience, after=after, at=at, link=link, salts=salts))


def _options(audience=PUBLIC, after=(), **rest):
    options = {k: v for k, v in rest.items() if v is not None}
    if audience != PUBLIC:
        options["audience"] = list(audience)
    if after:
        options["after"] = list(after)
    return options


def write(type_, state=None, refs=None, author=None, key=None, held=(), schemas=None, link=None, **options) -> dict:
    """The one way to write: compose, check (refusing, never repairing), sign, chain. Raises Refused with every finding."""
    if not key:
        raise FoodBlockError("argument", "write: a block is signed by a key { public_key_sign, private_key }")
    given = _options(author=author, key=key, held=list(held or []), link=link, **options)
    if schemas is not None:
        given["schemas"] = _blocks(schemas)
    return call("write", type_, state or {}, refs or {}, given)


def wrap(signed, version=None) -> dict:
    return call("wrap", signed)


def unwrap(message) -> dict:
    return call("unwrap", message)


def header(block) -> dict:
    return call("header", block)


def header_signed_by(message, public_key) -> bool:
    return call("header_signed_by", message, public_key)


def seal_copy(signed, keys, reveals=(), private_key=None, alg=None, fixed=None) -> dict:
    return call("seal_copy", signed, list(keys), list(reveals or []), private_key)


def open_copy(message, x25519_private) -> dict:
    return call("open_copy", message, x25519_private)
