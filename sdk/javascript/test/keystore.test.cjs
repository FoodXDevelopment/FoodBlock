const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')
const { recoveryCode, lock, unlock } = require('../src/keystore.cjs')

test('a key locked with a recovery code opens only with that code, however it is typed', () => {
  const keys = fb.generateKeypair()
  const code = recoveryCode()
  assert.match(code, /^([A-HJ-NP-Z2-9]{4}-){5}[A-HJ-NP-Z2-9]{4}$/)
  const locked = lock(keys.private_key, code)
  assert.equal(JSON.stringify(locked).includes(keys.private_key), false, 'the locked key does not show the key')
  assert.equal(unlock(locked, code.toLowerCase().replace(/-/g, ' ')), keys.private_key, 'their code gives their key back')
  assert.throws(() => unlock(locked, recoveryCode()), /does not open/)
})

test('release 19 and 47: a short code, a key that is not hex, an empty code and a short tag are refused', () => {
  const keys = fb.generateKeypair(), code = recoveryCode()
  assert.throws(() => lock(keys.private_key, ''), /at least 24/)
  assert.throws(() => lock(keys.private_key, 'ABCD-EFGH'), /at least 24/)
  assert.throws(() => lock('not hex', code), /hexadecimal/)
  const locked = lock(keys.private_key, code)
  assert.throws(() => unlock(locked, ''), /does not open/)
  assert.throws(() => unlock({ ...locked, tag: locked.tag.slice(0, 8) }, code), /does not open/)
})
