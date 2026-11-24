// Her quantity is the measure. W, plus Amara A3, a second grant naming A1. Its draw on A1: past; an accept under it: not_kept.
const L = require('./lib.cjs'); const { fb, T, check, done, baseWorld, whyOf, grant } = L;
const W = baseWorld(); const { w, amara, harry, ai, G, A1 } = W;
const A3 = T(grant(amara, ai, { types: ['promise'], on: [A1.hash], parties: [harry.id], limit: L.GBP(210), clocks: W.clocks }, { meter: W.meterId }), 'A3');
const H1 = W.offer(harry, 20.5, {}, 'H1'), x = W.accept(H1, 205, 'x', A3);
const m = fb.door('meter', A3, w.blocks), m1 = fb.door('meter', G, w.blocks);
const onA1 = mm => mm.left.find(l => l.of === A1.hash + '#flour').amount.value;
check('Her quantity', 'the first grant holds A1; the second grant\'s draw on A1 (past: nothing of A1 is left for it)', [m1.fits, onA1(m1), m.fits, m.why, onA1(m)], [true, '10', false, 'past', '0']);
check('Her quantity', 'an accept under the second grant: the code', whyOf(x, w), { code: 'not_kept', why: null });
done();
