// Stage 3 of FoodBlock 1.8, amounts (changes-1.8/03-amounts.md): the helpers the k3 story files share. Each k3 file keeps its own
// `questions`; `makeAsk(questions)` gives it the `ask(w, kase, question, op, args, expect, text, view)` of k2-store.cjs, unchanged.
// Every expectation that rests on a reading of a silent or unclear text says so in its `text`, starting "UNCLEAR:".
const { World, fb, oracle, kindOf, handSign } = require('./lib.cjs')
const { call } = require('../../sdk/javascript/src/core.cjs')

let minute = 0
const at = () => new Date(Date.UTC(2026, 10, 11) + ++minute * 60000).toISOString().replace(/\.\d+Z$/, '.000Z')

function makeAsk(questions) {
  return function ask(w, kase, question, op, args, expect, text, view = (x) => x) {
    const real = args.map((a) => (a === 'held' ? w.blocks.slice() : a))
    const answer = (engine) => { try { return engine(op, ...JSON.parse(JSON.stringify(real))) } catch (e) { return { error: String(e.message).split('\n')[0], ...(e.code ? { code: e.code } : {}) } } }
    const whole = answer(call), oracleWhole = answer(oracle.door)
    let core
    try { core = view(whole) } catch (_) { core = whole }
    questions.push({ world: w.name, case: kase, question, op, args: real, expect, text, core, whole, oracleWhole, agrees: JSON.stringify(core) === JSON.stringify(expect) })
    return core
  }
}

// An amount: `{ value, unit }`, or with `of`. The money shape `{ minor, currency }` is gone; nothing here writes it.
const amt = (value, unit, of) => (of ? { value: String(value), unit, of } : { value: String(value), unit })

// A block signed by hand at a chosen place on a line (k2-store.cjs): `prev`, `seq`, and `keyRef` for a key that is not the genesis key.
const sets = (refs) => Object.fromEntries(Object.entries(refs).map(([k, x]) => [k, Array.isArray(x) ? [...new Set(x)].sort() : x]))
function signed(p, keys, type, state, refs, { prev, seq, keyRef, audience = 'public' }) {
  const after = keys.after && keyRef ? { after: [keys.after] } : {}
  const block = fb.create(type, { at: at(), audience, seq, ...state }, sets({ author: p.id, prev, ...(keyRef ? { key: keyRef } : {}), ...after, ...refs }))
  return { ...block, signature: handSign(block, keys.private_key) }
}
const next = (w, keys, p) => fb.identity.nextLinkFor(p.id, keys.public_key_sign, w.blocks)

// Write a block; where the writer refuses it (the core may not yet know the new shapes), sign it by hand at the next place on the
// signing key's line, so the story still holds it and the question is still asked. `opts.key` is another key, carrying `.grant`.
function put(w, p, type, state, refs = {}, note = '', opts = {}) {
  refs = sets(refs)
  // a second key's blocks see the block that signed its key grant again, so the key grant stands in their causal past (identity.md)
  if (opts.key && opts.key.after) opts = { ...opts, after: [...new Set([...(opts.after || []), opts.key.after])].sort() }
  const r = w.w(p, type, state, refs, note, opts)
  if (!r || !r.refusedWrite) return r
  const keys = opts.key || p.keys
  try {
    const l = next(w, keys, p)
    return w.add(signed(p, keys, type, state, refs, { prev: l.prev, seq: l.seq, keyRef: keys.grant }), note + ' [hand-signed: the writer refused]')
  } catch (e) {
    // Not even signable by hand: the story goes on with a stand-in, and the questions that name it read the core's error.
    w.log.push({ note, unsigned: String(e.message).split('\n')[0] })
    return { refusedWrite: true, type, state: { ...state }, refs: { ...refs }, hash: 'unwritten:' + note }
  }
}

// Two blocks of one key at one place on its line (one prev, one seq): a pair.
function pairOf(w, p, keys, a, b) {
  const l = next(w, keys, p)
  const one = w.add(signed(p, keys, a[0], a[1], a[2], { prev: l.prev, seq: l.seq, keyRef: keys.grant }), a[3])
  const two = w.add(signed(p, keys, b[0], b[1], b[2], { prev: l.prev, seq: l.seq, keyRef: keys.grant }), b[3])
  return [one, two]
}

// A second key of a person, brought in by a key grant her genesis key signs (k2-store.cjs, story 3).
// A word that lets another key act for her is signed twice (blocks.md, Finality; the first voice's wait is zero), so she signs it again.
function secondKey(w, p, note) {
  const keys = fb.generateKeypair()
  const g = put(w, p, 'grant', { kind: 'key', public_key_sign: keys.public_key_sign }, { subject: p.id }, note)
  const again = put(w, p, 'observe', { kind: 'note' }, { confirms: [g.hash] }, note + ' (signed again)')
  keys.grant = g.hash
  keys.after = again.hash
  return keys
}

// Common blocks of the stories.
const thing = (w, p, word, pack, note, refs = {}) => put(w, p, 'thing', { kind: word, ...(pack ? { pack } : {}) }, { of: kindOf(word), ...refs }, note)
const give = (w, p, what, to, amount, note, refs = {}, opts = {}) =>
  put(w, p, 'transfer', amount ? { amount } : {}, { ...(what ? { what: what.hash } : {}), to_owner: to.id, ...refs }, note, opts)
const yes = (w, p, block, note, state = {}, refs = {}, opts = {}) =>
  put(w, p, block.type, { status: 'accepted', ...state }, { answers: block.hash, ...(block.refs.for ? { for: block.refs.for } : {}), ...refs }, note, opts)
const no = (w, p, block, note) => put(w, p, 'observe', { status: 'declined' }, { answers: block.hash, ...(block.refs.for ? { for: block.refs.for } : {}) }, note)
// A deal: `from` offers, `to` accepts. `what` a thing (instance or kind) or null.
function deal(w, from, to, what, terms, note) {
  const offer = put(w, from, 'promise', { terms }, { ...(what ? { what: what.hash || what } : {}), from: from.id, to: to.id }, note + ': the offer')
  const accept = put(w, to, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, note + ': the accept')
  return { offer, accept }
}

// Views: they pick the part a question reads, with ids shown as the people's labels.
const labels = (w) => Object.fromEntries(Object.values(w.people).map((p) => [p.id, p.label]))
const v = (a) => (a && typeof a === 'object' && 'value' in a ? a.value : a)
const ownersView = (w) => (o) => (o.not_shown ? o : o.owners.map((x) => ({ owner: labels(w)[x.owner] || x.owner, amount: v(x.amount) })))
const ownerView = (w) => (o) => (o.not_shown ? o : o.owner === null ? null : labels(w)[o.owner] || o.owner)
// The owners the text gives, sorted by owner id as the fold sorts them.
const owners = (...rows) => rows.slice().sort((a, b) => (a[0].id < b[0].id ? -1 : 1)).map(([p, amount]) => ({ owner: p.label, amount }))
const drawView = (h, list = 'draws') => (o) => {
  if (o.not_shown) return o
  const d = o[list].find((x) => x.block === h)
  return d ? { takes: d.takes, why: d.why, state: d.state } : 'not listed'
}
const D = (takes, why, state) => ({ takes, why, state })
const sums = (...keys) => (o) => (o.not_shown ? o : Object.fromEntries(keys.map((k) => [k, v(o[k])])))
const waitingView = (h) => (o) => (o.not_shown ? o : (o.waiting.find((x) => x.block === h) || { on: 'not waiting' }).on)
const codes = (r) => (Array.isArray(r) ? r.map((x) => x.code) : r)

function report(questions) {
  for (const q of questions) console.log(`${q.agrees ? '=' : 'DIFFERS'} | ${q.world} | ${q.question} | expect ${JSON.stringify(q.expect).slice(0, 120)} | core ${JSON.stringify(q.core).slice(0, 160)}`)
  const n = questions.filter((q) => !q.agrees).length
  console.log(`\n${questions.length} questions, ${n} where the core differs from the text, ${questions.filter((q) => /UNCLEAR:/.test(q.text)).length} resting on an UNCLEAR reading`)
}

module.exports = { World, fb, oracle, call, kindOf, at, makeAsk, amt, signed, next, put, pairOf, secondKey, thing, give, yes, no, deal, labels, v, ownersView, ownerView, owners, drawView, D, sums, waitingView, codes, report }
