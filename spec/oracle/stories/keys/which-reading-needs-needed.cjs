const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, deal, sell, day, mkKey } = L;
const stands = (w, b) => fb.door('stands', b, w.blocks);
const std = (w, b) => { const r = stands(w, b); return [r.stands, r.waiting.map(x => x.on)]; };
const DL = '2026-11-20T07:00:00.000Z';
// Which reading needs `needed`. World A: Joe's bond, clocks Wanjiru and Leila, needed 2 (the move is "late"). Wanjiru cuts off late; Leila receipts Joe on time. Expect X Joe's.
{
  const w = new World(), joe = P(w, 'joe'), amara = P(w, 'amara'), wanjiru = P(w, 'wanjiru'), leila = P(w, 'leila');
  const K = kindOf(joe, 'box'), X = T(instance(joe, K, {}), 'X');
  const cond = { without: { signal: 'arrived', by: { names: [joe.id] }, subject: X.hash }, deadline: DL, clocks: { names: [wanjiru.id, leila.id].sort(), needed: 2 } };
  const j1 = T(joe.write('transfer', { condition: cond }, { what: X.hash, to_owner: amara.id }), 'J1');
  amara.write('transfer', { status: 'accepted' }, { answers: j1.hash });
  const arr = joe.write('observe', { kind: 'arrived' }, { subject: X.hash });
  wanjiru.write('observe', { kind: 'cutoff', when: DL }, { subject: j1.hash }, { at: DL });
  wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [arr.hash] });
  const lr = leila.write('observe', { kind: 'receipt' }, { derives_from: [arr.hash] });
  leila.write('observe', { kind: 'cutoff', when: DL }, { subject: j1.hash, derives_from: [lr.hash] }, { at: DL });
  const r = own(w, X);
  check('needed', 'A: Wanjiru says late, Leila says on time: not both clocks say late, X stays Joe\'s (the draw is freed: one line holds the on-time reading, names less needed plus one is 1)', [drawsOf(r).filter(x => x[0] === 'J1').map(x => x.slice(1)), ownersOf(r)], [[[true, null, 'freed']], { owners: [['joe', null]] }]);
}
// World B: Maria, three clocks, needed 2; her stop reaches one; the thief's sale S holds two receipts stating no end before it. Expect S counts. With her stop on two lines: S counts for nothing.
function worldB(order) {
  const w = new World(), maria = P(w, 'maria'), sam = P(w, 'sam'), c1 = P(w, 'c1'), c2 = P(w, 'c2'), c3 = P(w, 'c3');
  const thiefK = mkKey('maria-thief-phone');
  const names = [c1.id, c2.id, c3.id].sort(), by = { [c1.id]: c1, [c2.id]: c2, [c3.id]: c3 }, ln = names.map(n => by[n]);
  const K1 = maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }, { key: thiefK.pub, wait: 'PT0S', reach: 'P1D' }], clocks: { names, needed: 2 } }, { subject: maria.id, updates: maria.id });
  const phone = maria.asKey(thiefK, K1.hash);
  const Kd = kindOf(maria, 'flour'), F = T(instance(phone, Kd, { pack: A('5', 'kg') }), 'F');
  const d = deal(phone, F, sam, A('5', 'kg'));
  const stop = T(maria.write('grant', { kind: 'key', voices: [{ key: maria.key.pub }] }, { subject: maria.id, updates: K1.hash }), 'STOP');
  const S = T(sell(phone, F, sam, d, A('5', 'kg')), 'S');
  const rc = (i, b) => ln[i].write('observe', { kind: 'receipt' }, { derives_from: [b.hash] });
  const rs = order(rc, S, stop);
  // Sam's next block holds the receipts in its past: the join the clock reading needs (the join)
  sam.write('transfer', { status: 'accepted' }, { answers: S.hash, after: rs.map(x => x.hash).sort() });
  return { w, S };
}
{
  // her stop reaches ONE line (line 2, before its receipt of S); S is received with no end before it on lines 0 and 1
  const { w, S } = worldB((rc, S, stop) => [rc(0, S), rc(1, S), rc(2, stop), rc(2, S)]);
  const [stands, waiting] = std(w, S);
  check('needed', 'B: her stop on one of three clocks (any two): S passes the end: it waits only on its reach, not on the end, and is not cut', [waiting.includes('end'), stands === false && waiting.length === 0], [false, false]);
}
{
  // her stop on TWO lines, each before that line's receipt of S: the end is seen on names less needed plus one lines
  const { w, S } = worldB((rc, S, stop) => [rc(0, stop), rc(0, S), rc(1, stop), rc(1, S), rc(2, S)]);
  check('needed', 'B: her stop on two lines: S counts for nothing', std(w, S), [false, []]);
}
done();
