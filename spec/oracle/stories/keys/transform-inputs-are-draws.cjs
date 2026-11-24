const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, deal, sell, day, mkKey } = L;
// A transform's inputs are draws in the pair test. World: (1) Maria M1 flour F 10 kg. (2) At one place: M2 a make taking all F into dough; M2' F to Leila. Expect neither takes; F held on a pair.
{
  const w = new World(), maria = P(w, 'maria'), leila = P(w, 'leila');
  const K = kindOf(maria, 'flour'), F = T(instance(maria, K, { pack: A('10', 'kg') }), 'F');
  const d = deal(maria, F, leila, A('10', 'kg'));
  const head = maria.head, seq = maria.seq;
  const m2 = T(maria.write('transform', { name: 'dough', inputs: [{ from: F.hash, amount: A('10', 'kg') }] }, { derives_from: [F.hash] }), 'M2');
  maria.head = head; maria.seq = seq;
  const m2b = T(sell(maria, F, leila, d, A('10', 'kg')), "M2'");
  leila.write('transfer', { status: 'accepted' }, { answers: m2b.hash });
  const r = own(w, F);
  check('transform inputs', 'neither takes: a pair of a make and a give', drawsOf(r).filter(x => ['M2', "M2'"].includes(x[0])).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(x => x.slice(0, 3)), [["M2", false, 'pair'], ["M2'", false, 'pair']]);
  check('transform inputs', 'F is held on a pair: no owner is named (Leila does not own it, nothing was made of it)', [ownersOf(r), r.ended && r.ended.value], [{ owners: [] }, '0']);
}
done();
