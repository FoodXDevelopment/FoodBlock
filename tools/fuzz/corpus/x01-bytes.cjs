'use strict';
// Security seats 01 (signatures and ids), 02 (parsing and denial) and 08 (build): the byte-level splits, rows 35 to 46 and 51. From
// foodx/research/2026-11-12-foodblock-security/{01,02,08}-scratch/, built as the seats built them.
const crypto = require('crypto');
const SX = 'security ';
const AT = '2026-11-12T10:00:00.000Z';
const sha = (b) => crypto.createHash('sha256').update(b).digest();
const mk = (L) => { const keys = L.fb.generateKeypair(); const g = L.fb.identity.genesis(keys, { kind: 'person', at: AT, audience: 'public' }); return { keys, id: g.hash, g }; };

// security 02's text cases (02-scratch/diff-bytes.cjs): the fixed ones, as that script builds them
function byteCases() {
  const Hx = (c) => c.repeat(64), A = Hx('a'), B = Hx('b');
  const base = (state = {}, refs = {}, type = 'observe') => ({ type, state: { at: '2026-01-01T00:00:00.000Z', audience: 'public', seq: 1, ...state }, refs: { author: A, prev: B, ...refs } });
  function jcs(v) {
    if (v === null) return 'null'; if (typeof v === 'boolean') return String(v); if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
    if (typeof v === 'string') return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
  }
  const T = (state, refs, type) => jcs(base(state, refs, type));
  const good = T();
  const withRaw = (raw) => good.replace('"state":{', '"state":{' + raw + ',');
  const inState = (key, rawValue) => good.replace('"state":{', '"state":{' + JSON.stringify(key) + ':' + rawValue + ',');
  const cases = [];
  const add = (name, text, op = 'strict_text') => cases.push({ name, text, op });
  add('good', good);
  add('leading space', ' ' + good); add('trailing newline', good + '\n'); add('BOM', '﻿' + good); add('two values', good + good);
  add('dup key same value', good.replace('"type":"observe"', '"type":"observe","type":"observe"'));
  add('dup key in state diff value', withRaw('"a":1,"a":2'));
  add('keys out of order', good.replace(/"state":\{"at":"([^"]+)","audience":"public"/, '"state":{"audience":"public","at":"$1"'));
  add('extra top key', good.slice(0, -1) + ',"zz":1}');
  add('missing refs', jcs({ state: base().state, type: 'observe' }));
  add('type constructor', T({}, {}, 'constructor'));
  for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) add('state key ' + k + ' obj', inState(k, '{"a":1}'));
  add('refs key __proto__ raw', good.replace('"refs":{', '"refs":{"__proto__":"' + A + '",'));
  for (const tok of ['-0', '01', '1.0', '1.5', '1e1', '9007199254740991', '9007199254740992', '1e400', '0.1']) add('number ' + tok, inState('a', tok));
  for (const s of ['1.0', '-0', '0', '9007199254740992', '"1"', 'null']) add('seq ' + s, good.replace('"seq":1', '"seq":' + s));
  for (const [n, raw] of Object.entries({ 'esc lone high': '"\\ud800"', 'raw NUL': '"\u0000"', 'esc slash': '"\\/"', 'esc u uppercase hex': '"\\u00E9"', 'raw 2028': '" "', 'NFD e': '"é"' })) add('text ' + n, inState('a', raw));
  add('sort utf16 emoji first', good.replace('"state":{', '"state":{"zz":{"\u{1F600}":1,"～":2},'));
  add('sort codepoint order', good.replace('"state":{', '"state":{"zz":{"～":2,"\u{1F600}":1},'));
  add('set unsorted', good.replace('"refs":{', '"refs":{"about":["' + B + '","' + A + '"],'));
  add('set empty', good.replace('"refs":{', '"refs":{"about":[],'));
  const nestA = (n) => '['.repeat(n) + ']'.repeat(n), nestA1 = (n) => '['.repeat(n) + '1' + ']'.repeat(n);
  for (const d of [30, 31, 62, 63]) { add('depth arrays empty total ' + (d + 2), inState('a', nestA(d))); add('depth arrays 1 total ' + (d + 2), inState('a', nestA1(d))); }
  const goodLen = Buffer.byteLength(inState('a', '""'));
  add('size at limit', inState('a', JSON.stringify('x'.repeat(65536 - goodLen))));
  add('size one over', inState('a', JSON.stringify('x'.repeat(65536 - goodLen + 1))));
  const msg = (b) => ({ block: b, signature: '0'.repeat(128) });
  const P1 = jcs({ messages: [msg(base())] });
  const withFor = jcs({ for: {}, messages: [msg(base())] });
  add('push good', P1, 'strict_push');
  add('push extra key (row 45)', P1.slice(0, -1) + ',"zzz":1}', 'strict_push');
  add('push with for', withFor, 'strict_push');
  add('push float in for (row 43)', withFor.replace('"for":{}', '"for":{"x":1.5}'), 'strict_push');
  add('push 2^53 in for (row 43)', withFor.replace('"for":{}', '"for":{"x":9007199254740992}'), 'strict_push');
  add('push -0 in for', withFor.replace('"for":{}', '"for":{"x":-0}'), 'strict_push');
  add('push message extra key', jcs({ messages: [{ ...msg(base()), zzz: 1 }] }), 'strict_push');
  add('push block float (row 44)', P1.replace('"seq":1', '"seq":1.5'), 'strict_push');
  add('push block 2^53', P1.replace('"seq":1', '"seq":9007199254740992'), 'strict_push');
  add('push block depth 63 (push 65)', jcs({ messages: [msg(base({ a: JSON.parse(nestA(61)) }))] }), 'strict_push');
  add('push depth 65 empty in for (row 46)', jcs({ for: { a: JSON.parse(nestA(63)) }, messages: [msg(base())] }), 'strict_push');
  add('push depth 66 empty in for', jcs({ for: { a: JSON.parse(nestA(64)) }, messages: [msg(base())] }), 'strict_push');
  add('push messages not list', '{"messages":{}}', 'strict_push');
  add('push block constructor type', jcs({ messages: [msg(base({}, {}, 'constructor'))] }), 'strict_push');
  add('push __proto__ in for', '{"for":{"__proto__":{"x":1}},"messages":[]}', 'strict_push');
  return cases;
}

module.exports = [
  { name: 't2 P-256 keys and signatures in each spelling', row: 35, source: SX + '01 (01-scratch/t2-p256.cjs, H2); table row 35', build(L) {
    const { oracle } = L;
    const w = { name: '01 t2 p256', blocks: [] };
    const N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
    const PFX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';
    const kp = oracle.keypair(crypto.createHash('sha256').update('seat01-p256').digest('hex'), 'p256');
    const pt = kp.public_key_sign.slice(PFX.length), X = pt.slice(2, 66), Y = pt.slice(66);
    const hex32 = (n) => n.toString(16).padStart(64, '0'), big = (h) => BigInt('0x' + h);
    const gen = (key, signFn) => { const block = { type: 'actor', state: { kind: 'person', at: AT, audience: 'public', public_key_sign: key, suite: 'p256' }, refs: {} }; return { ...block, signature: signFn(Buffer.from(oracle.canonOf(block), 'utf8')) }; };
    const honest = (M) => oracle.signBytes(M, kp.private_key, 'p256');
    const flip = (sig) => sig.slice(0, 64) + hex32(N - big(sig.slice(64)));
    const both = (name, g) => { L.ask(w, name + ' [valid]', 'valid', [g, []]); L.ask(w, name + ' [verify]', 'verify', [g, g.signature, g.state.public_key_sign]); };
    const yOdd = big(Y) & 1n;
    both('honest', gen(kp.public_key_sign, honest));
    both('high s', gen(kp.public_key_sign, (M) => flip(honest(M))));
    both('r = 0', gen(kp.public_key_sign, (M) => hex32(0n) + honest(M).slice(64)));
    both('hybrid key (same point)', gen(PFX + '0' + (6 + Number(yOdd)) + X + Y, honest));
    both('hybrid key, wrong parity', gen(PFX + '0' + (7 - Number(yOdd)) + X + Y, honest));
    both('compressed tag in 65 bytes', gen(PFX + '02' + X + Y, honest));
    both('key off the curve', gen(PFX + '04' + X + hex32(big(Y) ^ 1n), honest));
    both('key = 04 0 0', gen(PFX + '04' + '00'.repeat(64), honest));
  } },
  { name: 't9 one hash twice in one push', row: 36, source: SX + '01 (01-scratch/t9-same-hash-push.cjs, M1); table row 36', build(L) {
    const w = new L.World('01 t9');
    const maria = mk(L), thief = mk(L), held0 = [maria.g, thief.g];
    const v = L.fb.write('observe', { kind: 'note', text: 'x' }, {}, { author: maria.id, key: maria.keys, held: held0, at: AT, audience: 'public' });
    const mh = L.header(v), variant = { header: { ...mh.header, seq: 7 }, header_signature: v.signature };
    L.ask(w, '[variant, genuine]', 'accept', [[variant, mh], held0, { takes_pairs: true }]);
    L.ask(w, '[genuine, variant]', 'accept', [[mh, variant], held0, { takes_pairs: true }]);
  } },
  { name: 't4b a squatted header in a chain', row: 37, source: SX + '01 (01-scratch/t4b.cjs); table row 37', build(L) {
    const w = new L.World('01 t4b');
    const maria = mk(L), thief = mk(L), held0 = [maria.g, thief.g];
    const v = L.fb.write('observe', { kind: 'note', text: 'x' }, {}, { author: maria.id, key: maria.keys, held: held0, at: AT, audience: 'public' });
    const v2 = L.fb.write('observe', { kind: 'note', text: 'y' }, {}, { author: maria.id, key: maria.keys, held: [...held0, v], at: AT, audience: 'public' });
    const mh = L.header(v);
    const th = { author: thief.id, seq: 1, prev: thief.id, hash: v.hash };
    const thh = { header: th, header_signature: L.fb.signMessage(th, thief.keys.private_key).signature };
    L.ask(w, 'accept her header and the squat', 'accept', [[mh, thh], held0, { takes_pairs: true }]);
    L.ask(w, 'chain with the squat', 'check_chain', [[maria.g, thh, v2], maria.id]);
    L.ask(w, 'chain with hers', 'check_chain', [[maria.g, mh, v2], maria.id]);
    L.ask(w, 'read_whole with the squat', 'read_whole', [v2.hash, maria.id, [maria.g, thief.g, thh, v2]]);
    L.ask(w, 'read_whole with hers', 'read_whole', [v2.hash, maria.id, [maria.g, thief.g, mh, v2]]);
  } },
  { name: 't11 t13 a header or a genesis passed as a signed message', row: 38, source: SX + '01 (01-scratch/t11-message-shape.cjs, t13-domain-sep.cjs, M2); table row 38', build(L) {
    const w = new L.World('01 t11');
    const { keys, g } = mk(L);
    const v = L.fb.write('transfer', { amount: { value: '500', unit: 'KES' } }, { to_owner: g.hash }, { author: g.hash, key: keys, held: [g], at: AT, audience: 'public' });
    L.ask(w, 'header plus the block signature', 'verify_message', [{ ...L.fb.header(v), signature: v.signature }, keys.public_key_sign]);
    L.ask(w, 'the genesis as a message', 'verify_message', [{ type: g.type, state: g.state, refs: g.refs, signature: g.signature }, keys.public_key_sign]);
    L.ask(w, 'a signed pull request', 'verify_message', [L.fb.signMessage({ signer: g.hash, node: g.hash, counter: 1 }, keys.private_key), keys.public_key_sign]);
  } },
  { name: 't5 the short reply in each spelling', row: '39-40', source: SX + '01 (01-scratch/t5-short-reply.cjs, M3); table rows 39 and 40', build(L) {
    const w = new L.World('01 t5');
    const maria = mk(L), achieng = mk(L), host = mk(L);
    let held = [maria.g, achieng.g, host.g];
    const wr = (p, type, state, refs) => { const b = L.fb.write(type, state, refs, { author: p.id, key: p.keys, held, at: AT, audience: 'public' }); held = [...held, b]; return b; };
    const maize = wr(maria, 'thing', { kind: 'maize' }, {});
    const offer = wr(maria, 'promise', { terms: { price: { amount: { value: '1000', unit: 'KES' }, per: { value: '1', unit: 'sack' } }, quantity: { value: '1', unit: 'sack' } } }, { from: maria.id, to: achieng.id, what: maize.hash });
    const rb = wr(host, 'observe', { kind: 'readback', readback: 'a'.repeat(64) }, { for: offer.hash });
    const link = L.fb.identity.nextLinkFor(achieng.id, achieng.keys.public_key_sign, held);
    const created = L.fb.create('promise', { at: AT, audience: 'public', seq: link.seq, status: 'accepted' }, { answers: offer.hash, author: achieng.id, derives_from: [rb.hash], for: offer.hash, prev: link.prev });
    const accept = { ...created, signature: L.fb.sign(created, achieng.keys.private_key) };
    L.ask(w, 'short_reply', 'short_reply', [accept]);
    const tR = L.call('short_reply', accept);
    const raw = Buffer.from(String(tR).slice(4), 'base64url'), seqTail = raw.subarray(76);
    const open = (name, text) => { const m = /\(row (\d+)\)/.exec(name); L.ask(w, name, 'short_reply_open', [text, achieng.id, held], m ? { row: Number(m[1]) } : {}); };
    open('honest', tR);
    open('seq with a leading zero byte (row 40)', 'FB1 ' + Buffer.concat([raw.subarray(0, 76), Buffer.from([0]), seqTail]).toString('base64url'));
    open('seq as 9 bytes (row 40)', 'FB1 ' + Buffer.concat([raw.subarray(0, 76), Buffer.from([1]), Buffer.alloc(8 - seqTail.length), seqTail]).toString('base64url'));
    open('padding (row 39)', tR + '==');
    open('standard alphabet (row 39)', 'FB1 ' + raw.toString('base64').replace(/=+$/, ''));
    open('a space inside (row 39)', tR.slice(0, 20) + ' ' + tR.slice(20));
    open('a junk char (row 39)', tR.slice(0, 20) + '*' + tR.slice(20));
    open('lowercase prefix', 'fb1' + tR.slice(3));
  } },
  { name: 't10 DER spellings in a passkey signature', row: 41, source: SX + '01 (01-scratch/t10-der.cjs, M4); table row 41', build(L) {
    const w = { name: '01 t10', blocks: [] };
    const r = '7'.repeat(64), s = '1'.repeat(64);
    const der = (rb, sb, extra = '') => { const R = '02' + (rb.length / 2).toString(16).padStart(2, '0') + rb, S = '02' + (sb.length / 2).toString(16).padStart(2, '0') + sb; const body = R + S + extra; return '30' + (body.length / 2).toString(16).padStart(2, '0') + body; };
    const auth = 'aa'.repeat(32) + '05' + '00000001', cdj = Buffer.from('{"type":"webauthn.get"}').toString('hex');
    const cases = { strict: der(r, s), 'r with a needless 00': der('00' + r, s), 'trailing junk inside': der(r, s, '0500'), 'trailing junk outside': der(r, s) + 'ffff', 'long-form length 81': '3081' + der(r, s).slice(2), 'r negative': der('8' + r.slice(1), s), 'r 33 bytes nonzero': der('01' + r, s) };
    for (const [n, d] of Object.entries(cases)) L.ask(w, n, 'passkey_signature', [auth, cdj, d]);
  } },
  { name: 'proto-min: one signed block of type constructor', row: 42, source: SX + '02 (02-scratch/proto-min.cjs, F3); table row 42', build(L) {
    const w = new L.World('02 constructor');
    const maria = w.person('maria'), thief = w.person('thief');
    const bread = L.thing(w, maria, 'bread', L.amt(1, 'loaf'), 'bread');
    const clean = w.blocks.slice();
    const n = L.next(w, thief.keys, thief);
    const poison = w.add(L.signed(thief, thief.keys, 'constructor', {}, {}, { prev: n.prev, seq: n.seq }), 'poison');
    L.ask(w, 'valid(poison)', 'valid', [poison, clean]);
    L.ask(w, 'ownership(bread), clean store', 'ownership', [bread, clean, null]);
    L.ask(w, 'ownership(bread), store and poison', 'ownership', [bread, 'held', null]);
    L.ask(w, 'accept([bread], store and poison)', 'accept', [[bread], w.blocks.filter((b) => b !== bread), { takes_pairs: false }]);
    L.ask(w, 'accept([poison], clean store)', 'accept', [[poison], clean, { takes_pairs: false }]);
  } },
  { name: 'diff-bytes: the same text to both readers', row: '43-46', source: SX + '02 (02-scratch/diff-bytes.cjs, F4 and F5, the fixed cases); table rows 43 to 46', build(L) {
    const w = { name: '02 bytes', blocks: [] };
    for (const c of byteCases()) { const m = /\(row (\d+)\)/.exec(c.name); L.ask(w, c.name, c.op, [c.text], m ? { row: Number(m[1]) } : {}); }
  } },
  { name: 'deep-make: a chain of a thousand makes', row: 51, source: SX + '08 (08-scratch/deep-make.cjs, oracle-deep.cjs, F1); table row 51', build(L) {
    const w = new L.World('08 deep make');
    const harry = w.person('harry');
    let prev = harry.id, seq = 1;
    const blocks = w.blocks.slice();
    const put = (type, state, refs) => { const b = L.signed(harry, harry.keys, type, state, refs, { prev, seq }); blocks.push(b); prev = b.hash; seq += 1; return b; };
    let t = put('thing', { kind: 'maize', pack: { value: '50', unit: 'kg' } }, { of: L.kindOf('maize') });
    for (let i = 0; i < 1000; i++) { const m = put('transform', {}, { derives_from: [t.hash] }); t = put('thing', { kind: 'maize', pack: { value: '50', unit: 'kg' } }, { derives_from: [m.hash] }); }
    L.ask({ name: w.name, blocks }, 'ownership of the last thing, 1000 makes deep', 'ownership', [t, 'held', null]);
  } },
];
