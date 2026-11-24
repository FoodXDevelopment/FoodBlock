const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, drawsOf, nm: n2 } = L;
// In its place. World A: Harry H1 L7 1 sack; Amara orders (A1); Harry H2 seq 10 prev H1: L7 to Amara; Leila orders (E1); Harry H3 prev H2 seq 7: L7 to Leila.
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), leila = P(w, 'leila');
  const K = kindOf(harry, 'sack'), l7 = T(instance(harry, K, { pack: A('1', 'sack') }), 'L7');
  const dA = deal(harry, l7, amara, A('1', 'sack')), dL = deal(harry, l7, leila, A('1', 'sack'));
  const h2 = T(sell(harry, l7, amara, dA, A('1', 'sack'), { seq: 10 }), 'H2');
  const h3 = T(sell(harry, l7, leila, dL, A('1', 'sack'), { seq: 7 }), 'H3');
  const r = own(w, l7);
  check('in its place', 'World A: ownership(L7)', ownersOf(r), { owners: [['amara', '1']] });
  check('in its place', 'World A: H3 in draws', drawsOf(r).filter(x => x[0] === 'H3'), [['H3', false, 'out_of_place', null]]);
  const ch = fb.door('check_chain', w.blocks.filter(b => b.refs.author === harry.id && b.hash !== harry.id), harry.id);
  check('in its place', 'World A: chain(Harry) lists H3 in broken', ch.broken.includes(h3.hash), true);
}
// World B: one key brought in by two key grants. Amara A0; K1 brings in tablet key T; K2 brings in T again; the lot is T's own; T sells from the line after K1; a block after K2 is off the line.
{
  const w = new World(), amara = P(w, 'amara'), ben = P(w, 'ben'), leila = P(w, 'leila');
  const tk = L.mkKey('amara-tablet');
  const voices = [{ key: amara.key.pub }, { key: tk.pub, wait: 'PT0S' }];
  const k1 = amara.write('grant', { kind: 'key', voices }, { subject: amara.id, updates: amara.id }); T(k1, 'K1');
  const k2 = amara.write('grant', { kind: 'key', voices }, { subject: amara.id, updates: k1.hash }); T(k2, 'K2');
  const c1 = amara.write('observe', { kind: 'confirm' }, { confirms: k1.hash });
  const t1 = amara.asKey(tk, k1.hash, k1.hash);
  const K = kindOf(amara, 'lot');
  const lot = T(instance(t1, K, { pack: A('2', 'sack') }, { after: [c1.hash] }), 'lot');
  const dB = deal(t1, lot, ben, A('1', 'sack')), dL = deal(t1, lot, leila, A('1', 'sack'));
  const sb = T(sell(t1, lot, ben, dB, A('1', 'sack')), 'sale-Ben');
  const c2 = amara.write('observe', { kind: 'confirm' }, { confirms: k2.hash });
  const t2 = amara.asKey(tk, k2.hash, k2.hash);
  const sl = T(sell(t2, lot, leila, dL, A('1', 'sack'), { seq: 1, prev: k2.hash }, {}), 'sale-Leila');
  const r = own(w, lot);
  check('in its place', 'World B: Ben\'s draw', drawsOf(r).filter(x => x[0] === 'sale-Ben').map(x => [x[1], x[3]]), [[true, 'landed']]);
  check('in its place', 'World B: Leila\'s draw is off the line: not_on_chain', drawsOf(r).filter(x => x[0] === 'sale-Leila'), [['sale-Leila', false, 'not_on_chain', null]]);
}
done();
