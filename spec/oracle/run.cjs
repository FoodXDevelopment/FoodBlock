'use strict';
// node spec/oracle/run.cjs [-v]
// Runs the oracle (fb.cjs, written from the spec text alone) against every section of spec/vectors.json and
// spec/canonical-vectors.json. Exits 1 on any disagreement; -v lists every case, passing or not.
// The sections and what each checks mirror spec/run-vectors.cjs; every call goes to ./fb.cjs, never to an SDK.
const fb = require('./fb.cjs');
const SPEC = require('path').join(__dirname, '..') + '/';
const V = require(SPEC + 'vectors.json');
const CV = require(SPEC + 'canonical-vectors.json');
const VERBOSE = process.argv.includes('-v');

const results = {};
const fails = [];
const lines = [];
function rec(section, name, ok, detail) {
  const r = (results[section] = results[section] || { pass: 0, fail: 0 });
  ok ? r.pass++ : r.fail++;
  lines.push((ok ? 'ok   ' : 'FAIL ') + section + ': ' + name);
  if (!ok) fails.push({ section, name, detail });
}
const attempt = (section, name, fn) => { try { const out = fn(); rec(section, name, out !== false, out === false ? undefined : undefined); } catch (e) { rec(section, name, false, String(e && e.message).split('\n')[0]); } };
const sortKeys = x => Array.isArray(x) ? x.map(sortKeys) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sortKeys(x[k])])) : x;
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
// subset: every key given in want must match; arrays must have the same length and match element by element
const subset = (got, want) => Array.isArray(want) ? (Array.isArray(got) && got.length === want.length && want.every((v, i) => subset(got[i], v)))
  : want && typeof want === 'object' ? (got !== null && typeof got === 'object' && Object.entries(want).every(([k, v]) => subset(got[k], v))) : same(got, want);
const codesOf = list => [...new Set(list.map(x => x.code))];
const full = b => ({ hash: b.hash, ...b.block, ...(b.suite ? { suite: b.suite } : {}), signature: b.signature });
const blocksOf = list => list.map(full);
const pub = signer => V.keys[signer].public_key_sign;
const bare = b => ({ type: b.type, state: b.state, refs: b.refs });

// ---------------------------------------------------------------- canonical-vectors.json
for (const v of CV.vectors) {
  const h = b => fb.hashOfBlock(b, 'std'), c = b => fb.canonOf(b);
  const ok = !(v.same_as && h(v.block) !== h(v.same_as)) && !(v.not_same_as && h(v.block) === h(v.not_same_as)) && !(v.canonical_contains && !c(v.block).includes(v.canonical_contains))
    && !(v.canonical && c(v.block) !== v.canonical) && !(v.refused && !v.refused.every(code => codesOf(fb.refusals(v.block.type, v.block.state, v.block.refs)).includes(code)));
  rec('canonical-vectors', v.name, ok, c(v.block));
}
for (const v of V.canonical) rec('canonical', v.name, fb.canonOf(v.block) === v.canonical && fb.hashOfBlock(v.block, 'std') === v.hash, fb.canonOf(v.block));

// ---------------------------------------------------------------- hashes and the ledger: one block of every type, each valid against the blocks before it
const byHash = new Map();
const ledger = [...V.ledger.genesis, ...V.hashes];
for (const v of ledger) byHash.set(v.hash, v);
{
  const before = [];
  for (const v of ledger) {
    const block = full(v);
    if (v.canonical) rec('hashes', v.name, fb.canonOf(v.block) === v.canonical && fb.hashOfBlock(v.block, 'std') === v.hash, fb.canonOf(v.block));
    rec('ledger', v.name + ': hash and signature', fb.hashOfBlock(v.block, V.keys[v.signer].suite || 'std') === v.hash && fb.verifyBlock(v.block, v.signature, pub(v.signer)));
    const wrong = fb.valid(block, before);
    rec('valid', v.name, !wrong.length, wrong.map(r => r.code).join(', '));
    before.push(block);
  }
  for (const id of new Set(V.hashes.map(v => v.block.refs.author))) {
    const c = fb.chainFold(V.hashes.filter(v => v.block.refs.author === id).map(full), id);
    rec('chain', id.slice(0, 8) + '\'s blocks, no gaps, no equivocation', c.ok, JSON.stringify(c));
  }
}
for (const v of V.audience) rec('audience', v.name, fb.saltedHash(v.salt, v.recipient, 'std') === v.commitment);

// ---------------------------------------------------------------- stories: every signed block's hash and signature, and the strict check on its bytes
const stories = [
  ...V.identities.map(v => ['identity', v.name, v.blocks]), ...V.deals.map(v => ['deal', v.name, v.blocks]), ...V.circles.map(v => ['circle', v.name, v.blocks]),
  ...V.folds.promises.map(v => ['promise fold', v.name, v.blocks]), ...V.folds.circles.map(v => ['circle fold', v.name, v.blocks]), ...V.folds.audience.map(v => ['audience fold', v.name, v.blocks]),
  ...V.folds.things.map(v => ['thing fold', v.name, v.blocks]), ...V.folds.successors.map(v => ['successor fold', v.name, v.blocks]), ...V.folds.rekeys.map(v => ['rekey fold', v.name, v.blocks]), ...V.folds.ballots.map(v => ['ballot fold', v.name, v.blocks]),
  ['refusal', 'stories', V.refusals.blocks], ...V.refusals.cases.filter(c => c.blocks).map(c => ['refusal', c.name, c.blocks]), ['sealed', 'stories', V.sealed.blocks],
];
for (const [group, name, list] of stories) {
  const wrong = [];
  for (const b of list) {
    byHash.set(b.hash, b);
    const ks = V.keys[b.signer].suite || 'std';
    if (fb.hashOfBlock(b.block, ks) !== b.hash) wrong.push(b.name + ': hash');
    if (!fb.verifyBlock(b.block, b.signature, pub(b.signer))) wrong.push(b.name + ': signature');
    if (ks !== (b.suite || 'std')) wrong.push(b.name + ': suite');
    const found = fb.refusals(b.block.type, b.block.state, b.block.refs);
    if (found.length) wrong.push(b.name + ': ' + found.map(r => r.code).join(', '));
  }
  rec('stories', `${group}: ${name}: ${list.length} blocks hash, verify and pass the check`, !wrong.length, wrong.join(' | '));
}
// protocol.md, Conformance: every block in a story passes `valid` against the other blocks of its story, except a block the story marks void on purpose
// (signed_by_author false in an identities case: a frozen or rotated-out key).
for (const [group, name, list] of stories) {
  if (group === 'refusal') continue;
  // intended void: the case says so (signed_by_author false), or only the arrivals view rescues the block (valid reads no clock, so the pure fold voids it)
  const intended = new Set();
  if (group === 'identity') {
    const v = V.identities.find(x => x.name === name);
    for (const b of list) { const pure = fb.identityFold(b.block.refs.author || b.hash, list.map(full)).signed_by_author[b.hash]; if (v.signed_by_author[b.hash] === false || pure === false) intended.add(b.hash); }
  }
  const wrong = [];
  for (const b of list) { // the context is the whole story: a story is a set of blocks, and a later block may settle an earlier one
    const r = fb.valid(full(b), list.map(full));
    if (r.length && !intended.has(b.hash)) wrong.push(b.name + ': ' + r.map(x => x.code).join(', '));
  }
  rec('valid in stories', `${group}: ${name}`, !wrong.length, wrong.join(' | '));
}
const opens = v => byHash.has(v.hash) && fb.verifyBlock(byHash.get(v.hash).block, v.signature, pub(v.signer));
for (const v of V.signatures) rec('signatures', v.name, opens(v));
for (const v of V.bad_signatures) rec('bad_signatures', v.name, !opens(v));

// ---------------------------------------------------------------- envelopes, sealed copies, public headers
for (const v of V.envelopes) attempt('envelopes', v.name, () => {
  const m = fb.open(v.envelope, V.keys[v.recipient].x25519_private);
  return fb.hashOfBlock(m.block, 'std') === v.opens_to.hash && m.signature === v.opens_to.signature && m.version === v.opens_to.version;
});
for (const v of V.sealed.cases) attempt('sealed', v.name, () => {
  const m = fb.openCopy(v.message, V.keys[v.recipient].x25519_private);
  return m.hash === v.opens_to.hash && m.signature === v.opens_to.signature && same(m.reveals, v.opens_to.reveals) && fb.headerSignedBy(v.message, pub(v.signer));
});
for (const v of V.headers) attempt('headers', v.name, () => same(fb.header({ hash: v.hash, ...byHash.get(v.hash).block }), v.header) && fb.verifyMessage({ ...v.header, signature: v.header_signature }, pub(v.signer)));

// ---------------------------------------------------------------- identities
for (const v of V.identities) {
  const held = blocksOf(v.blocks);
  const f = fb.identityFold(v.id, held);
  // the view adds the reader's arrivals: a recovery rotation may not void what another identity built on before the reach began
  const viewOf = (id) => {
    const fold = fb.identityFold(id, held), out = { ...fold.signed_by_author };
    if (v.arrivals) for (const r of held) if (r.type === 'grant' && r.state.kind === 'key' && r.state.recovery_key && fold.signed_by_author[r.hash]) for (const h of fb.recoveryReachView(r, held, v.arrivals)) out[h] = true;
    return out;
  };
  const viewSigned = viewOf(v.id);
  for (const b of v.blocks) if (b.hash in v.signed_by_author) { const got = viewOf(b.block.refs.author || b.hash)[b.hash]; rec('identity', `${v.name}: ${b.name} ${v.signed_by_author[b.hash] ? 'stands' : 'is void'}`, got === v.signed_by_author[b.hash], `got ${got}`); }
  if (v.keys) rec('identity', `${v.name}: the keys that speak`, same(f.keys, v.keys), JSON.stringify(f.keys.map(k => k.slice(-6))));
  if (v.frozen) rec('identity', `${v.name}: the frozen keys`, same(f.frozen, v.frozen));
  if (v.operators) rec('identity', `${v.name}: its operators`, same(fb.operatorsOf(v.id, held), v.operators));
  rec('identity', `${v.name}: the identity fold (signed_by_author, keys, frozen)`, same(f.keys, v.keys) && (!v.frozen || same(f.frozen, v.frozen))
    && Object.entries(v.signed_by_author).every(([h, ok]) => !(h in viewSigned) || viewSigned[h] === ok));
  if (v.fence) {
    const fe = v.fence, limit = held.find(b => b.hash === fe.block), grant = held.find(b => b.hash === fe.grant);
    const finds = id => asArr(limit.state.audience).includes(fb.saltedHash(fe.salt, id, 'std'));
    rec('identity', `${v.name}: sealed to the agent alone`, limit.refs.for === fe.grant && limit.state.kind === 'limit' && same(limit.state.limit, fe.limit) && finds(fe.agent) && !finds(fe.principal) && limit.state.audience.length === 1);
    rec('identity', `${v.name}: the grant check never reads the limit`, grant.state.scope.limit === undefined && Object.keys(v.under).every(h => same(fb.whyNotUnder(held.find(b => b.hash === h), held), fb.whyNotUnder(held.find(b => b.hash === h), held.filter(b => b !== limit)))));
    rec('identity', `${v.name}: the principal's node checks the limit`, fe.within.every(c => (c.spent + c.money.minor <= limit.state.limit.minor && c.money.currency === limit.state.limit.currency) === c.within), JSON.stringify(fe.within));
  }
  for (const [h, ok] of Object.entries(v.under || {})) rec('identity', `${v.name}: a block under the grant speaks for its grantor (${ok})`, !fb.whyNotUnder(held.find(b => b.hash === h), held).length === ok);
}
function asArr(x) { return Array.isArray(x) ? x : x === undefined ? [] : [x]; }

// ---------------------------------------------------------------- folds
const stageOf = v => { const held = blocksOf(v.blocks); return fb.promiseStage(held.find(b => b.hash === v.first), held); };
for (const v of [...V.deals, ...V.folds.promises]) attempt('promise fold', `${v.name}: ${v.expected.stage}`, () => { const got = stageOf(v); if (!subset(got, v.expected)) throw new Error('got ' + JSON.stringify(got).slice(0, 400)); return true; });
for (const v of [...V.circles, ...V.folds.circles]) attempt('circle fold', v.name, () => {
  const held = blocksOf(v.blocks);
  const state = fb.circleState(v.circle, held);
  const members = Array.isArray(v.expected.members) ? Object.keys(state.members).sort() : Object.fromEntries(Object.entries(state.members).map(([w, m]) => [w, [...m.roles].sort()]));
  const ok = same(members, v.expected.members) && same(Object.keys(state.removed).sort(), v.expected.removed) && (!v.expected.counted_to || same(state.removed, v.expected.counted_to))
    && Object.entries(v.may_act || {}).every(([h, ok]) => fb.mayActAs(held.find(b => b.hash === h), v.circle, held) === ok);
  if (!ok) throw new Error('got members ' + JSON.stringify(members).slice(0, 300) + ' removed ' + JSON.stringify(Object.keys(state.removed)).slice(0, 200));
  return true;
});
for (const v of V.folds.audience) for (const c of v.cases) attempt('audience fold', c.name, () => { const held = blocksOf(v.blocks); return same(fb.membersThen(held.find(b => b.hash === c.block), c.recipient, held), c.members); });
for (const v of V.folds.things) {
  const held = blocksOf(v.blocks);
  for (const c of v.where) attempt('where now', c.name, () => same(fb.whereNow(held.find(b => b.hash === c.thing), held), c.places));
  for (const c of v.owners) attempt('owner', c.name, () => { const got = fb.ownershipFold(held.find(b => b.hash === c.thing), held); return got.owner === c.owner && same(got.conflict, c.conflict); });
}
for (const v of V.folds.successors) attempt('successor', v.name, () => { const held = blocksOf(v.blocks); return subset(fb.successorView(held.find(b => b.hash === v.grant), held, { now: v.now, arrivals: v.arrivals }), v.expected); });
for (const v of V.folds.ballots) for (const c of v.cases) attempt('ballot', c.name, () => fb.countedIn(blocksOf(v.blocks).find(b => b.hash === c.result), c.commitment, c.counter) === c.counted);
for (const v of V.folds.rekeys) attempt('circle key', v.name, () => subset(fb.circleKey(v.circle, blocksOf(v.blocks)), v.expected));

// ---------------------------------------------------------------- refusals: what every node must refuse
const refusalBlocks = new Map(stories.flatMap(([, , list]) => list).map(b => [b.hash, full(b)]));
for (const c of V.refusals.cases) attempt(`refused (${c.by})`, c.name, () => {
  const held = Array.isArray(c.held) ? c.held.map(h => refusalBlocks.get(h)) : [];
  if (c.by === 'check') return same(codesOf(fb.refusals(c.block.type, c.block.state, c.block.refs, held)), c.codes);
  if (c.by === 'valid') return same(codesOf(fb.valid(c.block, held)), c.codes);
  if (c.by === 'accept') {
    const incoming = c.inline || c.incoming.map(h => refusalBlocks.get(h));
    const got = fb.accept(incoming, held);
    if (c.equivocations) return same(got.taken.map(b => b.hash), c.taken) && !got.refused.length && same(got.equivocations, c.equivocations);
    if (c.waiting) return same(got.waiting.map(w => w.hash), c.waiting) && !got.refused.length;
    if (c.taken) return same(got.taken.map(b => b.hash), c.taken);
    return c.incoming.every(h => got.refused.some(r => r.hash === h)) && same(codesOf(got.refused), c.codes);
  }
  if (c.by === 'fold') return subset(stageOf(c), c.expected);
  if (c.by === 'may_act_as') { const blocks = blocksOf(c.blocks); return fb.mayActAs(blocks.find(b => b.hash === c.block), c.circle, blocks) === c.ok; }
  if (c.by === 'under') { const blocks = [...refusalBlocks.values()]; return !fb.whyNotUnder(refusalBlocks.get(c.block), blocks).length === c.live; }
  if (c.by === 'open') { try { fb.openCopy(c.message, V.keys[c.recipient].x25519_private); return false; } catch (e) { return same([e.code], c.codes); } }
  return false;
});

// ---------------------------------------------------------------- messages between nodes
const MS = V.messages, nodeKey = pub(MS.node_signer);
{
  const jem = pub(MS.signed_pull.signer), p = MS.signed_pull, c = MS.signed_pull_challenge;
  attempt('messages', 'a signed pull names the node and a counter above the highest seen, and carries no time', () => !fb.pullRefusals(p.message, { node: MS.node, keys: [jem], highest: p.highest }).length && p.message.at === undefined);
  attempt('messages', 'a counter that is not above the highest seen is a replay', () => same(codesOf(fb.pullRefusals(p.message, { node: MS.node, keys: [jem], highest: p.message.counter })), ['replay']));
  attempt('messages', 'a challenge the node issued is taken', () => !fb.pullRefusals(c.message, { node: MS.node, keys: [jem], issued: [c.challenge] }).length);
  attempt('messages', 'a challenge the node did not issue, or has seen used, is a replay', () => same(codesOf(fb.pullRefusals(c.message, { node: MS.node, keys: [jem], issued: [] })), ['replay']));
  attempt('messages', 'a signed pull for another node is refused', () => same(codesOf(fb.pullRefusals(p.message, { node: '0'.repeat(64), keys: [jem], highest: p.highest })), ['wrong_node']));
  attempt('messages', 'a changed request no longer verifies', () => same(codesOf(fb.pullRefusals({ ...p.message, since: 1 }, { node: MS.node, keys: [jem], highest: p.highest })), ['bad_signature']));
  attempt('messages', 'a signed push', () => !fb.pushRefusals(MS.signed_push.message, { node: MS.node, keys: [pub(MS.signed_push.signer)], highest: MS.signed_push.highest }).length);
}
attempt('messages', 'the node key is a key of its holder, brought in by a key grant', () => fb.identityFold(MS.node, blocksOf(V.sealed.blocks)).keys.includes(nodeKey));
attempt('messages', 'a pull answer is signed by the node', () => fb.answerSignedBy(MS.pull_answer.message, nodeKey) && MS.pull_answer.message.blocks.length === MS.pull_answer.matches);
attempt('messages', 'a push answer is signed by the node', () => fb.answerSignedBy(MS.push_answer.message, nodeKey));
{
  const Pm = MS.push_answer.message, known = new Set(Object.values(fb.P.refusals.codes).flatMap(Object.keys));
  attempt('messages', 'a push answer carries every key, refusals as { hash, code, detail }, equivocations as sorted pairs', () =>
    same(Object.keys(Pm).sort(), [...fb.P.messages.push_answer].sort()) && Pm.refused.every(r => same(Object.keys(r).sort(), [...fb.P.messages.refusal].sort()) && known.has(r.code)) && Pm.equivocations.every(pair => same(pair, [...pair].sort())));
  attempt('messages', 'the push answer rebuilds byte for byte', () => same(fb.pushAnswer(Pm, { node: Pm.node, privateKey: V.keys[MS.node_signer].private_key }), Pm));
  const Q = MS.push;
  attempt('messages', 'a push names the list of ids each sealed copy is for', () => same(fb.pushRequest(Q.request.messages, Q.request.for), Q.request) && same(Q.request.for[Q.hash], Q.recipients) && Q.recipients.length === 2);
}
attempt('messages', 'a changed answer no longer verifies', () => !fb.answerSignedBy({ ...MS.push_answer.message, taken: [] }, nodeKey));
attempt('messages', 'discovery names the challenge endpoint, and its local announcement', () => !fb.wellKnownErrors(MS.discovery).length && same(MS.announcement, fb.announcement(MS.discovery)) && 'challenge' in MS.discovery.endpoints);

// ---------------------------------------------------------------- the compact form
for (const c of V.cbor.cases) attempt('cbor', c.name, () => {
  const block = { hash: c.hash, ...c.block, signature: c.signature };
  const text = fb.cborEncode(block, false), short = fb.cborEncode(block, true);
  return text.toString('hex') === c.cbor && short.toString('hex') === c.cbor_short && fb.cborDecode(c.cbor).hash === c.hash && fb.cborDecode(c.cbor_short).hash === c.hash
    && same(bareWithSig(fb.cborDecode(c.cbor)), bareWithSig(block)) && same(bareWithSig(fb.cborDecode(c.cbor_short)), bareWithSig(block))
    && fb.hashOfBlock(c.block, 'std') === c.hash && Buffer.byteLength(fb.canonOf(c.block)) === c.canonical_bytes;
});
function bareWithSig(b) { return { type: b.type, state: b.state, refs: b.refs, signature: b.signature }; }
attempt('cbor', V.cbor.loose.name, () => fb.cborDecode(V.cbor.loose.cbor).hash === V.cbor.loose.hash);
attempt('cbor', V.cbor.push.name, () => {
  const blocks = V.cbor.push.hashes.map(h => V.cbor.cases.find(c => c.hash === h)).map(c => ({ hash: c.hash, ...c.block, signature: c.signature }));
  return fb.cborEncodePush(blocks, false).toString('hex') === V.cbor.push.cbor && same(fb.cborDecodePush(V.cbor.push.cbor_short).map(bareWithSig), blocks.map(bareWithSig));
});
for (const h of V.cbor.headers) attempt('cbor', h.name, () => fb.cborHeader(h.header, false).toString('hex') === h.cbor && same(fb.cborHeaderDecode(h.cbor_short), h.header));
for (const r of V.cbor.refused) attempt('cbor refused', r.name, () => { try { fb.cborDecode(r.cbor); return false; } catch { return true; } });

// ---------------------------------------------------------------- the door: an op of the core's JSON door, its arguments, and what it gives
let skipped = 0;
for (const d of V.door) {
  if (d.oracle === false) { skipped++; continue; }
  attempt('door', `${d.op}: ${d.name}`, () => {
    let got;
    if (d.op === 'sign') { // a signature is not reproduced (the nonce is the signer's choice): the oracle's own signature must open, and so must the vector's
      const key = fb.keypair(d.args[1], d.args[2]).public_key_sign;
      return fb.verifyBlock(d.args[0], fb.door('sign', ...d.args), key) && fb.verifyBlock(d.args[0], d.expect, key);
    }
    try { got = fb.door(d.op, ...d.args); } catch (e) {
      if (!d.error) throw e;
      return (!d.error.code || e.code === d.error.code) && (!d.error.kind || e.kind === d.error.kind);
    }
    if (d.error) return false;
    if (d.codes) return same(codesOf(got), d.codes);
    return d.exact ? same(got, d.expect) : subset(got, d.expect);
  });
}

// ---------------------------------------------------------------- report
if (VERBOSE) console.log(lines.join('\n'));
let pass = 0, fail = 0;
for (const [s, r] of Object.entries(results)) { pass += r.pass; fail += r.fail; console.log(`${r.fail ? 'FAIL' : 'ok  '} ${s}: ${r.pass} passed${r.fail ? ', ' + r.fail + ' failed' : ''}`); }
for (const f of fails) console.log(`  - ${f.section}: ${f.name}${f.detail ? '\n      ' + String(f.detail).slice(0, 600) : ''}`);
console.log(`\n${pass} passed, ${fail} failed; ${skipped} door cases outside the spec text (oracle: false) skipped`);
process.exit(fail ? 1 : 0);
