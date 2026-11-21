#!/usr/bin/env node
// Run a FoodBlock node: Postgres for the blocks (schema.sql, a copy of sql/schema.sql), HTTP for pull, push and discovery.
// The node refuses to start until its owner states these nine choices (nothing is filled in; a missing one is named):
//   STRANGERS_PER_DAY  the most blocks one day may bring from all strangers together (the node's own total, published as its word): a whole number, 0 refuses strangers;
//   PER_STRANGER  blocks a day from each stranger where the owner's admission rule names none: a whole number, 0 refuses strangers;
//                 published as the node's own at /.well-known/foodblock-admission
//   ADMISSION     the hash of the owner's admission block (once it is pushed here), or the word none for no rule
//   PULL_CAP      the most blocks one pull answer carries: a whole number, 1 or more
//   SERVES_PAIRS  true or false: whether the other half of a forked pair goes with a pull that includes one
//   TAKES_PAIRS   true or false: whether both blocks of a pair arriving together are taken (false: both are kept as proof, neither is taken)
//   WAITING_PER_AUTHOR  how many blocks may wait for one author: a whole number (0 keeps none)
//   COPY_RECIPIENTS     the most recipients one sealed block may be copied to: a whole number (0 keeps no copies)
//   COPY_BYTES          the most bytes of sealed copies one push may add: a whole number (0 keeps none)
// And, as before:
//   NODE_IDENTITY the node's OWN machine identity: a file { holder, genesis, key } made here on first start (kept 0600). It signs this
//                 node's answers and nothing else. The node holds no key of anyone it keeps blocks for: never give it a person's key.
//   SPEAKS_FOR    the ids this node keeps blocks for, comma separated (required: the node's own id is never one of them by default)
//   DATABASE_URL  Postgres (default postgresql://localhost:5432/foodblock)
//   PORT          default 3111
//   NODE_URL      where this node is reached, for .well-known/foodblock (for example https://node.example.com)
//   WAIT_TTL      how long a block may wait for its prev, in seconds (default a day)
import pg from 'pg'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import fb from '@foodxdev/foodblock'
import { createNode } from './node.js'

// The owner's nine choices, read from the environment; a missing or unreadable one stops the start, named.
const stated = (name) => { const v = process.env[name]; if (v === undefined || v.trim() === '') throw new Error(`${name} is required: the owner states it`); return v.trim() }
const whole = (name, least) => { const v = stated(name); if (!/^\d+$/.test(v) || Number(v) < least) throw new Error(`${name} must be a whole number, ${least} or more (got "${v}")`); return Number(v) }
const yesNo = (name) => { const v = stated(name); if (v !== 'true' && v !== 'false') throw new Error(`${name} must be true or false (got "${v}")`); return v === 'true' }
let choices
try {
  choices = { perStranger: whole('PER_STRANGER', 0), strangersPerDay: whole('STRANGERS_PER_DAY', 0), admission: stated('ADMISSION') === 'none' ? null : stated('ADMISSION'), cap: whole('PULL_CAP', 1), servesPairs: yesNo('SERVES_PAIRS'), takesPairs: yesNo('TAKES_PAIRS'), waitingPerAuthor: whole('WAITING_PER_AUTHOR', 0), copyRecipients: whole('COPY_RECIPIENTS', 0), copyBytes: whole('COPY_BYTES', 0) }
} catch (error) { process.stderr.write(`foodblock-node: ${error.message}\n`); process.exit(1) }
if (!process.env.NODE_IDENTITY) { process.stderr.write('NODE_IDENTITY names the node\'s own key file (made on first start). It is the node\'s machine key, never a person\'s.\n'); process.exit(1) }
if (!process.env.SPEAKS_FOR || !process.env.SPEAKS_FOR.trim()) { process.stderr.write('SPEAKS_FOR is required: the ids this node keeps blocks for, comma separated\n'); process.exit(1) }
// The node's own identity: a machine with its own key, made here and kept private. A person's key never reaches a node (the owner's decision 6).
let own
if (existsSync(process.env.NODE_IDENTITY)) own = JSON.parse(readFileSync(process.env.NODE_IDENTITY, 'utf8'))
else {
  const made = fb.generateKeypair()
  const genesis = fb.identity.genesis(made, { kind: 'machine', audience: 'public', at: new Date().toISOString() })
  own = { holder: genesis.hash, genesis, key: made }
  writeFileSync(process.env.NODE_IDENTITY, JSON.stringify(own, null, 2), { mode: 0o600 })
}
const { holder, key, genesis } = own
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/foodblock' })
await pool.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))

const port = Number(process.env.PORT || 3111)
const owners = process.env.SPEAKS_FOR.split(',').map((id) => id.trim()).filter(Boolean)
const app = createNode({ pool, holder, key, owners, ...choices, url: process.env.NODE_URL || '',
  ...(process.env.WAIT_TTL ? { ttl: Number(process.env.WAIT_TTL) * 1000 } : {}) })
const proof = await app.node.push({ messages: [fb.wrap(genesis)] })
if (proof.refused.length) process.stderr.write(`the node's own genesis was refused: ${JSON.stringify(proof.refused)}\n`)
// A local announcement (§10), for any local transport (mDNS / DNS-SD, a short-range link) to carry.
const announcement = await app.node.announcement()
app.listen(port, () => process.stdout.write(`FoodBlock node on :${port}\nlocal announcement: ${JSON.stringify(announcement)}\n`))
