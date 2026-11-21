// Adds to spec/vectors.json the cases of a machine lock (authority.md, A machine lock): the shape of a grant of kind stop with `how`, the lift
// (status lifted, state.checked), and the reading `machine_lock`. `node test/make-vectors-locks.cjs`, after `node scripts/build-wasm.cjs`. Idempotent.
// Every expectation is written here by hand from the spec text and checked against the Rust core; the oracle then checks the file.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { fb, call, story, door, check, M, LATER } = kit

const ID = '2'.repeat(64)
const stop = (extra, refs = {}) => ({ type: 'grant', state: { kind: 'stop', how: 'hand', placer: ID, safe: 'heat off', ...extra }, refs: { subject: ID, ...refs } })

// ---- 1. the shape of a lock ----
{
  check('lock: a hand lock is well formed', stop({}), [])
  check('lock: a far lock with a reach is well formed', stop({ how: 'far', reach: 'the whole line' }), [])
  check('lock: an old stop (kind stop, none of the lock fields) reads as before', { type: 'grant', state: { kind: 'stop', scope: { types: ['observe'] } }, refs: {} }, [])
  check('lock: how outside the closed list is refused', stop({ how: 'telepathy' }), ['shape'])
  check('lock: how that is not text is refused', stop({ how: 1 }), ['shape'])
  check('lock: placer, safe or reach without how is required', { type: 'grant', state: { kind: 'stop', placer: ID, safe: 'heat off' }, refs: { subject: ID } }, ['required'])
  check('lock: a lock names its placer', { type: 'grant', state: { kind: 'stop', how: 'hand', safe: 'heat off' }, refs: { subject: ID } }, ['required'])
  check('lock: a placer that is no id is outside the grammar', stop({ placer: 'pat' }), ['grammar'])
  check('lock: a lock names its safe state', { type: 'grant', state: { kind: 'stop', how: 'hand', placer: ID }, refs: { subject: ID } }, ['required'])
  check('lock: a safe state that is empty text is refused', stop({ safe: '' }), ['shape'])
  check('lock: a reach that is empty text is refused', stop({ reach: '' }), ['shape'])
  check('lock: a reach that is not text is refused', stop({ reach: 3 }), ['shape'])
  check('lock: a lock is aimed at a machine (refs.subject)', { type: 'grant', state: { kind: 'stop', how: 'hand', placer: ID, safe: 'heat off' }, refs: {} }, ['required'])
  check('lock: the lock fields are undeclared on a grant of another kind', { type: 'grant', state: { kind: 'authority', how: 'hand', placer: ID, safe: 'off' }, refs: {} }, ['undeclared_field'])
  check('lock: how on an end of a grant (status stopped) is undeclared', { type: 'grant', state: { status: 'stopped', stop: 'onward', how: 'hand' }, refs: { updates: ID } }, ['undeclared_field'])
}

// ---- 2. the lift ----
{
  const s = story(), pat = s.person('lk-shape-pat'), owner = s.person('lk-shape-owner')
  const kind = s.say(owner, 'thing', { kind: 'oven' }), oven = s.say(owner, 'thing', { kind: 'our oven' }, { of: kind.hash })
  const lock = s.say(pat, 'grant', { kind: 'stop', how: 'hand', placer: pat.id, safe: 'heat off' }, { subject: oven.hash })
  const plain = s.say(owner, 'grant', { kind: 'authority', scope: { types: ['observe'] } }, { to: pat.id })
  const lift = (state, refs = {}, target = lock) => ({ type: 'grant', state: { status: 'lifted', ...state }, refs: { updates: target.hash, ...refs } })
  check('lock: a lift is an updates of the lock that says lifted', lift({}), [], s.held)
  check('lock: a lift that says checked, true, names the stake in refs.confirms', lift({ checked: true }, { confirms: ID }), [], s.held)
  check('lock: checked that is not true is refused', lift({ checked: false }, { confirms: ID }), ['shape'], s.held)
  check('lock: checked without the stake in refs.confirms is required', lift({ checked: true }), ['required'], s.held)
  check('lock: checked is undeclared on a block that is not a lift', stop({ checked: true }), ['undeclared_field'])
  check('lock: lifted that answers a block is refused', { type: 'grant', state: { status: 'lifted' }, refs: { answers: lock.hash } }, ['bad_status'], s.held)
  check('lock: lifted on a promise is refused (an updates of a promise is only its author\'s stop)', { type: 'promise', state: { status: 'lifted' }, refs: { updates: lock.hash } }, ['required', 'bad_status'], s.held)
  check('lock: a lift of a grant that is no lock is refused', lift({}, {}, plain), ['bad_status'], s.held)
  check('lock: a lift of a lock the reader does not hold waits for it, it is not refused for it', lift({}, {}, { hash: ID }), [], s.held)
}

// ---- 3. machine_lock ----
{
  const world = (tag) => {
    const s = story(), owner = s.person(tag + '-owner'), pat = s.person(tag + '-pat'), worker = s.person(tag + '-worker'), judge = s.person(tag + '-judge')
    const kind = s.say(owner, 'thing', { kind: 'oven' }), oven = s.say(owner, 'thing', { kind: 'our oven' }, { of: kind.hash })
    const lock = (state = {}, who = pat) => s.say(who, 'grant', { kind: 'stop', how: 'hand', placer: pat.id, safe: 'heat off', ...state }, { subject: oven.hash })
    const lift = (who, target, state = {}, refs = {}) => s.say(who, 'grant', { status: 'lifted', ...state }, { updates: target.hash, after: [target.hash], ...refs })
    const stake = (who, target, state = {}, refs = {}) => s.say(who, 'transfer', { money: M(50000), condition: { ruled: oven.hash, by: judge.id, awards: worker.id }, ...state }, { to_owner: worker.id, for: target.hash, ...refs })
    return { s, owner, pat, worker, judge, oven, lock, lift, stake }
  }
  const read = (name, w, expect, now = null) => door('lock: ' + name, 'machine_lock', [w.oven, w.s.held, now], { expect, exact: Object.keys(expect).length === 3 })
  const standing = (b, extra = {}) => ({ block: b.hash, how: 'hand', reach: null, placer: extra.placer, safe: 'heat off', ...extra })
  const none = { locked: false, locks: [], lifted: [] }

  { // a lock stands until a lift of its placer or of the owner with a stake
    const w = world('lk1'), lock = w.lock({ reach: 'this oven' })
    read('a lock of the machine locks it, with its fields as signed', w, { locked: true, locks: [{ block: lock.hash, how: 'hand', reach: 'this oven', placer: w.pat.id, safe: 'heat off' }], lifted: [] })
    const far = w.lock({ how: 'far', safe: 'idle' })
    const both = [lock, far].sort((a, b) => (a.hash < b.hash ? -1 : 1))
    read('locks stack, sorted by block', w, { locked: true, locks: both.map((b) => ({ block: b.hash, how: b.state.how, reach: b.state.reach === undefined ? null : b.state.reach, placer: w.pat.id, safe: b.state.safe })), lifted: [] })
    const stranger = w.lift(w.worker, lock)
    read('a lift by a stranger lifts nothing', w, { locked: true, locks: both.map((b) => ({ block: b.hash, how: b.state.how, reach: b.state.reach === undefined ? null : b.state.reach, placer: w.pat.id, safe: b.state.safe })), lifted: [] })
    const ownerBare = w.lift(w.owner, lock)
    read('the owner\'s lift with no check and no stake lifts nothing', w, { locked: true, locks: both.map((b) => ({ block: b.hash, how: b.state.how, reach: b.state.reach === undefined ? null : b.state.reach, placer: w.pat.id, safe: b.state.safe })), lifted: [] })
    const noStake = w.stake(w.owner, far, { condition: undefined })
    const ownerNoCondition = w.lift(w.owner, lock, { checked: true }, { confirms: noStake.hash })
    read('a stake with no condition is no stake', w, { locked: true })
    const wrongFor = w.stake(w.owner, far)
    const ownerWrongFor = w.lift(w.owner, lock, { checked: true }, { confirms: wrongFor.hash })
    read('a stake for another lock does not lift this one', w, { locked: true })
    const strangerStake = w.stake(w.worker, lock)
    const ownerStrangerStake = w.lift(w.owner, lock, { checked: true }, { confirms: strangerStake.hash })
    read('a stake that is not the owner\'s does not lift', w, { locked: true })
    const good = w.stake(w.owner, lock)
    const strangerChecks = w.lift(w.worker, lock, { checked: true }, { confirms: good.hash })
    read('a stranger\'s checked lift naming the owner\'s stake lifts nothing', w, { locked: true })
    const byOwner = w.lift(w.owner, lock, { checked: true }, { confirms: good.hash })
    read('the owner\'s checked lift with his stake lifts that lock alone', w, { locked: true, locks: [{ block: far.hash, how: 'far', reach: null, placer: w.pat.id, safe: 'idle' }], lifted: [{ block: lock.hash, by: byOwner.hash, via: 'owner' }] })
    const byPlacer = w.lift(w.pat, far)
    read('the placer\'s lift lifts a lock with no stake', w, { locked: false, locks: [], lifted: [{ block: lock.hash, by: byOwner.hash, via: 'owner' }, { block: far.hash, by: byPlacer.hash, via: 'placer' }].sort((a, b) => (a.block < b.block ? -1 : 1)) })
    const again = w.lock({ safe: 'power off' })
    read('a lock placed after a lift is a new lock and locks again', w, { locked: true, locks: [{ block: again.hash, how: 'hand', reach: null, placer: w.pat.id, safe: 'power off' }] })
  }
  { // what is not a lock, or no longer stands
    const w = world('lk2')
    read('no lock: not locked', w, none)
    const old = w.s.say(w.pat, 'grant', { kind: 'stop' }, { subject: w.oven.hash })
    read('an old stop of kind stop without how is no lock', w, none)
    const other = w.s.say(w.owner, 'thing', { kind: 'other oven' }, { of: w.oven.refs.of })
    w.s.say(w.pat, 'grant', { kind: 'stop', how: 'far', placer: w.pat.id, safe: 'off' }, { subject: other.hash })
    read('a lock aimed at another machine does not lock this one', w, none)
    const lock = w.lock()
    w.s.say(w.pat, 'grant', { status: 'stopped', stop: 'onward' }, { updates: lock.hash, after: [lock.hash] })
    read('a lock its author stopped (Ending) no longer stands, and is not lifted', w, none)
  }
  { // until is tested at the clock the reader names
    const w = world('lk3'), lock = w.lock({ scope: { until: '2027-06-01T00:00:00.000Z' } })
    const one = { locked: true, locks: [{ block: lock.hash, how: 'hand', reach: null, placer: w.pat.id, safe: 'heat off' }], lifted: [] }
    read('a lock with scope.until stands when the reader names no clock', w, one)
    read('a lock with scope.until stands before it', w, one, '2027-05-31T23:59:59.999Z')
    read('a lock with scope.until stands no more at it', w, none, '2027-06-01T00:00:00.000Z')
  }
  { // the owner is read where the lift stands
    const w = world('lk4'), lock = w.lock(), good = w.stake(w.owner, lock)
    const hand = w.s.say(w.owner, 'transfer', {}, { what: w.oven.hash, to_owner: w.worker.id })
    const took = w.s.say(w.worker, 'transfer', { status: 'accepted' }, { answers: hand.hash })
    const late = w.lift(w.owner, lock, { checked: true }, { confirms: good.hash, after: [lock.hash, took.hash] })
    read('an owner who has handed the machine on is no owner to lift it', w, { locked: true })
    const sold = w.lift(w.worker, lock, {}, { after: [lock.hash, took.hash] })
    read('and the new owner without a stake lifts nothing', w, { locked: true })
    const newStake = w.stake(w.worker, lock)
    const byNew = w.lift(w.worker, lock, { checked: true }, { confirms: newStake.hash, after: [lock.hash, took.hash] })
    read('the new owner with his stake lifts it', w, { locked: false, locks: [], lifted: [{ block: lock.hash, by: byNew.hash, via: 'owner' }] })
  }
  { // a placer may be a person other than the block's author
    const w = world('lk5'), lock = w.lock({}, w.worker), byPat = w.lift(w.pat, lock)
    read('a lock signed by another names the placer who lifts it', w, { locked: false, locks: [], lifted: [{ block: lock.hash, by: byPat.hash, via: 'placer' }] })
  }
  {
    const n = 'lock: a machine that is no block is an argument error'
    V.door = V.door.filter((c) => c.name !== n)
    V.door.push({ name: n, op: 'machine_lock', args: ['oven', [], null], error: { kind: 'argument' } })
    assert.throws(() => call('machine_lock', 'oven', [], null), (e) => e.kind === 'argument')
  }
}

vectorsFile.save(V, tags)
