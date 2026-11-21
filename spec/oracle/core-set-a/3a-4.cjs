const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, codes, sha, mkKey, day } = L;
// 3a-4 A hole only at or below its place. World: Mama M0; card A (her genesis key) writes a key grant K1: voices card B by hash, card A, a SIM key in suite `slh`
// (a suite Sam's reader does not know); the SIM key signs M3 (tomatoes T1 to Leila); card A signs M4 (maize Z1 to Sam). Sam's reader holds all of it.
{
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila'), sam = P(w, 'sam');
  const cardB = mkKey('mama-card-b'), sim = mkKey('mama-sim');
  const slh = 'ab'.repeat(40); // a key in a suite nobody here knows (a hidden suite's spelling)
  const K = kindOf(mama, 'crop'), T1 = T(instance(mama, K, { pack: A('2', 'kg') }), 'T1'), Z1 = T(instance(mama, K, { pack: A('1', 'kg') }), 'Z1');
  const k1 = mama.write('grant', { kind: 'key', voices: [{ key_hash: fb.door('key_hash', cardB.pub) }, { key: mama.key.pub }, { key: slh, suite: 'slh', wait: 'PT0S' }] }, { subject: mama.id, updates: mama.id });
  // M3 by the SIM key: a block of an unknown suite, held as bytes this reader cannot judge; we make its bytes with a signature that cannot be checked
  const m3 = { type: 'transfer', state: { at: day(5), audience: 'public', seq: 5, amount: A('2', 'kg') }, refs: { author: mama.id, prev: k1.hash, key: k1.hash, what: T1.hash, to_owner: leila.id } };
  m3.hash = sha('M3'); m3.signature = '00'.repeat(64); T(m3, 'M3');
  const dZ = L.deal(mama, Z1, sam, A('1', 'kg'));
  const m4 = T(L.sell(mama, Z1, sam, dZ, A('1', 'kg')), 'M4');
  const held = [...w.blocks, m3];
  check('3a-4', 'M3 is waiting for this reader (unknown suite or unmet)', fb.door('accept', [m3], w.blocks, { takes_pairs: false }).unjudged.length + fb.door('accept', [m3], w.blocks, { takes_pairs: false }).refused.length >= 1, true);
  check('3a-4', 'ownership(Z1): Sam (card A is above the SIM place)', ownersOf(fb.door('ownership', Z1, held)).owners, [['sam', '1']]);
  const r = fb.door('ownership', T1, held);
  check('3a-4', 'ownership(T1): not shown, lacks [M3] or the answer today', JSON.stringify(ownersOf(r)), JSON.stringify({ not_shown: true, lacks: ['M3'] }));
}
done();
