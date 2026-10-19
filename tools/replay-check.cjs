#!/usr/bin/env node
'use strict'
// Replay check: how many of the blocks a node already stores does the current core still accept?
//
//   node tools/replay-check.cjs <file.jsonl | file.json | directory> [--limit N] [--json]
//
// Input: a JSON-lines file (one block per line), a JSON file holding an array, or a directory of such files. A line is
// any of the forms a node holds:
//   a message        { "version": "1.6", "block": { type, state, refs }, "signature": "<hex>", "suite"?: "<name>" }
//   a signed block   { type, state, refs, "signature": "<hex>", "hash"?: "<id>", "suite"?: "<name>" }
//   a sealed header  { "version", "header", "header_signature" }   (counted, not judged: only its public header is stored)
// Every block is judged by the core's `valid(block, held)`, with all the blocks read as the context `held`, the way a
// node that holds them all would judge it (core.md, section 8).
//
// Output: counts and reason codes only. It prints no block, no field, no id, no key, no file name and no line of any
// file. Exit code 0 when every block validates, 1 when any fails or cannot be read, 2 when it cannot start.
//
// How to run it before a revised core is deployed (nothing here touches a live server):
//   1. On the machine that holds the node's database, export the stored messages to a file you keep private:
//        psql "$DATABASE_URL" -At -c "select message::text from blocks order by n" > blocks.jsonl
//      (the `blocks` table of sql/schema.sql; one JSON message per line). For another store, export one JSON block per line.
//   2. Copy blocks.jsonl to a checkout of the revised core and run:  node tools/replay-check.cjs blocks.jsonl
//   3. Read the counts. A block that fails here would be refused by the revised core. Fix the cause (or convert the data
//      once, through `fb convert`) before the revised core is deployed. Delete blocks.jsonl afterwards.
// `--limit N` judges only the first N blocks (the context is still all of them). `--json` prints the result as JSON.
const fs = require('fs')
const path = require('path')
const fb = require('../sdk/javascript/src/index.cjs')

function readSources(target) {
  const names = []
  if (!fs.existsSync(target)) return { names, error: 'not found' }
  const st = fs.statSync(target)
  if (st.isDirectory()) { for (const n of fs.readdirSync(target).sort()) if (/\.(jsonl|ndjson|json)$/.test(n)) names.push(path.join(target, n)) }
  else names.push(target)
  return { names }
}

// Returns { rows: [{ full | sealed | bad }], unreadable }
function load(names) {
  const rows = []
  let unreadable = 0
  const take = (o) => {
    if (o && o.header && o.header_signature) return rows.push({ sealed: true })
    const block = o && o.block && typeof o.block === 'object' ? o.block : o
    if (!block || typeof block.type !== 'string' || typeof block.state !== 'object' || typeof block.refs !== 'object' || typeof o.signature !== 'string') { unreadable++; return }
    const suite = o.suite || block.suite
    let hash = block.hash
    if (typeof hash !== 'string') { try { hash = fb.hash(block.type, block.state, block.refs, suite || 'std') } catch { unreadable++; return } }
    rows.push({ full: { hash, type: block.type, state: block.state, refs: block.refs, signature: o.signature, ...(suite ? { suite } : {}) } })
  }
  for (const file of names) {
    const text = fs.readFileSync(file, 'utf8')
    const trimmed = text.trimStart()
    if (trimmed.startsWith('[')) {
      try { for (const o of JSON.parse(text)) take(o) } catch { unreadable++ }
    } else {
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let o
        try { o = JSON.parse(line) } catch { unreadable++; continue }
        take(o)
      }
    }
  }
  return { rows, unreadable }
}

function replay(target, { limit } = {}) {
  const { names, error } = readSources(target)
  if (error) return { error }
  const { rows, unreadable } = load(names)
  const full = rows.filter((r) => r.full).map((r) => r.full)
  const sealed = rows.filter((r) => r.sealed).length
  const judged = typeof limit === 'number' ? full.slice(0, limit) : full
  const codes = {}
  const byType = {}
  let valid = 0
  for (const b of judged) {
    let refusals
    try { refusals = fb.valid(b, full) } catch { refusals = [{ code: 'engine_error' }] }
    byType[b.type] = byType[b.type] || { valid: 0, failed: 0 }
    if (!refusals.length) { valid++; byType[b.type].valid++; continue }
    byType[b.type].failed++
    for (const code of new Set(refusals.map((r) => r.code))) codes[code] = (codes[code] || 0) + 1
  }
  const sort = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => (typeof a[1] === 'number' ? b[1] - a[1] : 0) || a[0].localeCompare(b[0])))
  return { files: names.length, blocks: full.length, judged: judged.length, valid, failed: judged.length - valid, sealed_headers_not_judged: sealed, unreadable_lines: unreadable, reason_codes: sort(codes), by_type: Object.fromEntries(Object.entries(byType).sort()) }
}

module.exports = { replay }

if (require.main === module) {
  const args = process.argv.slice(2)
  const target = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--limit') + 1])
  const li = args.indexOf('--limit')
  const limit = li >= 0 ? Number(args[li + 1]) : undefined
  if (!target) { console.error('usage: node tools/replay-check.cjs <file.jsonl | file.json | directory> [--limit N] [--json]'); process.exit(2) }
  const r = replay(target, { limit })
  if (r.error) { console.error(`replay-check: ${r.error}`); process.exit(2) }
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else {
    console.log(`files: ${r.files}  blocks read: ${r.blocks}  judged: ${r.judged}`)
    console.log(`valid: ${r.valid}  failed: ${r.failed}  (sealed headers not judged: ${r.sealed_headers_not_judged}, unreadable lines: ${r.unreadable_lines})`)
    for (const [code, n] of Object.entries(r.reason_codes)) console.log(`  ${code}: ${n}`)
    for (const [type, c] of Object.entries(r.by_type)) console.log(`  type ${type}: ${c.valid} valid, ${c.failed} failed`)
  }
  process.exit(r.failed || r.unreadable_lines ? 1 : 0)
}
