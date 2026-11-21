// C16 no one is both sides, C17 a payout by parts, C18 one answer for a block with no row (changes-1.9/06-circles.md section 3).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, cafe, found, GBP, part, per, as, confirm, state, holds, speaks, ownPart, sendParts, yesTo, readCodes, handsOf, r1, day } = L;
const milk = { terms: { quantity: A('10', 'litre'), price: { amount: GBP(12), per: A('1', 'litre') } } };
{
  // Story 1. Amara signs `as` F, under r1, £200 to herself: her hand counts for nothing; no row is met; it acts on nothing. Leila confirms: holds (Leila's 50, without Amara's hand).
  const W = cafe(); const { w, amara, leila, F } = W;
  const M = T(as(amara, F, 'transfer', { amount: GBP(200) }, { to_owner: amara.id }), 'M');
  const h0 = holds(w, F, M);
  check('C16.1', 'alone: her hand counts for nothing, no row is met, the move acts on nothing', [h0.holds, handsOf(h0).map(x => [x[0], x[2], x[3]]), fb.door('speaks_for', M, w.blocks)], [false, [['amara', false, 'not_voice']], null]);
  confirm(leila, M);
  const h1 = holds(w, F, M);
  check('C16.1', 'Leila confirms: holds by r1, with Leila\'s 50 and not Amara\'s hand', [h1.holds, h1.row, handsOf(h1).map(x => [x[0], x[2]]).sort()], [true, 0, [['amara', false], ['leila', true]]]);
}
{
  // Story 2. Leila signs `as` F a hand-over of three open deals to her own stall, a circle she owns: it gives to her; waits until Amara signs.
  const W = cafe(); const { w, amara, leila, harry, F } = W;
  const stall = T(found(leila, { pack: 1, name: 'stall' }), 'STALL');
  const deals = [1, 2, 3].map(i => T(as(amara, F, 'promise', { terms: { quantity: A(String(i), 'litre'), price: { amount: GBP(1), per: A('1', 'litre') } } }, { from: F.hash, to: harry.id }), 'D' + i));
  const H = T(as(leila, F, 'transfer', {}, { what: deals.map(d => d.hash), to_owner: stall.hash }), 'HAND');
  check('C16.2', 'gives to Leila (a circle she owns): her hand counts for nothing; waits', [holds(w, F, H).holds, handsOf(holds(w, F, H)).map(x => [x[0], x[2]]), fb.door('stands', H, w.blocks).waiting.map(x => x.on)], [false, [['leila', false]], ['hands']]);
  confirm(amara, H);
  check('C16.2', 'until Amara signs: holds', [holds(w, F, H).holds, holds(w, F, H).row], [true, 0]);
}
{
  // Story 3, three owners (Amara 40, Leila 40, Maria 20): Leila signs `as` F, under r1, £300 to Amara: holds; any one other owner may pay her.
  const W = cafe({ noparts: true }); const { w, amara, leila, maria, F } = W;
  const a = sendParts(amara, F, 40, leila); yesTo(leila, a); const b = sendParts(amara, F, 20, maria); yesTo(maria, b);
  check('C16.3', 'three owners: Amara 40, Leila 40, Maria 20', ownPart(w, F).owners, [['amara', '40'], ['leila', '40'], ['maria', '20']]);
  const M = T(as(leila, F, 'transfer', { amount: GBP(300) }, { to_owner: amara.id }), 'M');
  check('C16.3', 'Leila pays Amara £300: Leila\'s own hand is not the giving-to one, so it holds', [holds(w, F, M).holds, holds(w, F, M).row], [true, 0]);
  const M2 = T(as(maria, F, 'transfer', { amount: GBP(50) }, { to_owner: leila.id }), 'M2');
  check('C16.3', 'any one other owner may pay her: Maria pays Leila', holds(w, F, M2).holds, true);
}
{
  // C17 (D4). A promise names one side, so one standing promise to each owner: SP-A to Amara and SP-L to Leila, signed `as` F by every owner (Amara signs, Leila confirms), each
  // { from: F, to: <owner> }, no price (the rule is in prose; none is read). A version of F (every owner) adds the row { to: [T], needed: 1, scope: { types: [transfer],
  // on: [SP-A, SP-L] } } (it names blocks signed after F). Sunday, takings £306.75: the till signs `as` F £153.37 to Amara `for` SP-A and £153.38 to Leila `for` SP-L. Both hold
  // by the till's place in that row. No owner signs on Sunday. The same payouts under a grant TG to the till, scope.on SP-A: not_due.
  const W = cafe(); const { w, amara, leila, till, F, Tm, N } = W;
  const rule = 'each Sunday, the till\'s takings by parts, step 1p; Leila takes what is left';
  const SPA = T(as(amara, F, 'promise', { what: rule }, { from: F.hash, to: amara.id, after: [W.P2.hash] }), 'SPA');
  const SPL = T(as(amara, F, 'promise', { what: rule }, { from: F.hash, to: leila.id, after: [W.P2.hash] }), 'SPL');
  const cA = confirm(leila, SPA), cL = confirm(leila, SPL, {}, { after: [cA.hash] });
  check('C17', 'SP-A and SP-L are read and hold (each gives to one owner: the other owner\'s hand holds it)', [readCodes(SPA, w), readCodes(SPL, w), holds(w, F, SPA).holds, holds(w, F, SPL).holds], [[], [], true, true]);
  const payRow = { to: [till.id], needed: 1, scope: { types: ['transfer'], on: [SPA.hash, SPL.hash].sort() } };
  const V = T(as(amara, F, 'actor', { kind: 'circle', pack: part(100), rules: [r1(), payRow], clocks: { names: [N] }, name: 'cafe' }, { updates: F.hash, meter: Tm, after: [cL.hash] }), 'V');
  const cV = confirm(leila, V);
  check('C17', 'the version adding the till\'s row holds by every owner together', [holds(w, F, V).holds, holds(w, F, V).every_owner], [true, true]);
  const payA = T(as(till, F, 'transfer', { amount: GBP('153.37') }, { to_owner: amara.id, for: SPA.hash, after: [cV.hash] }), 'PAYA');
  const payL = T(as(till, F, 'transfer', { amount: GBP('153.38') }, { to_owner: leila.id, for: SPL.hash, after: [cV.hash] }), 'PAYL');
  const hA = holds(w, F, payA), hL = holds(w, F, payL);
  check('C17', 'Sunday: the till\'s payouts `as` F to Amara `for` SP-A and to Leila `for` SP-L both hold by the till\'s place in that row (row 1); no owner signs', [hA.holds, hA.row, handsOf(hA).map(x => [x[2], x[3]]), hL.holds, hL.row], [true, 1, [[true, null]], true, 1]);
  const stray = T(as(till, F, 'transfer', { amount: GBP('20') }, { to_owner: amara.id, after: [cV.hash] }), 'STRAY');
  check('C17', 'a payout `for` no promise the row names: the row\'s scope.on does not cover it, and the till owns no part: it waits on hands', [holds(w, F, stray).holds, fb.door('stands', stray, w.blocks).waiting.map(x => x.on)], [false, ['hands']]);
  // the same payout under a grant to the till: a tool pays only what a deal names (stage 4, Due): `for` a promise that states no amount, not_due
  const TG = T(as(amara, F, 'grant', { kind: 'tool', scope: { types: ['transfer'], on: [SPA.hash], each: GBP(200) } }, { to: till.id, meter: Tm, after: [cA.hash] }), 'TG');
  const tgPay = T(till.write('transfer', { amount: GBP('153.37') }, { to_owner: amara.id, for: SPA.hash, under: TG.hash }), 'TGPAY');
  check('C17', 'TG holds by r1; the payout under it `for` SP-A, which states no amount: not_due', [holds(w, F, TG).holds, fb.door('why_not_under', tgPay, w.blocks).map(x => x.code)], [true, ['not_due']]);
  // C16\'s last clause: were the till\'s key Amara\'s, a row whose scope.on names the promise that names her as the one paid lets her own hand count for a payout to her
  const W2 = cafe(); const w2 = W2.w;
  const SPA2 = T(as(W2.amara, W2.F, 'promise', { what: rule }, { from: W2.F.hash, to: W2.amara.id, after: [W2.P2.hash] }), 'SPA2'); const c2 = confirm(W2.leila, SPA2);
  const V2 = T(as(W2.amara, W2.F, 'actor', { kind: 'circle', pack: part(100), rules: [r1(), { parts: 1, scope: { types: ['transfer'], on: [SPA2.hash] } }], clocks: { names: [W2.N] }, name: 'cafe' }, { updates: W2.F.hash, meter: W2.Tm, after: [c2.hash] }), 'V2');
  const cV2 = confirm(W2.leila, V2);
  const own = T(as(W2.amara, W2.F, 'transfer', { amount: GBP('153.37') }, { to_owner: W2.amara.id, for: SPA2.hash, after: [cV2.hash] }), 'OWN');
  const ho = holds(w2, W2.F, own);
  check('C17', 'C16\'s last clause: Amara\'s own payout to herself `for` SP-A holds by the row whose scope.on names SP-A, which names her as the one paid', [ho.holds, ho.row, handsOf(ho).map(x => [x[0], x[2]])], [true, 1, [['amara', true]]]);
  const other = T(as(W2.amara, W2.F, 'transfer', { amount: GBP('50') }, { to_owner: W2.amara.id, after: [cV2.hash] }), 'OTHER');
  check('C17', 'the same to herself, not `for` SP-A: nothing holds (it gives to her)', holds(w2, W2.F, other).holds, false);
}
{
  // C18. After G's stop, Joe signs `as` F an order of milk: waiting; acts on nothing; Joe's name is bound to its truth, his things are not.
  const { w, amara, joe, harry, F, G } = L.staffWorld();
  T(as(amara, F, 'grant', { kind: 'tool', status: 'stopped', stop: 'onward' }, { updates: G.hash }), 'S');
  const O = T(as(joe, F, 'promise', milk, { from: harry.id, to: F.hash }), 'JO');
  check('C18', 'after the stop Joe signs `as` F an order of milk: no row holds, so it waits (hands) and acts on nothing', [holds(w, F, O).holds, fb.door('stands', O, w.blocks).waiting.map(x => x.on), fb.door('speaks_for', O, w.blocks), fb.door('backed', O, joe.id, w.blocks).backed], [false, ['hands'], null, false]);
  check('C18', 'nothing of Joe\'s own is named by it', fb.door('gives', O, joe.id, w.blocks).gives.length, 0);
}
done();
