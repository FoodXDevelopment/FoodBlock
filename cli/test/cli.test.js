// The CLI holds no key. It composes blocks for her own device to sign (the test is the device, with a throwaway key), takes back the signature,
// and refuses invalid blocks by the SDK's own checks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fb from '@foodxdev/foodblock'

const FB = new URL('../bin/fb.js', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'fb-cli-'))
const run = (...args) => spawnSync(process.execPath, [FB, ...args], { encoding: 'utf8' })
const ok = (...args) => JSON.parse(execFileSync(process.execPath, [FB, ...args], { encoding: 'utf8' }))
const me = join(dir, 'me.json')
test.after(() => rmSync(dir, { recursive: true, force: true }))

// her device: the key never leaves this object; the CLI is given the genesis only
const device = fb.generateKeypair()
const genesis = fb.identity.genesis(device, { kind: 'person', at: '2026-11-01T00:00:00.000Z', audience: 'public' })
const sign = (drafted) => fb.sign(drafted.block, device.private_key)
const create = (...args) => { const drafted = ok('draft', ...args, '--identity', me); return ok('attach', '--draft', JSON.stringify(drafted), '--signature', sign(drafted), '--identity', me) }

test('adopt: her public identity is kept (blocks only, private to her); a genesis her key does not open is refused', () => {
  const result = ok('adopt', me, '--genesis', JSON.stringify(genesis))
  assert.equal(result.id, genesis.hash)
  const held = JSON.parse(readFileSync(me, 'utf8'))
  assert.deepEqual(Object.keys(held).sort(), ['chain', 'genesis'], 'the file holds blocks and nothing else')
  assert.ok(!readFileSync(me, 'utf8').includes(device.private_key))
  assert.equal(statSync(me).mode & 0o077, 0, 'private to its owner')
  assert.notEqual(run('adopt', me, '--genesis', JSON.stringify(genesis)).status, 0, 'never overwrites an identity')
  const forged = { ...genesis, signature: 'f'.repeat(128) }
  assert.notEqual(run('adopt', join(dir, 'forged.json'), '--genesis', JSON.stringify(forged)).status, 0)
  assert.notEqual(run('adopt', join(dir, 'leak.json'), '--genesis', JSON.stringify({ ...genesis, private_key: device.private_key })).status, 0, 'a genesis that carries a private key is refused')
})

test('draft then attach: valid blocks, each the next in her chain, signed by her device', () => {
  const eggs = create('thing', 'eggs', '--state', '{"name":"Eggs"}', '--audience', 'public')
  const offer = create('promise', '--state', JSON.stringify({ terms: { lines: [{ id: 'eggs', what: eggs.hash, quantity: fb.amount('2', '{tray}'), price: fb.amount('4.50', 'GBP') }], expires: '2026-10-20T00:00:00.000Z' } }),
    '--refs', JSON.stringify({ from: eggs.refs.author }), '--audience', 'public')
  const { chain } = JSON.parse(readFileSync(me, 'utf8'))
  assert.deepEqual([eggs.state.seq, offer.state.seq, offer.refs.prev], [1, 2, eggs.hash])
  assert.equal(ok('verify', JSON.stringify(offer), '--identity', me).signedByItsAuthor, true)
  assert.equal(fb.promiseStage(offer, chain).stage, 'offered')
})

test('draft prints a block with no signature, saves nothing, and gives the passkey challenge', () => {
  const before = readFileSync(me, 'utf8')
  const drafted = ok('draft', 'observe', 'note', '--state', '{"text":"hi"}', '--audience', 'public', '--identity', me)
  assert.equal(drafted.block.signature, undefined)
  assert.equal(drafted.challenge, fb.passkeyChallenge(drafted.block))
  assert.equal(readFileSync(me, 'utf8'), before)
})

test('attach refuses a signature that is not her key\'s over exactly that block, and writes nothing', () => {
  const before = readFileSync(me, 'utf8')
  const drafted = ok('draft', 'observe', 'note', '--state', '{"text":"hi"}', '--audience', 'public', '--identity', me)
  const stranger = fb.generateKeypair()
  for (const signature of [fb.sign(drafted.block, stranger.private_key), 'ab'.repeat(64)]) {
    const result = run('attach', '--draft', JSON.stringify(drafted), '--signature', signature, '--identity', me)
    assert.notEqual(result.status, 0); assert.match(result.stderr, /not her key/)
  }
  const edited = { ...drafted, block: { ...drafted.block, state: { ...drafted.block.state, text: 'edited after' } } }
  assert.notEqual(run('attach', '--draft', JSON.stringify(edited), '--signature', sign(drafted), '--identity', me).status, 0, 'a signature over other words is refused')
  assert.equal(readFileSync(me, 'utf8'), before)
})

test('draft refuses what the write check refuses, and writes nothing', () => {
  const before = readFileSync(me, 'utf8')
  for (const args of [['thing', 'flour', '--state', '{"amount":{"value":1.5,"unit":"kg"}}'], ['observe', 'note', '--state', '{"price":{"value":"abc","unit":"GBP"}}']]) {
    const result = run('draft', ...args, '--audience', 'public', '--identity', me)
    assert.notEqual(result.status, 0, args.join(' '))
    assert.match(result.stderr, /refused/)
  }
  assert.equal(readFileSync(me, 'utf8'), before)
})

test('a missing --audience is refused with the plain reason', () => {
  const result = run('draft', 'observe', 'note', '--state', '{"text":"hi"}', '--identity', me)
  assert.notEqual(result.status, 0); assert.match(result.stderr, /--audience is required/)
})

test('an identity file that holds a private key is not read', () => {
  const bad = join(dir, 'bad.json')
  writeFileSync(bad, JSON.stringify({ keys: device, genesis, chain: [genesis] }))
  const result = run('draft', 'observe', 'note', '--state', '{"text":"hi"}', '--audience', 'public', '--identity', bad)
  assert.notEqual(result.status, 0); assert.match(result.stderr, /holds a private key/)
})

test('a list audience: the block is for those ids alone', () => {
  const secret = create('observe', 'note', '--state', '{"text":"for Bo"}', '--audience', 'bo-id-not-real')
  assert.ok(Array.isArray(secret.state.audience) && secret.state.audience.length === 1)
})

test('check and valid', () => {
  assert.ok(ok('check', 'thing', '--state', '{"kind":"eggs"}').errors.some((error) => /refs.author/.test(error)))
  const note = create('observe', 'note', '--state', '{"text":"hi"}', '--audience', 'public')
  assert.deepEqual(ok('valid', JSON.stringify(note), '--identity', me).refusals, [])
  assert.deepEqual(ok('valid', JSON.stringify({ ...note, signature: 'f'.repeat(128) }), '--identity', me).refusals.map((r) => r.code), ['bad_signature'])
})

test('the package carries its own number: the protocol names no version', () => {
  assert.match(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version, /^\d+\.\d+\.\d+$/)
})
