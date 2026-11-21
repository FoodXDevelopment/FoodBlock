// One-off tool for 1.8 stage 0, run after 00-clear-the-ground.resign.cjs: the answers whose keys the stage renames, and the case names that
// named a deleted field. scope_reading answers `types` (was `acts`); use_shown answers `uses` and `overlap_uses: [{ with, use }]`
// (were `acts` and `overlap_acts: [{ with, act }]`). Every case it changes is printed.   node changes-1.8/00-clear-the-ground.answers.cjs <file.json>
const fs = require('fs')
const FILE = process.argv[2]
const V = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const NAMES = [
  ['sealed limit: the other fields are still checked under a sealed parent (acts)', 'sealed limit: the other fields are still checked under a sealed parent (types)'],
  ['checks: scope.acts is a list of acts', 'checks: scope.types is a list of types'],
  ['acts pull, until and notice', 'types pull, until and notice'],
  ['release: an act under a grant that states no scope.acts speaks for its author alone: under_ok is false (before: a grant with no acts covered everything)', 'release: a block under a grant that states no scope.types speaks for its author alone: under_ok is false (before: a grant with no types covered everything)'],
  ['a child grant that lists acts under a parent that lists none is wider_than_parent (acts left out name none;', 'a child grant that lists types under a parent that lists none is wider_than_parent (types left out name none;'],
  ['a child that lists no acts under a parent that lists none', 'a child that lists no types under a parent that lists none'],
  ['a child that lists acts the parent lists', 'a child that lists types the parent lists'],
  ['scope_reading: acts and parties are the lists as signed', 'scope_reading: types and parties are the lists as signed'],
  ['scope_reading: acts that is not a list is junk', 'scope_reading: types that is not a list is junk'],
  ['scope_reading: acts that holds anything but text is junk', 'scope_reading: types that holds anything but text is junk'],
  ['a water draw since 2014: acts, span and seasons', 'a water draw since 2014: uses, span and seasons'],
  ['different acts over the same bound', 'different uses over the same bound'],
  ['a place use names its act and an optional layer; the overlap lists both uses and says same act or different act', 'a place use names what was done and an optional layer; the overlap lists both uses and says same use or different use'],
  ['two draws of water over one bound are the same act', 'two draws of water over one bound are the same use']
]
const renameKey = (o, from, to) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === from ? to : k, v]))
const changed = []
for (const c of V.door) {
  // a scope given bare to scope_reading says types too
  if (c.op === 'scope_reading') c.args = c.args.map((a) => (a && typeof a === 'object' && !Array.isArray(a) && 'acts' in a ? renameKey(a, 'acts', 'types') : a))
  const before = JSON.stringify(c.expect)
  if (c.op === 'scope_reading' && c.expect && typeof c.expect === 'object') {
    c.expect = renameKey(c.expect, 'acts', 'types')
    if (Array.isArray(c.expect.junk)) c.expect.junk = c.expect.junk.map((j) => (j === 'acts' ? 'types' : j)).sort()
  }
  if (c.op === 'use_shown' && c.expect && Array.isArray(c.expect.users)) {
    c.expect.users = c.expect.users.map((u) => {
      let n = renameKey(u, 'acts', 'uses')
      if (Array.isArray(n.overlap_acts)) n.overlap_acts = n.overlap_acts.map((o) => renameKey(o, 'act', 'use'))
      return renameKey(n, 'overlap_acts', 'overlap_uses')
    })
  }
  if (JSON.stringify(c.expect) !== before) changed.push(`${c.op}: ${c.name}`)
  // invariant 32 was two rules: the owner's three reasons are now 37 (folds.md); 32 is what a block gives (promises.md)
  if ((c.op === 'ownership' || c.name.startsWith('voucher: passed on as a claim')) && Array.isArray(c.invariants) && c.invariants.includes(32)) { c.invariants = c.invariants.map((n) => (n === 32 ? 37 : n)); changed.push(`invariant 32 -> 37: ${c.name}`) }
  for (const [a, b] of NAMES) if (c.name.includes(a)) { changed.push(`name: ${c.name}`); c.name = c.name.replace(a, b) }
}
// a sealed copy whose block was re-signed is sealed again with the same fixed randomness its maker used (fixedFor in make-vectors.cjs)
const crypto = require('crypto')
const fb = require('../sdk/javascript/src/index.cjs')
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex')
const fixedFor = (label, count) => ({ vectorsOnly: true, ephemeral: sha(`${label} ephemeral`), contentKey: sha(`${label} content key`), nonce: sha(`${label} nonce`).slice(0, 24), keyNonces: Array.from({ length: count }, (_, i) => sha(`${label} key nonce ${i}`).slice(0, 24)) })
const LABELS = { 'the limit observe for a grant is sealed to the agent alone': 'opal fence' }
for (const c of V.sealed.cases) {
  let opened = null
  try { opened = fb.openCopy(c.message, V.keys[c.recipient].x25519_private) } catch (e) { /* its header now names the new id: sealed again below */ }
  if (opened && opened.hash === c.opens_to.hash) continue
  const entry = V.sealed.blocks.find((b) => b.hash === c.opens_to.hash)
  if (!entry || !LABELS[c.name]) { changed.push(`sealed: ${c.name}: NOT RESEALED`); continue }
  const block = { hash: entry.hash, ...entry.block, signature: entry.signature }
  c.message = fb.sealCopy(block, { keys: [V.keys[c.recipient].public_key_encrypt], reveals: c.opens_to.reveals, fixed: fixedFor(LABELS[c.name], 1) })
  c.opens_to.signature = entry.signature
  changed.push(`sealed: ${c.name}: sealed again`)
}
// a header whose block was re-signed is signed again by its signer
for (const h of V.headers || []) {
  if (fb.verifyMessage({ ...h.header, signature: h.header_signature }, V.keys[h.signer].public_key_sign)) continue
  h.header_signature = fb.signMessage(h.header, V.keys[h.signer].private_key).signature
  changed.push(`header: ${h.name}: signed again`)
}
// the base schemas' own cases read the new published chain
const PUB = require('../spec/schemas/published.json')
for (const c of V.door) {
  if (c.op !== 'hash' || !/^base schema /.test(c.name)) continue
  const name = c.name.replace(/^base schema (\w+):.*$/, '$1'), b = PUB.schemas[name]
  if (b && (c.expect !== b.hash || JSON.stringify(c.args) !== JSON.stringify([b.type, b.state, b.refs]))) { c.args = [b.type, b.state, b.refs]; c.expect = b.hash; changed.push(`base schema case reads the new chain: ${c.name}`) }
}
// a hash case states the canonical bytes, and a signature case the signature, of a block that was re-signed
for (const v of V.hashes || []) {
  const text = fb.canonical(v.block.type, v.block.state, v.block.refs)
  if (v.canonical && v.canonical !== text) { v.canonical = text; changed.push(`hashes: canonical bytes of ${v.name}`) }
}
const stories = new Map()
const gather = (x) => { if (Array.isArray(x)) return x.forEach(gather); if (!x || typeof x !== 'object') return; if (x.block && typeof x.hash === 'string' && typeof x.signature === 'string') stories.set(x.hash, x); Object.values(x).forEach(gather) }
gather(V)
for (const v of V.signatures || []) {
  const b = stories.get(v.hash)
  if (b && v.signature !== b.signature && fb.verify({ hash: b.hash, ...b.block, signature: b.signature }, b.signature, V.keys[v.signer].public_key_sign)) { v.signature = b.signature; changed.push(`signatures: ${v.name}`) }
}
// an answer that lists ids sorted lists the new ids sorted: the same answer, in the new order
const { call } = require('../sdk/javascript/src/core.cjs')
const subset = (a, b) => (Array.isArray(b) ? Array.isArray(a) && a.length === b.length && b.every((v, i) => subset(a[i], v)) : b && typeof b === 'object' ? !!a && typeof a === 'object' && Object.entries(b).every(([k, v]) => subset(a[k], v)) : a === b)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const reorder = (want, got) => {
  if (Array.isArray(want) && Array.isArray(got) && want.length === got.length) {
    const left = [...want], out = []
    for (const g of got) { const i = left.findIndex((w) => subset(g, w)); if (i < 0) return want.map((w, i) => reorder(w, got[i])); out.push(reorder(left.splice(i, 1)[0], g)) }
    return out
  }
  if (want && typeof want === 'object' && !Array.isArray(want) && got && typeof got === 'object') return Object.fromEntries(Object.entries(want).map(([k, v]) => [k, reorder(v, got[k])]))
  return want
}
for (const c of V.door) {
  if (c.expect === undefined || c.oracle === false) continue
  let got; try { got = call(c.op, ...c.args) } catch (e) { continue }
  const ok = (w) => (c.exact ? same(got, w) : subset(got, w))
  if (ok(c.expect)) continue
  const r = reorder(c.expect, got)
  if (ok(r)) { c.expect = r; changed.push(`order of ids: ${c.name}`) }
}
fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
console.log(changed.length + ' changed'); for (const x of changed) console.log('  ' + x)
