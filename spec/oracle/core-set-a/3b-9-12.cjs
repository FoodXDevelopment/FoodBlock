const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, drawsOf, mkKey } = L;
// 3b-9 An answer never says "nobody". World: Harry H1 sack Q; Amara orders, H2 Q to Amara; Amara A2 an unrelated block; Leila orders; A3 (prev A2) Q to Leila.
// A reader holding all but A2: { not_shown: true, lacks: [A2] }.
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), leila = P(w, 'leila');
  const K = kindOf(harry, 'sack'), Q = T(instance(harry, K, { pack: A('1', 'sack') }), 'Q');
  const dA = deal(harry, Q, amara, A('1', 'sack'));
  const h2 = T(sell(harry, Q, amara, dA, A('1', 'sack')), 'H2');
  const a2 = T(amara.write('observe', { kind: 'note' }), 'A2');
  const dL = deal(amara, Q, leila, A('1', 'sack')); // Leila orders of Amara, who then owns Q (1.9 3c-1: the order is the buyer's)
  // A3 is made after H2 (it has H2 in its past): whether a draw takes is read from its own causal past
  const a3 = T(amara.write('transfer', { amount: A('1', 'sack') }, { what: Q.hash, to_owner: leila.id, for: dL.o.hash, after: [dL.a.hash, h2.hash].sort() }), 'A3');
  const all = own(w, Q);
  check('3b-9', 'a reader holding everything: Leila owns Q, the answer names what it read', [ownersOf(all), all.read.length > 0, Array.isArray(all.pair)], [{ owners: [['leila', '1']] }, true, true]);
  check('3b-9', 'a reader holding all but A2: not shown, lacks [A2] (never not_owner)', ownersOf(fb.door('ownership', Q, w.blocks.filter(b => b !== a2))), { not_shown: true, lacks: ['A2'] });
}
// 3b-10 Words shown with a thing. World: Harry H0; a thief with Harry's phone signs H5: Q to Amara; Amara accepts. Harry's card H6: an observe "not me" naming H5.
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), phoneK = mkKey('harry-phone');
  const kg = harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, { key: phoneK.pub, wait: 'PT0S' }] }, { subject: harry.id, updates: harry.id });
  const c = harry.write('observe', { kind: 'confirm' }, { confirms: kg.hash });
  const phone = harry.asKey(phoneK, kg.hash);
  const K = kindOf(harry, 'sack'), Q = T(instance(phone, K, { pack: A('1', 'sack') }, { after: [c.hash] }), 'Q');
  const h5 = T(phone.write('transfer', { amount: A('1', 'sack') }, { what: Q.hash, to_owner: amara.id }), 'H5');
  amara.write('transfer', { status: 'accepted' }, { answers: h5.hash });
  const h6 = T(harry.write('observe', { kind: 'reading', note: 'not me' }, { subject: h5.hash }), 'H6');
  const r = own(w, Q);
  check('3b-10', 'ownership(Q) is Amara\'s and shows H6 as named_by', [ownersOf(r), r.named_by.map(x => [tg(x.block), nm(x.by), x.own, x.pair, x.ref])], [{ owners: [['amara', '1']] }, [['H6', 'harry', true, false, 'subject']]]);
  check('3b-10', 'no standing in the answer', 'standing' in r, false);
  // 3b-11 What a key hands on: identity_state lists, per voice, whether it states passes
  check('3b-11', 'identity_state(Harry): P states no passes', fb.door('identity_state', harry.id, w.blocks).voices.map(v => v.passes), [false, false]);
  const w2 = new World(), h2 = P(w2, 'harry2'), pk2 = mkKey('harry2-phone');
  const g2 = h2.write('grant', { kind: 'key', voices: [{ key: h2.key.pub }, { key: pk2.pub, wait: 'PT0S', passes: true }] }, { subject: h2.id, updates: h2.id });
  h2.write('observe', { kind: 'confirm' }, { confirms: g2.hash });
  check('3b-11', 'World B: P states passes: true: identity_state shows it', fb.door('identity_state', h2.id, w2.blocks).voices.map(v => v.passes), [false, true]);
}
// 3b-12 What landed stays: text only; the vector of 03-amounts story 19 keeps its answer. No world.
done();
