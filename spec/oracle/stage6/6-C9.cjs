// C9 what a circle's word names, C9a a circle's account word, C9b the listing (changes-1.9/06-circles.md section 3).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, cafe, found, GBP, part, per, as, confirm, state, holds, speaks, ownPart, sendParts, yesTo, readCodes, handsOf, r1, day } = L;
{
  // C9. Amara signs `as` F under r1 an order of 10 sacks from Harry, £205, pay by Friday. Then Amara and Leila move every pound of the café to themselves (C6).
  const W = cafe(); const { w, amara, leila, harry, F } = W;
  const Kd = kindOf(harry, 'flour'), sacks = T(instance(harry, Kd, { pack: A('10', 'sack') }), 'SACKS');
  const O = T(as(amara, F, 'promise', { terms: { quantity: A('10', 'sack'), price: per(20.5, 'sack'), pay_by: day(5) } }, { from: harry.id, to: F.hash }), 'ORDER');
  const empty = T(as(amara, F, 'transfer', { amount: GBP(2000) }, { to_owner: amara.id }), 'EMPTY'); confirm(leila, empty);
  check('C9', 'the emptying move holds by every owner (C6)', holds(w, F, empty).every_owner, true);
  check('C9', 'Harry\'s deal stands and speaks for the café', [fb.door('stands', O, w.blocks).stands, fb.door('speaks_for', O, w.blocks) === F.hash], [true, true]);
  check('C9', 'it names the café\'s things only: nothing of Amara\'s own or Leila\'s own is named', [fb.door('gives', O, amara.id, w.blocks).gives.length, fb.door('gives', O, leila.id, w.blocks).gives.length], [0, 0]);
  // P1 "mine until you say paid": Harry's delivery to F on the condition of his own paid signal; the owners' draw on his sacks takes nothing
  const del = T(harry.write('transfer', { condition: { paid: O.hash } }, { what: sacks.hash, to_owner: F.hash }), 'DELIVERY');
  const draw = T(as(amara, F, 'transfer', {}, { what: sacks.hash, to_owner: amara.id }), 'DRAW'); confirm(leila, draw);
  check('C9', 'Harry\'s delivery is held on his own paid signal: the owners\' draw on his sacks takes nothing (not_owner); his 10 sacks are held, not the circle\'s', [ownPart(w, sacks).draws.find(d => d[0] === 'DRAW').slice(1), ownPart(w, sacks).held], [[false, 'not_owner', null], '10']);
}
{
  // C9a. Amara signs `as` F an account word, destinations [PayLink 55 by PayLink]. r1 names observe, so it holds. Joe, under G (types promise, transfer), signs one `as` F: no row holds; it acts on nothing.
  const W = cafe(); const { w, amara, leila, harry, joe, ben, F, Tm } = W;
  const payLink = P(w, 'paylink');
  const AW = T(as(amara, F, 'observe', { kind: 'account', destinations: [{ destination: 'PayLink 55', by: payLink.id }] }), 'AW');
  check('C9a', 'r1 names observe: the word holds and counts for the circle', [holds(w, F, AW).holds, holds(w, F, AW).row, fb.door('speaks_for', AW, w.blocks) === F.hash], [true, 0, true]);
  check('C9a', 'account_of the circle: PayLink 55', (fb.door('account_of', F.hash, w.blocks) || {}).destinations, [{ destination: 'PayLink 55', by: payLink.id }]);
  const G = T(as(amara, F, 'grant', { kind: 'tool', scope: { types: ['promise', 'transfer'], each: GBP(100) } }, { to: joe.id, meter: Tm }), 'G');
  const JW = T(as(joe, F, 'observe', { kind: 'account', destinations: [{ destination: 'Joe 9', by: joe.id }] }), 'JW');
  check('C9a', 'Joe\'s account word `as` F: no row holds for it; it acts on nothing (the café\'s account word is still Amara\'s)', [holds(w, F, JW).holds, fb.door('speaks_for', JW, w.blocks), fb.door('account_of', F.hash, w.blocks).destinations.map(x => x.destination)], [false, null, ['PayLink 55']]);
  // the takings: a sale of the café to Ben, paid, PayLink's `received` naming the word places it at PayLink 55
  const O = T(as(amara, F, 'promise', { terms: { quantity: A('1', 'cake'), price: GBP(10) } }, { from: F.hash, to: ben.id, after: [AW.hash] }), 'SALE');
  ben.write('promise', { status: 'accepted' }, { answers: O.hash, for: O.hash });
  ben.write('transfer', { amount: GBP(10) }, { to_owner: F.hash, for: O.hash });
  payLink.write('observe', { kind: 'received', amount: GBP(10), destination: 'PayLink 55' }, { derives_from: [AW.hash], for: O.hash, after: [AW.hash] });
  const st = fb.door('promise_stage', O, w.blocks, {});
  check('C9a', 'PayLink\'s received blocks place the café\'s takings at PayLink 55: £10 paid', st.paid && st.paid.value, '10');
}
{
  // C9b. C9's emptying move, not having Harry's deal in its causal past: listed beside Harry's deal. A sale of the oven to Amara's cousin for £1 gives to no owner and is not listed.
  const W = cafe(); const { w, amara, leila, harry, ben, F } = W;
  const O = T(as(amara, F, 'promise', { terms: { quantity: A('10', 'sack'), price: per(20.5, 'sack'), pay_by: day(5) } }, { from: harry.id, to: F.hash }), 'ORDER');
  const E = T(as(leila, F, 'transfer', { amount: GBP(2000) }, { to_owner: leila.id }), 'EMPTY'); confirm(amara, E);
  check('C9b', 'the emptying move (signed by Leila, whose line has not seen the deal) is listed beside Harry\'s deal', fb.door('row_holds', E, w.blocks).listed, [O.hash]);
  const oven = T(as(leila, F, 'transfer', { amount: GBP(1) }, { to_owner: ben.id }), 'OVEN');
  check('C9b', 'a sale of the oven to a stranger for £1 gives to no owner and is not listed', fb.door('row_holds', oven, w.blocks).listed, []);
}
done();
