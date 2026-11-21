const { fb, World, A, kindOf, instance, give, accept, J, P, nm, am, T, tg, show, draws, own, ownS, Q, offer, accepts, mkKey, headerMessage, day } = require('./h.cjs');
const stage = (o, w) => fb.door('promise_stage', o, w.blocks, {});
const NOW = '2027-06-01T00:00:00.000Z';
const potS = r => (r === null ? 'null' : r.not_shown ? 'not_shown' : J({ holder: nm(r.holder), kind: r.kind && r.kind.unit, backing: am(r.backing), paid_in: am(r.paid_in), held: am(r.held), paid_out: am(r.paid_out), left: am(r.left), cap: r.cap, payouts: r.payouts.map(p => [tg(p.block), p.amount.value, p.takes, p.why, p.state]) }));
// ---- S21: a pot, a payout signed ahead
{
  const S = 'S21 pot', w = new World(), coop = P(w, 'coop'), leila = P(w, 'leila'), achieng = P(w, 'achieng'), vet = P(w, 'vet');
  const head = T(coop.write('promise', { what: 'cover for a cow', terms: { backing: A('1000', 'GBP') } }, { from: coop.id }), 'head');
  const cond = { signal: 'cow died', by: [vet.id] };
  const p1 = T(coop.write('transfer', { amount: A('800', 'GBP'), condition: cond }, { to_owner: leila.id, for: head.hash, after: head.hash }), 'payout 800 to Leila (signed ahead)');
  const p2 = T(coop.write('transfer', { amount: A('800', 'GBP'), condition: cond }, { to_owner: achieng.id, for: head.hash }), 'payout 800 to Achieng');
  Q(S, 'two payouts of £800 signed ahead on a £1,000 pot: the second reads past from the first minute', potS(fb.door('pot', head, w.blocks, NOW)));
  accept(leila, p1); accept(achieng, p2);
  Q(S, 'both receivers accepted, no signal yet: Leila\'s still holds', potS(fb.door('pot', head, w.blocks, NOW)));
  vet.write('observe', { kind: 'cow died' }, { subject: head.hash });
  Q(S, 'the vet\'s signal comes: Leila\'s payout lands', potS(fb.door('pot', head, w.blocks, NOW)));
}
// ---- S22/23: a pot with no backing and pay-ins of two kinds; a marked tin is no pay-in
{
  const S = 'S22 pot kinds', w = new World(), holder = P(w, 'holder'), a = P(w, 'a'), b = P(w, 'b'), c = P(w, 'c'), Kt = kindOf(holder, 'tin');
  const head = T(holder.write('promise', { what: 'a mutual pool', terms: {} }, { from: holder.id }), 'head');
  const mk = (who, amt) => { const t = who.write('transfer', { amount: amt }, { to_owner: holder.id, for: head.hash }); accept(holder, t, {}, {}); return t; };
  mk(a, A('100', 'GBP')); mk(b, A('5000', 'KES'));
  const tin = instance(c, Kt, {}); const kept = c.write('transfer', {}, { what: tin.hash, to_holder: holder.id, for: head.hash }); accept(holder, kept);
  const pay = T(holder.write('transfer', { amount: A('10', 'GBP') }, { to_owner: a.id, for: head.hash }), 'payout 10 GBP');
  Q(S, 'pay-ins of GBP and KES, no backing: kind null, the payout is unit; the tin handed to_holder is no pay-in', potS(fb.door('pot', head, w.blocks, NOW)));
  const w2 = new World(), h2 = P(w2, 'holder'), a2 = P(w2, 'a'), b2 = P(w2, 'b'), head2 = T(h2.write('promise', { what: 'a mutual pool', terms: {} }, { from: h2.id }), 'head');
  const mk2 = (who, amt) => { const t = who.write('transfer', { amount: amt }, { to_owner: h2.id, for: head2.hash }); accept(h2, t); return t; };
  mk2(a2, A('100', 'GBP')); mk2(b2, A('50', 'GBP'));
  const pay2 = T(h2.write('transfer', { amount: A('120', 'GBP') }, { to_owner: a2.id, for: head2.hash }), 'payout 120');
  const pay3 = T(h2.write('transfer', { amount: A('40', 'GBP') }, { to_owner: b2.id, for: head2.hash }), 'payout 40');
  accept(a2, pay2); accept(b2, pay3);
  Q(S, 'pay-ins of one kind (150 GBP): the pot is that kind; 120 takes, 40 is past', potS(fb.door('pot', head2, w2.blocks, NOW)));
}
// ---- S23: a basic phone's received
{
  const S = 'S23 received', w = new World(), mama = P(w, 'mama'), leila = P(w, 'leila'), K = kindOf(mama, 'grain');
  const o = mama.write('promise', { what: 'a service', terms: { quantity: A('1', 'visit'), price: A('100', 'KES') } }, { from: mama.id, to: leila.id }); accepts(leila, o);
  const p = leila.write('transfer', { amount: A('100', 'KES') }, { to_owner: mama.id, for: o.hash });
  Q(S, 'cash sent, naming none, nobody has accepted it', J([stage(o, w).paid, stage(o, w).unanswered.length]));
  const r = T(mama.write('observe', { kind: 'received', amount: A('100', 'KES') }, { for: o.hash }), 'Mama\'s received');
  Q(S, 'her own observe of kind received: counted toward the price; the transfer stays unanswered', (st => J([am(st.paid), st.unanswered.length, am(st.uncovered.to)]))(stage(o, w)));
}
// ---- S25: a draw on a line with a block held only as its header
{
  const S = 'S25 header only', w = new World(), harry = P(w, 'harry'), maria = P(w, 'maria'), K = kindOf(harry, 'flour');
  const sack = T(instance(harry, K, { pack: A('10', 'kg') }), 'sack');
  const t1 = T(give(harry, sack, maria, A('3', 'kg')), 'draw 1'); accept(maria, t1);
  const t2 = T(give(harry, sack, maria, A('3', 'kg')), 'draw 2'); accept(maria, t2);
  const held = w.blocks.map(b => (b.hash === t1.hash ? headerMessage(b) : b));
  const r = fb.door('ownership', sack, held);
  Q(S, 'draw 1 held only as its header: the line is not read whole', show(r));
  Q(S, 'the whole line held', ownS(w, sack));
}
