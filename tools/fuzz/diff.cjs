#!/usr/bin/env node
'use strict';
// The random-world test (part 08, section 7.2 of the 1.9 plan): the Rust core against the spec-only oracle (spec/oracle/fb.cjs), on
//   1. the fixed corpus (tools/fuzz/corpus/): every known engine split of part 08's table that stages 0 to 3 can express, each a world
//      named by its table row and the report that found it, plus the old tester's 1.7-shaped reproducers (corpus/legacy-1.7/);
//   2. seeded random worlds in the shapes stages 0 to 3 use (world18.cjs), every door op they answer, compared byte for byte (P1);
//   3. the metamorphic properties on those worlds, held by each engine on its own: P2 order, P3 unrelated blocks, P4 less never otherwise,
//      P5 never "nobody" where a signed accepted word names someone (a finding, never a failure), P6 twice is once, P7 conservation,
//      P8 no call traps or throws.
// Each disagreement or property break is reduced to the smallest world that shows it and named by its cause. A name listed in
// known.json is known; any other fails the run.
//   node tools/fuzz/diff.cjs [--seeds A-B] [--seconds N] [--size N] [--baseline FILE] [--update-baseline] [--no-corpus] [--corpus-only]
//                            [--no-props] [--native] [--show] [--save DIR] [--only NAME]
// The core is asked through its WebAssembly door (sdk/javascript/src/core.cjs) unless --native asks the release binary (fbfuzz serve).
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const fb = require('../../spec/oracle/fb.cjs');

const BIN = path.join(__dirname, 'target/release/fbfuzz');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);

const codes = l => { if (!Array.isArray(l)) return l; const o = []; for (const x of l) { const c = typeof x === 'string' ? x : x.code; if (!o.includes(c)) o.push(c); } return o; };
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o == null ? undefined : o[k]]));
const byHash = (a, b) => (a.hash < b.hash ? -1 : 1);
const acceptProj = a => ({
  taken: (a.taken || []).map(x => (typeof x === 'string' ? x : x.hash)), // the order is part of the answer: round order, ascending by hash inside a round (nodes.md, Push)
  waiting: (a.waiting || []).map(w => ({ hash: typeof w === 'string' ? w : w.hash, needs: [...(w.needs || [])].sort() })).sort(byHash),
  refused: Object.entries((a.refused || []).reduce((m, r) => { (m[r.hash] = m[r.hash] || new Set()).add(r.code); return m; }, {})).map(([hash, c]) => ({ hash, codes: [...c].sort() })).sort(byHash),
  equivocations: (a.equivocations || []).map(p => [...p].sort()).sort(),
});
const members = s => s && Object.fromEntries(Object.entries(s.members || {}).map(([k, m]) => [k, { roles: [...(m.roles || [])].sort(), grant: m.grant, counted_to: m.counted_to }]));
const sorted = l => (Array.isArray(l) ? [...l].sort() : l);
const door = (op) => (...a) => fb.door(op, ...a);
// Each op: how to call the oracle, and how to project both answers to what the spec decides. The one table every checker reads: this
// tester, the audit (test/audit/run.cjs) and the simulation check (tools/sim/oracle-check.cjs). A fold of protocol.json with no entry here
// fails them all. An op with no entry is asked of the oracle's door by name and compared whole (`detail` beside a `code` left out).
const ORDER = Object.keys(require('../../spec/protocol.json').refusals.codes.block);
const OPS = {
  valid: { oracle: (b, held, s) => fb.door('valid', b, held, s), proj: l => codes(l) }, // core.md section 8: the refusal is every code of the first check that finds anything, in list order
  read: { oracle: door('read'), proj: l => codes(l) },
  strict_text: { oracle: t => fb.strictText(t), proj: l => codes(l) },
  check_chain: { oracle: (blocks, id) => fb.chainFold(blocks, id), proj: c => ({ ...pick(c, ['head', 'length', 'ok', 'gaps', 'skips', 'broken']), equivocations: (c.equivocations || []).map(p => [...p].sort()).sort() }) },
  next_link: { oracle: door('next_link'), proj: x => x },
  fork_pairs: { oracle: door('fork_pairs'), proj: l => l.map(p => [...p].sort()).sort() },
  // the whole answer: the 1.7 projection (keys, frozen, operators) read a field the 1.8 oracle no longer gives, and threw (a harness bug, fixed)
  identity_state: { oracle: door('identity_state'), proj: s => s },
  stands: { oracle: door('stands'), proj: x => x },
  key_timeline: { oracle: door('key_timeline'), proj: x => x },
  promise_stage: { oracle: door('promise_stage'), proj: s => s },
  promise_view: { oracle: door('promise_view'), proj: s => s },
  consent: { oracle: door('consent'), proj: c => (c && typeof c === 'object' ? pick(c, ['word', 'block']) : c) },
  is_stranger: { oracle: door('is_stranger'), proj: x => x },
  speaks_for: { oracle: door('speaks_for'), proj: x => x },
  backed: { oracle: door('backed'), proj: x => ({ backed: x.backed, chain: x.chain }) }, // `why` is a sentence, never compared
  backed_all: { oracle: door('backed_all'), proj: x => Object.fromEntries(Object.entries(x).map(([h, v]) => [h, v.backed])) },
  to_come_back: { oracle: door('to_come_back'), proj: x => x.to_come.map(({ why, ...rest }) => rest) },
  listing_check: { oracle: door('listing_check'), proj: x => ({ ok: x.ok, bad: x.bad.map(b => b.hash), left_out: x.left_out }) },
  check_reads: { oracle: door('check_reads'), proj: x => ({ ok: x.ok, read: x.read }) },
  clearing_applied: { oracle: door('clearing_applied'), proj: x => ({ binds: x.binds, who: x.who, missing: x.missing, lines: x.lines.map(({ why, ...rest }) => rest) }) },
  ruling_releases: { oracle: door('ruling_releases'), proj: ({ why, ...rest }) => rest },
  gives: { oracle: door('gives'), proj: x => x },
  scope_reading: { oracle: door('scope_reading'), proj: x => x },
  circle_state: { oracle: door('circle_state'), proj: s => s }, // 1.9 stage 6: the whole answer
  row_holds: { oracle: door('row_holds'), proj: x => x },
  ways_in: { oracle: door('ways_in'), proj: x => x },
  circle_versions: { oracle: door('circle_versions'), proj: x => x },
  members_then: { oracle: door('members_then'), proj: sorted },
  ownership: { oracle: door('ownership'), proj: o => o },
  why_not_under: { oracle: door('why_not_under'), proj: l => (Array.isArray(l) ? l.map(({ detail, ...rest }) => rest) : l) }, // `detail` is a sentence, never compared
  made_from: { oracle: door('made_from'), proj: x => x },
  // the oracle's own whereNow, as the audit has always compared it; its door answers [] for a thing its pool does not hold (corpus/z-door-where-now.cjs asks that)
  where_now: { oracle: (t, held) => fb.whereNow(t, held), proj: sorted },
  shares_on: { oracle: door('shares_on'), proj: x => x },
  machine_lock: { oracle: door('machine_lock'), proj: x => x },
  pot: { oracle: door('pot'), proj: x => x },
  recovery_shown: { oracle: (id, held, now, arr) => fb.door('recovery_shown', id, held, now, arr), proj: x => x },
  release_shown: { oracle: door('release_shown'), proj: x => x },
  bids_shown: { oracle: door('bids_shown'), proj: x => x },
  not_free_shown: { oracle: door('not_free_shown'), proj: x => x },
  invasion_shown: { oracle: door('invasion_shown'), proj: x => x },
  use_shown: { oracle: door('use_shown'), proj: x => x },
  accept: { oracle: door('accept'), proj: acceptProj }, // choices { takes_pairs }: the node's own, both values drawn
  answer_pull: { oracle: door('answer_pull'), proj: a => ({ n: a.blocks.map(x => x.n), next: a.next }) },
  accept_sealed: { oracle: (inc, held, choices) => fb.door('accept_sealed', inc, held, choices), proj: acceptProj },
  admission_refusals: { oracle: (...a) => fb.admissionRefusals(...a), proj: codes },
  refusals: { oracle: (t, s, r) => fb.refusals(t, s, r), proj: codes },
  hash: { oracle: (t, s, r) => fb.hashOfBlock({ type: t, state: s, refs: r }, 'std'), proj: x => x },
  cbor_encode: { oracle: (b, short) => fb.cborEncode(b, short).toString('hex'), proj: x => x },
  cbor_decode: { oracle: h => fb.cborDecode(h), proj: b => b && pick(b, ['hash', 'type', 'state', 'refs', 'signature', 'suite']) },
  unwrap: { oracle: m => fb.unwrap(m), proj: b => b && pick(b, ['hash', 'suite']) },
  pull_refusals: { oracle: (m, f) => fb.pullRefusals(m, f), proj: codes },
  push_refusals: { oracle: (m, f) => fb.pushRefusals(m, f), proj: codes },
  strict_push: { oracle: t => fb.strictPush(t), proj: x => (Array.isArray(x) ? x.map(l => (Array.isArray(l) ? codes(l) : l && l.code ? l.code : l)) : x) },
  // 1.9 stage 7: `open_copy` answers the opened block in each engine's own shape (as core-set-a's compare): the same block, by its id; and
  // the core's door ops that are library calls in the oracle
  open_copy: { oracle: door('open_copy'), proj: x => x && x.hash },
  padded_size: { oracle: n => fb.padSize(n), proj: x => x },
  well_known_errors: { oracle: d => fb.wellKnownErrors(d), proj: x => x },
  announcement: { oracle: d => fb.announcement(d), proj: x => x },
};
const opOf = (op) => OPS[op] || { oracle: door(op), proj: x => x };

// ---- the two engines
let core = null;
const coreCall = () => (core = core || require('../../sdk/javascript/src/core.cjs'));
// one answer of the core, in the door's own shape: { ok } or { error, code?, message }
function coreAsk(op, args) {
  try { return { ok: coreCall().call(op, ...JSON.parse(JSON.stringify(args))) }; }
  catch (e) {
    if (e && e.kind) return { error: e.kind, ...(e.code ? { code: e.code } : {}), message: String(e.message).split('\n')[0] };
    return { error: 'internal', message: `the host saw ${e && e.constructor && e.constructor.name}: ${String(e && e.message).split('\n')[0]}` }; // a WebAssembly trap or a stack overflow (C1, P8)
  }
}
function runRust(reqs) {
  const input = reqs.map(r => JSON.stringify({ op: r.op, args: r.args })).join('\n') + '\n';
  const res = spawnSync(BIN, ['serve'], { input, encoding: 'utf8', maxBuffer: 1 << 30, timeout: 120000 });
  if (res.error || res.status !== 0) return { crash: res.error ? String(res.error) : `exit ${res.status} ${res.signal || ''} ${String(res.stderr).slice(0, 300)}` };
  const lines = res.stdout.split('\n').filter(Boolean);
  if (lines.length !== reqs.length) return { crash: `rust answered ${lines.length} of ${reqs.length}: ${String(res.stderr).slice(0, 300)}` };
  return { answers: lines.map(l => JSON.parse(l)) };
}
const NATIVE = flag('native');
function coreAnswers(reqs) {
  if (!NATIVE) return reqs.map(r => coreAsk(r.op, r.args));
  const x = runRust(reqs);
  if (!x.crash) return x.answers;
  return reqs.map(r => { const y = runRust([r]); return y.crash ? { error: 'internal', message: 'the native core died: ' + y.crash.slice(0, 120) } : y.answers[0]; });
}
function oracleRun(req) {
  const spec = req.door ? { oracle: door(req.op), proj: x => x } : opOf(req.op); // a question marked `door` asks the oracle's door by name, whatever OPS says
  try { return { v: spec.proj(spec.oracle(...JSON.parse(JSON.stringify(req.args)))) }; }
  catch (e) { return { err: e && e.code ? e.code : String(e && e.message).split('\n')[0], thrown: !(e && (e.code || e.kind)), kind: e && e.constructor && e.constructor.name }; }
}

// ---- comparing: one byte form (keys sorted, `detail` beside a `code` left out, as test/audit/same.cjs)
const canon = x => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().filter(q => !(q === 'detail' && 'code' in v)).map(q => [q, v[q]])) : v));
const H = s => String(s).replace(/(sm3:|sha3-256:)?[0-9a-f]{40,}/g, 'H');
const brief = (x, n = 70) => { const s = H(canon(x)); return s === undefined ? 'undefined' : s.length > n ? s.slice(0, n) + '..' : s; };
// Where two answers first part: a path through both, and the two values there. Arrays are walked element by element when equally long.
const obj = x => x && typeof x === 'object' && !Array.isArray(x);
// a list item named by its block (a draw, a waiting word): what it says, without the ids
const itemBrief = x => {
  if (!obj(x)) return brief(x, 60);
  if ('takes' in x) return `a draw (takes ${x.takes}, why ${x.why}, state ${x.state}, to ${x.to === null || x.to === 'open' ? x.to : 'someone'}, amount ${x.amount === null ? 'all' : 'part'})`;
  if ('on' in x) return `a wait (on ${x.on})`;
  return '{' + Object.keys(x).sort().join(',') + '}';
};
function firstDiff(a, b, p = '', an = 'core', bn = 'oracle') {
  if (canon(a) === canon(b)) return null;
  // one answers, the other says it cannot (folds.md, not_shown): that is the whole difference
  if (!!(obj(a) && a.not_shown) !== !!(obj(b) && b.not_shown)) return `${p || 'answer'}: ${an} ${obj(a) && a.not_shown ? 'not_shown' : 'answers ' + (obj(a) ? '{' + Object.keys(a).sort().join(',') + '}' : brief(a, 30))} | ${bn} ${obj(b) && b.not_shown ? 'not_shown' : 'answers ' + (obj(b) ? '{' + Object.keys(b).sort().join(',') + '}' : brief(b, 30))}`;
  if (Array.isArray(a) && Array.isArray(b)) {
    // items named by their block are matched by it: an item only one engine lists is the difference
    const keyed = l => l.length && l.every(x => obj(x) && typeof (x.block || x.hash) === 'string');
    if (keyed(a) && keyed(b)) {
      const id = x => x.block || x.hash, A = new Map(a.map(x => [id(x), x])), B = new Map(b.map(x => [id(x), x]));
      for (const [k, x] of A) if (!B.has(k)) return `${p || 'answer'}[]: only ${an} lists ${itemBrief(x)}`;
      for (const [k, x] of B) if (!A.has(k)) return `${p || 'answer'}[]: only ${bn} lists ${itemBrief(x)}`;
      for (const [k, x] of A) { const d = firstDiff(x, B.get(k), p + '[]', an, bn); if (d) return d; }
    }
    if (a.length !== b.length) return `${p || 'answer'}: ${an} ${a.length} item(s) | ${bn} ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], p + '[]', an, bn); if (d) return d; }
  }
  if (obj(a) && obj(b)) for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) { if (k === 'detail') continue; const d = firstDiff(a[k], b[k], p + '.' + k, an, bn); if (d) return d; }
  return `${p || 'answer'}: ${an} ${brief(a)} | ${bn} ${brief(b)}`;
}
// A cause: what a disagreement is, with ids, amounts and counts taken out, so the same fault in two worlds has one name.
const causeOf = s => H(s).replace(/-?\d+(\.\d+)?/g, 'N');
function compare(req, ans) {
  const o = oracleRun(req), spec = opOf(req.op);
  if (req.op === 'hash' && ans.error === 'argument') return null; // the oracle hashes any value; the door wants text
  if (req.op === 'valid' && ans.ok && Array.isArray(ans.ok)) { const got = codes(ans.ok).map(c => ORDER.indexOf(c)); if (got.some((x, i) => x < 0 || (i && got[i - 1] > x))) return { kind: 'ORDER', detail: 'core codes not in the protocol.json order: ' + codes(ans.ok).join(',') }; }
  const rustErr = ans.error !== undefined;
  if (ans.error === 'internal' && o.thrown) return { kind: 'P8', detail: `both fail: core ${H(ans.message).slice(0, 80)} | oracle throws ${o.kind} ${H(o.err).slice(0, 60)}` };
  if (ans.error === 'internal') return { kind: 'P8', detail: `core: ${H(ans.message).slice(0, 100)} | oracle ${o.err !== undefined ? 'error ' + H(o.err).slice(0, 60) : 'answers'}` };
  if (rustErr && o.thrown) return { kind: 'P8', detail: `oracle throws ${o.kind} ${H(o.err).slice(0, 80)} | core error ${ans.error}` };
  if (rustErr || o.err !== undefined) {
    if (rustErr && o.err !== undefined) return null; // both refuse: the ops give errors for bad arguments; the message is not spec text
    return { kind: 'ERROR', detail: `core ${rustErr ? 'error ' + ans.error + ' ' + (ans.code || H(ans.message).slice(0, 60)) : 'answers ' + brief(spec.proj(ans.ok), 80)} | oracle ${o.err !== undefined ? (o.thrown ? 'throws ' + (o.kind || '') + ' ' : 'error ') + H(o.err).slice(0, 80) : 'answers ' + brief(o.v, 80)}` };
  }
  if (req.op === 'ownership' && ans.ok && req.args[1] && Array.isArray(req.args[1])) { const why = require('./owners.cjs').ownersHaveReasons(req.args[0], req.args[1], ans.ok); if (why) return { kind: 'PROPERTY', detail: 'invariant 37: ' + H(why) }; }
  let r;
  try { r = spec.proj(ans.ok); } catch (e) { return { kind: 'SHAPE', detail: String(e.message) }; }
  const d = firstDiff(r, o.v);
  if (d) return { kind: 'DIFF', detail: d };
  return null;
}

// ---- reducing: drop blocks from the lists in the arguments while the same cause stays
// What a reduced world always keeps: every block's pieces (a genesis, a key grant: valid waits on them, so a node holds them before it holds
// anything they sign) and the subject asked about. Without them a reduced world stands for no store a node could hold.
// It also keeps every block another kept block names as its prev: the reducer cuts a line only at its end, so a hole in a reduced world
// is one the generator made on purpose (a missing block, a header), never one the reducer made.
const keeps = (x, subject, list) => x && (x.type === 'actor' && x.refs && !x.refs.author || x.type === 'grant' && x.state && x.state.kind === 'key' || (subject && x.hash === subject)
  || (list && list.some(y => y && y !== x && ((y.refs && y.refs.prev === x.hash) || (y.header && y.header.prev === x.hash) || (x.header && y.refs && y.refs.prev === x.header.hash)))));
function shrinkArgs(req, still, budgetMs = 4000) {
  let cur = JSON.parse(JSON.stringify(req));
  const t0 = Date.now();
  const subject = req.args[0] && typeof req.args[0] === 'object' && !Array.isArray(req.args[0]) ? req.args[0].hash : null;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let ai = 0; ai < cur.args.length; ai++) {
      if (!Array.isArray(cur.args[ai])) continue;
      for (let i = cur.args[ai].length - 1; i >= 0; i--) {
        if (Date.now() - t0 > budgetMs) return cur;
        if (req.op !== 'valid' && req.op !== 'accept' && keeps(cur.args[ai][i], subject, cur.args[ai])) continue;
        const t = JSON.parse(JSON.stringify(cur)); t.args[ai].splice(i, 1);
        if (still(t)) { cur = t; changed = true; }
      }
    }
    if (!changed) break;
  }
  return cur;
}
const sizeOf = req => req.args.filter(Array.isArray).reduce((n, a) => n + a.length, 0);
const short = r => JSON.stringify(r.args, (k, v) => (typeof v === 'string' && /^[0-9a-f]{40,}$/.test(v) ? v.slice(0, 6) : k === 'signature' || k === 'header_signature' ? undefined : v));

// ---- one run
function main() {
  const t0 = Date.now();
  const found = new Map(); // name -> { name, group, kind, op, detail, count, repro, size, where }
  const note = (name, f) => { if (found.has(name)) { const g = found.get(name); g.count++; if (f.size !== undefined && f.size < g.size) Object.assign(g, f, { count: g.count }); return false; } found.set(name, { count: 1, ...f, name }); return true; };
  const only = arg('only', null);
  let total = 0, worlds = 0, propChecks = 0; const opCount = {};

  // 1. the fixed corpus
  if (!flag('no-corpus')) {
    const { loadCorpus } = require('./corpus.cjs');
    for (const entry of loadCorpus(only)) {
      if (entry.buildError) { note(`corpus ${entry.name}: the world does not build`, { group: 'corpus', kind: 'BUILD', row: entry.row, detail: entry.buildError }); continue; }
      const ans = coreAnswers(entry.questions);
      entry.questions.forEach((q, i) => {
        total++; opCount[q.op] = (opCount[q.op] || 0) + 1;
        const bad = compare(q, ans[i]);
        if (flag('answers')) { const o = oracleRun(q); console.log(`${bad ? 'DIFF' : 'same'} row ${q.row || entry.row} | ${q.world} | ${q.label}\n   core   ${brief(ans[i].ok !== undefined ? opOf(q.op).proj(ans[i].ok) : ans[i], 260)}\n   oracle ${brief(o.v !== undefined ? o.v : o, 260)}`); }
        if (!bad) return;
        note(`row ${q.row || entry.row}: ${entry.name} | ${q.world} | ${q.label}`, { group: 'corpus', row: q.row || entry.row, source: entry.source, kind: bad.kind, op: q.op, detail: bad.detail, repro: q, size: sizeOf(q) });
      });
    }
  }

  // 2 and 3. random worlds and their properties
  if (!flag('corpus-only')) {
    const { casesOf18, checkProp, checkAnswer } = require('./world18.cjs');
    const [a, b] = String(arg('seeds', '1-10')).split('-').map(Number), last = b || a;
    const seconds = Number(arg('seconds', 0)), size = Number(arg('size', 30));
    for (let seed = a; seconds ? true : seed <= last; seed++) {
      if (seconds && Date.now() - t0 > seconds * 1000) break;
      const { cases, props } = casesOf18(seed, size);
      worlds++;
      const ans = coreAnswers(cases);
      cases.forEach((c, i) => {
        total++; opCount[c.op] = (opCount[c.op] || 0) + 1;
        for (const x of checkAnswer(c.op, c.args, ans[i])) note(`${x.p} (core): ${causeOf(x.detail)}`, { group: x.p, kind: x.p, op: c.op, detail: x.detail, repro: c, size: sizeOf(c), seed });
        const bad = compare(c, ans[i]);
        if (!bad) return;
        const name = `${bad.kind === 'P8' ? 'P8' : 'P1'} ${c.op} ${bad.kind}: ${causeOf(bad.detail)}`;
        if (!note(name, { group: bad.kind === 'P8' ? 'P8' : 'P1', kind: bad.kind, op: c.op, detail: bad.detail, repro: c, size: sizeOf(c), seed })) return;
        const small = shrinkArgs(c, t => { const x = compare(t, coreAsk(t.op, t.args)); return x && `${x.kind === 'P8' ? 'P8' : 'P1'} ${t.op} ${x.kind}: ${causeOf(x.detail)}` === name; });
        Object.assign(found.get(name), { repro: small, size: sizeOf(small) });
      });
      // the oracle's own P5 and P7, on the same answers
      cases.forEach(c => { if (c.op !== 'ownership') return; const o = oracleRun(c); if (o.v) for (const x of checkAnswer(c.op, c.args, { ok: o.v })) note(`${x.p} (oracle): ${causeOf(x.detail)}`, { group: x.p, kind: x.p, op: c.op, detail: x.detail, repro: c, size: sizeOf(c), seed }); });
      if (!flag('no-props')) {
        const engines = { core: (op, args) => coreAsk(op, args), oracle: (op, args) => { const o = oracleRun({ op, args }); return o.err !== undefined ? { error: o.err } : { ok: o.v }; } };
        for (const pr of props.props) for (const [en, ask] of Object.entries(engines)) {
          propChecks++;
          const br = checkProp(pr, ask, pr.base);
          if (!br) continue;
          const name = `${pr.p} (${en}): ${pr.what}: ${causeOf(br.detail)}`;
          if (!note(name, { group: pr.p, kind: pr.p, op: pr.s.op, detail: br.detail, seed, size: pr.base.length, repro: { op: pr.s.op, args: pr.s.args(pr.base), variant: pr.what } })) continue;
          // reduce: drop blocks from the base while the same property breaks the same way (never the subject)
          let held = pr.base.slice();
          const t1 = Date.now();
          for (let pass = 0; pass < 2; pass++) for (let i = held.length - 1; i >= 0; i--) {
            if (Date.now() - t1 > 4000 || keeps(held[i], pr.s.subject.hash, held)) continue;
            const h2 = held.slice(0, i).concat(held.slice(i + 1));
            const b2 = checkProp(pr, ask, h2);
            if (b2 && `${pr.p} (${en}): ${pr.what}: ${causeOf(b2.detail)}` === name) held = h2;
          }
          Object.assign(found.get(name), { size: held.length, repro: { op: pr.s.op, args: pr.s.args(held), variant: pr.what, variantArgs: pr.s.args(pr.variant(held)) } });
        }
      }
    }
  }

  // ---- the report
  const baselineFile = arg('baseline', path.join(__dirname, 'known.json'));
  const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {};
  const list = [...found.values()];
  if (flag('update-baseline')) {
    const next = {};
    for (const f of list) next[f.name] = baseline[f.name] || { row: f.row || null, group: f.group, kind: f.kind, op: f.op || null, ...(f.source ? { source: f.source } : {}), detail: H(f.detail).slice(0, 300), example: f.repro ? short(f.repro).slice(0, 300) : '', note: '' };
    // keep the names this run did not reach (a longer run found them): they stay known until someone deletes them
    // (a corpus-only run drops the corpus names it no longer sees: those splits are fixed, or their world changed)
    for (const [k, v] of Object.entries(baseline)) if (!next[k] && !(flag('corpus-only') && v.group === 'corpus')) next[k] = v;
    fs.writeFileSync(baselineFile, JSON.stringify(next, null, 1) + '\n');
    console.log(`known.json written: ${Object.keys(next).length} known differences and property breaks`);
    process.exit(0);
  }
  const fresh = list.filter(f => !(f.name in baseline));
  const known = list.length - fresh.length;
  const P5 = list.filter(f => f.group === 'P5');
  const failing = fresh.filter(f => f.group !== 'P5'); // P5 is recorded as a finding, never a failure (the engines do it today)
  const groups = {};
  for (const f of list) groups[f.group] = (groups[f.group] || 0) + 1;
  console.log(`worlds ${worlds} random + corpus; ${total} questions to both engines; ${propChecks} property checks; ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log(`ops: ${Object.entries(opCount).sort((x, y) => y[1] - x[1]).map(([k, n]) => k + ' ' + n).join(', ')}`);
  console.log(`distinct findings ${list.length} (by group: ${Object.entries(groups).map(([k, n]) => k + ' ' + n).join(', ')}); known ${known}; new ${fresh.length}${P5.length ? `; P5 findings (never a failure) ${P5.length}` : ''}`);
  const rows = [...new Set(list.filter(f => f.group === 'corpus').map(f => f.row))].sort((x, y) => String(x).localeCompare(String(y), undefined, { numeric: true }));
  if (rows.length) console.log(`table rows the corpus shows as engine splits: ${rows.join(', ')}`);
  const show = (f, i) => {
    console.log(`\n#${i} ${f.name}\n   [${f.kind}] ${f.op || ''}${f.seed !== undefined ? ' seed ' + f.seed : ''} x${f.count}${f.size !== undefined ? ', smallest world ' + f.size + ' block(s)' : ''}\n   ${H(f.detail).slice(0, 300)}`);
    if (f.seed !== undefined && f.repro) console.log('   world: ' + storyOf(f.seed, f.repro));
    if (flag('show') && f.repro) console.log('   ' + short(f.repro).slice(0, 700));
  };
  const toShow = flag('all') ? list : fresh;
  if (toShow.length) console.log(flag('all') ? '\nall findings:' : '\nnot in known.json:');
  toShow.forEach(show);
  const gone = Object.keys(baseline).filter(k => !found.has(k) && baseline[k].group === 'corpus' && !flag('corpus-only') === !flag('no-corpus'));
  if (gone.length && !only) console.log(`\nknown corpus splits no longer seen (fixed, or the world changed): ${gone.length}\n  ${gone.slice(0, 20).join('\n  ')}`);
  const save = arg('save', null);
  if (save) { fs.mkdirSync(save, { recursive: true }); list.forEach((f, i) => f.repro && fs.writeFileSync(path.join(save, `${String(i).padStart(3, '0')}-${(f.op || f.kind).replace(/\W/g, '')}.json`), JSON.stringify({ name: f.name, ...f.repro }, null, 1))); }
  process.exit(failing.length ? 1 : 0);
}
// The smallest world of a random finding, told by who signed each block and what it is: the seed's world is built again and each id named
// by the note it was written with ("harry: draw 4"). A block held only as its header is marked [header]; for a property, what the variant
// changed is said last.
const stories = new Map();
function storyOf(seed, repro) {
  if (!stories.has(seed)) {
    const g = require('./world18.cjs').makeWorld18(seed, Number(arg('size', 30)));
    const who = Object.fromEntries(Object.values(g.w.people).map(p => [p.id, p.label]));
    stories.set(seed, new Map([...g.w.byNote].map(([n, b]) => [b.hash, (b.refs && b.refs.author ? (who[b.refs.author] || '?') + ': ' : '') + n.replace(/ \[hand-signed: the writer refused\]/, ' (hand-signed)')])));
  }
  const names = stories.get(seed);
  const one = x => (x && x.header ? '[header] ' + (names.get(x.header.hash) || x.header.hash.slice(0, 6)) : x && x.hash ? names.get(x.hash) || x.hash.slice(0, 6) : typeof x === 'string' && names.has(x) ? names.get(x) : null);
  const parts = [];
  repro.args.forEach((a, i) => {
    if (Array.isArray(a)) { const l = a.map(one).filter(Boolean); if (l.length) parts.push(`held [${l.filter(s => !/^genesis /.test(s)).join('; ')}]`); }
    else { const s = one(a); if (s) parts.push(i === 0 ? `asks of ${s}` : s); }
  });
  if (repro.variantArgs) {
    const ids = l => new Set((l.find(Array.isArray) || []).map(x => (x.header ? 'h' + x.header.hash : x.hash)));
    const A = ids(repro.args), B = ids(repro.variantArgs);
    const gone = [...A].filter(x => !B.has(x)).map(x => names.get(x.replace(/^h/, '')) || x.slice(0, 7));
    parts.push(`then ${repro.variant}${gone.length ? ': ' + gone.join('; ') : ''}`);
  }
  return parts.join(' | ');
}
// A fold of protocol.json that nothing here can ask is a hole in every checker: fail, never skip it.
const unaskable = () => ['folds', 'views'].flatMap(k => Object.entries(k === 'views' ? require('../../spec/conventions.json').views : require('../../spec/protocol.json')[k]).filter(([, f]) => f && f.over && f.ops.some(o => !OPS[o])).map(([n]) => n));
const casesOf = (seed, size) => require('./world18.cjs').casesOf18(seed, size).cases;
if (require.main === module) { const hole = unaskable(); if (hole.length) { console.log('no OPS entry for the fold(s) ' + hole.join(', ')); process.exit(1); } main(); }
else module.exports = { oracleRun, OPS, casesOf, runRust, compare, unaskable, firstDiff, coreAsk, canon };
