# The conformance oracle

An independent implementation of FoodBlock 1.6, written only from the spec text (`spec/protocol.md` and the modules it
indexes, `protocol.json`, `aliases.json`, `canonical.md`, `transport.md`) and never from any SDK. It is plain Node with
the built-in `crypto`: no dependency, and no line shared with `sdk/rust` or `sdk/javascript`.

- `fb.cjs` is the oracle: canonical form, hashes, signatures, envelopes, the strict write check (with its refusal
  codes), reading older shapes, the identity, circle, promise, ownership, place and successor folds, push and pull, and the compact CBOR form.
- `run.cjs` runs it against every section of `spec/vectors.json` and `spec/canonical-vectors.json`, vector by vector.

```bash
node spec/oracle/run.cjs        # exits 1 on any disagreement; -v lists every one
```

It is part of `npm test` in `sdk/javascript` and of CI, beside the Rust core and `spec/run-vectors.cjs`. The vectors
are made by the core (`sdk/javascript/test/make-vectors.cjs`, fold expectations written by hand); the oracle checks
them. If the oracle and the core disagree on a vector, one of them misreads the spec text. The spec text decides which:
fix the one that is wrong, and if the text is unclear, fix the text.

Rule for editing the oracle: read only the spec. A guess that the text does not settle is marked `GUESS` in the code
(and is a gap in the spec worth closing), never copied from an SDK.
