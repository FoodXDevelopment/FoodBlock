// Section 4, Answers and binding.
// R-B1 When. (1) Maria M1 offers flour F to Harry, `expires` the 12th, no clock. (2) Harry H1 accepts in June, no `at`. Expect `offered`, `requests [{ H1, open: [when] }]`, F `held`. (3) Maria M2 ends M1. Expect F freed.
// R-B2 One request is allocated once. (1) Ben's open offer of 30 trays; his till allocates under his grant. (2) The 31st allocation. Expect `past`, binds Ben, `over_allocated`; if that taker paid and nothing moved, `uncovered.to` is his.
// R-B3 A decline ends a standing word for its signer. (1) Maria declines Harry's offer H1. (2) Maria accepts H1 with her decline in its past. Expect `declined`.
const L = require('./lib.cjs'); const { fb, World, P, T, tg, A, kindOf, instance, check, done, own, ownersOf, drawsOf, GBP, stage, offer, accepts, day, reqs, yes, no, stop } = L;
const dr = (r, ...tags) => drawsOf(r).filter(x => tags.includes(x[0])).map(x => x.slice(0, 4));
{
  const w = new World(), maria = P(w, 'maria'), harry = P(w, 'harry');
  const K = kindOf(maria, 'flour'), F = T(instance(maria, K, { pack: A('10', 'kg') }), 'F');
  const m1 = T(offer(maria, maria, harry, F, { quantity: A('10', 'kg'), price: GBP(1), expires: day(11) }), 'M1');
  const acc = (() => { const b = harry.make('promise', { status: 'accepted' }, { answers: m1.hash, for: m1.hash }); delete b.state.at; const hand = { type: b.type, state: b.state, refs: b.refs }; const hash = L.sha(L.cj(hand)); const sg = { hash, ...hand, signature: L.signRaw(harry.key, L.cj(L.headerOf(hand, hash))) }; w.add(sg); harry.head = hash; harry.seq = sg.state.seq; return sg; })();
  T(acc, 'H1');
  const st = stage(w, m1);
  check('R-B1', '(2) offered; one request H1 open on when', [st.stage, reqs(st, tg)], ['offered', [['H1', ['when']]]]);
  check('R-B1', '(2) F held', dr(own(w, F), 'M1'), [['M1', true, null, 'held']]);
  stop(maria, m1);
  check('R-B1', '(3) F freed', [dr(own(w, F), 'M1'), ownersOf(own(w, F))], [[['M1', true, null, 'freed']], { owners: [['maria', '10']] }]);
}
{
  // R-B2 the 31st allocation of an open offer of 30 trays: past, binds Ben, over_allocated
  const w = new World(), ben = P(w, 'ben'), till = P(w, 'till'), taker = []; for (let i = 0; i < 31; i++) taker.push(P(w, 't' + i));
  const K = kindOf(ben, 'tray');
  const open = T(ben.write('promise', { terms: { quantity: A('30', 'tray'), price: GBP(1) } }, { from: ben.id, what: K.hash }), 'OPEN');
  const allocs = [];
  for (let i = 0; i < 31; i++) {
    const req = taker[i].write('promise', { status: 'accepted', terms: { quantity: A('1', 'tray') } }, { answers: open.hash, for: open.hash });
    allocs.push(T(ben.write('promise', { status: 'accepted', terms: { quantity: A('1', 'tray') } }, { answers: req.hash, for: open.hash }), 'al' + i));
  }
  const st = stage(w, open);
  const t31 = st.takers[30], t30 = st.takers[29];
  check('R-B2', 'the 30th takes, the 31st is over_allocated and still binds Ben (a taker listed)', [t30.over_allocated, t31.over_allocated, st.takers.length, st.over_allocated], [false, true, 31, true]);
  const a31 = stage(w, allocs[30]);
  check('R-B2', 'the 31st allocation is a deal of its own: accepted, over_allocated', [a31 && a31.stage, a31 && a31.over_allocated], ['accepted', true]);
}
{
  const w = new World(), maria = P(w, 'maria'), harry = P(w, 'harry');
  const K = kindOf(harry, 'flour');
  const h1 = T(harry.write('promise', { terms: { quantity: A('1', 'kg'), price: GBP(1) } }, { from: harry.id, to: maria.id, what: K.hash }), 'H1');
  no(maria, h1);
  yes(maria, h1);
  check('R-B3', 'her accept with her decline in its past binds nothing: declined', stage(w, h1).stage, 'declined');
}
done();
