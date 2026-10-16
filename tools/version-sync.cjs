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
//   Maven    sdk/kotlin (world.foodx:foodblock: a jar with natives for macOS arm64/x64, Linux x64/arm64, Windows x64,
//            and an Android AAR for arm64-v8a, armeabi-v7a, x86_64)
//   Go       sdk/go: git tag  sdk/go/v<version>   (pure Go: the core is the embedded foodblock.wasm, run by wazero)
//   SwiftPM  the repository root Package.swift, git tag <version>   (the core is an XCFramework binaryTarget)
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
// Kotlin reads the protocol file itself; Go is versioned by git tag; Swift by git tag and the release URL in Package.swift.
if (!/protocol\.json/.test(read('sdk/kotlin/build.gradle.kts'))) bad('sdk/kotlin/build.gradle.kts must read the version from spec/protocol.json')
if (!/^module github\.com\/FoodXDevelopment\/foodblock\/sdk\/go$/m.test(read('sdk/go/go.mod'))) bad('sdk/go/go.mod: module path')
text('Package.swift', /^let version = "([^"]+)"/m, `let version = "${VERSION}"`, 'version (the XCFramework release URL)')
if (/unsafeFlags/.test(read('Package.swift'))) bad('Package.swift: unsafeFlags make the package unusable as a dependency')
// Go: one core everywhere. The embedded WebAssembly is the very file the JavaScript SDK carries; no cgo.
{
  const wasm = 'sdk/javascript/core/foodblock.wasm', copy = 'sdk/go/foodblock.wasm'
  if (!fs.existsSync(path.join(ROOT, copy)) || !fs.readFileSync(path.join(ROOT, copy)).equals(fs.readFileSync(path.join(ROOT, wasm)))) {
    if (WRITE) fs.copyFileSync(path.join(ROOT, wasm), path.join(ROOT, copy)); else bad(`${copy} differs from ${wasm} (node tools/version-sync.cjs --write)`)
  }
  if (!/tetratelabs\/wazero/.test(read('sdk/go/go.mod'))) bad('sdk/go/go.mod: wazero is the Go SDK\'s runtime')
  for (const f of fs.readdirSync(path.join(ROOT, 'sdk/go')).filter((n) => n.endsWith('.go'))) if (/import "C"/.test(read('sdk/go/' + f))) bad(`sdk/go/${f}: cgo`)
}
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
    // Pure Go: it must build for every platform with cgo off, from the module alone.
    const env = { ...process.env, CGO_ENABLED: '0' }, go = path.join(ROOT, 'sdk/go')
    const r = cp.spawnSync('go', ['vet', './...'], { cwd: go, encoding: 'utf8', env })
    r.status === 0 ? console.log('go     go vet ok (cgo off)') : bad('go vet: ' + r.stderr.slice(-300))
    for (const [goos, goarch] of [['linux', 'amd64'], ['linux', 'arm64'], ['darwin', 'arm64'], ['windows', 'amd64'], ['android', 'arm64']]) {
      const b = cp.spawnSync('go', ['build', './...'], { cwd: go, encoding: 'utf8', env: { ...env, GOOS: goos, GOARCH: goarch } })
      b.status === 0 ? console.log(`go     builds for ${goos}/${goarch}`) : bad(`go build ${goos}/${goarch}: ` + (b.stderr || b.stdout).slice(-300))
    }
  } else console.log('go     skipped (not installed)')
  if (run('python3', ['-c', 'import build'], ROOT).status === 0) {
    const to = path.join(scratch, 'python'); fs.cpSync(path.join(ROOT, 'sdk/python'), to, { recursive: true })
    const r = run('python3', ['-m', 'build', '--sdist', '--outdir', path.join(scratch, 'dist')], to)
    r.status === 0 ? console.log('python sdist built (the wheel needs the Rust core: a release builds one per platform)') : bad('python -m build: ' + (r.stderr || r.stdout).slice(-300))
  } else console.log('python skipped (pip install build)')
  // Swift: the XCFramework (iOS device, iOS simulator, macOS) the root Package.swift uses, zipped with its SwiftPM checksum.
  const xcode = fs.existsSync('/Applications/Xcode.app') ? { DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer' } : {}
  if (process.platform === 'darwin' && have('swift') && have('cargo')) {
    const targets = run('rustup', ['target', 'list', '--installed'], ROOT).stdout || ''
    const all = ['aarch64-apple-ios', 'aarch64-apple-ios-sim', 'x86_64-apple-ios', 'aarch64-apple-darwin', 'x86_64-apple-darwin'].every((t) => targets.split('\n').includes(t))
    const r = cp.spawnSync('sdk/swift/scripts/build-xcframework.sh', all ? [] : ['--macos'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...xcode } })
    if (r.status !== 0) bad('swift xcframework: ' + (r.stderr || r.stdout).slice(-400))
    else {
      const sum = (r.stdout.match(/checksum: (\w+)/) || [])[1]
      console.log(all ? `swift  CFoodBlock.xcframework (iOS, iOS simulator, macOS) zipped, checksum ${sum}` : 'swift  CFoodBlock.xcframework (macOS only: rustup target add the iOS targets for the rest)')
      const t = cp.spawnSync('swift', ['build'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...xcode } })
      t.status === 0 ? console.log('swift  swift build ok (root Package.swift, no unsafeFlags)') : bad('swift build: ' + (t.stderr || t.stdout).slice(-300))
    }
  } else console.log('swift  skipped (needs macOS with Xcode and Rust)')
  // Kotlin: the natives this computer can build, then the jar and the AAR when a JDK is here.
  if (have('cargo')) {
    const k = path.join(ROOT, 'sdk/kotlin')
    const r = cp.spawnSync('scripts/build-natives.sh', [], { cwd: k, encoding: 'utf8' })
    if (r.status !== 0) bad('kotlin natives: ' + (r.stderr || r.stdout).slice(-300))
    else console.log('kotlin ' + r.stdout.trim().split('\n').join('\n       '))
    const javaOk = cp.spawnSync('java', ['-version']).status === 0
    if (javaOk) {
      const g = cp.spawnSync('./gradlew', ['--no-daemon', ':foodblock:jar', ':foodblock:testBundled', ...(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ? [':android:assembleRelease'] : [])], { cwd: k, encoding: 'utf8' })
      g.status === 0 ? console.log('kotlin jar built, bundled loader tested' + (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ? ', AAR built' : ' (no ANDROID_HOME: AAR skipped)')) : bad('gradle: ' + (g.stdout + g.stderr).slice(-400))
    } else console.log('kotlin jar/AAR skipped (no JDK 17 on this computer; CI builds them: .github/workflows/packages.yml)')
  } else console.log('kotlin skipped (needs Rust; the jar and AAR need a JDK 17)')
  fs.rmSync(scratch, { recursive: true, force: true })
}
console.log(wrong ? `${wrong} problem(s). Version should be ${VERSION}.` : `ok: every package is ${VERSION}`)
process.exit(wrong ? 1 : 0)
