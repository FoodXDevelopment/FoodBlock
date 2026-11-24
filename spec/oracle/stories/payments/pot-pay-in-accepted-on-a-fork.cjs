const L = require('../kit.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, day, mkKey } = L;
const am = a => (a ? a.value + ' ' + a.unit : null);
// The pot pay-in item left in tools/fuzz/known.json (P1) for 3e: a pot's pay-in that its holder accepted by a block of a fork of his own line (his line has a pair before the pot's head).
// Rule B (a block of a fork counts always as what its signer owes) and "paid only by the payee's word": the accept is the holder's word and binds him, so the pay-in counts.
{
  const w = new World(), holder = P(w, 'holder'), payer = P(w, 'payer'), friend = P(w, 'friend');
  const start = { head: holder.head, seq: holder.seq };
  const n1 = holder.write('observe', { kind: 'note' }, {}), at = { head: start.head, seq: start.seq };
  holder.head = start.head; holder.seq = start.seq;
  holder.write('observe', { kind: 'note', n: 'twin' }, {}); // a pair at one place: his line forks
  holder.head = n1.hash; holder.seq = n1.state.seq;
  const pot = T(holder.write('promise', { what: 'cover for a cow' , terms: { backing: A('0', 'KES') } }, { from: holder.id }), 'pot');
  const pin = payer.write('transfer', { amount: A('10', 'KES') }, { to_owner: holder.id, for: pot.hash, after: [pot.hash] });
  holder.write('transfer', { status: 'accepted' }, { answers: pin.hash });
  const r = fb.door('pot', pot, w.blocks);
  check('pot', 'the holder\'s accept of a pay-in, by a block of a fork of his own line, binds him: the pay-in counts (paid_in 10 KES)', [am(r.paid_in), am(r.backing)], ['10 KES', '0 KES']);
}
done();
