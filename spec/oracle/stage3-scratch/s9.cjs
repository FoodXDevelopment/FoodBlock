const { fb, World, A, kindOf, instance, give, accept, J, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts } = require('./h.cjs');
const NOW = '2027-06-01T00:00:00.000Z';
const potS = r => (r === null ? 'null' : r.not_shown ? 'not_shown' : J({ kind: r.kind && r.kind.unit, backing: am(r.backing), paid_in: am(r.paid_in), held: am(r.held), paid_out: am(r.paid_out), left: am(r.left), cap: r.cap, payouts: r.payouts.map(p => [tg(p.block), p.amount.value, p.takes, p.why, p.state]) }));
// confirmers and a bearer vouch
{
  const S = 'S21b pot reasons', w = new World(), coop = P(w, 'coop'), vet = P(w, 'vet'), other = P(w, 'other'), mem = P(w, 'mem'), buyer = P(w, 'buyer');
  const schema = coop.write('thing', { kind: 'schema', name: 'cover', grounds: { event: 'a cow died', confirmers: [vet.id], needed: 1 } });
  const Kt = kindOf(coop, 'lot'); const lot = T(instance(mem, Kt, {}), 'the lot');
  const head = T(coop.write('promise', { what: 'cover', terms: { backing: A('100', 'GBP') } }, { from: coop.id, to: lot.hash, schema: schema.hash }), 'head');
  const bad = T(coop.write('transfer', { amount: A('10', 'GBP'), condition: { signal: 'x', by: [other.id] } }, { to_owner: mem.id, for: head.hash, after: head.hash }), 'payout on another signer');
  const good = T(coop.write('transfer', { amount: A('10', 'GBP'), condition: { signal: 'x', by: [vet.id] } }, { to_owner: mem.id, for: head.hash }), 'payout on the vet');
  const stranger = T(coop.write('transfer', { amount: A('10', 'GBP'), condition: { signal: 'x', by: [vet.id] } }, { to_owner: buyer.id, for: head.hash }), 'payout to a stranger of the lot');
  Q(S, 'not_confirmed, not_holder, and a good one', potS(fb.door('pot', head, w.blocks, NOW)));
}
