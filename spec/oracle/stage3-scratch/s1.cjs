const { fb, World, A, kindOf, instance, give, accept, J, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts } = require('./h.cjs');
// ---- S2: 200 g from a 1 kg bag
{
  const S = 'S2 200 g from 1 kg';
  const w2 = new World(), mar = P(w2, 'maria'), K2 = kindOf(mar, 'flour'), bag2 = T(instance(mar, K2, { pack: A('1', 'kg') }), 'bag');
  const mk = mar.write('transform', { name: 'bake 0.2', inputs: [{ from: bag2.hash, amount: A('0.2', 'kg') }] }, { derives_from: [bag2.hash] }); T(mk, 'make0.2');
  const loaf = mar.write('thing', { name: 'loaf' }, { of: K2.hash, derives_from: [mk.hash] });
  Q(S, 'make with inputs 0.2 kg: bag', ownS(w2, bag2));
  Q(S, 'the loaf', ownS(w2, loaf));
  const mg = mar.write('transform', { name: 'bake 200 g', inputs: [{ from: bag2.hash, amount: A('200', 'g') }] }, { derives_from: [bag2.hash] }); T(mg, 'make200g');
  const loaf2 = mar.write('thing', { name: 'loaf2' }, { of: K2.hash, derives_from: [mg.hash] });
  Q(S, 'then a make written 200 g: bag', ownS(w2, bag2));
  Q(S, 'the loaf of the 200 g make', ownS(w2, loaf2));
  const ama = P(w2, 'amara');
  const t9 = T(give(mar, bag2, ama, A('0.9', 'kg')), 'to Amara 0.9');
  Q(S, 'then 0.9 kg to Amara: past', ownS(w2, bag2));
  const t8 = T(give(mar, bag2, ama, A('0.8', 'kg')), 'to Amara 0.8');
  Q(S, 'then 0.8 kg: takes, held', ownS(w2, bag2));
  accept(ama, t8);
  Q(S, 'Amara accepts: Amara 0.8, ended 0.2', ownS(w2, bag2));
}
// ---- S3: 0.6 and 0.6 from a 1 kg sack
{
  const S = 'S3 0.6 + 0.6', w = new World(), harry = P(w, 'harry'), maria = P(w, 'maria'), amara = P(w, 'amara'), sam = P(w, 'sam'), K = kindOf(harry, 'flour');
  const sack = T(instance(harry, K, { pack: A('1', 'kg') }), 'sack');
  // Maria's order: Harry's offer, her accept
  const o1 = offer(harry, harry, maria, sack, { quantity: A('0.6', 'kg'), price: A('1', 'GBP') });
  const a1 = accepts(maria, o1);
  const t1 = T(give(harry, sack, maria, A('0.6', 'kg'), { for: o1.hash, after: a1.hash }), 'to Maria 0.6 (inside her order)');
  Q(S, 'first 0.6 to Maria inside her order: lands at once (her yes is in its past)', ownS(w, sack));
  // Amara's order, her money
  const o2 = offer(harry, harry, amara, sack, { quantity: A('0.6', 'kg'), price: A('1', 'GBP') });
  const a2 = accepts(amara, o2);
  const pay = amara.write('transfer', { amount: A('1', 'GBP') }, { to_owner: harry.id, for: o2.hash });
  accept(harry, pay, {}, { for: o2.hash });
  const t2 = T(give(harry, sack, amara, A('0.6', 'kg'), { for: o2.hash, after: a2.hash }), 'to Amara 0.6');
  Q(S, 'second 0.6 to Amara: past', ownS(w, sack));
  const st = fb.door('promise_stage', o2, w.blocks, {});
  Q(S, 'Amara\'s deal: stage / lines moved / uncovered', J([st.stage, st.lines, st.uncovered]));
  const t3 = T(give(harry, sack, sam, null), 'all he owns to Sam');
  accept(sam, t3);
  Q(S, 'all he owns to Sam: takes 0.4', ownS(w, sack));
}
// ---- S4: a baked sack, then sold
{
  const S = 'S4 baked then sold', w = new World(), harry = P(w, 'harry'), sam = P(w, 'sam'), K = kindOf(harry, 'flour');
  const sack = T(instance(harry, K, { pack: A('25', 'kg') }), 'sack');
  const m = T(harry.write('transform', { name: 'bake' }, { derives_from: [sack.hash] }), 'bake whole');
  const loaf = harry.write('thing', { name: 'loaf' }, { of: K.hash, derives_from: [m.hash] });
  const t = T(give(harry, sack, sam, null), 'sale of the sack');
  accept(sam, t);
  Q(S, 'the sack: the sale takes nothing', ownS(w, sack));
  Q(S, 'the loaf is Harry\'s', ownS(w, loaf));
}
// ---- S5: bread from another's flour
{
  const S = 'S5 toll', w = new World(), maria = P(w, 'maria'), harry = P(w, 'harry'), K = kindOf(maria, 'flour');
  const flour = T(instance(maria, K, { pack: A('2', 'kg') }), 'flour');
  const m = T(harry.write('transform', { name: 'bake' }, { derives_from: [flour.hash] }), 'Harry\'s make, no grant');
  const loaf = harry.write('thing', { name: 'loaf' }, { of: K.hash, derives_from: [m.hash] });
  Q(S, 'no grant: the flour', ownS(w, flour));
  Q(S, 'no grant: the loaf (no owner)', ownS(w, loaf));
  // under her grant
  const w2 = new World(), mar = P(w2, 'maria'), har = P(w2, 'harry'), K2 = kindOf(mar, 'flour'), fl = T(instance(mar, K2, { pack: A('2', 'kg') }), 'flour');
  const G = T(mar.write('grant', { kind: 'toll', scope: { types: ['transform'], limit: A('0.5', 'kg') } }, { to: har.id, what: fl.hash }), 'grant 0.5 kg to Harry');
  const m2 = T(har.write('transform', { name: 'bake', inputs: [{ from: fl.hash, amount: A('0.5', 'kg') }] }, { derives_from: [fl.hash], under: G.hash }), 'make under the grant');
  const loaf2 = har.write('thing', { name: 'loaf' }, { of: K2.hash, derives_from: [m2.hash] });
  Q(S, 'under her grant: the flour', ownS(w2, fl));
  Q(S, 'under her grant: the loaf, before her yes', ownS(w2, loaf2));
  const acc = T(mar.write('observe', { status: 'accepted', kind: 'accepted' }, { answers: loaf2.hash }), 'her accepted answer');
  Q(S, 'under her grant: the loaf after her accepted answer', ownS(w2, loaf2));
}
