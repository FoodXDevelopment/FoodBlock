// Reading every earlier shape as 1.6 (spec/aliases.json). The rules run in the Rust core.
const { call } = require('./core.cjs')

/** A block, old or new, read as its 1.6 form. */
function readAs(block) {
  if (!block) return block
  const read = call('read_as', block)
  return JSON.stringify(read) === JSON.stringify(block) ? block : read // a block already in 1.6 reads as itself
}
/** Whether a block, old or new, is of this 1.6 type (and kind, when named): the one test every reader uses. */
const isA = (block, type, kind) => Boolean(block) && call('is_a', block, type, kind === undefined ? null : kind)

module.exports = { readAs, isA }
