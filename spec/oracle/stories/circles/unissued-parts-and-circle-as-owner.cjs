// Unissued parts, a circle as owner (circles.md).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, check, done, found, GBP, part, as, confirm, state, holds, ownPart, sendParts, yesTo, readCodes, handsOf } = L;
{
  // Kofi founds L (pack 1000, meter T, no row naming L). A row that names L cannot be on L's founding block, so while he owns every part he signs a version adding
  // { parts: 1, scope: { types: [transfer], parties: any, on: any, what: L } } (every owner: Kofi 1000). He transfers 999 part to L and accepts it `as` L (every owner: his 1000, the 999 held toward L
  // added back). Unissued 999, Kofi 1. Kofi `as` L moves 1 part to Joseph under the version's row; Joseph accepts: Joseph 1, unissued 998. The 998 count in no row.
  const w = new World(), kofi = P(w, 'kofi'), joseph = P(w, 'joseph'), till = P(w, 'till');
  const Lc = T(found(kofi, { pack: 1000, meter: till.id, name: 'lake maize' }), 'L');
  const row = { parts: 1, scope: { types: ['transfer'], parties: 'any', on: 'any', what: Lc.hash, each: part(1) } };
  const V = T(as(kofi, Lc, 'actor', { kind: 'circle', pack: part(1000), rules: [row], name: 'lake maize' }, { updates: Lc.hash, meter: till.id }), 'V');
  const hv = holds(w, Lc, V);
  check('unissued parts', 'the version adding the row holds by every owner together (Kofi owns all 1000)', [hv.holds, hv.row, hv.every_owner, handsOf(hv)], [true, null, true, [['kofi', '1000', true, null]]]);
  const t1 = T(sendParts(kofi, Lc, 999, { id: Lc.hash }), 'T1');
  const a1 = T(as(kofi, Lc, 'transfer', { status: 'accepted' }, { answers: t1.hash, after: [V.hash] }), 'A1');
  const h = holds(w, Lc, a1);
  // (the version's row covers the accept too: an accept names no `what`, so nothing it names is outside `what: L`; rows are read before the every-owner way, so it holds by row 0)
  check('unissued parts', 'the accept `as` L holds: his hand counts 1000, the 999 his own transfer holds toward L added back (they are his until this very yes)', [h.holds, h.row, handsOf(h)], [true, 0, [['kofi', '1000', true, null]]]);
  let cs = state(w, Lc);
  check('unissued parts', 'unissued 999; Kofi 1', [cs.unissued.value, cs.owners.map(o => [nm(o.owner), o.amount.value])], ['999', [['kofi', '1']]]);
  const t2 = T(as(kofi, Lc, 'transfer', { amount: part(1) }, { what: Lc.hash, to_owner: joseph.id, after: [a1.hash] }), 't2');
  const h2 = holds(w, Lc, t2);
  check('unissued parts', 'Kofi `as` L moves 1 part to Joseph under the version\'s row: holds by that row (his 1 part)', [h2.holds, h2.row, h2.every_owner, handsOf(h2)], [true, 0, false, [['kofi', '1', true, null]]]);
  yesTo(joseph, t2);
  cs = state(w, Lc);
  check('unissued parts', 'Joseph accepts: Joseph 1, unissued 998, Kofi 1', [cs.unissued.value, cs.owners.map(o => [nm(o.owner), o.amount.value]).sort()], ['998', [['joseph', '1'], ['kofi', '1']]]);
  check('unissued parts', 'the 998 count in no row: ways_in, the row needs one owner; the every-owner way two (Kofi and Joseph)', (() => { const x = fb.door('ways_in', Lc.hash, w.blocks); return [x.rows.map(r => [r.row, r.least]), x.every_owner]; })(), [[[0, 1]], { least: 2 }]);
  // without a row that names `what: L`, a move of the circle\'s own parts holds only by every owner together
  const w2 = new World(), kofi2 = P(w2, 'kofi'), jo2 = P(w2, 'joseph');
  const L2 = T(found(kofi2, { pack: 1000, rules: [{ parts: 1, scope: { types: ['transfer'] } }], name: 'plain' }), 'L2');
  const u1 = sendParts(kofi2, L2, 999, { id: L2.hash }); const ua = as(kofi2, L2, 'transfer', { status: 'accepted' }, { answers: u1.hash });
  const u2 = T(as(kofi2, L2, 'transfer', { amount: part(1) }, { what: L2.hash, to_owner: jo2.id, after: [ua.hash] }), 'u2');
  check('unissued parts', 'a row with no scope.what does not move the circle\'s own parts: waiting (hands)', [holds(w2, L2, u2).holds, fb.door('stands', u2, w2.blocks).waiting.map(x => x.on)], [false, ['hands']]);
}
{
  // Kofi, sole owner of A and of B, transfers all of A's parts to B and all of B's to A; each is accepted `as` the receiving circle.
  const w = new World(), kofi = P(w, 'kofi');
  const A0 = T(found(kofi, { pack: 100, name: 'A' }), 'A'), B0 = T(found(kofi, { pack: 100, name: 'B' }), 'B');
  const tAB = T(sendParts(kofi, A0, 100, { id: B0.hash }), 'tAB');
  const accB = T(as(kofi, B0, 'transfer', { status: 'accepted' }, { answers: tAB.hash }), 'accB');
  const tBA = T(sendParts(kofi, B0, 100, { id: A0.hash }), 'tBA');
  // A's parts now are B's; accepting B's parts `as` A needs a hand of every owner of A: B, which speaks by a block `as` B (Kofi owns every part of B, held for A)
  const accA = T(as(kofi, A0, 'transfer', { status: 'accepted' }, { answers: tBA.hash }), 'accA');
  const cf = T(as(kofi, B0, 'observe', { kind: 'confirm' }, { confirms: accA.hash }), 'cfB');
  const sA = state(w, A0), sB = state(w, B0);
  check('circle as owner', 'both take: A\'s owners are B (100), B\'s owners are A (100); each ends in no person', [sA.owners.map(o => [o.owner === B0.hash, o.amount.value, o.no_person]), sB.owners.map(o => [o.owner === A0.hash, o.amount.value, o.no_person])], [[[true, '100', true]], [[true, '100', true]]]);
  check('circle as owner', 'the ring closes: A\'s yes holds by B\'s hand (Kofi\'s confirm `as` B, his 100 parts of B held toward A added back), and that confirm holds for B by every owner', [holds(w, A0, accA).holds, holds(w, A0, accA).every_owner, handsOf(holds(w, A0, accA)).map(x => [x[0] === B0.hash.slice(0, 6) ? 'B' : x[0], x[1], x[2]]).sort(), holds(w, B0, cf).every_owner], [true, true, [['B', '100', true], ['kofi', '0', false]], true]);
  check('circle as owner', 'nothing is refused: every block of the ring is read', [readCodes(tAB, w), readCodes(tBA, w), readCodes(accA, w), readCodes(accB, w)], [[], [], [], []]);
}
done();
