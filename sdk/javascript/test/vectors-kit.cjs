// The helpers the vector makers of FoodBlock 1.7 share (they were the head of make-vectors-1-7.cjs): a story of signed blocks, and
// the cases a maker adds to spec/vectors.json (`door`, `check`, `stage`, `view`, `holds`, `answer`). A maker begins
//   const vectorsFile = require('./vectors-file.cjs'); const { V, tags } = vectorsFile.load(); const kit = require('./vectors-kit.cjs')(V)
// and ends with `vectorsFile.save(V, tags)`. A case it made is replaced by name, never repeated; retire a case by listing its name in
// `kit.retire([...])` before saving, and write its twin under a new name marked "after:".
const crypto = require('crypto')
const assert = require('assert/strict')
const fb = require('../src/index.cjs')
const { call } = require('../src/core.cjs')
const { genesis } = fb.identity

module.exports = function kit(V) {
  const fs = require('fs')
  const path = require('path')
  const crypto = require('crypto')
  const assert = require('assert/strict')
  const fb = require('../src/index.cjs')
  const { call } = require('../src/core.cjs')
  const { genesis } = fb.identity

  const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
  const keys = {}
  const keyOf = (name) => {
    if (keys[name]) return keys[name]
    const kp = fb.keypairFromSeed(sha(`foodblock 1.7 vectors: ${name}`), 'std')
    keys[name] = { private_key: kp.private_key, public_key_sign: kp.public_key_sign }
    return keys[name]
  }
  let tick = 0
  const at = () => new Date(Date.UTC(2026, 9, 27, 12, 0, 0) + 1000 * tick++).toISOString()
  const DAY = '2026-12-20T00:00:00.000Z', LATER = '2027-12-31T00:00:00.000Z'
  const BEFORE = '2027-06-01T00:00:00.000Z', AFTER = '2028-01-02T00:00:00.000Z'
  const M = (minor, currency = 'GBP') => fb.money(minor, currency)

  function story() {
    const held = []
    const keep = (block) => { held.push(block); return block }
    const person = (name, { kind = 'person' } = {}) => {
      const g = keep(genesis(keyOf(name), { kind, at: at(), audience: 'public' }))
      return { name, id: g.hash, g }
    }
    const say = (who, type, state, refs = {}, { after, audience = 'public', time } = {}) => {
      refs = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)].sort() : v]))
      const when = time || at()
      // a sealed block's nonce and salts are fixed from its author and time, so the file is the same on every run
      const sealed = audience === 'public' ? {} : {
        nonce: sha(`nonce ${who.name} ${when}`).slice(0, 32),
        salts: Object.fromEntries(audience.map((r) => [r, sha(`salt ${who.name} ${when} ${r}`).slice(0, 32)]))
      }
      return keep(fb.write(type, state, refs, { author: who.id, key: keyOf(who.name), held, at: when, audience, after, ...sealed }))
    }
    // a block the writer would refuse, chained and signed by hand: a node never holds one, but a fold given one must still agree with the oracle
    const raw = (who, type, state, refs = {}, { after } = {}) => {
      const mine = held.filter((b) => b.refs && b.refs.author === who.id)
      const last = mine.reduce((m, b) => (!m || b.state.seq > m.state.seq ? b : m), null)
      refs = { ...refs, author: who.id, prev: last ? last.hash : who.id, ...(after ? { after } : {}) }
      refs = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)].sort() : v]))
      state = { ...state, at: at(), audience: 'public', seq: last ? last.state.seq + 1 : 1 }
      return keep({ hash: fb.hash(type, state, refs), type, state, refs, signature: fb.sign({ type, state, refs }, keyOf(who.name).private_key) })
    }
    return { held, person, say, keep, raw }
  }

  const made = new Set()
  const subset = (a, b) => (Array.isArray(b) && Array.isArray(a) && a.length === b.length ? b.every((v, i) => subset(a[i], v)) : (b && typeof b === 'object' && !Array.isArray(b)) ? b !== null && Object.entries(b).every(([k, v]) => subset(a && a[k], v)) : (assert.deepEqual(a, b), true))
  function door(name, op, args, { expect, exact, invariants } = {}) {
    args = JSON.parse(JSON.stringify(args))
    const got = call(op, ...args)
    if (expect !== undefined) { try { exact ? assert.deepEqual(got, expect) : subset(got, expect) } catch (e) { if (process.env.COLLECT) { console.log('FLIP\t' + name + '\t' + e.message.replace(/\n/g, ' ').slice(0, 300) + '\t' + JSON.stringify(got).slice(0, 300)); return got } throw new Error(`${name}: ${e.message}\n got ${JSON.stringify(got).slice(0, 600)}`) } }
    made.add(name)
    V.door = V.door.filter((c) => c.name !== name)
    V.door.push({ name, op, args, expect: expect !== undefined ? expect : got, ...(exact ? { exact: true } : {}), ...(invariants ? { invariants } : {}) })
    return got
  }
  const codesOf = (list) => [...new Set(list.map((one) => one.code))]
  // A check case: the refusals the bytes of a block give, with the blocks held (most need none).
  const AUTH = '1'.repeat(64)
  function check(name, block, codes, held = [], { invariants } = {}) {
    const author = (block.refs && block.refs.author) || AUTH
    block = { type: block.type, state: { seq: 1, at: '2026-10-27T12:00:00.000Z', audience: 'public', ...block.state }, refs: { prev: author, ...block.refs, author } }
    const got = call('refusals', block.type, block.state, block.refs, held, null)
    if (process.env.COLLECT && JSON.stringify(codesOf(got)) !== JSON.stringify(codes)) console.log('FLIP\t' + name + '\tcodes ' + JSON.stringify(codes) + '\t' + JSON.stringify(codesOf(got)))
    else assert.deepEqual(codesOf(got), codes, `${name}: ${JSON.stringify(got)}`)
    made.add(name)
    V.door = V.door.filter((c) => c.name !== name)
    V.door.push({ name, op: 'refusals', args: JSON.parse(JSON.stringify([block.type, block.state, block.refs, held, null])), codes, ...(invariants ? { invariants } : {}) })
  }
  const stage = (name, first, held, expect) => door(name, 'promise_stage', [first, held, {}], { expect })
  const view = (name, first, held, now, expect) => door(name, 'promise_view', [first, held, { now }], { expect })
  const holds = (name, condition, held, now, expect) => door(name, 'condition_holds', [condition, held, now], { expect, exact: true })
  const answer = (s, who, offer, state, extra = {}) => s.say(who, 'promise', state, { answers: offer.hash, for: offer.hash, after: [offer.hash], ...extra })
  const retire = (names) => {
    const gone = new Set(names)
    V.door = V.door.filter((c) => !gone.has(c.name))
    V.folds.promises = V.folds.promises.filter((c) => !gone.has(c.name))
    V.identities = V.identities.filter((c) => !gone.has(c.name))
    V.refusals.cases = V.refusals.cases.filter((c) => !gone.has(c.name))
  }
  return { fb, call, genesis, keyOf, at, sha, story, door, check, stage, view, holds, answer, codesOf, made, M, retire, DAY, LATER, BEFORE, AFTER, AUTH }
}
