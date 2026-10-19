// Adds to spec/vectors.json the cases of Phase 2 of the 1.6 refinement (CHANGELOG.md): `node test/make-vectors-phase2.cjs`.
// Idempotent: a case it made is replaced by name, never repeated. Every expectation is worked out here by hand (the Merkle
// roots by a third, plain implementation in this file) and checked against the Rust core before the file is written; the
// oracle (spec/oracle) then checks the file against an implementation written from the spec text alone. Run it after
// `node scripts/build-wasm.cjs`.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const { call } = require('../src/core.cjs')

const FILE = path.join(__dirname, '../../../spec/vectors.json')
const V = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const made = new Set()
const subset = (a, b) => (Array.isArray(b) && Array.isArray(a) && a.length === b.length ? b.every((v, i) => subset(a[i], v)) : (b && typeof b === 'object' && !Array.isArray(b)) ? b !== null && Object.entries(b).every(([k, v]) => subset(a && a[k], v)) : (assert.deepEqual(a, b), true))
// A door case: the op, its arguments, and what it must give (a subset match unless `exact`).
function door(name, op, args, { expect, exact, error } = {}) {
  args = JSON.parse(JSON.stringify(args))
  if (error) {
    assert.throws(() => call(op, ...args), (e) => (!error.kind || e.kind === error.kind), name)
    made.add(name); V.door = V.door.filter((c) => c.name !== name); V.door.push({ name, op, args, error }); return
  }
  const got = call(op, ...args)
  if (expect !== undefined) { try { exact ? assert.deepEqual(got, expect) : subset(got, expect) } catch (e) { throw new Error(`${name}: ${e.message}\n got ${JSON.stringify(got).slice(0, 600)}`) } }
  made.add(name)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op, args, expect: expect !== undefined ? expect : got, ...(exact ? { exact: true } : {}) })
  return got
}

// ---- the Merkle root (encoding.md, Large content) ----
// A third implementation, plain, to settle the expectations: level by level, an odd one carried up, as the spec states.
const h = (...parts) => crypto.createHash('sha256').update(Buffer.concat(parts)).digest()
const leaf = (hex) => h(Buffer.from([0]), Buffer.from(hex, 'hex'))
const levelsOf = (chunks) => { let level = chunks.map(leaf); const all = [level]; while (level.length > 1) { const next = []; for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? h(Buffer.from([1]), level[i], level[i + 1]) : level[i]); level = next; all.push(level) } return all }
const rootOf = (chunks) => { const l = levelsOf(chunks); return l[l.length - 1][0].toString('hex') }
const proofOf = (chunks, index) => { const out = []; let at = index; for (const level of levelsOf(chunks)) { if (level.length === 1) break; if (at % 2) out.push(level[at - 1].toString('hex')); else if (at + 1 < level.length) out.push(level[at + 1].toString('hex')); at = Math.floor(at / 2) } return out }
const chunk = (i) => Buffer.from(`chunk ${i}`, 'utf8').toString('hex')
const sets = { 1: [chunk(0)], 2: [0, 1].map(chunk), 3: [0, 1, 2].map(chunk), 5: [0, 1, 2, 3, 4].map(chunk), 7: [0, 1, 2, 3, 4, 5, 6].map(chunk) }
// The single-chunk root is the leaf hash; the empty chunk is a chunk.
door('merkle: one chunk is its own leaf, hash of 00 then the chunk', 'merkle_root', [sets[1]], { expect: leaf(sets[1][0]).toString('hex'), exact: true })
door('merkle: an empty chunk is a chunk (hash of the byte 00)', 'merkle_root', [['']], { expect: crypto.createHash('sha256').update(Buffer.from([0])).digest('hex'), exact: true })
for (const n of [2, 3, 5, 7]) door(`merkle: the root of ${n} chunks (an odd one is carried up unchanged)`, 'merkle_root', [sets[n]], { expect: rootOf(sets[n]), exact: true })
// A proof is the siblings from the leaf up; a carried level adds nothing.
for (const [n, i] of [[2, 1], [3, 2], [3, 0], [5, 4], [5, 2], [7, 6], [7, 3]]) {
  const root = rootOf(sets[n]), proof = proofOf(sets[n], i)
  door(`merkle: the proof of chunk ${i} of ${n}`, 'merkle_proof', [sets[n], i], { expect: proof, exact: true })
  door(`merkle: chunk ${i} of ${n} verifies under its root`, 'merkle_verify', [root, sets[n][i], i, n, proof], { expect: true, exact: true })
}
{
  const root = rootOf(sets[5]), proof = proofOf(sets[5], 4)
  door('merkle: the carried chunk 4 of 5 has a one-hash proof', 'merkle_proof', [sets[5], 4], { expect: proof, exact: true }); assert.equal(proof.length, 1)
  const good = proofOf(sets[5], 1)
  door('merkle: a proof for another chunk does not verify', 'merkle_verify', [root, sets[5][2], 2, 5, good], { expect: false, exact: true })
  door('merkle: a changed chunk does not verify', 'merkle_verify', [root, chunk(99), 1, 5, good], { expect: false, exact: true })
  door('merkle: the wrong index does not verify', 'merkle_verify', [root, sets[5][1], 0, 5, good], { expect: false, exact: true })
  // The root does not commit the count (the count is stated beside the root, signed in the same block), but the count fixes the shape of the path:
  door('merkle: the carried chunk 4 of 5 does not verify as chunk 4 of 6, where it has a sibling', 'merkle_verify', [root, sets[5][4], 4, 6, proof], { expect: false, exact: true })
  door('merkle: a proof with a hash too many does not verify', 'merkle_verify', [root, sets[5][1], 1, 5, [...good, good[0]]], { expect: false, exact: true })
  door('merkle: a proof with a hash too few does not verify', 'merkle_verify', [root, sets[5][1], 1, 5, good.slice(0, -1)], { expect: false, exact: true })
  door('merkle: a proof hash in capitals is refused', 'merkle_verify', [root, sets[5][1], 1, 5, [good[0].toUpperCase(), ...good.slice(1)]], { expect: false, exact: true })
  door('merkle: an index past the count does not verify', 'merkle_verify', [root, sets[5][1], 5, 5, good], { expect: false, exact: true })
  // The convention matters: a node is not a leaf, so a chunk that spells two hashes cannot stand in for their node.
  const l0 = leaf(sets[2][0]), l1 = leaf(sets[2][1])
  const forged = Buffer.concat([l0, l1]).toString('hex')
  door('merkle: two leaf hashes written as one chunk do not reproduce the node above them', 'merkle_root', [[forged]], { expect: leaf(forged).toString('hex'), exact: true })
  assert.notEqual(leaf(forged).toString('hex'), rootOf(sets[2]))
  door('merkle: no chunks, no root', 'merkle_root', [[]], { error: { kind: 'argument' } })
  door('merkle: no such chunk, no proof', 'merkle_proof', [sets[2], 2], { error: { kind: 'argument' } })
}

// ---- write ----
fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
console.log(`${made.size} cases written to ${path.relative(process.cwd(), FILE)}`)
