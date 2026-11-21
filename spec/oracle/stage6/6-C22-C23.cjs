// C22 one id where one id is wanted, C23 work; section 4 and 6 checks (counts, members_then, speaks_for, backed, stands) (changes-1.9/06-circles.md).
const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, cafe, found, GBP, part, per, as, confirm, state, holds, speaks, ownPart, sendParts, yesTo, readCodes, handsOf, r1, day } = L;
const am = a => (a ? a.value + ' ' + a.unit : null);
{
  // C22. The till signs one transfer of £306.75 `to_owner [Amara, Leila]`: refused (grammar). Today it is valid and lands all £306.75 on one id by sort order.
  const W = cafe(); const { w, amara, leila, till } = W;
  const bad = till.make('transfer', { amount: GBP('306.75') }, { to_owner: [amara.id, leila.id].sort() });
  check('C22', 'a list in to_owner (a ref that takes one id) is refused: grammar', readCodes(bad, w), ['grammar']);
  const ok = till.make('transfer', { amount: GBP('153.37') }, { to_owner: amara.id });
  check('C22', 'one id is read', readCodes(ok, w), []);
  // the refs a rule names as a list stay lists: a grant\'s refs.to, a row\'s `to` (each with `needed`)
  const g = amara.make('grant', { kind: 'tool', scope: { types: ['promise'] } }, { to: [till.id, leila.id].sort() });
  check('C22', 'a grant\'s refs.to is a list where a rule names it', readCodes(g, w).includes('grammar'), false);
}
{
  // C23. Amara signs `as` F under r1 job J to Ben, £12 an hour, "counted on Ben's word". Ben signs, in his own name, `work` 40 hours `for` J: his hours count on his word (D13). The same block signed `as` F: Ben owns no part and holds no grant naming it; acts on nothing (C18).
  const W = cafe(); const { w, amara, ben, F } = W;
  const J = T(as(amara, F, 'promise', { what: 'hours of work', terms: { price: { amount: GBP(12), per: A('1', 'h') }, condition: { signal: 'work', by: [ben.id] } } }, { from: ben.id, to: F.hash }), 'J');
  ben.write('promise', { status: 'accepted' }, { answers: J.hash, for: J.hash });
  const b3 = T(ben.write('observe', { kind: 'work', amount: A('40', 'h') }, { for: J.hash }), 'B3');
  const st = fb.door('promise_stage', J, w.blocks, {});
  check('C23', 'Ben\'s hours, in his own name, count on his word: moved 40 h', st.lines.length ? am(st.lines[0].moved) : null, '40 h');
  const w2 = cafe(); const J2 = T(as(w2.amara, w2.F, 'promise', { what: 'hours of work', terms: { price: { amount: GBP(12), per: A('1', 'h') }, condition: { signal: 'work', by: [w2.ben.id] } } }, { from: w2.ben.id, to: w2.F.hash }), 'J2');
  w2.ben.write('promise', { status: 'accepted' }, { answers: J2.hash, for: J2.hash });
  const b4 = T(as(w2.ben, w2.F, 'observe', { kind: 'work', amount: A('40', 'h') }, { for: J2.hash }), 'B4');
  const st2 = fb.door('promise_stage', J2, w2.w.blocks, {});
  check('C23', 'the same block signed `as` F: Ben owns no part and holds no grant naming it; no row holds, it acts on nothing', [holds(w2.w, w2.F, b4).holds, fb.door('speaks_for', b4, w2.w.blocks), st2.lines.length ? am(st2.lines[0].moved) : null], [false, null, '0 h']);
}
{
  // section 6: count_of, members_then of a name that is no circle, backed (a hand of P's among those its row counted), stands on:hands
  check('6', 'count_of: a whole number from 1 to the size of the set, else null', [fb.door('count_of', 3, 5), fb.door('count_of', 'all', 5), fb.door('count_of', 6, 5), fb.door('count_of', 0, 5), fb.door('count_of', { of_members: '1/2' }, 5), fb.door('count_of', 2.5, 5), fb.door('count_of', '3', 5), fb.door('count_of', 5, 5)], [3, null, null, null, null, null, null, 5]);
  const W = cafe(); const { w, amara, leila, harry, F } = W;
  const B1 = T(as(amara, F, 'promise', { terms: { quantity: A('10', 'litre'), price: { amount: GBP(12), per: A('1', 'litre') } } }, { from: harry.id, to: F.hash }), 'B1');
  check('6', 'backed: Amara signed a hand the row counted, so B1 is backed by her; Leila signed none', [fb.door('backed', B1, amara.id, w.blocks).backed, fb.door('backed', B1, leila.id, w.blocks).backed], [true, false]);
  const big = T(as(amara, F, 'promise', { terms: { quantity: A('1', 'oven'), price: GBP(900) } }, { from: harry.id, to: F.hash }), 'BIG');
  check('6', 'stands: a block `as` a circle with no row holding waits on hands; after Leila confirms it stands', (() => { const a = fb.door('stands', big, w.blocks); confirm(leila, big); const b = fb.door('stands', big, w.blocks); return [a.stands, a.waiting.map(x => x.on), b.stands]; })(), [false, ['hands'], true]);
  check('6', 'members_then of a name that is no circle names no one', fb.door('members_then', B1, harry.id, w.blocks), []);
  check('6', 'row_holds(block, held): { circle, holds, row, every_owner, at, hands, waiting, listed }; a hand { id, block, parts, counts, why }', (() => { const r = fb.door('row_holds', B1, w.blocks); return [Object.keys(r).sort(), r.hands.map(h => Object.keys(h).sort())]; })(), [['at', 'circle', 'every_owner', 'hands', 'holds', 'listed', 'row', 'waiting'], [['block', 'counts', 'id', 'parts', 'why']]]);
  check('6', 'ways_in(circle, held): { circle, rows: [{ row, least }], every_owner: { least } }: r1 needs one owner; every owner two', (() => { const x = fb.door('ways_in', F.hash, w.blocks); return [Object.keys(x).sort(), x.rows, x.every_owner]; })(), [['circle', 'every_owner', 'rows'], [{ row: 0, least: 1 }], { least: 2 }]);
  check('6', 'row_holds of a block not signed `as` a circle, or `as` an id that is no circle held: null', [fb.door('row_holds', W.P1, w.blocks), fb.door('row_holds', as(amara, { hash: harry.id }, 'observe', { kind: 'note' }), w.blocks)], [null, null]);
  check('6', 'circle_versions and ways_in of an id that is no circle held: null', [fb.door('circle_versions', harry.id, w.blocks), fb.door('ways_in', harry.id, w.blocks)], [null, null]);
  check('6', 'members_then of a name with `#` names no one', fb.door('members_then', B1, F.hash + '#staff', w.blocks), []);
  check('6', 'row_holds: a hand\'s parts are an amount in `part`; `at` is where it holds', (() => { const r = fb.door('row_holds', B1, w.blocks); return [r.hands[0].parts, r.at === B1.hash]; })(), [{ value: '50', unit: 'part' }, true]);
}
done();
