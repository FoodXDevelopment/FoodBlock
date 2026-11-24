// A request waits on `whose`: a block of the deal that does not yet stand is listed in `waiting` (blocks.md, Finality) and counts nowhere. Harry's offer; Amara's accept is signed by her phone key, whose voice states `reach` P1D on her clock Wanjiru: it waits on `reach`,
// the deal is `offered` with `requests [{ accept, open: [whose] }]` (the accept binds only once it stands, by her clock, her own later word, or a relier's block).
// Also `gives` says the bench of the deal it belongs to.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, GBP, stage, day, yes, mkKey, reqs } = L;
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), wan = P(w, 'wanjiru');
  const phoneK = mkKey('amara-phone');
  const K1 = amara.write('grant', { kind: 'key', voices: [{ key: amara.key.pub }, { key: phoneK.pub, wait: 'PT0S', reach: 'P1D' }], clocks: { names: [wan.id], needed: 1 } }, { subject: amara.id, updates: amara.id });
  const phone = amara.asKey(phoneK, K1.hash);
  const Kd = kindOf(harry, 'flour'), F = instance(harry, Kd, { pack: A('1', 'kg') });
  const h1 = T(harry.write('promise', { terms: L.linesFor(F, { quantity: A('1', 'kg'), price: GBP(1) }) }, { from: harry.id, to: amara.id }), 'H1');
  const acc = T(phone.write('promise', { status: 'accepted' }, { answers: h1.hash, for: h1.hash, after: K1.hash }), 'ACC');
  const st = stage(w, h1);
  check('whose', 'the accept waits on reach: offered, a request open on whose, listed in waiting', [st.stage, reqs(st, tg), st.waiting.some(x => tg(x.block) === 'ACC' && x.on === 'reach')], ['offered', [['ACC', ['whose']]], true]);
  check('gives', 'gives shows the bench: none (the deal names no names)', fb.door('gives', h1, harry.id, w.blocks).bench, 'none');
}
done();
