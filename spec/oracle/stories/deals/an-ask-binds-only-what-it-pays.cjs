// An ask binds its signer only where something of hers would move (promises.md, What becomes whose: `binds`). Leila asks Mama for 10 kg of
// maize. (1) Her ask names a price, £30: if it stands, £30 of hers becomes Mama's, so it binds Leila. (2) Her ask names no price: nothing of
// hers is in what it gives, so it binds no one; it only asks.
const L = require('./lib.cjs'); const { fb, World, P, A, kindOf, check, done, GBP } = L;
{
  const w = new World(), leila = P(w, 'leila'), mama = P(w, 'mama');
  const maize = kindOf(mama, 'maize');
  const draft = (terms) => ({ type: 'promise', state: { audience: 'public', seq: leila.seq + 1, at: '2026-11-22T09:00:00.000Z', terms }, refs: { author: leila.id, prev: leila.head, from: mama.id, to: leila.id } });
  const paying = draft({ lines: [{ id: 'maize', what: maize.hash, quantity: A('10', 'kg'), price: GBP(30) }] });
  const pure = draft({ lines: [{ id: 'maize', what: maize.hash, quantity: A('10', 'kg') }] });
  check('an ask', '(1) an ask that pays binds its signer', fb.door('binds', paying, w.blocks), true);
  check('an ask', '(2) a pure ask (nothing of hers in what it gives) binds no one', fb.door('binds', pure, w.blocks), false);
}
done();
