// The write check (spec/protocol.md §1, Refusals): `refusals(type, state, refs)` says what is wrong with a block as
// every node checks it before writing: [{ code, detail }], one entry per rule found, in the order of protocol.json's
// `refusals.codes.block` ([] when it is a well-formed 1.6 block). The code carries the meaning; the detail is free text
// for people. `check` gives the details alone. Every list and grammar it reads comes from spec/protocol.json
// (spec.cjs); none is written here. Older shapes are read, never re-checked (aliases.cjs). `amount`, `money`,
// `confidence` and `terms` build the shapes so callers never hand-write them.
const { canonical } = require('./canonical.cjs')
const { PROTOCOL, GRAMMAR, TYPES, VERBS, REF_KEYS, VERSION, ANSWERS, STOPS, GRANT_KINDS, GENESIS, GENESIS_OPTIONAL, TERMS, SCOPE, LIMITS, INTEGERS } = require('./spec.cjs')
const { newSalt } = require('./audience.cjs')
const { scopeRefusals } = require('./grant.cjs')

// The base fields of each type until the base schemas are published (§3): every block's, then the type's own.
const FIELDS = Object.fromEntries(TYPES.map((type) => [type, PROTOCOL.fields[type]]))
const EVERY = PROTOCOL.fields.every
const { hash: HASH, sign_key: SIGN_KEY, encrypt_key: ENCRYPT_KEY, nonce: NONCE, time: TIME, date: DATE, duration: DURATION, decimal: DECIMAL, confidence: CONFIDENCE } = GRAMMAR
const SHAPES = PROTOCOL.shapes
const TIME_FIELDS = new Set(PROTOCOL.time_fields)
const DATE_FIELDS = new Set(PROTOCOL.date_fields)
const CODES = PROTOCOL.refusals.codes
const RRULE = /^FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,:+-]+)*$/

/** One finding: a code from protocol.json (`refusals.codes`) and free text for people. */
const w = (code, detail) => ({ code, detail })
/** Findings as a refusal list: one entry per code, in the order of `codes` (a group of protocol.json's refusals.codes). */
function ordered(found, codes = CODES.block) {
  const order = Object.keys(codes), by = new Map()
  for (const { code, detail } of found) by.set(code, [...(by.get(code) || []), detail])
  return [...by].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([code, details]) => ({ code, detail: [...new Set(details)].join('; ') }))
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
// A real calendar value: a month that exists, a day within it (29 February only in a leap year), an hour 00 to 23, a
// minute and second 00 to 59. Never Date.parse, which rolls 30 February over into March.
const daysIn = (year, month) => (month === 2 ? ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31)
function realCalendar(text) {
  const [year, month, day, hour = 0, minute = 0, second = 0] = text.match(/[0-9]+/g).map(Number)
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month) && hour <= 23 && minute <= 59 && second <= 59
}
const isTime = (value) => typeof value === 'string' && TIME.test(value) && realCalendar(value)
const isDate = (value) => typeof value === 'string' && DATE.test(value) && realCalendar(value)
const hashes = (value) => (Array.isArray(value) ? value : [value])
const keysWithin = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key))
const sameSet = (a, b) => b !== undefined && JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(hashes(b))].sort())

// ---- Shapes (protocol.json `shapes`), recognised by their keys wherever they sit in state ----
function amountShape(value, name) {
  if (value === undefined) return []
  if (!(isObject(value) && keysWithin(value, SHAPES.amount) && typeof value.value === 'string' && typeof value.unit === 'string' && value.unit.trim())) return [w('shape', `${name} is an amount: { value (a decimal string), unit (UCUM or a pack) }`)]
  return DECIMAL.test(value.value) ? [] : [w('decimal', `${name}.value is a decimal string (-?(0|[1-9][0-9]*)(.[0-9]+)?)`)]
}
const moneyShape = (value, name) => value === undefined ? []
  : isObject(value) && keysWithin(value, SHAPES.money) && Number.isInteger(value.minor) && /^[A-Z]{3}$/.test(String(value.currency)) ? []
    : [w('shape', `${name} is money: { minor (whole minor units), currency (ISO 4217) }`)]
// A time or date in the right shape that is not a real calendar instant is `calendar`; any other, `time`.
const calendarShape = (value, name, pattern, words) => value === undefined || (typeof value === 'string' && pattern.test(value) && realCalendar(value)) ? []
  : typeof value === 'string' && pattern.test(value) ? [w('calendar', `${name} is not a real calendar ${words === 'a date' ? 'date' : 'instant'}`)] : [w('time', `${name} is ${words}`)]
const timeShape = (value, name) => calendarShape(value, name, TIME, 'a UTC time, exactly YYYY-MM-DDTHH:MM:SS.sssZ')
const dateShape = (value, name) => calendarShape(value, name, DATE, 'a date')
const durationShape = (value, name) => value === undefined || (typeof value === 'string' && DURATION.test(value)) ? [] : [w('time', `${name} is an ISO 8601 duration (P30D)`)]
const hashShape = (value, name) => value === undefined || (typeof value === 'string' && HASH.test(value)) ? [] : [w('grammar', `${name} is a hash`)]
const hashListShape = (value, name) => value === undefined || (Array.isArray(value) && value.length && value.every((item) => HASH.test(item))) ? [] : [w('grammar', `${name} is a set of hashes`)]
const wholeShape = (value, name, min = 0) => value === undefined || (Number.isInteger(value) && value >= min) ? [] : [w('shape', `${name} is a whole number${min ? ` from ${min}` : ''}`)]
function whenShape(value, name = 'state.when') {
  if (value === undefined || typeof value === 'string') return timeShape(value, name)
  if (!(isObject(value) && keysWithin(value, SHAPES.when) && value.from !== undefined && value.to !== undefined)) return [w('shape', `${name} is a time, or { from, to }`)]
  const wrong = [...timeShape(value.from, `${name}.from`), ...timeShape(value.to, `${name}.to`)]
  return wrong.length || value.from <= value.to ? wrong : [w('shape', `${name}.from is after its to`)]
}
const decimalIn = (value, low, high) => typeof value === 'string' && DECIMAL.test(value) && Number(value) >= low && Number(value) <= high
const whereShape = (value) => value === undefined || (isObject(value) && keysWithin(value, SHAPES.where.area) && decimalIn(value.lat, -90, 90) && decimalIn(value.lon, -180, 180)
  && (value.radius === undefined || (!amountShape(value.radius, 'radius').length && value.radius.unit === 'm'))) ? []
  : [w('shape', 'state.where is a point { lat, lon } (WGS84 degrees, decimal strings), or an area: a point with radius (an amount in m)')]
const marksShape = (value, name) => value === undefined || (Array.isArray(value) && value.every((mark) => isObject(mark) && keysWithin(mark, SHAPES.mark) && typeof mark.scheme === 'string' && typeof mark.value === 'string'))
  ? [] : [w('shape', `${name} lists exact marks: [{ scheme, value }]`)]
// A price is money, money per unit ({ money, per }), or a share of something measured ({ share, of }).
const perUnit = (value) => isObject(value) && 'per' in value
function priceShape(value, name) {
  if (perUnit(value)) return [...(keysWithin(value, SHAPES.price_per) ? [] : [w('shape', `${name} per unit is { money, per }`)]), ...(value.money === undefined ? [w('shape', `${name}.money is the price`)] : moneyShape(value.money, `${name}.money`)), ...amountShape(value.per, `${name}.per`)]
  if (isObject(value) && 'share' in value) {
    if (!(keysWithin(value, SHAPES.price_share) && typeof value.share === 'string' && HASH.test(value.of || ''))) return [w('shape', `${name} as a share is { share (a decimal string), of (the schema saying what is measured) }`)]
    return DECIMAL.test(value.share) ? [] : [w('decimal', `${name}.share is a decimal string`)]
  }
  return moneyShape(value, name)
}
// A quantity is an amount; under a per-unit price it may be a range { min, max } the answer chooses within.
function quantityShape(value, price, name) {
  if (!(isObject(value) && ('min' in value || 'max' in value))) return amountShape(value, name)
  return [...(perUnit(price) ? [] : [w('shape', `${name} is a range only under a per-unit price`)]), ...(keysWithin(value, SHAPES.range) ? [] : [w('shape', `${name} as a range is { min, max }`)]),
    ...amountShape(value.min, `${name}.min`), ...amountShape(value.max, `${name}.max`),
    ...(value.min && value.max && value.min.unit === value.max.unit && Number(value.min.value) > Number(value.max.value) ? [w('shape', `${name}.min is above its max`)] : [])]
}
const stopShape = (stop) => STOPS.slice(0, 2).includes(stop) || (isObject(stop) && keysWithin(stop, ['occurrences']) && Array.isArray(stop.occurrences) && stop.occurrences.every(isTime)) ? []
  : [w('bad_status', `state.stop is ${STOPS.slice(0, 2).join(' or ')}, or { occurrences: [start times] }`)]

// Numbers in signed content are integers within protocol.json's bounds; never floats (§13 Numbers). Keys are written
// in NFC; a key that is not is refused (canonical.md Rule 4).
function numbers(value, path) {
  if (typeof value === 'number') return !Number.isInteger(value) ? [w('float', `${path} is a float; write a decimal string, money { minor, currency } or an amount { value, unit }`)]
    : value < INTEGERS.min || value > INTEGERS.max ? [w('integer_range', `${path} is outside the whole numbers a block may hold (±(2^53 - 1))`)] : []
  if (Array.isArray(value)) return value.flatMap((item, i) => numbers(item, `${path}[${i}]`))
  if (!isObject(value)) return []
  const keys = Object.keys(value)
  return [...keys.filter((key) => key !== key.normalize('NFC')).map((key) => w('not_canonical', `${path} has a key not written in NFC (${JSON.stringify(key)})`)), ...keys.flatMap((key) => numbers(value[key], `${path}.${key}`))]
}
// Every amount and money object, wherever it sits in state.
function shapesIn(value, path) {
  if (Array.isArray(value)) return value.flatMap((item, i) => shapesIn(item, `${path}[${i}]`))
  if (!isObject(value)) return []
  const keys = Object.keys(value)
  const own = keys.includes('unit') && keysWithin(value, SHAPES.amount) ? amountShape(value, path)
    : keys.includes('minor') && keysWithin(value, SHAPES.money) ? moneyShape(value, path) : []
  return [...own, ...keys.flatMap((key) => shapesIn(value[key], `${path}.${key}`))]
}
// The time and date fields (protocol.json `time_fields`, `date_fields`) where 1.6 names them: in state, its terms and
// lines, and its scope (`time_fields_checked_in`).
const timesIn = (object, path) => !isObject(object) ? [] : Object.entries(object).flatMap(([key, value]) =>
  key === 'when' ? whenShape(value, `${path}.${key}`) : TIME_FIELDS.has(key) ? timeShape(value, `${path}.${key}`) : DATE_FIELDS.has(key) ? dateShape(value, `${path}.${key}`) : [])

function termsShape(terms, refs, state = {}) {
  if (terms === undefined) return []
  if (!isObject(terms)) return [w('shape', 'state.terms is { price, quantity, lines, ... }')]
  const lines = terms.lines
  return [
    ...Object.keys(terms).filter((key) => !TERMS.includes(key)).map((key) => w('undeclared_field', `terms.${key} is not a 1.6 term (${TERMS.join(', ')})`)),
    ...(terms.price === undefined ? [] : priceShape(terms.price, 'terms.price')),
    ...quantityShape(terms.quantity, terms.price, 'terms.quantity'),
    ...timesIn(terms, 'terms'),
    ...hashShape(terms.text, 'terms.text'), ...hashShape(terms.settled_by, 'terms.settled_by'),
    ...(terms.repeat === undefined || (typeof terms.repeat === 'string' && RRULE.test(terms.repeat)) ? [] : [w('grammar', 'terms.repeat is an RFC 5545 RRULE value (FREQ=WEEKLY;BYDAY=FR)')]),
    ...(terms.repeat !== undefined && state.when === undefined ? [w('shape', 'a repeating promise counts its occurrences from state.when')] : []),
    ...(terms.needs === undefined || typeof terms.needs === 'object' ? [] : [w('shape', 'terms.needs is data from a schema, never a name')]),
    ...(lines === undefined ? [] : !Array.isArray(lines) || !lines.length ? [w('lines', 'terms.lines lists { id, what, quantity, price }')]
      : [...lines.flatMap((line, i) => [
        ...(isObject(line) && keysWithin(line, PROTOCOL.line) ? [] : [w('lines', `terms.lines[${i}] is { ${PROTOCOL.line.join(', ')} }`)]),
        ...(typeof line?.id === 'string' && line.id ? [] : [w('lines', `terms.lines[${i}].id names the line`)]),
        ...(HASH.test(line?.what || '') ? [] : [w('lines', `terms.lines[${i}].what is a thing's hash`)]),
        ...timesIn(line, `terms.lines[${i}]`), ...quantityShape(line?.quantity, line?.price, `terms.lines[${i}].quantity`), ...(line?.price === undefined ? [] : priceShape(line.price, `terms.lines[${i}].price`))]),
      ...(new Set(lines.map((line) => line?.id)).size === lines.length ? [] : [w('lines', 'each line id is unique in the promise')]),
      ...(terms.price === undefined && terms.quantity === undefined ? [] : [w('lines', 'with lines, the price and quantity are on each line')]),
      ...(sameSet(lines.map((line) => line?.what), refs.what) ? [] : [w('lines', "refs.what is the set of every line's what")])])
  ]
}

function scopeShape(scope, kind) {
  if (!isObject(scope)) return [w('shape', `state.scope is { ${SCOPE.join(', ')} }`)]
  const own = GRANT_KINDS.includes(kind)
  return [
    ...Object.keys(scope).filter((key) => !SCOPE.includes(key)).map((key) => w('undeclared_field', `scope.${key} is not part of a 1.6 scope (${SCOPE.join(', ')})`)),
    ...(own ? (scope.until === undefined ? [] : [w('scope_until', `a ${kind} grant carries no scope.until`)]) : scope.until === undefined ? [w('scope_until', 'a grant others act under carries scope.until (a UTC time)')] : []), ...timesIn(scope, 'scope'),
    ...(scope.acts === undefined || (Array.isArray(scope.acts) && scope.acts.every((act) => typeof act === 'string')) ? [] : [w('shape', 'scope.acts lists acts')]),
    ...(scope.parties === undefined || (Array.isArray(scope.parties) && scope.parties.every((party) => HASH.test(party))) ? [] : [w('grammar', 'scope.parties lists hashes (left out, it is everyone)')]),
    ...moneyShape(scope.limit, 'scope.limit'), ...durationShape(scope.per, 'scope.per'), ...durationShape(scope.notice, 'scope.notice')
  ]
}

function audienceShape(state) {
  const audience = state.audience
  if (audience === 'public') return []
  if (!Array.isArray(audience) || !audience.length || !audience.every((who) => HASH.test(who))) return [w('audience', 'state.audience is "public" or a list of commitments (salted hashes)')]
  return [...(audience.every((who, i) => i === 0 || audience[i - 1] < who) ? [] : [w('audience', 'state.audience commitments are sorted, each once')]),
    ...(typeof state.nonce === 'string' && NONCE.test(state.nonce) ? [] : [w('audience', 'a private block carries state.nonce (16 random bytes, hex)')])]
}

// The genesis (§2): the one block with no author, prev, after or seq; public, naming its own keys and its recovery. An
// encryption key is optional (genesis_optional): a micro that only signs leaves it out and adds one by a key grant.
// What is missing or extra is `bad_genesis`; what is there but malformed is its grammar's code.
const GENESIS_FIELDS = [...GENESIS, ...GENESIS_OPTIONAL]
const genesisErrors = (state, refs) => [
  ...Object.keys(refs).map((key) => w('bad_genesis', `a genesis has no refs (refs.${key})`)),
  ...Object.keys(state).filter((key) => !GENESIS_FIELDS.includes(key)).map((key) => w('bad_genesis', `a genesis names only ${GENESIS.join(', ')}, and ${GENESIS_OPTIONAL.join(', ')} if it has one (state.${key})`)),
  ...(state.kind ? [] : [w('bad_genesis', 'state.kind says what they are')]),
  ...(state.at === undefined ? [w('bad_genesis', 'state.at is when it was said')] : timeShape(state.at, 'state.at')),
  ...(state.audience === 'public' ? [] : [w('bad_genesis', 'a genesis is public: anyone checks signatures against its key')]),
  ...(state.public_key_sign === undefined ? [w('bad_genesis', 'state.public_key_sign names its signing key')] : SIGN_KEY.test(state.public_key_sign) ? [] : [w('grammar', 'state.public_key_sign is an Ed25519 key, SPKI DER hex')]),
  ...(state.public_key_encrypt === undefined || ENCRYPT_KEY.test(state.public_key_encrypt) ? [] : [w('grammar', 'state.public_key_encrypt is an X25519 key, 32 bytes hex')]),
  ...(state.recovery_key_hash === undefined ? [w('bad_genesis', 'state.recovery_key_hash names the recovery key')] : HASH.test(state.recovery_key_hash) ? [] : [w('grammar', 'state.recovery_key_hash is the hash of the recovery key')]),
  ...(state.recovery_reach === undefined ? [w('bad_genesis', 'state.recovery_reach says how far back the recovery key may reach')] : durationShape(state.recovery_reach, 'state.recovery_reach'))
]
const isGenesisShape = (type, state, refs) => type === 'actor' && !refs.author && state.seq === undefined

// A side signs for itself, or a member signs as it (refs.as), or an agent under its grant (refs.under).
const speaksFor = (refs, side) => side !== undefined && (refs.author === side || refs.as === side || Boolean(refs.under))
const statusShape = (state, refs) => state.status === undefined ? [...(state.stop === undefined ? [] : [w('bad_status', 'state.stop goes with status stopped')])]
  : [...(refs.answers || refs.updates ? [] : [w('status_not_answer', 'only an answer (refs.answers) or the author stopping their own (refs.updates) carries a status')]),
    ...(ANSWERS.includes(state.status) ? [] : [w('bad_status', `state.status is one of ${ANSWERS.join(', ')}`)]),
    ...(state.status === 'stopped' ? stopShape(state.stop) : state.stop === undefined ? [] : [w('bad_status', 'state.stop goes with status stopped')])]
const SCHEMA_FIELDS = PROTOCOL.schema

// What each type needs beyond what every block needs. An answer has the type of what it answers; the type's other
// required fields do not apply to it (§6).
const RULES = {
  actor: (state) => [
    ...(state.kind ? [] : [w('shape', 'state.kind says what it is: a person, an agent, a circle, a contact')]),
    ...['public_key_sign', 'recovery_key_hash', 'recovery_reach'].filter((key) => state[key] !== undefined).map((key) => w('undeclared_field', `only a genesis names state.${key}; a key comes in by a key grant`)),
    ...(state.kind === 'contact' && state.public_key_encrypt !== undefined ? [w('undeclared_field', 'a contact has no keys')] : []),
    ...(state.signers === undefined || (Array.isArray(state.signers) && state.signers.length && state.signers.every((role) => typeof role === 'string' && role)) ? [] : [w('shape', 'state.signers lists the roles that may sign as the circle')]),
    ...(state.removal === undefined || (isObject(state.removal) && keysWithin(state.removal, PROTOCOL.circle.removal) && Number.isInteger(state.removal.needed) && state.removal.needed >= 1) ? [] : [w('shape', 'state.removal is { needed: N }, how many other admins must agree to remove an admin')]),
    ...(state.public_key_encrypt === undefined || ENCRYPT_KEY.test(state.public_key_encrypt) ? [] : [w('grammar', 'state.public_key_encrypt is an X25519 key, 32 bytes hex')])],
  thing: (state, refs) => [
    ...(state.kind || refs.kind ? [] : [w('shape', 'a thing is a kind (state.kind) or one of a kind (refs.kind)')]),
    ...marksShape(state.marks, 'state.marks'),
    ...(state.words === undefined || typeof state.words === 'string' ? [] : [w('shape', 'state.words are the words printed on it, as read')]),
    ...(state.kind === 'schema' ? schemaShape(state) : SCHEMA_FIELDS.filter((key) => state[key] !== undefined).map((key) => w('undeclared_field', `state.${key} belongs to a schema (a thing of kind schema)`)))],
  transform: (state, refs) => [
    ...(state.shares === undefined || (Array.isArray(state.shares) && state.shares.every((item) => isObject(item) && keysWithin(item, SHAPES.share) && hashes(refs.derives_from || []).includes(item.from) && typeof item.share === 'string' && DECIMAL.test(item.share)))
      ? [] : [w('shape', 'state.shares lists { from (an input it derives_from), share (a decimal string) }')])],
  transfer: (state, refs) => [
    ...(refs.answers || refs.to_owner || refs.to_holder || refs.to_place || state.count !== undefined ? [] : [w('shape', 'a transfer says what changed (refs.to_owner, to_holder, to_place), or how many received (state.count)')]),
    ...wholeShape(state.count, 'state.count', 1), ...marksShape(state.marks, 'state.marks'),
    ...(state.split === undefined ? [] : !Array.isArray(state.split) || !state.split.length ? [w('shape', 'state.split lists { for, line, money }')]
      : state.split.flatMap((part, i) => [...(isObject(part) && keysWithin(part, SHAPES.split) && hashes(refs.for || []).includes(part.for) ? [] : [w('shape', `state.split[${i}].for is one of what it is for (refs.for)`)]),
        ...(part?.money === undefined ? [w('shape', `state.split[${i}].money says how much`)] : []), ...(part?.line === undefined || typeof part.line === 'string' ? [] : [w('shape', `state.split[${i}].line is a line id`)])]))],
  observe: (state, refs) => [
    ...((refs.confirms || refs.same_as) && state.confidence === undefined ? [w('shape', 'a confirm or a same_as carries a confidence')] : []),
    ...(state.dkim === undefined || (isObject(state.dkim) && typeof state.dkim.domain === 'string' && typeof state.dkim.pass === 'boolean') ? [] : [w('shape', 'state.dkim is { domain, pass }')])],
  promise: (state, refs) => {
    const answer = refs.answers && state.status !== undefined, stopping = refs.updates && state.status !== undefined
    const asked = speaksFor(refs, refs.to) && !speaksFor(refs, refs.from)
    return [
      ...statusShape(state, refs),
      ...(answer || stopping || speaksFor(refs, refs.from) || speaksFor(refs, refs.to) ? [] : [w('not_a_side', 'a promise is signed by a side: from (an offer) or to (an ask), as it, or under its grant')]),
      ...(!answer && !stopping && asked && !isTime(state.terms?.expires) ? [w('ask_without_expires', 'every ask carries terms.expires')] : []),
      ...(refs.answers && !refs.for ? [w('deal_not_named', 'an answer or a counter names its deal in refs.for (the first promise)')] : []),
      ...(state.not === undefined || state.not === true ? [] : [w('shape', 'state.not is true (a promise not to do the step), or left out')]),
      ...(state.what === undefined || typeof state.what === 'string' || isObject(state.what) ? [] : [w('shape', 'state.what describes time or a job (text, or data under a schema)')]),
      ...termsShape(state.terms, refs, state)]
  },
  grant: (state, refs) => {
    const ending = (refs.answers || refs.updates) && state.status !== undefined
    return [
      ...(state.kind ? [] : [w('shape', 'state.kind says what authority it gives')]),
      ...statusShape(state, refs),
      ...wholeShape(state.depth, 'state.depth'),
      ...(state.scope === undefined ? [] : scopeShape(state.scope, state.kind)),
      ...(ending || refs.answers ? [] : state.kind === 'key' ? keyGrantShape(state, refs) : state.kind === 'member' ? memberShape(state, refs) : state.kind === 'successor' ? successorShape(state, refs)
        : state.kind === 'operator' ? (refs.to ? [] : [w('shape', 'an operator grant names the agent or machine it answers for (refs.to)')]) : []),
      ...hashShape(state.last_counted, 'state.last_counted')]
  }
}
const keyGrantShape = (state, refs) => [
  ...(refs.subject ? [] : [w('shape', 'a key grant names the id it is for (refs.subject)')]),
  ...(state.public_key_sign !== undefined || state.public_key_encrypt !== undefined || state.recovery_key_hash !== undefined ? [] : [w('shape', 'a key grant names the new key (state.public_key_sign or public_key_encrypt)')]),
  ...(state.public_key_sign === undefined || SIGN_KEY.test(state.public_key_sign) ? [] : [w('grammar', 'state.public_key_sign is an Ed25519 key, SPKI DER hex')]),
  ...(state.public_key_encrypt === undefined || ENCRYPT_KEY.test(state.public_key_encrypt) ? [] : [w('grammar', 'state.public_key_encrypt is an X25519 key, 32 bytes hex')]),
  ...((state.replaces === undefined) === (state.last_good === undefined) ? [] : [w('shape', 'a rotation names both the key it replaces and that key\'s last good block')]),
  ...(state.replaces === undefined || SIGN_KEY.test(state.replaces) ? [] : [w('grammar', 'state.replaces is the key it replaces')]), ...hashShape(state.last_good, 'state.last_good'),
  ...(state.recovery_key === undefined || SIGN_KEY.test(state.recovery_key) ? [] : [w('grammar', 'state.recovery_key is the recovery key that signed it')]),
  ...((state.recovery_key_hash === undefined) === (state.recovery_reach === undefined) ? [] : [w('shape', 'adding recovery names both recovery_key_hash and recovery_reach')]),
  ...hashShape(state.recovery_key_hash, 'state.recovery_key_hash'), ...durationShape(state.recovery_reach, 'state.recovery_reach'),
  ...wholeShape(state.epoch, 'state.epoch', 1), ...(state.epoch !== undefined && !refs.as ? [w('shape', 'a rekey (state.epoch) is signed as the circle (refs.as)')] : []),
  ...(state.epoch !== undefined && (state.keys === undefined || !refs.after) ? [w('shape', 'a rekey holds the new private key sealed to each member (state.keys) and names epoch n-1 in refs.after')] : [])]
const memberShape = (state, refs) => [
  ...(refs.subject ? [] : [w('shape', 'a member grant names the circle (refs.subject)')]),
  ...(refs.as === refs.subject ? [] : [w('shape', 'a member grant is signed as the circle (refs.as)')]),
  ...(state.roles === undefined || (Array.isArray(state.roles) && state.roles.every((role) => typeof role === 'string' && role)) ? [] : [w('shape', 'state.roles lists the roles it gives (words)')])]
const successorShape = (state, refs) => [
  ...(refs.to ? [] : [w('shape', 'a successor grant names the successor (refs.to)')]),
  ...(state.witnesses === undefined ? [w('shape', 'state.witnesses names who may record the event')] : hashListShape(state.witnesses, 'state.witnesses')),
  ...(Number.isInteger(state.needed) && state.needed >= 1 && state.needed <= (state.witnesses || []).length ? [] : [w('shape', 'state.needed is how many witnesses must record it (1 to their number)')]),
  ...(state.wait === undefined ? [w('shape', 'state.wait is how long the trigger waits (a duration)')] : durationShape(state.wait, 'state.wait')),
  ...(state.public_key_sign === undefined ? [] : [w('undeclared_field', 'a successor gets decryption keys only, never signing keys')])]
function schemaShape(state) {
  const [type, ...kind] = String(state.target || '').split('.')
  return [
    ...(TYPES.includes(type) && (kind.length === 0 || kind.join('.')) ? [] : [w('shape', `a schema names its target: a type (${TYPES.join(', ')}) or type.kind`)]),
    ...(state.fields === undefined || (isObject(state.fields) && Object.values(state.fields).every((field) => PROTOCOL.field_types.includes(field))) ? [] : [w('shape', `state.fields maps each field to a field type (${PROTOCOL.field_types.join(', ')})`)]),
    ...(state.roles === undefined || (Array.isArray(state.roles) && state.roles.every((role) => typeof role === 'string')) ? [] : [w('shape', 'state.roles lists the ref keys it declares')]),
    ...(state.grounds === undefined || (isObject(state.grounds) && keysWithin(state.grounds, PROTOCOL.grounds)) ? [] : [w('shape', `state.grounds is { ${PROTOCOL.grounds.join(', ')} }`)]),
    ...(state.grounds?.confirmers === undefined || (Array.isArray(state.grounds.confirmers) && state.grounds.confirmers.every((who) => HASH.test(who) || GRAMMAR.role_ref.test(who))) ? [] : [w('grammar', 'state.grounds.confirmers lists ids or circle#role')])]
}

// The fields and roles a block may name: the base, and what its schema declares (when the reader holds it).
const lookup = (store, hash) => (!store ? undefined : typeof store === 'function' ? store(hash) : store.get?.(hash) || store[hash])
function declared(type, refs, schemas) {
  const schema = refs.schema && schemas ? lookup(schemas, refs.schema) : null
  if (refs.schema && !schema) return null
  return { fields: [...EVERY, ...FIELDS[type], ...Object.keys(schema?.state?.fields || {})], roles: [...REF_KEYS, ...(schema?.state?.roles || [])] }
}

// Every finding, in the order found.
function findings(type, state, refs, { schemas, held } = {}) {
  if (!RULES[type]) return [w('unknown_type', `${type} is not a FoodBlock 1.6 type (${TYPES.join(', ')})`)]
  if (!isObject(state) || !isObject(refs)) return [w('shape', 'state and refs are objects')]
  const wrong = []
  try { if (Buffer.byteLength(canonical(type, state, refs), 'utf8') > LIMITS.block_bytes) wrong.push(w('size_limit', `a block's canonical body is at most ${LIMITS.block_bytes} bytes; link larger content by its hash`)) } catch (error) { return [w('not_canonical', error.message)] }
  for (const [key, value] of Object.entries(refs)) {
    if (key === 'prev' ? typeof value !== 'string' || !HASH.test(value) : !hashes(value).length || !hashes(value).every((hash) => typeof hash === 'string' && HASH.test(hash))) wrong.push(w('grammar', key === 'prev' ? 'refs.prev is one hash' : `refs.${key} is a hash or a set of hashes (64 lowercase hex)`))
  }
  wrong.push(...numbers(state, 'state'), ...numbers(refs, 'refs'))
  if (isGenesisShape(type, state, refs)) return [...wrong, ...genesisErrors(state, refs)]
  if (!refs.author) wrong.push(w('chain', 'refs.author names who said it'))
  if (!(Number.isInteger(state.seq) && state.seq >= 1)) wrong.push(w('chain', "state.seq is its place in its signing key's chain (1, 2, 3...)"))
  if (!refs.prev) wrong.push(w('chain', "refs.prev names the key's previous block (or the block that brought the key in)"))
  if (state.at === undefined) wrong.push(w('time', 'state.at is when it was said'))
  wrong.push(...timesIn(state, 'state'), ...audienceShape(state), ...whereShape(state.where), ...shapesIn(state, 'state'),
    ...(state.confidence === undefined || (typeof state.confidence === 'string' && CONFIDENCE.test(state.confidence)) ? [] : [w('grammar', 'state.confidence is a decimal string from 0 to 1')]),
    ...(state.sequencer === undefined || SIGN_KEY.test(state.sequencer) ? [] : [w('grammar', 'state.sequencer is the signing key that orders the record')]),
    ...hashListShape(state.manifest, 'state.manifest'), ...hashListShape(state.counted, 'state.counted'), ...(state.line === undefined || typeof state.line === 'string' ? [] : [w('shape', 'state.line is a line id')]))
  if (refs.after !== undefined && hashes(refs.after).length > LIMITS.after_heads) wrong.push(w('after_limit', `refs.after names at most ${LIMITS.after_heads} heads`))
  if (held && refs.after !== undefined && isTime(state.at)) {
    for (const hash of hashes(refs.after)) { const seen = lookup(held, hash); if (isTime(seen?.state?.at) && seen.state.at > state.at) wrong.push(w('at_before_after', `state.at is earlier than ${hash}, which it names as seen`)) }
  }
  if (held && type === 'grant' && refs.parent) {
    const parent = lookup(held, refs.parent)
    if (parent) wrong.push(...scopeRefusals({ state, refs }, parent))
  }
  const names = declared(type, refs, schemas)
  if (!names && schemas) wrong.push(w('undeclared_ref', 'refs.schema names a schema this node does not hold: ask for it'))
  if (names) {
    wrong.push(...Object.keys(refs).filter((key) => !names.roles.includes(key)).map((key) => w('undeclared_ref', `refs.${key} is not declared (the shared refs, or the schema's roles)`)))
    wrong.push(...Object.keys(state).filter((key) => !names.fields.includes(key)).map((key) => w('undeclared_field', `state.${key} is not declared for ${type} (its base fields, or the schema's)`)))
  }
  return [...wrong, ...RULES[type](state, refs)]
}

/**
 * What is wrong with a FoodBlock 1.6 block: [{ code, detail }], one entry per rule found, in the order of
 * protocol.json's `refusals.codes.block`. Options: `schemas` (hash → schema block: a Map, an object or a function) so
 * a named schema's fields and roles count as declared (a schema not among them is refused); `held` (hash → block) so
 * `at` is checked against what refs.after names and a child grant against its parent.
 */
const refusals = (type, state = {}, refs = {}, options) => ordered(findings(type, state, refs, options))
/** What is wrong with a FoodBlock 1.6 block, in plain words (each finding's detail); [] when it passes. */
const check = (type, state = {}, refs = {}, options) => findings(type, state, refs, options).map((finding) => finding.detail)

/** An amount: amount('2.5', 'kg'). The value is a decimal string. */
const amount = (value, unit) => ({ value: String(value), unit })
/** Money in whole minor units: money(420, 'GBP') is £4.20. */
const money = (minor, currency) => ({ minor, currency })
/** A confidence from 0 to 1, as the decimal string 1.6 signs: confidence(0.8) is '0.8'. */
function confidence(value) {
  const text = typeof value === 'string' ? value : String(value)
  if (!CONFIDENCE.test(text)) throw new Error('protocol: a confidence is from 0 to 1')
  return text
}
/** Terms on a promise; only the 1.6 terms given are kept. */
const terms = (given = {}) => Object.fromEntries(Object.entries(given).filter(([key, value]) => value !== undefined && TERMS.includes(key)))

module.exports = { VERSION, TYPES, VERBS, REF_KEYS, FIELDS, CODES, check, refusals, ordered, isTime, isDate, isGenesisShape, speaksFor, amount, money, confidence, terms, newSalt }
