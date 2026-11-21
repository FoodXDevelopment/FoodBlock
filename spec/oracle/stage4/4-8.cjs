// G7, a copied key (T2-2). W with meter the AI's own line. A thief copies I; I4, I4', I4'' on one prev, accepting Harry, Sam, Mill Lane at £210 each. Harry holds I4 only: binds Amara £210.
// A reader holding all three: { pair: true, held: [I4, I4', I4''], at_most: £210 }. Harry's delivery H5 under I4: lands on no accept; Harry's flour stays his.
// With meter N0: N receipts I4 total £210; I4' total £420: past. N signs a receipt of I4' stating total £210 (false): binds Wanjiru's name; Amara's at_most stays £210.
const L = require('./lib.cjs'); const { fb, T, tg, check, done, baseWorld, whyOf, A, GBP, ok, backedBy, own, ownersOf, drawsOf, receipt } = L;
{
  const W = baseWorld({ meter: 'own' }); const { w, amara, harry, sam, mill, ai, G } = W;
  const hh = W.offer(harry, 21, {}, 'Hh'), hs = W.offer(sam, 21, {}, 'Hs'), hm = W.offer(mill, 21, {}, 'Hm');
  const prev = ai.head, seq = ai.seq + 1;
  const I4 = W.accept(hh, 210, 'I4'); ai.head = prev; ai.seq = seq - 1;
  const I4b = W.accept(hs, 210, "I4'", G, ai, {}); // same prev, same seq
  const keep = b => w.blocks.filter(x => x.hash !== I4b.hash && x.hash !== I4c.hash);
  ai.head = prev; ai.seq = seq - 1; const I4c = W.accept(hm, 210, "I4''");
  const only = w.blocks.filter(x => x.hash !== I4b.hash && x.hash !== I4c.hash);
  check('G7', 'Harry holds I4 only: under_ok and backed(Amara)', [fb.door('under_ok', I4, only), fb.door('backed', I4, amara.id, only).backed], [true, true]);
  const lbl = h => tg(h);
  const a = fb.door('under_ok', I4, w.blocks), b = fb.door('backed', I4b, amara.id, w.blocks);
  const norm = r => ({ pair: r.pair, held: r.held.map(lbl).sort(), at_most: r.at_most });
  const want = { pair: true, held: ["I4", "I4'", "I4''"].sort(), at_most: [GBP(210)] };
  check('G7', 'a reader holding all three: under_ok', norm(a), want);
  check('G7', 'a reader holding all three: backed', norm(b.backed), want);
  // Harry's delivery of his flour under I4: lands on no accept
  const flour = w.blocks.find(x => x.hash === hh.refs.what);
  const dh = harryDelivery(W, hh, flour, I4);
  const rAll = own(w, flour), rOne = own({ blocks: [...only, dh] }, flour);
  check('G7', 'Harry\'s flour: with the pair held it lands on no one (still Harry\'s, held by his offer); with I4 alone it is Amara\'s', [ownersOf(rAll), rAll.held && rAll.held.value, ownersOf(rOne)], [{ owners: [] }, '10', { owners: [['amara', '10']] }]);
}
function harryDelivery(W, offer, flour, accept) { return W.harry.write('transfer', { amount: A('10', 'sack') }, { what: flour.hash, to_owner: W.amara.id, for: offer.hash, after: accept.hash }); }
{
  const W = baseWorld(); const { w, amara, harry, sam, mill, ai, G, n0 } = W;
  const hh = W.offer(harry, 21, {}, 'Hh'), hs = W.offer(sam, 21, {}, 'Hs'), hm = W.offer(mill, 21, {}, 'Hm');
  const prev = ai.head, seq = ai.seq + 1;
  const I4 = W.accept(hh, 210, 'I4'); const r1 = W.receipt(I4, 210, 'N-I4');
  ai.head = prev; ai.seq = seq - 1; const I4b = W.accept(hs, 210, "I4'");
  const r2 = W.receipt(I4b, 210, "N-I4'"); // N's total: 420
  const m = fb.door('meter', G, w.blocks);
  const onG = mm => mm.draws.filter(d => d.of === G.hash).map(d => [tg(d.block), d.takes, d.why]).sort();
  check('G7', 'with meter N0: I4 fits, I4\' (N total £420) is past', onG(m), [["I4", true, null], ["I4'", false, 'past']].sort());
  // N signs a receipt of I4' stating total 210 (false: 210 + 210 = 420): a reader who holds N's line whole reads the sum, so I4' stays past
  const bad = T(receipt(n0, I4b, [{ of: G.hash, amount: GBP(210), total: GBP(210) }]), 'N-false');
  check('G7', 'the false receipt binds Wanjiru\'s name only: to one who holds N\'s line whole, I4\' stays past', onG(fb.door('meter', G, w.blocks)).filter(r => r[0] === "I4'"), [["I4'", false, 'past']]);
  // one who holds only the false receipt reads the total from it (one receipt is enough): I4' fits for him, on Wanjiru's word
  const alone = w.blocks.filter(x => x.hash !== I4.hash && x.hash !== r1.hash && x.hash !== r2.hash);
  check('G7', 'to one who holds only the false receipt, I4\' fits (he holds Wanjiru\'s word)', whyOf(I4b, { blocks: alone }), null);
  const wc = fb.door('worst_case', G, w.blocks);
  check('G7', 'Amara\'s at_most stays £210', wc.at_most, [GBP(210)]);
}
{ // a pair on the meter's own line: N signs two receipts on one prev, one of I4 and one of I4'; each draw they receipt answers the fork (it binds N's name past her measures)
  const W = baseWorld(); const { w, harry, sam, ai, G, n0 } = W;
  const hh = W.offer(harry, 21, {}, 'Hh'), hs = W.offer(sam, 21, {}, 'Hs');
  const I4 = W.accept(hh, 210, 'I4'), I4b = W.accept(hs, 210, "I4'");
  const prev = n0.head, seq = n0.seq;
  const R1 = W.receipt(I4, 210, 'R1'); n0.head = prev; n0.seq = seq;
  const R1b = T(receipt(n0, I4b, [{ of: G.hash, amount: GBP(210), total: GBP(210) }]), "R1'");
  const a = fb.door('why_not_under', I4b, w.blocks)[0];
  check('G7', 'a pair on the meter\'s line: the draws it receipts answer the fork', a && [a.code, a.pair.held.map(h => tg(h)).sort(), a.pair.at_most], ['pair', ['R1', "R1'"], [GBP(210)]]);
}
done();
