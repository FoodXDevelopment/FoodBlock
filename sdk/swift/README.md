# FoodBlock (Swift)

FoodBlock 1.6 for Swift (iOS 16+, macOS 13+). The protocol is [`spec/protocol.md`](../../spec/protocol.md). This
package is a thin layer over the one Rust core ([`../rust`](../rust)): every rule (canonical form, hashing, Ed25519,
the write check, chains, identities, envelopes, folds, messages between nodes, and protocol.json itself) lives there
once, and Swift calls it through the core's single JSON door (`fb_call`, in the C ABI
`include/foodblock.h`). Signatures are byte-exact with every other SDK. There is no alias table and no reading of an older shape: year zero.

A block is `{ type, state, refs }`, signed by its author. Its id is the SHA-256 of its canonical form. Here a block is
a plain JSON dictionary (`JSON`, `[String: Any]`): `{ hash, type, state, refs, signature }`.

## Install

SwiftPM reads `Package.swift` at the **repository root** (not in this folder):

```swift
.package(url: "https://github.com/FoodXDevelopment/foodblock", from: "1.6.0")
```

The Rust core comes as a binary target, `CFoodBlock.xcframework` (iOS device, iOS simulator, macOS; static libraries,
so the app links one file and nothing is loaded at run time). A release uploads the zip; the manifest names its URL
and checksum. There are no `unsafeFlags`, so this package can itself be a dependency of other packages.

## Build from this repository

```bash
sdk/swift/scripts/build-xcframework.sh          # all slices, zips it, prints the SwiftPM checksum (about 2 minutes)
sdk/swift/scripts/build-xcframework.sh --macos  # macOS only: enough for `swift test`
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build    # at the repository root
```

The script needs Rust with the Apple targets (`rustup target add aarch64-apple-ios aarch64-apple-ios-sim
x86_64-apple-ios aarch64-apple-darwin x86_64-apple-darwin`) and Xcode. When `sdk/swift/CFoodBlock.xcframework`
exists the root manifest uses it; otherwise it uses the release download.

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
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test    # at the repository root
```

`Tests/VectorsTests.swift` runs every section of `spec/vectors.json` (and `spec/canonical-vectors.json`) the way
`spec/run-vectors.cjs` does, including the generic `door` section, and fails if the file gains a section it does not
run. It also checks that the core's built-in `protocol.json` equals the repository's `spec/`. `Tests/NodeTests.swift` covers writing, refusing,
sealed copies, pull and push.

## Licence

MIT

## FoodBlockWindow: the phone as a window onto its hosted node

A second library in the same package (`import FoodBlockWindow`). The person's passkey is their FoodBlock key (spec/modules/passkeys.md): it never leaves the
phone and the host holds no key. `FoodBlockWindow` registers (the host proposes the genesis, the passkey signs its id), signs in by a passkey assertion over a
server challenge, reads blocks and folds, and writes: the host proposes the block, the passkey signs its id, the host's core judges it. Offline it composes
the block here, signs it, checks it with the bundled core and queues it in SQLite; `sync()` hands the queue over in order. `ApplePasskeys` is the platform
passkey (`ASAuthorizationPlatformPublicKeyCredentialProvider`; add the Associated Domains entitlement `webcredentials:foodx.network`). Tests:
`swift test --filter FoodBlockWindowTests` (the end-to-end ones start a local host from the Backend checkout, `FOODOS_BACKEND`, and skip without it).
