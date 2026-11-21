const L = require('./lib.cjs'); const { fb, World, P, check, done, codes, sha, mkKey, signRaw, cj } = L;
const crypto = require('crypto');
// 3a-10 key, reply and message spellings. World: Amara's genesis A0 with her p256 key spelled 06...: refused.
{
  const k = fb.door('keypair', '11'.repeat(32), 'p256');
  const spelled06 = k.public_key_sign.slice(0, k.public_key_sign.length - 130) + '06' + k.public_key_sign.slice(-128);
  const mkGen = key => { const b = { type: 'actor', state: { kind: 'person', at: '2026-11-11T00:00:00.000Z', audience: 'public', public_key_sign: key, suite: 'p256' }, refs: {} }; return b; };
  const good = mkGen(k.public_key_sign); good.signature = fb.door('sign', good, k.private_key, 'p256'); good.hash = fb.door('hash', good.type, good.state, good.refs, 'p256');
  check('3a-10', 'a genesis with a p256 key spelled 04...: valid', codes(fb.door('valid', good, [])), []);
  const bad = mkGen(spelled06); bad.signature = good.signature; bad.hash = fb.door('hash', bad.type, bad.state, bad.refs, 'p256');
  check('3a-10', 'a genesis with the key spelled 06...: refused', codes(fb.door('valid', bad, [])).length > 0, true);
  const bad7 = mkGen(spelled06.replace('06', '07'));  bad7.signature = good.signature; bad7.hash = fb.door('hash', bad7.type, bad7.state, bad7.refs, 'p256');
  check('3a-10', 'spelled 07...: refused', codes(fb.door('valid', bad7, [])).length > 0, true);
  check('3a-10', 'suite_of_key of a 06 spelling: no suite', fb.door('suite_of_key', spelled06), null);
}
// the short reply: only from its exact spelling
{
  const w = new World(), mama = P(w, 'mama'), harry = P(w, 'harry');
  const o = harry.write('promise', { terms: { quantity: { value: '1', unit: 'loaf' } } }, { from: harry.id, to: mama.id });
  const a = mama.write('observe', { status: 'declined' }, { answers: o.hash, for: o.hash });
  const txt = fb.door('short_reply', a);
  check('3a-10', 'her reply opens from its exact spelling', !!fb.door('short_reply_open', txt, mama.id, w.blocks.filter(b => b !== a)), true);
  const body = txt.slice(4);
  check('3a-10', 'one = of padding opens nothing', fb.door('short_reply_open', txt + '=', mama.id, w.blocks.filter(b => b !== a)), null);
  check('3a-10', 'a space in it opens nothing', fb.door('short_reply_open', txt.slice(0, 20) + ' ' + txt.slice(20), mama.id, w.blocks.filter(b => b !== a)), null);
  check('3a-10', 'a + for - opens nothing (strict base64url)', fb.door('short_reply_open', txt.replace(/-/, '+'), mama.id, w.blocks.filter(b => b !== a)) === null || !/-/.test(txt), true);
}
// verify_message
{
  const w = new World(), p = P(w, 'ann'); const k = fb.door('keypair', '22'.repeat(32), 'std');
  const req = fb.door('verify_message', { header: { author: 'a', seq: 1, prev: 'b', hash: 'c' }, signature: 'zz' }, k.public_key_sign);
  check('3a-10', 'verify_message of a header: false', req, false);
  check('3a-10', 'verify_message of a genesis: false', fb.door('verify_message', w.blocks[0], w.blocks[0].state.public_key_sign), false);
  check('3a-10', 'verify_message with a key spelled no suite\'s way: false', fb.door('verify_message', { signer: 'x', node: 'y', counter: 1, signature: '00' }, '06' + 'ab'.repeat(40)), false);
}
// 3a-11 pad in a sealed plaintext. World: Amara seals her order A1 to Maria twice, once plain and once with pad to 1024 bytes: both open to A1, same id.
{
  const w = new World(), amara = P(w, 'amara'), maria = P(w, 'maria');
  const a1 = amara.write('promise', { terms: { quantity: { value: '1', unit: 'loaf' } } }, { from: amara.id, to: maria.id });
  const block = { type: a1.type, state: a1.state, refs: a1.refs };
  const priv = '55'.repeat(32), pubE = fb.encPublicOf(priv, 'std');
  const opened = plain => { const env = fb.door('seal', plain, [pubE], 'std', { vectorsOnly: true }); const msg = { header: fb.door('header', a1), header_signature: a1.signature, envelope: env }; try { const r = fb.door('open_copy', msg, priv); return r.hash; } catch (e) { return 'ERR ' + e.message.slice(0, 60); } };
  check('3a-11', 'sealed plain: opens to A1', opened({ block, reveals: [] }), a1.hash);
  check('3a-11', 'sealed with pad to 1024 bytes: opens to A1, same id', opened({ block, reveals: [], pad: ' '.repeat(1024 - JSON.stringify({ block, reveals: [], pad: '' }).length) }), a1.hash);
}
done();
