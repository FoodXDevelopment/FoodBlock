const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey, own, ownersOf, drawsOf } = L;
// A will holds nothing in life; the successor goes. World: (1) Harry H0. (2) Harry H1 (2027): mill X to Leila on `{ closed: Harry }`. (3) Leila accepts. Expect X Harry's.
// (4) Harry H2 (2029): X to Sam; Sam accepts. Expect Sam. (5) Harry's list closes. Expect H1 takes nothing.
function world(sell) {
  const w = new World(), harry = P(w, 'harry'), leila = P(w, 'leila'), sam = P(w, 'sam'), wanjiru = P(w, 'wanjiru'), kinA = P(w, 'kinA'), kinB = P(w, 'kinB');
  const kin = { names: [kinA.id, kinB.id].sort(), needed: 2, wait: 'P30D', above: true }, clocks = { names: [wanjiru.id], needed: 1 };
  const K0 = harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, kin], clocks }, { subject: harry.id, updates: harry.id });
  const Kd = kindOf(harry, 'mill'), X = T(instance(harry, Kd, {}), 'X');
  const h1 = T(harry.write('transfer', { condition: { closed: harry.id } }, { what: X.hash, to_owner: leila.id }, { at: '2027-03-01T00:00:00.000Z' }), 'H1');
  leila.write('transfer', { status: 'accepted' }, { answers: h1.hash });
  const step3 = own(w, X);
  let step4 = null;
  if (sell) { const h2 = T(harry.write('transfer', {}, { what: X.hash, to_owner: sam.id }, { at: '2029-03-01T00:00:00.000Z' }), 'H2'); sam.write('transfer', { status: 'accepted' }, { answers: h2.hash }); step4 = own(w, X); }
  const close = T(kinA.write('grant', { kind: 'key', voices: [], clocks }, { subject: harry.id, updates: K0.hash }), 'CLOSE');
  kinB.write('observe', { kind: 'confirm' }, { confirms: close.hash });
  const r1 = wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [close.hash] });
  const cut = wanjiru.write('observe', { kind: 'cutoff', when: 'P30D' }, { subject: close.hash, derives_from: [r1.hash] }, { at: day(40) });
  kinA.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] });
  kinB.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] });
  return { w, X, step3, step4, h1 };
}
{
  const { w, X, step3, step4 } = world(true);
  check('a will', '(3) in life the will holds nothing: X is still Harry\'s and he is shown as the owner', [step3.owner === step3.owners[0].owner, ownersOf(step3).owners.map(o => o[0]), step3.held], [true, ['harry'], null]);
  check('a will', '(4) a later sale goes through: X is Sam\'s', ownersOf(step4).owners.map(o => o[0]), ['sam']);
  const r = own(w, X);
  check('a will', '(5) at the close the will finds X gone: H1 takes nothing', [drawsOf(r).filter(x => x[0] === 'H1').map(x => x.slice(1)), ownersOf(r).owners.map(o => o[0])], [[[false, 'past', null]], ['sam']]);
}
{
  const { w, X } = world(false);
  const r = own(w, X);
  check('a will', 'with no later sale, at the close the will takes: X is Leila\'s ("the receiver signs as owner in his own name")', [drawsOf(r).filter(x => x[0] === 'H1').map(x => x.slice(1)), ownersOf(r).owners.map(o => o[0])], [[[true, null, 'landed']], ['leila']]);
}
{
  // an accept of the will before the close is only a request; a will whose list is not closed lands nothing
  const w = new World(), harry = P(w, 'harry'), leila = P(w, 'leila');
  const Kd = kindOf(harry, 'mill'), X = T(instance(harry, Kd, {}), 'X');
  const h1 = T(harry.write('transfer', { condition: { closed: harry.id } }, { what: X.hash, to_owner: leila.id }), 'H1');
  leila.write('transfer', { status: 'accepted' }, { answers: h1.hash });
  check('a will', 'her accept before the close is a request: nothing landed', ownersOf(own(w, X)).owners.map(o => o[0]), ['harry']);
  check('a will', '{ closed } holds once that id\'s list is closed, and not before', fb.door('condition_holds', { closed: harry.id }, w.blocks), false);
}
done();
