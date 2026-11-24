// A row, head counts, bounds (circles.md).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, cafe, found, GBP, part, per, as, confirm, state, holds, speaks, ownPart, sendParts, yesTo, readCodes, handsOf, r1, day, sha } = L;
const KES = v => A(String(v), 'KES');
{
  // B1, Amara\'s £120 order `as` F: r1 holds (one hand, 50 part, at least 1; promise in its types; under £300). A row { parts: "all" }: refused (shape).
  const W = cafe(); const { w, amara, harry, F } = W;
  const B1 = T(as(amara, F, 'promise', { terms: { lines: [{ id: 'goods', quantity: A('10', 'litre'), price: { amount: GBP(12), per: A('1', 'litre') } }] } }, { from: harry.id, to: F.hash }), 'B1');
  const h = holds(w, F, B1);
  check('a row', 'r1 holds: one hand, 50 part (at least 1), promise in its types, £120 under £300', [h.holds, h.row, handsOf(h).map(x => [x[0], x[1], x[2]])], [true, 0, [['amara', '50', true]]]);
  const bad = amara.make('actor', { kind: 'circle', pack: part(10), rules: [{ parts: 'all', scope: { types: ['promise'] } }] }, {});
  check('a row', 'a row { parts: "all" } is refused: shape', readCodes(bad, w), ['shape']);
  const bad2 = [{ parts: '1.5', scope: {} }, { parts: 0, scope: {} }, { parts: 1 }, { to: [amara.id], scope: {} }, { parts: 1, needed: 1, to: [amara.id], scope: {} }].map(r => readCodes(amara.make('actor', { kind: 'circle', pack: part(10), rules: [r] }, {}), w));
  check('a row', 'a row is exactly { parts, scope } or { to, needed, scope }, every number whole and at least 1 (a fraction, zero, no scope, a mix): shape each', bad2, bad2.map(() => ['shape']));
  // what a row does not cover: a move above its each, and a type it does not name, wait on hands
  const big = T(as(amara, F, 'promise', { terms: { lines: [{ id: 'goods', quantity: A('10', 'sack'), price: per(90, 'sack') }] } }, { from: harry.id, to: F.hash }), 'BIG');
  check('a row', 'r1\'s each is £300: a £900 order does not meet it', [holds(w, F, big).holds, holds(w, F, big).waiting.map(x => x.on)], [false, ['hands']]);
  const stop = T(as(amara, F, 'actor', { kind: 'circle', name: 'x' }, { updates: F.hash }), 'V');
  check('a row', 'a row that does not name the type (actor) never holds for it', holds(w, F, stop).holds, false);
}
{
  // Grant M `as` L names 200 members. A version of L adds { to: M, needed: 101, scope: { types: [transfer], parties: any, on: any, each: 50,000 KES } }. Joseph buys 60 parts. He and 40 friends sign a sale of the store: does not hold, 41 holders of M, one id counted once. Nia joins: a newer word for M naming 201, signed under a row that names `grant`: from there the row counts 201 holders.
  const w = new World(), kofi = P(w, 'kofi'), joseph = P(w, 'joseph'), nia = P(w, 'nia'), till = P(w, 'till'), buyer = P(w, 'buyer');
  const friends = Array.from({ length: 40 }, (_, i) => P(w, 'friend' + i));
  const others = Array.from({ length: 159 }, (_, i) => sha('member' + i));
  const members = [joseph.id, ...friends.map(f => f.id), ...others].sort();
  const Lc = T(found(kofi, { pack: 1000, meter: till.id, name: 'lake maize' }), 'L');
  const M = T(as(kofi, Lc, 'grant', { kind: 'members' }, { to: members, meter: till.id }), 'M');
  check('head counts', 'the grant M is the members: 200 ids', M.refs.to.length, 200);
  const rows = [{ to: M.hash, needed: 101, scope: { types: ['transfer'], parties: 'any', on: 'any', each: KES(50000) } }, { parts: 500, scope: { types: ['grant'], parties: 'any' } }];
  const V = T(as(kofi, Lc, 'actor', { kind: 'circle', pack: part(1000), rules: rows, name: 'lake maize' }, { updates: Lc.hash, meter: till.id }), 'V');
  const tj = sendParts(kofi, Lc, 60, joseph); yesTo(joseph, tj);
  const sale = T(as(joseph, Lc, 'transfer', { amount: KES(20000) }, { to_owner: buyer.id, after: [V.hash] }), 'SALE'); // the store's sale, KES 20,000 (within the row's each)
  let prev = sale; for (const f of friends) prev = confirm(f, sale, {}, { after: [prev.hash] }); // the last confirm gathers the others: a move holds at a block in whose causal past enough hands count
  const h = holds(w, Lc, sale);
  check('head counts', 'M holds as a word of the circle (every owner: Kofi owns every part)', fb.door('row_holds', M, w.blocks).holds, true);
  check('head counts', 'Joseph and 40 friends: 41 holders of M, 101 needed; it does not hold', [h.holds, h.hands.filter(x => x.counts).length], [false, 41]);
  check('head counts', 'ways_in: the head-count row needs 101 of M\'s 200, clamped to the every-owner way\'s 2 (Kofi and Joseph own every part)', (() => { const x = fb.door('ways_in', Lc.hash, w.blocks); return [x.rows.map(r => [r.row, r.least]), x.every_owner]; })(), [[[0, 2], [1, 1]], { least: 2 }]);
  const byNia = T(as(nia, Lc, 'transfer', { amount: KES(100) }, { to_owner: buyer.id, after: [V.hash] }), 'NIA1');
  check('head counts', 'before she joins, Nia\'s hand counts for nothing in the head-count row (M does not name her)', handsOf(holds(w, Lc, byNia)).map(x => [x[2], x[3]]), [[false, 'not_voice']]);
  const M2 = T(as(kofi, Lc, 'grant', { kind: 'members' }, { to: [...members, nia.id].sort(), meter: till.id, updates: M.hash, after: [V.hash] }), 'M2');
  const hM = fb.door('row_holds', M2, w.blocks);
  check('head counts', 'Nia joins: a newer word for M, signed under a row that names grant (500 parts: Kofi\'s 940)', [hM.holds, hM.row], [true, 1]);
  const byNia2 = T(as(nia, Lc, 'transfer', { amount: KES(100) }, { to_owner: buyer.id, after: [M2.hash] }), 'NIA2');
  check('head counts', 'from there the row counts 201 holders: Nia\'s hand on a block that has M2 in its past counts (1 of the 101 needed, so it still waits)', [holds(w, Lc, byNia2).holds, handsOf(holds(w, Lc, byNia2)).map(x => [x[2], x[3]])], [false, [[true, null]]]);
}
{
  // one id counted once, and the positive case: a small M of 5 names, 3 needed.
  const w = new World(), kofi = P(w, 'kofi'), till = P(w, 'till'), buyer = P(w, 'buyer');
  const m = Array.from({ length: 5 }, (_, i) => P(w, 'm' + i));
  const Lc = T(found(kofi, { pack: 10, meter: till.id, name: 'small' }), 'L');
  const M = T(as(kofi, Lc, 'grant', { kind: 'members' }, { to: m.map(x => x.id).sort(), meter: till.id }), 'M');
  const V = T(as(kofi, Lc, 'actor', { kind: 'circle', pack: part(10), rules: [{ to: M.hash, needed: 3, scope: { types: ['transfer'], parties: 'any', on: 'any', each: GBP(5) } }], name: 'small' }, { updates: Lc.hash, meter: till.id }), 'V');
  const sale = T(as(m[0], Lc, 'transfer', { amount: GBP(5) }, { to_owner: buyer.id, after: [V.hash] }), 'SALE');
  const c1 = confirm(m[1], sale, {}, { after: [sale.hash] }), c2 = confirm(m[1], sale, {}, { after: [c1.hash] }); // one id signing twice counts once
  check('head counts', 'two holders (one signed twice): needed 3, does not hold', holds(w, Lc, sale).holds, false);
  confirm(m[2], sale, {}, { after: [c2.hash] });
  check('head counts', 'a third holder: holds', holds(w, Lc, sale).holds, true);
}
{
  // Amara signs `as` F a £900 oven order: r1 does not hold (above each); no other row; it waits (hands). Leila confirms: holds by every owner together.
  const W = cafe(); const { w, amara, leila, harry, F } = W;
  const O = T(as(amara, F, 'promise', { terms: { lines: [{ id: 'goods', quantity: A('1', 'oven'), price: GBP(900) }] } }, { from: harry.id, to: F.hash }), 'OVEN');
  check('bounds', 'r1 does not hold above each; no other row; it waits on hands', [holds(w, F, O).holds, fb.door('stands', O, w.blocks).waiting.map(x => x.on)], [false, ['hands']]);
  confirm(leila, O);
  const h = holds(w, F, O);
  check('bounds', 'Leila confirms: holds by every owner together', [h.holds, h.row, h.every_owner], [true, null, true]);
  // a row can state its own bounds: a second row for a bigger order, which a third owner... r2: { parts: 50, each: £1,000 }
  const W2 = cafe({ rules: [r1(), { parts: 50, scope: { types: ['promise'], parties: 'any', on: 'any', each: GBP(1000) } }] });
  const O2 = T(as(W2.amara, W2.F, 'promise', { terms: { lines: [{ id: 'goods', quantity: A('1', 'oven'), price: GBP(900) }] } }, { from: W2.harry.id, to: W2.F.hash }), 'OVEN2');
  check('bounds', 'a larger row whose bounds it fits (50 parts, £1,000): holds by that row', [holds(W2.w, W2.F, O2).holds, holds(W2.w, W2.F, O2).row], [true, 1]);
}
{
  // a row's `limit` counts the amounts of the blocks this same row held for in the block's causal past, plus this one; `every` resets it at each period turn, read as a
  // grant's (a cutoff on the circle's meter line whose refs.subject is the circle, a span no shorter than `every`); with no meter no period turns.
  for (const mode of ['limit', 'every', 'every, no meter']) {
    const every = mode !== 'limit', metered = mode !== 'every, no meter';
    const W = cafe({ rules: [{ parts: 1, scope: { types: ['transfer'], parties: 'any', on: 'any', limit: GBP(500), ...(every ? { every: 'P7D' } : {}) } }], meter: metered ? undefined : null }); const { w, amara, harry, till, F } = W;
    const p1 = T(as(amara, F, 'transfer', { amount: GBP(300) }, { to_owner: harry.id, after: [W.P2.hash] }), 'PAY1');
    const r1x = till.write('observe', { kind: 'receipt' }, { derives_from: [p1.hash] });
    const cut = every ? till.write('observe', { kind: 'cutoff', when: 'P7D' }, { subject: F.hash, after: [r1x.hash] }) : null;
    const p2 = T(as(amara, F, 'transfer', { amount: GBP(300) }, { to_owner: harry.id, after: [p1.hash] }), 'PAY2');
    till.write('observe', { kind: 'receipt' }, { derives_from: [p2.hash], after: cut ? [cut.hash] : [r1x.hash] });
    const want = mode === 'every' ? [true, true] : [true, false];
    check('bounds', mode === 'limit' ? 'a row with limit £500: £300 holds; a second £300, the first in its past, is above the limit: it waits' : mode === 'every' ? 'limit £500 every P7D: the till\'s cutoff on its line between the two turns the period; the second £300 holds' : 'every P7D with no meter: no period turns, the limit is for all time; the second waits', [holds(w, F, p1).holds, holds(w, F, p2).holds], want);
  }
  {
    const W = cafe({ rules: [{ parts: 1, scope: { types: ['transfer'], parties: 'any', on: 'any', limit: GBP(500) } }] }); const { w, amara, harry, F } = W;
    const p = T(as(amara, F, 'transfer', { amount: A('3', 'sack') }, { to_owner: harry.id, after: [W.P2.hash] }), 'SACKS3');
    check('bounds', 'an amount of another kind than the row\'s limit is above it: waits', holds(w, F, p).holds, false);
  }
}
{
  // kept word. Amara and Leila signed `as` F a £2,200 loan from Harry. Leila dies with no will. Amara signs, under r1, the £2,200 repayment `for` it: holds; the repayment was counted when the loan stood.
  const w = new L.World(), amara = P(w, 'amara'), leila = P(w, 'leila'), harry = P(w, 'harry'), till = P(w, 'till'), wan = P(w, 'wanjiru'), kinA = P(w, 'kinA'), kinB = P(w, 'kinB');
  const kin = { names: [kinA.id, kinB.id].sort(), needed: 2, wait: 'P30D', above: true }, clocks = { names: [wan.id], needed: 1 };
  const K0 = leila.write('grant', { kind: 'key', voices: [{ key: leila.key.pub }, kin], clocks }, { subject: leila.id, updates: leila.id });
  const F = T(found(amara, { pack: 100, rules: [r1()], clocks: { names: [wan.id] }, meter: till.id, name: 'cafe' }), 'F');
  const p1 = sendParts(amara, F, 50, leila); yesTo(leila, p1);
  const loan = T(as(amara, F, 'promise', { terms: { lines: [{ id: 'loan', quantity: GBP(2200), price: GBP(2200) }] } }, { from: harry.id, to: F.hash }), 'LOAN'); confirm(leila, loan);
  check('bounds', 'the loan is above r1\'s each: it held by every owner together', [holds(w, F, loan).holds, holds(w, F, loan).every_owner], [true, true]);
  const close = kinA.write('grant', { kind: 'key', voices: [], clocks }, { subject: leila.id, updates: K0.hash });
  kinB.write('observe', { kind: 'confirm' }, { confirms: close.hash });
  const rc = wan.write('observe', { kind: 'receipt' }, { derives_from: [close.hash] });
  const cut = wan.write('observe', { kind: 'cutoff', when: 'P30D' }, { subject: close.hash, derives_from: [rc.hash] }, { at: day(40) });
  kinA.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] }); kinB.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] });
  const repay = T(as(amara, F, 'transfer', { amount: GBP(2200) }, { to_owner: harry.id, for: loan.hash }), 'REPAY');
  check('bounds', 'Leila has died with no will; Amara signs the £2,200 repayment `for` the loan under r1: holds (counted when the loan stood)', [holds(w, F, repay).holds, holds(w, F, repay).row], [true, 0]);
  const other = T(as(amara, F, 'transfer', { amount: GBP(2200) }, { to_owner: harry.id }), 'OTHER');
  check('bounds', 'a £2,200 payment for no deal of the circle is a new draw above r1\'s each: waits (and Leila cannot sign)', holds(w, F, other).holds, false);
}
done();
