'use strict';
// Every fold of protocol.json (`folds`, and a view that names an `over`), asked of a set of held blocks: the one list the audit
// (test/audit/run.cjs), the simulation check (tools/sim/oracle-check.cjs) and the fuzzer's coverage check read. A fold names what it is
// asked of (`over`) and the door ops that answer it (`ops`); SUBJECTS says which blocks each `over` picks, ASK what one subject gives
// each op. A fold or op this file cannot ask throws, so a new fold is compared everywhere or the tools fail. How an answer is compared
// is OPS in diff.cjs, the one projection table.
const P = require('../../spec/protocol.json');

const keyed = (held) => held.filter((b) => b.type === 'actor' && b.state.public_key_sign);
const SUBJECTS = {
  promise: (held) => held.filter((b) => b.type === 'promise'),
  thing: (held) => held.filter((b) => b.type === 'thing'),
  // a block with a signer's claim beside it (an observe of kind not_free); a claim of invasion
  block: (held) => held.filter((b) => held.some((x) => x.type === 'observe' && x.state.kind === 'not_free' && x.refs.subject === b.hash)),
  invasion: (held) => held.filter((b) => b.type === 'observe' && b.state.kind === 'invasion'),
  as: (held) => held.filter((b) => b.refs.as && held.some((x) => x.hash === b.refs.as)),
  key: keyed,
  person: keyed,
  circle: (held) => held.filter((b) => b.type === 'actor' && b.state.kind === 'circle'),
  circle_role: (held) => held.filter((b) => b.type === 'actor' && b.state.kind === 'circle')
};
const CLOCKS = ['2026-12-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z'];
// op -> (subject, held, subjects of the same kind) => [{ note, args }]
const ASK = {
  promise_stage: (b, held) => [{ args: [b, held, {}] }],
  promise_view: (b, held) => CLOCKS.map((now) => ({ note: ' @' + now.slice(0, 4), args: [b, held, { now }] })),
  ownership: (t, held) => [{ args: [t, held] }],
  where_now: (t, held) => [{ args: [t, held] }],
  shares_on: (t, held) => [{ args: [t, held] }],
  use_shown: (t, held) => [{ args: [t, held, null] }],
  pot: (b, held) => [null, ...CLOCKS].map((now) => ({ note: ' @' + (now || 'none').slice(0, 4), args: [b, held, now] })),
  release_shown: (b, held) => [{ args: [b, held] }],
  bids_shown: (b, held) => [{ args: [b, held] }],
  not_free_shown: (b, held) => [{ args: [b, held] }],
  invasion_shown: (b, held) => [{ args: [b, held] }],
  may_act_as: (b, held) => [{ args: [b, b.refs.as, held, null] }],
  identity_state: (k, held) => [{ args: [k.hash, held, null] }],
  key_timeline: (k, held) => [{ args: [k.hash, held, null] }],
  // a key's own chain: the blocks it wrote that carry a seq, when each names one before it (a store with a hole is not asked)
  check_chain: (k, held) => {
    const mine = held.filter((x) => x.refs.author === k.hash && x.state.seq !== undefined && !(x.type === 'grant' && x.state.kind === 'key'))
    return mine.length && mine.every((x) => x.refs.prev === k.hash || mine.some((y) => y.hash === x.refs.prev)) ? [{ args: [mine, k.hash] }] : []
  },
  next_link: (k, held) => {
    const mine = held.filter((x) => x.refs.author === k.hash && x.state.seq !== undefined && !(x.type === 'grant' && x.state.kind === 'key'))
    return mine.length && mine.every((x) => x.refs.prev === k.hash || mine.some((y) => y.hash === x.refs.prev))
      ? [{ args: [mine.reduce((a, x) => (!a || x.state.seq > a.state.seq ? x : a), null), k.hash] }] : []
  },
  circle_state: (c, held) => [{ args: [c.hash, held, null] }],
  members_then: (c, held) => {
    const roles = (c.state.roles || []).map((r) => r.name)
    return held.filter((x) => x.refs.as === c.hash).flatMap((b) => [c.hash, ...roles.map((r) => `${c.hash}#${r}`)].map((who) => ({ note: ' ' + who.slice(0, 6), args: [b, who, held], block: b })))
  },
  consent: (p, held, people) => [null, ...people].map((q) => ({ note: ' <- ' + (q ? q.hash.slice(0, 6) : 'anyone'), args: [p.hash, q && q.hash, held, null] }))
}

/** Every question the folds of protocol.json ask of `held`: [{ fold, op, what, args }]. `label(block)` names a subject. */
function askAll(held, label = (b) => b.hash.slice(0, 8)) {
  const out = []
  for (const group of ['folds', 'views']) {
    for (const [fold, def] of Object.entries(P[group])) {
      if (!def || typeof def !== 'object' || !def.over) continue
      const subjects = SUBJECTS[def.over]
      if (!subjects) throw new Error(`fold ${fold} is asked of "${def.over}", which folds.cjs does not pick`)
      const all = subjects(held)
      for (const subject of all) {
        for (const op of def.ops) {
          if (!ASK[op]) throw new Error(`fold ${fold}: no way to ask the op ${op} (tools/fuzz/folds.cjs)`)
          for (const q of ASK[op](subject, held, all)) out.push({ fold: def.ops.length > 1 || op !== fold ? `${fold}/${op}` : fold, op, what: label(q.block || subject) + (q.note || ''), args: q.args })
        }
      }
    }
  }
  return out
}
module.exports = { askAll }
