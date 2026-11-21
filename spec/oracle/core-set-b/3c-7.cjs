const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, offer, accepts, day } = L;
// 3c-7 A receiving place handed on; a note; "to come". World: (1) Mama M0; Harry H0. (2) Mama M1 promises Harry KSh 2,000 for flour; Harry accepts. (3) Harry H2 hands his place to Wanjiru; Wanjiru accepts.
// (4) Mama M2 pays Harry 2,000; Harry accepts. Expect paid 2,000; to_come_on: [{ from: Harry, to: Wanjiru, amount: 2000 KES, payment: M2 }].
// The three outputs are renamed: owed -> to_come, owed_on -> to_come_on, owed_back -> to_come_back.
{
  const w = new World(), mama = P(w, 'mama'), harry = P(w, 'harry'), wanjiru = P(w, 'wanjiru');
  const K = kindOf(mama, 'flour'), F = T(instance(mama, K, { pack: A('10', 'kg') }), 'F');
  // M1: Mama promises Harry the flour for KSh 2,000 (Harry is paid: the price goes to Harry's side)
  const m1 = T(mama.write('promise', { terms: { quantity: A('10', 'kg'), price: A('2000', 'KES') } }, { from: harry.id, to: mama.id, what: F.hash }), 'M1');
  const hAcc = harry.write('promise', { status: 'accepted' }, { answers: m1.hash, for: m1.hash });
  const h2 = T(harry.write('transfer', { amount: A('2000', 'KES') }, { what: m1.hash, to_owner: wanjiru.id }), 'H2');
  wanjiru.write('transfer', { status: 'accepted' }, { answers: h2.hash });
  const m2 = T(mama.write('transfer', { amount: A('2000', 'KES') }, { to_owner: harry.id, for: m1.hash }), 'M2');
  harry.write('transfer', { status: 'accepted' }, { answers: m2.hash, for: m1.hash });
  const st = fb.door('promise_stage', m1, w.blocks, {});
  const am = a => (a ? a.value + ' ' + a.unit : null);
  check('3c-7', 'the old names are gone', ['owed' in st, 'owed_on' in st, 'to_come' in st, 'to_come_on' in st], [false, false, true, true]);
  check('3c-7', 'paid 2,000 KES (Harry\'s accept counts it where his answer stands)', am(st.paid), '2000 KES');
  check('3c-7', 'to_come_on: Harry keeps 2,000 for Wanjiru', st.to_come_on.map(x => [nm(x.from), nm(x.to), am(x.amount), tg(x.payment)]), [['harry', 'wanjiru', '2000 KES', 'M2']]);
  check('3c-7', 'door op to_come_back exists, owed_back is gone', [Array.isArray(fb.door('to_come_back', mama.id, w.blocks).to_come), (() => { try { fb.door('owed_back', mama.id, w.blocks); return true; } catch (e) { return false; } })()], [true, false]);
}
done();
