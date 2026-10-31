'use strict'
const lib = require('./lib.cjs')
const { World } = lib
function rng(seed) { let a = (seed * 2654435761) >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const T0 = Date.UTC(2026, 9, 27, 12, 0, 0)
const iso = (ms) => new Date(ms).toISOString()
const M = (minor, currency = 'GBP') => ({ minor, currency })
const AMT = (value, unit) => ({ value: String(value), unit })

function genWorld(seed, opts = {}) {
  const R = rng(seed)
  const chance = (p) => R() < p
  const RI = rng(seed * 31 + 5)
  const int = (a, b) => a + Math.floor(R() * (b - a + 1))
  const pick = (arr) => arr[Math.floor(R() * arr.length)]
  const subset = (arr, p = 0.5) => arr.filter(() => R() < p)
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
  const w = new World()
  let clock = T0
  const tick = () => { clock += int(1, 90) * 60000; return iso(clock) }
  const hours = (h) => iso(clock + h * 3600000)
  const queries = [], conditions = []
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  const P = {}
  const gAgent = R() < 0.25
  for (const n of names) P[n] = w.step({ who: n, genesis: n === 'g' && gAgent ? 'agent' : 'person', at: tick() })
  const people = names.map(n => P[n])
  const nameOf = (ix) => names[people.indexOf(ix)]
  const ref = (ix) => '@' + ix
  const recent = () => Array.from({ length: w.steps.length }, (_, i) => i).slice(-int(1, 10))
  // an `after` set: what the author has seen. mode picks how much.
  const AF = (deps = [], mode) => {
    mode = mode || pick(['deps', 'deps', 'deps', 'all', 'none', 'some'])
    const d = deps.filter(x => x >= 0)
    let a
    if (mode === 'deps') a = d
    else if (mode === 'all') a = [...d, ...recent()]
    else if (mode === 'none') a = []
    else a = [...d.filter(() => chance(0.5)), ...subset(recent(), 0.3)]
    return [...new Set(a)].slice(0, 15)
  }
  const say = (who, type, state, refs = {}, o = {}) => {
    const spec = { who: typeof who === 'number' ? nameOf(who) : who, type, state, refs, after: o.after || [], at: o.at || tick() }
    if (spec.who === undefined) return -1
    return w.step(spec)
  }
  const whoIs = (ix) => nameOf(ix)
  // a "wrong" author sometimes
  const maybeWrong = (right, p = 0.15) => chance(p) ? pick(people) : right

  const thing = say('a', 'thing', { kind: 'flour' })
  const thing2 = say('b', 'thing', { kind: 'spray' })
  // ---------- circles ----------
  const POWERS = ['sign', 'admit', 'remove']
  const circles = []
  function mkCircle(founder, big) {
    const nroles = int(1, 3)
    const roles = []
    for (let i = 0; i < nroles; i++) roles.push({ name: 'r' + i, powers: i === 0 && (big || chance(0.8)) ? POWERS.slice() : subset(POWERS, 0.5) })
    if (chance(0.5)) roles[roles.length - 1].powers = ['sign']
    const state = { kind: 'circle', name: 'C' + circles.length, roles }
    if (chance(0.5)) state.needed = { sign: pick([1, 2, 2, 3]) }
    if (chance(0.25)) state.removal = { needed: pick([1, 2, 2, 3]) }
    // decision F2: a circle whose roles carry admit or remove states its removal rule
    if (!state.removal && roles.some((r) => r.powers.includes('admit') || r.powers.includes('remove'))) state.removal = { needed: 1 }
    const c = say(founder, 'actor', state)
    if (c < 0) return null
    const circ = { ix: c, founder, roles, members: [], needed: state.needed ? state.needed.sign : 1, grants: [], accepts: [] }
    circles.push(circ)
    return circ
  }
  function invite(circ, to, by, roles, extra = {}) {
    const g = say(by, 'grant', { kind: 'member', roles: roles || [pick(circ.roles).name] }, { subject: ref(circ.ix), to: ref(to), as: ref(circ.ix) }, { after: AF([circ.ix]), ...extra })
    if (g < 0) return null
    const rec = { ix: g, to, by, circ, accepted: -1 }
    circ.grants.push(rec)
    return rec
  }
  function accept(rec, who, o = {}) {
    const a = say(who === undefined ? rec.to : who, 'grant', { status: 'accepted', kind: 'member' }, { answers: ref(rec.ix), subject: ref(rec.circ.ix) }, { after: o.after || AF([rec.ix]) })
    if (a >= 0 && (who === undefined || who === rec.to)) { rec.accepted = a; rec.circ.accepts.push(a) }
    return a
  }
  function memberStop(rec, by, o = {}) {
    const counted = o.counted === undefined ? pick([rec.accepted, rec.accepted, rec.ix, -1, pick(people.map(p => p))]) : o.counted
    const st = { kind: 'member', status: 'stopped', stop: 'onward' }
    if (counted >= 0 && chance(0.85)) st.counted_to = ref(counted)
    const refs = { updates: ref(rec.ix), subject: ref(rec.circ.ix), as: ref(rec.circ.ix) }
    if (o.noAs) delete refs.as
    return say(by, 'grant', st, refs, { after: o.after || AF([rec.ix, rec.accepted, counted]) })
  }
  function setupCircle(big) {
    const founder = pick(['a', 'b', 'a'])
    const fx = P[founder]
    const circ = mkCircle(founder, big)
    if (!circ) return null
    const others = shuffle(people.filter(p => p !== fx)).slice(0, int(1, 4))
    for (const o of others) {
      // invite by founder usually, sometimes by a member with admit
      const admins = circ.grants.filter(g => g.accepted >= 0 && circ.roles.find(r => g.roles && r.powers.includes('admit')))
      const by = chance(0.2) && admins.length ? pick(admins).to : fx
      const rec = invite(circ, o, by, chance(0.2) ? subset(circ.roles.map(r => r.name), 0.6) : undefined)
      if (rec) {
        if (chance(0.1)) {
          // role change before the answer
          const g2 = say(fx, 'grant', { kind: 'member', roles: [pick(circ.roles).name] }, { updates: ref(rec.ix), subject: ref(circ.ix), as: ref(circ.ix) }, { after: AF([rec.ix]) })
          if (chance(0.5)) accept(rec, undefined, { after: AF([rec.ix, g2], 'none') }); else accept(rec)
        } else if (chance(0.88)) accept(rec)
      }
    }
    return circ
  }
  const memberOf = (circ) => circ.grants.filter(g => g.accepted >= 0)
  const anyMember = (circ) => { const m = memberOf(circ); return m.length ? pick(m).to : circ.founder === 'a' ? P.a : P[circ.founder] }

  // sign as circle / hands
  function asCircle(who, circ, type, state, refs, o = {}) { return say(who, type, state, { ...refs, as: ref(circ.ix) }, o) }
  function confirmBy(who, target, o = {}) { return say(who, 'observe', { kind: 'agree', text: 'yes' + int(0, 99) }, { confirms: ref(target), ...(o.refs || {}) }, { after: o.after || AF([target]) }) }

  // ---------- promises ----------
  const promises = []   // first promises
  function mkTerms(o = {}) {
    const t = { expires: '2028-06-01T00:00:00.000Z' }
    if (o.refrain !== false && (o.refrain || chance(0.1))) { t.refrain = true; t.until = o.until || hours(int(2, 60)) }
    if (chance(0.35)) t.price = M(pick([100, 500, 1000, 5000]))
    if (o.repeat) t.repeat = o.repeat
    else if (chance(0.15)) t.repeat = pick(['FREQ=WEEKLY;BYDAY=MO', 'FREQ=DAILY', { after: 'moon', by: [ref(P.a)], wait: 'PT1H' }, { after: 'moon', by: [ref(P.b), ref(P.c)], wait: 'PT1H' }])
    if (chance(0.1)) t.quantity = AMT(pick([1, 5, '2.5']), 'kg')
    if (chance(0.05)) t.condition = pick(conditions.length ? conditions : [{ signal: 'rain', by: [ref(P.a)] }])
    return t
  }
  function offer(fromWho, toWho, o = {}) {
    const refs = { from: ref(fromWho.id !== undefined ? fromWho.id : fromWho), to: ref(toWho.id !== undefined ? toWho.id : toWho), what: ref(pick([thing, thing2])) }
    if (o.fromCirc) refs.as = ref(o.fromCirc.ix)
    if (o.schema !== undefined && o.schema >= 0) refs.schema = ref(o.schema)
    const author = o.author !== undefined ? o.author : refs.from
    const tm = o.terms || mkTerms(o); const pst = { terms: tm }; if (typeof tm.repeat === 'string') pst.when = iso(clock + 3600000)
    const p = say(typeof author === 'string' ? whoIs(+author.slice(1)) : author, 'promise', pst, refs, { after: o.after || AF([]) })
    if (p < 0) return null
    const rec = { ix: p, from: +refs.from.slice(1), to: +refs.to.slice(1), answers: [], events: [], terms: o.terms }
    promises.push(rec)
    return rec
  }
  function answerP(rec, who, state, o = {}) {
    const refs = { answers: ref(o.target === undefined ? rec.ix : o.target), for: ref(rec.ix) }
    if (o.asCirc) refs.as = ref(o.asCirc.ix)
    return say(who, 'promise', state, refs, { after: o.after || AF([o.target === undefined ? rec.ix : o.target]) })
  }
  function stopBy(rec, who, stop, o = {}) {
    const state = { status: 'stopped', stop }
    if (chance(0.3)) state.reason = pick(['done', 'let_go', 'replaced', 'ran_out', 'paused', 'lost'])
    // by the author: updates; by the other side: answers
    const isAuthor = o.updates === undefined ? who === rec.from : o.updates
    const refs = isAuthor ? { updates: ref(rec.ix), for: ref(rec.ix) } : { answers: ref(rec.ix), for: ref(rec.ix) }
    if (o.asCirc) refs.as = ref(o.asCirc.ix)
    return say(who, 'promise', state, refs, { after: o.after || AF([rec.ix, ...(o.deps || [])]) })
  }
  function defeats(rec, who, target, o = {}) {
    return say(who, 'observe', { kind: pick(['test', 'ruling', 'report']), text: 'x' + int(0, 99) }, { defeats: ref(target === undefined ? rec.ix : target), for: ref(rec.ix) }, { at: o.at, after: o.after || AF([target === undefined ? rec.ix : target]) })
  }
  function pay(rec, from, to, amount, o = {}) {
    const t = say(from, 'transfer', { money: amount }, { what: ref(from), to_owner: ref(to), for: ref(rec.ix) }, { after: AF([rec.ix]) })
    if (t >= 0 && chance(0.85)) say(to, 'transfer', { status: 'accepted' }, { answers: ref(t), for: ref(rec.ix) }, { after: AF([t]) })
    return t
  }
  function schemaWith(conf) { return say('a', 'thing', { kind: 'schema', target: 'promise', grounds: { event: 'residue', confirmers: conf.map(ref) } }) }

  // ---- scenario: refrains ----
  function scRefrain() {
    const circ = circles.length && chance(0.4) ? pick(circles) : null
    const [x, y] = shuffle([P.a, P.b, P.c, P.d]).slice(0, 2)
    const judge = P.e
    const schema = chance(0.35) ? schemaWith([judge]) : -1
    let o = { schema }
    let fromWho = x, toWho = y, fromCirc = null, toCirc = null
    if (circ && chance(0.5)) { toWho = circ.ix; toCirc = circ } else if (circ && chance(0.3)) { fromWho = circ.ix; fromCirc = circ }
    const until = hours(int(2, 50))
    const untilMs = Date.parse(until)
    const terms = mkTerms({ refrain: chance(0.92), until })
    const authorWho = fromCirc ? anyMember(circ) : fromWho
    const p = offer(fromWho, toWho, { terms, schema, author: authorWho, fromCirc })
    if (!p) return
    const sideTo = toCirc ? () => anyMember(circ) : () => toWho
    const sideFrom = fromCirc ? () => anyMember(circ) : () => fromWho
    let head = p.ix, binding = -1
    // optionally a counter
    let counter = -1
    if (chance(0.3)) {
      const nt = chance(0.5) ? mkTerms({ refrain: chance(0.6), until: hours(int(2, 50)) }) : { price: M(100), expires: '2028-06-01T00:00:00.000Z', ...(chance(0.5) ? { repeat: 'FREQ=DAILY' } : {}) }
      counter = answerP(p, maybeWrong(sideTo(), 0.1), { terms: nt }, { asCirc: toCirc })
    }
    const acceptor = (target, side) => answerP(p, side, { status: 'accepted' }, { target, asCirc: (target === p.ix ? toCirc : fromCirc) })
    const r = R()
    let acc = -1
    if (counter >= 0 && r < 0.6) { acc = answerP(p, maybeWrong(sideFrom(), 0.1), { status: 'accepted' }, { target: counter, asCirc: fromCirc }); binding = counter }
    else if (r < 0.9) { acc = answerP(p, maybeWrong(sideTo(), 0.1), { status: 'accepted' }, { asCirc: toCirc }); binding = p.ix }
    // many-hands confirms
    if (acc >= 0 && circ && chance(0.85)) for (const m of shuffle(memberOf(circ)).slice(0, int(1, 3))) confirmBy(m.to, acc)
    if (acc >= 0 && circ && chance(0.3)) confirmBy(circ.founder === 'a' ? P.a : P[circ.founder], acc)
    // events
    if (chance(0.55)) {
      const tgt0 = pick([p.ix, counter].filter(x => x >= 0))
      defeats(p, chance(0.85) ? sideTo() : pick([sideFrom(), judge, P.f]), tgt0, { at: iso(Math.max(clock + 60000, chance(0.7) ? clock + int(1, 30) * 60000 : untilMs + int(-3, 3) * 60000)), after: AF([tgt0, acc]) })
    }
    const n = int(1, 5)
    const stopsIx = []
    for (let i = 0; i < n; i++) {
      const k = R()
      const tgt = pick([p.ix, p.ix, counter].filter(x => x >= 0))
      const sides = [sideFrom(), sideTo()]
      if (k < 0.35) {
        const who = pick([sideTo(), sideTo(), sideFrom(), P.e, P.f, judge, P.c])
        const atMs = chance(0.5) ? clock + int(1, 20) * 60000 : untilMs + int(-5, 5) * 60000
        const dep = chance(0.5) ? stopsIx : []
        defeats(p, who, tgt, { at: iso(Math.max(atMs, clock + 60000)), after: AF([tgt, ...dep.slice(0, 3)], dep.length ? undefined : pick(['deps', 'all', 'some'])) })
      } else if (k < 0.6) {
        const side = pick([0, 1]); const who = sides[side]
        const stopKind = pick(['onward', 'onward', 'before', { occurrences: [iso(clock + 3600000)] }, { occurrences: [p.ix >= 0 ? ref(p.ix) : 'x'] }])
        const s = (who === p.from || (who === circ?.ix && false)) ? stopBy(p, who, typeof stopKind === 'object' && stopKind.occurrences && stopKind.occurrences[0] === ref(p.ix) ? { occurrences: [] } : stopKind, { updates: side === 0 && !fromCirc ? true : side === 0 ? true : false, asCirc: side === 0 ? fromCirc : toCirc }) : stopBy(p, who, 'onward', { updates: side === 0, asCirc: side === 0 ? fromCirc : toCirc })
        if (s >= 0) stopsIx.push(s)
      } else if (k < 0.75 && stopsIx.length) {
        confirmBy(pick([sideTo(), sideFrom(), P.e]), pick(stopsIx), { refs: chance(0.5) ? { for: ref(p.ix) } : {} })
      } else if (k < 0.85) {
        pay(p, pick([P.a, P.b, P.c, P.d]), pick([P.a, P.b, P.c, P.d]), M(pick([5000, 1000, 100, 500])))
      } else if (k < 0.92) {
        // a second answer: decline / accept again / a stop of the counter
        answerP(p, sideTo(), { status: pick(['declined', 'accepted']) }, { asCirc: toCirc })
      } else {
        // a close of one of the sides? (the successor scenario does the rest)
        say(P.e, 'observe', { kind: 'note', text: 'n' }, { for: ref(p.ix) })
      }
    }
    // a refrain's view at several times
    return p
  }

  // ---- scenario: standing promises, stops with occurrences ----
  function scStanding() {
    const x = pick([P.a, P.b, P.c]), y = pick([P.d, P.e, P.f])
    const when = iso(clock + int(1, 200) * 60000)
    const terms = { expires: '2028-06-01T00:00:00.000Z', repeat: pick(['FREQ=WEEKLY;BYDAY=MO', 'FREQ=DAILY', 'FREQ=DAILY;COUNT=3', { after: 'batch', by: [ref(x)], wait: 'PT2H' }]) }
    if (chance(0.4)) terms.price = M(300)
    const p = offer(x, y, { terms })
    if (!p) return
    const refs = { from: ref(x), to: ref(y) }
    // 'when' goes in state: re-do with state.when using a direct step
    const acc = answerP(p, y, { status: 'accepted' })
    // event occurrence observes
    const occ = []
    for (let i = 0; i < int(0, 3); i++) { const o = say(pick([x, y, P.e]), 'observe', { kind: 'batch', text: 'b' }, { for: ref(p.ix) }); if (o >= 0) occ.push(o) }
    if (chance(0.5)) {
      const occs = occ.length && chance(0.6) ? occ.slice(0, int(1, occ.length)).map(ref) : [iso(clock + 86400000 * 7)]
      stopBy(p, pick([x, y]), { occurrences: occs }, { updates: undefined })
    }
    if (chance(0.4)) stopBy(p, pick([x, y]), 'onward')
    return p
  }

  // ---- scenario: successor / close ----
  const closes = []
  function scSuccessor() {
    const person = pick([P.a, P.b, P.c, P.d, P.e])
    const succ = pick(people.filter(p => p !== person))
    const wits = shuffle(people.filter(p => p !== person && p !== succ)).slice(0, int(1, 3))
    const needed = chance(0.7) ? Math.min(wits.length, int(1, 2)) : pick([1, 2, 3])
    const g = say(person, 'grant', { kind: 'successor', witnesses: wits.map(ref), needed, wait: 'P7D' }, { to: ref(succ) }, { after: AF([]) })
    if (g < 0) return
    let g2 = -1
    if (chance(0.3)) g2 = say(person, 'grant', { kind: 'successor', witnesses: wits.map(ref), needed: 1, wait: 'P7D' }, { to: ref(pick(people.filter(p => p !== person))) }, { after: AF([]) })
    // things the person is party to
    const stuff = []
    const far = P.f
    // standing promise (repeat or refrain), one-off, authority grant, circle membership
    const stand = offer(person, far, { terms: mkTerms({ repeat: 'FREQ=WEEKLY;BYDAY=MO', refrain: false }), author: person })
    if (stand) { answerP(stand, far, { status: 'accepted' }); stuff.push(stand.ix) }
    const ref2 = offer(far, person, { terms: mkTerms({ refrain: true, until: hours(int(100, 400)) }), author: far })
    if (ref2) { answerP(ref2, person, { status: 'accepted' }); stuff.push(ref2.ix) }
    const once = offer(far, person, { terms: { price: M(900), expires: '2028-06-01T00:00:00.000Z' }, author: far })
    if (once) { answerP(once, person, { status: 'accepted' }); stuff.push(once.ix) }
    const auth = say(person, 'grant', { kind: 'authority', scope: { acts: ['observe'], until: '2028-12-01T00:00:00.000Z' } }, { to: ref(P.g) })
    const auth2 = say(person, 'grant', { kind: 'authority', scope: { acts: ['observe'], until: '2028-12-01T00:00:00.000Z' } }, { to: ref(P.g) })
    stuff.push(auth, auth2)
    let circ = circles.length ? pick(circles) : null
    let myRec = null
    if (circ) { myRec = circ.grants.find(r => r.to === person && r.accepted >= 0); if (myRec) stuff.push(myRec.ix, circ.ix) }
    // under-grant acts before
    const before = say(P.g, 'observe', { kind: 'note', text: 'before' }, { under: ref(auth) }, { after: AF([auth]) })
    // triggers
    const trigs = []
    const nt = int(0, 4)
    for (let i = 0; i < nt; i++) {
      const who = chance(0.8) ? pick(wits) : pick(people)
      const subject = chance(0.9) ? person : pick(people)
      const under = chance(0.85) ? g : (g2 >= 0 ? g2 : g)
      const t = say(who, 'observe', { kind: 'trigger', text: 't' }, { under: ref(under), subject: ref(subject) }, { after: AF([under]) })
      if (t >= 0) trigs.push(t)
    }
    // person defeats a trigger
    if (trigs.length && chance(0.3)) say(person, 'observe', { kind: 'alive', text: 'here' }, { defeats: ref(pick(trigs)) }, { after: AF(trigs) })
    // stop the successor grant (by person or other), before or after the close
    const stopOf = (gx) => say(maybeWrong(person, 0.2), 'grant', { kind: 'successor', status: 'stopped', stop: 'onward' }, { updates: ref(gx) }, { after: AF([gx]) })
    const early = chance(0.15) ? stopOf(g) : -1
    // a decline by successor
    if (chance(0.1)) say(succ, 'grant', { kind: 'successor', status: 'declined' }, { answers: ref(g) }, { after: AF([g]) })
    // closes
    const nc = int(1, 3)
    let lastClose = -1
    for (let i = 0; i < nc; i++) {
      const by = chance(0.85) ? succ : maybeWrong(succ, 1)
      const under = chance(0.85) ? g : (g2 >= 0 ? g2 : g)
      const afters = chance(0.75) ? trigs.filter(() => chance(0.85)) : subset(trigs, 0.3)
      const continues = subset(stuff.filter(x => x >= 0), 0.35).map(ref)
      const st = { kind: 'close' }
      if (continues.length || chance(0.1)) st.continues = continues
      const c = say(by, 'observe', st, { under: ref(under), subject: ref(chance(0.95) ? person : pick(people)) }, { after: afters.concat(chance(0.3) ? [lastClose] : []).filter(x => x >= 0) })
      if (c >= 0) { closes.push(c); lastClose = c }
      if (c >= 0 && chance(0.3)) stopOf(g)
    }
    // acts after the close, with and without it in their past
    const acts = [auth, auth2]
    for (const a of acts) if (a >= 0) {
      say(P.g, 'observe', { kind: 'note', text: 'after-close' }, { under: ref(a) }, { after: chance(0.6) && lastClose >= 0 ? [lastClose, a] : [a] })
      if (chance(0.5)) say(P.g, 'observe', { kind: 'note', text: 'after-close2' }, { under: ref(a) }, { after: AF([a, lastClose]) })
    }
    // the person's own later block
    if (chance(0.3)) say(person, 'observe', { kind: 'note', text: 'alive?' }, {}, { after: AF([]) })
    // promise stage of stuff handled by generic queries
  }

  // ---- scenario: circle changes & many hands ----
  function scCircle() {
    const circ = circles.length ? pick(circles) : null
    if (!circ) return
    const recs = memberOf(circ)
    const k = R()
    if (k < 0.3 && recs.length) {
      const rec = pick(recs)
      const by = chance(0.7) ? (circ.founder === 'a' ? P.a : P[circ.founder]) : pick(people)
      memberStop(rec, by, {})
      if (chance(0.45)) memberStop(pick(recs), pick(people), {})   // crossing removals
      if (chance(0.3) && recs.length > 1) { const [r1, r2] = shuffle(recs); memberStop(r1, r2.to, { after: AF([r1.ix, r1.accepted], 'none') }); memberStop(r2, r1.to, { after: AF([r2.ix, r2.accepted], 'none') }) }
    } else if (k < 0.5 && recs.length) {
      const rec = pick(recs)
      say(maybeWrong(circ.founder === 'a' ? P.a : P[circ.founder], 0.3), 'grant', { kind: 'member', roles: subset(circ.roles.map(r => r.name), 0.6) }, { updates: ref(rec.ix), subject: ref(circ.ix), as: ref(circ.ix) }, { after: AF([rec.ix, rec.accepted]) })
    } else if (k < 0.6) {
      // member leaves themselves
      if (recs.length) { const rec = pick(recs); say(rec.to, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { answers: ref(rec.ix), subject: ref(circ.ix) }, { after: AF([rec.ix, rec.accepted]) }) }
    } else if (k < 0.8) {
      const to = pick(people); const rec = invite(circ, to, anyMember(circ), undefined, {}); if (rec && chance(0.8)) accept(rec)
    } else {
      // sign as the circle: an offer + accept by a member, plus confirms
      const buyer = pick([P.c, P.d, P.e, P.f])
      const o = say(buyer, 'promise', { terms: { price: M(2000), expires: '2028-06-01T00:00:00.000Z' } }, { from: ref(buyer), to: ref(circ.ix), what: ref(thing) }, { after: AF([]) })
      if (o >= 0) {
        const rec = { ix: o, from: buyer, to: circ.ix, answers: [], events: [] }; promises.push(rec)
        const who = recs.length ? pick(recs).to : (circ.founder === 'a' ? P.a : P[circ.founder])
        const acc = answerP(rec, who, { status: 'accepted' }, { asCirc: circ })
        if (acc >= 0) for (const m of (chance(0.75) && recs.length ? shuffle(recs).map(x => x.to) : shuffle(people)).slice(0, int(0, 4))) { confirmBy(m, acc); }
        if (acc >= 0 && chance(0.4)) { const m = recs.length ? pick(recs) : null; if (m) memberStop(m, circ.founder === 'a' ? P.a : P[circ.founder], {}); for (const m2 of shuffle(people).slice(0, 2)) confirmBy(m2, acc) }
      }
    }
  }

  // ---- scenario: grants to a role / set / stops as circle ----
  const grantsAuth = []
  function scRoleGrant() {
    const circ = circles.length ? pick(circles) : null
    if (!circ) return
    const bank = pick([P.c, P.d, P.e, P.f])
    const role = pick(circ.roles).name
    const mode = R()
    const scope = { acts: pick([['observe'], ['observe', 'promise'], ['note']]), until: '2028-12-01T00:00:00.000Z' }
    let g
    if (mode < 0.55) g = say(bank, 'grant', { kind: 'statements', to_role: role, scope }, { to: ref(circ.ix) }, { after: AF([circ.ix]) })
    else if (mode < 0.7) g = say(chance(0.7) ? (circ.founder === 'a' ? P.a : P[circ.founder]) : bank, 'grant', { kind: 'authority', to_role: role, scope }, { to: ref(circ.ix), as: ref(circ.ix) }, { after: AF([circ.ix]) })
    else if (mode < 0.8) g = say(bank, 'grant', { kind: 'statements', scope }, { to: [ref(P.a), ref(P.b)] })
    else if (mode < 0.9) g = say(bank, 'grant', { kind: 'statements', to_role: role, scope }, { to: [ref(circ.ix), ref(P.b)] })
    else g = say(bank, 'grant', { kind: 'statements', to_role: role, depth: 1, scope }, { to: ref(circ.ix) })
    if (g < 0) return
    grantsAuth.push({ ix: g, circ, role })
    const recs = memberOf(circ)
    // stops
    if (chance(0.5)) {
      const by = pick([P.a, P.b, P.c, bank, circ.founder === 'a' ? P.a : P[circ.founder]])
      const asC = chance(0.6)
      say(by, 'grant', { kind: 'statements', status: 'stopped', stop: 'onward' }, { updates: ref(g), ...(asC ? { as: ref(circ.ix) } : {}) }, { after: AF([g]) })
    }
    // removals / role changes concurrent with acts
    if (recs.length && chance(0.6)) { const rec = pick(recs); memberStop(rec, circ.founder === 'a' ? P.a : P[circ.founder], {}) }
    // acts under it by many people with different after sets
    for (let i = 0; i < int(2, 5); i++) say(chance(0.65) && recs.length ? pick(recs).to : pick(people), 'observe', { kind: 'note', text: 'u' + i }, { under: ref(g) }, { after: AF([g, ...subset(circ.accepts, 0.5)]) })
  }

  // ---- scenario: signals ----
  const signalKinds = ['moon', 'rain', 'price']
  function scSignal() {
    const circ = circles.length && chance(0.7) ? pick(circles) : null
    const kind = pick(signalKinds)
    const signers = []
    const nsig = int(1, 4)
    const amountable = kind === 'price'
    const mine = []
    for (let i = 0; i < nsig; i++) {
      const recs = circ ? memberOf(circ) : []
      const who = recs.length && chance(0.6) ? pick(recs).to : pick(people)
      const st = { kind, text: 's' + i }
      if (amountable) st.amount = AMT(pick(['400', '410', '9007199254740993', '0.5', '1e3']), pick(['GBP/t', 'GBP/t', 'kg']))
      const refs = chance(0.5) ? { subject: ref(thing) } : {}
      const s = say(who, 'observe', st, refs, { at: iso(clock + int(1, 100) * 60000), after: AF(circ ? circ.accepts : []) })
      if (s >= 0) { mine.push({ ix: s, who }); signers.push(who) }
    }
    if (mine.length && chance(0.3)) { const m = pick(mine); say(chance(0.8) ? m.who : pick(people), 'observe', { kind: 'correction', text: 'oops' }, { defeats: ref(m.ix) }, { after: AF([m.ix]) }) }
    if (circ && chance(0.5)) { const recs = memberOf(circ); if (recs.length) memberStop(pick(recs), circ.founder === 'a' ? P.a : P[circ.founder], {}) }
    // conditions over this
    const by = []
    const lst = [ref(P.a), ref(P.b), ref(P.c), ref(P.d)]
    if (circ) { by.push(ref(circ.ix) + '#' + pick(circ.roles).name); if (chance(0.3)) by.push(ref(circ.ix) + '#' + pick(circ.roles).name) }
    by.push(...subset(lst, 0.5))
    const cond = { signal: kind, by: by.length ? by : [ref(P.a)] }
    if (chance(0.4)) cond.signers = pick([1, 2, 2, 3, 0, 1.5, '2'])
    if (chance(0.05)) cond.needed = pick([1, 2])
    if (chance(0.3)) cond.subject = ref(thing)
    if (amountable && chance(0.6)) { cond.op = pick(['lt', 'le', 'gt', 'ge', 'eq', 'about']); cond.value = AMT(pick(['400', '410', '9007199254740992', '0.5']), pick(['GBP/t', 'kg'])) }
    if (chance(0.1)) cond.by = pick([ref(P.a), [], [ref(circ ? circ.ix : P.a) + '#a#b'], [ref(circ ? circ.ix : P.a) + '#']])
    conditions.push(cond)
  }

  // ---- scenario: authority limits (visible scopes with parents) ----
  function scLimits() {
    const big = [100, 1000, '9007199254740992', '9007199254740993', '0.5', '2.50', 5]
    const unit = pick(['kg', 'kg', 'L'])
    const mk = (v) => chance(0.5) ? AMT(v, unit) : M(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : 1)
    const scope = { acts: ['promise'], per: pick(['P7D', 'P1D', 'P1M']), until: '2028-12-01T00:00:00.000Z' }
    if (chance(0.7)) scope.limit = mk(pick(big))
    if (chance(0.6)) scope.each = mk(pick(big))
    const parent = say(P.a, 'grant', { kind: 'authority', depth: 1, scope }, { to: ref(P.g) })
    if (parent < 0) return
    for (let i = 0; i < 3; i++) {
      const cs = { acts: ['promise'], per: pick(['P7D', 'P1D', 'P1M', 'P2W']), until: pick(['2028-12-01T00:00:00.000Z', '2029-12-01T00:00:00.000Z']) }
      if (chance(0.6)) cs.limit = chance(0.5) ? scope.limit || mk(pick(big)) : mk(pick(big))
      if (chance(0.6)) cs.each = chance(0.5) ? scope.each || mk(pick(big)) : mk(pick(big))
      if (chance(0.3)) cs.acts = pick([['promise'], ['observe'], ['promise', 'observe']])
      const c = say(P.g, 'grant', { kind: 'authority', scope: cs }, { parent: ref(parent), to: ref(pick([P.b, P.c])) })
      if (c >= 0) say(P.b, 'observe', { kind: 'note', text: 'x' }, { under: ref(c) }, { after: AF([c]) })
    }
  }

  // ---- scenario: deals with lines, units, per-unit prices, ranges, open offers, allocations ----
  const UNITS = ['kg', 'kg', 'kg', 'L', 'g']
  const CUR = () => pick(['GBP', 'GBP', 'GBP', 'GBP', 'USD'])
  const kinds = [thing, thing2]
  const thing3 = say('c', 'thing', { kind: 'eggs' })
  if (thing3 >= 0) kinds.push(thing3)
  const instances = []
  function mkInstance(owner, kindIx) {
    const st = { kind: 'lot', lot: 'L' + int(0, 999) }
    if (chance(0.6)) st.pack = AMT(pick([1, 2, '2.5', 5, '0.5', 10]), pick(UNITS))
    // Real writers show an instance the way things.md lists: it names its kind (of), was made from something (derives_from), or names a place.
    // A small share stays bare on purpose, so "a description has no owner" stays covered.
    const how = RI() // its own stream, so the instance forms never move the draws of the scenarios
    const refs = how < 0.72 ? { of: ref(kindIx) } : how < 0.82 ? { derives_from: ref(kindIx) } : how < 0.9 ? { place: ref(kinds[Math.floor(RI() * kinds.length)]) } : {}
    const ix = say(owner, 'thing', st, refs)
    if (ix >= 0 && how < 0.9) instances.push({ ix, owner, kind: kindIx })
    return ix
  }
  // some standing stock: people hold instances of the kinds from the start, so ownership is asked of things that have owners
  for (const k of kinds) for (let n = 0; n < 2; n++) if (k >= 0 && RI() < 0.7) mkInstance(people[Math.floor(RI() * people.length)], k)
  function mkDealTerms(cur, o = {}) {
    const t = { expires: '2028-06-01T00:00:00.000Z' }
    if (o.lines || chance(0.4)) {
      const n = int(1, 3)
      const lines = []
      const used = new Set()
      for (let i = 0; i < n; i++) {
        const wk = pick(kinds)
        const l = { id: chance(0.05) ? 'l0' : 'l' + i, what: ref(wk) }
        const u = pick(UNITS)
        if (chance(0.8)) l.quantity = AMT(pick([1, 2, 3, '2.5', 5, '0.25', '9007199254740993']), u)
        const pk = R()
        if (pk < 0.45) l.price = M(pick([100, 250, 999, 1000]), chance(0.92) ? cur : 'USD')
        else if (pk < 0.8) l.price = { money: M(pick([100, 333, 1000]), chance(0.92) ? cur : 'USD'), per: AMT(pick([1, 2, '0.5', 0, 3]), chance(0.85) ? (l.quantity ? l.quantity.unit : u) : pick(UNITS)) }
        lines.push(l); used.add(wk)
      }
      t.lines = lines
      t._what = [...new Set(lines.map(l => l.what))]
    } else {
      const u = pick(UNITS)
      const pk = R()
      if (pk < 0.35) t.price = M(pick([100, 500, 1000, 5000]), cur)
      else if (pk < 0.7) t.price = { money: M(pick([100, 333, 250]), cur), per: AMT(pick([1, 3, '0.5', 0]), chance(0.85) ? u : pick(UNITS)) }
      const qk = R()
      if (qk < 0.4) t.quantity = AMT(pick([1, 2, 5, '2.5', 10]), u)
      else if (qk < 0.6 && t.price && t.price.per) t.quantity = { min: AMT(pick([1, 2]), u), max: AMT(pick([3, 5, 10]), u) }
      else if (qk < 0.65) t.quantity = { min: AMT(1, u), max: AMT(5, u) }
    }
    if (chance(0.07)) { t.refrain = true; t.until = hours(int(2, 60)) }
    if (chance(0.07)) t.repeat = 'FREQ=DAILY'
    if (chance(0.05)) t.deliver_by = hours(int(1, 100))
    return t
  }
  const qtyFor = (terms, pickIt) => {
    const q = terms && terms.quantity
    if (!q) return chance(0.2) ? AMT(pick([1, 2]), pick(UNITS)) : undefined
    if (q.min) { const u = chance(0.9) ? q.min.unit : pick(UNITS); return AMT(pick([q.min.value, q.max.value, '2', '1', '7', '0.5', '4']), u) }
    if (pickIt) return chance(0.7) ? q : AMT(pick(['1', '2', '0.5', q.value]), chance(0.85) ? q.unit : pick(UNITS))
    return chance(0.8) ? undefined : q
  }
  function scDeal() {
    const [x, y, z, v] = shuffle(people.filter(p => p !== P.g))
    const cur = CUR()
    const circ = circles.length && chance(0.25) ? pick(circles) : null
    const openKind = pick(['one', 'one', 'one', 'openTo', 'openTo', 'openFrom'])
    const terms = mkDealTerms(cur)
    const refs = {}
    if (terms._what) { refs.what = chance(0.93) ? (terms._what.length === 1 ? terms._what[0] : terms._what.slice().sort()) : ref(pick(kinds)); delete terms._what }
    else refs.what = ref(pick(kinds))
    let author, fromSide = x, toSide = y, asCirc = null
    if (circ && chance(0.5)) { fromSide = circ.ix; asCirc = circ }
    if (openKind === 'one') { refs.from = ref(fromSide); refs.to = ref(toSide); author = chance(0.7) ? 'from' : 'to' }
    else if (openKind === 'openTo') { refs.from = ref(fromSide); author = 'from' }
    else { refs.to = ref(toSide); author = 'to' }
    if (chance(0.05)) refs.from = refs.to = ref(x), author = 'self'
    const authorWho = author === 'from' ? (asCirc ? anyMember(asCirc) : fromSide) : author === 'to' ? toSide : x
    const prefs = { ...refs }; if (author === 'from' && asCirc) prefs.as = ref(asCirc.ix)
    if (chance(0.15)) prefs.schema = ref(schemaWith([P.e]))
    const st = { terms }
    if (chance(0.1)) { st.what = 'job'; if (chance(0.5)) delete prefs.what }
    const o = say(authorWho, 'promise', st, prefs, { after: AF([]) })
    if (o < 0) return
    const rec = { ix: o, from: fromSide, to: toSide, answers: [], events: [] }; promises.push(rec)
    const open = openKind !== 'one' && author !== 'self'
    const offerSide = author === 'from' ? 'from' : 'to'
    const signerOf = (side) => side === 'from' ? (asCirc ? anyMember(asCirc) : fromSide) : toSide
    const otherSide = offerSide === 'from' ? 'to' : 'from'
    const nodes = [o], accepts = [], allocs = []
    const asFor = (side) => side === 'from' && asCirc ? { as: ref(asCirc.ix) } : {}
    // counters / accepts
    if (!open && author !== 'self') {
      let head = o, headSide = offerSide
      if (chance(0.3)) {
        const nt = mkDealTerms(cur, { lines: !!terms.lines && chance(0.7) })
        const crefs = { answers: ref(o), for: ref(o), ...asFor(otherSide) }
        if (nt._what) { if (chance(0.5)) crefs.what = nt._what.length === 1 ? nt._what[0] : nt._what.slice().sort(); delete nt._what }
        if (chance(0.1)) crefs.to = ref(pick(people))
        const c = say(maybeWrong(signerOf(otherSide), 0.1), 'promise', { terms: nt }, crefs, { after: AF([o]) })
        if (c >= 0) { nodes.push(c); head = c; headSide = otherSide; rec.counterTerms = nt }
      }
      if (chance(0.85)) {
        const hterms = head === o ? terms : rec.counterTerms
        const ast = { status: 'accepted' }
        const q = qtyFor(hterms, false); if (q) ast.terms = { quantity: q }
        const accSide = headSide === 'from' ? 'to' : 'from'
        const a = say(maybeWrong(signerOf(accSide), 0.08), 'promise', ast, { answers: ref(head), for: ref(o), ...asFor(accSide) }, { after: AF([head]) })
        if (a >= 0) { nodes.push(a); accepts.push(a); if (asCirc && accSide === 'from') for (const m of shuffle(memberOf(asCirc)).slice(0, int(0, 3))) confirmBy(m.to, a) }
        if (chance(0.1)) { const a2 = say(signerOf(accSide), 'promise', { status: 'accepted' }, { answers: ref(head), for: ref(o), ...asFor(accSide) }, { after: AF([head], 'none') }); if (a2 >= 0) accepts.push(a2) }
      }
    } else if (open) {
      // requests and allocations
      for (let i = 0; i < int(1, 3); i++) {
        const taker = pick([z, v, y, x])
        const rst = { status: 'accepted' }
        const q = qtyFor(terms, true); if (q && chance(0.85)) rst.terms = { quantity: q }
        const rq = say(taker, 'promise', rst, { answers: ref(o), for: ref(o) }, { after: AF([o]) })
        if (rq < 0) continue
        nodes.push(rq); accepts.push(rq)
        if (chance(0.8)) {
          const ast = { status: 'accepted' }
          if (chance(0.5)) { const q2 = qtyFor(terms, true); if (q2) ast.terms = { quantity: q2 } }
          const prevAl = allocs.length ? allocs[allocs.length - 1] : -1
          const al = say(maybeWrong(authorWho, 0.08), 'promise', ast, { answers: ref(rq), for: ref(o), ...asFor(offerSide) }, { after: chance(0.8) ? AF([rq, prevAl]) : AF([rq], 'none') })
          if (al >= 0) { allocs.push(al); nodes.push(al); const arec = { ix: al, alloc: true, from: fromSide, to: taker }; promises.push(arec) }
        }
      }
    }
    // settling: goods (with lines), money, work, defeats, stops
    const dealFor = () => allocs.length && chance(0.6) ? pick(allocs) : o
    const giver = () => offerSide === 'from' || openKind !== 'openFrom' ? signerOf('from') : pick([x, z, v])
    const receiver = () => open && openKind === 'openTo' ? pick([z, v, y, x]) : toSide
    const lineIds = (terms.lines || []).map(l => l.id)
    for (let i = 0; i < int(1, 7); i++) {
      const k = R()
      const fr = dealFor()
      if (k < 0.35) {
        // goods: an instance (maybe with pack), or an amount, maybe for a line
        const from = maybeWrong(giver(), 0.1), to = receiver()
        if (typeof from !== 'number' || typeof to !== 'number') continue
        const kind = terms.lines && chance(0.8) ? +pick(terms.lines).what.slice(1) : +String(refs.what).slice(1) || thing
        const inst = chance(0.7) ? mkInstance(from, kind) : -1
        const tst = {}
        if (chance(0.5)) tst.amount = AMT(pick([1, 2, '2.5', '0.5', 3, 5, '9007199254740993']), chance(0.85) ? (terms.quantity && terms.quantity.unit) || (terms.lines && terms.lines[0].quantity && terms.lines[0].quantity.unit) || 'kg' : pick(UNITS))
        if (lineIds.length && chance(0.85)) tst.line = chance(0.92) ? pick(lineIds) : 'nope'
        const trefs = { what: ref(inst >= 0 ? inst : kind), to_owner: ref(to), for: ref(fr) }
        if (chance(0.1)) { delete trefs.to_owner; trefs.to_holder = ref(to) }
        const t = say(from, 'transfer', tst, trefs, { after: AF([fr, inst]) })
        if (t >= 0 && chance(0.8)) say(chance(0.9) ? to : pick(people), 'transfer', { status: 'accepted' }, { answers: ref(t), for: ref(fr) }, { after: AF([t]) })
        if (t >= 0 && chance(0.1)) say(pick([to, from, P.e, P.f]), 'observe', { kind: 'report', text: 'bad' }, { defeats: ref(t), for: ref(fr) }, { after: AF([t]) })
        if (t >= 0 && chance(0.08)) confirmBy(P.e, t, { refs: { for: ref(fr) } })
      } else if (k < 0.6) {
        // money, sometimes split over two deals, sometimes the wrong currency
        const payer = typeof toSide === 'number' && openKind !== 'openTo' ? toSide : receiver()
        const payee = typeof fromSide === 'number' ? fromSide : x
        const m = M(pick([100, 250, 333, 500, 999, 1000, 1500, 5000]), chance(0.9) ? cur : (cur === 'GBP' ? 'USD' : 'GBP'))
        const tst = { money: m }
        let frs = ref(fr)
        if (chance(0.12) && promises.length > 1) {
          const other = pick(promises.filter(p => p.ix !== fr)).ix
          frs = [ref(fr), ref(other)].sort()
          if (chance(0.85)) tst.split = [{ for: ref(fr), money: M(Math.floor(m.minor / 2), m.currency), ...(lineIds.length && chance(0.4) ? { line: pick(lineIds) } : {}) }, { for: ref(other), money: M(Math.floor(m.minor / 3), chance(0.9) ? m.currency : 'USD') }]
        }
        const t = say(payer, 'transfer', tst, { what: ref(payer), to_owner: ref(payee), for: frs }, { after: AF([fr]) })
        if (t >= 0 && chance(0.85)) say(payee, 'transfer', { status: 'accepted' }, { answers: ref(t), for: ref(fr) }, { after: AF([t]) })
      } else if (k < 0.68) {
        // work for a job
        const wk = say(giver(), 'observe', { kind: 'work', text: 'w' + i }, { for: ref(fr) }, { after: AF([fr]) })
        if (wk >= 0 && chance(0.7)) say(receiver(), 'observe', { status: 'accepted' }, { answers: ref(wk), for: ref(fr) }, { after: AF([wk]) })
      } else if (k < 0.8) {
        const side = pick(['from', 'to'])
        const who = maybeWrong(signerOf(side), 0.1)
        const stop = pick(['onward', 'onward', 'before', 'before', { occurrences: [iso(clock + 3600000)] }])
        const isAuthor = side === offerSide && fr === o
        const srefs = isAuthor && chance(0.8) ? { updates: ref(fr), for: ref(fr) } : { answers: ref(fr), for: ref(fr) }
        if (srefs.updates && chance(0.3)) delete srefs.for
        Object.assign(srefs, asFor(side))
        const s = say(who, 'promise', { status: 'stopped', stop, ...(chance(0.3) ? { reason: pick(['done', 'let_go', 'replaced', 'ran_out', 'paused', 'lost']) } : {}) }, srefs, { after: AF([fr]) })
        if (s >= 0 && chance(0.3)) confirmBy(signerOf(side === 'from' ? 'to' : 'from'), s, { refs: { for: ref(fr) } })
      } else if (k < 0.88) {
        // decline (sometimes by the offer's signer, after expiry)
        const tgt = pick(nodes)
        say(pick([signerOf('from'), signerOf('to')]), 'promise', { status: 'declined' }, { answers: ref(tgt), for: ref(o) }, { after: AF([tgt]) })
      } else if (k < 0.94) {
        // a refund
        if (typeof fromSide === 'number' && typeof toSide === 'number') { const t = say(fromSide, 'transfer', { money: M(pick([100, 500]), cur) }, { what: ref(fromSide), to_owner: ref(toSide), for: ref(fr) }, { after: AF([fr]) }); if (t >= 0) say(toSide, 'transfer', { status: 'accepted' }, { answers: ref(t), for: ref(fr) }, { after: AF([t]) }) }
      } else {
        // a defeats of the head (refrain breach) by a side, the confirmer, or a stranger
        say(pick([signerOf('to'), signerOf('from'), P.e, P.f]), 'observe', { kind: 'report', text: 'r' }, { defeats: ref(o), for: ref(o) }, { after: AF([o]) })
      }
    }
    // a per-instance ownership read later
    return rec
  }

  // ---- scenario: sealed and visible limits, child grants, acts under them ----
  const limitCases = []
  function scLimits2() {
    const agent = P.g
    const principal = pick([P.a, P.b, P.c])
    const unit = pick(['kg', 'L'])
    const cur = CUR()
    const bigs = [100, 1000, 5000, '9007199254740993', '0.5', '2.50', 5, 0]
    const mk = (v, mode) => mode === 'money' ? M(typeof v === 'number' ? v : (/^\d+$/.test(String(v)) && Number(v) <= 9007199254740991 ? Number(v) : 1), cur) : AMT(v, unit)
    const mode = chance(0.5) ? 'money' : 'amount'
    const lim = chance(0.75) ? mk(pick(bigs), chance(0.9) ? mode : (mode === 'money' ? 'amount' : 'money')) : null
    const each = chance(0.55) ? mk(pick(bigs), chance(0.9) ? mode : (mode === 'money' ? 'amount' : 'money')) : null
    const per = chance(0.8) ? pick(['P7D', 'P1D', 'P1M', 'PT1H', 'P1Y']) : null
    const sealed = chance(0.5) && (lim || each)
    const scope = { acts: pick([['promise'], ['promise', 'transfer'], ['observe', 'promise']]), until: pick(['2028-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z']) }
    if (per) scope.per = per
    let salt = null
    if (sealed) {
      salt = require('crypto').createHash('sha256').update('salt' + seed + ':' + w.steps.length).digest('hex').slice(0, 32)
      try { scope.limit_commitment = lib.callCore('limit_commitment', lim, per, salt, 'std', each).ok } catch (e) { }
      if (!scope.limit_commitment) return
    } else { if (lim) scope.limit = lim; if (each) scope.each = each }
    const depth = chance(0.7) ? 1 : undefined
    const gst = { kind: 'authority', scope }; if (depth) gst.depth = depth
    const g = say(principal, 'grant', gst, { to: ref(agent) }, { after: AF([]) })
    if (g < 0) return
    let obs = -1
    if (sealed) {
      const lf = lib.callCore('limit_fence', w.map[g], w.map[agent], chance(0.9) ? lim : (lim ? mk(pick(bigs), mode) : null), per, chance(0.95) ? salt : 'ab'.repeat(16), each)
      if (lf.ok) obs = say(principal, 'observe', lf.ok.state, lib.jclone(remapBack(lf.ok.refs)), { after: AF([g]) })
    }
    const rec = { g, obs, principal, lim, each, per, sealed, children: [] }
    limitCases.push(rec)
    // children
    for (let i = 0; i < int(0, 3); i++) {
      const cs = { acts: chance(0.8) ? ['promise'] : pick([['observe'], ['promise', 'observe'], ['transfer']]), until: pick(['2028-12-01T00:00:00.000Z', '2029-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z']) }
      const cper = chance(0.8) ? pick(['P7D', 'P1D', 'P1M', 'P2W', 'PT1H', 'P1Y']) : null
      if (cper) cs.per = cper
      const cl = chance(0.7) ? (chance(0.4) && lim ? lim : mk(pick(bigs), chance(0.9) ? mode : 'amount')) : null
      const ce = chance(0.6) ? (chance(0.4) && each ? each : mk(pick(bigs), chance(0.9) ? mode : 'money')) : null
      const csealed = chance(0.5) && (cl || ce)
      let csalt = null
      if (csealed) { csalt = 'cd'.repeat(15) + (i + '0').slice(0, 2).padEnd(2, '0'); const c = lib.callCore('limit_commitment', cl, cper, csalt, 'std', ce); if (c.ok) cs.limit_commitment = c.ok }
      else { if (cl) cs.limit = cl; if (ce) cs.each = ce }
      const to = pick([P.b, P.c, P.d])
      const c = say(agent, 'grant', { kind: 'authority', scope: cs }, { parent: ref(g), to: ref(to) }, { after: AF([g]) })
      if (c < 0) continue
      let cobs = -1
      if (csealed && cs.limit_commitment) { const lf = lib.callCore('limit_fence', w.map[c], w.map[to], cl, cper, csalt, ce); if (lf.ok) cobs = say(agent, 'observe', lf.ok.state, remapBack(lf.ok.refs), { after: AF([c]) }) }
      rec.children.push({ c, cobs, cl, ce, cper, to })
      // acts under the child
      if (chance(0.7)) say(to, 'promise', { terms: { price: chance(0.5) ? mk(pick([100, 1000]), 'money') : { money: M(100, cur), per: AMT(1, unit) }, quantity: AMT(pick([1, 2, 50]), unit), expires: '2028-06-01T00:00:00.000Z' } }, { from: ref(principal), to: ref(pick([P.e, P.f])), what: ref(thing), under: ref(c) }, { after: AF([c]) })
    }
    // acts under the grant by the agent: offers for the principal with prices
    for (let i = 0; i < int(1, 3); i++) {
      const pt = { expires: '2028-06-01T00:00:00.000Z' }
      const r = R()
      if (r < 0.4) pt.price = M(pick([100, 1000, 5000, 9000]), chance(0.9) ? cur : 'USD')
      else if (r < 0.7) { pt.price = { money: M(pick([100, 250]), cur), per: AMT(1, unit) }; pt.quantity = AMT(pick([1, 3, 10, '2.5']), chance(0.9) ? unit : 'g') }
      else pt.lines = [{ id: 'l0', what: ref(thing), quantity: AMT(pick([1, 4]), unit), price: M(pick([100, 600]), cur) }, { id: 'l1', what: ref(thing2), price: M(pick([50, 4000]), cur) }]
      const prefs = pt.lines ? { what: [ref(thing), ref(thing2)].sort() } : { what: ref(thing) }
      const side = chance(0.6) ? 'from' : 'to'
      prefs[side] = ref(principal); prefs[side === 'from' ? 'to' : 'from'] = ref(pick([P.d, P.e, P.f]))
      prefs.under = ref(g)
      const p = say(chance(0.9) ? agent : pick(people), 'promise', { terms: pt }, prefs, { after: AF([g, obs]) })
      if (p >= 0) { promises.push({ ix: p, from: 0, to: 0 }); if (chance(0.6)) say(+prefs[side === 'from' ? 'to' : 'from'].slice(1), 'promise', { status: 'accepted' }, { answers: ref(p), for: ref(p) }, { after: AF([p]) }) }
    }
    if (chance(0.25)) say(principal, 'grant', { kind: 'authority', status: 'stopped', stop: 'onward' }, { updates: ref(g) }, { after: AF([g]) })
  }
  // limit_fence returns real hashes in refs: map them back to step references
  const remapBack = (refs) => { const o = {}; for (const [k, v] of Object.entries(refs || {})) { const i = w.map.indexOf(v); o[k] = i >= 0 ? ref(i) : v } return o }

  // ---- scenario: circle stress: open grants, quorum removals, crossing removers, founder leaving, hands after cuts ----
  function scCircle2() {
    const circ = circles.length ? pick(circles) : setupCircle(true)
    if (!circ) return
    const founderIx = P[circ.founder]
    const recs = memberOf(circ)
    const k = R()
    if (k < 0.2) {
      // open member grant, maybe with powers, joiners accept, a stop of it by a remover or a joiner
      const role = pick(circ.roles)
      const g = say(chance(0.8) ? founderIx : anyMember(circ), 'grant', { kind: 'member', roles: [role.name] }, { subject: ref(circ.ix), as: ref(circ.ix) }, { after: AF([circ.ix]) })
      if (g < 0) return
      const joiners = shuffle(people.filter(p => p !== founderIx)).slice(0, int(1, 3))
      const js = []
      for (const j of joiners) { const a = say(j, 'grant', { status: 'accepted' }, { answers: ref(g), subject: ref(circ.ix) }, { after: AF([g]) }); if (a >= 0) js.push({ j, a }) }
      if (js.length && chance(0.5)) {
        const jj = pick(js)
        if (chance(0.5)) say(jj.j, 'grant', { status: 'stopped', stop: 'onward' }, { answers: ref(g), subject: ref(circ.ix) }, { after: AF([g, jj.a]) })
        else say(founderIx, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', ...(chance(0.5) ? { counted_to: ref(jj.a) } : {}) }, { updates: ref(g), subject: ref(circ.ix), as: ref(circ.ix) }, { after: AF([g, jj.a]) })
      }
      for (const { j } of js) if (chance(0.5)) asCircle(j, circ, 'observe', { kind: 'note', text: 'open' }, {}, { after: AF([g]) })
    } else if (k < 0.45 && recs.length) {
      // quorum removal: several remove holders stop the same grant
      const target = pick(recs)
      const removers = shuffle([founderIx, ...recs.filter(r => r !== target).map(r => r.to)]).slice(0, int(1, 3))
      const stops = []
      for (const rm of removers) {
        const ct = chance(0.6) ? (chance(0.8) ? target.accepted : pick([target.ix, circ.ix])) : -1
        const s = memberStop(target, rm, { counted: ct, after: chance(0.5) && stops.length ? AF([target.ix, target.accepted, ...stops]) : undefined })
        if (s >= 0) stops.push(s)
      }
      // the target goes on acting as the circle after and before seeing it
      if (chance(0.7)) asCircle(target.to, circ, 'observe', { kind: 'note', text: 'after-cut' }, {}, { after: AF([target.accepted, ...(chance(0.5) ? stops : [])]) })
      if (chance(0.4) && recs.length > 1) { const other = pick(recs.filter(r => r !== target)); if (other) memberStop(other, target.to, { counted: other.accepted, after: AF([other.ix, other.accepted], 'none') }) }
    } else if (k < 0.6) {
      // founder's own member grant: invite founder, accept, then leave / be removed
      const rec = invite(circ, founderIx, founderIx, [pick(circ.roles).name])
      if (rec && chance(0.8)) accept(rec)
      if (rec && chance(0.6)) memberStop(rec, chance(0.6) ? founderIx : anyMember(circ), {})
      asCircle(founderIx, circ, 'observe', { kind: 'note', text: 'founder' }, {}, { after: AF([circ.ix]) })
    } else if (k < 0.8) {
      // many hands on a circle-signed promise with confirms from members before/after their cut
      const buyer = pick([P.c, P.d, P.e, P.f])
      const terms = mkDealTerms('GBP')
      const what = terms._what ? (terms._what.length === 1 ? terms._what[0] : terms._what.slice().sort()) : ref(thing); delete terms._what
      const o = say(buyer, 'promise', { terms }, { from: ref(buyer), to: ref(circ.ix), what }, { after: AF([]) })
      if (o < 0) return
      promises.push({ ix: o, from: buyer, to: circ.ix })
      const acc = answerP({ ix: o }, anyMember(circ), { status: 'accepted' }, { asCirc: circ })
      if (acc < 0) return
      const rm = recs.length && chance(0.5) ? pick(recs) : null
      let st = -1
      if (rm) st = memberStop(rm, founderIx, { counted: chance(0.5) ? rm.accepted : -1 })
      for (const m of shuffle([...recs.map(r => r.to), founderIx, pick(people)]).slice(0, int(1, 4))) confirmBy(m, acc, { after: AF([acc, ...(chance(0.5) && st >= 0 ? [st] : [])]) })
      if (chance(0.5)) { const t = say(buyer, 'transfer', { money: M(pick([100, 1000, 5000])) }, { what: ref(buyer), to_owner: ref(circ.ix), for: ref(o) }, { after: AF([o]) }); if (t >= 0) asCircle(anyMember(circ), circ, 'transfer', { status: 'accepted' }, { answers: ref(t), for: ref(o) }, { after: AF([t]) }) }
    } else {
      // concurrent role changes by two admins, then the member answers
      if (!recs.length) return
      const rec = pick(recs)
      const admins = [founderIx, ...recs.map(r => r.to)]
      const c1 = say(pick(admins), 'grant', { kind: 'member', roles: subset(circ.roles.map(r => r.name), 0.6) }, { updates: ref(rec.ix), subject: ref(circ.ix), as: ref(circ.ix) }, { after: AF([rec.ix]) })
      const c2 = say(pick(admins), 'grant', { kind: 'member', roles: subset(circ.roles.map(r => r.name), 0.6) }, { updates: ref(chance(0.3) && c1 >= 0 ? c1 : rec.ix), subject: ref(circ.ix), as: ref(circ.ix) }, { after: AF([rec.ix], 'none') })
      if (chance(0.6)) accept(rec, rec.to, { after: AF([rec.ix, c1, c2]) })
      asCircle(rec.to, circ, 'observe', { kind: 'note', text: 'roles' }, {}, { after: AF([c1, c2]) })
    }
  }

  // ---------- run ----------
  const ALL = ['refrain', 'standing', 'successor', 'circle', 'circle2', 'circle2', 'rolegrant', 'signal', 'limits', 'limits2', 'limits2', 'deal', 'deal', 'deal', 'successor']
  const focus = [...new Set(shuffle(ALL).slice(0, int(2, 5)))]
  const ncirc = int(0, 3)
  for (let i = 0; i < ncirc; i++) setupCircle(chance(0.5))
  const table = { refrain: scRefrain, standing: scStanding, successor: scSuccessor, circle: scCircle, circle2: scCircle2, rolegrant: scRoleGrant, signal: scSignal, limits: scLimits, limits2: scLimits2, deal: scDeal }
  const nact = int(3, opts.max || 9)
  for (let i = 0; i < nact; i++) {
    const f = chance(0.75) ? pick(focus) : pick(Object.keys(table))
    try { table[f]() } catch (e) { throw new Error('generator ' + f + ': ' + e.stack) }
    if (chance(0.15)) scCircle()
  }
  return { w, P, circles, promises, conditions, closes, grantsAuth, rng: R, focus, names, limitCases, instances }
}
module.exports = { genWorld, rng }
