// Versions, a circle's clock, a circle's line (circles.md).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, cafe, staffWorld, found, GBP, part, per, as, confirm, state, holds, speaks, ownPart, sendParts, yesTo, readCodes, handsOf, r1, day } = L;
const r2 = { parts: 50, scope: { types: ['promise'], each: GBP(900) } };
const version = (who, F, rules, refs = {}) => as(who, F, 'actor', { kind: 'circle', pack: part(100), rules, clocks: { names: [refs.clock] }, name: 'cafe' }, (() => { const { clock, ...r } = refs; return { updates: F.hash, meter: refs.meterId, ...r }; })());
{
  // Amara alone signs a version of F adding a row: F names no `actor` row, so it waits. Leila confirms: holds. A version that adds { parts: 1, scope: { types: [actor] } }: that row is never read.
  const W = cafe(); const { w, amara, leila, F, N, Tm } = W;
  const mk = (who, rules, extra = {}) => T(as(who, F, 'actor', { kind: 'circle', pack: part(100), rules, clocks: { names: [N] }, name: 'cafe' }, { updates: F.hash, meter: Tm, ...extra }), 'V');
  const V1 = mk(amara, [r1(), r2]);
  check('versions', 'Amara alone: F names no `actor` row, so the version waits on hands; the rows are still r1', [holds(w, F, V1).holds, fb.door('stands', V1, w.blocks).waiting.map(x => x.on), fb.door('circle_state', F.hash, w.blocks).rules.length], [false, ['hands'], 1]);
  check('versions', 'circle_versions lists it as not holding; now is the founding block', (() => { const v = fb.door('circle_versions', F.hash, w.blocks); return [v.versions.map(x => [x.holds, x.updates === F.hash]), v.now === F.hash]; })(), [[[false, true]], true]);
  confirm(leila, V1);
  check('versions', 'Leila confirms: holds (every owner together)', [holds(w, F, V1).holds, holds(w, F, V1).every_owner], [true, true]);
  check('versions', 'the circle now has two rows; circle_versions: now is V1, hands Amara and Leila', (() => { const v = fb.door('circle_versions', F.hash, w.blocks); return [fb.door('circle_state', F.hash, w.blocks).rules.length, v.now === V1.hash, v.versions[0].hands.map(nm).sort()]; })(), [2, true, ['amara', 'leila']]);
  // a version that adds an `actor` row: that row is never read
  const V2 = mk(amara, [r1(), r2, { parts: 1, scope: { types: ['actor'] } }], { after: [V1.hash] }); confirm(leila, V2);
  check('versions', 'a version that adds { parts: 1, scope: { types: [actor] } } holds (both signed) but that row is never read: Amara alone cannot make the next version', (() => { const V3 = mk(amara, [r1()], { after: [V2.hash] }); return [holds(w, F, V2).holds, holds(w, F, V3).holds]; })(), [true, false]);
}
{
  // rivals: two versions, each by every owner, neither in the other's past: the rows are those of the latest version both have in their past (the founding block)
  const W = cafe(); const { w, amara, leila, F, N, Tm } = W;
  const mk = (who, rules, extra = {}) => T(as(who, F, 'actor', { kind: 'circle', pack: part(100), rules, clocks: { names: [N] }, name: 'cafe' }, { updates: F.hash, meter: Tm, ...extra }), 'V');
  const A1 = mk(amara, [r1(), r2]);
  const B1 = mk(leila, [r1(), { parts: 25, scope: { types: ['thing'] } }]); // signed before she has seen A1, so neither is in the other's past
  confirm(leila, A1); confirm(amara, B1);
  const cs = fb.door('circle_state', F.hash, w.blocks);
  check('versions', 'two rival versions: the rows stand as the latest version both have in their past (the founding block: one row)', [holds(w, F, A1).holds, holds(w, F, B1).holds, cs.rules.length], [true, true, 1]);
}
{
  // Amara stops G under r1, received on N; then Joe's order `as` F under G, received on N after: counts for nothing. With no clock: Joe's order counts for a relier whose block was joined to it before he saw the stop (The cut).
  const { w, amara, joe, wan, F, G, offer, order } = staffWorld({ clocked: true });
  const J0 = order(offer('H0'), 'J0'); wan.write('observe', { kind: 'receipt' }, { derives_from: [J0.hash] });
  const S = T(as(amara, F, 'grant', { kind: 'tool', status: 'stopped', stop: 'onward' }, { updates: G.hash }), 'S');
  wan.write('observe', { kind: 'receipt' }, { derives_from: [S.hash] });
  const J1 = order(offer('H1'), 'J1'); wan.write('observe', { kind: 'receipt' }, { derives_from: [J1.hash] });
  check('clock', 'the stop is received on N, then Joe\'s order is received on N after: it counts for nothing', fb.door('under_ok', J1, w.blocks), false);
  check('clock', 'an order received on N before the stop was received still counts', fb.door('under_ok', J0, w.blocks), true);
}
{
  const { w, amara, joe, F, G, offer, order } = staffWorld();
  const S = T(as(amara, F, 'grant', { kind: 'tool', status: 'stopped', stop: 'onward' }, { updates: G.hash }), 'S');
  const J1 = order(offer('H1'), 'J1');
  check('clock', 'with no clock: Joe\'s order, whose block has not seen the stop, counts for a relier whose block was joined to it before he saw the stop (The cut)', fb.door('under_ok', J1, w.blocks), true);
}
{
  // every hand is read on the circle's clock. Amara signs the £900 order (above r1: every owner). Leila confirms it, then sells her 50 to Maria (her sale has her
  // confirm in its past, so it is no end her confirm has seen). But N, the café's clock, received the sale before it received her confirm: the clock shows that end before her
  // hand; it adds nothing, and the order waits. With no receipts on N, only the causal past counts: her confirm completes the order, and what stands stays.
  for (const clocked of [true, false]) {
    const W = cafe(); const { w, amara, leila, maria, harry, wan, F } = W;
    const O = T(as(amara, F, 'promise', { terms: { lines: [{ id: 'goods', quantity: A('1', 'oven'), price: GBP(900) }] } }, { from: harry.id, to: F.hash, after: [W.P2.hash] }), 'ORDER');
    const lc = T(confirm(leila, O), 'LC');
    const tr = T(sendParts(leila, F, 50, maria), 'TR');
    if (clocked) { const r1x = wan.write('observe', { kind: 'receipt' }, { derives_from: [tr.hash] }); wan.write('observe', { kind: 'receipt' }, { derives_from: [lc.hash], after: [r1x.hash] }); }
    const h = holds(w, F, O);
    check('clock', clocked ? 'N received Leila\'s sale before her confirm: her hand adds nothing; the order waits' : 'no receipts on N: her confirm has not seen her sale, so her hand counts and the order holds at it', [h.holds, handsOf(h).map(x => [x[0], x[2]]).sort()], clocked ? [false, [['amara', true], ['leila', false]]] : [true, [['amara', true], ['leila', true]]]);
  }
}
{
  // T named. Two tills each sell the last loaf `as` F. T's receipts show totals; the second draw takes nothing (past).
  const W = cafe(); const { w, amara, leila, harry, till, F, Tm } = W; const bo = L.P(w, 'bo'), cy = L.P(w, 'cy');
  const loaf = T(instance(amara, kindOf(amara, 'bread'), { pack: A('1', 'loaf') }, { as: F.hash }), 'LOAF');
  const s1 = T(as(amara, F, 'transfer', { amount: A('1', 'loaf') }, { what: loaf.hash, to_owner: bo.id }), 'SELL1');
  const s2 = T(as(leila, F, 'transfer', { amount: A('1', 'loaf') }, { what: loaf.hash, to_owner: cy.id }), 'SELL2');
  // a loaf is another kind than r1's each (£300), so it is above it (a bound bounds every kind); each sale holds by the other owner's confirm (every owner together)
  confirm(leila, s1); confirm(amara, s2);
  check('line', 'a loaf is above r1\'s £ each: each sale holds by every owner together', [holds(w, F, s1).every_owner, holds(w, F, s2).every_owner], [true, true]);
  // T's receipts: the second till's sale is receipted first, then the first's: its place on the line T keeps is the order
  till.write('observe', { kind: 'receipt' }, { derives_from: [s2.hash] }); till.write('observe', { kind: 'receipt' }, { derives_from: [s1.hash] });
  const rr = ownPart(w, loaf);
  check('line', 'one line, T\'s receipts order the two sales: SELL2 (receipted first) takes the loaf, SELL1 takes nothing (past)', rr.draws.map(d => [d[0], d[1], d[2]]).sort(), [['SELL1', false, 'past'], ['SELL2', true, null]]);
}
{
  // no meter: Leila signs 100 sacks `as` F; she then transfers all her parts away and holds no grant. Amara's transfer `as` F of 20 sacks to Bo, Leila's last block in its past and named in state.counted_to, Maria confirming: takes on Amara's line. Bo accepts: the café 80, Bo 20. Leila's own key then signs 10 of them away: not_owner.
  const W = cafe({ meter: null }); const { w, amara, leila, maria, F } = W; const bo = L.P(w, 'bo');
  const sacks = T(instance(leila, kindOf(leila, 'flour'), { pack: A('100', 'sack') }, { as: F.hash }), 'SACKS');
  const away = sendParts(leila, F, 50, maria); yesTo(maria, away);
  const last = leila.write('observe', { kind: 'note' }, { derives_from: [sacks.hash] });
  const m = T(as(amara, F, 'transfer', { amount: A('20', 'sack'), counted_to: last.hash }, { what: sacks.hash, to_owner: bo.id, after: [last.hash] }), 'TAKEUP');
  confirm(maria, m);
  const r1o = ownPart(w, sacks);
  check('line', 'Amara\'s take-up, Leila\'s last block in its past and named in counted_to, Maria confirming: it takes on Amara\'s line (held)', r1o.draws.map(d => [d[0], d[1], d[2], d[3]]), [['TAKEUP', true, null, 'held']]);
  yesTo(bo, m);
  check('line', 'Bo accepts: the café 80 (the circle), Bo 20', ownPart(w, sacks).owners.map(o => [o[0].length === 6 ? 'F' : o[0], o[1]]).sort(), [['F', '80'], ['bo', '20']]);
  const own = T(leila.write('transfer', { amount: A('10', 'sack') }, { what: sacks.hash, to_owner: maria.id }), 'LEILA');
  check('line', 'Leila\'s own key then signs 10 of them away: not_owner', ownPart(w, sacks).draws.find(d => d[0] === 'LEILA').slice(1), [false, 'not_owner', null]);
}
done();
