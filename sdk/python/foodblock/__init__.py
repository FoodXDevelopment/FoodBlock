"""FoodBlock 1.6 for Python (spec/core.md): the same API as the JavaScript reference, in snake_case, as a thin layer
over the one Rust core (sdk/rust). Every rule lives in that core; this package only calls it. There is no earlier
version in the protocol: old data enters once, through `legacy.convert`."""

from .spec import VERSION, PROTOCOL, TYPES, VERBS, REF_KEYS, SUITES, PEERS, STATUSES, POWERS, FIELDS, CODES
from ._core import FoodBlockError, Refused
from .protocol import (
    PUBLIC, ALG, check, refusals, valid, strict_text, amount, money, confidence, terms, is_time, is_date,
    canonical, canonical_json, create, hash,
    generate_keypair, keypair_from_seed, sign, verify, sign_message, verify_message, suite_of_key, passkey_challenge, passkey_signature,
    seal, open, generate_encryption_keypair, encryption_key_of,
    new_salt, salted_hash, commit, finds_self, reveal_for,
    compose, write, wrap, unwrap, header, seal_copy, open_copy, header_signed_by,
    next_link, check_chain, causal_order, causes_of, past_of, heads_among, sees,
)
from . import identity, grant, fold, sync, cbor, strangers, legacy
from .fold import promise_stage, promise_view, consent, circle_state, members_then, where_now, owner_of
from .identity import identity_state
from .strangers import receipt_code, receipt_code_long, code_matches

__all__ = [
    "VERSION", "PROTOCOL", "TYPES", "VERBS", "REF_KEYS", "FIELDS", "SUITES", "PEERS", "STATUSES", "POWERS", "CODES",
    "FoodBlockError", "Refused",
    "create", "hash", "canonical", "canonical_json",
    "generate_keypair", "keypair_from_seed", "sign", "verify", "sign_message", "verify_message", "suite_of_key", "passkey_challenge", "passkey_signature",
    "generate_encryption_keypair", "encryption_key_of", "seal", "open", "ALG",
    "new_salt", "salted_hash", "commit", "finds_self", "reveal_for",
    "PUBLIC", "compose", "write", "check", "refusals", "valid", "strict_text", "amount", "money", "confidence", "terms", "is_time", "is_date",
    "wrap", "unwrap", "header", "seal_copy", "open_copy", "header_signed_by",
    "next_link", "check_chain", "causal_order", "causes_of", "past_of", "heads_among", "sees",
    "identity", "grant", "fold", "sync", "cbor", "strangers", "legacy",
    "promise_stage", "promise_view", "consent", "circle_state", "identity_state", "members_then", "where_now", "owner_of", "receipt_code", "receipt_code_long", "code_matches",
]
