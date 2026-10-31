"""Who someone is (modules/identity.md): thin calls into the Rust core."""

from . import _door as door


is_genesis = door.is_genesis
genesis_opens = door.genesis_opens
forked = door.forked
fork_pairs = door.fork_pairs
counts = door.counts
chains_of = door.chains_of
next_link_for = door.next_link_for


# `unknown_arrival` ("inside" or "outside") is what the reader reads a block whose arrival it does not know as: required
# whenever `arrived_at` is given, and the core refuses a call without it.
def _arrived(arrived_at, blocks):
    """The arrival log as data { hash: at }. A function (hash -> at or None) is read over the blocks."""
    if arrived_at is None or isinstance(arrived_at, dict):
        return arrived_at
    return {b["hash"]: at for b in blocks if (at := arrived_at(b["hash"])) is not None}


def recovery_key_hash(public_key_hex, suite=None) -> str:
    return door.recovery_key_hash(public_key_hex, suite)


def genesis(keys, kind=None, at=None, audience=None, encryption_key=None, recovery_key=None, reach=None, recovery_suite=None, custodian=None, salts=None, nonce=None) -> dict:
    """A genesis needs kind, at, audience and the key, all stated (`keys` is { public_key_sign, private_key } and `suite`
    when it is not std). `audience` is "public" or a non-empty list (the result then carries `salts`). The recovery key
    and its `reach` come as a pair or not at all. `custodian` (an id) says the key is held for the person by someone
    they chose."""
    options = {"kind": kind, "at": at, "audience": audience, "encryption_key": encryption_key, "recovery_key": recovery_key, "reach": reach,
               "recovery_suite": recovery_suite, "custodian": custodian, "salts": salts, "nonce": nonce}
    return door.genesis(keys, {k: v for k, v in options.items() if v is not None})


def key_grant(id_, new_public_key, signer, replaces=None, counted_to=None, at=None, after=(), encrypt=None,
              custodian=None, suite=None, skip=None) -> dict:
    """A key grant, signed: brings `new_public_key` into the id. `signer` is { private_key, suite?, last, brought_in }
    (a key the id holds and its place in that key's chain), or { private_key, recovery_key } for the recovery key.
    `at` is required. A rotation also names the key it `replaces` and that key's `counted_to` block. `suite` is the new key's.
    `custodian` names who holds the key. The recovery pair is named only in a genesis."""
    options = {"replaces": replaces, "counted_to": counted_to, "at": at, "after": list(after or []), "encrypt": encrypt,
               "custodian": custodian, "suite": suite, "skip": skip}
    return door.key_grant(id_, new_public_key, signer, {k: v for k, v in options.items() if v is not None})


def key_timeline(id_, blocks, arrived_at=None, unknown_arrival=None) -> list:
    """[{ key, by, signer, frozen, suite }] (a void key is never listed)"""
    return door.key_timeline(id_, blocks, _arrived(arrived_at, blocks), unknown_arrival)


def keys_of(id_, blocks, arrived_at=None, unknown_arrival=None) -> list:
    return door.keys_of(id_, blocks, _arrived(arrived_at, blocks), unknown_arrival)


def signed_by_author(block, blocks, arrived_at=None, unknown_arrival=None) -> bool:
    return door.signed_by_author(block, blocks, _arrived(arrived_at, blocks), unknown_arrival)


def identity_state(id_, blocks, arrived_at=None, unknown_arrival=None) -> dict:
    """{ signed_by_author, keys, frozen, operators }."""
    return door.identity_state(id_, blocks, _arrived(arrived_at, blocks), unknown_arrival)


def identity_of(id_, blocks, arrived_at=None, unknown_arrival=None) -> dict:
    return door.identity_of(id_, blocks, _arrived(arrived_at, blocks), unknown_arrival)


def signer_of(block, keys):
    return door.signer_of(block, list(keys))


