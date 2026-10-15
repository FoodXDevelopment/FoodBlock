// Builds core/foodblock.wasm from the Rust core (sdk/rust) and records what it was built from.
//   node scripts/build-wasm.cjs           rebuild (needs rustup target add wasm32-unknown-unknown)
//   node scripts/build-wasm.cjs --check   fail if core/BUILD.json is not this Rust source's (no Rust needed)
// BUILD.json holds `source` (SHA-256 over every file the build reads: src/, Cargo.toml, Cargo.lock, spec/) and `wasm`
// (SHA-256 of the shipped bytes). The test suite checks both, so the shipped .wasm is always the current Rust source.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const RUST = path.resolve(__dirname, '../../rust')
const CORE = path.resolve(__dirname, '../core')
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex')

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
}
function sourceHash() {
  const files = ['Cargo.toml', 'Cargo.lock', ...['src', 'spec'].flatMap((dir) => filesUnder(path.join(RUST, dir)).map((file) => path.relative(RUST, file)))].sort()
  const hash = crypto.createHash('sha256')
  for (const file of files) hash.update(`${file}\0${sha(fs.readFileSync(path.join(RUST, file)))}\n`)
  return hash.digest('hex')
}
const recorded = () => JSON.parse(fs.readFileSync(path.join(CORE, 'BUILD.json'), 'utf8'))

function build() {
  const args = ['rustc', '--locked', '--profile', 'wasm', '--target', 'wasm32-unknown-unknown', '--features', 'wasm', '--crate-type', 'cdylib']
  execFileSync('cargo', args, { cwd: RUST, stdio: 'inherit', env: { ...process.env, RUSTFLAGS: `--remap-path-prefix=${RUST}=/foodblock --remap-path-prefix=${process.env.HOME}/.cargo=/cargo --remap-path-prefix=${process.env.HOME}/.rustup=/rustup` } })
  const bytes = fs.readFileSync(path.join(RUST, 'target/wasm32-unknown-unknown/wasm/foodblock.wasm'))
  fs.mkdirSync(CORE, { recursive: true })
  fs.writeFileSync(path.join(CORE, 'foodblock.wasm'), bytes)
  fs.writeFileSync(path.join(CORE, 'BUILD.json'), JSON.stringify({ source: sourceHash(), wasm: sha(bytes), bytes: bytes.length }, null, 2) + '\n')
  return bytes
}

module.exports = { sourceHash, recorded, sha, build }
if (require.main === module) {
  if (process.argv.includes('--check')) {
    const now = sourceHash(), built = recorded()
    if (now !== built.source) { console.error('core/foodblock.wasm is older than sdk/rust. Run: node scripts/build-wasm.cjs'); process.exit(1) }
    console.log('core/foodblock.wasm matches the Rust source')
  } else { const bytes = build(); console.log(`core/foodblock.wasm ${bytes.length} bytes`) }
}
