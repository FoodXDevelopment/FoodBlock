// The CLI writes valid blocks in an identity's key chain and refuses invalid ones, by the SDK's own checks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fb from '@foodxdev/foodblock'

const FB = new URL('../bin/fb.js', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'fb-cli-'))
const run = (...args) => spawnSync(process.execPath, [FB, ...args], { encoding: 'utf8' })
const ok = (...args) => JSON.parse(execFileSync(process.execPath, [FB, ...args], { encoding: 'utf8' }))
const me = join(dir, 'me.json')
test.after(() => rmSync(dir, { recursive: true, force: true }))

test('init: a genesis that passes the write check; the recovery key kept apart', () => {
  const genesis = ok('init', me)
  assert.deepEqual(fb.check(genesis.type, genesis.state, genesis.refs), [])
  assert.equal(fb.identity.signedByAuthor(genesis, [genesis]), true)
  const { recovery } = JSON.parse(readFileSync(`${me}.recovery.json`, 'utf8'))
  assert.equal(genesis.state.recovery_key_hash, fb.identity.recoveryKeyHash(recovery.public_key_sign))
  assert.equal(JSON.parse(readFileSync(me, 'utf8')).recovery, undefined, 'the identity file holds no recovery key')
  assert.notEqual(run('init', me).status, 0, 'never overwrites an identity')
})

test('create: valid blocks, each the next in the key chain, signed by a key that speaks', () => {
  const eggs = ok('create', 'thing', 'eggs', '--state', '{"name":"Eggs"}', '--identity', me)
  const offer = ok('create', 'promise', '--state', JSON.stringify({ terms: { price: fb.money(450, 'GBP'), quantity: fb.amount('2', '{tray}'), expires: '2026-10-20T00:00:00.000Z' } }),
    '--refs', JSON.stringify({ from: eggs.refs.author, what: eggs.hash }), '--identity', me)
  const { chain } = JSON.parse(readFileSync(me, 'utf8'))
  for (const block of [eggs, offer]) assert.deepEqual(fb.check(block.type, block.state, block.refs), [])
  assert.deepEqual([eggs.state.seq, offer.state.seq, offer.refs.prev], [1, 2, eggs.hash])
  assert.equal(ok('verify', JSON.stringify(offer), '--identity', me).signedByItsAuthor, true)
  assert.equal(fb.promiseStage(offer, chain).stage, 'offered')
})

test('create refuses what the write check refuses, and writes nothing', () => {
  const before = JSON.parse(readFileSync(me, 'utf8')).chain.length
  for (const args of [['thing', 'flour', '--state', '{"amount":{"value":1.5,"unit":"kg"}}'], ['place.venue', 'kitchen'], ['promise', '--refs', '{}']]) {
    const result = run('create', ...args, '--identity', me)
    assert.notEqual(result.status, 0, args.join(' '))
    assert.match(result.stderr, /refused/)
  }
  assert.equal(JSON.parse(readFileSync(me, 'utf8')).chain.length, before)
})

test('key: a device key brought in by a key grant, ready to sign a node\'s answers', () => {
  const file = join(dir, 'node-key.json')
  const grant = ok('key', file, '--identity', me)
  const { holder, key, blocks } = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(fb.check(grant.type, grant.state, grant.refs), [])
  assert.ok(fb.identity.keysOf(holder, blocks).includes(key.public_key_sign))
})

test('check and valid', () => {
  assert.ok(ok('check', 'thing', '--state', '{"kind":"eggs"}').errors.some((error) => /refs.author/.test(error)))
  const note = ok('create', 'observe', 'note', '--state', '{"text":"hi"}', '--identity', me)
  assert.deepEqual(ok('valid', JSON.stringify(note), '--identity', me).refusals, [])
  assert.deepEqual(ok('valid', JSON.stringify({ ...note, signature: 'f'.repeat(128) }), '--identity', me).refusals.map((r) => r.code), ['bad_signature'])
})

test('convert: the one-time converter turns old blocks into fresh 1.6 blocks, and running again adds nothing', () => {
  const owner = fb.generateKeypair()
  const genesis = { type: 'actor.foodie', state: { name: 'Ann', public_key_sign: owner.public_key_sign, at: '2024-01-01T00:00:00.000Z', audience: 'public' }, refs: {} }
  const id = fb.legacy.oldHash(genesis)
  const note = { type: 'observe.received', state: { text: 'two trays' }, refs: { author: id } }
  const files = { old: join(dir, 'old.json'), keys: join(dir, 'keys.json'), map: join(dir, 'map.json') }
  writeFileSync(files.old, JSON.stringify([genesis, note])); writeFileSync(files.keys, JSON.stringify({ [id]: owner }))
  const done = ok('convert', files.old, '--keys', files.keys, '--at', '2026-10-15T12:00:00.000Z', '--map', files.map)
  assert.equal(done.blocks.length, 3)
  assert.deepEqual(done.blocks[1].refs.derives_from, [id])
  assert.deepEqual(fb.valid(done.blocks[2], [done.blocks[0], done.blocks[1]]), [])
  assert.deepEqual(done.blocks[2].refs.derives_from, [fb.legacy.oldHash(note)])
  assert.equal(ok('convert', files.old, '--keys', files.keys, '--at', '2026-10-16T12:00:00.000Z', '--map', files.map).blocks.length, 0)
})

test('the package names the protocol version it speaks', () => {
  assert.ok(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version.startsWith(`${fb.VERSION}.`))
})
