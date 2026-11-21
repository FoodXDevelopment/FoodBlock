// Stage 7, the owner's three decisions of 2026-11-19 (changes-1.9/07-last.md asks nothing of them; they were given in the build brief), each as a story.
//  1. A circle row's money cap reads a sale's draw as its money total (as stage 4 reads a grant's), so a café's one row "up to £300 a deal" covers its till selling loaves.
//  2. `binds` on a draft signed `as` a circle answers as if her hand counts: true where her row would hold.
//  3. The 1.8 words `circle#role` and `of_members` are gone: `members_then` of a name with `#` names no one; a signal `by` that names a `#` role does not hold; `count_of` reads no `of_members`.
const L = require('../stage6/lib.cjs'); const { fb, World, P, T, A, kindOf, instance, check, done, cafe, GBP, as, holds, per } = L;
{
  // Decision 1. The café's r1 ("up to £300 a deal"). The till (Joe, a hand of the café) sells a loaf at £3 as the café.
  const W = cafe(); const { w, amara, leila, ben, F } = W;
  const bread = kindOf(amara, 'bread');
  const loaf = T(instance(amara, bread, { pack: A('40', 'loaf') }, { as: F.hash }), 'LOAF');
  // the café offers 1 loaf at £3 to Ben; the sale itself moves the loaf, `for` that offer
  const offer = T(as(amara, F, 'promise', { terms: { quantity: A('1', 'loaf'), price: per(3, 'loaf') } }, { from: F.hash, to: ben.id, what: loaf.hash }), 'OFFER');
  const sale = T(as(amara, F, 'transfer', { amount: A('1', 'loaf') }, { what: loaf.hash, to_owner: ben.id, for: offer.hash, after: offer.hash }), 'SALE');
  const h = holds(w, F, sale);
  check('D1', 'a sale of 1 loaf at £3, under r1 (up to £300 a deal): its draw is its money total, £3: it holds by the row, no second owner needed', [h.holds, h.row, h.every_owner], [true, 0, false]);
  // the same sale of 200 loaves at £3 is £600: above r1's £300, so by every owner together only
  const loaf2 = T(instance(amara, bread, { pack: A('400', 'loaf') }, { as: F.hash }), 'LOAF2');
  const offer2 = T(as(amara, F, 'promise', { terms: { quantity: A('200', 'loaf'), price: per(3, 'loaf') } }, { from: F.hash, to: ben.id, what: loaf2.hash }), 'OFFER2');
  const sale2 = T(as(amara, F, 'transfer', { amount: A('200', 'loaf') }, { what: loaf2.hash, to_owner: ben.id, for: offer2.hash, after: offer2.hash }), 'SALE2');
  check('D1', 'a sale of 200 loaves at £3 is £600, above £300: the row does not hold', [holds(w, F, sale2).holds, holds(w, F, sale2).row], [false, null]);
  // a sale with no priced deal has no money total; its amount (loaves) is another kind than the cap: above it (a bound bounds every kind; nothing fills the silence of a price)
  const loaf3 = T(instance(amara, bread, { pack: A('1', 'loaf') }, { as: F.hash }), 'LOAF3');
  const bare = T(as(amara, F, 'transfer', { amount: A('1', 'loaf') }, { what: loaf3.hash, to_owner: ben.id }), 'BARE');
  check('D1', 'a sale with no priced deal has no money total: not covered by r1 (as story C21 has it)', [holds(w, F, bare).holds], [false]);
}
{
  // Decision 2. A draft of the café's promise, signed `as` F by Amara (who owns 50 of 100 parts: r1 holds for her hand), binds; the same draft by Harry (no parts) does not.
  const W = cafe(); const { w, amara, harry, ben, F } = W;
  const milk = kindOf(amara, 'milk');
  const inst = T(instance(amara, milk, { pack: A('10', 'litre') }, { as: F.hash }), 'MILK');
  const terms = { quantity: A('10', 'litre'), price: per(1.2, 'litre') };
  const draft = who => ({ type: 'promise', state: { terms }, refs: { author: who.id, as: F.hash, from: F.hash, to: ben.id, what: inst.hash } });
  check('D2', 'Amara\'s draft signed as the café: her row would hold, so it binds', fb.door('binds', draft(amara), w.blocks), true);
  check('D2', 'Harry owns no part: his hand counts for nothing, so his draft binds no one', fb.door('binds', draft(harry), w.blocks), false);
  const above = { ...draft(amara), state: { terms: { quantity: A('10', 'litre'), price: per(100, 'litre') } } };
  check('D2', 'a draft above r1\'s £300 (£1,000): no row would hold: it does not bind yet', fb.door('binds', above, w.blocks), false);
  check('D2', 'her accept as the café binds where her row would hold, and a stranger\'s does not', [fb.door('binds', { type: 'promise', state: { status: 'accepted' }, refs: { author: amara.id, as: F.hash, answers: inst.hash } }, w.blocks), fb.door('binds', { type: 'promise', state: { status: 'accepted' }, refs: { author: harry.id, as: F.hash, answers: inst.hash } }, w.blocks)], [true, false]);
  // the owner's decision of 2026-11-20: a circle's founding block that states its parts binds its founder (it puts every part in her hand);
  // one that states none moves nothing, and binds no one
  check('D2', 'a founding block that states its parts binds: every part is the founder\'s from it', fb.door('binds', { type: 'actor', state: { kind: 'circle', pack: A('100', 'part') }, refs: { author: amara.id } }, w.blocks), true);
  check('D2', 'a founding block with no parts binds no one', fb.door('binds', { type: 'actor', state: { kind: 'circle' }, refs: { author: amara.id } }, w.blocks), false);
  check('D2', 'a draft in her own name binds as before (her own promise of her own thing)', fb.door('binds', { type: 'promise', state: { status: 'accepted' }, refs: { author: harry.id, answers: inst.hash } }, w.blocks), true);
}
{
  // Decision 3. No role is a name.
  const W = cafe(); const { w, F } = W;
  check('D3', 'members_then of `circle#role` names no one', fb.door('members_then', W.P2, F.hash + '#cook', w.blocks), []);
  check('D3', 'count_of reads a whole number only: `{ of_members }` and `all` name no count', [fb.door('count_of', { of_members: 1 }, 4), fb.door('count_of', 'all', 4), fb.door('count_of', 2, 4)], [null, null, 2]);
}
done();
