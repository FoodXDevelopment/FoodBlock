# Blocks

The fields a block may carry beyond core.md, causal order, records and refusals.

**Fields any block may carry:**
- `refs.subject`: who or what it is about.
- `state.when`: when it happened, if different from `at`. Four forms: an instant; a range `{ from, to }` (both, `from` no later than `to`); a relative form `{ after, wait }` (both; promises.md, Relative time); or a **window** with any of `not_before`, `not_after` (times, the first no later than the second) and `takes` (a duration), at least one, which may also sit beside a range's or relative form's keys, and no other key (`protocol.json`, `shapes.when_window`; profiles/tasks.md). A window is the performer's room to move, never a promise of when. Anything else, or a value that is neither text nor an object, is `shape`.
- `state.where`: a point `{lat, lon}` (WGS84 degrees as decimal strings, `lat` -90 to 90, `lon` -180 to 180, compared exactly), or an area: a point with `radius`, an amount in metres. `refs.place`: a thing it is in or at.
- `state.kind`: a label for the sort of step or thing; open words, those the protocol reads in `protocol.json` (`kinds`). `refs.of` is different: the thing this is an instance of (things.md).
- `refs.as`: the circle the author signs for.
- `refs.under`: the grant, rule or law it acts under.
- `refs.schema`: the schema it follows.
- `state.nonce`: on a private block, so short content cannot be guessed from its hash.
- `state.skip`: `true` on a block that jumps `seq` forward (core.md, The chain).
- `state.opening`: `{ salt, value }`, the opening of a commitment (privacy.md, A commitment). A condition `opened` reads it (promises.md, Conditions).

**Causal order.** `prev` is the previous block of the same key. `refs.after` is the other heads the author had seen, at most 16. A block's **causal past** is every block reachable from it through its refs and through the block it counts to (`state.counted_to`), so a rotation sees the chain it cuts. Order never reads `at`.

**No clock.** A micro with no clock leaves out `at` and `when`. Its edge writes an `observe` of kind `receipt`, `refs.derives_from` the block, `state.at` the time it received it. A reader that needs a time uses the earliest receipt by an edge it trusts, else reads it as unknown. A clockless micro cannot test `until`; it obeys a stop on arrival and asks its edge before an act that cannot be undone (authority.md).

**A named clock.** A block's own `at` dates nothing for anyone else, because its signer chose it. A time a stranger can trust is one that keepers both sides named wrote down. A named clock is `keepers: { names, needed }`: `names` are ids or `circle#role`, and `needed` follows Counts (folds.md): a set of one needs none. A keeper's **receipt** of a block is a counted `observe` of kind `receipt`, `refs.derives_from` the block, signed by the keeper, with `state.at` the time it received it. A block is **received by T** when `needed` different keepers each hold a receipt of it dated no later than T. A block no keeper received is dated by no one. A keeper may also sign an `observe` of kind `cutoff` with `state.when` an instant: no receipt of hers dated up to then is still to come. The clock is **closed through T** when `needed` keepers have each signed a cutoff of T or later. There is no default clock: a rule that reads one says who names it. The sides signed the clock, so its word binds both. **A keeper may be a person:** someone at a radio or phone shop who signs a receipt of what was said and when. She is a keeper because the sides named her, and her receipt is what a clock is. Four rules read it, each pointing here: a condition `within` or `without` (promises.md, Conditions), an offer's `terms.keepers` (promises.md, Who may bind), an event `when` (Relative time) and an event `repeat` (Terms).

**Records.** A **record** is a block and every version after it. `updates` names the version it replaces; a record is named by its first version. (A promise is not a record: its terms are fixed, and its `updates` is its stop.)

**Shared ref keys** (`protocol.json`, `refs`): every type may use them. On a closed type, any other ref key must be declared by the block's schema.

**Micro safety.** A micro keeps its `seq` counter and last block id in storage that survives power loss, and writes them before it sends. If it loses them, it asks its edge for its head. If it cannot learn it, it stops using that key: its operator rotates it with `counted_to` the last block anyone has (identity.md, Who may rotate). A `skip` block jumps `seq` forward when only the counter was lost.

**Refusals.** A refusal is `{ hash, code, detail }` and is final for those bytes (core.md, section 8). `code` is from the closed list in `protocol.json` (`refusals.codes`), one per rule, the same on every node. `detail` is free text no node reads. A block that breaks several rules gets one entry per rule, in the list's order. The list also names why a fold counts a block for nothing (`fold`) and why a node refuses a message (`message`).
