// The write check (spec/protocol.md §3): `check` gives the reasons in words, `refusals` the codes. The rules run in the
// Rust core; the closed lists come from spec/protocol.json.
const { call, list } = require('./core.cjs')
const { PROTOCOL, TYPES, VERBS, REF_KEYS, VERSION } = require('./spec.cjs')

const FIELDS = Object.fromEntries(TYPES.map((type) => [type, PROTOCOL.fields[type]]))
const CODES = PROTOCOL.refusals.codes

// `held` (blocks the check may look up) and `schemas` as the door takes them: lists.
const options = ({ schemas, held } = {}) => [list(held), schemas ? list(schemas) : null]

/** Every refusal of a block as { code, detail }, one per code, in protocol.json's order. */
const refusals = (type, state = {}, refs = {}, opts) => call('refusals', type, state, refs, ...options(opts))
/** What is wrong with a block, in plain words: [] when it may be written. */
const check = (type, state = {}, refs = {}, opts) => call('check', type, state, refs, ...options(opts))

/** Whether a value is a real UTC time (YYYY-MM-DDTHH:MM:SS.sssZ), or a real date. */
const isTime = (value) => call('is_time', value ?? null)
const isDate = (value) => call('is_date', value ?? null)
/** An amount: amount('2.5', 'kg'). The value is a decimal string. */
const amount = (value, unit) => call('amount', String(value), unit)
/** Money in whole minor units: money(420, 'GBP') is £4.20. */
const money = (minor, currency) => call('money', minor, currency)
/** A confidence from 0 to 1, as the decimal string 1.6 signs: confidence(0.8) is '0.8'. */
const confidence = (value) => call('confidence', String(value))
/** Terms on a promise; only the 1.6 terms given are kept. */
const terms = (given = {}) => call('terms', given)

module.exports = { VERSION, TYPES, VERBS, REF_KEYS, FIELDS, CODES, check, refusals, isTime, isDate, amount, money, confidence, terms, newSalt: require('./audience.cjs').newSalt }
