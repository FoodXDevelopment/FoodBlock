'use strict';
// A seeded generator of small worlds (people, a circle, an agent with a grant, promises, transfers, rotations, memberships)
// and of faults (equivocations, skips, replays, forged signatures, wider-than-parent grants, off-by-one chains, mutated and
// re-signed fields). Signing and ids come from the spec-only oracle, never from the Rust core.
const fb = require('../../spec/oracle/fb.cjs');

function rng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const r = { next, int: n => Math.floor(next() * n), pick: l => l[Math.floor(next() * l.length)], coin: (p = 0.5) => next() < p };
  r.shuffle = l => { const o = l.slice(); for (let i = o.length - 1; i > 0; i--) { const j = r.int(i + 1); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  r.hex = n => Array.from({ length: n }, () => '0123456789abcdef'[r.int(16)]).join('');
  return r;
}

const STR = ['', ' ', 'public', 'é', 'é', '\u0000', '﻿', '\u{1F355}', '\u{10FFFF}', '2026-02-30T00:00:00.000Z', '2026-10-15T12:00:60.000Z', '2026-10-15T12:00:00Z',
  '9999-12-31T23:59:59.999Z', 'P1Y', 'PT0S', 'P', 'PT', '-0', '01', '1.', '0.80', 'stopped', 'yes', 'accepted', 'declined', 'withdrawn', 'key', 'limit', 'scope', 'circle', 'agent', '__proto__', 'sm3:', 'sm', 'p256', 'ml-dsa', 'UPPER', 'a b'];
const NUM = [0, -1, 1, 2, 9007199254740991, 9007199254740992, -9007199254740991, -9007199254740992, 1.5, -0, 0.1, 5, 12, 100];
const KEYS = ['author', 'prev', 'after', 'answers', 'updates', 'for', 'what', 'to_owner', 'to_holder', 'to_place', 'under', 'of', 'to', 'from', 'subject', 'as', 'confirms', 'defeats', 'place', 'derives_from', 'same_as'];

function nodes(v, path = [], out = []) { out.push(path); if (Array.isArray(v)) v.forEach((x, i) => nodes(x, [...path, i], out)); else if (v && typeof v === 'object') for (const k of Object.keys(v)) nodes(v[k], [...path, k], out); return out; }
function at(v, path) { return path.reduce((x, k) => x[k], v); }
// Mutate a block-shaped value in place (a deep copy is returned). `ids` gives ids of other blocks to point at.
function mutate(r, value, ids) {
  const out = JSON.parse(JSON.stringify(value));
  const n = 1 + (r.coin(0.3) ? r.int(3) : 0);
  for (let i = 0; i < n; i++) {
    const ps = nodes(out).filter(q => !q.some(k => ['public_key_sign', 'public_key_encrypt', 'recovery_key', 'replaces', 'marks'].includes(k))), p = r.pick(ps);
    if (!p.length) continue;
    const parent = at(out, p.slice(0, -1)), key = p[p.length - 1], cur = parent[key];
    let op = r.int(14);
    // inside a grant's scope the spec leaves the types of the parts open (names are matched, not checked): change values, not structure
    if (p.includes('scope')) { if (cur && typeof cur === 'object') continue; op = typeof cur === 'string' ? 1 : 2; }
    if (op === 0) delete parent[key];
    else if (op === 1) parent[key] = r.pick(STR);
    else if (op === 2) parent[key] = r.pick(NUM);
    else if (op === 3) parent[key] = null;
    else if (op === 4) parent[key] = typeof cur === 'string' ? (ids.length && r.coin(0.5) ? r.pick(ids) : r.hex(64)) : [r.pick(ids.length ? ids : [r.hex(64)])];
    else if (op === 5 && typeof cur === 'string') parent[key] = cur + '́';
    else if (op === 6 && typeof cur === 'string' && cur.length) parent[key] = Array.from(cur).slice(0, -1).join('') + (cur.slice(-1) === '0' ? '1' : '0');
    else if (op === 7 && cur && typeof cur === 'object' && !Array.isArray(cur)) cur[r.pick(KEYS)] = r.coin(0.5) ? r.pick(ids.length ? ids : [r.hex(64)]) : r.pick(STR);
    else if (op === 8 && Array.isArray(cur)) cur.reverse();
    else if (op === 9 && Array.isArray(cur)) cur.push(cur.length ? cur[0] : r.pick(STR));
    else if (op === 10 && typeof cur === 'number') parent[key] = cur + r.pick([-1, 1, 2, 1000]);
    else if (op === 11) parent[key] = { x: cur };
    else if (op === 12) parent[key] = [cur];
    else if (op === 13 && parent && typeof parent === 'object' && !Array.isArray(parent)) parent[r.pick(KEYS)] = r.pick(STR);
  }
  return out;
}

const BASE = Date.parse('2026-10-15T09:00:00.000Z');
class World {
  constructor(r, opts = {}) {
    this.r = r; this.blocks = []; this.actors = []; this.clock = 0; this.opts = opts; this.byHash = new Map(); this.suites = opts.suites || ['std'];
  }
  time(skew = 0) { this.clock += 1000 + this.r.int(5000); return new Date(BASE + this.clock + skew).toISOString(); }
  seal(b, signer) {
    const body = { type: b.type, state: b.state, refs: b.refs };
    const suite = signer.suite;
    const full = { hash: fb.hashOfBlock(body, suite), ...body };
    if (suite !== 'std') full.suite = suite;
    full.signature = fb.signBlock(body, signer.private_key, suite);
    return full;
  }
  push(b) { this.blocks.push(b); this.byHash.set(b.hash, b); return b; }
  newActor(kind = 'person', suite = 'std', extra = {}) {
    const seed = this.r.hex(64);
    const kp = fb.keypair(seed, suite);
    const state = { kind, at: this.time(), audience: 'public', public_key_sign: kp.public_key_sign, ...extra };
    if (suite !== 'std') state.suite = suite;
    const a = { kp, suite, private_key: kp.private_key, key: kp.public_key_sign, seq: 0, kind };
    const g = this.push(this.seal({ type: 'actor', state, refs: {} }, a));
    a.id = g.hash; a.head = g.hash; a.genesis = g; a.keys = [a];
    this.actors.push(a);
    return a;
  }
  // The recovery pair for a genesis.
  withRecovery(kind = 'person') {
    const rk = fb.keypair(this.r.hex(64), 'std');
    const a = this.newActor(kind, 'std', { recovery_key_hash: fb.recoveryKeyHash(rk.public_key_sign, 'std'), recovery_reach: 'P30D' });
    a.recovery = rk;
    return a;
  }
  // Post a block as `a` (extends its chain). o: { signer, skipTo, noAt, extraState, keepHead, prev, seq }
  post(a, type, state, refs = {}, o = {}) {
    const signer = o.signer || a;
    const seq = o.seq !== undefined ? o.seq : (o.skipTo !== undefined ? o.skipTo : a.seq + 1);
    const s = { ...(o.noAt ? {} : { at: this.time(o.skew || 0) }), audience: 'public', seq, ...state };
    if (o.skipTo !== undefined) s.skip = true;
    const rr = { author: a.id, prev: o.prev || a.head, ...refs };
    const b = this.push(this.seal({ type, state: s, refs: rr }, signer));
    if (!o.keepHead) { a.head = b.hash; a.seq = seq; }
    return b;
  }
}

// One random world with a number of acts and faults.
function makeWorld(seed, size = 30) {
  const r = rng(seed);
  const w = new World(r);
  const suiteFor = () => (r.coin(0.08) ? r.pick(['p256', 'sm']) : 'std');
  const people = [w.withRecovery(), w.newActor('person', suiteFor()), w.newActor('person'), w.newActor('person', suiteFor())];
  const agent = w.newActor('agent');
  const contact = w.post(people[1], 'actor', { kind: 'contact', name: 'Joseph', marks: [{ scheme: 'tel', value: '+254700000000' }] }, {});
  const founder = people[0];
  const circle = w.post(founder, 'actor', { kind: 'circle', name: 'Co-op', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }, { name: 'orders', powers: ['sign'] }, { name: 'speak', powers: [] }] }, {});
  const things = [], promises = [], transfers = [], grants = [];
  const ids = () => w.blocks.map(b => b.hash);
  const person = () => r.pick(people);
  const incoming = []; // blocks to replay or arrive late
  const faulty = (b, a) => { // fault injection on a freshly made block: re-sign a mutated body, or break it without re-signing
    const k = r.int(6), body = mutate(r, { type: b.type, state: b.state, refs: b.refs }, ids());
    if (k < 3) { const s = w.seal(body, a); w.byHash.set(s.hash, s); w.blocks[w.blocks.indexOf(b)] = s; return s; }
    if (k === 3) { const s = { ...b, signature: r.hex(128) }; w.blocks[w.blocks.indexOf(b)] = s; return s; }
    if (k === 4) { const s = { ...b, hash: r.hex(64) }; w.blocks[w.blocks.indexOf(b)] = s; return s; }
    const s = { ...b, ...body, hash: b.hash, signature: b.signature }; w.blocks[w.blocks.indexOf(b)] = s; return s;
  };
  const maybe = (b, a, p = 0.12) => (r.coin(p) ? faulty(b, a) : b);
  for (let i = 0; i < size; i++) {
    const a = person();
    const act = r.int(24);
    const asset = things.length ? r.pick(things) : null;
    try {
      if (act === 0 || !things.length) { const t = w.post(a, 'thing', { kind: r.pick(['eggs', 'milk', 'truck', 'crate', 'market']), name: 'Thing' + i }, r.coin(0.3) && things.length ? { of: r.pick(things).hash } : {}); things.push(maybe(t, a)); }
      else if (act === 1) w.post(a, 'observe', { kind: 'note', text: 'n' + i }, r.coin(0.3) ? { under: r.pick(ids()) } : {});
      else if (act === 2) {
        const to = person();
        const to2 = people.filter(p => p !== a); const offer = w.post(a, 'promise', { terms: { price: { minor: 100 + r.int(900), currency: 'GBP' }, quantity: { value: String(1 + r.int(50)), unit: '{egg}' }, expires: new Date(BASE + 86400000 * (1 + r.int(3))).toISOString() } },
          { from: a.id, ...(r.coin(0.8) ? { to: r.pick(to2).id } : {}), what: asset.hash });
        promises.push(maybe(offer, a));
      } else if (act === 3 && promises.length) {
        const p = r.pick(promises), st = r.pick(['accepted', 'accepted', 'declined']);
        const other = r.coin(0.85) ? w.actors.find(x => x.id === (p.refs.author === p.refs.from ? p.refs.to : p.refs.from)) : null;
        w.post(other || a, 'promise', { status: st, ...(r.coin(0.2) ? { terms: { quantity: { value: String(1 + r.int(60)), unit: '{egg}' } } } : {}) }, { answers: p.hash, for: p.hash, after: [p.hash] });
      } else if (act === 4 && promises.length) {
        const p = r.pick(promises);
        const own = r.coin(0.8) ? w.actors.find(x => x.id === p.refs.author) : null;
        w.post(own || a, 'promise', { status: 'stopped', stop: r.pick(['before', 'onward']) }, { updates: p.hash, for: p.hash, after: [p.hash] });
      } else if (act === 5 && promises.length) { // a counter-offer
        const p = r.pick(promises);
        const other = r.coin(0.85) ? w.actors.find(x => x.id === (p.refs.author === p.refs.from ? p.refs.to : p.refs.from)) : null;
        w.post(other || a, 'promise', { terms: { price: { minor: 50 + r.int(900), currency: 'GBP' }, expires: new Date(BASE + 86400000 * 2).toISOString() } }, { answers: p.hash, for: p.hash, after: [p.hash], ...(p.refs.from && p.refs.to ? { from: p.refs.from, to: p.refs.to } : {}) });
      } else if (act === 6) { // a transfer of a thing
        const to = person(); const t = w.post(a, 'transfer', {}, { to_owner: to.id, what: asset.hash, ...(promises.length && r.coin(0.5) ? { for: r.pick(promises).hash } : {}) }); transfers.push(maybe(t, a));
      } else if (act === 7 && transfers.length) {
        const t = r.pick(transfers); w.post(a, 'transfer', { status: r.pick(['accepted', 'accepted', 'declined']) }, { answers: t.hash, after: [t.hash] });
      } else if (act === 8) { const t = w.post(a, 'transfer', { money: { minor: 100 + r.int(2000), currency: 'GBP' }, ...(r.coin(0.3) ? { marks: [{ scheme: 'card', value: 'ch_' + i }] } : {}) }, { to_owner: person().id, ...(promises.length ? { for: r.pick(promises).hash } : {}) }); transfers.push(t); }
      else if (act === 9) { const pl = r.pick(things.filter(t => t !== asset)); if (pl) w.post(a, 'transfer', {}, { to_place: pl.hash, what: asset.hash }); }
      else if (act === 10 && a !== founder) { // circle: founder invites, member answers
        const inv = w.post(founder, 'grant', { kind: 'member', roles: [r.pick(['orders', 'speak', 'admin'])] }, { subject: circle.hash, as: circle.hash, to: a.id });
        grants.push(maybe(inv, founder));
        if (r.coin(0.8)) w.post(a, 'grant', { kind: 'member', status: 'accepted' }, { answers: inv.hash, subject: circle.hash, after: [inv.hash] });
      } else if (act === 11 && grants.length) { // end a membership
        const g = r.pick(grants); w.post(r.coin(0.7) ? founder : a, 'grant', { kind: 'member', status: 'stopped', stop: r.pick(['before', 'onward']) }, { updates: g.hash, subject: circle.hash, as: circle.hash, after: [g.hash] });
      } else if (act === 12) { // an agent for a person: operator grant, then a scoped grant, then the agent acts under it
        const op = w.post(a, 'grant', { kind: 'operator' }, { to: agent.id });
        const sc = w.post(a, 'grant', { kind: 'shop', scope: { acts: ['observe.note', 'promise'], limit: { minor: 5000, currency: 'GBP' }, per: 'P7D', until: '2026-12-31T00:00:00.000Z' } }, { to: agent.id });
        grants.push(sc);
        w.post(agent, r.pick(['observe', 'promise', 'transfer', 'thing']), r.coin(0.5) ? { kind: 'note', text: 'agent' } : { terms: { expires: new Date(BASE + 86400000).toISOString() }, what: 'x' }, { under: sc.hash });
        if (r.coin(0.4)) { // a grant wider than its parent
          w.post(agent, 'grant', { kind: 'shop', scope: { acts: ['observe.note', 'promise', 'transfer'], limit: { minor: r.pick([5000, 9000]), currency: 'GBP' }, per: 'P7D', until: r.pick(['2026-12-31T00:00:00.000Z', '2027-06-01T00:00:00.000Z']) } }, { to: person().id, under: sc.hash });
        }
        void op;
      } else if (act === 13) { // equivocation: two blocks naming one prev
        const prev = a.head, seq = a.seq + 1;
        w.post(a, 'observe', { kind: 'note', text: 'one' }, {}, { keepHead: true, prev, seq });
        w.post(a, 'observe', { kind: 'note', text: 'two' }, {}, { prev, seq });
      } else if (act === 14) { w.post(a, 'observe', { kind: 'note', text: 'skip' }, {}, { skipTo: a.seq + 2 + r.int(5) }); }
      else if (act === 15) { incoming.push(r.pick(w.blocks)); } // a replay
      else if (act === 16) { w.post(a, 'transfer', {}, { to_owner: person().id, what: asset.hash }, { noAt: true }); }
      else if (act === 17) { w.post(a, 'observe', { kind: 'note', text: 'skewed' }, {}, { skew: r.pick([-86400000 * 400, 86400000 * 400, 0]) }); }
      else if (act === 18 && a.recovery) { // a recovery rotation: a new key by the recovery key
        const nk = fb.keypair(r.hex(64), 'std'); const rot = w.post(a, 'grant', { kind: 'key', public_key_sign: nk.public_key_sign, recovery_key: a.recovery.public_key_sign }, { subject: a.id }, { signer: { ...a.recovery, suite: 'std' } });
        a.rotated = { nk, rot };
      } else if (act === 19) { // a key grant for a device
        const nk = fb.keypair(r.hex(64), 'std'); w.post(a, 'grant', { kind: 'key', public_key_sign: nk.public_key_sign }, { subject: a.id });
      } else if (act === 20 && things.length) { w.post(a, 'observe', { kind: 'confirm', confidence: r.pick(['0.9', '1', '0.5']) }, { [r.pick(['confirms', 'defeats'])]: r.pick(ids()) }); }
      else if (act === 21) { w.post(a, 'observe', { kind: 'note', text: 'about a contact' }, { subject: contact.hash }); }
      else if (act === 22) { // consent: a person's own word about a sender (an agent, a person), or about every sender
        const subject = r.pick([agent.id, person().id, undefined]);
        w.post(a, 'observe', { kind: 'consent', word: r.pick(['yes', 'stop', 'keep', 'move']) }, { ...(subject ? { subject } : {}) });
      } else if (act === 23) { // a recorder writes down someone else's word
        const subject = r.pick([agent.id, a.id, person().id, undefined]);
        w.post(a, 'observe', { kind: 'consent', word: r.pick(['yes', 'stop']) }, { from: person().id, ...(subject ? { subject } : {}), ...(r.coin(0.3) && ids().length ? { derives_from: r.pick(ids()) } : {}) });
      }
    } catch (e) { if (process.env.WORLD_DEBUG) console.error('world:', e.stack); }
  }
  return { w, r, people, agent, circle, things, promises, transfers, grants, incoming };
}
module.exports = { rng, mutate, World, makeWorld, nodes, at };
