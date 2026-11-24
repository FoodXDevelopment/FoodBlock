# The conformance oracle

An independent implementation, written only from the spec text (`core.md`, `canonical.md`, `protocol.md`,
`transport.md`, `protocol.json`, `modules/*.md`, `profiles/*.md`) and never from any SDK. It is plain Node with the built-in
`crypto`: no dependency, no network, no line shared with `sdk/`.

## What is in it

- `fb.cjs` is the one entry point: the door, one case per rule, and every export. It reads `basics.cjs`,
  `bytes.cjs`, `check.cjs`, `identity.cjs`, `grants.cjs`, `circles.cjs`, `deals.cjs`, `things.cjs`, `consent.cjs` and `wire.cjs`, one spec
  module each. They hold the canonical form (RFC 8785 plus strict writing), the three suites (`std`, `p256`, `sm`;
  SM2 signatures and SM4-GCM are written by hand, the rest is Node), the wire, `valid` and `read` (core.md, section 8), the line
  and the pair rule, the arrival log and a push judged on pieces, the identity fold (voices, keys, clocks, waits, reach), circles,
  grants and their meter, deals and their stage, holds and ownership (one `drawsOn` for what is left), pots, consent,
  sealed messages and mounts, rule sets, and the compact CBOR form. `door(op, ...args)` is the table of ops the `door` section of
  the vectors names.
- `dealer.cjs` is a dealer peer: it answers one message using the oracle's public ops alone.
- `readback/` holds the read-back reading (`reading.cjs`), its renderers (`en.cjs`, `en-sms.cjs`) and the redo (`redo.cjs`).
- `run.cjs` runs the oracle against every vector of `spec/vectors.json` and `spec/canonical-vectors.json`.
  It also checks that every block in every story passes `valid` against its story (except a block a story marks void on purpose).

## Running it

```bash
node spec/oracle/run.cjs        # exits 1 on any disagreement; -v lists every case
```

A door case with `oracle: false` is outside the spec text and skipped (the run prints how many). The oracle signs p256 and SM2 with RFC 6979 deterministic nonces, as core.md requires.

## Rules for editing

Read only the spec. Where the text does not settle a reading, the code says so in a comment ("the text does not say; read so"): a gap in the spec to close, never a rule copied from an SDK. When the oracle and a vector disagree, the spec text
decides which is wrong; if the text supports the oracle, leave the disagreement standing and report it.

## Where the stories live

Each story is a script in `stories/<subject>/<what it holds>.cjs`; its id is the file name without `.cjs`. The subjects are
`records` (bytes, ids, valid, read, the wire, a key's line and the order of words), `things` (holds), `keys` (voices, keys,
clocks, a will), `payments` (amounts, payments, pots), `grants`, `deals`, `circles`, `privacy`, `readback` and `rules`. Each story
prints the oracle's answer, the text's answer, and OK or DIFF.

- `stories/kit.cjs` is the one kit they are written with (signed worlds, names, the check); `grants/`, `deals/` and `circles/` add
  their own `lib.cjs`.
- `node spec/oracle/stories/run-all.cjs [subject...]` runs them.
- `node spec/oracle/stories/export.cjs [subject...]` writes each subject's door questions with the oracle's answers to
  `sdk/rust/tests/fixtures/<subject>.json`; the read-back's own export is `stories/readback/export.cjs`.
- `node spec/oracle/stories/core-stories.cjs <dir>` asks the oracle the questions the Rust core's story tests recorded
  (`FB_RECORD=<dir> cargo test --test <name>`).
- `stories/records/no-answer-depends-on-the-machine.cjs` writes a world file under `/tmp/ob/` (make that directory first).
