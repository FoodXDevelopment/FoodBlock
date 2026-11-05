// Adds to spec/vectors.json the cases of three words of promises.md: a done that keeps one occurrence of an unpriced standing promise (Settling),
// a pause ended early by its own signer (Answers, `resumed`), and a part passed on by two signatures (Passing a part). `node test/make-vectors-pass.cjs`,
// after `node scripts/build-wasm.cjs`. Idempotent. Each expectation is written by hand from the spec text; the Rust core must give it and so must the
// oracle (spec/oracle).
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { story, stage, check, M, DAY } = kit

const WHEN = '2026-11-06T09:00:00.000Z'
const D1 = '2026-11-06T09:00:00.000Z', D2 = '2026-11-07T09:00:00.000Z', D3 = '2026-11-08T09:00:00.000Z'

// an unpriced daily promise: Ann walks Bob's dog, every day; Bob says yes
const dog = (s, ann, bob, extra = {}) => {
  const walk = s.say(ann, 'thing', { kind: 'a dog walk' })
  const p = s.say(ann, 'promise', { when: WHEN, terms: { repeat: 'FREQ=DAILY', zone: 'Europe/London', expires: DAY, ...extra } }, { from: ann.id, to: bob.id, what: walk.hash })
  s.say(bob, 'promise', { status: 'accepted' }, { answers: p.hash, for: p.hash })
  return p
}

// ---- a done keeps one occurrence
{
  const s = story(), ann = s.person('pa-ann'), bob = s.person('pa-bob'), p = dog(s, ann, bob)
  stage('pass: an unpriced standing promise with no done has no occurrence listed', p, s.held, { stage: 'accepted', occurrences: [] })
  const done = s.say(ann, 'observe', { kind: 'done', occurrence: D1 }, { for: p.hash }, { time: '2026-11-06T10:00:00.000Z' })
  stage('done: the doer\'s own done keeps the occurrence it names: done_at is its time, and nothing else is listed', p, s.held, { stage: 'accepted', paid: null, occurrences: [{ occurrence: D1, due: D1, paid: null, paid_at: null, done_at: '2026-11-06T10:00:00.000Z' }] })
  s.say(ann, 'observe', { kind: 'done', occurrence: D1 }, { for: p.hash }, { time: '2026-11-06T11:00:00.000Z' })
  s.say(ann, 'observe', { kind: 'done', occurrence: D3 }, { for: p.hash }, { time: '2026-11-08T10:00:00.000Z' })
  stage('done: a second done of the same occurrence changes nothing (the earliest is its done_at); another occurrence is listed on its own', p, s.held, { occurrences: [
    { occurrence: D1, done_at: '2026-11-06T10:00:00.000Z' }, { occurrence: D3, done_at: '2026-11-08T10:00:00.000Z' }] })
  s.say(bob, 'observe', { kind: 'done', occurrence: D2 }, { for: p.hash }, { time: '2026-11-07T10:00:00.000Z' })
  stage('done: the other side\'s done is not the doer\'s word: it keeps nothing', p, s.held, { occurrences: [{ occurrence: D1 }, { occurrence: D3 }] })
  s.say(bob, 'observe', { kind: 'ruling' }, { defeats: done.hash, for: p.hash })
  stage('done: a side\'s defeats of a done is a dispute and changes nothing that counts', p, s.held, { occurrences: [{ occurrence: D1, done_at: '2026-11-06T10:00:00.000Z' }, { occurrence: D3 }] })
}
{
  // to yourself: both sides are her: her done counts, and nobody else's word is asked
  const s = story(), ann = s.person('pb-ann'), walk = s.say(ann, 'thing', { kind: 'a walk' })
  const p = s.say(ann, 'promise', { when: WHEN, terms: { repeat: 'FREQ=DAILY', zone: 'Europe/London', expires: DAY } }, { from: ann.id, to: ann.id, what: walk.hash })
  s.say(ann, 'observe', { kind: 'done', occurrence: D1 }, { for: p.hash }, { time: '2026-11-06T10:00:00.000Z' })
  stage('done: a standing promise to yourself is kept by your own done', p, s.held, { occurrences: [{ occurrence: D1, due: D1, done_at: '2026-11-06T10:00:00.000Z' }] })
}

// ---- a pause ends early by its own signer
{
  const s = story(), tia = s.person('pc-tia'), uma = s.person('pc-uma'), box = s.say(tia, 'thing', { kind: 'a veg box' })
  const offer = s.say(tia, 'promise', { when: { from: '2026-10-16T09:00:00.000Z', to: '2026-10-16T10:00:00.000Z' }, terms: { price: M(1500), repeat: 'FREQ=WEEKLY;BYDAY=FR', zone: 'Europe/London', expires: '2026-10-16T00:00:00.000Z' } }, { from: tia.id, to: uma.id, what: box.hash })
  s.say(uma, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
  const FRI = ['2026-10-23T09:00:00.000Z', '2026-10-30T09:00:00.000Z', '2026-11-06T09:00:00.000Z']
  const pause = s.say(uma, 'promise', { status: 'stopped', stop: { occurrences: FRI } }, { answers: offer.hash, for: offer.hash })
  stage('resume: a pause of three Fridays stops all three', offer, s.held, { stage: 'accepted', stopped: FRI })
  // the other side cannot end her pause: a resume of it by tia counts for nothing
  s.raw(tia, 'promise', { status: 'resumed' }, { updates: pause.hash, for: offer.hash })
  stage('resume: the other side\'s resume of her pause ends nothing', offer, s.held, { stopped: FRI })
  s.say(uma, 'promise', { status: 'resumed' }, { updates: pause.hash, for: offer.hash }, { time: '2026-10-27T12:00:00.000Z' })
  stage('resume: her own resume ends the pause from its time: the Friday before stays skipped, the two after stand again', offer, s.held, { stage: 'accepted', stopped: ['2026-10-23T09:00:00.000Z'] })
  const again = s.say(uma, 'promise', { status: 'stopped', stop: { occurrences: ['2026-11-13T09:00:00.000Z'] } }, { answers: offer.hash, for: offer.hash })
  stage('resume: a later pause is its own: the resume of the first does not end it', offer, s.held, { stopped: ['2026-10-23T09:00:00.000Z', '2026-11-13T09:00:00.000Z'] })
  void again
}
{
  // a resume of an onward stop, or of a stop that is no pause, is read by no one
  const s = story(), tia = s.person('pd-tia'), uma = s.person('pd-uma'), box = s.say(tia, 'thing', { kind: 'a veg box' })
  const offer = s.say(tia, 'promise', { terms: { price: M(1500), expires: DAY } }, { from: tia.id, to: uma.id, what: box.hash })
  s.say(uma, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash })
  const end = s.say(uma, 'promise', { status: 'stopped', stop: 'onward' }, { answers: offer.hash, for: offer.hash })
  s.say(uma, 'promise', { status: 'resumed' }, { updates: end.hash, for: offer.hash })
  stage('resume: an onward stop is never taken back by a word', offer, s.held, { stage: 'stopped', stop: 'onward' })
}
check('resume: it is the author\'s own updates of their pause, never an answer', { type: 'promise', state: { status: 'resumed' }, refs: { answers: '2'.repeat(64), for: '2'.repeat(64) } }, ['bad_status'])
check('resume: a status resumed with nothing it updates is no resume', { type: 'promise', state: { status: 'resumed' }, refs: {} }, ['required', 'status_not_answer', 'bad_status'])
check('resume: an updates of a promise that says resumed is allowed (the pause is the one it updates)', { type: 'promise', state: { status: 'resumed' }, refs: { updates: '2'.repeat(64), for: '2'.repeat(64) } }, [])

// ---- a part passed on by two signatures
{
  const s = story(), ann = s.person('pe-ann'), bob = s.person('pe-bob'), carl = s.person('pe-carl'), dee = s.person('pe-dee'), p = dog(s, ann, bob)
  stage('pass: before any pass, the side itself answers for its part', p, s.held, { stage: 'accepted', passed: [], answerable: { from: ann.id, to: bob.id }, owing: { from: [ann.id], to: [bob.id] } })
  const pass = s.say(ann, 'observe', { kind: 'pass' }, { for: p.hash, to: carl.id })
  stage('pass: until the receiver signs, she still owes it', p, s.held, { passed: [], answerable: { from: ann.id }, owing: { from: [ann.id] } })
  s.say(carl, 'observe', { status: 'accepted' }, { answers: pass.hash, for: p.hash })
  stage('pass: once the receiver signs, he does it, and she still answers to Bob: nothing the two signed binds Bob', p, s.held, { passed: [{ pass: pass.hash, side: 'from', by: ann.id, to: carl.id, freed_by: null }], answerable: { from: carl.id, to: bob.id }, owing: { from: [ann.id, carl.id].sort(), to: [bob.id] } })
  s.say(carl, 'observe', { status: 'accepted' }, { answers: pass.hash, for: p.hash })
  stage('pass: Carl saying yes again frees no one: only the one she promised can', p, s.held, { passed: [{ freed_by: null }], owing: { from: [ann.id, carl.id].sort() } })
  s.say(bob, 'observe', { status: 'accepted' }, { answers: pass.hash, for: p.hash }, { time: '2026-11-06T09:30:00.000Z' })
  stage('pass: Bob\'s own accept of the pass frees her (a third signature); the receiver alone answers', p, s.held, { passed: [{ pass: pass.hash, freed_by: bob.id }], answerable: { from: carl.id, to: bob.id }, owing: { from: [carl.id], to: [bob.id] } })
  // his done is the side's word; hers no longer is
  s.say(carl, 'observe', { kind: 'done', occurrence: D1 }, { for: p.hash }, { time: '2026-11-06T10:00:00.000Z' })
  stage('pass: the receiver\'s done keeps the occurrence', p, s.held, { occurrences: [{ occurrence: D1, done_at: '2026-11-06T10:00:00.000Z' }] })
  // a pass by someone who does not answer for the part counts for nothing, even answered
  const stray = s.say(dee, 'observe', { kind: 'pass' }, { for: p.hash, to: dee.id })
  const stray2 = s.say(dee, 'observe', { kind: 'pass' }, { for: p.hash, to: bob.id })
  s.say(bob, 'observe', { status: 'accepted' }, { answers: stray2.hash, for: p.hash })
  void stray
  stage('pass: a pass by one who does not answer for the part counts for nothing', p, s.held, { passed: [{ to: carl.id }], answerable: { from: carl.id } })
  // she cannot pass it a second time: it is no longer hers
  const again = s.say(ann, 'observe', { kind: 'pass' }, { for: p.hash, to: dee.id })
  s.say(dee, 'observe', { status: 'accepted' }, { answers: again.hash, for: p.hash })
  stage('pass: a second pass by one who has passed it on counts for nothing', p, s.held, { answerable: { from: carl.id } })
  // he may pass it on in turn
  const on = s.say(carl, 'observe', { kind: 'pass' }, { for: p.hash, to: dee.id })
  s.say(dee, 'observe', { status: 'accepted' }, { answers: on.hash, for: p.hash })
  stage('pass: the receiver passes it on the same way', p, s.held, { passed: [{ to: carl.id }, { pass: on.hash, by: carl.id, to: dee.id }], answerable: { from: dee.id } })
}
{
  // a pass the receiver signed before the passer did, or one accepted by someone else, is no pass; a personal term forbids it
  const s = story(), ann = s.person('pf-ann'), bob = s.person('pf-bob'), carl = s.person('pf-carl'), p = dog(s, ann, bob, { personal: true })
  const pass = s.say(ann, 'observe', { kind: 'pass' }, { for: p.hash, to: carl.id })
  s.say(carl, 'observe', { status: 'accepted' }, { answers: pass.hash, for: p.hash })
  stage('pass: a part under a personal term cannot be passed', p, s.held, { passed: [], answerable: { from: ann.id } })
}
{
  const s = story(), ann = s.person('pg-ann'), bob = s.person('pg-bob'), carl = s.person('pg-carl'), dee = s.person('pg-dee'), p = dog(s, ann, bob)
  const pass = s.say(ann, 'observe', { kind: 'pass' }, { for: p.hash, to: carl.id })
  s.say(dee, 'observe', { status: 'accepted' }, { answers: pass.hash, for: p.hash })
  stage('pass: an accept by anyone but the named receiver passes nothing', p, s.held, { passed: [], answerable: { from: ann.id } })
  // the other side's part can be passed too
  const mine = s.say(bob, 'observe', { kind: 'pass' }, { for: p.hash, to: dee.id })
  s.say(dee, 'observe', { status: 'accepted' }, { answers: mine.hash, for: p.hash })
  stage('pass: the other side passes its own part the same way', p, s.held, { passed: [{ side: 'to', by: bob.id, to: dee.id }], answerable: { from: ann.id, to: dee.id } })
}

kit.retire(['pass: once the receiver signs, he answers for it'])
vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
