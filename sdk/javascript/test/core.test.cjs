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
  const me = fb.identity.genesis(keys, { recoveryKey: fb.generateKeypair().public_key_sign })
  assert.throws(() => fb.write('thing', { kind: 'eggs', price: 1.5 }, {}, { author: me.hash, key: keys, held: [me] }),
    (error) => /^write: refused: /.test(error.message) && error.refused.some((one) => one.code === 'float') && error.wrong.length === error.refused.length)
})
