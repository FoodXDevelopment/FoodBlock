const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey, own } = L;
const am = a => (a ? a.value + ' ' + a.unit : null);
// Paid only by the payee's word, or by the very thing named. World: (1) Maria M0, kind K "bread credit", her issue I (an instance of K). (2) Maria M1 sells Harry 5 loaves at 5 `of` I; Harry accepts.
// (3) Harry H1, a thing "5 credit" `of` K of his own; H2 transfers it to Maria `for` M1. Expect paid 0. (4) Harry H3 draws 5 of a part of I he holds, to Maria `for` M1; it lands on her yes. Expect paid 5.
{
  const w = new World(), maria = P(w, 'maria'), harry = P(w, 'harry');
  const Kc = T(kindOf(maria, 'bread credit'), 'K'), I = T(instance(maria, Kc, { pack: A('100', 'credit') }), 'I');
  const Kl = kindOf(maria, 'loaf'), batch = T(instance(maria, Kl, { pack: A('5', 'loaf') }), 'batch');
  const m1 = T(maria.write('promise', { terms: require('../kit.cjs').linesFor(batch, { quantity: A('5', 'loaf'), price: A('5', 'credit', I.hash) }) }, { from: maria.id, to: harry.id }), 'M1');
  harry.write('promise', { status: 'accepted' }, { answers: m1.hash, for: m1.hash });
  const h1 = T(instance(harry, Kc, { pack: A('5', 'credit') }), 'H1');
  const h2 = T(harry.write('transfer', { amount: A('5', 'credit') }, { what: h1.hash, to_owner: maria.id, for: m1.hash }), 'H2');
  maria.write('transfer', { status: 'accepted' }, { answers: h2.hash, for: m1.hash }); // she answers it: her accept of Harry's own thing, which is no part of I
  const st3 = () => fb.door('promise_stage', m1, w.blocks, {});
  check('the payee word', '(3b) if Maria answers Harry\'s own credit accepted, that is her word and it counts at what she said (5 credit): not because it is `of` anything', am(st3().paid), '5 credit');
}
{
  const w = new World(), maria = P(w, 'maria'), harry = P(w, 'harry');
  const Kc = T(kindOf(maria, 'bread credit'), 'K'), I = T(instance(maria, Kc, { pack: A('100', 'credit') }), 'I');
  const Kl = kindOf(maria, 'loaf'), batch = T(instance(maria, Kl, { pack: A('5', 'loaf') }), 'batch');
  const m1 = T(maria.write('promise', { terms: require('../kit.cjs').linesFor(batch, { quantity: A('5', 'loaf'), price: A('5', 'credit', I.hash) }) }, { from: maria.id, to: harry.id }), 'M1');
  harry.write('promise', { status: 'accepted' }, { answers: m1.hash, for: m1.hash });
  const h1 = T(instance(harry, Kc, { pack: A('5', 'credit') }), 'H1');
  const h2 = T(harry.write('transfer', { amount: A('5', 'credit') }, { what: h1.hash, to_owner: maria.id, for: m1.hash }), 'H2');
  check('the payee word', '(3) a draw the payee has not answered pays nothing', am(fb.door('promise_stage', m1, w.blocks, {}).paid), null); // counts nothing: paid null until a block counts
  // (4) Maria gives Harry a part of I (10 credit); Harry draws 5 of it to Maria for M1; it lands on her yes
  const part = maria.write('transfer', { amount: A('10', 'credit') }, { what: I.hash, to_owner: harry.id });
  harry.write('transfer', { status: 'accepted' }, { answers: part.hash });
  const h3 = T(harry.write('transfer', { amount: A('5', 'credit') }, { what: I.hash, to_owner: maria.id, for: m1.hash }), 'H3');
  // her own first promise M1, which Harry accepted, is her yes in H3's causal past (as a buyer's order is), so the draw on I lands where it is signed
  check('the payee word', '(4) the draw on I lands where it is signed (M1, her own offer, is her yes): paid 5', am(fb.door('promise_stage', m1, w.blocks, {}).paid), '5 credit');
  maria.write('transfer', { status: 'accepted' }, { answers: h3.hash, for: m1.hash });
  check('the payee word', '(4) a draw on I itself lands on her yes: paid 5', am(fb.door('promise_stage', m1, w.blocks, {}).paid), '5 credit');
}
// Once. World: (1) Leila E1 promises Mama KSh 20; Mama accepts. (2) Leila E2 transfers 20 `for` E1. (3) Mama's tablet accepts E2; Mama's phone M5 `received` 20 answering E2. Expect paid 20. Two `received` words answering no transfer: 40 (her word, kept).
{
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
  const tabK = mkKey('mama-tablet'), phoneK = mkKey('mama-phone');
  const kg = mama.write('grant', { kind: 'key', voices: [{ key: mama.key.pub }, { key: tabK.pub, wait: 'PT0S' }, { key: phoneK.pub, wait: 'PT0S' }] }, { subject: mama.id, updates: mama.id });
  const tablet = mama.asKey(tabK, kg.hash), phone = mama.asKey(phoneK, kg.hash);
  const Kd = kindOf(mama, 'tomatoes'), lot = instance(mama, Kd, { pack: A('2', 'kg') });
  const e1 = T(leila.write('promise', { terms: require('../kit.cjs').linesFor(lot, { quantity: A('2', 'kg'), price: A('20', 'KES') }) }, { from: mama.id, to: leila.id }), 'E1');
  mama.write('promise', { status: 'accepted' }, { answers: e1.hash, for: e1.hash });
  const e2 = T(leila.write('transfer', { amount: A('20', 'KES') }, { to_owner: mama.id, for: e1.hash }), 'E2');
  tablet.write('transfer', { status: 'accepted' }, { answers: e2.hash, for: e1.hash, after: [kg.hash] });
  phone.write('observe', { kind: 'received', amount: A('20', 'KES') }, { answers: e2.hash, for: e1.hash, after: [kg.hash] });
  check('once', 'her tablet\'s accept and her phone\'s received of one KSh 20: paid 20 (once, at the most any says)', am(fb.door('promise_stage', e1, w.blocks, {}).paid), '20 KES');
}
{
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
  const e1 = T(leila.write('promise', { terms: require('../kit.cjs').linesFor(null, { quantity: A('2', 'kg'), price: A('40', 'KES') }) }, { from: mama.id, to: leila.id }), 'E1');
  mama.write('promise', { status: 'accepted' }, { answers: e1.hash, for: e1.hash });
  mama.write('observe', { kind: 'received', amount: A('20', 'KES') }, { for: e1.hash });
  mama.write('observe', { kind: 'received', amount: A('20', 'KES') }, { for: e1.hash });
  check('once', 'two received words answering no transfer are two payments: 40 (her word, kept)', am(fb.door('promise_stage', e1, w.blocks, {}).paid), '40 KES');
}
// Her order, where it says the goods are in her hand. World A: (1) Leila E1 orders 2 kg of tomatoes from Mama, with `terms.in_hand: true`. (2) Mama M3 transfers 2 kg, naming no instance, `for` E1. Expect moved 2 kg.
// World B: (1) Harry H1 orders 40 sacks from Sam, no term. (2) Sam S2 transfers 40 sacks naming none. (3) Harry H2 `received` 36. Expect moved 36.
{
  const mv = st => st.moved.map(x => am(x.amount || x.moved || x));
  for (const [name, inHand, received, want] of [['A', true, null, '2 kg'], ['A0', false, null, '0 kg'], ['B', false, '36', '36 sack']]) {
    const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
    const unit = name === 'B' ? 'sack' : 'kg', qty = name === 'B' ? '40' : '2';
    const e1 = T(leila.write('promise', { terms: require('../kit.cjs').linesFor(null, { quantity: A(qty, unit), ...(inHand ? { in_hand: true } : {}) }) }, { from: mama.id, to: leila.id }), 'E1');
    mama.write('promise', { status: 'accepted' }, { answers: e1.hash, for: e1.hash });
    const m3 = T(mama.write('transfer', { amount: A(qty, unit) }, { to_owner: leila.id, for: e1.hash }), 'M3');
    if (received) leila.write('observe', { kind: 'received', amount: A(received, unit) }, { for: e1.hash });
    const st = fb.door('promise_stage', e1, w.blocks, {});
    const got = st.lines.length ? am(st.lines[0].moved) : 'none';
    check('in hand', `world ${name}: moved toward the line`, got, want);
  }
  // World C: Leila orders 6 kg in hand; Mama's transfer says 10 kg. Her order counts it for no more than it states: moved 6 kg.
  const w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila');
  const e1 = T(leila.write('promise', { terms: require('../kit.cjs').linesFor(null, { quantity: A('6', 'kg'), in_hand: true }) }, { from: mama.id, to: leila.id }), 'E1');
  mama.write('promise', { status: 'accepted' }, { answers: e1.hash, for: e1.hash });
  mama.write('transfer', { amount: A('10', 'kg') }, { to_owner: leila.id, for: e1.hash });
  check('in hand', 'world C: she ordered 6 kg in hand, the transfer says 10: her order counts 6 kg, never what she did not say', am(fb.door('promise_stage', e1, w.blocks, {}).lines[0].moved), '6 kg');
}
done();
