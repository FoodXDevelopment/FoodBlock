# Legacy: the one-time converter

**Not part of the protocol.** FoodBlock 1.6 is year zero. No node reads an older shape, keeps an alias table or has a closed history. Data from before 1.6 enters once, through this converter, and leaves as fresh 1.6 blocks. After that the old blocks are an archive.

## What it does

The converter is a tool a person runs on their own old blocks. It writes new blocks. It never edits an old one.

1. **Group by owner.** For each identity in the old data, find who can sign now: the owner (with their key), or their custodian (identity.md, Held keys). A block whose author cannot sign is not converted. The converting person may keep it as evidence instead: an `observe` of kind `import`, their own agent's reading `derives_from` the old hash, which they confirm (strangers.md).
2. **New genesis.** Each identity gets a new 1.6 genesis, signed by its owner or custodian, with `derives_from` the old genesis hash. Its id is new. It carries no history. If the old identity had a recovery key, the new genesis names its hash.
3. **Reshape.** Apply `aliases-0.x.json` (its own `$comment` is the algorithm) to read the old block as a 1.5 block. Then apply the final steps:
   - `refs.kind` becomes `refs.of`;
   - `state.sequencer` becomes `state.orderer`;
   - `alg_sign`, `alg_encrypt` and `alg_recovery` become `suite` and `recovery_suite`;
   - `state.dkim` is dropped;
   - a floating number becomes a decimal string or an integer, at the schema's unit;
   - `null` is dropped; strings are put in NFC; string arrays under `refs` are sorted and made unique;
   - roles are rewritten as the circle's `roles` list (`admin` becomes a role with `sign`, `admit` and `remove`);
   - an old successor, ballot, rekey or deposit block moves to its profile's shape, or is left as an archive.
4. **Rewrite the refs.** Every ref to an old id is replaced by the new id of the converted block, found in the map (below). Blocks are converted in causal order, so every ref has a new id by then.
5. **Chain.** Each owner's converted blocks form a new chain in the old order: `seq` from 1, `prev` the block before (the first names the new genesis), `author` the new genesis id.
6. **Time.** `state.at` is the conversion time on the signer's clock. The old time, if any, goes in `state.when`.
7. **Link back.** Every converted block carries `refs.derives_from` with the old hash. That is the only link to the past.
8. **Sign.** The owner or custodian signs each new block. A custodian signs only on the owner's word for the whole batch, with `state.channel` and the raw request's hash.
9. **The map.** The converter writes a file of `old hash : new hash`. Running it again with the same map changes nothing and adds only what is new.

## What a node does

Nothing. A 1.6 node refuses an old shape (`not_canonical`, `unknown_suite`, `undeclared_field`) like any other bad block. It has no alias table and no closed-history rule. A converted block is an ordinary 1.6 block that happens to name an old hash in `derives_from`. Readers who trust the converting person treat that link as provenance.

## Files

- `aliases-0.x.json`: the old table of type names, field moves and ref renames the converter reads in step 3. Converter data only.
