'use strict';
// Splits the random worlds found that part 08's table does not list (step 1 of the 1.9 build, 2026-11-13), each reduced by hand to a
// smallest world and kept here so it is asked on every run.
const SRC = 'tools/fuzz random worlds (world18.cjs), reduced by hand';

module.exports = [
  { name: 'new A: the payee\'s received after her key forked', row: 'new-A', source: SRC + ' (seeds 1 and 4: promise_stage .paid)', build(L) {
    const { World, amt, put, thing, deal, pairOf } = L;
    for (const fork of [false, true]) {
      const w = new World('new A ' + (fork ? 'forked' : 'control')); w.lenient = true;
      const leila = w.person('leila'), sam = w.person('sam');
      const t = thing(w, leila, 'bread', amt(10, 'loaf'), 't');
      if (fork) pairOf(w, leila, leila.keys, ['observe', { kind: 'note', text: 'a' }, {}, 'A'], ['observe', { kind: 'note', text: 'b' }, {}, 'B']);
      const d = deal(w, leila, sam, t, { quantity: amt(2, 'loaf'), price: amt(20, 'KES') }, 'd');
      put(w, leila, 'observe', { kind: 'received', amount: amt(20, 'KES') }, { for: d.offer.hash }, 'received');
      L.ask(w, `her received 20, ${fork ? 'after' : 'with no'} pair of her key`, 'promise_stage', [d.offer, 'held', {}]);
    }
  } },
  { name: 'new B: a make after its key\'s line breaks', row: 'new-B', source: SRC + ' (seeds 3, 6, 9: ownership .draws, made_from)', build(L) {
    const { World, amt, put, thing, pairOf, hand } = L;
    { const w = new World('new B pair'); w.lenient = true;
      const harry = w.person('harry');
      const t = thing(w, harry, 'flour', amt(10, 'kg'), 't');
      pairOf(w, harry, harry.keys, ['observe', { kind: 'note', text: 'a' }, {}, 'A'], ['observe', { kind: 'note', text: 'b' }, {}, 'B']);
      put(w, harry, 'transform', { inputs: [{ from: t.hash, amount: amt('2', 'kg') }] }, { derives_from: [t.hash] }, 'make');
      L.ask(w, 'a make after a pair of its key', 'ownership', [t, 'held', null]); }
    { const w = new World('new B low seq');
      const harry = w.person('harry');
      const t = thing(w, harry, 'eggs', null, 't'); const n = L.next(w, harry.keys, harry);
      const low = hand(w, harry, 'observe', { kind: 'note' }, {}, { prev: t.hash, seq: Math.max(1, n.seq - 1) }, 'low seq');
      hand(w, harry, 'transform', {}, { derives_from: [t.hash] }, { prev: low.hash, seq: n.seq + 1 }, 'make');
      L.ask(w, 'a make after a block whose seq is below its prev', 'ownership', [t, 'held', null]);
      L.ask(w, 'the same: made_from', 'made_from', [t, 'held']); }
  } },
  // new D, E and F are kept as their reduced random worlds in corpus/found/ (the shapes need the whole of the world the generator built)
];
