'use strict';
// where_now at the door: the oracle's door answers [] for a thing its own pool does not hold, where the core (and the oracle's internal
// whereNow, which the audit compares) names a place. Asked door to door on the held blocks of the vectors' "where now:" cases
// (spec/conventions-vectors.json: where_now is a reading).
const C = require('../../../spec/conventions-vectors.json');
module.exports = [
  { name: 'where_now at the door, for a thing the oracle\'s pool does not hold', row: 'found', source: 'spec/conventions-vectors.json where now cases, asked door to door', build(L) {
    const d = C.door.find((x) => x.op === 'where_now' && /^where now:/.test(x.name || ''));
    if (!d) return;
    const blocks = d.args[1];
    const w = { name: 'vectors: things: where they are and who owns them', blocks };
    for (const t of blocks.filter((b) => b.type === 'thing')) L.ask(w, 'where_now of ' + t.hash.slice(0, 8), 'where_now', [t, 'blocks'], { door: true });
  } },
];
