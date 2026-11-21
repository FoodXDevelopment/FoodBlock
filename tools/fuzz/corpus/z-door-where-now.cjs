'use strict';
// Found while bringing the test up to date (2026-11-13): the oracle's door answers where_now with [] for a thing its own pool does not hold,
// where the core (and the oracle's internal whereNow, which the audit compares) names a place. Asked door to door on the vector story where
// the audit's parity shows it. 1.9 (end pass, 2026-11-20): the story sections are door cases now; the story is the held blocks of the vectors'
// "where now:" cases (spec/conventions-vectors.json: where_now is a reading).
const C = require('../../../spec/conventions-vectors.json');
module.exports = [
  { name: 'new G: where_now at the door, for a thing the oracle\'s pool does not hold', row: 'new-G', source: 'spec/conventions-vectors.json where now cases, asked door to door', build(L) {
    const d = C.door.find((x) => x.op === 'where_now' && /^where now:/.test(x.name || ''));
    if (!d) return;
    const blocks = d.args[1];
    const w = { name: 'vectors: things: where they are and who owns them', blocks };
    for (const t of blocks.filter((b) => b.type === 'thing')) L.ask(w, 'where_now of ' + t.hash.slice(0, 8), 'where_now', [t, 'held'], { door: true });
  } },
];
