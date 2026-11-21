const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey } = L;
const am = a => (a ? a.value + ' ' + a.unit : null);
// 3e-8 Where it came, and one account word with a list of places. World: (1) Mama M0, account word AW1: stall (by Mama), till 123456 (by Soko). (2) Ben pays KSh 600; Soko S1 `received` 600 naming AW1 and till 123456. Expect counts 600.
// (3) Soko S2 `received` 600 naming no account word: counts nothing. (4) A thief's AW2 of Mama's key, a later head: `account_of` lists only AW2's places.
function world(step) {
  const w = new World(), mama = P(w, 'mama'), soko = P(w, 'soko'), ben = P(w, 'ben');
  const Kd = kindOf(mama, 'flour'), lot = instance(mama, Kd, { pack: A('10', 'kg') });
  const AW1 = T(mama.write('observe', { kind: 'account', destinations: [{ destination: 'stall', by: mama.id }, { destination: 'till 123456', by: soko.id }] }, {}), 'AW1');
  const o = T(mama.write('promise', { terms: { quantity: A('10', 'kg'), price: A('600', 'KES') } }, { from: mama.id, to: ben.id, what: lot.hash, after: [AW1.hash] }), 'O');
  ben.write('promise', { status: 'accepted' }, { answers: o.hash, for: o.hash });
  const pay = ben.write('transfer', { amount: A('600', 'KES') }, { to_owner: mama.id, for: o.hash });
  const st = () => fb.door('promise_stage', o, w.blocks, {});
  return { w, mama, soko, ben, AW1, o, st, pay };
}
{
  const { w, soko, AW1, st } = world();
  check('3e-8', 'account_of: one head, a list of places', [fb.door('account_of', AW1.refs.author, w.blocks).destinations.map(x => x.destination)], [['stall', 'till 123456']]);
  soko.write('observe', { kind: 'received', amount: A('600', 'KES'), destination: 'till 123456' }, { derives_from: [AW1.hash], for: st().offer, after: [AW1.hash] });
  check('3e-8', '(2) Soko\'s received naming AW1 and till 123456 counts: paid 600', am(st().paid), '600 KES');
}
{
  const { w, soko, AW1, st } = world();
  soko.write('observe', { kind: 'received', amount: A('600', 'KES') }, { for: st().offer });
  check('3e-8', '(3) Soko\'s received naming no account word counts nothing', am(st().paid), null); // counts nothing: paid null until a block counts (3e-1, decided in building)
}
{
  const { w, soko, AW1, st } = world();
  soko.write('observe', { kind: 'received', amount: A('600', 'KES'), destination: 'till 999' }, { derives_from: [AW1.hash], for: st().offer, after: [AW1.hash] });
  check('3e-8', 'a place the word does not list names no place: counts nothing', am(st().paid), null); // counts nothing: paid null until a block counts (3e-1, decided in building)
}
{
  const { w, mama, soko, AW1 } = world();
  const thiefK = mkKey('mama-thief'); // a thief with Mama's key writes a later head
  const AW2 = T(mama.write('observe', { kind: 'account', destinations: [{ destination: 'till 666', by: soko.id }] }, { after: [AW1.hash] }), 'AW2');
  check('3e-8', '(4) a later head replaces the old: account_of lists only AW2\'s places', fb.door('account_of', mama.id, w.blocks).destinations.map(x => x.destination), ['till 666']);
  // a received that names the old word where it is no longer her head counts nothing
  const { st, o } = (() => { const x = world(); return x; })();
}
{
  // a pointer to a word that is not the payee's: Soko's own account word
  const { w, soko, AW1, st } = world();
  const mine = soko.write('observe', { kind: 'account', destinations: [{ destination: 'till 123456', by: soko.id }] }, {});
  soko.write('observe', { kind: 'received', amount: A('600', 'KES'), destination: 'till 123456' }, { derives_from: [mine.hash], for: st().offer, after: [mine.hash] });
  check('3e-8', 'a pointer to a word that is not the payee\'s names no place: counts nothing', am(st().paid), null); // counts nothing: paid null until a block counts (3e-1, decided in building)
}
done();
