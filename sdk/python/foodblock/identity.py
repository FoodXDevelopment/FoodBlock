"""Who someone is (modules/identity.md): thin calls into the Rust core."""

from ._core import call


def _arrived(arrived_at, blocks):
    """The arrival log as data { hash: at }. A function (hash -> at or None) is read over the blocks."""
    if arrived_at is None or isinstance(arrived_at, dict):
        return arrived_at
    return {b["hash"]: at for b in blocks if (at := arrived_at(b["hash"])) is not None}


def recovery_key_hash(public_key_hex, suite="std") -> str:
    return call("recovery_key_hash", public_key_hex, suite)


def genesis(keys, encryption_key=None, recovery_key=None, kind="person", at=None, reach=None, recovery_suite=None, custodian=None) -> dict:
    """A genesis needs only kind, at, audience and the key (`keys` is { public_key_sign, private_key } and `suite` when
    it is not std). The recovery key and its `reach` come as a pair or not at all. `custodian` (an id) says the key is
    held for the person by someone they chose."""
    options = {"kind": kind, "encryption_key": encryption_key, "recovery_key": recovery_key, "reach": reach,
               "recovery_suite": recovery_suite, "at": at, "custodian": custodian}
    return call("genesis", keys, {k: v for k, v in options.items() if v is not None})


def is_genesis(block) -> bool:
    return call("is_genesis", block)


def genesis_opens(block) -> bool:
    return call("genesis_opens", block)


def key_grant(id_, new_public_key, signer, replaces=None, counted_to=None, at=None, after=(), encrypt=None, recovery=None,
              custodian=None, suite=None, skip=None) -> dict:
    """A key grant, signed: brings `new_public_key` into the id. `signer` is { private_key, suite?, last, brought_in }
    (a key the id holds and its place in that key's chain), or { private_key, recovery_key } for the recovery key.
    A rotation also names the key it `replaces` and that key's `counted_to` block. `suite` is the new key's.
    `recovery` ({ key, reach }) adds recovery. `custodian` names who holds the key."""
    options = {"replaces": replaces, "counted_to": counted_to, "at": at, "after": list(after or []), "encrypt": encrypt,
               "recovery": recovery, "custodian": custodian, "suite": suite, "skip": skip}
    return call("key_grant", id_, new_public_key, signer, {k: v for k, v in options.items() if v is not None})


def forked(block, blocks) -> bool:
    return call("forked", block, list(blocks))


def fork_pairs(blocks) -> list:
    return call("fork_pairs", list(blocks))


def key_timeline(id_, blocks, arrived_at=None) -> list:
    """[{ key, by, signer, void, frozen, suite }]"""
    return call("key_timeline", id_, list(blocks), _arrived(arrived_at, blocks))


def keys_of(id_, blocks, arrived_at=None) -> list:
    return call("keys_of", id_, list(blocks), _arrived(arrived_at, blocks))


def signed_by_author(block, blocks, arrived_at=None) -> bool:
    return call("signed_by_author", block, list(blocks), _arrived(arrived_at, blocks))


def identity_state(id_, blocks, arrived_at=None) -> dict:
    """{ signed_by_author, keys, frozen, operators }."""
    return call("identity_state", id_, list(blocks), _arrived(arrived_at, blocks))


def identity_of(id_, blocks, arrived_at=None) -> dict:
    return call("identity_of", id_, list(blocks), _arrived(arrived_at, blocks))


def signer_of(block, keys):
    return call("signer_of", block, list(keys))


def chains_of(id_, blocks) -> list:
    return call("chains_of", id_, list(blocks))


def counts(block, blocks) -> bool:
    return call("counts", block, list(blocks))


def next_link_for(id_, public_key, blocks) -> dict:
    return call("next_link_for", id_, public_key, list(blocks))
