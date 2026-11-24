// Counted once. W (own line). I5 accepts Sam's £199 (draws £199). Sam delivers; I6 accepted answer that it came: draws nothing more. I7 pays £199 for the deal, after I6: fits, draws nothing more.
const L = require('./lib.cjs'); const { fb, T, tg, check, done, baseWorld, whyOf, A, GBP, instance } = L;
const W = baseWorld({ meter: 'own' }); const { w, amara, sam, ai, G, F } = W;
const o = W.offer(sam, 19.9, {}, 'Sam'), I5 = W.accept(o, 199, 'I5');
const flour = w.blocks.find(x => x.hash === o.state.terms.lines[0].what);
const del = T(sam.write('transfer', { amount: A('10', 'sack') }, { what: flour.hash, to_owner: amara.id, for: o.hash, after: I5.hash }), 'delivery');
const I6 = T(ai.write('transfer', { status: 'accepted' }, { answers: del.hash, under: G.hash, after: del.hash }), 'I6');
const I7 = T(ai.write('transfer', { amount: GBP(199) }, { to_owner: sam.id, for: o.hash, under: G.hash, after: I6.hash }), 'I7');
const onG = m => m.left.find(l => l.of === G.hash).amount.value;
const left = b => { const m = fb.door('meter', G, w.blocks, b); return [m.fits, onG(m)]; };
check('counted once', 'I5 draws £199: fits, £11 left', left(I5), [true, '11']);
check('counted once', 'I6 (the answer that it came) fits and draws nothing more', left(I6), [true, '11']);
const m7 = fb.door('meter', G, w.blocks, I7);
check('counted once', 'I7 pays £199 after I6: fits, draws nothing more (£11 left; it takes nothing on the line)', [whyOf(I7, w), onG(m7), m7.draws.filter(d => d.block === I7.hash).map(d => d.amount)], [null, '11', [null]]);
done();
