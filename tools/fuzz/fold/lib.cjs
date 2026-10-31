'use strict'
const crypto = require('crypto')
const fb = require('../../../sdk/javascript/src/index.cjs')
const { call } = require('../../../sdk/javascript/src/core.cjs')
const oracle = require('../../../spec/oracle/fb.cjs')
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex')
const keyCache = {}
const keyOf = (name) => keyCache[name] || (keyCache[name] = (() => { const kp = fb.keypairFromSeed(sha('fuzz17b:' + name), 'std'); return { private_key: kp.private_key, public_key_sign: kp.public_key_sign } })())
const jclone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x))
const sortKeys = (x) => Array.isArray(x) ? x.map(sortKeys) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => [k, sortKeys(x[k])])) : x
const canon = (x) => JSON.stringify(sortKeys(x === undefined ? null : x))
// replace "@n" / "@n#role" placeholders (deep) by the hash of step n
const resolve = (x, map) => {
  if (typeof x === 'string') { const m = /^@(\d+)(#.*)?$/.exec(x); if (m) { const h = map[+m[1]]; return h === undefined ? undefined : h + (m[2] || '') } return x }
  if (Array.isArray(x)) return x.map(v => resolve(v, map))
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = resolve(x[k], map); return o }
  return x
}
const mentions = (x, out = new Set()) => {
  if (typeof x === 'string') { const m = /^@(\d+)(#.*)?$/.exec(x); if (m) out.add(+m[1]) }
  else if (Array.isArray(x)) x.forEach(v => mentions(v, out))
  else if (x && typeof x === 'object') Object.values(x).forEach(v => mentions(v, out))
  return out
}
// A world is a recipe: steps = [{ who, genesis?:kind, type, state, refs, after:[ix], at }]. Replaying signs every block fresh.
class World {
  constructor() { this.steps = []; this.held = []; this.map = []; this.ids = {}; this.blocks = []; this.refused = []; this.stats = {} }
  // spec: { who, type, state, refs, after, at } ; or { who, genesis: kind, at }. Returns step index or -1.
  step(spec) {
    const ix = this.steps.length
    const hash = this._make(spec, ix)
    if (hash === null) return -1
    this.steps.push(spec)
    return ix
  }
  _make(spec, ix) {
    const map = this.map
    try {
      let b
      if (spec.genesis) { b = fb.identity.genesis(keyOf(spec.who), { kind: spec.genesis, at: spec.at, audience: 'public' }); this.ids[spec.who] = b.hash }
      else {
        const author = this.ids[spec.who]; if (!author) return null
        const refs = resolve(spec.refs || {}, map)
        for (const k of Object.keys(refs)) if (refs[k] === undefined) return null
        for (const k of Object.keys(refs)) if (Array.isArray(refs[k])) refs[k] = [...new Set(refs[k])].sort()
        const state = resolve(spec.state || {}, map)
        const after = (spec.after || []).map(i => map[i]).filter(h => h !== undefined)
        b = fb.write(spec.type, state, refs, { author, key: keyOf(spec.who), held: this.held, at: spec.at, audience: 'public', after })
      }
      this.held.push(b); this.map[ix] = b.hash; this.blocks[ix] = b
      return b.hash
    } catch (e) {
      this.lastError = e.wrong || e.message
      const key = spec.type + (spec.state && spec.state.kind ? '.' + spec.state.kind : '') + ': ' + String((e.refused && e.refused.map(r => r.code).join(',')) || e.message).slice(0, 60)
      this.stats[key] = (this.stats[key] || 0) + 1
      if (e.refused && !spec.genesis) { try { this.refused.push({ block: rawBlock(this, spec), held: this.held.length }) } catch (e2) { } }
      return null
    }
  }
}
function rawBlock(w, spec) {
  const author = w.ids[spec.who]
  const refs = resolve(spec.refs || {}, w.map)
  for (const k of Object.keys(refs)) if (Array.isArray(refs[k])) refs[k] = [...new Set(refs[k])].sort()
  const after = (spec.after || []).map(i => w.map[i]).filter(h => h !== undefined)
  const link = fb.identity.nextLinkFor(author, keyOf(spec.who).public_key_sign, w.held)
  const full = { type: spec.type, state: { ...resolve(spec.state || {}, w.map), seq: link.seq, at: spec.at, audience: 'public' }, refs: { ...refs, author, prev: link.prev, ...(after.length ? { after: [...new Set(after)].sort() } : {}) } }
  const created = fb.create(full.type, full.state, full.refs)
  return { ...created, signature: fb.sign(created, keyOf(spec.who).private_key) }
}
// replay a recipe: drops steps that fail or whose refs mention a dropped step; returns { w, newIx: oldIx -> newIx }
function replay(steps) {
  const w = new World(); const idx = new Map()
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const need = new Set(); mentions(s.refs, need); mentions(s.state, need)
    let ok = true
    for (const n of need) if (!idx.has(n)) ok = false
    if (!ok) continue
    const remap = (x) => x
    const spec = remapSpec(s, idx)
    const ni = w.step(spec)
    if (ni >= 0) idx.set(i, ni)
  }
  return { w, idx }
}
const remapStr = (x, idx) => {
  if (typeof x === 'string') { const m = /^@(\d+)(#.*)?$/.exec(x); if (m) return '@' + idx.get(+m[1]) + (m[2] || ''); return x }
  if (Array.isArray(x)) return x.map(v => remapStr(v, idx))
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = remapStr(x[k], idx); return o }
  return x
}
const remapSpec = (s, idx) => ({ ...s, refs: remapStr(s.refs || {}, idx), state: remapStr(s.state || {}, idx), after: (s.after || []).filter(i => idx.has(i)).map(i => idx.get(i)) })
const full = (b) => b
const callCore = (op, ...args) => { try { return { ok: jclone(call(op, ...jclone(args))) } } catch (e) { return { err: String(e.message).slice(0, 120) } } }
const callOracle = (op, ...args) => { try { return { ok: jclone(oracle.door(op, ...jclone(args))) } } catch (e) { return { err: 'THROW ' + String(e.message).slice(0, 120) } } }
module.exports = { fb, call, oracle, keyOf, World, replay, resolve, mentions, remapSpec, canon, sortKeys, jclone, callCore, callOracle }
