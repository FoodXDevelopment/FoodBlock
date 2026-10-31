// The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). NOT part of the protocol: no node reads
// an older shape. It writes fresh blocks, each `derives_from` the old hash, signed by the key you give for each old
// identity. The rules run in the Rust core (feature `legacy`).
const door = require('./door.cjs')
const { list } = require('./core.cjs')

/**
 * Convert old blocks. `keys` maps each old identity (its old genesis hash) to the key that signs for it
 * ({ public_key_sign, private_key, suite? }); `at` is the conversion time; `map` and `existing` continue an earlier run;
 * `channel` and `requestHash` are for a custodian signing on the owners' word.
 * `schemas` are published schemas (things of kind schema, with their hash) a block may name instead of a new one; a key may
 * carry `custodian` (and `channel`) when someone else holds it.
 * `custodianKey` signs only for the old identities `custodianFor` lists, and only under a channel (the option's or the key's);
 * every other identity, and a held key with no channel, is reported as skipped. A block that named no audience becomes its
 * author's alone; a genesis that was not public, and a circle that showed no role, are skipped. Nothing is filled in.
 * Returns { blocks, map (old to new), skipped: [{ hash, why }], deliveries: [{ block, to, reveals, sealed }] }.
 */
const convert = (oldBlocks, { keys, at, map = {}, existing = [], channel, requestHash, schemas = [], custodianKey, custodianFor = [] } = {}) =>
  door.convert(oldBlocks, { keys, at, map, existing: list(existing), channel, request_hash: requestHash, schemas: list(schemas), custodian_key: custodianKey, custodian_for: list(custodianFor) })
/** The id an old block had under the old canonical form. */
const oldHash = door.oldHash

module.exports = { convert, oldHash }
