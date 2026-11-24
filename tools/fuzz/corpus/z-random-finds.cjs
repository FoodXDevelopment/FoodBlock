'use strict';
// Splits the random worlds found that the table of known splits does not list, each reduced by hand to a
// smallest world and kept here so it is asked on every run.
const SRC = 'random worlds, reduced by hand';

module.exports = [
  { name: 'the payee\'s received after her key forked', row: 'found', source: SRC, build(L) {
    const { World, amt, put, thing, deal, pairOf } = L;
    for (const fork of [false, true]) {
      const w = new World('payee received ' + (fork ? 'forked' : 'control')); w.lenient = true;
      const leila = w.person('leila'), sam = w.person('sam');
      const t = thing(w, leila, 'bread', amt(10, 'loaf'), 't');
      if (fork) pairOf(w, leila, leila.keys, ['observe', { kind: 'note', text: 'a' }, {}, 'A'], ['observe', { kind: 'note', text: 'b' }, {}, 'B']);
      const d = deal(w, leila, sam, { lines: [{ id: 'goods', what: t.hash, quantity: amt(2, 'loaf'), price: amt(20, 'KES') }] }, 'd');
      put(w, leila, 'observe', { kind: 'received', amount: amt(20, 'KES') }, { for: d.offer.hash }, 'received');
      L.ask(w, `her received 20, ${fork ? 'after' : 'with no'} pair of her key`, 'promise_stage', [d.offer, 'blocks', {}]);
    }
  } },
  { name: 'a make after its key\'s line breaks', row: 'found', source: SRC, build(L) {
    const { World, amt, put, thing, pairOf, hand } = L;
    { const w = new World('make after a pair'); w.lenient = true;
      const harry = w.person('harry');
      const t = thing(w, harry, 'flour', amt(10, 'kg'), 't');
      pairOf(w, harry, harry.keys, ['observe', { kind: 'note', text: 'a' }, {}, 'A'], ['observe', { kind: 'note', text: 'b' }, {}, 'B']);
      put(w, harry, 'transform', { inputs: [{ from: t.hash, amount: amt('2', 'kg') }] }, { derives_from: [t.hash] }, 'make');
      L.ask(w, 'a make after a pair of its key', 'ownership', [t, 'blocks', null]); }
    { const w = new World('make after a low seq');
      const harry = w.person('harry');
      const t = thing(w, harry, 'eggs', null, 't'); const n = L.next(w, harry.keys, harry);
      const low = hand(w, harry, 'observe', { kind: 'note' }, {}, { prev: t.hash, seq: Math.max(1, n.seq - 1) }, 'low seq');
      hand(w, harry, 'transform', {}, { derives_from: [t.hash] }, { prev: low.hash, seq: n.seq + 1 }, 'make');
      L.ask(w, 'a make after a block whose seq is below its prev', 'ownership', [t, 'blocks', null]);
      L.ask(w, 'the same: made_from', 'made_from', [t, 'blocks']); }
  } },
];
