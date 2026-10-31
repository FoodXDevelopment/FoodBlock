"""FoodBlock (spec/protocol.md), as thin calls into the Rust core: canonical form, ids, signatures, the write check,
chains, commitments, envelopes and the wire. No rule lives here."""

from . import _door as door
from ._core import Refused, FoodBlockError
from .spec import PROTOCOL, VERSION

PUBLIC = "public"
ALG = PROTOCOL["suites"]["std"]["envelope"]

canonical_json = door.canonical_json
new_salt = door.new_salt
amount = door.amount
money = door.money
is_time = door.is_time
is_date = door.is_date
causes_of = door.causes_of
past_of = door.past_of
heads_among = door.heads_among
causal_order = door.causal_order
header = door.header
header_signed_by = door.header_signed_by
open_copy = door.open_copy
next_link = door.next_link
reveal_for = door.reveal_for
sign_message = door.sign_message
verify = door.verify
verify_message = door.verify_message
passkey_challenge = door.passkey_challenge  # the challenge to ask a passkey to sign: base64url of the SHA-256 of the signed bytes (for a block, its id)
strict_text = door.strict_text  # strict writing from JSON text: a repeated key, then every refusal of the block it holds
open = door.open  # noqa: A001 (the protocol's word)


def _blocks(held):
    """Blocks as a list, from a list or a hash -> block dict (or None)."""
    if held is None:
        return None
    return list(held.values()) if isinstance(held, dict) else list(held)


# ---- A block ----
def canonical(type_, state=None, refs=None) -> str:
    return door.canonical(type_, state or {}, refs or {})


def hash(type_, state=None, refs=None, suite=None) -> str:  # noqa: A001 (the protocol's word)
    """The id: the hash of the canonical form in the hash of the suite of the key that signs it."""
    return door.hash(type_, state or {}, refs or {}, suite)


def create(type_, state=None, refs=None, suite=None) -> dict:
    """{ hash, type, state, refs }. The suite comes from the key. Strict: a null, a float or text outside NFC is refused."""
    return door.create(type_, state or {}, refs or {}, suite)


# ---- Signing ----
def generate_keypair(suite=None) -> dict:
    return door.keypair(None, suite)


def keypair_from_seed(seed_hex, suite=None) -> dict:
    return door.keypair(seed_hex, suite)


def sign(block, private_key_hex, suite=None) -> str:
    return door.sign(block, private_key_hex, suite)


def suite_of_key(public_key_hex):
    """The suite a signing key (SPKI hex) belongs to, or None."""
    return door.suite_of_key(str(public_key_hex))


def passkey_signature(authenticator_data_hex, client_data_json_hex, signature_hex) -> str:
    """A passkey's WebAuthn answer (each part as hex; the signature may be DER) as a FoodBlock signature, hex."""
    return door.passkey_signature(str(authenticator_data_hex), str(client_data_json_hex), str(signature_hex))


# ---- Envelopes ----
def generate_encryption_keypair(suite=None) -> dict:
    return door.encryption_keypair(suite)


def encryption_key_of(private_hex, suite=None) -> str:
    return door.encryption_key_of(private_hex, suite)


def seal(value, recipient_keys, suite=None, fixed=None) -> dict:
    """`fixed` exists only to reproduce a vector."""
    return door.seal(value, list(recipient_keys), suite, fixed)


# ---- The commitment ----
def salted_hash(salt_hex, value, suite=None) -> str:
    return door.salted_hash(salt_hex, value, suite)


def commit(recipients, salts=None, suite=None) -> dict:
    return door.commit(list(recipients), salts or {}, suite)


def finds_self(block, recipient, salt_hex) -> bool:
    return door.finds_self(block, recipient, salt_hex or "")


# ---- The write check and the words it asks for ----
def refusals(type_, state=None, refs=None, schemas=None, held=None) -> list:
    return door.refusals(type_, {} if state is None else state, {} if refs is None else refs, _blocks(held) or [], _blocks(schemas))


def check(type_, state=None, refs=None, schemas=None, held=None) -> list:
    return door.check(type_, {} if state is None else state, {} if refs is None else refs, _blocks(held) or [], _blocks(schemas))


def valid(block, held=None, schemas=None, arrivals=None) -> list:
    """Every refusal of a signed block against the blocks held ([] when valid). Validity reads no arrival: `arrivals` is accepted and unused."""
    return door.valid(block, _blocks(held) or [], _blocks(schemas))


def terms(given=None, **more) -> dict:
    return door.terms({**(given or {}), **more})


# ---- Chains and causal order ----
def check_chain(blocks, brought_in) -> dict:
    """{ head, length, gaps, skips, equivocations (pairs naming one prev), broken, ok }"""
    return door.check_chain(blocks, brought_in)


def sees(later, earlier, blocks) -> bool:
    return door.sees(later, earlier, blocks)


# ---- Writing and the wire ----
def compose(type_, state=None, refs=None, author=None, audience=None, after=(), at=None, link=None, salts=None, suite=None, skip=None, clockless=None, nonce=None) -> dict:
    """`audience` ("public" or a non-empty list) is required; so is `at`, unless `clockless`. The core refuses a missing one."""
    return door.compose(type_, state or {}, refs or {}, _options(author=author, audience=audience, after=after, at=at, link=link, salts=salts, suite=suite, skip=skip, clockless=clockless, nonce=nonce))


def _options(audience=None, after=(), **rest):
    options = {k: v for k, v in rest.items() if v is not None}
    if audience is not None:
        options["audience"] = audience if audience == PUBLIC else list(audience)
    if after:
        options["after"] = list(after)
    return options


def write(type_, state=None, refs=None, author=None, key=None, held=(), schemas=None, link=None, **options) -> dict:
    """The one way to write: compose, check (refusing, never repairing), sign, chain. Raises Refused with every finding.
    `audience` and `at` (or `clockless=True`) are options the caller must state."""
    if not key:
        raise FoodBlockError("argument", "write: a block is signed by a key { public_key_sign, private_key }")
    given = _options(author=author, key=key, held=list(held or []), link=link, **options)
    if schemas is not None:
        given["schemas"] = _blocks(schemas)
    return door.write(type_, state or {}, refs or {}, given)


def wrap(signed) -> dict:
    return door.wrap(signed)


def unwrap(message, held=None) -> dict:
    """A block off the wire: its hash recomputed from its content, in the suite of the key that signed it (found among `held`,
    the author's blocks; core.md, section 2). Without `held`, in the suite the block shows."""
    return door.unwrap(message, held)


def seal_copy(signed, keys, reveals=(), private_key=None, fixed=None, suite=None) -> dict:
    return door.seal_copy(signed, list(keys), list(reveals or []), private_key, fixed, suite)
