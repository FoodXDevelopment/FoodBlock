#!/usr/bin/env node
'use strict'
// The necessity table: the evidence that each part of the protocol is hard to vary.
//
//   node tools/necessity.cjs            write spec/NECESSITY.md
//   node tools/necessity.cjs --check    fast (no mutation): fail if spec/NECESSITY.md lacks a thing protocol.json lists,
//                                       if the vectors that carry a thing changed, or if any part is DEAD or UNTESTED
//                                       and not named in KEPT below (the test: test/necessity.cjs)
//   node tools/necessity.cjs --full     re-measure everything and fail if spec/NECESSITY.md is not exactly the result
//   node tools/necessity.cjs --only a,b measure again only the named things and keep the page's other verdicts; refused unless every
//                                       case the last measure ran is still in the vectors, unchanged (see build)
//
// How. For every listed thing in spec/protocol.json (every field, term, line field, scope field, key field, verb, ref
// key, closed type, status, stop kind, power and single-id ref) the tool makes a scratch copy of the spec,
// deletes that one thing from protocol.json, and runs two engines against every vector: the spec-only oracle
// (`spec/oracle/run.cjs`, with the audit worlds `test/audit/run.cjs`, where the SDK and the oracle must agree) and the
// Rust core (`cargo test --test vectors`, built from the mutated list). What fails is the evidence: a vector id or an
// audit check that cannot pass without the thing. (`required` and `needs` in protocol.json are prose summaries of
// core.md sections 5 and 7, read by no engine, so they are not mutated.) It also scans the vectors
// for the blocks that carry the thing ("used by"). A thing is
//   COVERED   when deleting it fails at least one vector or audit check;
//   USED      when no check fails but a vector's valid block carries it (it is shown working, never enforced);
//   UNTESTED  when code reads it and no vector carries it (add a vector);
//   DEAD      when nothing in this repository reads it and no vector carries it (delete it, unless KEPT);
//   STRUCTURAL when the engine cannot start without it.
// The numbered invariants are listed with the vectors that state each one: a vector says so itself, `invariants: [n]`
// (spec/vectors.json; a section may say it once for all its cases). This tool checks the numbers against the module text.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'spec', 'NECESSITY.md')
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec', 'protocol.json'), 'utf8'))
const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec', 'vectors.json'), 'utf8'))

// Things kept although no vector carries them, and why. Each needs a reason a person can judge.
const KEPT = {
  // A set in refs.author, refs.prev or refs.key makes no valid block: `valid` refuses it at the chain (core.md, section 8), whatever
  // refs_single lists, so no vector can fail for the list's word alone. The set cases are kept (`valid`, `chain`), and the list keeps
  // these names because the read check and the writer's check read one list for every single-id ref (end pass 2026-11-20).
  'single-id ref refs_single author': 'valid refuses a set here at the chain first; its set case is a valid vector',
  'single-id ref refs_single prev': 'valid refuses a set here at the chain first; its set case is a valid vector',
  'single-id ref refs_single key': 'valid refuses a set here at the chain first; its set case is a valid vector',
}

// ---------------------------------------------------------------- what to delete, one at a time
const things = []
const add = (kind, jsonPath, name, scan) => things.push({ kind, path: jsonPath, name, scan: scan || null, id: `${kind} ${jsonPath.join('.')}${Array.isArray(get(jsonPath)) ? '' : ''} ${name}` })
function get(p, o = P) { return p.reduce((x, k) => (x == null ? x : x[k]), o) }
const listAt = (p) => { const v = get(p); return Array.isArray(v) ? v : Object.keys(v) }

for (const t of Object.keys(P.fields).filter((k) => k !== 'about')) for (const n of P.fields[t]) add(t === 'every' ? 'field (every closed type)' : `field (${t})`, ['fields', t], n, { state: n })
for (const n of P.key_fields.fields) add('key field (actor, grant)', ['key_fields', 'fields'], n, { state: n })
for (const n of P.terms) add('term', ['terms'], n, { terms: n })
for (const n of P.line) add('line field', ['line'], n, { line: n })
for (const n of P.scope) add('scope field', ['scope'], n, { scope: n })
for (const n of P.verbs) add('verb', ['verbs'], n, { refs: n })
for (const n of P.causal) add('causal ref', ['causal'], n, { refs: n })
// (`refs.also` names the other lists that are shared ref keys, the verbs and the causal keys: they are measured as those, not as names)
for (const g of Object.keys(P.refs).filter((k) => Array.isArray(P.refs[k]) && k !== 'also')) for (const n of P.refs[g]) add('ref key', ['refs', g], n, { refs: n })
for (const n of P.closed_types) add('closed type', ['closed_types'], n, { type: n })
for (const n of P.statuses) add('status', ['statuses'], n, { status: n })
for (const n of Object.keys(P.stop)) add('stop kind', ['stop'], n, { stop: n })
for (const n of P.refs_single) add('single-id ref', ['refs_single'], n, null)
for (const n of P.repeat.keys) add('event repeat field', ['repeat', 'keys'], n, { repeatEvent: n })

// ---------------------------------------------------------------- the vectors that carry a thing
const used = new Map() // scan key -> Set of vector ids
const mark = (key, id) => { if (!used.has(key)) used.set(key, new Set()); used.get(key).add(id) }
function scanBlock(b, id) {
  mark(`type:${b.type}`, id)
  for (const k of Object.keys(b.refs || {})) mark(`refs:${k}`, id)
  const s = b.state || {}
  for (const k of Object.keys(s)) mark(`state:${k}`, id)
  if (typeof s.status === 'string') mark(`status:${s.status}`, id)
  if (s.stop !== undefined) mark(`stop:${typeof s.stop === 'string' ? s.stop : Object.keys(s.stop)[0]}`, id)
  for (const k of Object.keys(s.needed && typeof s.needed === 'object' ? s.needed : {})) mark(`needed:${k}`, id)
  const scope = s.scope || {}
  for (const k of Object.keys(scope)) mark(`scope:${k}`, id)
  const terms = s.terms || {}
  for (const k of Object.keys(terms)) mark(`terms:${k}`, id)
  if (terms.repeat && typeof terms.repeat === 'object') for (const k of Object.keys(terms.repeat)) mark(`repeatEvent:${k}`, id)
  for (const l of Array.isArray(terms.lines) ? terms.lines : []) for (const k of Object.keys(l)) mark(`line:${k}`, id)
}
function walk(node, id) {
  if (Array.isArray(node)) return node.forEach((x) => walk(x, id))
  if (node === null || typeof node !== 'object') return
  if (typeof node.type === 'string' && node.state && typeof node.state === 'object' && node.refs && typeof node.refs === 'object') { if (id) scanBlock(node, id) }
  for (const [k, v] of Object.entries(node)) walk(v, id)
}
function scanVectors() {
  const sections = Object.entries(V).filter(([k]) => k !== '$comment' && k !== 'keys')
  const visit = (node, label, id) => {
    if (Array.isArray(node)) { node.forEach((x, i) => visit(x, label, id)); return }
    if (node === null || typeof node !== 'object') return
    const here = id || (typeof node.name === 'string' ? `${label}: ${node.name}` : null)
    if (typeof node.type === 'string' && node.state && node.refs && here) scanBlock(node, here)
    for (const [k, v] of Object.entries(node)) visit(v, label, here)
  }
  for (const [k, v] of sections) visit(v, k, null)
}
scanVectors()
const scanKey = (s) => s && (s.state ? `state:${s.state}` : s.terms ? `terms:${s.terms}` : s.line ? `line:${s.line}` : s.scope ? `scope:${s.scope}` : s.refs ? `refs:${s.refs}` : s.type ? `type:${s.type}` : s.status ? `status:${s.status}` : s.stop ? `stop:${s.stop}` : s.power ? `power:${s.power}` : s.reason ? `reason:${s.reason}` : s.needed ? `needed:${s.needed}` : s.repeatEvent ? `repeatEvent:${s.repeatEvent}` : null)

// ---------------------------------------------------------------- scratch copies and the runs
const COPY = [['spec', (n) => n !== 'ietf'], ['test/audit'], ['tools/fuzz', (n) => n !== 'target'], ['sdk/javascript/src'], ['sdk/rust/src', (n) => n !== 'target'], ['sdk/javascript/core'], ['sdk/javascript/spec'], ['sdk/javascript/package.json']]
function copyTo(dir) {
  for (const [rel, keep] of COPY) {
    const from = path.join(ROOT, rel), to = path.join(dir, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.cpSync(from, to, { recursive: true, filter: (src) => !keep || keep(path.basename(src)) })
  }
  // the sound part and the word ops' cases only (vectors.json): the conventions' cases are no evidence of the protocol (07-last.md E6)
  fs.writeFileSync(path.join(dir, 'spec', 'conventions-vectors.json'), JSON.stringify({ door: [] }))
}
// Every run has a time limit: four times what the unmutated run took (at least two minutes), set by the base runs in `measure`. A run that
// passes it is stopped, it and its children, and counts as a failed check: a part without which an engine never answers is needed, and the
// table names it ("hung"). (end pass 2026-11-20: one mutated build spun for thirteen hours with no limit.)
// (the unmutated base runs, which set the limits, are bounded only by four hours: a slow machine is no failure of the spec)
const LIMIT = { oracle: 14400000, audit: 14400000, core: 14400000 }
const limitFrom = (ms) => Math.max(120000, 4 * ms)
function spawnLimited(cmd, args, opts, limitMs) {
  return new Promise((resolve) => {
    const started = Date.now()
    const c = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    let out = '', hung = false
    c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d))
    const timer = setTimeout(() => { hung = true; try { process.kill(-c.pid, 'SIGKILL') } catch { try { c.kill('SIGKILL') } catch {} } }, limitMs)
    c.on('close', (code) => { clearTimeout(timer); resolve({ code, out, hung, ms: Date.now() - started }) })
  })
}
function run(dir, args, limitMs) {
  return spawnLimited(process.execPath, args, { cwd: dir }, limitMs)
}
const hungNote = (what, r, limitMs) => `${what} hung: no answer within ${Math.round(limitMs / 1000)} s (four times the unmutated run), stopped`
function without(p, name) {
  const o = JSON.parse(JSON.stringify(P))
  const holder = get(p, o)
  if (Array.isArray(holder)) holder.splice(holder.indexOf(name), 1)
  else delete holder[name]
  return JSON.stringify(o, null, 1)
}
// Ref keys the folds read by name, not through a list: for these the oracle is also made blind to the key (every
// `.key` and `'key'` in its source renamed), which is what deleting the verb from the protocol means for a fold.
const BLIND = new Set(P.read_by_name)
const ORACLE = (dir) => path.join(dir, 'spec', 'oracle', 'fb.cjs')
async function oracleFails(dir, protocolText, withAudit, blind) {
  fs.writeFileSync(path.join(dir, 'spec', 'protocol.json'), protocolText)
  const original = blind ? fs.readFileSync(ORACLE(dir), 'utf8') : null
  if (blind) fs.writeFileSync(ORACLE(dir), original.replace(new RegExp(`\\.${blind}\\b(?!\\()`, 'g'), `.__off_${blind}`).replace(new RegExp(`(['"])${blind}\\1`, 'g'), `$1__off_${blind}$1`))
  try {
    return await oracleRun(dir, withAudit)
  } finally { if (blind) fs.writeFileSync(ORACLE(dir), original) }
}
async function oracleRun(dir, withAudit) {
  const a = await run(dir, ['spec/oracle/run.cjs', '-v'], LIMIT.oracle)
  const fails = []
  if (a.hung) return { fails: [hungNote('oracle', a, LIMIT.oracle)], started: true, ms: a.ms }
  for (const line of a.out.split('\n')) if (line.startsWith('FAIL ')) fails.push('oracle ' + line.slice(5).trim())
  let started = a.out.split('\n').filter((l) => /^(ok|FAIL) /.test(l)).length > 500
  // The audit worlds (the SDK against the oracle) matter when the vectors themselves do not notice.
  if (withAudit && !fails.length && started) {
    const b = await run(dir, ['test/audit/run.cjs'], LIMIT.audit)
    if (b.hung) return { fails: [hungNote('audit', b, LIMIT.audit)], started: true, ms: a.ms, auditMs: b.ms }
    for (const line of b.out.split('\n')) {
      if (line.startsWith('✗ ')) fails.push('audit ' + line.slice(2).split(':')[0].trim())
      else if (line.trim().startsWith('differs: ')) fails.push('audit parity ' + line.trim().slice(9).split(' (')[0])
    }
    started = /\d+ passed, \d+ failed/.test(b.out)
    return { fails: [...new Set(fails)], started, ms: a.ms, auditMs: b.ms }
  }
  return { fails: [...new Set(fails)], started, ms: a.ms }
}
// The Rust core, built from the mutated list, against every vector.
async function coreFails(dir, target, protocolText) {
  fs.writeFileSync(path.join(dir, 'spec', 'protocol.json'), protocolText)
  fs.writeFileSync(path.join(dir, 'sdk', 'rust', 'spec', 'protocol.json'), protocolText)
  const r = await spawnLimited('cargo', ['test', '--test', 'vectors', '--locked'], { cwd: path.join(dir, 'sdk', 'rust'), env: { ...process.env, CARGO_TARGET_DIR: target } }, LIMIT.core)
  if (r.hung) return { fails: [hungNote('core', r, LIMIT.core)], started: true, ms: r.ms }
  const out = r.out
  const m = out.match(/(\d+) passed, (\d+) failed:\s*([^\n]*)/)
  if (m) return { fails: Number(m[2]) ? [`core ${m[2]} vectors, first: ${m[3].replace(/\s+None\s*$/, '').replace(/\s+/g, ' ').slice(0, 80).replace(/\|/g, '/')}`] : [], started: true, ms: r.ms }
  return { fails: [], started: /test result: ok/.test(out), ms: r.ms }
}

async function measure(list = things) {
  const workers = Math.max(1, Math.min(5, os.cpus().length - 2))
  const dirs = []
  for (let i = 0; i < workers; i++) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-necessity-')); copyTo(d); dirs.push(d) }
  const coreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-necessity-core-'))
  fs.cpSync(path.join(ROOT, 'spec'), path.join(coreDir, 'spec'), { recursive: true, filter: (src) => path.basename(src) !== 'ietf' })
  fs.writeFileSync(path.join(coreDir, 'spec', 'conventions-vectors.json'), JSON.stringify({ door: [] }))
  fs.mkdirSync(path.join(coreDir, 'test'), { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'test', 'vectors.json'), path.join(coreDir, 'test', 'vectors.json'))
  fs.cpSync(path.join(ROOT, 'sdk', 'rust'), path.join(coreDir, 'sdk', 'rust'), { recursive: true, filter: (src) => path.basename(src) !== 'target' })
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-necessity-target-'))
  const whole = JSON.stringify(P, null, 1)
  const base = await oracleFails(dirs[0], whole, true), baseCore = await coreFails(coreDir, target, whole)
  if (!base.started || base.fails.length) throw new Error('the unmutated spec already fails the oracle: ' + base.fails.slice(0, 3).join('; '))
  if (!baseCore.started || baseCore.fails.length) throw new Error('the unmutated spec already fails the core: ' + baseCore.fails.slice(0, 3).join('; '))
  // the limits: four times what the unmutated runs took (the core's run includes its build, as every mutated run's does)
  LIMIT.oracle = limitFrom(base.ms || 0); LIMIT.audit = limitFrom(base.auditMs || 0); LIMIT.core = limitFrom(baseCore.ms || 0)
  console.log(`limits: oracle ${Math.round(LIMIT.oracle / 1000)} s, audit ${Math.round(LIMIT.audit / 1000)} s, core ${Math.round(LIMIT.core / 1000)} s`)
  const results = new Map()
  let next = 0
  const pool = Promise.all(dirs.map(async (dir) => {
    while (next < list.length) {
      const t = list[next++]
      results.set(t, { oracle: await oracleFails(dir, without(t.path, t.name), true, BLIND.has(t.name) && /^(verb|ref key|stop kind)/.test(t.kind) ? t.name : null) })
    }
  }))
  const coreRun = (async () => { for (const t of list) { const r = await coreFails(coreDir, target, without(t.path, t.name)); coreResults.set(t, r) } })()
  const coreResults = new Map()
  await Promise.all([pool, coreRun])
  for (const t of list) { const o = results.get(t).oracle, c = coreResults.get(t); results.set(t, { fails: [...o.fails, ...c.fails], started: o.started || c.started }) }
  for (const d of [...dirs, coreDir, target]) fs.rmSync(d, { recursive: true, force: true })
  return results
}

// ---------------------------------------------------------------- who reads a thing in code (this repository)
function sourceFiles() {
  const roots = ['sdk/rust/src', 'sdk/javascript/src', 'spec/oracle/fb.cjs', 'host/src', 'mcp', 'cli/bin', 'sdk/python/foodblock', 'sdk/go', 'sdk/swift/Sources', 'sdk/kotlin/foodblock/src/main']
  const out = []
  const walkDir = (p) => {
    if (!fs.existsSync(p)) return
    const st = fs.statSync(p)
    if (st.isDirectory()) { for (const n of fs.readdirSync(p)) if (n !== 'node_modules' && n !== 'target' && n !== 'test' && n !== 'tests') walkDir(path.join(p, n)) }
    else if (/\.(rs|cjs|js|py|go|swift|kt)$/.test(p) && !/_test\.go$/.test(p)) out.push(p)
  }
  for (const r of roots) walkDir(path.join(ROOT, r))
  return out.map((f) => fs.readFileSync(f, 'utf8'))
}
const SRC = sourceFiles()
const readers = (name) => {
  const rx = new RegExp(`(["'\`]${name}["'\`])|(\\.${name}\\b(?!\\())|(\\b${name}\\s*:)|(\\.get\\("${name}"\\))`)
  return SRC.filter((s) => rx.test(s)).length
}

// ---------------------------------------------------------------- the invariants
// A vector states the invariants it carries itself (`invariants: [n]` on the case; a section such as `messages` may carry one for
// all its parts). The numbers stated in the module text are the ones under an Invariants heading, and every number a vector carries
// must be stated there as a numbered line.
function carriers() {
  const by = new Map() // n -> [case ids]
  const take = (list, id) => { for (const n of list) { if (!by.has(n)) by.set(n, []); by.get(n).push(id) } }
  const visit = (node, label, id) => {
    if (Array.isArray(node)) { node.forEach((x) => visit(x, label, id)); return }
    if (node === null || typeof node !== 'object') return
    if (!id && typeof node.name === 'string') { id = `${label}: ${node.name}`; if (Array.isArray(node.invariants)) take(node.invariants, id) }
    for (const [k, v] of Object.entries(node)) visit(v, label, id)
  }
  for (const [k, v] of Object.entries(V)) {
    if (k === '$comment' || k === 'keys') continue
    if (Array.isArray(v.invariants)) take(v.invariants, k)
    visit(v, k, null)
  }
  // an invariant a reading or a node's convention shows is carried by its case there too (spec/conventions-vectors.json): the mutation
  // measure leaves those cases out as no evidence of the protocol, but a case still shows the rule it states
  const C = path.join(ROOT, 'spec', 'conventions-vectors.json')
  if (fs.existsSync(C)) visit(JSON.parse(fs.readFileSync(C, 'utf8')).door || [], 'conventions', null)
  return by
}
function invariantRows() {
  const files = ['core.md', ...fs.readdirSync(path.join(ROOT, 'spec', 'modules')).map((f) => path.join('modules', f))]
  const text = files.map((f) => fs.readFileSync(path.join(ROOT, 'spec', f), 'utf8')).join('\n')
  const stated = new Set()
  let under = false
  for (const line of text.split('\n')) { if (/^## /.test(line)) under = /nvariants/.test(line); else if (under) { const m = line.match(/^(\d+)\. /); if (m) stated.add(Number(m[1])) } }
  const by = carriers()
  const numbers = [...new Set([...stated, ...by.keys()])].sort((a, b) => a - b)
  return numbers.map((n) => ({ n, stated: new RegExp(`^${n}\\. `, 'm').test(text), count: (by.get(n) || []).length, examples: (by.get(n) || []).slice(0, 2) }))
}

// ---------------------------------------------------------------- the table
const cell = (s) => String(s).replace(/\|/g, '\\|')
function verdict(t, r, usedBy) {
  if (!r.started) return 'STRUCTURAL'
  if (r.fails.length) return 'COVERED'
  if (usedBy.length) return 'USED'
  const n = readers(t.name)
  return n ? 'UNTESTED' : 'DEAD'
}
// ---------------------------------------------------------------- a partial measure (--only)
// `--only a,b` measures again only the named things (a name, or a thing's id) and keeps every other verdict of the page as it stands.
// That is sound only while the vectors since the last measure have only gained cases: an added case can only add a failure to a
// mutation, never take one away, so a thing the page shows COVERED stays covered. The tool checks it: each measure writes the digest of
// every case it ran (tools/necessity/measured-cases.json), and --only refuses unless every one of those is still there, unchanged.
// The carry-it scan is redone for every thing.
const CASES = path.join(ROOT, 'tools', 'necessity', 'measured-cases.json')
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
function caseDigests(Vx) {
  const out = []
  const strip = (c) => { const { name, invariants, ...rest } = c; return rest }
  for (const [k, v] of Object.entries(Vx)) {
    if (k === '$comment' || k === 'keys' || k === 'invariant_numbers') continue
    const each = Array.isArray(v) ? v : isPlain(v) ? Object.values(v).flatMap((x) => (Array.isArray(x) ? x : [x])) : []
    for (const c of each) if (isPlain(c)) out.push(k + ':' + require('crypto').createHash('sha256').update(JSON.stringify(strip(c))).digest('hex'))
  }
  return [...new Set(out)].sort()
}
function isPlain(x) { return x !== null && typeof x === 'object' && !Array.isArray(x) }
// the engines the measure ran: a change to either can take a failure away as well as add one, so --only also needs them unchanged
function engineDigest() {
  const files = []
  const walk = (d) => { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.rs$/.test(n)) files.push(p) } }
  walk(path.join(ROOT, 'sdk', 'rust', 'src'))
  files.push(path.join(ROOT, 'spec', 'oracle', 'fb.cjs'))
  const h = require('crypto').createHash('sha256')
  for (const f of files) h.update(path.relative(ROOT, f)).update(fs.readFileSync(f))
  return 'engines:' + h.digest('hex')
}
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : null })()
function previousRows() {
  const text = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  const rows = new Map()
  let kind = null
  for (const line of text.split('\n')) {
    const h = line.match(/^## (.+)$/)
    if (h) { kind = h[1]; continue }
    const m = line.match(/^\| `([^`]+)` \| (\w+)(?: \(kept[^)]*\))? \| (.*?) \| ((?:[^|]|\\\|)*) \|$/)
    if (m && kind) rows.set(`${kind}|${m[1]}`, { verdict: m[2], failsCell: m[3] })
  }
  return rows
}
async function build() {
  const title = (k) => `${k[0].toUpperCase()}${k.slice(1)}`
  let list = things, prev = null
  if (ONLY) {
    const baseline = opt('--measured-against') ? caseDigests(JSON.parse(fs.readFileSync(opt('--measured-against'), 'utf8'))) : fs.existsSync(CASES) ? JSON.parse(fs.readFileSync(CASES, 'utf8')) : null
    if (!baseline) throw new Error('--only needs the cases the last measure ran (tools/necessity/measured-cases.json, or --measured-against <vectors file>): run the full measure')
    const now = new Set([...caseDigests(V), engineDigest()])
    const gone = baseline.filter((d) => !d.startsWith('engines:') && !now.has(d))
    if (baseline.some((d) => d.startsWith('engines:')) && !now.has(baseline.find((d) => d.startsWith('engines:')))) throw new Error('--only is not sound: the engines changed since the last measure (sdk/rust/src or spec/oracle/fb.cjs): run the full measure')
    if (gone.length) throw new Error(`--only is not sound: ${gone.length} case(s) the last measure ran are gone or changed (first: ${gone[0]}): run the full measure`)
    list = things.filter((t) => ONLY.includes(t.name) || ONLY.includes(t.id))
    if (list.length === 0) throw new Error('--only names no listed thing')
    prev = previousRows()
  }
  const results = await measure(list)
  const rows = []
  for (const t of things) {
    const key = scanKey(t.scan)
    const usedBy = key && used.has(key) ? [...used.get(key)].sort() : []
    const r = results.get(t)
    if (r) { rows.push({ t, v: verdict(t, r, usedBy), fails: r.fails, usedBy, readers: readers(t.name) }); continue }
    const p = prev.get(`${title(t.kind)}|${t.name}`)
    if (!p) throw new Error(`--only: the page has no earlier verdict for ${t.kind} ${t.name}: run the full measure`)
    const v = p.verdict === 'COVERED' || p.verdict === 'STRUCTURAL' ? p.verdict : verdict(t, { started: true, fails: [] }, usedBy)
    rows.push({ t, v, fails: [], failsCell: p.failsCell, usedBy, readers: readers(t.name) })
  }
  fs.mkdirSync(path.dirname(CASES), { recursive: true })
  fs.writeFileSync(CASES, JSON.stringify([...caseDigests(V), engineDigest()]) + '\n')
  return rows
}
function render(rows, inv) {
  const count = (v) => rows.filter((r) => r.v === v).length
  const lines = []
  lines.push('# Necessity', '')
  lines.push('The evidence that each part of the protocol is hard to vary. Generated by `node tools/necessity.cjs` from `spec/protocol.json` and the vectors; `node tools/necessity.cjs --check` (and `test/necessity.cjs`) fails if this page is out of date or a part has no test. Do not edit it by hand.', '')
  lines.push('**Method.** For each listed thing, a scratch copy of the spec has that one thing deleted from `protocol.json`, and two engines run every vector: the spec-only oracle (`spec/oracle/run.cjs`, then the audit worlds `test/audit/run.cjs`, where the SDK and the oracle must give the same answer) and the Rust core (`cargo test --test vectors`, built from the changed list). For a verb or ref key a fold reads by name, the oracle is also made blind to that key. Only the cases of the sound part and of the word ops are run (`vectors.json`; the cases of readings, library tools and a node\'s conventions are no evidence of the protocol, core.md section 12). A run that gives no answer within four times the time of the unmutated run is stopped and counts as failed (`hung`): a part without which an engine never answers is needed. What fails is shown (`oracle ...` and `audit ...` are checks of the oracle and the audit; `core N vectors` is the Rust core). `required` and `needs` in `protocol.json` are prose summaries of core.md sections 7 and 5, read by no engine, so they are not mutated; refusal vectors carry them. \"Carry it\" lists the vectors whose blocks hold the thing, from a scan of `spec/vectors.json`.', '')
  if (ONLY) lines.push(`**Measured in part.** This page was last measured with \`--only ${ONLY.join(', ')}\`: those things were measured again. Every other verdict is the earlier full measure's. That stands because the vectors since then only gained cases (the tool checks every case the earlier measure ran is still there, unchanged), and an added case can only add a failure to a mutation, never take one away. The carry-it scan is redone for every thing.`, '')
  lines.push('- **COVERED**: deleting it fails at least one vector or audit check.', '- **USED**: nothing fails, but a vector\'s valid block carries it (shown working, not enforced).', '- **UNTESTED**: code reads it and no vector carries it. It needs a vector.', '- **DEAD**: nothing reads it and no vector carries it. Delete it.', '- **STRUCTURAL**: the engine cannot start without it.', '')
  lines.push(`**Summary.** ${rows.length} listed things: ${count('COVERED')} covered, ${count('USED')} used, ${count('STRUCTURAL')} structural, ${count('UNTESTED')} untested, ${count('DEAD')} dead. ${inv.length} numbered invariants: ${inv.filter((i) => i.stated && i.count).length} stated in the spec and carried by a vector.`, '')
  const kinds = [...new Set(rows.map((r) => r.t.kind))]
  for (const k of kinds) {
    lines.push(`## ${k[0].toUpperCase()}${k.slice(1)}`, '', '| Thing | Verdict | Fails without it (first three) | Vectors that carry it (count: first two) |', '|---|---|---|---|')
    for (const r of rows.filter((x) => x.t.kind === k)) {
      const f = r.failsCell !== undefined ? r.failsCell : r.fails.length ? `${r.fails.length}: ${r.fails.slice(0, 3).map(cell).join('; ')}` : ''
      const u = r.usedBy.length ? `${r.usedBy.length}: ${r.usedBy.slice(0, 2).map(cell).join('; ')}` : ''
      lines.push(`| \`${r.t.name}\` | ${r.v}${KEPT[r.t.id] ? ' (kept: ' + cell(KEPT[r.t.id]) + ')' : ''} | ${f} | ${u} |`)
    }
    lines.push('')
  }
  lines.push('## Invariants', '', 'Each invariant is stated in a module (the number and its first words are checked against the text). The cases listed state it: each says so in its own `invariants` field (not a mutation), and every invariant is stated in the spec and carried by at least one case.', '', '| Invariant | Stated in the spec | Vector cases that carry it | Examples |', '|---|---|---|---|')
  for (const i of inv) lines.push(`| ${i.n} | ${i.stated ? 'yes' : 'NO'} | ${i.count} | ${i.examples.map(cell).join('; ')} |`)
  lines.push('')
  return lines.join('\n')
}

// The fast check: no mutation. Reads the table back and holds it to the spec and the vectors as they are now.
function checkFast() {
  const text = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  const rows = new Map()
  let kind = null
  for (const line of text.split('\n')) {
    const h = line.match(/^## (.+)$/)
    if (h) { kind = h[1]; continue }
    const m = line.match(/^\| `([^`]+)` \| (\w+)(?: \(kept[^)]*\))? \| ([^|]*) \| ([^|]*) \|$/)
    if (m && kind) rows.set(`${kind}|${m[1]}`, { verdict: m[2], used: Number((m[4].match(/^(\d+):/) || [0, 0])[1]) })
  }
  const title = (k) => `${k[0].toUpperCase()}${k.slice(1)}`
  let wrong = 0
  const say = (msg) => { wrong++; console.log(msg) }
  for (const t of things) {
    const row = rows.get(`${title(t.kind)}|${t.name}`)
    if (!row) { say(`missing from spec/NECESSITY.md: ${t.kind} ${t.name} (run node tools/necessity.cjs)`); continue }
    const key = scanKey(t.scan)
    const n = key && used.has(key) ? used.get(key).size : 0
    if ((n > 0) !== (row.used > 0)) say(`${n ? 'a vector now carries' : 'no vector carries'} ${t.kind} ${t.name} (the table says otherwise): run node tools/necessity.cjs`)
    if ((row.verdict === 'DEAD' || row.verdict === 'UNTESTED') && !KEPT[t.id]) say(`${row.verdict}: ${t.kind} ${t.name}`)
    if (row.verdict === 'COVERED' || row.verdict === 'USED') { if (!n && row.verdict === 'USED') say(`${t.kind} ${t.name} is USED but no vector carries it now`) }
  }
  const have = new Set(things.map((t) => `${title(t.kind)}|${t.name}`))
  for (const k of rows.keys()) if (!have.has(k) && !k.startsWith('Invariants')) say(`spec/NECESSITY.md lists a thing protocol.json no longer has: ${k.replace('|', ' ')}`)
  for (const i of invariantRows()) if (!i.stated || !i.count) say(`invariant ${i.n}: ${i.stated ? 'no vector' : 'not stated in the spec'}`)
  console.log(wrong ? `${wrong} problems` : `necessity table current: ${things.length} things, ${invariantRows().length} invariants, none dead or untested`)
  process.exit(wrong ? 1 : 0)
}

async function main() {
  if (process.argv.includes('--check')) return checkFast()
  const rows = await build()
  const inv = invariantRows()
  const text = render(rows, inv)
  const bad = rows.filter((r) => (r.v === 'DEAD' || r.v === 'UNTESTED') && !KEPT[r.t.id])
  const badInv = inv.filter((i) => !i.stated || !i.count)
  if (process.argv.includes('--full')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
    const same = current === text
    console.log(same ? 'spec/NECESSITY.md is exactly what the tests say today' : 'spec/NECESSITY.md differs from what the tests say today: run node tools/necessity.cjs')
    process.exit(same && !bad.length && !badInv.length ? 0 : 1)
  }
  fs.writeFileSync(OUT, text)
  const c = (v) => rows.filter((r) => r.v === v).length
  console.log(`${rows.length} things: ${c('COVERED')} covered, ${c('USED')} used, ${c('STRUCTURAL')} structural, ${c('UNTESTED')} untested, ${c('DEAD')} dead; invariants: ${inv.length - badInv.length}/${inv.length} stated and carried`)
  for (const r of bad) console.log(`  ${r.v}: ${r.t.kind} ${r.t.name} (readers: ${r.readers})`)
  for (const i of badInv) console.log(`  invariant ${i.n}: ${i.stated ? 'no vector' : 'not stated'}`)
}
main().catch((e) => { console.error(e.message); process.exit(1) })
