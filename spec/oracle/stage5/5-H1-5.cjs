// Section 3, R-H1 to R-H5 (holds and their release).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, drawsOf, GBP, stage, offer, accepts, day, reqs, yes, no, stop } = L;
const dr = (r, ...tags) => drawsOf(r).filter(x => tags.includes(x[0])).map(x => x.slice(0, 4));
// R-H1 (1) Harry H0, H1 L7 10 sacks. (2) Harry H2 offers L7 to Amara. (3) Bob B1 orders L7; Harry H3 transfers L7 to Bob. Expect H2 `held`; H3 `past`.
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), bob = P(w, 'bob');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('10', 'sack') }), 'L7');
  const h2 = T(offer(harry, harry, amara, L7, { quantity: A('10', 'sack'), price: GBP(60) }), 'H2');
  const o = T(offer(bob, harry, bob, L7, { quantity: A('10', 'sack'), price: GBP(60) }), 'B1');
  const y = accepts(harry, o);
  T(harry.write('transfer', { amount: A('10', 'sack') }, { what: L7.hash, to_owner: bob.id, for: o.hash, after: [y.hash] }), 'H3');
  check('R-H1', 'H2 held; H3 past', dr(own(w, L7), 'H2', 'H3'), [['H2', true, null, 'held'], ['H3', false, 'past', null]]);
}
// R-H1b a block that names only a kind or an amount holds nothing (the text's last sentence)
{
  const w = new World(), harry = P(w, 'harry'), bob = P(w, 'bob');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('10', 'sack') }), 'L7');
  harry.write('promise', { terms: { quantity: A('10', 'sack'), price: GBP(60) } }, { from: harry.id, to: bob.id, what: K.hash });
  check('R-H1', 'an offer that names only a kind holds none of L7', [own(w, L7).held.value, ownersOf(own(w, L7))], ['0', { owners: [['harry', '10']] }]);
}
// R-H2 (1) Harry H2 offers L7 to Amara, `expires` Thursday, no clock. (2) Amara A1 accepts, `at` Friday. Expect stage `offered`, `requests [{ A1, open: [when] }]`; L7 Harry's, H2 `held`. (3) Harry H3 declines A1. Expect H2 freed; no deal.
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('10', 'sack') }), 'L7');
  const THU = day(3), FRI = day(4);
  const h2 = T(offer(harry, harry, amara, L7, { quantity: A('10', 'sack'), price: GBP(60), expires: THU }), 'H2');
  const a1 = T(yes(amara, h2, { at: FRI }), 'A1');
  const st = L.stage(w, h2);
  check('R-H2', '(2) stage offered, one request A1 open on when', [st.stage, reqs(st, tg)], ['offered', [['A1', ['when']]]]);
  check('R-H2', '(2) H2 held, L7 not Amara\'s', [dr(own(w, L7), 'H2'), ownersOf(own(w, L7))], [[['H2', true, null, 'held']], { owners: [] }]);
  const h3 = T(no(harry, h2, { answers: a1 }), 'H3');
  const st3 = L.stage(w, h2);
  check('R-H2', '(3) H2 freed, no deal', [dr(own(w, L7), 'H2'), st3.stage === 'offered', st3.accept], [[['H2', true, null, 'freed']], true, null]);
}
// R-H3 (1) Joe J0, box X. (2) Joe J1: X to Amara, `without` his arrival by 07:00 20 Nov, `clocks` Wanjiru and Leila, `needed` 2. (3) Amara A1 accepts. (4) Joe J2 stops J1. Expect X `held`. (5) Amara A2 declines J1. Expect X freed, Joe's.
{
  const w = new World(), joe = P(w, 'joe'), amara = P(w, 'amara'), wanjiru = P(w, 'wanjiru'), leila = P(w, 'leila');
  const K = kindOf(joe, 'box'), X = T(instance(joe, K, {}), 'X');
  const cond = { without: { signal: 'arrived', by: [joe.id], subject: X.hash }, deadline: '2026-11-20T07:00:00.000Z', clocks: { names: [wanjiru.id, leila.id].sort(), needed: 2 } };
  const j1 = T(joe.write('transfer', { condition: cond }, { what: X.hash, to_owner: amara.id }), 'J1');
  T(amara.write('transfer', { status: 'accepted' }, { answers: j1.hash }), 'A1');
  joe.write('transfer', { status: 'stopped', stop: 'onward' }, { updates: j1.hash });
  check('R-H3', '(4) X held (his end, her yes in its past)', dr(own(w, X), 'J1'), [['J1', true, null, 'held']]);
  amara.write('transfer', { status: 'declined' }, { answers: j1.hash });
  check('R-H3', '(5) X freed, Joe\'s', [dr(own(w, X), 'J1'), ownersOf(own(w, X))], [[['J1', true, null, 'freed']], { owners: [['joe', null]] }]);
}
// R-H4 (1) Harry H2 quotes L7 to Bob, £60, `waits_on: price`. (2) Bob B1 accepts. (3) Harry H3 ends H2. Expect L7 freed, Harry's. World B: before (3), Bob B2 pays £20 and Harry H2b accepts it. Expect L7 `held` for Bob after H3.
function h4(paid) {
  const w = new World(), harry = P(w, 'harry'), bob = P(w, 'bob');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('1', 'sack') }), 'L7');
  const h2 = T(offer(harry, harry, bob, L7, { quantity: A('1', 'sack'), price: GBP(60), waits_on: 'price' }), 'H2');
  yes(bob, h2);
  if (paid) { const b2 = bob.write('transfer', { amount: GBP(20) }, { to_owner: harry.id, for: h2.hash }); harry.write('transfer', { status: 'accepted' }, { answers: b2.hash, for: h2.hash }); }
  stop(harry, h2);
  return { w, L7 };
}
{ const { w, L7 } = h4(false); check('R-H4', 'A: L7 freed, Harry\'s', [dr(own(w, L7), 'H2'), ownersOf(own(w, L7))], [[['H2', true, null, 'freed']], { owners: [['harry', '1']] }]); }
{ const { w, L7 } = h4(true); check('R-H4', 'B: L7 held for Bob', [dr(own(w, L7), 'H2'), ownersOf(own(w, L7))], [[['H2', true, null, 'held']], { owners: [] }]); }
// R-H5 (1) Harry H1: a bonus sack S to Leila on a bare `reading` "silo dry for an hour". Expect S never `held`; Harry's from H1.
{
  const w = new World(), harry = P(w, 'harry'), leila = P(w, 'leila');
  const K = kindOf(harry, 'sack'), S = T(instance(harry, K, { pack: A('1', 'sack') }), 'S');
  const h1 = T(harry.write('transfer', { condition: { reading: 'silo', kind: 'dry', op: 'ge', value: A('60', 'min'), over: 'PT1H' } }, { what: S.hash, to_owner: leila.id }), 'H1');
  leila.write('transfer', { status: 'accepted' }, { answers: h1.hash });
  check('R-H5', 'S freed from signing, never held; Harry\'s', [dr(own(w, S), 'H1'), ownersOf(own(w, S))], [[['H1', true, null, 'freed']], { owners: [['harry', '1']] }]);
}
// R-H3, the clock path (stage 5 compare): Harry's offer of L7 to Amara names a clock K (`needed` 1). Amara accepts; Harry stops the offer, not having seen her yes.
// World A: K receipts his stop, then her yes: the line that reads no holds the end with no yes before it: L7 freed, Harry's. World B: K receipts her yes first: held.
for (const [name, endFirst, want] of [['A', true, 'freed'], ['B', false, 'held']]) {
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), k = P(w, 'clock');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('10', 'sack') }), 'L7');
  const h2 = T(offer(harry, harry, amara, L7, { quantity: A('10', 'sack'), price: GBP(60), clocks: { names: [k.id], needed: 1 } }), 'H2');
  const a1 = yes(amara, h2);
  const s = stop(harry, h2, 'before');
  const order = endFirst ? [s, a1] : [a1, s];
  let prev = null;
  for (const b of order) prev = k.write('observe', { kind: 'receipt' }, { derives_from: [b.hash], ...(prev ? { after: [prev.hash] } : {}) });
  check('R-H3', 'clock path, world ' + name + ': ' + want, dr(own(w, L7), 'H2').map(x => x[3]), [want]);
}
done();
