'use strict';
// Hand-made signed stories for stage 3 (changes-1.8/03-amounts.md); the lib is stage 2's. Signed with Node's own `crypto` (Ed25519, and P-256 for passkeys) and a canonical writer of its own here,
// never the oracle's signer: a block (not a genesis) is signed over its HEADER { author, seq, prev, hash, key? } as canonical JSON (core.md, section 2; privacy.md, The public header);
// a genesis over its own bytes. A message is canonical JSON, whole (canonical.md, On the wire).
const crypto = require('crypto');
const fb0 = require('../fb.cjs');
// ENGINE=core runs the same stories on the Rust core (fb.door only; the rest stays the oracle's helpers)
const fb = process.env.ENGINE === 'core' ? Object.assign(Object.create(fb0), { door: (op, ...a) => require('../../../sdk/javascript/src/core.cjs').call(op, ...JSON.parse(JSON.stringify(a))) }) : fb0;
// RFC 8785 for the values FoodBlock allows (objects, arrays, strings, safe integers, booleans)
const cj = v => (Array.isArray(v) ? '[' + v.map(cj).join(',') + ']' : v !== null && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + cj(v[k])).join(',') + '}' : JSON.stringify(v));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const seed = name => crypto.createHash('sha256').update('stage3-scratch:' + name).digest();
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
const headerMessage = (b, signerKeyed) => ({ header: headerOf(b, b.hash), header_signature: b.signature });
module.exports = { fb, cj, sha, mkKey, signRaw, day, World, person, Signer, headerOf, message, wire, headerMessage, crypto };
// ---- stage 3 helpers: kinds, instances, deals
const A = (value, unit, of) => (of === undefined ? { value, unit } : { value, unit, of });
// a kind (a description: no owner) and an instance of it (it names its kind)
const kindOf = (s, name) => s.write('thing', { name });
const instance = (s, kind, state = {}, refs = {}) => s.write('thing', { name: 'instance', ...state }, { of: kind.hash, ...refs });
// a plain draw: a transfer to a named receiver, and her accept of it
const give = (s, what, to, amount, refs = {}, state = {}) => s.write('transfer', { ...(amount ? { amount } : {}), ...state }, { what: what.hash, to_owner: to.id, ...refs });
const accept = (s, t, state = {}, refs = {}) => s.write('transfer', { status: 'accepted', ...state }, { answers: t.hash, ...refs });
const own = (w, thing, within) => fb.door('ownership', thing, w.blocks);
const J = x => JSON.stringify(x);
const owners = r => (r.not_shown ? 'not_shown' : J(r.owners.map(o => [o.owner.slice(0, 4), o.amount ? o.amount.value + ' ' + o.amount.unit : null])));
module.exports.A = A; module.exports.kindOf = kindOf; module.exports.instance = instance; module.exports.give = give; module.exports.accept = accept; module.exports.own = own; module.exports.J = J; module.exports.owners = owners;
