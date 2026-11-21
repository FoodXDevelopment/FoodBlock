// Adds to spec/vectors.json the cases of the will (identity.md, A will): who may recover an identity, how many must agree, the wait, and where
// each claim stands at the caller's time. `node test/make-vectors-will.cjs`, after `node scripts/build-wasm.cjs`. Idempotent; no older case is touched.
// Every expectation is written here by hand from the spec text and checked against the Rust core; the oracle then checks the file.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { story, door, keyOf } = kit

const T = (d, h = 10) => `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`
const NEW1 = keyOf('willNewKey1').public_key_sign, NEW2 = keyOf('willNewKey2').public_key_sign

// her, a recovery key kept offline (an actor of its own), her mum and her brother; the will names them in that rank, two must agree, seven days
function world(tag) {
  const s = story()
  const her = s.person(tag + 'Her'), key = s.person(tag + 'Key'), mum = s.person(tag + 'Mum'), bro = s.person(tag + 'Bro'), thief = s.person(tag + 'Thief')
  const will = s.say(her, 'observe', { kind: 'will', recoverers: [key.id, mum.id, bro.id], needed: 2, wait: 'P7D', device_wait: 'PT1H' }, {}, { time: T(1) })
  return { s, her, key, mum, bro, thief, will }
}
const claim = (w, who, newKey, day, extra = {}) => w.s.say(who, 'observe', { kind: 'recovery_claim', new_key: newKey }, { subject: w.her.id, what: w.will.hash, ...extra }, { time: T(day) })
const agree = (w, who, c, day) => w.s.say(who, 'observe', { kind: 'recovery_agree' }, { what: c.hash }, { time: T(day) })
const cancel = (w, c, day) => w.s.say(w.her, 'observe', { kind: 'cancel' }, { defeats: c.hash }, { time: T(day) })
const shown = (name, w, now, expect, arrivals = null) => door(name, 'recovery_shown', [w.her.id, w.s.held, now, arrivals], { expect })

// ---- no will: nothing is filled in ----
{
  const s = story(), her = s.person('willNoHer'), mum = s.person('willNoMum')
  s.say(mum, 'observe', { kind: 'recovery_claim', new_key: NEW1 }, { subject: her.id }, { time: T(2) })
  door('will: with no will no one may recover her: no will, no claim, no key', 'recovery_shown', [her.id, s.held, T(30), null], { expect: { will: null, conflict: false, claims: [], keys: [] }, exact: false })
}

// ---- a claim waits for its voices and for the wait ----
{
  const w = world('willA'), c = claim(w, w.mum, NEW1, 2)
  shown('will: the will stands with its ranked recoverers, its count and its wait', w, T(3), { will: { block: w.will.hash, recoverers: [w.key.id, w.mum.id, w.bro.id], needed: 2, wait: 'P7D', device_wait: 'PT1H' } })
  shown('will: one recoverer\'s claim is one voice of two: pending, and no key is brought in', w, T(30), { claims: [{ block: c.hash, kind: 'recovery', by: w.mum.id, rank: 1, agreed: [w.mum.id], needed: 2, ready: T(9), status: 'pending' }], keys: [] })
  const a = agree(w, w.bro, c, 3)
  const voices = [w.bro.id, w.mum.id].sort()
  shown('will: two voices but the wait has not passed: still pending', w, T(8, 23), { claims: [{ block: c.hash, agreed: voices, status: 'pending' }], keys: [] })
  shown('will: two of the listed recoverers and the wait passed: effective, and the key is read', w, T(9), { claims: [{ block: c.hash, agreed: voices, ready: T(9), status: 'effective' }], keys: [NEW1] })
  shown('will: with no time given nothing waits out', w, null, { claims: [{ block: c.hash, status: 'pending' }], keys: [] })
  // a stranger\'s agreement is no voice
  const w2 = world('willA2'), c2 = claim(w2, w2.mum, NEW1, 2)
  agree(w2, w2.thief, c2, 3)
  shown('will: a voice that is not listed does not count', w2, T(30), { claims: [{ block: c2.hash, agreed: [w2.mum.id], status: 'pending' }], keys: [] })
  // a claim by one not listed is ignored
  const w3 = world('willA3'); claim(w3, w3.thief, NEW1, 2)
  shown('will: a claim by one the will does not list is no claim', w3, T(30), { claims: [], keys: [] })
}

// ---- any live key of hers cancels, in time ----
{
  const w = world('willB'), c = claim(w, w.mum, NEW1, 2)
  agree(w, w.bro, c, 3)
  const x = cancel(w, c, 5)
  shown('will: her cancel before the claim is ready cancels it, whenever the reader looks', w, T(30), { claims: [{ block: c.hash, status: 'cancelled' }], keys: [] })
  const w2 = world('willB2'), c2 = claim(w2, w2.mum, NEW1, 2)
  agree(w2, w2.bro, c2, 3)
  cancel(w2, c2, 12)
  shown('will: a cancel that began after the claim was ready cancels nothing: a signed word is never unsigned', w2, T(30), { claims: [{ block: c2.hash, status: 'effective' }], keys: [NEW1] })
  assert(x)
}

// ---- a claim dated in the past waits from its arrival ----
{
  const w = world('willC'), c = claim(w, w.mum, NEW1, 2)
  agree(w, w.bro, c, 2)
  shown('will: a claim dated early but arrived late starts at its arrival: still pending where its date alone would be effective', w, T(10), { claims: [{ block: c.hash, start: T(8), ready: T(15), status: 'pending' }], keys: [] }, { [c.hash]: T(8) })
  shown('will: the same claim with the reader\'s arrivals, once the wait from arrival has passed: effective', w, T(15), { claims: [{ block: c.hash, status: 'effective' }], keys: [NEW1] }, { [c.hash]: T(8) })
}

// ---- rank: a higher-ranked recoverer\'s claim for another key outranks a lower one ----
{
  const w = world('willD'), low = claim(w, w.mum, NEW1, 2), high = claim(w, w.key, NEW2, 3)
  agree(w, w.bro, low, 3)
  agree(w, w.bro, high, 3)
  shown('will: the claim of the higher-ranked recoverer outranks a lower one for another key, however many agree', w, T(30), { claims: [{ block: low.hash, status: 'outranked' }, { block: high.hash, status: 'effective' }].sort((a, b) => (a.block < b.block ? -1 : 1)), keys: [NEW2] })
  cancel(w, high, 4)
  shown('will: when the higher-ranked claim is cancelled the lower one stands again', w, T(30), { claims: [{ block: low.hash, status: 'effective' }, { block: high.hash, status: 'cancelled' }].sort((a, b) => (a.block < b.block ? -1 : 1)), keys: [NEW1] })
}

// ---- the will changes only by her own signed will, after its wait ----
{
  const w = world('willE'), c = claim(w, w.mum, NEW1, 2)
  agree(w, w.bro, c, 2)
  const next = w.s.say(w.her, 'observe', { kind: 'will', recoverers: [w.bro.id], needed: 1, wait: 'P1D' }, { updates: w.will.hash }, { time: T(20) })
  shown('will: a new will waits out the standing will\'s wait: until then the standing will and its claims stand', w, T(22), { will: { block: w.will.hash }, pending_wills: [{ block: next.hash, ready: T(27) }] })
  shown('will: once the standing wait has passed the new will takes its place, and a claim under the old will counts for nothing', w, T(27), { will: { block: next.hash, recoverers: [w.bro.id], needed: 1, wait: 'P1D', device_wait: null }, pending_wills: [], claims: [], keys: [] })
  const w2 = world('willE2')
  const upd = w2.s.say(w2.her, 'observe', { kind: 'will', recoverers: [w2.thief.id], needed: 1, wait: 'P1D' }, { updates: w2.will.hash }, { time: T(20) })
  cancel(w2, upd, 22)
  shown('will: a thief\'s update is cancelled by any live key of hers inside the wait', w2, T(30), { will: { block: w2.will.hash }, pending_wills: [] })
}

// ---- two first wills that do not see each other: none stands ----
{
  const s = story(), her = s.person('willF'), mum = s.person('willFMum')
  const k2 = keyOf('willFSecond')
  const grant = s.say(her, 'grant', { kind: 'key', public_key_sign: k2.public_key_sign }, { subject: her.id }, { time: T(1) })
  const a = s.say(her, 'observe', { kind: 'will', recoverers: [mum.id], needed: 1, wait: 'P1D' }, {}, { time: T(2) })
  // the second key writes its own first will having seen the grant but not the first will
  const b = s.keep(kit.fb.write('observe', { kind: 'will', recoverers: [mum.id], needed: 1, wait: 'P2D' }, {}, { author: her.id, key: k2, held: [...s.held.filter((x) => x.hash !== a.hash)], at: T(2, 11), audience: 'public' }))
  door('will: two first wills that do not see each other are a conflict: none stands and no hash picks one', 'recovery_shown', [her.id, s.held, T(30), null], { expect: { will: null, conflict: true, claims: [], keys: [] } })
  assert(grant && b)
}

// ---- a will with a number missing is no will ----
{
  const s = story(), her = s.person('willG'), mum = s.person('willGMum')
  s.say(her, 'observe', { kind: 'will', recoverers: [mum.id], wait: 'P1D' }, {}, { time: T(1) })
  door('will: a will with no count of its own is no will: nothing fills the number in', 'recovery_shown', [her.id, s.held, T(30), null], { expect: { will: null, claims: [] } })
}

// ---- a device alone, after a short wait any live key cancels ----
{
  const w = world('willH')
  const d = w.s.say(w.her, 'observe', { kind: 'device_claim', new_key: NEW1 }, { subject: w.her.id }, { time: T(2, 12) })
  shown('will: a device claim waits its short wait, and it asks no recoverer', w, T(2, 12), { claims: [{ block: d.hash, kind: 'device', by: w.her.id, rank: null, ready: T(2, 13), status: 'pending' }], keys: [] })
  shown('will: after the short wait the device is brought in alone', w, T(2, 14), { claims: [{ block: d.hash, status: 'effective' }], keys: [NEW1] })
  shown('will: a device claim changes no will: who recovers is the same', w, T(2, 14), { will: { block: w.will.hash, recoverers: [w.key.id, w.mum.id, w.bro.id] } })
  const w2 = world('willH2')
  const d2 = w2.s.say(w2.her, 'observe', { kind: 'device_claim', new_key: NEW1 }, { subject: w2.her.id }, { time: T(2, 12) })
  cancel(w2, d2, 2)
  shown('will: any live key of hers cancels a device claim inside its wait', w2, T(30), { claims: [{ block: d2.hash, status: 'cancelled' }], keys: [] })
  const s = story(), her = s.person('willH3'), mum = s.person('willH3Mum')
  s.say(her, 'observe', { kind: 'will', recoverers: [mum.id], needed: 1, wait: 'P1D' }, {}, { time: T(1) })
  const d3 = s.say(her, 'observe', { kind: 'device_claim', new_key: NEW1 }, { subject: her.id }, { time: T(2) })
  door('will: a will that states no device wait never lets a device in alone', 'recovery_shown', [her.id, s.held, T(30), null], { expect: { claims: [{ block: d3.hash, ready: null, status: 'pending' }], keys: [] } })
}

// ---- an effective claim brings its key in (identity.md, A will: The key comes in) ----
// The new key signs a block of hers whose first block names the claim as its prev (seq 1), dated at or after the claim is ready. Whether the
// key speaks is read at the block's own `at`: enough listed voices, the wait passed, no cancel before it was ready, not outranked.
{
  const fb = kit.fb
  const byKey = (w, keyName, claimBlock, atTime) => {
    const type = 'observe', state = { kind: 'note', seq: 1, at: atTime, audience: 'public' }, refs = { author: w.her.id, prev: claimBlock.hash }
    return { hash: fb.hash(type, state, refs), type, state, refs, signature: fb.sign({ type, state, refs }, keyOf(keyName).private_key) }
  }
  const speaks = (name, w, b, expect) => door(name, 'signed_by_author', [b, w.s.held, null, null], { expect, exact: true })
  const valid = (name, w, b) => door(name, 'valid', [b, w.s.held, null], { expect: [], exact: true })

  const w = world('willK'), c = claim(w, w.mum, NEW1, 2)
  agree(w, w.bro, c, 3)
  const ready = byKey(w, 'willNewKey1', c, T(9, 10)), early = byKey(w, 'willNewKey1', c, T(9, 9))
  speaks('will: the key of an effective claim (two of three agreed, the wait passed, not cancelled) speaks for a block dated at its ready time', w, ready, true)
  speaks('will: the same key does not speak for a block dated before the claim was ready', w, early, false)
  valid('will: a claim\'s key block is well formed whether or not the key speaks yet: its prev names the claim that brought the key in', w, early)
  w.s.keep(ready)
  speaks('will: the key speaks for a later block of its own chain', w, (() => { const t = 'observe', st = { kind: 'note', seq: 2, at: T(12), audience: 'public' }, rf = { author: w.her.id, prev: ready.hash }; return { hash: fb.hash(t, st, rf), type: t, state: st, refs: rf, signature: fb.sign({ type: t, state: st, refs: rf }, keyOf('willNewKey1').private_key) } })(), true)

  const w2 = world('willK2'), c2 = claim(w2, w2.mum, NEW1, 2)
  speaks('will: one voice of the two needed: the claim is pending and its key speaks for nothing', w2, byKey(w2, 'willNewKey1', c2, T(30)), false)

  const w3 = world('willK3'), c3 = claim(w3, w3.mum, NEW1, 2)
  agree(w3, w3.bro, c3, 3)
  cancel(w3, c3, 5)
  speaks('will: a claim her live key cancelled before it was ready brings no key in', w3, byKey(w3, 'willNewKey1', c3, T(30)), false)

  const w4 = world('willK4'), c4 = claim(w4, w4.mum, NEW1, 2)
  agree(w4, w4.bro, c4, 3)
  cancel(w4, c4, 12)
  speaks('will: a cancel that began after the claim was ready cancels nothing: the key speaks', w4, byKey(w4, 'willNewKey1', c4, T(30)), true)

  const w5 = world('willK5'), low = claim(w5, w5.mum, NEW1, 2), high = claim(w5, w5.key, NEW2, 3)
  agree(w5, w5.bro, low, 3)
  agree(w5, w5.bro, high, 3)
  speaks('will: a claim a higher-ranked recoverer\'s claim for another key outranks brings no key in', w5, byKey(w5, 'willNewKey1', low, T(30)), false)
  speaks('will: the higher-ranked claim\'s key speaks', w5, byKey(w5, 'willNewKey2', high, T(30)), true)

  const w6 = world('willK6'), c6 = claim(w6, w6.thief, NEW1, 2)
  agree(w6, w6.mum, c6, 3)
  agree(w6, w6.bro, c6, 3)
  speaks('will: a claim by one the will does not list brings no key in, however many agree', w6, byKey(w6, 'willNewKey1', c6, T(30)), false)

  const w7 = world('willK7'), d7 = w7.s.say(w7.her, 'observe', { kind: 'device_claim', new_key: NEW1 }, { subject: w7.her.id }, { time: T(2, 10) })
  speaks('will: a device claim\'s key speaks once its device wait has passed', w7, byKey(w7, 'willNewKey1', d7, T(2, 12)), true)
  speaks('will: a device claim\'s key does not speak before its device wait has passed', w7, byKey(w7, 'willNewKey1', d7, T(2, 10)), false)

  const w8 = world('willK8'), c8 = claim(w8, w8.mum, NEW1, 2)
  agree(w8, w8.bro, c8, 3)
  const noAt = byKey(w8, 'willNewKey1', c8, T(30)); delete noAt.state.at
  noAt.hash = fb.hash(noAt.type, noAt.state, noAt.refs); noAt.signature = fb.sign({ type: noAt.type, state: noAt.state, refs: noAt.refs }, keyOf('willNewKey1').private_key)
  speaks('will: a block with no `at` is read at no time: the claim\'s key does not speak for it', w8, noAt, false)
}

vectorsFile.save(V, tags)
