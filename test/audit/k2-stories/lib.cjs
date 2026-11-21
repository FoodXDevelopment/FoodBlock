'use strict';
// The oracle builder's hand-made signed stories for stage 2, kept as audit worlds (test/audit/k2-stories.cjs asks the core every door call they make).
// Hand-made signed stories for stage 2 (changes-1.8/02-store.md). Signed with Node's own `crypto` (Ed25519, and P-256 for passkeys) and a canonical writer of its own here,
// never the oracle's signer: a block (not a genesis) is signed over its HEADER { author, seq, prev, hash, key? } as canonical JSON (core.md, section 2; privacy.md, The public header);
// a genesis over its own bytes. A message is canonical JSON, whole (canonical.md, On the wire).
const crypto = require('crypto');
const fb = require('../../../spec/oracle/fb.cjs');
// RFC 8785 for the values FoodBlock allows (objects, arrays, strings, safe integers, booleans)
const cj = v => (Array.isArray(v) ? '[' + v.map(cj).join(',') + ']' : v !== null && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + cj(v[k])).join(',') + '}' : JSON.stringify(v));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const seed = name => crypto.createHash('sha256').update('stage2-scratch:' + name).digest();
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI = '302a300506032b6570032100';
function mkKey(name) {
  const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seed(name)]), format: 'der', type: 'pkcs8' });
  const pub = SPKI + crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
  return { name, priv, pub, der: priv.export({ format: 'der', type: 'pkcs8' }).toString('hex') };
}
const signRaw = (key, bytes) => crypto.sign(null, Buffer.from(bytes, 'utf8'), key.priv).toString('hex');
const day = (d, h = 0, m = 0) => new Date(Date.UTC(2026, 10, 1 + d, h, m, 0, 0)).toISOString();
const ALL = [];
class World {
  constructor() { this.blocks = []; this.t = 0; ALL.push(this); }
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
module.exports = { ALL, fb, cj, sha, mkKey, signRaw, day, World, person, Signer, headerOf, message, wire, headerMessage, crypto };
