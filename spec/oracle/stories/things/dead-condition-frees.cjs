const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, day } = L;
// A dead condition frees. World A: (1) Maria M0, wheat W; M1 W to Leila, `without` the counter's signal that the price came by T, clock: the counter C. (2) C1 signals the price came before T.
// Expect W freed, Maria's. World B: Harry H1, a bonus sack to Leila on a bare `reading` "silo dry for an hour": freed from signing; never held.
const T0 = day(5, 12);
{
  const w = new World(), maria = P(w, 'maria'), leila = P(w, 'leila'), c = P(w, 'counter');
  const K = kindOf(maria, 'wheat'), W = T(instance(maria, K, { pack: A('1', 'sack') }), 'W');
  const cond = { without: { signal: 'price_came', by: { names: [c.id] }, subject: W.hash }, deadline: T0, clocks: { names: [c.id], needed: 1 } };
  const m1 = T(maria.write('transfer', { condition: cond }, { what: W.hash, to_owner: leila.id }), 'M1');
  leila.write('transfer', { status: 'accepted' }, { answers: m1.hash });
  const before = drawsOf(own(w, W)).filter(x => x[0] === 'M1').map(x => x.slice(1));
  const c1 = c.write('observe', { kind: 'price_came' }, { subject: W.hash });
  const rc = c.write('observe', { kind: 'receipt' }, { derives_from: [c1.hash] });
  c.write('observe', { kind: 'cutoff', when: T0 }, { subject: m1.hash, derives_from: [rc.hash] }, { at: T0 });
  const r = own(w, W);
  check('dead condition frees', 'A: before the signal: M1 held', before, [[true, null, 'held']]);
  check('dead condition frees', 'A: the clock holds the signal before the cutoff: M1 freed, W Maria\'s', [drawsOf(r).filter(x => x[0] === 'M1').map(x => x.slice(1)), ownersOf(r)], [[[true, null, 'freed']], { owners: [['maria', '1']] }]);
}
{
  const w = new World(), harry = P(w, 'harry'), leila = P(w, 'leila');
  const K = kindOf(harry, 'sack'), Q = T(instance(harry, K, { pack: A('1', 'sack') }), 'Q');
  const h1 = T(harry.write('transfer', { condition: { reading: 'silo', kind: 'dry', op: 'ge', value: A('60', 'min'), over: 'PT1H' } }, { what: Q.hash, to_owner: leila.id }), 'H1');
  leila.write('transfer', { status: 'accepted' }, { answers: h1.hash });
  const r = own(w, Q);
  check('dead condition frees', 'B: a bare reading can never be shown: freed from signing, never held', [drawsOf(r).filter(x => x[0] === 'H1').map(x => x.slice(1)), ownersOf(r)], [[[true, null, 'freed']], { owners: [['harry', '1']] }]);
}
done();
