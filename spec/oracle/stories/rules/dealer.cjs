'use strict';
// The dealer's twelve stories, each one fixed world, and the dealer-conformance world (it conforms for eight ops, and does not speak FoodBlock).
// Each question prints the oracle's answer and the answer the text gives, and OK or DIFF. Signed with Node's own crypto (the kit's helpers), never the oracle's signer.
const L = require('../circles/lib.cjs');
const { fb, World, P, T, A, kindOf, instance, check, done, day, GBP } = L;
const { dealer, conformsFor } = require('../../dealer.cjs');
const per = (v, thing) => ({ amount: GBP(v), per: A('1', thing) });
const sha = s => require('crypto').createHash('sha256').update(s).digest('hex');
const msg = (blocks, ids) => fb.jcs({ ...(ids ? { ids } : {}), messages: blocks.map(b => fb.door('wrap', b)) });
const KEEP = { keep: true };
const gen = (w, p) => w.blocks.find(b => b.hash === p.id);
const priv = '55'.repeat(32);
// the base world: Harry (the dealer) keeps his own sacks; Amara orders 10 sacks from him at £300 (£30 a sack)
function base(o = {}) {
  const w = new World(), amara = P(w, 'amara'), harry = P(w, 'harry');
  const K = kindOf(harry, 'flour'), lot = T(instance(harry, K, { pack: A('10', 'sack') }), 'lot');
  const held = w.blocks.filter(b => b.hash === harry.id || (b.refs && b.refs.author === harry.id));
  const order = T(amara.write('promise', { terms: require('../kit.cjs').linesFor(lot, { quantity: A('10', 'sack'), price: per(30, 'sack'), ...(o.terms || {}) }), ...(o.state || {}) }, { from: harry.id, to: amara.id, ...(o.refs || {}) }, KEEP), 'O');
  const opts = { me: harry.id, sign: (t, s, r) => harry.write(t, s, r, KEEP), enc_private: priv, at: day(4) };
  return { w, amara, harry, K, lot, held, order, opts, A0: gen(w, amara) };
}
const sum = r => [r.answer, r.stage || r.code || r.codes];
const codes = r => r.codes || r.code;

// Conformance. The dealer conforms for eight ops (it passes their cases), and does not speak FoodBlock: it names the eight, and no more.
{
  const need = ['hash', 'id_of', 'header', 'strict_text', 'verify', 'valid', 'read', 'promise_stage'];
  check('dealer conforms', 'the dealer conforms for exactly the eight ops', [...conformsFor].sort(), [...need].sort());
  const pr = fb.P.door.protocol, all = [...pr.sound, ...pr.word];
  check('dealer conforms', 'each of the eight is a sound-part op or a word op', need.every(o => all.includes(o)), true);
  check('dealer conforms', 'it does not speak FoodBlock: it passes not the whole sound part (suite_of_key is left) and not every word op', [pr.sound.every(o => need.includes(o)), pr.word.every(o => need.includes(o))], [false, false]);
  const W = base();
  // the dealer runs its eight on one deal and nothing else: what it answers is drawn from them
  const r = dealer(msg([W.A0, W.order]), W.held, W.opts);
  check('dealer conforms', 'it answers a deal with the eight (valid, read, promise_stage ...)', r.answer, 'accepted');
}

// Accept: Amara orders 10 sacks from Harry at £300, public: accepted; promise_stage binding (the oracle's word for a binding deal is `accepted`).
{
  const W = base();
  const r = dealer(msg([W.A0, W.order]), W.held, W.opts);
  check('accept', 'Amara orders 10 sacks at £300, public: accepted, the deal binds', [r.answer, r.stage, r.total], ['accepted', 'accepted', '300']);
  check('accept', 'its accept answers the order and names it in `for`, and adds no term', [r.draft.type, r.draft.state.status, r.draft.refs.answers, r.draft.refs.for, Object.keys(r.draft.state).filter(k => !['status', 'at', 'seq', 'audience'].includes(k))], ['promise', 'accepted', W.order.hash, W.order.hash, []]);
}
// Accept: the same, sealed to both.
{
  const W = base();
  const commit = v => fb.door('salted_hash', sha('s' + v), v), aud = [commit(W.amara.id), commit(W.harry.id)].sort();
  const nonce = 'abcdefabcdefabcdefabcdefabcdef12';
  const order = W.amara.write('promise', { terms: require('../kit.cjs').linesFor(W.lot, { quantity: A('10', 'sack'), price: per(30, 'sack') }), audience: aud, nonce }, { from: W.harry.id, to: W.amara.id }, KEEP);
  const body = { type: order.type, state: order.state, refs: order.refs };
  const env = fb.door('seal', { block: body, reveals: [] }, [fb.encPublicOf(priv, 'std')], 'std', { vectorsOnly: true });
  const sealed = { header: fb.door('header', order), header_signature: order.signature, envelope: env };
  const text = fb.jcs({ messages: [fb.door('wrap', W.A0), sealed] });
  const r = dealer(text, W.held, W.opts);
  check('accept sealed', 'the order sealed to Amara and Harry: accepted, and the accept keeps the same audience', [r.answer, r.stage, r.draft && r.draft.state.audience && JSON.stringify(r.draft.state.audience) === JSON.stringify(aud)], ['accepted', 'accepted', true]);
  check('accept sealed', 'without its key it cannot open the copy: it does not answer', dealer(text, W.held, { ...W.opts, enc_private: undefined }).answer, 'waits');
}
// Accept: Mama sells 3 mandazi for KSh 10 (`step` 1 KES); Leila takes 2: accepted, total 7.
{
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
  const mz = kindOf(mama, 'mandazi');
  const m1 = mama.write('promise', { terms: require('../kit.cjs').linesFor(mz, { price: { amount: A('10', 'KES'), per: A('3', 'piece') }, quantity: { min: A('1', 'piece'), max: A('3', 'piece') }, step: A('1', 'KES') }) }, { from: mama.id, to: leila.id });
  const held = w.blocks.filter(b => b.hash === mama.id || (b.refs && b.refs.author === mama.id));
  const take = leila.write('promise', { status: 'accepted', terms: { lines: [{ id: 'goods', quantity: A('2', 'piece') }] } }, { answers: m1.hash, for: m1.hash }, KEEP);
  const r = dealer(msg([gen(w, leila), take]), held, { me: mama.id });
  check('accept rounded', 'Leila takes 2 of 3: accepted, total 7 KES (step 1 KES rounds 20/3)', [r.answer, r.stage, r.total], ['accepted', 'accepted', '7']);
}
// Accept: Amara's order with `expires` Friday and `pay_by` three days on.
{
  const W = base({ terms: { expires: day(5, 17), pay_by: day(8, 17) } });
  const r = dealer(msg([W.A0, W.order]), W.held, W.opts);
  check('accept expiry', 'expires Friday, pay_by three days on: accepted', [r.answer, r.stage], ['accepted', 'accepted']);
}
// Refuse: a message whose bytes are not canonical.
{
  const W = base();
  const good = msg([W.A0, W.order]);
  const spaced = good.replace('{"messages":', '{ "messages":');
  const parsed = JSON.parse(good); const swapped = JSON.stringify({ messages: parsed.messages.map(m => ({ signature: m.signature, block: m.block })) });
  check('refuse not canonical', 'a space in the bytes: not_canonical', dealer(spaced, W.held, W.opts).code, 'not_canonical');
  check('refuse not canonical', 'a key out of order: not_canonical', dealer(swapped, W.held, W.opts).code, 'not_canonical');
  check('refuse not canonical', 'a null inside the block (strict writing): not_canonical', dealer(fb.jcs({ messages: [fb.door('wrap', W.A0), { block: { type: 'promise', state: { terms: null }, refs: {} }, signature: 'ab' }] }), W.held, W.opts).code, 'not_canonical');
}
// Refuse: a block whose id is not the hash of its bytes.
{
  const W = base();
  const r = dealer(msg([W.A0, W.order], [W.A0.hash, sha('another body')]), W.held, W.opts);
  check('refuse bad hash', 'the id sent is not the hash of the bytes: refused bad_hash, nothing accepted', [r.answer, r.code], ['refused', 'bad_hash']);
}
// Refuse: signatures that do not open, one a passkey signature with flags 0x01.
{
  const W = base();
  const bad = { ...W.order, signature: W.order.signature.replace(/^../, m => (m === '00' ? '01' : '00')) };
  check('refuse bad signature', 'a signature that does not open: bad_signature', dealer(msg([W.A0, bad]), W.held, W.opts).code, 'bad_signature');
  const wrongKey = { ...W.order, signature: W.harry.make('thing', {}).signature };
  check('refuse bad signature', 'a signature of another key: bad_signature', dealer(msg([W.A0, wrongKey]), W.held, W.opts).code, 'bad_signature');
  // the passkey: Mama's card, flags 0x01 (present, not verified) is no signature; 0x05 is
  const crypto = require('crypto'), cj = L.cj, headerOf = L.headerOf;
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = '3059301306072a8648ce3d020106082a8648ce3d030107034200' + ec.publicKey.export({ format: 'der', type: 'spki' }).subarray(26).toString('hex');
  const N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
  const frame = (bytes, flags) => {
    const chal = crypto.createHash('sha256').update(bytes).digest('base64url');
    const cdj = Buffer.from('{"type":"webauthn.get","challenge":"' + chal + '","origin":"https://example.org"}', 'utf8');
    const auth = Buffer.alloc(37); auth[32] = flags;
    const der = crypto.sign('sha256', Buffer.concat([auth, crypto.createHash('sha256').update(cdj).digest()]), ec.privateKey);
    let i = 4, rl = der[3], r = der.subarray(i, i + rl); i += rl + 2; const sl = der[i - 1]; let s = der.subarray(i, i + sl);
    const strip = v => { while (v.length > 32 && v[0] === 0) v = v.subarray(1); return Buffer.concat([Buffer.alloc(32 - v.length), v]); };
    r = strip(r); s = strip(s); let sn = BigInt('0x' + s.toString('hex')); if (sn > N / 2n) sn = N - sn;
    const len = Buffer.alloc(2); len.writeUInt16BE(auth.length);
    return Buffer.concat([r, Buffer.from(sn.toString(16).padStart(64, '0'), 'hex'), len, auth, cdj]).toString('hex');
  };
  const g = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', suite: 'p256', public_key_sign: spki }, refs: {} };
  const gh = L.sha(cj(g)), G = { hash: gh, ...g, signature: frame(Buffer.from(cj(g), 'utf8'), 5) };
  const ord = flags => { const b = { type: 'promise', state: { at: day(0), audience: 'public', seq: 1, terms: { lines: [{ id: 'goods', what: W.lot.hash, quantity: A('10', 'sack'), price: per(30, 'sack') }] } }, refs: { author: gh, prev: gh, from: W.harry.id, to: gh } }; const h = L.sha(cj(b)); return { hash: h, ...b, signature: frame(Buffer.from(cj(headerOf(b, h)), 'utf8'), flags) }; };
  check('refuse bad signature', 'a passkey signature with flags 0x01: bad_signature', dealer(msg([G, ord(1)]), W.held, W.opts).code, 'bad_signature');
  check('refuse bad signature', 'flags 0x05 on the same order: accepted (the card is a voice)', dealer(msg([G, ord(5)]), W.held, W.opts).answer, 'accepted');
}
// Refuse: an order with a `state.rule_set` the dealer does not run: held not read (unknown_rules), not accepted.
{
  const W = base({ state: { rule_set: sha('a rule set') } });
  const r = dealer(msg([W.A0, W.order]), W.held, W.opts);
  check('refuse unknown rules', 'a rule set it does not run: held not read, not accepted', [r.answer, r.codes, r.draft === undefined], ['not_read', ['unknown_rules'], true]);
  // a term, a schema or a condition it does not read
  const T1 = base({ terms: { forfeit: A('5', 'GBP') } }), r1 = dealer(msg([T1.A0, T1.order]), T1.held, T1.opts);
  check('refuse unknown rules', 'a term it does not read (forfeit): held not read, not accepted', [r1.answer, r1.codes], ['not_read', ['term_not_read']]);
  const T2 = base({ terms: { condition: { paid: sha('x') } } }), r2 = dealer(msg([T2.A0, T2.order]), T2.held, T2.opts);
  check('refuse unknown rules', 'a condition it does not read: held not read, not accepted', r2.answer, 'not_read');
  const T3 = base({ refs: { schema: sha('a schema') } }), r3 = dealer(msg([T3.A0, T3.order]), T3.held, T3.opts);
  check('refuse unknown rules', 'a schema it does not read: held not read, not accepted', r3.answer, 'not_read');
}
// Settled: cash in hand: Harry's transfer (covers £300) for the order, and Amara's accepted of it: done.
{
  const W = base();
  const t = W.harry.write('transfer', { covers: GBP(300) }, { what: W.lot.hash, to_owner: W.amara.id, for: W.order.hash }, KEEP);
  const held = [...W.held, t];
  const yes = W.amara.write('transfer', { status: 'accepted' }, { answers: t.hash, for: W.order.hash }, KEEP);
  const r = dealer(msg([W.A0, W.order, yes]), held, W.opts);
  check('settled cash', 'cash in hand: Harry\'s transfer with covers 300 and Amara\'s accepted: settled, done', [r.answer, r.stage], ['settled', 'done']);
}
// Settled: a credit order paid later: Harry accepts, hands over the goods; Amara pays; Harry's `accepted` with `covers` after the goods: done.
{
  const W = base();
  const ac = W.harry.write('promise', { status: 'accepted' }, { answers: W.order.hash, for: W.order.hash }, KEEP);
  const t = W.harry.write('transfer', {}, { what: W.lot.hash, to_owner: W.amara.id, for: W.order.hash, after: [ac.hash] }, KEEP);
  const held = [...W.held, W.A0, W.order, ac, t];
  const pay = W.amara.write('transfer', { amount: GBP(300) }, { to_owner: W.harry.id, for: W.order.hash }, KEEP);
  const none = dealer(msg([pay]), held, W.opts);
  check('settled credit', 'it counts nothing as received on the giver\'s word: no accept without its own tally', [none.answer, none.draft === undefined], ['nothing', true]);
  const r = dealer(msg([pay]), held, { ...W.opts, received: [pay.hash] });
  check('settled credit', 'its tally says it came: it signs `accepted` with `covers` 300 and the deal is done', [r.answer, r.stage, fb.jcs(r.draft.state.covers), r.draft.refs.answers === pay.hash], ['settled', 'done', fb.jcs(GBP(300)), true]);
}
// Under a grant: an order signed by Amara's AI under her grant, which the dealer cannot check: it asks for her own key.
{
  const W = base();
  const ai = P(W.w, 'amara-ai');
  const G = W.amara.write('grant', { kind: 'tool', scope: { types: ['promise'], each: GBP(500), limit: GBP(500) } }, { to: ai.id }, KEEP);
  const o = ai.write('promise', { terms: require('../kit.cjs').linesFor(W.lot, { quantity: A('10', 'sack'), price: per(30, 'sack') }) }, { from: W.harry.id, to: W.amara.id, under: G.hash }, KEEP);
  const r = dealer(msg([W.A0, gen(W.w, ai), o]), W.held, W.opts);
  check('under a grant', 'the grant is not in the message: it declines to answer and asks for her own key', [r.answer, r.draft === undefined, /own key/.test(r.says)], ['ask_own_key', true, true]);
  const g2 = dealer(msg([W.A0, gen(W.w, ai), G, o]), W.held, W.opts);
  check('under a grant', 'the grant is in the message but she has set no meter (it cannot check the line): still asks', g2.answer, 'ask_own_key');
}
// Tampered payment: a payment whose body changed after signing: refused (bad_hash).
{
  const W = base();
  const ac = W.harry.write('promise', { status: 'accepted' }, { answers: W.order.hash, for: W.order.hash }, KEEP);
  const held = [...W.held, W.A0, W.order, ac];
  const pay = W.amara.write('transfer', { amount: GBP(300) }, { to_owner: W.harry.id, for: W.order.hash }, KEEP);
  const tam = { ...pay, state: { ...pay.state, amount: GBP(3) } };
  const r = dealer(msg([tam], [pay.hash]), held, { ...W.opts, received: [pay.hash] });
  check('tampered payment', 'the body changed after signing, under the id it was signed under: refused bad_hash', [r.answer, r.code], ['refused', 'bad_hash']);
}
done();
