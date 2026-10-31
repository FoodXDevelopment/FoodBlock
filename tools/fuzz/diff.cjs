#!/usr/bin/env node
'use strict';
// Differential fuzzing: the Rust core (through its JSON door, `fbfuzz serve`) against the spec-only oracle
// (spec/oracle/fb.cjs), on generated worlds and mutated blocks.
//   node tools/fuzz/diff.cjs [--seeds A-B] [--seconds N] [--size N] [--save DIR] [--replay FILE]
// Any disagreement prints the seed and a minimal reproducer; the same seed replays exactly.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const fb = require('../../spec/oracle/fb.cjs');
const { rng, mutate, makeWorld } = require('./world.cjs');

const BIN = path.join(__dirname, 'target/release/fbfuzz');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

const codes = l => { const o = []; for (const x of l) { const c = typeof x === 'string' ? x : x.code; if (!o.includes(c)) o.push(c); } return o; };
const hashes = l => (l || []).map(x => (typeof x === 'string' ? x : x.hash)).sort();
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o == null ? undefined : o[k]]));
// What a push gives, as the spec decides it: what is taken, what waits (and for what), the codes each refused block got, the pairs.
const byHash = (a, b) => (a.hash < b.hash ? -1 : 1);
const acceptProj = a => ({
  taken: (a.taken || []).map(x => (typeof x === 'string' ? x : x.hash)), // the order is part of the answer: round order, ascending by hash inside a round (nodes.md, Push)
  waiting: (a.waiting || []).map(w => ({ hash: typeof w === 'string' ? w : w.hash, needs: [...(w.needs || [])].sort() })).sort(byHash),
  refused: Object.entries((a.refused || []).reduce((m, r) => { (m[r.hash] = m[r.hash] || new Set()).add(r.code); return m; }, {})).map(([hash, c]) => ({ hash, codes: [...c].sort() })).sort(byHash),
  equivocations: (a.equivocations || []).map(p => [...p].sort()).sort(),
});
const members = s => s && Object.fromEntries(Object.entries(s.members || {}).map(([k, m]) => [k, { roles: [...(m.roles || [])].sort(), grant: m.grant, counted_to: m.counted_to }]));
const sorted = l => [...l].sort();
// Each op: how to call the oracle, and how to project both answers to what the spec decides. The one table every checker reads: this
// fuzzer, the audit (test/audit/run.cjs) and the simulation check (tools/sim/oracle-check.cjs) ask every fold of protocol.json `folds`
// through folds.cjs and compare through `compare` below; a fold with no entry here fails them all.
const ORDER = Object.keys(require('../../spec/protocol.json').refusals.codes.block);
const OPS = {
  valid: { oracle: (b, held) => fb.valid(b, held), proj: l => codes(l) }, // core.md section 8: the refusal is every code of the first check that finds anything, in list order
  strict_text: { oracle: t => fb.strictText(t), proj: l => codes(l) }, // strict_text is what the bytes alone say: the first failing check of core.md section 8, then a closed type's own
  check_chain: { oracle: (blocks, id) => fb.chainFold(blocks, id), proj: c => ({ ...pick(c, ['head', 'length', 'ok', 'gaps', 'skips', 'broken']), equivocations: (c.equivocations || []).map(p => [...p].sort()).sort() }) },
  next_link: { oracle: (last, id) => fb.door('next_link', last, id), proj: x => x },
  fork_pairs: { oracle: blocks => fb.forkPairs(blocks), proj: l => l.map(p => [...p].sort()).sort() },
  identity_state: { oracle: (id, held) => { const o = fb.identityFold(id, held); return { keys: o.keys.map(k => k.key || k), frozen: [...o.frozen], operators: [...fb.operatorsOf(id, held)] }; }, proj: s => ({ keys: sorted(s.keys), frozen: sorted(s.frozen), operators: sorted(s.operators) }) },
  key_timeline: { oracle: (id, held) => fb.identityFold(id, held).timeline, proj: l => l.map(k => ({ ...pick(k, ['key', 'suite', 'frozen']), void: !!k.void })).sort((a, b) => (a.key < b.key ? -1 : 1)) },
  promise_stage: { oracle: (b, held, o) => fb.promiseStage(b, held), proj: s => s },
  promise_view: { oracle: (b, held, o) => fb.promiseView(b, held, o), proj: s => s },
  consent: { oracle: (p, s, held, block) => fb.consentFold(p, s, held, block), proj: c => pick(c, ['word', 'block']) },
  circle_state: { oracle: (id, held) => fb.circleState(id, held), proj: s => s && s.founder && { founder: s.founder, members: members(s), removed: Object.fromEntries(Object.entries(s.removed || {}).sort()) } },
  members_then: { oracle: (b, who, held) => fb.membersThen(b, who, held), proj: sorted },
  may_act_as: { oracle: (b, id, held) => fb.mayActAs(b, id, held), proj: x => !!x },
  ownership: { oracle: (t, held) => fb.ownershipFold(t, held), proj: o => ({ owner: (o && o.owner) || null, conflict: (o && o.conflict) || null }) },
  where_now: { oracle: (t, held) => fb.whereNow(t, held), proj: sorted },
  shares_on: { oracle: (t, held) => fb.door('shares_on', t, held), proj: x => x },
  pot: { oracle: (b, held, now) => fb.door('pot', b, held, now), proj: x => x },
  release_shown: { oracle: (b, held) => fb.door('release_shown', b, held), proj: x => x },
  bids_shown: { oracle: (b, held) => fb.door('bids_shown', b, held), proj: x => x },
  not_free_shown: { oracle: (b, held) => fb.door('not_free_shown', b, held), proj: x => x },
  invasion_shown: { oracle: (b, held) => fb.door('invasion_shown', b, held), proj: x => x },
  use_shown: { oracle: (t, held, keepers) => fb.door('use_shown', t, held, keepers), proj: x => x },
  accept: { oracle: (inc, held, choices) => fb.door('accept', inc, held, choices), proj: acceptProj }, // choices { takes_pairs }: the node's own, both values drawn
  answer_pull: { oracle: (...a) => fb.door('answer_pull', ...a), proj: a => ({ n: a.blocks.map(x => x.n), next: a.next }) }, // choices { cap, serves_pairs }
  accept_sealed: { oracle: (inc, held, choices) => fb.door('accept_sealed', inc, held, choices), proj: acceptProj },
  admission_refusals: { oracle: (...a) => fb.admissionRefusals(...a), proj: codes },
  refusals: { oracle: (t, s, r) => fb.refusals(t, s, r), proj: codes },
  hash: { oracle: (t, s, r) => fb.hashOfBlock({ type: t, state: s, refs: r }, 'std'), proj: x => x },
  cbor_encode: { oracle: (b, short) => fb.cborEncode(b, short).toString('hex'), proj: x => x },
  cbor_decode: { oracle: h => fb.cborDecode(h), proj: b => b && pick(b, ['hash', 'type', 'state', 'refs', 'signature', 'suite']) },
  unwrap: { oracle: m => fb.unwrap(m), proj: b => b && pick(b, ['hash', 'suite']) },
  // signed requests (nodes.md, Messages): (message, { node, keys, highest, issued }); the refusal codes
  pull_refusals: { oracle: (m, f) => fb.pullRefusals(m, f), proj: codes },
  push_refusals: { oracle: (m, f) => fb.pushRefusals(m, f), proj: codes },
};
// The shapes of the Rust answers differ in a few places (the oracle returns blocks where the core returns ids).
const RUST_FIX = {
  accept: a => a,
  accept_sealed: a => a,
  where_now: a => a,
};

function runRust(reqs) {
  const input = reqs.map(r => JSON.stringify({ op: r.op, args: r.args })).join('\n') + '\n';
  const res = spawnSync(BIN, ['serve'], { input, encoding: 'utf8', maxBuffer: 1 << 30, timeout: 120000 });
  if (res.error || res.status !== 0) return { crash: res.error ? String(res.error) : `exit ${res.status} ${res.signal || ''} ${String(res.stderr).slice(0, 500)}` };
  const lines = res.stdout.split('\n').filter(Boolean);
  if (lines.length !== reqs.length) return { crash: `rust answered ${lines.length} of ${reqs.length}: ${String(res.stderr).slice(0, 500)}` };
  return { answers: lines.map(l => JSON.parse(l)) };
}
const canon = x => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k2 => [k2, v[k2]])) : v));
function oracleRun(req) {
  const spec = OPS[req.op];
  try { return { v: spec.proj(spec.oracle(...JSON.parse(JSON.stringify(req.args)))) }; } catch (e) { return { err: e && e.code ? e.code : String(e && e.message).split('\n')[0], thrown: !(e && (e.code || e.kind)) }; }
}
function compare(req, ans) {
  const o = oracleRun(req), spec = OPS[req.op];
  if (req.op === 'hash' && ans.error === 'argument') return null; // the oracle hashes any value; the door wants text
  if (req.op === 'valid' && ans.ok) { const order = ORDER, got = codes(ans.ok).map(c => order.indexOf(c)); if (got.some((x, i) => x < 0 || (i && got[i - 1] > x))) return { kind: 'ORDER', detail: 'rust codes not in the protocol.json order: ' + codes(ans.ok).join(',') }; }
  if (ans.error === 'internal') return { kind: 'PANIC', detail: ans.message };
  const rustErr = ans.error !== undefined;
  if (rustErr || o.err !== undefined) {
    if (rustErr && o.err !== undefined) return null; // both refuse: the ops give errors for bad arguments; the message is not spec text
    return { kind: 'ERROR', detail: `rust ${rustErr ? ans.error + ' ' + (ans.code || ans.message) : 'ok ' + canon(ans.ok).slice(0, 200)} | oracle ${o.err !== undefined ? (o.thrown ? 'THROWS ' : '') + o.err : 'ok ' + canon(o.v).slice(0, 200)}` };
  }
  if (req.op === 'ownership' && ans.ok) { const why = require('./owners.cjs').ownersHaveReasons(req.args[0], req.args[1], ans.ok); if (why) return { kind: 'PROPERTY', detail: 'invariant 32: ' + why }; }
  let r;
  try { r = spec.proj(RUST_FIX[req.op] ? RUST_FIX[req.op](ans.ok) : ans.ok); } catch (e) { return { kind: 'SHAPE', detail: String(e.message) }; }
  if (canon(r) !== canon(o.v)) return { kind: 'DIFF', detail: `rust ${canon(r).slice(0, 400)} | oracle ${canon(o.v).slice(0, 400)}` };
  return null;
}

// a block set closed under prev (and the author's genesis), as a node's store always is
function closure(list, all) {
  const by = new Map(all.map(b => [b.hash, b])), out = new Map();
  const add = b => { if (!b || out.has(b.hash)) return; out.set(b.hash, b); if (b.refs) { add(by.get(b.refs.prev)); add(by.get(b.refs.author)); } };
  list.forEach(add);
  return [...out.values()];
}
// ---- the cases of one world
function casesOf(seed, size) {
  const g = makeWorld(seed, size), { w, r } = g;
  const everything = w.blocks;
  const all = everything.filter(b => !fb.valid(b, everything.filter(x => x !== b)).length); // a fold reads blocks that passed valid()
  const cases = [];
  // a node's store is closed under prev and author: a fold is never handed a block whose ancestors went missing
  const heldFor = b => r.shuffle(closure(all.filter(x => x !== b && r.coin(0.9)), all).filter(x => x !== b));
  const heldAny = b => r.shuffle(everything.filter(x => x !== b && r.coin(0.93)));
  for (const b of r.shuffle(everything).slice(0, 40)) {
    cases.push({ op: 'valid', args: [b, heldAny(b)], world: seed });
    if (r.coin(0.3)) cases.push({ op: 'valid', args: [b, r.shuffle(everything.filter(x => x !== b))], world: seed });
    // mutated and re-signed: reaches the module checks beyond the id and the signature
    for (let k = 0; k < 2; k++) {
      const body = mutate(r, { type: b.type, state: b.state, refs: b.refs }, everything.map(x => x.hash));
      const signer = w.actors.find(a => a.id === (b.refs && b.refs.author)) || w.actors.find(a => a.id === b.hash);
      if (signer) { try { const s = w.seal(body, signer); cases.push({ op: 'valid', args: [s, heldAny(s)], world: seed }); } catch { /* an unsignable body */ } }
      cases.push({ op: 'valid', args: [{ ...b, ...body }, heldAny(b)], world: seed });
    }
    cases.push({ op: 'strict_text', args: [r.coin(0.5) ? fb.canonOf({ type: b.type, state: b.state, refs: b.refs }) : JSON.stringify(mutate(r, { type: b.type, state: b.state, refs: b.refs }, []))], world: seed });
    cases.push({ op: 'hash', args: [b.type, b.state, b.refs], world: seed });
  }
  for (const a of w.actors) {
    cases.push({ op: 'check_chain', args: [r.shuffle(all).filter(x => x.refs && x.refs.author === a.id), a.id], world: seed });
    cases.push({ op: 'key_timeline', args: [a.id, heldFor(null)], world: seed });
    for (const s of w.actors) if (r.coin(0.3)) {
      cases.push({ op: 'consent', args: [a.id, s.id, heldFor(null)], world: seed });
      // consent follows the principal: the sender's block acts under a grant, and a word about the grantor is a word about the sender
      const sent = everything.filter(x => x.refs && x.refs.author === s.id && x.refs.under);
      if (sent.length) cases.push({ op: 'consent', args: [a.id, s.id, heldFor(null), r.pick(sent)], world: seed });
    }
  }
  // the compact form: the same bytes from both, and the same verdict on bytes that were bent
  for (const b of r.shuffle(all).slice(0, 12)) {
    const short = r.coin(0.5);
    cases.push({ op: 'cbor_encode', args: [b, short], world: seed });
    try {
      const bytes = fb.cborEncode(b, short);
      cases.push({ op: 'cbor_decode', args: [bytes.toString('hex')], world: seed });
      const bent = Buffer.from(bytes);
      for (let k = 0; k < 1 + r.int(3); k++) bent[r.int(bent.length)] = r.int(256);
      cases.push({ op: 'cbor_decode', args: [(r.coin(0.3) ? bent.subarray(0, r.int(bent.length)) : bent).toString('hex')], world: seed });
    } catch { /* an unencodable block */ }
  }
  cases.push({ op: 'fork_pairs', args: [r.shuffle(all)], world: seed });
  for (const p of [...g.promises, ...r.shuffle(all.filter(b => b.type === 'promise')).slice(0, 4)].filter(b => b && b.type === 'promise' && b.state && b.refs && !b.refs.answers && !b.refs.updates && !fb.valid(b, all.filter(x => x !== b)).length)) {
    const held = heldFor(p);
    cases.push({ op: 'promise_stage', args: [p, [p, ...held], {}], world: seed });
    cases.push({ op: 'promise_stage', args: [p, r.shuffle([p, ...held]), {}], world: seed });
    cases.push({ op: 'promise_view', args: [p, [p, ...held], { now: r.pick(['2026-10-15T10:00:00.000Z', '2026-10-17T10:00:00.000Z', '2026-11-30T00:00:00.000Z']) }], world: seed });
  }
  cases.push({ op: 'circle_state', args: [g.circle.hash, heldFor(null)], world: seed });
  for (const b of r.shuffle(all).slice(0, 8)) { const blk = { ...b, refs: { ...b.refs, as: g.circle.hash } }; cases.push({ op: 'may_act_as', args: [blk, g.circle.hash, [blk, ...heldFor(b)]], world: seed }); }
  for (const t of g.things.filter(t => !fb.valid(t, all.filter(x => x !== t)).length).slice(0, 6)) { cases.push({ op: 'ownership', args: [t, [t, ...heldFor(t)]], world: seed }); cases.push({ op: 'where_now', args: [t, [t, ...heldFor(t)]], world: seed }); }
  // every fold of protocol.json the cases above do not reach is asked of the whole valid world (folds.cjs), so a new fold is fuzzed at once
  const reached = new Set(cases.map(c => c.op));
  for (const q of require('./folds.cjs').askAll(all)) if (!reached.has(q.op)) cases.push({ op: q.op, args: q.args, world: seed });
  for (let k = 0; k < 4; k++) {
    const inc = r.shuffle(all).filter(() => r.coin(0.6)), held = r.shuffle(closure(all.filter(() => r.coin(0.3)), all));
    const has = new Set(held.map(x => x.hash));
    const seen = new Set(), arriving = [...inc, ...g.incoming].filter(x => !has.has(x.hash) && !seen.has(x.hash) && seen.add(x.hash));
    for (const takes_pairs of [false, true]) cases.push({ op: 'accept', args: [arriving, held, { takes_pairs }], world: seed });
  }
  // signed pulls and pushes: valid, replayed, for another node, altered after signing, signed by a key that is not live
  for (const kind of ['pull_refusals', 'push_refusals']) for (let k = 0; k < 8; k++) {
    const a = r.pick(w.actors), other = r.pick(w.actors.filter(x => x !== a).concat([a])), node = r.pick(w.actors).id;
    const body = kind === 'pull_refusals'
      ? { since: r.int(50), ...(r.coin(0.5) ? { limit: 1 + r.int(100) } : {}), ...(r.coin(0.4) ? { heads: true } : {}), ...(r.coin(0.4) ? { filter: { type: 'observe' } } : {}) }
      : { messages: r.shuffle(all).slice(0, 1 + r.int(2)).map(b => fb.wrap(b)), ...(r.coin(0.3) ? { for: {} } : {}) };
    const highest = r.coin(0.3) ? undefined : r.int(20), chal = r.hex(32);
    const useC = r.coin(0.5), counter = highest === undefined ? r.int(5) : highest + 1 + r.int(5);
    const proof = useC ? { counter } : { challenge: chal };
    const fresh = { node, keys: [a.key], highest, issued: [chal, r.hex(32)] };
    const mk = (extra = {}, k = a) => fb.signMessage({ ...body, signer: a.id, node, ...proof, ...extra }, k.private_key, k.suite);
    const add = (m, f = fresh) => cases.push({ op: kind, args: [m, f], world: seed });
    const good = mk();
    add(good);                                                                                   // valid
    add(good, { ...fresh, keys: [other.key, a.key] });                                           // one of several live keys
    if (useC) { add(mk({ counter: r.int(highest === undefined ? 1 : highest + 1) })); add(mk({ counter: highest === undefined ? 0 : highest })); } // equal or lower
    else { add(mk({ challenge: r.hex(32) })); add(good, { ...fresh, issued: [] }); }             // not issued, or used
    add(good, { ...fresh, node: r.pick(w.actors.filter(x => x.id !== node).concat([{ id: 'x' }])).id }); // this node is another
    add(mk({ node: r.pick(w.actors.map(x => x.id)) }));                                          // it names another node, signed
    add(mk({}, other));                                                                          // a key that is not the signer's live key
    add(good, { ...fresh, keys: [] });
    add(mk({ counter, challenge: chal }));                                                       // both proofs, signed
    add(mk({ extra: 1 }));                                                                       // a key protocol.json does not give a signed request, signed over
    add(fb.signMessage({ ...body, signer: a.id, node }, a.private_key, a.suite));                // neither, signed
    // altered after signing
    const alt = [m => ({ ...m, signer: other.id }), m => ({ ...m, node: r.hex(32) }), m => ({ ...m, extra: 1 }), m => ({ ...m, ...(m.counter !== undefined ? { counter: m.counter + 1 } : { challenge: r.hex(32) }) }),
      m => { const c = { ...m }; delete c[r.pick(Object.keys(body))]; return c; }, m => { const c = { ...m }; delete c.signer; return c; }, m => { const c = { ...m }; delete c.signature; return c; },
      m => ({ ...m, counter: 7, challenge: chal }), m => { const c = { ...m }; delete c.counter; delete c.challenge; return c; },
      m => ({ ...m, ...(kind === 'pull_refusals' ? { since: (m.since || 0) + 1 } : { for: { z: [] } }) })];
    for (const f of alt) add(JSON.parse(JSON.stringify(f(good))));
  }
  // a node answers a pull with its own choices { cap, serves_pairs }: both values of serves_pairs, a small and a large cap
  for (let k = 0; k < 4; k++) {
    const log = r.shuffle(all).slice(0, 2 + r.int(25)).map((block, i) => ({ n: i + 1, block })), held = log.map(e => e.block);
    const request = { since: r.int(5), ...(r.coin(0.5) ? { limit: 1 + r.int(6) } : {}), ...(r.coin(0.3) ? { heads: true } : {}), ...(r.coin(0.3) ? { filter: { type: r.pick(['observe', 'transfer', 'promise', 'actor']) } } : {}) };
    for (const serves_pairs of [false, true]) cases.push({ op: 'answer_pull', args: [log, request, r.pick(w.actors).id, null, { cap: r.pick([1, 3, 100]), serves_pairs }, null, held, null, null], world: seed });
  }
  // sealed blocks arrive as their signed public header: right ones, wrong keys, wrong links, rivals, a header for a body held
  {
    const headerMsg = (b, tweak = {}, signer = null) => {
      const who = signer || w.actors.find(x => x.id === (b.refs && b.refs.author));
      if (!who || !b.refs || !b.state) return null;
      const h = { author: b.refs.author, seq: b.state.seq, prev: b.refs.prev, hash: b.hash, ...tweak };
      if (b.state.skip === true) h.skip = true;
      try { const signed = fb.signMessage(h, who.private_key, who.suite); const { signature, ...header } = signed; return { header, header_signature: signature }; } catch { return null; }
    };
    const chained = all.filter(b => b.refs && b.refs.prev && b.refs.author && Number.isInteger(b.state && b.state.seq));
    for (let k = 0; k < 6; k++) {
      const pickN = r.shuffle(chained).slice(0, 1 + r.int(4));
      const msgs = [];
      for (const b of pickN) {
        const roll = r.int(8);
        const tweak = roll === 1 ? { seq: b.state.seq + 1 } : roll === 2 ? { prev: r.pick(all).hash } : roll === 3 ? { hash: r.hex(64) } : roll === 4 ? { skip: true } : roll === 5 ? { withheld: true } : {};
        const signer = roll === 6 ? r.pick(w.actors) : null;
        const m = headerMsg(b, tweak, signer);
        if (m) msgs.push(r.coin(0.05) ? { ...m, header_signature: r.hex(128) } : m);
      }
      const held = r.shuffle(closure(all.filter(() => r.coin(0.5)), all));
      const bodies = r.shuffle(all).filter(() => r.coin(0.2)), headersHeld = held.filter(() => r.coin(0.7)).concat(msgs.filter(() => r.coin(0.5)));
      for (const takes_pairs of [false, true]) {
        cases.push({ op: 'accept_sealed', args: [msgs, held, { takes_pairs }], world: seed });
        cases.push({ op: 'accept', args: [bodies, headersHeld, { takes_pairs }], world: seed }); // bodies for headers held
      }
    }
  }
  // The door takes JSON text, and JSON text has no lone surrogate (an escape like \\ud83c alone is not JSON). Those never reach the core.
  return cases.filter(c => !/\\ud[89a-f][0-9a-f]{2}/i.test(JSON.stringify(c)));
}

// ---- shrinking: drop blocks from the lists in the arguments while the disagreement stays
// a fold is never handed a store with a hole in it: every prev and author named by a held block is held (or is the block itself)
function closedArgs(req) {
  if (req.op === 'valid' || req.op === 'strict_text' || req.op === 'hash' || req.op === 'accept') return true;
  const lists = req.args.filter(Array.isArray).flat().filter(b => b && b.hash);
  const have = new Set(lists.map(b => b.hash));
  for (const a of req.args) if (a && a.hash) have.add(a.hash);
  return lists.every(b => !b.refs || [b.refs.prev, b.refs.author].every(h => h === undefined || have.has(h)));
}
function shrink(req, key, check) {
  let cur = JSON.parse(JSON.stringify(req));
  for (let pass = 0; pass < 3; pass++) {
    for (let ai = 0; ai < cur.args.length; ai++) {
      if (!Array.isArray(cur.args[ai])) continue;
      for (let i = cur.args[ai].length - 1; i >= 0; i--) {
        const t = JSON.parse(JSON.stringify(cur)); t.args[ai].splice(i, 1);
        const bad = check(t);
        if (bad && sigOf(t, bad) === key) cur = t;
      }
    }
  }
  // then delete keys of the first argument (the block) while the disagreement stays
  if (cur.op === 'valid' && cur.args[0] && typeof cur.args[0] === 'object' && !Array.isArray(cur.args[0])) {
    const { nodes, at } = require('./world.cjs');
    for (let pass = 0; pass < 2; pass++) for (const p of nodes(cur.args[0]).reverse()) {
      if (!p.length || (p.length === 1 && ['type', 'state', 'refs', 'signature', 'hash'].includes(p[0]) && p[0] in cur.args[0])) continue;
      const t = JSON.parse(JSON.stringify(cur)); const parent = at(t.args[0], p.slice(0, -1));
      if (Array.isArray(parent)) parent.splice(p[p.length - 1], 1); else delete parent[p[p.length - 1]];
      const bad = checkOne(t);
      if (bad && sigOf(t, bad) === key) cur = t;
    }
  }
  return cur;
}
const sigOf = (c, bad) => `${c.op}|${bad.kind}|${bad.detail.replace(/[0-9a-f]{40,}/g, 'H').replace(/\d+/g, 'N').slice(0, 200)}`;
const checkOne = req => { const x = runRust([req]); if (x.crash) return { kind: 'CRASH', detail: x.crash }; return compare(req, x.answers[0]); };

const short = r => JSON.stringify(r.args, (k, v) => (typeof v === 'string' && /^[0-9a-f]{40,}$/.test(v) ? v.slice(0, 4) + (v.length > 70 ? '..' : '') : k === 'signature' ? undefined : v));
function main() {
  const [a, b] = String(arg('seeds', '1-20')).split('-').map(Number), last = b || a;
  const seconds = Number(arg('seconds', 0)), size = Number(arg('size', 30));
  const save = arg('save', null);
  const t0 = Date.now();
  let total = 0, worlds = 0; const found = new Map(); const opCount = {}; const codeSeen = new Set();
  for (let seed = a; seed <= last || seconds; seed++) {
    if (seconds && Date.now() - t0 > seconds * 1000) break;
    if (!seconds && seed > last) break;
    const cases = casesOf(seed, size);
    const res = runRust(cases);
    worlds++;
    if (res.crash) { console.log(`CRASH seed ${seed}: ${res.crash}`); found.set('crash:' + seed, { seed, kind: 'CRASH', detail: res.crash }); continue; }
    cases.forEach((c, i) => {
      total++; opCount[c.op] = (opCount[c.op] || 0) + 1;
      const ans = res.answers[i];
      if (c.op === 'valid' && ans.ok) for (const x of ans.ok) codeSeen.add(x.code);
      const bad = compare(c, ans);
      if (!bad) return;
      const sig = sigOf(c, bad);
      if (found.has(sig)) { found.get(sig).count++; return; }
      const small = shrink(c, sig, checkOne);
      const again = checkOne(small) || bad;
      found.set(sig, { seed, kind: bad.kind, op: c.op, detail: again.detail, count: 1, repro: small });
    });
  }
  const list = [...found.values()];
  const baselineFile = arg('baseline', null);
  const baseline = baselineFile && fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {};
  if (process.argv.includes('--update-baseline') && baselineFile) {
    const next = {};
    for (const [sig, f] of found) if (sig.indexOf('crash:') !== 0) next[sig] = baseline[sig] || { note: '', example: f.repro ? short(f.repro).slice(0, 300) : '' };
    fs.writeFileSync(baselineFile, JSON.stringify(next, null, 1));
    console.log(`baseline written: ${Object.keys(next).length} known disagreements`);
    process.exit(0);
  }
  const fresh = [...found.entries()].filter(([sig]) => !(sig in baseline)).map(([, f]) => f);
  if (baselineFile) console.log(`known disagreements (in ${path.basename(baselineFile)}): ${list.length - fresh.length}; new: ${fresh.length}`);
  console.log(`worlds ${worlds}, cases ${total}, ops ${JSON.stringify(opCount)}`);
  console.log(`refusal codes reached by valid(): ${codeSeen.size}`);
  console.log(`disagreements (distinct): ${list.length}`);
  (baselineFile ? fresh : list).forEach((f, i) => {
    console.log(`\n#${i} [${f.kind}] ${f.op || ''} seed ${f.seed} x${f.count}\n  ${f.detail.slice(0, 300)}`);
    if (process.argv.includes('--show') && f.repro) console.log('  ' + short(f.repro).slice(0, 500));
    if (save && f.repro) { fs.mkdirSync(save, { recursive: true }); fs.writeFileSync(path.join(save, `repro-${f.op}-${f.seed}-${i}.json`), JSON.stringify(f.repro, null, 1)); }
  });
  process.exit((baselineFile ? fresh : list).length ? 1 : 0);
}
// A fold of protocol.json that nothing here can ask is a hole in every checker: fail, never skip it.
const unaskable = () => ['folds', 'views'].flatMap(k => Object.entries(require('../../spec/protocol.json')[k]).filter(([, f]) => f && f.over && f.ops.some(o => !OPS[o])).map(([n]) => n));
if (require.main === module) { const hole = unaskable(); if (hole.length) { console.log('no OPS entry for the fold(s) ' + hole.join(', ')); process.exit(1); } main(); } else module.exports = { oracleRun, OPS, casesOf, runRust, compare, unaskable };
