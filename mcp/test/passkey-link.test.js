import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import { createHub } from '../hosted.js'
import { mcpEndpoint } from '../server.js'

// A person who signs in with a passkey links Google: the Google account then reaches the SAME person; one already tied to someone else is refused.
const BACKEND = process.env.FOODOS_BACKEND || resolve(homedir(), 'foodx')
const have = existsSync(resolve(BACKEND, 'foodos/node/passkeys.js'))
if (!have) console.error(`\n*** SKIPPED (not passing): ${new URL(import.meta.url).pathname.split('/').pop()} needs the foodx checkout with foodos/ at ${BACKEND}. Set FOODOS_BACKEND to run it. ***\n`)
const load = (path) => import(pathToFileURL(resolve(BACKEND, path)).href)
const b64 = (buf) => buf.toString('base64url')
const listen = (handler) => new Promise((done) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => done({ s, url: `http://127.0.0.1:${s.address().port}` })) })

describe('linking Google to a passkey person', { skip: !have && 'no foodx checkout' }, () => {
  it('lands on the same person, and never moves a Google account', async () => {
    const { Host, Passkeys } = await load('foodos/node/index.js'), { TestAuthenticator } = await load('foodos/testing/helpers/webauthn-device.mjs'), { fb } = await load('foodos/edge/sdk.js')
    const dir = mkdtempSync(join(tmpdir(), 'link-')); after(() => rmSync(dir, { recursive: true, force: true }))
    const host = new Host(), passkeys = new Passkeys({ host })
    const hex = (s) => Buffer.from(s, 'base64url').toString('hex')
    async function person(device) {
      const begin = (await passkeys.handle('POST', 'register/begin')).body
      const fin = (await passkeys.handle('POST', 'register/finish', { challenge: begin.challenge, ...device.create(begin.challenge) })).body
      const a = device.get(fb.passkeyChallenge(fin.draft))
      return (await passkeys.handle('POST', 'register/complete', { genesis: { ...fin.draft, signature: fb.passkeySignature(hex(a.authenticatorData), hex(a.clientDataJSON), hex(a.signature)) } })).body.person
    }
    const ada = await person(new TestAuthenticator()), bob = await person(new TestAuthenticator())
    let signingIn = { sub: 'g-ada', email: 'ada@example.org', name: 'Ada' }; const issued = new Map()
    const fake = await listen(async (req, res) => {
      const u = new URL(req.url, 'http://x')
      if (u.pathname === '/auth') { const code = b64(randomBytes(9)); issued.set(code, { nonce: u.searchParams.get('nonce'), ...signingIn }); res.writeHead(302, { location: `${u.searchParams.get('redirect_uri')}?code=${code}&state=${u.searchParams.get('state')}` }).end(); return }
      let raw = ''; for await (const c of req) raw += c
      const held = issued.get(new URLSearchParams(raw).get('code'))
      const claims = { iss: 'https://accounts.google.com', aud: 'gid', exp: Math.floor(Date.now() / 1000) + 600, nonce: held?.nonce, sub: held?.sub, email: held?.email, email_verified: true, name: held?.name }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id_token: `x.${b64(Buffer.from(JSON.stringify(claims)))}.y` }))
    }); after(() => fake.s.close())
    const front = await listen((req, res) => hub.app(req, res)); after(() => { front.s.close(); front.s.closeAllConnections?.() })
    const hub = createHub({ stateFile: join(dir, 's.json'), master: randomBytes(40).toString('hex'), publicUrl: front.url, provision: async () => ({ base: '', token: '' }), mcp: mcpEndpoint(),
      google: { clientId: 'gid', clientSecret: 'gs', redirectUri: `${front.url}/oauth/google/callback`, authUrl: `${fake.url}/auth`, tokenUrl: `${fake.url}/token` } })
    const run = async (url) => { let cookie = ''; let r = await fetch(url, { redirect: 'manual' }); for (let n = 0; n < 5 && r.status >= 300 && r.status < 400; n++) { for (const c of r.headers.getSetCookie?.() || []) cookie = c.split(';')[0]; r = await fetch(new URL(r.headers.get('location'), url), { redirect: 'manual', headers: { cookie } }) } return r }

    const link = hub.linkGoogle(ada)
    assert.equal((await run(link)).status, 200)
    assert.equal(hub.state.accounts.get('google:g-ada').person, ada, 'Google now reaches the passkey person')
    assert.equal((await run(link)).status, 400, 'a link works once')
    signingIn = { sub: 'g-ada', email: 'ada@example.org', name: 'Ada' }
    assert.equal((await run(hub.linkGoogle(bob))).status, 409, 'a Google account tied to someone else is not moved')
    assert.equal(hub.state.accounts.get('google:g-ada').person, ada)
    assert.equal((await fetch(`${front.url}/link/google?code=nope`)).status, 400)
  })
})
