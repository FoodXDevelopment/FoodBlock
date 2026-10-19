'use strict'
// spec/NECESSITY.md is current and nothing in protocol.json is dead or untested (the fast check: no mutation).
// The full measurement is `node tools/necessity.cjs` (about ten minutes: it rebuilds the Rust core once per listed thing).
const { spawnSync } = require('child_process')
const path = require('path')
const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'necessity.cjs'), '--check'], { encoding: 'utf8' })
process.stdout.write(r.stdout)
process.stderr.write(r.stderr)
process.exit(r.status)
