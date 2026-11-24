'use strict';
// Every fold of protocol.json and of conventions.json (`folds`), and a view that names an `over`, asked of a set of given blocks: the one list the audit
// (test/audit/run.cjs) and the fuzzer's coverage check read. A fold names what it is
// asked of (`over`) and the door ops that answer it (`ops`); SUBJECTS says which blocks each `over` picks, ASK what one subject gives
// each op. A fold or op this file cannot ask throws, so a new fold is compared everywhere or the tools fail. How an answer is compared
// is OPS in diff.cjs, the one projection table.
const P = require('../../spec/protocol.json');
const C = require('../../spec/conventions.json'); // `views` is a reading's list (conventions.json)

const keyed = (blocks) => blocks.filter((b) => b.type === 'actor' && b.state.public_key_sign);
const SUBJECTS = {
  promise: (blocks) => blocks.filter((b) => b.type === 'promise'),
  thing: (blocks) => blocks.filter((b) => b.type === 'thing'),
  // a block with a signer's claim beside it (an observe of kind not_free); a claim of invasion
  block: (blocks) => blocks.filter((b) => blocks.some((x) => x.type === 'observe' && x.state.kind === 'not_free' && x.refs.subject === b.hash)),
  invasion: (blocks) => blocks.filter((b) => b.type === 'observe' && b.state.kind === 'invasion'),
  as: (blocks) => blocks.filter((b) => b.refs.as && blocks.some((x) => x.hash === b.refs.as)),
  key: keyed,
  person: keyed,
  circle: (blocks) => blocks.filter((b) => b.type === 'actor' && b.state.kind === 'circle'),
  circle_role: (blocks) => blocks.filter((b) => b.type === 'actor' && b.state.kind === 'circle')
};
const CLOCKS = ['2026-12-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z'];
// op -> (subject, blocks, subjects of the same kind) => [{ note, args }]
const ASK = {
  promise_stage: (b, blocks) => [{ args: [b, blocks, {}] }],
  promise_view: (b, blocks) => CLOCKS.map((now) => ({ note: ' @' + now.slice(0, 4), args: [b, blocks, { now }] })),
  ownership: (t, blocks) => [{ args: [t, blocks] }],
  made_from: (t, blocks) => [{ args: [t, blocks] }],
  where_now: (t, blocks) => [{ args: [t, blocks] }],
  shares_on: (t, blocks) => [{ args: [t, blocks] }],
  machine_lock: (t, blocks) => [null, ...CLOCKS].map((now) => ({ note: ' @' + (now || 'none').slice(0, 4), args: [t, blocks, now] })),
  use_shown: (t, blocks) => [{ args: [t, blocks, null] }],
  pot: (b, blocks) => [null, ...CLOCKS].map((now) => ({ note: ' @' + (now || 'none').slice(0, 4), args: [b, blocks, now] })),
  release_shown: (b, blocks) => [{ args: [b, blocks] }],
  recovery_shown: (p, blocks) => CLOCKS.map((now) => ({ note: ' @' + now.slice(0, 4), args: [p.hash, blocks, now, null] })),
  bids_shown: (b, blocks) => [{ args: [b, blocks] }],
  not_free_shown: (b, blocks) => [{ args: [b, blocks] }],
  invasion_shown: (b, blocks) => [{ args: [b, blocks] }],
  // row_holds reads the circle from refs.as
  row_holds: (b, blocks) => [{ args: [b, blocks] }],
  identity_state: (k, blocks) => [{ args: [k.hash, blocks, null] }],
  // The op of blocks.md, Finality: whether each of a key's blocks stands, asked of its first few
  stands: (k, blocks) => blocks.filter((b) => b.refs && b.refs.author === k.hash).slice(0, 4).map((b) => ({ block: b, args: [b, blocks] })),
  key_timeline: (k, blocks) => [{ args: [k.hash, blocks, null] }],
  // a key's own chain: the blocks it wrote that carry a seq, when each names one before it (a store with a hole is not asked)
  check_chain: (k, blocks) => {
    const mine = blocks.filter((x) => x.refs.author === k.hash && x.state.seq !== undefined && !(x.type === 'grant' && x.state.kind === 'key'))
    return mine.length && mine.every((x) => x.refs.prev === k.hash || mine.some((y) => y.hash === x.refs.prev)) ? [{ args: [mine, k.hash] }] : []
  },
  next_link: (k, blocks) => {
    const mine = blocks.filter((x) => x.refs.author === k.hash && x.state.seq !== undefined && !(x.type === 'grant' && x.state.kind === 'key'))
    return mine.length && mine.every((x) => x.refs.prev === k.hash || mine.some((y) => y.hash === x.refs.prev))
      ? [{ args: [mine.reduce((a, x) => (!a || x.state.seq > a.state.seq ? x : a), null), k.hash] }] : []
  },
  circle_state: (c, blocks) => [{ args: [c.hash, blocks, null] }],
  circle_versions: (c, blocks) => [{ args: [c.hash, blocks] }],
  ways_in: (c, blocks) => [{ args: [c.hash, blocks] }],
  members_then: (c, blocks) => {
    return blocks.filter((x) => x.refs.as === c.hash).map((b) => ({ note: ' ' + c.hash.slice(0, 6), args: [b, c.hash, blocks], block: b }))
  },
  consent: (p, blocks, people) => [null, ...people].map((q) => ({ note: ' <- ' + (q ? q.hash.slice(0, 6) : 'anyone'), args: [p.hash, q && q.hash, blocks, null] }))
}

// Reads of the door that no fold of protocol.json names, asked of every world the same way: whom a block speaks for (every block that is signed
// `as` a circle or acts `under` a grant, and the first of the rest), whether a person is a stranger to a sender (every pair of keyed actors, and a
// sender's block that acts under a grant or as a circle), and the reading of every grant's scope. { op: (blocks) => [{ note?, block?, args }] }
const READS = {
  speaks_for: (blocks) => {
    const acting = blocks.filter((b) => b.refs && (b.refs.as || b.refs.under)), plain = blocks.filter((b) => b.refs && !b.refs.as && !b.refs.under).slice(0, 3)
    return [...acting, ...plain].map((b) => ({ block: b, args: [b, blocks] }))
  },
  backed: (blocks) => {
    const people = keyed(blocks)
    return blocks.filter((b) => b.refs && (b.refs.as || b.refs.under)).flatMap((b) => people.map((p) => ({ note: ` by ${p.hash.slice(0, 6)}`, block: b, args: [b, p.hash, blocks] })))
  },
  is_stranger: (blocks) => {
    const people = keyed(blocks)
    return people.flatMap((r) => people.filter((q) => q !== r).flatMap((q) => [
      { note: ` <- ${q.hash.slice(0, 6)}`, block: r, args: [r.hash, q.hash, blocks] },
      ...blocks.filter((b) => b.refs && b.refs.author === q.hash && (b.refs.as || b.refs.under)).slice(0, 2).map((b) => ({ note: ` <- ${q.hash.slice(0, 6)} by ${b.hash.slice(0, 6)}`, block: r, args: [r.hash, q.hash, blocks, b] })),
    ]))
  },
  scope_reading: (blocks) => blocks.filter((b) => b.type === 'grant' && b.state && b.state.scope !== undefined).map((b) => ({ block: b, args: [b.state.scope] }))
}

/** Every question the folds of protocol.json and conventions.json, and the views, ask of `blocks`, and the reads above: [{ fold, op, what, args }]. `label(block)` names a subject. */
function askAll(blocks, label = (b) => b.hash.slice(0, 8)) {
  const out = []
  for (const group of [P.folds, C.folds, C.views]) {
    for (const [fold, def] of Object.entries(group)) {
      if (!def || typeof def !== 'object' || !def.over) continue
      const subjects = SUBJECTS[def.over]
      if (!subjects) throw new Error(`fold ${fold} is asked of "${def.over}", which folds.cjs does not pick`)
      const all = subjects(blocks)
      for (const subject of all) {
        for (const op of def.ops) {
          if (!ASK[op]) throw new Error(`fold ${fold}: no way to ask the op ${op} (tools/fuzz/folds.cjs)`)
          for (const q of ASK[op](subject, blocks, all)) out.push({ fold: def.ops.length > 1 || op !== fold ? `${fold}/${op}` : fold, op, what: label(q.block || subject) + (q.note || ''), args: q.args })
        }
      }
    }
  }
  for (const [op, ask] of Object.entries(READS)) for (const q of ask(blocks)) out.push({ fold: op, op, what: label(q.block) + (q.note || ''), args: q.args })
  return out
}
module.exports = { askAll }
