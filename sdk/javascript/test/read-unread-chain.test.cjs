'use strict'
// A stranger's push of many blocks, each naming for its meaning one that is not read, is judged in time that grows with its size, never
// faster (end pass 2026-11-20: a reading of check 7 that built a fresh index for each such block took cubic time: 100 blocks ran past ten
// minutes; a measure run spun for thirteen hours). Each block is read once against what is held.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const O = require('../../../spec/oracle/fb.cjs')
const { call } = require('../src/core.cjs')

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
function chain(n) {
  const k = O.keypair(sha('a stranger who pushes a long chain'), 'std')
  const gb = { type: 'actor', state: { kind: 'person', public_key_sign: k.public_key_sign, at: '2026-10-01T00:00:00.000Z', audience: 'public' }, refs: {} }
  const G = { hash: O.hashOfBlock(gb, 'std'), ...gb, signature: O.signBlock(gb, k.private_key, 'std') }
  const held = [G]
  let prev = G.hash, last = null
  for (let i = 1; i <= n; i++) {
    // the first is valid and not read (its `at` is no time); each later one answers the one before, so it names a block not read
    const state = { kind: 'note', at: i === 1 ? 'not a time' : '2026-10-02T00:00:00.000Z', audience: 'public', seq: i }
    const body = { type: 'observe', state, refs: { author: G.hash, prev, ...(last ? { answers: last.hash } : {}) } }
    last = { hash: O.hashOfBlock(body, 'std'), ...body, signature: O.signBlock(body, k.private_key, 'std') }
    held.push(last)
    prev = last.hash
  }
  return { held, last }
}

test('a chain of 800 blocks that each name one not read is read in seconds, and none of them is read', () => {
  const { held, last } = chain(800)
  const t = Date.now()
  const codes = call('read', last, held).map((r) => r.code)
  assert.deepEqual(codes, ['names_unread'])
  assert.ok(Date.now() - t < 10000, `read took ${Date.now() - t} ms`)
})
