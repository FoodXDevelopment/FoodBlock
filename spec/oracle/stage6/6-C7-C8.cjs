// C7 joining, leaving, a close; C8 a buyer of parts and blocks sealed before he bought (changes-1.9/06-circles.md section 3).
const L = require('./lib.cjs'); const { cafe, fb, World, P, T, tg, nm, A, kindOf, instance, check, done, found, GBP, part, per, as, confirm, state, holds, speaks, ownPart, sendParts, yesTo, readCodes, handsOf, r1, day } = L;
// the café with Leila's list: her own key and two kin who may close it (the people of a voice reach above it only where her list says so, D8)
function world(will) {
  const w = new World(), amara = P(w, 'amara'), leila = P(w, 'leila'), kwame = P(w, 'kwame'), harry = P(w, 'harry'), wan = P(w, 'wanjiru'), kinA = P(w, 'kinA'), kinB = P(w, 'kinB'), till = P(w, 'till');
  const kin = { names: [kinA.id, kinB.id].sort(), needed: 2, wait: 'P30D', above: true }, clocks = { names: [wan.id], needed: 1 };
  const K0 = leila.write('grant', { kind: 'key', voices: [{ key: leila.key.pub }, kin], clocks }, { subject: leila.id, updates: leila.id });
  const F = T(found(amara, { pack: 100, rules: [r1()], clocks: { names: [wan.id] }, meter: till.id, name: 'cafe' }), 'F');
  const P1 = sendParts(amara, F, 50, leila); yesTo(leila, P1);
  let W1 = null;
  if (will) { W1 = T(leila.write('transfer', { amount: part(50), condition: { closed: leila.id } }, { what: F.hash, to_owner: kwame.id }), 'WILL'); yesTo(kwame, W1); }
  const before = ownPart(w, F);
  const close = T(kinA.write('grant', { kind: 'key', voices: [], clocks }, { subject: leila.id, updates: K0.hash }), 'CLOSE');
  kinB.write('observe', { kind: 'confirm' }, { confirms: close.hash });
  const r = wan.write('observe', { kind: 'receipt' }, { derives_from: [close.hash] });
  const cut = wan.write('observe', { kind: 'cutoff', when: 'P30D' }, { subject: close.hash, derives_from: [r.hash] }, { at: day(40) });
  kinA.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] });
  kinB.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] });
  return { w, amara, leila, kwame, harry, F, before, till, close };
}
{
  const { w, F, before } = world(true);
  check('C7', 'in life the will holds nothing: Amara 50, Leila 50', before.owners, [['amara', '50'], ['leila', '50']]);
  check('C7', 'after her close and Kwame\'s accept: Kwame 50 (her will), Leila none', ownPart(w, F).owners, [['amara', '50'], ['kwame', '50']]);
}
{
  const { w, amara, leila, harry, F, close } = world(false);
  check('C7', 'without a will: her 50 stay hers and move to no one', ownPart(w, F).owners, [['amara', '50'], ['leila', '50']]);
  const B1 = T(as(amara, F, 'promise', { terms: { quantity: A('10', 'litre'), price: { amount: GBP(12), per: A('1', 'litre') } } }, { from: harry.id, to: F.hash }), 'B1');
  check('C7', 'r1 (1 part) still holds for Amara\'s blocks', holds(w, F, B1).holds, true);
  const big = T(as(amara, F, 'transfer', { amount: GBP(900) }, { to_owner: harry.id }), 'BIG');
  const c = T(confirm(leila, big, {}, { after: [close.hash] }), 'c'); // her close is in the past of her later block: no key of hers speaks for it
  check('C7', 'the every-owner way needs Leila\'s hand and is shut for good: her confirm after her close counts for nothing', [holds(w, F, big).holds, handsOf(holds(w, F, big)).map(h => h.slice(0, 3)).sort()], [false, [['amara', '50', true], ['leila', '50', false]]]);
}
{
  // C8. S, sealed to audience F, is signed; then Leila transfers her 50 to Rex, who accepts. S's audience is Amara and Leila; Rex is not in it. (A block's audience that names a circle names the owners in the circle fold of that block's causal past.)
  const W = cafe(); const { w, amara, leila, rex, F } = W;
  const S = T(amara.write('observe', { kind: 'note' }, { derives_from: [F.hash], after: [W.P2.hash] }), 'S');
  const tr = sendParts(leila, F, 50, rex); yesTo(rex, tr);
  check('C8', 'members_then(S, F): the owners of F in the circle fold of S\'s causal past: Amara and Leila', fb.door('members_then', S, F.hash, w.blocks).map(nm).sort(), ['amara', 'leila']);
  const S2 = T(amara.write('observe', { kind: 'note' }, { derives_from: [F.hash], after: [W.P2.hash, tr.hash] }), 'S2');
  check('C8', 'S2 sees Leila\'s transfer but not Rex\'s accept: she still owns until his yes, so Amara and Leila', fb.door('members_then', S2, F.hash, w.blocks).map(nm).sort(), ['amara', 'leila']);
}
done();
