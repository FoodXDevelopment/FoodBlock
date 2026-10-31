import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import fb from '@foodxdev/foodblock'
import { createHub } from '../hosted.js'
import { newPerson } from '../door.js'
import { sealer } from '../store.js'
import { mcpEndpoint } from '../server.js'

// FoodX holds keys only where the person knows it does (identity.md, Held keys). A new genesis names FoodX; an identity made before that
// gets a key grant naming FoodX the next time it is opened. Needs the foodx checkout (FOODOS_BACKEND); skipped without it.
const BACKEND = process.env.FOODOS_BACKEND || resolve(homedir(), 'foodx')
const have = existsSync(resolve(BACKEND, 'foodos/node/host.js'))
const load = (path) => import(pathToFileURL(resolve(BACKEND, path)).href)

describe('custody', { skip: !have && 'no foodx checkout (set FOODOS_BACKEND)' }, () => {
  it('names a custodian in a new genesis, and grants one to an older identity when it is opened', async () => {
    const { Host } = await load('foodos/node/index.js')
    const { serveHost } = await load('foodos/testing/helpers/serve-host.mjs')
    const dir = mkdtempSync(join(tmpdir(), 'custody-')); after(() => rmSync(dir, { recursive: true, force: true }))
    const master = randomBytes(40).toString('hex'), host = new Host(), served = await serveHost({ host }); after(() => served.close())
    const provision = async ({ id, genesis }) => { if (!host.tenants.has(id)) await host.join(genesis); return { base: `${served.url}/${id}`, token: host.credential(id, { scopes: ['read', 'write'] }) } }
    const hub = createHub({ reach: 'P30D', trustProxy: false, stateFile: join(dir, 's.json'), master, publicUrl: 'http://127.0.0.1:1', provision, mcp: mcpEndpoint() })
    const operator = sealer(master).open(hub.state.operator.get('me'))

    const fresh = hub.accountFor('reviewer:new', { name: 'new' })
    const door = await hub.doorFor(fresh.person)
    assert.equal(door.person.genesis.state.custodian, operator.id, 'a new genesis names FoodX as its custodian')

    // an identity made before: no custodian named, its keys and recovery key sealed by the hub
    const old = newPerson('person', { reach: 'P30D' }), seal = sealer(master)
    assert.equal(old.genesis.state.custodian, undefined)
    hub.state.identities.set(old.id, seal.seal({ keys: old.keys, encryption: old.encryption, genesis: old.genesis, recovery: old.recovery }))
    const opened = await hub.doorFor(old.id)
    const grant = opened.node.all().find((b) => b.type === 'grant' && b.state?.kind === 'key')
    assert.ok(grant, 'a key grant was signed when the identity was opened')
    assert.equal(grant.state.custodian, operator.id, 'it names FoodX as the custodian')
    assert.equal(grant.state.replaces, old.keys.public_key_sign, 'it rotates the old, unmarked key out')
    assert.deepEqual(fb.identity.liveKeys(old.id, opened.node.all()), [grant.state.public_key_sign])
    assert.equal(seal.open(hub.state.identities.get(old.id)).granted, grant.hash)
    // what it signs next is still the person's
    const next = fb.write('observe', { kind: 'note', text: 'after the grant' }, {}, { author: old.id, key: opened.person.keys, held: opened.person.chain, at: new Date().toISOString(), audience: 'public' })
    assert.deepEqual(opened.node.push(next).refused, [])
    assert.equal(host.node(old.id) !== undefined, true)
  })
})
