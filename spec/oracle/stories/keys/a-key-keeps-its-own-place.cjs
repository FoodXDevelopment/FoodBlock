const L = require('../kit.cjs'); const { fb, World, P, T, check, done, mkKey, A } = L;
const GBP = v => A(String(v), 'GBP');
const std = (w, b) => { const r = fb.door('stands', b, w.blocks); return [r.stands, r.waiting.map(x => x.on)]; };
// A key keeps its own place as it was, bar the key in it (identity.md, A voice changes only what is below it). World: Harry H0, his card; K1, his list
// [card, phone P (wait PT0S, limit £50)]. (1) A thief with P signs F1: the list again, P's own place now `passes: true` and limit £50,000. Expect F1 is no
// key grant: it never stands, and P's place is as it was. (2) P lowers its own limit to £20 (F2): no key grant either; only a voice above changes a place.
// (3) P sets `passes` on the card above it (F3): no key grant. (4) Harry's card raises P's limit to £60 and sets `passes: true` (C1): it stands. (5) P puts a
// new key Q in its own place, keeping `passes` (F4): no key grant, since a new key starts with no `passes`; the same with `passes` left out (C2) stands.
const view = (w, id) => fb.door('identity_state', id, w.blocks).voices.map(v => [v.passes, v.limit ? v.limit.value : null]);
{
  const w = new World(), harry = P(w, 'harry'), pK = mkKey('harry-phone-own-place'), qK = mkKey('harry-phone-new');
  const K1 = harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: pK.pub, wait: 'PT0S', limit: GBP(50) }] }, { subject: harry.id, updates: harry.id });
  const phone = harry.asKey(pK, K1.hash);
  const F1 = T(phone.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: pK.pub, wait: 'PT0S', limit: GBP(50000), passes: true }] }, { subject: harry.id, updates: K1.hash }, ), 'F1');
  check('own place', 'F1 (the thief with P: passes: true, limit £50 to £50,000) is no key grant: it never stands', std(w, F1), [false, []]);
  check('own place', 'P\'s place is as it was: no passes, limit £50', view(w, harry.id), [[false, null], [false, '50']]);
}
{
  const w = new World(), harry = P(w, 'harry'), pK = mkKey('harry-phone-own-place');
  const K1 = harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: pK.pub, wait: 'PT0S', limit: GBP(50) }] }, { subject: harry.id, updates: harry.id });
  const phone = harry.asKey(pK, K1.hash);
  const F2 = T(phone.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: pK.pub, wait: 'PT0S', limit: GBP(20) }] }, { subject: harry.id, updates: K1.hash }), 'F2');
  check('own place', 'F2 (P lowers its own limit to £20) is no key grant: only a voice above changes a place', std(w, F2), [false, []]);
}
{
  const w = new World(), harry = P(w, 'harry'), pK = mkKey('harry-phone-own-place');
  const K1 = harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: pK.pub, wait: 'PT0S', limit: GBP(50) }] }, { subject: harry.id, updates: harry.id });
  const phone = harry.asKey(pK, K1.hash);
  const F3 = T(phone.write('grant', { kind: 'key', voices: [{ key: harry.key.pub, passes: true }, { key: pK.pub, wait: 'PT0S', limit: GBP(50) }] }, { subject: harry.id, updates: K1.hash }), 'F3');
  check('own place', 'F3 (P sets passes on the card above it) is no key grant', std(w, F3), [false, []]);
}
{
  const w = new World(), harry = P(w, 'harry'), pK = mkKey('harry-phone-own-place'), qK = mkKey('harry-phone-new');
  const K1 = harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: pK.pub, wait: 'PT0S', limit: GBP(50) }] }, { subject: harry.id, updates: harry.id });
  const C1 = T(harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: pK.pub, wait: 'PT0S', limit: GBP(60), passes: true }] }, { subject: harry.id, updates: K1.hash }), 'C1');
  check('own place', 'C1 (Harry\'s card, above P: limit £60, passes: true) stands', std(w, C1), [true, []]);
  check('own place', 'P\'s place now states passes and £60', view(w, harry.id), [[false, null], [true, '60']]);
  const phone = harry.asKey(pK, C1.hash);
  const F4 = T(phone.make('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: qK.pub, wait: 'PT0S', limit: GBP(60), passes: true }] }, { subject: harry.id, updates: C1.hash }), 'F4');
  const w4 = new World(); w4.blocks = [...w.blocks, F4];
  check('own place', 'F4 (P puts a new key Q in its own place, keeping passes) is no key grant: a new key starts with no passes', std(w4, F4), [false, []]);
  const C2 = T(phone.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: qK.pub, wait: 'PT0S', limit: GBP(60) }] }, { subject: harry.id, updates: C1.hash }), 'C2');
  check('own place', 'C2 (the same, passes left out) stands: Q is in P\'s place, limit £60, no passes', [std(w, C2), view(w, harry.id)], [[true, []], [[false, null], [false, '60']]]);
}
done();
