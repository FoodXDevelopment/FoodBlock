# @foodxdev/foodblock

The JavaScript reference SDK for the FoodBlock protocol (`spec/core.md` and `spec/modules/`, normative).
A block is `{ type, state, refs }`, signed by its author's key; its identity is the hash of its canonical form (RFC
8785), in the hash of the suite of the key that signed it (`std`: SHA-256 and Ed25519; `p256`; `sm`). Every closed
list (types, verbs, ref keys, statuses, terms, grammar, limits, suites) is read from `spec/protocol.json`. Nothing is
copied into code.

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
const me = fb.identity.genesis(keys, { kind: 'person', at: '2026-10-15T09:00:00.000Z', audience: 'public' })  // kind, at and audience are stated, never filled in; an encryption key is optional; a `reach` comes with its `clocks` ({ names, needed })

// The one write path: compose, check, sign, chain. An amount is { value, unit }, the value a decimal string; money is an amount (`fb.amount('4.50', 'GBP')`).
const eggs = fb.write('thing', { kind: 'eggs', name: 'Free-range eggs' }, {}, { author: me.hash, key: keys, blocks: [me], at: '2026-10-15T09:01:00.000Z', audience: 'public' })  // audience ('public' or recipients) and at are stated too
const offer = fb.write('promise', { terms: { lines: [{ id: 'eggs', what: eggs.hash, quantity: fb.amount('2', '{tray}'), price: fb.amount('4.50', 'GBP') }], expires: '2026-10-20T00:00:00.000Z' } },
  { from: me.hash }, { author: me.hash, key: keys, blocks: [me, eggs], at: '2026-10-15T09:02:00.000Z', audience: 'public' })

fb.promiseStage(offer, [me, eggs, offer]).stage   // 'offered'
fb.valid(offer, [me, eggs])                        // []: said by a key its pieces name (valid is who said these bytes)
fb.read(offer, [me, eggs])                         // []: this reader can read it (the value codes are read's)
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
  `verify(block, signature, public_key_sign)`, `signMessage`, `verifyMessage`, `suiteOfKey`; `passkeyChallenge`, `passkeySignature` (a passkey's flags must carry user-verified as well as presence, else `verify` is false).
- Encryption: `generateEncryptionKeypair(suite)`, `encryptionKeyOf`, `seal(value, keys, { suite })`, `open(envelope, private)`, `ALG`.
- The commitment: `newSalt`, `saltedHash`, `commit`, `findsSelf`, `revealFor`.
- Writing: `compose`, `write`, `valid(block, blocks)` (core.md section 8: size_limit, not_canonical, chain, unmet, bad_piece, bad_hash, bad_signature, unknown_suite),
  `read(block, blocks, { schemas })` (every value code: time, decimal, shape, audience, ...), `strictText`, `amount`, `terms`.
  `sign` refuses a block its own `read` refuses; sign such a block by hand with `signMessage(header(block), key)`.
- The wire: `wrap`, `unwrap`, `header`, `sealCopy`, `openCopy`, `headerSignedBy`.
- The compact form: `cbor.encode(block, { short })`, `cbor.decode(bytes)`, `encodePush`, `decodePush`, `encodeHeader`, `decodeHeader`
  (a signed public block as CBOR; the id is still the hash of the canonical JSON).
- Strangers and small profiles: `strangers.isStranger(receiver, sender, blocks, { block })`, `shortCode`, `codeMatches`, `readingIsPersonsClaim`, `readingConditionHolds`, `conditionHolds`.
- Chains and order: `nextLink`, `checkChain`, `causalOrder`, `pastOf`, `sees`.
- Identity: `identity.genesis` (`reach` with `clocks`), `keyGrant` (`voices` with `updates` and `clocks`, or one `key`), `keyTimeline`, `liveKeys`, `signedByAuthor`, `stands`,
  `identityState` (`{ signed_by_author, voices, clocks, keys, waiting }`), `chainsOf`, `nextLinkFor`, `forkPairs`. A key's end names `countedTo`.
  A genesis with a reach and no clock is refused (`bad_genesis`).
- Authority: `grant.scopeWithin`, `scopeReading(scope)` (the one reading of a scope: every default of authority.md, and `junk` for what cannot be read), `isLive`, `whyNotLive`, `ancestors`, `whyNotUnder`, `addDuration`.
- Folds: `fold.promiseStage`, `circleState`, `speaksFor(block, blocks)` (also `fb.speaksFor`: the one party a fold counts a block for, or null), `backed(block, person, blocks)` (also `fb.backed`: `{ backed, why, chain }`, whether the person signed the block or a live chain of their grants covers it), `backedAll(person, blocks)` (also `fb.backedAll`: `backed` for every block of a set at once, `{ hash: { backed, why } }`), `toComeBack(person, blocks)` (also `fb.toComeBack`: `{ to_come: [{ block, amount, to, why }] }`, money moved in the person's name that they do not back), `listingCheck(lookup, listing, blocks)`, `checkReads(check, blocks)`, `clearingApplied(clearing, blocks)`, `rulingReleases(stake, blocks)` (promises.md: finding, checks, clearing, rulings), `gives(block, person, blocks)` (also `fb.gives`: what of the person's becomes whose if the block stands, `{ gives: [{ of: money|goods|use, to, back }] }`, from typed terms and refs only), `accountOf(who, blocks)` (`{ who, destinations: [{ destination, by }], hash, at }` from the head of her account words, or null), `membersThen`, `ownership`, `ownerOf`, `receiverOf`, `whereNow`,
  `consent`; views: `promiseView`, `repeatOccurrences(promise, from, to)` (the UTC start times of a calendar repeat, read in its zone by the bundled IANA database), `due`; profiles: `circleKey`, `countedIn`.
- Between nodes: `sync.pullRequest`, `signPull`/`signPush` (a `counter` or a `challenge`; no time), `newChallenge`, `pullRefusals`,
  `pushRefusals`, `matches`, `answerPull`, `answerSignedBy`, `accept`, `strictPush` (answers `{ refused, messages }`: a push that fails is `{ refused: { hash, code, detail }, messages: [] }`; limits `push_bytes` 8 MiB, `push_messages` 1024), `admissionRefusals`, `residencyRefusals`, `pushAnswer`,
  `waitedTooLong`, `wellKnown`, `announcement`, `wellKnownErrors`. A node's own choices are stated, never filled in: `answerPull` takes `cap` and
  `servesPairs`, `accept` (blocks and sealed header messages alike) takes `takesPairs` and answers `{ taken, unjudged, refused, unread, equivocations, false_headers }`, `admissionRefusals` takes the rule's state or an explicit `null`, and today's count.

## Tests

`npm test` runs the conformance vectors (`spec/run-vectors.cjs`), the spec-only oracle (`spec/oracle`) and the unit tests.

## License

Public domain (CC0 1.0).
