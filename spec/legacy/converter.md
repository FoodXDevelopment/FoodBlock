# Legacy: the one-time converter

**Not part of the protocol.** FoodBlock 1.6 is year zero. No node reads an older shape, keeps an alias table or has a closed history. Data from before 1.6 enters once, through this converter, and leaves as fresh 1.6 blocks. After that the old blocks are an archive.

## What it does

The converter is a tool a person runs on their own old blocks. It writes new blocks. It never edits an old one.

1. **Group by owner.** For each identity in the old data (an `actor` that carries a key and updates nothing is its own identity, whoever made it; any other block belongs to its author), find who can sign now: the owner (with their key), or their custodian, who holds a key for them (identity.md, Held keys). A custodian's key is marked as that rule says: the new genesis names it in `state.custodian`, every block it signs carries `state.channel` (`import`, or the channel of the batch) and `derives_from` the old hash (and the raw request's hash). An identity with neither key is never dropped quietly: each of its blocks is listed as skipped with its reason. The converting person may also keep it as evidence: an `observe` of kind `reading` with `method: import`, their own agent's reading `derives_from` the old hash. It becomes their claim only when they put that fact to someone else (strangers.md). A block that names no author is skipped the same way.
2. **New genesis.** Each identity gets a new 1.6 genesis, signed by its owner or custodian. Its id is new. It carries no history, and, like every genesis, no refs. If the old identity had a recovery key, the new genesis names its hash. **The old-to-new link** lives in the first block of the new chain (`seq` 1): an `observe` of kind `converted`, `refs.subject` the new genesis, `derives_from` the old genesis hash (and the raw request's hash for a custodian), signed by the same owner or custodian. The map (step 9) is a convenience that repeats it; the block is the record.
3. **Reshape.** Apply `aliases-0.x.json` (its own `$comment` is the algorithm) to read the old block as a 1.5 block. Then apply the final steps:
   - `refs.kind` becomes `refs.of`;
   - `state.sequencer` becomes `state.orderer`;
   - `alg_sign`, `alg_encrypt` and `alg_recovery` become `suite` and `recovery_suite`;
   - `state.dkim` is dropped;
   - a floating number becomes a decimal string or an integer, at the schema's unit;
   - `null` is dropped; strings are put in NFC; string arrays under `refs` are sorted and made unique;
   - roles are rewritten as the circle's `roles` list (`admin` becomes a role with `sign`, `admit` and `remove`);
   - an old successor, ballot, rekey or deposit block moves to its profile's shape, or is left as an archive.

   **Values.** Every value is put in its 1.6 grammar, from the protocol's own lists (`protocol.json`):
   - a time (`time_fields`, anywhere in the state) becomes UTC to the millisecond: ISO text with any zone, with a space for the `T`, with a date only, or a number of seconds or milliseconds since the epoch;
   - a date (`date_fields`) becomes `YYYY-MM-DD`;
   - `state.confidence` becomes a decimal string from 0 to 1 (`1` becomes `"1"`); a confidence that is not a number from 0 to 1 (a label such as "verified") has no 1.6 home and is kept as `was_confidence`;
   - a ref whose value is not an id (a message, a URL, a hash named for a hash the protocol does not know) is not a link: it leaves `refs` and is kept as text in `state.was_<role>`.

   **Nothing is undeclared.** A field or a ref role that no 1.6 home holds is never written bare on a closed type (`actor`, `promise`, `transfer`, `grant`). It takes one of two exits, in this order:
   1. *A declared schema.* A schema already published that targets the block's `type.kind` (or its `type`) and declares every extra field and role is named in the block's `refs.schema`. Otherwise the converter writes its own: a `thing` of kind `schema`, signed by the same owner or custodian as the block and chained before it, with `target`, `fields` (each name with its field type from `protocol.json`) and `roles`. One schema per identity and target serves all that identity's blocks of that target. The block names it in `refs.schema`.
   2. *A converter observe.* If the protocol's own check (core.md, section 8, the checks that read the block alone) still refuses the block with its extras declared (a nested key outside a protocol shape, a status with no answer, an ask with no expiry, an answer with no deal), no 1.6 shape of its type holds it. It becomes an `observe` of kind `legacy`. `state.was` names the old type and kind. It carries the fields and refs the old block had, and `derives_from` the old hash, and grants nothing. An open type needs no schema: it is already allowed.

   If even that observe is refused, the block is reported in `skipped` with the refusal codes. The converter never writes a block the check refuses.

   **A private audience.** An old audience that is a plain list of identities becomes a list of commitments (privacy.md): one per recipient, sorted, a fresh salt each, the recipient written as its new id (`circle#role` keeps its role), and `state.nonce`. A recipient with no new id is left out; with none left, the block is for its author alone. Each recipient is then given what opens its entry: a delivery `{ block, to, reveals: [{ salt, value }] }`, and, when the recipient's new genesis names a `public_key_encrypt`, the sealed copy of the block (privacy.md, Sealed messages) with those reveals. The converter returns the deliveries; the person who runs it hands each to its recipient or stores it beside the block.
4. **Rewrite the refs.** Every ref to an old id is replaced by the new id of the converted block, found in the map (below). Blocks are converted in causal order, so every ref has a new id by then. A set is sorted and made unique again after its ids are replaced, because new ids sort differently from old ones.
5. **Chain.** Each owner's converted blocks form a new chain in the old order after the `converted` block: `seq` from 2, `prev` the block before (the first names the new genesis), `author` the new genesis id.
6. **Time.** `state.at` is the conversion time on the signer's clock. The old time, if any, goes in `state.when`.
7. **Link back.** Every converted block but the genesis carries `refs.derives_from` with the old hash. That is the only link to the past.
8. **Sign.** The owner or custodian signs each new block. A custodian signs only on the owner's word for the whole batch, with `state.channel` and the raw request's hash.
9. **The map.** The converter writes a file of `old hash : new hash`. Running it again with the same map changes nothing and adds only what is new.

## What a node does

Nothing. A 1.6 node refuses an old shape (`not_canonical`, `unknown_suite`, `undeclared_field`) like any other bad block. It has no alias table and no closed-history rule. A converted block is an ordinary 1.6 block that happens to name an old hash in `derives_from`. Readers who trust the converting person treat that link as provenance.

## Files

- `aliases-0.x.json`: the old table of type names, field moves and ref renames the converter reads in step 3. Converter data only.
