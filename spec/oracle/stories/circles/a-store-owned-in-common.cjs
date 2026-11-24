// A store owned in common is a circle (circles.md; things.md, Transfers: grain stored three ways). The keeper founds the silo with 1,000,000 parts and
// names his key as its meter; he hands every part to the circle, so all are unissued. Amina hands her 18,000 kg lot to the circle and is issued 18,000
// parts; Bo his 2,000 kg and 2,000 parts. The keeper mixes both lots into one pool the circle owns, then writes one make with no output, `as` the
// circle, under the row the owners took their parts under: 600 kg are gone, every owner's by her parts. No owner signs again.
const L = require('./lib.cjs');
const { fb, World, P, T, nm, A, kindOf, instance, part, found, as, yesTo, state, holds, check, done } = L;
const kg = v => A(String(v), 'kg');
const w = new World(), keeper = P(w, 'keeper'), amina = P(w, 'amina'), bo = P(w, 'bo');
const row = { to: [keeper.id], needed: 1, scope: { types: ['transform', 'transfer', 'thing'], parties: 'any', on: 'any', what: 'any', each: kg(100000) } };
const row2 = { to: [keeper.id], needed: 1, scope: { types: ['transfer'], parties: 'any', on: 'any', what: 'any', each: part(100000) } };
const C = T(found(keeper, { pack: 1000000, rules: [row, row2], name: 'silo', meter: keeper.id }), 'C');
const un = keeper.write('transfer', { amount: part(1000000) }, { what: C.hash, to_owner: C.hash });
const unA = as(keeper, C, 'transfer', { status: 'accepted' }, { answers: un.hash });
const wheat = kindOf(amina, 'wheat');
const intake = (who, n, after) => {
  const lot = instance(who, wheat, { pack: kg(n) });
  const t = who.write('transfer', {}, { what: lot.hash, to_owner: C.hash });
  const acc = as(keeper, C, 'transfer', { status: 'accepted' }, { answers: t.hash, after: [after.hash] });
  const p = as(keeper, C, 'transfer', { amount: part(n) }, { what: C.hash, to_owner: who.id, after: [acc.hash] });
  yesTo(who, p);
  return { lot, p };
};
const a = intake(amina, 18000, unA), b = intake(bo, 2000, a.p);
const parts = () => state(w, C).owners.map(o => [nm(o.owner), o.amount.value]).sort();
check('a store', 'parts issued for grain received: Amina 18,000, Bo 2,000, the rest unissued', [parts(), state(w, C).unissued.value], [[['amina', '18000'], ['bo', '2000']], '980000']);
const mk = as(keeper, C, 'transform', { kind: 'mix' }, { derives_from: [a.lot.hash, b.lot.hash], after: [b.p.hash] });
const Pool = keeper.write('thing', { name: 'pool', pack: kg(20000) }, { of: wheat.hash, derives_from: [mk.hash], as: C.hash });
const own = () => { const r = fb.door('ownership', Pool, w.blocks); return [r.owners.map(o => [o.owner === C.hash ? 'silo' : nm(o.owner), o.amount.value]), r.ended.value]; };
check('a store', 'the mix is the circle\'s: 20,000 kg', own(), [[['silo', '20000']], '0']);
const sh = as(keeper, C, 'transform', { inputs: [{ from: Pool.hash, amount: kg(600) }] }, { derives_from: [Pool.hash], after: [Pool.hash] });
check('a store', 'the shrink holds by the keeper\'s row', holds(w, C, sh).holds, true);
check('a store', 'one block: 600 kg ended, the circle owns 19,400 kg; each owner\'s share is her parts', own(), [[['silo', '19400']], '600']);
done();
