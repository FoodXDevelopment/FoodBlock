const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, offer, accepts, day } = L;
// 3c-2 An offer's hold follows its accept. World: (1) Harry H0, H1 L7; H2 offers L7 to Amara, `expires` Thursday. (2) Amara A1 accepts, `at` Friday.
// Expect promise_stage `offered`; ownership(L7) Harry's, H2 `held` (it waits for Harry's next word). (3) Harry H3 declines A1: H2 freed. Today `offered` with owner Amara on both (late.cjs).
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('10', 'sack') }), 'L7');
  const THU = day(3), FRI = day(4);
  const h2 = T(offer(harry, harry, amara, L7, { quantity: A('10', 'sack'), price: A('1', 'GBP'), expires: THU }), 'H2');
  const a1 = amara.write('promise', { status: 'accepted' }, { answers: h2.hash, for: h2.hash }, { at: FRI });
  const stage = () => fb.door('promise_stage', h2, w.blocks, {}).stage;
  const r = own(w, L7);
  check('3c-2', 'promise_stage: offered', stage(), 'offered');
  check('3c-2', 'ownership: H2 held; nothing is Amara\'s', [drawsOf(r).filter(x => x[0] === 'H2').map(x => x.slice(1)), ownersOf(r), r.held.value], [[[true, null, 'held']], { owners: [] }, '10']);
  const h3 = T(harry.write('promise', { status: 'declined' }, { answers: a1.hash, for: h2.hash }), 'H3');
  const r2 = own(w, L7);
  check('3c-2', 'after Harry declines A1: H2 freed, L7 Harry\'s', [drawsOf(r2).filter(x => x[0] === 'H2').map(x => x.slice(1)), ownersOf(r2)], [[[true, null, 'freed']], { owners: [['harry', '10']] }]);
  check('3c-2', 'promise_stage still offered', stage(), 'offered');
}
// the other half: an accept in time (before Thursday) binds, and the stage and the ownership agree
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('10', 'sack') }), 'L7');
  const h2 = T(offer(harry, harry, amara, L7, { quantity: A('10', 'sack'), price: A('1', 'GBP'), expires: day(3) }), 'H2');
  amara.write('promise', { status: 'accepted' }, { answers: h2.hash, for: h2.hash }, { at: day(2) });
  check('3c-2', 'accept in time: the stage binds (accepted) and H2 is still held until it is performed', [fb.door('promise_stage', h2, w.blocks, {}).stage, drawsOf(own(w, L7)).filter(x => x[0] === 'H2').map(x => x.slice(1))], ['accepted', [[true, null, 'held']]]);
}
done();
