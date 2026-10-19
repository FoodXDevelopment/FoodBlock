const fb = require('../../sdk/javascript/src/index.cjs')
const oracle = require('../../spec/oracle/fb.cjs')
let clock = 0
const T = () => new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + (++clock) * 60000).toISOString().replace(/\.\d+Z$/, '.000Z')
class World {
  constructor(name) { (global.__worlds = global.__worlds || []).push(this); this.name = name; this.blocks = []; this.log = []; this.people = {}; this.problems = []; this.byNote = new Map() }
  person(label, kind = 'person') {
    const keys = fb.generateKeypair()
    const g = fb.identity.genesis(keys, { kind, at: T() })
    this.add(g, `genesis ${label}`)
    const p = { label, keys, id: g.hash, g }
    this.people[label] = p
    return p
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
      b = fb.write(type, { ...state }, { ...refs }, { author: p.id, key: p.keys, held: this.blocks, at: T(), ...(this.useSchemas ? { schemas: this.blocks.filter((x) => x.type === 'thing' && x.state.kind === 'schema') } : {}), ...opts })
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
    const signature = fb.sign(created, p.keys.private_key)
    const b = { ...created, signature }
    return this.add(b, note)
  }
  report() {
    console.log(`\n##### ${this.name}`)
    for (const l of this.log) console.log(JSON.stringify(l))
    if (this.problems.length) console.log('PROBLEMS', this.problems)
  }
}
module.exports = { fb, oracle, World, T }
