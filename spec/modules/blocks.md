# Blocks

The fields a block may carry beyond core.md, causal order, records and refusals.

**Fields any block may carry:**
- `refs.subject`: who or what it is about.
- `state.when`: when it happened, if different from `at`. Four forms: an instant; a range `{ from, to }`; a relative form `{ after, wait }` (promises.md, Relative time); or a **window**, an object with any of `not_before` (a time), `not_after` (a time) and `takes` (a duration), at least one of them, which may also sit beside the keys of a range or a relative form, and no other key (`protocol.json`, `shapes.when_window`; profiles/tasks.md). A window is the performer's room to move, never a promise of when; it is read like the other forms wherever `when` is read. An object that fits none of the forms is refused (`shape`).
- `state.where`: a point `{lat, lon}` (WGS84 degrees as decimal strings), or an area, a point with `radius`, an amount in metres. `refs.place`: a thing it is in or at.
- `state.kind`: a label for what sort of step or thing this is. Kinds are open words, and the ones the protocol reads are listed in `protocol.json` (`kinds`). Not `refs.of`, which names the thing this one is an instance of (things.md).
- `refs.as`: the circle the author signs for.
- `refs.under`: the grant, rule or law it acts under.
- `refs.schema`: the schema it follows.
- `state.nonce`: on a private block, so short content cannot be guessed from its hash.
- `state.confidence`: the author's stated probability.
- `state.orderer`: on a record's first block, the signing key that orders it, when not the key that signed it (folds.md, Orderer).
- `state.skip`: `true` on a block that jumps `seq` forward (core.md, The chain).

**Causal order.** `prev` is exact: the previous block of the same key. `refs.after` is the set of other heads the author had seen, at most 16. A block's **causal past** is every block reachable from it through its refs, and through the block it counts to (`state.counted_to`, a rotation's or a removal's), so a rotation sees the chain it cuts. Order never reads `at`: `seq`, `prev` and `after` give it.

**No clock.** A micro that has no clock leaves out `at` and `when`. Its edge times the block: the edge writes its own `observe` of kind `receipt`, `refs.derives_from` the block, `state.at` the time it received it. A reader that needs a time uses the earliest receipt by an edge it trusts, and otherwise reads the time as unknown. A clockless micro cannot test a grant's `until`; it obeys a stop on arrival and asks its edge before an act that cannot be undone (authority.md).

**Records.** A **record** is a block and every version after it. `updates` names the version it replaces, and a record is named by its first version, so links to it survive every change. (A promise is not a record in this sense: its terms are fixed, and its `updates` is its stop, promises.md.)

**Shared ref keys** are in `protocol.json` (`refs`): every type may use them, the seven verbs and `prev` and `after`. On a closed type, any other ref key must be declared by the block's schema.

**Micro safety.** A micro keeps its `seq` counter and its last block's id in storage that survives power loss, and writes them before it sends. If it loses them, it asks its edge for its head. If it cannot learn its true head, it stops using that key: its operator rotates it with `counted_to` the last block anyone has (identity.md, Who may rotate). A block marked `skip` may jump `seq` forward when only the counter, not the head, was lost. So a lost counter never freezes an identity.

**Refusals.** A node refuses a block that breaks a rule in the spec, and the refusal is final for those bytes. It is `{ hash, code, detail }`. `code` is from the closed list in `protocol.json` (`refusals.codes`), one code per rule, meaning the same on every node. `detail` is free text no node reads. A block that breaks several rules gets one entry per rule found, in the list's order. The list also names why a fold counts a block for nothing (`fold`) and why a node refuses a message (`message`).
