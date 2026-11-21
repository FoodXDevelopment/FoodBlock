"""FoodBlock for Python (spec/core.md): the same API as the JavaScript reference, in snake_case, as a thin layer
over the one Rust core (sdk/rust). Every rule lives in that core; this package only calls it. There is no earlier
version in the protocol."""

from .spec import VERSION, PROTOCOL, CONVENTIONS, TYPES, VERBS, REF_KEYS, SUITES, PEERS, STATUSES, FIELDS, CODES
from ._core import FoodBlockError, Refused
from .protocol import (
    PUBLIC, ALG, valid, read, write_refusals, binds, schemas_from, strict_text, amount, terms, is_time, is_date,
    canonical, canonical_json, create, hash,
    generate_keypair, keypair_from_seed, sign, verify, sign_message, verify_message, suite_of_key, passkey_challenge, passkey_signature,
    seal, open, generate_encryption_keypair, encryption_key_of,
    new_salt, salted_hash, commit, finds_self, reveal_for,
    compose, write, wrap, unwrap, header, seal_copy, open_copy, header_signed_by,
    next_link, check_chain, read_whole, causal_order, causes_of, past_of, heads_among, sees, id_of, rule_set, mount, unmount,
)
from . import identity, grant, fold, sync, cbor, strangers, merkle
from .fold import (
    promise_stage, promise_view, promise_views, repeat_occurrences, circle_state, circle_versions, machine_lock, count_of, consent, speaks_for,
    backed, backed_all, to_come_back, listing_check, check_reads, clearing_applied, ruling_releases, fee_back, gives, account_of,
    members_then, where_now, owner_of, row_holds, ways_in, keeps_to, meter, worst_case, lowest_offer, readback, render, readback_redo,
)
from .identity import identity_state
from .strangers import short_code, code_matches

__all__ = [
    "VERSION", "PROTOCOL", "CONVENTIONS", "TYPES", "VERBS", "REF_KEYS", "FIELDS", "SUITES", "PEERS", "STATUSES", "CODES",
    "FoodBlockError", "Refused",
    "create", "hash", "canonical", "canonical_json",
    "generate_keypair", "keypair_from_seed", "sign", "verify", "sign_message", "verify_message", "suite_of_key", "passkey_challenge", "passkey_signature",
    "generate_encryption_keypair", "encryption_key_of", "seal", "open", "ALG",
    "new_salt", "salted_hash", "commit", "finds_self", "reveal_for",
    "PUBLIC", "compose", "write", "valid", "read", "write_refusals", "binds", "schemas_from", "strict_text", "amount", "terms", "is_time", "is_date",
    "wrap", "unwrap", "header", "seal_copy", "open_copy", "header_signed_by",
    "next_link", "check_chain", "read_whole", "id_of", "rule_set", "mount", "unmount", "causal_order", "causes_of", "past_of", "heads_among", "sees",
    "identity", "grant", "fold", "sync", "cbor", "strangers", "merkle",
    "promise_stage", "promise_view", "promise_views", "repeat_occurrences", "circle_state", "circle_versions", "machine_lock", "count_of", "consent", "speaks_for",
    "backed", "backed_all", "to_come_back", "listing_check", "check_reads", "clearing_applied", "ruling_releases", "fee_back", "gives", "account_of",
    "members_then", "where_now", "owner_of", "row_holds", "ways_in", "keeps_to", "meter", "worst_case", "lowest_offer", "readback", "render", "readback_redo",
    "identity_state", "short_code", "code_matches",
]
