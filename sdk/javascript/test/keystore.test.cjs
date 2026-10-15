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
