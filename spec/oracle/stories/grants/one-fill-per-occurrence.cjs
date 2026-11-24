// One fill per occurrence. Mama M2 want: 2 crates, repeat Mondays, parties [Sam, Otieno], { max: 700 per crate }, grant to Soko.
// Soko accepts Sam's offer for occurrence 2026-11-16: true. Soko accepts Otieno's for 2026-11-16: not_kept. For 2026-11-23: true.
const L = require('./lib.cjs'); const { fb, World, P, T, check, done, A, kindOf, instance, promise, GBP, per, grant, whyOf } = L;
const w = new World(); const mama = P(w, 'mama'), soko = P(w, 'soko'), sam = P(w, 'sam'), otieno = P(w, 'otieno');
const KES = v => A(String(v), 'KES'), pc = v => ({ amount: KES(v), per: A('1', 'crate') });
const C = kindOf(mama, 'crate');
const rep = { repeat: 'FREQ=WEEKLY;BYDAY=MO', zone: 'UTC' }, when = '2026-11-09T09:00:00.000Z';
const M2 = T(promise(mama, { to: mama.id }, { lines: [{ id: 'crates', what: C.hash, quantity: A('2', 'crate'), price: { max: pc(700) } }], ...rep }, { when }), 'M2');
const GS = T(grant(mama, soko, { types: ['promise'], on: [M2.hash], parties: [sam.id, otieno.id].sort(), limit: KES(5000) }, { meter: soko.id }), 'GS');
const off = (s, occ, tag) => { const i = instance(s, C, { pack: A('2', 'crate') }); return T(promise(s, { from: s.id, to: mama.id }, { lines: [{ id: 'crates', what: i.hash, quantity: A('2', 'crate'), price: pc(650) }], ...rep }, { when, occurrence: occ }), tag); };
const acc = (o, tag) => T(soko.write('promise', { status: 'accepted', draws: { grant: GS.hash, amount: KES(1300) } }, { answers: o.hash, for: o.hash, under: GS.hash }), tag);
const o16s = off(sam, '2026-11-16T09:00:00.000Z', 'Sam16'), o16o = off(otieno, '2026-11-16T09:00:00.000Z', 'Otieno16'), o23 = off(otieno, '2026-11-23T09:00:00.000Z', 'Otieno23');
const a1 = acc(o16s, 'Soko-Sam16'), a2 = acc(o16o, 'Soko-Otieno16'), a3 = acc(o23, 'Soko-23');
check('one fill', 'Soko accepts Sam\'s offer for 2026-11-16', whyOf(a1, w), null);
check('one fill', 'Soko accepts Otieno\'s offer for the same occurrence: the code', whyOf(a2, w), { code: 'not_kept', why: null });
check('one fill', 'Soko accepts an offer for 2026-11-23', whyOf(a3, w), null);
done();
