#!/usr/bin/env node
// Writes every SDK's thin door wrappers from sdk/door.table. `--check`: writes nothing; fails if a generated file is out of date or
// the table's ops are not exactly the arms of sdk/rust/src/door.rs. `--only js|py|go|swift|kotlin`: one language.
const fs = require('fs')
const path = require('path')
const { parse } = require('./door/table.cjs')

const root = path.join(__dirname, '..')
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
const languages = ['js', 'py', 'go', 'swift', 'kotlin'].filter((l) => !only || l === only).filter((l) => fs.existsSync(path.join(__dirname, 'door', `${l}.cjs`)))
const ops = parse()
const check = process.argv.includes('--check')
let bad = 0

const rust = fs.readFileSync(path.join(root, 'sdk/rust/src/door.rs'), 'utf8')
const arms = new Set()
for (const m of rust.matchAll(/^\s*((?:"\w+"\s*\|\s*)*"\w+")\s*=>/gm)) for (const n of m[1].matchAll(/"(\w+)"/g)) arms.add(n[1])
for (const o of ops) if (!arms.has(o.op)) { console.error(`door.table has ${o.op}, door.rs does not`); bad++ }
for (const a of arms) if (!ops.some((o) => o.op === a)) { console.error(`door.rs has ${a}, door.table does not`); bad++ }

for (const l of languages) {
  const { file, emit } = require(`./door/${l}.cjs`)
  const out = emit(ops), at = path.join(root, file)
  if (check) { if (!fs.existsSync(at) || fs.readFileSync(at, 'utf8') !== out) { console.error(`${file} is out of date: node tools/gen-door.cjs`); bad++ } }
  else { fs.writeFileSync(at, out); console.log('wrote', file) }
}
process.exit(bad ? 1 : 0)
