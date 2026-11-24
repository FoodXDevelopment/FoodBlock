// Whether a ruling's awards were honoured: a reading (promises.md, Rulings). Jo rules on Tom and Mo's deal: £400 of Tom's to Mo, due 10 November, and Tom's
// heifer to Mo (no sum). (1) Nothing paid: neither award honoured. (2) Tom pays £150 then £250 `for` the ruling: the money award honoured; the heifer not.
// (3) Mo signs a release of the ruling: both honoured. A ruling's audience is its own: the reading says nothing of who may see it.
const L = require('./lib.cjs'); const { fb, World, P, T, check, done, GBP, day } = L;
const w = new World(), tom = P(w, 'tom'), mo = P(w, 'mo'), jo = P(w, 'jo');
const deal = T(tom.write('promise', { terms: { lines: [{ id: '1', quantity: L.A('1', 'tonne'), price: GBP(400) }] } }, { from: tom.id, to: mo.id }), 'D');
const ruling = T(jo.write('observe', { kind: 'ruling', text: 'the maize was never delivered', audience: 'public', awards: [{ to: mo.id, amount: GBP(400), due: day(9) }, { to: mo.id, what: 'the heifer' }] }, { subject: deal.hash }), 'J1');
const ask = () => fb.door('ruling_honoured', ruling, w.blocks).lines.map(l => [l.due, l.honoured]);
check('ruling honoured', 'nothing paid: neither award honoured; the due date is the award\'s own', ask(), [[day(9), false], [null, false]]);
T(tom.write('transfer', { amount: GBP(150) }, { to_owner: mo.id, for: ruling.hash }), 'P1');
check('ruling honoured', '£150 of £400 paid: not honoured', ask(), [[day(9), false], [null, false]]);
T(tom.write('transfer', { amount: GBP(250) }, { to_owner: mo.id, for: ruling.hash }), 'P2');
check('ruling honoured', '£400 paid in all, whoever paid: the money award honoured; the heifer has no sum', ask(), [[day(9), true], [null, false]]);
T(mo.write('observe', { kind: 'release' }, { subject: ruling.hash }), 'R1');
check('ruling honoured', 'Mo releases the ruling: both awards honoured', ask(), [[day(9), true], [null, true]]);
check('ruling honoured', 'a block that is no ruling: no lines', fb.door('ruling_honoured', deal, w.blocks).lines, []);
done();
