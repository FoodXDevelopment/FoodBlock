const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, deal, sell, day, mkKey } = L;
const stands = (w, b) => fb.door('stands', b, w.blocks);
const std = (w, b) => { const r = stands(w, b); return [r.stands, r.waiting.map(x => x.on)]; };
const signed = (w, b) => fb.door('signed_by_author', b, w.blocks);
// 3d-6 One receipt that names an end and a block. World (the end is her phone key's removal; the grant version is stage 4's): (1) Amara's list [card, phone], clocks her node N (1 of 1). (2) Amara's card ends the phone; a thief's block X by the phone, joined to Sam's order.
// (3) N1 receipts the end and X together. Expect X waiting. (4) N2 receipts X again. Expect X counts for nothing.
{
  const w = new World(), amara = P(w, 'amara'), sam = P(w, 'sam'), N = P(w, 'node');
  const phoneK = mkKey('amara-phone');
  const K1 = amara.write('grant', { kind: 'key', voices: [{ key: amara.key.pub }, { key: phoneK.pub, wait: 'PT0S', reach: 'PT0S' }], clocks: { names: [N.id], needed: 1 } }, { subject: amara.id, updates: amara.id });
  const phone = amara.asKey(phoneK, K1.hash);
  const Kd = kindOf(amara, 'flour'), F = T(instance(phone, Kd, { pack: A('5', 'kg') }), 'F');
  const d = deal(phone, F, sam, A('5', 'kg'));
  const end = T(amara.write('grant', { kind: 'key', voices: [{ key: amara.key.pub }] }, { subject: amara.id, updates: K1.hash }), 'A5');
  const X = T(sell(phone, F, sam, d, A('5', 'kg')), 'X');
  N.write('observe', { kind: 'receipt' }, { derives_from: [end.hash, X.hash] });
  check('3d-6', 'N1 receipts the end and X together: X waits (on end)', std(w, X), [false, ['end']]);
  N.write('observe', { kind: 'receipt' }, { derives_from: [X.hash] });
  check('3d-6', 'N2 receipts X again: after the end, X counts for nothing', std(w, X), [false, []]);
}
// 3d-7 A clock is read in the past of the block that relies on it. World: Leila's key grant K, reach P30D, clock Wanjiru. Wanjiru's cutoff W9 closes K's reach. Mill Lane's block M holds no W9. Expect: for M, K still waiting.
{
  const w = new World(), leila = P(w, 'leila'), wanjiru = P(w, 'wanjiru');
  const pK = mkKey('leila-phone'), tK = mkKey('leila-tablet');
  const K1 = leila.write('grant', { kind: 'key', voices: [{ key: leila.key.pub }, { key: pK.pub, wait: 'PT0S', reach: 'P30D' }], clocks: { names: [wanjiru.id], needed: 1 } }, { subject: leila.id, updates: leila.id });
  const phone = leila.asKey(pK, K1.hash);
  const K = T(phone.write('grant', { kind: 'key', voices: [{ key: leila.key.pub }, { key: pK.pub, wait: 'PT0S', reach: 'P30D' }, { key: tK.pub, wait: 'PT0S' }], clocks: { names: [wanjiru.id], needed: 1 } }, { subject: leila.id, updates: K1.hash }), 'K');
  const mill = P(w, 'millLane');
  const M = T(mill.write('observe', { kind: 'note' }, { for: K.hash }), 'M'); // Mill Lane's block, made on K
  const rc = wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [K.hash] });
  const W9 = T(wanjiru.write('observe', { kind: 'cutoff', when: 'P30D' }, { subject: K.hash, derives_from: [rc.hash] }, { at: day(40) }), 'W9');
  const M2 = T(mill.write('observe', { kind: 'note' }, { for: K.hash, after: [W9.hash] }), 'M2');
  check('3d-7', 'for the world that holds W9, K stands', std(w, K), [true, []]);
  check('3d-7', 'M holds no W9: for M, K still waits (M waits on the block it names)', std(w, M), [false, ['named']]);
  check('3d-7', 'M2 holds W9 in its past: K stands there and so does M2', std(w, M2), [true, []]);
}
// 3d-8 Her own word stands alone. World: (1) Mama M0, card A only, no clock, reach PT0S. (2) Mama M1: her `received` KSh 100 for Leila's order. Expect stands true when signed. (3) A thief with her SIM signs M2: a stop of her grant to Soko.
// (4) Card A signs K2, ending the SIM key, counted_to M1. Expect M2 off her line: the grant stands. Had Soko's block already built on M2, M2 would stay for Soko.
function mama(soko) {
  const w = new World(), m = P(w, 'mama'), leila = P(w, 'leila'), sk = P(w, 'soko');
  const simK = mkKey('mama-sim');
  const K1 = m.write('grant', { kind: 'key', voices: [{ key: m.key.pub }, { key: simK.pub, wait: 'PT0S', reach: 'PT0S' }], clocks: { names: [leila.id], needed: 1 } }, { subject: m.id, updates: m.id });
  // (the list states a clock because a voice states a reach; Leila's line is never asked)
  const order = leila.write('promise', { terms: { quantity: A('1', 'sack'), price: A('100', 'KES') } }, { from: m.id, to: leila.id });
  const M1 = T(m.write('observe', { kind: 'received', amount: A('100', 'KES') }, { for: order.hash, after: [K1.hash] }), 'M1');
  const G = T(m.write('grant', { kind: 'shop', scope: { types: ['observe.note'] } }, { to: sk.id }), 'G');
  const sim = m.asKey(simK, K1.hash);
  const M2 = T(sim.write('grant', { status: 'stopped', stop: 'onward' }, { updates: G.hash, after: [M1.hash] }), 'M2');
  const K2 = T(m.write('grant', { kind: 'key', voices: [{ key: m.key.pub }], counted_to: M1.hash }, { subject: m.id, updates: K1.hash, after: [M1.hash] }), 'K2');
  if (soko) sk.write('observe', { kind: 'note' }, { after: [M2.hash], subject: M2.hash });
  return { w, M1, M2, G, K2 };
}
{
  const { w, M1, M2, G } = mama(false);
  const early = (() => { const w2 = new World(), m = P(w2, 'mama'), leila = P(w2, 'leila'); const order = leila.write('promise', { terms: { quantity: A('1', 'sack') } }, { from: m.id, to: leila.id }); const r = m.write('observe', { kind: 'received', amount: A('100', 'KES') }, { for: order.hash }); return std(w2, r); })();
  check('3d-8', 'M1, her `received` for Leila\'s order, stands when signed (no wait for a third block)', early, [true, []]);
  check('3d-8', 'M2 (thief\'s stop) is off her line once K2 counts to M1: it does not stand', std(w, M2)[0], false);
  check('3d-8', 'the grant G stands (the thief\'s stop does not end it)', fb.grantLive(G, new fb.Pool(w.blocks)), true);
}
{
  const { w, M2 } = mama(true);
  check('3d-8', 'had Soko\'s block already built on M2, M2 would stay for Soko: it counts', signed(w, M2), true);
}
// 3d-9 The join: a cash sale is done at the seller's block. World: (1) Leila E1 orders 2 kg of Mama's lot T, naming T. (2) Mama M2 transfers 2 kg of T `for` E1. Expect M2 stands true; Leila owns 2 kg.
{
  const w = new World(), m = P(w, 'mama'), leila = P(w, 'leila');
  const phoneK = mkKey('mama-phone');
  const K1 = m.write('grant', { kind: 'key', voices: [{ key: m.key.pub }, { key: phoneK.pub, wait: 'PT0S' }] }, { subject: m.id, updates: m.id });
  const phone = m.asKey(phoneK, K1.hash);
  const Kd = kindOf(m, 'tomatoes'), Tt = T(instance(phone, Kd, { pack: A('10', 'kg') }), 'T');
  const d = deal(phone, Tt, leila, A('2', 'kg'));
  const M2 = T(sell(phone, Tt, leila, d, A('2', 'kg')), 'M2');
  check('3d-9', 'M2 stands at Mama\'s block (joined to Leila\'s order, which has seen no end)', std(w, M2), [true, []]);
  leila.write('transfer', { status: 'accepted' }, { answers: M2.hash });
  check('3d-9', 'Leila owns 2 kg', ownersOf(own(w, Tt)).owners.filter(o => o[0] === 'leila'), [['leila', '2']]);
}
done();
