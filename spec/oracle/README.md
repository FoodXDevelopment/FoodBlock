# The conformance oracle

An independent implementation of FoodBlock 1.6, written only from the spec text (`core.md`, `canonical.md`,
`protocol.md`, `transport.md`, `protocol.json`, `modules/*.md`, `profiles/*.md`, `legacy/converter.md`) and never from
any SDK. It is plain Node with the built-in `crypto`: no dependency, no network, and no line shared with `sdk/`.

- `fb.cjs` is the oracle. It has the canonical form (RFC 8785 plus strict writing), the three suites (`std`, `p256`,
  `sm`; SM2 signatures and SM4-GCM are written by hand, the rest is Node), envelopes, the strict check with its
  refusal codes, `valid(block, context)` in core.md section 8 order, the chain, the identity fold (keys, rotation,
  frozen keys, recovery, operators) and the reach view, circles, the promise stage and its view, ownership, place,
  consent, admission, signed requests, the successor, rekey and ballot profiles, and the compact CBOR form (key
  table 1). `door(op, ...args)` is the table of ops the `door` section of the vectors names.
- `run.cjs` runs it against every section of `spec/vectors.json` and `spec/canonical-vectors.json`, vector by vector.
  It also checks that every block in every story passes `valid` against its story (a block a story marks void on
  purpose is the one exception).

```bash
node spec/oracle/run.cjs        # exits 1 on any disagreement; -v lists every case
```

A door case with `oracle: false` is outside the spec text and is skipped (the run prints how many). A signature made by
the oracle is checked by opening it, not by comparing bytes: the nonce of ECDSA and SM2 is the signer's choice.

Rules for editing the oracle: read only the spec. A guess that the text does not settle is marked `GUESS` in the code
(and is a gap in the spec worth closing), never copied from an SDK. When the oracle and a vector disagree, the spec
text decides which is wrong; if the text supports the oracle, leave the disagreement standing and report it.
