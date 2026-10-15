"""FoodBlock 1.6 for Python (spec/protocol.md): the same API as the JavaScript reference, in snake_case, as a thin layer
over the one Rust core (sdk/rust). Every rule lives in that core; this package only calls it."""

from .spec import VERSION, PROTOCOL, ALIASES, TYPES, VERBS, REF_KEYS, PROFILES, FIELDS, CODES
from ._core import FoodBlockError, Refused
from .protocol import (
    PUBLIC, ALG, ALG_RAW, check, refusals, amount, money, confidence, terms, canonical, canonical_json, create, hash,
    generate_keypair, keypair_from_seed, sign, verify, sign_message, verify_message,
    seal, open, generate_encryption_keypair, encryption_key_of,
    new_salt, salted_hash, commit, finds_self, reveal_for,
    compose, write, wrap, unwrap, header, seal_copy, open_copy, header_signed_by,
    read_as, is_a, next_link, check_chain, causal_order, sees,
)
from . import identity, grant, fold, sync, cbor
from .fold import promise_stage, circle_state, members_then, where_now, owner_of
from .identity import identity_state

__all__ = [
    "VERSION", "PROTOCOL", "ALIASES", "TYPES", "VERBS", "REF_KEYS", "FIELDS", "PROFILES", "CODES",
    "FoodBlockError", "Refused",
    "create", "hash", "canonical", "canonical_json",
    "generate_keypair", "keypair_from_seed", "sign", "verify", "sign_message", "verify_message",
    "generate_encryption_keypair", "encryption_key_of", "seal", "open", "ALG", "ALG_RAW",
    "new_salt", "salted_hash", "commit", "finds_self", "reveal_for",
    "PUBLIC", "compose", "write", "check", "refusals", "amount", "money", "confidence", "terms",
    "wrap", "unwrap", "header", "seal_copy", "open_copy", "header_signed_by",
    "read_as", "is_a",
    "next_link", "check_chain", "causal_order", "sees",
    "identity", "grant", "fold", "sync", "cbor",
    "promise_stage", "circle_state", "identity_state", "members_then", "where_now", "owner_of",
]
