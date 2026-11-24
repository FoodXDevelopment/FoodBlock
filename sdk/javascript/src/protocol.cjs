// A block's two questions before any fold (core.md, section 8): `valid` (who said these bytes) and `read` (whether this reader can read it).
// The rules run in the Rust core; the closed lists come from spec/protocol.json.
const door = require('./door.cjs')
const { list } = require('./core.cjs')
const { PROTOCOL, TYPES } = require('./spec.cjs')

const FIELDS = Object.fromEntries(TYPES.map((type) => [type, door.baseFields(type)]))
const CODES = PROTOCOL.refusals.codes

/** valid(block, blocks): who said these bytes (core.md section 8, five reads). One of size_limit, not_canonical, chain, unmet, bad_piece, bad_hash, bad_signature, unknown_suite; `unmet` and `unknown_suite` wait. Takes a block or a blocks header { header, header_signature }; [] when valid. The value codes are `read`'s. */
const valid = (block, blocks = []) => door.valid(block, list(blocks))
/** read(block, blocks, { schemas }): whether this reader can read a valid block: every code found ([] when read), the value codes (time, decimal, grammar, shape, audience, ...) among them. */
const read = (block, blocks = [], { schemas } = {}) => door.read(block, list(blocks), schemas ? list(schemas) : null)
// what a writer refuses to sign, asked of an unsigned draft { type, state, refs } before anyone signs it; [] when it may be signed
const writeRefusals = (draft, blocks = []) => door.writeRefusals(draft, list(blocks))
/** Whether an unsigned draft `{ type, state, refs }`, once signed, binds anyone: true where it is an accept (`state.status` `accepted`), or where something of the one whose word it is (`refs.as`, else `refs.author`) would move (`gives` not empty); else false. One rule, read from typed terms and refs. */
const binds = (draft, blocks = []) => door.binds(draft, list(blocks))
/** A block's bytes as they came: size_limit, not_canonical (not exactly the canonical bytes of a strict value), else checks 2 to 4. */
const strictText = (text) => door.strictText(String(text))

/** Whether a value is a real UTC time (YYYY-MM-DDTHH:MM:SS.sssZ), or a real date. */
const isTime = (value) => door.isTime(value ?? null)
const isDate = (value) => door.isDate(value ?? null)
/** An amount: amount('2.5', 'kg'), or amount('1', 'credit', kind) for an amount of a kind (its `of`). Money is an amount: amount('4.20', 'GBP'). The value is a decimal string. */
const amount = (value, unit, of) => door.amount(String(value), unit, of ?? null)
/** Terms on a promise; only the terms the protocol lists are kept. */
const terms = (given = {}) => door.terms(given)

/** schemasFrom(blocks): the schema store of the blocks given (core.md, section 8): every thing of kind schema among them, ids ascending. Pass it as `schemas` to read or accept. */
const schemasFrom = (blocks = []) => door.schemasFrom(blocks)

module.exports = { FIELDS, CODES, schemasFrom, valid, read, writeRefusals, binds, strictText, isTime, isDate, amount, terms }
