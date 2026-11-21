const { fb, World, A, kindOf, instance, give, accept, J, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts } = require('./h.cjs');
const stage = (o, w) => fb.door('promise_stage', o, w.blocks, {});
const sf = st => (st === null ? 'null' : st.not_shown ? 'not_shown' : J({ stage: st.stage, total: am(st.total), paid: am(st.paid), lines: st.lines.map(l => [l.id, am(l.needed), am(l.moved)]), from: st.uncovered.from.map(x => [x.line, am(x.amount)]), to: am(st.uncovered.to), occ: st.occurrences.map(o => [o.occurrence.slice(0, 10), am(o.paid)]) }));
const pay = (s, to, amount, o, refs = {}, state = {}) => s.write('transfer', { amount, ...state }, { to_owner: to.id, for: o.hash, ...refs });
const acc = (s, t, o) => s.write('transfer', { status: 'accepted' }, { answers: t.hash, for: o.hash });
// two lines, per-unit price, delivered by amount from an instance, paid in two goes
{
  const S = 'X1 lines', w = new World(), sel = P(w, 'sel'), buy = P(w, 'buy'), K1 = kindOf(sel, 'eggs'), K2 = kindOf(sel, 'flour');
  const eggs = instance(sel, K1, { pack: A('60', 'egg') }), fl = instance(sel, K2, { pack: A('10', 'kg') });
  const o = sel.write('promise', { terms: { lines: [{ id: 'e', what: K1.hash, quantity: A('12', 'egg'), price: { amount: A('0.5', 'GBP'), per: A('1', 'egg') } }, { id: 'f', what: K2.hash, quantity: A('2', 'kg'), price: A('3', 'GBP') }] } }, { from: sel.id, to: buy.id, what: [K1.hash, K2.hash].sort() }); const a = accepts(buy, o);
  const d1 = sel.write('transfer', { amount: A('12', 'egg'), line: 'e' }, { what: eggs.hash, to_owner: buy.id, for: o.hash, after: a.hash }); acc(buy, d1, o);
  Q(S, 'eggs delivered (12), flour not: total, moved, uncovered.from', sf(stage(o, w)));
  const d2 = sel.write('transfer', { amount: A('2', 'kg'), line: 'f' }, { what: fl.hash, to_owner: buy.id, for: o.hash }); acc(buy, d2, o);
  const p1 = pay(buy, sel, A('9', 'GBP'), o); acc(sel, p1, o);
  Q(S, 'both delivered, £9 paid of £9: done', sf(stage(o, w)));
}
// catch weight
{
  const S = 'X2 band', w = new World(), sel = P(w, 'sel'), buy = P(w, 'buy'), K = kindOf(sel, 'maize'), lot = instance(sel, K, { pack: A('100', 'kg') });
  const o = sel.write('promise', { terms: { quantity: A('100', 'kg'), price: { amount: A('1', 'GBP'), per: A('1', 'kg') }, band: '0.05' } }, { from: sel.id, to: buy.id, what: lot.hash }); const a = accepts(buy, o);
  const d = sel.write('transfer', { amount: A('96', 'kg') }, { what: lot.hash, to_owner: buy.id, for: o.hash, after: a.hash }); acc(buy, d, o);
  const p = pay(buy, sel, A('96', 'GBP'), o); acc(sel, p, o);
  Q(S, '96 kg of 100 inside a 5% band: priced at what came, £96 paid, done', sf(stage(o, w)));
}
// a job at a price per hour
{
  const S = 'X3 job', w = new World(), wk = P(w, 'worker'), cl = P(w, 'client');
  const o = wk.write('promise', { what: 'cleaning', terms: { quantity: A('4', 'h'), price: { amount: A('10', 'GBP'), per: A('1', 'h') } } }, { from: wk.id, to: cl.id }); const a = accepts(cl, o);
  const wb = wk.write('observe', { kind: 'work', amount: A('4', 'h') }, { for: o.hash }); cl.write('observe', { status: 'accepted' }, { answers: wb.hash, for: o.hash });
  Q(S, 'four hours accepted at £10/h, nothing paid: total, uncovered.to null', sf(stage(o, w)));
  const p = pay(cl, wk, A('40', 'GBP'), o); acc(wk, p, o);
  Q(S, 'paid £40: done', sf(stage(o, w)));
}
// a split payment for two promises
{
  const S = 'X4 split', w = new World(), a = P(w, 'a'), b = P(w, 'b');
  const mk = n => { const o = a.write('promise', { what: 'slip' + n, terms: { quantity: A('1', 'slip'), price: A('3', 'GBP') } }, { from: a.id, to: b.id }); accepts(b, o); return o; };
  const o1 = mk(1), o2 = mk(2), o3 = mk(3);
  const t = b.write('transfer', { amount: A('9', 'GBP'), split: [{ for: o1.hash, amount: A('3', 'GBP') }, { for: o2.hash, amount: A('3', 'GBP') }, { for: o3.hash, amount: A('3', 'GBP') }] }, { to_owner: a.id, for: [o1.hash, o2.hash, o3.hash] });
  const ac = a.write('transfer', { status: 'accepted' }, { answers: t.hash, for: [o1.hash, o2.hash, o3.hash] });
  Q(S, 'one payment, three promises: the third is paid its own £3', J([o1, o2, o3].map(o => am(stage(o, w).paid))));
  Q(S, 'the write check on a payment for several promises with no split', J(fb.writeFindings({ type: 'transfer', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 3, amount: A('9', 'GBP') }, refs: { author: b.id, prev: b.head, to_owner: a.id, for: [o1.hash, o2.hash].sort() } }).map(x => x.code)));
}
// the write checks
{
  const S = 'X5 shapes', w = new World(), a = P(w, 'a'), b = P(w, 'b'), K = kindOf(a, 'k'), th = instance(a, K, { pack: A('5', 'kg') });
  const base = (state, refs) => ({ type: 'transfer', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 3, ...state }, refs: { author: a.id, prev: a.head, ...refs } });
  const codes = x => J(fb.writeFindings(x).map(y => y.code));
  Q(S, 'a transfer that names no instance and no to_owner', codes(base({ amount: A('5', 'GBP') }, { to_place: b.id })));
  Q(S, 'a transfer with state.amount and to_holder', codes(base({ amount: A('5', 'kg') }, { what: th.hash, to_holder: b.id })));
  Q(S, 'an amount with of beside refs.what', codes(base({ amount: A('5', 'kg', K.hash) }, { what: th.hash, to_owner: b.id })));
  Q(S, 'an amount with of, naming no instance (allowed)', codes(base({ amount: A('5', 'kg', K.hash) }, { to_owner: b.id })));
  Q(S, 'unit "gbp" is a unit', codes(base({ amount: A('5', 'gbp') }, { to_owner: b.id })));
  Q(S, 'a value below zero', codes(base({ amount: A('-1', 'GBP') }, { to_owner: b.id })));
  Q(S, 'a pack with of', codes({ type: 'thing', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 3, pack: A('5', 'kg', K.hash) }, refs: { author: a.id, prev: a.head, of: K.hash } }));
  Q(S, 'a make whose inputs name a thing not in derives_from', codes({ type: 'transform', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 3, inputs: [{ from: th.hash, amount: A('1', 'kg') }] }, refs: { author: a.id, prev: a.head, derives_from: [K.hash] } }));
  Q(S, 'a make whose inputs name its derives_from', codes({ type: 'transform', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 3, inputs: [{ from: th.hash, amount: A('1', 'kg') }] }, refs: { author: a.id, prev: a.head, derives_from: [th.hash] } }));
  Q(S, 'a promise of an amount with no refs.what', codes({ type: 'promise', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 3, terms: { quantity: A('100', 'GBP'), price: A('110', 'GBP') } }, refs: { author: a.id, prev: a.head, from: a.id, to: b.id } }));
  Q(S, 'a price with the 1.7 money shape', codes({ type: 'promise', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 3, what: 'x', terms: { price: { minor: 450, currency: 'GBP' } } }, refs: { author: a.id, prev: a.head, from: a.id, to: b.id } }));
  Q(S, 'the amount, per 1.8, with a per', codes({ type: 'promise', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 3, what: 'x', terms: { price: { amount: A('1', 'GBP'), per: A('1', 'kg') }, quantity: A('3', 'kg'), forfeit: A('1', 'GBP'), backing: A('800', 'GBP') } }, refs: { author: a.id, prev: a.head, from: a.id, to: b.id } }));
  Q(S, 'a sum past 2^53 in a price', codes({ type: 'promise', state: { at: '2026-11-01T00:00:00.000Z', audience: 'public', seq: 3, what: 'x', terms: { price: A('100000000000000000000', 'KES') } }, refs: { author: a.id, prev: a.head, from: a.id, to: b.id } }));
}
