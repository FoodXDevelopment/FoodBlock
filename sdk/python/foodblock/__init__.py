"""FoodBlock 1.6 for Python (spec/protocol.md): the same API as the JavaScript reference, in snake_case. Every closed
list comes from protocol.json (PROTOCOL), every older shape from aliases.json, both carried in foodblock/spec/.
`sign` signs; `seal` encrypts."""

from .spec import VERSION, PROTOCOL, ALIASES, TYPES, VERBS, REF_KEYS, PROFILES
from .protocol import FIELDS, CODES, check, refusals, amount, money, confidence, terms
from .canonical import canonical, canonical_json
from .block import create, hash  # noqa: A004 (the protocol's word)
from .sign import generate_keypair, keypair_from_seed, sign, verify, sign_message, verify_message
from .envelope import ALG, ALG_RAW, seal, open, generate_encryption_keypair, encryption_key_of  # noqa: A004
from .audience import new_salt, salted_hash, commit, finds_self, reveal_for
from .write import PUBLIC, Refused, compose, write, wrap, unwrap, header, seal_copy, open_copy, header_signed_by
from .aliases import read_as, is_a
from .chain import next_link, check_chain
from .order import causal_order, past_of, sees
from . import identity, grant, fold, sync
from .fold import promise_stage, circle_state, members_then, where_now, owner_of
from .identity import identity_state

__all__ = [
    "VERSION", "PROTOCOL", "ALIASES", "TYPES", "VERBS", "REF_KEYS", "FIELDS", "PROFILES",
    "create", "hash", "canonical", "canonical_json",
    "generate_keypair", "keypair_from_seed", "sign", "verify", "sign_message", "verify_message",
    "generate_encryption_keypair", "encryption_key_of", "seal", "open", "ALG", "ALG_RAW",
    "new_salt", "salted_hash", "commit", "finds_self", "reveal_for",
    "PUBLIC", "Refused", "compose", "write", "check", "refusals", "CODES", "amount", "money", "confidence", "terms",
    "wrap", "unwrap", "header", "seal_copy", "open_copy", "header_signed_by",
    "read_as", "is_a",
    "next_link", "check_chain", "causal_order", "past_of", "sees",
    "identity", "grant", "fold", "sync",
    "promise_stage", "circle_state", "identity_state", "members_then", "where_now", "owner_of",
]
