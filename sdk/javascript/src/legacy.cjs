// The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). NOT part of the protocol: no node reads
// an older shape. It writes fresh 1.6 blocks, each `derives_from` the old hash, signed by the key you give for each old
// identity. The rules run in the Rust core (feature `legacy`).
const { call, list } = require('./core.cjs')

/**
 * Convert old blocks. `keys` maps each old identity (its old genesis hash) to the key that signs for it
 * ({ public_key_sign, private_key, suite? }); `at` is the conversion time; `map` and `existing` continue an earlier run;
 * `channel` and `requestHash` are for a custodian signing on the owners' word.
 * Returns { blocks, map (old to new), skipped: [{ hash, why }] }.
 */
const convert = (oldBlocks, { keys, at, map = {}, existing = [], channel, requestHash } = {}) =>
  call('convert', list(oldBlocks), { keys, at, map, existing: list(existing), channel, request_hash: requestHash })
/** The id an old block had under the old canonical form. */
const oldHash = (block) => call('old_hash', block)

module.exports = { convert, oldHash }
