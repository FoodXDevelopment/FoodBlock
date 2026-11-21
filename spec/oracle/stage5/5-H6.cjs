// R-H6 A deal that stops short. (1) Leila's grant G to her tool T, `limit` £210. (2) Harry H1 offers 10 sacks at £21, `deliver_by` Friday on Wanjiru's clock W. (3) T accepts. (4) Harry delivers 6; T accepts; Leila pays £126; Harry accepts.
// (5) Leila stops onward Wednesday. Expect stage `stopped` (onward, `to`); £84 still held on G's line. (6) W's cutoff through Friday. Expect the rest can no longer fall due; £84 back.
// World B: no `deliver_by`; Harry signs `paid` after (4). Expect £84 back at Harry's signal.
const L = require('../stage4/lib.cjs'); const { fb, World, P, T, check, done, A, GBP, per, promise, grant, instance, kindOf, receipt, day } = L;
function world(terms) {
  const w = new World(); const leila = P(w, 'leila'), harry = P(w, 'harry'), tool = P(w, 'tool'), wan = P(w, 'wanjiru');
  const Kd = kindOf(harry, 'sack'), lot = instance(harry, Kd, { pack: A('10', 'sack') });
  const extra = terms ? { deliver_by: day(5, 12), clocks: { names: [wan.id], needed: 1 } } : {};
  const LP = T(promise(leila, { to: leila.id, what: Kd.hash }, { quantity: A('10', 'sack'), price: { max: per(21, 'GBP', 'sack') }, ...extra }), 'LP');
  const G = T(grant(leila, tool, { types: ['promise', 'transfer', 'observe'], on: [LP.hash], parties: [harry.id], limit: GBP(210) }, { meter: tool.id }), 'G');
  const H1 = T(promise(harry, { from: harry.id, to: leila.id, what: lot.hash }, { quantity: A('10', 'sack'), price: per(21, 'GBP', 'sack'), ...extra }), 'H1');
  const ac = T(tool.write('promise', { status: 'accepted', draws: { grant: G.hash, amount: GBP(210) } }, { answers: H1.hash, for: H1.hash, under: G.hash }), 'T-accept');
  const six = T(harry.write('transfer', { amount: A('6', 'sack') }, { what: lot.hash, to_owner: leila.id, for: H1.hash, after: ac.hash }), 'six');
  tool.write('transfer', { status: 'accepted' }, { answers: six.hash, for: H1.hash, under: G.hash });
  const pay = T(leila.write('transfer', { amount: GBP(126) }, { to_owner: harry.id, for: H1.hash }), 'pay');
  harry.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: H1.hash });
  const st = T(leila.write('promise', { status: 'stopped', stop: 'onward' }, { updates: ac.hash }), 'stop');
  return { w, leila, harry, wan, G, H1, LP };
}
// what G's line has left (the room the deal held for the rest comes back into it where the rest can no longer fall due)
const back = X => fb.door('meter', X.G, X.w.blocks).left.filter(c => c.of === X.G.hash).map(c => c.amount).filter(a => a.value !== '0');
{
  const X = world(true);
  const s = fb.door('promise_stage', X.H1, X.w.blocks, {});
  check('R-H6', '(5) stage stopped onward, by to', [s.stage, s.stop, s.by], ['stopped', 'onward', 'to']);
  check('R-H6', '(5) £84 still held on G\'s line', back(X), []);
  T(X.wan.write('observe', { kind: 'cutoff', when: day(5, 12) }, { subject: X.H1.hash }, { at: day(5, 13) }), 'cut');
  check('R-H6', '(6) the cutoff through Friday: £84 back', back(X), [GBP(84)]);
}
{
  const X = world(false);
  check('R-H6', 'B: before the signal, £84 held', back(X), []);
  X.harry.write('observe', { kind: 'paid' }, { subject: X.H1.hash });
  check('R-H6', 'B: at Harry\'s signal, £84 back', back(X), [GBP(84)]);
}
done();
