// Her plan (promises.md, Her plan). Maria writes a promise from her to herself: bake 40 loaves on Friday. It names no other side, so it is no
// deal: it binds no one and has no stage. A sub-task names it in refs.for and is valid; her own work `for` it is her record, never a stage.
// An open offer, which leaves a side open, is still a deal.
const L = require('./lib.cjs'); const { fb, World, P, A, kindOf, check, done, GBP } = L;
{
  const w = new World(), maria = P(w, 'maria');
  const loaf = kindOf(maria, 'loaf'), flour = kindOf(maria, 'flour');
  const draft = { type: 'promise', state: { audience: 'public', seq: maria.seq + 1, at: '2026-11-22T09:00:00.000Z', what: 'bake for Friday', terms: { lines: [{ id: 'loaves', what: loaf.hash, quantity: A('40', 'loaf') }] } }, refs: { author: maria.id, prev: maria.head, from: maria.id, to: maria.id } };
  check('plan', 'her plan binds no one', fb.door('binds', draft, w.blocks), false);
  const plan = maria.write('promise', { what: 'bake for Friday', terms: { lines: [{ id: 'loaves', what: loaf.hash, quantity: A('40', 'loaf') }] } }, { from: maria.id, to: maria.id });
  const step = maria.write('promise', { what: 'buy flour', terms: { lines: [{ id: 'flour', what: flour.hash, quantity: A('20', 'kg') }] } }, { from: maria.id, to: maria.id, for: plan.hash });
  check('plan', 'a sub-task that names it in refs.for is valid and read', [fb.door('valid', step, w.blocks).length, fb.door('read', step, w.blocks).length], [0, 0]);
  maria.write('observe', { kind: 'work', amount: A('40', 'loaf') }, { for: plan.hash });
  const st = fb.door('promise_stage', plan, w.blocks, {});
  check('plan', 'her plan has no stage, and her work for it is no stage either', [st.stage, st.accept], [null, null]);
  const open = maria.write('promise', { terms: { lines: [{ id: 'loaves', what: loaf.hash, quantity: A('10', 'loaf'), price: GBP(20) }] } }, { from: maria.id });
  check('plan', 'an open offer leaves a side open: it is a deal', fb.door('promise_stage', open, w.blocks, {}).stage, 'offered');
}
done();
