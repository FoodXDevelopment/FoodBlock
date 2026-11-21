const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, drawsOf, codes, sha } = L;
// 3b-7 Read whole, narrow, and what a header hides. World: Harry H1 sack Q, H2 sack R; H3..H202 200 sales of other sacks, H50 names a deal D Wanjiru does not hold;
// Wanjiru orders Q; H203 Q to Wanjiru.
function build() {
  const w = new World(), harry = P(w, 'harry'), wanjiru = P(w, 'wanjiru'), sam = P(w, 'sam');
  const K = kindOf(harry, 'sack'), Q = T(instance(harry, K, { pack: A('1', 'sack') }), 'Q'); instance(harry, K, { pack: A('1', 'sack') });
  let h50 = null, orderD = null;
  for (let i = 3; i <= 202; i++) {
    const S = instance(harry, K, { pack: A('1', 'sack') });
    if (i === 50) { orderD = sam.write('promise', { terms: { quantity: A('1', 'sack') } }, { from: sam.id, to: harry.id, what: S.hash }); h50 = T(harry.write('transfer', { amount: A('1', 'sack') }, { what: S.hash, to_owner: sam.id, for: orderD.hash }), 'H50'); }
  }
  const dW = deal(harry, Q, wanjiru, A('1', 'sack'));
  const h203 = T(sell(harry, Q, wanjiru, dW, A('1', 'sack')), 'H203');
  return { w, Q, h50, orderD, harry };
}
{
  const { w, Q, h50, orderD } = build();
  const store = w.blocks.filter(b => b !== orderD);
  const r = fb.door('ownership', Q, store);
  check('3b-7', 'A: H50 names a deal D she lacks: it is not read', codes(fb.door('read', h50, store)), ['names_missing']);
  check('3b-7', 'A: ownership(Q) is Wanjiru\'s', ownersOf(r), { owners: [['wanjiru', '1']] });
  // B: she holds H50 only as its header
  const store2 = store.filter(b => b !== h50).concat([{ header: fb.door('header', h50), header_signature: h50.signature }]);
  const r2 = fb.door('ownership', Q, store2);
  check('3b-7', 'B: H50 held only as its header: ownership(Q) not shown, H50 in lacks', ownersOf(r2), { not_shown: true, lacks: ['H50'] });
  // a sale that names Q, held and not read, leaves the answer not shown even where no draw this reader read reaches it
  const store3 = store.filter(b => b !== w.blocks[0]);
  check('3b-7', 'a block of the line not held at all: not shown', ownersOf(fb.door('ownership', Q, w.blocks.filter(b => b !== h50))).not_shown, true);
}
done();
