# foodblock (Kotlin, JVM and Android)

FoodBlock 1.6 for Android phones, Android-based devices (tills, scales, kiosks, fridges with a screen) and any JVM.

A **block** is a small signed message: `{ type, state, refs }`, signed by its author's key. Its id is the SHA-256
hash of its canonical form, so any two peers agree on it byte for byte.

This library is a thin Kotlin skin over the Rust core in `sdk/rust`. It does not copy the protocol a sixth time:
every call goes through one native function into the same Rust code that robots, sensors and C++ programs use.
So if the Rust core passes the vectors, this library passes them too, by construction.

MIT licence. The version is the protocol's (`spec/protocol.json` `version`), here `1.6.0`.

## How it is built

```
Kotlin API (world.foodx.foodblock)          FoodBlock, Identity, Grant, Fold, Sync
        |  op name + JSON array, as UTF-8 bytes
Native.call(op, args)                       one JNI function
        |
sdk/rust/src/jni.rs  (feature `jni`)        a table: op name -> the Rust function
        |
the Rust core                               canonical form, SHA-256, Ed25519, the write check, folds ...
```

Why JNI with one door, not uniffi: blocks are JSON, and JSON is already the one shape every FoodBlock SDK and the
wire share. uniffi would still pass JSON as strings, and it adds a code generator, JNA at runtime and a version to
keep in step. One JNI function needs none of that: the Rust side is a name table, the Kotlin side is plain typed
functions. Bytes cross (not Java strings) so text stays exact UTF-8.

## Install and packaging

- **JVM (desktop, server):** one jar, `world.foodx:foodblock`. It bundles the native core for macOS (arm64, x64),
  Linux (x64, arm64) and Windows (x64) under `native/<id>/`. At first use the loader picks the copy for the computer
  (`os.name` + `os.arch`), extracts it to a temporary file and loads it. Another platform: build `sdk/rust` with
  `--features jni` and run with `-Dfoodblock.library=<path>`, or put `libfoodblock` on `java.library.path`.
- **Android:** an AAR with `libfoodblock.so` for arm64-v8a, armeabi-v7a and x86_64 (minSdk 24).

Both are packaged from `sdk/kotlin/natives/`, which `scripts/build-natives.sh [jvm|android|all]` fills with what this
computer can build (cargo-ndk if installed, otherwise the NDK's clang). A Mac builds macOS and Android; Linux and
Windows copies come from their own runners (`.github/workflows/packages.yml`, which then builds the jar with
`-Pfoodblock.allNatives=true` so a release cannot miss one). `./gradlew :foodblock:testBundled` loads the jar's own copy
with no `foodblock.library` set.

## Use it

```kotlin
import world.foodx.foodblock.*
import kotlinx.serialization.json.*

val keys = FoodBlock.generateKeypair()                      // made once, kept on the device (Android Keystore-wrapped)
val me = Identity.genesis(keys, kind = "person", recoveryKey = offlineRecovery.publicKeySign,
                          encryptionKey = myX25519Public)
val id = me["hash"]!!.jsonPrimitive.content

// The one way to write: compose, check, sign, chain. A number is a decimal string, never a float.
val reading = FoodBlock.write(
    "observe",
    buildJsonObject { put("kind", "reading"); put("amount", FoodBlock.amount("3.9", "Cel")) },
    buildJsonObject { put("subject", id) },
    WriteOptions(author = id, key = keys, held = listOf(me)),
)
val message = FoodBlock.wrap(reading)                       // { version, block, signature }: send this
```

`write` refuses a block that breaks a rule and throws `RefusedException` with every reason (`reasons`, and
`refusals` with their codes); it never repairs. Keep the last block you wrote: it is the `held` the next write needs,
so your chain stays one line.

Names follow the JavaScript reference SDK: `canonical`, `hash`, `sign` (signs), `verify`, `check`, `refusals` (the check with its codes), `valid`, `strictText`, `receiptCode`, `suiteOfKey`, `commit`, `findsSelf`, `forkPairs`,
`nextLink`, `checkChain`, `causalOrder`, `write`, `wrap`, `unwrap`, `header`, `seal` (encrypts), `open`, `sealCopy`,
`openCopy`; `Identity.genesis / recoveryKeyHash / keysOf / keyTimeline / signedByAuthor / identityState / recoveryReach`; `Grant.operatorsOf / whyNotUnder /
whyNotLive / whyNotLiveUndo / actName`; `Fold.promiseStage / promiseView / consent / liveGrant / withdrawalSeen / due / ordererOf / circleState / mayActAs / membersThen / whereNow / ownership / successorView /
countedIn / circleKey`; `Sync.accept / signPull / signPush / newChallenge / pullRefusals / pushRefusals / pullErrors / pushErrors / admissionRefusals / residencyRefusals / pushAnswer / pushRequest / answerSignedBy / wellKnownErrors / announcement`; `Strangers.*` (the reading and deposit rules); `Legacy.convert / oldHash` (the one-time converter for pre-1.6 data, not part of the protocol); `FoodBlock.call(op, ...)` is the door itself.

There is no alias table and no reading of an older shape: year zero. A key names its `suite` (std, p256, sm): `Keypair.suite`, and `suite` arguments on `hash`, `create`, `sign`, `seal`, `WriteOptions` and the key grants. A signed pull or push carries exactly one of `counter` or `challenge` and no time; a node judges it with `Freshness(node, keys, highest, issued)`.

Blocks are `kotlinx.serialization` `JsonObject`s, the same `{ hash, type, state, refs, signature }` as everywhere.
Numbers keep their exact text across the boundary.

## In an Android app (FoodOS)

Add the AAR (or the `:android` module) and call the API. It loads `libfoodblock.so` by itself. The AAR carries the
native library for `arm64-v8a` (phones) and `x86_64` (the emulator); minSdk 24.

Good habits on a phone:
- Call it off the main thread (a coroutine on `Dispatchers.Default`): folds over many blocks take real time.
- Keep the private key wrapped by the Android Keystore; hand it to `write` only when signing.
- Before an act that cannot be undone, check the grant you act under is still live (`Grant.whyNotLive`).

An Android-based device (a till, a scale with a screen, a kitchen display) uses it the same way. It is a peer: it has
its own identity, signs what it measures or does, and keeps its own chain.

## Peers

The protocol names sizes of peer (`peers` in protocol.json). `FoodBlock.PEERS` says what this build has.

| Peer | What it adds | Who |
|---|---|---|
| micro | canonical form, SHA-256, Ed25519, the write check, its own chain, the grant check | a sensor or device that only signs |
| edge | the folds and Pull, Push, discovery | the computer at a farm, kitchen, shop or vehicle |
| node (default) | envelopes and sealed copies | a person's phone or always-on node |

Build a smaller one with `-Pfoodblock.profile=micro` (or `edge`). A call the build leaves out throws
`FoodBlockException` with kind `profile`. A phone should use `node`. A tiny microcontroller without Android uses the
Rust crate or its C ABI directly.

## Build and test

You need a JDK 17, Rust (`cargo`), and for the AAR the Android SDK with NDK 29.0.14206865.

```bash
./gradlew :foodblock:test                       # builds the Rust core for this computer, runs every vector
ANDROID_HOME=~/Library/Android/sdk ./gradlew :android:assembleRelease   # the AAR, both ABIs
# rustup target add aarch64-linux-android x86_64-linux-android   (once)
```

The AAR lands in `android/build/outputs/aar/android-release.aar`. Without an Android SDK, `:android` is skipped.

`VectorsTest` runs every section of `spec/vectors.json` (and `spec/canonical-vectors.json`) through this Kotlin API,
the same way `spec/run-vectors.cjs` does: canonical strings and hashes, the ledger (each block `valid` against those
before it), the keys rebuilt from their seeds in their suites, the write check, chains, audience commitments,
signatures, bad signatures, headers, envelopes and sealed copies, identities, every fold, refusals (by their
protocol.json codes), the messages between nodes, the compact form, and the generic `door` section (one case per rule of
the core: `expect` is a subset match, `exact` deep equality, `codes` the refusal codes, `error` a failure). A section the
build's peer leaves out prints that it was left out. The Kotlin library reads the spec through the core (op `spec`); it
keeps no copy of `protocol.json`. `ApiTest` writes a sensor's chain end to end, a refusal, a sealed value, and every suite.
