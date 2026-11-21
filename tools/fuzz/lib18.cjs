'use strict';
// The block builders of the 1.8 worlds (stages 0 to 3), for the random-world tester and its fixed corpus. The same calls the stress and
// security seats used (test/audit/lib.cjs, k3-lib.cjs, and security 05's scratch lib), made deterministic: every key comes from a seed named
// by the world and a counter, and every world keeps its own clock, so a world built twice is the same bytes and a seed replays exactly.
// Blocks are written and signed by the JS SDK (the Rust core through WebAssembly); nothing here answers a question.
const crypto = require('crypto');
const sdk = require('../../sdk/javascript/src/index.cjs');
const oracle = require('../../spec/oracle/fb.cjs');
const { call } = require('../../sdk/javascript/src/core.cjs');

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const kindOf = (word) => sha('kind: ' + word);
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, '.000Z');
const sorted = (xs) => [...xs].sort();

let cur = null; // the world being built: `at()` and `fb.generateKeypair()` read its clock and its key counter
class World {
  constructor(name) {
    cur = this;
    this.name = name; this.blocks = []; this.log = []; this.people = {}; this.problems = []; this.byNote = new Map();
    this.minute = 0; this.keyN = 0;
  }
  T() { return iso(Date.UTC(2026, 10, 12) + ++this.minute * 60000); }
  keypair(suite) { const seed = sha(this.name + '#key' + ++this.keyN); return suite && suite !== 'std' ? call('keypair', seed, suite) : sdk.keypairFromSeed(seed); }
  person(label, kind = 'person', extra = {}) {
    const keys = this.keypair();
    const g = sdk.identity.genesis(keys, { kind, at: this.T(), audience: 'public', ...extra });
    this.add(g, `genesis ${label}`);
    const p = { label, keys, id: g.hash, g };
    this.people[label] = p;
    return p;
  }
  add(b, note) { this.blocks.push(b); if (note) this.byNote.set(note, b); return b; }
  find(note) { const b = this.byNote.get(note); if (!b) throw new Error('no block noted ' + note); return b; }
  // write as a person through the SDK's writer (it picks the next place on the signing key's line)
  w(p, type, state, refs = {}, note = '', opts = {}) {
    let b;
    try { b = sdk.write(type, { ...state }, { ...refs }, { author: p.id, key: p.keys, held: this.blocks, at: this.T(), audience: 'public', ...opts }); }
    catch (e) { this.log.push({ note, type, writeRefused: (e.wrong || [e.message]).join(' | ') }); return { refusedWrite: true, error: e }; }
    return this.add(b, note);
  }
  // signed by hand at the next place on the genesis key's line, without the writer's own check
  raw(p, type, state, refs, note = '') {
    const last = sdk.identity.nextLinkFor(p.id, p.keys.public_key_sign, this.blocks);
    const created = sdk.create(type, { seq: last.seq, at: this.T(), audience: 'public', ...state }, { author: p.id, prev: last.prev, ...refs });
    return this.add({ ...created, signature: handSign(created, p.keys.private_key) }, note);
  }
}
const at = () => (cur ? cur.T() : iso(Date.UTC(2026, 10, 12)));
// The SDK, with generateKeypair drawn from the world's seeds (the seats' scripts call it for cards, phones, thieves).
// A block signed by hand, as a careless or hostile device signs it: over its header, without the writer's own `read` (1.9 3a-3 makes
// `sign` refuse what its own read refuses, and these worlds sign such blocks on purpose).
const handSign = (block, key) => sdk.signMessage(sdk.header(block), key).signature;
const fb = Object.assign({}, sdk, { generateKeypair: () => (cur ? cur.keypair() : sdk.generateKeypair()), sign: (block, key, ...rest) => (rest.length || !block.refs || !block.refs.author ? sdk.sign(block, key, ...rest) : handSign(block, key)) });

// ---- k3-lib's helpers (test/audit/k3-lib.cjs), unchanged in meaning
const amt = (value, unit, of) => (of ? { value: String(value), unit, of } : { value: String(value), unit });
const sets = (refs) => Object.fromEntries(Object.entries(refs).map(([k, x]) => [k, Array.isArray(x) ? [...new Set(x)].sort() : x]));
function signed(p, keys, type, state, refs, { prev, seq, keyRef, audience = 'public', at: when }) {
  const after = keys.after && keyRef ? { after: [keys.after] } : {};
  const block = sdk.create(type, { at: when || at(), audience, seq, ...state }, sets({ author: p.id, prev, ...(keyRef ? { key: keyRef } : {}), ...after, ...refs }));
  return { ...block, signature: handSign(block, keys.private_key) };
}
// The next place on a key's line. A world marked `lenient` (the random worlds) goes on writing after its key signed a pair, where the SDK's
// own next link refuses: the place after the key's highest seq, as a careless or forking device would sign it.
function next(w, keys, p) {
  try { return sdk.identity.nextLinkFor(p.id, keys.public_key_sign, w.blocks); }
  catch (e) {
    if (!w.lenient) throw e;
    const mine = w.blocks.filter((b) => b.refs && b.refs.author === p.id && (b.refs.key || null) === (keys.grant || null) && b.state && Number.isInteger(b.state.seq));
    if (!mine.length) return { prev: keys.grant || p.id, seq: 1 };
    const top = mine.reduce((a, b) => (b.state.seq > a.state.seq ? b : a));
    return { prev: top.hash, seq: top.state.seq + 1 };
  }
}
function put(w, p, type, state, refs = {}, note = '', opts = {}) {
  refs = sets(refs);
  if (opts.key && opts.key.after) opts = { ...opts, after: [...new Set([...(opts.after || []), opts.key.after])].sort() };
  const r = w.w(p, type, state, refs, note, opts);
  if (!r || !r.refusedWrite) return r;
  const keys = opts.key || p.keys;
  try {
    const l = next(w, keys, p);
    return w.add(signed(p, keys, type, state, refs, { prev: l.prev, seq: l.seq, keyRef: keys.grant }), note + ' [hand-signed: the writer refused]');
  } catch (e) {
    w.log.push({ note, unsigned: String(e.message).split('\n')[0] });
    return { refusedWrite: true, type, state: { ...state }, refs: { ...refs }, hash: 'unwritten:' + note };
  }
}
function pairOf(w, p, keys, a, b) {
  const l = next(w, keys, p);
  const one = w.add(signed(p, keys, a[0], a[1], a[2], { prev: l.prev, seq: l.seq, keyRef: keys.grant }), a[3]);
  const two = w.add(signed(p, keys, b[0], b[1], b[2], { prev: l.prev, seq: l.seq, keyRef: keys.grant }), b[3]);
  return [one, two];
}
function secondKey(w, p, note) {
  const keys = fb.generateKeypair();
  const g = put(w, p, 'grant', { kind: 'key', public_key_sign: keys.public_key_sign }, { subject: p.id }, note);
  const again = put(w, p, 'observe', { kind: 'note' }, { confirms: [g.hash] }, note + ' (signed again)');
  keys.grant = g.hash; keys.after = again.hash;
  return keys;
}
const thing = (w, p, word, pack, note, refs = {}) => put(w, p, 'thing', { kind: word, ...(pack ? { pack } : {}) }, { of: kindOf(word), ...refs }, note);
const give = (w, p, what, to, amount, note, refs = {}, opts = {}) => put(w, p, 'transfer', amount ? { amount } : {}, { ...(what ? { what: what.hash } : {}), to_owner: to.id, ...refs }, note, opts);
const yes = (w, p, block, note, state = {}, refs = {}, opts = {}) => put(w, p, block.type, { status: 'accepted', ...state }, { answers: block.hash, ...(block.refs.for ? { for: block.refs.for } : {}), ...refs }, note, opts);
const no = (w, p, block, note) => put(w, p, 'observe', { status: 'declined' }, { answers: block.hash, ...(block.refs.for ? { for: block.refs.for } : {}) }, note);
function deal(w, from, to, what, terms, note) {
  const offer = put(w, from, 'promise', { terms }, { ...(what ? { what: what.hash || what } : {}), from: from.id, to: to.id }, note + ': the offer');
  const accept = put(w, to, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash }, note + ': the accept');
  return { offer, accept };
}
const labels = (w) => Object.fromEntries(Object.values(w.people).map((p) => [p.id, p.label]));
const v = (a) => (a && typeof a === 'object' && 'value' in a ? a.value : a);

// ---- security 05's helpers: a block signed at an exact place (any prev, any seq)
function hand(w, p, type, state, refs, place, note, keys = p.keys) {
  const block = sdk.create(type, { at: place.at || at(), audience: 'public', seq: place.seq, ...state }, sets({ author: p.id, prev: place.prev, ...(place.key ? { key: place.key } : {}), ...(place.after ? { after: place.after } : {}), ...refs }));
  return w.add({ ...block, signature: handSign(block, keys.private_key) }, note);
}
const sackOf = (w, harry, place, note = 'harry\'s sack') => hand(w, harry, 'thing', { kind: 'maize', pack: amt('1', 'kg') }, { of: kindOf('maize') }, place, note);
const stoneOf = (w, harry, place, note = 'harry\'s millstone (one whole)') => hand(w, harry, 'thing', { kind: 'millstone' }, { of: kindOf('millstone') }, place, note);
const draw = (w, harry, what, to, amount, place, note) => hand(w, harry, 'transfer', amount ? { amount } : {}, { what: what.hash, to_owner: to.id }, place, note);

// ---- stage 1's key helpers (test/audit/k1-keys.cjs)
const plus = (when, d) => call('add_duration', when, d, null);
const keyHash = (k) => sdk.identity.keyHash(k.public_key_sign, k.suite || null);
const by = (w, p, key, type, state, refs, note, after = []) => w.w(p, type, state, refs, note, { key, after: sorted(after.map((b) => b.hash)) });
const confirm = (w, p, key, word, note, after = []) => by(w, p, key, 'observe', { kind: 'note' }, { confirms: [word.hash] }, note, after);
const receipt = (w, keeper, block, note) => w.w(keeper, 'observe', { kind: 'receipt' }, { derives_from: [block.hash] }, note);
// 1.9 3d-4: a span cutoff states the span itself as its `when` and runs from the receipt (or earlier cutoff) it names in `refs.derives_from`
const cutoff = (w, keeper, word, from, wait, note) => w.w(keeper, 'observe', { kind: 'cutoff', when: wait }, { subject: word.hash, derives_from: [from.hash] }, note);
const keyGrant = (w, p, key, id, state, refs, note, after = []) => by(w, p, key, 'grant', { kind: 'key', ...state }, { subject: id, ...refs }, note, after);
// a block held by its header alone (privacy.md, The public header)
const header = (b) => ({ header: sdk.header(b), header_signature: b.signature });

// ---- the questions a fixed world asks: collected, then answered by both engines in tools/fuzz/corpus.cjs
let asked = null;
const collect = (list) => { asked = list; };
// ask(w, label, op, args): an argument 'held' is the world's blocks as they are now
function ask(w, label, op, args, opts = {}) {
  const held = (w.blocks || w).slice();
  const real = args.map((a) => (a === 'held' ? held : a));
  if (asked) asked.push({ world: w.name || '', label, op, args: JSON.parse(JSON.stringify(real)), ...opts });
}

module.exports = {
  World, fb, sdk, oracle, call, kindOf, sha, at, amt, sets, signed, next, put, pairOf, secondKey, thing, give, yes, no, deal, labels, v,
  hand, sackOf, stoneOf, draw, plus, keyHash, by, confirm, receipt, cutoff, keyGrant, header, sorted, ask, collect,
};
