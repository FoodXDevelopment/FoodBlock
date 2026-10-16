#!/usr/bin/env node
// Run a FoodBlock 1.6 node: Postgres for the blocks (schema.sql, a copy of sql/schema.sql), HTTP for pull, push and discovery.
//   NODE_KEY      a file made by `fb key`: { holder, key, blocks }: the holder's id, the key that signs this node's
//                 answers (brought in by a key grant), and the blocks that prove it (taken in on start)
//   DATABASE_URL  Postgres (default postgresql://localhost:5432/foodblock)
//   PORT          default 3111
//   NODE_URL      where this node is reached, for .well-known/foodblock (for example https://node.example.com)
//   SPEAKS_FOR    ids this node speaks for, comma separated (default the holder)
//   ADMISSION     the hash of the owner's admission block, once it is pushed here
//   WAIT_TTL      how long a block may wait for its prev, in seconds (default a day)
import pg from 'pg'
import { readFileSync } from 'node:fs'
import fb from '@foodxdev/foodblock'
import { createNode } from './node.js'

if (!process.env.NODE_KEY) { process.stderr.write('NODE_KEY names the node\'s key file: make one with `fb key node-key.json --identity me.json`\n'); process.exit(1) }
const { holder, key, blocks = [] } = JSON.parse(readFileSync(process.env.NODE_KEY, 'utf8'))
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/foodblock' })
await pool.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))

const port = Number(process.env.PORT || 3111)
const owners = (process.env.SPEAKS_FOR || holder).split(',').map((id) => id.trim()).filter(Boolean)
const app = createNode({ pool, holder, key, owners, admission: process.env.ADMISSION || null, url: process.env.NODE_URL || '',
  ...(process.env.WAIT_TTL ? { ttl: Number(process.env.WAIT_TTL) * 1000 } : {}) })
const proof = await app.node.push({ messages: blocks.map((block) => fb.wrap(block)) })
if (proof.refused.length) process.stderr.write(`the key file's blocks were refused: ${JSON.stringify(proof.refused)}\n`)
// A local announcement (§10), for any local transport (mDNS / DNS-SD, a short-range link) to carry.
const announcement = await app.node.announcement()
app.listen(port, () => process.stdout.write(`FoodBlock node on :${port}\nlocal announcement: ${JSON.stringify(announcement)}\n`))
