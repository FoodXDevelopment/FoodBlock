const { fb, World, A, kindOf, instance, give, accept, J, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts, mkKey, headerMessage, day } = require('./h.cjs');
const stage = (o, w) => fb.door('promise_stage', o, w.blocks, {});
const sumS = st => (st === null ? 'null' : st.not_shown ? 'not_shown' : J({ stage: st.stage, quantity: am(st.quantity), total: am(st.total), takers: st.takers.map(t => [nm(t.who), am(t.quantity), t.over_allocated]), over: st.over_allocated, forks: st.forks.length }));
// ---- S26: an open offer's allocations
{
  const S = 'S26 allocations', w = new World(), sam = P(w, 'sam'), a = P(w, 'a'), b = P(w, 'b'), K = kindOf(sam, 'grain');
  const O = T(sam.write('promise', { terms: { quantity: A('20', 'kg'), price: A('1', 'GBP') } }, { from: sam.id, what: K.hash }), 'open offer 20');
  const req = (who, q) => who.write('promise', { status: 'accepted', terms: { quantity: q } }, { answers: O.hash, for: O.hash });
  const ra = req(a, A('15', 'kg')), rb = req(b, A('15', 'kg'));
  const alloc = (r, q) => sam.write('promise', { status: 'accepted', terms: { quantity: q } }, { answers: r.hash, for: O.hash });
  const aa = T(alloc(ra, A('15', 'kg')), 'alloc A 15'); const ab = T(alloc(rb, A('15', 'kg')), 'alloc B 15');
  Q(S, 'allocations 15 then 15 on one line: the second does not take, over_allocated; the offer\'s quantity is what takes', sumS(stage(O, w)));
  Q(S, 'the second one\'s own deal reads over_allocated', J(stage(ab, w).over_allocated) + ' / ' + J(stage(aa, w).over_allocated));
  // as a pair
  const w2 = new World(), sam2 = P(w2, 'sam'), a2 = P(w2, 'a'), b2 = P(w2, 'b'), K2 = kindOf(sam2, 'grain');
  const O2 = sam2.write('promise', { terms: { quantity: A('20', 'kg'), price: A('1', 'GBP') } }, { from: sam2.id, what: K2.hash });
  const req2 = (who, q) => who.write('promise', { status: 'accepted', terms: { quantity: q } }, { answers: O2.hash, for: O2.hash });
  const r2a = req2(a2, A('15', 'kg')), r2b = req2(b2, A('15', 'kg'));
  const hd = sam2.head, sq = sam2.seq;
  sam2.write('promise', { status: 'accepted', terms: { quantity: A('15', 'kg') } }, { answers: r2a.hash, for: O2.hash });
  sam2.head = hd; sam2.seq = sq;
  sam2.write('promise', { status: 'accepted', terms: { quantity: A('15', 'kg') } }, { answers: r2b.hash, for: O2.hash });
  Q(S, 'the same two as a pair (one prev): both bind, both over_allocated', sumS(stage(O2, w2)));
}
// ---- S28: a claim of £100 handed on, each hand-over signed twice
{
  const S = 'S28 claim', w = new World(), ana = P(w, 'ana'), ben = P(w, 'ben'), sam = P(w, 'sam'), leila = P(w, 'leila');
  const o = ana.write('promise', { what: 'a harvest', terms: { quantity: A('1', 'lot'), price: A('100', 'GBP') } }, { from: ana.id, to: ben.id }); const ben_acc = accepts(ben, o);
  const hand = (to, amt) => { const t = ana.write('transfer', amt ? { amount: amt } : {}, { what: o.hash, to_owner: to.id, after: [] .length ? [] : undefined }); ana.write('observe', { kind: 'confirm' }, { confirms: t.hash }); accept(to, t); return t; };
  const t1 = T(ana.write('transfer', { amount: A('80', 'GBP') }, { what: o.hash, to_owner: sam.id, after: ben_acc.hash }), 'hand-over 80 to Sam');
  ana.write('observe', { kind: 'confirm' }, { confirms: t1.hash }); accept(sam, t1);
  const t2 = T(ana.write('transfer', { amount: A('80', 'GBP') }, { what: o.hash, to_owner: leila.id }), 'hand-over 80 to Leila');
  ana.write('observe', { kind: 'confirm' }, { confirms: t2.hash }); accept(leila, t2);
  const st = stage(o, w);
  Q(S, '£80 to Sam then £80 to Leila, each signed twice: Sam 80, Leila past (not 20)', J({ from: st.owed && st.owed.from.map(x => [nm(x.owner), am(x.amount)]), to: st.owed && st.owed.to.map(x => [nm(x.owner), x.amount && am(x.amount)]), draws: st.owed && st.owed.draws.map(d => [tg(d.block), d.takes, d.why, d.state]) }));
}
// ---- S27: the two sides, each sent
{
  const S = 'S27 uncovered', w = new World(), seller = P(w, 'seller'), buyer = P(w, 'buyer'), K = kindOf(seller, 'wheat'), lot = T(instance(seller, K, { pack: A('2', 't') }), 'lot');
  const o = seller.write('promise', { terms: { quantity: A('2', 't'), price: A('500', 'GBP') } }, { from: seller.id, to: buyer.id, what: lot.hash }); accepts(buyer, o);
  const d = T(seller.write('transfer', { amount: A('2', 't') }, { what: lot.hash, to_owner: buyer.id, for: o.hash }), 'delivery of 2 t'); 
  const ack = buyer.write('transfer', { status: 'accepted' }, { answers: d.hash, for: o.hash });
  const sf = st => J({ stage: st.stage, from: st.uncovered.from.map(x => [x.line, am(x.amount)]), to: am(st.uncovered.to), paid: am(st.paid) });
  Q(S, 'the deliverer sent 2 t, nothing is paid: uncovered.from 2 t', sf(stage(o, w)));
  const p1 = buyer.write('transfer', { amount: A('500', 'GBP') }, { to_owner: seller.id, for: o.hash }); seller.write('transfer', { status: 'accepted' }, { answers: p1.hash, for: o.hash });
  Q(S, 'paid in full: done, nothing uncovered', sf(stage(o, w)));
  const p2 = buyer.write('transfer', { amount: A('500', 'GBP') }, { to_owner: seller.id, for: o.hash }); seller.write('transfer', { status: 'accepted' }, { answers: p2.hash, for: o.hash });
  Q(S, 'the payer sends £500 twice on a done deal: uncovered.to £500', sf(stage(o, w)));
}
// ---- S18: a recall reaches only what passed through that seller's hands
{
  const S = 'S18 recall', w = new World(), harry = P(w, 'harry'), rival = P(w, 'rival'), amara = P(w, 'amara'), K = kindOf(harry, 'flour');
  const L7 = T(instance(harry, K, { pack: A('1000', 'kg') }), 'L7');
  const t1 = T(give(harry, L7, amara, A('500', 'kg')), 'Harry to Amara 500'); accept(amara, t1);
  const t2 = T(give(harry, L7, rival, A('1', 'kg')), 'Harry to the rival 1'); accept(rival, t2);
  const t3 = T(give(rival, L7, amara, A('1', 'kg')), 'rival to Amara 1'); accept(amara, t3);
  Q(S, 'L7: Amara holds 501 kg (500 from Harry, 1 from the rival)', ownS(w, L7));
  Q(S, 'the rival\'s word about L7 reaches', J(fb.reachOfWord(L7, rival.id, w.blocks)));
  Q(S, 'Harry, the author of L7, speaks of it whole', J(fb.reachOfWord(L7, harry.id, w.blocks)));
}
// ---- S19: a reversed payment after a resale
{
  const S = 'S19 reversed', w = new World(), femi = P(w, 'femi'), cafe = P(w, 'cafe'), leila = P(w, 'leila'), K = kindOf(femi, 'mixer'), mixer = T(instance(femi, K, {}), 'mixer');
  const sale = T(femi.write('promise', { terms: { quantity: A('1', 'mixer'), price: A('100', 'GBP') } }, { from: femi.id, to: cafe.id, what: mixer.hash }), 'sale'); const sa = accepts(cafe, sale);
  const mv = T(femi.write('transfer', { condition: { paid: sale.hash } }, { what: mixer.hash, to_owner: cafe.id, for: sale.hash, after: sa.hash }), 'the mixer to the café on paid');
  const p = cafe.write('transfer', { amount: A('100', 'GBP') }, { to_owner: femi.id, for: sale.hash }); const pa = femi.write('transfer', { status: 'accepted' }, { answers: p.hash, for: sale.hash });
  const ack = accept(cafe, mv);
  Q(S, 'the café paid, Femi accepted: the mixer lands', ownS(w, mixer));
  const rs = T(give(cafe, mixer, leila, null, { after: pa.hash }), 'the café resells to Leila'); accept(leila, rs);
  femi.write('transfer', { status: 'declined' }, { answers: pa.hash, defeats: pa.hash });
  Q(S, 'Femi takes her own accept back after the resale: owner Leila, the sale still paid', J([ownS(w, mixer), am(stage(sale, w).paid), am(stage(sale, w).uncovered.to)]));
}
