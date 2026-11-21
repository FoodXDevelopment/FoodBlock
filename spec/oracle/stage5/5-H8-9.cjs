// R-H8 A promise not to do, and its stake. (1) Ben B1 promises Leila's café: no work for a rival café until 30 June. (2) Leila accepts. (3) Ben B2 transfers envelope E (£500) `for` B1, conditioned `{ ruled: B1, by: Jo, awards: Leila }`; Leila accepts.
// (4) Ben B3 stops B1 onward on day 2. (5) Jo J1, 10 July, rules: awards E to Leila. Expect E lands with Leila. World B: Jo never rules. Expect E `held`; Leila's decline of B2 frees it (R-H3).
// R-H9 `ruled`, and its end. (1) As R-H8 to (3). (2) Jo J1 awards E to Leila. (3) Leila L5 hands E to Sam, J1 in L5's past. (4) Jo J2, having seen J1, awards nothing. Expect E Sam's (J1 used).
// World B: J2 before any block uses J1. Expect E `held`. World C: B2's condition `within` 31 August on Wanjiru's clock W; W's cutoff through 31 August with no ruling. Expect E freed, Ben's.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, drawsOf, GBP, stage, day, yes, no, stop } = L;
const dr = (r, ...tags) => drawsOf(r).filter(x => tags.includes(x[0])).map(x => x.slice(0, 4));
function world(o = {}) {
  const w = new World(), ben = P(w, 'ben'), leila = P(w, 'leila'), jo = P(w, 'jo'), sam = P(w, 'sam'), wan = P(w, 'wanjiru');
  const K = kindOf(ben, 'envelope'), E = T(instance(ben, K, { pack: GBP(500) }), 'E');
  const b1 = T(ben.write('promise', { what: 'no work for a rival cafe', terms: { until: day(240) } }, { from: ben.id, to: leila.id }), 'B1');
  yes(leila, b1);
  const cond0 = { ruled: b1.hash, by: jo.id, awards: leila.id };
  const cond = o.within ? { within: cond0, deadline: day(300), clocks: { names: [wan.id], needed: 1 } } : cond0;
  const b2 = T(ben.write('transfer', { condition: cond }, { what: E.hash, to_owner: leila.id, for: b1.hash }), 'B2');
  const ly = T(leila.write('transfer', { status: 'accepted' }, { answers: b2.hash, for: b1.hash }), 'LY');
  if (o.stop !== false) stop(ben, b1);
  return { w, ben, leila, jo, sam, wan, E, b1, b2 };
}
const ruling = (jo, b1, awards, o = {}) => jo.write('observe', { kind: 'ruling', awards }, { subject: b1.hash, ...(o.after ? { after: o.after } : {}) });
{
  const X = world();
  check('R-H8', '(4) before any ruling E is held', dr(own(X.w, X.E), 'B2'), [['B2', true, null, 'held']]);
  const J1 = T(ruling(X.jo, X.b1, [{ to: X.leila.id, amount: GBP(500) }]), 'J1');
  check('R-H8', '(5) Jo rules for Leila: E lands with Leila (whatever stop came before)', [dr(own(X.w, X.E), 'B2'), ownersOf(own(X.w, X.E))], [[['B2', true, null, 'landed']], { owners: [['leila', '500']] }]);
}
{
  const X = world();
  check('R-H8', 'B: Jo never rules: E held', dr(own(X.w, X.E), 'B2'), [['B2', true, null, 'held']]);
  X.leila.write('transfer', { status: 'declined' }, { answers: X.b2.hash, for: X.b1.hash });
  check('R-H8', 'B: Leila\'s decline of B2 frees E, Ben\'s', [dr(own(X.w, X.E), 'B2'), ownersOf(own(X.w, X.E))], [[['B2', true, null, 'freed']], { owners: [['ben', '500']] }]);
}
{
  const X = world();
  const J1 = T(ruling(X.jo, X.b1, [{ to: X.leila.id, amount: GBP(500) }]), 'J1');
  const L5 = T(X.leila.write('transfer', { amount: GBP(500) }, { what: X.E.hash, to_owner: X.sam.id, after: J1.hash }), 'L5');
  X.sam.write('transfer', { status: 'accepted' }, { answers: L5.hash });
  ruling(X.jo, X.b1, [], { after: J1.hash });
  check('R-H9', 'A: J2 awards nothing but L5 used J1: E Sam\'s', ownersOf(own(X.w, X.E)), { owners: [['sam', '500']] });
}
{
  const X = world();
  const J1 = ruling(X.jo, X.b1, [{ to: X.leila.id, amount: GBP(500) }]);
  ruling(X.jo, X.b1, [], { after: J1.hash });
  check('R-H9', 'B: J2 before any block uses J1: E held (the head awards nothing)', dr(own(X.w, X.E), 'B2'), [['B2', true, null, 'held']]);
}
{
  const X = world({ within: true });
  const rcpt = X.wan.write('observe', { kind: 'receipt' }, { derives_from: [X.b1.hash] });
  X.wan.write('observe', { kind: 'cutoff', when: day(300) }, { subject: X.b2.hash, derives_from: [rcpt.hash] }, { at: day(300) });
  check('R-H9', 'C: the clock closes 31 August with no ruling: E freed, Ben\'s', [dr(own(X.w, X.E), 'B2'), ownersOf(own(X.w, X.E))], [[['B2', true, null, 'freed']], { owners: [['ben', '500']] }]);
}
done();
