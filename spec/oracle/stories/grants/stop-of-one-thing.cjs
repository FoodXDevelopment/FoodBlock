// A stop of one thing. Her stop of L7, her grant's clocks her node; the till's sale of L7 received after it: stopped_thing; its sale of another lot: true.
// With no clocks: a sale with the stop not in its past passes; with the stop in its past: stopped_thing. A stop with amount 10 kg on a line holding 30 kg of L7: a draw of 15 kg takes; a further 10 kg would leave 5: stopped_thing.
// A hand-back after the stop counts. Her own key's sale is unaffected. A lift (signed once, at wait PT0S: it stands when signed): the next sale with the lift in its past is true. A stop with no refs.what, updates or answers: status_not_answer.
// A lift gives her tools their power back, so it waits her voice's `wait`: her phone's voice waits a day on her node's clock; its lift does not stand yet, so the next sale is still stopped_thing.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, check, done, A, kindOf, instance, promise, grant, whyOf, GBP, per, receipt, wf, mkKey } = L;
const mk = () => { const w = new World(); const maria = P(w, 'maria'), till = P(w, 'till'), buyer = P(w, 'buyer'), node = P(w, 'node'); const LK = kindOf(maria, 'loaf'), L7 = instance(maria, LK, { pack: A('10', 'loaf') }), L8 = instance(maria, LK, { pack: A('10', 'loaf') });
  const ML = promise(maria, { from: maria.id }, { lines: [{ id: 'loaves', what: LK.hash, quantity: { max: A('100', 'loaf') }, price: { min: per(3, 'GBP', 'loaf') } }] });
  return { w, maria, till, buyer, node, LK, L7, L8, ML }; };
const sale = (X, g, lot, refs = {}) => X.till.write('promise', { terms: { lines: [{ id: 'loaves', what: lot.hash, quantity: A('10', 'loaf'), price: per(3.5, 'GBP', 'loaf') }] } }, { from: X.maria.id, to: X.buyer.id, under: g.hash, ...refs });
const stop = (X, lot, extra = {}, refs = {}) => X.maria.write('observe', { status: 'stopped', stop: 'onward', ...extra }, { what: lot.hash, ...refs });
{ // her stop and the till's sales
  const X = mk(); const GT = T(grant(X.maria, X.till, { types: ['promise'], on: [X.ML.hash], parties: [X.buyer.id], clocks: { names: [X.node.id], needed: 1 } }, { meter: X.till.id }), 'GT');
  const S = stop(X, X.L7), nS = receipt(X.node, S);
  const s7 = T(sale(X, GT, X.L7), 'sale-L7'), r7 = receipt(X.node, s7), s8 = T(sale(X, GT, X.L8), 'sale-L8'), r8 = receipt(X.node, s8);
  check('stop and sales', 'the sale of L7 received after the stop; the sale of another lot', [whyOf(s7, X.w) && whyOf(s7, X.w).code, whyOf(s8, X.w)], ['stopped_thing', null]);
}
{ // no clocks, and a lift
  const X = mk(); const GT = T(grant(X.maria, X.till, { types: ['promise'], on: [X.ML.hash], parties: [X.buyer.id] }, { meter: X.till.id }), 'GT');
  const unseen = T(sale(X, GT, X.L7), 'unseen'); const S = stop(X, X.L7);
  const seen = T(sale(X, GT, X.L7, { after: S.hash }), 'seen');
  check('no clocks', 'no clocks: the stop not in its past passes; in its past: stopped_thing', [whyOf(unseen, X.w), whyOf(seen, X.w) && whyOf(seen, X.w).code], [null, 'stopped_thing']);
  const lift = T(X.maria.write('observe', { status: 'resumed' }, { updates: S.hash }), 'lift');
  const next = T(sale(X, GT, X.L7, { after: lift.hash }), 'after-lift');
  check('lift', 'a lift (stands when signed at wait PT0S): the next sale with the lift in its past', whyOf(next, X.w), null);
}
{ // a lift with a wait: the lift by a voice that waits a day stands only once her clock shows the day run
  const X = mk(); const GT = T(grant(X.maria, X.till, { types: ['promise'], on: [X.ML.hash], parties: [X.buyer.id] }, { meter: X.till.id }), 'GT');
  const ph = mkKey('maria-phone');
  const K = X.maria.write('grant', { kind: 'key', voices: [{ key: X.maria.key.pub }, { key: ph.pub, wait: 'P1D' }], clocks: { names: [X.node.id], needed: 1 } }, { subject: X.maria.id, updates: X.maria.id });
  const phone = X.maria.asKey(ph, K.hash);
  const S = T(phone.write('observe', { status: 'stopped', stop: 'onward' }, { what: X.L7.hash }), 'S-phone');
  const lift = T(phone.write('observe', { status: 'resumed' }, { updates: S.hash }), 'lift-phone');
  const next = T(sale(X, GT, X.L7, { after: lift.hash }), 'after-waiting-lift');
  check('lift with a wait', 'a lift by a voice that waits a day: it waits (wait), so the next sale is still stopped', [fb.door('stands', lift, X.w.blocks).waiting.map(x => x.on), whyOf(next, X.w) && whyOf(next, X.w).code], [['wait'], 'stopped_thing']);
}
{ // an amount on the stop, and a hand-back
  const w = new World(); const maria = P(w, 'maria'), farm = P(w, 'farm'); const K = kindOf(maria, 'flour'), L7 = T(instance(maria, K, { pack: A('30', 'kg') }), 'L7');
  const L1 = promise(maria, { to: maria.id }, { lines: [{ id: 'flour', what: K.hash, quantity: A('10', 'loaf') }] });
  const G = T(grant(maria, farm, { types: ['transform', 'transfer'], on: [L1.hash], limit: A('30', 'kg') }, { meter: farm.id, what: L7.hash }), 'G');
  const S = T(maria.write('observe', { status: 'stopped', stop: 'onward', amount: A('10', 'kg') }, { what: L7.hash }), 'S');
  const mkMake = (kg, tag) => T(farm.write('transform', { name: 'bake', inputs: [{ from: L7.hash, amount: A(String(kg), 'kg') }] }, { derives_from: [L7.hash], under: G.hash, after: S.hash }), tag);
  const m1 = mkMake(15, 'make15'), m2 = mkMake(10, 'make10');
  check('stop amount', 'a draw of 15 kg takes (15 kg left); a further 10 kg would leave 5 kg', [whyOf(m1, w), whyOf(m2, w) && whyOf(m2, w).code], [null, 'stopped_thing']);
  const hb = T(farm.write('transfer', { amount: A('5', 'kg') }, { what: L7.hash, to_owner: maria.id, under: G.hash, after: S.hash }), 'hand-back');
  check('hand-back', 'a hand-back after the stop counts', whyOf(hb, w), null);
  const bad = maria.write('observe', { status: 'stopped' }, { subject: L7.hash }, { keep: true });
  check('stop without a target', 'an observe with status stopped and no refs.what, updates or answers', fb.door('read', bad, w.blocks).map(x => x.code), ['status_not_answer']);
}
done();
