'use strict'
// node run.cjs <from> <to> <outfile>   : fuzz worlds seed in [from,to)
const fs = require('fs')
const lib = require('./lib.cjs')
const { genWorld } = require('./gen3.cjs')
const { fb, oracle, canon, jclone, callCore, replay, World } = lib
const OLDNEW = !!process.env.OLDNEW
const oldCall = OLDNEW ? require(process.env.OLDNEW).call : null // OLDNEW=<path to an older core.cjs>: the older core stands in for the oracle
const callOld = (op, ...args) => { try { return { ok: jclone(oldCall(op, ...jclone(args))) } } catch (e) { return { err: String(e.message).slice(0, 120) } } }
const callOracle = OLDNEW ? callOld : lib.callOracle
const NOWS = ['2026-10-27T20:00:00.000Z', '2026-10-28T20:00:00.000Z', '2026-11-05T00:00:00.000Z', '2027-06-01T00:00:00.000Z', '2029-01-01T00:00:00.000Z']

// query specs refer to step indices; run(q, w) -> { core, oracle }
function exec(q, w) {
  const B = (i) => w.blocks[i], H = (i) => w.map[i]
  const held = w.held
  const o = (f) => { try { return { ok: jclone(f()) } } catch (e) { return { err: 'THROW ' + String(e.message).slice(0, 100) } } }
  const sub = (x) => lib.resolve(x, w.map)
  switch (q.op) {
    case 'promise_stage': return [callCore('promise_stage', B(q.first), held, {}), callOracle('promise_stage', B(q.first), held, {})]
    case 'promise_view': return [callCore('promise_view', B(q.first), held, { now: q.now }), callOracle('promise_view', B(q.first), held, { now: q.now })]
    case 'circle_state': return [callCore('circle_state', H(q.circle), held, null), OLDNEW ? callOld('circle_state', H(q.circle), held, null) : callOracle('circle_state', H(q.circle), held)]
    case 'may_act_as': return [callCore('may_act_as', B(q.block), H(q.circle), held), callOracle('may_act_as', B(q.block), H(q.circle), held)]
    case 'under_ok': return [callCore('under_ok', B(q.block), held), callOracle('under_ok', B(q.block), held)]
    case 'why_not_under': return [callCore('why_not_under', B(q.block), held), OLDNEW ? callOld('why_not_under', B(q.block), held) : o(() => oracle.whyNotUnder(B(q.block), held))]
    case 'members_then': return [callCore('members_then', B(q.block), sub(q.recipient), held), OLDNEW ? callOld('members_then', B(q.block), sub(q.recipient), held) : o(() => oracle.membersThen(B(q.block), sub(q.recipient), held))]
    case 'condition_holds': return [callCore('condition_holds', sub(q.cond), held, q.now), callOracle('condition_holds', sub(q.cond), held, q.now)]
    case 'successor_view': { const arr = q.arr ? Object.fromEntries(Object.entries(q.arr).filter(([i]) => w.map[+i] !== undefined).map(([i, t]) => [w.map[+i], t])) : null; return [callCore('successor_view', B(q.grant), held, q.now, arr), callOracle('successor_view', B(q.grant), held, q.now, arr)] }
    case 'valid_refused': { const r = w.refused[q.n]; return [callCore('valid', r.block, w.held.slice(0, r.held), null), callOracle('valid', r.block, w.held.slice(0, r.held), null)] }
    case 'refusals': { const b = B(q.block); const pre = held.slice(0, held.indexOf(b)); return [callCore('refusals', b.type, b.state, b.refs, pre, null), callOracle('refusals', b.type, b.state, b.refs, pre, null)] }
    case 'valid_ok': { const b = B(q.block); const pre = held.slice(0, held.indexOf(b)); return [callCore('valid', b, pre, null), callOracle('valid', b, pre, null)] }
    case 'promise_stage_b': return [callCore('promise_stage', B(q.first), held, {}), callOracle('promise_stage', B(q.first), held, {})]
    case 'circle_within': {
      const wb = B(q.within); const past = new Set(oracle.door('past_of', wb, held))
      const c = callCore('circle_state', H(q.circle), held, wb)
      if (OLDNEW) return [c, callOld('circle_state', H(q.circle), held, wb)]
      // the spec's own reading: the circle as of the block's causal past, the cuts judged with every block held (folds.md, circles.md)
      return [c, callOracle('circle_state', H(q.circle), held, wb)]
    }
    case 'terms_total': return [callCore('terms_total', sub(q.terms), sub(q.qty)), callOracle('terms_total', sub(q.terms), sub(q.qty))]
    case 'within_limit': return [callCore('within_limit', q.fence, q.value, q.spent), callOracle('within_limit', q.fence, q.value, q.spent)]
    case 'limit_within_parent': return [callCore('limit_within_parent', q.child, q.parent, q.at), callOracle('limit_within_parent', q.child, q.parent, q.at)]
    case 'limit_opens': return [callCore('limit_opens', B(q.grant), B(q.obs), 'std'), callOracle('limit_opens', B(q.grant), B(q.obs), 'std')]
    case 'ownership': return [callCore('ownership', B(q.block), held), callOracle('ownership', B(q.block), held)]
    case 'where_now': return [callCore('where_now', B(q.block), held), callOracle('where_now', B(q.block), held)]
    case 'sees': return [callCore('sees', B(q.a), B(q.b), held), callOracle('sees', B(q.a), B(q.b), held)]
    case 'past_of': return [callCore('past_of', B(q.block), held), callOracle('past_of', B(q.block), held)]
    case 'key_timeline': return [callCore('key_timeline', H(q.block), held, null), callOracle('key_timeline', H(q.block), held, null)]
    case 'fork_pairs': return [callCore('fork_pairs', held), callOracle('fork_pairs', held)]
    case 'may_act_as_role': return [callCore('may_act_as', B(q.block), H(q.circle), held, q.role), callOracle('may_act_as', B(q.block), H(q.circle), held, q.role)]
    case 'is_live': return [callCore('live_grant', B(q.block), held, H(q.grant)), callOracle('live_grant', B(q.block), held, H(q.grant))]
  }
  throw new Error('no op ' + q.op)
}
const codesOf = (r) => r && r.ok && Array.isArray(r.ok) ? [...new Set(r.ok.map(x => x.code))].join(',') : canon(r)
const LOOSE = !!process.env.LOOSE
const stripGrants = (x) => { if (Array.isArray(x)) return x.map(stripGrants); if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) if (k !== 'grants') o[k] = stripGrants(x[k]); return o } return x }
const strip = (x) => { if (!LOOSE) return x; return strip0(x) }
const strip0 = (x) => { if (Array.isArray(x)) return x.map(strip0); if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) if (k !== 'grants') o[k] = strip0(x[k]); return o } return x }
const norm = (q, r) => {
  if (q.op === 'valid_refused' || q.op === 'refusals') return { c: codesOf(r) }
  if (q.op === 'why_not_under') return r.ok ? { ok: r.ok.length > 0 } : r
  if (q.op === 'promise_stage' || q.op === 'promise_view' || q.op === 'promise_stage_b') { const o = r.ok ? strip(r.ok) : null; if (LOOSE && o && Array.isArray(o.lines) && (!o.lines.length || (o.lines.length === 1 && o.lines[0].id === null && o.lines[0].moved === 0 && o.lines[0].needed === null))) o.lines = []; return o ? { ok: o } : r }
  if ((q.op === 'circle_state' || q.op === 'circle_within') && r.ok) return { ok: stripGrants(r.ok) }
  // the oracle's key_timeline gives only { key, suite, frozen }: compare those (the shape gap is reported on its own)
  if (q.op === 'key_timeline' && Array.isArray(r.ok) && !OLDNEW) return { ok: r.ok.map(k => ({ key: k.key, suite: k.suite, frozen: k.frozen })) }
  return r.ok !== undefined ? { ok: strip(r.ok) } : r
}
function buildQueries(g) {
  const R2 = require('./gen3.cjs').rng(g.w.steps.length * 31 + 7)
  const { w, conditions, circles } = g
  const qs = []
  const B = w.blocks
  const asC = new Set()
  for (let i = 0; i < B.length; i++) {
    const b = B[i]; if (!b) continue
    const refs = b.refs
    if (b.type === 'promise' && !refs.answers && !refs.updates && !refs.for) {
      qs.push({ op: 'promise_stage', first: i })
      for (const now of [NOWS[1], NOWS[4]]) qs.push({ op: 'promise_view', first: i, now })
    }
    if (b.type === 'actor' && b.state.kind === 'circle') qs.push({ op: 'circle_state', circle: i })
    const asIx = refs.as ? w.map.indexOf(refs.as) : -1
    if (asIx >= 0) { qs.push({ op: 'may_act_as', block: i, circle: asIx }); qs.push({ op: 'members_then', block: i, recipient: '@' + asIx }) }
    if (b.type === 'observe' && refs.confirms && asIx < 0) { /* confirms check through may_act_as of target below */ }
    if (refs.confirms) { const t = w.map.indexOf(refs.confirms); const tb = B[t]; if (tb && tb.refs.as) qs.push({ op: 'may_act_as', block: t, circle: w.map.indexOf(tb.refs.as) }) }
    if (refs.under) {
      qs.push({ op: 'under_ok', block: i }); if (i % 5 === 0) qs.push({ op: 'why_not_under', block: i })
      const gi = w.map.indexOf(refs.under), gb = B[gi]
      if (gb && gb.state.to_role) { const ci = w.map.indexOf(gb.refs.to); qs.push({ op: 'members_then', block: i, recipient: '@' + ci + '#' + gb.state.to_role }) }
    }
    if (b.type === 'grant' && b.state.kind === 'successor' && !b.state.status) for (const mode of ['full', 'partial', 'ties']) {
      const arr = {}
      for (let j = 0; j < B.length; j++) { const bj = B[j]; if (!bj) continue; if (mode === 'partial' && R2() < 0.25) continue; const base = Date.parse(bj.state.at) + (mode === 'ties' ? 0 : Math.floor(R2() * 3 * 86400000)); arr[j] = new Date(mode === 'ties' ? Math.floor(base / 86400000 / 2) * 86400000 * 2 : base).toISOString() }
      for (const now of [NOWS[2], NOWS[4]]) qs.push({ op: 'successor_view', grant: i, now, arr })
    }
    qs.push({ op: 'refusals', block: i }); qs.push({ op: 'valid_ok', block: i })
  }
  for (const c of conditions) for (const now of [NOWS[1], NOWS[2], NOWS[4]]) qs.push({ op: 'condition_holds', cond: c, now })
  for (let i = 0; i < B.length; i++) { const b = B[i]; if (b && b.type === 'promise' && !b.refs.answers && !b.refs.updates && chance3(i)) { qs.push({ op: 'condition_holds', cond: { settled: '@' + i }, now: NOWS[3] }); qs.push({ op: 'condition_holds', cond: { deed: '@' + i }, now: NOWS[0] }) } }
  for (let n = 0; n < w.refused.length; n++) qs.push({ op: 'valid_refused', n })
  // ---- added for the simplification check ----
  const pr = (a) => a[Math.floor(R2() * a.length)]
  const circleIx = [], personIx = []
  for (let i = 0; i < B.length; i++) { const b = B[i]; if (!b) continue
    if (b.type === 'actor' && b.state.kind === 'circle') circleIx.push(i)
    if (b.type === 'actor' && b.state.kind !== 'circle') personIx.push(i)
    // allocations and every answer that might be an allocation: their own deal
    if (b.type === 'promise' && b.refs.answers && b.state.status === 'accepted') { qs.push({ op: 'promise_stage_b', first: i }); qs.push({ op: 'promise_view', first: i, now: NOWS[4] }) }
    // refrains and repeats at more clocks
    if (b.type === 'promise' && !b.refs.answers && !b.refs.updates && b.state.terms && (b.state.terms.refrain || b.state.terms.until)) for (const now of [NOWS[0], NOWS[2], NOWS[3]]) qs.push({ op: 'promise_view', first: i, now })
    // terms_total on every terms seen, with no quantity and with the chosen one
    if (b.type === 'promise' && b.state.terms) {
      qs.push({ op: 'terms_total', terms: b.state.terms, qty: null })
      const t = b.state.terms; const q = t.quantity
      if (q && q.min) for (const v of [q.min.value, q.max.value, '2', '2.5', '0']) qs.push({ op: 'terms_total', terms: t, qty: { value: v, unit: q.min.unit } })
      if (t.price && t.price.per) qs.push({ op: 'terms_total', terms: t, qty: { value: pr(['1', '3', '0.5', '2.5', '9007199254740993']), unit: R2() < 0.8 ? t.price.per.unit : 'kg' } })
    }
    if (b.type === 'promise' && b.state.status === 'accepted' && b.state.terms && b.state.terms.quantity) { const head = B[w.map.indexOf(b.refs.answers)]; if (head && head.state.terms) qs.push({ op: 'terms_total', terms: head.state.terms, qty: b.state.terms.quantity }) }
    if (b.type === 'thing') { qs.push({ op: 'ownership', block: i }); qs.push({ op: 'where_now', block: i }) }
    if (b.refs.as && w.map.indexOf(b.refs.as) >= 0) { const cb = B[w.map.indexOf(b.refs.as)]; if (cb && cb.state.roles && Array.isArray(cb.state.roles)) for (const r of cb.state.roles.slice(0, 2)) qs.push({ op: 'may_act_as_role', block: i, circle: w.map.indexOf(b.refs.as), role: r.name }) }
  }
  for (const c of circleIx) for (let t = 0; t < 3; t++) { const j = c + 1 + Math.floor(R2() * (B.length - c - 1)); if (B[j]) qs.push({ op: 'circle_within', circle: c, within: j }) }
  for (const p of personIx) qs.push({ op: 'key_timeline', block: p })
  qs.push({ op: 'fork_pairs' })
  for (let t = 0; t < 6; t++) { const a = Math.floor(R2() * B.length), b2 = Math.floor(R2() * B.length); if (B[a] && B[b2]) qs.push({ op: 'sees', a, b: b2 }) }
  for (let t = 0; t < 3; t++) { const a = Math.floor(R2() * B.length); if (B[a]) qs.push({ op: 'past_of', block: a }) }
  // limits: the sealed fence, the visible one; values from the promises acting under it and from nearby amounts; children vs parent
  for (const L of (g.limitCases || [])) {
    const gb = B[L.g]; if (!gb) continue
    const ob = L.obs >= 0 ? B[L.obs] : null
    if (ob) qs.push({ op: 'limit_opens', grant: L.g, obs: L.obs })
    const scope = gb.state.scope || {}
    const fences = []
    if (ob) fences.push(ob.state, ob)
    if (scope.limit || scope.each) fences.push({ limit: scope.limit, each: scope.each }, scope.limit || scope.each)
    const vals = []
    for (const b of B) if (b && b.refs.under === gb.hash && b.state.terms) { const tt = callCore('terms_total', b.state.terms, null); if (tt.ok) vals.push(tt.ok); if (b.state.terms.quantity && !b.state.terms.quantity.min) vals.push(b.state.terms.quantity) }
    for (const x of [L.lim, L.each]) if (x) { vals.push(x); if (x.value !== undefined) vals.push({ value: x.value + '1', unit: x.unit }, { value: '0', unit: x.unit }, { value: '0.0', unit: x.unit }); if (x.minor !== undefined) vals.push({ minor: x.minor + 1, currency: x.currency }, { minor: Math.max(0, x.minor - 1), currency: x.currency }) }
    for (const f of fences) for (const v of vals) for (const sp of [0, '0', 1, '2.5', 4999, '9007199254740992', null]) if (R2() < 0.35) qs.push({ op: 'within_limit', fence: jclone(f), value: v, spent: sp })
    for (const C of L.children) {
      const cb = B[C.c]; if (!cb) continue
      const cob = C.cobs >= 0 ? B[C.cobs] : null
      const childArgs = [cob, cob && cob.state, { limit: cb.state.scope.limit, per: cb.state.scope.per, each: cb.state.scope.each }, { limit: C.cl, per: C.cper, each: C.ce }].filter(Boolean)
      const parentArgs = [ob, ob && ob.state, { limit: scope.limit, per: scope.per, each: scope.each }, { limit: L.lim, per: L.per, each: L.each }].filter(Boolean)
      for (const ca of childArgs) for (const pa of parentArgs) if (R2() < 0.5) qs.push({ op: 'limit_within_parent', child: jclone(ca), parent: jclone(pa), at: gb.state.at })
      if (cob) qs.push({ op: 'limit_opens', grant: C.c, obs: C.cobs })
    }
  }
  return qs
}
const chance3 = (i) => i % 3 === 0
function diffSig(q, a, b) {
  const kind = (r) => r.err ? 'ERR' : typeof r.ok
  if (kind(a) !== kind(b)) return `${q.op}:kind(${kind(a)}|${kind(b)})`
  if (a.err) return `${q.op}:both-err`
  const x = a.ok, y = b.ok
  if (x && y && typeof x === 'object' && !Array.isArray(x)) {
    const ks = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(k => canon(x[k]) !== canon(y[k])).sort()
    return `${q.op}:${ks.join(',')}`
  }
  return `${q.op}:value`
}
function disagree(q, w) {
  const [c, o] = exec(q, w)
  const nc = norm(q, c), no = norm(q, o)
  if (canon(nc) === canon(no)) return null
  return { sig: q.op === 'valid_refused' || q.op === 'refusals' || q.op === 'valid_ok' ? `${q.op}:${nc.c}|${no.c}`.slice(0, 120) : diffSig(q, nc, no), core: c, oracle: o }
}
function shuffled(w, R) {
  const s = new World(); Object.assign(s, w); s.held = w.held.slice().sort(() => R() - 0.5); return s
}
function remapQuery(q, idx) {
  const m = (i) => idx.get(i)
  const out = { ...q }
  for (const k of ['first', 'circle', 'block', 'grant', 'within', 'a', 'b', 'obs']) if (q[k] !== undefined) { if (!idx.has(q[k])) return null; out[k] = m(q[k]) }
  if (q.recipient) { const mm = /^@(\d+)(#.*)?$/.exec(q.recipient); if (!idx.has(+mm[1])) return null; out.recipient = '@' + m(+mm[1]) + (mm[2] || '') }
  if (q.arr) { out.arr = Object.fromEntries(Object.entries(q.arr).filter(([i]) => idx.has(+i)).map(([i, t]) => [idx.get(+i), t])) }
  if (q.cond) { const need = lib.mentions(q.cond); for (const n of need) if (!idx.has(n)) return null; out.cond = remapStrs(q.cond, idx) }
  return out
}
const remapStrs = (x, idx) => { if (typeof x === 'string') { const mm = /^@(\d+)(#.*)?$/.exec(x); return mm ? '@' + idx.get(+mm[1]) + (mm[2] || '') : x } if (Array.isArray(x)) return x.map(v => remapStrs(v, idx)); if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, remapStrs(v, idx)])); return x }
function stillFails(steps, q, sig) {
  const { w, idx } = replay(steps)
  const q2 = remapQuery(q, idx); if (!q2) return null
  if (q.op === 'valid_refused') return null
  let d; try { d = disagree(q2, w) } catch (e) { return null }
  return d && d.sig === sig ? { w, idx, q: q2, d } : null
}
function shrink(steps, q, sig) {
  let cur = steps, curQ = q
  let progress = true
  while (progress) {
    progress = false
    for (let i = cur.length - 1; i >= 0; i--) {
      const trial = cur.filter((_, j) => j !== i)
      // remap mentions: steps keep their own indices, so rewrite after removal
      const idx = new Map(); let n = 0; for (let j = 0; j < cur.length; j++) if (j !== i) idx.set(j, n++)
      const re = trial.map((s) => ({ ...s, refs: remapMaybe(s.refs, idx), state: remapMaybe(s.state, idx), after: (s.after || []).filter(a => idx.has(a)).map(a => idx.get(a)) }))
      const q2 = remapQuery(curQ, idx); if (!q2) continue
      // steps mentioning the dropped step: remapMaybe leaves '@dropped' -> make unresolvable
      const r = stillFails(re, q2, sig)
      if (r) { cur = re; curQ = q2; progress = true }
    }
  }
  // the replay may drop steps that failed; return the surviving, replayed recipe
  const { w, idx } = replay(cur)
  return { steps: w.steps, q: remapQuery(curQ, idx), w }
}
const remapMaybe = (x, idx) => { if (typeof x === 'string') { const mm = /^@(\d+)(#.*)?$/.exec(x); if (mm) return idx.has(+mm[1]) ? '@' + idx.get(+mm[1]) + (mm[2] || '') : '@999999' + (mm[2] || ''); return x } if (Array.isArray(x)) return x.map(v => remapMaybe(v, idx)); if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, remapMaybe(v, idx)])); return x }

function main() {
  const [from, to, out] = [+process.argv[2], +process.argv[3], process.argv[4]]
  const sigs = {}, stats = { worlds: 0, queries: 0, steps: 0, refused: 0, impure: 0, genfail: 0 }, refusedStats = {}
  const impureSigs = {}
  for (let seed = from; seed < to; seed++) {
    let g
    try { g = genWorld(seed) } catch (e) { stats.genfail++; sigs['GENFAIL ' + e.message.slice(0, 80)] = sigs['GENFAIL ' + e.message.slice(0, 80)] || { count: 0, seed }; sigs['GENFAIL ' + e.message.slice(0, 80)].count++; continue }
    const w = g.w
    stats.worlds++; stats.steps += w.steps.length; stats.refused += w.refused.length
    const qs = buildQueries(g)
    // how many ownership questions came back with an owner (a thing shown as an instance has one; a description has none)
    for (const q of qs) if (q.op === 'ownership') { stats.ownQueries = (stats.ownQueries || 0) + 1; const a = callCore('ownership', w.blocks[q.block], w.held); if (a.ok && a.ok.owner) stats.owners = (stats.owners || 0) + 1 }
    const R = require('./gen3.cjs').rng(seed + 777)
    const base = []
    for (const q of qs) {
      stats.queries++
      let d
      try { d = disagree(q, w) } catch (e) { d = { sig: q.op + ':EXC ' + e.message.slice(0, 60), core: {}, oracle: {} } }
      if (d) {
        const s = sigs[d.sig] || (sigs[d.sig] = { count: 0, seed, q, d: { core: d.core, oracle: d.oracle }, steps: null })
        s.count++
      }
    }
    // purity: the same blocks in another order give the same answers (each engine against itself)
    const sw = shuffled(w, R)
    for (const q of qs) {
      if (q.op === 'valid_refused' || q.op === 'refusals' || q.op === 'valid_ok' || q.op === 'why_not_under' || R() < 0.75) continue
      let a, b
      try { a = exec(q, w); b = exec(q, sw) } catch (e) { continue }
      for (const [k, name] of [[0, 'core'], [1, 'oracle']]) {
        if (canon(a[k]) !== canon(b[k])) {
          stats.impure++
          const sg = `IMPURE ${name} ${q.op}`
          const s = impureSigs[sg] || (impureSigs[sg] = { count: 0, seed, q, a: a[k], b: b[k] })
          s.count++
        }
      }
    }
    // keep a recipe for each new signature
    for (const s of Object.values(sigs)) if (s.seed === seed && !s.steps) s.steps = w.steps
    for (const s of Object.values(impureSigs)) if (s.seed === seed && !s.steps) s.steps = w.steps
    if (stats.worlds % 40 === 0) fs.writeFileSync(out, JSON.stringify({ stats, sigs, impureSigs }))
  }
  fs.writeFileSync(out, JSON.stringify({ stats, sigs, impureSigs }))
}
if (require.main === module) main()
module.exports = { NOWS, exec, disagree, shrink, buildQueries, stillFails, remapQuery, norm, diffSig }
