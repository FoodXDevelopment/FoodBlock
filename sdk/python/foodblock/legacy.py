"""The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). Not part of the protocol: no node reads
an older shape. It writes fresh 1.6 blocks, each deriving from the old hash."""

from . import _door as door

old_hash = door.old_hash  # the id an old block had under the old canonical form


def convert(old_blocks, keys, at=None, map=None, existing=(), channel=None, request_hash=None, schemas=(), custodian_key=None, custodian_for=()) -> dict:  # noqa: A002
    """`keys` maps each old identity to the key that signs for it ({ public_key_sign, private_key, suite? }).
    `schemas` are published schemas a block may name instead of a new one; `custodian_key` signs only for the old identities in
    `custodian_for`, and only under a channel; every other one is skipped. Nothing a signer left out is filled in (a block with no
    audience is its author's alone). Returns { blocks, map (old to new), skipped: [{ hash, why }] }."""
    return door.convert(old_blocks, {"keys": keys, "at": at, "map": map or {}, "existing": list(existing or []),
                                     "channel": channel, "request_hash": request_hash,
                                     "schemas": list(schemas or []), "custodian_key": custodian_key, "custodian_for": list(custodian_for or [])})
