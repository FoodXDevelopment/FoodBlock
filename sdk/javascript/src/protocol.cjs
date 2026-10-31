// The write check and valid(block, context) (core.md section 8): `check` gives the reasons in words, `refusals` the codes. The rules run in the
// Rust core; the closed lists come from spec/protocol.json.
const door = require('./door.cjs')
const { list, arrivals } = require('./core.cjs')
const { PROTOCOL, TYPES, VERBS, REF_KEYS, VERSION } = require('./spec.cjs')

const FIELDS = Object.fromEntries(TYPES.map((type) => [type, door.baseFields(type)]))
const CODES = PROTOCOL.refusals.codes

// `held` (blocks the check may look up) and `schemas` as the door takes them: lists.
const options = ({ schemas, held } = {}) => [list(held), schemas ? list(schemas) : null]

/** Every refusal of a block's own bytes as { code, detail }, one per code, in the order of core.md section 8. */
const refusals = (type, state = {}, refs = {}, opts) => door.refusals(type, state, refs, ...options(opts))
/** valid(block, context): every refusal of a signed block against the blocks held ([] when valid). */
const valid = (block, held = [], { schemas, arrivedAt } = {}) => door.valid(block, held, schemas ? list(schemas) : null, arrivals(arrivedAt, held, [block]))
/** Strict writing from JSON text: a repeated key, then every refusal of the block it holds. */
const strictText = (text) => door.strictText(String(text))
/** What is wrong with a block, in plain words: [] when it may be written. */
const check = (type, state = {}, refs = {}, opts) => door.check(type, state, refs, ...options(opts))

/** Whether a value is a real UTC time (YYYY-MM-DDTHH:MM:SS.sssZ), or a real date. */
const isTime = (value) => door.isTime(value ?? null)
const isDate = (value) => door.isDate(value ?? null)
/** An amount: amount('2.5', 'kg'). The value is a decimal string. */
const amount = (value, unit) => door.amount(String(value), unit)
/** Money in whole minor units: money(420, 'GBP') is £4.20. */
const money = door.money
/** Terms on a promise; only the terms the protocol lists are kept. */
const terms = (given = {}) => door.terms(given)

module.exports = { VERSION, TYPES, VERBS, REF_KEYS, FIELDS, CODES, valid, strictText, check, refusals, isTime, isDate, amount, money, terms, newSalt: require('./audience.cjs').newSalt }
