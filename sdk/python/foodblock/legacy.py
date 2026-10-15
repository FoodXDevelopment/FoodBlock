"""The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). Not part of the protocol: no node reads
an older shape. It writes fresh 1.6 blocks, each deriving from the old hash."""

from ._core import call


def convert(old_blocks, keys, at=None, map=None, existing=(), channel=None, request_hash=None) -> dict:  # noqa: A002
    """`keys` maps each old identity to the key that signs for it ({ public_key_sign, private_key, suite? }).
    Returns { blocks, map (old to new), skipped: [{ hash, why }] }."""
    return call("convert", list(old_blocks), {"keys": keys, "at": at, "map": map or {}, "existing": list(existing or []),
                                              "channel": channel, "request_hash": request_hash})


def old_hash(block) -> str:
    """The id an old block had under the old canonical form."""
    return call("old_hash", block)
