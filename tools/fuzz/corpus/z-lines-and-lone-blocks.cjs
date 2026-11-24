'use strict';
// Reductions of random worlds: a thing handed along a line with draws by people who do not own it, a decline, a self-gift, a skipped note and a
// note dated far ahead, then asked who owns it; and the blocks that stand alone (a lone genesis of each suite, a block that names no type,
// a grant whose previous block is not held).
const SRC = 'random worlds, reduced by hand';

module.exports = [
  { name: 'ownership: a truck given by one who does not own it, then handed on with no yes', row: 5, source: SRC, build(L) {
    const { put, thing, give, yes, hand, amt } = L;
    const w = new L.World('truck given by a non-owner');
    const a = w.person('a'), b = w.person('b'), c = w.person('c'), agent = w.person('agent', 'agent');
    const truck = thing(w, a, 'truck', null, 'a\'s truck');
    give(w, b, truck, a, null, 'b, who owns none of it, gives it to a');
    const g = put(w, a, 'grant', { kind: 'agent' }, { to: agent.id }, 'a grants her agent');
    put(w, a, 'observe', { kind: 'note', text: 'about a contact' }, { subject: c.id }, 'a note');
    put(w, a, 'observe', { kind: 'confirm' }, { confirms: g.hash }, 'a confirms her grant');
    L.ask(w, 'owner before a hands it on', 'ownership', [truck, 'blocks', null]);
    give(w, a, truck, b, null, 'a offers it to b, who has not said yes');
    L.ask(w, 'owner while b has not said yes', 'ownership', [truck, 'blocks', null]);
    const t = give(w, a, truck, c, null, 'a offers it to c');
    yes(w, c, t, 'c says yes');
    L.ask(w, 'owner after c says yes', 'ownership', [truck, 'blocks', null]);
  } },
  { name: 'ownership: a market stall handed down a line, declined, given to herself, and named in a promise', row: 5, source: SRC, build(L) {
    const { put, thing, give, yes, no, deal, amt } = L;
    const w = new L.World('stall handed down a line');
    w.lenient = true;
    const p = w.person('p'), q = w.person('q'), r = w.person('r'), s = w.person('s');
    const stall = thing(w, p, 'market', null, 'p\'s stall');
    put(w, p, 'observe', { kind: 'note', text: 'skewed' }, {}, 'a note');
    const t1 = give(w, p, stall, q, null, 'p gives it to q');
    yes(w, q, t1, 'q says yes');
    const t2 = give(w, q, stall, r, null, 'q gives it to r');
    const refused = no(w, r, t2, 'r declines');
    put(w, p, 'observe', { kind: 'note', text: 'skip', skip: true }, {}, 'a skipped note');
    put(w, q, 'promise', { terms: { lines: [{ id: '1', what: stall.hash, quantity: amt(22, '{egg}'), price: amt(8, 'GBP') }], expires: '2026-10-16T09:00:00.000Z' } }, { from: q.id, to: s.id }, 'q\'s promise names the stall');
    L.ask(w, 'owner after the decline', 'ownership', [stall, 'blocks', null]);
    give(w, p, stall, p, null, 'p gives it to herself');
    put(w, p, 'observe', { kind: 'note', text: 'skewed', at: '2027-11-19T09:00:28.995Z' }, {}, 'a note dated far ahead');
    L.ask(w, 'owner after p gives it to herself', 'ownership', [stall, 'blocks', null]);
    give(w, p, stall, s, null, 'p, who gave it away, gives it again');
    L.ask(w, 'owner after the second gift of the same thing', 'ownership', [stall, 'blocks', null]);
  } },
  { name: 'identity_state: a lone genesis, std and p256', row: 'harness', source: SRC, build(L) {
    const w = new L.World('lone genesis std');
    const p = w.person('p');
    L.ask(w, 'a std genesis', 'identity_state', [p.id, 'blocks', null]);
    const v = new L.World('lone genesis p256');
    const keys = v.keypair('p256');
    const g = L.sdk.identity.genesis(keys, { kind: 'person', at: v.T(), audience: 'public' });
    v.add(g, 'genesis p256');
    L.ask(v, 'a p256 genesis', 'identity_state', [g.hash, 'blocks', null]);
  } },
  { name: 'valid: a grant at seq 2 whose previous block is not held', row: 2, source: SRC, build(L) {
    const w = new L.World('valid, prev not held');
    const p = w.person('p');
    const b = L.hand(w, p, 'grant', {}, {}, { prev: 'b0'.repeat(32), seq: 2 }, 'a grant at seq 2');
    L.ask(w, 'valid with the genesis alone held', 'valid', [b, [p.g]]);
  } },
  { name: 'valid: a block that names no type', row: 3, source: SRC, build(L) {
    const w = new L.World('valid, no type');
    L.ask(w, 'valid with nothing held', 'valid', [{ hash: '20'.repeat(32), state: {}, refs: {}, signature: '60'.repeat(64) }, []]);
  } },
];
