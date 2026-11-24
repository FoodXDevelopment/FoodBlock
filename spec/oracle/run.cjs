'use strict';
// node spec/oracle/run.cjs [-v]
// Runs the oracle (fb.cjs, written from the spec text alone) against every section of spec/vectors.json and
// spec/canonical-vectors.json. Exits 1 on any disagreement; -v lists every case, passing or not.
// The sections and what each checks mirror spec/run-vectors.cjs; every call goes to ./fb.cjs, never to an SDK.
const fb = require('./fb.cjs');
const SPEC = require('path').join(__dirname, '..') + '/';
const V = require(SPEC + 'vectors.json');
const CVEC = require(SPEC + 'conventions-vectors.json');
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
// a case passes only when its check returns exactly true: undefined, null, 0 or '' is a check that said nothing, and fails
const attempt = (section, name, fn) => { try { const out = fn(); rec(section, name, out === true, out === true ? undefined : `returned ${JSON.stringify(out)}`); } catch (e) { rec(section, name, false, String(e && e.message).split('\n')[0]); } };
const sortKeys = x => Array.isArray(x) ? x.map(sortKeys) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sortKeys(x[k])])) : x;
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
// subset: every key given in want must match; arrays must have the same length and match element by element
const subset = (got, want) => Array.isArray(want) ? (Array.isArray(got) && got.length === want.length && want.every((v, i) => subset(got[i], v)))
  : want && typeof want === 'object' ? (got !== null && typeof got === 'object' && Object.entries(want).every(([k, v]) => subset(got[k], v))) : same(got, want);
// The strict check a vector's `refused` and `by: check` cases ask is what a block's bytes and values say, then check 8 with nothing given.
const refusals = (type, state, refs) => fb.writeFindings({ type, state, refs });
const codesOf = list => [...new Set(list.map(x => x.code))];
const full = b => ({ hash: b.hash, ...b.block, ...(b.suite ? { suite: b.suite } : {}), signature: b.signature });
const blocksOf = list => list.map(full);
const pub = signer => V.keys[signer].public_key_sign;

// ---------------------------------------------------------------- canonical-vectors.json
const CHECKED = ['same_as', 'not_same_as', 'canonical_contains', 'canonical', 'refused'];
for (const v of CV.vectors) {
  const h = b => fb.hashOfBlock(b, 'std'), c = b => fb.canonOf(b);
  // a case that names none of the checked keys checks nothing: it fails, never passes by default
  if (!CHECKED.some(k => k in v)) { rec('canonical-vectors', v.name, false, `checks nothing: it names none of ${CHECKED.join(', ')}`); continue; }
  const ok = !(v.same_as && h(v.block) !== h(v.same_as)) && !(v.not_same_as && h(v.block) === h(v.not_same_as)) && !(v.canonical_contains && !c(v.block).includes(v.canonical_contains))
    && !(v.canonical && c(v.block) !== v.canonical) && !(v.refused && !v.refused.every(code => codesOf(refusals(v.block.type, v.block.state, v.block.refs)).includes(code)));
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
const stories = [['sealed', 'stories', V.sealed.blocks]];
for (const [group, name, list] of stories) {
  const wrong = [];
  for (const b of list) {
    byHash.set(b.hash, b);
    const ks = V.keys[b.signer].suite || 'std';
    if (fb.hashOfBlock(b.block, ks) !== b.hash) wrong.push(b.name + ': hash');
    if (!fb.verifyBlock(b.block, b.signature, pub(b.signer))) wrong.push(b.name + ': signature');
    if (ks !== (b.suite || 'std')) wrong.push(b.name + ': suite');
    const found = refusals(b.block.type, b.block.state, b.block.refs);
    if (found.length) wrong.push(b.name + ': ' + found.map(r => r.code).join(', '));
  }
  rec('stories', `${group}: ${name}: ${list.length} blocks hash, verify and pass the check`, !wrong.length, wrong.join(' | '));
}
// protocol.md, Conformance: every block in a story passes `valid` against the other blocks of its story, except a block the story marks void on purpose
// (signed_by_author false in an identities case: a frozen or rotated-out key). Only the vector excuses a block, never the oracle's own fold: a fold that
// wrongly voided a block would otherwise excuse itself. (A block that only the arrivals view rescues would need naming here by its vector; today every
// such block is valid, so none is listed.)
for (const [group, name, list] of stories) {
  if (group === 'refusal') continue;
  const intended = new Set();
  if (group === 'identity') {
    const v = V.identities.find(x => x.name === name);
    for (const b of list) if (v.signed_by_author[b.hash] === false) intended.add(b.hash);
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
  const m = fb.open(v.envelope, V.keys[v.recipient].x25519_private || V.keys[v.recipient].xwing_private); // an X-Wing recipient opens with its 32-byte private seed
  return fb.hashOfBlock(m.block, 'std') === v.opens_to.hash && m.signature === v.opens_to.signature;
});
// X-Wing (privacy.md, A KEM key): the oracle's own derivation, from Node's crypto, against the draft's test vector
{
  const D = V.xwing_draft11, B = require('./bytes.cjs');
  attempt('envelopes', 'X-Wing: the key of draft-connolly-cfrg-xwing-kem-11 appendix C comes from its private seed', () => B.xwingPublicOf(D.sk) === 'xwing:' + D.pk);
  attempt('envelopes', 'X-Wing: its ciphertext decapsulates to its shared secret', () => B.xwingDecaps(B.xwingKeys(D.sk), Buffer.from(D.ct, 'hex')).toString('hex') === D.ss);
}
for (const v of V.sealed.cases) attempt('sealed', v.name, () => {
  const m = fb.openCopy(v.message, V.keys[v.recipient].x25519_private);
  return m.hash === v.opens_to.hash && m.signature === v.opens_to.signature && same(m.reveals, v.opens_to.reveals) && fb.headerSignedBy(v.message, pub(v.signer));
});
for (const v of V.headers) attempt('headers', v.name, () => same(fb.header({ hash: v.hash, ...byHash.get(v.hash).block }), v.header) && fb.headerSignedBy({ header: v.header, header_signature: v.header_signature }, pub(v.signer)));

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
    same(Object.keys(Pm).sort(), fb.C.messages.push_answer.filter(k => k in Pm || !fb.C.messages.push_answer_optional.includes(k)).sort()) && Pm.refused.every(r => same(Object.keys(r).sort(), [...fb.C.messages.refusal].sort()) && known.has(r.code)) && Pm.equivocations.every(pair => same(pair, [...pair].sort())));
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
for (const d of [...V.door, ...CVEC.door]) {
  if (d.oracle === false) { skipped++; continue; }
  attempt('door', `${d.op}: ${d.name}`, () => {
    let got;
    // a signature is reproduced byte for byte (the nonce is the suite's: RFC 6979 for p256 and sm); a refusal to sign is a case like any other
    if (d.op === 'sign' && !d.error) return fb.door('sign', ...d.args) === d.expect;
    try { got = fb.door(d.op, ...d.args); } catch (e) {
      if (!d.error) throw e;
      return (!d.error.code || e.code === d.error.code) && (!d.error.kind || e.kind === d.error.kind);
    }
    if (d.error) return false;
    if (d.codes) return same(codesOf(got), d.codes);
    return d.exact ? same(got, d.expect) : subset(got, d.expect);
  });
}

// ---------------------------------------------------------------- the audit's worlds, frozen as their answers (audit-vectors.json)
{
  const AV = require(SPEC + 'audit-vectors.json');
  for (const w of AV.worlds) {
    w.cases.forEach((c, i) => attempt('audit', `${w.name}: ${c.op} ${i}`, () => {
      const args = c.args.map(a => (a === '$blocks' ? w.blocks : a));
      let got;
      try { got = fb.door(c.op, ...JSON.parse(JSON.stringify(args))); } catch (e) { return c.error === true; }
      return !c.error && subset(got, c.expect);
    }));
  }
}

// ---------------------------------------------------------------- report
if (VERBOSE) console.log(lines.join('\n'));
let pass = 0, fail = 0;
for (const [s, r] of Object.entries(results)) { pass += r.pass; fail += r.fail; console.log(`${r.fail ? 'FAIL' : 'ok  '} ${s}: ${r.pass} passed${r.fail ? ', ' + r.fail + ' failed' : ''}`); }
for (const f of fails) console.log(`  - ${f.section}: ${f.name}${f.detail ? '\n      ' + String(f.detail).slice(0, 600) : ''}`);
console.log(`\n${pass} passed, ${fail} failed; ${skipped} door cases outside the spec text (oracle: false) skipped`);
process.exit(fail ? 1 : 0);
