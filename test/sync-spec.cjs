// The one packaging rule: spec/ is the only source of the protocol's lists. Each SDK package carries an exact copy of
// the two files it loads (protocol.json and aliases.json), because a package installed elsewhere cannot reach spec/.
// `node test/sync-spec.cjs` makes the copies; `node test/sync-spec.cjs --check` fails if any copy differs from spec/.
// Each SDK's own tests also check their copy byte for byte, so a copy can never drift.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILES = ['protocol.json', 'aliases.json']
// Python, Go and Swift no longer carry a copy: they read the spec through the Rust core (sdk/rust/spec).
const TARGETS = ['sdk/javascript/spec', 'sdk/rust/spec']
// A target is kept only once its folder exists (the JS SDK opts in by making sdk/javascript/spec).
const check = process.argv.includes('--check')

let wrong = 0
for (const target of TARGETS) {
  const dir = path.join(ROOT, target)
  if (!fs.existsSync(dir)) continue
  for (const file of FILES) {
    const source = fs.readFileSync(path.join(ROOT, 'spec', file))
    const copy = path.join(dir, file)
    if (check) {
      const same = fs.existsSync(copy) && Buffer.compare(fs.readFileSync(copy), source) === 0
      if (!same) { wrong++; console.log(`✗ ${target}/${file} differs from spec/${file}`) }
    } else {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(copy, source)
    }
  }
}
if (check) { console.log(wrong ? `${wrong} copies differ: run node test/sync-spec.cjs` : 'every SDK carries spec/ exactly'); process.exit(wrong ? 1 : 0) }
