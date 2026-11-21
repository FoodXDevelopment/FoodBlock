// the export clause: the line back to each fold's own start, no further
const { fb, World, A, kindOf, instance, give, accept, J, P, nm, T, tg, Q } = require('./h.cjs');
const w = new World(), harry = P(w, 'harry'), maria = P(w, 'maria'), K = kindOf(harry, 'flour');
const sack = T(instance(harry, K, { pack: A('10', 'kg') }), 'sack');
const t1 = T(give(harry, sack, maria, A('3', 'kg')), 'draw 1'); accept(maria, t1);
const t2 = T(give(harry, sack, maria, A('3', 'kg')), 'draw 2'); accept(maria, t2);
const doc = fb.exportOf(maria.id, w.blocks, maria.id);
console.log(doc.messages.length, 'messages for Maria');
const doc2 = fb.exportOf(harry.id, w.blocks, harry.id);
console.log(doc2.messages.length, 'messages for Harry');
