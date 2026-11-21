const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey, own, drawsOf } = L;
const std = (w, b) => { const r = fb.door('stands', b, w.blocks); return [r.stands, r.waiting.map(x => x.on)]; };
// 3d-14 The people of a voice may reach above it (D8). World: (1) Maria M0, list [card C, phone P, { names: [Mum, Brother], needed: 2, wait: P30D, above: true }], placed by C, clocks Wanjiru. (2) C burns.
// (3) Mum signs K1: new card C2 in C's place; Brother confirms. (4) Thirty days on Wanjiru's cutoffs; Mum and Brother confirm again. Expect K1 stands. World B: the same, with P signing a no inside the thirty days: K1 never stands.
function world(variant) {
  const w = new World(), maria = P(w, 'maria'), mum = P(w, 'mum'), bro = P(w, 'brother'), wanjiru = P(w, 'wanjiru');
  const pK = mkKey('maria-phone'), c2 = mkKey('maria-card-2');
  const kin = { names: [mum.id, bro.id].sort(), needed: 2, wait: 'P30D', ...(variant === 'noabove' ? {} : { above: true }) };
  const clocks = { names: [wanjiru.id], needed: 1 };
  const list = [{ key: maria.key.pub }, { key: pK.pub, wait: 'PT0S' }, kin];
  const K0 = T(maria.write('grant', { kind: 'key', voices: list, clocks }, { subject: maria.id, updates: maria.id }), 'K0');
  const newList = [{ key: c2.pub }, ...list.slice(1)];
  const K1 = T(mum.write('grant', { kind: 'key', voices: newList, clocks }, { subject: maria.id, updates: K0.hash }), 'K1');
  const conf1 = bro.write('observe', { kind: 'confirm' }, { confirms: K1.hash });
  if (variant === 'no') {
    // P signs a no: a key grant stating the list as it was, in the thirty days; the clock holds it before the closing cutoff
    const phone = maria.asKey(pK, K0.hash);
    var N1 = T(phone.write('grant', { kind: 'key', voices: list, clocks }, { subject: maria.id, updates: K0.hash }), 'NO');
  }
  const r1 = wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [K1.hash] });
  if (N1) wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [N1.hash] });
  const cut = wanjiru.write('observe', { kind: 'cutoff', when: 'P30D' }, { subject: K1.hash, derives_from: [r1.hash] }, { at: day(40) });
  const m2 = mum.write('observe', { kind: 'confirm' }, { confirms: K1.hash, after: [cut.hash] });
  const b2 = bro.write('observe', { kind: 'confirm' }, { confirms: K1.hash, after: [cut.hash] });
  return { w, maria, K0, K1, c2 };
}
{
  const { w, maria, K1, c2 } = world('yes');
  check('3d-14', 'K1 (new card C2 in C\'s place, by the kin) stands after the wait and the second signing', std(w, K1), [true, []]);
  check('3d-14', 'the list now holds C2 first', fb.door('identity_state', maria.id, w.blocks).voices[0].key === c2.pub, true);
  check('3d-14', 'identity_state keeps `above` on the kin voice', fb.door('identity_state', maria.id, w.blocks).voices[2].above, true);
}
{
  const { w, K1 } = world('no');
  check('3d-14', 'B: P signed a no inside the thirty days: K1 never stands', std(w, K1), [false, []]);
}
{
  const { w, K1 } = world('noabove');
  check('3d-14', 'a list that does not say so keeps meaning what it meant: the kin cannot reach above their place (K1 never stands)', std(w, K1), [false, []]);
}
// 3d-15 A close. World: (1) Harry H0, list [card, { names: [Leila, Sam], needed: 2, wait: P30D, above: true }]. (2) Leila and Sam close it (3d-14's path). (3) Harry's nephew with the card signs H9: the mill to Ben. Expect H9 counts for nothing.
{
  const w = new World(), harry = P(w, 'harry'), leila = P(w, 'leila'), sam = P(w, 'sam'), ben = P(w, 'ben'), wanjiru = P(w, 'wanjiru');
  const kin = { names: [leila.id, sam.id].sort(), needed: 2, wait: 'P30D', above: true }, clocks = { names: [wanjiru.id], needed: 1 };
  const K0 = harry.write('grant', { kind: 'key', voices: [{ key: harry.key.pub }, kin], clocks }, { subject: harry.id, updates: harry.id });
  const Kd = kindOf(harry, 'mill'), X = T(instance(harry, Kd, {}), 'X');
  const open = T(L.offer(harry, harry, ben, X, { quantity: A('1', 'mill'), price: A('1', 'GBP') }), 'H1');
  const close = T(leila.write('grant', { kind: 'key', voices: [], clocks }, { subject: harry.id, updates: K0.hash }), 'CLOSE');
  sam.write('observe', { kind: 'confirm' }, { confirms: close.hash });
  const r1 = wanjiru.write('observe', { kind: 'receipt' }, { derives_from: [close.hash] });
  const cut = wanjiru.write('observe', { kind: 'cutoff', when: 'P30D' }, { subject: close.hash, derives_from: [r1.hash] }, { at: day(40) });
  leila.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] });
  sam.write('observe', { kind: 'confirm' }, { confirms: close.hash, after: [cut.hash] });
  check('3d-15', 'the close stands (the kin reached above their place, after the wait)', std(w, close), [true, []]);
  const h9 = T(harry.write('transfer', { amount: A('1', 'mill') }, { what: X.hash, to_owner: ben.id, after: [close.hash] }), 'H9');
  check('3d-15', 'H9, the card signing after the close, counts for nothing', fb.door('signed_by_author', h9, w.blocks), false);
  const r = own(w, X);
  check('3d-15', 'her open offer H1 ends at the close: it is freed, not held', drawsOf(r).filter(x => x[0] === 'H1').map(x => x.slice(1)), [[true, null, 'freed']]);
  check('3d-15', 'the identity is closed for good: identity_state has no voice', fb.door('identity_state', harry.id, w.blocks).voices, []);
}
done();
