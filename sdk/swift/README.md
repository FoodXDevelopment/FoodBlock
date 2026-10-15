# FoodBlock (Swift)

FoodBlock 1.6 for Swift (iOS 16+, macOS 13+, CryptoKit). The protocol is [`spec/protocol.md`](../../spec/protocol.md);
the JavaScript SDK is the reference, and this package does what it does, module for module.

A block is `{ type, state, refs }`, signed by its author. Its id is the SHA-256 of its canonical form. Here a block is
a plain JSON dictionary (`JSON`, `[String: Any]`): `{ hash, type, state, refs, signature }`.

## Where the rules come from

Every closed list (types, verbs, ref keys, answers, terms, scope, shapes, grammar, limits, envelope algs, messages,
profiles) is read from `protocol.json`, and every older shape from `aliases.json`. The package carries exact copies
of both in `Sources/spec`, because a package installed elsewhere cannot reach the repository's `spec/`. Run
`node test/sync-spec.cjs` after changing `spec/`; the tests fail if a copy differs by one byte.

## Profile

All three profiles' SDK parts (protocol.json `profiles`): **micro** (canonical form, SHA-256, Ed25519, the write
check, its own chain, the vectors), **edge** (the grant check, pull and push messages, the promise fold, the local
announcement) and **node** (envelopes, commitments, signed answers, discovery, and every fold). So a phone, a robot
kitchen or a fridge with an Apple chip can be a full peer. Serving pull and push over a network is the app's job;
this package makes and checks the messages. There is no keystore: keeping keys on a device is the product's job.

## API

| | |
|---|---|
| `FoodBlock.spec`, `aliases`, `version`, `types`, `verbs`, `refKeys`, `fields`, `profiles`, `test(grammar, value)` | The protocol, as data |
| `canonical`, `canonicalJSON`, `create`, `hash` | The canonical form and a block's id |
| `generateKeypair`, `keypairFromSeed`, `sign`, `verify`, `signMessage`, `verifyMessage` | Ed25519 (SPKI / PKCS#8 hex). `sign` signs |
| `generateEncryptionKeypair`, `encryptionKeyOf`, `seal`, `open`, `alg`, `algRaw` | X25519, HKDF-SHA256, AES-256-GCM. `seal` encrypts; `open` tries every entry and reads both algs |
| `newSalt`, `saltedHash`, `commit`, `findsSelf`, `revealFor` | The commitment: audiences, personal fields, ballots |
| `compose`, `write`, `check`, `amount`, `money`, `confidence`, `terms` | Writing. `write` is compose, check, sign, chain; it throws `.refused` with every reason |
| `wrap`, `unwrap`, `header`, `sealCopy`, `openCopy`, `headerSignedBy` | The wire |
| `readAs`, `isA` | Reading every earlier shape as 1.6 |
| `nextLink`, `checkChain`, `causalOrder`, `pastOf`, `sees`, `headsAmong` | Chains and causal order |
| `Identity.genesis`, `keyGrant`, `identityOf`, `keyTimeline`, `keysOf`, `signedByAuthor`, `signerOf`, `chainsOf`, `nextLinkFor`, `recoveryKeyHash`, `historyCounts` | Who someone is |
| `Grant.scopeWithin`, `isLive`, `whyNotLive`, `ancestors`, `whyNotUnder`, `operatorsOf`, `addDuration` | Authority |
| `Fold.promiseStage`, `circleState`, `holdersOf`, `mayActAs`, `membersThen`, `ownership`, `ownerOf`, `receiverOf`, `whereNow`, `successorState`, `circleKey`, `countedIn`, `sequencerOf` | The folds |
| `Sync.pullRequest`, `signPull`, `pullErrors`, `matches`, `headsOf`, `answerPull`, `answerSignedBy`, `pushRequest`, `accept`, `pushAnswer`, `waitedTooLong`, `wellKnown`, `announcement`, `wellKnownErrors` | Between nodes |

```swift
import FoodBlock

let keys = FoodBlock.generateKeypair()
let me = try Identity.genesis(keys, encryptionKey: FoodBlock.generateEncryptionKeypair().publicKeyEncrypt,
                              recoveryKey: FoodBlock.generateKeypair().publicKeySign)
let eggs = try FoodBlock.write("thing", ["kind": "eggs", "name": "Free-range eggs"], [:], author: me["hash"] as! String, key: keys, held: [me])
let message = FoodBlock.wrap(eggs)   // { version, block, signature }
```

## Test

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test
```

`Tests/VectorsTests.swift` runs every section of `spec/vectors.json`, `spec/canonical-vectors.json` and
`test/vectors.json` the way `spec/run-vectors.cjs` does (the same 307 vector checks), and fails if the file gains a
section it does not run. CryptoKit's Ed25519 signatures are randomized, so signature vectors are verified, not
reproduced byte for byte. `Tests/NodeTests.swift` covers writing, refusing, sealed copies, pull and push.

## Licence

MIT
