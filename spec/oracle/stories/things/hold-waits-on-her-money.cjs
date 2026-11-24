const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, offer, accepts, day } = L;
// A hold that waits on her money. World A: (1) Harry H0, H1 L7; H2 quote of L7 to Bob, waits_on: price, 60 GBP. (2) Bob B1 accepts. (3) Harry H3 ends H2. Expect L7 freed, Harry's.
// World B: as A, with (2b) Bob B2 pays 20 and Harry H2b accepts it before H3: L7 stays held for Bob.
function world(paid) {
  const w = new World(), harry = P(w, 'harry'), bob = P(w, 'bob');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('1', 'sack') }), 'L7');
  const h2 = T(offer(harry, harry, bob, L7, { quantity: A('1', 'sack'), price: A('60', 'GBP'), waits_on: 'price' }), 'H2');
  const b1 = bob.write('promise', { status: 'accepted' }, { answers: h2.hash, for: h2.hash });
  if (paid) { const b2 = bob.write('transfer', { amount: A('20', 'GBP') }, { to_owner: harry.id, for: h2.hash }); harry.write('transfer', { status: 'accepted' }, { answers: b2.hash }); }
  const h3 = T(harry.write('promise', { status: 'stopped', stop: 'onward' }, { updates: h2.hash }), 'H3');
  return { w, L7 };
}
{
  const { w, L7 } = world(false), r = own(w, L7);
  check('hold waits on her money', 'A: H2 freed, L7 Harry\'s', [drawsOf(r).filter(x => x[0] === 'H2').map(x => x.slice(1)), ownersOf(r)], [[[true, null, 'freed']], { owners: [['harry', '1']] }]);
}
{
  const { w, L7 } = world(true), r = own(w, L7);
  check('hold waits on her money', 'B: with a payment accepted before the end, H2 stays held for Bob', [drawsOf(r).filter(x => x[0] === 'H2').map(x => x.slice(1)), ownersOf(r)], [[[true, null, 'held']], { owners: [] }]);
}
done();
