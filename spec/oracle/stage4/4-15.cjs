// G15, take the lowest (T2-12). W with deadline Wednesday 12:00, fallback lowest. N receipts Harry £205 (N1), Sam £199 expiring Wednesday 18:00 (N2); N3 cutoff through Wednesday 12:00. FoodX receipts Harry's later.
// I9 accepts Harry on Tuesday: counts for nothing. After N3: I10 accepts Sam: true. I11 accepts Harry: after_deadline. lowest_offer: Sam, cutoff N3; before N3, pending.
// (N receipts each accept too: "received on the meter's line" is how the line shows an accept before or after the cutoff.)
const L = require('./lib.cjs'); const { fb, T, tg, check, done, baseWorld, whyOf, A, GBP, day, receipt } = L;
const W = baseWorld({ scope: { deadline: day(3, 12), fallback: 'lowest' } }); const { w, amara, harry, sam, ai, G, n0, f0 } = W;
const hOffer = W.offer(harry, 20.5, {}, 'Harry'), sOffer = W.offer(sam, 19.9, { terms: { expires: day(3, 18) } }, 'Sam');
const N1 = T(receipt(n0, hOffer), 'N1'), N2 = T(receipt(n0, sOffer), 'N2');
const F1 = T(receipt(f0, hOffer), 'F-Harry');
const I9 = W.accept(hOffer, 205, 'I9'), N9 = T(receipt(n0, I9), 'N-I9');
const before = w.blocks.slice();
check('G15', 'before N3, lowest_offer is pending', fb.door('lowest_offer', G, before).why, 'pending');
// Mill Lane's £190, expiring Wednesday 10:00: N's line cuts its expiry off before the deadline's cutoff, so it does not stand there (an offer's own date orders nothing)
const mOffer = W.offer(W.mill, 19, { terms: { expires: day(3, 10) } }, 'Mill'), NM = T(receipt(n0, mOffer), 'N-Mill');
const NX = T(n0.write('observe', { kind: 'cutoff', when: day(3, 10), at: day(3, 10) }, { subject: mOffer.hash, derives_from: NM.hash }), 'N-Mill-expired');
const N3 = T(n0.write('observe', { kind: 'cutoff', when: day(3, 12), at: day(3, 13) }, { subject: G.hash, derives_from: N2.hash }), 'N3');
const I10 = W.accept(sOffer, 199, 'I10'); const N10 = W.receipt(I10, 199, 'N-I10');
const I11 = W.accept(hOffer, 205, 'I11'); const N11 = T(receipt(n0, I11), 'N-I11');
const lo = fb.door('lowest_offer', G, w.blocks);
check('G15', 'lowest_offer: Sam\'s, on cutoff N3', [tg(lo.offer), tg(lo.cutoff), lo.why], ['Sam', 'N3', null]);
check('G15', 'I9 accepts Harry on Tuesday (received before N3): counts for nothing', whyOf(I9, w).code, 'not_live');
check('G15', 'I10 accepts Sam after N3', whyOf(I10, w), null);
check('G15', 'I11 accepts Harry after N3', whyOf(I11, w), { code: 'after_deadline', why: null });
done();
