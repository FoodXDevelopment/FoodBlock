// Builds long, valid worlds fast (no per-block checking) for the performance tests: `node test/perf.cjs`.
const fb = require('../sdk/javascript/src/index.cjs')
let clock = 0
const T = () => new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + (++clock) * 1000).toISOString().replace(/\.\d+Z$/, '.000Z')
class Maker {
  constructor() { this.blocks = []; this.people = {} }
  person(label, kind = 'person') {
    const keys = fb.generateKeypair()
    const g = fb.identity.genesis(keys, { kind, at: T() })
    this.blocks.push(g)
    this.people[label] = { id: g.hash, keys, seq: 0, prev: g.hash }
    return this.people[label]
  }
  // sign a block as p: seq and prev follow p's own chain
  w(p, type, state, refs = {}) {
    p.seq += 1
    const created = fb.create(type, { seq: p.seq, at: T(), audience: 'public', ...state }, { author: p.id, prev: p.prev, ...refs })
    const b = { ...created, signature: fb.sign(created, p.keys.private_key) }
    p.prev = b.hash
    this.blocks.push(b)
    return b
  }
}
module.exports = { fb, Maker, T }
