// Blocks that bind, Due. W, a deal with waits_on: goods. I8 pays £199 Wednesday before Amara's accept of the flour: not_due; to_come_back lists it. With her accept in its past: true, draws nothing more.
// Under a grant without transfer: not_live.
const L = require('./lib.cjs'); const { fb, T, tg, check, done, baseWorld, whyOf, A, GBP, per, promise, grant } = L;
const W = baseWorld({ meter: 'own' }); const { w, amara, sam, ai, G, F, friday } = W;
// her want carries waits_on goods
const A9 = T(promise(amara, { to: amara.id }, { lines: [{ id: 'flour', what: F.hash, quantity: A('10', 'sack'), price: { max: per(21, 'GBP', 'sack') } }], pay_by: { min: 'P3D' }, deliver_by: friday, waits_on: 'goods' }), 'A9');
const G9 = T(grant(amara, ai, { types: ['promise', 'observe', 'transfer'], on: [A9.hash], parties: [sam.id], limit: GBP(210) }, { meter: ai.id }), 'G9');
const nopay = T(grant(amara, ai, { types: ['promise'], on: [A9.hash], parties: [sam.id], limit: GBP(210) }, { meter: ai.id }), 'Gnopay');
const o = W.offer(sam, 19.9, { terms: { waits_on: 'goods' } }, 'Sam'), I5 = W.accept(o, 199, 'I5', G9);
const flour = w.blocks.find(x => x.hash === o.state.terms.lines[0].what);
const del = T(sam.write('transfer', { amount: A('10', 'sack') }, { what: flour.hash, to_owner: amara.id, for: o.hash, after: I5.hash }), 'delivery');
const I8 = T(ai.write('transfer', { amount: GBP(199) }, { to_owner: sam.id, for: o.hash, under: G9.hash, after: del.hash }), 'I8');
check('Due', 'I8 pays £199 before Amara\'s accept of the flour', whyOf(I8, w), { code: 'not_due', why: null });
check('Due', 'to_come_back lists the payment', fb.door('to_come_back', amara.id, w.blocks).to_come.map(x => [tg(x.block), x.amount.value]), [['I8', '199']]);
const acc = T(amara.write('transfer', { status: 'accepted' }, { answers: del.hash }), 'amara-accept');
const I9 = T(ai.write('transfer', { amount: GBP(199) }, { to_owner: sam.id, for: o.hash, under: G9.hash, after: acc.hash }), 'I9');
const m = fb.door('meter', G9, w.blocks, I9);
check('Due', 'with her accept in its past: true, draws nothing more (I5 drew the deal; I9 takes nothing on the line)', [whyOf(I9, w), m.draws.filter(d => d.block === I9.hash).map(d => d.amount)], [null, [null]]);
const x = T(ai.write('transfer', { amount: GBP(199) }, { to_owner: sam.id, for: o.hash, under: nopay.hash, after: acc.hash }), 'Ino');
check('Due', 'under a grant without transfer', whyOf(x, w), { code: 'not_live', why: null });
done();
