"""Who someone is (modules/identity.md): her genesis (a list of one voice), her list of voices, the keys under a voice, and
whether a word stands (blocks.md, Finality). Thin calls into the Rust core."""

from . import _door as door
from .protocol import write

is_genesis = door.is_genesis
genesis_opens = door.genesis_opens
forked = door.forked
fork_pairs = door.fork_pairs
counts = door.counts
chains_of = door.chains_of
next_link_for = door.next_link_for
live_keys = door.live_keys  # the keys that speak for her now: of her standing voices and under them, not ended. Sorted.
stands = door.stands  # whether a word stands (blocks.md, Finality): { stands, waiting: [{ block, on }] }, no clock and no arrival


def key_hash(public_key_hex, suite=None) -> str:
    """A key named by its hash (identity.md, Her voices): its suite's hash of its SPKI hex as UTF-8 text."""
    return door.key_hash(public_key_hex, suite)


def genesis(keys, kind=None, at=None, audience=None, encryption_key=None, reach=None, clocks=None, salts=None, nonce=None) -> dict:
    """A new person, autonomous system, machine or circle that signs: their genesis, signed, a list of one voice. A genesis
    needs only `kind`, `at`, `audience` and the key (`keys` is { public_key_sign, private_key }, and `suite` when it is not std),
    each stated: a missing one is refused. `reach` (a duration) comes with `clocks` (her clock, { names, needed }).
    `audience` is "public" or a list of recipients (the result then carries `salts`)."""
    options = {"kind": kind, "at": at, "audience": audience, "encryption_key": encryption_key, "reach": reach, "clocks": clocks,
               "salts": salts, "nonce": nonce}
    return door.genesis(keys, {k: v for k, v in options.items() if v is not None})


def key_grant(id_, signer, voices=None, updates=None, clocks=None, key=None, suite=None, encrypt=None, shown_key=None,
              key_ref=None, counted_to=None, under=None) -> dict:
    """A key grant about `id_` (identity.md), written by `signer` ({ author, keys, held, at, after? }: one of her voices, her
    operator, or one of a voice of named people, signing in their own name). Give `voices` (her whole list again, with `updates`
    the list it replaces and `clocks` her clock), or `key` (one key under the signer's voice, in `suite`), or `encrypt` alone;
    `shown_key` when a key named by hash shows itself (`key_ref` the list that holds its hash); `counted_to` the last block of
    a key a voice above ends; `under` an operator grant."""
    state = {"kind": "key"}
    for name, value in (("voices", voices), ("clocks", clocks), ("public_key_sign", key), ("suite", suite), ("public_key_encrypt", encrypt),
                        ("shown_key", shown_key), ("counted_to", counted_to)):
        if value:
            state[name] = value
    refs = {"subject": id_}
    for name, value in (("updates", updates), ("key", key_ref), ("under", under)):
        if value:
            refs[name] = value
    options = {k: v for k, v in signer.items() if k not in ("keys", "key", "author")}
    return write("grant", state, refs, author=signer.get("author") or id_, key=signer.get("keys") or signer.get("key"), audience="public", **{k: v for k, v in options.items() if k != "audience"})


def confirm(word, signer) -> dict:
    """The second signature (blocks.md, Finality, Signed twice): a block of the same key, or of a voice above, naming the word in refs.confirms."""
    options = {k: v for k, v in signer.items() if k not in ("keys", "key", "author", "audience")}
    return write("observe", {}, {"confirms": [word["hash"] if isinstance(word, dict) else word]}, author=signer.get("author"),
                 key=signer.get("keys") or signer.get("key"), audience="public", **options)


def key_timeline(id_, blocks) -> list:
    """Every key a list or a key grant of hers brought in: [{ key, by, voice, under, suite, ended }]."""
    return door.key_timeline(id_, blocks)


def signed_by_author(block, blocks) -> bool:
    """Whether a key of the block's author spoke for her there (identity.md, invariant 8). A waiting block is True here; `stands` says it waits."""
    return door.signed_by_author(block, blocks)


def identity_state(id_, blocks) -> dict:
    """{ signed_by_author, voices, clocks, keys, waiting }."""
    return door.identity_state(id_, blocks)
