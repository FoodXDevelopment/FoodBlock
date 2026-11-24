'use strict';
// Seeded randomness (`rng`), a mutator of block-shaped values (`mutate`), and a small world of actors whose blocks are signed by the
// spec-only oracle, never by the Rust core (`World`).
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

const kindOf = word => require('crypto').createHash('sha256').update('kind: ' + word, 'utf8').digest('hex');
const BASE = Date.parse('2026-10-15T09:00:00.000Z');
class World {
  constructor(r) { this.r = r; this.blocks = []; this.clock = 0; }
  time() { this.clock += 1000 + this.r.int(5000); return new Date(BASE + this.clock).toISOString(); }
  seal(b, signer) {
    const body = { type: b.type, state: b.state, refs: b.refs };
    const suite = signer.suite;
    const full = { hash: fb.hashOfBlock(body, suite), ...body };
    if (suite !== 'std') full.suite = suite;
    full.signature = fb.signBlock(body, signer.private_key, suite);
    return full;
  }
  push(b) { this.blocks.push(b); return b; }
  newActor(kind = 'person', suite = 'std') {
    const kp = fb.keypair(this.r.hex(64), suite);
    const state = { kind, at: this.time(), audience: 'public', public_key_sign: kp.public_key_sign };
    if (suite !== 'std') state.suite = suite;
    const a = { suite, private_key: kp.private_key, seq: 0 };
    const g = this.push(this.seal({ type: 'actor', state, refs: {} }, a));
    a.id = g.hash; a.head = g.hash;
    return a;
  }
  // Post a block as `a`: the next place on its line.
  post(a, type, state, refs = {}) {
    const seq = a.seq + 1;
    const b = this.push(this.seal({ type, state: { at: this.time(), audience: 'public', seq, ...state }, refs: { author: a.id, prev: a.head, ...refs } }, a));
    a.head = b.hash; a.seq = seq;
    return b;
  }
}

module.exports = { rng, mutate, World, kindOf };
