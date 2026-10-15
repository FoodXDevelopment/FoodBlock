// The one packaging rule: spec/ is the only source of the protocol's lists. Each SDK package carries an exact copy of
// the file it loads (protocol.json; the Rust crate also carries the converter's table, legacy/aliases-0.x.json),
// because a package installed elsewhere cannot reach spec/.
// `node test/sync-spec.cjs` makes the copies; `node test/sync-spec.cjs --check` fails if any copy differs from spec/.
// Each SDK's own tests also check their copy byte for byte, so a copy can never drift.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
// [source under spec/, name in the package, which targets carry it]
const FILES = [['protocol.json', 'protocol.json', ['sdk/javascript/spec', 'sdk/rust/spec']], ['legacy/aliases-0.x.json', 'aliases-0.x.json', ['sdk/rust/spec']]]
// Python, Go, Swift and Kotlin carry no copy: they read the spec through the Rust core (sdk/rust/spec).
const TARGETS = ['sdk/javascript/spec', 'sdk/rust/spec']
// A target is kept only once its folder exists (the JS SDK opts in by making sdk/javascript/spec).
const check = process.argv.includes('--check')

let wrong = 0
for (const target of TARGETS) {
  const dir = path.join(ROOT, target)
  if (!fs.existsSync(dir)) continue
  for (const [from, name, carriers] of FILES) {
    if (!carriers.includes(target)) continue
    const source = fs.readFileSync(path.join(ROOT, 'spec', from))
    const copy = path.join(dir, name)
    if (check) {
      const same = fs.existsSync(copy) && Buffer.compare(fs.readFileSync(copy), source) === 0
      if (!same) { wrong++; console.log(`✗ ${target}/${name} differs from spec/${from}`) }
    } else {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(copy, source)
    }
  }
  // A leftover alias table would be read by nothing: year zero.
  if (fs.existsSync(path.join(dir, 'aliases.json'))) { wrong++; console.log(`✗ ${target}/aliases.json should not exist: year zero`) }
}
if (check) { console.log(wrong ? `${wrong} copies differ: run node test/sync-spec.cjs` : 'every SDK carries spec/ exactly'); process.exit(wrong ? 1 : 0) }
