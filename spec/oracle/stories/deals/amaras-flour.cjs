// Amara's flour. (1) Sam S1 offers Amara 50 kg flour F at £60, `expires` Friday, `clocks` the market's clock K. (2) Amara A1 accepts Tuesday; K1 receipts A1 before its Friday cutoff: `accepted`.
// (3) Amara A2 pays £60 over PayLink; PayLink P1 `received` £60, naming Sam's account word and its place. (4) Sam S2 delivers F; Amara A3 accepts: `done`. (5) Amara sells 20 kg to Leila (a spot exchange).
// (6) PayLink P2 `defeats` P1. Expect: stage `done`; 20 kg Leila's, 30 kg Amara's; P2 ends P1 only for blocks that had not used it. Had Amara never truly paid, the record shows £60 to come to Sam.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, GBP, stage, am, deal, sell, day } = L;
function world(o = {}) {
  const w = new World(), sam = P(w, 'sam'), amara = P(w, 'amara'), K = P(w, 'market'), pay = P(w, 'paylink'), leila = P(w, 'leila');
  const Kd = kindOf(sam, 'flour'), F = T(instance(sam, Kd, { pack: A('50', 'kg') }), 'F');
  const clocks = { names: [K.id], needed: 1 };
  const FRI = day(5);
  // Sam's account word: PayLink's place
  const acct = sam.write('observe', { kind: 'account', destinations: [{ destination: 'paylink:sam', by: pay.id }] }, {});
  const s1 = T(sam.write('promise', { terms: L.linesFor(F, { quantity: A('50', 'kg'), price: GBP(60), expires: FRI, clocks, pay_by: day(6) }) }, { from: sam.id, to: amara.id }), 'S1');
  const a1 = T(amara.write('promise', { status: 'accepted' }, { answers: s1.hash, for: s1.hash }, { at: day(2) }), 'A1');
  const k1 = K.write('observe', { kind: 'receipt' }, { derives_from: [a1.hash] });
  K.write('observe', { kind: 'cutoff', when: FRI }, { subject: s1.hash, derives_from: [k1.hash] }, { at: FRI });
  const a2 = T(amara.write('transfer', { amount: GBP(60) }, { to_owner: sam.id, for: s1.hash }), 'A2');
  const p1 = T(pay.write('observe', { kind: 'received', amount: GBP(60), destination: 'paylink:sam' }, { for: s1.hash, answers: a2.hash, derives_from: [acct.hash] }), 'P1');
  const s2 = T(sam.write('transfer', { amount: A('50', 'kg') }, { what: F.hash, to_owner: amara.id, for: s1.hash }), 'S2');
  const a3 = T(amara.write('transfer', { status: 'accepted' }, { answers: s2.hash, for: s1.hash }), 'A3');
  const d = deal(amara, F, leila, A('20', 'kg'));
  const sl = T(sell(amara, F, leila, d, A('20', 'kg')), 'AL');
  leila.write('transfer', { status: 'accepted' }, { answers: sl.hash });
  const stageBefore = stage(w, s1).stage;
  const p2 = pay.write('observe', { kind: 'received' }, { defeats: p1.hash });
  return { w, s1, F, stageBefore };
}
{
  const { w, s1, F, stageBefore } = world();
  const st = stage(w, s1);
  check('the flour', 'the stage after delivery and payment', stageBefore, 'done');
  check('the flour', 'P2 defeats P1 after the resale: the stage stays done', st.stage, 'done');
  check('the flour', '20 kg Leila\'s, 30 kg Amara\'s', ownersOf(own(w, F)), { owners: [['amara', '30'], ['leila', '20']] });
}
done();
