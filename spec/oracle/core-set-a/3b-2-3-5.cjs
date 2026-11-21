const L = require('./lib.cjs'); const { fb, World, P, T, tg, nm, A, kindOf, instance, deal, sell, check, done, own, ownersOf, drawsOf } = L;
const accept = (s, t) => s.write('transfer', { status: 'accepted' }, { answers: t.hash });
const decline = (s, t) => s.write('transfer', { status: 'declined' }, { answers: t.hash });
// 3b-2 The taint of a fork. Maria M0; M1 sack X, M2 sack Y; M3 and M3' a pair at seq 3: X to Leila and X to Ben; M4 prev M3: Y to Amara.
{
  const w = new World(), maria = P(w, 'maria'), leila = P(w, 'leila'), ben = P(w, 'ben'), amara = P(w, 'amara');
  const K = kindOf(maria, 'sack'), X = T(instance(maria, K, { pack: A('1', 'sack') }), 'X'), Y = T(instance(maria, K, { pack: A('1', 'sack') }), 'Y');
  const dL = deal(maria, X, leila, A('1', 'sack')), dB = deal(maria, X, ben, A('1', 'sack')), dA = deal(maria, Y, amara, A('1', 'sack'));
  const base = maria.head, seq0 = maria.seq;
  const m3 = T(sell(maria, X, leila, dL, A('1', 'sack')), 'M3');
  maria.head = base; maria.seq = seq0;
  const m3b = T(sell(maria, X, ben, dB, A('1', 'sack')), 'M3b');
  maria.head = m3.hash; maria.seq = m3.state.seq;
  const m4 = T(sell(maria, Y, amara, dA, A('1', 'sack')), 'M4');
  check('3b-2', 'ownership(Y): Amara, landed', [ownersOf(own(w, Y)), drawsOf(own(w, Y)).map(x => [x[0], x[3]])], [{ owners: [['amara', '1']] }, [['M4', 'landed']]]);
  const rx = own(w, X);
  check('3b-2', 'ownership(X): held on a pair', [rx.owners.length, rx.pair.map(p => [tg(p.draw), p.yes]).sort()], [0, [['M3', true], ['M3b', true]]]);
}
// 3b-3 neither came first, in every order
{
  const out = [];
  for (let run = 0; run < 6; run++) {
    const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), leila = P(w, 'leila');
    const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('1', 'sack') }), 'L7');
    const dA = deal(harry, L7, amara, A('1', 'sack')), dL = deal(harry, L7, leila, A('1', 'sack'));
    const base = harry.head, seq0 = harry.seq;
    const h2 = T(sell(harry, L7, amara, dA, A('1', 'sack')), 'H2'); harry.head = base; harry.seq = seq0;
    const h2b = T(sell(harry, L7, leila, dL, A('1', 'sack')), 'H2b');
    // a different order of the held blocks each run
    const blocks = w.blocks.slice(); let x = run + 1; for (let i = blocks.length - 1; i > 0; i--) { x = (x * 7919 + 13) % 1009; const j = x % (i + 1); [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; }
    const r = fb.door('ownership', L7, blocks);
    out.push(JSON.stringify([r.owners.length, r.pair.map(p => [tg(p.draw), p.yes]), r.draws.map(d => [tg(d.block), d.takes, d.why])]));
  }
  check('3b-3', 'ownership(L7), six shuffled orders: one answer', [...new Set(out)].length, 1);
  check('3b-3', 'the answer: L7 held on a pair', JSON.parse(out[0])[0] + ':' + JSON.parse(out[0])[1].length, '0:2');
}
// 3b-5 World A (seat 50 act.cjs): Harry H1 L7 10 sacks; Amara orders, H2 L7 to Amara; H2' to puppet P; P yes; P declines.
{
  const w = new World(), harry = P(w, 'harry'), amara = P(w, 'amara'), puppet = P(w, 'puppet');
  const K = kindOf(harry, 'sack'), L7 = T(instance(harry, K, { pack: A('10', 'sack') }), 'L7');
  const dA = deal(harry, L7, amara, A('10', 'sack'));
  const base = harry.head, seq0 = harry.seq;
  const h2 = T(sell(harry, L7, amara, dA, null), 'H2');
  check('3b-5', 'A (2) Amara 10', ownersOf(own(w, L7)), { owners: [['amara', '10']] });
  harry.head = base; harry.seq = seq0;
  const h2p = T(sell(harry, L7, puppet, null, null), "H2'");
  check('3b-5', 'A (3) the twin does not stand: Amara 10', ownersOf(own(w, L7)), { owners: [['amara', '10']] });
  const py = accept(puppet, h2p);
  const r4 = own(w, L7);
  check('3b-5', 'A (4) P says yes: pair, no owner', [r4.owners.length, r4.owner, r4.pair.map(p => [tg(p.draw), nm(p.to), p.yes]).sort()], [0, null, [["H2'", 'puppet', true], ['H2', 'amara', true]]]);
  decline(puppet, h2p);
  check('3b-5', 'A (5) P declines: Amara 10', ownersOf(own(w, L7)), { owners: [['amara', '10']] });
}
// World B: Maria M1 flour F 10 kg; Leila orders 4, Ben 3; M2 4 kg to Leila and M2' 3 kg to Ben, a pair: fits; twins M3, M3' 2 kg to Amara for A1: once.
{
  const w = new World(), maria = P(w, 'maria'), leila = P(w, 'leila'), ben = P(w, 'ben'), amara = P(w, 'amara');
  const K = kindOf(maria, 'flour'), F = T(instance(maria, K, { pack: A('10', 'kg') }), 'F');
  const dL = deal(maria, F, leila, A('4', 'kg')), dB = deal(maria, F, ben, A('3', 'kg')), dA = deal(maria, F, amara, A('2', 'kg'));
  const base = maria.head, seq0 = maria.seq;
  const m2 = T(sell(maria, F, leila, dL, A('4', 'kg')), 'M2'); maria.head = base; maria.seq = seq0;
  const m2b = T(sell(maria, F, ben, dB, A('3', 'kg')), 'M2b');
  const r = own(w, F);
  check('3b-5', 'B (3) a fitting pair: Leila 4, Ben 3, Maria 3', ownersOf(r), { owners: [['ben', '3'], ['leila', '4'], ['maria', '3']].sort() });
  maria.head = m2b.hash; maria.seq = m2b.state.seq;
  const base2 = maria.head, seq2 = maria.seq;
  const m3 = T(sell(maria, F, amara, dA, A('2', 'kg')), 'M3'); maria.head = base2; maria.seq = seq2;
  const m3b = T(sell(maria, F, amara, dA, A('2', 'kg')), 'M3b');
  const r2 = own(w, F);
  check('3b-5', 'B (4) twins for one deal count once: Amara 2', ownersOf(r2), { owners: [['amara', '2'], ['ben', '3'], ['leila', '4'], ['maria', '1']] });
}
done();
