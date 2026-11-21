const { fb, World, A, kindOf, instance, give, accept, J, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts, mkKey } = require('./h.cjs');
const stage = (o, w) => fb.door('promise_stage', o, w.blocks, {});
const sum = st => st.not_shown ? 'not_shown' : J({ stage: st.stage, total: am(st.total), paid: am(st.paid), quantity: am(st.quantity), lines: st.lines.map(l => [l.id, am(l.needed), am(l.moved)]), uncovered: { from: st.uncovered.from.map(x => [x.line, am(x.amount)]), to: am(st.uncovered.to) }, unanswered: st.unanswered.map(tg) });
const pay = (s, to, amount, o, refs = {}, state = {}) => s.write('transfer', { amount, ...state }, { to_owner: to.id, for: o.hash, ...refs });
const acc = (s, t, o, state = {}, refs = {}) => s.write('transfer', { status: 'accepted', ...state }, { answers: t.hash, for: o.hash, ...refs });
// ---- S8: Mama Achieng's unweighed pile
{
  const S = 'S8 pile', w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila'), sam = P(w, 'sam'), K = kindOf(mama, 'grain');
  const pile = T(instance(mama, K, {}), 'pile');
  const o = offer(mama, mama, leila, K, { quantity: A('2', 'kg'), price: A('100', 'KES') });
  const a = accepts(leila, o);
  const t = T(mama.write('transfer', { amount: A('2', 'kg') }, { what: pile.hash, to_owner: leila.id, for: o.hash, after: a.hash }), 'Mama sends 2 kg of the pile');
  const p = pay(leila, mama, A('100', 'KES'), o); acc(mama, p, o);
  Q(S, 'Mama\'s 2 kg names the pile: the pile states no pack', ownS(w, pile));
  const ya = acc(leila, t, o);
  Q(S, 'the same draw once Leila answers accepted: no_measure, read as naming none; the deal', sum(stage(o, w)));
  const t2 = T(give(mama, pile, sam, null), 'the whole pile, no amount, to Sam'); accept(sam, t2);
  Q(S, 'the whole pile to Sam: takes, Sam owns the pile', ownS(w, pile));
}
// ---- S12: a loan of maize and a loan of pounds
{
  const S = 'S12 loans', w = new World(), maria = P(w, 'maria'), harry = P(w, 'harry'), K = kindOf(maria, 'maize');
  const lotM = T(instance(maria, K, { pack: A('20', 'sack') }), 'Maria\'s lot'), lotH = T(instance(harry, K, { pack: A('10', 'sack') }), 'Harry\'s lot');
  const o = offer(maria, maria, harry, lotM, { quantity: A('5', 'sack'), price: A('6', 'sack', K.hash) });
  const a = accepts(harry, o);
  const t1 = T(maria.write('transfer', { amount: A('5', 'sack') }, { what: lotM.hash, to_owner: harry.id, for: o.hash, after: a.hash }), 'Maria lends 5 sacks'); acc(harry, t1, o);
  Q(S, 'maize: after the lending, accepted by Harry', sum(stage(o, w)));
  const t2 = T(harry.write('transfer', { amount: A('6', 'sack') }, { what: lotH.hash, to_owner: maria.id, for: o.hash }), 'Harry repays 6 sacks from his own lot'); acc(maria, t2, o);
  Q(S, 'maize: Harry repays 6 sacks of his lot (its refs.of is the maize kind): done', sum(stage(o, w)));
  // pounds
  const w2 = new World(), sam = P(w2, 'sam'), mar = P(w2, 'maria');
  const o2 = sam.write('promise', { terms: { quantity: A('100', 'GBP'), price: A('110', 'GBP') } }, { from: sam.id, to: mar.id });
  const a2 = accepts(mar, o2);
  Q(S, 'pounds: accepted, nothing sent: uncovered null both sides', sum(stage(o2, w2)));
  const s1 = T(sam.write('transfer', { amount: A('100', 'GBP') }, { to_owner: mar.id, for: o2.hash, after: a2.hash }), 'Sam sends 100'); 
  Q(S, 'pounds: Sam sends £100 (names none), nothing answered: unanswered, not counted', sum(stage(o2, w2)));
  acc(mar, s1, o2);
  Q(S, 'pounds: Maria accepts: underway, moved 100', sum(stage(o2, w2)));
  const r1 = T(mar.write('transfer', { amount: A('110', 'GBP') }, { to_owner: sam.id, for: o2.hash }), 'Maria repays 110'); acc(sam, r1, o2);
  Q(S, 'pounds: Maria repays £110, Sam accepts: done', sum(stage(o2, w2)));
  // stopped having repaid nothing
  const w3 = new World(), sam3 = P(w3, 'sam'), mar3 = P(w3, 'maria');
  const o3 = sam3.write('promise', { terms: { quantity: A('100', 'GBP'), price: A('110', 'GBP') } }, { from: sam3.id, to: mar3.id });
  const a3 = accepts(mar3, o3);
  const s3 = sam3.write('transfer', { amount: A('100', 'GBP') }, { to_owner: mar3.id, for: o3.hash, after: a3.hash }); acc(mar3, s3, o3);
  mar3.write('promise', { status: 'stopped', stop: 'onward' }, { answers: o3.hash, for: o3.hash });
  Q(S, 'pounds: Maria stops onward having repaid nothing: stopped, uncovered.from £100', sum(stage(o3, w3)));
}
// ---- S13: a miller's toll in kind
{
  const S = 'S13 toll', w = new World(), harry = P(w, 'harry'), leila = P(w, 'leila'), K = kindOf(harry, 'flour');
  const terms = { quantity: A('93', 'kg'), price: { amount: A('1', 'kg', K.hash), per: A('10', 'kg') } };
  Q(S, 'terms_total: 1 kg of flour per 10 kg, 93 kg', J(fb.door('terms_total', terms, null)));
  const o = harry.write('promise', { terms }, { from: harry.id, to: leila.id }); o.state.what;
  const o2 = harry.write('promise', { what: 'milling', terms }, { from: harry.id, to: leila.id });
  const a = accepts(leila, o2);
  const wk = harry.write('observe', { kind: 'work', amount: A('93', 'kg') }, { for: o2.hash }); 
  leila.write('observe', { status: 'accepted' }, { answers: wk.hash, for: o2.hash });
  const lot = T(instance(leila, K, { pack: A('20', 'kg') }), 'Leila\'s flour lot');
  const t = T(leila.write('transfer', { amount: A('9.3', 'kg') }, { what: lot.hash, to_owner: harry.id, for: o2.hash }), 'Leila pays 9.3 kg from her flour lot'); acc(harry, t, o2);
  Q(S, 'Leila pays 9.3 kg from her flour lot (refs.of flour), accepted', sum(stage(o2, w)));
  const w2 = new World(), h2 = P(w2, 'harry'), l2 = P(w2, 'leila'), K2 = kindOf(h2, 'flour'), sack = instance(l2, kindOf(l2, 'unnamed'), { pack: A('9', 'kg') });
  const terms2 = { quantity: A('93', 'kg'), price: { amount: A('1', 'kg', K2.hash), per: A('10', 'kg') } };
  const o3 = h2.write('promise', { what: 'milling', terms: terms2 }, { from: h2.id, to: l2.id }); accepts(l2, o3);
  const wk3 = h2.write('observe', { kind: 'work', amount: A('93', 'kg') }, { for: o3.hash }); l2.write('observe', { status: 'accepted' }, { answers: wk3.hash, for: o3.hash });
  const t3 = l2.write('transfer', { amount: A('9', 'kg') }, { what: sack.hash, to_owner: h2.id, for: o3.hash }); acc(h2, t3, o3);
  Q(S, 'of 9 kg of an unnamed sack (no refs.of): counts for nothing, Harry\'s answer says nothing of what it covers', sum(stage(o3, w2)));
}
// ---- S14: a community voucher
{
  const S = 'S14 voucher', w = new World(), maria = P(w, 'maria'), ravi = P(w, 'ravi'), cafe = P(w, 'cafe'), cafe2 = P(w, 'cafe2'), K = kindOf(maria, 'Maria\'s bread credit');
  const mkDeal = (payee, amt) => { const o = payee.write('promise', { what: 'a coffee', terms: { quantity: A('1', 'cup'), price: A('5', 'credit', K.hash) } }, { from: payee.id, to: ravi.id }); accepts(ravi, o); const p = ravi.write('transfer', { amount: amt }, { to_owner: payee.id, for: o.hash }); acc(payee, p, o); return o; };
  const d1 = mkDeal(cafe, A('5', 'credit', K.hash)), d2 = mkDeal(cafe2, A('5', 'credit', K.hash));
  Q(S, 'off the record: the same 5 to two payees, both accept: both count', J([sum(stage(d1, w)), sum(stage(d2, w))].map(x => JSON.parse(x).paid)));
  // on the record
  const issue = T(instance(maria, K, { pack: A('500', 'credit') }), 'issue');
  const t0 = T(give(maria, issue, ravi, A('5', 'credit')), 'Maria gives Ravi 5'); accept(ravi, t0);
  const sp1 = T(give(ravi, issue, cafe, A('5', 'credit')), 'Ravi spends 5'); accept(cafe, sp1);
  const sp2 = T(give(ravi, issue, cafe2, A('5', 'credit')), 'Ravi spends the same 5 again');
  Q(S, 'on the record: a second spend of the same 5 reads past', ownS(w, issue));
  // another kind
  const d3 = mkDeal(cafe, A('5', 'credit'));
  Q(S, 'paid with 5 credit with no of: another kind, paid 0 shown', sum(stage(d3, w)));
}
// ---- S15: gold and bitcoin
{
  const S = 'S15 gold', w = new World(), sam = P(w, 'sam'), ben = P(w, 'ben'), vault = P(w, 'vault'), K = kindOf(sam, 'gold');
  const o = sam.write('promise', { what: 'a ring', terms: { quantity: A('1', 'ring'), price: A('2', 'g', K.hash) } }, { from: sam.id, to: ben.id }); accepts(ben, o);
  const p = ben.write('transfer', { amount: A('2', 'g', K.hash), marks: [{ scheme: 'tx', value: 'abc123' }] }, { to_owner: sam.id, for: o.hash }); acc(sam, p, o);
  Q(S, 'a price of 2 g of gold, paid off the record, Sam accepts', sum(stage(o, w)));
  Q(S, 'bitcoin: 0.00000001 BTC per kg, 3 kg', J(fb.door('terms_total', { price: { amount: A('0.00000001', 'BTC'), per: A('1', 'kg') }, quantity: A('3', 'kg') }, null)));
  const bar = T(instance(ben, K, { pack: A('100', 'g') }), 'a gold bar');
  const store = T(ben.write('transfer', {}, { what: bar.hash, to_holder: vault.id }), 'allocated gold in the vault');
  accept(vault, store);
  Q(S, 'allocated gold: an instance to_holder the vault; who holds it', J([nm(fb.holderOf(bar, w.blocks)), nm(own(w, bar).owners[0].owner)]));
}
// ---- S16: a mixed deal priced in pounds and eggs
{
  const S = 'S16 mixed', w = new World(), a = P(w, 'a'), b = P(w, 'b'), K = kindOf(a, 'loaf'), K2 = kindOf(a, 'bun'), eggs = kindOf(a, 'egg');
  const blk = { type: 'promise', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 1, terms: { lines: [{ id: 'l1', what: K.hash, quantity: A('1', 'loaf'), price: A('1', 'GBP') }, { id: 'l2', what: K2.hash, quantity: A('2', 'bun'), price: A('2', 'egg') }] } }, refs: { author: a.id, prev: a.head, from: a.id, to: b.id, what: [K.hash, K2.hash].sort() } };
  Q(S, 'a deal with lines priced in two kinds: the write check', J(fb.writeFindings(blk).map(x => x.code)));
  blk.state.terms.lines[1].price = A('2', 'GBP');
  Q(S, 'the same priced in one kind', J(fb.writeFindings(blk).map(x => x.code)));
}
// ---- S17: a price of "6 sacks" paid in sand
{
  const S = 'S17 sand', w = new World(), sam = P(w, 'sam'), ben = P(w, 'ben'), K = kindOf(sam, 'maize'), sandK = kindOf(ben, 'sand');
  const sand = T(instance(ben, sandK, { pack: A('6', 'sack') }), 'sand');
  const o = sam.write('promise', { what: 'maize', terms: { quantity: A('1', 'lot'), price: A('6', 'sack') } }, { from: sam.id, to: ben.id }); accepts(ben, o);
  const t = ben.write('transfer', { amount: A('6', 'sack') }, { what: sand.hash, to_owner: sam.id, for: o.hash }); acc(sam, t, o);
  Q(S, 'price {6, sack} with no of: a sand instance counts only for what Sam\'s answer says it covers; "it came" covers nothing', sum(stage(o, w)));
  const w2 = new World(), sam2 = P(w2, 'sam'), ben2 = P(w2, 'ben'), K2 = kindOf(sam2, 'maize'), sand2 = T(instance(ben2, K2, { pack: A('6', 'sack') }), 'sand named maize');
  const o2 = sam2.write('promise', { what: 'maize', terms: { quantity: A('1', 'lot'), price: A('6', 'sack', K2.hash) } }, { from: sam2.id, to: ben2.id }); accepts(ben2, o2);
  const t2 = ben2.write('transfer', { amount: A('6', 'sack') }, { what: sand2.hash, to_owner: sam2.id, for: o2.hash }); acc(sam2, t2, o2);
  Q(S, 'price {6, sack, of maize}: a sand thing Ben signed with refs.of maize pays it (the lie is Ben\'s)', sum(stage(o2, w2)));
}
// ---- S20: a sum past 2^53
{
  const S = 'S20 big sum', w = new World(), sam = P(w, 'sam'), ben = P(w, 'ben');
  const big = '100000000000000000000';
  const o = sam.write('promise', { what: 'a ranch', terms: { quantity: A('1', 'ranch'), price: A(big, 'KES') } }, { from: sam.id, to: ben.id }); accepts(ben, o);
  Q(S, 'valid / read of the offer', J([fb.door('valid', o, w.blocks), fb.door('read', o, w.blocks)]));
  const p = ben.write('transfer', { amount: A(big, 'KES') }, { to_owner: sam.id, for: o.hash }); acc(sam, p, o);
  const p2 = ben.write('transfer', { amount: A(big, 'KES') }, { to_owner: sam.id, for: o.hash }); acc(sam, p2, o);
  Q(S, 'paid twice: total, paid, uncovered are exact text', sum(stage(o, w)));
}
