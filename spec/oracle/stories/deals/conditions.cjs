// Conditions.
// (1) Joe J1 box X to Amara `without` his arrival by 07:00 20 Nov, `clocks` Wanjiru and Leila, `needed` 2. (2) Amara accepts. No cutoff. Expect X `held` at every reader, whatever its clock.
// (1) Y is Wanjiru's promise conditioned `{ accepted: X }`. (2) Amara accepts Y. Expect Y `accepted`; nothing of Y due until X binds.
// (1) Sam's sack X to Amara on `{ paid: deal }`, stating rule set R. Expect, on a node that does not run R, X's transfer not read (`unknown_rules`); with no `state.rule_set` it is read by the core alone, which runs no named reading, so it is not read anywhere.
// World B: written on Sam's signal; Sam signs `paid`. Expect X lands on every node.
// (1) Leila the counter signs "pledged 520"; Maria's pledge, `ge 500`, is accepted with it in its past. (2) Leila signs "120". Expect Maria's pledge still bound.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, drawsOf, GBP, stage, offer, accepts, day, yes } = L;
const dr = (r, ...tags) => drawsOf(r).filter(x => tags.includes(x[0])).map(x => x.slice(0, 4));
const codes = b => fb.door('read', b, []).map(x => x.code);
{
  const w = new World(), joe = P(w, 'joe'), amara = P(w, 'amara'), wanjiru = P(w, 'wanjiru'), leila = P(w, 'leila');
  const K = kindOf(joe, 'box'), X = T(instance(joe, K, {}), 'X');
  const cond = { without: { signal: 'arrived', by: { names: [joe.id] }, subject: X.hash }, deadline: '2026-11-20T07:00:00.000Z', clocks: { names: [wanjiru.id, leila.id].sort(), needed: 2 } };
  const j1 = T(joe.write('transfer', { condition: cond }, { what: X.hash, to_owner: amara.id }), 'J1');
  T(amara.write('transfer', { status: 'accepted' }, { answers: j1.hash }), 'A1');
  check('without', 'X held at every reader (no cutoff; no reader\'s clock exists)', [dr(own(w, X), 'J1'), fb.door('condition_holds', cond, w.blocks)], [[['J1', true, null, 'held']], false]);
}
{
  const w = new World(), wan = P(w, 'wanjiru'), amara = P(w, 'amara'), sam = P(w, 'sam');
  const X = T(sam.write('promise', { what: 'x', terms: L.linesFor(null, { price: GBP(5) }, 'fee') }, { from: sam.id, to: amara.id }), 'X');
  const Y = T(wan.write('promise', { what: 'y', terms: L.linesFor(null, { price: GBP(5), condition: { accepted: X.hash } }) }, { from: wan.id, to: amara.id }), 'Y');
  yes(amara, Y);
  check('accepted', '(2) Y accepted; X does not bind (offered): the condition does not hold', [stage(w, Y).stage, stage(w, X).stage, fb.door('condition_holds', { accepted: X.hash }, w.blocks)], ['accepted', 'offered', false]);
  yes(amara, X);
  check('accepted', 'once X binds the condition holds', fb.door('condition_holds', { accepted: X.hash }, w.blocks), true);
}
{
  const w = new World(), sam = P(w, 'sam'), amara = P(w, 'amara');
  const K = kindOf(sam, 'sack'), X = T(instance(sam, K, {}), 'X');
  const o = T(sam.write('promise', { terms: L.linesFor(X, { price: GBP(5) }) }, { from: sam.id, to: amara.id }), 'D');
  const t = sam.make('transfer', { condition: { paid: o.hash }, rule_set: 'f'.repeat(64) }, { what: X.hash, to_owner: amara.id, for: o.hash });
  const t0 = sam.make('transfer', { condition: { paid: o.hash } }, { what: X.hash, to_owner: amara.id, for: o.hash });
  const ts = sam.make('transfer', { condition: { signal: 'paid', by: { names: [sam.id] }, subject: o.hash } }, { what: X.hash, to_owner: amara.id, for: o.hash });
  const rd = b => fb.door('read', b, w.blocks).map(x => x.code);
  check('paid and a rule set', 'stating a rule set this reader does not run: not read, unknown_rules', rd(t), ['unknown_rules']);
  // no `state.rule_set`: H₀ reads it, and it runs no named reading: the condition is not read anywhere: null, never holds; the block itself is a block
  check('paid and a rule set', 'no rule_set on a named reading: the block is read', rd(t0), []);
  // H₀ reads signed fields: a draw conditioned on `{ paid }` is not landed by a node that does not run that reading, even where the price was paid; the payee\'s own signal needs no reading
  w.add(t0); const t0h = T(t0, 'T0'); yes(amara, o); amara.write('transfer', { status: 'accepted' }, { answers: t0h.hash, for: o.hash });
  const pp = amara.write('transfer', { amount: GBP(5) }, { to_owner: sam.id, for: o.hash }); sam.write('transfer', { status: 'accepted' }, { answers: pp.hash, for: o.hash });
  check('paid and a rule set', 'the price is paid, and the core, which runs no named reading, does not read `paid` (null) and holds X not landed', [fb.door('condition_holds', { paid: o.hash }, w.blocks), dr(own(w, X), 'T0')], [null, [['T0', true, null, 'held']]]);
  check('paid and a rule set', 'written on Sam\'s own signal: read on every node', rd(ts), []);
  // World B: written on Sam's signal; Sam signs `paid`. Expect X lands on Amara's accept, on every node
  const w2 = new World(), sam2 = P(w2, 'sam'), amara2 = P(w2, 'amara');
  const K2 = kindOf(sam2, 'sack'), X2 = T(instance(sam2, K2, {}), 'X');
  const o2 = T(sam2.write('promise', { terms: L.linesFor(X2, { price: GBP(5) }) }, { from: sam2.id, to: amara2.id }), 'D');
  const t2 = T(sam2.write('transfer', { condition: { signal: 'paid', by: { names: [sam2.id] }, subject: o2.hash } }, { what: X2.hash, to_owner: amara2.id, for: o2.hash }), 'T2');
  yes(amara2, o2);
  amara2.write('transfer', { status: 'accepted' }, { answers: t2.hash, for: o2.hash });
  check('paid and a rule set', 'World B: before Sam signs paid, X is held', dr(own(w2, X2), 'T2'), [['T2', true, null, 'held']]);
  sam2.write('observe', { kind: 'paid' }, { subject: o2.hash });
  check('paid and a rule set', 'World B: Sam signs paid: X lands on Amara', [dr(own(w2, X2), 'T2'), ownersOf(own(w2, X2))], [[['T2', true, null, 'landed']], { owners: [['amara', null]] }]);
}
{
  const w = new World(), maria = P(w, 'maria'), leila = P(w, 'leila'), org = P(w, 'organiser');
  const pledge = T(maria.write('promise', { what: 'pledge', terms: L.linesFor(null, { price: GBP(5), condition: { signal: 'pledged', by: { names: [leila.id] }, subject: org.id, op: 'ge', value: A('500', 'GBP') } }) }, { from: maria.id, to: org.id }), 'PL');
  const s520 = T(leila.write('observe', { kind: 'pledged', amount: A('520', 'GBP') }, { subject: org.id }), 'S520');
  const acc = T(org.write('promise', { status: 'accepted' }, { answers: pledge.hash, for: pledge.hash, after: s520.hash }), 'ACC');
  const cond = pledge.state.terms.condition;
  const past = [w.blocks.find(b => b.hash === s520.hash)];
  check('pledge', '(1) with 520 in the accept\'s past the pledge condition holds', fb.door('condition_holds', cond, w.blocks), true);
  leila.write('observe', { kind: 'pledged', amount: A('120', 'GBP') }, { subject: org.id });
  check('pledge', '(2) after "120" the pledge is still bound (a sum is a signal: what it moved stays moved)', stage(w, pledge).stage, 'accepted');
}
done();
