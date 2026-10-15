# Blocks

The fields a block carries, causal order, records and refusals.

A block is `{ type, state, refs }`, signed by its author's key on their own device. Its id is the SHA-256 of its
canonical form (canonical.md). `state` holds data; `refs` holds links, each a hash or a set of hashes.

**Fields every block but a genesis carries:**
- `refs.author`: who said it.
- `state.seq` and `refs.prev`: its place in its signing key's own chain (core.md).
- `state.at`: when it was said, on the author's clock. An `observe`, `transform` or `transfer` may leave out `at` and `when` when its signer has no clock (No clock, below); every other block carries `at`. `state.when`: when it happened, if different (an instant, or `{
  from, to }`).
- `state.audience`: `public`, or a sorted list of commitments, one per recipient (privacy.md).

**Fields any block may carry:**
- `refs.subject`: who or what it is about.
- `state.where`: a point `{lat, lon}` (WGS84 degrees as decimal strings), or an area, a point with `radius`, an amount
  in metres. `refs.place`: a thing it is in or at.
- `state.kind`: a label for what kind of step or thing this is. Not `refs.kind`, which names the thing this one is an
  instance of.
- `refs.as`: the circle the author signs for.
- `refs.under`: the grant, rule or law it acts under.
- `refs.schema`: the schema it follows.
- `state.nonce`: on a private block, so short content cannot be guessed from its hash.
- `state.confidence`: the author's stated probability.
- `state.sequencer`: on a record's first block, the signing key that orders it, when not the key that signed it.

**Causal order.** `prev` is exact: the previous block of the same key. `refs.after` is the set of other heads the
author had seen (at most 16). When a block and a block it names in `after` both carry `at`, the block's `at` may not be earlier; if either has none, there is no check. A block's **causal
past** is every block reachable from it through its refs. `prev` and `after` are not verbs.

**No clock.** A micro that has no clock leaves out `at` and `when`. Its edge times the block: the edge writes its own `observe` of kind `receipt`, `refs.derives_from` the block, `state.at` the time it received it. A reader that needs a time uses the earliest receipt by an edge it trusts, and otherwise reads the time as unknown. Order never needed `at`: `seq`, `prev` and `after` give it.

**Records.** A **record** is a block and every version after it: `updates` names the version it replaces, and a record
is named by its first version, so links to it survive every change.

**Shared ref keys** are in `protocol.json` (`refs`): every type may use them and the seven verbs. Any other ref key
must be declared by the block's schema.

**Refusals.** A node refuses a block that breaks a rule in the spec, and the refusal is final for those bytes. It
is `{ hash, code, detail }`: `code` is from the closed list in `protocol.json` (`refusals.codes`), one code per rule,
meaning the same on every node; `detail` is free text no node reads. A block that breaks several rules gets one entry
per rule found, in the list's order. The list also names why a fold counts a block for nothing (`refusals.codes.fold`)
and why a node refuses a message (`refusals.codes.message`).

