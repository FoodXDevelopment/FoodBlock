# foodblock (Python)

FoodBlock 1.6 for Python. The protocol is [`spec/protocol.md`](../../spec/protocol.md); this SDK does what the
JavaScript reference does, with the same names in snake_case, and passes every section of
[`spec/vectors.json`](../../spec/vectors.json).

It is a thin layer over the one Rust core ([`../rust`](../rust)). Every rule (canonical form, hashing, Ed25519, the
write check, chains, identities, envelopes, folds, messages between nodes, and protocol.json / aliases.json
themselves) lives there once; this package calls it through the core's single JSON door (`fb_call`, over `ctypes`).
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

The core is built with the node profile (micro, edge and node; `protocol.json` `profiles`): the canonical form,
SHA-256, Ed25519, the write check, key chains, grants, the folds, pull and push messages, discovery, envelopes and
commitments. A smaller device uses the Rust crate directly (`--no-default-features --features micro`); a call this
build does not have raises `FoodBlockError` with `kind == "profile"`.

## Example

```python
import foodblock as fb

keys, encryption, recovery = fb.generate_keypair(), fb.generate_encryption_keypair(), fb.generate_keypair()
me = fb.identity.genesis(keys, encryption_key=encryption["public_key_encrypt"], recovery_key=recovery["public_key_sign"])

# The one write path: compose, check, sign, chain. Money is { minor, currency }; amounts are decimal strings.
eggs = fb.write("thing", {"kind": "eggs", "name": "Free-range eggs"}, {}, author=me["hash"], key=keys, held=[me])
offer = fb.write("promise", {"terms": {"price": fb.money(450, "GBP"), "quantity": fb.amount("2", "{tray}"),
                                       "expires": "2026-10-20T00:00:00.000Z"}},
                 {"from": me["hash"], "what": eggs["hash"]}, author=me["hash"], key=keys, held=[me, eggs])

fb.promise_stage(offer, [me, eggs, offer])["stage"]   # 'offered'
fb.wrap(offer)                                        # { version, block, signature }, as it travels
fb.read_as(old_block)                                 # any earlier shape, read as 1.6
```

A refused block raises `fb.Refused`, whose `wrong` lists every reason. Nothing is ever repaired.

## API

- The protocol as data: `VERSION`, `PROTOCOL`, `ALIASES`, `TYPES`, `VERBS`, `REF_KEYS`, `FIELDS`, `PROFILES`.
- Blocks: `create`, `hash`, `canonical`, `canonical_json`.
- Keys and signatures: `generate_keypair`, `keypair_from_seed`, `sign(block, private_key)` (hex),
  `verify(block, signature, public_key_sign)`, `sign_message`, `verify_message`.
- Encryption: `generate_encryption_keypair`, `encryption_key_of`, `seal(value, keys, alg=ALG)`,
  `open(envelope, x25519_private)`, `ALG`, `ALG_RAW` (read only). New envelopes name no recipient.
- The commitment: `new_salt`, `salted_hash`, `commit`, `finds_self`, `reveal_for`.
- Writing: `compose`, `write`, `check` (the write check), `amount`, `money`, `confidence`, `terms`, `Refused`.
- The wire: `wrap`, `unwrap`, `header`, `seal_copy`, `open_copy`, `header_signed_by`.
- Reading: `read_as`, `is_a`.
- Chains and order: `next_link`, `check_chain`, `causal_order`, `past_of`, `sees`.
- Identity (`fb.identity`): `genesis`, `key_grant`, `identity_of`, `key_timeline`, `keys_of`, `signed_by_author`,
  `signer_of`, `chains_of`, `next_link_for`, `recovery_key_hash`, `history_counts`.
- Authority (`fb.grant`): `scope_within`, `is_live`, `why_not_live`, `ancestors`, `why_not_under`, `operators_of`,
  `add_duration`.
- Folds (`fb.fold`): `promise_stage`, `circle_state`, `holders_of`, `may_act_as`, `members_then`, `ownership`,
  `owner_of`, `receiver_of`, `where_now`, `successor_state`, `circle_key`, `counted_in`, `sequencer_of`.
- Between nodes (`fb.sync`): `pull_request`, `sign_pull`, `pull_errors`, `matches`, `heads_of`, `answer_pull`,
  `answer_signed_by`, `push_request`, `accept`, `push_answer`, `waited_too_long`, `well_known`, `announcement`,
  `well_known_errors`.

The reference's `keystore` (keeping a private key locked on a device) is product custody, not protocol, and is not
here.

## Test

```bash
python3 -m unittest discover -s tests
```

`tests/test_vectors.py` runs every section of `spec/vectors.json`, `spec/canonical-vectors.json` and
`test/vectors.json` exactly as `spec/run-vectors.cjs` does; a section it does not know fails the suite.
`tests/test_node.py` writes, seals, pulls and pushes.

## Licence

MIT
