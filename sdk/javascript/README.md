# @foodxdev/foodblock

The JavaScript reference SDK for the FoodBlock protocol, version 1.7 (`spec/core.md` and `spec/modules/`, normative).
A block is `{ type, state, refs }`, signed by its author's key; its identity is the hash of its canonical form (RFC
8785), in the hash of the suite of the key that signed it (`std`: SHA-256 and Ed25519; `p256`; `sm`). Every closed
list (types, verbs, ref keys, statuses, terms, grammar, limits, suites) is read from `spec/protocol.json`. Nothing is
copied into code. There is no earlier version in the protocol: old data is converted once (`legacy.convert`).

## One core

This SDK holds no protocol logic. The rules live once, in the Rust core (`sdk/rust`), compiled to WebAssembly and
shipped as `core/foodblock.wasm` (about 1 MB, no Rust needed to install or use). `src/core.cjs` loads it and gives it
the JSON door every other language uses (`call(op, ...args)`); each module in `src/` only names ops and gives the
answers the shapes JavaScript callers know. In Node it loads synchronously when you `require` the SDK. In a browser,
await `core.init(url)` once (a URL, a `fetch` response or the bytes) before the first call.

`node scripts/build-wasm.cjs` rebuilds the core (needs `rustup target add wasm32-unknown-unknown`) and records the
Rust source hash in `core/BUILD.json`; `npm test` fails if the Rust source has moved on since. An independent
implementation written only from the spec (`spec/oracle`) must also agree with every vector.

## Install

```bash
npm install @foodxdev/foodblock
```

## Quick start

```js
const fb = require('@foodxdev/foodblock')

// Who you are: a genesis needs only kind, at, audience and one key. Its hash is your id.
const keys = fb.generateKeypair()                       // { public_key_sign, private_key }
const me = fb.identity.genesis(keys, { kind: 'person', at: '2026-10-15T09:00:00.000Z', audience: 'public' })  // kind, at and audience are stated, never filled in; a recovery key (with its reach) and an encryption key are optional

// The one write path: compose, check, sign, chain. Money is { minor, currency }; amounts are decimal strings.
const eggs = fb.write('thing', { kind: 'eggs', name: 'Free-range eggs' }, {}, { author: me.hash, key: keys, held: [me], at: '2026-10-15T09:01:00.000Z', audience: 'public' })  // audience ('public' or recipients) and at are stated too
const offer = fb.write('promise', { terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } },
  { from: me.hash, what: eggs.hash }, { author: me.hash, key: keys, held: [me, eggs], at: '2026-10-15T09:02:00.000Z', audience: 'public' })

fb.promiseStage(offer, [me, eggs, offer]).stage   // 'offered'
fb.valid(offer, [me, eggs])                        // []: sound, signed by a key of its author, in its chain
```

## The seven types and seven verbs

`actor`, `thing` (what exists); `observe`, `transform`, `transfer` (is); `promise` (must); `grant` (may). Four carry
authority and are closed (`actor`, `promise`, `transfer`, `grant`); any other type word is open: stored and passed on,
with no authority. A schema is a `thing` of kind schema. The verbs: `updates`, `answers`, `confirms`, `defeats`, `for`, `derives_from`, `same_as`;
`prev` and `after` are causal metadata.

## API

- The protocol as data: `VERSION`, `PROTOCOL`, `TYPES`, `VERBS`, `REF_KEYS`, `FIELDS`, `PEERS`, `SUITES`.
- Blocks: `create`, `hash(type, state, refs, suite)`, `canonical`, `canonicalJSON`. Strict writing: `create` refuses a null, a
  float, an unsorted set or text outside NFC.
- Keys and signatures: `generateKeypair(suite)`, `keypairFromSeed(seed, suite)`, `sign(block, private_key, suite)` (hex),
  `verify(block, signature, public_key_sign)`, `signMessage`, `verifyMessage`, `suiteOfKey`.
- Encryption: `generateEncryptionKeypair(suite)`, `encryptionKeyOf`, `seal(value, keys, { suite })`, `open(envelope, private)`, `ALG`.
- The commitment: `newSalt`, `saltedHash`, `commit`, `findsSelf`, `revealFor`.
- Writing: `compose`, `write`, `valid(block, held)` (core.md section 8), `check`, `refusals`, `strictText`, `amount`, `money`,
  `terms`.
- The wire: `wrap`, `unwrap`, `header`, `sealCopy`, `openCopy`, `headerSignedBy`.
- The compact form: `cbor.encode(block, { short })`, `cbor.decode(bytes)`, `encodePush`, `decodePush`, `encodeHeader`, `decodeHeader`
  (a signed public block as CBOR; the id is still the hash of the canonical JSON).
- Strangers and small profiles: `strangers.receiptCode`, `readingIsPersonsClaim`, `readingConditionHolds`, `earnestPaid`.
- The one-time converter (not protocol): `legacy.convert(oldBlocks, { keys, at })`, `legacy.oldHash`.
- Chains and order: `nextLink`, `checkChain`, `causalOrder`, `pastOf`, `sees`.
- Identity: `identity.genesis`, `keyGrant`, `identityOf`, `keyTimeline`, `keysOf`, `signedByAuthor`, `chainsOf`,
  `nextLinkFor`, `recoveryKeyHash`, `forkPairs`. A rotation names `countedTo`.
- Authority: `grant.scopeWithin`, `isLive`, `whyNotLive`, `ancestors`, `whyNotUnder`, `operatorsOf`, `addDuration`.
- Folds: `fold.promiseStage`, `circleState`, `mayActAs`, `membersThen`, `ownership`, `ownerOf`, `receiverOf`, `whereNow`,
  `consent`; views: `promiseView`, `liveGrant`, `withdrawalSeen`, `due`, `recoveryReach`; profiles: `successorView`,
  `circleKey`, `countedIn`.
- Between nodes: `sync.pullRequest`, `signPull`/`signPush` (a `counter` or a `challenge`; no time), `newChallenge`, `pullRefusals`,
  `pushRefusals`, `matches`, `answerPull`, `answerSignedBy`, `accept`, `admissionRefusals`, `residencyRefusals`, `pushAnswer`,
  `waitedTooLong`, `wellKnown`, `announcement`, `wellKnownErrors`. A node's own choices are stated, never filled in: `answerPull` takes `cap` and
  `servesPairs`, `accept` and `acceptSealed` take `takesPairs`, `admissionRefusals` takes the rule's state or an explicit `null`, and today's count.

## Tests

`npm test` runs the conformance vectors (`spec/run-vectors.cjs`), the spec-only oracle (`spec/oracle`) and the unit tests. `node test/make-vectors.cjs`
rebuilds `spec/vectors.json` from fixed seeds and times, every expectation written by hand and checked against the core.

## License

Public domain (CC0 1.0).
