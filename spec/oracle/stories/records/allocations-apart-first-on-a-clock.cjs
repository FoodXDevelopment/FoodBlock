const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, mkKey } = L;
// Allocations apart, and first on a clock. World A: Maria's open offer O of 10 loaves; her phone allocates 6 to Leila; her till allocates 6 to Ben; neither in the other's past.
// Expect both over_allocated: true, neither takes, both bind Maria.
function open10(mkTill) {
  const w = new World(), maria = P(w, 'maria'), leila = P(w, 'leila'), ben = P(w, 'ben');
  const tillK = mkKey('maria-till');
  const kg = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: tillK.pub, wait: 'PT0S' }] }, { subject: maria.id, updates: maria.id });
  const c = maria.write('observe', { kind: 'confirm' }, { confirms: kg.hash });
  const till = maria.asKey(tillK, kg.hash);
  till.write('observe', { kind: 'note' }, { after: [c.hash] });
  const K = kindOf(maria, 'loaf'), loaves = instance(maria, K, { pack: A('10', 'loaf') });
  const O = T(maria.write('promise', { terms: require('../kit.cjs').linesFor(loaves, { quantity: A('10', 'loaf') }) }, { from: maria.id }), 'O');
  const req = (who, n) => who.write('promise', { status: 'accepted', terms: { lines: [{ id: 'goods', quantity: A(n, 'loaf') }] } }, { answers: O.hash, for: O.hash, after: [O.hash] });
  const rL = req(leila, '6'), rB = req(ben, '6');
  const alloc = (signer, r, n, label) => T(signer.write('promise', { status: 'accepted', terms: { lines: [{ id: 'goods', quantity: A(n, 'loaf') }] } }, { answers: r.hash, for: O.hash, after: [r.hash, ...(signer === maria ? [] : [])] }), label);
  return { w, maria, till, O, rL, rB, alloc, leila, ben };
}
{
  const { w, maria, till, O, rL, rB, alloc } = open10();
  const aP = alloc(maria, rL, '6', 'phone-alloc'), aT = alloc(till, rB, '6', 'till-alloc');
  const st = fb.door('promise_stage', O, w.blocks, {});
  check('allocated apart', 'A: over_allocated, both 6 shown, neither takes', [st.over_allocated, st.takers.map(t => [tg(t.allocation), t.over_allocated]).sort()], [true, [['phone-alloc', true], ['till-alloc', true]]]);
}
{
  const { w, maria, O, rL, rB, alloc } = open10();
  const a1 = alloc(maria, rL, '6', 'first'), a2 = alloc(maria, rB, '6', 'second');
  const st = fb.door('promise_stage', O, w.blocks, {});
  check('allocated apart', 'one line, ordered by prev: the first takes, the second is over the offer', st.takers.map(t => [tg(t.allocation), t.over_allocated]).sort(), [['first', false], ['second', true]]);
}
// World B: Sam's crate C1; S1 lets C1 go with a clock (Wanjiru, needed 1). Ben B1 takes C1 (a first use); Leila E1 takes it, dated an hour earlier. Wanjiru W1 receipts B1; W2 receipts E1.
// Expect Ben first owner (the receipts' places on her line, never the dates).
{
  const w = new World(), sam = P(w, 'sam'), ben = P(w, 'ben'), leila = P(w, 'leila'), wanjiru = P(w, 'wanjiru');
  const K = kindOf(sam, 'crate'), C1 = T(instance(sam, K, {}), 'C1');
  const s1 = T(sam.write('transfer', { count: 1, clocks: { names: [wanjiru.id], needed: 1 } }, { what: C1.hash }), 'S1');
  const b1 = T(ben.write('transform', { name: 'use' }, { subject: C1.hash, after: [s1.hash] }, { at: L.day(10, 12) }), 'B1');
  const e1 = T(leila.write('transform', { name: 'use' }, { subject: C1.hash, after: [s1.hash] }, { at: L.day(10, 11) }), 'E1');
  wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [s1.hash] });
  const first = (list) => { const r = fb.door('ownership', C1, w.blocks); return r.not_shown ? 'not_shown' : r.owners.map(o => nm(o.owner)).sort(); };
  check('first on a clock', 'B: before any receipt neither came first: no owner', first(), []);
  const w1 = wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [b1.hash] });
  const w2 = wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [e1.hash] });
  check('first on a clock', 'B: Wanjiru receipted Ben first: Ben is the first owner', first(), ['ben']);
}
done();
