const { fb, World, A, kindOf, instance, give, accept, J, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts } = require('./h.cjs');
// ---- S5b: her own tool's make under her grant (the output is hers from that block)
// scope.on is stage 4's: protocol.json does not declare it yet, so this story declares it in memory (a test-only step)
if (!fb.P.scope.includes('on')) fb.P.scope.push('on');
{
  const S = 'S5b tool', w = new World(), leila = P(w, 'leila'), farm = P(w, 'farm'), K = kindOf(leila, 'flour');
  const want = leila.write('promise', { what: 'forty loaves', terms: { quantity: A('40', 'loaf') } }, { from: leila.id, to: leila.id });
  const flour = T(instance(leila, K, { pack: A('20', 'kg') }), 'flour');
  const G = T(leila.write('grant', { kind: 'tool', scope: { types: ['transform'], on: want.hash, limit: A('20', 'kg') } }, { to: farm.id, what: flour.hash }), 'grant to the farm');
  const acc = farm.write('grant', { status: 'accepted' }, { answers: G.hash });
  const m = T(farm.write('transform', { name: 'bake', inputs: [{ from: flour.hash, amount: A('0.5', 'kg') }] }, { derives_from: [flour.hash], under: G.hash }), 'the farm bakes');
  const loaf = farm.write('thing', { name: 'loaf' }, { of: K.hash, derives_from: [m.hash] });
  Q(S, 'the flour (the grant held 20 kg on her line, the farm drew 0.5)', ownS(w, flour));
  Q(S, 'the loaf is hers from the make, no further yes: owner Leila', ownS(w, loaf));
  Q(S, 'who the make speaks for', nm(fb.door('speaks_for', m, w.blocks)));
  const w2 = new World(), l2 = P(w2, 'leila'), f2 = P(w2, 'farm'), K2 = kindOf(l2, 'flour');
  const fl2 = instance(l2, K2, { pack: A('20', 'kg') });
  const m2 = f2.write('transform', { name: 'bake', inputs: [{ from: fl2.hash, amount: A('0.5', 'kg') }] }, { derives_from: [fl2.hash] });
  const loaf2 = f2.write('thing', { name: 'loaf' }, { of: K2.hash, derives_from: [m2.hash] });
  Q(S, 'a stranger\'s make naming her inputs: nothing is hers', J([ownS(w2, loaf2), ownS(w2, fl2)]));
  Q(S, 'she answers accepted to the stranger\'s loaf all the same: still nobody\'s (the make took nothing of hers)', (() => { l2.write('observe', { status: 'accepted', kind: 'accepted' }, { answers: loaf2.hash }); return ownS(w2, loaf2); })());
}
