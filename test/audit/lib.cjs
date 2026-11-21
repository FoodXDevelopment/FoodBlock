const fb = require('../../sdk/javascript/src/index.cjs')
const oracle = require('../../spec/oracle/fb.cjs')
let clock = 0
const T = () => new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + (++clock) * 60000).toISOString().replace(/\.\d+Z$/, '.000Z')
class World {
  constructor(name) { (global.__worlds = global.__worlds || []).push(this); this.name = name; this.blocks = []; this.log = []; this.people = {}; this.problems = []; this.byNote = new Map() }
  person(label, kind = 'person') {
    const keys = fb.generateKeypair()
    const g = fb.identity.genesis(keys, { kind, at: T(), audience: 'public' })
    this.add(g, `genesis ${label}`)
    const p = { label, keys, id: g.hash, g }
    this.people[label] = p
    return p
  }
  // a key of `p` on a device she sets up: her key grant brings it in (her first voice's word stands when signed, 3d-18), and what the device
  // signs with it is her word (identity.md, A voice is her, whole). 1.9: a device signs a sensor's readings for its owner this way (end pass 2026-11-20)
  deviceKey(p, label) {
    const keys = fb.generateKeypair()
    this.w(p, 'grant', { kind: 'key', public_key_sign: keys.public_key_sign }, { subject: p.id }, `key grant: ${label} (a key of ${p.label})`)
    return { label, keys, id: p.id, g: p.g }
  }
  add(b, note) {
    const held = this.blocks.slice()
    let r1, r2
    // A world that keeps a schema store (`useSchemas`) is judged with it: a closed block names a schema and carries what it declares.
    const store = this.useSchemas ? held.filter((x) => x.type === 'thing' && x.state.kind === 'schema') : null
    try { r1 = store ? fb.valid(b, held, { schemas: store }) : fb.valid(b, held) } catch (e) { r1 = [{ code: 'THROW', detail: e.message }] }
    try { r2 = oracle.door('valid', b, held, store) } catch (e) { r2 = [{ code: 'THROW', detail: e.message }] }
    const c1 = r1.map(x => x.code).join(','), c2 = r2.map(x => x.code).join(',')
    this.log.push({ note, hash: b.hash.slice(0, 8), type: b.type, sdk: c1 || 'valid', oracle: c2 || 'valid' })
    if (c1 !== c2) this.problems.push(`SDK/oracle disagree on valid for ${note}: sdk=[${c1}] oracle=[${c2}]`)
    this.blocks.push(b)
    if (note) this.byNote.set(note, b)
    return b
  }
  find(note) { const b = this.byNote.get(note); if (!b) throw new Error('no block noted ' + note); return b }
  // write as a person; opts: as (circle), under, etc. refs get author added by write? we pass author via options.
  w(p, type, state, refs = {}, note = '', opts = {}) {
    let b
    try {
      b = fb.write(type, { ...state }, { ...refs }, { author: p.id, key: p.keys, held: this.blocks, at: T(), audience: 'public', ...(this.useSchemas ? { schemas: this.blocks.filter((x) => x.type === 'thing' && x.state.kind === 'schema') } : {}), ...opts })
    } catch (e) {
      this.log.push({ note, type, writeRefused: (e.wrong || [e.message]).join(' | '), refused: (e.refused || []).map(x => x.code).join(',') })
      return { refusedWrite: true, error: e }
    }
    return this.add(b, note)
  }
  // write without the SDK's own check by signing by hand (to test what valid() says of a bad block)
  raw(p, type, state, refs, note = '') {
    const last = fb.identity.nextLinkFor(p.id, p.keys.public_key_sign, this.blocks)
    const full = { type, state: { seq: last.seq, at: T(), audience: [], ...state }, refs: { author: p.id, prev: last.prev, ...refs } }
    full.state.audience = 'public'
    const created = fb.create(full.type, full.state, full.refs)
    const signature = handSign(created, p.keys.private_key)
    const b = { ...created, signature }
    return this.add(b, note)
  }
  report() {
    console.log(`\n##### ${this.name}`)
    for (const l of this.log) console.log(JSON.stringify(l))
    if (this.problems.length) console.log('PROBLEMS', this.problems)
  }
}
// A thing is owned only once its own record shows it is an instance (things.md, Things): the audit's instances name their kind, a kind no world holds.
const kindOf = (word) => require('crypto').createHash('sha256').update('kind: ' + word, 'utf8').digest('hex')
// A block signed by hand over its header, as a careless or hostile device signs it (1.9 3a-3: `sign` refuses what `read` refuses); same as tools/fuzz/lib18.cjs.
const handSign = (block, key) => fb.signMessage(fb.header(block), key).signature
// 1.9 R-C1 (05-deals.md, section 6; 3c-6): a condition has no reader's clock. It is read for a block: what is in that block's causal past counts,
// and a reading's window ends at that block's own `at`. `readFor` writes such a block (not added to any world): `who`'s note at `at`, naming in
// refs.after the heads of every block held whose own `at` is not later (the sensor, its owner's grants and the readings).
const readFor = (blocks, who, at) => {
  const seen = blocks.filter((b) => b.state && typeof b.state.at === 'string' && b.state.at <= at)
  const named = new Set(seen.flatMap((b) => [].concat(b.refs.prev || [], b.refs.after || [])))
  const heads = seen.filter((b) => !named.has(b.hash)).map((b) => b.hash).sort() // refs.after names at most 16 heads
  return fb.write('observe', { kind: 'note', text: 'read for' }, { after: heads }, { author: who.id, key: who.keys, held: blocks, at, audience: 'public' })
}
module.exports = { fb, oracle, World, T, kindOf, handSign, readFor }
