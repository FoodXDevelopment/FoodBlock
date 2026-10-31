# foodblock (Go)

FoodBlock 1.7 for Go. The protocol is [`spec/protocol.md`](../../spec/protocol.md). This package is a thin layer
over the one Rust core ([`../rust`](../rust)): every rule (canonical form, hashing, Ed25519, the write check, chains,
identities, envelopes, folds, messages between nodes, and protocol.json itself) lives there once. The core is compiled
to WebAssembly (the very file the JavaScript SDK carries), embedded in the package with `go:embed` (`foodblock.wasm`)
and run by [wazero](https://wazero.io), a pure Go runtime. So **there is no cgo, no C compiler and no native library**:
`go get` and build, for any `GOOS/GOARCH`, with one artifact everywhere. Go calls the core through its single JSON door
(`wasm.go`); the Go types (`Block`, `Stage`, `Chain`, ...) are only the shapes the answers decode into.

## Use

```bash
go get github.com/FoodXDevelopment/foodblock/sdk/go
```

The first call compiles the core (about a second); after that a call costs microseconds. Calls are safe from many
goroutines (they take turns on one instance).

## Test

```bash
CGO_ENABLED=0 go test ./...
```

`foodblock.wasm` here must equal `sdk/javascript/core/foodblock.wasm` (`TestWasmIsTheSharedCore`). After changing the
Rust core: `cd sdk/javascript && node scripts/build-wasm.cjs`, then `node tools/version-sync.cjs --write` copies it here.
The only dependency is wazero.

## Peer

**Node.** Everything a person's or a machine's node needs, so it also covers micro and edge: the canonical form,
hashes and signatures by suite, the write check, key chains, grants and stops, envelopes and commitments,
signed pull and push messages and their answers, discovery and the local announcement, and every fold. Serving pull
and push over a network is the application's job; the package builds and checks the messages.

A small device (a fridge sensor, a scale) can use only the micro part: `Write` (or `Compose`, `Check`, `Sign`) and
`Wrap`, with its own chain.

## API

| | |
|---|---|
| The protocol as data | `Version`, `Protocol`, `Types`, `Verbs`, `RefKeys`, `Fields`, `Peers`, `Suites`, `Statuses`, `Powers` |
| A block | `Block`, `Create`, `Hash`, `Canonical`, `CanonicalJSON` |
| Keys and signatures, by suite (std, p256, sm; the suite is an optional last argument) | `GenerateKeypair`, `KeypairFromSeed`, `Sign` (signs; checks nothing), `Verify`, `SignMessage`, `VerifyMessage`, `SuiteOfKey` |
| Encryption, by suite | `GenerateEncryptionKeypair`, `EncryptionKeyOf`, `Seal(value, keys, suite, fixed)` (encrypts; `Fixed` only reproduces a vector), `Open`, `Alg` |
| The commitment | `NewSalt`, `SaltedHash`, `Commit`, `FindsSelf`, `RevealFor` |
| Writing | `Compose`, `Write` (compose, check, sign, chain), `Check`, `Refusals`, `Valid`, `StrictText` (the checks), `Amount`, `Money`, `Confidence`, `Terms`, `Public` |
| The wire | `Wrap`, `Unwrap`, `Header`, `SealCopy`, `OpenCopy`, `HeaderSignedBy` |
| Strangers and small profiles | `ReceiptCode`, `ReadingIsPersonsClaim`, `ReadingConditionHolds`, `EarnestShapeOk`, `EarnestPaid` |
| The one-time converter (not protocol) | `Convert`, `OldHash` |
| Chains and causal order | `NextLink`, `CheckChain` (also `Skips`; equivocations are pairs), `CausesOf`, `PastOf`, `HeadsAmong`, `Sees`, `CausalOrder` |
| Who someone is | `Genesis`, `IsGenesis`, `GenesisOpens`, `RecoveryKeyHash`, `KeyGrant`, `KeyTimeline`, `KeysOf`, `SignedByAuthor`, `IdentityStateOf`, `NextLinkFor`, `Forked`, `ForkPairs` |
| Authority | `AddDuration`, `CompareDurations`, `ScopeWithin`, `ScopeRefusals`, `WhyNotLive`, `IsLive`, `Ancestors`, `WhyNotUnder`, `WhyNotLiveUndo`, `ActName`, `OperatorsOf`, `LimitFence`, `WithinLimit` |
| Folds | `PromiseStage` (no clock), `PromiseView` (the reader's now), `CircleStateOf`, `HoldersOf`, `MayActAs`, `MembersThen`, `OwnershipOf`, `OwnerOf`, `ReceiverOf`, `WhereNow`, `Consent`, `LiveGrant`, `WithdrawalSeen`, `Due`, `RecoveryReach`, `SuccessorView`, `CircleKeyOf`, `CountedIn` |
| Between nodes | `PullRequest`, `SignPull`, `SignPush` (a `counter` or a `challenge`, no time), `NewChallenge`, `PullRefusals`, `PushRefusals`, `AdmissionRefusals`, `ResidencyRefusals`, `Matches`, `HeadsOf`, `AnswerPull`, `AnswerSignedBy`, `PushRequest`, `Accept`, `WaitedTooLong`, `PushAnswer`, `WellKnown`, `Announcement`, `WellKnownErrors` |

Nothing a signer left out is filled in. `Compose`, `Write` and `Genesis` need an `Audience` (`[]string{foodblock.Public}`, or
recipients) and an `At`; `Genesis` also a `Kind`; `KeyGrant` an `At`. A node states its choices: `AnswerPull` a `Cap` (1 or more; there
is no default) and `ServesPairs`; `Accept` and `AcceptSealed` `TakesPairs`. A reader with an arrival log passes `Inside` or
`Outside` for a block whose arrival it does not know (`KeysOf`, `KeyTimeline`, `SignedByAuthor`, `IdentityStateOf`,
`RecoveryReach`). `Consent`'s fourth argument is the sender's block (or nil). `Convert` takes `CustodianFor`. A missing choice is
refused by the core.

A function that returns no error (a yes or no, a list such as `Valid`'s refusals) panics when the core fails, never returns the
empty answer: an empty list means "no refusals", so a failed call read as empty would read as fine (security J). Functions that
can fail in normal use return an `error`.

The JavaScript SDK's `keystore` (a device key locked with a recovery code) is product custody, not protocol, so it
is not here.

## Example

```go
now := "2026-10-15T09:00:00.000Z" // your own clock reading: nothing here fills `at`
keys, _ := foodblock.GenerateKeypair()
enc, _ := foodblock.GenerateEncryptionKeypair()
recovery, _ := foodblock.GenerateKeypair()
me, _ := foodblock.Genesis(keys, foodblock.GenesisOptions{Kind: "person", At: now, Audience: []string{foodblock.Public}, EncryptionKey: enc.PublicKeyEncrypt, RecoveryKey: recovery.PublicKeySign, Reach: "P30D"})

eggs, err := foodblock.Write("thing", map[string]any{"kind": "eggs", "name": "Free-range eggs"}, nil,
	foodblock.WriteOptions{ComposeOptions: foodblock.ComposeOptions{Author: me.Hash, Audience: []string{foodblock.Public}, At: now}, Key: keys, Held: []foodblock.Block{me}})
message := foodblock.Wrap(eggs) // { block, signature }, as it travels
```

## Test

```bash
go test ./...
```

`vectors_test.go` checks the core carries the repository's `spec/` exactly, and runs every section of `spec/vectors.json` the way `spec/run-vectors.cjs` does (canonical form,
hashes, chains, audiences, every story's signatures and write check, envelopes, sealed copies, headers, identities,
deals, circles, every fold, refusals, messages, the compact form and the generic `door` cases) and the adversarial `spec/canonical-vectors.json`. A section it does not know fails by name. `node_test.go` checks writing,
sealing, pull and push.

Go's regular expressions have no lookahead, so the duration grammar's lookaheads are checked in code
(`compileGrammar` in `spec.go`): each `(?=X)` after a literal character becomes "that character is always followed by
X". This is exact for the grammar in `protocol.json`.

## Licence

Public domain (CC0 1.0).
