const test = require('node:test')
const assert = require('node:assert/strict')
const fb = require('../src/index.cjs')

// A push's `for` (nodes.md) and the earnest profile (1.9 deleted the limit fence: the limit is in the grant's scope, counted by `meter`). Amounts are { value, unit }.
const at = (n) => new Date(Date.UTC(2026, 9, 15, 9, 0, n)).toISOString()
const hash = (label) => require('crypto').createHash('sha256').update(label).digest('hex')

test('push `for` is a list of recipients for each sealed copy', () => {
  const one = hash('a sealed copy'), a = hash('a'), b = hash('b')
  assert.deepEqual(fb.sync.pushRequest([], { [one]: [a, b] }).for, { [one]: [a, b] })
  assert.deepEqual(fb.sync.recipientsOf({ [one]: [a] }, one), [a])
  assert.deepEqual(fb.sync.recipientsOf({}, one), [])
})
