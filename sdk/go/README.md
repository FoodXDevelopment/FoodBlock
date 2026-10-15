# foodblock (Go)

FoodBlock 1.6 for Go. The protocol is [`spec/protocol.md`](../../spec/protocol.md). This package is a thin cgo layer
over the one Rust core ([`../rust`](../rust)): every rule (canonical form, hashing, Ed25519, the write check, chains,
identities, envelopes, folds, messages between nodes, and protocol.json itself) lives there once,
and Go calls it through the core's single JSON door (`fb_call`, in the C ABI `include/foodblock.h`). The Go types
(`Block`, `Stage`, `Chain`, ...) are only the shapes the answers decode into.

## Build

cgo links the Rust static library, so build that first (needs a Rust toolchain and a C compiler):

```bash
(cd ../rust && cargo rustc --release --features ffi --crate-type staticlib)    # target/release/libfoodblock.a
go test ./...
```

`core.go` names the header and the library by `${SRCDIR}/../rust/...`, so the module is used from this repository
(or a vendored copy that keeps the `rust/` folder beside it). Elsewhere, set `CGO_CFLAGS=-I<dir with foodblock.h>` and
`CGO_LDFLAGS=<path to libfoodblock.a>` and remove the `#cgo` lines. There is no Go dependency beyond the standard
library.

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
| Strangers and small profiles | `ReceiptCode`, `ReadingIsPersonsClaim`, `ReadingConditionHolds`, `DepositShapeOk`, `DepositPaid` |
| The one-time converter (not protocol) | `Convert`, `OldHash` |
| Chains and causal order | `NextLink`, `CheckChain` (also `Skips`; equivocations are pairs), `CausesOf`, `PastOf`, `HeadsAmong`, `Sees`, `CausalOrder` |
| Who someone is | `Genesis`, `IsGenesis`, `GenesisOpens`, `RecoveryKeyHash`, `KeyGrant`, `KeyTimeline`, `KeysOf`, `SignedByAuthor`, `IdentityStateOf`, `NextLinkFor`, `Forked`, `ForkPairs` |
| Authority | `AddDuration`, `CompareDurations`, `ScopeWithin`, `ScopeRefusals`, `WhyNotLive`, `IsLive`, `Ancestors`, `WhyNotUnder`, `WhyNotLiveUndo`, `ActName`, `OperatorsOf`, `LimitFence`, `WithinLimit` |
| Folds | `PromiseStage` (no clock), `PromiseView` (the reader's now), `CircleStateOf`, `HoldersOf`, `MayActAs`, `MembersThen`, `OwnershipOf`, `OwnerOf`, `ReceiverOf`, `OrdererOf`, `WhereNow`, `Consent`, `LiveGrant`, `WithdrawalSeen`, `Due`, `RecoveryReach`, `SuccessorView`, `CircleKeyOf`, `CountedIn` |
| Between nodes | `PullRequest`, `SignPull`, `SignPush` (a `counter` or a `challenge`, no time), `NewChallenge`, `PullErrors`, `PushErrors`, `PullRefusals`, `PushRefusals`, `AdmissionRefusals`, `ResidencyRefusals`, `Matches`, `HeadsOf`, `AnswerPull`, `AnswerSignedBy`, `PushRequest`, `Accept`, `WaitedTooLong`, `PushAnswer`, `WellKnown`, `Announcement`, `WellKnownErrors` |

The JavaScript SDK's `keystore` (a device key locked with a recovery code) is product custody, not protocol, so it
is not here.

## Example

```go
keys, _ := foodblock.GenerateKeypair()
enc, _ := foodblock.GenerateEncryptionKeypair()
recovery, _ := foodblock.GenerateKeypair()
me, _ := foodblock.Genesis(keys, foodblock.GenesisOptions{EncryptionKey: enc.PublicKeyEncrypt, RecoveryKey: recovery.PublicKeySign, Reach: "P30D"})

eggs, err := foodblock.Write("thing", map[string]any{"kind": "eggs", "name": "Free-range eggs"}, nil,
	foodblock.WriteOptions{ComposeOptions: foodblock.ComposeOptions{Author: me.Hash}, Key: keys, Held: []foodblock.Block{me}})
message := foodblock.Wrap(eggs, "") // { version, block, signature }, as it travels
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

MIT
