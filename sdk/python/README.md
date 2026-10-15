# foodblock (Python)

FoodBlock 1.6 for Python. The protocol is [`spec/protocol.md`](../../spec/protocol.md); this SDK does what the
JavaScript reference does, with the same names in snake_case, and passes every section of
[`spec/vectors.json`](../../spec/vectors.json).

It reads every list (types, verbs, ref keys, terms, grammar, limits) from `protocol.json` and every older shape from
`aliases.json`. The package carries an exact copy of both in `foodblock/spec/`, made from the repository's `spec/`
by `node test/sync-spec.cjs`; the tests fail if a copy differs.

```bash
pip install foodblock        # needs cryptography
```

## Profile

All three profiles (micro, edge, node; `protocol.json` `profiles`) are covered as library code: a sensor, a farm
computer or a person's node can each use it. What it holds: the canonical form, SHA-256, Ed25519, the write check, its
own key chain; grants and stops; pull and push messages, discovery and local announcements, the promise fold;
envelopes, commitments, signed pull and answers, and every fold. Serving pull and push over a network is the app's job
(see `server/` for one).

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
