const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, check, done, own, ownersOf, drawsOf, offer, accepts, day } = L;
// 3d-1 Time. World: (1) Leila's tool, under her grant `until` Friday: block T9 dated Wednesday, then T10 (prev T9) dated Tuesday. Expect T10 after T9 by `prev`, whatever its date.
{
  const w = new World(), leila = P(w, 'leila'), tool = P(w, 'tool');
  const WED = day(2), TUE = day(1), FRI = day(4);
  const G = T(leila.write('grant', { kind: 'shop', scope: { types: ['observe.note'], until: FRI } }, { to: tool.id }), 'G');
  tool.write('grant', { status: 'accepted' }, { answers: G.hash });
  const t9 = T(tool.write('observe', { kind: 'note' }, { under: G.hash }, { at: WED }), 'T9');
  const t10 = T(tool.write('observe', { kind: 'note' }, { under: G.hash }, { at: TUE }), 'T10');
  // 1.9 stage 4 (G1): a note under a grant binds nothing and speaks for its signer alone, so `under_ok` is false for both, whatever their dates
  check('3d-1', 'T10 names T9 as its prev; both are notes, which speak for their signer alone (neither is ordered by its date)', [t10.refs.prev === t9.hash, fb.door('under_ok', t9, w.blocks), fb.door('under_ok', t10, w.blocks)], [true, false, false]);
  const c = fb.door('check_chain', w.blocks.filter(b => b.refs.author === tool.id && b.hash !== tool.id), tool.id);
  check('3d-1', 'the chain: no gap, no pair, nothing out of place; the head is T10 (the later block on the line), whatever the dates', [c.ok, c.head === t10.hash], [true, true]);
  const undated = (() => { const b = tool.make('observe', { kind: 'note' }, { under: G.hash }); delete b.state.at; const hand = { type: b.type, state: b.state, refs: b.refs }; const hash = L.sha(L.cj(hand)); return { hash, ...hand, signature: L.signRaw(tool.key, L.cj(L.headerOf(hand, hash))) }; })();
  w.add(undated);
  check('3d-2', 'a block with no `at` under a grant with `until` is not in time: it is under no grant', fb.door('under_ok', undated, w.blocks), false);
}
// 3d-2 A stated end, and a missing `at`. World: (1) Maria M0, M1 offer of 10 kg flour F to Harry, `expires` the 12th, no clock. (2) Harry H1 accepts, no `at`, in June. Expect not in time: F held until Maria's next word.
// (3) Maria M2 ends M1: F freed. Today held for ever.
{
  const w = new World(), maria = P(w, 'maria'), harry = P(w, 'harry');
  const K = kindOf(maria, 'flour'), F = T(instance(maria, K, { pack: A('10', 'kg') }), 'F');
  const m1 = T(offer(maria, maria, harry, F, { quantity: A('10', 'kg'), price: A('1', 'GBP'), expires: day(11) }), 'M1');
  const noAt = { ...{}, };
  // an accept with no `at`: written by hand (the helper always dates)
  const acc = (() => { const b = harry.make('promise', { status: 'accepted' }, { answers: m1.hash, for: m1.hash }); delete b.state.at; return b; })();
  // re-sign without `at`
  const h = L.sha, cj = L.cj;
  const hand = { type: acc.type, state: acc.state, refs: acc.refs }; const hash = h(cj(hand));
  const signed = { hash, ...hand, signature: L.signRaw(harry.key, cj(L.headerOf(hand, hash))) };
  w.add(signed); harry.head = hash; harry.seq = signed.state.seq;
  const r = own(w, F);
  check('3d-2', 'the undated accept is not in time: promise_stage offered', fb.door('promise_stage', m1, w.blocks, {}).stage, 'offered');
  check('3d-2', 'F held (waits for Maria\'s next word)', [drawsOf(r).filter(x => x[0] === 'F' || x[0] === 'M1').map(x => x.slice(1)), ownersOf(r)], [[[true, null, 'held']], { owners: [] }]);
  maria.write('promise', { status: 'stopped', stop: 'onward' }, { updates: m1.hash });
  const r2 = own(w, F);
  check('3d-2', 'Maria ends M1: F freed, Maria\'s again', [drawsOf(r2).filter(x => x[0] === 'M1').map(x => x.slice(1)), ownersOf(r2)], [[[true, null, 'freed']], { owners: [['maria', '10']] }]);
}
done();
