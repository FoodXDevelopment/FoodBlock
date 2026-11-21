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

keys, encryption = fb.generate_keypair(), fb.generate_encryption_keypair()
AT = "2026-10-15T09:00:00.000Z"  # you state the time; nothing reads a clock for you
me = fb.identity.genesis(keys, kind="person", at=AT, audience="public", encryption_key=encryption["public_key_encrypt"])

# The one write path: compose, check, sign, chain. `at` and `audience` ("public" or a list of recipients) are always
# yours to state; a missing one is refused, never filled. Money is an amount, { value, unit }; values are decimal strings.
eggs = fb.write("thing", {"kind": "eggs", "name": "Free-range eggs"}, {}, author=me["hash"], key=keys, held=[me], at=AT, audience="public")
offer = fb.write("promise", {"terms": {"price": fb.amount("4.50", "GBP"), "quantity": fb.amount("2", "{tray}"),
                                       "expires": "2026-10-20T00:00:00.000Z"}},
                 {"from": me["hash"], "what": eggs["hash"]}, author=me["hash"], key=keys, held=[me, eggs], at=AT, audience="public")

fb.promise_stage(offer, [me, eggs, offer])["stage"]   # 'offered'
fb.wrap(offer)                                        # { block, signature }, as it travels
fb.promise_view(offer, [me, eggs, offer], now="2026-10-21T00:00:00.000Z")["stage"]   # 'expired': only a view reads a clock
```

A node states its own choices too: `fb.sync.answer_pull(log, request, node, private_key, cap, serves_pairs)`,
`fb.sync.accept(incoming, held, takes_pairs)` (blocks and sealed header messages alike),
`fb.sync.admission_refusals(block, receiver, blocks, admission, asks_today)`. None has a default. No fold reads an arrival or a clock except a view, which takes the reader's `now`.

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
- Writing: `compose`, `write`, `valid` (who said these bytes), `read` (whether this reader can read it), `write_refusals` (what a writer refuses to sign, of an unsigned draft), `binds`, `strict_text`, `schemas_from`, `amount`, `terms`, `Refused`. Money is an amount: `amount("4.20", "GBP")`.
- The wire: `wrap`, `unwrap`, `header`, `seal_copy`, `open_copy`, `header_signed_by`, `id_of`.
- Strangers and small profiles (`fb.strangers`): `is_stranger(receiver, sender, blocks, block=None)`, `short_code`, `short_reply`, `short_reply_open`, `code_matches`, `reading_is_persons_claim`, `reading_condition_holds`, `condition_holds`.
- Chains and order: `next_link`, `check_chain` (also `skips`; equivocations are pairs), `read_whole`, `causal_order`, `causes_of`, `past_of`, `heads_among`, `sees`.
- Identity (`fb.identity`): `genesis`, `key_grant`, `confirm`, `key_hash`, `key_timeline`, `live_keys`, `signed_by_author`, `stands`,
  `chains_of`, `next_link_for`, `fork_pairs`, `identity_state`.
- Authority (`fb.grant`): `scope_within`, `scope_refusals`, `is_live`, `why_not_live`, `ancestors`, `why_not_under`, `add_duration`, `why_not_live_undo`,
  `scope_reading` (every default of authority.md; `junk` names what cannot be read), `fence_reading`, `terms_total`; with `keeps_to`, `meter`, `worst_case`, `lowest_offer` (also in `fb.fold`).
- Folds (`fb.fold`): `promise_stage` (no clock), `promise_view` and `promise_views` (the reader's `now`), `circle_state`, `circle_versions`, `circle_key`, `row_holds`, `ways_in`, `machine_lock`, `count_of`,
  `members_then`, `speaks_for`, `backed(block, person, blocks)` (`{backed, why, chain}`), `backed_all(person, blocks)`, `to_come_back(person, blocks)` (money moved in the person's name that they do not back: `{to_come: [...]}`), `listing_check`, `check_reads`, `clearing_applied`, `ruling_releases`, `fee_back`, `gives(block, person, blocks)` (what of the person's becomes whose, from typed terms and refs), `ownership`, `ownership_view`, `owner_of`, `receiver_of`, `where_now`, `consent`,
  `due`, `counted_in`, `readback`, `render`, `readback_redo`.
- Between nodes (`fb.sync`): `pull_request`, `sign_pull`, `sign_push` (a `counter` or a `challenge`, no time), `new_challenge`,
  `pull_refusals`, `push_refusals`, `message_refusals`, `admission_refusals`, `residency_refusals`, `matches`, `heads_of`, `answer_pull`,
  `answer_signed_by`, `push_request`, `strict_push`, `accept`, `push_answer`, `log_shown`, `export_whole`, `waited_too_long`, `well_known(node, reads, admission, endpoints, log)`, `announcement`,
  `well_known_errors`.
- Rule sets and a kept door: `rule_set`, `mount`, `unmount`.

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
