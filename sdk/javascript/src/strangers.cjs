// Strangers (modules/consent.md) and the small profiles. The rules run in the Rust core.
const door = require('./door.cjs')

/** The short code of a block (profiles/short-form.md): the first 5 bytes of its id in Crockford Base32, `XXXX-XXXX` (`long`: ten characters). */
const shortCode = (id) => door.shortCode(String(id))
/** The short reply (profiles/short-form.md, way 1): `FB1 ` and what the receiver cannot rebuild of her signed answer; and the answer rebuilt from it among the blocks given (null: nothing was said). */
const shortReply = (answer) => door.shortReply(answer)
const shortReplyOpen = (text, signer, blocks) => door.shortReplyOpen(String(text), String(signer), blocks)
/** Does a typed code name this block? Case, spaces and hyphens ignored; O is 0, I and L are 1; 8 characters match the short code, 10 the long one. */
const codeMatches = (text, id) => door.codeMatches(String(text), String(id))
/** Whether `receiver` is a stranger to `sender` among `blocks` (consent.md): true unless she accepted one of his blocks, countered one, opened a deal naming
 * him, or has a live `yes` of her own for him. Her declined or stopped answer, any other reply and a recorder's `yes` leave him a stranger. `block` (the
 * sender's own block, optional) lets the fold name the principal it speaks for, so one who answered the principal is no stranger to its agent. */
const isStranger = (receiver, sender, blocks, { block } = {}) => door.isStranger(receiver, sender, blocks, block || null)
/** A model's reading is the person's claim only once the person's own block confirms it. */
const readingIsPersonsClaim = door.readingIsPersonsClaim
/** Tasks profile: whether a `reading_condition` holds on the readings in the past of `at`, the block it is read for (its id, or the block). No reader's clock:
 * a reading's window ends at that block's own `at`. */
const readingConditionHolds = (reading, blocks, at) => door.readingConditionHolds(reading, blocks, at)
/** Whether a condition holds on the blocks given (promises.md, Conditions): settled, a deed, a reading, a signal, ruled, stopped or closed. No reader's
 * clock: `at` is the block it is read for (its id, or the block), and only what is in its causal past counts; null reads every block given. True, false, or
 * null: a condition of a shape the protocol does not read is not read. */
const conditionHolds = (condition, blocks, at) => door.conditionHolds(condition, blocks, at ?? null)

module.exports = { isStranger, shortCode, shortReply, shortReplyOpen, codeMatches, readingIsPersonsClaim, readingConditionHolds, conditionHolds }
