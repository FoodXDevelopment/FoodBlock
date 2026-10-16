#!/usr/bin/env node
// One version for every package: spec/protocol.json `version` + ".0" (1.6 -> 1.6.0). Nothing else names a version.
//
//   node tools/version-sync.cjs           check (CI): fail if any manifest, copy or tag rule differs
//   node tools/version-sync.cjs --write   make every manifest say the version
//   node tools/version-sync.cjs --pack    check, then dry-run each package where its tool exists (never publishes)
//
// Where each package is published from (a release is a tag + the registry's own command, run by a person):
//   npm      sdk/javascript (@foodxdev/foodblock), mcp (foodblock-mcp), cli (foodblock-cli), server (foodblock-node)
//   PyPI     sdk/python (foodblock)             crates.io  sdk/rust (foodblock)
//   Maven    sdk/kotlin (world.foodx:foodblock) Go        sdk/go: git tag  sdk/go/v<version>
//   SwiftPM  sdk/swift: git tag <version>
// mcp, cli and server depend on the SDK by `file:../sdk/javascript` in the repo (so a checkout tests what it holds);
// the packed copy says `^<version>` (--pack does this in a scratch copy, the repo's manifests stay as they are).
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process')
const ROOT = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const write = (p, s) => fs.writeFileSync(path.join(ROOT, p), s)
const VERSION = JSON.parse(read('spec/protocol.json')).version + '.0'
const WRITE = process.argv.includes('--write'), PACK = process.argv.includes('--pack')
const SDK = '@foodxdev/foodblock'
let wrong = 0
const bad = (m) => { wrong++; console.log('✗ ' + m) }

// JSON manifests
const NPM = { 'sdk/javascript': SDK, mcp: 'foodblock-mcp', cli: 'foodblock-cli', server: 'foodblock-node' }
for (const [dir, name] of Object.entries(NPM)) {
  const f = dir + '/package.json', j = JSON.parse(read(f))
  if (j.name !== name) bad(`${f}: name ${j.name}, want ${name}`)
  if (j.license !== 'MIT') bad(`${f}: license ${j.license}, want MIT`)
  if (j.private) bad(`${f}: private`)
  if (j.version !== VERSION) { if (WRITE) { j.version = VERSION; write(f, JSON.stringify(j, null, 2) + '\n') } else bad(`${f}: version ${j.version}, want ${VERSION}`) }
  if (dir !== 'sdk/javascript' && j.dependencies[SDK] !== 'file:../sdk/javascript') bad(`${f}: ${SDK} should be file:../sdk/javascript in the repo`)
  if (!fs.existsSync(path.join(ROOT, dir, 'README.md'))) bad(`${dir}/README.md missing`)
}
{
  const f = 'mcp/server.json', j = JSON.parse(read(f))
  let changed = false
  if (j.version !== VERSION) { j.version = VERSION; changed = true }
  for (const p of j.packages) if (p.version !== VERSION) { p.version = VERSION; changed = true }
  if (changed) { if (WRITE) write(f, JSON.stringify(j, null, 2) + '\n'); else bad(`${f}: version differs from ${VERSION}`) }
}
// text manifests
function text(file, re, replace, what) {
  const s = read(file), m = s.match(re)
  if (!m) return bad(`${file}: no ${what}`)
  if (m[1] !== VERSION) { if (WRITE) write(file, s.replace(re, replace)); else bad(`${file}: ${what} ${m[1]}, want ${VERSION}`) }
}
text('sdk/python/pyproject.toml', /^version = "([^"]+)"/m, `version = "${VERSION}"`, 'version')
text('sdk/rust/Cargo.toml', /^version = "([^"]+)"/m, `version = "${VERSION}"`, 'package version')
// Kotlin reads the protocol file itself; Go and Swift are versioned by git tag, not by a file.
if (!/protocol\.json/.test(read('sdk/kotlin/build.gradle.kts'))) bad('sdk/kotlin/build.gradle.kts must read the version from spec/protocol.json')
if (!/^module github\.com\/FoodXDevelopment\/foodblock\/sdk\/go$/m.test(read('sdk/go/go.mod'))) bad('sdk/go/go.mod: module path')
// the licence, and exact copies carried inside packages
for (const d of ['sdk/javascript', 'sdk/python', 'sdk/rust', 'sdk/go', 'sdk/swift', 'sdk/kotlin', 'mcp', 'cli', 'server'])
  if (!fs.existsSync(path.join(ROOT, d, 'LICENSE')) || read(d + '/LICENSE') !== read('LICENSE')) {
    if (WRITE) write(d + '/LICENSE', read('LICENSE')); else bad(`${d}/LICENSE differs from LICENSE`)
  }
if (read('server/schema.sql') !== read('sql/schema.sql')) { if (WRITE) write('server/schema.sql', read('sql/schema.sql')); else bad('server/schema.sql differs from sql/schema.sql') }

if (PACK) {
  const have = (c) => cp.spawnSync(c, ['--version']).status === 0 || cp.spawnSync(c, ['version']).status === 0
  const run = (c, a, cwd) => cp.spawnSync(c, a, { cwd, encoding: 'utf8' })
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-pack-'))
  for (const [dir] of Object.entries(NPM)) {
    const to = path.join(scratch, dir.replace(/\//g, '_'))
    fs.cpSync(path.join(ROOT, dir), to, { recursive: true, filter: (s) => !s.includes('node_modules') })
    const pj = path.join(to, 'package.json'), j = JSON.parse(fs.readFileSync(pj, 'utf8'))
    if (j.dependencies && j.dependencies[SDK]) j.dependencies[SDK] = '^' + VERSION
    fs.writeFileSync(pj, JSON.stringify(j, null, 2))
    const r = run('npm', ['pack', '--dry-run', '--json'], to)
    if (r.status !== 0) { bad(`npm pack ${dir}: ${r.stderr.slice(0, 300)}`); continue }
    const out = JSON.parse(r.stdout)[0], paths = out.files.map((f) => f.path)
    for (const need of ['package.json', 'LICENSE', 'README.md']) if (!paths.includes(need)) bad(`npm pack ${dir}: ${need} not in the tarball`)
    console.log(`npm    ${out.name}@${out.version}  ${out.entryCount} files  ${out.size} bytes`)
  }
  if (have('cargo')) {
    const r = run('cargo', ['package', '--allow-dirty', '--offline'], path.join(ROOT, 'sdk/rust'))
    r.status === 0 ? console.log('cargo  foodblock packaged and verified') : bad('cargo package: ' + r.stderr.slice(-300))
  } else console.log('cargo  skipped (not installed)')
  if (have('go')) {
    const r = run('go', ['vet', './...'], path.join(ROOT, 'sdk/go'))
    r.status === 0 ? console.log('go     go vet ok') : bad('go vet: ' + r.stderr.slice(-300))
  } else console.log('go     skipped (not installed)')
  if (run('python3', ['-c', 'import build'], ROOT).status === 0) {
    const to = path.join(scratch, 'python'); fs.cpSync(path.join(ROOT, 'sdk/python'), to, { recursive: true })
    const r = run('python3', ['-m', 'build', '--sdist', '--outdir', path.join(scratch, 'dist')], to)
    r.status === 0 ? console.log('python sdist built (the wheel needs the Rust core: a release builds one per platform)') : bad('python -m build: ' + (r.stderr || r.stdout).slice(-300))
  } else console.log('python skipped (pip install build)')
  console.log('kotlin/swift skipped here: need a JDK 17 and a Swift toolchain (CI has both)')
  fs.rmSync(scratch, { recursive: true, force: true })
}
console.log(wrong ? `${wrong} problem(s). Version should be ${VERSION}.` : `ok: every package is ${VERSION}`)
process.exit(wrong ? 1 : 0)
