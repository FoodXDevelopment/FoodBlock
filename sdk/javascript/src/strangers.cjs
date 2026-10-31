// Strangers (modules/consent.md) and the small profiles. The rules run in the Rust core.
const door = require('./door.cjs')

/** The short receipt code of a block (profiles/short-form.md): the first 5 bytes of its id in Crockford Base32, `XXXX-XXXX`. */
const receiptCode = (id, long = false) => (long ? door.receiptCode(String(id), true) : door.receiptCode(String(id)))
/** Does a typed code name this block? Case, spaces and hyphens ignored; O is 0, I and L are 1; 8 characters match the short code, 10 the long one. */
const codeMatches = (text, id) => door.codeMatches(String(text), String(id))
/** A model's reading is the person's claim only once the person's own block confirms it. */
const readingIsPersonsClaim = door.readingIsPersonsClaim
/** Tasks profile: whether a `reading_condition` holds on the readings held, at the reader's clock. */
const readingConditionHolds = door.readingConditionHolds
/** Whether a condition holds on the blocks held, at the reader's clock (promises.md, Conditions): settled, a deed, a reading or a signal. */
// true, false, or null: a condition of a shape the protocol does not read is not read (promises.md, Conditions)
const conditionHolds = door.conditionHolds
/** Earnest profile: the shape of an admission's earnest, and whether an ask's earnest is paid. */
const earnestShapeOk = door.earnestShapeOk
const earnestPaid = door.earnestPaid

module.exports = { receiptCode, codeMatches, readingIsPersonsClaim, readingConditionHolds, conditionHolds, earnestShapeOk, earnestPaid }
