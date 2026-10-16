// Strangers (modules/strangers.md) and the small profiles. The rules run in the Rust core.
const { call, list } = require('./core.cjs')

/** The short receipt code of a block (profiles/short-form.md): the first 5 bytes of its id in Crockford Base32, `XXXX-XXXX`. */
const receiptCode = (id, long = false) => (long ? call('receipt_code', String(id), true) : call('receipt_code', String(id)))
/** Does a typed code name this block? Case, spaces and hyphens ignored; O is 0, I and L are 1; 8 characters match the short code, 10 the long one. */
const codeMatches = (text, id) => call('code_matches', String(text), String(id))
/** A model's reading is the person's claim only once the person's own block confirms it. */
const readingIsPersonsClaim = (reading, person, blocks) => call('reading_is_persons_claim', reading, person, list(blocks))
/** Tasks profile: whether a `reading_condition` holds on the readings held, at the reader's clock. */
const readingConditionHolds = (condition, blocks, now) => call('reading_condition_holds', condition, list(blocks), now)
/** Deposits profile: the shape of an admission's deposit, and whether an ask's deposit is paid. */
const depositShapeOk = (deposit) => call('deposit_shape_ok', deposit)
const depositPaid = (ask, deposit, blocks) => call('deposit_paid', ask, deposit, list(blocks))

module.exports = { receiptCode, codeMatches, readingIsPersonsClaim, readingConditionHolds, depositShapeOk, depositPaid }
