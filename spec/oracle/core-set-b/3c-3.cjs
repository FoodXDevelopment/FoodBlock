const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, offer, accepts, day, mkKey } = L;
// 3c-3 The receiver's door (Rule A). World: (1) Joe J0, box X. (2) Joe J1: X to Amara, on the condition that he is late (without his arrival, clocks Wanjiru and Leila, needed 2).
// (3) Amara A1 accepts. (4) Joe arrives; Amara A2 declines J1. Expect X freed, Joe's. Today held for ever on the core.
{
  const w = new World(), joe = P(w, 'joe'), amara = P(w, 'amara'), wanjiru = P(w, 'wanjiru'), leila = P(w, 'leila');
  const K = kindOf(joe, 'box'), X = T(instance(joe, K, {}), 'X');
  const clocks = { names: [wanjiru.id, leila.id].sort(), needed: 2 };
  const cond = { without: { signal: 'arrived', by: [joe.id], subject: X.hash }, deadline: day(10, 7), clocks };
  const j1 = T(joe.write('transfer', { condition: cond }, { what: X.hash, to_owner: amara.id }), 'J1');
  const a1 = amara.write('transfer', { status: 'accepted' }, { answers: j1.hash });
  const arr = joe.write('observe', { kind: 'arrived' }, { subject: X.hash });
  const before = drawsOf(own(w, X)).filter(x => x[0] === 'J1').map(x => x.slice(1));
  const a2 = amara.write('transfer', { status: 'declined' }, { answers: j1.hash });
  const r = own(w, X);
  check('3c-3', 'before her no: J1 held (the condition has not held)', before, [[true, null, 'held']]);
  check('3c-3', 'after her no (her yes in its past): J1 freed', drawsOf(r).filter(x => x[0] === 'J1').map(x => x.slice(1)), [[true, null, 'freed']]);
  check('3c-3', 'X is Joe\'s', ownersOf(r), { owners: [['joe', null]] });
}
done();
