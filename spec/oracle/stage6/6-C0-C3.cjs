// C0 what a circle is, C1 parts, C2 whose the circle's things are, C3 owners unsaid (changes-1.9/06-circles.md section 3).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, cafe, found, GBP, part, as, state, holds, speaks, ownPart, readCodes, sendParts, yesTo, owners, r1 } = L;
{
  // C0. Amara signs B1 `as` F, a £120 order of milk. B1 is Amara's word; it speaks for the café's owners because r1 holds for it. F itself never signs.
  const W = cafe(); const { w, amara, harry, F } = W;
  const B1 = T(as(amara, F, 'promise', { terms: { quantity: A('10', 'litre'), price: { amount: GBP(12), per: A('1', 'litre') } } }, { from: harry.id, to: F.hash }), 'B1');
  const h = holds(w, F, B1);
  check('C0', 'B1 is Amara\'s own word, signed by her key; it speaks for the circle: speaks_for', fb.door('speaks_for', B1, w.blocks) === F.hash, true);
  check('C0', 'it holds because r1 holds for it (row 0), not by every owner', [h.holds, h.row, h.every_owner], [true, 0, false]);
  check('C0', 'F itself never signs: the circle\'s founding block is its founder\'s word, and speaks for her', fb.door('speaks_for', F, w.blocks) === amara.id, true);
}
{
  // C1. F; P1. Amara 50, 50 held. P2. Amara 50, Leila 50. A transfer of 2.5 part to Maria takes nothing (`unit`).
  const W = cafe({ noparts: true }); const { w, amara, leila, maria, F } = W;
  const P1 = T(sendParts(amara, F, 50, leila), 'P1');
  check('C1', 'after P1: Amara 50, 50 held', [ownPart(w, F).owners, ownPart(w, F).held, ownPart(w, F).draws], [[['amara', '50']], '50', [['P1', true, null, 'held']]]);
  const P2 = T(yesTo(leila, P1), 'P2');
  check('C1', 'after P2: Amara 50, Leila 50', ownPart(w, F).owners, [['amara', '50'], ['leila', '50']]);
  const X = T(amara.write('transfer', { amount: A('2.5', 'part') }, { what: F.hash, to_owner: maria.id }), 'X');
  check('C1', 'a transfer of 2.5 part takes nothing: unit', ownPart(w, F).draws.find(d => d[0] === 'X').slice(1), [false, 'unit', null]);
  // pack is whole parts of at least 1, with no `of`
  const bad = [{ value: '0', unit: 'part' }, { value: '2.5', unit: 'part' }, { value: '10', unit: 'sack' }, { value: '10', unit: 'part', of: kindOf(amara, 'k').hash }];
  check('C1', 'a pack that is not whole parts of at least 1 (0, 2.5, another unit, an `of`) is refused: shape', bad.map(p => readCodes(amara.make('actor', { kind: 'circle', pack: p }, {}), w)), bad.map(() => ['shape']));
  check('C1', '`pack` never changes: a version that states another pack changes nothing in the parts', (() => { const v = as(amara, F, 'actor', { kind: 'circle', pack: part(5) }, { updates: F.hash }); return fb.door('circle_state', F.hash, w.blocks).pack.value; })(), '100');
}
{
  // C2. The café holds 1,000 sacks (a thing signed `as` F under r1). Leila's own key, not `as` F, signs a transfer of 10 sacks to her stall: not_owner.
  const W = cafe(); const { w, amara, leila, maria, F } = W;
  const Kd = kindOf(amara, 'flour');
  const S = T(instance(amara, Kd, { pack: A('1000', 'sack') }, { as: F.hash }), 'SACKS');
  check('C2', 'the sacks are the circle\'s (the thing is signed as F under r1)', [fb.door('speaks_for', S, w.blocks) === F.hash, ownPart(w, S).owners.map(o => o[0])], [true, [F.hash.slice(0, 6)]]);
  const X = T(leila.write('transfer', { amount: A('10', 'sack') }, { what: S.hash, to_owner: maria.id }), 'X');
  check('C2', 'Leila\'s own word acts only on what is wholly hers: takes nothing (not_owner)', ownPart(w, S).draws.find(d => d[0] === 'X').slice(1), [false, 'not_owner', null]);
}
{
  // C3. A circle that states no pack leaves its owners unsaid. A row that counts parts is refused (shape); { to, needed, scope } is valid; circle_state answers owners { not_said }.
  const w = new World(), wanjiku = P(w, 'wanjiku'), otieno = P(w, 'otieno');
  const scope = { types: ['promise', 'transfer'] };
  const bad = wanjiku.make('actor', { kind: 'circle', rules: [{ parts: 1, scope }] }, {});
  check('C3', 'a row that counts parts on a circle with no pack: shape', readCodes(bad, w), ['shape']);
  const ids = [wanjiku.id, otieno.id].sort();
  const W = T(wanjiku.write('actor', { kind: 'circle', rules: [{ to: ids, needed: 1, scope }] }, {}), 'W');
  check('C3', 'the { to, needed, scope } row is valid', readCodes(W, w), []);
  const cs = fb.door('circle_state', W.hash, w.blocks);
  check('C3', 'circle_state: owners { not_said: true }', cs.owners, { not_said: true });
  const bad2 = wanjiku.make('actor', { kind: 'circle', rules: [{ to: ids, needed: 'all', scope }] }, {});
  check('C3', 'a row\'s number is whole and at least 1, never `all`: shape', readCodes(bad2, w), ['shape']);
}
done();
