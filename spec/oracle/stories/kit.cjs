'use strict';
// The one kit every story is written with: hand-made signed worlds, the names and printers, the deal builders, and the check that prints, per question, the oracle's answer and the answer the text gives
// (OK or DIFF). Signed with Node's own `crypto` (Ed25519, and P-256 for passkeys) and a canonical writer of its own here, never the oracle's signer: a block (not a genesis) is signed over its HEADER
// { author, seq, prev, hash, key? } as canonical JSON (core.md, section 2; privacy.md, The public header); a genesis over its own bytes. A message is canonical JSON, whole (canonical.md, On the wire).
const crypto = require('crypto');
const fb0 = require('../fb.cjs');
// ENGINE=core runs the same stories on the Rust core (fb.door only; the rest stays the oracle's helpers)
const fb = process.env.ENGINE === 'core' ? Object.assign(Object.create(fb0), { door: (op, ...a) => require('../../../sdk/javascript/src/core.cjs').call(op, ...JSON.parse(JSON.stringify(a))) }) : fb0;
// RFC 8785 for the values FoodBlock allows (objects, arrays, strings, safe integers, booleans)
const cj = v => (Array.isArray(v) ? '[' + v.map(cj).join(',') + ']' : v !== null && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + cj(v[k])).join(',') + '}' : JSON.stringify(v));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const seed = name => crypto.createHash('sha256').update('stories:' + name).digest();
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI = '302a300506032b6570032100';
function mkKey(name) {
  const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seed(name)]), format: 'der', type: 'pkcs8' });
  const pub = SPKI + crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
  return { name, priv, pub };
}
const signRaw = (key, bytes) => crypto.sign(null, Buffer.from(bytes, 'utf8'), key.priv).toString('hex');
const day = (d, h = 0, m = 0) => new Date(Date.UTC(2026, 10, 1 + d, h, m, 0, 0)).toISOString();
class World {
  constructor() { this.blocks = []; this.t = 0; }
  add(b) { this.blocks.push(b); return b; }
  idx(b) { return this.blocks.indexOf(b); }
}
const headerOf = (block, hash) => { const h = { author: block.refs.author, seq: block.state.seq, prev: block.refs.prev, hash }; if (block.refs.key !== undefined) h.key = block.refs.key; if (block.state.skip === true) h.skip = true; if (block.state.withheld === true) h.withheld = true; return h; };
// a person: a genesis signed by its own key over its own bytes (it has no header)
function person(world, name, extra = {}) {
  const key = mkKey(name);
  const block = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', public_key_sign: key.pub, ...extra }, refs: {} };
  const hash = sha(cj(block));
  world.add({ hash, ...block, signature: signRaw(key, cj(block)) });
  return new Signer(world, hash, key, undefined, hash);
}
// a signer: one key of one identity; `kg` the refs.key it names (none for the genesis key); keeps its line (head, seq)
class Signer {
  constructor(world, id, key, kg, head) { Object.assign(this, { world, id, key, kg, head, seq: 0 }); }
  asKey(key, kg, prev) { return new Signer(this.world, this.id, key, kg, prev || kg); }
  // o: { at, seq (override), prev (override), key (override: false leaves refs.key out), keep: true leaves the block out of the world }
  make(type, state, refs = {}, o = {}) {
    const st = { at: o.at || day(this.world.t++), audience: 'public', seq: o.seq !== undefined ? o.seq : this.seq + 1, ...state };
    const rf = { author: this.id, prev: o.prev || this.head, ...refs };
    if (this.kg !== undefined && o.key !== false && !('key' in rf)) rf.key = this.kg;
    for (const k of Object.keys(rf)) if (Array.isArray(rf[k])) rf[k] = [...new Set(rf[k])].sort();
    const block = { type, state: st, refs: rf };
    const hash = sha(cj(block));
    const signature = signRaw(this.key, cj(headerOf(block, hash)));
    return { hash, ...block, signature };
  }
  write(type, state, refs = {}, o = {}) {
    const b = this.make(type, state, refs, o);
    if (!o.keep) this.world.add(b);
    this.head = b.hash; this.seq = b.state.seq;
    return b;
  }
}
const message = b => ({ block: { type: b.type, state: b.state, refs: b.refs }, signature: b.signature });
const wire = m => cj(m);

// ---- kinds, instances, deals
const A = (value, unit, of) => (of === undefined ? { value, unit } : { value, unit, of });
// a kind (a description: no owner) and an instance of it (it names its kind)
const kindOf = (s, name) => s.write('thing', { name });
const instance = (s, kind, state = {}, refs = {}) => s.write('thing', { name: 'instance', ...state }, { of: kind.hash, ...refs });
// a plain draw: a transfer to a named receiver, and her accept of it
const give = (s, what, to, amount, refs = {}, state = {}) => s.write('transfer', { ...(amount ? { amount } : {}), ...state }, { what: what.hash, to_owner: to.id, ...refs });
const accept = (s, t, state = {}, refs = {}) => s.write('transfer', { status: 'accepted', ...state }, { answers: t.hash, ...refs });
const J = x => JSON.stringify(x);
const owners = r => (r.not_shown ? 'not_shown' : J(r.owners.map(o => [o.owner.slice(0, 4), o.amount ? o.amount.value + ' ' + o.amount.unit : null])));

// ---- shared story helpers: names, a printer, and the deal builders
const NAME = new Map();
const P = (w, n) => { const p = person(w, n); NAME.set(p.id, n); return p; };
const nm = h => (h === null || h === undefined ? null : NAME.get(h) || (typeof h === 'string' ? h.slice(0, 6) : h));
const am = a => (a ? a.value + ' ' + a.unit + (a.of ? '/' + a.of.slice(0, 4) : '') : null);
const TAG = new Map(); // block hash -> label, for readable draws
const T = (b, label) => { TAG.set(b.hash, label); return b; };
const tg = h => TAG.get(h) || h.slice(0, 6);
const show = r => r === null ? 'null' : r.not_shown ? 'not_shown ' + J(r.lacks.map(x => (typeof x === 'string' ? tg(x) : x))) : J({ kind: r.kind && r.kind.unit, stated: r.stated && r.stated.value, owners: r.owners.map(o => [nm(o.owner), o.amount && o.amount.value]), owner: nm(r.owner), held: r.held && r.held.value, ended: r.ended && r.ended.value, let_go: r.let_go && r.let_go.value, draws: r.draws.map(d => [tg(d.block), nm(d.by), nm(d.to), d.amount && d.amount.value, d.takes, d.why, d.state]), waiting: r.waiting.map(x => [tg(x.block), x.on]) });
const draws = r => (r.not_shown ? 'not_shown' : r.draws.map(d => tg(d.block) + (d.takes ? ' takes ' + (d.state || '') : ' ' + (d.why || 'waiting'))).join('; '));
const own = (w, thing) => fb.door('ownership', thing, w.blocks);
const Q = (story, q, a) => console.log(`${story} | ${q} => ${a}`);
// a deal's lines (promises.md, A deal is its lines): one line `id` for each thing, at the quantity and price given (the price and quantity on
// the first; `lines` given whole are kept)
const linesFor = (what, terms, id = 'goods') => {
  const { quantity, price, lines, ...rest } = terms || {};
  if (lines) return { lines, ...rest };
  const things = what === undefined || what === null ? [] : what.map ? what : [what];
  const line = (x, i) => ({ id: things.length > 1 ? id + (i + 1) : id, ...(x ? { what: x.hash } : {}), ...(i === 0 && quantity !== undefined ? { quantity } : {}), ...(i === 0 && price !== undefined ? { price } : {}) });
  return { lines: (things.length ? things : [null]).map(line), ...rest };
};
const offer = (s, from, to, what, terms, state = {}, refs = {}) => s.write('promise', { terms: linesFor(what, terms), ...state }, { from: from.id, to: to.id, ...refs });
// an accept; `quantity` in its state.terms chooses for the offer's one line 'goods'
const accepts = (s, o, state = {}, refs = {}) => {
  const st = { ...state };
  if (st.terms && st.terms.quantity !== undefined) st.terms = { lines: [{ id: (o.state.terms.lines && o.state.terms.lines[0] && o.state.terms.lines[0].id) || 'goods', quantity: st.terms.quantity }] };
  return s.write('promise', { status: 'accepted', ...st }, { answers: o.hash, for: o.hash, ...refs });
};

// ---- the check: each question prints the oracle's answer and the answer the text gives, and OK or DIFF
let bad = 0, n = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// check(entry, question, oracle's answer, the answer the text gives)
function check(entry, q, got, want) {
  n++; const ok = same(got, want); if (!ok) bad++;
  console.log(`${entry} | ${q}\n    oracle: ${JSON.stringify(got)}\n    text:   ${JSON.stringify(want)}   ${ok ? 'OK' : 'DIFF'}`);
}
const done = () => { console.log(`-- ${n} questions, ${bad} differ`); process.exitCode = bad ? 1 : 0; };
const codes = l => l.map(x => x.code);
// the answer of ownership as a short, readable value
const ownersOf = r => (r === null ? null : r.not_shown ? { not_shown: true, lacks: r.lacks.map(x => (typeof x === 'string' ? tg(x) : x)) } : { owners: r.owners.map(o => [nm(o.owner), o.amount && o.amount.value]).sort((a, b) => (a[0] < b[0] ? -1 : 1)) });
const drawsOf = r => (r && !r.not_shown ? r.draws.map(d => [tg(d.block), d.takes, d.why, d.state]) : null);
// a deal in the shape the stories use: the seller's offer of the thing, the buyer's accept; a draw `for` it with her yes in its past
// an offer that names an instance holds it, so the stories' sales are the buyer's ORDER (which the text's worlds say: "Amara orders L7"), accepted by the seller; the order holds nothing
const deal = (seller, thing, buyer, qty) => { const o = offer(buyer, seller, buyer, thing, { quantity: qty, price: { value: '1', unit: 'GBP' } }); const a = accepts(seller, o); return { o, a }; };
const sell = (seller, thing, buyer, d, amount, o = {}, extra = {}) => seller.write('transfer', { ...(amount ? { amount } : {}), ...extra }, { what: thing.hash, to_owner: buyer.id, ...(d ? { for: d.o.hash, after: d.a.hash } : {}) }, o);

module.exports = {
  fb, cj, sha, mkKey, signRaw, day, World, person, Signer, headerOf, message, wire, crypto,
  A, kindOf, instance, give, accept, own, J, owners,
  NAME, TAG, P, nm, am, T, tg, show, draws, Q, offer, accepts, linesFor,
  check, done, codes, ownersOf, drawsOf, same, deal, sell,
};
