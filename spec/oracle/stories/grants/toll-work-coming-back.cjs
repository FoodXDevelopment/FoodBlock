// Toll work, coming back. Leila L1 want: 40 loaves; L2 grant to home farm FM, types [transform], refs.what her 20 kg flour, limit 20 kg, on [L1]. FM signs 40 makes of 0.5 kg: each true, each loaf hers from its make. A 41st: past.
// FM transfers 30 loaves to_owner Leila: comes back with no accept. A stranger's make naming her flour: not_owner.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, check, done, A, kindOf, instance, promise, grant, ownersOf, drawsOf, own, nm } = L;
const w = new World(), leila = P(w, 'leila'), fm = P(w, 'farm'), stranger = P(w, 'stranger');
const K = kindOf(leila, 'flour'), LK = kindOf(leila, 'loaf');
const L1 = T(promise(leila, { to: leila.id }, { lines: [{ id: 'loaves', what: LK.hash, quantity: A('40', 'loaf') }] }), 'L1');
const flour = T(instance(leila, K, { pack: A('20', 'kg') }), 'flour');
const L2 = T(grant(leila, fm, { types: ['transform', 'transfer'], on: [L1.hash], limit: A('20', 'kg') }, { meter: fm.id, what: flour.hash }), 'L2');
fm.write('grant', { status: 'accepted' }, { answers: L2.hash });
const makes = [], loaves = [];
for (let i = 0; i < 41; i++) { const m = T(fm.write('transform', { name: 'bake', inputs: [{ from: flour.hash, amount: A('0.5', 'kg') }] }, { derives_from: [flour.hash], under: L2.hash }), 'make' + (i + 1)); makes.push(m); loaves.push(fm.write('thing', { name: 'loaf' }, { of: LK.hash, derives_from: [m.hash] })); }
const r = own(w, flour);
const takes = drawsOf(r).filter(d => d[0].startsWith('make')).map(d => [d[0], d[1], d[2]]);
check('Toll work', 'each of the 40 makes takes; the 41st is past', [takes.filter(d => d[1]).length, takes.filter(d => !d[1]).map(d => [d[0], d[2]])], [40, [['make41', 'past']]]);
check('Toll work', 'each loaf is hers from its make (the first, the 40th); the 41st is nobody\'s', [ownersOf(own(w, loaves[0])), ownersOf(own(w, loaves[39])), ownersOf(own(w, loaves[40]))], [{ owners: [['leila', null]] }, { owners: [['leila', null]] }, { owners: [] }]);
const w2 = new World(), l2 = P(w2, 'leila'), s2 = P(w2, 'stranger'), K2 = kindOf(l2, 'flour');
const fl2 = instance(l2, K2, { pack: A('20', 'kg') });
s2.write('transform', { name: 'bake', inputs: [{ from: fl2.hash, amount: A('0.5', 'kg') }] }, { derives_from: [fl2.hash] });
check('Toll work', 'a stranger\'s make naming her flour', drawsOf(own(w2, fl2)).map(d => d[2]), ['not_owner']);
const back = T(fm.write('transfer', {}, { what: loaves[0].hash, to_owner: leila.id, under: L2.hash }), 'back');
const rb = own(w, loaves[0]);
check('Toll work', 'FM transfers a loaf back to_owner Leila: she still owns it, with no accept of hers (the transfer takes nothing: not_owner)', [ownersOf(rb), drawsOf(rb).map(d => d[2])], [{ owners: [['leila', null]] }, ['not_owner']]);
done();
