const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { sourceHash, recorded, sha, build } = require('../scripts/build-wasm.cjs')
const core = require('../src/core.cjs')

const wasm = path.join(__dirname, '../core/foodblock.wasm')

test('the shipped core is the one the Rust source builds to', () => {
  const built = recorded()
  assert.equal(sha(fs.readFileSync(wasm)), built.wasm, 'core/foodblock.wasm is the file BUILD.json records')
  if (!fs.existsSync(path.join(__dirname, '../../rust/Cargo.toml'))) return // a package install carries no Rust source
  assert.equal(sourceHash(), built.source, 'sdk/rust changed since core/foodblock.wasm was built: node scripts/build-wasm.cjs')
})

test('a fresh build of the Rust source gives the same bytes', { skip: !process.env.FOODBLOCK_REBUILD && 'set FOODBLOCK_REBUILD=1 (needs cargo and the wasm32-unknown-unknown target)' }, () => {
  const before = fs.readFileSync(wasm)
  assert.ok(build().equals(before), 'the build is reproducible')
})

test('the core loads from bytes with no Node module, as a browser loads it', async () => {
  const { execFileSync } = require('child_process')
  const script = `
    Object.defineProperty(process, 'versions', { value: {} })   // look like a browser: no process.versions.node
    const core = require(${JSON.stringify(path.join(__dirname, '../src/core.cjs'))})
    const bytes = require('fs').readFileSync(${JSON.stringify(wasm)})
    try { core.call('version') } catch (error) { if (!/not loaded/.test(error.message)) throw error }
    core.init(bytes).then(() => console.log(core.call('hash', 'thing', { kind: 'eggs' }, {})))`
  const out = execFileSync(process.execPath, ['-e', script]).toString().trim()
  assert.equal(out, require('../src/block.cjs').hash('thing', { kind: 'eggs' }, {}))
})

test('the door says what went wrong as an error with the core\'s refusals', () => {
  assert.throws(() => core.call('no_such_op'), /not in this build/)
  assert.throws(() => core.call('hash', 5), /argument 0 is text/)
  const fb = require('../src/index.cjs'), keys = fb.generateKeypair()
  const me = fb.identity.genesis(keys, { recoveryKey: fb.generateKeypair().public_key_sign, reach: 'P30D' })
  assert.throws(() => fb.write('thing', { kind: 'eggs', price: 1.5 }, {}, { author: me.hash, key: keys, held: [me] }),
    (error) => /^write: refused: /.test(error.message) && error.refused.some((one) => one.code === 'float') && error.wrong.length === error.refused.length)
})

test('large content: the root, a proof, and the reader\'s check of the block that signs the count', () => {
  const fb = require('../src/index.cjs')
  const chunks = ['00', '11', '22', '33', '44'].map((x) => x.repeat(8))
  const root = fb.merkle.root(chunks)
  const block = { type: 'thing', state: { kind: 'stream', marks: [{ scheme: 'merkle', value: root }], chunks: chunks.length }, refs: {} }
  const proof = fb.merkle.proof(chunks, 4)
  assert.equal(fb.merkle.verify(block, chunks[4], 4, proof), true)
  assert.equal(fb.merkle.verify({ ...block, state: { ...block.state, chunks: 6 } }, chunks[4], 4, proof), false, 'the signed count fixes the shape of the path')
})

test('a sealed limit: the commitment in the grant, the salt in the observe that opens it', () => {
  const fb = require('../src/index.cjs')
  const limit = { minor: 5000, currency: 'GBP' }, salt = 'ab'.repeat(16)
  const commitment = fb.grant.limitCommitment(limit, 'P1D', salt)
  const grant = { hash: 'a'.repeat(64), type: 'grant', state: { kind: 'authority', scope: { acts: ['transfer'], limit_commitment: commitment } }, refs: {} }
  const fence = fb.grant.limitFence(grant.hash, 'b'.repeat(64), { limit, per: 'P1D', salt })
  assert.equal(fb.grant.limitOpens(grant, { type: fence.type, state: fence.state, refs: fence.refs }), true)
  assert.equal(fb.grant.limitOpens(grant, { type: fence.type, state: { ...fence.state, limit: { minor: 9000, currency: 'GBP' } }, refs: fence.refs }), false)
})
