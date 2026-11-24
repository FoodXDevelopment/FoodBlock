// Crossed accepts; a withdrawn firm offer; the 31st tray.
// 7.4 Crossed accepts. Maria accepts Amara's 80p counter [accepted]; Amara's other device accepts Maria's £1 offer, unseen: both bind, `crossed` [accepted]; Maria delivers and Amara pays 80p: the 80p reading is `done`, the £1 reading `underway` [done, the furthest].
// Maria ends the £1 reading by an onward stop answering that accept. Nothing falls. One key, one `prev` or one `seq`: a pair, also in `forks`; still neither is freed.
// 7.7 A withdrawn firm offer. No `expires`, no clock. Harry withdraws in April; Amara accepts in October, unseen: her accept is waiting until a relier's counted block uses it. With `expires` 30 April, her October accept is late by its own `at`.
// the 31st taker: if that taker paid and nothing moved, `uncovered.to` is his.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, drawsOf, GBP, stage, day, yes, no, stop, mkKey } = L;
const per = p => ({ amount: GBP(p), per: A('1', 'kg') });
{
  const w = new World(), maria = P(w, 'maria'), amara = P(w, 'amara');
  const K = kindOf(maria, 'flour'), F = T(instance(maria, K, { pack: A('10', 'kg') }), 'F');
  const m1 = T(maria.write('promise', { terms: L.linesFor(F, { quantity: A('1', 'kg'), price: GBP(1) }) }, { from: maria.id, to: amara.id }), 'M1');
  // Maria accepts the counter (80p); Amara's other device (a second key) accepts Maria's £1 offer, unseen
  const mk = mkKey('amara-device'), kg = amara.write('grant', { kind: 'key', voices: [{ key: amara.key.pub }, { key: mk.pub, wait: 'PT0S' }] }, { subject: amara.id, updates: amara.id });
  const c1 = T(amara.write('promise', { terms: L.linesFor(F, { quantity: A('1', 'kg'), price: { amount: GBP(0.8), per: A('1', 'kg') } }) }, { from: maria.id, to: amara.id, answers: m1.hash, for: m1.hash }), 'C1');
  const dev = amara.asKey(mk, kg.hash);
  const accC = T(maria.write('promise', { status: 'accepted' }, { answers: c1.hash, for: m1.hash }), 'ACC80');
  const accM = T(dev.write('promise', { status: 'accepted' }, { answers: m1.hash, for: m1.hash, after: kg.hash }), 'ACC100');
  const st = stage(w, m1);
  check('crossed accepts', 'both bind: crossed lists both accepts; the stage is accepted', [st.crossed.length, st.crossed.sort().join() === [accC.hash, accM.hash].sort().join(), st.stage, st.per_accept.length], [2, true, 'accepted', 2]);
  const dlv = maria.write('transfer', { amount: A('1', 'kg') }, { what: F.hash, to_owner: amara.id, for: m1.hash, after: [accC.hash] }); amara.write('transfer', { status: 'accepted' }, { answers: dlv.hash, for: m1.hash });
  const pay = amara.write('transfer', { amount: GBP(0.8) }, { to_owner: maria.id, for: m1.hash, after: [accC.hash] }); maria.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: m1.hash });
  const st2 = stage(w, m1);
  const rd = Object.fromEntries(st2.per_accept.map(x => [tg(x.accept), x.stage]));
  check('crossed accepts', 'the 80p reading is done, the £1 reading underway; the stage is the furthest: done', [rd.ACC80, rd.ACC100, st2.stage], ['done', 'underway', 'done']);
  stop(maria, accM, 'onward', {}, { answers: accM.hash });
  check('crossed accepts', 'Maria ends the £1 reading by an onward stop answering that accept: nothing falls', stage(w, m1).stage, 'done');
}
{
  // 7.7: no expires: her October accept waits until a relier's counted block uses it; with expires 30 April, late by its own at
  for (const [name, exp] of [['no end', undefined], ['expires 30 April', day(150)]]) {
    const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), sam = P(w, 'sam');
    const K = kindOf(harry, 'flour'), F = instance(harry, K, { pack: A('1', 'kg') });
    const h1 = T(harry.write('promise', { terms: L.linesFor(F, { quantity: A('1', 'kg'), price: GBP(1), ...(exp ? { expires: exp } : {}) }) }, { from: harry.id, to: amara.id }), 'H1');
    const wd = stop(harry, h1, 'before');
    const acc = T(amara.write('promise', { status: 'accepted' }, { answers: h1.hash, for: h1.hash }, { at: day(300) }), 'ACC');
    // an accept that does not have the withdrawal in its past: unseen. Without an end, the cut waits for a relier; with expires it is late by its own at
    const st = stage(w, h1);
    check('withdrawn offer', name + ': an offer that states no end has none (an unseen accept binds it); with `expires` the October accept is late by its own at: a request open on when, the offer stopped', [st.stage, st.requests.map(r => r.open)], name === 'no end' ? ['accepted', []] : ['stopped', [['when']]]);
  }
}
{
  // the 31st taker paid and nothing moved: uncovered.to is his
  const w = new World(), ben = P(w, 'ben'), taker = P(w, 'late');
  const K = kindOf(ben, 'tray');
  const open = T(ben.write('promise', { terms: L.linesFor(K, { quantity: A('1', 'tray'), price: GBP(2) }) }, { from: ben.id }), 'OPEN');
  const first = P(w, 'first');
  const r1 = first.write('promise', { status: 'accepted', terms: { lines: [{ id: 'goods', quantity: A('1', 'tray') }] } }, { answers: open.hash, for: open.hash });
  ben.write('promise', { status: 'accepted', terms: { lines: [{ id: 'goods', quantity: A('1', 'tray') }] } }, { answers: r1.hash, for: open.hash });
  const r2 = taker.write('promise', { status: 'accepted', terms: { lines: [{ id: 'goods', quantity: A('1', 'tray') }] } }, { answers: open.hash, for: open.hash });
  const al = T(ben.write('promise', { status: 'accepted', terms: { lines: [{ id: 'goods', quantity: A('1', 'tray') }] } }, { answers: r2.hash, for: open.hash }), 'AL2');
  const pay = taker.write('transfer', { amount: GBP(2) }, { to_owner: ben.id, for: al.hash }); ben.write('transfer', { status: 'accepted' }, { answers: pay.hash, for: al.hash });
  const st = stage(w, al);
  check('allocated once', 'the over-allocated taker paid and nothing moved: uncovered.to is his £2', [st && st.over_allocated, st && st.uncovered.to && st.uncovered.to.value], [true, '2']);
}
done();
