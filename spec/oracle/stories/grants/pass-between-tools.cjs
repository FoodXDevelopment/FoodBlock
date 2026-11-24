// A pass between tools. Leila L3 grant to robot RB, types [transform, transfer], refs.what her 40 lettuces. L4 grant to her stall ST. RB1 gives 30 lettuces to ST; ST1 accepts: on ST's line, no tap of Leila's.
// ST2 sells one: takes. Under a robot grant without transfer: RB1 takes nothing (not_live). (L4 names her open offer of lettuces LO in `on`, so the stall's sale keeps to her word: a customer's order, the stall's yes, and
// its delivery ST2 of one lettuce, read on the stall's line from ST1.)
const L = require('./lib.cjs'); const { fb, World, P, T, tg, check, done, A, kindOf, instance, grant, ownersOf, drawsOf, own, whyOf, promise, per } = L;
const w = new World(); const leila = P(w, 'leila'), rb = P(w, 'robot'), st = P(w, 'stall'), cust = P(w, 'customer');
const K = kindOf(leila, 'lettuce'), lets = T(instance(leila, K, { pack: A('40', 'lettuce') }), 'lets');
const L3 = T(grant(leila, rb, { types: ['transform', 'transfer'] }, { meter: rb.id, what: lets.hash }), 'L3');
const LO = T(promise(leila, { from: leila.id }, { lines: [{ id: 'lettuces', what: lets.hash, quantity: { max: A('40', 'lettuce') }, price: per(1, 'GBP', 'lettuce') }] }), 'LO');
const L4 = T(grant(leila, st, { types: ['transfer', 'promise'], on: [LO.hash], parties: [cust.id] }, { meter: st.id }), 'L4');
const RB1 = T(rb.write('transfer', { amount: A('30', 'lettuce') }, { what: lets.hash, to_owner: st.id, under: L3.hash }), 'RB1');
const ST1 = T(st.write('transfer', { status: 'accepted' }, { answers: RB1.hash }), 'ST1');
const r = own(w, lets);
check('pass between tools', 'RB1 passes the part: it speaks for Leila, takes, and lands at ST1', [whyOf(RB1, w), fb.door('speaks_for', RB1, w.blocks) === leila.id, drawsOf(r).filter(d => d[0] === 'RB1')], [null, true, [['RB1', true, null, 'landed']]]);
check('pass between tools', 'it gives nothing away: Leila still owns the 40', ownersOf(r), { owners: [['leila', '40']] });
const order = T(cust.write('promise', { status: 'accepted', terms: { lines: [{ id: 'lettuces', quantity: A('1', 'lettuce') }] } }, { answers: LO.hash, for: LO.hash }), 'order');
const yes = T(st.write('promise', { status: 'accepted' }, { answers: order.hash, for: LO.hash, under: L4.hash }), 'ST-yes');
const ST2 = T(st.write('transfer', { amount: A('1', 'lettuce') }, { what: lets.hash, to_owner: cust.id, for: LO.hash, under: L4.hash, after: [ST1.hash, yes.hash].sort() }), 'ST2');
const r2 = own(w, lets);
check('pass between tools', 'ST2, the stall\'s sale of one lettuce, speaks for Leila and takes on the stall\'s line', [whyOf(ST2, w), drawsOf(r2).filter(d => d[0] === 'ST2').map(d => [d[1], d[2]])], [null, [[true, null]]]);
const w2 = new World(); const l2 = P(w2, 'leila'), rb2 = P(w2, 'robot'), st2 = P(w2, 'stall');
const K2 = kindOf(l2, 'lettuce'), lt2 = instance(l2, K2, { pack: A('40', 'lettuce') });
const G3 = grant(l2, rb2, { types: ['transform'] }, { meter: rb2.id, what: lt2.hash }); grant(l2, st2, { types: ['transfer'] }, { meter: st2.id });
const R = rb2.write('transfer', { amount: A('30', 'lettuce') }, { what: lt2.hash, to_owner: st2.id, under: G3.hash });
check('pass between tools', 'under a robot grant without transfer', whyOf(R, w2), { code: 'not_live', why: null });
done();
