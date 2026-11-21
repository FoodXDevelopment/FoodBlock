const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey, sha, cj, signRaw } = L;
const std = (w, b) => { const r = fb.door('stands', b, w.blocks); return [r.stands, r.waiting.map(x => x.on)]; };
// 3d-17 A genesis may state her list. World: (1) Harry H0, `state.voices: [{ key_hash: card }, { key: phone }]`, signed by the phone key. (2) Years on a forger with the phone key signs F1 at seq 1, a key grant moving the phone place to his own key of another suite.
// Expect F1 no suite move (3d-12) and Harry's card still first in his list from his id.
const sm = fb.door('keypair', '6b'.repeat(32), 'sm');
{
  const card = mkKey('harry-card'), phone = mkKey('harry-phone');
  const w = new World();
  const gen = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', public_key_sign: phone.pub, voices: [{ key_hash: fb.door('key_hash', card.pub) }, { key: phone.pub }] }, refs: {} };
  const hash = sha(cj(gen));
  const H0 = { hash, ...gen, signature: signRaw(phone, cj(gen)) };
  w.add(H0);
  const harry = new L.Signer(w, hash, phone, undefined, hash);
  check('3d-17', 'H0 is a genesis: valid and read', [fb.door('valid', H0, []).length, fb.door('read', H0, []).length], [0, 0]);
  const list = () => fb.door('identity_state', hash, w.blocks).voices.map(v => v.key_hash ? 'hash' : v.key.slice(-6));
  check('3d-17', 'identity_state reads her list from the genesis: [card by hash, phone]', list(), ['hash', phone.pub.slice(-6)]);
  const F1 = T(harry.write('grant', { kind: 'key', voices: [{ key_hash: fb.door('key_hash', card.pub) }, { key: sm.public_key_sign, suite: 'sm' }] }, { subject: hash, updates: hash }), 'F1');
  check('3d-17', 'F1 (the phone moving its own place to another suite) is no suite move: it never stands', std(w, F1), [false, []]);
  check('3d-17', 'Harry\'s card is still first in his list, from his id', list(), ['hash', phone.pub.slice(-6)]);
  // a genesis whose key is no voice of its own list is no genesis
  const bad = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', public_key_sign: phone.pub, voices: [{ key_hash: fb.door('key_hash', card.pub) }] }, refs: {} };
  const bh = sha(cj(bad));
  check('3d-17', 'a genesis whose key is no voice of its own list: shape', fb.door('read', { hash: bh, ...bad, signature: signRaw(phone, cj(bad)) }, []).map(x => x.code), ['shape']);
}
{
  // A genesis states its own voice's reach in `state.reach` (identity.md): a word of hers that moves anything of hers stands once her clocks
  // have held it that long. With no reach, nothing holds her moves (nothing fills her silence: she asked for no delay). (end pass 2026-11-20)
  const k = mkKey('mama-genesis-key');
  const w = new World(), node = P(w, 'node'), leila = P(w, 'leila');
  const gen = (reach) => ({ type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', public_key_sign: k.pub, ...(reach ? { reach, clocks: { names: [node.id], needed: 1 } } : {}) }, refs: {} });
  const mk = (g) => { const hash = sha(cj(g)); const b = { hash, ...g, signature: signRaw(k, cj(g)) }; w.add(b); return { b, s: new L.Signer(w, hash, k, undefined, hash) }; };
  const R = mk(gen('P2D'));
  check('3d-17', 'a genesis that states reach P2D and its clock: valid and read', [fb.door('valid', R.b, w.blocks).length, fb.door('read', R.b, w.blocks).length], [0, 0]);
  const t1 = T(R.s.write('transfer', { amount: A('5', 'GBP') }, { to_owner: leila.id }), 'reach-t1');
  check('3d-17', 'her transfer waits on her reach until her clock has held it two days', std(w, t1), [false, ['reach']]);
  const rc = node.write('observe', { kind: 'receipt' }, { derives_from: [t1.hash] });
  node.write('observe', { kind: 'cutoff', when: 'P2D' }, { subject: t1.hash, derives_from: [rc.hash] }, { at: day(3) });
  check('3d-17', 'once her clock\'s cutoff closes the two days, it stands', std(w, t1), [true, []]);
  // the same woman's other self with no reach: nothing holds her move
  const k2 = mkKey('mama-no-reach');
  const g2 = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', public_key_sign: k2.pub }, refs: {} };
  const h2 = sha(cj(g2)); w.add({ hash: h2, ...g2, signature: signRaw(k2, cj(g2)) });
  const s2 = new L.Signer(w, h2, k2, undefined, h2);
  const t2 = T(s2.write('transfer', { amount: A('5', 'GBP') }, { to_owner: leila.id }), 'noreach-t2');
  check('3d-17', 'a genesis that states no reach: her transfer stands when signed (no hold)', std(w, t2), [true, []]);
}
done();
