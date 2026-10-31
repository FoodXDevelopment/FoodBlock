# foodblock (Python)

FoodBlock for Python. The protocol is [`spec/protocol.md`](../../spec/protocol.md); this SDK does what the
JavaScript reference does, with the same names in snake_case, and passes every section of
[`spec/vectors.json`](../../spec/vectors.json).

It is a thin layer over the one Rust core ([`../rust`](../rust)). Every rule (canonical form, hashing, Ed25519, the
write check, chains, identities, envelopes, folds, messages between nodes, and protocol.json itself) lives there once; this package calls it through the core's single JSON door (`fb_call`, over `ctypes`).
No Python dependency, nothing to compile at import time, and the same bytes on every SDK.

**Why ctypes.** The core already has a C ABI. `ctypes` is in the standard library, needs no Python headers or
compiler on the user's side and no per-Python-version wheel; PyO3 would add a second binding crate and a maturin build
for no gain, since every call is "JSON in, JSON out".

## Build

```bash
(cd ../rust && cargo rustc --release --features ffi --crate-type cdylib)   # target/release/libfoodblock.{dylib,so}
python3 -m unittest discover -s tests                                      # finds the library in ../rust/target/release
pip install .                                                              # setup.py builds the core and ships it in the package
```

The library is found from `FOODBLOCK_LIB`, else beside the package, else `../rust/target/release`.

## Profile

The core is built for the node peer (micro, edge and node; `protocol.json` `peers`): the canonical form,
SHA-256, Ed25519, the write check, key chains, grants, the folds, pull and push messages, discovery, envelopes and
commitments. A smaller device uses the Rust crate directly (`--no-default-features --features micro`); a call this
build does not have raises `FoodBlockError` with `kind == "profile"`.

## Example

```python
import foodblock as fb

keys, encryption, recovery = fb.generate_keypair(), fb.generate_encryption_keypair(), fb.generate_keypair()
AT = "2026-10-15T09:00:00.000Z"  # you state the time; nothing reads a clock for you
me = fb.identity.genesis(keys, kind="person", at=AT, audience="public", encryption_key=encryption["public_key_encrypt"], recovery_key=recovery["public_key_sign"], reach="P30D")

# The one write path: compose, check, sign, chain. `at` and `audience` ("public" or a list of recipients) are always
# yours to state; a missing one is refused, never filled. Money is { minor, currency }; amounts are decimal strings.
eggs = fb.write("thing", {"kind": "eggs", "name": "Free-range eggs"}, {}, author=me["hash"], key=keys, held=[me], at=AT, audience="public")
offer = fb.write("promise", {"terms": {"price": fb.money(450, "GBP"), "quantity": fb.amount("2", "{tray}"),
                                       "expires": "2026-10-20T00:00:00.000Z"}},
                 {"from": me["hash"], "what": eggs["hash"]}, author=me["hash"], key=keys, held=[me, eggs], at=AT, audience="public")

fb.promise_stage(offer, [me, eggs, offer])["stage"]   # 'offered'
fb.wrap(offer)                                        # { block, signature }, as it travels
fb.promise_view(offer, [me, eggs, offer], now="2026-10-21T00:00:00.000Z")["stage"]   # 'expired': only a view reads a clock
```

A node states its own choices too: `fb.sync.answer_pull(log, request, node, private_key, cap, serves_pairs)`,
`fb.sync.accept(incoming, held, takes_pairs)`, `fb.sync.accept_sealed(incoming, held, takes_pairs)`,
`fb.sync.admission_refusals(block, receiver, blocks, admission, strangers_today)`. None has a default. Reading with
`arrived_at` takes `unknown_arrival="inside"` or `"outside"`, the reader's own choice.

A refused block raises `fb.Refused`, whose `wrong` lists every reason. Nothing is ever repaired.

## API

- The protocol as data: `VERSION`, `PROTOCOL`, `TYPES`, `VERBS`, `REF_KEYS`, `FIELDS`, `SUITES`, `PEERS`, `STATUSES`, `POWERS`, `CODES`. There is no alias table: year zero.
- Blocks: `create`, `hash`, `canonical`, `canonical_json`.
- Keys and signatures, by suite (std, p256, sm; `suite` is an optional last argument): `generate_keypair`,
  `keypair_from_seed`, `sign(block, private_key, suite)` (hex), `verify(block, signature, public_key_sign)`,
  `sign_message`, `verify_message`, `suite_of_key`. The suite of a block comes from the key that signed it; no block carries one.
- Encryption: `generate_encryption_keypair`, `encryption_key_of`, `seal(value, keys, suite, fixed)`,
  `open(envelope, x25519_private)`, `ALG`. Envelopes name no recipient.
- The commitment: `new_salt`, `salted_hash`, `commit`, `finds_self`, `reveal_for`.
- Writing: `compose`, `write`, `check`, `refusals`, `valid`, `strict_text` (the checks), `amount`, `money`, `terms`, `Refused`.
- The wire: `wrap`, `unwrap`, `header`, `seal_copy`, `open_copy`, `header_signed_by`.
- Strangers and small profiles (`fb.strangers`): `receipt_code`, `reading_is_persons_claim`, `reading_condition_holds`,
  `earnest_shape_ok`, `earnest_paid`. The one-time converter (`fb.legacy`, not protocol): `convert` (`custodian_key` signs only for the ids in `custodian_for`, under a `channel`), `old_hash`.
- Chains and order: `next_link`, `check_chain` (also `skips`; equivocations are pairs), `causal_order`, `causes_of`, `past_of`, `heads_among`, `sees`.
- Identity (`fb.identity`): `genesis`, `key_grant`, `identity_of`, `key_timeline`, `keys_of`, `signed_by_author`,
  `signer_of`, `chains_of`, `next_link_for`, `recovery_key_hash`, `fork_pairs`, `identity_state`.
- Authority (`fb.grant`): `scope_within`, `is_live`, `why_not_live`, `ancestors`, `why_not_under`, `operators_of`,
  `add_duration`, `why_not_live_undo`, `act_name`, `limit_fence`, `within_limit`.
- Folds (`fb.fold`): `promise_stage` (no clock), `promise_view` (the reader's `now`), `circle_state`, `may_act_as`,
  `members_then`, `ownership`, `owner_of`, `receiver_of`, `where_now`, `consent`, `live_grant`,
  `withdrawal_seen`, `due`, `recovery_reach`, `ownership_view`, `successor_view`, `circle_key`, `counted_in`.
- Between nodes (`fb.sync`): `pull_request`, `sign_pull`, `sign_push` (a `counter` or a `challenge`, no time), `new_challenge`,
  `pull_refusals`, `push_refusals`, `admission_refusals`, `residency_refusals`, `matches`, `heads_of`, `answer_pull`,
  `answer_signed_by`, `push_request`, `accept`, `push_answer`, `waited_too_long`, `well_known`, `announcement`,
  `well_known_errors`.

The reference's `keystore` (keeping a private key locked on a device) is product custody, not protocol, and is not
here.

## Test

```bash
python3 -m unittest discover -s tests
```

`tests/test_vectors.py` runs every section of `spec/vectors.json` and `spec/canonical-vectors.json`
exactly as `spec/run-vectors.cjs` does (the `door` section included); a section it does not know fails the suite.
`tests/test_node.py` writes, seals, pulls and pushes.

## Licence

Public domain (CC0 1.0).
