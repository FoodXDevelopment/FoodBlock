// Adds to spec/vectors.json the cases of a machine's fence (authority.md, A machine's fence): its shape, that a grant passed on carries one
// no wider, and the reading `fence_reading`. `node test/make-vectors-fence.cjs`, after `node scripts/build-wasm.cjs`. Idempotent.
// Every expectation is written here by hand from the spec text and checked against the Rust core; the oracle then checks the file.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { fb, call, story, door, check, LATER } = kit

// the cases written when the field was still called envelope: the field is fence now, and they are gone
V.door = V.door.filter((c) => !c.name.startsWith('envelope: '))

// the grant's base fields name the field fence now (the maker of that case, make-vectors-1-7.cjs, is read-only history)
for (const c of V.door) if (c.name.startsWith('base_fields: grant')) c.expect = c.expect.map((x) => (x === 'envelope' ? 'fence' : x))

const ID = '0'.repeat(64)
const C = (v) => fb.amount(v, 'C')
const E = {
  ranges: [{ of: 'temperature', min: C('0'), max: C('180') }],
  hours: [{ from: '06:00+01:00', to: '22:00+01:00' }],
  safe_state: 'heat off',
  work_alone: 'PT2H'
}
const scope = { types: ['observe'], until: LATER }
const grant = (fence) => ({ type: 'grant', state: { kind: 'authority', scope, fence }, refs: { to: ID } })

// ---- 1. the shape ----
{
  check('fence: a whole fence is well formed', grant(E), [])
  check('fence: every field is optional: an empty fence states nothing', grant({}), [])
  check('fence: a range may be below zero (a freezer)', grant({ ranges: [{ of: 'freezer', min: C('-20'), max: C('-15') }] }), [])
  check('fence: a range may have one end', grant({ ranges: [{ of: 'temperature', max: C('180') }] }), [])
  check('fence: a fence that is not an object is refused', grant('max 180'), ['shape'])
  check('fence: a name that is not one of the four is undeclared', grant({ colour: 'red' }), ['undeclared_field'])
  check('fence: ranges that are an empty list are refused', grant({ ranges: [] }), ['shape'])
  check('fence: a range with neither end is refused', grant({ ranges: [{ of: 'temperature' }] }), ['shape'])
  check('fence: a range whose min is above its max is refused', grant({ ranges: [{ of: 'temperature', min: C('200'), max: C('180') }] }), ['shape'])
  check('fence: a range whose ends are in two units is refused', grant({ ranges: [{ of: 'temperature', min: C('0'), max: fb.amount('300', 'F') }] }), ['shape'])
  check('fence: a range named twice is refused', grant({ ranges: [{ of: 'temperature', max: C('180') }, { of: 'temperature', max: C('90') }] }), ['shape'])
  check('fence: a range with no name is refused', grant({ ranges: [{ of: '', max: C('180') }] }), ['shape'])
  check('fence: a range end that is no decimal is refused', grant({ ranges: [{ of: 'temperature', max: { value: 'hot', unit: 'C' } }] }), ['shape'])
  check('fence: hours that are an empty list are refused', grant({ hours: [] }), ['shape'])
  check('fence: an hour written without an offset is outside the grammar', grant({ hours: [{ from: '06:00', to: '22:00Z' }] }), ['grammar'])
  check('fence: hour 25 is outside the grammar', grant({ hours: [{ from: '06:00Z', to: '25:00Z' }] }), ['grammar'])
  check('fence: an hours entry with a third key is refused', grant({ hours: [{ from: '06:00Z', to: '22:00Z', day: 'mon' }] }), ['shape'])
  check('fence: an hours entry that is not two texts is refused', grant({ hours: [{ from: '06:00Z', to: 22 }] }), ['shape'])
  check('fence: an entry that starts and ends at one minute is refused', grant({ hours: [{ from: '06:00Z', to: '06:00Z' }] }), ['shape'])
  check('fence: the offset is taken off first: 06:00+01:00 and 05:00Z are one minute', grant({ hours: [{ from: '06:00+01:00', to: '05:00Z' }] }), ['shape'])
  check('fence: an entry may run round midnight', grant({ hours: [{ from: '22:00Z', to: '06:00Z' }] }), [])
  check('fence: a safe state that is empty text is refused', grant({ safe_state: '' }), ['shape'])
  check('fence: a safe state that is not text is refused', grant({ safe_state: 5 }), ['shape'])
  check('fence: work_alone that is no duration is refused', grant({ work_alone: 'two hours' }), ['time'])
}

// ---- 2. a grant passed on carries a fence no wider ----
{
  const s = story(), farm = s.person('fenceFarm'), agent = s.person('fenceAgent', { kind: 'agent' })
  const parent = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope, fence: E }, { to: agent.id })
  const child = (fence) => ({ type: 'grant', state: { kind: 'authority', scope, fence }, refs: { parent: parent.hash, to: ID, author: agent.id } })
  const within = (name, env) => check('fence: passed on: ' + name + ' is within', child(env), [], s.held)
  const wider = (name, env) => check('fence: passed on: ' + name + ' is wider', child(env), ['wider_than_parent'], s.held)
  within('the same fence', E)
  within('narrower on every field', { ranges: [{ of: 'temperature', min: C('10'), max: C('150') }], hours: [{ from: '07:00+01:00', to: '20:00+01:00' }], safe_state: 'heat off', work_alone: 'PT1H' })
  within('the same hours written in UTC', { ...E, hours: [{ from: '05:00Z', to: '21:00Z' }] })
  within('two entries both inside the parent\'s hours', { ...E, hours: [{ from: '06:00Z', to: '08:00Z' }, { from: '12:00Z', to: '20:00Z' }] })
  within('a work_alone equal to the parent\'s written in minutes', { ...E, work_alone: 'PT120M' })
  within('a work_alone left out (zero)', { ranges: E.ranges, hours: E.hours, safe_state: E.safe_state })
  within('a range added that the parent lacks', { ...E, ranges: [...E.ranges, { of: 'pressure', max: fb.amount('2', 'bar') }] })
  wider('a max above the parent\'s', { ...E, ranges: [{ of: 'temperature', min: C('0'), max: C('200') }] })
  wider('a min below the parent\'s', { ...E, ranges: [{ of: 'temperature', min: C('-1'), max: C('180') }] })
  wider('a range that leaves out an end the parent states', { ...E, ranges: [{ of: 'temperature', max: C('180') }] })
  wider('a range in another unit', { ...E, ranges: [{ of: 'temperature', min: fb.amount('0', 'F'), max: fb.amount('180', 'F') }] })
  wider('a range for another name only', { ...E, ranges: [{ of: 'pressure', max: fb.amount('2', 'bar') }] })
  wider('no ranges', { hours: E.hours, safe_state: E.safe_state, work_alone: 'PT1H' })
  wider('hours that start before the parent\'s', { ...E, hours: [{ from: '04:00Z', to: '10:00Z' }] })
  wider('hours that run round midnight out of the parent\'s', { ...E, hours: [{ from: '20:00Z', to: '22:00Z' }] })
  wider('no hours', { ranges: E.ranges, safe_state: E.safe_state, work_alone: 'PT1H' })
  wider('another safe state', { ...E, safe_state: 'idle' })
  wider('no safe state', { ranges: E.ranges, hours: E.hours, work_alone: 'PT1H' })
  wider('a longer work_alone', { ...E, work_alone: 'PT3H' })
  wider('no fence at all', undefined)
  // the overnight parent
  const night = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope, fence: { hours: [{ from: '22:00Z', to: '06:00Z' }] } }, { to: agent.id })
  const ofNight = (fence) => ({ type: 'grant', state: { kind: 'authority', scope, fence }, refs: { parent: night.hash, to: ID, author: agent.id } })
  check('fence: passed on: hours inside an overnight parent\'s are within', ofNight({ hours: [{ from: '23:00Z', to: '01:00Z' }] }), [], s.held)
  check('fence: passed on: hours that leave an overnight parent\'s are wider', ofNight({ hours: [{ from: '05:00Z', to: '07:00Z' }] }), ['wider_than_parent'], s.held)
  // a parent with no fence fences nothing
  const bare = s.say(farm, 'grant', { kind: 'authority', depth: 1, scope }, { to: agent.id })
  const ofBare = (fence) => ({ type: 'grant', state: { kind: 'authority', scope, fence }, refs: { parent: bare.hash, to: ID, author: agent.id } })
  check('fence: passed on: a parent with no fence lets any ranges, hours and safe state', ofBare(E.work_alone ? { ...E, work_alone: 'PT0S' } : E), [], s.held)
  check('fence: passed on: a parent with no fence lets no time alone, so work_alone above zero is wider', ofBare({ work_alone: 'PT1M' }), ['wider_than_parent'], s.held)
}

// ---- 3. fence_reading ----
{
  const noon = '2026-11-08T12:00:00.000Z', heard = '2026-11-08T11:00:00.000Z'
  const R = { temperature: C('100') }
  const read = (name, env, at, readings, heardAt, expect) => door('fence: reading: ' + name, 'fence_reading', [env, at, readings, heardAt], { expect, exact: true })
  const ok = { within: true, why: [], alone: true, alone_until: '2026-11-08T13:00:00.000Z' }
  read('inside every fence, heard an hour ago, two hours allowed', E, noon, R, heard, ok)
  read('the last instant of work_alone is still alone (up to N includes N)', E, '2026-11-08T13:00:00.000Z', R, heard, ok)
  read('one millisecond past work_alone is not alone', E, '2026-11-08T13:00:00.001Z', R, heard, { ...ok, within: true, alone: false })
  read('hours: 22:00Z is past the end (21:00Z) and alone has run out', E, '2026-11-08T22:00:00.000Z', R, heard, { within: false, why: [{ code: 'outside_hours', of: null }], alone: false, alone_until: ok.alone_until })
  read('hours: the start minute is inside', E, '2026-11-08T05:00:00.000Z', R, '2026-11-08T05:00:00.000Z', { within: true, why: [], alone: true, alone_until: '2026-11-08T07:00:00.000Z' })
  read('hours: the minute before the start is outside', E, '2026-11-08T04:59:59.999Z', R, '2026-11-08T04:00:00.000Z', { within: false, why: [{ code: 'outside_hours', of: null }], alone: true, alone_until: '2026-11-08T06:00:00.000Z' })
  read('hours: the last millisecond before the end is inside', E, '2026-11-08T20:59:59.999Z', R, '2026-11-08T20:00:00.000Z', { within: true, why: [], alone: true, alone_until: '2026-11-08T22:00:00.000Z' })
  read('hours: the end minute is outside', E, '2026-11-08T21:00:00.000Z', R, '2026-11-08T20:00:00.000Z', { within: false, why: [{ code: 'outside_hours', of: null }], alone: true, alone_until: '2026-11-08T22:00:00.000Z' })
  const night = { hours: [{ from: '22:00Z', to: '06:00Z' }] }
  read('hours round midnight: 23:00Z is inside', night, '2026-11-08T23:00:00.000Z', null, null, { within: true, why: [], alone: false, alone_until: null })
  read('hours round midnight: 03:00Z is inside', night, '2026-11-08T03:00:00.000Z', null, null, { within: true, why: [], alone: false, alone_until: null })
  read('hours round midnight: 06:00Z is outside', night, '2026-11-08T06:00:00.000Z', null, null, { within: false, why: [{ code: 'outside_hours', of: null }], alone: false, alone_until: null })
  read('hours round midnight: 12:00Z is outside', night, noon, null, null, { within: false, why: [{ code: 'outside_hours', of: null }], alone: false, alone_until: null })
  const india = { hours: [{ from: '00:30+05:30', to: '12:00+05:30' }] }
  read('hours in +05:30: 19:00Z (00:30 local) is inside', india, '2026-11-08T19:00:00.000Z', null, null, { within: true, why: [], alone: false, alone_until: null })
  read('hours in +05:30: 06:29Z is inside, 06:30Z (12:00 local) is not', india, '2026-11-08T06:29:00.000Z', null, null, { within: true, why: [], alone: false, alone_until: null })
  read('hours in +05:30: 06:30Z is outside', india, '2026-11-08T06:30:00.000Z', null, null, { within: false, why: [{ code: 'outside_hours', of: null }], alone: false, alone_until: null })
  read('range: the max itself is inside', E, noon, { temperature: C('180') }, heard, ok)
  read('range: the min itself is inside', E, noon, { temperature: C('0') }, heard, ok)
  read('range: above the max is out of range', E, noon, { temperature: C('180.5') }, heard, { ...ok, within: false, why: [{ code: 'out_of_range', of: 'temperature' }] })
  read('range: below the min is out of range', E, noon, { temperature: C('-0.1') }, heard, { ...ok, within: false, why: [{ code: 'out_of_range', of: 'temperature' }] })
  read('range: no reading is unread, never inside', E, noon, {}, heard, { ...ok, within: false, why: [{ code: 'unread', of: 'temperature' }] })
  read('range: readings that are null are unread', E, noon, null, heard, { ...ok, within: false, why: [{ code: 'unread', of: 'temperature' }] })
  read('range: a reading in another unit is unread', E, noon, { temperature: fb.amount('100', 'F') }, heard, { ...ok, within: false, why: [{ code: 'unread', of: 'temperature' }] })
  read('range: a reading that is no amount is unread', E, noon, { temperature: 100 }, heard, { ...ok, within: false, why: [{ code: 'unread', of: 'temperature' }] })
  read('range: a reading of a name the fence does not state is ignored', E, noon, { ...R, humidity: fb.amount('99', '%') }, heard, ok)
  const two = { ranges: [{ of: 'b', max: C('1') }, { of: 'a', max: C('1') }], hours: [{ from: '06:00Z', to: '07:00Z' }] }
  read('why lists hours first, then each range in the fence\'s order', two, noon, { a: C('5'), b: C('5') }, null, { within: false, why: [{ code: 'outside_hours', of: null }, { code: 'out_of_range', of: 'b' }, { code: 'out_of_range', of: 'a' }], alone: false, alone_until: null })
  read('alone: a node never heard from is not alone', E, noon, R, null, { within: true, why: [], alone: false, alone_until: null })
  read('alone: a null fence fences nothing and lets no time alone', null, noon, null, noon, { within: true, why: [], alone: true, alone_until: noon })
  read('alone: with no work_alone, one millisecond past heard is not alone', { safe_state: 'idle' }, '2026-11-08T12:00:00.001Z', null, noon, { within: true, why: [], alone: false, alone_until: noon })
  read('alone: a calendar month is added to heard (31 January plus P1M is 28 February)', { work_alone: 'P1M' }, '2026-02-28T00:00:00.000Z', null, '2026-01-31T00:00:00.000Z', { within: true, why: [], alone: true, alone_until: '2026-02-28T00:00:00.000Z' })
  read('a fence that cannot be read is junk alone', { hours: [] }, noon, R, heard, { within: false, why: [{ code: 'junk', of: null }], alone: false, alone_until: null })
  read('a fence with a name of its own is junk', { colour: 'red' }, noon, R, heard, { within: false, why: [{ code: 'junk', of: null }], alone: false, alone_until: null })
  for (const [name, args] of [['at that is no time', [E, 'noon', R, heard]], ['heard that is no time', [E, noon, R, 'earlier']]]) {
    const n = 'fence: reading: ' + name + ' is an argument error'
    V.door = V.door.filter((c) => c.name !== n)
    V.door.push({ name: n, op: 'fence_reading', args, error: { kind: 'argument' } })
    assert.throws(() => call('fence_reading', ...args), (e) => e.kind === 'argument')
  }
}

vectorsFile.save(V, tags)
