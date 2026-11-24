'use strict';
// A long history is no loop: the ownership fold reads what a thing was made from on a stack of its own, never the call stack, in both engines.
// A chain of a thousand makes (or keeps) answers its owner on both engines, the same answer a short chain gives.
const SRC = 'a long chain built by hand';
const N = 1000;

function chain(L, name, link) {
  const w = new L.World(name);
  const harry = w.person('harry'), amara = w.person('amara');
  let place = L.next(w, harry.keys, harry);
  const put = (type, state, refs, note) => { const b = L.hand(w, harry, type, state, refs, place, note); place = { prev: b.hash, seq: place.seq + 1 }; return b; };
  const first = put('thing', { kind: 'maize', pack: L.amt('50', 'kg') }, { of: L.kindOf('maize') }, 'the first sack');
  let t = first;
  for (let i = 0; i < N; i++) {
    const m = put('transform', {}, link(t), 'link ' + i);
    t = put('thing', { kind: 'maize', pack: L.amt('50', 'kg') }, { derives_from: [m.hash] }, 'sack ' + i);
  }
  return { w, harry, amara, first, last: t, put };
}

module.exports = [
  { name: 'deep chains: a thousand makes, then a sale', row: 51, source: SRC, build(L) {
    const { w, amara, first, last, put } = chain(L, '08 deep makes', (t) => ({ derives_from: [t.hash] }));
    L.ask(w, 'ownership of the last thing, 1000 makes deep', 'ownership', [last, 'blocks', null]);
    L.ask(w, 'made_from the first thing, 1000 makes deep', 'made_from', [first, 'blocks']);
    const sale = put('transfer', {}, { what: last.hash, to_owner: amara.id }, 'harry sells the last sack to amara');
    const n = L.next(w, amara.keys, amara);
    L.hand(w, amara, 'transfer', { status: 'accepted' }, { answers: sale.hash }, n, 'amara accepts');
    L.ask(w, 'ownership of the last thing after amara accepts', 'ownership', [last, 'blocks', null]);
  } },
  { name: 'deep chains: a thousand keeps (produce of produce)', row: 51, source: SRC, build(L) {
    const { w, last } = chain(L, '08 deep keeps', (t) => ({ subject: t.hash }));
    L.ask(w, 'ownership of the last produce, 1000 keeps deep', 'ownership', [last, 'blocks', null]);
  } },
];
