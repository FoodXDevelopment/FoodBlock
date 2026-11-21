// G16, the stop (T2-1, T2-9). W. Amara A4 stops G at 10:40; F receipts it (F1). Thief's accept I12, received by F after F1: counts for nothing (one line of two shows the narrowing).
// N receipts A4 (N4): what G's line had not drawn comes back to Amara. Leila's pump: grant limit 100 l from Sam, deal accepted, 40 l came, Leila stops: the room held for the 60 l stays held until Sam's "done",
// the offer's stop term (`terms.stoppable`), its `deliver_by` passing on a clock it names, or a ruling of a judge both named that ends the rest (`state.ends_rest`).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, check, done, baseWorld, whyOf, A, GBP, per, promise, grant, instance, kindOf, receipt, day } = L;
{
  const W = baseWorld(); const { w, amara, harry, sam, ai, G, n0, f0 } = W;
  const h1 = W.offer(harry, 20.5, {}, 'H1'), I1 = W.accept(h1, 205, 'I1'); const N1 = W.receipt(I1, 205, 'N1'); const F0r = T(receipt(f0, I1), 'F-I1');
  check('G16', 'before the stop: I1 stands under G', whyOf(I1, w), null);
  const A4 = T(amara.write('grant', { status: 'stopped', stop: 'onward' }, { updates: G.hash }), 'A4');
  const F1 = T(receipt(f0, A4), 'F1');
  const h2 = W.offer(sam, 20.5, {}, 'H2'), I12 = W.accept(h2, 205, 'I12'); const FR = T(receipt(f0, I12), 'F-I12');
  check('G16', 'the thief\'s accept I12, received by F after F1 (one line of two shows the narrowing): counts for nothing', whyOf(I12, w), { code: 'not_live', why: null });
  check('G16', 'I1, received before the stop on F (and on N), is not cut', whyOf(I1, w), null);
  const m0 = fb.door('meter', G, w.blocks);
  check('G16', 'before N receipts the stop: nothing has come back yet', m0.comes_back, []);
  const N4 = T(receipt(n0, A4), 'N4');
  const m1 = fb.door('meter', G, w.blocks);
  check('G16', 'N receipts A4: what the line had not drawn (£5) comes back to Amara', m1.comes_back, [{ of: G.hash, amount: GBP(5) }]);
}
{ // Leila's pump
  const w = new World(); const leila = P(w, 'leila'), sam = P(w, 'sam'), pump = P(w, 'pump');
  const fuel = kindOf(sam, 'diesel'), tank = instance(sam, fuel, { pack: A('100', 'l') });
  const LP = T(promise(leila, { to: leila.id, what: fuel.hash }, { quantity: A('100', 'l'), price: { max: per(1.5, 'GBP', 'l') } }), 'LP');
  const GP = T(grant(leila, pump, { types: ['promise', 'transfer'], on: [LP.hash], parties: [sam.id], limit: A('100', 'l') }, { meter: pump.id }), 'GP');
  const so = T(promise(sam, { from: sam.id, to: leila.id, what: tank.hash }, { quantity: A('100', 'l'), price: per(1.4, 'GBP', 'l') }), 'SO');
  const ac = T(pump.write('promise', { status: 'accepted', draws: { grant: GP.hash, amount: A('100', 'l') } }, { answers: so.hash, for: so.hash, under: GP.hash }), 'accept');
  const came = T(sam.write('transfer', { amount: A('40', 'l') }, { what: tank.hash, to_owner: leila.id, for: so.hash, after: ac.hash }), 'came');
  check('G16', 'the pump\'s accept of 100 l stands', whyOf(ac, w), null);
  const stop = T(leila.write('grant', { status: 'stopped', stop: 'onward' }, { updates: GP.hash }), 'stop');
  check('G16', 'Leila stops, 40 l came: the room held for the 60 l stays held (nothing comes back)', fb.door('meter', GP, w.blocks).comes_back, []);
  const done_ = T(sam.write('observe', { kind: 'paid' }, { subject: so.hash }), 'done');
  check('G16', 'after Sam\'s "done" the 60 l comes back (on the limit and on her quantity)', fb.door('meter', GP, w.blocks).comes_back, [{ of: GP.hash, amount: A('60', 'l') }, { of: LP.hash, amount: A('60', 'l') }]);
}
// the other three ways the rest of the pump's deal can no longer fall due
function pump(terms = {}) {
  const w = new World(); const leila = P(w, 'leila'), sam = P(w, 'sam'), pumpK = P(w, 'pump'), node = P(w, 'node'), judge = P(w, 'judge');
  const fuel = kindOf(sam, 'diesel'), tank = instance(sam, fuel, { pack: A('100', 'l') });
  // her want carries the same terms (Keeps to: a term A does not carry, C does not carry)
  const LP = T(promise(leila, { to: leila.id, what: fuel.hash }, { quantity: A('100', 'l'), price: { max: per(1.5, 'GBP', 'l') }, ...terms(node) }), 'LP');
  const GP = T(grant(leila, pumpK, { types: ['promise', 'transfer'], on: [LP.hash], parties: [sam.id], limit: A('100', 'l') }, { meter: pumpK.id }), 'GP');
  const so = T(promise(sam, { from: sam.id, to: leila.id, what: tank.hash }, { quantity: A('100', 'l'), price: per(1.4, 'GBP', 'l'), ...terms(node) }), 'SO');
  const ac = T(pumpK.write('promise', { status: 'accepted', draws: { grant: GP.hash, amount: A('100', 'l') } }, { answers: so.hash, for: so.hash, under: GP.hash }), 'accept');
  T(sam.write('transfer', { amount: A('40', 'l') }, { what: tank.hash, to_owner: leila.id, for: so.hash, after: ac.hash }), 'came');
  T(leila.write('grant', { status: 'stopped', stop: 'onward' }, { updates: GP.hash }), 'stop');
  return { w, leila, sam, node, judge, GP, LP, so };
}
const back = X => fb.door('meter', X.GP, X.w.blocks).comes_back;
const both60 = X => [{ of: X.GP.hash, amount: A('60', 'l') }, { of: X.LP.hash, amount: A('60', 'l') }];
{
  const X = pump(() => ({ stoppable: true }));
  check('G16', 'the offer said ahead that her stop ends what has not come (stoppable): her stop frees the 60 l', back(X), both60(X));
}
{
  const X = pump(node => ({ deliver_by: day(5, 12), clocks: { names: [node.id], needed: 1 } }));
  check('G16', 'before its deliver_by passes on the clock the offer names: nothing comes back', back(X), []);
  T(X.node.write('observe', { kind: 'cutoff', when: day(5, 12), at: day(5, 13) }, { subject: X.so.hash }), 'deliver-by-passed');
  check('G16', 'the clock\'s cutoff through deliver_by: the 60 l comes back', back(X), both60(X));
}
{
  const X = pump(() => ({}));
  const ref = T(X.leila.write('grant', { kind: 'referee', scope: { types: ['observe'] } }, { to: X.judge.id, subject: X.so.hash }), 'referee');
  T(X.sam.write('grant', { status: 'accepted' }, { answers: ref.hash }), 'sam-names-her');
  T(X.judge.write('observe', { kind: 'ruling', ends_rest: true }, { subject: X.so.hash }), 'ruling');
  check('G16', 'a ruling of a judge both named that ends the rest: the 60 l comes back', back(X), both60(X));
}
done();
