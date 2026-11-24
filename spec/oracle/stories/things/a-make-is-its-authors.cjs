// An output's makes are its author's (things.md, A make). Amina and Bo each sign their own make of their wheat; Amina writes a pool thing naming both
// makes. Only Amina's make is the pool's: she owns all of it; Bo's make, with no output of his, ended his 2,000 kg. A thing another writes that names
// your make makes you no owner of what you never saw.
const L = require('../kit.cjs'); const { fb, World, P, A, kindOf, instance, nm, check, done } = L;
const kg = v => A(String(v), 'kg');
const w = new World(), amina = P(w, 'amina'), bo = P(w, 'bo');
const wheat = kindOf(amina, 'wheat');
const La = instance(amina, wheat, { pack: kg(18000) }), Lb = instance(bo, wheat, { pack: kg(2000) });
const ma = amina.write('transform', {}, { derives_from: [La.hash] });
const mb = bo.write('transform', {}, { derives_from: [Lb.hash] });
const pool = amina.write('thing', { name: 'pool', pack: kg(20000) }, { of: wheat.hash, derives_from: [ma.hash, mb.hash] });
const owners = r => r.owners.map(o => [nm(o.owner), o.amount && o.amount.value]);
check('a make', 'the pool Amina wrote is hers alone: only her own make is its make', owners(fb.door('ownership', pool, w.blocks)), [['amina', '20000']]);
const rb = fb.door('ownership', Lb, w.blocks);
check('a make', 'Bo\'s make, with no output of his, ended his 2,000 kg', [owners(rb), rb.ended && rb.ended.value], [[], '2000']);
done();
