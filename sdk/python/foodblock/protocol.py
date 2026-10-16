"""FoodBlock 1.6 (spec/protocol.md), as thin calls into the Rust core: canonical form, ids, signatures, the write check,
chains, commitments, envelopes and the wire. No rule lives here."""

from ._core import call, Refused, FoodBlockError
from .spec import PROTOCOL, VERSION

PUBLIC = "public"
ALG = PROTOCOL["suites"]["std"]["envelope"]


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


def hash(type_, state=None, refs=None, suite="std") -> str:  # noqa: A001 (the protocol's word)
    """The id: the hash of the canonical form in the hash of the suite of the key that signs it."""
    return call("hash", type_, state or {}, refs or {}, suite)


def create(type_, state=None, refs=None, suite="std") -> dict:
    """{ hash, type, state, refs } (and `suite` when it is not std). Strict: a null, a float or text outside NFC is refused."""
    return call("create", type_, state or {}, refs or {}, suite)


# ---- Signing ----
def generate_keypair(suite="std") -> dict:
    return call("keypair", None, suite)


def keypair_from_seed(seed_hex, suite="std") -> dict:
    return call("keypair", seed_hex, suite)


def sign(block, private_key_hex, suite="std") -> str:
    return call("sign", block, private_key_hex, suite)


def suite_of_key(public_key_hex):
    """The suite a signing key (SPKI hex) belongs to, or None."""
    return call("suite_of_key", str(public_key_hex))


def passkey_challenge(block_or_part) -> str:
    """The challenge to ask a passkey to sign: base64url of the SHA-256 of the signed bytes (for a block, its id)."""
    return call("passkey_challenge", block_or_part)


def passkey_signature(authenticator_data_hex, client_data_json_hex, signature_hex) -> str:
    """A passkey's WebAuthn answer (each part as hex; the signature may be DER) as a FoodBlock signature, hex."""
    return call("passkey_signature", str(authenticator_data_hex), str(client_data_json_hex), str(signature_hex))


def verify(block, signature_hex, public_key_sign) -> bool:
    return call("verify", block, signature_hex, public_key_sign)


def sign_message(part, private_key_hex, suite="std") -> dict:
    return call("sign_message", part, private_key_hex, suite)


def verify_message(part, public_key_hex) -> bool:
    return call("verify_message", part, public_key_hex)


# ---- Envelopes ----
def generate_encryption_keypair(suite="std") -> dict:
    return call("encryption_keypair", suite)


def encryption_key_of(private_hex, suite="std") -> str:
    return call("encryption_key_of", private_hex, suite)


def seal(value, recipient_keys, suite="std", fixed=None) -> dict:
    """`fixed` exists only to reproduce a vector."""
    return call("seal", value, list(recipient_keys), suite, fixed)


def open(envelope, private_hex):  # noqa: A001 (the protocol's word)
    return call("open", envelope, private_hex)


# ---- The commitment ----
def new_salt() -> str:
    return call("new_salt")


def salted_hash(salt_hex, value, suite="std") -> str:
    return call("salted_hash", salt_hex, value, suite)


def commit(recipients, salts=None, suite="std") -> dict:
    return call("commit", list(recipients), salts or {}, suite)


def finds_self(block, recipient, salt_hex) -> bool:
    return call("finds_self", block, recipient, salt_hex or "")


def reveal_for(salts, recipient) -> dict:
    return call("reveal_for", salts, recipient)


# ---- The write check and the words it asks for ----
def _check_args(type_, state, refs, schemas, held):
    return [type_, {} if state is None else state, {} if refs is None else refs, _blocks(held) or [], _blocks(schemas)]


def refusals(type_, state=None, refs=None, schemas=None, held=None) -> list:
    return call("refusals", *_check_args(type_, state, refs, schemas, held))


def valid(block, held=None, schemas=None, arrivals=None) -> list:
    """Every refusal of a signed block against the blocks held ([] when valid). `arrivals` is { hash: time } data."""
    return call("valid", block, _blocks(held) or [], _blocks(schemas), arrivals)


def strict_text(text) -> list:
    """Strict writing from JSON text: a repeated key, then every refusal of the block it holds."""
    return call("strict_text", str(text))


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


# ---- Chains and causal order ----
def next_link(last, brought_in=None) -> dict:
    return call("next_link", last, brought_in)


def check_chain(blocks, brought_in) -> dict:
    """{ head, length, gaps, skips, equivocations (pairs naming one prev), broken, ok }"""
    return call("check_chain", list(blocks), brought_in)


def causes_of(block) -> list:
    return call("causes_of", block)


def past_of(block, blocks) -> list:
    return call("past_of", block, list(blocks))


def heads_among(blocks) -> list:
    return call("heads_among", list(blocks))


def is_time(value) -> bool:
    return call("is_time", value)


def is_date(value) -> bool:
    return call("is_date", value)


def causal_order(blocks) -> list:
    return call("causal_order", list(blocks))


def sees(later, earlier, blocks) -> bool:
    return call("sees", later, earlier, list(blocks))


# ---- Writing and the wire ----
def compose(type_, state=None, refs=None, author=None, audience=PUBLIC, after=(), at=None, link=None, salts=None, suite=None, skip=None, clockless=None, nonce=None) -> dict:
    return call("compose", type_, state or {}, refs or {}, _options(author=author, audience=audience, after=after, at=at, link=link, salts=salts, suite=suite, skip=skip, clockless=clockless, nonce=nonce))


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


def seal_copy(signed, keys, reveals=(), private_key=None, fixed=None, suite="std") -> dict:
    return call("seal_copy", signed, list(keys), list(reveals or []), private_key, fixed, suite)


def open_copy(message, x25519_private) -> dict:
    return call("open_copy", message, x25519_private)
