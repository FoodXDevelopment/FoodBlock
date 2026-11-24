'use strict';
// What an agent's word is backed by, whether a grant or a stop of it stands, and who a circle's word speaks for: a shop grant to an
// agent (a scope of types, parties, a limit, an `every` and an `expires`), the agent's blocks under it, a stop of it, and a circle's seat
// stopped. Each is asked of both engines on the world a random world reduced to.
const SRC = 'random worlds, reduced by hand';
const END = '2026-12-31T00:00:00.000Z';

function shopWorld(L, name) {
  const { World, amt, put, yes } = L;
  const w = new World(name);
  const owner = w.person('owner'), agent = w.person('agent', 'agent'), buyer = w.person('buyer'), third = w.person('third');
  const kind = put(w, owner, 'thing', { kind: 'milk' }, {}, 'the kind: milk');
  const milk = L.thing(w, buyer, 'milk', amt(10, 'litre'), 'the buyer\'s milk', { of: kind.hash });
  const want = put(w, owner, 'promise', { terms: { lines: [{ id: 'milk', what: kind.hash, quantity: amt(10, 'litre'), price: { max: { amount: amt(1.5, 'GBP'), per: amt(1, 'litre') } } }] } }, { to: owner.id }, 'her want');
  const scope = { types: ['observe.note', 'promise'], on: [want.hash], parties: [owner.id, buyer.id, third.id], limit: amt(50, 'GBP'), every: 'P7D', expires: END };
  const g = put(w, owner, 'grant', { kind: 'shop', scope }, { to: agent.id, meter: owner.id }, 'shop grant');
  yes(w, agent, g, 'the agent accepts');
  const offer = put(w, buyer, 'promise', { terms: { lines: [{ id: 'milk', what: milk.hash, quantity: amt(10, 'litre'), price: { amount: amt(1.2, 'GBP'), per: amt(1, 'litre') } }] } }, { from: buyer.id, to: owner.id }, 'the buyer\'s offer, which keeps to her want');
  return { w, owner, agent, buyer, third, g, scope, want, offer };
}

module.exports = [
  { name: 'backed: an agent\'s accept and note under a shop grant', row: 5, source: SRC, build(L) {
    const { put, amt } = L;
    const { w, owner, agent, buyer, g, offer } = shopWorld(L, 'backed under a shop grant');
    const acc = put(w, agent, 'promise', { status: 'accepted', draws: { grant: g.hash, amount: amt(12, 'GBP') } }, { answers: offer.hash, for: offer.hash, under: g.hash }, 'the agent accepts the offer for her');
    put(w, owner, 'observe', { kind: 'receipt' }, { derives_from: [acc.hash] }, 'the meter\'s receipt');
    const n = put(w, agent, 'observe', { kind: 'note', text: 'agent' }, { under: g.hash }, 'the agent\'s note');
    L.ask(w, 'accept: backed by the grantor', 'backed', [acc, owner.id, 'blocks']);
    L.ask(w, 'accept: backed by a party named in the grant', 'backed', [acc, buyer.id, 'blocks']);
    L.ask(w, 'note: backed by the grantor', 'backed', [n, owner.id, 'blocks']);
    L.ask(w, 'note: backed by the agent itself', 'backed', [n, agent.id, 'blocks']);
  } },
  { name: 'made_from: a thing the agent made under a shop grant', row: 5, source: SRC, build(L) {
    const { amt, thing } = L;
    const { w, agent, g } = shopWorld(L, 'made_from under a shop grant');
    const t = thing(w, agent, 'bread', amt(1, 'loaf'), 'the agent\'s thing', { under: g.hash });
    L.ask(w, 'made_from the agent\'s thing', 'made_from', [t, 'blocks']);
  } },
  { name: 'pot: a deal that is paid more than its price, to a third party', row: 5, source: SRC, build(L) {
    const { amt, put, thing, deal, give } = L;
    const w = new L.World('pot overpaid to a third party');
    const seller = w.person('seller'), buyer = w.person('buyer'), third = w.person('third');
    const eggs = thing(w, seller, 'eggs', amt(50, '{egg}'), 'her eggs');
    const offer = put(w, seller, 'promise', { terms: { lines: [{ id: '1', what: eggs.hash, quantity: amt(25, '{egg}'), price: amt(9, 'GBP') }], expires: '2026-10-18T09:00:00.000Z' } }, { from: seller.id, to: buyer.id }, 'the offer');
    give(w, buyer, null, third, amt(18, 'GBP'), 'the buyer pays a third party twice the price', { for: offer.hash });
    L.ask(w, 'pot of the unanswered offer', 'pot', [offer, 'blocks', null]);
    const d = deal(w, seller, buyer, { lines: [{ id: '1', what: eggs.hash, quantity: amt(25, '{egg}'), price: amt(9, 'GBP') }] }, 'an answered deal');
    L.ask(w, 'pot of an answered deal', 'pot', [d.offer, 'blocks', null]);
  } },
  { name: 'pot: an agent\'s promise that names no lines', row: 5, source: SRC, build(L) {
    const { put } = L;
    const { w, owner, agent, buyer, g } = shopWorld(L, 'pot of a promise with no lines');
    const p = put(w, agent, 'promise', { terms: { expires: '2026-10-16T09:00:00.000Z' } }, { from: owner.id, to: buyer.id, under: g.hash }, 'a promise with only an end');
    L.ask(w, 'pot', 'pot', [p, 'blocks', null]);
  } },
  { name: 'stands: a shop grant, its stop, and a grant from the agent', row: 4, source: SRC, build(L) {
    const { put, amt } = L;
    const { w, owner, agent, third, g, scope } = shopWorld(L, 'stands under a shop grant');
    const sub = put(w, agent, 'grant', { kind: 'shop', scope: { types: ['observe.note', 'promise', 'transfer'], parties: scope.parties.slice(0, 3), limit: amt(90, 'GBP'), every: 'P7D', expires: END } }, { to: third.id, parent: g.hash }, 'the agent passes a narrower grant on');
    L.ask(w, 'the shop grant stands', 'stands', [g, 'blocks']);
    L.ask(w, 'the grant from the agent stands', 'stands', [sub, 'blocks']);
    const stop = put(w, owner, 'grant', { status: 'stopped', stop: 'onward' }, { updates: g.hash, after: [g.hash] }, 'the owner stops the shop grant');
    L.ask(w, 'the stop stands', 'stands', [stop, 'blocks']);
    L.ask(w, 'the shop grant after its stop', 'stands', [g, 'blocks']);
    L.ask(w, 'the grant from the agent after the stop', 'stands', [sub, 'blocks']);
  } },
  { name: 'stands: a grant whose previous block is not held', row: 4, source: SRC, build(L) {
    const { hand, amt } = L;
    const w = new L.World('stands with no prev held');
    const a = w.person('a'), c = w.person('c');
    const g = hand(w, a, 'grant', { kind: 'shop', scope: { types: ['observe.note', 'promise'], limit: amt(50, 'GBP'), every: 'P7D', expires: END } }, { to: c.id }, { prev: 'ab'.repeat(32), seq: 4 }, 'a grant at seq 4, its prev not held');
    L.ask(w, 'stands with the genesis alone held', 'stands', [g, 'blocks']);
  } },
  { name: 'speaks_for, members_then, stands: a seat in a circle, then its stop', row: 5, source: SRC, build(L) {
    const { put, amt, yes } = L;
    const w = new L.World('a circle\'s seat and its stop');
    const founder = w.person('founder'), member = w.person('member');
    const F = put(w, founder, 'actor', { kind: 'circle', name: 'Co-op', pack: amt(100, 'part'), rules: [{ parts: 1, scope: { types: ['promise', 'transfer', 'observe', 'grant'], parties: 'any', on: 'any', each: amt(300, 'GBP') } }] }, {}, 'the circle');
    const seat = put(w, founder, 'grant', { kind: 'member', scope: { types: ['promise'] } }, { as: F.hash, to: member.id }, 'the seat');
    yes(w, member, seat, 'the member accepts');
    const stop = put(w, founder, 'grant', { status: 'stopped', stop: 'onward' }, { as: F.hash, updates: seat.hash, after: [seat.hash] }, 'the seat is stopped');
    for (const [n, b] of [['the seat', seat], ['its stop', stop]]) {
      L.ask(w, n + ': speaks_for', 'speaks_for', [b, 'blocks']);
      L.ask(w, n + ': stands', 'stands', [b, 'blocks']);
      L.ask(w, n + ': members_then', 'members_then', [b, F.hash, 'blocks']);
    }
  } },
];
