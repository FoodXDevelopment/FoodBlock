# @foodxdev/foodblock

The JavaScript reference SDK for the FoodBlock protocol, version 1.6 (`spec/protocol.md`, normative). A block is
`{ type, state, refs }`, signed by its author's key; its identity is the SHA-256 of its canonical form. Every closed
list (types, verbs, ref keys, answers, terms, grammar, limits, profiles) is read from `spec/protocol.json`; every
older shape is read through `spec/aliases.json`. Nothing is copied into code.

## Install

```bash
npm install @foodxdev/foodblock
```

## Quick start

```js
const fb = require('@foodxdev/foodblock')

// Who you are: a genesis naming your signing, encryption and (offline) recovery keys.
const keys = fb.generateKeypair()                       // { public_key_sign, private_key }
const me = fb.identity.genesis(keys, {
  encryptionKey: fb.generateEncryptionKeypair().public_key_encrypt,
  recoveryKey: fb.generateKeypair().public_key_sign
})

// The one write path: compose, check, sign, chain. Money is { minor, currency }; amounts are decimal strings.
const eggs = fb.write('thing', { kind: 'eggs', name: 'Free-range eggs' }, {}, { author: me.hash, key: keys, held: [me] })
const offer = fb.write('promise', { terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } },
  { from: me.hash, what: eggs.hash }, { author: me.hash, key: keys, held: [me, eggs] })

fb.promiseStage(offer, [me, eggs, offer]).stage   // 'offered'
fb.readAs(oldBlock)                                // any earlier shape, read as 1.6
```

## The seven types and seven verbs

`actor`, `thing` (what exists); `observe`, `transform`, `transfer` (is); `promise` (must); `grant` (may). A schema is a
`thing` of kind schema. The verbs: `updates`, `answers`, `confirms`, `defeats`, `for`, `derives_from`, `same_as`;
`prev` and `after` are causal metadata.

## API

- The protocol as data: `VERSION`, `PROTOCOL`, `ALIASES`, `TYPES`, `VERBS`, `REF_KEYS`, `FIELDS`, `PROFILES`.
- Blocks: `create`, `hash`, `canonical`, `canonicalJSON`.
- Keys and signatures: `generateKeypair`, `keypairFromSeed`, `sign(block, private_key)` (hex),
  `verify(block, signature, public_key_sign)`, `signMessage`, `verifyMessage`.
- Encryption: `generateEncryptionKeypair`, `encryptionKeyOf`, `seal(value, keys, { alg })`, `open(envelope, x25519_private)`,
  `ALG`, `ALG_RAW`.
- The commitment: `newSalt`, `saltedHash`, `commit`, `findsSelf`, `revealFor`.
- Writing: `compose`, `write`, `check` (the write check), `amount`, `money`, `confidence`, `terms`.
- The wire: `wrap`, `unwrap`, `header`, `sealCopy`, `openCopy`, `headerSignedBy`.
- Reading: `readAs`, `isA`.
- Chains and order: `nextLink`, `checkChain`, `causalOrder`, `pastOf`, `sees`.
- Identity: `identity.genesis`, `keyGrant`, `identityOf`, `keyTimeline`, `keysOf`, `signedByAuthor`, `chainsOf`,
  `nextLinkFor`, `recoveryKeyHash`, `historyCounts`.
- Authority: `grant.scopeWithin`, `isLive`, `whyNotLive`, `ancestors`, `whyNotUnder`, `operatorsOf`, `addDuration`.
- Folds: `fold.promiseStage`, `circleState`, `holdersOf`, `mayActAs`, `membersThen`, `ownership`, `ownerOf`,
  `receiverOf`, `whereNow`, `successorState`, `circleKey`, `sequencerOf`.
- Between nodes: `sync.pullRequest`, `signPull`, `pullErrors`, `matches`, `answerPull`, `answerSignedBy`, `accept`,
  `pushAnswer`, `waitedTooLong`, `wellKnown`, `announcement`, `wellKnownErrors`.

## Tests

`npm test` runs the conformance vectors (`spec/run-vectors.cjs`) and the unit tests. `node test/make-vectors.cjs`
rebuilds `spec/vectors.json`, keeping every earlier vector byte for byte.

## License

MIT
