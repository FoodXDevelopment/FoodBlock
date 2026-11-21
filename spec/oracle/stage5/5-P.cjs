// Section 5, Paying (R-P1 to R-P11), each world from the text.
const L = require('../stage4/lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, drawsOf, GBP, per, promise, grant, whyOf, day, mkKey, offer, accepts, sha, cj, signRaw, headerOf } = L;
const am = a => (a ? a.value + ' ' + a.unit : null);
const stage = (w, f) => fb.door('promise_stage', f, w.blocks, {});
// R-P1 (1) Maria M1 sells Harry 5 loaves at 5 `of` her issue I; Harry accepts. (2) Harry H2 transfers "5 credit" of his own making `for` M1. Expect `paid` none. (3) Harry H3 draws 5 of a part of I he holds, to Maria `for` M1; Maria accepts. Expect `paid` 5.
{
  const w = new World(), maria = P(w, 'maria'), harry = P(w, 'harry');
  const Kc = T(kindOf(maria, 'bread credit'), 'K'), I = T(instance(maria, Kc, { pack: A('100', 'credit') }), 'I');
  const Kl = kindOf(maria, 'loaf'), batch = T(instance(maria, Kl, { pack: A('5', 'loaf') }), 'batch');
  const m1 = T(maria.write('promise', { terms: { quantity: A('5', 'loaf'), price: A('5', 'credit', I.hash) } }, { from: maria.id, to: harry.id, what: batch.hash }), 'M1');
  harry.write('promise', { status: 'accepted' }, { answers: m1.hash, for: m1.hash });
  const h1 = T(instance(harry, Kc, { pack: A('5', 'credit') }), 'H1');
  T(harry.write('transfer', { amount: A('5', 'credit') }, { what: h1.hash, to_owner: maria.id, for: m1.hash }), 'H2');
  check('R-P1', '(2) Harry\'s self-made credit counts nothing: paid null until a block counts (00-shared)', am(stage(w, m1).paid), null);
  const part = maria.write('transfer', { amount: A('10', 'credit') }, { what: I.hash, to_owner: harry.id }); harry.write('transfer', { status: 'accepted' }, { answers: part.hash });
  const h3 = T(harry.write('transfer', { amount: A('5', 'credit') }, { what: I.hash, to_owner: maria.id, for: m1.hash }), 'H3');
  maria.write('transfer', { status: 'accepted' }, { answers: h3.hash, for: m1.hash });
  check('R-P1', '(3) a draw on the very thing named, landed: paid 5', am(stage(w, m1).paid), '5 credit');
}
// R-P2 (1) Leila promises Mama KSh 20; Mama accepts. (2) Leila L2 transfers 20. (3) Mama's tablet accepts L2; Mama's phone M5 `received` 20, answering L2. Expect `paid` 20.
{
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
  const tabK = mkKey('mama-tablet'), phoneK = mkKey('mama-phone');
  const kg = mama.write('grant', { kind: 'key', voices: [{ key: mama.key.pub }, { key: tabK.pub, wait: 'PT0S' }, { key: phoneK.pub, wait: 'PT0S' }] }, { subject: mama.id, updates: mama.id });
  const tablet = mama.asKey(tabK, kg.hash), phone = mama.asKey(phoneK, kg.hash);
  const e1 = T(leila.write('promise', { terms: { quantity: A('2', 'kg'), price: A('20', 'KES') } }, { from: mama.id, to: leila.id }), 'E1');
  mama.write('promise', { status: 'accepted' }, { answers: e1.hash, for: e1.hash });
  const e2 = T(leila.write('transfer', { amount: A('20', 'KES') }, { to_owner: mama.id, for: e1.hash }), 'E2');
  tablet.write('transfer', { status: 'accepted' }, { answers: e2.hash, for: e1.hash, after: [kg.hash] });
  phone.write('observe', { kind: 'received', amount: A('20', 'KES') }, { answers: e2.hash, for: e1.hash, after: [kg.hash] });
  check('R-P2', 'tablet accept and phone received of one KSh 20: paid 20', am(stage(w, e1).paid), '20 KES');
}
// R-P3 (1) Mama M1, 3 mandazi for KSh 10, `step` 1 KES. (2) Leila takes 2 and pays 7; Mama accepts. Expect total 7, paid. World B: no `step`. Expect total `20/3`, not paid until Mama's `covers` or signal.
for (const [name, step, want] of [['A', { step: A('1', 'KES') }, ['7 KES', '7 KES', true]], ['B', {}, ['20/3 KES', '6 KES', false]]]) {
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
  const mz = kindOf(mama, 'mandazi');
  const m1 = T(mama.write('promise', { terms: { price: { amount: A('10', 'KES'), per: A('3', 'piece') }, quantity: { min: A('1', 'piece'), max: A('3', 'piece') }, ...step } }, { from: mama.id, to: leila.id, what: mz.hash }), 'M1');
  leila.write('promise', { status: 'accepted', terms: { quantity: A('2', 'piece') } }, { answers: m1.hash, for: m1.hash });
  const pay = leila.write('transfer', { amount: A(name === 'A' ? '7' : '6', 'KES') }, { to_owner: mama.id, for: m1.hash }); mama.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: m1.hash });
  const st = stage(w, m1);
  check('R-P3', 'world ' + name + ': total, paid, paid in full', [am(st.total), am(st.paid), st.paid_at !== null], want);
}
// R-P4 (1) Leila E1 orders 2 kg tomatoes from Mama, `in_hand: true`. (2) Mama M3 transfers 2 kg `for` E1. Expect `moved` 2 kg. World B: Harry H1 orders 40 sacks, no term; Sam S2 sends 40; Harry H2 `received` 36. Expect `moved` 36.
for (const [name, inHand, received, want] of [['A', true, null, '2 kg'], ['B', false, '36', '36 sack']]) {
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
  const unit = name === 'B' ? 'sack' : 'kg', qty = name === 'B' ? '40' : '2';
  const e1 = T(leila.write('promise', { terms: { quantity: A(qty, unit), ...(inHand ? { in_hand: true } : {}) } }, { from: mama.id, to: leila.id }), 'E1');
  mama.write('promise', { status: 'accepted' }, { answers: e1.hash, for: e1.hash });
  T(mama.write('transfer', { amount: A(qty, unit) }, { to_owner: leila.id, for: e1.hash }), 'M3');
  if (received) leila.write('observe', { kind: 'received', amount: A(received, unit) }, { for: e1.hash });
  const st = stage(w, e1);
  check('R-P4', 'world ' + name + ': moved', am(st.lines[0].moved), want);
}
// R-P5 (1) Leila E1 orders loaf X from Mama at KSh 50. (2) Mama M2 transfers X to Leila `for` E1, `covers` 50. Expect `done` at M2; X Leila's. World B: `covers` 0. Expect `accepted`, KSh 50 to come.
for (const [name, covers, want] of [['A', '50', 'done'], ['B', '0', 'underway']]) {
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
  const K = kindOf(mama, 'loaf'), X = T(instance(mama, K, {}), 'X');
  const e1 = T(leila.write('promise', { terms: { price: A('50', 'KES') } }, { from: mama.id, to: leila.id, what: X.hash }), 'E1');
  const m2 = T(mama.write('transfer', { covers: A(covers, 'KES') }, { what: X.hash, to_owner: leila.id, for: e1.hash }), 'M2');
  const st = stage(w, e1);
  check('R-P5', 'world ' + name + ': stage; X Leila\'s', [st.stage, ownersOf(own(w, X))], [want, { owners: [['leila', null]] }]);
  if (name === 'B') check('R-P5', 'world B: the price is to come: total 50, paid 0 (his covers 0 is his word that nothing came)', [am(st.total), am(st.paid)], ['50 KES', '0 KES']);
}
// R-P6 (1) Sam's offer, `waits_on: price`, £60; Amara accepts. (2) Sam's till T delivers with no signal in its past. Expect `not_due`. (3) Sam S5 signs `paid`; T delivers again with S5 in its past. Expect due, `underway`.
{
  const w = new World(), sam = P(w, 'sam'), amara = P(w, 'amara'), till = P(w, 'till');
  const K = kindOf(sam, 'sack'), lot = T(instance(sam, K, { pack: A('10', 'sack') }), 'lot');
  const SO = T(promise(sam, { from: sam.id, to: amara.id, what: lot.hash }, { quantity: A('10', 'sack'), price: GBP(60), waits_on: 'price' }), 'SO');
  const G = T(grant(sam, till, { types: ['promise', 'transfer', 'observe'], on: [SO.hash], parties: [amara.id], limit: A('10', 'sack') }, { meter: till.id }), 'G');
  const ac = T(amara.write('promise', { status: 'accepted' }, { answers: SO.hash, for: SO.hash }), 'A1');
  const d1 = T(till.write('transfer', { amount: A('10', 'sack'), draws: { grant: G.hash, amount: A('10', 'sack') } }, { what: lot.hash, to_owner: amara.id, for: SO.hash, under: G.hash, after: ac.hash }), 'D1');
  check('R-P6', '(2) no signal in its past: not_due', whyOf(d1, w), { code: 'not_due', why: null });
  const s5 = T(sam.write('observe', { kind: 'paid' }, { subject: SO.hash }), 'S5');
  const d2 = T(till.write('transfer', { amount: A('10', 'sack'), draws: { grant: G.hash, amount: A('10', 'sack') } }, { what: lot.hash, to_owner: amara.id, for: SO.hash, under: G.hash, after: [ac.hash, s5.hash] }), 'D2');
  check('R-P6', '(3) with the signal in its past: due', whyOf(d2, w), null);
}
// R-P7 (1) Amara's job J: £12 per hour, condition `{ signal: "work", by: [Ben], subject: J }`. (2) Ben accepts. (3) Ben B3 `work` 40 h `for` J. (4) Amara pays £480; Ben accepts. Expect `moved` 40 h, `paid` 480, `uncovered` null (read: nothing uncovered on either side).
// World B: J names no one; (4) as before. Expect `moved` 40 h by her payment; Ben's stop after it leaves nothing uncovered.
for (const [name, cond] of [['A', true], ['B', false]]) {
  const w = new World(), amara = P(w, 'amara'), ben = P(w, 'ben');
  const J = T(amara.write('promise', { what: 'hours of work', terms: { price: { amount: GBP(12), per: A('1', 'h') }, ...(cond ? { condition: { signal: 'work', by: [ben.id] } } : {}) } }, { from: ben.id, to: amara.id }), 'J');
  ben.write('promise', { status: 'accepted' }, { answers: J.hash, for: J.hash });
  const b3 = T(ben.write('observe', { kind: 'work', amount: A('40', 'h') }, { for: J.hash }), 'B3');
  const pay = T(amara.write('transfer', { amount: GBP(480) }, { to_owner: ben.id, for: J.hash, after: b3.hash }), 'PAY'); ben.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: J.hash });
  if (!cond) ben.write('promise', { status: 'stopped', stop: 'onward' }, { answers: J.hash });
  const st = stage(w, J);
  check('R-P7', 'world ' + name + ': moved 40 h, paid 480, nothing uncovered', [st.lines.length ? am(st.lines[0].moved) : null, am(st.paid), st.uncovered.to && am(st.uncovered.to), st.uncovered.from.map(x => am(x.amount))], ['40 h', '480 GBP', '0 GBP', []]);
}
// R-P8 Amara pays £300 in full; nothing comes. Expect `underway`, `uncovered.to` £300 at once.
{
  const w = new World(), sam = P(w, 'sam'), amara = P(w, 'amara');
  const K = kindOf(sam, 'sack'), lot = T(instance(sam, K, { pack: A('10', 'sack') }), 'lot');
  const o = T(sam.write('promise', { terms: { quantity: A('10', 'sack'), price: GBP(300) } }, { from: sam.id, to: amara.id, what: lot.hash }), 'O');
  amara.write('promise', { status: 'accepted' }, { answers: o.hash, for: o.hash });
  const pay = amara.write('transfer', { amount: GBP(300) }, { to_owner: sam.id, for: o.hash }); sam.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: o.hash });
  const st = stage(w, o);
  check('R-P8', 'underway, uncovered.to 300', [st.stage, am(st.uncovered.to)], ['underway', '300 GBP']);
}
// R-P9 (1) The café C1: table Friday 19:30, £60, `forfeit` £20. (2) Leila accepts and pays £20; C accepts. (3) Leila stops onward. Expect `uncovered.to` 0; £20 the café's. World B: the café stops first. Expect `uncovered.to` £20, Leila's. World C: one stop each, neither in the other's past. Expect not kept.
function forfeitWorld(who) {
  const w = new World(), cafe = P(w, 'cafe'), leila = P(w, 'leila');
  const c1 = T(cafe.write('promise', { what: 'a table for two Friday 19:30', terms: { price: GBP(60), forfeit: GBP(20) } }, { from: cafe.id, to: leila.id }), 'C1');
  const ac = leila.write('promise', { status: 'accepted' }, { answers: c1.hash, for: c1.hash });
  const pay = leila.write('transfer', { amount: GBP(20) }, { to_owner: cafe.id, for: c1.hash }); cafe.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: c1.hash });
  const ls = () => leila.write('promise', { status: 'stopped', stop: 'onward' }, { updates: ac.hash });
  const cs = (after) => cafe.write('promise', { status: 'stopped', stop: 'onward' }, { answers: ac.hash, ...(after ? { after } : {}) });
  if (who === 'leila') ls(); else if (who === 'cafe') cs(); else { const x = cafe.make('promise', { status: 'stopped', stop: 'onward' }, { answers: ac.hash, for: c1.hash }, { prev: cafe.head }); ls(); w.add(x); }
  return { w, c1 };
}
for (const [who, want] of [['leila', '0 GBP'], ['cafe', '20 GBP'], ['both', '20 GBP']]) {
  const { w, c1 } = forfeitWorld(who); const st = stage(w, c1);
  check('R-P9', who + ' stops: uncovered.to', am(st.uncovered.to), want);
}
// R-P10 (1) Mama M1 promises Harry KSh 2,000; Harry accepts. (2) Harry H2 hands his place to Wanjiru; Wanjiru accepts. (3) Mama M2 pays Harry 2,000; Harry accepts. Expect `paid` 2,000; `to_come_on: [{ from: Harry, to: Wanjiru, amount: 2000 KES, payment: M2 }]`. World B: Harry H3 hands the same place to Sam. Expect H3 `past`.
{
  const w = new World(), mama = P(w, 'mama'), harry = P(w, 'harry'), wan = P(w, 'wanjiru'), sam = P(w, 'sam');
  // Mama promises Harry: Mama pays Harry 2000 KES. A promise `from` her side: she is the payer
  const m1b = T(mama.write('promise', { what: 'a debt', terms: { price: A('2000', 'KES') } }, { from: harry.id, to: mama.id }), 'M1b');
  const hy = harry.write('promise', { status: 'accepted' }, { answers: m1b.hash, for: m1b.hash });
  const h2 = T(harry.write('transfer', { amount: A('2000', 'KES') }, { what: m1b.hash, to_owner: wan.id, after: hy.hash }), 'H2');
  wan.write('transfer', { status: 'accepted' }, { answers: h2.hash });
  const m2 = T(mama.write('transfer', { amount: A('2000', 'KES') }, { to_owner: harry.id, for: m1b.hash }), 'M2'); harry.write('transfer', { status: 'accepted' }, { answers: m2.hash, for: m1b.hash });
  const st = stage(w, m1b);
  check('R-P10', 'paid 2000 and to_come_on names Harry to Wanjiru', [am(st.paid), st.to_come_on.map(x => [x.from === harry.id, x.to === wan.id, am(x.amount), tg(x.payment)])], ['2000 KES', [[true, true, '2000 KES', 'M2']]]);
  const h3 = T(harry.write('transfer', { amount: A('2000', 'KES') }, { what: m1b.hash, to_owner: sam.id }), 'H3');
  const dr = stage(w, m1b).to_come.draws.filter(x => x.block === h3.hash).map(x => [x.takes, x.why]);
  check('R-P10', 'World B: H3, the same place handed to Sam, is past', dr, [[false, 'past']]);
}
done();
