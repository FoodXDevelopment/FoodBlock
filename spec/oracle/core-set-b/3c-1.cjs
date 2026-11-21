const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, offer, accepts, day } = L;
// 3c-1 Where a hold starts. World: (1) Harry H0, H1 L7 10 sacks. (2) Harry H2: offer of L7 to Amara. (3) Bob B1 orders L7; Harry H3 L7 to Bob.
// Expect H2 held; H3 past.
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), bob = P(w, 'bob');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('10', 'sack') }), 'L7');
  const h2 = T(offer(harry, harry, amara, L7, { quantity: A('10', 'sack'), price: A('1', 'GBP') }), 'H2');
  const o = T(offer(bob, harry, bob, L7, { quantity: A('10', 'sack'), price: A('1', 'GBP') }), 'B1'); // Bob's order: it names Harry's lot, and holds nothing (it is not Bob's)
  const y = T(accepts(harry, o), 'H-yes'); // Harry's yes to the order binds the deal and holds nothing (3c-1 as decided in building: the hold starts at his own word that names L7 and Bob, his offer or his transfer)
  const h3 = T(harry.write('transfer', { amount: A('10', 'sack') }, { what: L7.hash, to_owner: bob.id, for: o.hash, after: [y.hash] }), 'H3');
  const r = own(w, L7);
  check('3c-1', 'H2 (the offer) holds; H3 is past; the yes to Bob\'s order is no draw', drawsOf(r).filter(x => ['H2', 'H3', 'H-yes'].includes(x[0])).sort().map(x => x.slice(0, 4)), [['H2', true, null, 'held'], ['H3', false, 'past', null]]);
  // the ownership shape is unchanged: an amount a draw holds is listed in `held`, not in `owners` (1.8, folds.md); nobody but Harry is named, and no one else owns any of it
  check('3c-1', 'the 10 sacks are held (H2), none is Amara\'s or Bob\'s', [ownersOf(r), r.held.value], [{ owners: [] }, '10']);
}
done();
