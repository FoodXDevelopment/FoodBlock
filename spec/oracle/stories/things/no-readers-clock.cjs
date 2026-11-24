const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, day } = L;
// No reader's clock. World: (1) Joe J0 box X; J1 X to Amara, `without` his arrival by 07:00 20 Nov, clocks Wanjiru and Leila, needed 2. (2) Amara A1 accepts. No cutoff is signed.
// Expect X held at every reader, whatever its clock says.
{
  const w = new World(), joe = P(w, 'joe'), amara = P(w, 'amara'), wanjiru = P(w, 'wanjiru'), leila = P(w, 'leila');
  const K = kindOf(joe, 'box'), X = T(instance(joe, K, {}), 'X');
  const cond = { without: { signal: 'arrived', by: { names: [joe.id] }, subject: X.hash }, deadline: '2026-11-20T07:00:00.000Z', clocks: { names: [wanjiru.id, leila.id].sort(), needed: 2 } };
  const j1 = T(joe.write('transfer', { condition: cond }, { what: X.hash, to_owner: amara.id }), 'J1');
  amara.write('transfer', { status: 'accepted' }, { answers: j1.hash });
  const at = now => drawsOf(fb.door('ownership', X, w.blocks, now)).filter(x => x[0] === 'J1').map(x => x.slice(1));
  check('no reader clock', 'ownership at no clock', at(undefined), [[true, null, 'held']]);
  check('no reader clock', 'ownership at a clock of 2027: the same', at('2027-01-01T00:00:00.000Z'), [[true, null, 'held']]);
  check('no reader clock', 'no reader\'s clock: read on every block held (null), the condition does not hold', fb.door('condition_holds', cond, w.blocks, null), false);
}
done();
