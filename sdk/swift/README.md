# FoodBlock (Swift)

FoodBlock 1.6 for Swift (iOS 16+, macOS 13+). The protocol is [`spec/protocol.md`](../../spec/protocol.md). This
package is a thin layer over the one Rust core ([`../rust`](../rust)): every rule (canonical form, hashing, Ed25519,
the write check, chains, identities, envelopes, folds, messages between nodes, and protocol.json itself) lives there
once, and Swift calls it through the core's single JSON door (`fb_call`, in the C ABI
`include/foodblock.h`). Signatures are byte-exact with every other SDK. There is no alias table and no reading of an older shape: year zero.

A block is `{ type, state, refs }`, signed by its author. Its id is the SHA-256 of its canonical form. Here a block is
a plain JSON dictionary (`JSON`, `[String: Any]`): `{ hash, type, state, refs, signature }`.

## Build

The Swift target links the Rust static library, so build that first (needs a Rust toolchain):

```bash
(cd ../rust && cargo rustc --release --features ffi --crate-type staticlib)    # target/release/libfoodblock.a
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build
```

`Sources/CFoodBlock` is a SwiftPM system-library target: a module map over `include/foodblock.h` (a symlink).
`Package.swift` links `../rust/target/release/libfoodblock.a` directly (so a dynamic copy beside it is never picked
up) plus `Security` and `CoreFoundation`. After rebuilding the core, touch a Swift file or delete `.build` so SwiftPM
relinks. For an app, build the same static library for each target triple (`aarch64-apple-ios`, `aarch64-apple-ios-sim`,
`aarch64-apple-darwin`), wrap them in an XCFramework, and point the target at that.

## Profile

The core is built with the node profile (micro, edge and node; protocol.json `peers`), so a phone, a robot kitchen
or a fridge with an Apple chip is a full peer. A call a smaller build lacks throws with kind `profile`. Serving pull and
push over a network is the app's job; this package makes and checks the messages. There is no keystore: keeping keys on
a device is the product's job.

## API

A signed pull or push carries exactly one of `counter` or `challenge` and no time; a node judges it with `highest` and `issued` (no clock).

| | |
|---|---|
| `FoodBlock.spec`, `version`, `types`, `verbs`, `refKeys`, `suites`, `fields`, `peers`, `refusalCodes`, `message`, `test(grammar, value)` | The protocol, as data (read from the core) |
| `canonical`, `canonicalJSON`, `create`, `hash` | The canonical form and a block's id |
| `generateKeypair`, `keypairFromSeed`, `sign`, `verify`, `signMessage`, `verifyMessage`, `suiteOfKey` | Signing by suite (std Ed25519, p256, sm). A key names its `suite`; `sign` signs |
| `generateEncryptionKeypair`, `encryptionKeyOf`, `seal`, `open` | Envelopes by suite (std: X25519, HKDF-SHA256, AES-256-GCM). `seal` encrypts |
| `newSalt`, `saltedHash`, `commit`, `findsSelf`, `revealFor` | The commitment: audiences, personal fields, ballots |
| `compose`, `write`, `check`, `valid`, `strictText`, `receiptCode`, `amount`, `money`, `confidence`, `terms` | Writing. `write` is compose, check, sign, chain; it throws `.refused` with every reason |
| `wrap`, `unwrap`, `header`, `sealCopy`, `openCopy`, `headerSignedBy` | The wire |
| `Legacy.convert`, `oldHash` | The one-time converter for pre-1.6 data (not part of the protocol) |
| `nextLink`, `checkChain`, `causalOrder`, `sees` | Chains and causal order |
| `Identity.genesis`, `keyGrant`, `keyTimeline`, `keysOf`, `signedByAuthor`, `identityState`, `counts`, `nextLinkFor`, `recoveryKeyHash`, `forked`, `forkPairs`, `recoveryReach` | Who someone is |
| `Grant.scopeWithin`, `isLive`, `whyNotLive`, `ancestors`, `whyNotUnder`, `operatorsOf`, `scopeRefusals`, `whyNotLiveUndo`, `actName` | Authority |
| `Fold.promiseStage`, `promiseView`, `consent`, `liveGrant`, `withdrawalSeen`, `due`, `ordererOf`, `circleState`, `mayActAs`, `membersThen`, `ownership`, `ownerOf`, `whereNow`, `successorView`, `circleKey`, `countedIn` | The folds |
| `Sync.pullRequest`, `signPull`, `signPush`, `newChallenge`, `pullErrors`, `pullRefusals`, `pushRefusals`, `matches`, `headsOf`, `answerPull`, `answerSignedBy`, `pushRequest`, `accept`, `pushAnswer`, `waitedTooLong`, `Strangers.admissionRefusals`, `residencyRefusals`, `readingIsPersonsClaim`, `readingConditionHolds`, `depositShapeOk`, `depositPaid`, `wellKnown`, `announcement`, `wellKnownErrors` | Between nodes |

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

`Tests/VectorsTests.swift` runs every section of `spec/vectors.json` (and `spec/canonical-vectors.json`) the way
`spec/run-vectors.cjs` does, including the generic `door` section, and fails if the file gains a section it does not
run. It also checks that the core's built-in `protocol.json` equals the repository's `spec/`. `Tests/NodeTests.swift` covers writing, refusing,
sealed copies, pull and push.

## Licence

MIT
