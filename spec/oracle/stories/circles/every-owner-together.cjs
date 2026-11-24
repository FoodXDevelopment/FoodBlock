// Every owner together (circles.md): what hands that together own every part persons own sign is theirs to do, whatever the rows say.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, cafe, found, GBP, part, per, as, confirm, state, holds, speaks, ownPart, sendParts, yesTo, readCodes, handsOf, r1 } = L;
{
  // Amara signs `as` F a transfer of £2,000 to herself; Leila confirms. Holds: their hands own 100 of 100. Rows do not matter: above r1's each and giving to Amara.
  const W = cafe(); const { w, amara, leila, F } = W;
  const M = T(as(amara, F, 'transfer', { amount: GBP(2000) }, { to_owner: amara.id }), 'M');
  check('every owner together', 'before Leila confirms: it gives to Amara and is above r1\'s each, so nothing holds; it waits on hands', [holds(w, F, M).holds, fb.door('stands', M, w.blocks).waiting.map(x => x.on)], [false, ['hands']]);
  const c = T(confirm(leila, M), 'c');
  const h = holds(w, F, M);
  check('every owner together', 'Leila confirms: holds, by every owner together, not by a row', [h.holds, h.row, h.every_owner], [true, null, true]);
  check('every owner together', 'both hands count: 50 and 50 of 100', L.handsOf(h).map(x => [x[0], x[1], x[2]]).sort(), [['amara', '50', true], ['leila', '50', true]]);
  check('every owner together', 'the circle\'s things move: M speaks for the circle', fb.door('speaks_for', M, w.blocks) === F.hash, true);
}
{
  // Amara signed grant G `as` F to Joe. Amara and Leila together sign a stop of G `as` F. Holds; G ends. Harry's deal, signed `as` F before the stop and standing, still stands.
  const W = cafe(); const { w, amara, leila, harry, joe, F, Tm } = W;
  const G = T(as(amara, F, 'grant', { kind: 'tool', scope: { types: ['promise', 'transfer'], each: GBP(100) } }, { to: joe.id, meter: Tm }), 'G');
  const D = T(as(amara, F, 'promise', { terms: { lines: [{ id: 'goods', quantity: A('10', 'sack'), price: per(20.5, 'sack') }] } }, { from: harry.id, to: F.hash }), 'D');
  const S = T(as(amara, F, 'grant', { kind: 'tool', status: 'stopped', stop: 'onward' }, { updates: G.hash }), 'S');
  const c = confirm(leila, S);
  const h = holds(w, F, S);
  check('a stop by every owner', 'the stop holds (r1 names grant; and both owners signed)', h.holds, true);
  check('a stop by every owner', 'G ends: a block of Joe\'s under G after the stop counts for nothing', (() => { const j = T(joe.write('promise', { terms: { lines: [{ id: 'goods', quantity: A('1', 'sack'), price: per(2, 'sack') }] } }, { from: harry.id, to: F.hash, under: G.hash, after: [S.hash] }), 'J'); return fb.whyNotUnder(j, w.blocks).map(x => x.code); })(), ['not_live']);
  check('a stop by every owner', 'Harry\'s deal, signed as F before the stop, still stands: it speaks for F and stands', [fb.door('speaks_for', D, w.blocks) === F.hash, fb.door('stands', D, w.blocks).stands], [true, true]);
}
{
  // In L (unissued 998), Kofi and Joseph sign a sale of the store. T\'s receipt of the sale states 998 unissued: holds. With no meter named: no every-owner way.
  for (const metered of [true, false]) {
    const w = new World(), kofi = P(w, 'kofi'), joseph = P(w, 'joseph'), till = P(w, 'till');
    const Lc = T(found(kofi, { pack: 1000, ...(metered ? { meter: till.id } : {}), name: 'lake maize' }), 'L');
    // The order: the version adding the row while Kofi owns every part, then the 999 to L and its accept `as` L, then 1 part to Joseph under the row
    const row = { parts: 1, scope: { types: ['transfer'], parties: 'any', on: 'any', what: Lc.hash, each: part(1) } };
    const V = as(kofi, Lc, 'actor', { kind: 'circle', pack: part(1000), rules: [row], name: 'lake maize' }, { updates: Lc.hash, ...(metered ? { meter: till.id } : {}) });
    const t1 = sendParts(kofi, Lc, 999, { id: Lc.hash }); const a1 = as(kofi, Lc, 'transfer', { status: 'accepted' }, { answers: t1.hash, after: [V.hash] });
    const t2 = as(kofi, Lc, 'transfer', { amount: part(1) }, { what: Lc.hash, to_owner: joseph.id, after: [a1.hash] }); const y2 = yesTo(joseph, t2);
    const store = T(instance(kofi, kindOf(kofi, 'store'), { pack: A('1', 'store') }, { as: Lc.hash, after: [y2.hash] }), 'STORE');
    const sale = T(as(kofi, Lc, 'transfer', { amount: A('1', 'store') }, { what: store.hash, to_owner: till.id, after: [store.hash] }), 'SALE');
    confirm(joseph, sale);
    if (metered) till.write('observe', { kind: 'receipt', unissued: part(998) }, { derives_from: [sale.hash] }); // the meter's receipt of the move states the unissued parts, an amount in `part`
    const h = holds(w, Lc, sale);
    if (metered) {
      till.write('observe', { kind: 'receipt', unissued: part(997) }, { derives_from: [sale.hash] });
      check('unissued and receipts', 'two receipts of the sale that do not agree (998, 997): no every-owner way', [holds(w, Lc, sale).holds, holds(w, Lc, sale).every_owner], [false, false]);
    }
    check('unissued and receipts', metered ? 'with T named and its receipt stating 998 unissued: Kofi 1 and Joseph 1 own every part persons own; holds' : 'with no meter named: no every-owner way; only a row holds, and none does', [h.holds, h.every_owner], metered ? [true, true] : [false, false]);
  }
}
done();
