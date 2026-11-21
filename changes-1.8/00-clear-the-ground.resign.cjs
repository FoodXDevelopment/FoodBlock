// One-off tool for 1.8 stage 0 (changes-1.8/00-clear-the-ground.md): rewrites a vectors file for the rename of a grant's
// `scope.acts` to `scope.types`, the deletion of `refs.act` and of the base schema `act`, and the new base-schema chain.
//   node changes-1.8/00-clear-the-ground.resign.cjs <file.json> [--old-published path] [--keys-from-fuzz seed]
// Every block whose bytes change is re-hashed and re-signed with its fixed-seed key, to a fixed point; every old id is
// replaced by its new id wherever it is written (refs, state, expectations, names, object keys). Door cases named
// "act: ..." are removed. A block whose key cannot be found, or that was not validly signed before, is listed, not touched.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const fb = require('../sdk/javascript/src/index.cjs')
const door = require('../sdk/javascript/src/door.cjs')

const args = process.argv.slice(2)
const FILE = args[0]
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null)
const OLD_PUB = JSON.parse(fs.readFileSync(opt('--old-published') || '/tmp/s0/published.old.json', 'utf8'))
const NEW_PUB = JSON.parse(fs.readFileSync(path.join(__dirname, '../spec/schemas/published.json'), 'utf8'))
const root = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x)
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex')
const clone = (x) => JSON.parse(JSON.stringify(x))
const canon = (b) => door.canonical(b.type, b.state, b.refs)

// ---- keys: every private key we can name
const keys = new Map() // public_key_sign -> { private_key, suite }
const addKey = (kp, suite) => { if (kp && kp.public_key_sign && kp.private_key) keys.set(kp.public_key_sign, { private_key: kp.private_key, suite: suite || kp.suite || 'std' }) }
for (const k of Object.values(root.keys || {})) addKey(k, k.suite)
addKey(fb.keypairFromSeed(sha(NEW_PUB.publisher.seed_text), 'std'), 'std')
// the vector makers' keys: sha256("foodblock 1.7 vectors: " + name) for every quoted name in the makers and tests
const texts = []
// (MAKERS_FROM names more directories of makers to read names from, such as the makers as they stood at HEAD)
const dirs = ['sdk/javascript/test', 'spec/profiles/epcis', 'test/audit'].map((d) => path.join(__dirname, '..', d)).concat((process.env.MAKERS_FROM || '').split(':').filter(Boolean))
for (const dir of dirs) {
  for (const f of fs.readdirSync(dir)) if (/\.(c?js)$/.test(f)) texts.push(fs.readFileSync(path.join(dir, f), 'utf8'))
}
const names = new Set()
for (const t of texts) for (const m of t.matchAll(/['"`]([^'"`\n]{1,60})['"`]/g)) names.add(m[1])
const PREFIXES = ['foodblock 1.7 vectors: ', 'foodblock 1.6 vectors: ', 'foodblock 1.6 causal vectors: ', 'foodblock 1.6 phase 2 vectors: ', 'foodblock 1.6 phase 4 vectors: ', 'foodblock 1.6 refine vectors: ', 'foodblock 1.6 epcis vectors: ']
for (const n of names) for (const pre of PREFIXES) addKey(fb.keypairFromSeed(sha(pre + n), 'std'), 'std')
if (opt('--keys-from-fuzz')) {
  // a fuzz world draws its keys from its seed: run it and keep every key it makes
  const real = fb.keypair || fb.keypairFromSeed
  const seen = []
  const wrap = (fn) => (seed, suite) => { const kp = fn(seed, suite); seen.push([kp, suite]); return kp }
  fb.keypair = wrap(fb.keypairFromSeed); fb.keypairFromSeed = wrap(fb.keypairFromSeed)
  const { makeWorld } = require('../tools/fuzz/diff.cjs')
  for (const size of [10, 20, 40, 60, 80, 120]) { try { makeWorld(Number(opt('--keys-from-fuzz')), size) } catch (e) { /* a size that fails still drew its keys */ } }
  for (const [kp, suite] of seen) addKey(kp, suite)
  fb.keypair = real
}
console.error(`${keys.size} keys`)

// ---- the old and new base-schema chain
const idmap = new Map() // old id -> new id
const pubNew = new Map() // old id -> the new published block
const dropped = new Set([OLD_PUB.schemas.act.hash])
for (const n of OLD_PUB.order) {
  if (n === 'act') continue
  const o = OLD_PUB.schemas[n], b = NEW_PUB.schemas[n]
  if (o.hash !== b.hash) { idmap.set(o.hash, b.hash); pubNew.set(o.hash, b) }
}

// ---- every block in the file, in either form: flat { hash?, type, state, refs, signature?, suite? }, or a story
// entry { hash, signer, block: { type, state, refs }, signature, suite? }
const holders = []
const walk = (x) => {
  if (Array.isArray(x)) return x.forEach(walk)
  if (!isObj(x)) return
  if (typeof x.type === 'string' && isObj(x.state) && isObj(x.refs)) holders.push({ o: x, body: x })
  else if (isObj(x.block) && typeof x.block.type === 'string' && isObj(x.block.state) && isObj(x.block.refs) && typeof x.hash === 'string') holders.push({ o: x, body: x.block })
  for (const v of Object.values(x)) walk(v)
}
walk(root)

// the content a block has after the stage: scope.types, no refs.act, every mapped id replaced
const pubmap = new Map() // a signing key nobody can name any more -> the fixed key that replaces it
const remapValue = (v) => {
  if (typeof v === 'string') return idmap.has(v) ? idmap.get(v) : pubmap.has(v) ? pubmap.get(v) : v
  if (Array.isArray(v)) {
    const out = v.map(remapValue)
    const wasSorted = v.every((x, i) => i === 0 || typeof x !== 'string' || typeof v[i - 1] !== 'string' || v[i - 1] < x)
    if (wasSorted && out.every((x) => typeof x === 'string') && out.some((x, i) => x !== v[i])) out.sort()
    return out
  }
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, y]) => [idmap.has(k) ? idmap.get(k) : k, remapValue(y)]))
  return v
}
const after = (body) => {
  const state = clone(body.state), refs = clone(body.refs)
  if (isObj(state.scope) && 'acts' in state.scope) state.scope = Object.fromEntries(Object.entries(state.scope).map(([k, v]) => [k === 'acts' ? 'types' : k, v]))
  delete refs.act
  return { type: body.type, state: remapValue(state), refs: remapValue(refs) }
}

// find the key that signed a block, by its old signature
// the signing keys each author may use: her genesis key and every key a key grant names, then any key we hold
const pubsOf = new Map()
const note = (id, pub) => { if (typeof id !== 'string' || typeof pub !== 'string') return; if (!pubsOf.has(id)) pubsOf.set(id, new Set()); pubsOf.get(id).add(pub) }
const grantKeys = new Set()
for (const h of holders) {
  const b = h.body
  if (b.type === 'actor' && !b.refs.author) note(typeof h.o.hash === 'string' ? h.o.hash : null, b.state.public_key_sign)
  if (b.type === 'grant' && typeof b.state.public_key_sign === 'string') { grantKeys.add(b.state.public_key_sign); for (const k of ['subject', 'to', 'author']) note(b.refs[k], b.state.public_key_sign) }
  if (typeof b.state.recovery_key === 'string') grantKeys.add(b.state.recovery_key)
}
const allPubs = new Set([...grantKeys, ...[...pubsOf.values()].flatMap((s) => [...s])])
// which public key signed it: verifying needs no private key
const signingPub = (h) => {
  const b = h.body, sig = h.o.signature
  if (typeof sig !== 'string') return null
  const author = (b.refs && b.refs.author) || null
  const tryKey = (pub) => typeof pub === 'string' && fb.verify({ type: b.type, state: b.state, refs: b.refs }, sig, pub)
  if (!author && tryKey(b.state.public_key_sign)) return b.state.public_key_sign
  for (const pub of pubsOf.get(author) || []) if (tryKey(pub)) return pub
  for (const pub of grantKeys) if (tryKey(pub)) { note(author, pub); return pub }
  for (const pub of allPubs) if (tryKey(pub)) { note(author, pub); return pub }
  return null
}
// the private key to sign with: the key itself when we can name it, else a fixed key that takes its place everywhere (its author's
// genesis then names the new key, so her id and every block of hers are re-signed in turn)
const rekeyed = []
const keyFor = (pub) => {
  if (pubmap.has(pub)) return keys.get(pubmap.get(pub))
  if (keys.has(pub)) return keys.get(pub)
  const suite = fb.suiteOfKey(pub) || 'std'
  const kp = fb.keypairFromSeed(sha('foodblock 1.8 stage 0 re-keyed: ' + pub), suite)
  addKey(kp, suite); pubmap.set(pub, kp.public_key_sign); rekeyed.push(pub)
  return keys.get(kp.public_key_sign)
}

// ---- to a fixed point: each block whose content changes gets its new id
// a block's id as written, or (a signed block written without one) as its bytes give it
const idOfHolder = (o, body) => (typeof o.hash === 'string' ? o.hash : fb.hash(body.type, body.state, body.refs, o.suite && o.suite !== 'std' ? o.suite : undefined))
// one holder per id: the copy whose bytes give its id (a case may also hold a tampered copy under the same id: it is written below)
const unique = new Map() // old id -> holder
const own = (h, id) => fb.hash(h.body.type, h.body.state, h.body.refs, id.startsWith('sm3:') ? 'sm' : undefined) === id
for (const h of holders) {
  if (typeof h.o.hash !== 'string' && typeof h.o.signature !== 'string') continue
  const id = idOfHolder(h.o, h.body)
  if (!unique.has(id) || (!own(unique.get(id), id) && own(h, id))) unique.set(id, h)
}
const origCanon = new Map([...unique].map(([id, h]) => [id, canon(h.body)]))
const newBody = new Map(), newSig = new Map(), problems = []
const stuck = new Set(), unsignedKept = new Set()
for (let pass = 1; ; pass++) {
  let grew = 0
  for (const [old, h] of unique) {
    if (pubNew.has(old) || dropped.has(old) || stuck.has(old)) continue
    const next = after(h.body)
    if (canon(next) === canon(h.body)) continue
    const prev = newBody.get(old)
    if (prev && canon(prev) === canon(next)) continue
    const actual = fb.hash(h.body.type, h.body.state, h.body.refs, old.startsWith('sm3:') ? 'sm' : undefined)
    if (typeof h.o.hash === 'string' && actual !== old) { problems.push(`not its own hash, changed by the stage: ${old}`); stuck.add(old); continue }
    const pub = signingPub(h)
    if (!pub) {
      // its signature opens under no key (a placeholder, or a key the case never shows): its id follows its new bytes, and its
      // signature is left as it was, opening under no key as before
      const id = fb.hash(next.type, next.state, next.refs, old.startsWith('sm3:') ? 'sm' : undefined)
      if (!unsignedKept.has(old)) problems.push(`signature opens under no key, kept as it was: ${old} (${h.body.type} ${h.body.state.kind || ''})`)
      unsignedKept.add(old); newBody.set(old, next); newSig.set(old, h.o.signature)
      if (idmap.get(old) !== id) { idmap.set(old, id); grew++ }
      continue
    }
    const k = keyFor(pub)
    const id = fb.hash(next.type, next.state, next.refs, k.suite === 'std' ? undefined : k.suite)
    newBody.set(old, next)
    newSig.set(old, fb.sign(next, k.private_key, k.suite === 'std' ? undefined : k.suite))
    if (idmap.get(old) !== id) { idmap.set(old, id); grew++ }
  }
  console.error(`pass ${pass}: ${grew} new ids`)
  if (!grew) break
}

const tampered = new Set()
// ---- write: replace each block, drop the act schema and the act cases, then every remaining old id
const replaceIn = (x) => {
  if (Array.isArray(x)) {
    for (let i = x.length - 1; i >= 0; i--) {
      const y = x[i]
      if (isObj(y) && dropped.has(y.hash)) { x.splice(i, 1); continue }
      if (isObj(y) && typeof y.name === 'string' && y.name.startsWith('act: ')) { x.splice(i, 1); continue }
      replaceIn(y)
    }
    return
  }
  if (!isObj(x)) return
  if (typeof x.hash === 'string' && pubNew.has(x.hash) && typeof x.type === 'string') {
    const b = pubNew.get(x.hash)
    for (const k of Object.keys(x)) delete x[k]
    Object.assign(x, clone(b))
    return
  }
  const body = typeof x.type === 'string' && isObj(x.state) && isObj(x.refs) ? x : isObj(x.block) && typeof x.hash === 'string' ? x.block : null
  if (body && (typeof x.hash === 'string' || typeof x.signature === 'string')) {
    const written = typeof x.hash === 'string' ? x.hash : null
    const bytesId = fb.hash(body.type, body.state, body.refs, written && written.startsWith('sm3:') ? 'sm' : undefined)
    // which block this copy is: the one its bytes give, else (its bytes tampered) the one its written id names
    const old = newBody.has(bytesId) ? bytesId : written && newBody.has(written) ? written : null
    if (old) {
      const sameBytes = canon(body) === origCanon.get(old)
      const sameSig = !('signature' in x) || x.signature === unique.get(old).o.signature
      // a copy signed by another key (a forgery a case shows) is signed again by that same key over the new bytes
      const signer = sameSig ? null : signingPub({ o: x, body })
      if (!sameBytes || !sameSig) tampered.add(old)
      const nb = sameBytes ? newBody.get(old) : after(body)
      body.state = clone(nb.state); body.refs = clone(nb.refs)
      if ('signature' in x) {
        if (sameSig) x.signature = newSig.get(old)
        else if (signer) { const k = keyFor(signer); x.signature = fb.sign(nb, k.private_key, k.suite === 'std' ? undefined : k.suite) }
      }
      // the written id follows the block it names; an id that names no block (a lie a case shows) stays as written
      if (written && (written === old || idmap.has(written))) x.hash = idmap.get(written)
    }
  }
  for (const v of Object.values(x)) replaceIn(v)
}
replaceIn(root)
// unsigned bodies (a check case's type, state, refs) get the rename too; then every old id anywhere, keys and text included
const fix = (x) => {
  if (Array.isArray(x)) return x.map(fix)
  if (isObj(x)) {
    if (typeof x.type === 'string' && isObj(x.state) && isObj(x.refs) && !('hash' in x) && !('signature' in x)) { const n = after(x); x.state = n.state; x.refs = n.refs }
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [idmap.has(k) ? idmap.get(k) : pubmap.has(k) ? pubmap.get(k) : k, fix(v)]))
  }
  if (typeof x === 'string') return pubmap.has(x) ? pubmap.get(x) : x.replace(/[0-9a-f]{64}/g, (m) => idmap.get(m) || m)
  return x
}
let out = fix(root)
// a refusals check case passes its block as separate arguments [type, state, refs, held, ...]; a set of ids that was sorted stays sorted
const before = new Map((JSON.parse(fs.readFileSync(FILE, 'utf8')).door || []).map((c) => [c.name, c]))
const sortedLike = (was, now) => {
  if (Array.isArray(was) && Array.isArray(now) && was.length === now.length && was.every((v, i) => i === 0 || v > was[i - 1]) && now.every((v) => typeof v === 'string')) return [...now].sort()
  if (isObj(was) && isObj(now)) return Object.fromEntries(Object.entries(now).map(([k, v]) => [k, sortedLike(was[k], v)]))
  return now
}
for (const c of out.door || []) {
  if (c.op === 'refusals' && isObj(c.args[1]) && isObj(c.args[2])) {
    const n = after({ type: c.args[0], state: c.args[1], refs: c.args[2] }); c.args[1] = n.state; c.args[2] = n.refs
    const was = before.get(c.name)
    if (was) c.args[2] = sortedLike(was.args[2], c.args[2])
  }
}
fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n')
fs.writeFileSync(FILE + '.idmap.json', JSON.stringify(Object.fromEntries(idmap), null, 1))
for (const t of tampered) problems.push(`a copy of ${t} with other bytes or another signature (a case's forgery) is renamed and keeps what it shows`)
fs.writeFileSync(FILE + '.pubmap.json', JSON.stringify(Object.fromEntries(pubmap), null, 1))
console.error(`${idmap.size} ids mapped, ${newBody.size} blocks re-signed, ${rekeyed.length} keys no one can name replaced by fixed keys, ${problems.length} problems`)
for (const p of problems) console.error('  ' + p)
