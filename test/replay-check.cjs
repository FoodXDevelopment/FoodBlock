'use strict'
// tools/replay-check.cjs: counts and reason codes over stored blocks, and nothing else.
const assert = require('assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const fb = require('../sdk/javascript/src/index.cjs')
const { replay } = require('../tools/replay-check.cjs')

const keys = fb.keypairFromSeed('a1'.repeat(32), 'std')
const at = (n) => new Date(Date.UTC(2026, 9, 19, 12, 0, n)).toISOString()
const g = fb.identity.genesis(keys, { kind: 'person', at: at(0), audience: 'public' })
const held = [g]
const w1 = fb.write('observe', { kind: 'note' }, {}, { author: g.hash, key: keys, held, at: at(1), audience: 'public' }); held.push(w1)
const w2 = fb.write('observe', { kind: 'note' }, {}, { author: g.hash, key: keys, held, at: at(2), audience: 'public' }); held.push(w2)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-replay-'))
const msg = (b) => ({ version: '1.7', block: { type: b.type, state: b.state, refs: b.refs }, signature: b.signature })
// two as messages, the genesis as a signed block; one tampered (its state changed after signing); one line that is not JSON
const tampered = msg(w2); tampered.block = { ...tampered.block, state: { ...tampered.block.state, kind: 'note-changed' } }
const lines = [JSON.stringify(g), JSON.stringify(msg(w1)), JSON.stringify(tampered), 'not json {', JSON.stringify({ version: '1.7', header: {}, header_signature: 'ab' })]
fs.writeFileSync(path.join(dir, 'a.jsonl'), lines.join('\n') + '\n')

const r = replay(dir)
assert.equal(r.blocks, 3)
assert.equal(r.valid, 2, JSON.stringify(r))
assert.equal(r.failed, 1)
assert.equal(r.unreadable_lines, 1)
assert.equal(r.sealed_headers_not_judged, 1)
assert.ok(Object.keys(r.reason_codes).length >= 1, 'a reason code for the tampered block')
// it reports counts and codes only: no id, key or content appears anywhere in the result
const text = JSON.stringify(r)
for (const secret of [g.hash, w1.hash, keys.public_key_sign, 'note-changed']) assert.ok(!text.includes(secret), 'the result holds no block content')
assert.deepEqual(replay(path.join(dir, 'missing')), { error: 'not found' })
fs.rmSync(dir, { recursive: true, force: true })
console.log('replay-check: counts and reason codes, no content: ok')
