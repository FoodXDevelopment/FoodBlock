'use strict';
// Usage: node spec/oracle/run.cjs [-v]. Exits 1 if the oracle and the vectors disagree on anything.
// Runs the clean-room node against spec/vectors.json and spec/canonical-vectors.json, vector by vector.
const fb = require('./fb.cjs');
const SPEC = require('path').join(__dirname, '..') + '/';
const V = require(SPEC + 'vectors.json');
const CV = require(SPEC + 'canonical-vectors.json');
const K = V.keys;
const results = {}; const fails = [];
const VERBOSE = process.argv.includes('-v');
function rec(section, name, ok, detail) {
  (results[section] = results[section] || { pass: 0, fail: 0 })[ok ? 'pass' : 'fail']++;
  if (!ok) fails.push({ section, name, detail });
}
const st = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const eq = (a, b) => st(a) === st(b);
function subset(out, exp) { const bad = {}; for (const [k, v] of Object.entries(exp)) if (!eq(out[k] === undefined ? null : out[k], v)) bad[k] = { got: out[k], want: v }; return Object.keys(bad).length ? bad : null; }
const allBlocks = () => { const seen = new Set(); return everyBlock().filter(b => !seen.has(b.hash) && seen.add(b.hash)); };
// Every signed block the vectors carry, wherever it sits (a story is a list of { name, hash, signer, block, signature }).
function everyBlock(node = V, out = []) {
  if (Array.isArray(node)) node.forEach(n => everyBlock(n, out));
  else if (node && typeof node === 'object') { if (node.block && node.hash && node.signer) out.push(node); else Object.values(node).forEach(n => everyBlock(n, out)); }
  return out;
}
const try_ = (f) => { try { return f(); } catch (e) { return { error: e.message }; } };
const poolOf = (blocks, opts) => new fb.Pool(blocks.map(b => ({ block: b.block, signature: b.signature })), opts);
const keyOf = id => { for (const [name, k] of Object.entries(K)) if (k.public_key_sign && fb.sha256 && false) return name; return null; };

// canonical-vectors.json
for (const v of CV.vectors) {
  const c = fb.canonOf(v.block);
  let ok = true;
  if (v.same_as) ok = fb.hashOf(v.same_as) === fb.hashOf(v.block);
  if (v.not_same_as) ok = fb.hashOf(v.not_same_as) !== fb.hashOf(v.block);
  if (v.canonical_contains) ok = c.includes(v.canonical_contains);
  rec('canonical-vectors.json', v.name, ok, c);
}
// hashes: canonical, hash, the strict check (an earlier shape is refused, with the codes the vector names)
for (const v of V.hashes) {
  const c = fb.canonOf(v.block), h = fb.hashOf(v.block);
  rec('hashes', v.name, c === v.canonical && h === v.hash, { c, h });
  const reasons = fb.check(v.block, {});
  const want = v.refused || [], codes = fb.refusals(v.block, {}).map(r => r.code);
  rec('hashes:strict-check(refuse/accept)', v.name, (codes.length > 0) === (want.length > 0), { codes, want });
  rec('hashes:strict-check(codes)', v.name, eq(codes, want), { codes, want });
}
for (const v of V.canonical) rec('canonical', v.name, fb.canonOf(v.block) === v.canonical && fb.hashOf(v.block) === v.hash, fb.canonOf(v.block));
for (const v of V.audience) rec('audience', v.name, fb.commitment(v.salt, v.recipient) === v.commitment, fb.commitment(v.salt, v.recipient));
const byHash = {}; for (const v of V.hashes) byHash[v.hash] = v.block;
for (const v of V.signatures) {
  const b = byHash[v.hash];
  const sig = fb.signBlock(b, K[v.signer].private_key);
  rec('signatures', v.name, sig === v.signature && fb.verifyBlock(b, K[v.signer].public_key_sign, v.signature), sig);
}
for (const v of V.bad_signatures) rec('bad_signatures', v.name, !fb.verifyBlock(byHash[v.hash], K[v.signer].public_key_sign, v.signature));
// envelopes
for (const v of V.envelopes) {
  const pt = try_(() => fb.openEnvelope(v.envelope, K[v.recipient].x25519_private, K[v.recipient].public_key_encrypt));
  const ok = pt && pt.block && fb.hashOf(pt.block) === v.opens_to.hash && pt.signature === v.opens_to.signature && pt.version === v.opens_to.version;
  rec('envelopes', v.name, !!ok, pt);
}
// sealing round trip (both algs written and read by this node)
for (const alg of ['x25519-hkdf-sha256-aes-256-gcm', 'x25519-aes-256-gcm']) {
  const env = fb.seal({ version: '1.6', hello: 1 }, [K.bob.public_key_encrypt, K.ann.public_key_encrypt], alg);
  const a = fb.openEnvelope(env, K.ann.x25519_private, K.ann.public_key_encrypt), b = fb.openEnvelope(env, K.bob.x25519_private, K.bob.public_key_encrypt);
  rec('self:seal-roundtrip', alg, a && b && a.hello === 1 && b.hello === 1);
}
// sealed
{
  const pool = poolOf(allBlocks());
  for (const c of V.sealed.cases) {
    const m = c.message, hd = m.header;
    const authorOk = fb.verifyBy ? true : true;
    const hsig = pool.identity(hd.author).keys.some(k => fb.verifyStr(fb.ser(hd, false), k, m.header_signature));
    const pt = try_(() => fb.openEnvelope(m.envelope, K[c.recipient].x25519_private, K[c.recipient].public_key_encrypt));
    const blk = pt && pt.block;
    const hashOk = blk && fb.hashOf(blk) === hd.hash && hd.hash === c.opens_to.hash;
    const sigOk = blk && pool.identity(hd.author).keys.some(k => fb.verifyBlock(blk, k, pt.signature)) && pt.signature === c.opens_to.signature;
    const hdrOk = blk && eq(fb.headerOf(blk, hd.hash), hd);
    const revOk = pt && eq(pt.reveals, c.opens_to.reveals);
    const recipIds = everyBlock().filter(b => b.signer === c.recipient && !b.block.refs.author).map(b => b.hash);
    const audOk = pt && pt.reveals.some(r => recipIds.includes(r.value) && blk.state.audience.includes(fb.commitment(r.salt, r.value)));
    rec('sealed', c.name, !!(hsig && hashOk && sigOk && hdrOk && revOk && audOk && authorOk), { hsig, hashOk, sigOk, hdrOk, revOk, audOk });
  }
}
// headers
{
  const pool = poolOf(allBlocks());
  for (const v of V.headers) {
    const b = pool.raw(v.hash);
    const ok = b && eq(fb.headerOf(b, v.hash), v.header) && pool.identity(v.header.author).keys.some(k => fb.verifyStr(fb.ser(v.header, false), k, v.header_signature));
    rec('headers', v.name, !!ok);
  }
}
// identities
for (const v of V.identities) {
  const pool = poolOf(v.blocks, { arrivals: v.arrivals });
  const id = pool.identity(v.id);
  const checks = {};
  // signed_by_author is a block's status in its own author's fold (a vector may list a principal's blocks beside an agent's)
  const authorOf = h => { const b = (v.blocks.find(x => x.hash === h) || {}).block; return b && b.refs && b.refs.author !== undefined ? b.refs.author : h; };
  for (const [h, want] of Object.entries(v.signed_by_author)) checks['signed:' + h.slice(0, 8)] = (pool.identity(authorOf(h)).signed[h] === true) === want;
  if (v.keys) checks.keys = eq(id.keys, [...v.keys].sort());
  if (v.frozen) checks.frozen = eq(id.frozen, [...v.frozen].sort());
  if (v.operators) checks.operators = eq(id.operators, [...v.operators].sort());
  if (v.under) for (const [h, want] of Object.entries(v.under)) checks['under:' + h.slice(0, 8)] = !!id.under[h] === want;
  if (v.history) checks.history = id.history === v.history;
  const ok = Object.values(checks).every(Boolean);
  rec('identities', v.name, ok, { checks, keys: id.keys, frozen: id.frozen });
}
// deals and promise folds
function promiseCase(section, v) {
  const pool = poolOf(v.blocks, { arrivals: v.arrivals });
  const out = try_(() => fb.foldPromise(pool, v.first, v.now));
  const bad = out.error ? out : subset(out, v.expected);
  rec(section, v.name, !bad, bad);
}
for (const v of V.deals) promiseCase('deals', v);
for (const v of V.folds.promises) promiseCase('folds.promises', v);
// circles
function circleCase(section, v) {
  const pool = poolOf(v.blocks);
  const f = try_(() => fb.foldCircle(v.circle, pool));
  if (f.error) return rec(section, v.name, false, f);
  const e = v.expected;
  const membersOk = Array.isArray(e.members) ? eq(Object.keys(f.members).sort(), [...e.members].sort()) : eq(f.members, e.members);
  const removedOk = eq(f.removed, [...e.removed].sort());
  const may = {}; for (const [h, want] of Object.entries(v.may_act || {})) may[h] = fb.mayAct(pool, h) === want;
  const countedOk = !e.counted_to || eq(f.counted_to, e.counted_to);
  rec(section, v.name, membersOk && removedOk && countedOk && Object.values(may).every(Boolean), { members: f.members, removed: f.removed, counted_to: f.counted_to, may });
}
for (const v of V.circles) circleCase('circles', v);
for (const v of V.folds.circles) circleCase('folds.circles', v);
// audience: members then
for (const a of V.folds.audience) {
  const pool = poolOf(a.blocks);
  for (const c of a.cases) {
    const blk = pool.get(c.block);
    const [C] = c.recipient.split('#');
    const salt = a.salts[c.recipient] || a.salts[C];
    const inAud = salt ? blk.state.audience.includes(fb.commitment(salt, c.recipient)) : null;
    const got = fb.audienceMembers(pool, c.block, c.recipient);
    rec('folds.audience', c.name, eq(got, [...c.members].sort()), { got, inAud });
    if (salt && c === a.cases[0]) rec('folds.audience(commitment found)', c.name, inAud, { salt, recipient: c.recipient });
  }
}
// things
for (const t of V.folds.things) {
  const pool = poolOf(t.blocks);
  for (const w of t.where) { const got = fb.whereNow(pool, w.thing); rec('folds.things:where', w.name, eq(got, [...w.places].sort()), got); }
  for (const o of t.owners) { const got = fb.ownerOf(pool, o.thing); rec('folds.things:owner', o.name, got.owner === o.owner && eq(got.conflict, o.conflict ? [...o.conflict].sort() : null), got); }
}
for (const s of V.folds.successors) {
  const pool = poolOf(s.blocks, { arrivals: s.arrivals });
  const got = fb.foldSuccessor(pool, s.grant, s.now);
  rec('folds.successors', s.name, eq(got.events, [...s.expected.events].sort()) && got.fired === s.expected.fired && got.fires === s.expected.fires, got);
}
for (const r of V.folds.rekeys) {
  const pool = poolOf(r.blocks);
  const got = fb.foldRekeys(r.circle, pool);
  rec('folds.rekeys', r.name, got.epoch === r.expected.epoch && eq(got.keys, [...r.expected.keys].sort()), got);
}
for (const b of V.folds.ballots) {
  const pool = poolOf(b.blocks);
  for (const c of b.cases) rec('folds.ballots', c.name, fb.ballotCounted(pool, c.result, c.commitment, c.counter) === c.counted);
}
// refusals
{
  const all = poolOf(V.refusals.blocks);
  for (const c of V.refusals.cases) {
    if (c.by === 'check') {
      const ctx = { get: h => (c.held || []).includes(h) ? all.get(h) : null };
      const found = fb.refusals(c.block, ctx), codes = found.map(r => r.code);
      rec('refusals:check(refuse/accept)', c.name, (codes.length > 0) === (c.codes.length > 0), found);
      rec('refusals:check(codes)', c.name, eq(codes, c.codes), { codes, want: c.codes });
    } else if (c.by === 'accept') {
      const held = V.refusals.blocks.filter(b => c.held.includes(b.hash) || c.incoming.includes(b.hash));
      const pool = poolOf(held);
      const outs = c.incoming.map(h => fb.acceptIncoming(pool, h));
      rec('refusals:accept', c.name, outs.every(o => o.refused), outs);
    } else if (c.by === 'fold') {
      promiseCase('refusals:fold', c);
    } else if (c.by === 'open') {
      const pt = try_(() => fb.openEnvelope(c.message.envelope, K[c.recipient].x25519_private, K[c.recipient].public_key_encrypt));
      const refused = !pt || pt.error || !pt.block || fb.check(pt.block, {}).some(r => /bytes/.test(r)) || fb.hashOf(pt.block) !== c.message.header.hash;
      rec('refusals:open', c.name, !!refused, pt && pt.block ? fb.check(pt.block, {}) : pt);
    }
  }
}
// reads
for (const c of V.reads.cases) { const got = fb.readAs(c.block); rec('reads', c.name, eq(got, c.reads_as), { got, want: c.reads_as }); }
// messages
{
  const M = V.messages;
  const pool = poolOf(allBlocks());
  const sp = M.signed_pull;
  const pullOk = fb.verifyMsg(sp.message, K[sp.signer].public_key_sign) && pool.identity(fb.readMessage('signed_pull', sp.message).signer).keys.includes(K[sp.signer].public_key_sign);
  rec('messages', 'signed pull: signature by the signer', pullOk);
  // the older words: asker and pusher read as signer; the signature still covers the bytes as sent
  for (const [kind, o] of Object.entries(V.messages.older)) {
    const read = fb.readMessage(kind, o.message);
    rec('messages:older', kind, read.signer !== undefined && o.message.signer === undefined && fb.verifyMsg(o.message, K[o.signer].public_key_sign) && read.node === M.node);
  }
  const node = new fb.Node(M.node, K[M.node_signer].private_key, pool);
  for (const b of V.sealed.blocks) {
    const sc = V.sealed.cases.find(c => c.message.header.hash === b.hash);
    node.take(sc ? sc.message : { version: '1.6', block: b.block, signature: b.signature });
  }
  const sealedFor = {}; for (const c of V.sealed.cases) sealedFor[c.message.header.hash] = (everyBlock().find(b => b.signer === c.recipient && !b.block.refs.author) || {}).hash;
  const ans = try_(() => node.pull(sp.message, { now: sp.now, sealedFor }));
  rec('messages', 'pull answer: request hash', ans.request === M.pull_answer.message.request, { got: ans.request });
  rec('messages', 'pull answer: blocks, next, match count', eq(ans.blocks, M.pull_answer.message.blocks) && ans.next === M.pull_answer.message.next && ans.blocks.length === M.pull_answer.matches, ans.error || ans.blocks && ans.blocks.map(b => b.n));
  rec('messages', 'pull answer: byte-identical signature (deterministic Ed25519)', ans.signature === M.pull_answer.message.signature);
  const nodeKeys = pool.identity(M.node).keys;
  rec('messages', 'pull answer: verifies by a live key of the node holder', nodeKeys.some(k => fb.verifyMsg(M.pull_answer.message, k)));
  rec('messages', 'push answer: verifies by a live key of the node holder', nodeKeys.some(k => fb.verifyMsg(M.push_answer.message, k)));
  rec('messages', 'push answer: carries every field protocol.json lists', fb.P.messages.push_answer.every(f => f in M.push_answer.message), Object.keys(M.push_answer.message));
  const replay = try_(() => node.pull(sp.message, { now: sp.now, sealedFor }));
  rec('messages', 'signed pull: a seen nonce is refused', !!replay.error);
  const late = new fb.Node(M.node, K[M.node_signer].private_key, pool);
  rec('messages', 'signed pull: an at outside the window is refused', !!try_(() => late.pull(sp.message, { now: '2026-10-15T14:00:00.000Z' })).error);
  rec('messages', 'discovery: fields', eq(Object.keys(M.discovery).sort(), [...fb.P.messages.discovery].sort()) && eq(Object.keys(M.discovery.endpoints).sort(), [...fb.P.messages.endpoints].sort()));
  rec('messages', 'announcement: fields', eq(Object.keys(M.announcement).sort(), [...fb.P.messages.announcement].sort()));
  rec('messages', 'discovery: rebuilt', eq(fb.discovery(M.node, M.discovery.holds, M.discovery.speaks_for, null, M.discovery.endpoints), M.discovery));
}
// micro: write into one's own chain, and the check passes it
{
  const k = fb.newSigningKey(), rk = fb.newSigningKey();
  const g = fb.genesis(k, { at: '2026-10-15T12:00:00.000Z', recoveryKeyHash: fb.sha256(rk.public_key_sign) });
  const chain = { author: g.hash, head: g.hash, seq: 0, key: k };
  const w = fb.write(chain, 'observe', { kind: 'reading', at: '2026-10-15T12:00:01.000Z', audience: 'public', amount: { value: '3.9', unit: 'Cel' } }, {});
  const pool = new fb.Pool([{ block: g.block, signature: g.signature }, { block: w.block, signature: w.signature }]);
  rec('self:micro-write', 'genesis and first block pass the check and count', fb.check(g.block).length === 0 && !w.refused && pool.counts(w.hash), w.refused);
}


// every 1.6 block in every story passes the strict write check (found by reading run-vectors.cjs afterwards)
{
  const stories = [...V.identities.map(v => ['identity', v.name, v.blocks]), ...V.deals.map(v => ['deal', v.name, v.blocks]), ...V.circles.map(v => ['circle', v.name, v.blocks]),
    ...Object.entries(V.folds).flatMap(([k, list]) => list.map(v => [k, v.name, v.blocks])), ['refusal', 'stories', V.refusals.blocks],
    ...V.refusals.cases.filter(c => c.blocks).map(c => ['refusal', c.name, c.blocks]), ['sealed', 'stories', V.sealed.blocks]];
  for (const [g, name, list] of stories) {
    const wrong = [];
    for (const b of list) {
      if (fb.hashOf(b.block) !== b.hash) wrong.push(b.name + ': hash');
      const is16 = b.block.state.seq !== undefined || (b.block.type === 'actor' && !b.block.refs.author && b.block.state.recovery_key_hash !== undefined);
      if (is16) { const r = fb.check(b.block, {}); if (r.length) wrong.push(b.name + ': ' + r.join('; ')); }
    }
    rec('stories: hash + strict check', g + ': ' + name, !wrong.length, wrong);
  }
  // each author's blocks in hashes form one key chain
  const pool = new fb.Pool(V.hashes.map(v => ({ block: v.block, signature: (V.signatures.find(s => s.hash === v.hash) || {}).signature })));
  for (const id of new Set(V.hashes.map(v => v.block.refs.author).filter(Boolean))) {
    const mine = V.hashes.filter(v => v.block.refs.author === id).map(v => v.block).sort((a, b) => a.state.seq - b.state.seq);
    let prev = id, ok = true; mine.forEach((b, i) => { if (b.state.seq !== i + 1 || b.refs.prev !== prev) ok = false; prev = fb.hashOf(b); });
    rec('hashes:chain', id.slice(0, 8), ok);
  }
}

// the compact form (encoding.md): block <-> CBOR bytes, both key forms; loose encodings accepted; malformed ones refused
{
  const C = V.cbor, hexOf = b => Buffer.from(b).toString('hex'), fromHex = h => Buffer.from(h, 'hex');
  const signed = c => ({ hash: c.hash, ...c.block, signature: c.signature });
  for (const c of C.cases) {
    const b = signed(c);
    rec('cbor:encode', c.name, hexOf(fb.cborEncode(b)) === c.cbor && hexOf(fb.cborEncode(b, { short: true })) === c.cbor_short, { text: hexOf(fb.cborEncode(b)), short: hexOf(fb.cborEncode(b, { short: true })) });
    for (const form of ['cbor', 'cbor_short']) { const got = try_(() => fb.cborDecode(fromHex(c[form]))); rec('cbor:decode', c.name + ' (' + form + ')', eq(got, b) && fb.hashOf(got) === c.hash, got); }
    rec('cbor:size', c.name, Buffer.byteLength(fb.canonOf(c.block)) === c.canonical_bytes);
  }
  { const got = try_(() => fb.cborDecode(fromHex(C.loose.cbor))); rec('cbor:loose', C.loose.name, got.hash === C.loose.hash, got); }
  { const blocks = C.push.hashes.map(h => signed(C.cases.find(c => c.hash === h))); rec('cbor:push', C.push.name, hexOf(fb.cborEncodePush(blocks)) === C.push.cbor && hexOf(fb.cborEncodePush(blocks, { short: true })) === C.push.cbor_short); }
  for (const h of C.headers) rec('cbor:header', h.name, hexOf(fb.cborHeader(h.header)) === h.cbor && hexOf(fb.cborHeader(h.header, { short: true })) === h.cbor_short);
  for (const r of C.refused) rec('cbor:refused', r.name, !!try_(() => fb.cborDecode(fromHex(r.cbor))).error);
}

// report
let tp = 0, tf = 0;
for (const [s, r] of Object.entries(results)) { tp += r.pass; tf += r.fail; console.log(`${s.padEnd(44)} pass ${String(r.pass).padStart(3)}  fail ${String(r.fail).padStart(3)}`); }
console.log(`TOTAL pass ${tp} fail ${tf}`);
for (const f of fails) if (VERBOSE || !/exact words/.test(f.section)) console.log('FAIL', f.section, '|', f.name, '|', JSON.stringify(f.detail).slice(0, 900));
process.exit(tf ? 1 : 0);
