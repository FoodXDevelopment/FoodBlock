// A grant from a row, anyone who owns no part, hands (circles.md).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, cafe, found, GBP, part, per, as, confirm, state, holds, speaks, ownPart, sendParts, yesTo, readCodes, handsOf, r1, day } = L;
const milk = (price = 12) => ({ terms: { lines: [{ id: 'goods', quantity: A('10', 'litre'), price: { amount: GBP(price), per: A('1', 'litre') } }] } });
{
  // Leila signs `as` F, under r1, a grant to her cousin's AI with each £5,000: no row holds for it (wider than r1's each); it waits (hands) and acts on nothing;
  // Amara's confirm makes it hold, by every owner together. The same with each £100: holds by r1. The same naming Harry in `parties`: holds (r1 names no `parties`).
  {
    const W = cafe(); const { w, amara, leila, F, Tm } = W; const cousin = P(w, 'cousin-ai');
    const G = T(as(leila, F, 'grant', { kind: 'tool', scope: { types: ['promise'], each: GBP(5000) } }, { to: cousin.id, meter: Tm }), 'G');
    const h = holds(w, F, G);
    check('grant from a row', 'a grant `as` F with each £5000 against r1\'s £300: no row holds; it waits on hands, read finds nothing, and it acts on nothing', [h.holds, h.row, fb.door('stands', G, w.blocks).waiting.map(x => x.on), readCodes(G, w), fb.door('speaks_for', G, w.blocks)], [false, null, ['hands'], [], null]);
    confirm(amara, G);
    const h2 = holds(w, F, G);
    check('grant from a row', 'Amara confirms: it holds by every owner together', [h2.holds, h2.row, h2.every_owner], [true, null, true]);
  }
  for (const [name, scope] of [['each £100', { types: ['promise'], each: GBP(100) }], ['each £100 naming Harry in parties (r1 names no parties)', { types: ['promise'], each: GBP(100), parties: ['HARRY'] }], ['no each and a limit of £250 (no higher than r1\'s each)', { types: ['promise'], limit: GBP(250) }]]) {
    const W = cafe(); const { w, leila, harry, F, Tm } = W; const cousin = P(w, 'cousin-ai');
    const sc = JSON.parse(JSON.stringify(scope).replace('HARRY', harry.id));
    const G = T(as(leila, F, 'grant', { kind: 'tool', scope: sc }, { to: cousin.id, meter: Tm }), 'G');
    check('grant from a row', 'a grant `as` F with ' + name + ': holds by r1, and read finds nothing', [holds(w, F, G).holds, holds(w, F, G).row, readCodes(G, w)], [true, 0, []]);
  }
  // a type r1 does not name is wider too; so is a limit above r1\'s each with no each
  for (const [name, scope] of [['a type outside the row\'s types (actor)', { types: ['promise', 'actor'], each: GBP(100) }], ['no each and a limit of £500 (above r1\'s each)', { types: ['promise'], limit: GBP(500) }]]) {
    const W = cafe(); const { w, leila, F, Tm } = W; const cousin = P(w, 'cousin-ai');
    const G2 = T(as(leila, F, 'grant', { kind: 'tool', scope }, { to: cousin.id, meter: Tm }), 'G2');
    check('grant from a row', name + ': wider than r1, so no row holds; it waits on hands', [holds(w, F, G2).holds, fb.door('stands', G2, w.blocks).waiting.map(x => x.on), readCodes(G2, w)], [false, ['hands'], []]);
  }
}
{
  // Amara signs `as` F, under r1, grant G to Joe. Joe orders milk under G: speaks for the café's owners. Amara then stops G `as` F under r1: holds; Joe's later blocks under G count for nothing (The cut). Joe's own stop of G: holds alone.
  // (G here is the staff grant of lib.cjs `staffWorld`, under the text's plain r1: types promise, transfer; each £100; limit £250; on A1 (the café's want of milk); parties Harry; meter T.)
  const { w, amara, joe, F, G, offer, order } = L.staffWorld();
  check('owns no part', 'G is a grant of the circle: it holds by r1 and is read', [holds(w, F, G).holds, readCodes(G, w)], [true, []]);
  const J1 = order(offer('H1'), 'J1');
  check('owns no part', 'Joe orders milk under G: it speaks for the café\'s owners', [fb.door('under_ok', J1, w.blocks), fb.door('speaks_for', J1, w.blocks) === F.hash], [true, true]);
  check('owns no part', 'Joe owns no part: his order `as` F with no grant acts on nothing', (() => { const j = T(as(joe, F, 'observe', { kind: 'note' }), 'J0'); return [holds(w, F, j).holds, fb.door('speaks_for', j, w.blocks)]; })(), [false, null]);
  const S = T(as(amara, F, 'grant', { kind: 'tool', status: 'stopped', stop: 'onward' }, { updates: G.hash }), 'S');
  check('owns no part', 'Amara\'s stop of G `as` F under r1 holds (r1 names grant)', holds(w, F, S).holds, true);
  const J2 = order(offer('H2'), 'J2', { after: [S.hash] });
  check('owns no part', 'Joe\'s later block under G counts for nothing: it is his own word', [fb.door('under_ok', J2, w.blocks), fb.door('speaks_for', J2, w.blocks)], [false, joe.id]);
  check('owns no part', 'his earlier order still stands', fb.door('speaks_for', J1, w.blocks) === F.hash, true);
}
{
  // In Keeps to, refs.as is the block's own, like author: the café's own want (signed `as` F, to F) can be kept to by Harry's offer, and Joe, a tool, buys for the café under it
  const w = new World(), amara = P(w, 'amara'), leila = P(w, 'leila'), harry = P(w, 'harry'), joe = P(w, 'joe'), till = P(w, 'till');
  const F = T(found(amara, { pack: 100, rules: [L.r1()], meter: till.id, name: 'cafe' }), 'F');
  const P1 = L.sendParts(amara, F, 50, leila), P2 = L.yesTo(leila, P1);
  const milk = kindOf(amara, 'milk');
  const AF = T(as(amara, F, 'promise', { terms: { lines: [{ id: 'milk', what: milk.hash, quantity: A('10', 'litre'), price: { max: per(1.5, 'litre') } }], pay_by: { min: 'P3D' }, deliver_by: day(5, 12) } }, { to: F.hash, after: [P2.hash] }), 'AF');
  const G = T(as(amara, F, 'grant', { kind: 'tool', scope: { types: ['promise', 'transfer'], on: [AF.hash], parties: [harry.id], each: GBP(100), limit: GBP(250) } }, { to: joe.id, meter: till.id, after: [AF.hash] }), 'G');
  const inst = instance(harry, milk, { pack: A('10', 'litre') });
  const H = T(harry.write('promise', { terms: { lines: [{ id: 'milk', what: inst.hash, quantity: A('10', 'litre'), price: per(1.2, 'litre') }], pay_by: 'P4D', deliver_by: day(5, 12) } }, { from: harry.id, to: F.hash }), 'H');
  check('owns no part', 'Harry\'s offer keeps to the café\'s want signed `as` F (refs.as is the block\'s own, like author)', fb.door('keeps_to', H, AF, w.blocks), { keeps: true, why: null });
  const J = T(joe.write('promise', { status: 'accepted', draws: { grant: G.hash, amount: GBP(12) } }, { answers: H.hash, for: H.hash, under: G.hash }), 'J'); till.write('observe', { kind: 'receipt' }, { derives_from: [J.hash] });
  check('owns no part', 'Joe accepts it under G: it speaks for the café\'s owners (a tool buys for a circle)', [fb.door('under_ok', J, w.blocks), fb.door('speaks_for', J, w.blocks) === F.hash], [true, true]);
}
{
  const { w, joe, G, offer, order } = L.staffWorld();
  T(joe.write('grant', { status: 'stopped', stop: 'onward' }, { updates: G.hash }), 'S2');
  const J3 = order(offer('H3'), 'J3');
  check('owns no part', 'Joe\'s own stop of G ends his place under it alone, with no row: his next block under G is not live', fb.door('under_ok', J3, w.blocks), false);
}
{
  // Amara signs the £900 order. Leila transfers her 50 part to Maria; then Leila confirms the order, the transfer in her confirm's past. Leila's hand counts 0; 50 of 100; waits. Maria confirms. Holds.
  const W = cafe(); const { w, amara, leila, maria, harry, F } = W;
  const O = T(as(amara, F, 'promise', { terms: { lines: [{ id: 'goods', quantity: A('1', 'oven'), price: GBP(900) }] } }, { from: harry.id, to: F.hash }), 'ORDER');
  const tr = T(sendParts(leila, F, 50, maria), 'TR');
  const c1 = T(confirm(leila, O), 'LC');
  let h = holds(w, F, O);
  check('hands', 'Leila\'s hand counts 0, Amara\'s 50: 50 of 100, it waits (hands)', [h.holds, handsOf(h).map(x => [x[0], x[1], x[2]]).sort(), fb.door('stands', O, w.blocks).waiting.map(x => x.on)], [false, [['amara', '50', true], ['leila', '0', false]], ['hands']]);
  yesTo(maria, tr);
  const c2 = T(confirm(maria, O, {}, { after: [c1.hash] }), 'MC');
  h = holds(w, F, O);
  check('hands', 'Maria accepted and confirms: Amara 50 and Maria 50 are every part persons own; holds', [h.holds, h.every_owner], [true, true]);
  // what stands stays: Leila confirmed first, and it held at her confirm (Amara 50 + Leila 50 of 100); her sale afterwards takes nothing back
  const W2 = cafe(); const w2 = W2.w;
  const O2 = T(as(W2.amara, W2.F, 'promise', { terms: { lines: [{ id: 'goods', quantity: A('1', 'oven'), price: GBP(900) }] } }, { from: W2.harry.id, to: W2.F.hash }), 'ORDER2');
  const lc = confirm(W2.leila, O2);
  const tr2 = sendParts(W2.leila, W2.F, 50, W2.maria); yesTo(W2.maria, tr2);
  const mc = confirm(W2.maria, O2, {}, { after: [lc.hash] });
  const h2 = holds(w2, W2.F, O2);
  check('hands', 'Leila confirmed before she sold: it held at her confirm and stays held (what stands stays)', [h2.holds, handsOf(h2).map(x => [x[0], x[2]]).sort()], [true, [['amara', true], ['leila', true]]]);
}
done();
