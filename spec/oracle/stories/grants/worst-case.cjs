// The worst case. W: at_most £210 money, can_lose none, meter N0, pays true. Maria's till grant, refs.what 40 loaves, selling range floor £3: can_lose 40 loaves; floor £3. With the AI's own key as meter: meter: own.
const L = require('./lib.cjs'); const { fb, World, P, T, check, done, baseWorld, A, GBP, per, promise, grant, kindOf, instance } = L;
const W = baseWorld(); const { w, G, n0 } = W;
const wc = fb.door('worst_case', G, w.blocks);
check('worst case', 'W: at_most, can_lose, meter, pays', [wc.at_most, wc.can_lose, wc.meter, wc.pays], [[GBP(210)], [], n0.id, true]);
const own = baseWorld({ meter: 'own' }), wo = fb.door('worst_case', own.G, own.w.blocks);
check('worst case', 'with the AI\'s own key as meter', wo.meter, 'own');
check('worst case', 'the promise she pays on: £21 per sack for 10 sacks, side to', wc.on.map(s => [s.side, s.price, s.quantity]), [['to', { max: per(21, 'GBP', 'sack') }, A('10', 'sack')]]);
{
  const w2 = new World(); const maria = P(w2, 'maria'), till = P(w2, 'till'), leila = P(w2, 'leila');
  const loaf = kindOf(maria, 'loaf'), li = instance(maria, loaf, { pack: A('40', 'loaf') });
  const ML = T(promise(maria, { from: maria.id }, { lines: [{ id: 'loaves', what: li.hash, quantity: A('40', 'loaf'), price: { min: per(3, 'GBP', 'loaf') } }] }), 'ML');
  const GT = T(grant(maria, till, { types: ['promise', 'transfer'], on: [ML.hash], parties: [leila.id] }, { meter: till.id, what: li.hash }), 'GT');
  const m = fb.door('worst_case', GT, w2.blocks);
  check('worst case', 'Maria\'s till: can_lose 40 loaves; floor £3', [m.can_lose, m.on.map(s => s.price.min)], [[A('40', 'loaf')], [per(3, 'GBP', 'loaf')]]);
  // the part and a sell from that instance count once, at the largest
  check('worst case', 'Maria\'s till: part 40 loaves and a 40-loaf sell from it: at_most 40 loaves', m.at_most, [A('40', 'loaf')]);
  const M60 = T(promise(maria, { from: maria.id }, { lines: [{ id: 'loaves', what: li.hash, quantity: A('60', 'loaf'), price: { min: per(3, 'GBP', 'loaf') } }] }), 'M60');
  const G60 = T(grant(maria, till, { types: ['promise', 'transfer'], on: [M60.hash], parties: [leila.id] }, { meter: till.id, what: li.hash }), 'G60');
  check('worst case', 'Maria\'s till: part 40 loaves and a 60-loaf sell from it: at_most 60 loaves', fb.door('worst_case', G60, w2.blocks).at_most, [A('60', 'loaf')]);
}
done();
