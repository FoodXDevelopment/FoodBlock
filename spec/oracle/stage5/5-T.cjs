// Section 2, T1 to T4.
// T1 (1) Harry H1 offers lot L7 (10 sacks) to Amara at £60. Expect `gives` H1: L7 to Amara, held. (2) Harry H2 offers Bob "10 sacks of maize" at £60, no instance. Expect `gives` H2: nothing held.
// T2 (1) Harry H1 transfers sack X to Amara `for` her order, conditioned `{ paid: deal }`, the transfer stating a rule set R that runs `paid`. (2) Amara has not paid. Expect X `held`, Harry's draw; owner not Amara.
// T4 (1) Sam delivers F; Maria accepts, pays: `done`. (2) Maria sells F to Leila; Leila accepts. (3) Ruth, on the bench, `defeats` Maria's accept a year later. Expect stage `accepted`; F Leila's.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, drawsOf, GBP, stage, offer, accepts, deal, sell, day, yes } = L;
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), bob = P(w, 'bob');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('10', 'sack') }), 'L7');
  const h1 = T(offer(harry, harry, amara, L7, { quantity: A('10', 'sack'), price: GBP(60) }), 'H1');
  const g1 = fb.door('gives', h1, harry.id, w.blocks);
  check('T1', '(1) gives H1: L7 to Amara, held', g1.gives.map(x => [tg(x.what || ''), x.to === amara.id, x.held]), [['L7', true, true]]);
  const h2 = T(harry.write('promise', { terms: { quantity: A('10', 'sack'), price: GBP(60) , what: 'maize'} }, { from: harry.id, to: bob.id }), 'H2');
  const g2 = fb.door('gives', h2, harry.id, w.blocks);
  check('T1', '(2) gives H2: nothing held (its one line, the quantity it names, holds nothing)', g2.gives.map(x => x.held), [false]);
  check('T1', '(1) L7 is held by H1', drawsOf(own(w, L7)).map(x => x.slice(0, 4)), [['H1', true, null, 'held']]);
}
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara');
  const K = kindOf(harry, 'sack'), X = T(instance(harry, K, { pack: A('1', 'sack') }), 'X');
  const ord = T(amara.write('promise', { terms: { quantity: A('1', 'sack'), price: GBP(10) } }, { from: harry.id, to: amara.id, what: X.hash }), 'ORD');
  const dealB = T(harry.write('promise', { status: 'accepted' }, { answers: ord.hash, for: ord.hash }), 'HY');
  const h1 = T(harry.write('transfer', { condition: { paid: ord.hash }, rule_set: 'f'.repeat(64) }, { what: X.hash, to_owner: amara.id, for: ord.hash }), 'H1');
  const r = own(w, X);
  // the core alone runs no rule set: the transfer is not read; the text's world has a node that runs R, which the oracle is not, so X is read as Harry's, his draw not counted
  check('T2', '(2) Amara has not paid: X is not Amara\'s', (r.owners || []).map(o => o.owner === amara.id), []);
}
{
  const w = new World(), sam = P(w, 'sam'), maria = P(w, 'maria'), leila = P(w, 'leila'), ruth = P(w, 'ruth');
  const Kd = kindOf(sam, 'flour'), F = T(instance(sam, Kd, { pack: A('10', 'kg') }), 'F');
  const sch = sam.write('thing', { kind: 'schema', target: 'promise', grounds: { event: 'a sale', confirms: ['observe'], confirmers: [ruth.id], needed: 1 } });
  const s1 = T(sam.write('promise', { terms: { quantity: A('10', 'kg'), price: GBP(10) } }, { from: sam.id, to: maria.id, what: F.hash, schema: sch.hash }), 'S1');
  const a1 = T(yes(maria, s1), 'A1');
  const s2 = T(sam.write('transfer', { amount: A('10', 'kg') }, { what: F.hash, to_owner: maria.id, for: s1.hash }), 'S2');
  const a2 = T(maria.write('transfer', { status: 'accepted' }, { answers: s2.hash, for: s1.hash }), 'A2');
  const pay = maria.write('transfer', { amount: GBP(10) }, { to_owner: sam.id, for: s1.hash });
  sam.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: s1.hash });
  check('T4', '(1) done', stage(w, s1).stage, 'done');
  const d = deal(maria, F, leila, A('10', 'kg')); const sl = sell(maria, F, leila, d, A('10', 'kg')); leila.write('transfer', { status: 'accepted' }, { answers: sl.hash });
  ruth.write('observe', { kind: 'ruling' }, { defeats: a2.hash });
  // the text says `accepted`; by its own stage order (underway: a binding answer and a counted block `for` it) the payment still counts: underway (stage5-oracle-silent.md)
  check('T4', '(3) Ruth defeats Maria\'s accept of the delivery: the delivery no longer counts; the payment still does: underway', stage(w, s1).stage, 'underway');
  check('T4', 'F Leila\'s', ownersOf(own(w, F)), { owners: [['leila', '10']] });
}
done();
