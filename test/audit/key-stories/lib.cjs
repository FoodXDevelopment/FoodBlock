'use strict';
// Hand-made signed stories for keys. Blocks are signed (canonical.md) over their own bytes.
const crypto = require('crypto');
const fb = require('../../../spec/oracle/fb.cjs');
const seed = name => crypto.createHash('sha256').update('key-stories:' + name).digest('hex');
const day = (d, h = 0, m = 0) => new Date(Date.UTC(2026, 10, 1 + d, h, m, 0, 0)).toISOString();

const ALL = [];
class World {
  constructor() { this.blocks = []; this.t = 0; ALL.push(this); }
  add(b) { this.blocks.push(b); return b; }
  find(h) { return this.blocks.find(b => b.hash === h); }
}
// a key: made from a seed, with its public key and the suite
function mkKey(name, suite = 'std') { const kp = fb.keypair(seed(name), suite); return { name, suite, pub: kp.public_key_sign, priv: kp.private_key }; }
// a person (a genesis signed by its first key); `extra` is more genesis state (reach, keepers)
function person(world, name, extra = {}, suite = 'std') {
  const key = mkKey(name, suite);
  const block = { type: 'actor', state: { kind: 'person', at: day(-1), audience: 'public', public_key_sign: key.pub, ...(suite !== 'std' ? { suite } : {}), ...extra }, refs: {} };
  const hash = fb.hashOfBlock(block, suite);
  const signature = fb.signBlock(block, key.priv, suite);
  world.add({ hash, ...block, signature });
  return new Signer(world, hash, key, null, hash);
}
// a signer: one key of one identity; keeps its chain (head, seq); `kg` is the refs.key it names (null for the genesis key)
class Signer {
  constructor(world, id, key, kg, head) { this.world = world; this.id = id; this.key = key; this.kg = kg; this.head = head; this.seq = 0; this.fresh = true; }
  // a new key of the same identity, brought in by `kgHash` (its first block names that block as its prev)
  asKey(key, kgHash, prev, refsKey) { const s = new Signer(this.world, this.id, key, refsKey === undefined ? kgHash : refsKey, prev || kgHash); return s; }
  write(type, state, refs = {}, o = {}) {
    const st = { at: o.at || day(this.world.t++), audience: 'public', seq: this.seq + 1, ...state };
    const rf = { author: this.id, prev: this.head, ...refs };
    if (o.see) rf.after = [...new Set([...(rf.after || []), ...[].concat(o.see).map(b => b.hash || b)])].sort(); // the heads it has seen (refs.after)
    if (this.kg && !('key' in rf)) rf.key = this.kg;
    if (o.noKey) delete rf.key;
    for (const k of Object.keys(rf)) if (Array.isArray(rf[k])) rf[k] = [...new Set(rf[k])].sort(); // a set is written sorted (canonical.md)
    const block = { type, state: st, refs: rf };
    const hash = fb.hashOfBlock(block, this.key.suite);
    const signature = fb.signBlock(block, this.key.priv, this.key.suite);
    const full = { hash, ...block, signature, ...(this.key.suite !== 'std' ? { suite: this.key.suite } : {}) };
    this.world.add(full);
    this.head = hash; this.seq = st.seq;
    return full;
  }
}
// small helpers for the clock: a keeper's receipt of blocks, and her cutoff
const receipt = (keeper, blocks, at) => keeper.write('observe', { kind: 'receipt', at }, { derives_from: [].concat(blocks).map(b => b.hash).sort() });
const cutoff = (keeper, word, when, at, named = []) => keeper.write('observe', { kind: 'cutoff', when, at: at || when }, { subject: word.hash, ...(named.length ? { derives_from: named.map(b => b.hash).sort() } : {}) });
const full = b => b;
const stands = (b, w) => fb.door('stands', b, w.blocks);
const asked = (w, b) => { const r = stands(b, w); return r.stands + (r.waiting.length ? ' ' + JSON.stringify(r.waiting.map(x => ({ on: x.on, block: (w.blocks.findIndex(y => y.hash === x.block)) })).sort((p, q) => p.block - q.block)) : ''); };
// every block of a world against the world: the codes valid gives for any that is refused
const audit = w => w.blocks.map((b, i) => [i, fb.door('valid', b, w.blocks).map(r => r.code)]).filter(x => x[1].length);
module.exports = { ALL, audit, fb, World, mkKey, person, Signer, receipt, cutoff, day, stands, asked };
